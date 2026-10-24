/**
 * ===========================================================================
 *  BACK TO THE ONEPAGE, FROM THE CHECKOUT AND THE PRODUCT PAGE
 * ===========================================================================
 * The owner: "After it takes me to the product page or the checkout, and I go
 * back, it should take me back to the OnePage, not to the creator page."
 *
 * The OnePage lives on storelib.me; the checkout and the product page live on
 * storelib.com. A different origin: the checkout's Back could not tell the
 * page behind it was the OnePage (document.referrer is the origin only, and
 * the Navigation API lists same-origin entries only), so it went to the
 * product, and the product page's Back went to the creator page.
 *
 * So a OnePage link to either carries the page it was pressed on:
 *
 *   https://storelib.com/checkout?productId=...&cancel=<the OnePage>
 *   https://storelib.com/p/<slug>?back=<the OnePage>
 *
 * `cancel` is the checkout's own "where Back goes" (lib/checkout/return-url),
 * `back` is the product page's. Each is honoured only when it passes the
 * check below, on the server, so neither page can be made to send a buyer
 * anywhere else: an open redirect on a payment page is a phishing kit.
 *
 * WHAT PASSES (exactly, nothing that merely looks like it):
 *
 *   https://storelib.me/<name>           a OnePage: the OnePage host serves
 *                                        nothing but OnePages, and <name>
 *                                        is one segment that can be a name
 *   https://storelib.com/<name>/links    the same page as the native app
 *                                        serves it, on the platform itself
 *   https://<their domain>/links         the creator's own verified domain
 *                                        (the caller passes those hosts,
 *                                        read from the database)
 *
 * Always https, never a port, never user:pass@, never a backslash or a
 * control character, the query kept (utm survives), the hash dropped. On a
 * developer's machine (the platform on localhost) http://localhost/<name>/links
 * passes too, as lib/onepage/address builds it there.
 *
 * And the link itself goes straight to storelib.com (platformHref): one
 * navigation to the final page, never a 308 from storelib.me first.
 *
 * Pure: no React, no database. Safe on the client and the server.
 */
import { getOnePageDomain } from "@/lib/onepage/address"
import { isResolvableOnePageName } from "@/lib/onepage/username"
import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

/** The product page's own word for it. The checkout uses `cancel` (lib/checkout/return-url CANCEL_PARAM). */
export const PRODUCT_BACK_PARAM = "back"
export const CHECKOUT_BACK_PARAM = "cancel"

const MAX_LENGTH = 2048

function mainDomain(): string {
  return (process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase()
}

function isLocal(host: string): boolean {
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)
}

/** `https://storelib.com`, or the local site on a developer's machine. */
export function platformOrigin(): string {
  const main = mainDomain()
  if (isLocal(main)) return (process.env.NEXT_PUBLIC_SITE_URL || `http://${main}`).replace(/\/+$/, "")
  return `https://${main}`
}

/**
 * A platform path ("/checkout?...", "/p/slug") as the address it really
 * lives at. Anything else (a full URL, "#", nothing) is returned as it was.
 */
export function platformHref(path: string): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path
  return `${platformOrigin()}${path}`
}

function nameIn(segment: string | undefined): string | null {
  if (!segment) return null
  let s: string
  try {
    s = decodeURIComponent(segment)
  } catch {
    return null
  }
  return isResolvableOnePageName(s) && !isReservedRootSegment(s) ? s : null
}

export interface ReturnRules {
  /** The creator's own verified domains (lib/checkout/site-hosts), lower case. A OnePage there is <domain>/links. */
  ownHosts?: readonly string[]
}

/**
 * The OnePage address to go back to, normalised, or null when `raw` is not a
 * OnePage address this check can vouch for.
 */
export function onePageReturnTarget(raw: unknown, rules: ReturnRules = {}): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  if (!value || value.length > MAX_LENGTH) return null
  /* Spaces and control characters (stripped by some browsers before parsing) and backslashes (read as slashes). */
  // eslint-disable-next-line no-control-regex
  if (/[\u0000- \u007f\\]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const host = url.hostname.toLowerCase().replace(/\.+$/, "")
  const main = mainDomain()
  const local = isLocal(main)
  const parts = url.pathname.split("/").filter(Boolean)
  const trailing = url.pathname.length > 1 && url.pathname.endsWith("/")

  let ok = false
  if (local && isLocal(`${host}${url.port ? `:${url.port}` : ""}`) && (url.protocol === "http:" || url.protocol === "https:")) {
    /* A developer's machine: the OnePage is the route itself (lib/onepage/address localSite). */
    ok = parts.length === 2 && parts[1] === "links" && !!nameIn(parts[0])
  } else {
    if (url.protocol !== "https:" || url.port) return null
    if (host === getOnePageDomain()) ok = parts.length === 1 && !trailing && !!nameIn(parts[0])
    else if (host === main) ok = parts.length === 2 && parts[1] === "links" && !!nameIn(parts[0])
    else {
      const own = new Set((rules.ownHosts ?? []).map((h) => h.trim().toLowerCase().replace(/\.+$/, "")).filter(Boolean))
      ok = own.has(host) && parts.length === 1 && parts[0] === "links"
    }
  }
  if (!ok) return null
  url.hash = ""
  return url.toString()
}

/** Is this host one whose answer needs the creator's own domains (so the caller reads them)? */
export function needsOwnHosts(raw: unknown): boolean {
  if (typeof raw !== "string") return false
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase()
    return host !== getOnePageDomain() && host !== mainDomain() && !isLocal(host)
  } catch {
    return false
  }
}

/**
 * The page a OnePage link is pressed on, as the address to come back to:
 * this document's address without its hash (a product sheet's #product-...
 * is a layer over the page, not the page). Null off a browser.
 */
export function currentOnePageAddress(): string | null {
  if (typeof window === "undefined") return null
  try {
    const u = new URL(window.location.href)
    u.hash = ""
    return u.toString()
  } catch {
    return null
  }
}

/**
 * A OnePage link to the checkout or a product page, as the page links it:
 * on the platform's own host (no hop through storelib.me's 308), with the
 * OnePage to come back to when one is known. `back` is null on the server's
 * first drawing; the block adds it once it is on the page.
 */
export function onePageOutboundHref(path: string, back: string | null): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return path
  let out = path
  if (back) {
    const param = path.startsWith("/checkout") ? CHECKOUT_BACK_PARAM : path.startsWith("/p/") ? PRODUCT_BACK_PARAM : null
    if (param) out = `${path}${path.includes("?") ? "&" : "?"}${param}=${encodeURIComponent(back)}`
  }
  return platformHref(out)
}

/**
 * Back to the OnePage a page was opened from (the product page's bar). It is
 * another document on another origin: when it is the page behind this one in
 * this tab (the referrer is its origin), the browser's own Back returns to it,
 * from its cache, with its scroll, watched by `backThen` (lib/navigation/go-back)
 * so a Back that does nothing still lands; otherwise (a link opened in a new
 * tab) the OnePage is loaded in this page's place.
 */
export function backToOnePage(returnTo: string, backThen: (fallback: () => void) => unknown): void {
  if (typeof window === "undefined") return
  const go = () => window.location.replace(returnTo)
  let cameFrom = ""
  try {
    cameFrom = document.referrer ? new URL(document.referrer).origin : ""
  } catch {
    cameFrom = ""
  }
  let target = ""
  try {
    target = new URL(returnTo).origin
  } catch {
    return
  }
  if (cameFrom && cameFrom === target && window.history.length > 1) backThen(go)
  else go()
}
