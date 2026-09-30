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
import {
  detailsIssues,
  detailsPlan,
  dobParts,
  normalPhone,
  requirementLabel,
  unknownRequirements,
  type DetailField,
  type DetailsInput,
  type StripeVerificationView,
} from "./details-fields"
import { stripeErrorMessage } from "./setup-errors"

const NOT_IN_STORELIB = "Verification can't open in Storelib right now. Nothing was sent. Try again later."

function dueOf(account: Stripe.Account): string[] {
  const r = account.requirements
  return [...new Set([...(r?.past_due ?? []), ...(r?.currently_due ?? [])])]
}

function kindOf(account: Stripe.Account): "individual" | "business" {
  return account.business_type === "company" ? "business" : "individual"
}

/** Person ids out of a requirement code, for a log line. */
function codeForLog(key: string): string {
  return key.replace(/^person_[A-Za-z0-9]+\./, "person.")
}

function documentProblem(account: Stripe.Account): string | null {
  const errors = account.requirements?.errors ?? []
  const doc = errors.find((e) => /verification\.(additional_)?document/.test(e.requirement))
  const code = doc?.code ?? account.individual?.verification?.document?.details_code ?? null
  if (!code) return errors.some((e) => /^(individual|representative|person_[A-Za-z0-9]+)\.(dob|id_number|address)/.test(e.requirement)) ? "Some details did not match your ID. Check them and try again." : null
  if (/expired/.test(code)) return "That ID has expired. Upload one that is still valid."
  if (/too_large|failed_greyscale|unreadable|not_readable|corrupt|failed_copy|photo|image/.test(code)) return "We could not read that photo. Upload a clear, full photo of the ID."
  if (/name_mismatch|dob_mismatch|mismatch/.test(code)) return "The name or birth date on the ID did not match. Check your details."
  if (/unsupported|type/.test(code)) return "That kind of document is not accepted. Use a passport, ID card or driving licence."
  return "That document was not accepted. Upload a clear photo of a valid ID."
}

export function verificationView(account: Stripe.Account): StripeVerificationView | null {
  if (!runsInStorelib(account)) return null
  const kind = kindOf(account)
  const due = dueOf(account)
  const plan = detailsPlan(due, kind)
  const unknown = unknownRequirements(due, kind)
  if (unknown.length > 0) console.warn("[stripe verification] no Storelib field for", unknown.map(codeForLog).join(",").slice(0, 300))
  const waiting = (account.requirements?.pending_verification ?? []).length > 0
  return {
    kind,
    ...plan,
    otherLabels: [...new Set(unknown.map(requirementLabel))].slice(0, 4),
    pending: waiting && plan.fields.length === 0 && !plan.document && !plan.other,
    agreement: account.tos_acceptance?.service_agreement === "recipient" ? "recipient" : "full",
    country: (account.country ?? "").toUpperCase(),
    problem: documentProblem(account),
    prefill: {
      firstName: kind === "individual" ? account.individual?.first_name ?? "" : "",
      lastName: kind === "individual" ? account.individual?.last_name ?? "" : "",
      companyName: account.company?.name ?? "",
    },
  }
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
  if (/tax_id/.test(param)) return "That tax ID was not accepted. Check it and try again."
  if (/registration_number/.test(param)) return "That registration number was not accepted."
  if (/first_name|last_name|name/.test(param)) return "That name was not accepted. Use the name on the ID."
  if (/nationality/.test(param)) return "That nationality was not accepted."
  return "Those details were not accepted. Check them and try again."
}

function addressOf(line1?: string, line2?: string, city?: string, postalCode?: string, state?: string, country?: string): Stripe.AddressParam {
  return {
    line1: (line1 ?? "").trim(),
    line2: line2?.trim() || undefined,
    city: (city ?? "").trim(),
    postal_code: (postalCode ?? "").trim(),
    state: state?.trim() || undefined,
    country,
  }
}

/** The person's details, the same for an individual account and a business's representative. */
function personOf(input: DetailsInput, fields: DetailField[], country: string): Stripe.AccountUpdatePersonParams {
  const person: Stripe.AccountUpdatePersonParams = {}
  if (fields.includes("name")) {
    person.first_name = (input.firstName ?? "").trim()
    person.last_name = (input.lastName ?? "").trim()
  }
  const dob = fields.includes("dob") ? dobParts(input.dob ?? "") : null
  if (dob) person.dob = dob
  if (fields.includes("nationality")) person.nationality = (input.nationality ?? "").trim().toUpperCase()
  if (fields.includes("address")) person.address = addressOf(input.line1, input.line2, input.city, input.postalCode, input.state, country)
  if (fields.includes("phone")) person.phone = normalPhone(input.phone ?? "")
  if (fields.includes("idNumber")) person.id_number = (input.idNumber ?? "").replace(/[\s-]/g, "")
  if (fields.includes("ssnLast4")) person.ssn_last_4 = (input.ssnLast4 ?? "").trim()
  if (fields.includes("pep")) person.political_exposure = input.pep === "existing" ? "existing" : "none"
  return person
}

/**
 * The creator's own identity details, sent straight to Stripe. Storelib keeps
 * none of them. On a business, the company's details go on the account and
 * the creator's own go on its representative. `update` edits the address and
 * phone after setup.
 */
