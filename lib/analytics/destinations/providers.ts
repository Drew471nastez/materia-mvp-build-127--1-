/**
 * ===========================================================================
 *  STORELIB ANALYTICS, SENT ON TO A STORE'S OTHER TOOLS
 * ===========================================================================
 * What each tool receives for one Storelib event, as an exact request. Pure:
 * no database, no network, so tests/analytics-destinations.test.ts can say
 * byte for byte what Google, Meta, PostHog and a webhook are sent.
 *
 *   ga4       Google Analytics 4, Measurement Protocol
 *             POST https://www.google-analytics.com/mp/collect
 *                  ?measurement_id=G-…&api_secret=…
 *             page_view, view_item, purchase (transaction_id, value,
 *             currency, items), refund, generate_lead, sign_up
 *   meta      Meta Conversions API
 *             POST https://graph.facebook.com/<version>/<pixel id>/events
 *             ViewContent, Purchase, Lead, Subscribe; event_id is the id
 *             the store's browser pixel uses for the same event (the
 *             order's id on the thank you page, lib/store/tracking
 *             purchaseTags), so Meta keeps one
 *   posthog   PostHog's capture endpoint
 *             POST https://<us|eu>.i.posthog.com/i/v0/e/
 *             $pageview, purchase, refund, lead, sign_up, with a stable
 *             uuid per event so a retry is the same event
 *   webhook   the store's own https address, signed
 *             X-Storelib-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of
 *             "<t>.<body>" with the signing secret>
 *
 * Google Ads needs no connection of its own: a GA4 property linked to Google
 * Ads imports GA4's purchase and generate_lead as conversions (see
 * GOOGLE_ADS_STEPS).
 *
 * CONSENT. `person` holds only what the visitor's consent allows
 * (lib/consent): with analytics consent, the visitor's own ids; with
 * marketing consent, the hashed email and phone and the browser's Meta
 * cookies, address and agent. personFor() shapes it per tool before a row is
 * written, and each builder checks it again:
 *
 *   ga4      page views only with analytics consent; a purchase, refund,
 *            lead or sign up without it goes with a client id made from
 *            the event (no person), ad_user_data and ad_personalization
 *            DENIED, and no user_data
 *   meta     nothing without marketing consent (Meta matches people, and a
 *            Conversions API event with no person is refused anyway)
 *   posthog  page views only with analytics consent; the rest under an id
 *            made from the event, with no person profile. Never an email
 *   webhook  no page views; a buyer's email only with marketing consent; a
 *            signup's email always (it is what the person gave the store)
 *
 * HASHING, by each platform's own rules: an email trimmed and lowercased
 * (Google also drops the dots before @gmail.com and @googlemail.com), a
 * phone as its digits with the country code (E.164; Google keeps the "+",
 * Meta does not), then SHA-256 as lowercase hex.
 */
import { createHash, createHmac } from "node:crypto"
import { minorUnits } from "@/lib/markets/money"

export const DESTINATIONS = ["ga4", "meta", "posthog", "webhook"] as const
export type DestinationId = (typeof DESTINATIONS)[number]

export const DESTINATION_NAME: Record<DestinationId, string> = {
  ga4: "Google Analytics 4",
  meta: "Meta Conversions API",
  posthog: "PostHog",
  webhook: "Webhook",
}

export function isDestination(v: unknown): v is DestinationId {
  return typeof v === "string" && (DESTINATIONS as readonly string[]).includes(v)
}

export const FORWARD_EVENTS = ["page_view", "view_item", "purchase", "refund", "lead", "sign_up", "test"] as const
export type ForwardEventName = (typeof FORWARD_EVENTS)[number]

/** Which events each tool takes. A webhook gets no page views: a store's own system does not want one call per visit. */
export const TAKES: Record<DestinationId, readonly ForwardEventName[]> = {
  ga4: ["page_view", "view_item", "purchase", "refund", "lead", "sign_up", "test"],
  meta: ["view_item", "purchase", "lead", "sign_up", "test"],
  posthog: ["page_view", "view_item", "purchase", "refund", "lead", "sign_up", "test"],
  webhook: ["purchase", "refund", "lead", "sign_up", "test"],
}

