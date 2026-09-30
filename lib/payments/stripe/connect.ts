import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { countryCode } from "@/lib/checkout/countries"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"
import { paymentsSetupErrorMessage, stripeErrorMessage } from "./setup-errors"
import { parsePayoutProfile, type PayoutProfileInput } from "./payout-profile"
import { parsePersonal } from "./onboarding-steps"
import { STRIPE_REQUESTED_CAPABILITIES } from "./config"
import { mergeStripeAccount, type StripeCreatorSnapshot } from "./facts"
import { PaymentsProblem } from "../errors"

export interface PaymentsCreatorRef {
  id: string
  userId: string
  email: string | null
}
import type { PayoutDestination } from "../store"

export type StripeAccountSessionPurpose = "onboarding" | "management" | "payouts" | "balances"

export async function readCreatorStripe(creatorId: string) {
  const { data, error } = await createAdminClient()
    .from("creators")
    .select(
      "id, user_id, username, display_name, bio, stripe_account_id, stripe_onboarding_status, charges_enabled, payouts_enabled, details_submitted, stripe_requirements, stripe_requirements_updated_at, stripe_connected_at",
    )
    .eq("id", creatorId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as {
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
  } | null
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
function accountIsGone(error: unknown): boolean {
  const e = error as { type?: string; code?: string; statusCode?: number } | null
  if (!e) return false
  if (e.type === "StripePermissionError") return true
  return e.type === "StripeInvalidRequestError" && (e.code === "resource_missing" || e.code === "account_invalid" || e.statusCode === 404)
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
    business_profile: {
      url: platformBusinessUrl(),
      mcc: "5818",
      product_description: row.bio?.slice(0, 200) || "Digital products and services on Storelib",
    },
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

  const storelibAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [{ ...recipient, controller: inStorelib }]
    : [{ ...merchant, controller: inStorelib }, { ...recipient, controller: inStorelib }]
  const expressAttempts: Stripe.AccountCreateParams[] = crossBorder
    ? [
        { ...recipient, controller: acknowledged },
        { ...recipient, controller: expressDefault },
        { ...recipient, type: "express" },
      ]
    : [
        { ...merchant, controller: acknowledged },
        { ...merchant, type: "express" },
        { ...recipient, controller: acknowledged },
        { ...recipient, type: "express" },
      ]
  const attempts = options.storelibOnly ? storelibAttempts : [...storelibAttempts, ...expressAttempts]

  let last: unknown
  for (const params of attempts) {
    try {
      return await stripe.accounts.create(params)
    } catch (error) {
      last = error
      const msg = stripeErrorMessage(error)
      console.error("[stripe connect] create attempt", msg.replace(/\s+/g, " ").slice(0, 180))
      if (/account has been rejected|invalid email/i.test(msg)) throw error
    }
  }
  throw last
}

export async function syncStripeAccount(creatorId: string, actor: "webhook" | "creator" | "system"): Promise<StripeCreatorSnapshot> {
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) {
    return mergeStripeAccount(
      { accountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, disabledReason: null, currentlyDue: [], pastDue: [], pendingVerification: [], hasExternalAccount: false, accountKind: null },
      {},
      false,
    )
  }

  const accountId = row.stripe_account_id
  const [account, external] = await Promise.all([
    stripe.accounts.retrieve(accountId),
    stripe.accounts.listExternalAccounts(accountId, { object: "bank_account", limit: 1 }).catch(() => ({ data: [] })),
  ])

  await enforceManualPayouts(accountId, account)

  const chargesEnabled = !!account.charges_enabled
  const payoutsEnabled = !!account.payouts_enabled
  const detailsSubmitted = !!account.details_submitted
  const connected = chargesEnabled && payoutsEnabled && detailsSubmitted
  const status = connected ? "connected" : "pending"
  const requirements = (account.requirements ?? {}) as Stripe.Account.Requirements
  const due = [...new Set([...(requirements.past_due ?? []), ...(requirements.currently_due ?? [])])].sort()

  const admin = createAdminClient()
  await admin
    .from("creators")
    .update({
      stripe_onboarding_status: status,
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
      stripe_connected_at: connected ? row.stripe_connected_at ?? new Date().toISOString() : null,
      stripe_requirements: due,
      stripe_requirements_due_at: requirements.current_deadline ? new Date(requirements.current_deadline * 1000).toISOString() : null,
      stripe_requirements_updated_at: new Date().toISOString(),
    })
    .eq("id", creatorId)

  const hasBank = external.data.length > 0
  return mergeStripeAccount(
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
      disabled_reason: (account as { disabled_reason?: string | null }).disabled_reason ?? null,
      business_type: account.business_type,
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

export async function createStripeAccountSession(creatorId: string, purpose: StripeAccountSessionPurpose): Promise<{ clientSecret: string; publishableKey: string }> {
  const publishableKey = publishableKeyForSession()
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start setup first.")

  const account = await stripe.accounts.retrieve(row.stripe_account_id)
  /* Storelib's own bank form adds the payout account, so the embedded forms
     never open Stripe's sign-in window. Express accounts cannot turn it off. */
  const features = runsInStorelib(account)
    ? { external_account_collection: false, disable_stripe_user_authentication: true }
    : { external_account_collection: true }

  const components: Stripe.AccountSessionCreateParams.Components = {}
  if (purpose === "onboarding") {
    components.account_onboarding = { enabled: true, features }
  } else if (purpose === "management") {
    components.account_management = { enabled: true, features }
    components.account_onboarding = { enabled: true, features }
  } else if (purpose === "payouts") {
    components.payouts = { enabled: true, features: { ...features, instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } }
    components.balances = { enabled: true, features: { ...features, instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } }
  } else {
    components.balances = { enabled: true, features: { ...features, instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } }
  }

  const session = await stripe.accountSessions.create({
    account: row.stripe_account_id,
    components,
  })
  if (!session.client_secret) throw new PaymentsProblem("Could not open verification just now. Try again.", 502)
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
  const handle = row?.username && /^[A-Za-z0-9._-]{2,64}$/.test(row.username) ? row.username : ""
  const businessProfile = {
    url: handle ? `${platformBusinessUrl()}/${handle}` : platformBusinessUrl(),
    product_description: row?.bio?.trim().slice(0, 200) || "Digital products and services on Storelib",
  }
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
export async function attachStripeBank(creator: PaymentsCreatorRef, token: string) {
  if (!/^btok_[A-Za-z0-9]{6,}$/.test(token)) throw new PaymentsProblem("The bank details did not come through. Try again.")
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start setup first.")
  const accountId = row.stripe_account_id

  let added: Stripe.ExternalAccount
  try {
    added = await stripe.accounts.createExternalAccount(accountId, { external_account: token, default_for_currency: true })
  } catch (error) {
    console.error("[stripe connect] bank", stripeErrorMessage(error).replace(/[A-Z]{2}\d{2}[A-Z0-9]{10,}/gi, "[iban]").slice(0, 180))
    throw new PaymentsProblem(bankProblem(error))
  }

  try {
    const existing = await stripe.accounts.listExternalAccounts(accountId, { object: "bank_account", limit: 20 })
    for (const old of existing.data) {
      if (old.id === added.id) continue
      await stripe.accounts.deleteExternalAccount(accountId, old.id).catch(() => undefined)
    }
  } catch (error) {
    console.error("[stripe connect] old bank cleanup", stripeErrorMessage(error).slice(0, 160))
  }

  await syncStripeAccount(creator.id, "creator")
}

export async function submitStripePayoutProfile(creator: PaymentsCreatorRef, input: PayoutProfileInput) {
  const parsed = parsePayoutProfile(input)
  if (!parsed.ok) throw new PaymentsProblem(parsed.error)
  const profile = parsed.value
  const accountId = await ensureStripeAccount(creator, { kind: profile.kind, country: profile.country })

  const address = {
    line1: profile.address,
    city: profile.city,
    postal_code: profile.postalCode,
    country: profile.country,
  }
  const person = {
    first_name: profile.firstName,
    last_name: profile.lastName,
    email: ownerAddress((await profileForCreator(creator.userId))?.email || creator.email) || undefined,
    phone: profile.phone,
    dob: profile.dob,
    address,
  }
  try {
    if (profile.kind === "business") {
      await stripe.accounts.update(accountId, { business_type: "company", company: { name: profile.businessName ?? undefined, phone: profile.phone, address } })
      await upsertRepresentative(accountId, person, {})
    } else {
      await stripe.accounts.update(accountId, { business_type: "individual", individual: person })
    }
  } catch (error) {
    console.error("[stripe connect] prefill", stripeErrorMessage(error).slice(0, 180))
  }

  if (profile.externalAccount) {
    try {
      await stripe.accounts.createExternalAccount(accountId, { external_account: profile.externalAccount })
    } catch (error) {
      const msg = stripeErrorMessage(error)
      if (!/already has|already exists/i.test(msg)) {
        console.error("[stripe connect] bank", msg.replace(/[A-Z]{2}\d{2}[A-Z0-9]{10,}/gi, "[iban]").slice(0, 180))
        throw new PaymentsProblem(bankProblem(error))
      }
    }
  }

  const snapshot = await syncStripeAccount(creator.id, "creator")
  const needsVerification =
    profile.format === "stripe" ||
    !snapshot.detailsSubmitted ||
    snapshot.currentlyDue.some((field) => /document|verification|tos|external_account/i.test(field)) ||
    snapshot.pastDue.length > 0
  const { stripeOverview } = await import("./overview")
  return { overview: await stripeOverview({ id: creator.id, userId: creator.userId, email: creator.email }), needsVerification }
}

function bankProblem(error: unknown): string {
  const msg = stripeErrorMessage(error)
  if (/iban|account number|routing|bsb/i.test(msg)) return "That bank account was not accepted. Check the number and that the name matches the account."
  if (/currency/i.test(msg)) return "Payouts in that currency are not available for this country yet."
  return paymentsSetupErrorMessage(error)
}

export async function disconnectIncompleteStripeAccount(creatorId: string) {
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) return
  if (row.charges_enabled) throw new PaymentsProblem("Payments are already on, so this account stays connected.")
  try {
    await stripe.accounts.del(row.stripe_account_id)
  } catch (error) {
    console.error("[stripe connect] disconnect", stripeErrorMessage(error).slice(0, 160))
  }
  const admin = createAdminClient()
  await admin
    .from("creators")
    .update({
      stripe_account_id: null,
      stripe_onboarding_status: "not_connected",
      stripe_connected_at: null,
      charges_enabled: false,
      payouts_enabled: false,
      details_submitted: false,
      stripe_requirements: [],
      stripe_requirements_due_at: null,
      stripe_requirements_updated_at: new Date().toISOString(),
    })
    .eq("id", creatorId)
}

export async function resolveCountryForStart(creator: PaymentsCreatorRef, countryInput: string): Promise<string> {
  const fromForm = countryInput.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(fromForm)) return fromForm
  const profile = await profileForCreator(creator.userId)
  return countryCode(profile?.country) ?? "US"
}

export { STRIPE_REQUESTED_CAPABILITIES }
