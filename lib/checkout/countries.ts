/**
 * Every country a buyer or a company can be in, by ISO 3166-1 code, with
 * its English name from the platform itself (Intl.DisplayNames) rather than
 * a hand-typed list that drifts. The checkout used to offer seventy.
 */

const CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT " +
  "MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG " +
  "UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"

export const COUNTRY_CODES: ReadonlySet<string> = new Set(CODES.split(" "))

let names: Intl.DisplayNames | null = null
function display(): Intl.DisplayNames | null {
  if (names) return names
  try {
    names = new Intl.DisplayNames(["en"], { type: "region" })
  } catch {
    names = null
  }
  return names
}

export function countryName(code: string): string {
  if (code === "XK") return "Kosovo"
  return display()?.of(code) ?? code
}

/** All of them, by name. */
export const COUNTRIES: { code: string; name: string }[] = [...COUNTRY_CODES]
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name))

/** Names people type that are not the platform's own name for the country. */
const ALIASES: Record<string, string> = {
  usa: "US",
  "u.s.": "US",
  "u.s.a.": "US",
  "united states of america": "US",
  america: "US",
  uk: "GB",
  "u.k.": "GB",
  "great britain": "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  holland: "NL",
  "the netherlands": "NL",
  "south korea": "KR",
  "korea, republic of": "KR",
  russia: "RU",
  "czech republic": "CZ",
  turkey: "TR",
  "ivory coast": "CI",
  uae: "AE",
}

let byName: Map<string, string> | null = null

/**
 * The ISO code for what a profile holds, which may be a code ("US", "us")
 * or a name ("United States"). Stripe takes only the code: a name made the
 * payout signup fail with "Country 'United States' is unknown". Null when
 * it is neither.
 */
export function countryCode(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  const upper = text.toUpperCase()
  if (upper.length === 2 && COUNTRY_CODES.has(upper)) return upper
  const key = text.toLowerCase().replace(/\s+/g, " ")
  if (ALIASES[key]) return ALIASES[key]
  if (!byName) byName = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c.code]))
  return byName.get(key) ?? null
}
