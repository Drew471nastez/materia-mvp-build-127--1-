import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { createAdminClient } from "@/lib/supabase/admin"
import { countryCode } from "@/lib/checkout/countries"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { logStripeRefusal, stripeRefusal } from "@/lib/stripe/refusal"
import { paymentsSetupErrorMessage, shouldRetryExpressAsController, stripeErrorMessage } from "./setup-errors"
import { STRIPE_REQUESTED_CAPABILITIES } from "./config"
import { mergeStripeAccount, type StripeCreatorSnapshot } from "./facts"
import { PaymentsProblem } from "../errors"

export interface PaymentsCreatorRef {
  id: string
  userId: string
  email: string | null
}
import type { PayoutDestination } from "../store"
import { toMinor } from "../money"

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

async function enforceManualPayouts(accountId: string) {
  try {
    const account = await stripe.accounts.retrieve(accountId)
    const schedule = (account as Stripe.Account).settings?.payouts?.schedule
    if (schedule?.interval !== "manual") {
      await stripe.accounts.update(accountId, { settings: { payouts: { schedule: { interval: "manual" } } } })
    }
  } catch {
    /* non-fatal */
  }
}

export async function ensureStripeAccount(
  creator: PaymentsCreatorRef,
  input: { kind: "individual" | "business"; country: string },
): Promise<string> {
  if (!process.env.STRIPE_SECRET_KEY) throw new PaymentsProblem("Payments are not switched on yet.", 503)

  const row = await readCreatorStripe(creator.id)
  if (!row) throw new PaymentsProblem("Creator profile not found.", 404)

  let accountId = row.stripe_account_id
  if (accountId) {
    try {
      await stripe.accounts.retrieve(accountId)
      return accountId
    } catch {
      accountId = null
    }
  }

  const profile = await profileForCreator(creator.userId)
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) throw new PaymentsProblem("Choose your country.")

  const businessType = input.kind === "business" ? "company" : "individual"
  const email = ownerAddress(profile?.email || creator.email) || undefined
  const first = profile?.first_name?.trim() || undefined
  const last = profile?.last_name?.trim() || undefined

  const shared: Stripe.AccountCreateParams = {
    country,
    email,
    business_type: businessType,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      url: platformBusinessUrl(),
      product_description: row.bio?.slice(0, 200) || "Digital products and services on Storelib",
    },
    individual: businessType === "individual" && first && last ? { first_name: first, last_name: last } : undefined,
    metadata: { storelib_creator_id: creator.id, storelib_username: row.username ?? "" },
  }

  try {
    const account = await createExpressAccount(shared)
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

function platformBusinessUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://storelib.com").trim()
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return "https://storelib.com"
    return u.origin
  } catch {
    return "https://storelib.com"
  }
}

async function createExpressAccount(shared: Stripe.AccountCreateParams): Promise<Stripe.Account> {
  try {
    return await stripe.accounts.create({ ...shared, type: "express" })
  } catch (first) {
    if (!shouldRetryExpressAsController(first)) throw first
    console.error("[stripe connect] express type refused, retrying with controller", stripeErrorMessage(first).slice(0, 180))
  }

  const controllers: Stripe.AccountCreateParams.Controller[] = [
    {
      stripe_dashboard: { type: "express" },
      fees: { payer: "account" },
      losses: { payments: "stripe" },
      requirement_collection: "stripe",
    },
    {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
      requirement_collection: "stripe",
    },
  ]

  let last: unknown
  for (const controller of controllers) {
    try {
      return await stripe.accounts.create({ ...shared, controller })
    } catch (error) {
      last = error
      if (!shouldRetryExpressAsController(error) && !/losses|fees|payer/i.test(stripeErrorMessage(error))) throw error
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

  await enforceManualPayouts(accountId)

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
    e.availableMinor += toMinor(b.amount, cur)
    byCurrency.set(cur, e)
  }
  for (const b of bal.pending ?? []) {
    const cur = (b.currency ?? "usd").toUpperCase()
    const e = byCurrency.get(cur) ?? { availableMinor: 0, pendingMinor: 0 }
    e.pendingMinor += toMinor(b.amount, cur)
    byCurrency.set(cur, e)
  }
  return [...byCurrency.entries()].map(([currency, v]) => ({ currency, ...v }))
}

export async function fetchStripePayouts(accountId: string) {
  const list = await stripe.payouts.list({ limit: 10 }, { stripeAccount: accountId })
  return list.data.map((p) => ({
    id: p.id,
    amountMinor: toMinor(p.amount, p.currency),
    currency: p.currency.toUpperCase(),
    status: p.status,
    createdAt: p.created ? new Date(p.created * 1000).toISOString() : null,
    arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
  }))
}

export async function createStripeAccountSession(creatorId: string, purpose: StripeAccountSessionPurpose): Promise<{ clientSecret: string }> {
  const row = await readCreatorStripe(creatorId)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start setup first.")

  const components: Stripe.AccountSessionCreateParams.Components = {}
  if (purpose === "onboarding") {
    components.account_onboarding = {
      enabled: true,
      features: { external_account_collection: true },
    }
  } else if (purpose === "management") {
    components.account_management = { enabled: true, features: { external_account_collection: true } }
    components.account_onboarding = {
      enabled: true,
      features: { external_account_collection: true },
    }
  } else if (purpose === "payouts") {
    components.payouts = { enabled: true }
    components.balances = { enabled: true }
  } else {
    components.balances = { enabled: true }
  }

  const session = await stripe.accountSessions.create({
    account: row.stripe_account_id,
    components,
  })
  if (!session.client_secret) throw new PaymentsProblem("Could not open verification just now. Try again.", 502)
  return { clientSecret: session.client_secret }
}

export async function resolveCountryForStart(creator: PaymentsCreatorRef, countryInput: string): Promise<string> {
  const fromForm = countryInput.trim().toUpperCase()
  if (/^[A-Z]{2}$/.test(fromForm)) return fromForm
  const profile = await profileForCreator(creator.userId)
  return countryCode(profile?.country) ?? "US"
}

export { STRIPE_REQUESTED_CAPABILITIES }
