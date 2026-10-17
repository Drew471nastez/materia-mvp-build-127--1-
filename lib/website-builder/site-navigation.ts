/**
 * ===========================================================================
 *  A LINK BETWEEN TWO PAGES OF A LIVE WEBSITE OPENS IN PLACE
 * ===========================================================================
 * A Storelib website went from page to page by loading the next page whole:
 * the document, every script parsed again, every section hydrated again,
 * even when the page itself came from the CDN in a fifth of a second. The
 * owner: "navigation between pages on the live website should be faster".
 *
 * Now a link to another page of the same website is followed by Next's
 * router (components/website-builder/site-links.tsx): only the new page's
 * part is fetched, the scripts already running stay, and the page is
 * fetched ahead while the link is on screen or under the pointer, so the
 * press usually lands on a page that is already here.
 *
 * This file decides WHICH links, and is pure so the tests can hold it. A
 * link is followed in place only when all of these are true; anything else
 * is left to the browser exactly as before:
 *
 *   - a plain press: the main button, no modifier key, nothing already
 *     handled it (a section link scrolled, a new tab link opened)
 *   - this site's own origin, opening in this tab, not a download
 *   - a page of the website, not one of the addresses that are the visitor's
 *     own or not pages at all: the cart, checkout, the account, the
 *     password page, an API, a file with an extension
 *   - not the page that is open (a #section of it is section-motion's)
 *   - the same language: a link into another language of the website
 *     (`/fr/…`) is a new document, so the page's `lang` and the proxy's
 *     choice of language are made again
 *   - not marked `data-sl-reload` (an author's way out)
 */

/** Addresses a visitor's press always loads whole: theirs, or not pages. */
const WHOLE_PAGE = /^\/(?:cart|checkout|account|password|api|receipt|review|wishlist|challenge|_next|_vercel|site-theme|w|preview)(?:[/?#]|$)/i

/** An address of a file (robots.txt, sitemap.xml, a PDF), never a page. */
const FILE = /\/[^/]+\.[a-z0-9]{1,8}$/i

export interface LinkPress {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}

export interface LinkFacts {
  href: string | null
  target?: string | null
  download?: boolean
  /** `data-sl-reload` on the link: always a whole page. */
  reload?: boolean
}

/** The first path segment as a language of this website, or "" when it is not one. */
export function languageOf(pathname: string, languages: readonly string[]): string {
  const first = pathname.split("/")[1]?.toLowerCase() ?? ""
  return first && languages.some((l) => l.toLowerCase() === first) ? first : ""
}

/**
 * Where a press on this link goes in place, as a path with its query and
 * hash, or null to leave it to the browser.
 */
export function inPlaceTarget(link: LinkFacts, here: string, languages: readonly string[] = []): string | null {
  if (!link.href || link.download || link.reload) return null
  if (link.target && link.target !== "_self") return null
  let url: URL
  let now: URL
  try {
    now = new URL(here)
    url = new URL(link.href, now)
  } catch {
    return null
  }
  if (url.origin !== now.origin) return null
  if (url.protocol !== "http:" && url.protocol !== "https:") return null
  if (WHOLE_PAGE.test(url.pathname) || FILE.test(url.pathname)) return null
  /* The page that is open: a #section of it scrolls (section-motion.ts), and the same address again is the browser's to reload. */
  if (url.pathname === now.pathname && url.search === now.search) return null
  if (languageOf(url.pathname, languages) !== languageOf(now.pathname, languages)) return null
  return `${url.pathname}${url.search}${url.hash}`
}

/** Whether a press is a plain one this page may take over. */
export function plainPress(e: LinkPress): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

/**
 * HOW MANY PAGES ARE FETCHED AHEAD JUST FOR BEING ON SCREEN. A header with
 * eight links and a grid of products would otherwise fetch every one. The
 * links under the pointer or the finger are fetched whatever this says.
 * Nothing on Data Saver or a 2G connection.
 */
export function viewportPrefetchBudget(nav: { connection?: { saveData?: boolean; effectiveType?: string } } | null | undefined): number {
  const c = nav?.connection
  if (c?.saveData) return 0
  if (c?.effectiveType === "slow-2g" || c?.effectiveType === "2g") return 0
  if (c?.effectiveType === "3g") return 3
  return 8
}

/* ── The router, for a press that does not come from an <a> ───────────── */

type Navigate = (path: string) => void
let navigate: Navigate | null = null
let languages: () => readonly string[] = () => []

/** Set by the live website's link handler while it is on the page. */
export function setSiteNavigator(fn: Navigate | null, langs?: () => readonly string[]): void {
  navigate = fn
  if (langs) languages = langs
}

/**
 * Follow an address the way a link press on the live site would: in place
 * when it is another page of this website, false when the caller should
 * load it whole (the header's menu drawer, after it has closed).
 */
export function followSitePage(href: string): boolean {
  if (!navigate || typeof window === "undefined") return false
  const to = inPlaceTarget({ href }, window.location.href, languages())
  if (!to) return false
  navigate(to)
  return true
}
