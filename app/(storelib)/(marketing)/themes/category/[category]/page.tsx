import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { pageMetadata } from "@/lib/seo/page-metadata"
import { jsonLdScript } from "@/lib/seo/json-ld"
import { publishedListings } from "@/lib/themes/marketplace-server"
import { MARKETPLACE_PATH, builtinListings } from "@/lib/themes/marketplace-shared"
import { THEME_SEO_CATEGORIES, listingsInCategory, marketplaceCard, marketplaceCategoryCopy, seoCategory, themeCategoryPath, themeImages, themeAlt } from "@/lib/themes/theme-seo"
import { categoryJsonLd } from "@/lib/themes/theme-seo-jsonld"
import { CategorySummary, FaqList, MARKET_CONTAINER, MarketplaceHeading } from "@/components/themes/marketplace-shell"
import { ThemesMarketplace } from "../../themes-marketplace"

/**
 * storelib.com/themes/category/<category>: one kind of template, as a page
 * of its own (round 58). Its words are lib/themes/theme-seo.ts
 * THEME_SEO_CATEGORIES; the templates on it are the ones listed there and
 * any uploaded listing filed under the same kind. Built for every category
 * ahead of time and held at the edge like /themes; an unknown category is a
 * 404, never an empty page.
 */
export const revalidate = 300
export const dynamicParams = false

export function generateStaticParams() {
  return THEME_SEO_CATEGORIES.map((c) => ({ category: c.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const cat = seoCategory((await params).category)
  if (!cat) return { title: "Not found", robots: { index: false } }
  /* The category's first template's share card stands for it: a picture of a real template, not Storelib's generic card. */
  const listings = await publishedListings().catch(() => builtinListings())
  const first = listingsInCategory(listings, cat.slug)[0]
  const og = first ? themeImages(first).og : null
  return pageMetadata({
    path: themeCategoryPath(cat.slug),
    title: cat.title,
    absolute: true,
    description: cat.description,
    image: og && first ? { url: og.src, alt: themeAlt(first, "og") } : null,
  })
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const cat = seoCategory((await params).category)
  if (!cat) notFound()
  const listings = await publishedListings().catch(() => builtinListings())
  const inIt = listingsInCategory(listings, cat.slug)
  const all = listings.map(marketplaceCard)
  const categories = THEME_SEO_CATEGORIES.map(marketplaceCategoryCopy)
  return (
    <div data-themes-page={cat.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(categoryJsonLd(cat, inIt)) }} />
      <div className={`${MARKET_CONTAINER} pb-24`}>
        <MarketplaceHeading h1={cat.h1} trail={[{ name: "Themes", href: MARKETPLACE_PATH }, { name: cat.name }]} />
        <ThemesMarketplace cards={inIt.map(marketplaceCard)} allCards={all} categories={categories} active={cat.slug} />
        {/* Round 23: the category's summary is for search and for whoever reads on; under the grid, not under the heading. */}
        <div className="mt-20 space-y-10 border-t border-[#eceef1] pt-12">
          <CategorySummary text={cat.intro} />
          <FaqList faqs={cat.faqs} />
        </div>
      </div>
    </div>
  )
}
