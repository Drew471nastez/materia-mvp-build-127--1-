/**
 * ===========================================================================
 *  INSIDE THE PHONE APP, A STORELIB ADDRESS STAYS IN THE APP
 * ===========================================================================
 * The iOS and Android apps are a WebView on storelib.com (capacitor.config.ts
 * server.url). Capacitor sends any top level navigation to a host that is not
 * storelib.com and not in `allowNavigation` to the system browser, and it
 * sends a new window (target="_blank", window.open) there too. So a tap on
 * www.storelib.com, on a creator's <name>.storelib.com, on storelib.me or on
 * a storelib.com link drawn with target="_blank" left the app for Safari.
 *
 * This decides, for one href, what the app does with it. Pure (no window,
 * no React), so tests/native-app-links.test.ts asks it about every kind of
 * link without a phone:
 *
 *   path      a page of the app: the WebView goes to this storelib.com path
 *   host      one of our hosts with no storelib.com path (a creator's
 *             website at <name>.storelib.com): the WebView goes there. It
 *             stays in the app once the hosts below are in allowNavigation,
 *             which ships with the next native release
 *   external  somebody else's site (a creator's own links, Stripe's docs):
 *             the system browser, as before
 *   none      not a navigation (#top, mailto:, tel:, javascript:): left alone
 *
 * The rewrite is what lets the web layer fix this today, before any native
 * release: every storelib.com, www.storelib.com and storelib.me address,
 * and most of a creator's subdomain, has a storelib.com path that renders
 * the same page, and the WebView is already allowed there.
 */

import { isReservedRootSegment } from "@/lib/routes/reserved-segments"

export type NativeLink =
  | { kind: "path"; path: string }
  | { kind: "host"; url: string }
  | { kind: "external"; url: string }
  | { kind: "none" }

export interface NativeLinkHosts {
  /** storelib.com unless configured. */
  mainDomain?: string
  /** storelib.me unless configured. */
  onePageDomain?: string
}

/**
 * THE HOSTS THE APP'S WEBVIEW MAY LOAD, for capacitor.config.ts
 * `allowNavigation` (read when the app is built, so a change here reaches
 * phones with the next App Store and Play release). storelib.com itself is
 * the server host and always allowed. checkout.stripe.com is Stripe's hosted
 * checkout, which the physical goods checkout hands off to and which returns
 * to storelib.com when it is done.
 */
export const NATIVE_ALLOW_NAVIGATION = [
  "www.storelib.com",
  "*.storelib.com",
  "storelib.me",
  "www.storelib.me",
  "checkout.stripe.com",
] as const

/** Subdomains that are the platform's own, never a creator's (proxy.ts EXCLUDED_SUBDOMAINS). */
const PLATFORM_SUBDOMAINS = new Set(["www", "app", "api", "admin", "dashboard", "domains"])

/** Paths a creator's subdomain sends to storelib.com as they are (proxy.ts PLATFORM_APEX_PATHS). */
const APEX_PATHS = ["/checkout", "/purchase", "/receipt", "/access"]

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

function mainOf(hosts?: NativeLinkHosts): string {
  return (hosts?.mainDomain || process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com").trim().toLowerCase()
}

function onePageOf(hosts?: NativeLinkHosts): string {
  return (hosts?.onePageDomain || process.env.NEXT_PUBLIC_ONEPAGE_DOMAIN || "storelib.me").trim().toLowerCase()
}

/** Is this host one of Storelib's own (storelib.com, any subdomain of it, storelib.me)? */
export function isStorelibHost(host: string, hosts?: NativeLinkHosts): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "").split(":")[0]
  const main = mainOf(hosts)
  const one = onePageOf(hosts)
  return h === main || h.endsWith(`.${main}`) || h === one || h === `www.${one}`
}

