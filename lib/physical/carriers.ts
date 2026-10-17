/**
 * ===========================================================================
 *  CARRIERS, THEIR LOGOS, AND THE PAGE EACH ONE TRACKS A PARCEL ON
 * ===========================================================================
 * The one list every physical commerce surface reads: the seller's carrier
 * picker (components/physical/carrier-picker.tsx), the logo on an order
 * (components/physical/carrier-logo.tsx), the tracking link in the buyer's
 * shipping email, order page and account, and the server that saves a
 * shipment. A carrier the seller types under Other is still matched by name
 * ("Evri", "Posta Romana", "fedex ground"), so the link and the logo are
 * there whenever the carrier is one we know.
 *
 * Each carrier has:
 *   id         stable, also its logo's file name (public/carriers/<id>.webp)
 *   name       as the seller and the buyer read it, and what is stored
 *   countries  where it is a first pick (ISO 3166 alpha-2), for the picker
 *   rank       its place worldwide, lower first
 *   track      its own tracking page, {n} standing for the number; checked
 *              against the live pages (round 27): a few answer bots with a
 *              challenge page, which a buyer's browser passes
 *   trackIn    the page a country's own network uses, where it differs
 *
 * Unknown carrier: no link is made up. The buyer sees the number on its own,
 * and the seller can paste the carrier's own link in the Tracking link field.
 *
 * Pure: the server, the order panel, the buyer's page and the tests read it.
 */

export interface Carrier {
  id: string
  /** As the seller and the buyer read it. */
  name: string
  /** Other ways a seller writes it, compared as lowercase letters and digits only. */
  aliases: string[]
  /** Where it is among the first picks, ISO 3166 alpha-2. */
  countries: string[]
  /** Its place worldwide: lower is more used. */
  rank: number
  /** The carrier's tracking page, {n} being the number. */
  track: string
  /** A country's own page for the same carrier (DPD in Romania runs its own system). */
  trackIn?: Record<string, string>
  /** The logo, a 96px tile in /public. */
  logo: string
  /**
   * The carrier's own official name where it differs from the short one every seller types ("United States
   * Postal Service" for USPS, "Poșta Română" for Posta Romana). Shown under the name in the picker and matched by
   * carrierOf(), so a value saved as the official name still finds its carrier. A plain fact, never a service.
   */
  official?: string
  /** The carrier's own tracking page for one number (already URL-encoded). */
  url: (q: string) => string
}

type Row = Omit<Carrier, "url" | "logo" | "rank">

