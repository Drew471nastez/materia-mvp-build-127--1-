import { isValidIban, normalizeIban } from "./iban"
import { payoutCountry, type BankFormat } from "./payout-countries"

export interface PayoutProfileInput {
  kind: "individual" | "business"
  country: string
  firstName: string
  lastName: string
  businessName?: string
  address: string
  city: string
  postalCode: string
  phone: string
  /** YYYY-MM-DD */
  dob: string
  accountHolder: string
  iban?: string
  ibanConfirm?: string
  routing?: string
  accountNumber?: string
  accountNumberConfirm?: string
  institution?: string
  transit?: string
}

export interface ParsedPayoutProfile {
  kind: "individual" | "business"
  country: string
  currency: string
  format: BankFormat
  firstName: string
  lastName: string
  businessName: string | null
  address: string
  city: string
  postalCode: string
  phone: string
  dob: { day: number; month: number; year: number }
  accountHolder: string
  /** Null when this country must finish the bank step inside Stripe. */
  externalAccount: {
    object: "bank_account"
    country: string
    currency: string
    account_holder_name: string
    account_holder_type: "individual" | "company"
    account_number: string
    routing_number?: string
  } | null
}

const NAME = /^[\p{L}][\p{L}\s'.-]{0,79}$/u

export function parsePayoutProfile(input: PayoutProfileInput): { ok: true; value: ParsedPayoutProfile } | { ok: false; error: string } {
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) return { ok: false, error: "Choose your country." }
  const rule = payoutCountry(country)
  const kind = input.kind === "business" ? "business" : "individual"
  const firstName = input.firstName.trim()
  const lastName = input.lastName.trim()
  if (!NAME.test(firstName)) return { ok: false, error: "Enter your first name as it appears on your ID." }
  if (!NAME.test(lastName)) return { ok: false, error: "Enter your last name as it appears on your ID." }
  const businessName = (input.businessName ?? "").trim()
  if (kind === "business" && businessName.length < 2) return { ok: false, error: "Enter the business name." }

  const address = input.address.trim()
  const city = input.city.trim()
  const postalCode = input.postalCode.trim()
  if (address.length < 3) return { ok: false, error: "Enter your address." }
  if (city.length < 2) return { ok: false, error: "Enter your city." }
  if (postalCode.length < 2 || postalCode.length > 12) return { ok: false, error: "Enter your postal code." }

  const phone = input.phone.replace(/[^\d+]/g, "")
  if (phone.replace(/\D/g, "").length < 8) return { ok: false, error: "Enter a phone number we can reach you on." }

  const dob = parseDob(input.dob)
  if (!dob) return { ok: false, error: "Enter your date of birth. You need to be 18 or older." }

  const accountHolder = input.accountHolder.trim()
  if (accountHolder.length < 2) return { ok: false, error: "Enter the name on the bank account." }

  const holderType = kind === "business" ? "company" : "individual"
  let externalAccount: ParsedPayoutProfile["externalAccount"] = null

  if (rule.format === "iban") {
    const iban = normalizeIban(input.iban ?? "")
    const confirm = normalizeIban(input.ibanConfirm ?? "")
    if (iban !== confirm) return { ok: false, error: "The two IBANs do not match." }
    if (!iban.startsWith(country)) return { ok: false, error: `Use an IBAN from ${country}.` }
    if (rule.ibanLength && iban.length !== rule.ibanLength) return { ok: false, error: "That IBAN is not the right length for this country." }
    if (!isValidIban(iban)) return { ok: false, error: "That IBAN could not be checked. Look at it again." }
    externalAccount = {
      object: "bank_account",
      country,
      currency: rule.currency,
      account_holder_name: accountHolder.slice(0, 100),
      account_holder_type: holderType,
      account_number: iban,
    }
  } else if (rule.format === "us") {
    const routing = (input.routing ?? "").replace(/\D/g, "")
    const account = (input.accountNumber ?? "").replace(/\D/g, "")
    const confirm = (input.accountNumberConfirm ?? "").replace(/\D/g, "")
    if (!/^\d{9}$/.test(routing) || !abaChecksum(routing)) return { ok: false, error: "Enter a 9-digit routing number." }
    if (account.length < 4 || account.length > 17) return { ok: false, error: "Enter the account number." }
    if (account !== confirm) return { ok: false, error: "The two account numbers do not match." }
    externalAccount = {
      object: "bank_account",
      country: "US",
      currency: "usd",
      account_holder_name: accountHolder.slice(0, 100),
      account_holder_type: holderType,
      account_number: account,
      routing_number: routing,
    }
  } else if (rule.format === "ca") {
    const institution = (input.institution ?? "").replace(/\D/g, "")
    const transit = (input.transit ?? "").replace(/\D/g, "")
    const account = (input.accountNumber ?? "").replace(/\D/g, "")
    const confirm = (input.accountNumberConfirm ?? "").replace(/\D/g, "")
    if (!/^\d{3}$/.test(institution) || !/^\d{5}$/.test(transit)) return { ok: false, error: "Enter the institution and transit numbers." }
    if (account.length < 5 || account.length > 12) return { ok: false, error: "Enter the account number." }
    if (account !== confirm) return { ok: false, error: "The two account numbers do not match." }
    externalAccount = {
      object: "bank_account",
      country: "CA",
      currency: "cad",
      account_holder_name: accountHolder.slice(0, 100),
      account_holder_type: holderType,
      account_number: account,
      routing_number: `${transit}-${institution}`,
    }
  } else if (rule.format === "au") {
    const bsb = (input.routing ?? "").replace(/\D/g, "")
    const account = (input.accountNumber ?? "").replace(/\D/g, "")
    const confirm = (input.accountNumberConfirm ?? "").replace(/\D/g, "")
    if (!/^\d{6}$/.test(bsb)) return { ok: false, error: "Enter a 6-digit BSB." }
    if (account.length < 5 || account.length > 10) return { ok: false, error: "Enter the account number." }
    if (account !== confirm) return { ok: false, error: "The two account numbers do not match." }
    externalAccount = {
      object: "bank_account",
      country: "AU",
      currency: "aud",
      account_holder_name: accountHolder.slice(0, 100),
      account_holder_type: holderType,
      account_number: account,
      routing_number: bsb,
    }
  }

  return {
    ok: true,
    value: {
      kind,
      country,
      currency: rule.currency,
      format: rule.format,
      firstName,
      lastName,
      businessName: kind === "business" ? businessName : null,
      address,
      city,
      postalCode,
      phone,
      dob,
      accountHolder,
      externalAccount,
    },
  }
}

function parseDob(value: string): { day: number; month: number; year: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const now = new Date()
  let age = now.getUTCFullYear() - year
  const beforeBirthday = now.getUTCMonth() + 1 < month || (now.getUTCMonth() + 1 === month && now.getUTCDate() < day)
  if (beforeBirthday) age -= 1
  if (age < 18 || age > 120) return null
  return { day, month, year }
}

function abaChecksum(routing: string): boolean {
  const d = routing.split("").map(Number)
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])
  return sum % 10 === 0
}
