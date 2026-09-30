/**
 * What the creator sees while setting up payments.
 * Country changes which Stripe step comes next. It does not add a company
 * form for an individual, and it does not pick a payout currency.
 */

export type SetupKind = "individual" | "business"
export type OnboardingBeat = "personal" | "verification" | "bank" | "review" | "done"

export function personalFields(kind: SetupKind): Array<"businessName" | "firstName" | "lastName"> {
  if (kind === "business") return ["businessName", "firstName", "lastName"]
  return ["firstName", "lastName"]
}

export type BankFormat = "iban" | "us" | "gb" | "au" | "ca" | "nz" | "other"

const IBAN_COUNTRIES = new Set([
  "AD", "AE", "AT", "BE", "BG", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GI", "GR", "HR", "HU",
  "IE", "IL", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MT", "NL", "NO", "PL", "PT", "RO", "SA", "SE", "SI",
  "SK", "SM", "TR",
])

/**
 * Which bank fields a country's payout account is written with. The numbers
 * go from the browser straight to Stripe as a token, never to Storelib.
 */
export function bankFormat(country: string | null | undefined): BankFormat {
  const cc = (country ?? "").trim().toUpperCase()
  if (IBAN_COUNTRIES.has(cc)) return "iban"
  if (cc === "US") return "us"
  if (cc === "GB") return "gb"
  if (cc === "AU") return "au"
  if (cc === "CA") return "ca"
  if (cc === "NZ") return "nz"
  return "other"
}

export interface BankInput {
  format: BankFormat
  holder: string
  iban?: string
  ibanConfirm?: string
  account?: string
  accountConfirm?: string
  routing?: string
  institution?: string
  transit?: string
  owns: boolean
}

export function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s+/g, "").toUpperCase()
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false
  const moved = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const ch of moved) {
    const n = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of n) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

const digits = (v: string | undefined) => (v ?? "").replace(/[\s-]+/g, "")

export function bankIssues(input: BankInput, country: string): Partial<Record<"holder" | "iban" | "ibanConfirm" | "account" | "accountConfirm" | "routing" | "institution" | "transit" | "owns", string>> {
  const issues: ReturnType<typeof bankIssues> = {}
  if (input.holder.trim().length < 2) issues.holder = "Enter the name on the account."
  if (input.format === "iban") {
    const iban = digits(input.iban).toUpperCase()
    if (!ibanValid(iban)) issues.iban = "Enter a valid IBAN."
    else if (iban.slice(0, 2) !== country.toUpperCase()) issues.iban = "Use an IBAN from your country."
    if (!issues.iban && digits(input.ibanConfirm).toUpperCase() !== iban) issues.ibanConfirm = "The IBANs do not match."
  } else {
    const account = digits(input.account)
    const accountOk =
      input.format === "us" ? /^\d{4,17}$/.test(account)
      : input.format === "gb" ? /^\d{8}$/.test(account)
      : input.format === "au" ? /^\d{5,9}$/.test(account)
      : input.format === "ca" ? /^\d{7,12}$/.test(account)
      : input.format === "nz" ? /^\d{15,16}$/.test(account)
      : /^[A-Za-z0-9]{4,34}$/.test(account)
    if (!accountOk) issues.account = "Enter a valid account number."
    if (!issues.account && digits(input.accountConfirm) !== account) issues.accountConfirm = "The account numbers do not match."
    const routing = digits(input.routing)
    if (input.format === "us" && !/^\d{9}$/.test(routing)) issues.routing = "Enter the 9 digit routing number."
    if (input.format === "gb" && !/^\d{6}$/.test(routing)) issues.routing = "Enter the 6 digit sort code."
    if (input.format === "au" && !/^\d{6}$/.test(routing)) issues.routing = "Enter the 6 digit BSB."
    if (input.format === "ca") {
      if (!/^\d{5}$/.test(digits(input.transit))) issues.transit = "Enter the 5 digit transit number."
      if (!/^\d{3}$/.test(digits(input.institution))) issues.institution = "Enter the 3 digit institution number."
    }
  }
  if (!input.owns) issues.owns = "Confirm the account is yours."
  return issues
}

