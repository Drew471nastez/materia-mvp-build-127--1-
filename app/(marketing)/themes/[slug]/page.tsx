import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { listingBySlug } from "@/lib/themes/marketplace-server"
import { LISTING_SLUG_RE, listingPath } from "@/lib/themes/marketplace-shared"
import { ThemeDetail } from "./theme-detail"

/** Held at the edge like the list, and dropped with it when the admin saves. */
export const revalidate = 300

async function find(slug: string) {
  const s = decodeURIComponent(slug).toLowerCase()
  return LISTING_SLUG_RE.test(s) ? listingBySlug(s).catch(() => null) : null
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const listing = await find((await params).slug)
  if (!listing) return { title: "Theme not found" }
  return {
    title: `${listing.name} theme for Storelib`,
    description: `${listing.name} by ${listing.author}. Preview it live and add it to your Storelib website.`,
    alternates: { canonical: listingPath(listing.slug) },
    openGraph: listing.cover?.startsWith("https://") ? { images: [listing.cover] } : undefined,
  }
}

export default async function ThemePage({ params }: { params: Promise<{ slug: string }> }) {
  const listing = await find((await params).slug)
  if (!listing) notFound()
  return <ThemeDetail listing={listing} />
}
