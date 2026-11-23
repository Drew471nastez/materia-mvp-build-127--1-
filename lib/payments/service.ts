import "server-only"

/**
 * ===========================================================================
 *  STORELIB PAYMENTS SERVICE
 * ===========================================================================
 * What the payments hub, checkout and the webhook ask, answered from the
 * creator's Stripe Connect account (./stripe and the creators row):
 *
 *   overview(creator)                everything the hub draws
 *   checkoutReadyForCreator(id)      what checkout's gate reads
 *
 * and the steps of setting up: the account, the embedded components' one
 * time sessions, verification, disconnecting.
 *
 * Stripe is the only provider. Airwallex was removed; its old orders are read
 * only (./past-provider), and a creator who had an Airwallex account is told
 * once to connect Stripe (airwallexBefore on the overview).
 *
 * Every function takes the creator the CALLER already authenticated. None
 * of them reads a creator id from a request body.
 */

import { createAdminClient } from "@/lib/supabase/admin"

export type { CreatorRef, HubOverview } from "./hub-types"
import type { CreatorRef, HubOverview } from "./hub-types"
import { PaymentsProblem } from "./errors"
import { stripeAccountSession, stripeOverview, stripeStartOnboarding } from "./stripe/overview"
import { prepareStorelibAccount } from "./stripe/verification"
import { beginStripeOnboarding, disconnectStripeAccount, readCreatorStripe, syncStripeAccount } from "./stripe/connect"
import { stripeRowReady } from "./stripe/facts"
import { creatorIsBanned } from "@/lib/seo/bans"

/* ── Facts ────────────────────────────────────────────────────────────── */

/** Asks Stripe for the account and writes down what it said. */
export async function refreshProviderAccount(creatorId: string, actor: "webhook" | "creator" | "system" = "creator") {
  await syncStripeAccount(creatorId, actor)
}

/**
 * Whether checkout may charge for this creator (server gate). Never calls Stripe live on checkout.
 *
 * A BANNED STORE TAKES NO NEW PAYMENTS (round AW). A ban unpublishes the
 * store's products and takes its pages down, but a product is republished
 * with one write, and a direct checkout link never looked at the ban: a
 * banned seller kept selling while every page of theirs answered not found.
 * Every paid checkout (products, baskets, websites, memberships, tips,
 * community programs, events and library items) asks this gate, so it is
 * the one place a ban stops new charges. Orders already paid are fulfilled
 * as before: nothing that completes a payment asks this. The ban read is
 * held for a minute and expired by the ban itself (lib/seo/bans.ts); a read
 * that fails is "not banned", so a database blip never closes a store.
 */
export async function checkoutReadyForCreator(creatorId: string): Promise<boolean> {
  const [banned, row] = await Promise.all([creatorIsBanned(creatorId).catch(() => false), readCreatorStripe(creatorId)])
  if (banned) return false
  return stripeRowReady(row)
}

/**
 * Whether this creator had a Storelib Payments account on Airwallex (run-now
 * part 76's payment_accounts). Read only, and only to tell them once to
 * connect Stripe. A database without the table answers no.
 */
export async function hadAirwallexAccount(creatorId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from("payment_accounts")
      .select("provider_account_id")
      .eq("provider", "airwallex")
      .eq("creator_id", creatorId)
      .not("provider_account_id", "is", null)
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

/* ── The hub ──────────────────────────────────────────────────────────── */

export { payoutStatusOf, type PayoutStatus } from "./model"

/** `sync: "stale"` (opening Payouts) asks Stripe only when the cached state is old; writes always read it fresh. */
export async function overview(creator: CreatorRef, options?: { sync?: boolean | "stale" }): Promise<HubOverview> {
  /* Asked beside the overview, not after it: one round less on every open. */
  const [view, airwallex] = await Promise.all([stripeOverview(creator, options), hadAirwallexAccount(creator.id)])
  /* Only while Stripe cannot take money yet: once it can, the note has done its job. */
  if (!view.checkoutOpen && airwallex) return { ...view, airwallexBefore: true }
  return view
}

/* ── Starting ─────────────────────────────────────────────────────────── */

export { PaymentsProblem } from "./errors"

export interface StartInput {
  kind: "individual" | "business"
  country: string
}

/** The Account step: creates or reuses their Stripe account. */
export async function beginOnboarding(
  creator: CreatorRef,
  input: { kind: string; country: string; firstName: string; lastName: string; businessName?: string },
) {
  await beginStripeOnboarding(creator, input)
  return overview(creator)
}

/** Swaps an untouched Stripe-hosted account for one Storelib runs, before the Verify step draws. */
export async function prepareVerification(creator: CreatorRef) {
  await prepareStorelibAccount(creator)
  return stripeOverview(creator, { sync: false })
}

/** Disconnect / start over. `confirmed` is the creator's explicit yes, required for an account that was ever started. */
export async function disconnectPayoutAccount(creator: CreatorRef, options: { confirmed?: boolean } = {}) {
  await disconnectStripeAccount(creator.id, { confirmed: options.confirmed === true })
  return overview(creator)
}

export async function startOnboarding(creator: CreatorRef, input: StartInput) {
  if (!creator.email) throw new PaymentsProblem("Add an email address to your account first.")
  return stripeStartOnboarding(creator, { kind: input.kind, country: input.country })
}

/** A fresh, single use session for one of Stripe's embedded components, for THIS creator's account only. */
export async function componentAuth(
  creator: CreatorRef,
  purpose: "stripe_onboarding" | "stripe_management" | "stripe_payouts",
): Promise<{ clientSecret: string; publishableKey: string; stripeSignIn: boolean }> {
  const stripePurpose = purpose === "stripe_onboarding" ? "onboarding" : purpose === "stripe_management" ? "management" : "payouts"
  const session = await stripeAccountSession(creator, stripePurpose)
  return { clientSecret: session.clientSecret, publishableKey: session.publishableKey, stripeSignIn: session.stripeSignIn }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** A thrown value, for a log line: never a body. */
export function describe(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 200) : "error"
}