/** What Stripe.js is given to make the token. */
export function bankTokenFields(input: BankInput): { account_number: string; routing_number?: string } {
  if (input.format === "iban") return { account_number: digits(input.iban).toUpperCase() }
  const account_number = digits(input.account)
  if (input.format === "ca") return { account_number, routing_number: `${digits(input.transit)}-${digits(input.institution)}` }
  if (input.format === "nz" || input.format === "other") {
    const routing = digits(input.routing)
    return routing ? { account_number, routing_number: routing } : { account_number }
  }
  return { account_number, routing_number: digits(input.routing) }
}

export function beatFromRequirements(input: {
  hasAccount: boolean
  detailsSubmitted: boolean
  hasBank: boolean
  currentlyDue: string[]
  pastDue: string[]
  pendingVerification: string[]
  chargesEnabled: boolean
  payoutsEnabled: boolean
}): OnboardingBeat {
  if (!input.hasAccount) return "personal"
  if (input.chargesEnabled && input.payoutsEnabled && input.detailsSubmitted && input.pastDue.length === 0 && input.currentlyDue.length === 0) {
    return "done"
  }
  const due = [...input.currentlyDue, ...input.pastDue]
  const bankDue = due.some((field) => /external_account|bank_account/.test(field)) || !input.hasBank
  const identityDue = due.some((field) => /verification|document|dob|address|phone|id_number|ssn|tos|company\.|individual\.|business_profile|representative|owners|directors|executives/.test(field))
  /* The details form is finished once only the bank is left, even before Stripe marks it submitted. */
  const detailsDone = input.detailsSubmitted || (due.length > 0 && !identityDue)
  if (input.pendingVerification.length > 0 && due.length === 0 && input.hasBank) return "review"
  if (!detailsDone || identityDue) return "verification"
  if (bankDue) return "bank"
  return "review"
}

export function creatorStatusLabel(beat: OnboardingBeat, actionRequired: boolean): string {
  if (beat === "done") return "Payments active"
  if (actionRequired) return "Action required"
  if (beat === "bank") return "Add payout account"
  if (beat === "review") return "Under review"
  if (beat === "verification") return "Verify your details"
  return "Action required"
}

const NAME = /^[\p{L}][\p{L}\s'.-]{0,79}$/u

export function personalIssues(input: {
  kind: string
  country: string
  firstName: string
  lastName: string
  businessName?: string
}): Partial<Record<"country" | "firstName" | "lastName" | "businessName", string>> {
  const issues: Partial<Record<"country" | "firstName" | "lastName" | "businessName", string>> = {}
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) issues.country = "Choose your country."
  if (!NAME.test(input.firstName.trim())) issues.firstName = "Enter your first name."
  if (!NAME.test(input.lastName.trim())) issues.lastName = "Enter your last name."
  if (input.kind === "business" && (input.businessName ?? "").trim().length < 2) issues.businessName = "Enter the business name."
  return issues
}

export function parsePersonal(input: {
  kind: string
  country: string
  firstName: string
  lastName: string
  businessName?: string
}): { ok: true; value: { kind: SetupKind; country: string; firstName: string; lastName: string; businessName: string | null } } | { ok: false; error: string } {
  const issues = personalIssues(input)
  const error = issues.country || issues.firstName || issues.lastName || issues.businessName
  if (error) return { ok: false, error }
  const kind: SetupKind = input.kind === "business" ? "business" : "individual"
  return {
    ok: true,
    value: {
      kind,
      country: input.country.trim().toUpperCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      businessName: kind === "business" ? (input.businessName ?? "").trim() : null,
    },
  }
}
