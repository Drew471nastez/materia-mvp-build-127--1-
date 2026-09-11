import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { prerenderStorelibSections } from "@/lib/website-builder/storefront-render"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ username: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { username } = await params
  const supabase = await createClient()

  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, display_name")
    .or(`slug.eq.${username},username.eq.${username}`)
    .maybeSingle()

  if (!creator) return { title: "Not Found" }

  // Pull published theme settings so we can use brand_name, seo fields and favicon.
  // Use admin client — published installs must be readable by anyone and
  // `store_theme_*` tables are locked down by RLS to the owning creator.
  const adminForMeta = createAdminClient()
  const { data: install } = await adminForMeta
    .from("store_theme_installs")
    .select(`
      id,
      store_theme_settings ( settings, draft_settings )
    `)
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  const settingsRow: any =
    (install as any)?.store_theme_settings?.[0] ??
    (install as any)?.store_theme_settings ??
    {}
  // Prefer published `settings`, fall back to `draft_settings` so a freshly
  // uploaded favicon shows up even if the install hasn't been re-published.
  const settings: ThemeSettingsValues = settingsRow.settings ?? settingsRow.draft_settings ?? {}

  // Default format: "{username} | Storelib" — prefer the creator's platform
  // username/slug over the brand_name so the tab title matches the URL.
  const defaultHandle = creator.slug || username || creator.display_name || "Storelib"
  const rawTitle = typeof settings.seo_title === "string" && settings.seo_title.trim()
    ? settings.seo_title.trim()
    : `${defaultHandle} | Storelib`
  const brand = typeof settings.brand_name === "string" && settings.brand_name
    ? settings.brand_name
    : defaultHandle
  const description = typeof settings.seo_description === "string" && settings.seo_description
    ? settings.seo_description
    : `Visit ${brand}'s website on Storelib`
  const favicon = typeof settings.favicon_url === "string" && settings.favicon_url
    ? settings.favicon_url
    : undefined

  return {
    title: { absolute: rawTitle },
    description,
    icons: favicon ? { icon: favicon, shortcut: favicon, apple: favicon } : undefined,
    // The share image, the card type and — the one that matters — whether the
    // page may be indexed at all. All three were in the panel and read by
    // nothing, so "noindex" was a setting somebody trusted and did not have.
    ...themeMetadata(settings, { title: rawTitle, description }),
  }
}

export default async function WebsitePublicPage({ params }: PageProps) {
  const { username } = await params
  const supabase = await createClient()

  // Find the creator by slug or username
  const { data: creator } = await supabase
    .from("creators")
    .select("id, slug, display_name, avatar_url")
    .or(`slug.eq.${username},username.eq.${username}`)
    .maybeSingle()

  if (!creator) notFound()

  // Find the published theme install for this creator.
  // Use admin client — published installs must be publicly readable but
  // `store_theme_*` tables are locked to the owner under regular RLS.
  const publicAdmin = createAdminClient()
  const { data: install } = await publicAdmin
    .from("store_theme_installs")
    .select(`
      id,
      name,
      status,
      store_theme_settings (
        settings,
        draft_settings
      )
    `)
    .eq("creator_id", creator.id)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!install) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Website Coming Soon</h1>
          <p className="text-gray-500">This website is currently being built.</p>
        </div>
      </div>
    )
  }

  // Get published sections for the home page (admin bypasses RLS)
  const { data: pageData } = await publicAdmin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", install.id)
    .eq("page_key", "home")
    .maybeSingle()

  const themeSettings: ThemeSettingsValues =
    (install as any).store_theme_settings?.[0]?.settings ??
    (install as any).store_theme_settings?.settings ??
    {}

  const sections: SectionInstance[] = pageData?.sections ?? pageData?.draft_sections ?? []

  /**
   * Rendered here, on the server, once. Without this a .storelib section
   * draws nothing at all on this route: measured at 0 characters of HTML
   * against 3651 for the same section on the storefront.
   */
  const prerendered = await prerenderStorelibSections(
    publicAdmin as never,
    install.id,
    sections,
    themeSettings,
    "index",
  )

  // No min-h-screen / flex-1 filler — see [sellername]/page.tsx for rationale.
  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "index" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        emptyDetail="Check back soon!"
      />
    </StorelibSourcesProvider>
  )
}
