import "server-only"

/**
 * ===========================================================================
 *  STORELIB'S OWN PAYOUT FORM, ON THE SERVER
 * ===========================================================================
 * The three things the form does, each straight to Stripe and nowhere else:
 *
 *   detailsForm     what this account still needs (own-form-rules needsOf),
 *                   the country, the ID number's name and the bank format.
 *                   No personal value is ever read back or returned.
 *   submitDetails   date of birth, address, phone, ID number, political
 *                   exposure and the ToS acceptance, written to the account.
 *   uploadDocument  an ID photo or proof of address: uploaded to Stripe as
 *                   the account's file and attached to the person in one
 *                   call, so the file id never leaves the server.
 *   addBank         the IBAN, or account and routing number, as the
 *                   account's payout bank for its currency.
 *
 * NOTHING IS KEPT. Not in a table, not in a log: errors are logged as
 * Stripe's code and a cut message with digits removed, and the creator is
 * told a plain sentence. Every call works on the account of the creator who
 * is signed in, read from their own row; no account id ever comes from the
 * browser.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { PaymentsProblem } from "../errors"
import { creatorBusinessProfile } from "./business-profile"
import { platformBusinessUrl, readCreatorStripe, runsInStorelib, syncStripeAccount, type PaymentsCreatorRef } from "./connect"
import { bankFormat, cleanIban, cleanPhone, detailIssues, ibanValid, idNumberName, needsOf, type BankFormat, type DetailField, type DetailsInput, type DetailsNeeds } from "./own-form-rules"
import { stripeErrorMessage } from "./setup-errors"

export interface DetailsFormView {
  needs: DetailsNeeds
  country: string
  /** The agreement the creator accepts: the full one, or the recipient one for a cross-border account. */
  agreementUrl: string
  /** When Stripe wants what it asked for, for a later ask. */
  dueBy: string | null
  /** Payments are already on: this is Stripe coming back for more, not first setup. */
  active: boolean
  idNumber: { label: string; hint: string }
  bank: BankFormat & { currency: string | null; holderName: string; last4: string | null }
}

/** Stripe's words with every run of digits taken out, for a log line that cannot carry an ID or bank number. */
function quiet(error: unknown): string {
  return stripeErrorMessage(error).replace(/\d{2,}/g, "#").replace(/\s+/g, " ").slice(0, 160)
}

/** What Stripe said, as a sentence a creator can act on. */
function sentence(error: unknown, fallback: string): string {
  const e = error as { code?: string; param?: string; type?: string }
  const param = e?.param ?? ""
  if (/id_number/.test(param)) return "Stripe did not accept that ID number. Check it against your document."
  if (/ssn_last_4/.test(param)) return "Stripe did not accept those four digits. Check them and try again."
  if (/dob/.test(param)) return "Stripe did not accept that date of birth. Check it and try again."
  if (/phone/.test(param)) return "Stripe did not accept that phone number. Include your country code."
  if (/address/.test(param)) return "Stripe did not accept that address. Check the street, city and postal code."
  if (/account_number|iban/i.test(param) || e?.code === "invalid_bank_account_iban") return "Stripe did not accept that bank account. Check the number and try again."
  if (/routing_number/.test(param)) return "Stripe did not accept that bank code. Check it and try again."
  if (e?.code === "file_too_large" || /file/.test(param)) return "That file could not be used. Try a clear photo, JPG or PNG, under 4 MB."
  return fallback
}

async function ownAccount(creator: PaymentsCreatorRef): Promise<Stripe.Account> {
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start with your country and name first.")
  let account: Stripe.Account
  try {
    account = await stripe.accounts.retrieve(row.stripe_account_id)
  } catch (error) {
    console.error("[payments own form] account read", quiet(error))
    throw new PaymentsProblem("We could not reach our payment partner just now. Try again in a moment.", 502)
  }
  if (!runsInStorelib(account)) throw new PaymentsProblem("This payments account is managed by Stripe. Disconnect it on Payouts and start again to use Storelib's setup.", 409)
  return account
}

/**
 * The form from an account already in hand. Every write below returns the
 * account it just changed, so the page is answered from that rather than
 * asking Stripe again: saving a step was five calls to Stripe and most of a
 * second of staring at "Saving".
 */
