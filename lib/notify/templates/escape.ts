/**
 * ===========================================================================
 *  EVERY DYNAMIC VALUE IN A NOTIFICATION PASSES THROUGH HERE
 * ===========================================================================
 * The templates never insert HTML that came from data. Text is escaped as
 * text, an address is escaped for an attribute, and a link is only ever one
 * of two things:
 *
 *   an action     built from ctx.baseUrl plus a path the catalog wrote, so a
 *                 button in a Storelib email only ever opens Storelib
 *   a footer link the preferences or unsubscribe address the engine signed;
 *                 http(s) only, and refused when it points anywhere but the
 *                 canonical host
 *
 * javascript:, data:, protocol relative (//evil.com) and anything with a
 * control character are refused, not repaired.
 *
 * Pure: no imports, safe in the browser and in tests.
 */

const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "`": "&#96;",
}

/** Text for an HTML body. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"'`]/g, (c) => ENTITIES[c])
}

/** A value inside a double quoted attribute. The same escape, named for the reader. */
export function escapeAttr(value: unknown): string {
  return escapeHtml(value)
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/

/**
 * One line of text from data: control characters and line breaks become
 * spaces, runs of space collapse, and it is cut at `max` characters with an
 * ellipsis. Returns "" for null, undefined, objects and arrays, so a missing
 * value never prints as "undefined" or "[object Object]".
 */
export function cleanText(value: unknown, max = 120): string {
  if (value == null) return ""
  if (typeof value !== "string" && typeof value !== "number") return ""
  if (typeof value === "number" && !Number.isFinite(value)) return ""
  // eslint-disable-next-line no-control-regex
  const s = String(value).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim()
  if (s.length <= max) return s
  return `${s.slice(0, Math.max(1, max - 1)).trimEnd()}\u2026`
}

/** An absolute http(s) address, or null. */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (!raw || CONTROL.test(raw) || /\s/.test(raw)) return null
  if (!/^https?:\/\//i.test(raw)) return null
  try {
    const u = new URL(raw)
    if (u.protocol !== "https:" && u.protocol !== "http:") return null
    if (!u.hostname) return null
    if (u.username || u.password) return null
    return u.toString()
  } catch {
    return null
  }
}

/**
 * A picture an inbox may fetch: an absolute https address and nothing else,
 * so no email ever asks for one over http, from a data: URI or from a path.
 */
export function safeImageUrl(value: unknown): string | null {
  const safe = safeHttpUrl(value)
  return safe && safe.startsWith("https://") ? safe : null
}

/** The canonical origin, from ctx.baseUrl. Falls back to https://storelib.com when it is not a usable address. */
export function canonicalOrigin(baseUrl: unknown): string {
  const safe = safeHttpUrl(baseUrl)
  if (!safe) return "https://storelib.com"
  return new URL(safe).origin
}

/**
 * A Storelib address: the canonical origin plus a path the catalog wrote.
 * The path must start with a single "/", so it can never name another host.
 * Returns null when it does not.
 */
export function actionUrl(baseUrl: unknown, path: unknown): string | null {
  if (typeof path !== "string") return null
  const p = path.trim()
  if (!p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return null
  if (CONTROL.test(p) || /\s/.test(p)) return null
  const origin = canonicalOrigin(baseUrl)
  try {
    const u = new URL(p, origin)
    if (u.origin !== origin) return null
    return u.toString()
  } catch {
    return null
  }
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "")

/**
 * A full address that must belong to Storelib (an unsubscribe or preferences
 * link the engine made). https (or http on localhost), and refused when its
 * host is not the canonical one (with or without "www.").
 */
export function sameSiteUrl(baseUrl: unknown, url: unknown): string | null {
  const safe = safeHttpUrl(url)
  if (!safe) return null
  const u = new URL(safe)
  const base = new URL(canonicalOrigin(baseUrl))
  if (bareHost(u.hostname) !== bareHost(base.hostname)) return null
  if (u.protocol !== base.protocol) return null
  return safe
}

/** One path segment from an id: anything but a plain id is encoded. */
export function segment(value: unknown): string {
  const s = cleanText(value, 200)
  return s ? encodeURIComponent(s) : ""
}

/**
 * A mailto: link to one plain address, or null. Only a simple address is
 * accepted (letters, digits and . _ % + - before the @, a dotted host after
 * it), so nothing a buyer typed can add recipients, headers or a body. The
 * subject, when given, is encoded.
 */
export function mailtoUrl(email: unknown, subject?: string): string | null {
  if (typeof email !== "string") return null
  const e = email.trim()
  if (e.length > 254 || !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(e)) return null
  const s = cleanText(subject, 120)
  return `mailto:${e}${s ? `?subject=${encodeURIComponent(s)}` : ""}`
}