export const META_GRAPH_VERSION = "v23.0"
export const GA4_HOST = "https://www.google-analytics.com"
export const POSTHOG_HOSTS = ["https://us.i.posthog.com", "https://eu.i.posthog.com"] as const
export const USER_AGENT = "Storelib-Analytics/1.0"

/** Google Ads conversions come through GA4: no key of their own. */
export const GOOGLE_ADS_STEPS = [
  "Connect Google Analytics 4 here.",
  "In Google Analytics, open Admin › Product links › Google Ads links and link your Ads account.",
  "Mark purchase and generate_lead as key events in Admin › Events.",
  "In Google Ads, open Goals › Conversions › New conversion action › Import › Google Analytics 4 and pick them.",
]

/* ── what an event is ─────────────────────────────────────────────────── */

export interface ForwardItem {
  id: string
  name: string | null
  /** One unit, in minor units of the event's currency; null when the event does not know it (a product page view). */
  priceCents: number | null
  quantity: number
}

/** What happened, with nothing about the person. Kept on the queue row as it is. */
export interface ForwardFacts {
  /** The id each tool dedupes by: the order's (or checkout's) id for a purchase and its refund, the lead's id, the page view's key. */
  ref: string
  /** When it happened (ISO). */
  at: string
  url?: string | null
  path?: string | null
  title?: string | null
  referrer?: string | null
  valueCents?: number | null
  currency?: string | null
  items?: ForwardItem[]
  productId?: string | null
  refundId?: string | null
  /** A lead's form (signup, lead_magnet, subscribe, newsletter); a sign up's method (membership). */
  form?: string | null
  /** A test from the status view: Meta's test_event_code, GA4's validation endpoint. */
  test?: boolean
}

export interface Consent {
  analytics: boolean
  marketing: boolean
}

/** Everything the request could say about the person, before consent is applied. */
export interface PersonInput {
  consent: Consent
  /** GA4's client id from the _ga cookie ("123.456"). */
  gaClientId?: string | null
  /** Storelib's own visitor id (visitor_id, materia_visitor). */
  visitorId?: string | null
  email?: string | null
  phone?: string | null
  ip?: string | null
  userAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  country?: string | null
}

/** What is kept on one tool's queue row: only what that tool may have. */
export interface ForwardPerson {
  consent: Consent
  clientId?: string
  visitorId?: string
  /** SHA-256, by the tool's own rules. */
  emailHash?: string
  phoneHash?: string
  /** Plain, for the store's own webhook only. */
  email?: string
  ip?: string
  userAgent?: string
  fbp?: string
  fbc?: string
  country?: string
}

export const NO_CONSENT: Consent = { analytics: false, marketing: false }

/* ── hashing ──────────────────────────────────────────────────────────── */

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Meta: trimmed and lowercased. Google: the same, and no dots before @gmail.com or @googlemail.com. */
export function normalizeEmail(raw: string | null | undefined, rules: "meta" | "google"): string | null {
  if (typeof raw !== "string") return null
  const e = raw.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null
  if (rules === "google") {
    const [local, domain] = e.split("@")
    if (domain === "gmail.com" || domain === "googlemail.com") return `${local.replace(/\./g, "")}@${domain}`
  }
  return e
}

/** E.164 digits with the country code: "+40 712 345 678" is 40712345678. A number without its code (a leading 0) cannot be told apart and is left out. Google keeps the "+". */
export function normalizePhone(raw: string | null | undefined, rules: "meta" | "google"): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim()
  const plus = t.startsWith("+") || t.startsWith("00")
  const digits = t.replace(/\D/g, "").replace(/^00/, "")
  if (!plus || digits.length < 8 || digits.length > 15 || digits.startsWith("0")) return null
  return rules === "google" ? `+${digits}` : digits
}

export function hashEmail(raw: string | null | undefined, rules: "meta" | "google"): string | null {
  const e = normalizeEmail(raw, rules)
  return e ? sha256Hex(e) : null
}

export function hashPhone(raw: string | null | undefined, rules: "meta" | "google"): string | null {
  const p = normalizePhone(raw, rules)
  return p ? sha256Hex(p) : null
}

/* ── consent, per tool ────────────────────────────────────────────────── */

