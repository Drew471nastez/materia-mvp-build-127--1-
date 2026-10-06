import "server-only"
import { after } from "next/server"

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
import { idOutstanding } from "./status"

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
  bank: BankFormat & { currency: string | null; holderName: string; last4: string | null; currencies: string[] }
  /** Which sides of the ID Stripe holds. Lets setup on a computer see photos taken on a phone. */
  idSides: { front: boolean; back: boolean }
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
    account = await stripe.accounts.retrieve(row.stripe_account_id, { timeout: 20_000, maxNetworkRetries: 1 })
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
   * PROGRESSIVE, WITH ONE EXCEPTION. needsOf reads past_due and currently_due
   * and nothing else: eventually_due is what Stripe MAY ask for as sales
   * grow, and a detail asked for before Stripe wants it is a wall for
   * nothing. When Stripe moves something into currently_due later,
   * account.updated syncs it, Payouts and Home say so, the seller gets an
   * email, and this same form opens with only that.
   *
   * THE EXCEPTION IS THE ID CHECK, and it is the last step of setup however
   * Stripe lists it. Stripe puts individual.verification.document under
   * eventually_due the day most accounts are made, and moves it to
   * currently_due seconds after the details go in. Reading only "now" made
   * that a bounce: details sent, "checking", and then straight back to the
   * form for the ID. The owner, October 2026: "once users set up it's done,
   * they upload their KYC and that's all", and the ID check is step three.
   * So the document is asked once, at the end, and nothing else is ever
   * taken from eventually_due.
   */
  const pending = new Set(account.requirements?.pending_verification ?? [])
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
  /*
   * VERIFY ID IS ALWAYS A STEP, until Stripe holds an ID. The owner, October
   * 2026: "the steps forever should be simple: personal info, KYC with ID
   * only, with camera, bank details". Asking only when Stripe listed the
   * document made the step appear for one seller and vanish for the next,
   * and when it vanished the end screen still said "Checking your ID" to
   * somebody who had never been shown it. So an individual whose identity
   * Stripe has not verified, and who has no ID on file or under review, is
   * asked for it, once, as step two.
   */
  if (!needs.fields.includes("document") && idOutstanding(account)) needs.fields = [...needs.fields, "document"]
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
    idSides: { front: !!person?.verification?.document?.front, back: !!person?.verification?.document?.back },
    bank: { ...bankFormat(country), currency: (ext?.currency ?? account.default_currency)?.toUpperCase() ?? null, holderName, last4: ext?.last4 ?? null, currencies: await payoutCurrencies(country, account.default_currency ?? null) },
  }
}

/*
 * WHICH CURRENCIES A SELLER CAN BE PAID IN. Stripe's country spec says, per
 * currency, which bank countries it pays out to; a currency counts when the
 * seller's own country is one of them. Shown as a short choice: the local
 * currency first, then euro and US dollar where Stripe supports them. Kept
 * per server instance, it changes about never.
 */
