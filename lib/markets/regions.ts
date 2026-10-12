/**
 * Regions a market's countries can be added by in one tap (Settings ›
 * Markets and languages): ISO 3166 codes, the usual groupings. A country
 * already in another market is skipped when a region is added.
 */
export interface Region {
  id: string
  name: string
  countries: readonly string[]
}

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"] as const

export const REGIONS: readonly Region[] = [
  { id: "eu", name: "European Union", countries: EU },
  {
    id: "europe",
    name: "Europe",
    countries: [...EU, "GB", "NO", "CH", "IS", "LI", "MC", "SM", "VA", "AD", "AL", "BA", "ME", "MK", "RS", "XK", "MD", "UA", "BY", "GI", "IM", "JE", "GG", "FO", "AX"],
  },
  { id: "north-america", name: "North America", countries: ["US", "CA", "MX", "PR", "GL", "BM", "PM"] },
  {
    id: "latin-america",
    name: "Latin America and Caribbean",
    countries: ["AR", "BO", "BR", "CL", "CO", "EC", "GY", "PY", "PE", "SR", "UY", "VE", "BZ", "CR", "SV", "GT", "HN", "NI", "PA", "CU", "DO", "HT", "JM", "TT", "BS", "BB", "AG", "DM", "GD", "KN", "LC", "VC", "AW", "CW", "KY", "TC", "VG", "VI", "AI", "MS", "GP", "MQ", "GF", "BL", "MF", "SX", "BQ", "FK"],
  },
  {
    id: "asia",
    name: "Asia",
    countries: ["CN", "JP", "KR", "KP", "MN", "TW", "HK", "MO", "IN", "PK", "BD", "LK", "NP", "BT", "MV", "AF", "ID", "MY", "SG", "TH", "VN", "PH", "KH", "LA", "MM", "BN", "TL", "KZ", "KG", "TJ", "TM", "UZ"],
  },
  { id: "middle-east", name: "Middle East", countries: ["AE", "SA", "QA", "KW", "BH", "OM", "YE", "IL", "PS", "JO", "LB", "SY", "IQ", "IR", "TR", "CY", "GE", "AM", "AZ"] },
  {
    id: "africa",
    name: "Africa",
    countries: ["DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CD", "CG", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW", "RE", "YT", "EH", "SH"],
  },
  { id: "oceania", name: "Oceania", countries: ["AU", "NZ", "FJ", "PG", "SB", "VU", "WS", "TO", "KI", "TV", "NR", "PW", "FM", "MH", "NC", "PF", "GU", "MP", "AS", "CK", "NU", "WF", "NF", "TK", "PN"] },
]