const ID = /^[A-Za-z0-9._:-]{1,120}$/
const cleanId = (v: unknown): string | undefined => (typeof v === "string" && ID.test(v) ? v : undefined)
const cleanText = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined)

/**
 * Only what this tool may have, by the person's consent. Called before a
 * queue row is written and again when the buyer's consent arrives later
 * (the thank you page), so a row never holds more than it may send.
 */
export function personFor(tool: DestinationId, p: PersonInput, event: ForwardEventName): ForwardPerson {
  const consent: Consent = { analytics: p.consent.analytics === true, marketing: p.consent.marketing === true }
  const out: ForwardPerson = { consent }
  if (tool === "ga4") {
    if (consent.analytics) {
      const cid = cleanId(p.gaClientId)
      if (cid) out.clientId = cid
      const vid = cleanId(p.visitorId)
      if (vid) out.visitorId = vid
    }
    if (consent.marketing) {
      const em = hashEmail(p.email, "google")
      const ph = hashPhone(p.phone, "google")
      if (em) out.emailHash = em
      if (ph) out.phoneHash = ph
    }
    return out
  }
  if (tool === "meta") {
    if (!consent.marketing) return out
    const em = hashEmail(p.email, "meta")
    const ph = hashPhone(p.phone, "meta")
    if (em) out.emailHash = em
    if (ph) out.phoneHash = ph
    const vid = cleanId(p.visitorId)
    if (vid) out.visitorId = vid
    const ip = cleanText(p.ip, 64)
    const ua = cleanText(p.userAgent, 400)
    if (ip) out.ip = ip
    if (ua) out.userAgent = ua
    const fbp = cleanId(p.fbp)
    const fbc = cleanId(p.fbc)
    if (fbp) out.fbp = fbp
    if (fbc) out.fbc = fbc
    const country = typeof p.country === "string" && /^[A-Za-z]{2}$/.test(p.country) ? p.country.toLowerCase() : undefined
    if (country) out.country = country
    return out
  }
  if (tool === "posthog") {
    if (consent.analytics) {
      const vid = cleanId(p.visitorId)
      if (vid) out.visitorId = vid
    }
    return out
  }
  /* webhook: a signup's email is what the person gave the store; a buyer's only with marketing consent. */
  const email = normalizeEmail(p.email, "meta")
  if (email && (event === "lead" || consent.marketing)) out.email = email
  return out
}

/** Whether this event goes to this tool at all, by consent. Null when it goes; else why not. */
export function consentProblem(tool: DestinationId, event: ForwardEventName, person: ForwardPerson | null | undefined): string | null {
  if (event === "test") return null
  const c = person?.consent ?? NO_CONSENT
  if (tool === "meta" && !c.marketing) return "No marketing consent from this visitor."
  if ((event === "page_view" || event === "view_item") && tool !== "meta" && !c.analytics) return "No analytics consent from this visitor."
  return null
}

/* ── money ────────────────────────────────────────────────────────────── */

export function currencyCode(c: string | null | undefined): string | null {
  return typeof c === "string" && /^[A-Za-z]{3}$/.test(c.trim()) ? c.trim().toUpperCase() : null
}

/** Minor units as the major amount, in the currency's own decimals: 1250 USD is 12.5, 2500 JPY is 2500. */
export function major(cents: number | null | undefined, currency: string | null | undefined): number {
  const c = Math.round(Number(cents) || 0)
  const code = currencyCode(currency)
  const value = c / 10 ** (code ? minorUnits(code) : 2)
  return Math.round(value * 1e6) / 1e6
}

/* ── ids ──────────────────────────────────────────────────────────────── */