async function viewOf(creator: PaymentsCreatorRef, account: Stripe.Account): Promise<DetailsFormView> {
  const needs = needsOf(account.requirements as never)
  /*
   * THE ID CHECK IS OFFERED AS SOON AS STRIPE WILL EVER WANT IT. Asking only
   * for what is due today meant a new account was never shown the check at
   * all, and met it weeks later as an interruption. It is on the form from
   * the start, and is only required once Stripe actually requires it.
   */
  const eventually = account.requirements?.eventually_due ?? []
  const pending = new Set(account.requirements?.pending_verification ?? [])
  if (eventually.includes("individual.verification.document") && !pending.has("individual.verification.document") && !needs.fields.includes("document")) {
    needs.fields = [...needs.fields, "document"]
    needs.offered = [...needs.offered, "document"]
  }
  /*
   * WHAT STRIPE ALREADY HOLDS. The ID check is its own step now, so the page
   * that comes after it opens fresh and has no idea the document went in a
   * moment ago. Stripe does: the document's front is on the account, or it is
   * sitting in pending_verification while Stripe looks at it. Either way the
   * step is done, and the ID number that the document stands in for is not
   * asked for again.
   */
  const given: DetailField[] = []
  if (account.individual?.verification?.document?.front || pending.has("individual.verification.document")) given.push("document")
  if (account.individual?.verification?.additional_document?.front || pending.has("individual.verification.additional_document")) given.push("proofOfAddress")
  needs.given = given
  const country = (account.country ?? "").toUpperCase()
  const ext = account.external_accounts?.data?.find((e) => e.object === "bank_account") as Stripe.BankAccount | undefined
  const person = account.individual
  const holderName = [person?.first_name, person?.last_name].filter(Boolean).join(" ")
  const recipient = account.tos_acceptance?.service_agreement === "recipient"
  const deadline = account.requirements?.current_deadline
  return {
    needs,
    country,
    agreementUrl: recipient ? "https://stripe.com/legal/connect-account/recipient" : "https://stripe.com/legal/connect-account",
    dueBy: deadline ? new Date(deadline * 1000).toISOString() : null,
    active: account.charges_enabled === true && account.payouts_enabled === true,
    idNumber: idNumberName(country),
    bank: { ...bankFormat(country), currency: account.default_currency?.toUpperCase() ?? null, holderName, last4: ext?.last4 ?? null },
  }
}

export async function detailsForm(creator: PaymentsCreatorRef): Promise<DetailsFormView> {
  const account = await ownAccount(creator)
  /* Storelib's own fields, never the creator's: filled quietly when Stripe still lists them. */
  const due = [...(account.requirements?.currently_due ?? []), ...(account.requirements?.eventually_due ?? [])]
  if (due.some((k) => k.startsWith("business_profile."))) {
    const row = await readCreatorStripe(creator.id)
    await stripe.accounts
      .update(account.id, { business_profile: creatorBusinessProfile({ username: row?.username, displayName: row?.display_name, platformUrl: platformBusinessUrl() }) })
      .catch((error) => console.error("[payments own form] business profile", quiet(error)))
  }
  return viewOf(creator, account)
}

function asInput(raw: unknown): DetailsInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : Number.NaN)
  const dob = r.dob && typeof r.dob === "object" ? (r.dob as Record<string, unknown>) : null
  const address = r.address && typeof r.address === "object" ? (r.address as Record<string, unknown>) : null
  return {
    nationality: typeof r.nationality === "string" && /^[A-Za-z]{2}$/.test(r.nationality) ? r.nationality.toUpperCase() : undefined,
    dob: dob ? { day: num(dob.day), month: num(dob.month), year: num(dob.year) } : undefined,
    address: address ? { line1: text(address.line1, 200), line2: text(address.line2, 200), city: text(address.city, 100), postalCode: text(address.postalCode, 20), state: text(address.state, 100) } : undefined,
    phone: text(r.phone, 32),
    idNumber: text(r.idNumber, 40),
    ssnLast4: text(r.ssnLast4, 4),
    politicalExposure: r.politicalExposure === "existing" ? "existing" : r.politicalExposure === "none" ? "none" : undefined,
    acceptTos: r.acceptTos === true,
  }
}

export async function submitDetails(creator: PaymentsCreatorRef, raw: unknown, consent: { ip: string | null; userAgent: string | null }): Promise<DetailsFormView> {
  const account = await ownAccount(creator)
  const needs = needsOf(account.requirements as never)
  const input = asInput(raw)
  /* Stripe's alternative already given (the ID photo instead of the CNP): the field it stands in for is not required. */
  const given = new Set<DetailField>()
  if (account.individual?.verification?.document?.front) given.add("document")
  if (account.individual?.verification?.additional_document?.front) given.add("proofOfAddress")
  const issues = detailIssues(input, needs.fields, { tos: needs.tos, either: needs.either, given })
  const first = Object.values(issues)[0]
  if (first) throw new PaymentsProblem(first)

  const has = (f: DetailField) => needs.fields.includes(f)
  const individual: Stripe.AccountUpdateParams.Individual = {}
  if (has("dob") && input.dob) individual.dob = input.dob
  if (has("address") && input.address) {
    individual.address = {
      line1: input.address.line1.trim(),
      line2: input.address.line2?.trim() || undefined,
      city: input.address.city.trim(),
      postal_code: input.address.postalCode.trim(),
      state: input.address.state?.trim() || undefined,
      country: account.country ?? undefined,
    }
  }
  /* Some countries want the same address as the registered one too. */
  if (needs.registeredAddress && individual.address) individual.registered_address = individual.address
  /* Stripe takes it; this SDK version does not type it yet. */
  if (has("nationality") && input.nationality) (individual as Record<string, unknown>).nationality = input.nationality
  if (has("phone") && input.phone) individual.phone = cleanPhone(input.phone)
  if (has("idNumber") && input.idNumber?.trim()) individual.id_number = input.idNumber.replace(/[\s.-]/g, "")
  if (has("ssnLast4") && input.ssnLast4?.trim()) individual.ssn_last_4 = input.ssnLast4
  if (has("politicalExposure") && input.politicalExposure) individual.political_exposure = input.politicalExposure

  const params: Stripe.AccountUpdateParams = {}
  if (Object.keys(individual).length) params.individual = individual
  if (needs.tos && input.acceptTos) {
    params.tos_acceptance = { date: Math.floor(Date.now() / 1000), ip: consent.ip ?? undefined, user_agent: consent.userAgent?.slice(0, 300) ?? undefined }
  }
  let saved = account
  if (Object.keys(params).length) {
    try {
      saved = await stripe.accounts.update(account.id, params)
    } catch (error) {
      console.error("[payments own form] details", (error as { param?: string })?.param ?? "", quiet(error))
      throw new PaymentsProblem(sentence(error, "Stripe did not accept those details. Check them and try again."))
    }
  }
  /* The caller reads the overview next, which syncs once; syncing here as well was the same call twice. */
  return viewOf(creator, saved)
}

