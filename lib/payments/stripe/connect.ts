import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { countryCode } from "@/lib/checkout/countries"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"
import { countryIsUnsupported, paymentsSetupErrorMessage, stripeErrorMessage } from "./setup-errors"
import { canAcceptPayments, sellerFactsOfAccount } from "./readiness"
import { parsePersonal } from "./onboarding-steps"
import { STRIPE_REQUESTED_CAPABILITIES } from "./config"
import { mergeStripeAccount, type StripeCreatorSnapshot } from "./facts"
import { getStorelibPaymentsStatus, statusFactsOf, type StorelibStatusView } from "./status"
import { accountSessionComponents } from "./session-components"
import { creatorBusinessProfile } from "./business-profile"
import { PaymentsProblem } from "../errors"

export interface PaymentsCreatorRef {
  id: string
  userId: string
  email: string | null
}
import type { PayoutDestination } from "../store"

export type { StripeAccountSessionPurpose } from "./session-components"
import type { StripeAccountSessionPurpose } from "./session-components"

const CREATOR_STRIPE_COLUMNS =
  "id, user_id, username, display_name, bio, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, details_submitted, stripe_requirements, stripe_requirements_updated_at, stripe_connected_at"
/* What the last sync worked out (supabase/sql/run-now/84_seller_payment_state.sql). Read when the columns are there. */
const SELLER_STATE_COLUMNS =
  "can_accept_payments, stripe_transfers_status, stripe_disabled_reason, stripe_pending_verification, stripe_eventually_due, payout_destination, payments_status, last_stripe_sync_at, stripe_requirements_cleared_at"
/* Learnt once per server instance: before the SQL part runs, every read would otherwise fail first and retry. */
let sellerStateColumns: boolean | null = null

export interface CreatorStripeRow {
  id: string
  user_id: string
  username: string | null
  display_name: string | null
  bio: string | null
  stripe_account_id: string | null
  stripe_onboarding_status: string | null
  charges_enabled: boolean | null
  payouts_enabled: boolean | null
  details_submitted: boolean | null
  stripe_requirements: string[] | null
  stripe_requirements_updated_at: string | null
  stripe_connected_at: string | null
  can_accept_payments?: boolean | null
  stripe_transfers_status?: string | null
  stripe_disabled_reason?: string | null
  stripe_pending_verification?: string[] | null
  stripe_eventually_due?: string[] | null
  payout_destination?: { bankName?: string | null; last4?: string | null; country?: string | null; currency?: string | null } | null
  payments_status?: string | null
  last_stripe_sync_at?: string | null
  stripe_requirements_cleared_at?: string | null
}

export async function readCreatorStripe(creatorId: string): Promise<CreatorStripeRow | null> {
  const db = createAdminClient()
  if (sellerStateColumns !== false) {
    const { data, error } = await db.from("creators").select(`${CREATOR_STRIPE_COLUMNS}, ${SELLER_STATE_COLUMNS}`).eq("id", creatorId).maybeSingle()
    if (!error) {
      sellerStateColumns = true
      return data as CreatorStripeRow | null
    }
    if (!/column|does not exist|schema cache/i.test(error.message)) throw new Error(error.message)
    sellerStateColumns = false
  }
  const { data, error } = await db.from("creators").select(CREATOR_STRIPE_COLUMNS).eq("id", creatorId).maybeSingle()
  if (error) throw new Error(error.message)
  return data as CreatorStripeRow | null
}

export async function profileForCreator(userId: string) {
  const { data } = await createAdminClient().from("profiles").select("email, country, first_name, last_name").eq("id", userId).maybeSingle()
  return data as { email: string | null; country: string | null; first_name: string | null; last_name: string | null } | null
}

/**
 * Storelib pays creators out when they press Cash out, so every connected
 * account keeps a manual schedule. Pass the account when it has just been
 * read, so this costs a write only when the schedule has drifted.
 */
async function enforceManualPayouts(accountId: string, known?: Stripe.Account) {
  try {
    const account = known ?? (await stripe.accounts.retrieve(accountId))
    if (account.settings?.payouts?.schedule?.interval !== "manual") {
      await stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval: "manual" } } } })
    }
  } catch {
    /* non-fatal: a Standard account refuses the write, and the next sync tries again */
  }
}

/**
 * True only when Stripe says the account itself is gone or no longer ours
 * (deleted, or the connection revoked). A timeout, a 500 or a rate limit is
 * NOT that: treating it as "gone" would make a new account and overwrite the
 * creator's real one, with its balance and history, on a network blip.
 */
export function accountIsGone(error: unknown): boolean {
  const e = error as { type?: string; code?: string; statusCode?: number } | null
  if (!e) return false
  if (e.type === "StripePermissionError") return true
  return e.type === "StripeInvalidRequestError" && (e.code === "resource_missing" || e.code === "account_invalid" || e.statusCode === 404)
}

