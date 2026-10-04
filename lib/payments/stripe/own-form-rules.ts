/**
 * ===========================================================================
 *  STORELIB'S OWN PAYOUT FORM: WHAT TO ASK AND HOW TO CHECK IT
 * ===========================================================================
 * Setup is Storelib's own form, the way Gumroad's payout settings are, not
 * Stripe's embedded screens. Storelib runs the account's requirements
 * (controller.requirement_collection "application"), so it asks for exactly
 * what Stripe says this account still needs, and nothing else:
 *
 *   country and legal name     step one
 *   date of birth, address,    only the ones in the account's requirements,
 *   phone, national ID number, which differ by country (a US account wants
 *   ID photo, proof of address  the last four of the SSN, a Romanian one the
 *                               CNP, most want an ID photo eventually)
 *   bank                        IBAN where the country uses one, account and
 *                               routing number where it does not
 *
 * WHAT IS ASKED IS STRIPE'S LIST, NOT A GUESS, and only what it needs now
 * (NeedsScope below), the way Gumroad does it: a few fields to start, and
 * Stripe's later asks (an ID photo once sales grow, proof of address) come
 * back as the same form with just those. Business profile fields are
 * Storelib's to fill and never reach the creator.
 *
 * Pure: the server module (own-form.ts) and the tests use it as it is.
 */

export type DetailField = "dob" | "address" | "state" | "phone" | "nationality" | "idNumber" | "ssnLast4" | "document" | "proofOfAddress" | "politicalExposure"

export interface DetailsNeeds {
  fields: DetailField[]
  /** The ToS acceptance is still missing: the form shows Stripe's agreement and records the yes. */
  tos: boolean
  bank: boolean
  name: boolean
  /** Requirements this form has no field for (rare); Payouts shows them as a support case. */
  other: string[]
  /** Stripe is looking at what was sent: nothing to ask. */
  checking: boolean
  /** Stripe also wants the address as the registered address (some countries): the same address is sent for both. */
  registeredAddress: boolean
  /** Why Stripe turned something down, in words a creator can act on (a blurry photo, an expired ID). */
  problems: string[]
  /**
   * Stripe's own alternatives: fields that are due, and other fields that
   * satisfy them instead. The one a creator meets is "the CNP, or a photo of
   * your ID": with the photo, the number is not asked for at all. Only what
   * Stripe lists here is ever made optional.
   */
  either: Array<{ original: DetailField[]; alternative: DetailField[] }>
  /** Fields on the form only as an alternative: not due by themselves. */
  offered: DetailField[]
  /**
   * Already on file at Stripe: a document whose front is uploaded, or an
   * identity check Stripe has accepted. The form reads this on a fresh open,
   * so a step that was done before does not ask again, and the ID number is
   * not asked for once the document that stands in for it has been given.
   */
  given: DetailField[]
  /**
   * WHAT STORELIB'S OWN FORM WILL NOT ASK FOR.
   *
   * Verification here is one thing: the live ID check, a national ID or a
   * passport, through the camera. No typing a national ID number out of a
   * card, no photographing a utility bill. Where Stripe wants one of those
   * anyway and no document can stand in for it, the field is not quietly
   * added back to this form: it is handed to Stripe's own embedded form,
   * drawn inside the Storelib page, which knows every country's version of
   * it. Storelib's form stays the short one, and nobody is ever stuck
   * because Storelib declined to ask.
   */
  handover: DetailField[]
}

/**
 * LIKE GUMROAD: THE MINIMUM NOW, MORE ONLY WHEN IT IS ASKED FOR.
 *   "now"  what Stripe needs before payments can switch on (past and
 *          currently due). Setup asks this and nothing else.
 *   "all"  that and what Stripe will want as sales grow (eventually due).
 * When Stripe later asks for more (a photo of the ID, proof of address),
 * the requirement moves to currently due, Payouts says so, the creator gets
 * an email, and the same form opens with only that.
 */
export type NeedsScope = "now" | "all"

