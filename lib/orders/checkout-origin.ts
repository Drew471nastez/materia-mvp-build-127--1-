/**
 * WHERE A CHECKOUT BEGAN, AS THE BROWSER SEES IT
 *
 * The order's detail (lib/orders/order-source.ts) is worked out here, in the
 * page, because only the page can see it: which page Buy was pressed on, and
 * the address the visit arrived from. A route that makes the payment sees
 * the checkout page's own address and nothing before it.
 *
 * WHAT IT READS, AND WHY EACH IS HONEST
 *
 *   ?src=website, ?site=   a website's Buy button says so, and says which
 *                          website (lib/orders/checkout-origin
 *                          withCheckoutOrigin, run on the website).
 *   ?ref=, ?utm_*          what the website saw of its visit, or a link the
 *                          creator shared with tags on it.
 *   the pages before       the in-app trail (lib/navigation/in-app-history)
 *                          after client navigations, or document.referrer
 *                          after a full load. Their paths say profile,
 *                          product page, OnePage or Explore; none at all is
 *                          a checkout link opened on its own. Buy is always
 *                          on a product page, so when the page before THAT
 *                          was Explore, the profile or the OnePage, that is
 *                          where the product was found, and it is what is
 *                          recorded: a product page means the visit landed
 *                          on the product itself.
 *   document.referrer      the address that loaded this document. After
 *                          client navigations it still names the page the
 *                          visit came in from, which is the one wanted.
 *   the in-app browser     Instagram, TikTok and the rest name themselves in
 *                          the user agent, and often send no referrer.
 *   the visit's first      kept by Analytics (lib/analytics-utils) only with
 *   address                analytics consent, and read only then.
 *
 * Nothing is stored by this file. What it cannot see it leaves out: a
 * referrer that is Storelib's own page says nothing about the visit, and is
 * not turned into "Direct".
 */

import { detectClientAppFromUA, hostIs } from "@/lib/analytics/sources"
import { CARRY_PARAM } from "@/lib/attribution/touch"
import {
  FROM_LABEL,
  SOURCE_PARAM,
  WEBSITE_SOURCE,
  cleanHost,
  cleanOrigin,
  fromOfHost,
  fromOfUtmSource,
  surfaceOfPath,
  type OrderOrigin,
} from "./order-source"
import { isOnePageHost } from "@/lib/onepage/address"

/**
 * A page's account of itself as it travels: the origin, and the visit's
 * touches encoded by lib/attribution/touch encodeTouches, which only
 * lib/attribution reads. cleanOrigin drops `touches`, so it never reaches
 * `source_detail`.
 */
export type CarriedOrigin = OrderOrigin & { touches?: string }

export interface FirstTouch {
  referrerDomain?: string | null
  utm_source?: string | null
  utm_campaign?: string | null
  clientApp?: string | null
}

export interface OriginInput {
  /** This page's address. */
  href: string
  /** document.referrer. */
  referrer: string
  /** The Storelib paths before this one in this document, oldest first, after client navigations. */
  trail: string[]
  /** The query this document was first loaded with. */
  landingSearch: string
  userAgent: string
  mainDomain: string
  firstTouch?: FirstTouch | null
}

/** Storelib's own host, the OnePage host (storelib.me), a preview, or a developer's machine. */
function isPlatformHost(host: string, main: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").split(":")[0]
  return h === main || isOnePageHost(h) || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")
}

/** A creator's website: a Storelib subdomain or a domain of their own. */
function isSiteHost(host: string, main: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "").split(":")[0]
  return Boolean(h) && !isPlatformHost(h, main)
}

const PAYMENT_HOSTS = ["checkout.stripe.com", "stripe.com", "hooks.stripe.com", "paypal.com"]

function hostOf(address: string): string {
  if (!address) return ""
  try {
    return new URL(address).host.toLowerCase().replace(/^www\./, "")
  } catch {
    return ""
  }
}

function pathOf(address: string): string | null {
  try {
    return new URL(address).pathname
  } catch {
    return null
  }
}

