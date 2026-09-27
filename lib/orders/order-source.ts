/**
 * WHERE AN ORDER CAME FROM
 *
 * Two places sell: Storelib itself (a profile, a product page, the
 * marketplace) and a website the creator built. The Orders table has a
 * Source column for the difference, so it has to be written down when the
 * order is made; nothing about a finished order says which door the buyer
 * walked through.
 *
 * A website's Buy button sends the buyer to `/checkout?productId=…&src=website`
 * and a basket is only ever filled on a website. Everything else is Storelib.
 *
 * TWO THINGS ARE RECORDED, AND ONLY ONE IS A CHANNEL.
 *
 *   `source`         "website" | "storelib". Stable, because Analytics
 *                    counts sales by it (lib/analytics/reports.ts).
 *   `source_detail`  what the checkout page could see, and nothing it could
 *                    not: which page the buyer pressed Buy on (the website
 *                    and its address, a profile, a product page, Explore, or
 *                    a checkout link opened on its own), and where the visit
 *                    came from before that (Instagram, Google, a site's
 *                    address, direct), with utm_source and utm_campaign when
 *                    the link carried them. Anything not seen is left out,
 *                    never filled in with a likely answer.
 *
 * It travels from the checkout page to the order inside the payment: the
 * page works it out (lib/orders/checkout-origin.ts), the route that makes
 * the PaymentIntent checks every field of it and puts it in the metadata as
 * one short string, and whichever of the browser or the webhook makes the
 * order writes it. No name, email or address is ever part of it.
 *
 * THE COLUMNS ARE OPTIONAL. `orders.source` and `orders.source_detail`
 * arrive with supabase/sql/RUN_ORDER_SOURCE.sql, and the payment paths
 * insert with a full payload first and a minimal one if that fails. Putting
 * either in the insert would make every order fall back to the minimal
 * payload until the SQL is run. So they are written by a separate update
 * after the order exists, and that update is allowed to fail: an order
 * without a source is an order, one that failed to save is not.
 */

import { hostIs, isSearchHost, socialNetworkOfHost } from "@/lib/analytics/sources"

export type OrderSource = "storelib" | "website"

/** The query parameter a website's Buy button adds to /checkout. */
export const SOURCE_PARAM = "src"
export const WEBSITE_SOURCE: OrderSource = "website"

/** Stripe metadata key that carries the source from checkout to fulfilment. */
export const SOURCE_METADATA_KEY = "order_source"
/** Stripe metadata key that carries the detail, encoded by `encodeOrigin`. */
export const ORIGIN_METADATA_KEY = "order_via"

export function isOrderSource(value: unknown): value is OrderSource {
  return value === "storelib" || value === "website"
}

/* ─── The detail ─────────────────────────────────────────────────────── */

/**
 * The page Buy was pressed on.
 *
 *   website   a website the creator built, on a Storelib subdomain or their domain
 *   profile   the creator's page, storelib.com/{handle}
 *   onepage   their OnePage, storelib.me/{handle} (storelib.com/{handle}/links before)
 *   product   a product page on Storelib
 *   explore   the marketplace
 *   link      a checkout link opened on its own, with no Storelib page before it
 *   admin     a test sale made from Storelib's admin
 */
export const SURFACES = ["website", "profile", "onepage", "product", "explore", "link", "admin"] as const
export type OrderSurface = (typeof SURFACES)[number]

export interface OrderOrigin {
  surface?: OrderSurface
  /** The website's address, when the surface is a website. */
  site?: string
  /** A network or search engine key from FROM_LABEL, "direct", or a referring site's address. */
  from?: string
  utm_source?: string
  utm_campaign?: string
}

export const SURFACE_LABEL: Record<OrderSurface, string> = {
  website: "Website",
  profile: "Profile",
  onepage: "OnePage",
  product: "Product page",
  explore: "Explore",
  link: "Checkout link",
  admin: "Test sale",
}

/** The names a visit's origin is recorded under, and how they read. */
export const FROM_LABEL: Record<string, string> = {
  direct: "Direct",
  storelib: "Storelib",
  email: "Email",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
  pinterest: "Pinterest",
  linkedin: "LinkedIn",
  snapchat: "Snapchat",
  reddit: "Reddit",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  discord: "Discord",
  twitch: "Twitch",
  bluesky: "Bluesky",
  tumblr: "Tumblr",
  google: "Google",
  bing: "Bing",
  duckduckgo: "DuckDuckGo",
  yahoo: "Yahoo",
  ecosia: "Ecosia",
  brave: "Brave Search",
  baidu: "Baidu",
  yandex: "Yandex",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
}

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?::\d{1,5})?$/