/**
 * ===========================================================================
 *  LETTING GO OF A CONNECTION WITHOUT LOSING WHAT IT WAS
 * ===========================================================================
 * Storelib moved to a new Stripe Connect platform. Every creator linked before
 * that still has the old connected account's id on their row, and the new
 * platform cannot read it: Stripe answers with a permission error, which
 * accountIsGone() above reads as exactly that and nothing looser. Before this,
 * the sync threw on every visit, the page fell back to whatever flags were
 * cached from the old platform, and the creator was left with "Payments are
 * turned off" and a Disconnect that failed: stuck, with no way forward.
 *
 * Now the live link is released. stripe_account_id is cleared and the cached
 * flags with it, so the checkout gate (checkoutReadyForCreator) closes instead
 * of letting a buyer pay into an account the platform cannot pay out of, and
 * the page offers Reconnect payments. stripe_connected_at is KEPT: it is what
 * says this creator once had payments working, which is what makes the next
 * step "Reconnect" rather than "Set up".
 *
 * NOTHING HISTORICAL IS TOUCHED. Orders, payouts, refunds, disputes and the
 * ledger each keep the Stripe ids they were written with. The old account id
 * is kept on the row (part 79) and written to the server log, so support can
 * always say which account a creator used to have.
 *
 * Race safe: the release only applies while the row still holds the account it
 * is releasing, so a new account created a moment earlier is never cleared.
 */
export type AccountResetReason = "legacy_platform" | "creator_disconnect" | "incomplete_replaced"

async function noteAccountReset(creatorId: string, previousAccountId: string, reason: AccountResetReason): Promise<void> {
  /* Server side only, for support: the creator never sees an account id. */
  console.warn(`[stripe connect] connection reset (${reason}) for creator ${creatorId}, previous account ${previousAccountId}`)
  const { error } = await createAdminClient()
    .from("creators")
    .update({ stripe_previous_account_id: previousAccountId, stripe_account_reset_at: new Date().toISOString(), stripe_account_reset_reason: reason })
    .eq("id", creatorId)
  /* Part 78 adds these; until it runs the log line above is the record. */
  if (error && !/stripe_previous_account_id|stripe_account_reset|column/i.test(error.message)) {
    console.error("[stripe connect] reset record", error.message.slice(0, 160))
  }
}

export async function releaseConnectedAccount(creatorId: string, previousAccountId: string, reason: AccountResetReason): Promise<void> {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: released, error } = await admin
    .from("creators")
    .update({
      stripe_account_id: null,
      stripe_onboarding_status: "not_connected",
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      stripe_requirements: [],
      stripe_requirements_due_at: null,
      stripe_requirements_updated_at: now,
    })
    .eq("id", creatorId)
    .eq("stripe_account_id", previousAccountId)
    .select("id")
  if (error) {
    console.error("[stripe connect] release", error.message.slice(0, 160))
    throw new PaymentsProblem("We couldn't update your payments just now. Nothing was changed. Try again in a moment.", 502)
  }
  /*
   * THE GUARD ABOVE IS THE WHOLE POINT, SO NOTHING BELOW RUNS WITHOUT IT.
   * The write only applies while the row still holds the account being let
   * go. The writes that follow were filtered on the creator alone, so in
   * exactly the race this guards against (a late deauthorise, or a release
   * arriving after the creator reconnected) the guarded write correctly did
   * nothing while the rest still fired, leaving a new and perfectly good
   * account marked as unable to take payments with its bank forgotten.
   * Checkout reads can_accept_payments, so that is a shop that has stopped
   * selling for a reason nobody can see.
   */
  if (!released || released.length === 0) return
  const cached = await admin.from("creators").update({ payments_status: "NOT_STARTED", last_stripe_sync_at: now }).eq("id", creatorId)
  if (cached.error && !/payments_status|last_stripe_sync_at|column/i.test(cached.error.message)) {
    console.error("[stripe connect] status cache", cached.error.message.slice(0, 160))
  }
  /*
   * The cached answers went with the account they described. Left behind,
   * can_accept_payments would still read true for an account that is gone:
   * every caller that selects stripe_account_id sees the null and refuses
   * anyway (lib/payments/stripe/readiness rowCanAcceptPayments), but a row
   * that says yes about nothing is a trap for the next one that does not.
   */
  const state = await admin
    .from("creators")
    .update({
      can_accept_payments: false,
      stripe_transfers_status: null,
      stripe_disabled_reason: null,
      stripe_pending_verification: [],
      stripe_eventually_due: [],
      stripe_requirement_errors: [],
      payout_destination: null,
    })
    .eq("id", creatorId)
  if (state.error && !/column|does not exist|schema cache/i.test(state.error.message)) {
    console.error("[stripe connect] release state", state.error.message.slice(0, 160))
  }
  await noteAccountReset(creatorId, previousAccountId, reason)
}

