/**
 * ===========================================================================
 *  A TOUCH: ONE VISIT ARRIVING, AND WHERE IT CAME FROM
 * ===========================================================================
 * Pure, for the browser and the server alike. docs/analytics/attribution.md
 * is the full account; this is the part both sides must agree on.
 *
 * A touch is recorded when a visit ARRIVES on a public page (the creator
 * page, a product page, the OnePage, a website): the referring host, the UTM
 * tags, the in-app browser, the landing path and host, the kind of property,
 * and when. A page opened from another page of the same visit (an internal
 * referrer) is not an arrival and records nothing.
 *
 * DIRECT. A visit is direct when it arrives with no referrer at all, no UTM
 * tags and no in-app browser signature: a typed address, a bookmark, a link
 * from an app that sends nothing. Its source is the word "direct".
 *
 * TWO TOUCHES ARE KEPT PER SCOPE:
 *
 *   first   the first touch seen, never replaced by a later visit while it
 *           is younger than 90 days.
 *   last    the latest touch that was not direct. A direct visit replaces it
 *           only when there is nothing better (the last one was direct too),
 *           so "Instagram, then a typed address, then a purchase" is still an
 *           Instagram sale.
 *
 * THE SOURCE IS NEVER TAKEN FROM A PAGE. It is worked out again, here, from
 * the referrer, the UTM tags and the in-app browser, by the same function
 * the view tracker uses (lib/analytics/sources categorizeServerSource). A
 * payload that claims "social_instagram" with a Google referrer is a Google
 * touch.
 */

import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { cleanHost, cleanUtm } from "@/lib/orders/order-source"

/** The query parameter a link to checkout carries the touches in. Read once by checkout and removed. */
export const CARRY_PARAM = "sl_at"

/** How long a touch counts, from when it happened. */
export const TOUCH_TTL_MS = 90 * 24 * 60 * 60 * 1000
/** A clock a day ahead of ours is a clock, not a forgery. More than that is. */
const CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export const PROPERTY_TYPES = ["creator_page", "onepage", "website"] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export function isPropertyType(value: unknown): value is PropertyType {
  return typeof value === "string" && (PROPERTY_TYPES as readonly string[]).includes(value)
}

/** The in-app browsers lib/analytics/sources can name. */
const CLIENT_APPS = new Set([
  "instagram", "facebook", "threads", "tiktok", "x", "youtube", "pinterest", "linkedin",
  "snapchat", "reddit", "whatsapp", "telegram", "discord", "twitch", "bluesky", "tumblr",
])

export interface Touch {
  /** direct, organic_search, paid_search, paid, email, affiliate, referral, social_<network>, social. */
  source: string
  referrer_host?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  /** The path the visit landed on, never its query. */
  landing_path?: string
  /** The host it landed on, without www. */
  landing_host?: string
  property_type?: PropertyType
  client_app?: string
  /** Milliseconds since the epoch. */
  at: number
}

export interface Touches {
  first: Touch | null
  last: Touch | null
}

export function isDirect(t: Touch | null | undefined): boolean {
  return !t || t.source === "direct"
}

/* ─── Checking one field at a time ──────────────────────────────────── */

const MAX_HOST = 100
const MAX_PATH = 120

function host(value: unknown): string | undefined {
  const h = cleanHost(value)
  return h && h.length <= MAX_HOST ? h : undefined
}

/** A path and nothing else: no query, no fragment, no characters a URL would have encoded differently. */
function path(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const p = value.split(/[?#]/)[0]
  if (!p.startsWith("/") || p.startsWith("//") || p.length > MAX_PATH) return undefined
  return /^\/[A-Za-z0-9/_\-.~%]*$/.test(p) ? p : undefined
}

function app(value: unknown): string | undefined {
  return typeof value === "string" && CLIENT_APPS.has(value) ? value : undefined
}

/**
 * Every field checked on its own and anything unknown dropped. The source
 * is worked out again from what is left. Null without a usable time.
 */
export function cleanTouch(input: unknown): Touch | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const at = typeof raw.at === "number" ? raw.at : Number.NaN
  if (!Number.isFinite(at) || at <= 0) return null
  const t: Touch = { source: "direct", at: Math.round(at) }
  const r = host(raw.referrer_host)
  if (r) t.referrer_host = r
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const) {
    const v = cleanUtm(raw[k])
    if (v) t[k] = v
  }
  const lp = path(raw.landing_path)
  if (lp) t.landing_path = lp
  const lh = host(raw.landing_host)
  if (lh) t.landing_host = lh
  if (isPropertyType(raw.property_type)) t.property_type = raw.property_type
  const a = app(raw.client_app)
  if (a) t.client_app = a
  t.source = categorizeServerSource(t.referrer_host ?? null, t.utm_source ?? null, t.utm_medium ?? null, t.client_app ?? null)
  return t
}

