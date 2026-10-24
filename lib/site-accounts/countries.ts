import { COUNTRIES, COUNTRY_CODES } from "@/lib/checkout/countries"

/**
 * The countries an address can be in, for the account's address form: the
 * checkout's own list (lib/checkout/countries), so an address saved here is
 * one checkout ships to, named in the page's language and sorted in it.
 * English names, as checkout lists them, when the language has none.
 */
export function countryChoices(locale: string | null | undefined): { code: string; name: string }[] {
  if (!locale || /^en\b/i.test(locale)) return COUNTRIES
  try {
    const names = new Intl.DisplayNames([locale], { type: "region" })
    return [...COUNTRY_CODES]
      .map((code) => ({ code, name: (code === "XK" ? null : names.of(code)) || COUNTRIES.find((c) => c.code === code)?.name || code }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
  } catch {
    return COUNTRIES
  }
}
