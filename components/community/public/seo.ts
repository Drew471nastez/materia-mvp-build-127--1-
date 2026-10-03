/**
 * ===========================================================================
 *  WHAT SEARCH ENGINES AND LINK PREVIEWS ARE TOLD ABOUT A COMMUNITY
 * ===========================================================================
 * One address per community, storelib.com/community/<slug>: /about says the
 * same and names that address as its canonical. The preview picture is the
 * cover (else the logo). Only a published, public community that Storelib
 * has not hidden is indexed; a private or unlisted one, a draft and every
 * page inside a community (its feed, a post, the members) say noindex.
 *
 * The structured data is what the page really is: a paid community is a
 * Product with its real price (an Offer per way in), and its rating only
 * when there are published reviews; a free one is an Organization led by its
 * creator. Pure, so the tests read it without a server.
 */
import type { Metadata } from "next"
import type { PublicCommunityView } from "./types"

export const SITE = "https://storelib.com"

export function canonicalUrl(slug: string): string {
  return `${SITE}/community/${slug}`
}

function plain(text: string | null | undefined, max: number): string {
  const t = (text ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}

export interface SeoFacts {
  slug: string
  name: string
  tagline: string | null
  description: string | null
  seoTitle: string | null
  seoDescription: string | null
  coverUrl: string | null
  logoUrl: string | null
  indexable: boolean
  creatorName: string | null
}

export function communityMetadata(f: SeoFacts, opts: { about?: boolean } = {}): Metadata {
  const title = (f.seoTitle || f.name).slice(0, 120)
  const description = plain(f.seoDescription || f.tagline || f.description, 300) || (f.creatorName ? `A community by ${f.creatorName} on Storelib.` : "A community on Storelib.")
  const url = canonicalUrl(f.slug)
  const image = f.coverUrl || f.logoUrl
  return {
    title: opts.about ? `About ${title}` : title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: "Storelib", title, description, ...(image ? { images: [{ url: image, alt: f.name }] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
    robots: f.indexable ? { index: true, follow: true } : { index: false, follow: false },
  }
}

/** The page's JSON-LD, or null when it is not indexable (nothing to claim to a search engine). */
export function communityJsonLd(c: PublicCommunityView, indexable: boolean): Record<string, unknown> | null {
  if (!indexable) return null
  const url = canonicalUrl(c.slug)
  const description = plain(c.tagline || c.descriptionText || c.descriptionHtml, 500) || undefined
  const image = c.coverUrl || c.logoUrl || undefined
  const creator = c.creator ? { "@type": "Person", name: c.creator.name, ...(c.creator.href ? { url: `${SITE}${c.creator.href}` } : {}) } : undefined
  const offers = c.options
    .filter((o) => o.kind === "paid" && o.priceLine)
    .flatMap((o) => {
      const cents = o.billing === "recurring" ? o.monthlyCents ?? o.yearlyCents : o.priceCents
      if (!cents) return []
      return [{ "@type": "Offer", name: o.name, price: (cents / 100).toFixed(2), priceCurrency: o.currency.toUpperCase(), availability: "https://schema.org/InStock", url }]
    })
  if (offers.length > 0) {
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: c.name,
      url,
      ...(description ? { description } : {}),
      ...(image ? { image } : {}),
      ...(creator ? { brand: creator } : {}),
      offers: offers.length === 1 ? offers[0] : offers,
      ...(c.reviews && c.reviews.total > 0 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: c.reviews.average, reviewCount: c.reviews.total, bestRating: 5, worstRating: 1 } } : {}),
    }
  }
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: c.name,
    url,
    ...(description ? { description } : {}),
    ...(c.logoUrl ? { logo: c.logoUrl } : {}),
    ...(image ? { image } : {}),
    ...(creator ? { founder: creator } : {}),
  }
}
