import { notFound, permanentRedirect, redirect } from "next/navigation"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageChoice, siteLocalizer } from "@/lib/markets/live"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName, siteCatalogue } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { shopSections } from "@/lib/website-builder/shop-page"
import { catalogPage } from "@/lib/products/catalog-filters"
import { siteMetadata } from "../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { pageNumberOf } from "@/lib/website-builder/tab-title"

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
  /** The filters and the sort, as the filter form sends them: lib/products/catalog-filters.ts. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username } = await params
  const asked = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>)
  // "Shop | brand", through the same metadata rules as every other page; "Shop | Page 2 | brand" past the first.
  return siteMetadata(username, undefined, "products", null, { pageNumber: pageNumberOf(asked.page) })
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
export default async function SiteShopPage({ params, searchParams }: PageProps) {
  const { username: segment } = await params
  /* "andrew~fr": this page in French, sent here by the proxy for /fr/… (lib/markets/site-name.ts). */
  const { name: username, locale, market } = splitSiteName(segment)
  const asked = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>)

  const found = await publishedShopByName(username)
  /* Renamed for good: the shop at the new name, permanently (308). */
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}/products`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, productCount } = found
  /* In another of the website's languages: its approved translations over the page and the products (lib/markets/live.ts). */
  const [localizer, language] = await Promise.all([siteLocalizer(site.creatorId, locale, market), languageChoice(site.creatorId, locale, market)])
  const products = localizer && found.products ? localizer.cards(found.products) : found.products
  /* The page the creator arranged, when they have; the generated shop
     until then. The editor generates from the same builder, so the two
     never disagree about what an untouched shop page looks like. */
  const stored = site.pages.products
  const arranged = stored && stored.length > 0 ? stored : shopSections(site.pages.home ?? site.sections, site.themeSettings)
  /* Placeholders filled, menus and picked products in hand: see dressPage. */
  const { sections, data } = await dressPage(site, localizer ? localizer.sections(arranged, site.sources) : arranged, products, productCount, "page.products", "Shop", undefined, { cached: true, localizer })
  /* FILTERED HERE, from the address: the products that pass, in the order
     asked for, and every filter with its counts for the form
     (lib/products/catalog-filters.ts). Pickers above still name from the
     whole shop. */
  const catalogue = await siteCatalogue(site.creatorId).then((c) => (localizer ? localizer.cards(c) : c)).catch(() => products ?? [])
  const { listed, filters, pagination } = catalogPage(catalogue.length ? catalogue : products ?? [], asked, "/products")
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.products", listed, { filters, pagination }, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.products" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId, language, words: localizer?.words, display: localizer?.display }}
        emptyDetail="Nothing in the shop yet."
      />
      {/* A page of the website like any other: one view, with its own path. */}
      <TrackView creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}