/**
 * Where the visit came from, or undefined when nothing says.
 *
 * `own` are the hosts whose pages are this visit's own pages: Storelib, the
 * website, the page itself. A referrer from one of them says where the buyer
 * was a moment ago, not where they came from.
 */
function visitFrom(input: OriginInput, own: string[], site: string | undefined): string | undefined {
  const app = detectClientAppFromUA(input.userAgent)
  const appFrom = app && app in FROM_LABEL ? app : undefined

  const first = input.firstTouch
  if (first) {
    const fromFirst = fromOfHost(first.referrerDomain) ?? (first.clientApp && first.clientApp in FROM_LABEL ? first.clientApp : null)
    if (fromFirst) return fromFirst
  }

  const refHost = hostOf(input.referrer)
  if (!refHost) return appFrom ?? "direct"
  if (hostIs(refHost, ...PAYMENT_HOSTS)) return appFrom
  const main = input.mainDomain.toLowerCase()
  if (own.some((h) => h && refHost === h)) return appFrom
  if (hostIs(refHost, main) || isPlatformHost(refHost, main)) {
    /* Storelib's own page sent the buyer to a website: that is where they came from. */
    return site && refHost !== site ? "storelib" : appFrom
  }
  return fromOfHost(refHost) ?? appFrom
}

type Utm = { utm_source?: string; utm_campaign?: string }

function utmFrom(input: OriginInput, q: URLSearchParams): Utm {
  const pick = (params: URLSearchParams): Utm => ({
    utm_source: params.get("utm_source") ?? undefined,
    utm_campaign: params.get("utm_campaign") ?? undefined,
  })
  const here = pick(q)
  if (here.utm_source || here.utm_campaign) return here
  let landing: URLSearchParams | null = null
  try {
    landing = new URLSearchParams(input.landingSearch || "")
  } catch {
    landing = null
  }
  const first: Utm = landing ? pick(landing) : {}
  if (first.utm_source || first.utm_campaign) return first
  return {
    utm_source: input.firstTouch?.utm_source ?? undefined,
    utm_campaign: input.firstTouch?.utm_campaign ?? undefined,
  }
}

/**
 * The checkout page's account of itself: which page sent the buyer here,
 * and where their visit came from.
 */
export function describeCheckout(input: OriginInput): OrderOrigin | null {
  let url: URL
  try {
    url = new URL(input.href)
  } catch {
    return null
  }
  const q = url.searchParams
  const main = input.mainDomain.toLowerCase()
  const pageHost = url.host.toLowerCase().replace(/^www\./, "")
  const refHost = hostOf(input.referrer)
  const origin: OrderOrigin = {}

  if (q.get(SOURCE_PARAM) === WEBSITE_SOURCE || isSiteHost(pageHost, main)) {
    origin.surface = "website"
    origin.site =
      cleanHost(q.get("site")) ??
      (isSiteHost(refHost, main) && !hostIs(refHost, ...PAYMENT_HOSTS) ? cleanHost(refHost) : undefined) ??
      (isSiteHost(pageHost, main) ? cleanHost(pageHost) : undefined)
  } else {
    const sameDocumentReferrer = refHost && refHost === pageHost ? pathOf(input.referrer) : null
    /* The pages behind the checkout, nearest last: the trail, and before it
       the page that loaded this document when that was one of ours. */
    const behind = [...(sameDocumentReferrer ? [sameDocumentReferrer] : []), ...input.trail]
    const before = behind.at(-1)
    if (before) {
      let surface = surfaceOfPath(before)
      const found = surfaceOfPath(behind.at(-2))
      if (surface === "product" && (found === "explore" || found === "profile" || found === "onepage")) surface = found
      if (surface) origin.surface = surface
    } else if (refHost && isOnePageHost(refHost)) {
      /* Sent here from a OnePage on storelib.me: the OnePage is where it began. */
      origin.surface = "onepage"
    } else if (refHost && isSiteHost(refHost, main) && !hostIs(refHost, ...PAYMENT_HOSTS) && hostIs(refHost, main)) {
      /* A page on a Storelib subdomain is a creator's website, whether or
         not its button said so. */
      origin.surface = "website"
      origin.site = cleanHost(refHost)
    } else {
      origin.surface = "link"
    }
  }

  const utm = utmFrom(input, q)
  origin.utm_source = utm.utm_source
  origin.utm_campaign = utm.utm_campaign
  origin.from =
    q.get("ref") ??
    fromOfUtmSource(utm.utm_source) ??
    visitFrom(input, [pageHost, origin.site ?? ""], origin.site)

  return cleanOrigin(origin)
}

