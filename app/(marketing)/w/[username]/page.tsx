import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
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

  const brand = typeof settings.brand_name === "string" && settings.brand_name
    ? settings.brand_name
    : (creator.display_name || creator.slug || username)
  // Default format: "{seller name} | Storelib"
  const title = typeof settings.seo_title === "string" && settings.seo_title
    ? settings.seo_title
    : `${brand} | Storelib`
  const description = typeof settings.seo_description === "string" && settings.seo_description
    ? settings.seo_description
    : `Visit ${brand}'s website on Storelib`
  const favicon = typeof settings.favicon_url === "string" && settings.favicon_url
    ? settings.favicon_url
    : undefined

  return {
    title,
    description,
    icons: favicon ? { icon: favicon, shortcut: favicon, apple: favicon } : undefined,
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

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: String(themeSettings.background_color ?? "#ffffff"),
        fontFamily: String(themeSettings.font_body ?? "Inter"),
      }}
    >
      {/* Announcement bar */}
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

      {/* Header sections */}
      {sections.filter(s => s.type === "header").map((section) => (
        <SectionRenderer key={section.id} section={section} theme={themeSettings} />
      ))}

      {/* Body sections — flex-1 pushes footer to bottom without trailing whitespace */}
      <div className="flex-1">
        {sections.filter(s => s.type !== "header" && s.type !== "footer").map((section) => (
          <SectionRenderer key={section.id} section={section} theme={themeSettings} />
        ))}

        {sections.length === 0 && (
          <div className="min-h-[50vh] flex items-center justify-center">
            <div className="text-center text-gray-400">
              <p className="text-lg font-medium">This website is being set up</p>
              <p className="text-sm mt-1">Check back soon!</p>
            </div>
          </div>
        )}
      </div>

      {/* Footer sections */}
      {sections.filter(s => s.type === "footer").map((section) => (
        <SectionRenderer key={section.id} section={section} theme={themeSettings} />
      ))}
    </div>
  )
}
