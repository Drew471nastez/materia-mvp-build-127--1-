import { notFound, permanentRedirect, redirect } from "next/navigation"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageChoice, siteLocalizer } from "@/lib/markets/live"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { collectionsPageSections } from "@/lib/website-builder/shop-page"
import { siteMetadata } from "../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"

/**
 * Per request, like the shop: a collection's products are the catalogue,
 * already cached a minute on their own, and holding the page on top of that
 * would add a second minute to a corrected price.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return siteMetadata(username, undefined, "collections")
}

/**
 * ===========================================================================
 *  EVERY COLLECTION, IN THE CREATOR'S OWN CHROME
 * ===========================================================================
 * Shopify's list-collections page, at /collections. What the creator
 * arranged when they have opened it in the builder; until then, their
 * header and footer around one Collection list showing every published
 * collection (lib/website-builder/shop-page, collectionsPageSections).
 *
 * Every shop can have collections, whatever it sells. One with none shows
 * the page's own empty state.
 */
export default async function SiteCollectionsPage({ params }: PageProps) {
  const { username: segment } = await params
  /* "andrew~fr": this page in French, sent here by the proxy for /fr/… (lib/markets/site-name.ts). */
  const { name: username, locale } = splitSiteName(segment)

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}/collections`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, productCount } = found
  /* In another of the website's languages: its approved translations over the page and the products (lib/markets/live.ts). */
  const [localizer, language] = await Promise.all([siteLocalizer(site.creatorId, locale), languageChoice(site.creatorId, locale)])
  const products = localizer && found.products ? localizer.cards(found.products) : found.products
  const stored = site.pages.collections
  const arranged = stored && stored.length > 0 ? stored : collectionsPageSections(site.pages.home ?? site.sections)
  /* Placeholders filled, menus, picked products and the collections in hand: see dressPage. */
  const { sections, data } = await dressPage(site, localizer ? localizer.sections(arranged, site.sources) : arranged, products, productCount, "page.collections", "Collections")
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.collections", products, undefined, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.collections" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId, language }}
        emptyDetail="No collections yet."
      />
      <TrackView creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