/** A host name and nothing else, lower case, without www; or undefined. */
export function cleanHost(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const h = value.trim().toLowerCase().replace(/^www\./, "")
  return HOST.test(h) ? h : undefined
}

/**
 * A utm value, as words and not as a message. Anything with an @ in it is
 * dropped whole: a campaign is not a place for an address, and one that
 * holds one is not recorded.
 */
function cleanUtm(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().slice(0, 80)
  if (!v || v.includes("@")) return undefined
  return /^[\p{L}\p{N} _.+\-/|:]+$/u.test(v) ? v : undefined
}

function cleanFrom(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const v = value.trim().toLowerCase()
  if (v in FROM_LABEL) return v
  return cleanHost(v)
}

/**
 * Every field checked on its own, anything unknown dropped. Takes the object
 * a page sends, the jsonb a row holds, or the string the metadata carries.
 */
export function cleanOrigin(input: unknown): OrderOrigin | null {
  if (typeof input === "string") return decodeOrigin(input)
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  const raw = input as Record<string, unknown>
  const out: OrderOrigin = {}
  if (typeof raw.surface === "string" && (SURFACES as readonly string[]).includes(raw.surface)) out.surface = raw.surface as OrderSurface
  const site = cleanHost(raw.site)
  if (site) out.site = site
  const from = cleanFrom(raw.from)
  if (from) out.from = from
  const us = cleanUtm(raw.utm_source)
  if (us) out.utm_source = us
  const uc = cleanUtm(raw.utm_campaign)
  if (uc) out.utm_campaign = uc
  return Object.keys(out).length > 0 ? out : null
}

/* Stripe keeps a metadata value to 500 characters. With every field at its
   longest this is under 450. */
const SHORT: Array<[keyof OrderOrigin, string]> = [
  ["surface", "s"],
  ["site", "h"],
  ["from", "f"],
  ["utm_source", "us"],
  ["utm_campaign", "uc"],
]

export function encodeOrigin(origin: OrderOrigin | null | undefined): string {
  const clean = cleanOrigin(origin ?? null)
  if (!clean) return ""
  const params = new URLSearchParams()
  for (const [key, short] of SHORT) {
    const v = clean[key]
    if (v) params.set(short, v)
  }
  return params.toString().slice(0, 500)
}

export function decodeOrigin(value: unknown): OrderOrigin | null {
  if (typeof value !== "string" || !value) return null
  let params: URLSearchParams
  try {
    params = new URLSearchParams(value)
  } catch {
    return null
  }
  const raw: Record<string, string> = {}
  for (const [key, short] of SHORT) {
    const v = params.get(short)
    if (v) raw[key] = v
  }
  return cleanOrigin(raw)
}

/* ─── Reading a page's address ───────────────────────────────────────── */

/**
 * First path segments that are Storelib's own pages, never a creator's
 * handle. A path under one of these is not a profile or a product.
 */
const PLATFORM_SEGMENTS = new Set([
  "access", "account-deletion", "admin", "api", "app", "auth", "blog", "c", "cart", "checkout", "cover-render",
  "creators", "dashboard", "developers", "downloads", "editions", "faq", "features", "feed", "forgot-password",
  "legal", "library", "login", "logout", "marketplace", "native-start", "onboarding", "pricing", "privacy",
  "purchase", "receipt", "reset-password", "search", "settings", "signup", "terms", "welcome", "wishlist", "w",
])

