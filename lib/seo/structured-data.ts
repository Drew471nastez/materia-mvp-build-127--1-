/**
 * ===========================================================================
 *  WHO A PAGE IS ABOUT, AS A SEARCH ENGINE READS IT
 * ===========================================================================
 * The creator page and the OnePage are both a person's page, and a search
 * engine is told so the same way on both: a ProfilePage whose main entity is
 * that person, with their picture, what they say about themselves and
 * `sameAs`, the profiles elsewhere that are the same person. That last one is
 * what lets an engine connect storelib.com/mara to the Instagram and YouTube
 * accounts it already knows about.
 *
 * Pure, so tests/page-seo.test.ts can run it. Printed with jsonLdScript
 * (./json-ld.ts), never with JSON.stringify.
 */
import { normalizeSocialUrl } from "@/lib/onepage/social-url"
import { plainSummary } from "@/lib/html-entities"
import { toPublicHttpUrl } from "@/lib/url/public-url"
import { OFFERED_PLANS } from "@/lib/billing/plans"
import { PLAN_CURRENCY } from "@/lib/money/product-currency"
import { storelibLogoUrl } from "@/lib/brand/logo"
import { STORELIB_SOCIAL } from "./storelib-social"

/** More than a person has accounts; enough to stop a pasted list. */
const MAX_SAME_AS = 10
/** The products a creator page lists in its structured data. */
export const MAX_LISTED_PRODUCTS = 20

/**
 * A full http(s) address, checked, or null. Only one that already carries its
 * scheme: toPublicHttpUrl would turn a bare `andrew.rullz` into
 * https://andrew.rullz/, a domain that does not exist, and a search engine
 * would be told that is who the creator is.
 */
function fullUrl(value: unknown): string | null {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value.trim())) return null
  return toPublicHttpUrl(value, 2000)
}

/**
 * Addresses fit for `sameAs`: http(s) only, each once, at most ten. Anything
 * else a creator typed (a bare word, a `javascript:` link) is left out rather
 * than handed to a search engine as who they are.
 */
export function sameAsUrls(values: unknown[]): string[] {
  const out: string[] = []
  for (const value of values) {
    const url = fullUrl(value)
    if (url && !out.includes(url)) out.push(url)
    if (out.length >= MAX_SAME_AS) break
  }
  return out
}

/**
 * A OnePage's social links, which are stored as whatever was typed: a full
 * address, `@mara`, or `mara`. Each goes through the same normaliser the page
 * uses to draw its icons, so the structured data names the addresses a
 * visitor can click. An email address and a WhatsApp number are ways to reach
 * somebody, not profiles of them, so they are not `sameAs`.
 */
export function onePageSameAs(links: Record<string, unknown> | null | undefined): string[] {
  if (!links || typeof links !== "object") return []
  const urls: string[] = []
  for (const [platform, value] of Object.entries(links)) {
    if (platform === "email" || platform === "whatsapp" || typeof value !== "string" || !value.trim()) continue
    urls.push(normalizeSocialUrl(platform, value.trim()))
  }
  return sameAsUrls(urls)
}

export interface ProfileForJsonLd {
  /** The page's canonical address. */
  url: string
  name: string
  image?: string | null
  /** Plain text or markup; it is reduced to one plain paragraph. */
  description?: string | null
  sameAs?: string[]
  /** What they sell, as it appears on the page: an ItemList of at most twenty. */
  products?: Array<{ name: string; url: string }>
}

/**
 * A person's page. The ProfilePage and the Person are one object, the shape
 * Google's own ProfilePage examples use; the products, when there are any,
 * travel beside it in the same graph as an ItemList of their addresses.
 */
export function profilePageJsonLd(p: ProfileForJsonLd) {
  const description = plainSummary(p.description ?? "", 300)
  const image = fullUrl(p.image)
  const page = {
    "@type": "ProfilePage",
    url: p.url,
    mainEntity: {
      "@type": "Person",
      name: p.name,
      url: p.url,
      ...(image ? { image } : {}),
      ...(description ? { description } : {}),
      ...(p.sameAs && p.sameAs.length ? { sameAs: p.sameAs } : {}),
    },
  }
  const products = (p.products ?? []).filter((x) => x.name && x.url).slice(0, MAX_LISTED_PRODUCTS)
  if (products.length === 0) return { "@context": "https://schema.org", ...page }
  return {
    "@context": "https://schema.org",
    "@graph": [
      page,
      {
        "@type": "ItemList",
        name: `Products by ${p.name}`,
        numberOfItems: products.length,
        itemListElement: products.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: x.url, name: x.name })),
      },
    ],
  }
}

/* ── Storelib itself (round 45) ────────────────────────────────────────── */