/** A stable id from text, shaped as a UUID v4 (PostHog's uuid; a webhook's delivery id). */
export function stableUuid(text: string): string {
  const h = sha256Hex(text)
  const v = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`
}

/** A client id that is not a person: made from the event, so GA4 can take a purchase without knowing who made it. */
export function anonymousClientId(ref: string): string {
  const h = sha256Hex(`storelib-anon:${ref}`)
  return `${parseInt(h.slice(0, 8), 16)}.${parseInt(h.slice(8, 16), 16)}`
}

/* ── the requests ─────────────────────────────────────────────────────── */

export interface ProviderRequest {
  method: "POST"
  url: string
  headers: Record<string, string>
  body: string
}

export interface Ga4Config {
  measurement_id?: string
}
export interface MetaConfig {
  pixel_id?: string
  test_event_code?: string | null
}
export interface PosthogConfig {
  host?: string
}
export type DestinationConfig = Ga4Config & MetaConfig & PosthogConfig & Record<string, unknown>

/** The sealed half: a GA4 API secret, a Meta access token, a PostHog project key, or a webhook's { url, secret }. */
export type DestinationSecret = { key: string } | { url: string; secret: string }

export interface BuildInput {
  tool: DestinationId
  event: ForwardEventName
  /** The queue row's own key: stable across retries. */
  eventKey: string
  facts: ForwardFacts
  person: ForwardPerson | null
  config: DestinationConfig
  secret: DestinationSecret
  storeId: string
  /** For the webhook's signature (ms). */
  now?: number
  /** GA4 only: to the validation endpoint, which says what is wrong and records nothing. */
  validate?: boolean
}

export type Built = { ok: true; request: ProviderRequest } | { ok: false; skip: string }

const micros = (iso: string): number => {
  const t = Date.parse(iso)
  return (Number.isFinite(t) ? t : Date.now()) * 1000
}

function gaItems(items: ForwardItem[] | undefined, currency: string | null) {
  return (items ?? []).slice(0, 200).map((i) => ({ item_id: i.id, ...(i.name ? { item_name: i.name.slice(0, 100) } : {}), ...(i.priceCents != null && currency ? { price: major(i.priceCents, currency) } : {}), quantity: Math.max(1, Math.round(i.quantity) || 1) }))
}

export const GA4_EVENT: Record<ForwardEventName, string> = {
  page_view: "page_view",
  view_item: "view_item",
  purchase: "purchase",
  refund: "refund",
  lead: "generate_lead",
  sign_up: "sign_up",
  test: "storelib_test",
}

function ga4Request(i: BuildInput): Built {
  const id = i.config.measurement_id
  const key = "key" in i.secret ? i.secret.key : null
  if (!id || !key) return { ok: false, skip: "Google Analytics needs connecting again." }
  const f = i.facts
  const p = i.person ?? { consent: NO_CONSENT }
  const currency = currencyCode(f.currency)
  const params: Record<string, unknown> = { engagement_time_msec: 1 }
  if (f.url) params.page_location = f.url.slice(0, 1000)
  if (f.title) params.page_title = f.title.slice(0, 300)
  if (f.referrer) params.page_referrer = f.referrer.slice(0, 420)
  if (i.event === "purchase" || i.event === "refund") {
    params.transaction_id = f.ref
    if (currency) {
      params.currency = currency
      params.value = major(f.valueCents, currency)
    }
    if (i.event === "purchase" || (f.items && f.items.length)) params.items = gaItems(f.items, currency)
  } else if (i.event === "view_item") {
    if (currency) {
      params.currency = currency
      params.value = major(f.valueCents, currency)
    }
    params.items = gaItems(f.items, currency)
  } else if (i.event === "lead") {
    if (f.form) params.lead_source = f.form
    if (currency && f.valueCents) {
      params.currency = currency
      params.value = major(f.valueCents, currency)
    }
  } else if (i.event === "sign_up") {
    params.method = f.form || "storelib"
    if (currency && f.valueCents) {
      params.currency = currency
      params.value = major(f.valueCents, currency)
    }
  } else if (i.event === "test") {
    params.debug_mode = true
  }
  const marketing = p.consent.marketing
  const body: Record<string, unknown> = {
    client_id: (p.consent.analytics && (p.clientId || p.visitorId)) || anonymousClientId(f.ref),
    timestamp_micros: micros(f.at),
    non_personalized_ads: !marketing,
    consent: { ad_user_data: marketing ? "GRANTED" : "DENIED", ad_personalization: marketing ? "GRANTED" : "DENIED" },
    events: [{ name: GA4_EVENT[i.event], params }],
  }
  if (marketing && (p.emailHash || p.phoneHash)) body.user_data = { ...(p.emailHash ? { sha256_email_address: [p.emailHash] } : {}), ...(p.phoneHash ? { sha256_phone_number: [p.phoneHash] } : {}) }
  /* A test goes to the validation endpoint first (./connect-server); the real one is marked debug_mode, so it shows in DebugView. */
  const path = i.validate ? "/debug/mp/collect" : "/mp/collect"
  const url = `${GA4_HOST}${path}?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(key)}`
  return { ok: true, request: { method: "POST", url, headers: { "content-type": "application/json", "user-agent": USER_AGENT }, body: JSON.stringify(body) } }
}

export const META_EVENT: Partial<Record<ForwardEventName, string>> = {
  view_item: "ViewContent",
  purchase: "Purchase",
  lead: "Lead",
  sign_up: "Subscribe",
  test: "Lead",
}

function metaRequest(i: BuildInput): Built {
  const pixel = i.config.pixel_id
  const token = "key" in i.secret ? i.secret.key : null
  if (!pixel || !token) return { ok: false, skip: "Meta needs connecting again." }
  const name = META_EVENT[i.event]
  if (!name) return { ok: false, skip: "Meta does not take this event." }
  const p = i.person ?? { consent: NO_CONSENT }
  const problem = consentProblem("meta", i.event, p)
  if (problem) return { ok: false, skip: problem }
  const f = i.facts
  const currency = currencyCode(f.currency)
  const user_data: Record<string, unknown> = {}
  if (p.emailHash) user_data.em = [p.emailHash]
  if (p.phoneHash) user_data.ph = [p.phoneHash]
  if (p.visitorId) user_data.external_id = [sha256Hex(p.visitorId)]
  if (p.ip) user_data.client_ip_address = p.ip
  if (p.userAgent) user_data.client_user_agent = p.userAgent
  if (p.fbp) user_data.fbp = p.fbp
  if (p.fbc) user_data.fbc = p.fbc
  if (p.country) user_data.country = [sha256Hex(p.country)]
  if (i.event === "test") {
    user_data.external_id = [sha256Hex(`storelib-test:${i.storeId}`)]
    user_data.client_user_agent = USER_AGENT
  }
  if (Object.keys(user_data).length === 0) return { ok: false, skip: "Nothing Meta can match this event with." }
  const custom: Record<string, unknown> = {}
  if (currency && (i.event === "purchase" || f.valueCents)) {
    custom.currency = currency
    custom.value = major(f.valueCents, currency)
  }
  if (f.items && f.items.length) {
    custom.content_ids = f.items.map((x) => x.id)
    custom.content_type = "product"
    custom.contents = f.items.map((x) => ({ id: x.id, quantity: Math.max(1, x.quantity), ...(x.priceCents != null && currency ? { item_price: major(x.priceCents, currency) } : {}) }))
    custom.num_items = f.items.reduce((n, x) => n + Math.max(1, x.quantity), 0)
  }
  if (i.event === "purchase") custom.order_id = f.ref
  if (i.event === "lead" && f.form) custom.content_name = f.form
  /* "website" needs the browser's agent (Meta refuses one without it); a purchase told only by Stripe is the system's. */
  const website = !!user_data.client_user_agent
  const event: Record<string, unknown> = {
    event_name: name,
    event_time: Math.floor(micros(f.at) / 1_000_000),
    event_id: f.ref,
    action_source: website ? "website" : "system_generated",
    user_data,
    ...(Object.keys(custom).length ? { custom_data: custom } : {}),
  }
  if (website && f.url) event.event_source_url = f.url.slice(0, 1000)
  const body: Record<string, unknown> = { data: [event], access_token: token }
  if (i.event === "test") body.test_event_code = typeof i.config.test_event_code === "string" && i.config.test_event_code ? i.config.test_event_code : "TEST00000"
  return { ok: true, request: { method: "POST", url: `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(pixel)}/events`, headers: { "content-type": "application/json", "user-agent": USER_AGENT }, body: JSON.stringify(body) } }
}

export const POSTHOG_EVENT: Record<ForwardEventName, string> = {
  page_view: "$pageview",
  view_item: "product_viewed",
  purchase: "purchase",
  refund: "refund",
  lead: "lead",
  sign_up: "sign_up",
  test: "storelib_test",
}

function posthogRequest(i: BuildInput): Built {
  const key = "key" in i.secret ? i.secret.key : null
  const host = posthogHost(i.config.host)
  if (!key || !host) return { ok: false, skip: "PostHog needs connecting again." }
  const f = i.facts
  const p = i.person ?? { consent: NO_CONSENT }
  const currency = currencyCode(f.currency)
  const person = p.consent.analytics && p.visitorId ? p.visitorId : null
  const properties: Record<string, unknown> = {
    $lib: "storelib",
    $process_person_profile: !!person,
    /* PostHog would place the event where Storelib's server is: never. */
    $geoip_disable: true,
    store_id: i.storeId,
  }
  if (f.url) properties.$current_url = f.url.slice(0, 1000)
  if (f.path) properties.$pathname = f.path.slice(0, 500)
  if (f.title) properties.title = f.title.slice(0, 300)
  if (f.referrer) properties.$referrer = f.referrer.slice(0, 1000)
  if (currency && f.valueCents != null) {
    properties.currency = currency
    properties.value = major(f.valueCents, currency)
    if (i.event === "purchase") properties.revenue = major(f.valueCents, currency)
  }
  if (i.event === "purchase" || i.event === "refund") properties.order_id = f.ref
  if (f.refundId) properties.refund_id = f.refundId
  if (f.productId) properties.product_id = f.productId
  if (f.items && f.items.length) properties.products = f.items.map((x) => ({ product_id: x.id, name: x.name, price: x.priceCents != null ? major(x.priceCents, currency) : null, quantity: x.quantity }))
  if (f.form) properties[i.event === "sign_up" ? "method" : "form"] = f.form
  const body = { api_key: key, event: POSTHOG_EVENT[i.event], distinct_id: person ?? `storelib_${sha256Hex(`anon:${f.ref}`).slice(0, 24)}`, properties, timestamp: f.at, uuid: stableUuid(`posthog:${i.eventKey}`) }
  return { ok: true, request: { method: "POST", url: `${host}/i/v0/e/`, headers: { "content-type": "application/json", "user-agent": USER_AGENT }, body: JSON.stringify(body) } }
}

/** One of PostHog's clouds, or a self hosted https address (checked public when it is sent). */
export function posthogHost(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return POSTHOG_HOSTS[0]
  const v = raw.trim().replace(/\/+$/, "")
  if ((POSTHOG_HOSTS as readonly string[]).includes(v)) return v
  if (v === "https://app.posthog.com" || v === "https://us.posthog.com") return POSTHOG_HOSTS[0]
  if (v === "https://eu.posthog.com") return POSTHOG_HOSTS[1]
  try {
    const u = new URL(v)
    return u.protocol === "https:" && !u.username && !u.password && u.pathname === "/" && !u.search ? u.origin : null
  } catch {
    return null
  }
}

export const WEBHOOK_EVENT: Record<ForwardEventName, string> = {
  page_view: "analytics.page_view",
  view_item: "analytics.view_item",
  purchase: "analytics.purchase",
  refund: "analytics.refund",
  lead: "analytics.lead",
  sign_up: "analytics.sign_up",
  test: "analytics.test",
}

/** t=<seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">: the time is signed with the body, so an old delivery cannot be replayed as new. */
export function webhookSignature(secret: string, body: string, t: number): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`
}

