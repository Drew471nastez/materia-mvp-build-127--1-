import { notFound } from "next/navigation"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, ownerOf, siteCatalogue } from "@/lib/website-builder/published-site"
import { previewTokenFrom, pageSections } from "@/lib/website-builder/preview-link"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { shopSections } from "@/lib/website-builder/shop-page"
import { catalogPage } from "@/lib/products/catalog-filters"
import type { SectionInstance } from "@/lib/website-builder/types"
import { previewInstall } from "../../../render-site"

/**
 * The shop index, as the preview link shows it: the creator's unpublished
 * header and footer around the products they sell. The preview covered the
 * site's pages and stopped there, so /products and a product page could not
 * be checked before they went out.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string; token: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

function tokenOf(raw: string): string | null {
  return previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(raw)]]))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!tokenOf((await params).token)) return { title: "Not Found", robots: { index: false, follow: false } }
  return { title: "Products", robots: { index: false, follow: false } }
}

export default async function PreviewShopPage({ params, searchParams }: PageProps) {
  const { username, token } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()

  const { admin, creatorId, installId, preview, themeSettings } = await previewInstall(username, clean)

  /* The saved Products page when there is one, as the live shop does (products/page.tsx); else the shop drawn from home. */
  const { data: pageRows } = await admin
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", installId)
    .in("page_key", ["home", "products"])
  const rowOf = (key: string) => ((pageRows ?? []) as { page_key: string }[]).find((r) => r.page_key === key) ?? null

  const home = sanitizeSections(pageSections<SectionInstance[]>(rowOf("home") as never, preview) ?? [])
  const stored = sanitizeSections(pageSections<SectionInstance[]>(rowOf("products") as never, preview) ?? [])
  const arranged = stored.length > 0 ? stored : shopSections(home, themeSettings)
  const { owner, products, productCount } = await ownerOf(creatorId, installId, themeSettings)
  const { sections, data } = await dressPage(owner, arranged, products, productCount, "page.products", "Shop", undefined, { cached: false })
  /* Filtered from the address, as the live shop page is (lib/products/catalog-filters.ts). */
  const catalogue = await siteCatalogue(creatorId, { cached: false }).catch(() => products ?? [])
  const { listed, filters, pagination } = catalogPage(catalogue.length ? catalogue : products ?? [], (await searchParams?.catch(() => undefined)) ?? {}, "/products")
  const prerendered = renderWithSources(owner.sources, sections, themeSettings, "page.products", listed, { filters, pagination }, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.products" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        storefront={{ creatorId, installId, currency: await cachedStoreCurrency(creatorId) }}
        emptyDetail="Nothing in the shop yet."
      />
    </StorelibSourcesProvider>
  )
}