/* ─── A visit arriving ──────────────────────────────────────────────── */

export interface VisitInput {
  /** This page's address. */
  href: string
  /** document.referrer. */
  referrer: string
  /** The query the document was first loaded with, for UTM tags a client navigation left behind. */
  landingSearch?: string
  userAgent: string
  mainDomain: string
  property?: PropertyType | null
  now: number
}

function utmOf(search: string | URLSearchParams | undefined): Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_term" | "utm_content", string>> {
  let q: URLSearchParams
  try {
    q = typeof search === "string" ? new URLSearchParams(search) : search ?? new URLSearchParams()
  } catch {
    return {}
  }
  const out: Record<string, string> = {}
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]) {
    const v = q.get(k)
    if (v) out[k] = v
  }
  return out
}

/**
 * The touch this page load is, or null when it is not an arrival: a page
 * opened from another page of the same visit, with no new tags on it.
 */
export function touchFromVisit(input: VisitInput): Touch | null {
  let url: URL
  try {
    url = new URL(input.href)
  } catch {
    return null
  }
  const pageHost = url.hostname.toLowerCase().replace(/^www\./, "")
  const ref = referrerHost(input.referrer)
  const internal = Boolean(ref) && isInternalReferrer(ref, input.mainDomain, pageHost)
  let utm = utmOf(url.searchParams)
  if (Object.keys(utm).length === 0) utm = utmOf(input.landingSearch)
  const hasUtm = Boolean(utm.utm_source || utm.utm_medium)
  if (internal && !hasUtm) return null
  return cleanTouch({
    referrer_host: internal ? undefined : ref || undefined,
    ...utm,
    landing_path: url.pathname,
    landing_host: pageHost,
    property_type: input.property ?? undefined,
    client_app: detectClientAppFromUA(input.userAgent) ?? undefined,
    at: input.now,
  })
}

/* ─── Keeping two of them ───────────────────────────────────────────── */

function fresh(t: Touch | null | undefined, now: number): Touch | null {
  if (!t) return null
  return t.at >= now - TOUCH_TTL_MS && t.at <= now + CLOCK_SKEW_MS ? t : null
}

/**
 * The touches still inside their 90 days. When the first has aged out and
 * the last has not, the last is the earliest touch still known, so it is
 * the first as well.
 */
export function freshTouches(t: Touches | null | undefined, now: number): Touches | null {
  const first = fresh(t?.first, now)
  const last = fresh(t?.last, now)
  if (!first && !last) return null
  return { first: first ?? last, last: last ?? first }
}

/** A new visit, onto what was kept. */
export function recordVisit(kept: Touches | null | undefined, touch: Touch, now: number): Touches {
  const t = freshTouches(kept, now)
  const first = t?.first ?? touch
  const last = !isDirect(touch) || !t?.last || isDirect(t.last) ? touch : t.last
  return { first, last }
}

/**
 * Two accounts of the same buyer, from two addresses (the website's and
 * storelib.com's), as one: the earliest touch first, the latest one that was
 * not direct last (the latest of all when every one was direct).
 */
export function mergeTouches(...sets: Array<Touches | null | undefined>): Touches | null {
  const all = sets.flatMap((s) => [s?.first, s?.last]).filter((t): t is Touch => Boolean(t))
  if (all.length === 0) return null
  const byTime = [...all].sort((a, b) => a.at - b.at)
  const real = byTime.filter((t) => !isDirect(t))
  return { first: byTime[0], last: real.length > 0 ? real[real.length - 1] : byTime[byTime.length - 1] }
}

/* ─── On the wire ───────────────────────────────────────────────────── */

/**
 * The compact form a touch travels in: to checkout in a link or a request
 * body, and through Stripe in a payment's metadata. Short keys, seconds.
 */