/**
 * A page's account of itself, for a page that takes the order in place (the
 * OnePage's free form) or sends the buyer on to checkout (a website).
 */
export function describePage(input: OriginInput): OrderOrigin | null {
  let url: URL
  try {
    url = new URL(input.href)
  } catch {
    return null
  }
  const main = input.mainDomain.toLowerCase()
  const pageHost = url.host.toLowerCase().replace(/^www\./, "")
  const origin: OrderOrigin = {}
  if (isOnePageHost(pageHost)) {
    /* storelib.me serves nothing but OnePages. */
    origin.surface = "onepage"
  } else if (isSiteHost(pageHost, main)) {
    /* A creator's own domain answers /links with their OnePage. */
    if (/^\/links\/?$/.test(url.pathname)) origin.surface = "onepage"
    else {
      origin.surface = "website"
      origin.site = cleanHost(pageHost)
    }
  } else {
    const surface = surfaceOfPath(url.pathname)
    if (surface) origin.surface = surface
  }
  const utm = utmFrom(input, url.searchParams)
  origin.utm_source = utm.utm_source
  origin.utm_campaign = utm.utm_campaign
  origin.from = url.searchParams.get("ref") ?? fromOfUtmSource(utm.utm_source) ?? visitFrom(input, [pageHost], origin.site)
  return cleanOrigin(origin)
}

/**
 * The page a buyer should come back to: its address without the fragment or
 * a result a previous checkout left on it. Only http(s), never anything a
 * browser would run.
 */
function pageAddress(page: string | null | undefined): URL | null {
  if (!page) return null
  try {
    const url = new URL(page)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    url.hash = ""
    url.searchParams.delete("checkout")
    return url
  } catch {
    return null
  }
}

/**
 * A /checkout address with what this website knows added to it: which
 * website, where the visit came from, and (given the page) where to come
 * back to. Keys already on the address are left as they are. Anything that
 * is not a checkout address comes back as it was.
 */
export function checkoutHrefWithOrigin(
  href: string,
  here: CarriedOrigin | null,
  /**
   * The address of the page the link is on, when it is a creator's website.
   * Checkout sends the buyer back to it after paying (`return`) and Back goes
   * to it (`cancel`), unless the link already names somewhere; a path it
   * names is made absolute here, on the site, where "/thank-you" means this
   * site. Checkout checks both against the creator's own sites
   * (lib/checkout/return-url.ts), so nothing written here is trusted there.
   */
  page?: string | null,
): string {
  if (!here && !page) return href
  let url: URL
  try {
    url = new URL(href, "https://placeholder.invalid")
  } catch {
    return href
  }
  if (url.pathname !== "/checkout") return href
  const add: Array<[string, string | undefined]> = [
    ["site", here?.site],
    ["ref", here?.from],
    ["utm_source", here?.utm_source],
    ["utm_campaign", here?.utm_campaign],
    /* The visit's touches, which checkout on storelib.com cannot read from
       this site's storage (lib/attribution/browser). */
    [CARRY_PARAM, here?.touches],
  ]
  let changed = false
  for (const [key, value] of add) {
    if (value && !url.searchParams.has(key)) {
      url.searchParams.set(key, value)
      changed = true
    }
  }
  const back = pageAddress(page)
  if (back) {
    for (const key of ["return", "cancel"]) {
      const named = url.searchParams.get(key)
      if (named === null || named === "") {
        url.searchParams.set(key, back.href)
        changed = true
      } else if (named.startsWith("/") && !named.startsWith("//")) {
        url.searchParams.set(key, new URL(named, back.origin).href)
        changed = true
      }
    }
  }
  if (!changed) return href
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//")
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString()
}
