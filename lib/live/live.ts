/**
 * ===========================================================================
 *  WHO IS ON STORELIB NOW, ACROSS THE WHOLE PLATFORM (round 62, SQL part 477)
 * ===========================================================================
 * The owner: "I want to see the live ones on Storelib: who they are, where
 * they are from, what it is, what they do. Not only on creators' pages, across
 * the whole platform."
 *
 * Round 59 records creators in /app (lib/activity/creator-activity). This is
 * the same design for everybody else: storelib.com's own pages, Explore,
 * Themes, help and blog, creator pages and creator websites, checkout, the
 * buyer's area, communities and signing in. The shared vocabulary lives here,
 * with no server or browser code, so the beacon, the route, the admin and the
 * suite (tests/live-platform-r62.test.ts) read one copy.
 *
 * WHAT IS KEPT
 *
 *   a session    a random id the tab makes for itself and keeps in
 *                sessionStorage (gone when the tab closes, never a cookie),
 *                its area and page now, a short trail of pages, its country
 *                (two letters from Vercel's header), coarse device and where
 *                the visit came from (a referrer's host or a utm_source)
 *   an action    one of LIVE_ACTIONS: viewed a product, added to cart,
 *                started checkout, paid (checked against the order on the
 *                server), signed up, signed in, joined a community, opened a
 *                course
 *
 * WHAT NEVER IS: typed text, field values, search terms (the query string is
 * dropped), emails, payment details, IP addresses. A path keeps its words
 * and public page addresses (a creator's handle, a product's slug); ids,
 * tokens and anything in a private area (account, library, checkout,
 * receipt, sign in) become `:id`.
 *
 * AN ACCOUNT is linked only when the server reads a yes to analytics in the
 * visitor's own consent record AND the browser sends neither Global Privacy
 * Control nor Do Not Track AND a sign in is present (lib/live/live-server).
 * Otherwise the session is "Visitor" and its short id.
 */

/** "Online now": something arrived from the tab in the last two minutes, as round 59. */
export const LIVE_ONLINE_MS = 2 * 60_000
/** The browser sends at most this often while visible, never while hidden. */
export const LIVE_SEND_EVERY_MS = 60_000
/** A heartbeat with nothing new is written at most this often per session (part 477 says the same). */
export const LIVE_PRESENCE_EVERY_MS = 55_000
/** At most this many events in one batch. */
export const LIVE_MAX_BATCH = 30
/** A batch body past this is not one of ours. */
export const LIVE_MAX_BODY_BYTES = 3_000
/** The pages a session row keeps, newest last (part 477 caps the same). */
export const LIVE_TRAIL = 40
/** Actions and signed in or consenting sessions are deleted after this. */
export const LIVE_RETENTION_DAYS = 30
/** An anonymous session's row (its trail of pages) is deleted after this: it only feeds today's figures. */
export const LIVE_ANON_RETENTION_DAYS = 7

/* ── Areas ─────────────────────────────────────────────────────────────── */

export const AREAS = ["marketing", "themes", "explore", "creators", "checkout", "buyer", "community", "auth", "app"] as const
export type Area = (typeof AREAS)[number]

export const AREA_LABEL: Record<Area, string> = {
  marketing: "Storelib site",
  themes: "Themes",
  explore: "Explore",
  creators: "Creators' pages and sites",
  checkout: "Checkout",
  buyer: "Buyer area",
  community: "Community",
  auth: "Signing in",
  app: "Creators in /app",
}

export function isArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v)
}

