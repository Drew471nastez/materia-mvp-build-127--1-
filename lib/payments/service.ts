import "server-only"

/**
 * ===========================================================================
 *  STORELIB PAYMENTS SERVICE
 * ===========================================================================
 * What the payments hub, checkout and the webhook ask, answered the same way
 * whichever provider a creator is on:
 *
 *   providerFor(creator)   stripe or airwallex
 *   overview(creator)      everything the hub draws, from the provider
 *   paymentFacts(creator)  what checkout's gate reads (./model checkoutOpen)
 *
 * and, for a creator on Airwallex, the steps of setting up and being paid:
 * starting onboarding, the hosted flow, the embedded components' one-time
 * authorisation, the payout account, balances and payouts.
 *
 * Stripe creators use ./stripe (Connect embedded + creators row). Airwallex
 * creators use ./airwallex and payment_accounts (part 76).
 *
 * Every function takes the creator the CALLER already authenticated. None
 * of them reads a creator id from a request body.
 */

import { createHash, randomBytes } from "node:crypto"
import { airwallex, AirwallexError, type AirwallexClient } from "./airwallex/client"
import { airwallexRollout, readAirwallexConfig } from "./airwallex/config"
import {
  authorizeComponent,
  authorizeHostedFlow,
  createAccount,
  createBeneficiary,
  createHostedFlow,
  createPayout,
  currentBalances,
  listBeneficiaries,
  listPayouts,
  retrieveAccount,
  type AwxTransfer,
  type ComponentScope,
} from "./airwallex/resources"
import {
  audit,
  cachedBalances,
  claimAccountRow,
  maskBeneficiary,
  readAccount,
  releaseClaim,
  saveBalances,
  setFormStatus,
  setHostedFlow,
  setPayoutDestination,
  setProviderAccountId,
  writeAccountState,
  type AccountRow,
  type BalanceRow,
  type PayoutDestination,
} from "./store"
import {
  checkoutOpen,
  payoutStatusOf,
  type PayoutStatus,
  readFormStatus,
  readLifecycle,
  requirementNotes,
  STAGE_COPY,
  stageOf,
  type PaymentProviderId,
  type PaymentsStage,
  type ProviderAccountFacts,
  type RequirementNote,
  type StageCopy,
} from "./model"
import { toMinor } from "./money"
import { createAdminClient } from "@/lib/supabase/admin"
import { activePaymentProvider } from "./active-provider"

export type { CreatorRef, HubOverview } from "./hub-types"
import type { CreatorRef, HubOverview } from "./hub-types"
import { PaymentsProblem } from "./errors"
import { stripeAccountSession, stripeOverview, stripeStartOnboarding } from "./stripe/overview"
import { prepareStorelibAccount } from "./stripe/verification"
import { beginStripeOnboarding, disconnectStripeAccount, readCreatorStripe, syncStripeAccount } from "./stripe/connect"
import { snapshotFromCreatorRow, stripeRowReady } from "./stripe/facts"

/* ── Which provider ───────────────────────────────────────────────────── */

/**
 * Stripe, for every creator (./active-provider.ts). The Airwallex adapter
 * stays in the code, reached by nothing live, until it is switched on again
 * on purpose.
 */
export async function providerFor(_creatorId: string): Promise<PaymentProviderId> {
  return activePaymentProvider()
}

/* ── Facts, from the provider ─────────────────────────────────────────── */

/** How long an account's status read from Airwallex is trusted before the hub asks again. Webhooks update it sooner. */
const FRESH_MS = 60_000

export function factsOf(row: AccountRow | null): ProviderAccountFacts {
  return {
    hasAccount: !!row?.provider_account_id,
    lifecycle: readLifecycle(row?.lifecycle_status),
    formStatus: readFormStatus(row?.form_status),
    hasPayoutDestination: !!row?.payout_beneficiary_id,
  }
}

/**
 * Asks Airwallex for the account and writes down what it said. Answers the
 * row as it is now. Used by the webhook (always) and the hub (when stale).
 */
