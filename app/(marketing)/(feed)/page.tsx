import { Metadata } from "next"

import { StorelibLanding } from "../_legacy-landing"

/**
 * ===========================================================================
 *  "/" IS THE DIGITAL-PRODUCTS LANDING AGAIN
 * ===========================================================================
 *
 * Storelib was a platform for selling digital products -- downloads, courses,
 * templates, memberships -- and at some point the front door was given over to
 * a second-hand fashion feed. This puts it back.
 *
 * Whoever made that change did it carefully: they moved the landing page to
 * `_legacy-landing.tsx` rather than deleting it, kept every section component
 * under components/marketing/ alive, and left a note saying exactly how to
 * restore it. This is that restore, done the way the note describes. Nothing
 * here was rebuilt from memory -- it is the original page, unchanged.
 *
 * ---------------------------------------------------------------------------
 * WHY THE FEED IS GONE RATHER THAN MOVED
 * ---------------------------------------------------------------------------
 * The fashion marketplace is being removed, not parked: the taxonomy, the
 * shipping and AWB subsystem, the Vinted importer and the parcel checkout all
 * go with it. Keeping the feed reachable at some other URL would leave a
 * half-platform behind, advertising categories nothing can be listed in.
 *
 * What survives is the part that was always shared: `products` with its
 * `creator_id` and `status`, the store builder, OnePage, the library, and the
 * secure download pipeline. lib/marketplace/product-kind.ts is the seam -- it
 * already knew the difference between "a file to download" and "a parcel", and
 * only the first half of it is a live path now.
 */

const TITLE = "Storelib | Sell Digital Products Online"
const DESCRIPTION =
  "The all-in-one ecommerce platform to sell digital products, build your online store and grow your audience."
const OG_IMAGE =
  "https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/Untitled%20(512%20x%20512%20px).svg"

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "sell digital products",
    "digital downloads",
    "online courses",
    "ecommerce platform",
    "creator platform",
    "link in bio",
    "online store builder",
    "sell templates",
    "sell ebooks",
    "memberships",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: "/",
    siteName: "Storelib",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Storelib" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
  },
  alternates: { canonical: "https://storelib.com" },
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

/**
 * Static again. The feed was force-dynamic because it read live listings and a
 * per-request search param; a marketing page reads neither, and rendering it
 * per request was paying for nothing. Organization and WebSite JSON-LD are
 * emitted by StorelibLanding itself, so nothing SEO-bearing is lost here.
 */
export default function HomePage() {
  return <StorelibLanding />
}
