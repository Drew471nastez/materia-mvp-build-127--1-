import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { listingBySlug } from "@/lib/themes/marketplace-server"
import { LISTING_SLUG_RE, listingPath } from "@/lib/themes/marketplace-shared"
import { ThemeDetail } from "./theme-detail"
import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { storelibBreadcrumbJsonLd, storelibGraph } from "@/lib/seo/structured-data"

/** Held at the edge like the list, and dropped with it when the admin saves. */
export const revalidate = 300

async function find(slug: string) {
  const s = decodeURIComponent(slug).toLowerCase()
  return LISTING_SLUG_RE.test(s) ? listingBySlug(s).catch(() => null) : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const listing = await find((await params).slug)
  if (!listing) return { title: "Theme not found" }
  /* The whole set: an openGraph of only an image (or none) left og:url and og:title the home page's. */
  return pageMetadata({
    path: listingPath(listing.slug),
    title: `${listing.name} theme for Storelib`,
    description: `${listing.name} by ${listing.author}. Preview it live and add it to your Storelib website.`,
    image: listing.cover?.startsWith("https://") ? { url: listing.cover, alt: `${listing.name} theme` } : null,
  })
}

export default async function ThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const listing = await find((await params).slug)
  if (!listing) notFound()
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(storelibGraph(storelibBreadcrumbJsonLd([{ name: "Themes", path: "/themes" }, { name: listing.name, path: listingPath(listing.slug) }]))) }} />
      <ThemeDetail listing={listing} />
    </>
  )
}