export async function refreshProviderAccount(creatorId: string, actor: "webhook" | "creator" | "system" = "creator") {
  const provider = await providerFor(creatorId)
  if (provider === "stripe") {
    await syncStripeAccount(creatorId, actor)
    return
  }
  await syncAccount(creatorId, actor)
}

export async function syncAccount(creatorId: string, actor: "webhook" | "creator" | "system", c: AirwallexClient = airwallex()): Promise<AccountRow | null> {
  const { row } = await readAccount(creatorId)
  if (!row?.provider_account_id) return row
  const account = await retrieveAccount(c, row.provider_account_id)
  const lifecycle = typeof account.status === "string" ? account.status : null
  const { before } = await writeAccountState(creatorId, {
    lifecycle,
    nextActionType: account.next_action?.type ?? null,
    requirements: account.requirements ?? null,
  })
  if (before !== lifecycle) await audit({ creatorId, kind: "account.status", from: before, to: lifecycle, ref: row.provider_account_id, actor })
  return (await readAccount(creatorId)).row
}

/** The facts checkout's gate reads. Never calls the provider live on checkout. */
export async function paymentFactsFor(creatorId: string): Promise<ProviderAccountFacts> {
  const provider = await providerFor(creatorId)
  if (provider === "stripe") {
    const row = await readCreatorStripe(creatorId)
    const snap = snapshotFromCreatorRow(row ?? {})
    const lifecycle =
      stripeRowReady(row)
        ? "ACTIVE"
        : snap.detailsSubmitted
          ? "SUBMITTED"
          : snap.accountId
            ? "CREATED"
            : "unknown"
    return {
      hasAccount: !!snap.accountId,
      lifecycle,
      formStatus: null,
      hasPayoutDestination: snap.hasExternalAccount || snap.payoutsEnabled,
    }
  }
  try {
    return factsOf((await readAccount(creatorId)).row)
  } catch {
    return factsOf(null)
  }
}

/** Whether checkout may charge for this creator (server gate). */
export async function checkoutReadyForCreator(creatorId: string): Promise<boolean> {
  const provider = await providerFor(creatorId)
  if (provider === "stripe") {
    const row = await readCreatorStripe(creatorId)
    return stripeRowReady(row)
  }
  return checkoutOpen(await paymentFactsFor(creatorId))
}

/* ── The hub ──────────────────────────────────────────────────────────── */

export { payoutStatusOf, type PayoutStatus } from "./model"

/** `sync: "stale"` (opening Payouts) asks Stripe only when the cached state is old; writes always read it fresh. */
export async function overview(creator: CreatorRef, options?: { sync?: boolean | "stale" }): Promise<HubOverview> {
  const provider = await providerFor(creator.id)
  if (provider === "stripe") return stripeOverview(creator, options)
  return airwallexOverview(creator)
}

