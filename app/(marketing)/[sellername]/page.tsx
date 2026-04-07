import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ sellername: string }>
}

// Known static paths that should NOT match this dynamic route
const RESERVED_PATHS = new Set([
  "account-deletion", "blog", "c", "explore", "faq", "features",
  "l", "legal", "p", "pricing", "u", "w", "wishlist",
  "app", "api", "login", "signup", "register", "auth",
  "store", "store-builder", "website-builder", "admin",
])

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sellername } = await params

  // Skip reserved paths
  if (RESERVED_PATHS.has(sellername.toLowerCase())) return { title: "Not Found" }

  const supabase = await createClient()

  // Resolve the creator id (via profile username or creator slug)
  let creatorId: string | null = null
  let fallbackName = ""
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .eq("username", sellername.toLowerCase())
    .maybeSingle()
  if (profile) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, display_name")
      .eq("user_id", profile.id)
      .maybeSingle()
    if (creator) {
      creatorId = creator.id
      fallbackName = creator.display_name || profile.display_name || profile.username || sellername
    }
  }
  if (!creatorId) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, display_name")
      .eq("slug", sellername.toLowerCase())
      .maybeSingle()
    if (creator) {
      creatorId = creator.id
      fallbackName = creator.display_name || creator.slug || sellername
    }
  }

  if (!creatorId) return { title: "Not Found" }

  // Pull published theme settings so we can use brand_name, seo fields and favicon.
  // Use the admin client: published installs are meant to be public and the
  // regular supabase client is subject to RLS (which blocks unauthenticated
  // reads of store_theme_* tables).
  const adminForMeta = createAdminClient()
  const { data: install } = await adminForMeta
    .from("store_theme_installs")
    .select(`
      id,
      store_theme_settings ( settings, draft_settings )
    `)
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()

  const settingsRow: any =
    (install as any)?.store_theme_settings?.[0] ??
    (install as any)?.store_theme_settings ??
    {}
  // Prefer published `settings`, but also fall back to `draft_settings` so a
  // brand-new install that hasn't been re-published yet still gets the icon
  // the user just uploaded.
  const settings: ThemeSettingsValues = settingsRow.settings ?? settingsRow.draft_settings ?? {}

  const brand = typeof settings.brand_name === "string" && settings.brand_name
    ? settings.brand_name
    : (fallbackName || sellername)
  // Default format: "{seller name} | Storelib". Use `title.absolute` so the
  // root layout's `%s | Storelib` template doesn't double-append.
  const rawTitle = typeof settings.seo_title === "string" && settings.seo_title.trim()
    ? settings.seo_title.trim()
    : `${brand} | Storelib`
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
  }
}

export default async function SellerWebsitePage({ params }: PageProps) {
  const { sellername } = await params

  // Skip reserved paths
  if (RESERVED_PATHS.has(sellername.toLowerCase())) notFound()

  const supabase = await createClient()

  // Try to find the creator by profile username first, then by creator slug
  let creatorId: string | null = null
  let displayName = ""

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .eq("username", sellername.toLowerCase())
    .maybeSingle()

  if (profile) {
    // Find the creator linked to this profile
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, display_name")
      .eq("user_id", profile.id)
      .maybeSingle()

    if (creator) {
      creatorId = creator.id
      displayName = creator.display_name || profile.display_name || profile.username || sellername
    }
  }

  if (!creatorId) {
    // Fallback: look up by creator slug directly
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, display_name")
      .eq("slug", sellername.toLowerCase())
      .maybeSingle()

    if (creator) {
      creatorId = creator.id
      displayName = creator.display_name || creator.slug || sellername
    }
  }

  if (!creatorId) {
    // Check username history for redirect
    const adminSupabase = createAdminClient()
    const { data: historyRecord } = await adminSupabase
      .from("username_history")
      .select("new_username")
      .ilike("old_username", sellername)
      .order("changed_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (historyRecord?.new_username) {
      redirect(`/${historyRecord.new_username}`)
    }

    notFound()
  }

  // Find the published theme install for this creator.
  // Use admin client — published installs must be readable by anyone on the
  // internet, and the `store_theme_*` tables have RLS that locks them down
  // to the owning creator for the regular (anon) client.
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
    .eq("creator_id", creatorId)
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