const MAP: Array<[RegExp, DetailField | "tos" | "bank" | "name" | "ours" | "registered"]> = [
  [/^individual\.dob\./, "dob"],
  [/^individual\.address\.state$/, "state"],
  [/^individual\.address\./, "address"],
  [/^individual\.registered_address\./, "registered"],
  [/^individual\.nationality$/, "nationality"],
  [/^individual\.phone$/, "phone"],
  [/^individual\.id_number$/, "idNumber"],
  [/^individual\.ssn_last_4$/, "ssnLast4"],
  [/^individual\.verification\.document$/, "document"],
  [/^individual\.verification\.additional_document$/, "proofOfAddress"],
  [/^individual\.political_exposure$/, "politicalExposure"],
  [/^individual\.(first_name|last_name)$/, "name"],
  [/^individual\.email$/, "ours"],
  [/^tos_acceptance\./, "tos"],
  [/^external_account$/, "bank"],
  [/^business_profile\./, "ours"],
  [/^business_type$/, "ours"],
]

const ORDER: DetailField[] = ["dob", "address", "state", "phone", "nationality", "idNumber", "ssnLast4", "politicalExposure", "document", "proofOfAddress"]

/**
 * Fields Storelib's own form does not draw: a number copied off a card, a
 * second document, a question about public office. The live ID check is the
 * verification here; these go to Stripe's embedded form instead (handover
 * above), and only when Stripe truly needs them and the ID cannot answer.
 */
const STRIPE_OWN: readonly DetailField[] = ["idNumber", "ssnLast4", "politicalExposure", "proofOfAddress"]

/** Stripe's reasons for turning something down, as a sentence about what to do next. */
const PROBLEMS: Record<string, string> = {
  verification_document_expired: "The ID you uploaded has expired. Upload one that is still valid.",
  verification_document_too_large: "The photo of your ID was too large. Upload a smaller photo.",
  verification_document_not_readable: "We couldn't read your document. Upload a clearer photo showing all four corners.",
  verification_document_not_uploaded: "Your ID photo did not arrive. Upload it again.",
  verification_document_incomplete: "We couldn't read your document. Upload a clearer photo showing all four corners.",
  verification_document_name_mismatch: "The name on your ID does not match the name you entered. Check both.",
  verification_document_dob_mismatch: "The date of birth on your ID does not match the one you entered. Check both.",
  verification_document_id_number_mismatch: "The ID number does not match your document. Check it.",
  verification_document_failed_copy: "Stripe needs a photo of the original ID, not a photocopy or a screen.",
  verification_document_failed_greyscale: "Upload a colour photo of your ID.",
  verification_document_fraudulent: "Stripe could not accept that ID. Upload a different, valid document.",
  verification_document_type_not_supported: "That kind of document is not accepted. Use a passport, national ID card or driving licence.",
  verification_failed_address_match: "Stripe could not confirm your address. Check it, or upload a proof of address.",
  verification_failed_id_number_match: "Stripe could not match your ID number. Check it against your document.",
  verification_failed_name_match: "Stripe could not match your name. Use your name exactly as on your ID.",
  verification_failed_keyed_identity: "Stripe could not confirm your details. Check them, and upload a photo of your ID.",
  verification_failed_other: "Stripe could not verify you from what was sent. Check your details and upload a clear photo of your ID.",
  invalid_address_po_boxes_disallowed: "Use the address where you live. A PO box cannot be verified.",
  invalid_dob_age_under_minimum: "You need to be 18 or older to be paid out.",
}

export function problemWords(code: string | null | undefined): string {
  return (code && PROBLEMS[code]) || "Stripe needs you to check one of your details. Correct it below and send it again."
}

