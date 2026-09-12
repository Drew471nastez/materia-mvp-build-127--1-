/**
 * ===========================================================================
 *  ONE SITE, DRAWN FOR WHICHEVER PAGE WAS ASKED FOR
 * ===========================================================================
 * `<name>.storelib.com` and `<name>.storelib.com/about` are the same website
 * and differ by one thing: which page of it to draw. So the work lives here
 * once and both routes hand it a page key.
 *
 * This is also where a long-standing hole was closed. The builder has always
 * offered an About page, a Contact page and pages of the creator's own, the
 * shipped header links to `/about`, and nothing has ever served any of them:
 * `app/(marketing)/w/` held a single route for the home page, so every other
 * address on every published site was a 404. Sub-pages were work a creator
 * could do and no visitor could see.
 */
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { notFound, redirect } from "next/navigation"
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
import { pageTitleFromKey, templateForPage } from "@/lib/website-builder/site-pages"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

export type SiteSearchParams = Record<string, string | string[] | undefined>

function paramsToSearch(sp: SiteSearchParams | undefined): URLSearchParams {
  return new URLSearchParams(
    Object.entries(sp ?? {}).flatMap(([k, v]) =>
      v === undefined ? [] : Array.isArray(v) ? v.map((x) => [k, x] as [string, string]) : [[k, v] as [string, string]],
    ),
  )
}

export async function siteMetadata(
  username: string,
  searchParams: SiteSearchParams | undefined,
  pageKey = "home",
  /** Set when this is the preview route, which has the token in its path. */
  previewToken: string | null = null,
): Promise<Metadata> {
  /**
   * A PREVIEW IS NOT FOR SEARCH ENGINES. The link is shared with a person,
   * and the page behind it is by definition not the one the creator has
   * decided on. Checked on the SHAPE of the token, not against the database:
   * the answer is the same either way, and it keeps a lookup out of here.
   */
  if (previewToken !== null || previewTokenFrom(paramsToSearch(searchParams)) !== null) {
    return { title: "Preview", robots: { index: false, follow: false } }
  }

  /**
   * THE ADMIN CLIENT, NOT THE VIEWER'S. A published site's title, description
   * and favicon are the same for everybody, and reading them through the
   * viewer's client meant calling `cookies()` — which makes the whole route
   * dynamic and uncacheable no matter what else it does. Nothing here is
   * per-viewer, so nothing here needs to know who is asking.
   */
  const supabase = createAdminClient()

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
  const siteTitle = typeof settings.seo_title === "string" && settings.seo_title.trim()
    ? settings.seo_title.trim()
    : `${defaultHandle} | Storelib`
  const brand = typeof settings.brand_name === "string" && settings.brand_name
    ? settings.brand_name
    : defaultHandle
  /**
   * A sub-page says which page it is first. The site's own SEO title is one
   * title for the whole site, and using it unchanged on five pages gives a
   * visitor five identical tabs and a search engine five identical results.
   */
  const rawTitle = pageKey === "home" ? siteTitle : `${pageTitleFromKey(pageKey)} | ${brand}`
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
export async function renderSite(
  username: string,
  searchParams: SiteSearchParams | undefined,
  pageKey = "home",
  /** Set when this is the preview route, which has the token in its path. */
  previewToken: string | null = null,
) {
  /**
   * `?preview=` is still read, so links already shared keep working, but the
   * preview has an address of its own now: `/preview/<token>`. The public
   * routes read no query string at all, which is what lets them be cached
   * for everybody rather than rendered for each visitor.
   */
  const wantedToken = previewToken ?? previewTokenFrom(paramsToSearch(searchParams))
  if (wantedToken) return await previewPage(username, wantedToken, pageKey)

  const found = await publishedSiteByName(username, pageKey)
  if (found.kind === "renamed") redirect(`https://${found.to}.${getMainDomain()}`)
  if (found.kind === "missing") notFound()
  // Nothing published: the creator page, which always exists for a creator.
  if (found.kind === "unpublished") redirect(`https://${getMainDomain()}/${username.toLowerCase()}`)

  const { site } = found
  const template = templateForPage(pageKey)
  return (
    <StorelibSourcesProvider prerendered={site.prerendered} page={{ template }}>
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

/**
 * The draft, for whoever holds the link. Uncached and unshared: it reads the
 * install directly so the token can be compared against it, in constant
 * time. A wrong token renders the published site and says nothing about
 * whether a link exists.
 */
async function previewPage(username: string, token: string, pageKey: string) {
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
    .eq("page_key", pageKey)
    .maybeSingle()

  // A page the creator has not made is not a page, even with the link.
  if (!pageData && pageKey !== "home") notFound()

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
  const template = templateForPage(pageKey)
  const prerendered = await prerenderStorelibSections(admin as never, row.id, sections, themeSettings, template, products)

  return (
    <StorelibSourcesProvider prerendered={prerendered} page={{ template }}>
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
