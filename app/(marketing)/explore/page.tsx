import { Metadata } from "next"
import {
  ExploreFeed,
  FEED_CANONICAL,
  FEED_DESCRIPTION,
  FEED_KEYWORDS,
  FEED_OG_IMAGE,
  FEED_OG_IMAGE_ALT,
  type FeedSearchParams,
} from "../_explore-feed"

// "/" is now the primary feed. This route stays alive (rather than redirecting)
// because the native app treats /explore as a Discover route — see
// lib/isDiscoverMode.ts and the `pathname === "/"` -> /native-start interception
// in proxy.ts, which would eject in-app navigation if /explore redirected to "/".
// Canonical therefore points at "/" so the two surfaces don't compete in search.
export const metadata: Metadata = {
  title: { absolute: "Storelib | Explore" },
  description: FEED_DESCRIPTION,
  keywords: FEED_KEYWORDS,
  openGraph: {
    title: "Storelib | Explore",
    description: FEED_DESCRIPTION,
    type: "website",
    url: "/",
    siteName: "Storelib",
    images: [
      {
        url: FEED_OG_IMAGE,
        width: 1200,
        height: 630,
        alt: FEED_OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Storelib | Explore",
    description: FEED_DESCRIPTION,
    images: [FEED_OG_IMAGE],
  },
  alternates: {
    canonical: FEED_CANONICAL,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export const dynamic = "force-dynamic"

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  return <ExploreFeed searchParams={searchParams} />
}