/** What the form must ask for, from the account's requirement lists. */
export function needsOf(
  req: {
    currently_due?: string[] | null
    eventually_due?: string[] | null
    past_due?: string[] | null
    pending_verification?: string[] | null
    errors?: Array<{ code?: string | null; requirement?: string | null }> | null
    alternatives?: Array<{ alternative_fields_due: string[]; original_fields_due: string[] }> | null
  } | null | undefined,
  scope: NeedsScope = "now",
): DetailsNeeds {
  const due = new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? []), ...(scope === "all" ? (req?.eventually_due ?? []) : [])])
  const pending = new Set(req?.pending_verification ?? [])
  const fields = new Set<DetailField>()
  const other: string[] = []
  let tos = false
  let bank = false
  let name = false
  let registeredAddress = false
  for (const key of due) {
    if (pending.has(key)) continue
    const hit = MAP.find(([re]) => re.test(key))
    if (!hit) {
      other.push(key)
      continue
    }
    const what = hit[1]
    if (what === "tos") tos = true
    else if (what === "bank") bank = true
    else if (what === "name") name = true
    else if (what === "registered") {
      registeredAddress = true
      fields.add("address")
    } else if (what !== "ours") fields.add(what)
  }
  /* A state is only asked with the rest of the address. */
  if (fields.has("state")) fields.add("address")
  /* Stripe's alternatives, as fields: the alternative is offered on the form, and the original becomes the other way. */
  const fieldOf = (key: string): DetailField | null => {
    const hit = MAP.find(([re]) => re.test(key))
    const what = hit?.[1]
    return what && what !== "tos" && what !== "bank" && what !== "name" && what !== "ours" && what !== "registered" ? what : null
  }
  const either: DetailsNeeds["either"] = []
  const dueOnItsOwn = new Set(fields)
  for (const alt of req?.alternatives ?? []) {
    const original = [...new Set(alt.original_fields_due.filter((k) => due.has(k) && !pending.has(k)).map(fieldOf).filter((f): f is DetailField => !!f))]
    const alternative = [...new Set(alt.alternative_fields_due.map(fieldOf).filter((f): f is DetailField => !!f))]
    if (!original.length || !alternative.length) continue
    for (const f of alternative) fields.add(f)
    either.push({ original, alternative })
  }
  const problems = [...new Set((req?.errors ?? []).filter((e) => !e.requirement || due.has(e.requirement)).map((e) => problemWords(e.code)))]
  /*
   * A field Stripe will take the ID document for instead is not a handover:
   * the live check answers it, which is the whole point of the alternatives.
   * Only one Stripe insists on, with no document that settles it, goes over.
   */
  const settledByDocument = new Set<DetailField>()
  for (const alt of either) if (alt.alternative.includes("document")) for (const f of alt.original) settledByDocument.add(f)
  const handover = ORDER.filter((f) => fields.has(f) && STRIPE_OWN.includes(f) && !settledByDocument.has(f))
  const ours = (f: DetailField) => fields.has(f) && !handover.includes(f)
  return {
    fields: ORDER.filter(ours),
    tos,
    bank,
    name,
    other,
    checking: due.size === 0 && pending.size > 0,
    registeredAddress,
    problems,
    either,
    offered: ORDER.filter((f) => ours(f) && !dueOnItsOwn.has(f)),
    given: [],
    handover,
  }
}

/* ── the ID number, named as the creator knows it ───────────────────────── */

const ID_NAMES: Record<string, { label: string; hint: string }> = {
  US: { label: "Social Security number", hint: "All nine digits. Stripe uses it to confirm who you are." },
  RO: { label: "CNP (personal numeric code)", hint: "The 13 digit number on your Romanian ID card." },
  GB: { label: "National Insurance number", hint: "Two letters, six numbers and a letter, for example QQ123456C." },
  CA: { label: "Social Insurance number", hint: "The nine digits of your SIN." },
  ES: { label: "DNI or NIE", hint: "As printed on your Spanish ID." },
  IT: { label: "Codice fiscale", hint: "The 16 characters of your tax code." },
  BR: { label: "CPF", hint: "The 11 digits of your CPF." },
  MX: { label: "CURP", hint: "The 18 characters of your CURP." },
  SG: { label: "NRIC or FIN", hint: "As printed on your card." },
  HK: { label: "HKID number", hint: "As printed on your identity card." },
  IN: { label: "PAN", hint: "The 10 characters of your PAN card." },
  CO: { label: "Cédula number", hint: "The digits exactly as printed. No dots, no extra zeros." },
}