export function webhookPayload(i: Pick<BuildInput, "event" | "eventKey" | "facts" | "person" | "storeId">): Record<string, unknown> {
  const f = i.facts
  const currency = currencyCode(f.currency)
  const data: Record<string, unknown> = { ref: f.ref }
  if (f.valueCents != null && currency) {
    data.value = major(f.valueCents, currency)
    data.value_minor = Math.round(f.valueCents)
    data.currency = currency
  }
  if (f.items && f.items.length) data.items = f.items.map((x) => ({ product_id: x.id, name: x.name, price: x.priceCents != null ? major(x.priceCents, currency) : null, quantity: x.quantity }))
  if (f.refundId) data.refund_id = f.refundId
  if (f.productId) data.product_id = f.productId
  if (f.form) data[i.event === "sign_up" ? "method" : "form"] = f.form
  if (f.url) data.url = f.url
  if (i.person?.email) data.email = i.person.email
  return { id: stableUuid(`webhook:${i.eventKey}`), type: WEBHOOK_EVENT[i.event], created_at: f.at, store_id: i.storeId, test: i.event === "test", data }
}

function webhookRequest(i: BuildInput): Built {
  if (!("url" in i.secret)) return { ok: false, skip: "The webhook needs connecting again." }
  const body = JSON.stringify(webhookPayload(i))
  const t = Math.floor((i.now ?? Date.now()) / 1000)
  const payload = JSON.parse(body) as { id: string }
  return {
    ok: true,
    request: {
      method: "POST",
      url: i.secret.url,
      headers: { "content-type": "application/json", "user-agent": "Storelib-Webhooks/1.0", "x-storelib-event": WEBHOOK_EVENT[i.event], "x-storelib-delivery": payload.id, "x-storelib-signature": webhookSignature(i.secret.secret, body, t) },
      body,
    },
  }
}

