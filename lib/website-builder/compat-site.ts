/**
 * ===========================================================================
 *  THE LIVE SITE OF AN IMPORTED SHOPIFY THEME: WHAT IT IS DRAWN FROM
 * ===========================================================================
 * The creator's published install (its files, its theme settings, its
 * pages) and their shop (products, collections, menus), read here and handed
 * to lib/storelib-theme/compat/site.ts, which answers the request. The proxy
 * sends a site's addresses here when its published install is an imported
 * theme (proxy.ts, compatSiteFor).
 *
 * THE FILES ARE HELD IN MEMORY, per install and per publish. A theme is a
 * few megabytes of text, read once after each publish rather than per
 * visitor; the parsed templates are held with them (CompatTheme's own cache),
 * so a page is drawn without parsing anything. A preview reads the drafts
 * and holds nothing.
 */
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { creatorByName, creatorShopTag, siteCatalogue } from "@/lib/website-builder/published-site"
import { siteCollections } from "@/lib/website-builder/storefront-collections-server"
import { storeMenusOrNull } from "@/lib/website-builder/store-menus-server"
import { mayPreview, pageSections, themeSettings as themeSettingsOf } from "@/lib/website-builder/preview-link"
import { sanitizeRichText } from "@/lib/website-builder/sanitize"
import { assetAddresses, compatOf } from "@/lib/storelib-theme/compat/install"
import { drawPage, themeOfInstall, type StoredSection } from "@/lib/storelib-theme/compat/page"
import type { SiteData } from "@/lib/storelib-theme/compat/site"
import type { CompatTheme } from "@/lib/storelib-theme/compat/theme"
import type { CollectionLike } from "@/lib/storelib-theme/compat/objects"
import { compatMenus } from "@/lib/storelib-theme/compat/menus"

type Admin = ReturnType<typeof createAdminClient>
type Row = { path: string; content: string | null; draft_content?: string | null }

/** Where a theme's own files are served from, on the site and in the builder alike. */
export function themeAssetUrl(installId: string, version: string, name: string): string {
  return `/api/site-theme/assets/${installId}/${encodeURIComponent(version)}/${encodeURIComponent(name)}`
}

/** Every file of an install: the live half, or for a preview and the builder, the draft where there is one. */
export async function installFiles(admin: Admin, installId: string, draft: boolean): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const page = 1000
  for (let from = 0; from < 20_000; from += page) {
    const table = () => admin.from("store_theme_custom_files")
    let res: { data: unknown; error: unknown } = draft
      ? await table().select("path, content, draft_content").eq("install_id", installId).order("path").range(from, from + page - 1)
      : await table().select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
    /* Before the file drafts SQL there is no draft column: the live half. */
    if (res.error && draft) res = await table().select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
    const rows = (res.data ?? []) as Row[]
    for (const r of rows) {
      const text = draft ? (r.draft_content ?? r.content) : r.content
      if (typeof text === "string" && text !== "") out[r.path] = text
    }
    if (rows.length < page) break
  }
  return out
}

