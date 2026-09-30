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
  runsInStorelib,
  syncStripeAccount,
  type PaymentsCreatorRef,
} from "./connect"
import { detailsIssues, detailsPlan, dobParts, normalPhone, type DetailField, type DetailsInput, type StripeVerificationView } from "./details-fields"
import { stripeErrorMessage } from "./setup-errors"

const NOT_IN_STORELIB = "Verification can't open in Storelib right now. Nothing was sent. Try again later."

function dueOf(account: Stripe.Account): string[] {
  const r = account.requirements
  return [...new Set([...(r?.past_due ?? []), ...(r?.currently_due ?? [])])]
}

function kindOf(account: Stripe.Account): "individual" | "business" {
  return account.business_type === "company" ? "business" : "individual"
}

function documentProblem(account: Stripe.Account): string | null {
  const errors = account.requirements?.errors ?? []
  const doc = errors.find((e) => /verification\.(additional_)?document/.test(e.requirement))
  const code = doc?.code ?? account.individual?.verification?.document?.details_code ?? null
  if (!code) return errors.some((e) => /^individual\.(dob|id_number|address)/.test(e.requirement)) ? "Some details did not match your ID. Check them and try again." : null
  if (/expired/.test(code)) return "That ID has expired. Upload one that is still valid."
  if (/too_large|failed_greyscale|unreadable|not_readable|corrupt|failed_copy|photo|image/.test(code)) return "We could not read that photo. Upload a clear, full photo of the ID."
  if (/name_mismatch|dob_mismatch|mismatch/.test(code)) return "The name or birth date on the ID did not match. Check your details."
  if (/unsupported|type/.test(code)) return "That kind of document is not accepted. Use a passport, ID card or driving licence."
  return "That document was not accepted. Upload a clear photo of a valid ID."
}

export function verificationView(account: Stripe.Account): StripeVerificationView | null {
  if (!runsInStorelib(account)) return null
  const plan = detailsPlan(dueOf(account), kindOf(account))
  const waiting = (account.requirements?.pending_verification ?? []).length > 0
  return {
    ...plan,
    pending: waiting && plan.fields.length === 0 && !plan.document && !plan.other,
    agreement: account.tos_acceptance?.service_agreement === "recipient" ? "recipient" : "full",
    country: (account.country ?? "").toUpperCase(),
    problem: documentProblem(account),
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
  if (runsInStorelib(account)) return account

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
  return account
}

async function carryNames(creator: PaymentsCreatorRef, from: Stripe.Account, to: Stripe.Account) {
  const first = from.individual?.first_name ?? undefined
  const last = from.individual?.last_name ?? undefined
  const email = ownerAddress((await profileForCreator(creator.userId))?.email || creator.email) || undefined
  try {
    await stripe.accounts.update(to.id, {
      email,
      individual: first || last ? { first_name: first, last_name: last, email } : undefined,
      company: from.business_type === "company" && from.company?.name ? { name: from.company.name } : undefined,
    })
  } catch (error) {
    console.error("[stripe verification] carry names", stripeErrorMessage(error).slice(0, 160))
  }
}

async function storelibAccount(creator: PaymentsCreatorRef): Promise<Stripe.Account> {
  const account = await prepareStorelibAccount(creator)
  if (!account) throw new PaymentsProblem("Start setup first.")
  return account
}

function detailsProblem(error: unknown): string {
  const e = error as { param?: string } | null
  const param = e?.param ?? ""
  const msg = stripeErrorMessage(error)
  if (/id_number|ssn/.test(param) || /id.?number|ssn/i.test(msg)) return "That ID number was not accepted. Check it and try again."
  if (/dob/.test(param)) return "That date of birth was not accepted."
  if (/phone/.test(param)) return "That phone number was not accepted. Include the country code."
  if (/address|postal/.test(param)) return "That address was not accepted. Check it and try again."
  return "Those details were not accepted. Check them and try again."
}

/**
 * The creator's own identity details, sent straight to Stripe. Storelib keeps
 * none of them. `update` edits the address and phone after setup.
 */
export async function submitStripeDetails(
  creator: PaymentsCreatorRef,
  input: DetailsInput,
  consent: { ip: string | null; userAgent: string | null },
  mode: "setup" | "update" = "setup",
) {
  const account = await storelibAccount(creator)
  const kind = kindOf(account)
  const due = dueOf(account)
  const plan = detailsPlan(due, kind)
  const fields: DetailField[] = mode === "update" ? ["address", "phone"] : plan.fields
  if (fields.length === 0 && !due.some((k) => /^(individual\.(first_name|last_name|email)|business_profile\.)/.test(k))) {
    return
  }
  const country = (account.country ?? "").toUpperCase()
  const issues = detailsIssues(input, fields, country)
  const first = Object.values(issues)[0]
  if (first) throw new PaymentsProblem(first)

  const params: Stripe.AccountUpdateParams = {}
  const address = fields.includes("address")
    ? {
        line1: input.line1!.trim(),
        line2: input.line2?.trim() || undefined,
        city: input.city!.trim(),
        postal_code: input.postalCode!.trim(),
        state: input.state?.trim() || undefined,
        country,
      }
    : undefined
  const phone = fields.includes("phone") ? normalPhone(input.phone ?? "") : undefined

  if (kind === "business" && mode === "update") {
    params.company = { address, phone }
  } else if (kind === "individual") {
    const individual: Stripe.AccountUpdateParams.Individual = {}
    const dob = fields.includes("dob") ? dobParts(input.dob ?? "") : null
    if (dob) individual.dob = dob
    if (address) individual.address = address
    if (phone) individual.phone = phone
    if (fields.includes("idNumber")) individual.id_number = (input.idNumber ?? "").replace(/[\s-]/g, "")
    if (fields.includes("ssnLast4")) individual.ssn_last_4 = (input.ssnLast4 ?? "").trim()
    if (fields.includes("pep")) individual.political_exposure = input.pep === "existing" ? "existing" : "none"
    if (due.some((k) => /^individual\.(first_name|last_name|email)$/.test(k))) {
      const profile = await profileForCreator(creator.userId)
      const email = ownerAddress(profile?.email || creator.email) || undefined
      if (due.includes("individual.email") && email) individual.email = email
      if (due.includes("individual.first_name") && profile?.first_name) individual.first_name = profile.first_name
      if (due.includes("individual.last_name") && profile?.last_name) individual.last_name = profile.last_name
    }
    if (Object.keys(individual).length > 0) params.individual = individual
  }
  if (due.some((k) => k.startsWith("business_profile."))) {
    params.business_profile = { url: platformBusinessUrl(), mcc: "5818", product_description: "Digital products and services on Storelib" }
  }
  if (fields.includes("tos")) {
    if (!consent.ip) throw new PaymentsProblem("We could not record your agreement. Refresh the page and try again.")
    params.tos_acceptance = { date: Math.floor(Date.now() / 1000), ip: consent.ip, user_agent: consent.userAgent?.slice(0, 400) || undefined }
  }

  try {
    await stripe.accounts.update(account.id, params)
  } catch (error) {
    console.error("[stripe verification] details", `param=${(error as { param?: string })?.param ?? ""}`)
    throw new PaymentsProblem(detailsProblem(error))
  }
  await syncStripeAccount(creator.id, "creator")
}

const DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])
const DOCUMENT_MAX = 10 * 1024 * 1024

