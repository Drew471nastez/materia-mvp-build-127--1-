/**
 * ===========================================================================
 *  STATES AND PROVINCES: WHERE A ZONE CAN COVER PART OF A COUNTRY
 * ===========================================================================
 * The three countries sellers most often ship to by state: the United
 * States, Canada and Australia. A shipping zone can name some of their
 * states ("US-HI", "US-AK" for a Hawaii and Alaska rate), and the checkout
 * asks for the state from this list so the match is exact. Every other
 * country is shipped to whole, and its region is free text.
 *
 * Codes are ISO 3166-2 without the country: the address keeps "CA", the
 * zone keeps "US-CA".
 */

export interface Region {
  code: string
  name: string
}

const US: Region[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"],
  ["DE", "Delaware"], ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"], ["MD", "Maryland"],
  ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"], ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"],
  ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"], ["WV", "West Virginia"],
  ["WI", "Wisconsin"], ["WY", "Wyoming"], ["PR", "Puerto Rico"],
].map(([code, name]) => ({ code, name }))

const CA: Region[] = [
  ["AB", "Alberta"], ["BC", "British Columbia"], ["MB", "Manitoba"], ["NB", "New Brunswick"], ["NL", "Newfoundland and Labrador"], ["NS", "Nova Scotia"],
  ["NT", "Northwest Territories"], ["NU", "Nunavut"], ["ON", "Ontario"], ["PE", "Prince Edward Island"], ["QC", "Quebec"], ["SK", "Saskatchewan"], ["YT", "Yukon"],
].map(([code, name]) => ({ code, name }))

const AU: Region[] = [
  ["ACT", "Australian Capital Territory"], ["NSW", "New South Wales"], ["NT", "Northern Territory"], ["QLD", "Queensland"], ["SA", "South Australia"],
  ["TAS", "Tasmania"], ["VIC", "Victoria"], ["WA", "Western Australia"],
].map(([code, name]) => ({ code, name }))

export const REGIONS: Readonly<Record<string, Region[]>> = { US, CA, AU }

export function regionsOf(country: string | null | undefined): Region[] {
  return REGIONS[(country ?? "").toUpperCase()] ?? []
}

/** "California", "ca" or "CA" for the United States: "CA". Null when the country has no list or nothing matches. */
export function regionCode(country: string | null | undefined, value: string | null | undefined): string | null {
  const list = regionsOf(country)
  let v = (value ?? "").trim().toLowerCase()
  if (!list.length || !v) return null
  /* "US-CA", as Shopify themes and ISO 3166-2 write it. */
  const cc = (country ?? "").trim().toLowerCase()
  if (v.startsWith(`${cc}-`)) v = v.slice(cc.length + 1)
  const plain = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
  return (list.find((r) => r.code.toLowerCase() === v) ?? list.find((r) => r.name.toLowerCase() === v) ?? list.find((r) => plain(r.name.toLowerCase()) === plain(v)))?.code ?? null
}

/** "US-CA" from a country and a state typed or chosen; null when it is not one of the listed states. */
export function regionKey(country: string | null | undefined, value: string | null | undefined): string | null {
  const code = regionCode(country, value)
  return code ? `${(country ?? "").toUpperCase()}-${code}` : null
}

/** "California" from "US-CA"; the key itself when it is not known. */
export function regionLabel(key: string): string {
  const [country, code] = key.split("-")
  return regionsOf(country).find((r) => r.code === code)?.name ?? key
}

/** Keys a zone may store: listed states only, deduplicated. */
export function regionList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== "string") continue
    const [country, code] = raw.trim().toUpperCase().split("-")
    if (country && code && regionsOf(country).some((r) => r.code === code)) out.add(`${country}-${code}`)
  }
  return [...out].slice(0, 500)
}