/**
 * ===========================================================================
 *  STORELIB, AS A SEARCH ENGINE READS STORELIB.COM ITSELF
 * ===========================================================================
 * Three things, each only what is true and what Google and Bing document:
 *
 *   ORGANIZATION   name, address, logo. `sameAs` only for a Storelib profile
 *                  that really exists: the footer's social icons point at
 *                  facebook.com, x.com and the rest with no account in the
 *                  address, so none of them is one. Empty, it is left out.
 *   WEBSITE        name and address. No SearchAction: Google retired the
 *                  sitelinks search box, and its target (/explore?q=) is a
 *                  results page robots.txt keeps crawlers off.
 *   WEBAPPLICATION the product, on the home page, /pricing and /features,
 *                  with the plans as Offers written from lib/billing/plans.ts,
 *                  so a price here cannot differ from the price on the card.
 *                  operatingSystem is "Web": the iOS and Android shells
 *                  exist in the repo, but no store listing is linked from
 *                  anything Storelib publishes (the Play address answers 404
 *                  and the App Store id is an unset env value), so the
 *                  markup does not claim them.
 *
 * No AggregateRating or Review: there are no Storelib reviews to back one.
 */

export const STORELIB_URL = "https://storelib.com"
export const STORELIB_NAME = "Storelib"
export const STORELIB_DESCRIPTION = "Sell digital products, courses, memberships and physical goods from your own store, OnePage, website or community, with payments through Stripe."

/*
 * Storelib's own profiles elsewhere live in ./storelib-social (STORELIB_SOCIAL),
 * a module with no imports so the footer, drawn in the browser, can read the
 * same list without pulling in the plans and fees this file needs.
 */
export { STORELIB_SOCIAL, type StorelibSocialNetwork } from "./storelib-social"
/** STORELIB_SOCIAL as addresses, for Organization.sameAs. */
export const STORELIB_SAME_AS: readonly string[] = STORELIB_SOCIAL.map((p) => p.url)

const ORG_ID = `${STORELIB_URL}/#organization`
const SITE_ID = `${STORELIB_URL}/#website`
const APP_ID = `${STORELIB_URL}/#app`

export function storelibOrganizationJsonLd(sameAs: readonly string[] = STORELIB_SAME_AS) {
  const profiles = sameAsUrls([...sameAs])
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: STORELIB_NAME,
    url: STORELIB_URL,
    logo: storelibLogoUrl(),
    description: STORELIB_DESCRIPTION,
    ...(profiles.length ? { sameAs: profiles } : {}),
  }
}

export function storelibWebSiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: STORELIB_NAME,
    url: STORELIB_URL,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
  }
}

/** "29.00", the way schema.org writes a price: a number, a dot, no currency sign. */
export function schemaPrice(cents: number): string {
  return (Math.round(cents) / 100).toFixed(2)
}

/** Each plan on sale, from OFFERED_PLANS: Free at 0, Pro and Scale at their monthly prices. */
export function storelibPlanOffers() {
  return OFFERED_PLANS.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    price: schemaPrice(plan.priceCents),
    priceCurrency: PLAN_CURRENCY,
    url: `${STORELIB_URL}/pricing`,
    ...(plan.priceCents > 0
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: schemaPrice(plan.priceCents),
            priceCurrency: PLAN_CURRENCY,
            billingDuration: "P1M",
            unitText: "month",
          },
        }
      : {}),
  }))
}

export function storelibApplicationJsonLd() {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: STORELIB_NAME,
    url: STORELIB_URL,
    description: STORELIB_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    publisher: { "@id": ORG_ID },
    offers: storelibPlanOffers(),
  }
}

/** The lowest and highest monthly prices the Offers name, for tests and llms.txt. */
export const STORELIB_PRICE_RANGE = { lowCents: 0, highCents: Math.max(...OFFERED_PLANS.map((p) => p.priceCents)) }

/** A trail on storelib.com, Storelib first: [{ name: "Pricing", path: "/pricing" }]. */
export function storelibBreadcrumbJsonLd(trail: { name: string; path: string }[]) {
  const steps = [{ name: STORELIB_NAME, path: "/" }, ...trail]
  return {
    "@type": "BreadcrumbList",
    itemListElement: steps.map((s, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: s.name,
      item: /^https?:\/\//i.test(s.path) ? s.path : `${STORELIB_URL}${s.path === "/" ? "" : s.path}`,
    })),
  }
}

/** Several of the above as one script: one @context, one @graph. */
export function storelibGraph(...nodes: object[]) {
  return { "@context": "https://schema.org", "@graph": nodes }
}

/** The home page: who Storelib is, the site, and the product. */
export function storelibHomeJsonLd() {
  return storelibGraph(storelibOrganizationJsonLd(), storelibWebSiteJsonLd(), storelibApplicationJsonLd())
}