/** Whether this creator once had a connection: what makes setting up again "Reconnect". Tolerates part 79 not having run. */
export async function hadConnection(creatorId: string, connectedAt: string | null | undefined): Promise<boolean> {
  if (connectedAt) return true
  const { data, error } = await createAdminClient().from("creators").select("stripe_previous_account_id").eq("id", creatorId).maybeSingle()
  if (error) return false
  return !!(data as { stripe_previous_account_id?: string | null } | null)?.stripe_previous_account_id
}

/**
 * Storelib collects the requirements (through the embedded form) and there
 * is no Stripe dashboard, so Stripe does not ask the creator to sign in to
 * Stripe in a separate window.
 */
export function runsInStorelib(account: Pick<Stripe.Account, "controller"> | null | undefined): boolean {
  return account?.controller?.requirement_collection === "application"
}

export async function ensureStripeAccount(
  creator: PaymentsCreatorRef,
  input: { kind: "individual" | "business"; country: string },
): Promise<string> {
  if (!process.env.STRIPE_SECRET_KEY) throw new PaymentsProblem("Payments are not switched on yet.", 503)

  const row = await readCreatorStripe(creator.id)
  if (!row) throw new PaymentsProblem("Creator profile not found.", 404)

  let accountId = row.stripe_account_id
  let replacing: string | null = null
  if (accountId) {
    try {
      const existing = await stripe.accounts.retrieve(accountId)
      /* An unfinished Express account would make Stripe open its sign-in window.
         Nothing has been sent on it, so it is swapped for one that stays in Storelib. */
      const untouched = !existing.details_submitted && !existing.charges_enabled && !existing.payouts_enabled
      if (runsInStorelib(existing) || !untouched) return accountId
      replacing = accountId
    } catch (error) {
      if (!accountIsGone(error)) {
        console.error("[stripe connect] account check", error instanceof Error ? error.message : error)
        throw new PaymentsProblem("We could not reach our payment partner just now. Nothing was changed. Try again in a moment.", 502)
      }
      /* Not reachable from the current platform (an account from before the move): kept on record, then replaced. */
      await noteAccountReset(creator.id, accountId, "legacy_platform")
      accountId = null
    }
  }

  const profile = await profileForCreator(creator.userId)
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new PaymentsProblem("Choose your country.")

  const businessType = input.kind === "business" ? "company" : "individual"
  const email = ownerAddress(profile?.email || creator.email) || undefined

  const shared: Stripe.AccountCreateParams = {
    country,
    email,
    business_type: businessType,
    /* The creator's own page and what really happens there, not storelib.com and their bio (lib/payments/stripe/business-profile). */
    business_profile: creatorBusinessProfile({ username: row.username, displayName: row.display_name, platformUrl: platformBusinessUrl() }),
    metadata: { storelib_creator_id: creator.id, storelib_username: row.username ?? "" },
  }

  try {
    let account: Stripe.Account
    if (replacing) {
      try {
        account = await createConnectedAccount(shared, country, { storelibOnly: true })
      } catch (error) {
        console.error("[stripe connect] kept the existing account", stripeErrorMessage(error).replace(/\s+/g, " ").slice(0, 180))
        return replacing
      }
      await stripe.accounts.del(replacing).catch((error) => {
        console.error("[stripe connect] old account not removed", stripeErrorMessage(error).slice(0, 160))
      })
      await noteAccountReset(creator.id, replacing, "incomplete_replaced")
    } else {
      account = await createConnectedAccount(shared, country)
    }
    accountId = account.id

    const admin = createAdminClient()
    const { error: saveError } = await admin
      .from("creators")
      .update({
        stripe_account_id: accountId,
        stripe_onboarding_status: "pending",
        stripe_connected_at: null,
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      })
      .eq("id", creator.id)
    if (saveError) {
      console.error("[stripe connect] saved account on Stripe but not on the creator row", saveError.message)
      throw new PaymentsProblem("We started your payments account but could not save it. Try again in a moment.", 502)
    }

    const ledger = await admin.from("seller_ledger").upsert({ creator_id: creator.id }, { onConflict: "creator_id" })
    if (ledger.error) console.error("[stripe connect] ledger row", ledger.error.message)

    await enforceManualPayouts(accountId)
    return accountId
  } catch (error: unknown) {
    if (error instanceof PaymentsProblem) throw error
    const refusal = stripeRefusal(error)
    if (refusal) {
      logStripeRefusal("payments/start", refusal)
      throw new PaymentsProblem(refusal.error, refusal.status)
    }
    const detail = stripeErrorMessage(error).replace(/\s+/g, " ").slice(0, 240)
    console.error("[stripe connect] create account", detail || "unknown")
    throw new PaymentsProblem(paymentsSetupErrorMessage(error), 502)
  }
}

export function platformBusinessUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://storelib.com").trim()
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "https://storelib.com"
    return u.origin
  } catch {
    return "https://storelib.com"
  }
}

