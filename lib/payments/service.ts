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
 * STRIPE IS UNTOUCHED. A creator is on Airwallex only when the rollout names
 * them (./airwallex/config airwallexRollout) or they already have an
 * Airwallex account row; everyone else is answered "stripe" and every
 * existing Stripe screen and route goes on exactly as before.
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

export interface CreatorRef {
  id: string
  userId: string
  email: string | null
}

/* ── Which provider ───────────────────────────────────────────────────── */

/**
 * Stripe or Airwallex, for this creator:
 *
 *   an Airwallex account row          Airwallex, whatever the rollout says now
 *   named in the rollout              Airwallex
 *   rollout "all", no Stripe account  Airwallex (a new creator)
 *   rollout "all", a Stripe account   Stripe: a creator already being paid is
 *                                     never moved by a switch; they move when
 *                                     they set up on Airwallex themselves
 *   otherwise                         Stripe
 */
export async function providerFor(creatorId: string): Promise<PaymentProviderId> {
  const reach = airwallexRollout(creatorId)
  if (reach === "none") {
    /* Not configured, or not in the rollout: only a row already there (from an earlier rollout) makes it Airwallex. */
    if (!readAirwallexConfig().ok) return "stripe"
  }
  let row: AccountRow | null = null
  try {
    row = (await readAccount(creatorId)).row
  } catch {
    row = null
  }
  if (row) return "airwallex"
  if (reach === "named") return "airwallex"
  if (reach === "all") {
    const { data } = await createAdminClient().from("creators").select("stripe_account_id").eq("id", creatorId).maybeSingle()
    const stripeAccount = (data as { stripe_account_id: string | null } | null)?.stripe_account_id
    return stripeAccount ? "stripe" : "airwallex"
  }
  return "stripe"
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

/** The facts checkout's gate reads. Never calls Airwallex: the row is kept current by webhooks and the hub. */
export async function paymentFactsFor(creatorId: string): Promise<ProviderAccountFacts> {
  try {
    return factsOf((await readAccount(creatorId)).row)
  } catch {
    return factsOf(null)
  }
}

/* ── The hub ──────────────────────────────────────────────────────────── */

export interface HubOverview {
  provider: "airwallex"
  /** "sandbox" or "production": the hub marks a test account as one. */
  environment: "sandbox" | "production"
  configured: boolean
  /** Part 76 has not been run: nothing can be stored yet. */
  tableMissing: boolean
  stage: PaymentsStage
  copy: StageCopy
  kind: "individual" | "business" | null
  requirements: RequirementNote[]
  checkoutOpen: boolean
  balances: Array<{ currency: string; availableMinor: number; pendingMinor: number }>
  balancesAt: string | null
  payoutDestination: PayoutDestination | null
  payouts: Array<{ id: string; amountMinor: number; currency: string; status: PayoutStatus; statusText: string; createdAt: string | null }>
  /** What this platform can offer, from how Airwallex has set it up. */
  can: {
    embeddedOnboarding: boolean
    hostedOnboarding: boolean
    embeddedPayoutForm: boolean
    requestPayout: boolean
  }
  /** Things the platform has not switched on yet, for the hub to say plainly. */
  unavailable: string[]
}

export { payoutStatusOf, type PayoutStatus } from "./model"

export async function overview(creator: CreatorRef): Promise<HubOverview> {
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

export class PaymentsProblem extends Error {
  /** A sentence for the creator. */
  readonly userMessage: string
  readonly status: number
  constructor(userMessage: string, status = 400) {
    super(userMessage)
    this.userMessage = userMessage
    this.status = status
  }
}

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
export async function startOnboarding(creator: CreatorRef, input: StartInput): Promise<AccountRow> {
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
export async function componentAuth(creator: CreatorRef, purpose: "onboarding" | "payout_form" | "rfi"): Promise<{ authCode: string; codeVerifier: string; clientId: string; env: "sandbox" | "prod" }> {
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
