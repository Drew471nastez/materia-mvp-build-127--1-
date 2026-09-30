/**
 * The identity details Storelib asks for itself, from what Stripe says is
 * due on an account Storelib runs. Stripe stays the judge: this only decides
 * which Storelib fields to draw and checks them before they are sent. For a
 * business, the person is the representative (Stripe's `representative.` or
 * `person_<id>.` keys) and the company's own details are asked alongside.
 */

export type DetailField =
  | "companyName"
  | "companyAddress"
  | "companyState"
  | "companyPhone"
  | "taxId"
  | "registrationNumber"
  | "name"
  | "title"
  | "dob"
  | "nationality"
  | "address"
  | "state"
  | "phone"
  | "idNumber"
  | "ssnLast4"
  | "pep"
  | "owners"
  | "tos"
export type DocumentNeed = "identity" | "address_proof" | "company" | null
export type AccountKind = "individual" | "business"

/** What the Verify step draws. Requirement codes never leave the server. */
export interface StripeVerificationView {
  kind: AccountKind
  fields: DetailField[]
  document: DocumentNeed
  /** Something Storelib has no field for yet. */
  other: boolean
  /** Those things, in plain words, for the creator and support. */
  otherLabels: string[]
  /** Everything is in and Stripe is checking it. */
  pending: boolean
  agreement: "full" | "recipient"
  country: string
  /** One plain sentence when Stripe turned down a document. */
  problem: string | null
  /** What Stripe already holds, so a field asked again starts filled. */
  prefill: { firstName: string; lastName: string; companyName: string }
}

export const AGREEMENT_URL = {
  full: "https://stripe.com/connect-account/legal/full",
  recipient: "https://stripe.com/connect-account/legal/recipient",
} as const

/**
 * One key per thing, whatever Stripe calls it. On a business Storelib adds a
 * single person, the representative, and has them attest they are the only
 * owner, director and executive, so any person key is theirs and any owner,
 * director or executive key is that attestation.
 */
export function canonicalRequirement(key: string, kind: AccountKind): string {
  if (kind !== "business") return key
  const k = key.replace(/^person_[A-Za-z0-9]+\./, "representative.")
  if (/^(owners|directors|executives)\./.test(k)) return "company.owners_provided"
  if (/^company\.(owners|directors|executives)_provided$/.test(k)) return "company.owners_provided"
  return k
}

const PERSON_NATIVE =
  /^(first_name|last_name|email|dob\.|address\.|phone|id_number|ssn_last_4|political_exposure|nationality|verification\.(document|additional_document|person(\.|$))|relationship\.)/

const COMPANY_NATIVE = /^company\.(name|address\.|phone|tax_id|registration_number|owners_provided|verification\.document)/

/** Set by the server, never asked. */
const SERVER_SET =
  /^(individual\.email|representative\.email|representative\.relationship\.(representative|executive|owner|director|percent_ownership)|business_profile\.|business_type|settings\.(payments\.statement_descriptor|card_payments\.statement_descriptor_prefix)|external_account)/

function isKnown(key: string, kind: AccountKind): boolean {
  if (SERVER_SET.test(key) || key.startsWith("tos_acceptance.")) return true
  const person = kind === "business" ? "representative." : "individual."
  if (key.startsWith(person)) {
    const tail = key.slice(person.length)
    if (kind === "individual" && /^(relationship\.|nationality)/.test(tail)) return false
    return PERSON_NATIVE.test(tail)
  }
  return kind === "business" && COMPANY_NATIVE.test(key)
}

/** The requirement codes Storelib has no field for (server side only). */
export function unknownRequirements(due: string[], kind: AccountKind | null): string[] {
  const k: AccountKind = kind === "business" ? "business" : "individual"
  return [...new Set(due.map((key) => canonicalRequirement(key, k)))].filter((key) => !isKnown(key, k))
}

