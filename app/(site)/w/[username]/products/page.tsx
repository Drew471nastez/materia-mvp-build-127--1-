import { notFound, permanentRedirect, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { shopSections } from "@/lib/website-builder/shop-page"
import { siteMetadata } from "../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"

/**
 * RENDERED PER REQUEST, unlike the pages of the site around it.
 *
 * Everything here is the catalogue: a price, whether the last one sold, a Buy
 * button that starts a purchase. The catalogue is already cached for a minute
 * on its own (see `creatorShopTag` in lib/website-builder/published-site.ts),
 * and holding the page on top of that would add a second minute to a
 * corrected price on a live shop. The page around it is held; this is not.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  // "Products | brand", through the same metadata rules as every other page.
  return siteMetadata(username, undefined, "products")
}

/**
 * ===========================================================================
 *  EVERYTHING THIS CREATOR SELLS, IN THEIR OWN CHROME
 * ===========================================================================
 * The themes ship with "Shop" in the nav pointing at `/products`, and the
 * product grid's own "See everything" button points there too. Nothing has
 * ever served it, on any address: the link was in every new site and led
 * nowhere.
 *
 * It is not a page in the database and should not become one, because it has
 * no editable content of its own: it is the site's header and footer around
 * the products the creator sells, which is exactly what the product grid
 * section already draws from the shop. So it is composed here from pieces
 * that are already cached, and a creator who wants a different shop page can
 * still make one and name it themselves.
 */
export default async function SiteShopPage({ params }: PageProps) {
  const { username } = await params

  const found = await publishedShopByName(username)
  /* Renamed for good: the shop at the new name, permanently (308). */
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}/products`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products, productCount } = found
  /* The page the creator arranged, when they have; the generated shop
     until then. The editor generates from the same builder, so the two
     never disagree about what an untouched shop page looks like. */
  const stored = site.pages.products
  const arranged = stored && stored.length > 0 ? stored : shopSections(site.pages.home ?? site.sections, site.themeSettings)
  /* Placeholders filled, menus and picked products in hand: see dressPage. */
  const { sections, data } = await dressPage(site, arranged, products, productCount, "page.products", "Shop")
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.products", products, undefined, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.products" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
        emptyDetail="Nothing in the shop yet."
      />
      {/* A page of the website like any other: one view, with its own path. */}
      <TrackView creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}