async function airwallexOverview(creator: CreatorRef): Promise<HubOverview> {
  const cfg = readAirwallexConfig()
  const configured = cfg.ok
  let { row, missing } = await readAccount(creator.id)

  if (configured && row?.provider_account_id) {
    const stale = !row.status_synced_at || Date.now() - Date.parse(row.status_synced_at) > FRESH_MS
    if (stale) {
      try {
        row = await syncAccount(creator.id, "system")
      } catch (e) {
        console.error("[payments] account sync failed", describe(e))
      }
    }
  }

  const facts = factsOf(row)
  const stage = stageOf(facts)
  const unavailable: string[] = []
  const hosted = configured && !!cfg.config.hostedFlowTemplate
  const embedded = configured && cfg.config.embeddedComponents
  if (configured && !hosted && !embedded) unavailable.push("onboarding")
  if (configured && !embedded) unavailable.push("payout_form")

  let balances: BalanceRow[] = []
  let payouts: HubOverview["payouts"] = []
  if (configured && row?.provider_account_id && facts.lifecycle === "ACTIVE") {
    const c = airwallex()
    const [b, p] = await Promise.all([
      currentBalances(c, row.provider_account_id).then(
        (list) => saveBalances(creator.id, list),
        (e) => {
          console.error("[payments] balances failed", describe(e))
          return cachedBalances(creator.id)
        },
      ),
      listPayouts(c, row.provider_account_id).then(
        /* Newest first, whatever order Airwallex lists them in. */
        (list) => list.map(toHubPayout).sort((a, b) => (Date.parse(b.createdAt ?? "") || 0) - (Date.parse(a.createdAt ?? "") || 0)),
        (e) => {
          console.error("[payments] payouts failed", describe(e))
          return [] as HubOverview["payouts"]
        },
      ),
    ])
    balances = b
    payouts = p
  }

  return {
    provider: "airwallex",
    environment: configured ? cfg.config.env : "sandbox",
    configured,
    tableMissing: missing,
    stage,
    copy: STAGE_COPY[stage],
    kind: row?.account_kind ?? null,
    requirements: stage === "action" ? requirementNotes(row?.requirements ?? null, row?.next_action_type) : [],
    checkoutOpen: checkoutOpen(facts),
    balances: balances.map((b) => ({ currency: b.currency, availableMinor: b.available_minor, pendingMinor: b.pending_minor })),
    balancesAt: balances[0]?.fetched_at ?? null,
    payoutDestination: row?.payout_destination ?? null,
    payouts,
    can: {
      embeddedOnboarding: embedded && row?.account_kind === "business",
      hostedOnboarding: hosted,
      embeddedPayoutForm: embedded,
      requestPayout: checkoutOpen(facts),
    },
    unavailable,
    badge: "setup",
    uxState: "PAYMENTS_NOT_CONFIGURED",
    nextPayout: null,
  }
}

function toHubPayout(t: AwxTransfer): HubOverview["payouts"][number] {
  const currency = (t.transfer_currency || t.source_currency || "USD").toUpperCase()
  const { status, text } = payoutStatusOf(t.status)
  return {
    id: t.id,
    amountMinor: toMinor(t.transfer_amount ?? t.source_amount ?? 0, currency),
    currency,
    status,
    statusText: text,
    createdAt: t.created_at ?? null,
  }
}

/* ── Starting ─────────────────────────────────────────────────────────── */

export { PaymentsProblem } from "./errors"

export interface StartInput {
  kind: "individual" | "business"
  country: string
  businessName?: string
  consent: { ip: string | null; userAgent: string | null }
}

/**
 * Creates the creator's Airwallex account, once. The row is claimed first,
 * so a double press makes one account; a failed creation gives the claim
 * back, so they can try again.
 */
export async function beginOnboarding(
  creator: CreatorRef,
  input: { kind: string; country: string; firstName: string; lastName: string; businessName?: string },
) {
  if ((await providerFor(creator.id)) !== "stripe") throw new PaymentsProblem("This setup is not available.")
  await beginStripeOnboarding(creator, input)
  return overview(creator)
}

/** Swaps an untouched Stripe-hosted account for one Storelib runs, before the Verify step draws. */
export async function prepareVerification(creator: CreatorRef) {
  if ((await providerFor(creator.id)) !== "stripe") throw new PaymentsProblem("This setup is not available.")
  await prepareStorelibAccount(creator)
  return stripeOverview(creator, { sync: false })
}

/** Disconnect / start over. `confirmed` is the creator's explicit yes, required for an account that was ever started. */
export async function disconnectPayoutAccount(creator: CreatorRef, options: { confirmed?: boolean } = {}) {
  if ((await providerFor(creator.id)) !== "stripe") throw new PaymentsProblem("This setup is not available.")
  await disconnectStripeAccount(creator.id, { confirmed: options.confirmed === true })
  return overview(creator)
}