const WIRE: Array<[keyof Touch, string]> = [
  ["referrer_host", "r"],
  ["utm_source", "us"],
  ["utm_medium", "um"],
  ["utm_campaign", "uc"],
  ["utm_term", "ut"],
  ["utm_content", "un"],
  ["landing_path", "lp"],
  ["landing_host", "lh"],
  ["property_type", "p"],
  ["client_app", "a"],
]
const PROPERTY_SHORT: Record<PropertyType, string> = { creator_page: "c", onepage: "o", website: "w" }
const PROPERTY_LONG: Record<string, PropertyType> = { c: "creator_page", o: "onepage", w: "website" }

type Wire = Record<string, string | number>

function toWire(t: Touch): Wire {
  const w: Wire = { t: Math.floor(t.at / 1000) }
  for (const [key, short] of WIRE) {
    const v = t[key]
    if (typeof v !== "string" || !v) continue
    w[short] = key === "property_type" ? PROPERTY_SHORT[v as PropertyType] : v
  }
  return w
}

function fromWire(w: unknown): Touch | null {
  if (!w || typeof w !== "object" || Array.isArray(w)) return null
  const raw = w as Record<string, unknown>
  if (typeof raw.t !== "number" || !Number.isInteger(raw.t)) return null
  const loose: Record<string, unknown> = { at: raw.t * 1000 }
  for (const [key, short] of WIRE) {
    const v = raw[short]
    if (typeof v !== "string") continue
    loose[key] = key === "property_type" ? PROPERTY_LONG[v] : v
  }
  return cleanTouch(loose)
}

/** Longest carried value accepted. Two touches at their longest are well under it. */
export const CARRIED_MAX = 2000

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(value: string): string | null {
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/")
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return null
  }
}

/** Both touches as one short string, safe in a query parameter. "" for none. */
export function encodeTouches(t: Touches | null | undefined): string {
  if (!t?.first && !t?.last) return ""
  const first = t.first ?? t.last!
  const last = t.last ?? t.first!
  const body: Record<string, Wire> = { f: toWire(first) }
  if (last !== first && JSON.stringify(toWire(last)) !== JSON.stringify(body.f)) body.l = toWire(last)
  const out = toBase64Url(JSON.stringify(body))
  return out.length <= CARRIED_MAX ? out : ""
}

/**
 * What a page or a link carried, checked field by field. Null when it is
 * anything but what encodeTouches makes: too long, not base64url, not JSON,
 * the wrong shape, or with no touch younger than 90 days. Every field of a
 * touch that survives is known and within its limits; nothing else is kept.
 */
export function decodeTouches(raw: unknown, now: number): Touches | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > CARRIED_MAX || !/^[A-Za-z0-9_-]+$/.test(raw)) return null
  const text = fromBase64Url(raw)
  if (text === null) return null
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return null
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  const first = fromWire(b.f)
  const last = b.l === undefined ? first : fromWire(b.l)
  return freshTouches({ first, last }, now)
}

/** Stripe's cap on one metadata value. */
const METADATA_VALUE_MAX = 500
/** The fields given up first when a touch will not fit in one metadata value. */
const DROP_ORDER = ["un", "ut", "lp", "lh", "a", "um", "uc", "us", "r"]

/** One touch as a metadata value, at most 500 characters, least useful fields dropped first. "" for none. */
export function touchToMetadata(t: Touch | null | undefined): string {
  if (!t) return ""
  const w = toWire(t)
  let text = JSON.stringify(w)
  for (const k of DROP_ORDER) {
    if (text.length <= METADATA_VALUE_MAX) break
    delete w[k]
    text = JSON.stringify(w)
  }
  return text.length <= METADATA_VALUE_MAX ? text : ""
}

/** A touch back from metadata the server wrote. Its age is not checked: a delayed payment is still that visit's. */
export function touchFromMetadata(value: unknown): Touch | null {
  if (typeof value !== "string" || !value || value.length > METADATA_VALUE_MAX) return null
  try {
    return fromWire(JSON.parse(value))
  } catch {
    return null
  }
}

/* ─── As a row keeps it ─────────────────────────────────────────────── */

/**
 * The shape written to `first_touch` and `last_touch` (orders, subscribers,
 * checkout_starts): the touch's own fields under their full names and the
 * time as an ISO string. docs/analytics/attribution.md lists every key.
 */
export function storedTouch(t: Touch | null | undefined): Record<string, string> | null {
  if (!t) return null
  const out: Record<string, string> = { source: t.source }
  for (const [key] of WIRE) {
    const v = t[key]
    if (typeof v === "string" && v) out[key] = v
  }
  out.at = new Date(t.at).toISOString()
  return out
}
