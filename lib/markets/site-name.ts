/**
 * ===========================================================================
 *  A WEBSITE'S NAME, WITH THE LANGUAGE IT IS ASKED IN
 * ===========================================================================
 * /fr/about on a website is drawn by the same routes as /about: the proxy
 * sends it to /w/<name>~fr/about, so the language rides in the name segment
 * and every page keeps its own cache entry per language (no query string,
 * no header, nothing that would make the page per visitor). A name never
 * holds "~" (usernames and slugs are letters, digits, "-" and "_"), so the
 * split is never ambiguous.
 */

import { knownCountry, readCountryCookie } from "./visitor-country"

export const LOCALE_MARK = "~"

/** The header the proxy names an imported theme's page language in (/fr/… → "fr"); stripped from every request that arrives with it. */
export const SITE_LOCALE_HEADER = "x-storelib-site-locale"

/** The header the proxy names an imported theme's visitor market in (the market a country falls in, lib/markets/model marketForCountry); stripped like the locale's. */
export const SITE_MARKET_HEADER = "x-storelib-site-market"

/** The header the proxy names an imported theme's visitor country in (the one they chose, else where they are); stripped like the locale's. */
export const SITE_COUNTRY_HEADER = "x-storelib-site-country"

/**
 * The country an imported theme's page is drawn for: the one the proxy
 * names (SITE_COUNTRY_HEADER), else the one chosen in a selector
 * (`chosen`, the sl_country cookie's raw value, read by
 * lib/markets/visitor-country.ts: a cookie from before choices were marked
 * is no choice), else where the connection is. "home", the store's own
 * prices chosen, is no country: the page shows the store's own.
 */
export function siteVisitorCountry(input: { chosen: string | null | undefined; told: string | null | undefined; seen: string | null | undefined }): string | null {
  const { choice } = readCountryCookie(input.chosen)
  if (choice === "home") return null
  return knownCountry(input.told) ?? choice ?? knownCountry(input.seen)
}

/** A market id as the settings write it (lib/markets/model validateLocalization). */
const MARKET_ID = /^[a-z0-9-]{1,40}$/

/**
 * "andrew" in "fr" → "andrew~fr"; with a market whose prices are in its own
 * currency, "andrew~fr~m-eu" (or "andrew~m-eu" in the website's own
 * language). Neither: the name as it is.
 */
export function siteNameIn(name: string, locale: string | null | undefined, market: string | null = null): string {
  let out = name
  if (locale) out += `${LOCALE_MARK}${locale.toLowerCase()}`
  if (market && MARKET_ID.test(market)) out += `${LOCALE_MARK}m-${market}`
  return out
}

/** "andrew~fr~m-eu" → { name: "andrew", locale: "fr", market: "eu" }; "andrew" → nulls. Anything else after the name is ignored. */
export function splitSiteName(segment: string): { name: string; locale: string | null; market: string | null } {
  let s = segment
  try {
    s = decodeURIComponent(segment)
  } catch {
    /* kept as it came */
  }
  const parts = s.split(LOCALE_MARK)
  const name = parts[0]
  let locale: string | null = null
  let market: string | null = null
  for (const p of parts.slice(1)) {
    if (/^m-/.test(p) && MARKET_ID.test(p.slice(2))) market = p.slice(2)
    else if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(p)) locale = p.toLowerCase()
  }
  return { name, locale, market }
}

/** The pages drawn in a language: the website's own pages, products, collections and search. The rest (cart, account, checkout, files) are the same in every language. */
/* Round AE: the cart, the wishlist and the account (sign in included) in the website's languages too; signing out and an order's own page are not pages to draw. */
const PAGE_IN_LANGUAGE = /^\/(?:(?:products|collections)(?:\/[^/]+)?|search|cart|wishlist|account(?:\/login)?|(?!(?:cart|account|checkout|wishlist|password|receipt|review|preview|api|robots\.txt|sitemap\.xml)(?:\/|$))[^/.]+)?\/?$/i

/**
 * Where the proxy sends an address of a built website that starts with one
 * of its published languages (`published`, the languages other than the
 * website's own): a page, to the same route under "<name>~<lang>"; anything
 * else (/fr/cart), on to the address without the language. Null when the
 * address does not start with one of them.
 */
export function siteRouteInLanguage(name: string, pathname: string, published: readonly string[], market: string | null = null): { kind: "page"; path: string } | { kind: "redirect"; to: string } | null {
  const m = pathname.match(/^\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)(\/.*)?$/)
  const hit = m && published.length ? published.find((l) => l.toLowerCase() === m[1].toLowerCase()) : undefined
  if (!hit || !m) {
    /* The website's own language, for a visitor whose market shows its own currency: the same page, in that market. */
    if (market && PAGE_IN_LANGUAGE.test(pathname)) return { kind: "page", path: `/w/${siteNameIn(name, null, market)}${pathname === "/" ? "" : pathname.replace(/\/$/, "")}` }
    return null
  }
  const rest = m[2] || "/"
  if (!PAGE_IN_LANGUAGE.test(rest)) return { kind: "redirect", to: rest }
  return { kind: "page", path: `/w/${siteNameIn(name, hit, market)}${rest === "/" ? "" : rest.replace(/\/$/, "")}` }
}