/* In order of use worldwide: the rank is the place in this list. */
const ROWS: Row[] = [
  { id: "dhl-express", name: "DHL Express", aliases: ["dhlexpress", "dhlworldwide", "dhlintl"], countries: [], track: "https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id={n}" },
  { id: "ups", name: "UPS", aliases: ["ups", "unitedparcelservice", "upsground", "upsexpress"], countries: ["US", "CA", "DE", "GB"], track: "https://www.ups.com/track?tracknum={n}" },
  { id: "fedex", name: "FedEx", aliases: ["fedex", "fedexground", "fedexexpress", "federalexpress"], countries: ["US", "CA"], track: "https://www.fedex.com/fedextrack/?trknbr={n}" },
  { id: "usps", name: "USPS", aliases: ["usps", "unitedstatespostalservice", "uspostalservice"], countries: ["US"], track: "https://tools.usps.com/go/TrackConfirmAction?tLabels={n}" },
  /* DHL's parcel networks (Paket in Germany, Parcel, eCommerce): the one page reads every DHL number. "dhl" alone lands here too. */
  { id: "dhl", name: "DHL", aliases: ["dhl", "dhlpaket", "deutschepost", "dhlparcel", "dhlecommerce", "dhlparceluk", "dhlparcelnl"], countries: ["DE", "NL", "PL", "AT", "GB"], track: "https://www.dhl.com/global-en/home/tracking.html?tracking-id={n}&submit=1" },
  { id: "dpd", name: "DPD", aliases: ["dpd", "dpdgroup", "dpdro", "dpdromania", "dpduk", "dpdde", "dpdpl"], countries: ["DE", "GB", "FR", "PL", "RO", "NL", "BE", "AT", "IE"], track: "https://tracking.dpd.de/status/en_US/parcel/{n}", trackIn: { RO: "https://tracking.dpd.ro/?shipmentNumber={n}&language=ro" } },
  { id: "gls", name: "GLS", aliases: ["gls", "glsgroup", "glsromania", "glsro", "glsitaly", "glsspain"], countries: ["DE", "RO", "IT", "ES", "AT", "HU", "DK", "NL", "BE", "FR"], track: "https://gls-group.com/GROUP/en/parcel-tracking?match={n}" },
  { id: "amazon", name: "Amazon Logistics", aliases: ["amazon", "amazonlogistics", "amazonshipping", "amzl", "amzn"], countries: ["US", "GB", "DE"], track: "https://track.amazon.com/tracking/{n}" },
  { id: "royal-mail", name: "Royal Mail", aliases: ["royalmail", "parcelforce", "parcelforceworldwide"], countries: ["GB"], track: "https://www.royalmail.com/track-your-item#/tracking-results/{n}" },
  { id: "evri", name: "Evri", aliases: ["evri", "hermesuk", "myhermesuk"], countries: ["GB"], track: "https://www.evri.com/track/parcel/{n}" },
  { id: "tnt", name: "TNT", aliases: ["tnt", "tntexpress", "tntitaly"], countries: ["IT", "GB", "AU"], track: "https://www.tnt.com/express/en_gb/site/shipping-tools/tracking.html?searchType=con&cons={n}" },
  { id: "la-poste", name: "La Poste / Colissimo", aliases: ["laposte", "colissimo", "lapostecolissimo", "chronopost"], countries: ["FR"], track: "https://www.laposte.fr/outils/suivre-vos-envois?code={n}" },
  { id: "hermes", name: "Hermes", aliases: ["hermes", "hermesde", "myhermes", "hermesgermany"], countries: ["DE", "AT"], track: "https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#{n}" },
  { id: "postnl", name: "PostNL", aliases: ["postnl"], countries: ["NL", "BE"], track: "https://jouw.postnl.nl/track-and-trace/{n}" },
  { id: "poste-italiane", name: "Poste Italiane", aliases: ["posteitaliane", "italianpost", "poste", "postedelivery", "sda"], countries: ["IT"], track: "https://www.poste.it/cerca/index.html#/risultati-spedizioni/{n}" },
  { id: "correos", name: "Correos", aliases: ["correos", "correosspain", "correosexpress"], countries: ["ES"], track: "https://www.correos.es/es/en/tools/tracker/items/details?tracking-number={n}" },
  { id: "inpost", name: "InPost", aliases: ["inpost", "paczkomaty", "paczkomatinpost"], countries: ["PL", "GB", "IT"], track: "https://inpost.pl/sledzenie-przesylek?number={n}" },
  { id: "canada-post", name: "Canada Post", aliases: ["canadapost", "postescanada"], countries: ["CA"], track: "https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor={n}" },
  { id: "australia-post", name: "Australia Post", aliases: ["australiapost", "auspost", "startrack"], countries: ["AU"], track: "https://auspost.com.au/mypost/track/details/{n}" },
  { id: "fan-courier", name: "FAN Courier", aliases: ["fancourier", "fan"], countries: ["RO"], track: "https://www.fancourier.ro/awb-tracking/?tracking={n}" },
  { id: "sameday", name: "Sameday", aliases: ["sameday", "samedaycourier", "easybox"], countries: ["RO", "HU", "BG"], track: "https://sameday.ro/#awb={n}" },
  { id: "cargus", name: "Cargus", aliases: ["cargus", "urgentcargus"], countries: ["RO"], track: "https://www.cargus.ro/personal/urmareste-coletul/?tracking_number={n}" },
  { id: "posta-romana", name: "Posta Romana", aliases: ["postaromana", "romanianpost", "romaniapost", "cnpr"], countries: ["RO"], track: "https://www.posta-romana.ro/track-trace.html?id={n}" },
  { id: "postnord", name: "PostNord", aliases: ["postnord"], countries: ["SE", "DK", "NO", "FI"], track: "https://portal.postnord.com/tracking/details/{n}" },
  { id: "aramex", name: "Aramex", aliases: ["aramex"], countries: ["AE", "SA", "QA", "KW", "BH", "OM", "JO", "EG", "AU", "NZ"], track: "https://www.aramex.com/us/en/track/results?ShipmentNumber={n}" },
  { id: "an-post", name: "An Post", aliases: ["anpost"], countries: ["IE"], track: "https://www.anpost.com/Post-Parcels/Track/History?item={n}" },
  { id: "purolator", name: "Purolator", aliases: ["purolator"], countries: ["CA"], track: "https://www.purolator.com/en/shipping/tracker?pin={n}" },
]

