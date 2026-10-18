/**
 * ===========================================================================
 *  THE CARRIERS ONE SHOP PICKS FROM, AND THE ONE IT PICKS FIRST
 * ===========================================================================
 * The shop's own side of the carrier picker (components/physical/
 * carrier-picker.tsx, carrier-live.tsx): which carriers it starred, which
 * one it set as its default, which one it used last, and the carriers it
 * added itself because no list has them (a local courier, a man with a van).
 * Kept per creator in `physical_carrier_prefs` (run-now part 233,
 * ./carrier-prefs-server.ts).
 *
 * Pure, and the picker, the API route and the tests read the same rules.
 *
 * ===========================================================================
 *  WHAT IS A FACT AND WHAT IS LIVE
 * ===========================================================================
 * Nothing here invents a carrier's services, its delivery promise or its
 * prices. A CarrierOption carries `services` ONLY when it came from a
 * connected provider's own answer (`source: "provider"`), and the picker
 * draws a price or an estimate only from those. ./carriers.ts holds what is
 * a plain fact about a carrier and does not go out of date: its name and
 * official name, its logo, its tracking page and where it is a first pick.
 */

import { carrierKey, carrierOf, nationalCarrierFor, type Carrier } from "./carriers"

/** How many carriers a shop can star, and how many of its own it can add. */
export const MAX_FAVOURITES = 12
export const MAX_CUSTOM_CARRIERS = 20
/** The run-now part the shop's carriers are kept by. */
export const CARRIER_PREFS_SQL_PART = "233"

/** Where the number goes in a custom carrier's tracking link. */
export const TRACKING_PLACEHOLDER = "{tracking}"

export interface CustomCarrier {
  /** Letters, digits and dashes, made from the name: what a shipment's carrier column holds is still the name. */
  id: string
  name: string
  /** The carrier's own tracking page with {tracking} where the number goes, or null when it has none. */
  urlTemplate: string | null
}

export interface CarrierPrefs {
  /** Carrier names, as the picker saves them, newest star last. */
  favourites: string[]
  /** The carrier a new shipment starts with, whatever the destination. */
  defaultCarrier: string | null
  /** The last carrier this shop actually shipped with. */
  lastCarrier: string | null
  custom: CustomCarrier[]
}

export const EMPTY_CARRIER_PREFS: CarrierPrefs = { favourites: [], defaultCarrier: null, lastCarrier: null, custom: [] }

/* ── a carrier as the picker lists it ─────────────────────────────────── */

/** One service a connected provider returned for this shipment. Never written by hand. */
export interface CarrierService {
  /** The provider's own words: "Priority Mail", "Ground Advantage". */
  name: string
  /** Days, as the provider gave them; null when it gave none. */
  days: number | null
  /** Already formatted in the provider's currency; null when the provider priced nothing. */
  price: string | null
}

export type CarrierSource = "provider" | "static" | "custom"

export interface CarrierOption {
  /** What is saved on the shipment, and what carrierOf() is given. */
  value: string
  /** The carrier's id in lib/physical/carriers.ts when it is one we know, else null. */
  id: string | null
  name: string
  official: string | null
  countries: string[]
  logo: string | null
  /** Searched as well as the name, never shown. */
  aliases: string[]
  source: CarrierSource
  /** Only on a provider option: which connected app answered. */
  provider?: { id: string; name: string }
  /** Only on a provider option: the services that provider returned for this shipment. */
  services?: CarrierService[]
}

export function optionOfCarrier(c: Carrier): CarrierOption {
  return {
    value: c.name,
    id: c.id,
    name: c.name,
    official: c.official ?? null,
    countries: c.countries,
    logo: c.logo ?? null,
    aliases: c.aliases,
    source: "static",
  }
}

/**
 * A CARRIER A PROVIDER NAMED, with the services it priced. `services` is
 * what the provider answered and nothing else: no row is added for a service
 * it did not return, and a service it priced at nothing carries a null price
 * rather than a zero.
 */
export function optionOfProviderCarrier(input: { carrier: string; provider: { id: string; name: string }; services: CarrierService[] }): CarrierOption {
  /* A provider writes "USPS", "usps" or "United Parcel Service": where it is one we know, the name we save is ours, so the tracking link still works. */
  const known = carrierOf(input.carrier)
  const base = known ? optionOfCarrier(known) : { value: input.carrier, id: null, name: input.carrier, official: null, countries: [] as string[], logo: null, aliases: [] as string[] }
  return { ...base, source: "provider", provider: input.provider, services: input.services }
}

/* ── the shop's own carriers ────────────────────────────────────────────── */