export async function submitStripeDetails(
  creator: PaymentsCreatorRef,
  input: DetailsInput,
  consent: { ip: string | null; userAgent: string | null },
  mode: "setup" | "update" = "setup",
) {
  const account = await storelibAccount(creator)
  const kind = kindOf(account)
  const plan = detailsPlan(dueOf(account), kind)
  const fields: DetailField[] = mode === "update" ? ["address", "phone"] : plan.fields
  if (fields.length === 0) return
  const country = (account.country ?? "").toUpperCase()
  const issues = detailsIssues(input, fields, country)
  const first = Object.values(issues)[0]
  if (first) throw new PaymentsProblem(first)

  const person = personOf(input, fields, country)
  const params: Stripe.AccountUpdateParams = {}

  if (mode === "update") {
    if (kind === "business") params.company = { address: person.address, phone: person.phone }
    else params.individual = { address: person.address, phone: person.phone }
  } else if (kind === "individual") {
    if (Object.keys(person).length > 0) params.individual = person as Stripe.AccountUpdateParams.Individual
  } else {
    const company: Stripe.AccountUpdateParams.Company = {}
    if (fields.includes("companyName")) company.name = (input.companyName ?? "").trim()
    if (fields.includes("companyAddress")) {
      company.address = addressOf(input.companyLine1, input.companyLine2, input.companyCity, input.companyPostalCode, input.companyState, country)
    }
    if (fields.includes("companyPhone")) company.phone = normalPhone(input.companyPhone ?? "")
    if (fields.includes("taxId")) company.tax_id = (input.taxId ?? "").replace(/[\s.-]/g, "")
    if (fields.includes("registrationNumber")) company.registration_number = (input.registrationNumber ?? "").trim()
    if (fields.includes("owners")) {
      company.owners_provided = true
      company.directors_provided = true
      company.executives_provided = true
    }
    if (Object.keys(company).length > 0) params.company = company

    const relationship: Stripe.AccountUpdatePersonParams.Relationship = {}
    if (fields.includes("title")) relationship.title = (input.title ?? "").trim().slice(0, 80)
    if (fields.includes("owners")) Object.assign(relationship, { owner: true, director: true, percent_ownership: 100 })
    if (Object.keys(person).length > 0 || Object.keys(relationship).length > 0) {
      const profile = await profileForCreator(creator.userId)
      const email = ownerAddress(profile?.email || creator.email) || undefined
      try {
        await upsertRepresentative(account.id, { ...person, email }, relationship)
      } catch (error) {
        console.error("[stripe verification] representative", `param=${(error as { param?: string })?.param ?? ""}`)
        throw new PaymentsProblem(detailsProblem(error))
      }
    }
  }
  if (fields.includes("tos")) {
    if (!consent.ip) throw new PaymentsProblem("We could not record your agreement. Refresh the page and try again.")
    params.tos_acceptance = { date: Math.floor(Date.now() / 1000), ip: consent.ip, user_agent: consent.userAgent?.slice(0, 400) || undefined }
  }

  if (Object.keys(params).length > 0) {
    try {
      await stripe.accounts.update(account.id, params)
    } catch (error) {
      console.error("[stripe verification] details", `param=${(error as { param?: string })?.param ?? ""}`)
      throw new PaymentsProblem(detailsProblem(error))
    }
  }
  await syncStripeAccount(creator.id, "creator")
}

const DOCUMENT_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])
const DOCUMENT_MAX = 10 * 1024 * 1024

/**
 * A photo of the creator's ID (or the company's papers) goes from this
 * request to Stripe's Files API, on the creator's own account. Nothing is
 * written to Storelib's storage or logs.
 */
export async function uploadStripeDocument(creator: PaymentsCreatorRef, file: File | null, side: "front" | "back") {
  if (!file || typeof file.arrayBuffer !== "function") throw new PaymentsProblem("Choose a photo of your ID.")
  if (!DOCUMENT_TYPES.has(file.type)) throw new PaymentsProblem("Use a JPG, PNG or PDF.")
  if (file.size > DOCUMENT_MAX) throw new PaymentsProblem("That file is over 10 MB. Use a smaller photo.")
  if (file.size < 1024) throw new PaymentsProblem("That file looks empty. Try another photo.")

  const account = await storelibAccount(creator)
  const kind = kindOf(account)
  const need = detailsPlan(dueOf(account), kind).document ?? "identity"

  let fileId: string
  try {
    const uploaded = await stripe.files.create(
      {
        purpose: need === "identity" ? "identity_document" : "additional_verification",
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
    if (need === "company") {
      await stripe.accounts.update(account.id, { company: { verification: { document: { [side]: fileId } } } })
    } else if (kind === "business") {
      const rep = await representativeOf(account.id)
      if (!rep) throw new PaymentsProblem("Add your details first, then the photo.")
      await stripe.accounts.updatePerson(account.id, rep.id, { verification: { [slot]: { [side]: fileId } } })
    } else {
      await stripe.accounts.update(account.id, { individual: { verification: { [slot]: { [side]: fileId } } } })
    }
  } catch (error) {
    if (error instanceof PaymentsProblem) throw error
    console.error("[stripe verification] attach document", `param=${(error as { param?: string })?.param ?? ""}`)
    throw new PaymentsProblem("That photo could not be added. Try again.")
  }
  await syncStripeAccount(creator.id, "creator")
}

