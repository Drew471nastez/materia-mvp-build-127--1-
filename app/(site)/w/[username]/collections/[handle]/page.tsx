import { notFound, permanentRedirect, redirect } from "next/navigation"
import { splitSiteName } from "@/lib/markets/site-name"
import { languageChoice, siteLocalizer } from "@/lib/markets/live"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, publishedShopByName, siteCatalogue } from "@/lib/website-builder/published-site"
import { getMainDomain } from "@/lib/url-helpers"
import { collectionSections } from "@/lib/website-builder/shop-page"
import { catalogPage } from "@/lib/products/catalog-filters"
import { collectionMembers } from "@/lib/website-builder/collection-members"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_PICKED_PRODUCTS, pickedProducts } from "@/lib/website-builder/storefront-data-server"
import { siteMetadata } from "../../render-site"
import { SiteVitals } from "@/components/website-builder/site-vitals"
import { TrackView } from "@/components/analytics/track-view"
import { StoreTracking } from "@/components/website-builder/store-tracking"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  return siteMetadata(username, undefined, "collections")
}

/**
 * ===========================================================================
 *  ONE COLLECTION, IN THE CREATOR'S OWN CHROME
 * ===========================================================================
 * Shopify's collection page, at /collections/<handle>: the shop page
 * (header, one product grid with its filters, footer) showing only the
 * collection's published products, in the collection's own order. A
 * collection holds any kind of product: downloads, courses, memberships,
 * services and physical goods alike.
 *
 * Every link to a collection goes here: the Collection list's cards, a
 * Featured collection's button, a menu link picked from Collections.
 */
export default async function SiteCollectionPage({ params, searchParams }: PageProps) {
  const { username: segment, handle: rawHandle } = await params
  /* "andrew~fr": this page in French, sent here by the proxy for /fr/… (lib/markets/site-name.ts). */
  const { name: username, locale, market } = splitSiteName(segment)
  const handle = decodeURIComponent(rawHandle).toLowerCase()
  if (!HANDLE.test(handle) || handle.length > 80) notFound()
  const asked = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>)

  const found = await publishedShopByName(username)
  if (found.kind === "renamed") permanentRedirect(`https://${found.to}.${getMainDomain()}/collections/${handle}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site, productCount } = found
  /* In another of the website's languages: its approved translations over the page and the products (lib/markets/live.ts). */
  const [localizer, language] = await Promise.all([siteLocalizer(site.creatorId, locale, market), languageChoice(site.creatorId, locale, market)])
  const products = localizer && found.products ? localizer.cards(found.products) : found.products
  /* Held with the shop for its minute (lib/website-builder/collection-members.ts). */
  const inIt = await collectionMembers(site.creatorId, handle)
  if (!inIt) notFound()

  /*
    The shop's cards, only the collection's, in its order. The shop list is
    the newest 24, so a member older than that was missing from its own
    collection: those are read by id (pickedProducts, this creator's
    published products only).
  */
  const order = new Map(inIt.productIds.map((id, i) => [id, i]))
  const catalogue = await siteCatalogue(site.creatorId).then((c) => (localizer ? localizer.cards(c) : c)).catch(() => products ?? [])
  const pool = catalogue.length ? catalogue : products ?? []
  const have = new Set(pool.map((p) => p.id))
  const older = inIt.productIds.filter((id) => !have.has(id)).slice(0, MAX_PICKED_PRODUCTS)
  const extra = older.length ? await pickedProducts(createAdminClient() as never, site.creatorId, { ids: older, slugs: [] }) : []
  const cards = [...pool.filter((p) => order.has(p.id)), ...extra].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const arranged = collectionSections(site.pages.home ?? site.sections, site.themeSettings, inIt.collection, site.pages.collection)
  const dressed = await dressPage(site, localizer ? localizer.sections(arranged, site.sources) : arranged, products, productCount, "collection", inIt.collection.title)
  const sections = dressed.sections
  /* The page's own collection, as `collection` in a template and for a picker set to the current collection. */
  const data = { ...dressed.data, collection: dressed.data?.collections?.[inIt.collection.id] ?? null }
  const { listed, filters, pagination } = catalogPage(cards, asked, `/collections/${handle}`)
  const prerendered = renderWithSources(site.sources, sections, site.themeSettings, "collection", listed, { filters, pagination }, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "collection" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={sections}
        storefront={{ creatorId: site.creatorId, installId: site.installId, language }}
        emptyDetail="Nothing in this collection yet."
      />
      <TrackView creatorId={site.creatorId} />
      <StoreTracking creatorId={site.creatorId} />
      <SiteVitals installId={site.installId} />
    </StorelibSourcesProvider>
  )
}