const fill = (template: string, q: string) => template.replace("{n}", q)

/** Official names, where the one sellers type is a short form of it. */
const OFFICIAL: Record<string, string> = {
  usps: "United States Postal Service",
  ups: "United Parcel Service",
  gls: "General Logistics Systems",
  "fan-courier": "FAN Courier Express",
  "posta-romana": "Poșta Română",
  "la-poste": "La Poste",
  hermes: "Hermes Germany",
}

export const CARRIER_LIST: Carrier[] = ROWS.map((r, i) => ({ ...r, rank: i + 1, logo: `/carriers/${r.id}.webp`, ...(OFFICIAL[r.id] ? { official: OFFICIAL[r.id] } : {}), url: (q: string) => fill(r.track, q) }))

/**
 * What a seller shipping to a country reaches for first, most used first. A country not here gets the carriers that
 * name it, then the busiest worldwide.
 */
export const POPULAR_IN: Record<string, string[]> = {
  US: ["usps", "ups", "fedex", "dhl-express", "amazon"],
  CA: ["canada-post", "purolator", "ups", "fedex", "dhl-express"],
  GB: ["royal-mail", "evri", "dpd", "dhl", "ups", "amazon", "inpost"],
  IE: ["an-post", "dpd", "dhl-express", "ups", "fedex", "gls"],
  RO: ["fan-courier", "sameday", "cargus", "dpd", "gls", "posta-romana", "dhl-express"],
  DE: ["dhl", "hermes", "dpd", "gls", "ups", "amazon"],
  AT: ["dhl", "dpd", "gls", "hermes", "ups"],
  FR: ["la-poste", "dpd", "gls", "ups", "dhl-express"],
  IT: ["poste-italiane", "gls", "tnt", "dhl-express", "ups", "dpd", "inpost"],
  ES: ["correos", "gls", "dhl-express", "ups", "dpd"],
  NL: ["postnl", "dhl", "dpd", "ups", "gls"],
  BE: ["postnl", "dpd", "dhl", "gls", "ups"],
  PL: ["inpost", "dpd", "dhl", "gls", "ups"],
  SE: ["postnord", "dhl", "ups", "dpd"],
  DK: ["postnord", "gls", "dhl", "ups"],
  NO: ["postnord", "dhl", "ups"],
  FI: ["postnord", "dhl", "ups"],
  AU: ["australia-post", "aramex", "dhl-express", "tnt", "fedex", "ups"],
  NZ: ["aramex", "dhl-express", "fedex", "ups"],
  AE: ["aramex", "dhl-express", "fedex", "ups"],
}

/** Where to start when the country says nothing: the busiest carriers worldwide. */
const WORLDWIDE = ["dhl-express", "ups", "fedex", "dhl", "dpd", "gls"]

/** What the seller picks from: every carrier above, then Other (a name and a link of their own). */
export const CARRIER_NAMES: string[] = [...CARRIER_LIST.map((c) => c.name), "Other"]

/** The picker's two choices that are not a carrier: a name of the seller's own, and a parcel with no tracking. */
export const OTHER_CARRIER = "other"
export const NO_TRACKING = "none"

const key = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")

/** A name's letters and digits, accents folded: how two ways of writing a carrier are compared. */
export const carrierKey = key