/** The first segment of a storelib.com path, and the area it belongs to. Anything not here and not reserved is a creator's handle. */
const ROOT_AREA: Record<string, Area | null> = {
  "": "marketing",
  pricing: "marketing",
  features: "marketing",
  faq: "marketing",
  sell: "marketing",
  alternatives: "marketing",
  developers: "marketing",
  legal: "marketing",
  privacy: "marketing",
  terms: "marketing",
  "refund-policy": "marketing",
  "account-deletion": "marketing",
  help: "marketing",
  blog: "marketing",
  editions: "marketing",
  "native-start": "marketing",
  "get-app": "marketing",
  themes: "themes",
  explore: "explore",
  community: "community",
  c: "community",
  member: "community",
  u: "creators",
  p: "creators",
  l: "creators",
  "creator-page": "creators",
  "instagram-bio": "creators",
  products: "creators",
  checkout: "checkout",
  pay: "checkout",
  purchase: "checkout",
  "stripe-done": "checkout",
  receipt: "checkout",
  library: "buyer",
  account: "buyer",
  downloads: "buyer",
  access: "buyer",
  "order-help": "buyer",
  review: "buyer",
  booking: "buyer",
  request: "buyer",
  wishlist: "buyer",
  unsubscribe: "buyer",
  login: "auth",
  signup: "auth",
  "verify-email": "auth",
  "reset-password": "auth",
  welcome: "auth",
  onboarding: "auth",
  auth: "auth",
  store: "app",
  "store-builder": "app",
  dashboard: "app",
  team: "app",
  upgrade: "app",
  "payouts-sheet": "app",
  /* Never recorded here: round 59 has /app and the editor, /admin is the owner, the rest are frames and previews. */
  app: null,
  "website-builder": null,
  admin: null,
  "onepage-preview": null,
  "theme-preview": null,
  "cover-render": null,
  w: null,
  site: null,
  sites: null,
  api: null,
}

/**
 * PRIVATE ROOTS. Under these only the product's own words are kept; every
 * other segment is `:id` (an order, a token, a course the buyer owns, a
 * community member). The same on a creator's website, whose /account and
 * /checkout are just as private.
 */
const PRIVATE_ROOTS = new Set([
  "account", "library", "downloads", "access", "order-help", "review", "booking", "request", "wishlist", "unsubscribe", "member",
  "checkout", "pay", "purchase", "stripe-done", "receipt", "orders", "cart",
  "login", "signup", "verify-email", "reset-password", "welcome", "onboarding", "auth",
  "store", "store-builder", "dashboard", "team", "upgrade", "payouts-sheet",
])

/** Words of the product's own routes that may stand in a private path. */
const KNOWN_WORDS = new Set(
  "account library courses course lessons downloads communities continue posts preferences settings receipt cart physical site preview success wallet-return checkout pay purchase orders order-help contact questions search login signup verify-email reset-password welcome onboarding request sell auth callback complete start continue connect-return app-callback sync-session auth-code-error store themes editor store-builder dashboard team upgrade member access booking review wishlist unsubscribe stripe-done".split(" "),
)

/* An id, a token or anything personal: never kept even in a public path. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STRIPE_ID = /^(cs|pi|ch|cus|sub|in|pm|seti|acct|price|prod|evt)_[A-Za-z0-9_]{6,}$/
const SLUG = /^[a-z0-9][a-z0-9._~-]{0,63}$/

function idLike(seg: string): boolean {
  if (UUID.test(seg) || STRIPE_ID.test(seg)) return true
  if (seg.includes("@") || seg.length > 64) return true
  /* A long number (an order or a phone) is an id; a page number is not. */
  if (/^\d{5,}$/.test(seg)) return true
  /* A long run of letters and digits mixed with no word break: a token. */
  if (seg.length >= 20 && /\d/.test(seg) && /[a-z]/i.test(seg) && !/-/.test(seg)) return true
  /* Hex of 16 or more: a hash or a key. */
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true
  return false
}

export type HostKind = "storelib" | "site"

export type PlacedPath = { area: Area; path: string; product: boolean; checkout: boolean; course: boolean; receipt: boolean }

/**
 * A path as it is kept, and the area it is in, or null when it is not
 * recorded here at all (/app, /admin, previews, the API).
 *
 *   no query, no hash, at most eight segments
 *   in a private area every segment that is not one of the product's words is `:id`
 *   elsewhere a slug a visitor can see in the address bar stays (a creator's
 *     handle, a product, a theme, a blog post), and anything that looks like
 *     an id, a token, an email or a long number is `:id`
 */