/**
 * A photo of the creator's ID goes from this request to Stripe's Files API,
 * on the creator's own account. Nothing is written to Storelib's storage or logs.
 */
export async function uploadStripeDocument(creator: PaymentsCreatorRef, file: File | null, side: "front" | "back") {
  if (!file || typeof file.arrayBuffer !== "function") throw new PaymentsProblem("Choose a photo of your ID.")
  if (!DOCUMENT_TYPES.has(file.type)) throw new PaymentsProblem("Use a JPG, PNG or PDF.")
  if (file.size > DOCUMENT_MAX) throw new PaymentsProblem("That file is over 10 MB. Use a smaller photo.")
  if (file.size < 1024) throw new PaymentsProblem("That file looks empty. Try another photo.")

  const account = await storelibAccount(creator)
  if (kindOf(account) !== "individual") throw new PaymentsProblem("This upload is for personal accounts.")
  const need = detailsPlan(dueOf(account), "individual").document ?? "identity"

  let fileId: string
  try {
    const uploaded = await stripe.files.create(
      {
        purpose: need === "address_proof" ? "additional_verification" : "identity_document",
        file: { data: Buffer.from(await file.arrayBuffer()), name: `${side}.${file.type === "application/pdf" ? "pdf" : file.type === "image/png" ? "png" : "jpg"}`, type: "application/octet-stream" },
      },
      { stripeAccount: account.id },
    )
    fileId = uploaded.id
  } catch (error) {
    console.error("[stripe verification] upload", stripeErrorMessage(error).replace(/file_[A-Za-z0-9]+/g, "[file]").slice(0, 140))
    throw new PaymentsProblem("That photo could not be uploaded. Try again.")
  }

  const slot = need === "address_proof" ? "additional_document" : "document"
  try {
    await stripe.accounts.update(account.id, { individual: { verification: { [slot]: { [side]: fileId } } } })
  } catch (error) {
    console.error("[stripe verification] attach document", `param=${(error as { param?: string })?.param ?? ""}`)
    throw new PaymentsProblem("That photo could not be added. Try again.")
  }
  await syncStripeAccount(creator.id, "creator")
}
