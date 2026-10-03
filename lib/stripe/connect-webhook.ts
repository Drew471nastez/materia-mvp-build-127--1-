import "server-only"

import { after } from "next/server"
import type Stripe from "stripe"
import { syncStripeAccount } from "@/lib/payments/stripe/connect"
import { stripe } from "@/lib/stripe"
import { createClient } from "@supabase/supabase-js"
import { emit } from "@/lib/notify/outbox"
import { readableRequirements } from "@/lib/notify/conditions"
import { createHash } from "node:crypto"

const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function connectedAccountId(event: Stripe.Event): string | null {
  if (typeof event.account === "string" && event.account.startsWith("acct_")) return event.account
  const obj = event.data.object as { id?: string }
  if (typeof obj?.id === "string" && obj.id.startsWith("acct_")) return obj.id
  return null
}

function payoutMethodFacts(ext: Stripe.ExternalAccount): Record<string, unknown> {
  return {
    externalAccountId: ext.id,
    kind: ext.object === "card" ? "card" : "bank_account",
    bankName: (ext as Stripe.BankAccount).bank_name || (ext as Stripe.Card).brand || null,
    last4: (ext as Stripe.BankAccount).last4 || (ext as Stripe.Card).last4 || null,
    currency: ext.currency || null,
    country: (ext as Stripe.BankAccount).country || null,
  }
}

/**
 * A connected account's own events, from either webhook endpoint
 * (app/api/stripe/webhook and app/api/stripe/webhook/connect).
 *
 * account.updated: the creator row is re-read from Stripe (the flags,
 * what Stripe is asking for and by when), and the creator is told once per
 * change: payouts paused is one transition (keyed by this event), and
 * requirements are keyed by the account, what is asked and by when, so the
 * same list is told once and two creators asked for the same thing are each
 * told. The payload is what the PAYOUT_ACTION_REQUIRED email and the
 * verification reminders read (lib/notify).
 *
 * account.external_account.*: a bank added, or made the default, is
 * payout_method.added or .changed, keyed by the bank account. Any other
 * bank change (removed, or Stripe marking it errored) only re-reads the
 * account, so the payments status follows.
 */
export async function handleConnectAccountEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "account.external_account.deleted") {
    const acctId = connectedAccountId(event)
    if (acctId) await resyncConnectedAccount(acctId)
    return
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account
    const { data: creator } = await supabaseAdmin.from("creators").select("id, user_id, payouts_enabled").eq("stripe_account_id", account.id).maybeSingle()
    if (!creator) return

    const previousPayoutsEnabled = (creator as { payouts_enabled?: boolean }).payouts_enabled ?? false
    /* Also writes the requirements the reminders read, and keeps payouts manual. */
    await syncStripeAccount(creator.id as string, "webhook")

    /* Payouts or card payments off, or Stripe asking by a deadline: the creator's notices, after the answer. */
    const accountCreatorId = creator.id as string
    after(async () => (await import("@/lib/notifications/events")).noteStripeAccount(accountCreatorId, account as any))

    const userId = (creator as { user_id?: string }).user_id ?? null
    const requirements = account.requirements
    const pastDue = requirements?.past_due ?? []
    const currentlyDue = requirements?.currently_due ?? []
    const due = [...new Set([...pastDue, ...currentlyDue])].sort()
    const payoutsEnabled = !!account.payouts_enabled
    const chargesEnabled = !!account.charges_enabled
    const paused = previousPayoutsEnabled && !payoutsEnabled
    const deadline = typeof requirements?.current_deadline === "number" ? requirements.current_deadline : null

    if (paused || (due.length > 0 && account.details_submitted)) {
      const asked = createHash("sha256").update(`${due.join(",")}|${deadline ?? ""}`).digest("hex").slice(0, 16)
      await emit({
        name: "payout.action_required",
        key: paused ? `stripe:${event.id}` : `stripe_requirements:${account.id}:${asked}`,
        userId,
        creatorId: accountCreatorId,
        entityType: "payment_setup",
        entityId: accountCreatorId,
        correlationId: event.id,
        payload: {
          reason: paused ? "payouts_paused" : "requirements_due",
          payoutsEnabled,
          chargesEnabled,
          pastDue: pastDue.length > 0,
          requirementCount: due.length,
          requirements: due.slice(0, 10),
          /* The same words the verification reminders use, so the email names what Stripe wants rather than "requirements_due". */
          needsWords: readableRequirements(due),
          deadline: deadline ? new Date(deadline * 1000).toISOString() : null,
          disabledReason: requirements?.disabled_reason || null,
        },
      })
    }
    return
  }

  if (event.type === "account.external_account.created" || event.type === "account.external_account.updated") {
    const ext = event.data.object as Stripe.ExternalAccount
    const acctId = (typeof event.account === "string" ? event.account : null) ?? connectedAccountId(event)
    if (!acctId || !ext?.id) return

    const previous = (event.data as { previous_attributes?: Record<string, unknown> }).previous_attributes || {}
    const becameDefault =
      event.type === "account.external_account.updated" && previous.default_for_currency === false && (ext as Stripe.BankAccount).default_for_currency === true
    const { data: creator } = await supabaseAdmin.from("creators").select("id, user_id").eq("stripe_account_id", acctId).maybeSingle()
    if (!creator) return
    if (event.type === "account.external_account.updated" && !becameDefault) {
      await syncStripeAccount(creator.id as string, "webhook")
      return
    }

    await syncStripeAccount(creator.id as string, "webhook")

    /* A second bank on the account is a change, not a first payout method. */
    let others = 0
    if (event.type === "account.external_account.created") {
      try {
        const list = await stripe.accounts.listExternalAccounts(acctId, { limit: 3 })
        others = list.data.filter((a) => a.id !== ext.id).length
      } catch {
        /* Unknown: told as added. */
      }
    }

    await emit({
      name: becameDefault || others > 0 ? "payout_method.changed" : "payout_method.added",
      key: becameDefault ? `payout_method:${ext.id}:default` : `payout_method:${ext.id}`,
      userId: (creator as { user_id?: string }).user_id ?? null,
      creatorId: creator.id as string,
      entityType: "payment_setup",
      entityId: creator.id as string,
      correlationId: event.id,
      payload: payoutMethodFacts(ext),
    })
  }
}

/**
 * Re-reads one connected account from Stripe and caches its flags and
 * Storelib status. For events that change the status but tell the creator
 * nothing themselves: capability.updated, a payout paid or failed.
 */
export async function resyncConnectedAccount(accountId: string): Promise<void> {
  const { data: creator } = await supabaseAdmin.from("creators").select("id").eq("stripe_account_id", accountId).maybeSingle()
  if (!creator) return
  await syncStripeAccount(creator.id as string, "webhook")
}

/** Events that only move the cached status. */
export function isConnectStatusEvent(type: string): boolean {
  return type === "capability.updated" || type === "payout.failed" || type === "payout.paid"
}
