import "server-only"

import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { PaymentsProblem } from "../errors"
import {
  ensureStripeAccount,
  platformBusinessUrl,
  profileForCreator,
  readCreatorStripe,
  representativeOf,
  runsInStorelib,
  syncStripeAccount,
  upsertRepresentative,
  type PaymentsCreatorRef,
} from "./connect"
import { stripeErrorMessage } from "./setup-errors"

/**
 * Everything the creator is asked for after the Account step is asked by
 * Stripe's embedded onboarding inside Storelib. This file only prepares the
 * account for it: it answers what Storelib already knows, and makes sure the
 * account is one Storelib runs so Stripe never opens its own sign-in window.
 */

const NOT_IN_STORELIB = "Payments can't open in Storelib right now. Nothing was sent. Try again later."

function dueOf(account: Stripe.Account): string[] {
  const r = account.requirements
  return [...new Set([...(r?.past_due ?? []), ...(r?.currently_due ?? [])])]
}

function kindOf(account: Stripe.Account): "individual" | "business" {
  return account.business_type === "company" ? "business" : "individual"
}

/** Letters, digits and spaces, 5 to 22 long, with a letter: what card statements accept. */
export function statementDescriptorFor(handle: string | null | undefined): string {
  const tail = (handle ?? "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim()
  return `STORELIB${tail ? ` ${tail}` : ""}`.slice(0, 22).trim()
}

/**
 * What Storelib answers for the creator without asking: the store's web
 * address and what it sells, how charges read on a statement, and the
 * account's email and legal name from the profile when Stripe still lacks them.
 */
async function settleServerSide(creator: PaymentsCreatorRef, account: Stripe.Account): Promise<Stripe.Account> {
  const due = dueOf(account)
  const needs = (re: RegExp) => due.some((k) => re.test(k))
  const params: Stripe.AccountUpdateParams = {}
  const row = needs(/^(business_profile\.|settings\.)/) ? await readCreatorStripe(creator.id) : null
  if (needs(/^business_profile\./)) {
    const handle = row?.username && /^[A-Za-z0-9._-]{2,64}$/.test(row.username) ? row.username : ""
    params.business_profile = {
      url: handle ? `${platformBusinessUrl()}/${handle}` : platformBusinessUrl(),
      mcc: "5818",
      product_description: row?.bio?.trim().slice(0, 200) || "Digital products and services on Storelib",
    }
  }
  if (needs(/^settings\.(payments\.statement_descriptor|card_payments\.statement_descriptor_prefix)$/)) {
    params.settings = {
      payments: { statement_descriptor: statementDescriptorFor(row?.username) },
      card_payments: { statement_descriptor_prefix: "STORELIB" },
    }
  }
  if (kindOf(account) === "individual" && needs(/^individual\.(first_name|last_name|email)$/)) {
    const profile = await profileForCreator(creator.userId)
    const email = ownerAddress(profile?.email || creator.email) || undefined
    const individual: Stripe.AccountUpdateParams.Individual = {}
    if (due.includes("individual.email") && email) individual.email = email
    if (due.includes("individual.first_name") && profile?.first_name?.trim()) individual.first_name = profile.first_name.trim()
    if (due.includes("individual.last_name") && profile?.last_name?.trim()) individual.last_name = profile.last_name.trim()
    if (Object.keys(individual).length > 0) params.individual = individual
  }
  if (Object.keys(params).length === 0) return account
  try {
    const updated = await stripe.accounts.update(account.id, params)
    await syncStripeAccount(creator.id, "system").catch(() => undefined)
    return updated
  } catch (error) {
    console.error("[stripe verification] settle", `param=${(error as { param?: string })?.param ?? ""}`)
    return account
  }
}

/**
 * Before any Stripe form or native step: an unfinished Express account would
 * make Stripe open its sign-in window, so it is swapped for one that Storelib
 * runs. If that cannot be done, nothing Stripe-hosted is opened at all.
 */
export async function prepareStorelibAccount(creator: PaymentsCreatorRef): Promise<Stripe.Account | null> {
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) return null
  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve(row.stripe_account_id)
  } catch (error) {
    console.error("[stripe verification] account check", stripeErrorMessage(error).slice(0, 160))
    throw new PaymentsProblem("We could not reach our payment partner just now. Nothing was changed. Try again in a moment.", 502)
  }
  if (runsInStorelib(account)) return settleServerSide(creator, account)

  const untouched = !account.details_submitted && !account.charges_enabled && !account.payouts_enabled
  if (untouched && account.country) {
    const kind = kindOf(account)
    const nextId = await ensureStripeAccount(creator, { kind, country: account.country })
    if (nextId !== account.id) {
      const before = account
      account = await stripe.accounts.retrieve(nextId)
      await carryNames(creator, before, account)
      await syncStripeAccount(creator.id, "creator").catch(() => undefined)
      account = await stripe.accounts.retrieve(nextId)
    }
  }
  if (!runsInStorelib(account)) {
    console.error("[stripe verification] account is still Stripe-hosted; the platform profile must allow Storelib to collect requirements")
    throw new PaymentsProblem(NOT_IN_STORELIB, 409)
  }
  return settleServerSide(creator, account)
}

async function carryNames(creator: PaymentsCreatorRef, from: Stripe.Account, to: Stripe.Account) {
  const first = from.individual?.first_name ?? undefined
  const last = from.individual?.last_name ?? undefined
  const email = ownerAddress((await profileForCreator(creator.userId))?.email || creator.email) || undefined
  try {
    if (to.business_type === "company") {
      await stripe.accounts.update(to.id, { email, company: from.company?.name ? { name: from.company.name } : undefined })
      const rep = await representativeOf(from.id).catch(() => null)
      if (rep?.first_name || rep?.last_name) await upsertRepresentative(to.id, { first_name: rep.first_name ?? undefined, last_name: rep.last_name ?? undefined, email }, {})
    } else {
      await stripe.accounts.update(to.id, { email, individual: first || last ? { first_name: first, last_name: last, email } : undefined })
    }
  } catch (error) {
    console.error("[stripe verification] carry names", stripeErrorMessage(error).slice(0, 160))
  }
}