export function placePath(raw: unknown, host: HostKind = "storelib"): PlacedPath | null {
  if (typeof raw !== "string" || !raw) return null
  let path = raw.split(/[?#]/)[0] ?? ""
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname
    } catch {
      return null
    }
  }
  if (!path.startsWith("/")) return null
  try {
    path = decodeURIComponent(path)
  } catch {
    /* Each segment is still checked below. */
  }
  const parts = path.split("/").filter(Boolean).slice(0, 8)
  const first = (parts[0] ?? "").toLowerCase()

  let area: Area | null
  if (host === "site") area = "creators"
  else if (Object.prototype.hasOwnProperty.call(ROOT_AREA, first)) area = ROOT_AREA[first]
  else if (first.startsWith("_next") || /\.(js|mjs|css|map|png|jpe?g|gif|webp|avif|svg|ico|txt|xml|json|webmanifest|woff2?)$/.test(first)) area = null
  /* A root handle: storelib.com/<handle> and /<handle>/<product>. */
  else area = SLUG.test(first) && !idLike(first) ? "creators" : null
  if (!area) return null

  const privatePath = PRIVATE_ROOTS.has(first)
  const out = parts.map((seg) => {
    const s = seg.toLowerCase()
    if (privatePath) return KNOWN_WORDS.has(s) ? s : ":id"
    if (idLike(seg) || !SLUG.test(s)) return ":id"
    return s
  })
  const clean = `/${out.join("/")}`.slice(0, 200)

  const rootHandle = host === "storelib" && !Object.prototype.hasOwnProperty.call(ROOT_AREA, first)
  const product =
    (host === "storelib" && first === "p" && out.length === 2 && out[1] !== ":id") ||
    (rootHandle && out.length === 2 && out[1] !== "links" && out[1] !== ":id") ||
    (host === "site" && out[0] === "products" && out.length === 2 && out[1] !== ":id")
  const checkout = (first === "checkout" || first === "pay") && out[1] !== "receipt" && out[1] !== "preview"
  const course = host === "storelib" && first === "account" && out[1] === "library" && out[2] === "courses" && out.length === 4
  const receipt = host === "storelib" && first === "receipt" && out.length === 2
  return { area, path: clean, product, checkout, course, receipt }
}

/* ── Actions ───────────────────────────────────────────────────────────── */

export const LIVE_ACTIONS = {
  "product.view": "Viewed a product",
  "cart.add": "Added to cart",
  "checkout.start": "Started checkout",
  "order.paid": "Purchase completed",
  "auth.signup": "Signed up",
  "auth.signin": "Signed in",
  "community.join": "Joined a community",
  "course.open": "Opened a course",
} as const

export type LiveActionName = keyof typeof LIVE_ACTIONS

export function isLiveAction(v: unknown): v is LiveActionName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(LIVE_ACTIONS, v)
}

/** The admin feed's action filter, in the order a sale happens. */
export const ACTION_FILTERS: { id: LiveActionName; label: string }[] = (Object.keys(LIVE_ACTIONS) as LiveActionName[]).map((id) => ({ id, label: LIVE_ACTIONS[id] }))

/* ── The session id ────────────────────────────────────────────────────── */

/** Sixteen lowercase letters and digits, made by the tab (crypto.getRandomValues). */
export const SID = /^[a-z0-9]{16}$/

export function isSid(v: unknown): v is string {
  return typeof v === "string" && SID.test(v)
}

/** What the admin shows for a session nobody is signed in to: "Visitor 4k2q". */
export function shortSid(sid: string): string {
  return sid.slice(0, 4)
}

/* ── Where the visit came from ─────────────────────────────────────────── */

/**
 * A referrer's host or a utm_source, as one short word: "google.com",
 * "instagram", "newsletter". Never a path or a query, so a referrer that
 * carried a search or a token gives only its site.
 */
export function cleanSource(v: unknown): string | null {
  if (typeof v !== "string") return null
  let s = v.trim().toLowerCase()
  if (!s) return null
  if (/^https?:\/\//.test(s)) {
    try {
      s = new URL(s).hostname
    } catch {
      return null
    }
  }
  s = s.replace(/^www\./, "").replace(/^m\./, "")
  if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(s)) return null
  if (s.includes("@")) return null
  return s
}

