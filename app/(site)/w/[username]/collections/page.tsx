import { notFound, permanentRedirect, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { collectionsPageSections } from "@/lib/website-builder/shop-page"
import { isPhysicalCommerceEnabled } from "@/lib/platform/physical-commerce"
import { siteMetadata } from "../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"

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
 * Collections live in physical commerce. While that is off, the site has
 * none, and this address is a 404 like any other it does not have.
 */
export default async function SiteCollectionsPage({ params }: PageProps) {
  const { username } = await params
  if (!(await isPhysicalCommerceEnabled())) notFound()

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}/collections`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products, productCount } = found
  const stored = site.pages.collections
  const arranged = stored && stored.length > 0 ? stored : collectionsPageSections(site.pages.home ?? site.sections)
  /* Placeholders filled, menus, picked products and the collections in hand: see dressPage. */
  const { sections, data } = await dressPage(site, arranged, products, productCount, "page.collections", "Collections")
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.collections", products, undefined, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.collections" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
        emptyDetail="No collections yet."
      />
      <TrackView creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
