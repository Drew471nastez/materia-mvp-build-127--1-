import { Metadata } from "next"
import {
  ExploreFeed,
  FEED_CANONICAL,
  FEED_DESCRIPTION,
  FEED_KEYWORDS,
  FEED_OG_IMAGE,
  FEED_OG_IMAGE_ALT,
  type FeedSearchParams,
} from "./_explore-feed"

// SEO-optimized metadata — "/" is the primary marketplace surface.
// The previous SaaS landing page lives on in ./_legacy-landing.tsx (not routed).
export const metadata: Metadata = {
  title: { absolute: "Storelib | Buy & Sell Second-Hand Fashion, Sneakers & Vintage" },
  description: FEED_DESCRIPTION,
  keywords: FEED_KEYWORDS,
  openGraph: {
    title: "Storelib | Buy & Sell Second-Hand Fashion, Sneakers & Vintage",
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
    title: "Storelib | Buy & Sell Second-Hand Fashion, Sneakers & Vintage",
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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<FeedSearchParams>
}) {
  return (
    <>
      {/* Site-wide JSON-LD — Organization + WebSite are homepage-scoped signals,
          carried over from the retired landing page so they aren't lost. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "Storelib",
            "url": "https://storelib.com",
            "logo": "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg",
            "sameAs": [],
            "description": "The marketplace for second-hand fashion, sneakers, bags, jewellery, books, homeware and vintage."
          }),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Storelib",
            "url": "https://storelib.com",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://storelib.com/?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          }),
        }}
      />

      <ExploreFeed searchParams={searchParams} />
    </>
  )
}
