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
  /**
   * The picture drawn for this community (/community/<slug>/share.png,
   * app/(marketing)/community/[slug]/share.png): what a shared link shows.
   * Left out, the cover (else the logo) is the preview, as before.
   */
  shareVersion?: string | null
}

/**
 * THE SHARED LINK'S PICTURE, made per request by next/og and kept briefly
 * (app/(marketing)/community/[slug]/share.png). `v` changes with what it is
 * drawn from, so an app that kept the old one asks again after an edit; an
 * invite link asks for the invite's words with `invite=1` and never carries
 * the invite itself.
 */
export const SHARE_IMAGE_WIDTH = 1200
export const SHARE_IMAGE_HEIGHT = 630

export function shareImageUrl(slug: string, version: string | null | undefined, opts: { invite?: boolean } = {}): string {
  const q = new URLSearchParams()
  if (version) q.set("v", version)
  if (opts.invite) q.set("invite", "1")
  const query = q.toString()
  return `${SITE}/community/${slug}/share.png${query ? `?${query}` : ""}`
}

/** A short fingerprint of what the picture is drawn from (FNV-1a), so its address changes when it would. */
export function shareImageVersion(parts: ReadonlyArray<string | number | null | undefined>): string {
  let h = 0x811c9dc5
  for (const ch of parts.map((p) => (p === null || p === undefined ? "" : String(p))).join("|")) {
    h ^= ch.codePointAt(0) ?? 0
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36)
}

function previewImages(f: SeoFacts, invite: boolean): { og: NonNullable<Metadata["openGraph"]>["images"]; twitter: string[] } | null {
  if (f.shareVersion !== undefined) {
    const url = shareImageUrl(f.slug, f.shareVersion, { invite })
    return { og: [{ url, width: SHARE_IMAGE_WIDTH, height: SHARE_IMAGE_HEIGHT, alt: f.name, type: "image/png" }], twitter: [url] }
  }
  const image = f.coverUrl || f.logoUrl
  return image ? { og: [{ url: image, alt: f.name }], twitter: [image] } : null
}

export function communityMetadata(f: SeoFacts, opts: { about?: boolean } = {}): Metadata {
  const title = (f.seoTitle || f.name).slice(0, 120)
  const description = plain(f.seoDescription || f.tagline || f.description, 300) || (f.creatorName ? `A community by ${f.creatorName} on Storelib.` : "A community on Storelib.")
  const url = canonicalUrl(f.slug)
  const images = previewImages(f, false)
  return {
    title: opts.about ? `About ${title}` : title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, siteName: "Storelib", title, description, ...(images ? { images: images.og } : {}) },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, ...(images ? { images: images.twitter } : {}) },
    robots: f.indexable ? { index: true, follow: true } : { index: false, follow: false },
  }
}

/**
 * AN INVITE LINK'S PREVIEW (/community/<slug>/join?invite=...): the
 * community's public face with the invite's words, never indexed. Its
 * address in the preview is the community's own, so the invite is not
 * repeated into anything that stores previews; the invite is never read.
 */
export function inviteMetadata(f: SeoFacts): Metadata {
  const name = f.name.slice(0, 100)
  const title = `Join ${name}`
  const line = plain(f.tagline || f.seoDescription || f.description, 220)
  const description = line ? `You're invited to ${name} on Storelib. ${line}` : `You're invited to ${name}, a community on Storelib.`
  const images = previewImages(f, true)
  return {
    title,
    description,
    openGraph: { type: "website", url: canonicalUrl(f.slug), siteName: "Storelib", title, description, ...(images ? { images: images.og } : {}) },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, ...(images ? { images: images.twitter } : {}) },
    robots: { index: false, follow: false },
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