/** The request for one event to one tool, or why it is not sent. */
export function buildRequest(i: BuildInput): Built {
  if (!TAKES[i.tool].includes(i.event)) return { ok: false, skip: `${DESTINATION_NAME[i.tool]} does not take this event.` }
  const problem = consentProblem(i.tool, i.event, i.person)
  if (problem) return { ok: false, skip: problem }
  if (i.tool === "ga4") return ga4Request(i)
  if (i.tool === "meta") return metaRequest(i)
  if (i.tool === "posthog") return posthogRequest(i)
  return webhookRequest(i)
}

/* ── answers ──────────────────────────────────────────────────────────── */

export type Outcome = "ok" | "retry" | "refused"

/** A busy or unreachable tool is asked again later; anything else it says no to is not. */
export function outcomeOf(tool: DestinationId, status: number, body: unknown): Outcome {
  if (status >= 200 && status < 300) {
    /* GA4's validation endpoint answers 200 with what it found wrong. */
    if (tool === "ga4" && body && typeof body === "object" && Array.isArray((body as { validationMessages?: unknown[] }).validationMessages) && (body as { validationMessages: unknown[] }).validationMessages.length > 0) return "refused"
    return "ok"
  }
  if (status === 0 || status === 408 || status === 425 || status === 429 || status >= 500) return "retry"
  /* Meta's "temporary" codes (1 unknown, 2 service, 4 and 17 rate limits, 341 throttled) come as 400s. */
  if (tool === "meta") {
    const code = (body as { error?: { code?: number; is_transient?: boolean } } | null)?.error
    if (code?.is_transient || [1, 2, 4, 17, 341].includes(Number(code?.code))) return "retry"
  }
  return "refused"
}

