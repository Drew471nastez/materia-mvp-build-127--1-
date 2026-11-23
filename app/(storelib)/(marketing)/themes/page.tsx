import type { Metadata } from "next"

import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { publishedListings } from "@/lib/themes/marketplace-server"
import { builtinListings } from "@/lib/themes/marketplace-shared"
import { MARKETPLACE_SEO, THEME_SEO_CATEGORIES, marketplaceCard, marketplaceCategoryCopy } from "@/lib/themes/theme-seo"
import { marketplaceJsonLd } from "@/lib/themes/theme-seo-jsonld"
import { MARKET_CONTAINER, MarketplaceHeading } from "@/components/themes/marketplace-shell"
import { ThemesMarketplace } from "./themes-marketplace"

/**
 * storelib.com/themes: the theme marketplace. The same page for everybody,
 * so it is built once and held at the edge; /admin/themes drops it the
 * moment a theme is saved (lib/themes/marketplace-server.ts). Who is signed
 * in is asked only when somebody presses Use this template, on a theme's
 * page.
 *
 * Round 58: written for the search "website templates": its own title and
 * an answer first summary, every template a card that links to its page,
 * the categories as pages of their own (category/[category]), and a
 * CollectionPage with an ItemList of them all (lib/themes/theme-seo-jsonld).
 */
export const revalidate = 300

/* The whole set (lib/seo/page-metadata), absolute: the title already ends in "| Storelib". */
export const metadata: Metadata = pageMetadata({
  path: "/themes",
  title: MARKETPLACE_SEO.title,
  absolute: true,
  description: MARKETPLACE_SEO.description,
})

export default async function ThemesPage() {
  const listings = await publishedListings().catch(() => builtinListings())
  const cards = listings.map(marketplaceCard)
  const categories = THEME_SEO_CATEGORIES.map(marketplaceCategoryCopy)
  return (
    <div data-themes-page="">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(marketplaceJsonLd(listings)) }} />
      <div className={`${MARKET_CONTAINER} pb-24`}>
        {/* Round 23, the owner: the heading alone, no line under it; the count is beside the order. The categories are in the footer. */}
        <MarketplaceHeading h1={MARKETPLACE_SEO.h1} />
        <ThemesMarketplace cards={cards} allCards={cards} categories={categories} active={null} />
      </div>
    </div>
  )
}