const LABELS: [RegExp, string][] = [
  [/verification\.proof_of_liveness|verification\.person/, "A quick selfie check"],
  [/verification\.(additional_)?document/, "A document photo"],
  [/full_name_aliases|_kana|_kanji/, "Your name in local script"],
  [/registered_address/, "Your registered address"],
  [/statement_descriptor/, "How charges appear on statements"],
  [/company\.structure/, "Business structure"],
  [/company\.ownership_declaration/, "Ownership declaration"],
  [/company\.vat_id/, "VAT number"],
  [/support_/, "Customer support details"],
  [/relationship\./, "Your role"],
]

/** A requirement code in plain words: a known phrase, or the code's own words. */
export function requirementLabel(key: string): string {
  const known = LABELS.find(([re]) => re.test(key))
  if (known) return known[1]
  const tail = key.replace(/^(individual|representative|company|business_profile|settings|person_[A-Za-z0-9]+)\./, "").replace(/[._]+/g, " ").trim()
  return tail ? tail.charAt(0).toUpperCase() + tail.slice(1) : "A detail"
}

export function detailsPlan(due: string[], kind: AccountKind | null): { fields: DetailField[]; document: DocumentNeed; other: boolean } {
  const k: AccountKind = kind === "business" ? "business" : "individual"
  const keys = due.map((key) => canonicalRequirement(key, k))
  const has = (prefix: string) => keys.some((key) => key.startsWith(prefix))
  const p = k === "business" ? "representative." : "individual."
  const fields: DetailField[] = []
  if (k === "business") {
    if (has("company.name")) fields.push("companyName")
    if (has("company.address.")) fields.push("companyAddress")
    if (has("company.address.state")) fields.push("companyState")
    if (has("company.phone")) fields.push("companyPhone")
    if (has("company.tax_id")) fields.push("taxId")
    if (has("company.registration_number")) fields.push("registrationNumber")
  }
  if (has(`${p}first_name`) || has(`${p}last_name`)) fields.push("name")
  if (k === "business" && has("representative.relationship.title")) fields.push("title")
  if (has(`${p}dob.`)) fields.push("dob")
  if (k === "business" && has("representative.nationality")) fields.push("nationality")
  if (has(`${p}address.`)) fields.push("address")
  if (has(`${p}address.state`)) fields.push("state")
  if (has(`${p}phone`)) fields.push("phone")
  if (has(`${p}id_number`)) fields.push("idNumber")
  else if (has(`${p}ssn_last_4`)) fields.push("ssnLast4")
  if (has(`${p}political_exposure`)) fields.push("pep")
  if (k === "business" && has("company.owners_provided")) fields.push("owners")
  if (has("tos_acceptance.")) fields.push("tos")
  const document: DocumentNeed = has(`${p}verification.document`)
    ? "identity"
    : has(`${p}verification.additional_document`)
      ? "address_proof"
      : k === "business" && has("company.verification.document")
        ? "company"
        : null
  return { fields, document, other: unknownRequirements(due, k).length > 0 }
}

export function idNumberCopy(country: string): { label: string; tip: string } {
  switch (country.toUpperCase()) {
    case "US":
      return { label: "Social Security number", tip: "Needed by US law to confirm who gets paid. It is sent to Stripe and never stored by Storelib." }
    case "RO":
      return { label: "CNP", tip: "Your 13 digit personal numeric code, on your ID card. Sent to Stripe only." }
    case "CA":
      return { label: "Social Insurance number", tip: "Your 9 digit SIN. Sent to Stripe only." }
    case "HK":
      return { label: "HKID number", tip: "The number on your Hong Kong identity card. Sent to Stripe only." }
    case "SG":
      return { label: "NRIC or FIN", tip: "The number on your identity card. Sent to Stripe only." }
    default:
      return { label: "Personal ID number", tip: "The national ID number on your ID card. Sent to Stripe only." }
  }
}

