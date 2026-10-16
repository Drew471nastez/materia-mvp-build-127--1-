/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGE, HELD BY THE CDN FOR A STRANGER
 * ===========================================================================
 * Every page of an imported Shopify theme was drawn per request and sent
 * `private, no-cache`, so nothing was held anywhere and a visitor's first
 * page always waited on the whole draw. A page a stranger opens (no cart, no
 * sign in, no country or language of their own chosen) is the same for
 * every stranger in the same country, so it may be held by the CDN for a
 * minute, as a built website's front page already is.
 *
 * HOW IT IS KEPT APART FROM EVERYBODY ELSE'S. The proxy (proxy.ts
 * compatRewrite) decides a request is a stranger's (strangerPage) and sends
 * it to the handler with a marker in the path (`/~anon~<host>~<country>~
 * <language>~<market>/…`), so a stranger's copy has an address of its own
 * that no other request is ever rewritten to. The handler, seeing the
 * marker, reads no cookie at all and takes the country, language and market
 * from the marker rather than from headers, so what is held under an address
 * is drawn from that address alone. It is then sent `public, s-maxage=60,
 * stale-while-revalidate=300` only if the answer is a plain page
 * (publicAnswer): a 200 page of HTML that set no cookie and changed no cart.
 * `Vary: Cookie` and the country headers ride along as well, so a CDN that
 * keys on the address the browser asked for still never hands a stranger's
 * copy to somebody carrying a cart or a session. A request typed straight
 * at a marked address is refused by the proxy before any cache is asked.
 *
 * WHAT IS NEVER HELD, and why:
 *   - anything but GET or HEAD, and a script's request (JSON, section
 *     rendering, /cart.js and every other address with an extension)
 *   - the cart, checkout, account, password, search, the language selector's
 *     answer, the wishlist and a preview: each is this visitor's, or carries
 *     what they typed (search)
 *   - a request carrying any cookie but the analytics ones below: the cart
 *     (sl_theme_cart), a website customer's session and its hint, a Storelib
 *     session, a password pass, a chosen country (sl_country), the
 *     wishlist, a checkout country, a discount hold. An unknown cookie
 *     counts as one of these.
 *   - a website behind a password, and a request let in with a pass
 *   - a page the proxy is offering a language on (it sets a cookie)
 *   - the empty-the-cart link (?sl_cart=clear), which sets the cart cookie
 *
 * PUBLISH DOES NOT REACH IT. revalidateTag clears Storelib's data caches,
 * not a CDN's copy of a dynamic route's answer, so a page held here shows
 * the old site for up to its sixty seconds after a Publish (then one more
 * request while it is drawn again, stale-while-revalidate). That is the same
 * minute a built website's front page already has; it is why s-maxage stays
 * at sixty.
 */

/** What a stranger's page is sent with. */
/* No stale-while-revalidate: a background refresh on the CDN does not pass through the proxy again, so the handler would refuse it (its seal expired) and could replace a good copy with a 404. A minute, then drawn fresh. */
export const PUBLIC_PAGE_CACHE = "public, s-maxage=60"
/** And what it varies by, for a CDN that keys on the address the browser asked for. */
export const PUBLIC_PAGE_VARY = "Cookie, X-Vercel-IP-Country, CF-IPCountry"

/**
 * Cookies that change nothing a page draws: analytics and the CDN's own.
 * Everything else, named or not, makes a request somebody's (and private).
 * The language cookies (sl_lang, sl_suggest) are read only by the proxy,
 * before any cache, and by the page's own script in the browser.
 */
const HARMLESS_COOKIE = /^(?:_ga(?:_[A-Za-z0-9]+)?|_gid|_gat(?:_[A-Za-z0-9_]+)?|_gcl_[a-z]+|_fbp|_fbc|_ttp|_tt_enable_cookie|_pin_unauth|_uetsid|_uetvid|_clck|_clsk|_hjSessionUser_\d+|_hjSession_\d+|_hjTLDTest|__cf_bm|_cfuvid|sl_lang|sl_suggest)$/

/** The cookie names in a Cookie header. */
export function cookieNames(header: string | null | undefined): string[] {
  if (!header) return []
  return header.split(";").map((p) => p.split("=")[0]?.trim() ?? "").filter(Boolean)
}

/** Whether a request carries no cookie that could change what is drawn for it. */
export function strangerCookies(header: string | null | undefined): boolean {
  return cookieNames(header).every((n) => HARMLESS_COOKIE.test(n))
}

