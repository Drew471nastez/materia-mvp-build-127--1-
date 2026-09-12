import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { prerenderStorelibSections } from "@/lib/website-builder/storefront-render"
import { previewTokenFrom, pageSections } from "@/lib/website-builder/preview-link"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { shopProducts } from "@/lib/website-builder/shop-products"
import { shopSections } from "@/lib/website-builder/shop-page"
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
}

function tokenOf(raw: string): string | null {
  return previewTokenFrom(new URLSearchParams([["preview", decodeURIComponent(raw)]]))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  if (!tokenOf((await params).token)) return { title: "Not Found", robots: { index: false, follow: false } }
  return { title: "Products", robots: { index: false, follow: false } }
}

export default async function PreviewShopPage({ params }: PageProps) {
  const { username, token } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()

  const { admin, creatorId, installId, preview, themeSettings } = await previewInstall(username, clean)

  const { data: homeData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", installId)
    .eq("page_key", "home")
    .maybeSingle()

  const home = sanitizeSections(pageSections<SectionInstance[]>(homeData as never, preview) ?? [])
  const sections = shopSections(home, themeSettings)
  const products = await shopProducts(admin as never, creatorId)
  const prerendered = await prerenderStorelibSections(admin as never, installId, sections, themeSettings, "page.products", products)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.products" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        storefront={{ creatorId, installId }}
        emptyDetail="Nothing in the shop yet."
      />
    </StorelibSourcesProvider>
  )
}
