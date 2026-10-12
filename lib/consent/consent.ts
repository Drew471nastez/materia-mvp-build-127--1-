/**
 * ===========================================================================
 *  COOKIE CONSENT: WHAT A VISITOR AGREED TO, AND HOW THAT IS KEPT
 * ===========================================================================
 * Four kinds of storage, the way the ePrivacy rules and the GDPR sort them:
 *
 *   necessary     signing in, checkout, the cart, security. Always on: the
 *                 site does not work without them, so they need no consent.
 *   preferences   layout choices remembered between visits. A language or
 *                 currency you pick yourself is necessary: you asked for it.
 *   analytics     counting visits with an identifier that lasts beyond the
 *                 page (materia_visitor, sl_asid, visitor_id), where a visit
 *                 came from, and Vercel Analytics.
 *   marketing     advertising pixels. Storelib sets none today; the category
 *                 exists so a creator's site that adds one asks first.
 *
 * NOTHING OPTIONAL BEFORE A CHOICE. Until a visitor presses a button, every
 * optional category is off: a visit is still counted, once, with no
 * identifier (see app/api/track-view), which needs no consent.
 *
 * THE RECORD. One cookie, `storelib_consent`, readable by the server and the
 * page alike, holding the version, the four answers and when they were
 * given: `2.p1.a0.m0.1727090000`. It lasts twelve months, the longest the
 * French and Italian regulators accept, and a record from an older version
 * of this policy is treated as no record, so a change to what is asked
 * about is asked about.
 *
 * Pure: no document, no window. lib/consent/client.ts reads and writes it.
 */

export const CONSENT_COOKIE = "storelib_consent"
/** Bumped when the categories or what they cover change; older answers are asked again. */
export const CONSENT_VERSION = 2
/** Twelve months, in seconds. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

export type ConsentCategory = "necessary" | "preferences" | "analytics" | "marketing"
export type OptionalCategory = Exclude<ConsentCategory, "necessary">

export const OPTIONAL: OptionalCategory[] = ["preferences", "analytics", "marketing"]

export interface Consent {
  version: number
  preferences: boolean
  analytics: boolean
  marketing: boolean
  /** Seconds since the epoch, when it was given. */
  at: number
}

export const CATEGORY_TEXT: Record<ConsentCategory, { title: string; body: string }> = {
  necessary: {
    title: "Necessary",
    body: "Keep you signed in, run checkout and your cart, and protect your account. The site does not work without them.",
  },
  preferences: {
    title: "Preferences",
    body: "Remember how you like pages laid out, such as a grid or a list, and which columns a table shows.",
  },
  analytics: {
    title: "Analytics",
    body: "Count returning visitors and where visits come from, so creators can see what works. Without them a visit is still counted, once, with nothing stored on your device.",
  },
  marketing: {
    title: "Marketing",
    body: "Measure advertising. Storelib sets none of these today.",
  },
}

export function everything(on: boolean, now: number): Consent {
  return { version: CONSENT_VERSION, preferences: on, analytics: on, marketing: on, at: Math.floor(now / 1000) }
}

export function serialize(c: Consent): string {
  return `${c.version}.p${c.preferences ? 1 : 0}.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}.${c.at}`
}

/**
 * The record, or null when there is none, it is malformed, it is from an
 * older version of the policy, or it is more than twelve months old.
 */
export function parse(value: string | null | undefined, nowMs: number): Consent | null {
  if (!value) return null
  const m = /^(\d{1,3})\.p([01])\.a([01])\.m([01])\.(\d{9,11})$/.exec(value.trim())
  if (!m) return null
  const c: Consent = { version: Number(m[1]), preferences: m[2] === "1", analytics: m[3] === "1", marketing: m[4] === "1", at: Number(m[5]) }
  if (c.version !== CONSENT_VERSION) return null
  const age = nowMs / 1000 - c.at
  if (age < -86_400 || age > CONSENT_MAX_AGE) return null
  return c
}

/** The value of one cookie in a Cookie header or document.cookie. */
export function cookieValue(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  const hit = header.split(/;\s*/).find((p) => p.startsWith(`${name}=`))
  if (!hit) return null
  try {
    return decodeURIComponent(hit.slice(name.length + 1))
  } catch {
    return null
  }
}