/** The tool's own words when they are short, never a token. */
export function refusalText(tool: DestinationId, status: number, body: unknown): string {
  const name = DESTINATION_NAME[tool]
  if (status === 0) return `${name} did not answer.`
  let said: string | null = null
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>
    const err = b.error as Record<string, unknown> | string | undefined
    if (typeof err === "string") said = err
    else if (err && typeof err.message === "string") said = err.message
    else if (typeof b.detail === "string") said = b.detail
    else if (Array.isArray(b.validationMessages) && b.validationMessages.length) {
      const m = b.validationMessages[0] as { description?: string; fieldPath?: string }
      said = [m.fieldPath, m.description].filter(Boolean).join(": ")
    }
  } else if (typeof body === "string" && body.length < 200 && !/<html/i.test(body)) said = body.trim()
  const clean = said ? said.replace(/(access_token|api_secret|api_key)=[^&\s]+/gi, "$1=…").replace(/\s+/g, " ").slice(0, 200) : null
  if (status === 401 || status === 403) return clean ? `${name} refused the key: ${clean}` : `${name} refused the key.`
  return clean ? `${name} answered ${status}: ${clean}` : `${name} answered ${status}.`
}

/* ── backoff ──────────────────────────────────────────────────────────── */

/** After the first try: a minute, five, half an hour, two hours, six, a day. Then it has failed. */
export const RETRY_AFTER_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000, 24 * 3_600_000] as const
export const MAX_ATTEMPTS = RETRY_AFTER_MS.length + 1

