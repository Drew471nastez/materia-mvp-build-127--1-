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
