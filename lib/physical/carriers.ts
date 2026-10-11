/**
 * ===========================================================================
 *  CARRIERS, AND THE PAGE EACH ONE TRACKS A PARCEL ON
 * ===========================================================================
 * The list the seller picks from when they mark an order shipped
 * (components/physical/order-panel.tsx), and the tracking link the buyer's
 * shipping email, order page and account show. A carrier the seller types
 * under Other is still matched by name ("Evri", "Posta Romana", "fedex
 * ground"), so the link is made whenever the carrier is one we know.
 *
 * Unknown carrier: no link is made up. The buyer sees the number on its own,
 * and the seller can paste the carrier's own link in the Tracking link field.
 *
 * Pure: the server, the order panel and the tests read the same list.
 */

export interface Carrier {
  /** As the seller and the buyer read it. */
  name: string
  /** Other ways a seller writes it, compared as lowercase letters and digits only. */
  aliases: string[]
  /** The carrier's own tracking page for one number (already URL-encoded). */
  url: (q: string) => string
}

export const CARRIER_LIST: Carrier[] = [
  { name: "USPS", aliases: ["usps", "unitedstatespostalservice", "uspostalservice"], url: (q) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${q}` },
  { name: "UPS", aliases: ["ups", "unitedparcelservice", "upsground", "upsexpress"], url: (q) => `https://www.ups.com/track?tracknum=${q}` },
  { name: "FedEx", aliases: ["fedex", "fedexground", "fedexexpress", "federalexpress"], url: (q) => `https://www.fedex.com/fedextrack/?trknbr=${q}` },
  { name: "DHL Express", aliases: ["dhlexpress", "dhl"], url: (q) => `https://www.dhl.com/global-en/home/tracking/tracking-express.html?submit=1&tracking-id=${q}` },
  { name: "DHL Paket", aliases: ["dhlpaket", "deutschepost", "dhlparcel", "dhlecommerce"], url: (q) => `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${q}` },
  { name: "Royal Mail", aliases: ["royalmail", "parcelforce"], url: (q) => `https://www.royalmail.com/track-your-item#/tracking-results/${q}` },
  { name: "Evri", aliases: ["evri", "hermesuk", "myhermesuk"], url: (q) => `https://www.evri.com/track/parcel/${q}` },
  { name: "Hermes", aliases: ["hermes", "hermesde", "myhermes", "hermesgermany"], url: (q) => `https://www.myhermes.de/empfangen/sendungsverfolgung/sendungsinformation/#${q}` },
  { name: "DPD", aliases: ["dpd", "dpdgroup", "dpdro", "dpdromania", "dpduk", "dpdde"], url: (q) => `https://tracking.dpd.de/status/en_US/parcel/${q}` },
  { name: "GLS", aliases: ["gls", "glsgroup", "glsromania", "glsro"], url: (q) => `https://gls-group.com/track/${q}` },
  { name: "FAN Courier", aliases: ["fancourier", "fan"], url: (q) => `https://www.fancourier.ro/awb-tracking/?tracking=${q}` },
  { name: "Sameday", aliases: ["sameday", "samedaycourier", "easybox"], url: (q) => `https://sameday.ro/#awb=${q}` },
  { name: "Cargus", aliases: ["cargus", "urgentcargus"], url: (q) => `https://www.cargus.ro/personal/urmareste-coletul/?tracking_number=${q}` },
  { name: "Posta Romana", aliases: ["postaromana", "romanianpost", "romaniapost", "cnpr"], url: (q) => `https://www.posta-romana.ro/track-trace.html?id=${q}` },
  { name: "Canada Post", aliases: ["canadapost", "postescanada"], url: (q) => `https://www.canadapost-postescanada.ca/track-reperage/en#/search?searchFor=${q}` },
  { name: "Australia Post", aliases: ["australiapost", "auspost", "startrack"], url: (q) => `https://auspost.com.au/mypost/track/details/${q}` },
  { name: "PostNL", aliases: ["postnl"], url: (q) => `https://jouw.postnl.nl/track-and-trace/${q}` },
  { name: "La Poste / Colissimo", aliases: ["laposte", "colissimo", "lapostecolissimo", "chronopost"], url: (q) => `https://www.laposte.fr/outils/suivre-vos-envois?code=${q}` },
  { name: "Aramex", aliases: ["aramex"], url: (q) => `https://www.aramex.com/us/en/track/results?ShipmentNumber=${q}` },
  { name: "InPost", aliases: ["inpost", "paczkomaty"], url: (q) => `https://inpost.pl/sledzenie-przesylek?number=${q}` },
  { name: "PostNord", aliases: ["postnord"], url: (q) => `https://www.postnord.com/en/tracking?id=${q}` },
  { name: "Correos", aliases: ["correos", "correosspain"], url: (q) => `https://www.correos.es/es/en/tools/tracker/items/details?tracking-number=${q}` },
  { name: "Poste Italiane", aliases: ["posteitaliane", "italianpost"], url: (q) => `https://www.poste.it/cerca/index.html#/risultati-spedizioni/${q}` },
  { name: "An Post", aliases: ["anpost"], url: (q) => `https://www.anpost.com/Post-Parcels/Track/History?item=${q}` },
  { name: "Purolator", aliases: ["purolator"], url: (q) => `https://www.purolator.com/en/shipping/tracker?pin=${q}` },
]

/** What the seller picks from: every carrier above, then Other (a name and a link of their own). */
export const CARRIER_NAMES: string[] = [...CARRIER_LIST.map((c) => c.name), "Other"]

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** The carrier a seller's words name, or null when it is one we do not know. */
export function carrierOf(name: string | null | undefined): Carrier | null {
  const k = key(name ?? "")
  if (!k) return null
  return CARRIER_LIST.find((c) => key(c.name) === k || c.aliases.includes(k)) ?? null
}

/** A tracking number as carriers print it, spaces taken out ("AB 1234 5678 9GB" is "AB123456789GB"). Null when empty. */
export function normaliseTrackingNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const n = raw.replace(/\s+/g, "").trim()
  return n || null
}

/** A tracking link for a carrier we know and a number that looks like one; anything else shows the number alone. */
export function carrierTrackingUrl(carrier: string | null | undefined, number: string | null | undefined): string | null {
  const n = normaliseTrackingNumber(number ?? "") ?? ""
  if (!n || !/^[A-Za-z0-9-]{4,40}$/.test(n)) return null
  const c = carrierOf(carrier)
  return c ? c.url(encodeURIComponent(n)) : null
}