let platformCountryCache: string | null = null

async function platformCountry(): Promise<string> {
  if (platformCountryCache) return platformCountryCache
  const account = await stripe.accounts.retrieve()
  platformCountryCache = (account.country || "US").toUpperCase()
  return platformCountryCache
}

/**
 * Destination charges only need `transfers` on the connected account.
 * A creator outside the platform country is a cross-border recipient:
 * card_payments is not requested, and the recipient agreement is.
 *
 * First choice: Storelib collects the requirements and there is no Stripe
 * dashboard, so setup never leaves Storelib. If the platform is not set up
 * for that, Express accounts follow, as before.
 */
async function createConnectedAccount(
  shared: Stripe.AccountCreateParams,
  country: string,
  options: { storelibOnly?: boolean } = {},
): Promise<Stripe.Account> {
  const platform = await platformCountry().catch(() => "")
  const crossBorder = platform !== "" && country !== platform
  const full: Stripe.AccountCreateParams.Capabilities = {
    card_payments: { requested: true },
    transfers: { requested: true },
  }
  const transfersOnly: Stripe.AccountCreateParams.Capabilities = { transfers: { requested: true } }
  const inStorelib: Stripe.AccountCreateParams.Controller = {
    stripe_dashboard: { type: "none" },
    fees: { payer: "application" },
    losses: { payments: "application" },
    requirement_collection: "application",
  }
  const acknowledged: Stripe.AccountCreateParams.Controller = {
    stripe_dashboard: { type: "express" },
    fees: { payer: "application" },
    losses: { payments: "application" },
    requirement_collection: "stripe",
  }
  const expressDefault: Stripe.AccountCreateParams.Controller = {
    stripe_dashboard: { type: "express" },
    fees: { payer: "account" },
    losses: { payments: "stripe" },
    requirement_collection: "stripe",
  }

  const recipient = {
    ...shared,
    capabilities: transfersOnly,
    tos_acceptance: { service_agreement: "recipient" },
  }
  const merchant = { ...shared, capabilities: full }
  /* Destination charges only need transfers. card_payments is extra, and
     Stripe refuses it for some countries (Romania included) with a message
     that sounds like the country itself is unsupported. Transfers, with no
     recipient agreement, still pays the seller out. */
  const paidOut = { ...shared, capabilities: transfersOnly }

  /* The recipient ToS agreement only exists for cross-border payouts: Stripe
     refuses it when the platform and the creator are in the same country
     ("recipient ToS is not supported for platforms in RO creating accounts in
     RO"). Same country tries a full account, then transfers only. */
  const storelibAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [
        { ...recipient, controller: inStorelib },
        { ...paidOut, controller: inStorelib },
        { ...merchant, controller: inStorelib },
      ]
    : [
        { ...merchant, controller: inStorelib },
        { ...paidOut, controller: inStorelib },
      ]
  const expressAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [
        { ...recipient, controller: acknowledged },
        { ...paidOut, controller: acknowledged },
        { ...recipient, type: "express" },
      ]
    : [
        { ...merchant, controller: acknowledged },
        { ...paidOut, controller: acknowledged },
        { ...merchant, type: "express" },
      ]
  const attempts = options.storelibOnly ? storelibAttempts : [...storelibAttempts, ...expressAttempts]

  let last: unknown
  /* A platform-level block (Stripe paused or is holding the platform) is the
     real reason none of the attempts can land; a later attempt's own refusal
     is noise, so this is thrown ahead of `last`. */
  let blocker: unknown
  /* Set only when the transfers-only account, the one every supported country
     can hold, was refused because of the country itself. A card_payments or
     recipient refusal is not that. */
  let countryBlocked: unknown
  for (const params of attempts) {
    try {
      return await stripe.accounts.create(params)
    } catch (error) {
      last = error
      const msg = stripeErrorMessage(error)
      console.error("[stripe connect] create attempt", msg.replace(/\s+/g, " ").slice(0, 180))
      if (/account has been rejected|invalid email/i.test(msg)) throw error
      if (!blocker && /temporarily restricted your ability to create|suspicious activity|confirm that you intended/i.test(msg)) blocker = error
      const transfersOnlyShape = !params.capabilities?.card_payments && params.tos_acceptance?.service_agreement !== "recipient"
      if (transfersOnlyShape && countryIsUnsupported(msg)) countryBlocked = error
    }
  }
  throw blocker ?? countryBlocked ?? last
}

export async function syncStripeAccount(creatorId: string, actor: "webhook" | "creator" | "system"): Promise<StripeCreatorSnapshot> {
  return (await syncStripeAccountFull(creatorId, actor)).snapshot
}

export interface StripeSyncResult {
  snapshot: StripeCreatorSnapshot
  account: Stripe.Account | null
  banks: Stripe.BankAccount[]
  status: StorelibStatusView
  /** Set when this sync found the stored account unreachable and let it go (the row has changed). */
  released?: AccountResetReason
}

