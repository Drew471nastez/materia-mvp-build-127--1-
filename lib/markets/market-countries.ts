/**
 * ===========================================================================
 *  WHICH COUNTRIES A MORE-CURRENCIES MARKET REALLY HOLDS
 * ===========================================================================
 * Two rules, applied wherever a visitor is placed in a market (the proxy,
 * the live site, an imported theme's country list, checkout and the
 * builder's preview), so a market saved before these rules reads the same:
 *
 *   the store's own country is never in one: a visitor there always sees
 *   the store currency, whatever a market lists (the owner, a store in
 *   Romania whose "BRL for 239 countries" had Romania in it)
 *
 *   "All other countries" (`rest`) is a flag, not a list: every country
 *   except the store's own and those in another market, worked out when it
 *   is read, so it stays right when a country is added to another market
 *   or to the list of countries itself
 *
 * A market's countries come back with its most natural one first (Brazil
 * for BRL), which is the one the website's selector names it by.
 *
 * Pure. Reads no settings: the caller says which country is the store's.
 */
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { COUNTRY_CURRENCY } from "@/lib/store/selling-currency"

/** A market as these rules read it; every other field is kept as it is. */
export interface CountryScope {
  countries: string[]
  primary?: boolean
  active?: boolean
  /** All other countries: every one not the store's and not in another market. */
  rest?: boolean
  currency?: string | null
}

const code = (c: unknown): string | null => (typeof c === "string" && /^[A-Za-z]{2}$/.test(c.trim()) ? c.trim().toUpperCase() : null)

/** The store's own country: Settings › Store currency's, else the home market's first. */
export function storeHomeCountry(storeCountry: string | null | undefined, markets: readonly CountryScope[]): string | null {
  return code(storeCountry) ?? code(markets.find((m) => m.primary)?.countries?.[0]) ?? null
}

/** The one country whose own currency this is (RON: Romania), or null when several share it (EUR) or none: a store with no country set is placed by it. */
export function countryOfCurrency(currency: unknown): string | null {
  const cur = typeof currency === "string" ? currency.trim().toUpperCase() : ""
  if (!/^[A-Z]{3}$/.test(cur)) return null
  const all = Object.entries(COUNTRY_CURRENCY).filter(([, k]) => k === cur).map(([c]) => c)
  return all.length === 1 ? all[0] : null
}

/** The country a market's visitors are most naturally from: the one whose own currency it is (Brazil for BRL), else its first. */
export function naturalCountry(currency: string | null | undefined, countries: readonly string[]): string | null {
  if (countries.length === 0) return null
  const cur = typeof currency === "string" ? currency.toUpperCase() : ""
  if (cur) {
    for (const [c, k] of Object.entries(COUNTRY_CURRENCY)) if (k === cur && countries.includes(c)) return c
    /* A currency named for its country (BRL, PLN, CHF): the first two letters. */
    if (countries.includes(cur.slice(0, 2))) return cur.slice(0, 2)
  }
  return countries[0]
}

/**
 * Every market with the countries a visitor is placed by: the store's own
 * country out of each that is not home, and "All other countries" spelled
 * out. Only the first market marked `rest` is; a later one keeps its list.
 */
export function resolveMarketCountries<T extends CountryScope>(markets: readonly T[], storeCountry: string | null | undefined): T[] {
  const home = storeHomeCountry(storeCountry, markets)
  const restAt = markets.findIndex((m) => !m.primary && m.rest === true)
  const taken = new Set<string>()
  markets.forEach((m, i) => {
    if (i === restAt || m.active === false) return
    for (const c of m.countries ?? []) {
      const k = code(c)
      if (k) taken.add(k)
    }
  })
  return markets.map((m, i) => {
    if (m.primary) return m
    const listed =
      i === restAt
        ? [...COUNTRY_CODES].filter((c) => c !== home && !taken.has(c))
        : (m.countries ?? []).map(code).filter((c): c is string => !!c && c !== home)
    const unique = [...new Set(listed)]
    const first = naturalCountry(m.currency, unique)
    const countries = first ? [first, ...unique.filter((c) => c !== first)] : unique
    return { ...m, countries }
  })
}