/** The theme an install draws, with its assets where they are served from. */
export function compatThemeFor(installId: string, version: string, rows: Record<string, string>, settings: unknown): CompatTheme {
  const media = assetAddresses(rows)
  return themeOfInstall(rows, settings, {
    assetUrl: (name) => media[name] ?? themeAssetUrl(installId, version, name),
    assetText: (name) => rows[`shopify/assets/${name}`] ?? null,
    imageUrl: (v) => (/^https?:\/\//.test(v) || v.startsWith("/") ? v : ""),
  })
}

interface Held {
  version: string
  rows: Record<string, string>
  theme: CompatTheme
}
const held = new Map<string, Held>()
const HELD_MAX = 12

function holdTheme(installId: string, version: string, rows: Record<string, string>, settings: unknown): CompatTheme {
  const key = `${installId}:${version}:${JSON.stringify(settings).length}`
  const hit = held.get(key)
  if (hit) return hit.theme
  const theme = compatThemeFor(installId, version, rows, settings)
  if (held.size >= HELD_MAX) held.delete(held.keys().next().value as string)
  held.set(key, { version, rows, theme })
  return theme
}

const rowsHeld = new Map<string, Record<string, string>>()

const collectionsOf = (creatorId: string) =>
  unstable_cache(
    async (): Promise<CollectionLike[]> => {
      const { collections } = await siteCollections(createAdminClient(), creatorId)
      return Object.values(collections).map((c) => ({ id: c.id, title: c.title, handle: c.handle, description: c.description, image: c.image, url: c.url, products_count: c.products_count, products: c.products }))
    },
    ["compat-collections", creatorId],
    { tags: [creatorShopTag(creatorId)], revalidate: 60 },
  )()

export type CompatLookup = { kind: "site"; site: SiteData } | { kind: "missing" }

/**
 * The site for a name, when its published install is an imported theme.
 * `previewToken` reads the drafts, when it is the install's own token.
 */
export async function compatSiteByName(name: string, host: string, previewToken: string | null = null): Promise<CompatLookup> {
  const creator = await creatorByName(name)
  if (!creator) return { kind: "missing" }
  const admin = createAdminClient()
  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, published_at, preview_token, store_theme_settings ( settings, draft_settings )")
    .eq("creator_id", creator.creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!install) return { kind: "missing" }
  const row = install as { id: string; published_at?: string | null; preview_token?: string | null; store_theme_settings?: unknown }
  const draft = previewToken !== null && mayPreview(row.preview_token, previewToken)
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const settings = themeSettingsOf(settingsRow as never, draft) ?? {}
  if (!compatOf(settings)) return { kind: "missing" }

  const version = draft ? `draft-${Date.now()}` : String(row.published_at ?? "1").replace(/[^0-9A-Za-z]/g, "")
  const rowsKey = `${row.id}:${version}`
  let rows = draft ? null : rowsHeld.get(rowsKey) ?? null
  const [pageRows, products, collections, menus] = await Promise.all([
    admin.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", row.id),
    siteCatalogue(creator.creatorId, { cached: !draft }),
    collectionsOf(creator.creatorId),
    storeMenusOrNull(admin, creator.creatorId),
    rows ? Promise.resolve() : installFiles(admin, row.id, draft).then((r) => { rows = r }),
  ])
  if (!rows) return { kind: "missing" }
  if (!draft) {
    if (rowsHeld.size >= HELD_MAX) rowsHeld.delete(rowsHeld.keys().next().value as string)
    rowsHeld.set(rowsKey, rows)
  }
  const pages: Record<string, StoredSection[]> = {}
  for (const p of (pageRows.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]) {
    const list = pageSections<StoredSection[]>(p as never, draft)
    if (Array.isArray(list) && list.length) pages[p.page_key] = list
  }
  const theme = draft ? compatThemeFor(row.id, version, rows, settings) : holdTheme(row.id, version, rows, settings)

  const site: SiteData = {
    creatorId: creator.creatorId,
    theme,
    pages,
    products,
    collections,
    menus: compatMenus(menus as never, Object.keys(pages)),
    shop: { name: creator.displayName, currency: "USD", moneyFormat: "${{amount}}" },
    host,
    designMode: false,
    product: async (handle) => {
      const card = products.find((p) => p.settings.slug === handle || p.id === handle)
      if (!card) return null
      const { data } = await admin.from("products").select("description").eq("id", card.id).eq("creator_id", creator.creatorId).eq("status", "published").maybeSingle()
      const raw = (data as { description?: string | null } | null)?.description ?? ""
      const descriptionHtml = /<[a-z][\s\S]*>/i.test(raw) ? sanitizeRichText(raw) : raw.split(/\n{2,}/).filter(Boolean).map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`).join("")
      return { ...card, descriptionHtml }
    },
    extraBodyEnd: draft ? `<div style="position:fixed;left:12px;bottom:12px;z-index:2147483647;background:#1a1a2e;color:#fff;font:600 12px/1 Inter,system-ui,sans-serif;padding:8px 10px;border-radius:8px">Preview: changes not yet published</div>` : undefined,
  }
  return { kind: "site", site }
}

/** Whether an install is an imported theme, by its draft settings or its live ones. For callers that hold only its id. */
export async function isCompatInstall(installId: string): Promise<boolean> {
  try {
    const { data } = await createAdminClient().from("store_theme_settings").select("live:settings->compat->>kind, draft:draft_settings->compat->>kind").eq("install_id", installId).maybeSingle()
    const row = data as { live?: string | null; draft?: string | null } | null
    return row?.live === "shopify" || row?.draft === "shopify"
  } catch {
    return false
  }
}

/**
 * The home page of an install as it stands in the builder (drafts first),
 * drawn whole with the theme's scripts: what the website's cover picture is
 * photographed from (app/api/site-theme/cover/[pass]).
 */
export async function compatDraftHome(installId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: install } = await admin
    .from("store_theme_installs")
    .select("id, creator_id, name, store_theme_settings ( settings, draft_settings )")
    .eq("id", installId)
    .maybeSingle()
  if (!install) return null
  const row = install as { id: string; creator_id: string; name?: string | null; store_theme_settings?: unknown }
  const settingsRow = Array.isArray(row.store_theme_settings) ? (row.store_theme_settings[0] ?? null) : (row.store_theme_settings ?? null)
  const settings = themeSettingsOf(settingsRow as never, true) ?? {}
  if (!compatOf(settings)) return null
  const [rows, pageRow, products, collections, menus] = await Promise.all([
    installFiles(admin, row.id, true),
    admin.from("store_theme_pages").select("sections, draft_sections").eq("install_id", row.id).eq("page_key", "home").maybeSingle(),
    siteCatalogue(row.creator_id, { cached: false }),
    collectionsOf(row.creator_id),
    storeMenusOrNull(admin, row.creator_id),
  ])
  const sections = pageSections<StoredSection[]>(pageRow.data as never, true) ?? []
  const theme = compatThemeFor(row.id, "edit", rows, settings)
  return drawPage(theme, {
    template: "index",
    path: "/",
    designMode: false,
    products,
    collections,
    menus: compatMenus(menus as never, ["home"]),
    shop: { name: row.name ?? "", currency: "USD", moneyFormat: "${{amount}}" },
  }, sections, { scripts: true }).html
}