const SAFE_NAME = /^[\p{L}\p{N} .,'&()/-]{1,40}$/u

export function customCarrierId(name: string): string {
  const slug = carrierKey(name).slice(0, 32)
  return slug || "carrier"
}

/** A name and link the shop typed, or the sentence to show it. The link needs {tracking} so a number can go in it. */
export function cleanCustomCarrier(input: unknown): { ok: true; carrier: CustomCarrier } | { ok: false; error: string } {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ") : ""
  if (!name) return { ok: false, error: "Give the carrier a name." }
  if (!SAFE_NAME.test(name)) return { ok: false, error: "A carrier name is up to 40 letters, digits, spaces and . , ' & ( ) / -" }
  if (carrierOf(name)) return { ok: false, error: `${name} is already in the list.` }
  const raw = typeof o.urlTemplate === "string" ? o.urlTemplate.trim() : ""
  if (!raw) return { ok: true, carrier: { id: customCarrierId(name), name, urlTemplate: null } }
  if (raw.length > 500) return { ok: false, error: "That tracking link is too long." }
  if (!/^https:\/\/[^\s"'<>]+$/.test(raw)) return { ok: false, error: "The tracking link must start with https:// and hold no spaces." }
  if (!raw.includes(TRACKING_PLACEHOLDER)) return { ok: false, error: `Put ${TRACKING_PLACEHOLDER} in the link where the tracking number goes.` }
  return { ok: true, carrier: { id: customCarrierId(name), name, urlTemplate: raw } }
}

export function readCustomCarrierRow(row: unknown): CustomCarrier | null {
  const clean = cleanCustomCarrier(row)
  if (clean.ok) return clean.carrier
  /* A row saved before a carrier of that name joined our own list: keep the name, drop nothing. */
  const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
  const name = typeof o.name === "string" ? o.name.trim().replace(/\s+/g, " ") : ""
  if (!name || !SAFE_NAME.test(name)) return null
  const raw = typeof o.urlTemplate === "string" ? o.urlTemplate.trim() : ""
  const url = /^https:\/\/[^\s"'<>]+$/.test(raw) && raw.includes(TRACKING_PLACEHOLDER) && raw.length <= 500 ? raw : null
  return { id: customCarrierId(name), name, urlTemplate: url }
}

/** A custom carrier's tracking page for one number, or null when it has no link. */
export function customTrackingUrl(carrier: CustomCarrier | null | undefined, number: string | null | undefined): string | null {
  const n = (number ?? "").replace(/\s+/g, "").trim()
  if (!carrier?.urlTemplate || !n || !/^[A-Za-z0-9-]{4,40}$/.test(n)) return null
  return carrier.urlTemplate.split(TRACKING_PLACEHOLDER).join(encodeURIComponent(n))
}

/** The shop's own carrier of that name, however it was typed. */
export function customCarrierOf(prefs: Pick<CarrierPrefs, "custom">, name: string | null | undefined): CustomCarrier | null {
  const k = carrierKey(name ?? "")
  if (!k) return null
  return prefs.custom.find((c) => carrierKey(c.name) === k) ?? null
}

/** A carrier name as it may be saved, cleaned: the one a row holds, never a sentence. */
export function cleanCarrierName(value: unknown): string | null {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : ""
  if (!name || name.length > 60) return null
  return name
}

/** A row of `physical_carrier_prefs`, read into the shape the app uses. Anything unreadable is left out rather than shown wrong. */
export function readCarrierPrefsRow(row: unknown): CarrierPrefs {
  const o = row && typeof row === "object" ? (row as Record<string, unknown>) : {}
  const custom: CustomCarrier[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(o.custom_carriers) ? o.custom_carriers : []) {
    const c = readCustomCarrierRow(raw)
    if (!c || seen.has(c.id)) continue
    seen.add(c.id)
    custom.push(c)
    if (custom.length >= MAX_CUSTOM_CARRIERS) break
  }
  const favourites: string[] = []
  for (const raw of Array.isArray(o.favourites) ? o.favourites : []) {
    const name = cleanCarrierName(raw)
    if (!name || favourites.some((f) => carrierKey(f) === carrierKey(name))) continue
    favourites.push(name)
    if (favourites.length >= MAX_FAVOURITES) break
  }
  return {
    favourites,
    defaultCarrier: cleanCarrierName(o.default_carrier),
    lastCarrier: cleanCarrierName(o.last_carrier),
    custom,
  }
}

/* ── searching ──────────────────────────────────────────────────────────── */

/**
 * HOW CLOSE A CARRIER IS TO WHAT WAS TYPED, 0 for no match at all.
 *
 *   1000  the name, exactly ("ups")
 *    900  the name starts with it ("us" is USPS)
 *    800  the official name or an alias starts with it ("united" is USPS)
 *    600  a word of the name starts with it ("post" is Canada Post)
 *    400  the name holds it anywhere
 *    300  the official name or an alias holds it
 *    150  the letters appear in order ("fdx" is FedEx)
 *
 * On a tie the shorter name wins, then the list's own order, so the result
 * never moves about between keystrokes.
 */
export function carrierMatchScore(option: Pick<CarrierOption, "name" | "official" | "aliases">, query: string): number {
  const q = carrierKey(query)
  if (!q) return 1
  const name = carrierKey(option.name)
  if (!name) return 0
  if (name === q) return 1000
  if (name.startsWith(q)) return 900
  const others = [option.official ?? "", ...option.aliases].map(carrierKey).filter(Boolean)
  if (others.some((o) => o === q)) return 950
  if (others.some((o) => o.startsWith(q))) return 800
  const words = [option.name, option.official ?? ""].join(" ").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.some((w) => w.startsWith(q))) return 600
  if (name.includes(q)) return 400
  if (others.some((o) => o.includes(q))) return 300
  return subsequence(name, q) || others.some((o) => subsequence(o, q)) ? 150 : 0
}

function subsequence(haystack: string, needle: string): boolean {
  let i = 0
  for (const ch of haystack) if (ch === needle[i] && ++i === needle.length) return true
  return false
}

/**
 * WHAT MATCHES, BEST FIRST, for any list: `read` says where an item's name, official name and aliases are. On a tie
 * the list's own order wins, so the result never moves about between keystrokes. Nothing typed: the list as given.
 */
export function rankBy<T>(items: T[], query: string, read: (item: T) => Pick<CarrierOption, "name" | "official" | "aliases">): T[] {
  if (!carrierKey(query)) return items
  return items
    .map((item, at) => ({ item, at, score: carrierMatchScore(read(item), query) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .map((s) => s.item)
}

/** Carrier options that match, best first (rankBy). */
export function rankCarrierOptions(options: CarrierOption[], query: string): CarrierOption[] {
  return rankBy(options, query, (o) => o)
}

/* ── which one a parcel starts with ─────────────────────────────────────── */

export interface Preselection {
  carrier: string
  /** Why, so the picker can say it in a word and a test can read it. */
  because: "number" | "default" | "last" | "national"
}

/**
 * THE CARRIER AN ORDER OPENS WITH. The carrier the tracking number's own
 * shape names, when one has been typed (./status.ts guessCarrier, passed in
 * as `guessed`: it is the strongest evidence there is), else the shop's
 * saved default, else the carrier it last shipped with, else the national
 * post or major courier of the country the parcel is going to
 * (./carriers.ts nationalCarrierFor).
 * Null when none of the three says anything, and the shop picks.
 *
 * A name only counts when the shop can actually still choose it: a default
 * saved for a carrier it has since deleted does not preselect a row that is
 * not there.
 */
export function preselectCarrier(prefs: CarrierPrefs, input: { country?: string | null; offered?: string[]; guessed?: string | null } = {}): Preselection | null {
  const offered = input.offered ? new Set(input.offered.map(carrierKey)) : null
  const can = (name: string | null | undefined): string | null => {
    const n = cleanCarrierName(name)
    if (!n) return null
    const k = carrierKey(n)
    if (offered && !offered.has(k)) return null
    if (!offered && !carrierOf(n) && !prefs.custom.some((c) => carrierKey(c.name) === k)) return null
    return n
  }
  const fromNumber = can(input.guessed)
  if (fromNumber) return { carrier: fromNumber, because: "number" }
  const saved = can(prefs.defaultCarrier)
  if (saved) return { carrier: saved, because: "default" }
  const last = can(prefs.lastCarrier)
  if (last) return { carrier: last, because: "last" }
  const national = nationalCarrierFor(input.country)
  const theirs = national ? can(national.name) : null
  return theirs ? { carrier: theirs, because: "national" } : null
}

/** Starred or not, one press: the list a save writes. */
export function toggleFavourite(favourites: string[], name: string): string[] {
  const k = carrierKey(name)
  if (favourites.some((f) => carrierKey(f) === k)) return favourites.filter((f) => carrierKey(f) !== k)
  return [...favourites, name].slice(-MAX_FAVOURITES)
}

export const isFavourite = (favourites: string[], name: string) => favourites.some((f) => carrierKey(f) === carrierKey(name))