/** Paths that are always one visitor's, or carry what they typed. */
const PRIVATE_PAGE = /^\/(?:cart|checkout|account|password|search|localization|wishlist|preview|challenge|apps|tools|services)(?:[/?#.]|$)/i

/** Query keys that make an answer a script's, or change the visitor's cart. */
const PRIVATE_QUERY = /^(?:section_id|sections|sections_url|sl_cart|preview|view|oseid|form_type|return_to|return)$/i

/** Whether an address is a page a stranger may be served from the CDN: the path (on the site, after any language) and its query. */
export function strangerAddress(path: string, query: URLSearchParams): boolean {
  /* "/~…" is the marker's own shape: never a stranger's page, whatever follows. */
  if (!path.startsWith("/") || path.startsWith("/~") || PRIVATE_PAGE.test(path)) return false
  /* A file of any kind (/cart.js, /products/x.json, /sitemap.xml) is a script's or Storelib's own, never a page drawn here. */
  if (/\.[a-z0-9]{1,8}$/i.test(path)) return false
  for (const key of query.keys()) if (PRIVATE_QUERY.test(key)) return false
  return true
}

export interface StrangerRequest {
  method: string
  /** The path on the site, after any language prefix. */
  path: string
  query: URLSearchParams
  cookie: string | null
  accept: string | null
  contentType: string | null
  requestedWith: string | null
  /** The website asks for a password (whether or not this visitor has the pass). */
  protectedSite: boolean
  /** The proxy is offering this visitor a language, which sets a cookie on the answer. */
  offersLanguage: boolean
}

/** The proxy's half: whether this request is a stranger's page, to be sent to the marked address. */
export function strangerPage(r: StrangerRequest): boolean {
  if (r.method !== "GET" && r.method !== "HEAD") return false
  if (r.protectedSite || r.offersLanguage) return false
  if (r.requestedWith) return false
  if ((r.accept ?? "").includes("application/json") || (r.contentType ?? "").includes("json")) return false
  if (!strangerCookies(r.cookie)) return false
  return strangerAddress(r.path, r.query)
}

// ── The marker ──────────────────────────────────────────────────────────────

export const MARKER_PREFIX = "~anon~"

export interface StrangerMarker {
  host: string
  /** ISO country the page is drawn for, or null (unknown, or the store's own). */
  country: string | null
  locale: string | null
  market: string | null
}

const HOST = /^[a-z0-9.-]{1,253}(?::\d{1,5})?$/
const COUNTRY = /^[A-Z]{2}$/
const LOCALE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/
const MARKET = /^[a-z0-9-]{1,40}$/

/** The path segment a stranger's page is held under. Null when a part cannot be written safely: the request is then drawn as anybody's (private). */
export function strangerMarker(m: StrangerMarker): string | null {
  const host = m.host.toLowerCase()
  if (!HOST.test(host)) return null
  if (m.country !== null && !COUNTRY.test(m.country)) return null
  if (m.locale !== null && !LOCALE.test(m.locale)) return null
  if (m.market !== null && !MARKET.test(m.market)) return null
  return `${MARKER_PREFIX}${host}~${m.country ?? "_"}~${m.locale ?? "_"}~${m.market ?? "_"}`
}

/** The marker read back from the first path segment; null for anything that is not one. */
export function readStrangerMarker(segment: string | undefined): StrangerMarker | null {
  if (!segment) return null
  let raw = segment
  try {
    raw = decodeURIComponent(segment)
  } catch {
    return null
  }
  if (!raw.startsWith(MARKER_PREFIX)) return null
  const parts = raw.slice(MARKER_PREFIX.length).split("~")
  if (parts.length !== 4) return null
  const [host, country, locale, market] = parts
  const m: StrangerMarker = { host, country: country === "_" ? null : country, locale: locale === "_" ? null : locale, market: market === "_" ? null : market }
  return strangerMarker(m) === raw ? m : null
}

/** Whether a path is one of the marked addresses: refused when typed straight at the API (proxy.ts). */
export function markedThemeAddress(pathname: string): boolean {
  if (!pathname.startsWith("/api/site-theme/site/")) return false
  const segment = pathname.split("/")[5]
  if (!segment) return false
  try {
    return decodeURIComponent(segment).startsWith(MARKER_PREFIX)
  } catch {
    return true
  }
}

// ── The handler's half ──────────────────────────────────────────────────────

export interface AnswerFacts {
  method: string
  status: number
  type: string
  /** The Cache-Control the answer set (lib/storelib-theme/compat/site.ts pageHtml). */
  cacheControl: string | null
  setsCookie: boolean
  changesCart: boolean
}

/**
 * Whether an answer drawn for a marked request may be held by the CDN: a
 * 200 page of HTML that the theme's own rules already call a page
 * ("private, no-cache"; the cart, checkout, account and password pages are
 * "no-store"), that set no cookie and left the cart alone. Anything else
 * keeps the answer's own private header.
 */
export function publicAnswer(a: AnswerFacts): boolean {
  if (a.method !== "GET" && a.method !== "HEAD") return false
  if (a.status !== 200 || !/^text\/html\b/i.test(a.type)) return false
  if (a.setsCookie || a.changesCart) return false
  return a.cacheControl === "private, no-cache"
}
