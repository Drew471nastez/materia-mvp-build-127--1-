import { notFound } from "next/navigation"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { renderWithSources } from "@/lib/website-builder/storefront-render"
import { dressPage, ownerOf } from "@/lib/website-builder/published-site"
import { previewTokenFrom, pageSections } from "@/lib/website-builder/preview-link"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { collectionsPageSections } from "@/lib/website-builder/shop-page"
import type { SectionInstance } from "@/lib/website-builder/types"
import { previewInstall } from "../../../render-site"

/**
 * The collections page as the preview link shows it: the creator's
 * unpublished collections page, or their unpublished header and footer
 * around every published collection until they have arranged one.
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
  return { title: "Collections", robots: { index: false, follow: false } }
}

export default async function PreviewCollectionsPage({ params }: PageProps) {
  const { username, token } = await params
  const clean = tokenOf(token)
  if (!clean) notFound()

  const { admin, creatorId, installId, preview, themeSettings } = await previewInstall(username, clean)

  const { data: rows } = await admin
    .from("store_theme_pages")
    .select("page_key, sections, draft_sections")
    .eq("install_id", installId)
    .in("page_key", ["home", "collections"])

  const rowOf = (key: string) => ((rows ?? []) as { page_key: string }[]).find((r) => r.page_key === key)
  const own = sanitizeSections(pageSections<SectionInstance[]>(rowOf("collections") as never, preview) ?? [])
  const home = sanitizeSections(pageSections<SectionInstance[]>(rowOf("home") as never, preview) ?? [])
  const arranged = own.length > 0 ? own : collectionsPageSections(home)
  const { owner, products, productCount } = await ownerOf(creatorId, installId, themeSettings)
  const { sections, data } = await dressPage(owner, arranged, products, productCount, "page.collections", "Collections", undefined, { cached: false })
  const prerendered = renderWithSources(owner.sources, sections, themeSettings, "page.collections", products, undefined, data)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "page.collections" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        storefront={{ creatorId, installId, currency: await cachedStoreCurrency(creatorId) }}
        emptyDetail="No collections yet."
      />
    </StorelibSourcesProvider>
  )
}
