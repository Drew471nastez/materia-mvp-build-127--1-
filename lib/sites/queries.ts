import "server-only"

/**
 * Reading a published Site, for the public route.
 *
 * WHY THE ADMIN CLIENT. `store_theme_*` is RLS'd to the owning creator, so an
 * anonymous visitor can read none of it. The existing `/w/{username}` route
 * solves this the same way — `createAdminClient()` and a filter — and there is
 * no safer option short of a second set of policies that would then have to
 * stay in step with the first.
 *
 * That makes the filter the security boundary, so it is written once, here,
 * and every query in this file goes through it:
 *
 *     status = 'published'  AND  kind = 'site'
 *
 * Drop either half and this becomes a way to read anybody's drafts by
 * guessing a slug. The Sites test suite asserts both are present.
 *
 * AND NEVER `draft_sections`. The storefront route falls back to them when a
 * page has never been published, which shows the owner their work — and also
 * shows every visitor unpublished edits. A Site serves what was published or
 * it serves nothing.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import type { PublishedSite, Site, SitePage } from "./types"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

/** Supabase returns an embedded one-to-one as either an object or a 1-element array. */
function firstOf<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value ?? undefined
}

interface InstallRow {
  id: string
  creator_id: string
  theme_id: string
  kind: string
  name: string
  slug: string | null
  status: string
  settings: unknown
  published_version_id: string | null
  published_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
  store_theme_settings?: { settings: unknown } | Array<{ settings: unknown }> | null
}

function toSite(row: InstallRow): Site {
  return {
    id: row.id,
    creatorId: row.creator_id,
    themeId: row.theme_id,
    kind: row.kind === "site" ? "site" : "storefront",
    name: row.name,
    slug: row.slug,
    status: (row.status as Site["status"]) ?? "draft",
    settings: (row.settings as Site["settings"]) ?? {},
    publishedVersionId: row.published_version_id,
    publishedAt: row.published_at,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

interface PageRow {
  id: string
  install_id: string
  page_key: string
  title: string | null
  seo: unknown
  sort_order: number
  is_homepage: boolean
  sections: unknown
}

function toPage(row: PageRow): SitePage {
  return {
    id: row.id,
    installId: row.install_id,
    key: row.page_key,
    // A page saved before titles existed falls back to its key, which is at
    // least the thing in the address bar rather than a blank tab.
    title: row.title || row.page_key,
    seo: (row.seo as SitePage["seo"]) ?? {},
    sortOrder: row.sort_order ?? 0,
    isHomepage: !!row.is_homepage,
    sections: (row.sections as SectionInstance[]) ?? [],
    draftSections: null,
  }
}

/**
 * One published page of one published site, plus what the page needs around it.
 *
 * @param slug the subdomain label — `{slug}.storelib.site`
 * @param pageKey the page's slug, or undefined for the homepage
 */
export async function getPublishedSitePage(
  slug: string,
  pageKey?: string,
): Promise<PublishedSite | null> {
  if (!slug) return null
  const admin = createAdminClient()

  const { data: installRow } = await admin
    .from("store_theme_installs")
    .select(
      `id, creator_id, theme_id, kind, name, slug, status, settings,
       published_version_id, published_at, sort_order, created_at, updated_at,
       store_theme_settings ( settings )`,
    )
    .eq("slug", slug.toLowerCase())
    .eq("status", "published")
    .eq("kind", "site")
    .maybeSingle()

  if (!installRow) return null
  const site = toSite(installRow as InstallRow)

  // Every page of this site: one query, used for the requested page and for
  // navigation. A second round trip per menu item is how a static page stops
  // being cheap to build.
  const { data: pageRows } = await admin
    .from("store_theme_pages")
    .select("id, install_id, page_key, title, seo, sort_order, is_homepage, sections")
    .eq("install_id", site.id)
    .order("sort_order", { ascending: true })

  const pages = (pageRows ?? []) as PageRow[]
  if (pages.length === 0) return null

  const wanted = pageKey
    ? pages.find((p) => p.page_key === pageKey)
    : (pages.find((p) => p.is_homepage) ?? pages.find((p) => p.page_key === "home"))

  if (!wanted) return null

  const theme =
    (firstOf(installRow.store_theme_settings)?.settings as ThemeSettingsValues) ?? {}

  return {
    site,
    theme,
    page: toPage(wanted),
    pages: pages.map((p) => ({
      key: p.page_key,
      title: p.title || p.page_key,
      sortOrder: p.sort_order ?? 0,
      isHomepage: !!p.is_homepage,
    })),
  }
}

/**
 * Every published Site slug, for `generateStaticParams`.
 *
 * Bounded on purpose. `generateStaticParams` runs at build time and a project
 * with fifty thousand sites should not try to prerender all of them into one
 * deploy — the rest are rendered on first request and cached from then on,
 * which is what `dynamicParams` is for.
 */
export async function getPublishedSiteSlugs(limit = 500): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("store_theme_installs")
    .select("slug")
    .eq("status", "published")
    .eq("kind", "site")
    .not("slug", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit)

  return (data ?? []).map((row: { slug: string | null }) => row.slug).filter((s): s is string => !!s)
}
