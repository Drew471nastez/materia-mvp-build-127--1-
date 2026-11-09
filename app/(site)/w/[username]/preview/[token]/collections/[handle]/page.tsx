import { notFound } from "next/navigation"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, ownerOf, siteCatalogue } from "@/lib/website-builder/published-site"
import { previewTokenFrom, pageSections } from "@/lib/website-builder/preview-link"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { collectionSections } from "@/lib/website-builder/shop-page"
import { catalogPage } from "@/lib/products/catalog-filters"
import { productsInCollection } from "@/lib/physical/collections-server"
import { MAX_PICKED_PRODUCTS, pickedProducts } from "@/lib/website-builder/storefront-data-server"
import type { SectionInstance } from "@/lib/website-builder/types"
import { previewInstall } from "../../../../render-site"

/**
 * One collection as the preview link shows it, /collections/<handle>: the
 * live collection page (app/(site)/w/[username]/collections/[handle]) drawn
 * with the creator's unpublished home sections, so the same `collection`,
 * the same members and the same resolution are checked before publishing.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; token: string; handle: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const HANDLE = /^[a-z0-9]+(-[a-z0-9]+)*$/

function tokenOf(raw: string): string | null {
  return previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(raw)]]))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!tokenOf((await params).token)) return { title: "Not Found", robots: { index: false, follow: false } }
  return { title: "Collection", robots: { index: false, follow: false } }
}

export default async function PreviewCollectionPage({ params, searchParams }: PageProps) {
  const { username, token, handle: rawHandle } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()
  const handle = decodeURIComponent(rawHandle).toLowerCase()
  if (!HANDLE.test(handle) || handle.length > 80) notFound()
  const asked = await searchParams.catch(() => ({}) as Record<string, string | string[] | undefined>)

  const { admin, creatorId, installId, preview, themeSettings } = await previewInstall(username, clean)
  const inIt = await productsInCollection(admin, creatorId, handle).catch(() => null)
  if (!inIt) notFound()

  const { data: homeData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", installId)
    .eq("page_key", "home")
    .maybeSingle()
  const home = sanitizeSections(pageSections<SectionInstance[]>(homeData as never, preview) ?? [])
  /* The Collection page template, as arranged in the builder: shop-page.ts collectionSections. */
  const { data: templateData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", installId)
    .eq("page_key", "collection")
    .maybeSingle()
  const template = sanitizeSections(pageSections<SectionInstance[]>(templateData as never, preview) ?? [])
  const { owner, products, productCount } = await ownerOf(creatorId, installId, themeSettings, { cached: false, draft: preview })

  /* Every member, in the collection's order: the newest 24 the shop list holds, and the rest by id. */
  const order = new Map(inIt.productIds.map((id, i) => [id, i]))
  const catalogue = await siteCatalogue(creatorId, { cached: false }).catch(() => products ?? [])
  const pool = catalogue.length ? catalogue : products ?? []
  const have = new Set(pool.map((p) => p.id))
  const older = inIt.productIds.filter((id) => !have.has(id)).slice(0, MAX_PICKED_PRODUCTS)
  const extra = older.length ? await pickedProducts(admin as never, creatorId, { ids: older, slugs: [] }) : []
  const cards = [...pool.filter((p) => order.has(p.id)), ...extra].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))

  const arranged = collectionSections(home, themeSettings, inIt.collection, template)
  const dressed = await dressPage(owner, arranged, products, productCount, "collection", inIt.collection.title, undefined, { cached: false })
  const data = { ...dressed.data, collection: dressed.data?.collections?.[inIt.collection.id] ?? null }
  const { listed, filters, pagination } = catalogPage(cards, asked, `/collections/${handle}`)
  const prerendered = renderWithSources(owner.sources, dressed.sections, themeSettings, "collection", listed, { filters, pagination }, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "collection" }}>
      <ThemePage
        theme={themeSettings}
        sections={dressed.sections}
        storefront={{ creatorId, installId, currency: await cachedStoreCurrency(creatorId) }}
        emptyDetail="Nothing in this collection yet."
      />
    </StorelibSourcesProvider>
  )
}