const DOC_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])
export const DOC_MAX_BYTES = 4 * 1024 * 1024

export async function uploadDocument(creator: PaymentsCreatorRef, input: { which: string; side: string; file: File | null }): Promise<DetailsFormView> {
  const account = await ownAccount(creator)
  const which = input.which === "proofOfAddress" ? "additional_document" : input.which === "document" ? "document" : null
  const side = input.side === "back" ? "back" : input.side === "front" ? "front" : null
  if (!which || !side) throw new PaymentsProblem("Choose the photo to upload.")
  const file = input.file
  if (!file || !DOC_TYPES.has(file.type)) throw new PaymentsProblem("Use a photo (JPG or PNG) or a PDF.")
  if (file.size > DOC_MAX_BYTES) throw new PaymentsProblem("That file is too large. Use one under 4 MB.")
  try {
    const uploaded = await stripe.files.create(
      { purpose: which === "document" ? "identity_document" : "additional_verification", file: { data: Buffer.from(await file.arrayBuffer()), name: `${which}-${side}`, type: file.type } },
      { stripeAccount: account.id },
    )
    const saved = await stripe.accounts.update(account.id, { individual: { verification: { [which]: { [side]: uploaded.id } } } as Stripe.AccountUpdateParams.Individual })
    await syncStripeAccount(creator.id, "creator").catch(() => undefined)
    return viewOf(creator, saved)
  } catch (error) {
    if (error instanceof PaymentsProblem) throw error
    console.error("[payments own form] document", quiet(error))
    throw new PaymentsProblem(sentence(error, "That photo did not upload. Try again with a clear photo."))
  }
}

export async function addBank(creator: PaymentsCreatorRef, raw: unknown): Promise<DetailsFormView> {
  const account = await ownAccount(creator)
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const country = (account.country ?? "").toUpperCase()
  const currency = (account.default_currency ?? "").toLowerCase()
  if (!country || !currency) throw new PaymentsProblem("Finish your details first.")
  const format = bankFormat(country)
  const holder = typeof r.holderName === "string" ? r.holderName.trim().slice(0, 120) : ""
  if (holder.length < 2) throw new PaymentsProblem("Enter the name on the bank account.")

  const bank: Stripe.AccountCreateExternalAccountParams.BankAccount = { object: "bank_account", country, currency, account_holder_name: holder, account_holder_type: "individual", account_number: "" }
  if (format.kind === "iban") {
    const iban = cleanIban(typeof r.iban === "string" ? r.iban : "")
    if (!ibanValid(iban, country)) throw new PaymentsProblem("That IBAN does not look right. Check it against your bank app.")
    bank.account_number = iban
  } else {
    const number = (typeof r.accountNumber === "string" ? r.accountNumber : "").replace(/[\s-]/g, "")
    const routing = (typeof r.routingNumber === "string" ? r.routingNumber : "").replace(/[\s]/g, "").toUpperCase()
    if (!/^[A-Za-z0-9]{4,34}$/.test(number)) throw new PaymentsProblem(`Enter your ${(format.accountLabel ?? "account number").toLowerCase()}.`)
    if (format.routingPattern && !new RegExp(format.routingPattern).test(routing)) throw new PaymentsProblem(`Check your ${(format.routingLabel ?? "bank code").toLowerCase()}.`)
    bank.account_number = number
    if (routing) bank.routing_number = routing
  }
  let added: Stripe.BankAccount | null = null
  try {
    added = (await stripe.accounts.createExternalAccount(account.id, { external_account: bank, default_for_currency: true })) as Stripe.BankAccount
  } catch (error) {
    console.error("[payments own form] bank", (error as { param?: string })?.param ?? "", quiet(error))
    throw new PaymentsProblem(sentence(error, "Stripe did not accept that bank account. Check it and try again."))
  }
  const view = await viewOf(creator, account)
  return { ...view, bank: { ...view.bank, last4: added?.last4 ?? view.bank.last4 } }
}