/** Which kind of Storelib page a path is, or null for any other page. */
export function surfaceOfPath(path: string | null | undefined): OrderSurface | null {
  if (typeof path !== "string" || !path.startsWith("/")) return null
  const parts = path.split(/[?#]/)[0].split("/").filter(Boolean).map((p) => p.toLowerCase())
  if (parts.length === 0) return null
  const [first, second] = parts
  if (first === "explore" || first === "marketplace") return "explore"
  if (first === "p" && second) return "product"
  if (first === "u" && second) return "profile"
  if (first === "l" && second) return "onepage"
  if (PLATFORM_SEGMENTS.has(first)) return null
  if (parts.length === 1) return "profile"
  if (second === "links") return parts.length === 2 ? "onepage" : null
  return parts.length === 2 ? "product" : null
}

/**
 * Where a visit came from, by the address of the page before it: a network,
 * a search engine, an email client, or the referring site's own address.
 * Null for no address.
 */
export function fromOfHost(host: string | null | undefined): string | null {
  const h = cleanHost(host)
  if (!h) return null
  const network = socialNetworkOfHost(h)
  if (network && network in FROM_LABEL) return network
  if (hostIs(h, "mail.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "mail.yahoo.com", "mail.proton.me", "mail.aol.com")) return "email"
  if (isSearchHost(h)) {
    for (const engine of ["google", "bing", "duckduckgo", "yahoo", "ecosia", "baidu", "yandex"]) {
      if (new RegExp(`(^|\\.)${engine}\\.`).test(h)) return engine
    }
    if (hostIs(h, "search.brave.com")) return "brave"
    return h
  }
  if (hostIs(h, "chatgpt.com", "chat.openai.com")) return "chatgpt"
  if (hostIs(h, "perplexity.ai")) return "perplexity"
  return h
}

/** A utm_source that names a network or engine, as that name. */
export function fromOfUtmSource(value: string | null | undefined): string | null {
  const v = cleanUtm(value)?.toLowerCase()
  if (!v) return null
  const words = v.split(/[^a-z0-9]+/).filter(Boolean)
  const has = (...names: string[]) => names.some((n) => words.includes(n))
  if (has("instagram", "ig", "insta")) return "instagram"
  if (has("tiktok")) return "tiktok"
  if (has("youtube", "yt")) return "youtube"
  if (has("facebook", "fb")) return "facebook"
  if (has("twitter", "x")) return "x"
  if (has("threads")) return "threads"
  if (has("pinterest")) return "pinterest"
  if (has("linkedin")) return "linkedin"
  if (has("reddit")) return "reddit"
  if (has("snapchat")) return "snapchat"
  if (has("whatsapp")) return "whatsapp"
  if (has("telegram")) return "telegram"
  if (has("discord")) return "discord"
  if (has("google")) return "google"
  if (has("bing")) return "bing"
  if (has("newsletter", "email", "mail")) return "email"
  if (v.includes(".")) return fromOfHost(v)
  return null
}

/**
 * The checkout page's own address is the Referer of every call it makes, so
 * a route the checkout page calls can read the source from there without
 * the page having to send it.
 */
export function orderSourceFromRequest(request: Request): OrderSource {
  const referer = request.headers.get("referer")
  if (!referer) return "storelib"
  try {
    const url = new URL(referer)
    return url.searchParams.get(SOURCE_PARAM) === WEBSITE_SOURCE ? "website" : "storelib"
  } catch {
    return "storelib"
  }
}

/** Metadata first (it was decided on the checkout page), the request second. */
export function orderSourceFrom(metadata: Record<string, unknown> | null | undefined, request?: Request): OrderSource {
  const recorded = metadata?.[SOURCE_METADATA_KEY]
  if (isOrderSource(recorded)) return recorded
  return request ? orderSourceFromRequest(request) : "storelib"
}

/**
 * What a route can tell from the page that called it, for a page that sent
 * nothing itself (one loaded before this existed, or the OnePage's form).
 * The Referer is that page's address: a checkout's query says whether a
 * website sent it, and a Storelib page's path says which page it is.
 */
export function originFromRequest(request: Request): OrderOrigin | null {
  const referer = request.headers.get("referer")
  if (!referer) return null
  let url: URL
  try {
    url = new URL(referer)
  } catch {
    return null
  }
  const q = url.searchParams
  const origin: OrderOrigin = {}
  if (url.pathname === "/checkout" || url.pathname.startsWith("/checkout/")) {
    if (q.get(SOURCE_PARAM) === WEBSITE_SOURCE) {
      origin.surface = "website"
      const site = cleanHost(q.get("site"))
      if (site) origin.site = site
    }
  } else {
    const surface = surfaceOfPath(url.pathname)
    if (surface) origin.surface = surface
  }
  const from = cleanFrom(q.get("ref"))
  if (from) origin.from = from
  origin.utm_source = q.get("utm_source") ?? undefined
  origin.utm_campaign = q.get("utm_campaign") ?? undefined
  return cleanOrigin(origin)
}

/**
 * The detail a route records: what the page sent, else what its address
 * says. The page's own account wins because it saw more (the page before the
 * checkout, the visit's first address), and every field of it is checked.
 */
export function originOf(sent: unknown, request?: Request): OrderOrigin | null {
  return cleanOrigin(sent) ?? (request ? originFromRequest(request) : null)
}

/**
 * The detail a payment carried, for the order made from it. A payment made
 * before the detail existed has none, and then the request that reports it
 * (the checkout page confirming its own payment) is read instead; Stripe's
 * webhook has no page behind it and adds nothing.
 */
export function orderOriginFrom(metadata: Record<string, unknown> | null | undefined, request?: Request): OrderOrigin | null {
  return decodeOrigin(metadata?.[ORIGIN_METADATA_KEY]) ?? (request ? originFromRequest(request) : null)
}

/** The channel, with the detail's word on it: a website's checkout is a Website order. */
export function channelOf(origin: OrderOrigin | null | undefined, fallback: OrderSource): OrderSource {
  return origin?.surface === "website" ? "website" : fallback
}

/* ─── Reading it back ────────────────────────────────────────────────── */

export function fromLabel(from: string): string {
  return FROM_LABEL[from] ?? from
}

/**
 * "Website · andrewrullz.storelib.com · from Instagram",
 * "Storelib · Product page · from Google", "Storelib · Explore · Direct".
 * The channel alone when that is all that was recorded, and "Not recorded"
 * when not even that was.
 */
export function sourceText(source: OrderSource | null | undefined, origin: OrderOrigin | null | undefined): string {
  if (!source) return "Not recorded"
  const parts = [source === "website" ? "Website" : "Storelib"]
  const where = originWhere(source, origin)
  if (where) parts.push(where)
  const from = originFrom(origin)
  if (from) parts.push(from)
  return parts.join(" · ")
}

/** The page part: the website's address, or which Storelib page. */
export function originWhere(source: OrderSource | null | undefined, origin: OrderOrigin | null | undefined): string | null {
  if (!origin) return null
  if (source === "website" || origin.surface === "website") return origin.site ?? null
  return origin.surface ? SURFACE_LABEL[origin.surface] : null
}

/** "from Instagram", "Direct", or null when nothing was seen. */
export function originFrom(origin: OrderOrigin | null | undefined): string | null {
  if (!origin?.from) return null
  return origin.from === "direct" ? "Direct" : `from ${fromLabel(origin.from)}`
}

/** Everything after the channel, for a column of its own: "Product page · from Google · utm_campaign spring". */
export function sourceDetailText(source: OrderSource | null | undefined, origin: OrderOrigin | null | undefined): string {
  return [originWhere(source, origin), originFrom(origin), originCampaign(origin)].filter(Boolean).join(" · ")
}

/** "utm_source ig · utm_campaign spring", or null. */
export function originCampaign(origin: OrderOrigin | null | undefined): string | null {
  const parts = [
    origin?.utm_source ? `utm_source ${origin.utm_source}` : null,
    origin?.utm_campaign ? `utm_campaign ${origin.utm_campaign}` : null,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : null
}

/* ─── Writing it down ────────────────────────────────────────────────── */

interface UpdatableAdmin {
  from: (table: string) => any
}

/**
 * Best effort, and never thrown: see the note at the top. A missing column
 * is expected until the SQL is run and is not logged; anything else is.
 *
 * With a detail, both columns in one update; when that fails because
 * `source_detail` is not there yet, the source alone, so the channel is
 * recorded on a database that has only the older column.
 */
export async function tagOrderSource(
  admin: UpdatableAdmin,
  orderIds: string | Array<string | null | undefined>,
  source: OrderSource,
  origin?: OrderOrigin | null,
): Promise<void> {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  )
  if (ids.length === 0) return
  const detail = cleanOrigin(origin ?? null)
  try {
    if (detail) {
      const { error } = await admin.from("orders").update({ source, source_detail: detail }).in("id", ids)
      if (!error) return
      if (!/source_detail/.test(String(error.message))) {
        if (!/source/.test(String(error.message))) console.warn("[orders] could not record the order source:", error.message)
        return
      }
    }
    const { error } = await admin.from("orders").update({ source }).in("id", ids)
    if (error && !/source/.test(String(error.message))) {
      console.warn("[orders] could not record the order source:", error.message)
    }
  } catch (error) {
    console.warn("[orders] could not record the order source:", (error as Error)?.message)
  }
}