/* ── The batch ─────────────────────────────────────────────────────────── */

/**
 * On the wire, from the beacon:
 *
 *   {"v":1,"s":"k3j9...","e":[[secondsAgo,"p","/explore"],[2,"a","cart.add"]],"src":"google.com","app":1}
 *
 * `o` is on an order.paid action only: the receipt's token from the page's
 * own address, which the server checks against the order and never keeps.
 * Seconds before the send, not a clock time: the server's clock is the one.
 */
export type LiveWireEvent = [number, "p", string] | [number, "a", string] | [number, "a", string, string]
export type LiveWireBatch = { v: 1; s: string; e: LiveWireEvent[]; src?: string; app?: 1 }

export type LiveEvent =
  | { kind: "page"; area: Area; path: string; at: string }
  | { kind: "action"; area: Area; path: string | null; name: LiveActionName; at: string; token?: string }

export type ParsedLiveBatch = { sid: string; events: LiveEvent[]; source: string | null; app: boolean }

const RECEIPT_TOKEN = /^[A-Za-z0-9_-]{16,128}$/

/**
 * A batch as the server keeps it: pages placed again on the server (never
 * the page's own word for its area), actions from the list, the rest
 * dropped. An action takes the area and path of the page before it.
 */
export function parseLiveBatch(body: unknown, now: number, host: HostKind): ParsedLiveBatch | null {
  if (!body || typeof body !== "object") return null
  const b = body as { v?: unknown; s?: unknown; e?: unknown; src?: unknown; app?: unknown }
  if (b.v !== 1 || !isSid(b.s) || !Array.isArray(b.e)) return null
  const events: LiveEvent[] = []
  let here: { area: Area; path: string } | null = null
  for (const raw of b.e.slice(0, LIVE_MAX_BATCH)) {
    if (!Array.isArray(raw) || raw.length < 3 || raw.length > 4) continue
    const [ago, k, name, extra] = raw as unknown[]
    if (typeof ago !== "number" || !Number.isFinite(ago)) continue
    const seconds = Math.min(Math.max(Math.round(ago), 0), 3600)
    const at = new Date(now - seconds * 1000).toISOString()
    if (k === "p") {
      const placed = placePath(name, host)
      if (!placed) continue
      here = { area: placed.area, path: placed.path }
      events.push({ kind: "page", area: placed.area, path: placed.path, at })
    } else if (k === "a" && isLiveAction(name)) {
      const area: Area = here?.area ?? (name === "auth.signin" || name === "auth.signup" ? "auth" : host === "site" ? "creators" : "marketing")
      const e: LiveEvent = { kind: "action", area, path: here?.path ?? null, name, at }
      if (name === "order.paid") {
        if (typeof extra !== "string" || !RECEIPT_TOKEN.test(extra)) continue
        e.token = extra
      }
      events.push(e)
    }
  }
  return { sid: b.s, events, source: cleanSource(b.src), app: b.app === 1 }
}

/* ── For the admin ─────────────────────────────────────────────────────── */

/** "Explore", "Product: blue-brushes", "Checkout". */
export function livePageLabel(path: string | null | undefined, area?: string | null): string {
  if (!path) return ""
  if (path === "/") return area === "creators" ? "Home page" : "Home"
  const parts = path.split("/").filter(Boolean)
  const words = parts.map((p) => (p === ":id" ? "one item" : p.replace(/[-_]/g, " ")))
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  return [first, ...words.slice(1)].join(", ")
}

export function describeLiveAction(name: string): string {
  return isLiveAction(name) ? LIVE_ACTIONS[name] : "Did something"
}

/** "4 min", "1 h 12 min": how long a session has been going. */
export function sessionLength(started: string | null | undefined, last: string | null | undefined): string {
  const a = started ? Date.parse(started) : NaN
  const b = last ? Date.parse(last) : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return ""
  const min = Math.round((b - a) / 60_000)
  if (min < 1) return "under a minute"
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}