export async function startOnboarding(creator: CreatorRef, input: StartInput): Promise<AccountRow | HubOverview> {
  const provider = await providerFor(creator.id)
  if (provider === "stripe") {
    if (!creator.email) throw new PaymentsProblem("Add an email address to your account first.")
    return stripeStartOnboarding(creator, { kind: input.kind, country: input.country })
  }
  requireConfigured()
  if (!creator.email) throw new PaymentsProblem("Add an email address to your account first.")
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new PaymentsProblem("Choose your country.")
  if (input.kind === "business" && !(input.businessName ?? "").trim()) throw new PaymentsProblem("Enter your business name.")

  const consentAt = new Date().toISOString()
  const { claimed } = await claimAccountRow(creator.id, { kind: input.kind, country, consentAt })
  if (!claimed) {
    const { row } = await readAccount(creator.id)
    if (row?.provider_account_id) return row
    throw new PaymentsProblem("Setup is already starting. Refresh the page in a moment.", 409)
  }

  try {
    const account = await createAccount(airwallex(), {
      kind: input.kind,
      email: creator.email,
      country,
      businessName: input.businessName?.trim(),
      creatorId: creator.id,
      consent: { at: consentAt, ip: input.consent.ip, userAgent: input.consent.userAgent },
    })
    await setProviderAccountId(creator.id, account.id, account.status ?? null)
    await audit({ creatorId: creator.id, kind: "account.created", to: account.status ?? null, ref: account.id, actor: "creator" })
    await audit({ creatorId: creator.id, kind: "consent", to: "agreed", actor: "creator" })
    return (await readAccount(creator.id)).row as AccountRow
  } catch (e) {
    await releaseClaim(creator.id)
    console.error("[payments] account create failed", describe(e))
    throw new PaymentsProblem("We could not start setup just now. Nothing was saved. Try again in a moment.", 502)
  }
}

/** The hosted flow's short lived address, for a creator whose account exists. */
export async function hostedFlowUrl(creator: CreatorRef, origin: string): Promise<string> {
  const cfg = requireConfigured()
  if (!cfg.hostedFlowTemplate) throw new PaymentsProblem("Verification is not switched on for Storelib yet.", 503)
  const { row } = await readAccount(creator.id)
  if (!row?.provider_account_id) throw new PaymentsProblem("Start setup first.")
  const lifecycle = readLifecycle(row.lifecycle_status)
  if (lifecycle === "SUSPENDED" || lifecycle === "CLOSED") throw new PaymentsProblem("This payments account cannot be changed. Contact support.", 409)
  const c = airwallex()
  let flowId = row.hosted_flow_id
  if (!flowId) {
    const back = `${origin}/app/settings?tab=payments&from=verification`
    const flow = await createHostedFlow(c, { accountId: row.provider_account_id, template: cfg.hostedFlowTemplate, returnUrl: back, errorUrl: `${back}&error=1` })
    flowId = flow.id
    await setHostedFlow(creator.id, flowId)
  }
  try {
    const authorised = await authorizeHostedFlow(c, flowId, creator.userId)
    return authorised.url
  } catch (e) {
    /* A finished flow cannot be authorised again (400): a fresh one for what Airwallex asks next. */
    if (e instanceof AirwallexError && e.status === 400) {
      const back = `${origin}/app/settings?tab=payments&from=verification`
      const flow = await createHostedFlow(c, { accountId: row.provider_account_id, template: cfg.hostedFlowTemplate, returnUrl: back, errorUrl: `${back}&error=1` })
      await setHostedFlow(creator.id, flow.id)
      return (await authorizeHostedFlow(c, flow.id, creator.userId)).url
    }
    throw e
  }
}

/**
 * One-time authorisation for an embedded component, on behalf of THIS
 * creator's account only. PKCE: the verifier is made here, its challenge
 * goes to Airwallex, and the browser gets the code and the verifier for the
 * SDK's init. The code lives 30 seconds and is good once.
 */
