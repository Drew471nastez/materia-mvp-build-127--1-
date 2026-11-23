/**
 * ===========================================================================
 *  WHAT A CREATOR DID IN /app, AS THE ADMIN READS IT
 * ===========================================================================
 * The owner: "for each creator I want to see when they went live, when they
 * were last active, whether they are online now, and what they do". This is
 * the shared vocabulary for that, with no server or browser code in it, so
 * the tracker in the browser, the route that takes its batches, the admin
 * views and the suite (tests/creator-activity-r59.test.ts) all read one copy.
 *
 * WHAT IS KEPT, AND WHAT NEVER IS. Two kinds of event:
 *
 *   page     a page of /app was opened, as its path with every id, number,
 *            email or token replaced by `:id` (normalisePath). Never the
 *            query string or the hash, which is where an email or a search
 *            ends up.
 *   action   one of the names in ACTIONS below, at the moment it happened:
 *            published a website, started Stripe setup, opened the editor.
 *            A name the list does not hold is dropped, on both sides.
 *
 * Nothing typed is ever read: no field value, no keystroke, no message, no
 * email, no card. No click position either. The country is the two letters
 * Vercel puts on the request, and the device is worked out on the server
 * from the browser's signature into four coarse words (deviceOf). The IP
 * address is never stored.
 *
 * SQL part 430 (supabase/sql/run-now/430_creator_activity.sql) holds the
 * tables. Events are kept 30 days; when a creator was last seen and when they
 * went live are kept on their presence row for good.
 */

/** "Online now": something arrived from them within this long. */
export const ONLINE_MS = 2 * 60_000
/** A gap longer than this starts a new session (part 430's ingest function says the same). */
export const SESSION_GAP_MS = 30 * 60_000
/** Events older than this are deleted by the daily cleanup. */
export const RETENTION_DAYS = 30
/** The browser sends at most this often while the tab is visible, and never while it is hidden. */
export const SEND_EVERY_MS = 60_000
/** The presence row is written at most this often per person (part 430: `last_seen_at < now() - 55 s`). */
export const PRESENCE_EVERY_MS = 55_000
/** At most this many events in one batch; the browser sends early when it has this many. */
export const MAX_BATCH = 40
/** A batch body past this is not one of ours. */
export const MAX_BODY_BYTES = 4_000
/** Coming back to a tab hidden this long notes the page again, so the session it starts has a first page. */
export const RESUME_AFTER_MS = 5 * 60_000

export type EventKind = "page" | "action"

/**
 * THE NAMED ACTIONS. Each is a moment that already had a name in the
 * product: a button that publishes, a step that starts. Adding one is adding
 * a line here and one `noteActivity("…")` where it happens.
 */
export const ACTIONS = {
  "site.publish": "Published a website",
  "site.unpublish": "Took a website offline",
  "editor.open": "Opened the website editor",
  "editor.publish": "Published from the editor",
  "product.new": "Started a new product",
  "stripe.start": "Started Stripe setup",
  "stripe.continue": "Continued Stripe setup",
} as const

export type ActionName = keyof typeof ACTIONS

export function isActionName(v: unknown): v is ActionName {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(ACTIONS, v)
}

/** The groups the admin's Activity feed filters by: the part of the name before the dot. */
export const ACTION_GROUPS: { id: string; label: string }[] = [
  { id: "site", label: "Website" },
  { id: "editor", label: "Editor" },
  { id: "product", label: "Products" },
  { id: "stripe", label: "Stripe" },
]

/* ── Paths ─────────────────────────────────────────────────────────────── */

/*
  ONLY THE PRODUCT'S OWN WORDS ARE KEPT. A segment is kept when it is the
  name of a folder under app/(storelib)/app or app/(storelib)/website-builder
  (products, settings, new, edit…), and anything else (an id, a slug made
  from a product's title, a contact's key, which can be an email) is `:id`.
  A list of what may pass, not of what may not: a new kind of id cannot slip
  through a pattern nobody wrote.
*/
const KNOWN_SEGMENTS = new Set(
  "add ai analytics app audience auth billing bookings builder callback changelog checkout classroom code collections community contacts coupons courses creator-page customers demo edit editor emails events feed files flow forms gamification gumroad help identity-done import integrations inventory leads learn library members memberships moderation navigation new offers onepage open orders page payments payouts products questions reviews sales search settings sites size-charts spaces stripe support themes upgrade website-builder widgets".split(" "),
)

/** Only these parts of Storelib are recorded; anything else is not a page of the dashboard. */
const ROOTS = ["/app", "/website-builder"]

/**
 * A path as it is kept: no query, no hash, every segment that is not one of
 * the product's own words `:id`, at most eight segments. Null for anything that is
 * not a page of /app or the website builder.
 */
export function normalisePath(raw: unknown): string | null {
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
    /* Kept as it came; each segment is still checked below. */
  }
  const parts = path.split("/").filter(Boolean).slice(0, 8)
  const out = parts.map((seg) => (KNOWN_SEGMENTS.has(seg) ? seg : ":id"))
  const clean = `/${out.join("/")}`
  if (!ROOTS.some((r) => clean === r || clean.startsWith(`${r}/`))) return null
  return clean
}

/** The words a path reads as in the admin: "Products", "Products › :id". */
const PAGE_NAMES: Record<string, string> = {
  "/app": "Home",
  "/website-builder/editor/:id": "Website editor",
  "/website-builder/code/:id": "Code editor",
}

export function pageLabel(path: string): string {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path]
  const parts = path.split("/").filter(Boolean)
  const rest = parts[0] === "app" ? parts.slice(1) : parts
  const words = rest.map((p) => (p === ":id" ? "one item" : p.replace(/[-_]/g, " ")))
  if (!words.length) return "Home"
  const first = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  return [first, ...words.slice(1)].join(", ")
}