export function idNumberName(country: string): { label: string; hint: string } {
  return ID_NAMES[country.toUpperCase()] ?? { label: "Personal ID number", hint: "The national ID or tax number on your official documents." }
}

/* ── the bank, in the format the country uses ───────────────────────────── */

/** Countries whose bank accounts Stripe takes as an IBAN. */
export const IBAN_COUNTRIES = new Set([
  "AD", "AE", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GI", "GR", "HR", "HU", "IE", "IL", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MT", "NL", "NO", "PL", "PT", "RO", "SA", "SE", "SI", "SK", "SM", "TR",
])

export interface BankFormat {
  kind: "iban" | "routing"
  /** For "routing": what the country calls it and how long it is. */
  routingLabel?: string
  routingPattern?: string
  accountLabel?: string
}

const ROUTING: Record<string, { label: string; pattern: string; account?: string }> = {
  US: { label: "Routing number", pattern: "^\\d{9}$" },
  GB: { label: "Sort code", pattern: "^\\d{6}$" },
  CA: { label: "Transit and institution number", pattern: "^\\d{8}$" },
  AU: { label: "BSB", pattern: "^\\d{6}$" },
  NZ: { label: "Bank and branch", pattern: "^\\d{6}$" },
  JP: { label: "Bank and branch code", pattern: "^\\d{7}$" },
  SG: { label: "Bank and branch code", pattern: "^\\d{7}$" },
  HK: { label: "Clearing and branch code", pattern: "^\\d{6}$" },
  IN: { label: "IFSC", pattern: "^[A-Z]{4}0[A-Z0-9]{6}$" },
  MX: { label: "CLABE", pattern: "^\\d{18}$", account: "CLABE" },
  BR: { label: "Bank and branch", pattern: "^\\d{3}-?\\d{4,5}$" },
}

export function bankFormat(country: string): BankFormat {
  const c = country.toUpperCase()
  if (IBAN_COUNTRIES.has(c)) return { kind: "iban" }
  const r = ROUTING[c]
  return { kind: "routing", routingLabel: r?.label ?? "Bank code", routingPattern: r?.pattern, accountLabel: r?.account ?? "Account number" }
}

export function cleanIban(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase()
}

/** The IBAN's own check (ISO 13616, mod 97), so a typo is caught before Stripe sees it. */
export function ibanValid(input: string, country?: string): boolean {
  const iban = cleanIban(input)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  if (country && IBAN_COUNTRIES.has(country.toUpperCase()) && iban.slice(0, 2) !== country.toUpperCase()) return false
  const moved = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const ch of moved) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55)
    for (const d of v) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

/* ── the details, checked the same way on both sides ────────────────────── */

export interface DetailsInput {
  nationality?: string
  dob?: { day: number; month: number; year: number }
  address?: { line1: string; line2?: string; city: string; postalCode: string; state?: string }
  phone?: string
  idNumber?: string
  ssnLast4?: string
  politicalExposure?: "none" | "existing"
  acceptTos?: boolean
}

export function ageOn(dob: { day: number; month: number; year: number }, now: Date): number {
  let age = now.getUTCFullYear() - dob.year
  const m = now.getUTCMonth() + 1
  if (m < dob.month || (m === dob.month && now.getUTCDate() < dob.day)) age--
  return age
}

export function validDate(d: { day: number; month: number; year: number }): boolean {
  if (![d.day, d.month, d.year].every(Number.isInteger)) return false
  if (d.year < 1900 || d.month < 1 || d.month > 12 || d.day < 1) return false
  return d.day <= new Date(Date.UTC(d.year, d.month, 0)).getUTCDate()
}

export function cleanPhone(input: string): string {
  const t = input.trim()
  return (t.startsWith("+") ? "+" : "") + t.replace(/\D/g, "")
}