export async function componentAuth(
  creator: CreatorRef,
  purpose: "onboarding" | "payout_form" | "rfi" | "stripe_onboarding" | "stripe_management" | "stripe_payouts",
): Promise<
  | { authCode: string; codeVerifier: string; clientId: string; env: "sandbox" | "prod" }
  | { clientSecret: string; publishableKey: string; stripeSignIn: boolean }
> {
  const provider = await providerFor(creator.id)
  if (provider === "stripe") {
    const stripePurpose =
      purpose === "stripe_onboarding" || purpose === "onboarding"
        ? "onboarding"
        : purpose === "stripe_management" || purpose === "rfi"
          ? "management"
          : purpose === "stripe_payouts" || purpose === "payout_form"
            ? "payouts"
            : "balances"
    const session = await stripeAccountSession(creator, stripePurpose)
    return { clientSecret: session.clientSecret, publishableKey: session.publishableKey, stripeSignIn: session.stripeSignIn }
  }
  const cfg = requireConfigured()
  if (!cfg.embeddedComponents) throw new PaymentsProblem("This is not switched on for Storelib yet.", 503)
  const { row } = await readAccount(creator.id)
  if (!row?.provider_account_id) throw new PaymentsProblem("Start setup first.")
  if (purpose === "onboarding" && row.account_kind !== "business") throw new PaymentsProblem("Individual accounts are verified on Airwallex's page.")
  if (purpose === "payout_form" && readLifecycle(row.lifecycle_status) !== "ACTIVE") throw new PaymentsProblem("Finish verification before adding a payout account.")
  const scope: ComponentScope[] = purpose === "onboarding" ? ["onboarding:write"] : purpose === "payout_form" ? ["transfer:write"] : ["rfi:read", "rfi:write"]
  const codeVerifier = randomBytes(48).toString("base64url")
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url")
  const authCode = await authorizeComponent(airwallex(), row.provider_account_id, scope, codeChallenge)
  /* Airwallex.js names its environments "sandbox" and "prod" (docs/js/getting-started). */
  return { authCode, codeVerifier, clientId: cfg.clientId, env: cfg.env === "production" ? "prod" : "sandbox" }
}

/** The embedded onboarding form's own status, for the hub's wording only. Never readiness. */
export async function noteFormStatus(creator: CreatorRef, raw: unknown): Promise<void> {
  const status = readFormStatus(raw)
  if (!status) return
  const { row } = await readAccount(creator.id)
  if (!row || row.form_status === status) return
  await setFormStatus(creator.id, status)
  await audit({ creatorId: creator.id, kind: "onboarding.form", from: row.form_status, to: status, actor: "creator" })
}

/* ── The payout account ───────────────────────────────────────────────── */

/**
 * The embedded payout form's submit() payload, created as a beneficiary on
 * THEIR account. The payload passes through and is not kept or logged.
 */
export async function addPayoutAccount(creator: CreatorRef, payload: unknown): Promise<PayoutDestination> {
  requireConfigured()
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PaymentsProblem("The bank details did not come through. Try again.")
  const { row } = await readAccount(creator.id)
  if (!row?.provider_account_id) throw new PaymentsProblem("Start setup first.")
  if (readLifecycle(row.lifecycle_status) !== "ACTIVE") throw new PaymentsProblem("Finish verification before adding a payout account.")
  let created
  try {
    created = await createBeneficiary(airwallex(), row.provider_account_id, payload as Record<string, unknown>)
  } catch (e) {
    console.error("[payments] beneficiary create failed", describe(e))
    if (e instanceof AirwallexError && e.status === 400) throw new PaymentsProblem("Airwallex could not use those bank details. Check them and try again.")
    throw new PaymentsProblem("We could not save the payout account just now. Try again in a moment.", 502)
  }
  if (!created.id) throw new PaymentsProblem("We could not save the payout account just now. Try again in a moment.", 502)
  const masked = maskBeneficiary(created)
  const replaced = row.payout_beneficiary_id
  await setPayoutDestination(creator.id, created.id, masked)
  await audit({ creatorId: creator.id, kind: replaced ? "payout_account.replaced" : "payout_account.added", ref: created.id, actor: "creator" })
  return masked
}