/** When to try again after `attempts` tries, or null when that was the last. */
export function nextAttemptAt(attempts: number, now: number): string | null {
  if (attempts >= MAX_ATTEMPTS) return null
  const wait = RETRY_AFTER_MS[Math.max(0, Math.min(RETRY_AFTER_MS.length - 1, attempts - 1))]
  return new Date(now + wait).toISOString()
}

/* ── what the store types in ──────────────────────────────────────────── */

export interface ConnectInput {
  measurementId?: unknown
  apiSecret?: unknown
  pixelId?: unknown
  accessToken?: unknown
  testEventCode?: unknown
  projectKey?: unknown
  host?: unknown
  url?: unknown
}

const str = (v: unknown, max = 400): string => (typeof v === "string" ? v.trim().slice(0, max) : "")

export type Parsed = { ok: true; config: DestinationConfig; secret: DestinationSecret | null; label: string } | { ok: false; error: string; field: string }

/** The fields for one tool, checked for shape before anything is asked. `secret` null keeps the stored one. */
export function parseConnect(tool: DestinationId, input: ConnectInput): Parsed {
  if (tool === "ga4") {
    const id = str(input.measurementId, 40).toUpperCase()
    if (!/^G-[A-Z0-9]{4,20}$/.test(id)) return { ok: false, error: "A measurement ID looks like G-XXXXXXXXXX. Find it in Admin › Data streams.", field: "measurementId" }
    const secret = str(input.apiSecret, 200)
    if (secret && !/^[A-Za-z0-9_-]{10,100}$/.test(secret)) return { ok: false, error: "That API secret does not look right. Create one in the data stream's Measurement Protocol API secrets.", field: "apiSecret" }
    return { ok: true, config: { measurement_id: id }, secret: secret ? { key: secret } : null, label: id }
  }
  if (tool === "meta") {
    const id = str(input.pixelId, 30)
    if (!/^\d{8,20}$/.test(id)) return { ok: false, error: "A pixel ID is a number of 15 or 16 digits. Find it in Events Manager.", field: "pixelId" }
    const token = str(input.accessToken, 600)
    if (token && !/^[A-Za-z0-9_-]{30,600}$/.test(token)) return { ok: false, error: "That access token does not look right. Generate one in Events Manager › Settings › Conversions API.", field: "accessToken" }
    const code = str(input.testEventCode, 30)
    if (code && !/^[A-Za-z0-9]{4,30}$/.test(code)) return { ok: false, error: "A test event code looks like TEST12345.", field: "testEventCode" }
    return { ok: true, config: { pixel_id: id, test_event_code: code || null }, secret: token ? { key: token } : null, label: id }
  }
  if (tool === "posthog") {
    const host = posthogHost(input.host)
    if (!host) return { ok: false, error: "Use https://us.i.posthog.com, https://eu.i.posthog.com or your own https address.", field: "host" }
    const key = str(input.projectKey, 200)
    if (key && !/^phc_[A-Za-z0-9]{20,80}$/.test(key)) return { ok: false, error: "A project API key starts with phc_. Find it in Project settings.", field: "projectKey" }
    return { ok: true, config: { host }, secret: key ? { key } : null, label: new URL(host).host }
  }
  const url = str(input.url, 600)
  try {
    const u = new URL(url)
    if (u.protocol !== "https:") return { ok: false, error: "The address must start with https://.", field: "url" }
    if (u.username || u.password) return { ok: false, error: "Leave the name and password out of the address.", field: "url" }
    return { ok: true, config: {}, secret: null, label: u.host }
  } catch {
    return { ok: false, error: "Paste the full https address.", field: "url" }
  }
}

/** The fields each tool asks for, in order, for the form. */
export const FIELDS: Record<DestinationId, { key: keyof ConnectInput; secret: boolean; optional?: boolean }[]> = {
  ga4: [{ key: "measurementId", secret: false }, { key: "apiSecret", secret: true }],
  meta: [{ key: "pixelId", secret: false }, { key: "accessToken", secret: true }, { key: "testEventCode", secret: false, optional: true }],
  posthog: [{ key: "projectKey", secret: true }, { key: "host", secret: false, optional: true }],
  webhook: [{ key: "url", secret: false }],
}