const NO_ACCOUNT_SNAPSHOT = () =>
  mergeStripeAccount(
    { accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, disabledReason: null, currentlyDue: [], pastDue: [], pendingVerification: [], hasExternalAccount: false, accountKind: null },
    {},
    false,
  )

/**
 * Re-reads the account from Stripe (so webhook order never matters), caches
 * the flags and the Storelib status on the creator, and hands back what it read.
 */
export async function syncStripeAccountFull(creatorId: string, _actor: "webhook" | "creator" | "system"): Promise<StripeSyncResult> {
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) {
    const reconnect = row ? await hadConnection(creatorId, row.stripe_connected_at) : false
    return { snapshot: NO_ACCOUNT_SNAPSHOT(), account: null, banks: [], status: getStorelibPaymentsStatus(statusFactsOf(null, [], { reconnect })) }
  }

  const accountId = row.stripe_account_id
  const [read, external, lastPayout] = await Promise.all([
    stripe.accounts.retrieve(accountId).then(
      (account) => ({ ok: true as const, account }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    stripe.accounts
      .listExternalAccounts(accountId, { object: "bank_account", limit: 10 })
      .then((r) => ({ ok: true as const, data: r.data }))
      .catch(() => ({ ok: false as const, data: [] as Stripe.ExternalAccount[] })),
    stripe.payouts.list({ limit: 1 }, { stripeAccount: accountId }).catch(() => ({ data: [] as Stripe.Payout[] })),
  ])
  if (!read.ok) {
    /* A blip is a blip: thrown, so nothing is cleared and the caller shows the last known state. */
    if (!accountIsGone(read.error)) throw read.error
    /* Not reachable from the current platform: let go, so the creator can reconnect instead of being stuck. */
    await releaseConnectedAccount(creatorId, accountId, "legacy_platform")
    return {
      snapshot: NO_ACCOUNT_SNAPSHOT(),
      account: null,
      banks: [],
      status: getStorelibPaymentsStatus(statusFactsOf(null, [], { reconnect: true })),
      released: "legacy_platform",
    }
  }
  const account = read.account
  const banks = external.data.filter((e): e is Stripe.BankAccount => e.object === "bank_account")
  /*
   * A LIST THAT DID NOT ANSWER IS NOT AN EMPTY LIST. The account read beside
   * this one is deliberately a tuple so a blip is thrown rather than read as
   * "nothing": this one swallowed its failure and handed back no banks, so
   * one slow call turned an active seller into "Add your bank account" with
   * their saved bank gone from the page, until some later sync happened to
   * work. When the list did not answer, what was known before stands.
   */
  const bankList = external.ok ? banks : null

  await enforceManualPayouts(accountId, account)

  const chargesEnabled = !!account.charges_enabled
  const payoutsEnabled = !!account.payouts_enabled
  const detailsSubmitted = !!account.details_submitted
  /*
   * "Connected" is Storelib's one readiness rule (lib/payments/stripe/readiness):
   * the account can receive Storelib's transfer for a sale and be paid out.
   * It was charges_enabled && payouts_enabled, which a recipient account (a
   * seller in another country than the platform, transfers only) can never
   * reach: Stripe reports charges_enabled false for it for good.
   */
  const sellerFacts = sellerFactsOfAccount(account)
  const connected = canAcceptPayments(sellerFacts)
  const requirements = (account.requirements ?? {}) as Stripe.Account.Requirements
  const due = [...new Set([...(requirements.past_due ?? []), ...(requirements.currently_due ?? [])])].sort()
  const status = getStorelibPaymentsStatus(
    statusFactsOf(account, bankList ?? (row.payout_destination ? [{ status: "verified" }] : []), {
      everActive: connected || !!row.stripe_connected_at,
      lastPayoutFailed: lastPayout.data[0]?.status === "failed",
    }),
  )
  const now = new Date().toISOString()

  const admin = createAdminClient()
  await admin
    .from("creators")
    .update({
      stripe_onboarding_status: connected ? "connected" : "pending",
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      /* First time payments went live. Kept afterwards so a later hold reads as "restore", not "set up". */
      stripe_connected_at: connected ? row.stripe_connected_at ?? now : row.stripe_connected_at,
      stripe_requirements: due,
      stripe_requirements_due_at: requirements.current_deadline ? new Date(requirements.current_deadline * 1000).toISOString() : null,
      stripe_requirements_updated_at: now,
    })
    .eq("id", creatorId)
  /* Separate write: the cache columns come from RUN_PAYMENTS_STATUS.sql and may not exist yet. */
  const cached = await admin.from("creators").update({ payments_status: status.status, last_stripe_sync_at: now }).eq("id", creatorId)
  if (cached.error && !/payments_status|last_stripe_sync_at|column/i.test(cached.error.message)) {
    console.error("[stripe connect] status cache", cached.error.message.slice(0, 160))
  }
  /*
   * WHAT THE REST OF STORELIB READS INSTEAD OF ASKING STRIPE (part 84).
   * Separate again, so a database without that part keeps everything above.
   * The bank is masked (name, last four, country, currency) and nothing more.
   * Stripe's error codes are kept for support, never shown to a buyer.
   *
   * stripe_requirements_cleared_at moves when the list of things Stripe
   * wants goes from something to nothing. The "Stripe needs more" email is
   * keyed by it (lib/stripe/connect-webhook.ts), so the same request coming
   * back after it was dealt with is told again, while Stripe repeating
   * itself over and over is told once.
   */
  const masked = bankList ? (bankList.find((b) => b.default_for_currency) ?? bankList[0]) : null
  const hadDue = (row.stripe_requirements ?? []).length > 0
  const state = await admin
    .from("creators")
    .update({
      can_accept_payments: connected,
      stripe_transfers_status: sellerFacts.transfersStatus,
      stripe_disabled_reason: requirements.disabled_reason ?? null,
      stripe_account_country: account.country ?? null,
      stripe_business_type: account.business_type ?? null,
      stripe_pending_verification: requirements.pending_verification ?? [],
      stripe_eventually_due: requirements.eventually_due ?? [],
      stripe_requirement_errors: [...new Set((requirements.errors ?? []).map((e) => e.code).filter(Boolean))].slice(0, 20),
      /* Unknown leaves the last known bank alone; a list that answered and was empty does clear it. */
      ...(bankList === null
        ? {}
        : { payout_destination: masked ? { bankName: masked.bank_name ?? null, last4: masked.last4 ?? null, country: masked.country ?? null, currency: masked.currency?.toUpperCase() ?? null } : null }),
      ...(hadDue && due.length === 0 ? { stripe_requirements_cleared_at: now } : {}),
    })
    .eq("id", creatorId)
  if (state.error && !/column|does not exist|schema cache/i.test(state.error.message)) {
    console.error("[stripe connect] seller state", state.error.message.slice(0, 160))
  }

  const hasBank = bankList ? bankList.length > 0 : !!row.payout_destination
  const snapshot = mergeStripeAccount(
    {
      accountId,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
      disabledReason: null,
      currentlyDue: [],
      pastDue: [],
      pendingVerification: [],
      hasExternalAccount: false,
      accountKind: null,
    },
    {
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
      disabled_reason: account.requirements?.disabled_reason ?? null,
      business_type: account.business_type,
      capabilities: account.capabilities,
      requirements: account.requirements
        ? {
            currently_due: account.requirements.currently_due ?? undefined,
            past_due: account.requirements.past_due ?? undefined,
            pending_verification: account.requirements.pending_verification ?? undefined,
          }
        : null,
    },
    hasBank,
  )
  return { snapshot: { ...snapshot, canAcceptPayments: connected }, account, banks, status }
}

export function maskExternalAccount(ext: Stripe.ExternalAccount): PayoutDestination | null {
  if (ext.object !== "bank_account") return null
  const bank = ext as Stripe.BankAccount
  return {
    bankName: bank.bank_name ?? null,
    country: bank.country ?? null,
    currency: bank.currency?.toUpperCase() ?? null,
    last4: bank.last4 ?? null,
    holder: null,
  }
}

export async function fetchStripeBalances(accountId: string): Promise<Array<{ currency: string; availableMinor: number; pendingMinor: number }>> {
  const bal = await stripe.balance.retrieve({ stripeAccount: accountId })
  const byCurrency = new Map<string, { availableMinor: number; pendingMinor: number }>()
  for (const b of bal.available ?? []) {
    const cur = (b.currency ?? "usd").toUpperCase()
    const e = byCurrency.get(cur) ?? { availableMinor: 0, pendingMinor: 0 }
    /* Stripe's amounts are already in the smallest unit (cents). */
    e.availableMinor += b.amount
    byCurrency.set(cur, e)
  }
  for (const b of bal.pending ?? []) {
    const cur = (b.currency ?? "usd").toUpperCase()
    const e = byCurrency.get(cur) ?? { availableMinor: 0, pendingMinor: 0 }
    e.pendingMinor += b.amount
    byCurrency.set(cur, e)
  }
  return [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v }))
}

