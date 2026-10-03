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
 * WHAT IS ASKED IS STRIPE'S LIST, NOT A GUESS. `eventually_due` is read as
 * well as `currently_due`, so a creator is asked once, up front, for what
 * Stripe will want as sales grow (maximum compliance, one sitting), and is
 * not interrupted later. Business profile fields are Storelib's to fill and
 * never reach the creator.
 *
 * Pure: the server module (own-form.ts) and the tests use it as it is.
 */

export type DetailField = "dob" | "address" | "state" | "phone" | "idNumber" | "ssnLast4" | "document" | "proofOfAddress" | "politicalExposure"

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
}

const MAP: Array<[RegExp, DetailField | "tos" | "bank" | "name" | "ours"]> = [
  [/^individual\.dob\./, "dob"],
  [/^individual\.address\.state$/, "state"],
  [/^individual\.address\./, "address"],
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

const ORDER: DetailField[] = ["dob", "address", "state", "phone", "idNumber", "ssnLast4", "politicalExposure", "document", "proofOfAddress"]

/** What the form must ask for, from the account's requirement lists. */
export function needsOf(req: { currently_due?: string[] | null; eventually_due?: string[] | null; past_due?: string[] | null; pending_verification?: string[] | null } | null | undefined): DetailsNeeds {
  const due = new Set([...(req?.past_due ?? []), ...(req?.currently_due ?? []), ...(req?.eventually_due ?? [])])
  const pending = new Set(req?.pending_verification ?? [])
  const fields = new Set<DetailField>()
  const other: string[] = []
  let tos = false
  let bank = false
  let name = false
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
    else if (what !== "ours") fields.add(what)
  }
  /* A state is only asked with the rest of the address. */
  if (fields.has("state")) fields.add("address")
  return { fields: ORDER.filter((f) => fields.has(f)), tos, bank, name, other, checking: due.size === 0 && pending.size > 0 }
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
export function detailIssues(input: DetailsInput, needs: DetailField[], opts: { tos: boolean; now?: Date }): Partial<Record<DetailField | "tos", string>> {
  const out: Partial<Record<DetailField | "tos", string>> = {}
  const now = opts.now ?? new Date()
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
  if (needs.includes("idNumber")) {
    const id = (input.idNumber ?? "").replace(/[\s.-]/g, "")
    if (!/^[A-Za-z0-9]{4,20}$/.test(id)) out.idNumber = "Enter your ID number exactly as on your document."
  }
  if (needs.includes("ssnLast4") && !/^\d{4}$/.test(input.ssnLast4 ?? "")) out.ssnLast4 = "Enter the last four digits of your SSN."
  if (needs.includes("politicalExposure") && input.politicalExposure !== "none" && input.politicalExposure !== "existing") out.politicalExposure = "Choose one."
  if (opts.tos && input.acceptTos !== true) out.tos = "Agree to continue."
  return out
}
