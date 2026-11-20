/**
 * ===========================================================================
 *  THE METADATA OF ONE OF STORELIB'S OWN PAGES, WHOLE
 * ===========================================================================
 * Next.js does not merge `openGraph` or `twitter` between a page and the root
 * layout: a page that sets either replaces the layout's, and a page that sets
 * neither inherits the layout's, which describe the home page (og:url
 * https://storelib.com, the home page's title). /pricing, /features, /terms,
 * /privacy and /themes did exactly that, so every share card and every
 * og:url said "the home page".
 *
 * This writes the full set for one address: the title, the description, the
 * absolute canonical, Open Graph with the same address and the share image,
 * and the X card. Pure, so tests/seo-marketing-r44.test.ts runs it.
 */
import type { Metadata } from "next"
import { STORELIB_OG_IMAGE, storelibAssetUrl } from "@/lib/brand/logo"
import { LEGAL_DOCS, type LegalKind } from "@/components/legal/legal-parts"

export const STORELIB_ORIGIN = "https://storelib.com"

export interface PageMetadataInput {
  /** A path on storelib.com ("/pricing"), or a full address on another Storelib host. */
  path: string
  /** The page's own words. The root layout adds " | Storelib" unless `absolute`. */
  title: string
  description: string
  /** The whole title as written, with no " | Storelib" added. */
  absolute?: boolean
  type?: "website" | "article"
  siteName?: string
  /** A share image of the page's own; Storelib's card otherwise. */
  image?: { url: string; alt?: string } | null
  robots?: Metadata["robots"]
  /** Extra <link rel="alternate">, such as the blog's feed. */
  types?: Record<string, string | { url: string; title?: string }[]>
}

/** An address on storelib.com, or the address as given when it is already absolute. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${STORELIB_ORIGIN}${path === "/" ? "" : path.startsWith("/") ? path : `/${path}`}`
}

export function pageMetadata(input: PageMetadataInput): Metadata {
  const url = absoluteUrl(input.path)
  const shownTitle = input.absolute ? input.title : `${input.title} | Storelib`
  const image = input.image?.url
    ? { url: absoluteUrl(input.image.url), alt: input.image.alt ?? shownTitle }
    : { url: storelibAssetUrl(STORELIB_OG_IMAGE), width: 1200, height: 630, alt: shownTitle }
  return {
    title: input.absolute ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical: url, ...(input.types ? { types: input.types } : {}) },
    openGraph: {
      type: input.type ?? "website",
      locale: "en_US",
      url,
      siteName: input.siteName ?? "Storelib",
      title: shownTitle,
      description: input.description,
      images: [image],
    },
    twitter: { card: "summary_large_image", title: shownTitle, description: input.description, images: [image.url] },
    ...(input.robots ? { robots: input.robots } : {}),
  }
}

/* ── The legal documents ──────────────────────────────────────────────── */

const LEGAL_DESCRIPTIONS: Record<LegalKind, string> = {
  terms: "The agreement between you and Storelib Inc. for using storelib.com, the Storelib apps and every store, site and OnePage on them.",
  privacy: "What Storelib Inc. collects, why, who it is shared with, how long it is kept and the choices you have.",
  refunds: "How refunds work on Storelib: plan fees, purchases from creators, downloads, memberships, returns, chargebacks and the EU right of withdrawal.",
}

/** /terms, /privacy and /refund-policy: their title, description, canonical and card. */
export function legalMetadata(kind: LegalKind): Metadata {
  const doc = LEGAL_DOCS[kind]
  return pageMetadata({ path: doc.href, title: doc.title, description: LEGAL_DESCRIPTIONS[kind] })
}

/**
 * A legal document as structured data: a WebPage with the day it last
 * changed (the date the page prints, LEGAL_DOCS), and its breadcrumbs.
 */
export function legalJsonLd(kind: LegalKind) {
  const doc = LEGAL_DOCS[kind]
  const url = absoluteUrl(doc.href)
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#page`,
        url,
        name: doc.title,
        description: LEGAL_DESCRIPTIONS[kind],
        inLanguage: "en",
        dateModified: doc.updated,
        publisher: { "@type": "Organization", name: "Storelib", url: STORELIB_ORIGIN },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Storelib", item: STORELIB_ORIGIN },
          { "@type": "ListItem", position: 2, name: doc.title, item: url },
        ],
      },
    ],
  }
}

/** A BreadcrumbList for a page of storelib.com: each step's name and its path or full address. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  }
}