const PAYOUT_CHOICES = ["eur", "usd"]
const currencyCache = new Map<string, string[]>()
async function payoutCurrencies(country: string, local: string | null): Promise<string[]> {
  const c = country.toUpperCase()
  let supported = currencyCache.get(c)
  if (!supported) {
    try {
      const spec = await stripe.countrySpecs.retrieve(c)
      supported = Object.entries(spec.supported_bank_account_currencies ?? {})
        .filter(([, countries]) => countries.includes(c))
        .map(([cur]) => cur.toLowerCase())
      currencyCache.set(c, supported)
    } catch (error) {
      console.error("[payments own form] country spec", quiet(error))
      supported = []
    }
  }
  const first = local?.toLowerCase()
  const can = supported ?? []
  const list = [first, ...PAYOUT_CHOICES].filter((cur): cur is string => !!cur && (cur === first || can.includes(cur)))
  return [...new Set(list)].map((cur) => cur.toUpperCase())
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

/*
 * STRIPE'S OWN RULES FOR A VERIFICATION FILE
 * (docs.stripe.com/connect/handling-api-verification, "Upload a file"):
 *
 *   a colour image, 8,000 by 8,000 pixels or smaller
 *   10 MB or less
 *   AN IDENTITY DOCUMENT IS JPG OR PNG. Not PDF.
 *   an address or legal entity document may be JPG, PNG or PDF
 *   never password protected
 *
 * The PDF part is why this is split in two. A PDF of an ID was accepted by
 * this form, uploaded, attached, and then turned down by Stripe with
 * verification_document_invalid, which reads to the creator as "your ID was
 * refused" when the file was simply the wrong kind. It is refused here, in
 * words that say what to send instead.
 */
const ID_TYPES = new Set(["image/jpeg", "image/png"])
const ADDRESS_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"])
/** Stripe's limit. The camera sends far less (shrinkPhoto), and a photo from a library is allowed its full size. */
export const DOC_MAX_BYTES = 10 * 1024 * 1024

export async function uploadDocument(creator: PaymentsCreatorRef, input: { which: string; side: string; file: File | null }): Promise<DetailsFormView> {
  const which = input.which === "proofOfAddress" ? "additional_document" : input.which === "document" ? "document" : null
  const side = input.side === "back" ? "back" : input.side === "front" ? "front" : null
  if (!which || !side) throw new PaymentsProblem("Choose the photo to upload.")
  const file = input.file
  const allowed = which === "document" ? ID_TYPES : ADDRESS_TYPES
  if (!file || !allowed.has(file.type)) {
    throw new PaymentsProblem(
      which === "document"
        ? "An ID has to be a colour photo, JPG or PNG. A PDF or a scan saved as a document cannot be used."
        : "Use a photo (JPG or PNG) or a PDF.",
    )
  }
  if (file.size > DOC_MAX_BYTES) throw new PaymentsProblem("That file is too large. Use one under 10 MB.")
  /*
   * AS FAST AS STRIPE ALLOWS. The photo goes up while the account is read
   * (both need only the account id), the answer is built from the account
   * Stripe hands back on the write, and the full re-sync of the creator's row
   * runs after the response has gone (account.updated does it too). It used
   * to wait for that sync, several more Stripe calls, while the person
   * watched "Sending to Stripe" for most of ten seconds or more.
   */
  const row = await readCreatorStripe(creator.id)
  if (!row?.stripe_account_id) throw new PaymentsProblem("Start with your country and name first.")
  const data = Buffer.from(await file.arrayBuffer())
  try {
    /*
     * EVERY CALL IS BOUNDED. Stripe's own client waits eighty seconds and
     * retries, which is longer than the request itself is allowed to live:
     * the page sat on "Stripe is saving it" until it gave up, with nothing
     * said about why. Twenty seconds each, one retry, so the answer is
     * either the photo or a sentence, always well inside the minute.
     */
    const limits = { timeout: 20_000, maxNetworkRetries: 1 }
    const [account, uploaded] = await Promise.all([
      ownAccount(creator),
      stripe.files.create(
        { purpose: which === "document" ? "identity_document" : "additional_verification", file: { data, name: `${which}-${side}`, type: file.type } },
        { stripeAccount: row.stripe_account_id, ...limits },
      ),
    ])
    const saved = await stripe.accounts.update(account.id, { individual: { verification: { [which]: { [side]: uploaded.id } } } as Stripe.AccountUpdateParams.Individual }, limits)
    after(() => syncStripeAccount(creator.id, "creator").then(() => undefined, () => undefined))
    return viewOf(creator, saved)
  } catch (error) {
    if (error instanceof PaymentsProblem) throw error
    console.error("[payments own form] document", quiet(error))
    /* Stripe did not answer in time: say that, rather than blaming the photo. */
    const code = (error as { type?: string; code?: string })?.type
    if (code === "StripeConnectionError" || (error as { code?: string })?.code === "ETIMEDOUT") {
      throw new PaymentsProblem("Our payment partner did not answer in time. Try once more.", 504)
    }
    throw new PaymentsProblem(sentence(error, "That photo did not upload. Try again with a clear photo."))
  }
}

export async function addBank(creator: PaymentsCreatorRef, raw: unknown): Promise<DetailsFormView> {
  const account = await ownAccount(creator)
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const country = (account.country ?? "").toUpperCase()
  const local = (account.default_currency ?? "").toLowerCase()
  if (!country || !local) throw new PaymentsProblem("Finish your details first.")
  /* The payout currency the seller picked, only from what Stripe pays out to their country. */
  const allowed = (await payoutCurrencies(country, local)).map((c) => c.toLowerCase())
  const asked = typeof r.currency === "string" ? r.currency.toLowerCase() : local
  if (!allowed.includes(asked)) throw new PaymentsProblem("Pick one of the payout currencies shown.")
  const currency = asked
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
  /*
   * Sales settle in the account's default currency and pay out to the bank
   * for that currency, so a seller who chose euro has euro settle and land
   * in their euro account. A refusal leaves the bank added: Stripe still
   * pays out any balance it holds in that currency there.
   */
  if (currency !== local) {
    await stripe.accounts.update(account.id, { default_currency: currency }).catch((error) => console.error("[payments own form] payout currency", quiet(error)))
  }
  const view = await viewOf(creator, account)
  return { ...view, bank: { ...view.bank, currency: currency.toUpperCase(), last4: added?.last4 ?? view.bank.last4, currencies: allowed.map((c) => c.toUpperCase()) } }
}
