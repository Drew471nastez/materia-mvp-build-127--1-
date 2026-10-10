import { notFound, redirect } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName, siteCatalogue } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { productMatchesQuery, searchSections } from "@/lib/website-builder/shop-page"
import { catalogPage } from "@/lib/products/catalog-filters"
import { siteMetadata } from "../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"

/**
 * ===========================================================================
 *  SEARCH, ON THE CREATOR'S OWN SITE
 * ===========================================================================
 * Every built site's header has a search control and it had nowhere to go:
 * there was no search on a site at all, so a visitor who wanted a particular
 * thing had to scroll the shop.
 *
 * This is the shop page with a filtered list, built from the same pieces by
 * lib/website-builder/shop-page rather than from a second layout, so the
 * creator's header, footer, colours and card style are the ones they chose
 * and there is nothing separate to keep in step.
 *
 * NOT INDEXED. A search result is not a page of the site; it is a view of it
 * for one visitor. Letting crawlers in creates a page per query string, which
 * is how a small shop ends up with ten thousand thin pages in an index.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
  /* `q`, and the filters and the sort beside it: lib/products/catalog-filters.ts. */
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const base = await siteMetadata(username, undefined, "products")
  /* Search results are not a page to index, and so name no canonical. */
  return { ...base, alternates: undefined, robots: { index: false, follow: true } }
}

export default async function SiteSearchPage({ params, searchParams }: PageProps) {
  const { username } = await params
  const asked = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>)
  const q = Array.isArray(asked.q) ? asked.q[0] : asked.q
  const query = (q ?? "").slice(0, 120)

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, products, productCount } = found
  /* Filtered here rather than in the database: the shop's catalogue is
     already fetched and cached by publishedShopByName, and a search that
     goes back to Postgres would be a second round trip for a list that is
     already in hand. A shop is not big enough for that to be the wrong
     trade; if one ever is, this is the line to change. */
  /* The whole shop is searched, not only the newest 24 (siteCatalogue). */
  const catalogue = await siteCatalogue(site.creatorId).catch(() => products ?? [])
  const pool = catalogue.length ? catalogue : products ?? []
  const matches = query ? pool.filter((p: any) => productMatchesQuery(p, query)) : pool

  /* The page the creator arranged, when they have; the generated one until
     then. Either way the query rides on the page object, so a saved search
     page still says what was asked and what was found. */
  const stored = site.pages.search
  const arranged = stored && stored.length > 0 ? stored : searchSections(site.pages.home ?? site.sections)
  /* Placeholders filled, menus and picked products in hand: see dressPage.
     Pickers name from the whole shop; `products` is what matched. */
  const { sections, data } = await dressPage(site, arranged, products, productCount, "page.search", "Search")
  /* The query travels on the page rather than in the section's settings: it
     belongs to this request, not to anything the creator arranged. */
  /* The filters narrow what the words found, and say how many each would
     leave. The words are matched above, description included, so not again. */
  const { listed, filters, pagination } = catalogPage(matches, asked, "/search", { matchWords: false })
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "page.search", listed, {
    query,
    filters,
    pagination,
  }, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.search", query }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
        emptyDetail={query ? `Nothing matched "${query}".` : "Type what you are looking for."}
      />
      {/* A page of the website like any other: one view, with its own path. */}
      <TrackView creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
