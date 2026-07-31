// Moved off /products/<slug>.
//
// That path is the MARKETPLACE product page now (see
// app/(marketing)/products/[slug]) — the address a listing is shared and linked
// under. This renderer is the website-builder's product page, a different thing
// entirely: it draws a seller's builder-authored sections rather than a listing.
// Nothing in the app links here, so moving it breaks no navigation; it keeps
// resolving for any builder storefront that still needs it.

import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ slug: string }>
}

type ProductRow = {
  id: string
  title: string | null
  description: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  whats_included: string[] | null
  slug: string | null
  status: string | null
  creator_id: string | null
}

async function fetchProductBySlug(slug: string): Promise<ProductRow | null> {
  const supabase = await createClient()

  // Try current slug first
  const { data } = await supabase
    .from("products")
    .select("id, title, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, whats_included, slug, status, creator_id")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle()

  if (data) return data as ProductRow

  // Fall back to renamed slugs
  const { data: history } = await supabase
    .from("product_slug_history")
    .select(`
      product_id,
      products!inner (
        id, title, description, price_cents, compare_at_cents,
        thumbnail_url, gallery_urls, whats_included, slug, status, creator_id
      )
    `)
    .eq("old_slug", slug)
    .maybeSingle()

  const p: any = history?.products
  if (p && p.status === "published") return p as ProductRow
  return null
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const product = await fetchProductBySlug(slug)
  if (!product) return { title: "Product Not Found" }

  const ogImage = (product.gallery_urls?.[0]) || product.thumbnail_url || undefined
  return {
    title: product.title ?? "Product",
    description: product.description ?? undefined,
    openGraph: {
      title: product.title ?? "Product",
      description: product.description ?? undefined,
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
  }
}

export default async function WebsiteBuilderProductPage({ params }: PageProps) {
  const { slug } = await params
  const product = await fetchProductBySlug(slug)
  if (!product || !product.creator_id) notFound()

  const admin = createAdminClient()

  // Fetch the creator's published website-builder install
  const { data: install } = await admin
    .from("store_theme_installs")
    .select(`
      id,
      store_theme_settings ( settings, draft_settings )
    `)
    .eq("creator_id", product.creator_id)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  // If the creator has no published website yet, fall back to notFound so
  // Storelib doesn't leak an un-styled bare product. The marketplace page at
  // /p/[slug] is still available for the discovery flow.
  if (!install) notFound()

  const themeSettings: ThemeSettingsValues =
    (install as any).store_theme_settings?.[0]?.settings ??
    (install as any).store_theme_settings?.settings ??
    {}

  // Fetch product-page AND home-page sections in parallel. Home is the
  // source of truth for header/footer on every page of the live site.
  const [{ data: pageData }, { data: homeData }] = await Promise.all([
    admin
      .from("store_theme_pages")
      .select("sections, draft_sections")
      .eq("install_id", install.id)
      .eq("page_key", "product")
      .maybeSingle(),
    admin
      .from("store_theme_pages")
      .select("sections, draft_sections")
      .eq("install_id", install.id)
      .eq("page_key", "home")
      .maybeSingle(),
  ])

  const rawSections: SectionInstance[] =
    (pageData?.sections as SectionInstance[] | null) ??
    (pageData?.draft_sections as SectionInstance[] | null) ??
    []

  const homeSections: SectionInstance[] =
    (homeData?.sections as SectionInstance[] | null) ??
    (homeData?.draft_sections as SectionInstance[] | null) ??
    []

  const homeHeader = homeSections.find(s => s.type === "header")
  const homeFooter = homeSections.find(s => s.type === "footer")

  // Inject the real product data into every product-type section so the
  // editor-preview code path ("_product_data" on settings) renders the
  // actual product on the live storefront.
  const productData = {
    id: product.id,
    title: product.title ?? "",
    description: product.description ?? "",
    price_cents: product.price_cents ?? 0,
    compare_at_cents: product.compare_at_cents,
    thumbnail_url: product.thumbnail_url ?? "",
    gallery_urls: product.gallery_urls ?? [],
    whats_included: product.whats_included ?? [],
    files: [] as { file_name: string; file_size: number; mime_type: string }[],
    slug: product.slug ?? slug,
  }

  const sections: SectionInstance[] = rawSections.map(s =>
    s.type === "product"
      ? { ...s, settings: { ...s.settings, _product_data: productData } }
      : s
  )

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: String(themeSettings.background_color ?? "#ffffff"),
        fontFamily: String(themeSettings.font_body ?? "Inter"),
      }}
    >
      {themeSettings.announcement_bar_enabled && themeSettings.announcement_bar_text && (
        <div
          className="w-full py-2 text-center text-sm font-medium"
          style={{
            background: String(themeSettings.announcement_bar_bg ?? "#6366f1"),
            color: String(themeSettings.announcement_bar_color ?? "#ffffff"),
          }}
        >
          {String(themeSettings.announcement_bar_text)}
        </div>
      )}

      {(homeHeader ?? sections.find(s => s.type === "header")) && (
        <SectionRenderer
          key={(homeHeader ?? sections.find(s => s.type === "header"))!.id}
          section={(homeHeader ?? sections.find(s => s.type === "header"))!}
          theme={themeSettings}
        />
      )}

      <div className="flex-1">
        {sections.filter(s => s.type !== "header" && s.type !== "footer").map(section => (
          <SectionRenderer key={section.id} section={section} theme={themeSettings} />
        ))}
      </div>

      {(homeFooter ?? sections.find(s => s.type === "footer")) && (
        <SectionRenderer
          key={(homeFooter ?? sections.find(s => s.type === "footer"))!.id}
          section={(homeFooter ?? sections.find(s => s.type === "footer"))!}
          theme={themeSettings}
        />
      )}
    </div>
  )
}