/** True when the category may be used. Necessary always; the rest only with a record that says yes. */
export function allows(c: Consent | null, category: ConsentCategory): boolean {
  if (category === "necessary") return true
  return c ? c[category] === true : false
}

/* ── what is stored, for the preferences panel and the privacy page ─────── */

export interface StoredItem {
  name: string
  category: ConsentCategory
  kind: "cookie" | "local storage" | "session storage"
  purpose: string
  lasts: string
}

/**
 * Everything storelib.com itself stores in a browser. Checked against the
 * code by tests/cookie-consent.test.ts, so a new cookie cannot be added
 * without being listed and given a category.
 */
export const STORED: StoredItem[] = [
  { name: "sb-*-auth-token", category: "necessary", kind: "cookie", purpose: "Keeps you signed in", lasts: "Until you sign out" },
  { name: "sb-host-only", category: "necessary", kind: "cookie", purpose: "Keeps your sign-in to this address only", lasts: "1 year" },
  { name: "materia_session", category: "necessary", kind: "cookie", purpose: "Recognises the device a purchase was made on, so its downloads open", lasts: "1 year" },
  { name: "storelib_auth_redirect", category: "necessary", kind: "cookie", purpose: "Returns you to the right page after signing in", lasts: "10 minutes" },
  { name: "storelib_consent", category: "necessary", kind: "cookie", purpose: "Remembers these choices", lasts: "1 year" },
  { name: "storelib.cart.*", category: "necessary", kind: "local storage", purpose: "Your cart", lasts: "Until you check out or clear it" },
  { name: "materia_guest_id", category: "necessary", kind: "cookie", purpose: "Your wishlist before you have an account", lasts: "1 year" },
  { name: "sl_country", category: "necessary", kind: "cookie", purpose: "The country you chose on a creator's website, for its prices and currency", lasts: "1 year" },
  { name: "sl_wishlist", category: "necessary", kind: "cookie", purpose: "Your wishlist on a creator's website before you sign in", lasts: "1 year" },
  { name: "storelib_language, storelib_currency", category: "necessary", kind: "cookie", purpose: "The language and currency you chose", lasts: "1 year" },
  { name: "_sl_bell_v1", category: "necessary", kind: "local storage", purpose: "Shows your unread notification count as a page opens, for the account signed in on this device", lasts: "Until you sign out" },
  { name: "storelib_tz", category: "necessary", kind: "cookie", purpose: "Shows your own orders in your time zone", lasts: "1 year" },
  { name: "storelib_feed_view, storelib_order_columns, storelib_orders_range", category: "preferences", kind: "cookie", purpose: "How you like lists laid out, and the dates you last looked at", lasts: "1 year" },
  { name: "storelib_wishlist_count", category: "preferences", kind: "cookie", purpose: "Draws your wishlist count before the page loads", lasts: "1 year" },
  { name: "storelib_recent_searches", category: "preferences", kind: "local storage", purpose: "Your last few searches, shown when you open Search", lasts: "Until cleared" },
  { name: "materia_visitor", category: "analytics", kind: "cookie", purpose: "Tells a returning visitor from a new one", lasts: "1 year" },
  { name: "visitor_id", category: "analytics", kind: "cookie", purpose: "The same, set by the server", lasts: "1 year" },
  { name: "sl_asid", category: "analytics", kind: "cookie", purpose: "Groups the pages of one visit", lasts: "30 minutes" },
  { name: "materia_attr_*", category: "analytics", kind: "local storage", purpose: "Where a visit came from", lasts: "Until cleared" },
  { name: "Vercel Analytics", category: "analytics", kind: "cookie", purpose: "Traffic and page speed. Sets no cookie, and loads only with this on", lasts: "Nothing stored" },
]

/** The optional cookies to delete when a category is turned off. */
export const OPTIONAL_COOKIES: Record<OptionalCategory, string[]> = {
  preferences: ["storelib_feed_view", "storelib_order_columns", "storelib_orders_range", "storelib_wishlist_count"],
  analytics: ["materia_visitor", "sl_asid"],
  marketing: [],
}
