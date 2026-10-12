/**
 * A delivery address, as typed at checkout, made safe and checked. The
 * country must be a real ISO code (lib/checkout/countries) because shipping
 * zones match on it; a postal code is asked for wherever the post uses one.
 */

import { COUNTRY_CODES, countryName } from "@/lib/checkout/countries"
import { DEFAULT_CHECKOUT, type CheckoutConfig } from "@/lib/store/checkout-config"
import type { Address } from "./types"
import { addressFormat } from "@/lib/address/format"

/** Countries whose post works without postal codes; everywhere else one is required. */
const NO_POSTAL_CODE = new Set(
  "AE AG AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GA GD GH GM GQ GY HK JM KI KM KN KP LC ML MO MR MW NR NU QA RW SB SC SL SO SR ST SY TF TG TK TL TO TT TV TZ UG VU YE ZW".split(" "),
)

export function postalCodeRequired(country: string): boolean {
  return !NO_POSTAL_CODE.has(country.toUpperCase())
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : ""
}

export type AddressCheck = { ok: true; address: Address } | { ok: false; error: string; field: keyof Address }

/**
 * `rules` is the store's Settings › Checkout (lib/store/checkout-config): a
 * field it turns off is dropped whatever was sent, and one it requires is
 * refused when empty. Without it, what checkout always asked.
 */
export function readAddress(input: unknown, rules: Pick<CheckoutConfig, "nameFields" | "company" | "phone" | "address2"> = DEFAULT_CHECKOUT): AddressCheck {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const country = text(raw.country, 2).toUpperCase()
  const address: Address = {
    name: text(raw.name, 120),
    line1: text(raw.line1, 200),
    line2: rules.address2 === "off" ? null : text(raw.line2, 200) || null,
    city: text(raw.city, 120),
    region: text(raw.region, 120) || null,
    postalCode: text(raw.postalCode, 20).toUpperCase() || null,
    country,
    phone: rules.phone === "off" ? null : text(raw.phone, 40) || null,
    ...(rules.company === "off" ? {} : { company: text(raw.company, 120) || null }),
  }
  if (!address.name) return { ok: false, error: "Enter the name for delivery.", field: "name" }
  if (rules.nameFields === "first_and_last" && !/\S+\s+\S+/.test(address.name)) return { ok: false, error: "Enter your first and last name.", field: "name" }
  if (rules.company === "required" && !address.company) return { ok: false, error: "Enter the company name.", field: "company" }
  if (!COUNTRY_CODES.has(country)) return { ok: false, error: "Choose a country.", field: "country" }
  if (!address.line1) return { ok: false, error: "Enter the street address.", field: "line1" }
  if (rules.address2 === "required" && !address.line2) return { ok: false, error: "Enter the apartment, suite or unit.", field: "line2" }
  if (!address.city) return { ok: false, error: "Enter the city.", field: "city" }
  /* The US, Canada, Australia and the rest whose post needs the state or province (lib/address/format): a label can't be bought without it. */
  if (addressFormat(country).region?.required && !address.region) return { ok: false, error: `Choose the ${addressFormat(country).region!.label.toLowerCase()}.`, field: "region" }
  if (postalCodeRequired(country) && !address.postalCode) return { ok: false, error: "Enter the postal code.", field: "postalCode" }
  if (address.postalCode && !/^[A-Z0-9][A-Z0-9 -]{1,18}$/.test(address.postalCode)) return { ok: false, error: "Check the postal code.", field: "postalCode" }
  if (rules.phone === "required" && !address.phone) return { ok: false, error: "Enter a phone number for the delivery.", field: "phone" }
  if (address.phone && !/^[+()0-9 .-]{5,40}$/.test(address.phone)) return { ok: false, error: "Check the phone number.", field: "phone" }
  return { ok: true, address }
}

/** The address as lines for a label, an email or the order page. */
export function addressLines(a: Partial<Address> | null | undefined): string[] {
  if (!a) return []
  const cityLine = [a.city, a.region, a.postalCode].filter(Boolean).join(", ")
  return [a.name, a.company, a.line1, a.line2, cityLine, a.country ? countryName(a.country) : null, a.phone].filter((l): l is string => typeof l === "string" && l.trim() !== "")
}