/**
 * THE APEX "/" IS THE MARKETING PAGE, WHICH THE APP NEVER SHOWS (proxy.ts
 * sends it to /native-start). A link to storelib.com itself, the "Made with
 * Storelib" mark for one, means Storelib's buyer front, which is Discover.
 */
function apexPath(pathname: string, rest: string): string {
  if (pathname === "/" || pathname === "") return `/explore${rest}`
  return `${pathname}${rest}`
}

/** What the app does with this href: a path, an absolute URL, or a protocol relative one. */
export function nativeLinkFor(href: string | null | undefined, hosts?: NativeLinkHosts): NativeLink {
  const raw = (href ?? "").trim()
  if (!raw || raw.startsWith("#")) return { kind: "none" }
  /* A path on this site. "//host" is protocol relative: another host, read below. */
  if (raw.startsWith("/") && !raw.startsWith("//")) return { kind: "path", path: raw }
  let url: URL
  try {
    url = new URL(raw.startsWith("//") ? `https:${raw}` : raw)
  } catch {
    return { kind: "none" }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { kind: "none" }
  if (url.username || url.password) return { kind: "external", url: url.toString() }

  const host = url.hostname.toLowerCase().replace(/\.$/, "")
  const main = mainOf(hosts)
  const one = onePageOf(hosts)
  const rest = `${url.search}${url.hash}`
  const pathname = url.pathname || "/"

  /* storelib.com and www.storelib.com: the same page, on the host the app is on. */
  if (host === main || host === `www.${main}`) return { kind: "path", path: apexPath(pathname, rest) }

  /*
    storelib.me/<name> IS THE ONEPAGE, which storelib.com renders at
    /<name>/links, and the proxy keeps the app's own requests there rather
    than sending them back to storelib.me (lib/onepage/host-route). A
    platform word on storelib.me (/login, /checkout) is that page on
    storelib.com, where the host sends it anyway.
  */
  if (host === one || host === `www.${one}`) {
    const segs = pathname.split("/").filter(Boolean)
    if (segs.length === 0) return { kind: "path", path: `/explore${url.search}` }
    if (segs[0] === "l" && segs[1]) return { kind: "path", path: `/${segs[1].toLowerCase()}/links${url.search}` }
    if (isReservedRootSegment(segs[0])) return { kind: "path", path: `${pathname}${rest}` }
    return { kind: "path", path: `/${segs[0].toLowerCase()}/links${url.search}` }
  }

  if (host.endsWith(`.${main}`)) {
    const sub = host.slice(0, -(main.length + 1))
    /* app.storelib.com and the rest of the platform's own names serve storelib.com's pages. */
    if (PLATFORM_SUBDOMAINS.has(sub)) return { kind: "path", path: apexPath(pathname, rest) }
    /* a.b.storelib.com is nobody's: the WebView may go there once allowed, nothing to rewrite to. */
    if (sub.includes(".")) return { kind: "host", url: url.toString() }
    /*
      A CREATOR'S SUBDOMAIN IS THEIR WEBSITE, with three exceptions that are
      storelib.com pages under another spelling: checkout and the receipt
      (the proxy sends them to the apex), an old product address /p/<slug>,
      and /links, the OnePage's old address.
    */
    if (APEX_PATHS.some((p) => under(pathname, p)) || under(pathname, "/p")) return { kind: "path", path: `${pathname}${rest}` }
    if (pathname === "/links" || pathname === "/links/") return { kind: "path", path: `/${sub}/links${url.search}` }
    return { kind: "host", url: url.toString() }
  }

  return { kind: "external", url: url.toString() }
}

/**
 * Pages of a different layout and auth context. A client navigation into them
 * carries state a full load is relied upon to clear (components/smart-link.tsx
 * and the platform header say the same).
 */
export function needsDocumentLoad(path: string): boolean {
  return ["/app", "/creator-page", "/store-builder", "/website-builder", "/account/library"].some((p) => under(path.split(/[?#]/)[0], p))
}