/** One event in words, for a row in the admin. */
export function describeEvent(e: { kind: EventKind | string; name: string }): string {
  if (e.kind === "action") return isActionName(e.name) ? ACTIONS[e.name] : "Did something"
  return pageLabel(e.name)
}

/* ── The batch the browser sends ───────────────────────────────────────── */

/**
 * On the wire: `{"v":1,"e":[[secondsAgo,"p","/app/products"],[3,"a","site.publish"]]}`.
 * Seconds before the send, not a clock time: the browser's clock is not
 * trusted, the server's is.
 */
export type WireEvent = [number, "p" | "a", string]
export type WireBatch = { v: 1; e: WireEvent[] }

export type ParsedEvent = { kind: EventKind; name: string; at: string }

/** A batch as the server keeps it: only what passes, never more than MAX_BATCH. */
export function parseBatch(body: unknown, now: number): ParsedEvent[] | null {
  if (!body || typeof body !== "object") return null
  const b = body as { v?: unknown; e?: unknown }
  if (b.v !== 1 || !Array.isArray(b.e)) return null
  const out: ParsedEvent[] = []
  for (const raw of b.e.slice(0, MAX_BATCH)) {
    if (!Array.isArray(raw) || raw.length !== 3) continue
    const [ago, k, name] = raw as unknown[]
    if (typeof ago !== "number" || !Number.isFinite(ago)) continue
    /* At most an hour back (a tab that slept), never in the future. */
    const seconds = Math.min(Math.max(Math.round(ago), 0), 3600)
    const at = new Date(now - seconds * 1000).toISOString()
    if (k === "p") {
      const path = normalisePath(name)
      if (path) out.push({ kind: "page", name: path, at })
    } else if (k === "a" && isActionName(name)) {
      out.push({ kind: "action", name, at })
    }
  }
  return out
}

/* ── Where and on what ─────────────────────────────────────────────────── */

export type Device = {
  device: "phone" | "tablet" | "desktop" | null
  os: string | null
  browser: string | null
  /** The Storelib app on a phone (the Capacitor shell), or a browser. */
  shell: "ios_app" | "android_app" | "web"
}

/**
 * Coarse words from the browser's signature, worked out here so the
 * signature itself is never kept. The same tests lib/analytics/user-agent
 * makes for a store's visitors, plus the app shell, which says StorelibApp
 * or Capacitor (app/(storelib)/app/layout.tsx isCapacitorWebView).
 */
export function deviceOf(ua: string | null | undefined, parse: (ua: string) => { device: "mobile" | "tablet" | "desktop" | null; os: string | null; browser: string | null }): Device {
  const raw = ua ?? ""
  const p = parse(raw)
  const native = /StorelibApp|Capacitor/.test(raw) || (/\bwv\b/.test(raw) && /Android/.test(raw))
  const shell: Device["shell"] = native ? (p.os === "iOS" ? "ios_app" : p.os === "Android" ? "android_app" : /iphone|ipad/i.test(raw) ? "ios_app" : "android_app") : "web"
  return {
    device: p.device === "mobile" ? "phone" : p.device,
    os: p.os,
    browser: native ? null : p.browser,
    shell,
  }
}

/** The two letters Vercel's edge puts on the request, or null. */
export function countryOf(headers: { get(name: string): string | null }): string | null {
  const raw = headers.get("x-vercel-ip-country")
  return raw && /^[A-Za-z]{2}$/.test(raw) && raw.toUpperCase() !== "XX" ? raw.toUpperCase() : null
}

/** A country by its English name ("RO" → "Romania"), the code when there is none. */
export function countryName(code: string | null | undefined): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code
  } catch {
    return code
  }
}

/** The flag for a two letter code, from its regional indicator letters. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

/** "Phone, iOS, Storelib app" / "Desktop, macOS, Chrome". */
export function deviceLabel(d: { device?: string | null; os?: string | null; browser?: string | null; shell?: string | null }): string {
  const kind = d.device ? d.device.charAt(0).toUpperCase() + d.device.slice(1) : null
  const where = d.shell === "ios_app" || d.shell === "android_app" ? "Storelib app" : d.browser
  return [kind, d.os, where].filter(Boolean).join(", ") || "Unknown device"
}

/* ── Sessions, for the creator's timeline ──────────────────────────────── */

export type TimelineEvent = { id: number | string; at: string; kind: EventKind | "saved"; name: string; label: string; sessionStart?: boolean }

export type Session = { start: string; end: string; events: TimelineEvent[] }

/**
 * Newest first in, newest first out: a new session wherever the database
 * marked one, or where two events are more than SESSION_GAP_MS apart.
 */
export function groupSessions(events: TimelineEvent[]): Session[] {
  const sessions: Session[] = []
  let current: Session | null = null
  let previousAt: number | null = null
  for (const e of events) {
    const t = Date.parse(e.at)
    const gap = previousAt !== null && previousAt - t > SESSION_GAP_MS
    if (!current || gap) {
      current = { start: e.at, end: e.at, events: [] }
      sessions.push(current)
    }
    current.events.push(e)
    current.start = e.at
    previousAt = t
    /* The event that started a session is the oldest of it: the next one belongs to an earlier session. */
    if (e.sessionStart) {
      current = null
      previousAt = null
    }
  }
  return sessions
}

/** Online now, from the last time a batch was taken. */
export function isOnline(lastSeen: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeen) return false
  const t = Date.parse(lastSeen)
  return Number.isFinite(t) && now - t <= ONLINE_MS
}