export async function fetchStripePayouts(accountId: string) {
  const list = await stripe.payouts.list({ limit: 10 }, { stripeAccount: accountId })
  return list.data.map((p) => ({
    id: p.id,
    amountMinor: p.amount,
    currency: p.currency.toUpperCase(),
    status: p.status,
    createdAt: p.created ? new Date(p.created * 1000).toISOString() : null,
    arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
  }))
}

function stripeKeyMode(key: string | undefined): "live" | "test" | "unknown" {
  if (!key) return "unknown"
  if (key.includes("_live_")) return "live"
  if (key.includes("_test_")) return "test"
  return "unknown"
}

export function publishableKeyForSession(): string {
  const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim()
  const sk = process.env.STRIPE_SECRET_KEY?.trim()
  if (!pk || !sk) throw new PaymentsProblem("Payments are not switched on yet.", 503)
  const pkMode = stripeKeyMode(pk)
  const skMode = stripeKeyMode(sk)
  if (pkMode !== "unknown" && skMode !== "unknown" && pkMode !== skMode) {
    throw new PaymentsProblem("Payments are not switched on correctly. Nothing was opened.", 503)
  }
  return pk
}

export async function createStripeAccountSession(creatorId: string, purpose: StripeAccountSessionPurpose, known?: Stripe.Account | null): Promise<{ clientSecret: string; publishableKey: string }> {
  const publishableKey = publishableKeyForSession()
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start setup first.")

  let account: Stripe.Account
  if (known && known.id === row.stripe_account_id) {
    account = known
  } else {
    try {
      account = await stripe.accounts.retrieve(row.stripe_account_id)
    } catch (error) {
      if (!accountIsGone(error)) {
        console.error("[stripe connect] session account check", stripeErrorMessage(error).slice(0, 160))
        throw new PaymentsProblem("We couldn't load payments right now. Try again in a moment.", 502)
      }
      await releaseConnectedAccount(creatorId, row.stripe_account_id, "legacy_platform")
      throw new PaymentsProblem("Your payments need to be set up again. Close this and choose Reconnect payments. Your orders and payout history are safe.", 409)
    }
  }
  /*
   * The embedded ID check must not open on "individual or company". Setup
   * never asks that. An account with no type yet is a person, which is how
   * every new account is made. A company account is left as it is.
   */
  if ((purpose === "onboarding" || purpose === "management") && !account.business_type) {
    try {
      account = await stripe.accounts.update(account.id, { business_type: "individual" })
    } catch (error) {
      console.error("[stripe connect] business type", stripeErrorMessage(error).slice(0, 160))
    }
  }
  const components = accountSessionComponents(purpose, runsInStorelib(account))
  const session = await stripe.accountSessions.create({ account: row.stripe_account_id, components })
  if (!session.client_secret) throw new PaymentsProblem("We couldn't load payments right now. Try again in a moment.", 502)
  return { clientSecret: session.client_secret, publishableKey }
}

