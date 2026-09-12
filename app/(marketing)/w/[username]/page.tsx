import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Metadata } from "next"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { StorelibSourcesProvider } from "@/components/website-builder/sections/storelib-sources"
import { prerenderStorelibSections } from "@/lib/website-builder/storefront-render"
import { mayPreview, pageSections, previewTokenFrom, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { publishedSiteByName } from "@/lib/website-builder/published-site"
import { shopProducts } from "@/lib/website-builder/shop-products"
import { getMainDomain } from "@/lib/url-helpers"
import { themeMetadata } from "@/lib/website-builder/theme-metadata"
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
  params: Promise<{ username: string }>
  /** `?preview=<token>` shows the drafts, to whoever has the link. */
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { username } = await params

  /**
   * A PREVIEW IS NOT FOR SEARCH ENGINES. The link is shared with a person,
   * and the page behind it is by definition not the one the creator has
   * decided on. Checked on the SHAPE of the token, not against the database:
   * the answer is the same either way, and it keeps a lookup out of here.
   */
  const looksLikePreview = previewTokenFrom(new URLSearchParams(
    Object.entries((await searchParams) ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  )) !== null
  if (looksLikePreview) return { title: "Preview", robots: { index: false, follow: false } }

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
  // PUBLISHED ONLY. This fell back to `draft_settings` "so a freshly uploaded
  // favicon shows up before a re-publish", which is a draft title, description
  // and favicon on a public page — the same leak the body of this page was
  // fixed for. A favicon shows up when it is published, like everything else.
  const settings: ThemeSettingsValues = settingsRow.settings ?? {}

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

/**
 * ===========================================================================
 *  THE WEBSITE, AT ITS OWN ADDRESS
 * ===========================================================================
 * `<name>.storelib.com` is rewritten here by the proxy. This is the page a
 * creator built in the website builder, and nothing else: their profile and
 * products live at `storelib.com/<name>`, which is a different thing.
 *
 * NOTHING IS "COMING SOON". A creator with nothing published yet has a
 * perfectly good page already — the creator page — and a visitor typing the
 * subdomain goes there rather than to a placeholder. A published site is
 * served from the cache in lib/website-builder/published-site.ts; a
 * preview link (`?preview=<token>`) takes the slow, uncached path on
 * purpose, because it is one person looking at unpublished work.
 */
export default async function WebsitePublicPage({ params, searchParams }: PageProps) {
  const { username } = await params

  const wantedToken = previewTokenFrom(new URLSearchParams(
    Object.entries((await searchParams) ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  ))
  if (wantedToken) return await previewPage(username, wantedToken)

  const found = await publishedSiteByName(username)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  // Nothing published: the creator page, which always exists for a creator.
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site } = found
  return (
    <StorelibSourcesProvider prerendered={site.prerendered} page={{ template: "index" }}>
      <ThemePage theme={site.themeSettings} sections={site.sections} emptyDetail="Check back soon!" />
    </StorelibSourcesProvider>
  )
}

/**
 * The draft, for whoever holds the link. Uncached and unshared: it reads the
 * install directly so the token can be compared against it, in constant
 * time. A wrong token renders the published site and says nothing about
 * whether a link exists.
 */
async function previewPage(username: string, token: string) {
  const admin = createAdminClient()
  const lower = username.toLowerCase()

  let creatorId: string | null = null
  const { data: profile } = await admin.from("profiles").select("id").eq("username", lower).maybeSingle()
  if (profile) {
    const { data: creator } = await admin.from("creators").select("id").eq("user_id", (profile as { id: string }).id).maybeSingle()
    if (creator) creatorId = (creator as { id: string }).id
  }
  if (!creatorId) {
    const { data: creator } = await admin.from("creators").select("id").eq("slug", lower).maybeSingle()
    if (creator) creatorId = (creator as { id: string }).id
  }
  if (!creatorId) notFound()

  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, name, status, preview_token, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!install) redirect(`https://${getMainDomain()}/${lower}`)

  const row = install as { id: string; preview_token?: string | null; store_theme_settings?: unknown }
  const { data: pageData } = await admin
    .from("store_theme_pages")
    .select("sections, draft_sections")
    .eq("install_id", row.id)
    .eq("page_key", "home")
    .maybeSingle()

  const preview = mayPreview(row.preview_token, token)
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const themeSettings = (themeSettingsOf(settingsRow as never, preview) ?? {}) as ThemeSettingsValues
  /**
   * And again on the way out. The database already holds rich text saved
   * before anything sanitised it, and rows can arrive from an import. The
   * save path is the authority; this covers what is already there.
   */
  const sections = sanitizeSections(pageSections<SectionInstance[]>(pageData as never, preview) ?? [])
  const products = await shopProducts(admin as never, creatorId)
  const prerendered = await prerenderStorelibSections(admin as never, row.id, sections, themeSettings, "index", products)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template: "index" }}>
      <ThemePage
        theme={themeSettings}
        sections={sections}
        // Whose site this is, for the sections that send something somewhere.
        storefront={{ creatorId, installId: row.id }}
        emptyDetail="Check back soon!"
      />
    </StorelibSourcesProvider>
  )
}
