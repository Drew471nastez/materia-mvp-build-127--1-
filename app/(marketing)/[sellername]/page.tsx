import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { prerenderStorelibSections } from "@/lib/website-builder/storefront-render"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
import { mayPreview, pageSections, previewTokenFrom, themeSettings as themeSettings_ } from "@/lib/website-builder/preview-link"
import { publishedSiteByName } from "@/lib/website-builder/published-site"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/**
 * Dynamic because this route reads `searchParams` for the preview token, so
 * it could never be prerendered anyway.
 *
 * IT DOES NOT TURN OFF THE CACHE UNDER IT, which is the thing worth writing
 * down. `force-dynamic` changes the default for `fetch`, and Next's
 * `unstable_cache` gates on `workStore.fetchCache === "force-no-store"` —
 * which is set only by an explicit `export const fetchCache` in the module,
 * and there is none here. So the published site below stays cached. Adding
 * `export const fetchCache = "force-no-store"` to this file would silently
 * put every visitor back on eight database round trips; a test refuses it.
 */
export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ sellername: string }>
  /** `?preview=<token>` shows the drafts, to whoever has the link. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

// Known static paths that should NOT match this dynamic route
const RESERVED_PATHS = new Set([
  "account-deletion", "blog", "c", "explore", "faq", "features",
  "l", "legal", "p", "pricing", "u", "w", "wishlist",
  "app", "api", "login", "signup", "register", "auth",
  "store", "store-builder", "website-builder", "admin",
])

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { sellername } = await params

  // Skip reserved paths
  if (RESERVED_PATHS.has(sellername.toLowerCase())) return { title: "Not Found" }

  /**
   * A PREVIEW IS NOT FOR SEARCH ENGINES. The link is shared with a person,
   * and the page behind it is by definition not the one the creator has
   * decided on. Refusing indexing here rather than after the fact: a draft
   * that reaches an index outlives the draft.
   *
   * Checked on the SHAPE of the token, not against the database. The answer
   * is the same either way — a wrong token renders the published page, which
   * is indexable — and this keeps a lookup out of metadata generation.
   */
  const looksLikePreview = previewTokenFrom(new URLSearchParams(
    Object.entries((await searchParams) ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  )) !== null
  if (looksLikePreview) {
    return { title: "Preview", robots: { index: false, follow: false } }
  }

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

  // Default format: "{username} | Storelib" — prefer the platform username
  // (the sellername in the URL) so the tab title matches the URL.
  const defaultHandle = sellername || fallbackName || "Storelib"
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

export default async function SellerWebsitePage({ params, searchParams }: PageProps) {
  const { sellername } = await params

  // Skip reserved paths
  if (RESERVED_PATHS.has(sellername.toLowerCase())) notFound()

  /**
   * THE PREVIEW LINK. A long random token on the install; with it this page
   * renders the unpublished drafts and asks not to be indexed, without it
   * the published site. See lib/website-builder/preview-link.ts.
   *
   * A preview NEVER goes through the cache below. It is one person's view of
   * unpublished work, and a cache keyed by the address would hand it to the
   * next visitor. So the two paths are separate from here down: the fast one
   * knows nothing about drafts, and the draft one is not cached at all.
   */
  const wantedToken = previewTokenFrom(new URLSearchParams(
    Object.entries((await searchParams) ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  ))

  // Awaited rather than used as an element: an async component is fine at
  // runtime either way, and this keeps the types honest about it.
  if (wantedToken) return await previewPage(sellername, wantedToken)

  const found = await publishedSiteByName(sellername)
  if (found.kind === "renamed") redirect(`/${found.to}`)
  if (found.kind === "missing") notFound()
  if (found.kind === "unpublished") return <ComingSoon />

  const { site } = found
  return (
    <StorelibSourcesProvider prerendered={site.prerendered} page={{ template: "index" }}>
      <ThemePage
        theme={site.themeSettings}
        sections={site.sections}
        // Whose site this is, for the sections that send something somewhere.
        storefront={{ creatorId: site.creatorId, installId: site.installId }}
        emptyDetail="Check back soon!"
      />
    </StorelibSourcesProvider>
  )
}

function ComingSoon() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Website Coming Soon</h1>
        <p className="text-gray-500">This website is currently being built.</p>
      </div>
    </div>
  )
}

/**
 * ===========================================================================
 *  THE DRAFT, FOR WHOEVER HOLDS THE LINK
 * ===========================================================================
 * Uncached and unshared, reading the install directly so the token can be
 * compared against it. Everything here is the slow path on purpose: it is
 * one person looking at their own unpublished work, and being a few hundred
 * milliseconds slower than the live site is the correct trade for never
 * putting a draft anywhere a stranger could be handed it.
 *
 * A wrong token is not an error. It renders the published site, which is
 * what that address is, and says nothing about whether a link exists.
 */
async function previewPage(sellername: string, token: string) {
  const supabase = await createClient()

  let creatorId: string | null = null
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
    if (creator) creatorId = creator.id
  }

  if (!creatorId) {
    const { data: creator } = await supabase
      .from("creators")
      .select("id, slug, display_name")
      .eq("slug", sellername.toLowerCase())
      .maybeSingle()
    if (creator) creatorId = creator.id
  }

  if (!creatorId) notFound()

  /**
   * Admin, because published installs must be readable by anyone on the
   * internet and the `store_theme_*` tables are locked to the owning creator
   * for the anon client. The token is what authorises the drafts, and it is
   * compared in constant time.
   */
  const publicAdmin = createAdminClient()
  const { data: install } = await publicAdmin
    .from("store_theme_installs")
    .select(`
      id,
      name,
      status,
      preview_token,
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

  if (!install) return <ComingSoon />

  const { data: pageData } = await publicAdmin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", install.id)
    .eq("page_key", "home")
    .maybeSingle()

  const preview = mayPreview((install as { preview_token?: string | null }).preview_token, token)

  const settingsRow =
    (install as any).store_theme_settings?.[0] ?? (install as any).store_theme_settings ?? null
  const themeSettings: ThemeSettingsValues = (themeSettings_(settingsRow, preview) ?? {}) as ThemeSettingsValues
  /**
   * And again on the way out. The database already holds rich text saved
   * before anything sanitised it, and rows can arrive from an import. The
   * save path is the authority; this is what covers what is already there.
   */
  const sections: SectionInstance[] = sanitizeSections(pageSections<SectionInstance[]>(pageData, preview) ?? [])

  const prerendered = await prerenderStorelibSections(
    publicAdmin as never,
    install.id,
    sections,
    themeSettings,
    "index",
  )

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "index" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        storefront={{ creatorId }}
        emptyDetail="Check back soon!"
      />
    </StorelibSourcesProvider>
  )
}