/** The carrier a seller's words (or an id) name, or null when it is one we do not know. A name wins over an alias; the official name counts as a name. */
export function carrierOf(name: string | null | undefined): Carrier | null {
  const raw = (name ?? "").trim()
  const k = key(raw)
  if (!k) return null
  return CARRIER_LIST.find((c) => c.id === raw.toLowerCase()) ?? CARRIER_LIST.find((c) => key(c.name) === k || (!!c.official && key(c.official) === k)) ?? CARRIER_LIST.find((c) => c.aliases.includes(k)) ?? null
}

/**
 * THE CARRIER A PARCEL TO THIS COUNTRY MOST LIKELY GOES WITH, when the shop has said nothing (no default, nothing
 * shipped yet): the country's first pick (POPULAR_IN), else the busiest carrier that names it. Null for a country
 * none of them names: the seller is asked rather than handed the busiest carrier worldwide.
 */
export function nationalCarrierFor(country: string | null | undefined): Carrier | null {
  const cc = (country ?? "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(cc)) return null
  const first = POPULAR_IN[cc]?.[0]
  return (first ? CARRIER_LIST.find((c) => c.id === first) : null) ?? CARRIER_LIST.find((c) => c.countries.includes(cc)) ?? null
}

/**
 * The picker's lists for a country (the order's shipping country): its first picks, then every other carrier by name.
 * Popular is never empty.
 */
export function carrierChoices(country: string | null | undefined): { popular: Carrier[]; rest: Carrier[] } {
  const cc = (country ?? "").trim().toUpperCase()
  const byId = new Map(CARRIER_LIST.map((c) => [c.id, c]))
  let ids = POPULAR_IN[cc]
  if (!ids) {
    const local = cc ? CARRIER_LIST.filter((c) => c.countries.includes(cc)).map((c) => c.id) : []
    ids = [...new Set([...local, ...WORLDWIDE])].slice(0, 6)
  }
  const popular = ids.map((id) => byId.get(id)).filter((c): c is Carrier => !!c)
  const taken = new Set(popular.map((c) => c.id))
  const rest = CARRIER_LIST.filter((c) => !taken.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  return { popular, rest }
}

/** A tracking number as carriers print it, spaces taken out ("AB 1234 5678 9GB" is "AB123456789GB"). Null when empty. */
export function normaliseTrackingNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const n = raw.replace(/\s+/g, "").trim()
  return n || null
}

/**
 * A tracking link for a carrier we know and a number that looks like one; anything else shows the number alone.
 * The shipping country picks a carrier's own national page where it runs one.
 */
export function carrierTrackingUrl(carrier: string | null | undefined, number: string | null | undefined, country?: string | null): string | null {
  const n = normaliseTrackingNumber(number ?? "") ?? ""
  if (!n || !/^[A-Za-z0-9-]{4,40}$/.test(n)) return null
  const c = carrierOf(carrier)
  if (!c) return null
  const local = country ? c.trackIn?.[country.trim().toUpperCase()] : undefined
  return local ? fill(local, encodeURIComponent(n)) : c.url(encodeURIComponent(n))
}

/** The logo's path for a carrier we know (a name, an alias or an id), else null: the caller draws a neutral mark. */
export function carrierLogo(carrier: string | null | undefined): string | null {
  return carrierOf(carrier)?.logo ?? null
}

/**
 * THE TRACKING NUMBER RULE. Every carrier in the list, and any carrier the seller names under Other, gives a parcel a
 * number, and the buyer follows the parcel with it: so it is asked for. Only a parcel that has none (the seller
 * delivers it, or sends it untracked) goes without, and the seller says so by choosing Local delivery / no tracking,
 * which saves no carrier. Null when the pair is fine, else the reason, in the seller's words.
 */
export function trackingRuleProblem(carrier: string | null | undefined, number: string | null | undefined): string | null {
  const named = (carrier ?? "").trim()
  if (!named) return null
  if (normaliseTrackingNumber(number ?? "")) return null
  return `Add the tracking number. ${carrierOf(named)?.name ?? named} gives every parcel one, and the buyer follows the parcel with it. Nothing to track? Choose Local delivery / no tracking.`
}