export interface DetailsInput {
  firstName?: string
  lastName?: string
  title?: string
  dob?: string
  nationality?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  phone?: string
  idNumber?: string
  ssnLast4?: string
  pep?: "none" | "existing" | ""
  companyName?: string
  companyLine1?: string
  companyLine2?: string
  companyCity?: string
  companyState?: string
  companyPostalCode?: string
  companyPhone?: string
  taxId?: string
  registrationNumber?: string
  owners?: boolean
  tos?: boolean
}

export type IssueKey =
  | "firstName"
  | "lastName"
  | "title"
  | "dob"
  | "nationality"
  | "line1"
  | "city"
  | "state"
  | "postalCode"
  | "phone"
  | "idNumber"
  | "ssnLast4"
  | "pep"
  | "companyName"
  | "companyLine1"
  | "companyCity"
  | "companyState"
  | "companyPostalCode"
  | "companyPhone"
  | "taxId"
  | "registrationNumber"
  | "owners"
  | "tos"

const NAME_OK = /^[\p{L}][\p{L}\p{M}' .-]{0,79}$/u

function postalOk(raw: string | undefined, cc: string): boolean {
  const postal = (raw ?? "").trim()
  return cc === "US" ? /^\d{5}(-\d{4})?$/.test(postal) : postal.length >= 2 && postal.length <= 12
}

export function taxIdCopy(country: string): { label: string; tip: string } {
  switch (country.toUpperCase()) {
    case "US":
      return { label: "EIN", tip: "Your company's 9 digit Employer Identification Number, from the IRS." }
    case "GB":
      return { label: "Company number", tip: "The number Companies House gave your company." }
    case "RO":
      return { label: "CUI", tip: "Your company's fiscal code (Cod Unic de Înregistrare)." }
    default:
      return { label: "Company tax ID", tip: "The tax or VAT number of your company, as on its registration papers." }
  }
}

export function normalPhone(raw: string): string {
  const cleaned = raw.replace(/[\s().-]/g, "")
  return cleaned.startsWith("00") ? `+${cleaned.slice(2)}` : cleaned
}

function isoFromYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** While typing digits only, grow into YYYY-MM-DD (max 8 digits). */
export function maskDobTyping(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8)
  if (digits.length <= 4) return digits
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
}

/** Typed or pasted birth dates into canonical YYYY-MM-DD, or null. */
export function normalizeDobInput(raw: string, now = new Date()): string | null {
  const t = raw.trim()
  if (!t) return null

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (isoMatch) {
    const cand = isoFromYmd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))
    return dobParts(cand, now) ? cand : null
  }

  const digits = t.replace(/\D/g, "")
  if (digits.length === 8) {
    const cand = isoFromYmd(Number(digits.slice(0, 4)), Number(digits.slice(4, 6)), Number(digits.slice(6, 8)))
    if (dobParts(cand, now)) return cand
  }

  const sep = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)
  if (sep) {
    const a = Number(sep[1])
    const b = Number(sep[2])
    const y = Number(sep[3])
    const dmy = isoFromYmd(y, b, a)
    const mdy = isoFromYmd(y, a, b)
    const dmyOk = dobParts(dmy, now)
    const mdyOk = dobParts(mdy, now)
    if (dmyOk && !mdyOk) return dmy
    if (mdyOk && !dmyOk) return mdy
    if (dmyOk && mdyOk) {
      if (a > 12 && b <= 12) return dmy
      if (b > 12 && a <= 12) return mdy
      return dmy
    }
  }

  return null
}

/** YYYY-MM-DD into Stripe's parts, or null. */
export function dobParts(raw: string, now = new Date()): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  if (year < 1900 || date.getTime() > now.getTime()) return null
  return { day, month, year }
}

function age(parts: { day: number; month: number; year: number }, now = new Date()): number {
  let years = now.getUTCFullYear() - parts.year
  if (now.getUTCMonth() + 1 < parts.month || (now.getUTCMonth() + 1 === parts.month && now.getUTCDate() < parts.day)) years--
  return years
}

