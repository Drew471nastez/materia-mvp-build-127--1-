/**
 * ===========================================================================
 *  NO LINK ON A ONEPAGE CAN RUN SCRIPT
 * ===========================================================================
 * React 19 refuses a `javascript:` address in an href or a src it draws, but
 * three buttons on the live page open their address themselves with
 * window.open (a PDF opened directly, a booking opened directly), and
 * React never sees those. The booking button even fell back to the raw text
 * the creator typed when it was not a Calendly or Cal.com address, so
 * `javascript:...` saved there ran in the page's origin when a visitor
 * pressed it. In the native app a OnePage is served on storelib.com itself
 * (lib/onepage/host-route), beside the visitor's own session.
 *
 * Two answers, both here:
 *
 *   withSafeUrls      what PUT /api/onepage and the publish keep: every
 *                     address in a block (any key named url, href or link,
 *                     or ending _url, _href or _link) that names a script,
 *                     a data document or a local file is emptied, groups
 *                     and nested lists included. Nothing else changes.
 *   openableUrl       what a button may hand to window.open: an http(s)
 *                     address or a path on this site, else nothing.
 *
 * Pure and isomorphic, for the route, the renderer and
 * tests/onepage-production-audit.test.ts.
 */

/** A key whose string value is an address the page may open or draw. */
const URL_KEY = /(?:^|_)(?:url|href|link)$/i

/** A picture inlined as data is drawn, never navigated: those few image types are kept. */
const RASTER_DATA = /^data:image\/(?:png|jpe?g|gif|webp|avif);/i

/**
 * The address as a browser reads its scheme: leading spaces and control
 * characters dropped, tabs and line breaks removed anywhere (the URL
 * standard ignores them, so "java\tscript:" is javascript:), lower case.
 */
function schemeView(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/^[\u0000- ]+/, "").replace(/[\t\n\r]/g, "").toLowerCase()
}

/** Does this text, used as an address, run script or open a document the page did not mean to? */
export function isUnsafeUrl(value: unknown): boolean {
  if (typeof value !== "string") return false
  const v = schemeView(value)
  if (v.startsWith("javascript:") || v.startsWith("vbscript:") || v.startsWith("file:")) return true
  if (v.startsWith("data:")) return !RASTER_DATA.test(v)
  return false
}

/**
 * A copy of `value` with every unsafe address emptied. Arrays and objects are
 * walked to any depth (a group's children, a list of social platforms, an
 * action object). The input is never changed; what has nothing unsafe in it
 * comes back as the same reference.
 */
export function withSafeUrls<T>(value: T, depth = 0): T {
  if (depth > 12 || value === null || typeof value !== "object") return value
  if (Array.isArray(value)) {
    let changed = false
    const next = value.map((item) => {
      const cleaned = withSafeUrls(item, depth + 1)
      if (cleaned !== item) changed = true
      return cleaned
    })
    return (changed ? next : value) as unknown as T
  }
  const source = value as Record<string, unknown>
  let out: Record<string, unknown> | null = null
  for (const [key, item] of Object.entries(source)) {
    let next: unknown = item
    if (typeof item === "string") {
      if (URL_KEY.test(key) && isUnsafeUrl(item)) next = ""
    } else if (item && typeof item === "object") {
      next = withSafeUrls(item, depth + 1)
    }
    if (next !== item) {
      out ??= { ...source }
      out[key] = next
    }
  }
  return (out ?? value) as T
}

/**
 * The page's social links ({ instagram: "https://…", … }): their keys are
 * platform names, not url, so withSafeUrls would pass them by. Each value
 * that is an unsafe address is emptied; the rest are kept as they are.
 */
export function withSafeLinkValues<T>(links: T): T {
  if (!links || typeof links !== "object" || Array.isArray(links)) return links
  let out: Record<string, unknown> | null = null
  for (const [key, value] of Object.entries(links as Record<string, unknown>)) {
    if (isUnsafeUrl(value)) {
      out ??= { ...(links as Record<string, unknown>) }
      out[key] = ""
    }
  }
  return (out ?? links) as T
}

/** What a button may give window.open: an absolute http(s) address, or a path on this site. Anything else is nothing. */
export function openableUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || isUnsafeUrl(value)) return null
  if (value.startsWith("/") && !value.startsWith("//")) return value
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
  } catch {
    return null
  }
}