export async function beginStripeOnboarding(
  creator: PaymentsCreatorRef,
  input: { kind: string; country: string; firstName: string; lastName: string; businessName?: string },
) {
  const parsed = parsePersonal(input)
  if (!parsed.ok) throw new PaymentsProblem(parsed.error)
  const profile = parsed.value
  const accountId = await ensureStripeAccount(creator, { kind: profile.kind, country: profile.country })
  const row = await readCreatorStripe(creator.id)
  const person = await profileForCreator(creator.userId)
  const email = ownerAddress(person?.email || creator.email) || undefined
  /*
   * The same profile the account was made with (lib/payments/stripe/business-profile):
   * the creator's store, the digital goods category and what really happens there.
   * This used to be rewritten here with the bio as the description and no
   * category, so Stripe's form came back asking what the business does and
   * which industry it is in, the very questions a creator should never see.
   */
  const businessProfile = creatorBusinessProfile({ username: row?.username, displayName: row?.display_name, platformUrl: platformBusinessUrl() })
  try {
    await stripe.accounts.update(
      accountId,
      profile.kind === "business"
        ? {
            business_type: "company",
            email,
            company: { name: profile.businessName ?? undefined },
            business_profile: businessProfile,
          }
        : {
            business_type: "individual",
            email,
            individual: { first_name: profile.firstName, last_name: profile.lastName, email },
            business_profile: businessProfile,
          },
    )
    if (profile.kind === "business") {
      await upsertRepresentative(accountId, { first_name: profile.firstName, last_name: profile.lastName, email }, {})
    }
  } catch (error) {
    console.error("[stripe connect] prefill name", stripeErrorMessage(error).slice(0, 160))
  }
  await syncStripeAccount(creator.id, "creator")
}

/**
 * The one person Storelib adds to a business account: the representative who
 * runs it (Stripe keeps a company's people apart from the account itself).
 */
export async function upsertRepresentative(
  accountId: string,
  person: Stripe.AccountUpdatePersonParams,
  relationship: Stripe.AccountUpdatePersonParams.Relationship,
): Promise<Stripe.Person> {
  const found = await representativeOf(accountId)
  const params = { ...person, relationship: { representative: true, executive: true, ...relationship } }
  return found ? stripe.accounts.updatePerson(accountId, found.id, params) : stripe.accounts.createPerson(accountId, params as Stripe.AccountCreatePersonParams)
}