export function detailsIssues(input: DetailsInput, fields: DetailField[], country: string, now = new Date()): Partial<Record<IssueKey, string>> {
  const issues: Partial<Record<IssueKey, string>> = {}
  const cc = country.toUpperCase()
  if (fields.includes("companyName") && (input.companyName ?? "").trim().length < 2) issues.companyName = "Enter the legal name of your business."
  if (fields.includes("companyAddress")) {
    if ((input.companyLine1 ?? "").trim().length < 3) issues.companyLine1 = "Enter the business address."
    if ((input.companyCity ?? "").trim().length < 2) issues.companyCity = "Enter the city."
    if (!postalOk(input.companyPostalCode, cc)) issues.companyPostalCode = "Enter the postal code."
  }
  if (fields.includes("companyState") && (input.companyState ?? "").trim().length < 2) issues.companyState = cc === "US" ? "Enter the state." : "Enter the region."
  if (fields.includes("companyPhone") && !/^\+[1-9]\d{6,14}$/.test(normalPhone(input.companyPhone ?? ""))) issues.companyPhone = "Enter the phone with the country code."
  if (fields.includes("taxId")) {
    const tax = (input.taxId ?? "").replace(/[\s.-]/g, "")
    const ok = cc === "US" ? /^\d{9}$/.test(tax) : /^[A-Za-z0-9]{4,20}$/.test(tax)
    if (!ok) issues.taxId = `Enter the ${taxIdCopy(cc).label}.`
  }
  if (fields.includes("registrationNumber") && !/^[A-Za-z0-9/.\- ]{2,30}$/.test((input.registrationNumber ?? "").trim())) issues.registrationNumber = "Enter the registration number."
  if (fields.includes("name")) {
    if (!NAME_OK.test((input.firstName ?? "").trim())) issues.firstName = "Enter the first name as on the ID."
    if (!NAME_OK.test((input.lastName ?? "").trim())) issues.lastName = "Enter the last name as on the ID."
  }
  if (fields.includes("title") && (input.title ?? "").trim().length < 2) issues.title = "Enter your role, like Owner or Director."
  if (fields.includes("nationality") && !/^[A-Z]{2}$/.test((input.nationality ?? "").trim().toUpperCase())) issues.nationality = "Choose your nationality."
  if (fields.includes("dob")) {
    const parts = dobParts(input.dob ?? "", now)
    if (!parts) issues.dob = "Enter your date of birth."
    else if (age(parts, now) < 18) issues.dob = "You must be 18 or older to get paid."
  }
  if (fields.includes("address")) {
    if ((input.line1 ?? "").trim().length < 3) issues.line1 = "Enter your street address."
    if ((input.city ?? "").trim().length < 2) issues.city = "Enter your city."
    if (!postalOk(input.postalCode, cc)) issues.postalCode = "Enter your postal code."
  }
  if (fields.includes("state") && (input.state ?? "").trim().length < 2) issues.state = cc === "US" ? "Enter your state." : "Enter your region."
  if (fields.includes("phone") && !/^\+[1-9]\d{6,14}$/.test(normalPhone(input.phone ?? ""))) issues.phone = "Enter your phone with the country code, like +40 712 345 678."
  if (fields.includes("idNumber")) {
    const id = (input.idNumber ?? "").replace(/[\s-]/g, "")
    const ok = cc === "US" ? /^\d{9}$/.test(id) : cc === "RO" ? /^\d{13}$/.test(id) : /^[A-Za-z0-9]{4,20}$/.test(id)
    if (!ok) issues.idNumber = `Enter your ${idNumberCopy(cc).label}.`
  }
  if (fields.includes("ssnLast4") && !/^\d{4}$/.test((input.ssnLast4 ?? "").trim())) issues.ssnLast4 = "Enter the last 4 digits."
  if (fields.includes("pep") && input.pep !== "none" && input.pep !== "existing") issues.pep = "Choose one."
  if (fields.includes("owners") && input.owners !== true) issues.owners = "Confirm to continue, or write to support@storelib.com if others own part of the business."
  if (fields.includes("tos") && input.tos !== true) issues.tos = "Agree to continue."
  return issues
}