/** One sentence per field that is wrong, keyed by the field. Empty is valid. */
/** The fields that are not needed any more, because the creator gave Stripe's alternative for them (the ID photo for the CNP). */
/**
 * Fields nothing need be typed for, because Stripe takes something else
 * instead. An alternative counts as met once it has been given, and a
 * document alternative counts from the start: the ID check that satisfies it
 * is a later step of the same setup, so demanding the number before that
 * step runs is demanding it on a page that deliberately does not show it.
 * Somebody who never does the ID is not let through by this: Stripe keeps
 * asking, the ID step draws itself, and that step offers the number.
 */
export function coveredByAlternative(either: DetailsNeeds["either"], given: Set<DetailField>): Set<DetailField> {
  const out = new Set<DetailField>()
  for (const e of either) {
    const met = e.alternative.every((f) => given.has(f)) || e.alternative.includes("document")
    if (met) for (const f of e.original) out.add(f)
  }
  return out
}

export function detailIssues(input: DetailsInput, asked: DetailField[], opts: { tos: boolean; now?: Date; either?: DetailsNeeds["either"]; given?: Set<DetailField> }): Partial<Record<DetailField | "tos", string>> {
  const out: Partial<Record<DetailField | "tos", string>> = {}
  const now = opts.now ?? new Date()
  const covered = coveredByAlternative(opts.either ?? [], opts.given ?? new Set())
  /* A field is only required when nothing Stripe accepts in its place was given; one with an alternative is checked if it was typed at all. */
  const needs = asked.filter((f) => !covered.has(f) && !(f === "document" || f === "proofOfAddress"))
  const typed = (f: DetailField) => (f === "idNumber" ? !!input.idNumber?.trim() : f === "ssnLast4" ? !!input.ssnLast4?.trim() : true)
  for (const f of asked) if (covered.has(f) && typed(f) && (f === "idNumber" || f === "ssnLast4")) needs.push(f)
  if (needs.includes("dob")) {
    const d = input.dob
    if (!d || !validDate(d)) out.dob = "Enter your date of birth."
    else if (ageOn(d, now) < 18) out.dob = "You need to be 18 or older to be paid out."
    else if (ageOn(d, now) > 120) out.dob = "Check the year of your date of birth."
  }
  if (needs.includes("address")) {
    const a = input.address
    if (!a || a.line1.trim().length < 3) out.address = "Enter your street address."
    else if (/\b(p\.?\s?o\.?\s?box|apo|fpo|dpo)\b/i.test(`${a.line1} ${a.line2 ?? ""}`)) out.address = "Use the address where you live. A PO box or military address cannot be verified."
    else if (a.city.trim().length < 2) out.address = "Enter your city."
    else if (a.postalCode.trim().length < 2) out.address = "Enter your postal code."
    else if (needs.includes("state") && !(a.state ?? "").trim()) out.state = "Enter your state, county or region."
  }
  if (needs.includes("phone")) {
    const p = cleanPhone(input.phone ?? "")
    if (!/^\+?\d{7,15}$/.test(p)) out.phone = "Enter your phone number, with the country code."
  }
  if (needs.includes("nationality") && !/^[A-Z]{2}$/.test(input.nationality ?? "")) out.nationality = "Choose your nationality."
  if (needs.includes("idNumber")) {
    const id = (input.idNumber ?? "").replace(/[\s.-]/g, "")
    if (!/^[A-Za-z0-9]{4,20}$/.test(id)) out.idNumber = "Enter your ID number exactly as on your document."
  }
  if (needs.includes("ssnLast4") && !/^\d{4}$/.test(input.ssnLast4 ?? "")) out.ssnLast4 = "Enter the last four digits of your SSN."
  if (needs.includes("politicalExposure") && input.politicalExposure !== "none" && input.politicalExposure !== "existing") out.politicalExposure = "Choose one."
  if (opts.tos && input.acceptTos !== true) out.tos = "Agree to continue."
  return out
}