export async function representativeOf(accountId: string): Promise<Stripe.Person | null> {
  return (await stripe.accounts.listPersons(accountId, { relationship: { representative: true }, limit: 1 })).data[0] ?? null
}

export type PayoutFacts = { accountName: string; currency: string | null; country: string | null; holderType: "individual" | "company"; inStorelib: boolean }

export async function payoutFacts(accountId: string): Promise<PayoutFacts | null> {
  try {
    return payoutFactsOf(await stripe.accounts.retrieve(accountId))
  } catch {
    return null
  }
}

export function payoutFactsOf(account: Stripe.Account): PayoutFacts {
  const person = [account.individual?.first_name, account.individual?.last_name].filter(Boolean).join(" ").trim()
  const company = account.company?.name?.trim() || ""
  const accountName = account.business_type === "company" ? company || person : person || company
  return {
    accountName,
    currency: account.default_currency ? account.default_currency.toUpperCase() : null,
    country: account.country ? account.country.toUpperCase() : null,
    holderType: account.business_type === "company" ? "company" : "individual",
    inStorelib: runsInStorelib(account),
  }
}

/**
 * A bank token made by Stripe.js in the creator's browser. The account
 * number goes from the browser to Stripe; Storelib only ever holds the token.
 * The new account becomes the default and older bank accounts are removed.
 */
/**
 * ===========================================================================
 *  DISCONNECT / START OVER, SAFELY
 * ===========================================================================
 * This decided from the cached flags on the creator's row, so an account from
 * the old Stripe platform whose row still said "payments on" could never be
 * disconnected ("Payments are already on"): the one way out of a dead
 * connection was refused. It asks Stripe now, and what it does depends on
 * what the account really is:
 *
 *   GONE FROM THIS PLATFORM   released, nothing to ask (it cannot be read,
 *                             let alone deleted, from here).
 *   NEVER STARTED             deleted on Stripe and released, as before:
 *                             nothing was ever sent on it.
 *   STARTED OR ACTIVE         only with `confirmed`, the creator's explicit
 *                             yes, and never while money is still in it:
 *                             released, but NOT deleted, because an account
 *                             with history holds payouts, tax records and any
 *                             dispute still to come. A balance left behind
 *                             would be money Storelib's Cash out could no
 *                             longer reach, so that is refused with what to do.
 *
 * Orders, payouts, refunds and the ledger are untouched in every case: each
 * keeps the Stripe ids it was written with. The old account id is kept on the
 * row (part 79), and stripe_connected_at stays, so setting up again reads as
 * Reconnect.
 */
export async function disconnectStripeAccount(creatorId: string, options: { confirmed?: boolean } = {}): Promise<void> {
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) return
  const accountId = row.stripe_account_id

  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve(accountId)
  } catch (error) {
    if (accountIsGone(error)) {
      await releaseConnectedAccount(creatorId, accountId, "legacy_platform")
      return
    }
    console.error("[stripe connect] disconnect check", stripeErrorMessage(error).slice(0, 160))
    throw new PaymentsProblem("We could not reach our payment partner just now. Nothing was changed. Try again in a moment.", 502)
  }

  const started = !!(account.details_submitted || account.charges_enabled || account.payouts_enabled)
  if (!started) {
    await stripe.accounts.del(accountId).catch((error) => {
      console.error("[stripe connect] disconnect delete", stripeErrorMessage(error).slice(0, 160))
    })
    await releaseConnectedAccount(creatorId, accountId, "creator_disconnect")
    return
  }

  if (!options.confirmed) {
    throw new PaymentsProblem("This turns off payments for your store until you set them up again. Confirm to disconnect.", 409)
  }
  const balance = await stripe.balance.retrieve({ stripeAccount: accountId }).catch((error: unknown) => {
    console.error("[stripe connect] disconnect balance", stripeErrorMessage(error).slice(0, 160))
    throw new PaymentsProblem("We couldn't check your balance just now. Nothing was changed. Try again in a moment.", 502)
  })
  const held = [...(balance.available ?? []), ...(balance.pending ?? [])].some((b) => b.amount !== 0)
  if (held) {
    throw new PaymentsProblem("You still have money in this payments account. Cash out your balance first, then you can disconnect.", 409)
  }
  await releaseConnectedAccount(creatorId, accountId, "creator_disconnect")
}

/** The older name, kept for any caller still using it: the same safe disconnect. */
export const disconnectIncompleteStripeAccount = (creatorId: string) => disconnectStripeAccount(creatorId)

export async function resolveCountryForStart(creator: PaymentsCreatorRef, countryInput: string): Promise<string> {
  const fromForm = countryInput.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(fromForm)) return fromForm
  const profile = await profileForCreator(creator.userId)
  const named = countryCode(profile?.country)
  if (named) return named
  /* A blank profile must not become a US account. The platform country is Romania. */
  return platformCountry().catch(() => "RO")
}

export { STRIPE_REQUESTED_CAPABILITIES }