/**
 * The payout destination Airwallex actually holds, when the row lost track
 * (a beneficiary added some other way). Picks the one on the row if it is
 * still there, else the newest.
 */
export async function refreshPayoutAccount(creator: CreatorRef): Promise<PayoutDestination | null> {
  requireConfigured()
  const { row } = await readAccount(creator.id)
  if (!row?.provider_account_id) return null
  const list = await listBeneficiaries(airwallex(), row.provider_account_id)
  const keep = list.find((b) => b.id === row.payout_beneficiary_id) ?? list[0] ?? null
  const masked = keep ? maskBeneficiary(keep) : null
  await setPayoutDestination(creator.id, keep?.id ?? null, masked)
  return masked
}

/* ── Payouts ──────────────────────────────────────────────────────────── */

/**
 * A payout of `amountMinor` from their wallet to their payout account. The
 * amount is checked against the balance Airwallex reports NOW, not a cached
 * one; Storelib's own id for the payout is written first and is the request
 * id, so a retry cannot pay twice.
 */
export async function requestPayout(creator: CreatorRef, amountMinor: number, currency: string): Promise<{ id: string; status: PayoutStatus }> {
  requireConfigured()
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new PaymentsProblem("Enter an amount.")
  const cur = currency.trim().toUpperCase()
  if (!/^[A-Z]{3}$/.test(cur)) throw new PaymentsProblem("Choose a currency.")
  const { row } = await readAccount(creator.id)
  if (!row?.provider_account_id || !checkoutOpen(factsOf(row))) throw new PaymentsProblem("Finish setting up payments first.")
  const c = airwallex()
  const live = await saveBalances(creator.id, await currentBalances(c, row.provider_account_id))
  const available = live.find((b) => b.currency === cur)?.available_minor ?? 0
  if (amountMinor > available) throw new PaymentsProblem("That is more than your available balance.")

  const db = createAdminClient()
  const { data: made, error } = await db
    .from("payment_payouts")
    .insert({ creator_id: creator.id, provider: "airwallex", amount_minor: amountMinor, currency: cur, status: "requested", destination: row.payout_destination })
    .select("id")
    .single()
  if (error || !made) throw new PaymentsProblem("We could not start the payout. Nothing was sent.", 500)
  const payoutId = (made as { id: string }).id
  try {
    const t = await createPayout(c, row.provider_account_id, { payoutId, beneficiaryId: row.payout_beneficiary_id as string, amountMinor, currency: cur })
    await db.from("payment_payouts").update({ provider_transfer_id: t.id, status: (t.status ?? "requested").slice(0, 60), updated_at: new Date().toISOString() }).eq("id", payoutId)
    await audit({ creatorId: creator.id, kind: "payout.requested", to: t.status ?? null, ref: t.id, actor: "creator" })
    return { id: payoutId, status: payoutStatusOf(t.status).status }
  } catch (e) {
    console.error("[payments] payout create failed", describe(e))
    await db.from("payment_payouts").update({ status: "failed_to_start", failure_reason: e instanceof AirwallexError ? `${e.status} ${e.code ?? ""}`.trim() : "error", updated_at: new Date().toISOString() }).eq("id", payoutId)
    throw new PaymentsProblem("The payout could not be started. Nothing was sent. Try again in a moment.", 502)
  }
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function requireConfigured() {
  const r = readAirwallexConfig()
  if (r.ok === false) throw new PaymentsProblem("Payments are not switched on yet.", 503)
  return r.config
}

/** A thrown value, for a log line: status and code, never a body. */
export function describe(e: unknown): string {
  if (e instanceof AirwallexError) return `${e.status} ${e.code ?? ""}`.trim()
  return e instanceof Error ? e.message.slice(0, 200) : "error"
}
