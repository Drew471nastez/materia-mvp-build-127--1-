/**
 * ===========================================================================
 *  AN IMPORTED THEME'S PAGE, DRAWN ONCE FOR EVERY STRANGER
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
 * is drawn from that address alone. It is then shared only if the answer is
 * a plain page (publicAnswer): a 200 page of HTML that set no cookie and
 * changed no cart. (It was held by the CDN too, until a Publish showed it
 * could not be reached there: see below.)
 * A request typed straight at a marked address is refused by the proxy
 * before any cache is asked.
 *
 * NOT `Vary: Cookie`. It used to ride along "in case a CDN keys on the
 * address the browser asked for", and it is why every one of these pages
 * came back `x-vercel-cache: MISS`: Vercel's CDN does not store an answer
 * whose Vary names Cookie at all (docs, CDN cache, "High-cardinality
 * headers": "Vary key denied"). Vercel keys a rewritten request on the
 * address it was rewritten to, which is the whole design here: Routing
 * Middleware runs before the cache, and the marker in the path is what keeps
 * a stranger's copy apart (the same way Vercel's own guide keeps A/B variants
 * apart). Somebody with a cart or a session is never rewritten to a marked
 * address, so no cookie holder can reach the copy. What it varies by now is
 * low in number: the country (already in the marker; said again for any
 * other cache) and Sec-Fetch-Dest, because a page opened as a document is
 * prepared for its first draw and a script's fetch of the same address is
 * not (./first-load.ts).
 *
 * WHAT IS NEVER HELD, and why:
 *   - anything but GET or HEAD, and a script's request (JSON, section
 *     rendering, /cart.js and every other address with an extension)
 *   - the cart, checkout, account, password, search, the language selector's
 *     answer, the wishlist and a preview: each is this visitor's, or carries
 *     what they typed (search)
 *   - a request carrying one of Storelib's own cookies that a page is drawn
 *     from: the cart (sl_theme_cart), a website customer's session and its
 *     hint, a Storelib session, a password pass, a chosen country
 *     (sl_country), the wishlist, a checkout country, a discount hold. An
 *     unknown cookie of Storelib's own counts as one of these (below).
 *   - a website behind a password, and a request let in with a pass
 *   - a page the proxy is offering a language on (it sets a cookie)
 *   - the empty-the-cart link (?sl_cart=clear), which sets the cart cookie
 *
 * NO LONGER THE CDN'S, ONLY THE HOLD'S. Publish could not reach a CDN copy:
 * revalidateTag clears Next's caches, not a CDN's copy of a route's answer,
 * so after every Publish a stranger was shown the previous theme for up to
 * its sixty seconds. The marked address and every rule above still decide
 * what is one stranger's page for everybody; what keeps it now is the hold
 * (./stranger-hold.ts), in Next's data cache under the site's tag, which
 * Publish expires at once on every server (lib/website-builder/
 * published-site.ts revalidatePublishedSite). The page is still drawn once a
 * minute rather than once a visit; the browser is told what any page of the
 * theme says.
 */

/** What a stranger's page is sent with: what every page of a theme says (./site.ts pageHtml), which keeps Back and Forward instant and no shared cache holds. */
export const PUBLIC_PAGE_CACHE = "private, no-cache"
/** Said by the handler between its draw and the hold (never sent on): this answer may be handed to every stranger at its marked address. */
export const SHAREABLE_HEADER = "x-storelib-shareable"

/**
 * WHICH COOKIES MAKE A PAGE SOMEBODY'S. A page is drawn by Storelib's server,
 * which reads cookies by name: only one of Storelib's own can change what it
 * draws. Their names all start sl_, storelib_, materia_ or sb- (Supabase),
 * on their own or behind __Host- / __Secure-. Every other cookie on the
 * website's host is the theme's, an app's or an analytics tool's, set in the
 * browser for the browser, and never reaches a draw.
 *
 * It used to be the other way round: a short list of analytics cookies was
 * harmless and anything else made the request private. Storelib's own
 * tracker sets sl_asid and materia_visitor on a visitor's first page, the
 * consent choice is storelib_consent, and a Shopify theme or its apps set
 * cookies of their own (recently viewed, a popup seen, Klaviyo's
 * __kla_id). So the second page a visitor opened, and every page of a
 * visitor who came back, was drawn for them alone: no CDN, no held copy,
 * the whole Liquid draw on every click.
 *
 * Storelib's own cookies that never change a page: the language ones
 * (sl_lang, sl_suggest), read only by the proxy, before any cache, and by
 * the page's script; the tracker's visit and browser ids (sl_asid,
 * materia_visitor) and the consent choice (storelib_consent), read only by
 * the page's script and by /api/track-view; and the device a purchase was
 * made on (materia_session), read only by checkout and the downloads, so a
 * buyer who comes back is not drawn alone for a year. Any other cookie of
 * Storelib's own, named here or not, keeps the request private.
 */
const OWN_COOKIE = /^(?:__Host-|__Secure-)?(?:sl_|storelib_|materia_|sb-|sb_)/i
const OWN_HARMLESS = /^(?:sl_lang|sl_suggest|sl_asid|materia_visitor|materia_session|storelib_consent)$/

/** The cookie names in a Cookie header. */
export function cookieNames(header: string | null | undefined): string[] {
  if (!header) return []
  return header.split(";").map((p) => p.split("=")[0]?.trim() ?? "").filter(Boolean)
}

/** Whether a cookie, by its name, can change what a page is drawn with: one of Storelib's own, other than the few that never do. */
export function pageCookie(name: string): boolean {
  return OWN_COOKIE.test(name) && !OWN_HARMLESS.test(name)
}

/** Whether a request carries no cookie that could change what is drawn for it. */
export function strangerCookies(header: string | null | undefined): boolean {
  return !cookieNames(header).some(pageCookie)
}

/** Paths that are always one visitor's, or carry what they typed. A blog post's preview is its editor's (lib/storelib-theme/compat/site.ts). */
const PRIVATE_PAGE = /^\/(?:cart|checkout|account|password|search|localization|wishlist|preview|challenge|apps|tools|services|blogs\/[^/?#]+\/~preview)(?:[/?#.]|$)/i

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
