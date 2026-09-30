/**
 * The identity details Storelib asks for itself, from what Stripe says is
 * due on an account Storelib runs. Stripe stays the judge: this only decides
 * which Storelib fields to draw and checks them before they are sent.
 * Anything Storelib does not know how to ask for goes to Stripe's embedded
 * form, in the page.
 */

export type DetailField = "dob" | "address" | "state" | "phone" | "idNumber" | "ssnLast4" | "pep" | "tos"
export type DocumentNeed = "identity" | "address_proof" | null

/** What the Verify step draws. Requirement codes never leave the server. */
export interface StripeVerificationView {
  fields: DetailField[]
  document: DocumentNeed
  /** Something only Stripe's in-page form can ask for. */
  other: boolean
  /** Everything is in and Stripe is checking it. */
  pending: boolean
  agreement: "full" | "recipient"
  country: string
  /** One plain sentence when Stripe turned down a document. */
  problem: string | null
}

export const AGREEMENT_URL = {
  full: "https://stripe.com/connect-account/legal/full",
  recipient: "https://stripe.com/connect-account/legal/recipient",
} as const

const NATIVE =
  /^(individual\.(first_name|last_name|email|dob\.|address\.|phone|id_number|ssn_last_4|political_exposure|verification\.(document|additional_document|person(\.|$)))|tos_acceptance\.|business_profile\.|external_account|business_type)/

/** Set by the server on every submit, never asked. */
const SERVER_SET = /^(individual\.(first_name|last_name|email)|business_profile\.|business_type)/

export function detailsPlan(due: string[], kind: "individual" | "business" | null): { fields: DetailField[]; document: DocumentNeed; other: boolean } {
  if (kind === "business") {
    const other = due.some((k) => !/^(external_account|tos_acceptance\.|business_profile\.)/.test(k))
    return { fields: due.some((k) => k.startsWith("tos_acceptance.")) && !other ? ["tos"] : [], document: null, other }
  }
  const has = (prefix: string) => due.some((k) => k.startsWith(prefix))
  const fields: DetailField[] = []
  if (has("individual.dob.")) fields.push("dob")
  if (has("individual.address.")) fields.push("address")
  if (has("individual.address.state")) fields.push("state")
  if (has("individual.phone")) fields.push("phone")
  if (has("individual.id_number")) fields.push("idNumber")
  else if (has("individual.ssn_last_4")) fields.push("ssnLast4")
  if (has("individual.political_exposure")) fields.push("pep")
  if (has("tos_acceptance.")) fields.push("tos")
  const document: DocumentNeed = has("individual.verification.document") ? "identity" : has("individual.verification.additional_document") ? "address_proof" : null
  const other = due.some((k) => !NATIVE.test(k) && !SERVER_SET.test(k))
  return { fields, document, other }
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
  dob?: string
  line1?: string
  line2?: string
  city?: string
  state?: string
  postalCode?: string
  phone?: string
  idNumber?: string
  ssnLast4?: string
  pep?: "none" | "existing" | ""
  tos?: boolean
}

type IssueKey = "dob" | "line1" | "city" | "state" | "postalCode" | "phone" | "idNumber" | "ssnLast4" | "pep" | "tos"

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
  if (fields.includes("dob")) {
    const parts = dobParts(input.dob ?? "", now)
    if (!parts) issues.dob = "Enter your date of birth."
    else if (age(parts, now) < 18) issues.dob = "You must be 18 or older to get paid."
  }
  if (fields.includes("address")) {
    if ((input.line1 ?? "").trim().length < 3) issues.line1 = "Enter your street address."
    if ((input.city ?? "").trim().length < 2) issues.city = "Enter your city."
    const postal = (input.postalCode ?? "").trim()
    if (cc === "US" ? !/^\d{5}(-\d{4})?$/.test(postal) : postal.length < 2 || postal.length > 12) issues.postalCode = "Enter your postal code."
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
  if (fields.includes("tos") && input.tos !== true) issues.tos = "Agree to continue."
  return issues
}
