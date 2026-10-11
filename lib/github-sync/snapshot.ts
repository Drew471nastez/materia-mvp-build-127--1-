/**
 * ===========================================================================
 *  A SITE'S WHOLE THEME, AS FILES IN ITS REPOSITORY
 * ===========================================================================
 * What a linked repository holds, built the way "Export theme" builds the
 * package (app/api/website-builder/themes/[installId]/export), from what the
 * builder shows: every draft where there is one.
 *
 *   A Storelib theme    config/settings.json, templates/<page>.json, the
 *                       header, footer and overlay groups, every section and
 *                       block file (the theme's own and the creator's)
 *   An imported Shopify theme
 *                       its own folders and names (layout, templates,
 *                       sections, blocks, snippets, config, locales, assets),
 *                       through lib/storelib-theme/compat/export.ts
 *
 * Text only. A picture stays where the site serves it from, and a setting
 * keeps its address, so nothing in the repository is a copy that can go
 * stale. The export route rewrites addresses into the package's own assets;
 * a repository is not a package to carry somewhere else.
 */
import "server-only"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { compatOf } from "@/lib/storelib-theme/compat/install"
import { exportShopifyTheme } from "@/lib/storelib-theme/compat/export"
import type { StoredSection } from "@/lib/storelib-theme/compat/page"
import { installFiles } from "@/lib/website-builder/compat-site"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { packageFilesFromPages } from "@/lib/website-builder/theme-pages"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import type { SectionInstance } from "@/lib/website-builder/types"
import { codeFile } from "./core"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SiteSnapshot {
  kind: "storelib" | "shopify"
  /** Repository paths (before the link's folder) to text. */
  files: Record<string, string>
  /** The theme settings, draft first. */
  settings: Record<string, unknown>
  /** Every page, draft first, as the database holds it. */
  pages: { page_key: string; sections: SectionInstance[] }[]
  /** The builder's files, draft first, by their builder path. */
  rows: Record<string, string>
}

/** A JSON file's text as the repository holds it, so two writes of the same value are the same bytes. */
export function jsonFile(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function siteSnapshot(db: Db, installId: string): Promise<SiteSnapshot> {
  const [settingsRes, pagesRes, rows] = await Promise.all([
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
    installFiles(db as never, installId, true),
  ])
  if (settingsRes.error || pagesRes.error) throw new Error("Could not read this website's theme")
  const settingsRow = settingsRes.data as { settings?: unknown; draft_settings?: unknown } | null
  const settings = ((settingsRow?.draft_settings ?? settingsRow?.settings ?? {}) || {}) as Record<string, unknown>
  const pages = ((pagesRes.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[]).map((p) => ({
    page_key: String(p.page_key),
    sections: (Array.isArray(p.draft_sections) ? p.draft_sections : Array.isArray(p.sections) ? p.sections : []) as SectionInstance[],
  }))

  if (compatOf(settings)) {
    const out = exportShopifyTheme(rows, settings, Object.fromEntries(pages.map((p) => [p.page_key, p.sections as unknown as StoredSection[]])))
    const files: Record<string, string> = {}
    for (const [path, body] of Object.entries(out.files)) if (typeof body === "string") files[path] = body
    return { kind: "shopify", files, settings, pages, rows }
  }

  const files: Record<string, string> = {}
  for (const [path, source] of Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)) if (codeFile(path)) files[path] = rows[path] ?? source
  for (const [path, source] of Object.entries(rows)) if (codeFile(path)) files[path] = source
  files["config/settings.json"] = jsonFile(settings)
  /* The header and footer once, in their group files, as the export writes them. */
  const kinds = kindLookup(files, SECTION_SCHEMAS as never)
  Object.assign(
    files,
    packageFilesFromPages(pages.map((p) => ({ page_key: p.page_key, sections: repairChrome(p.sections, kinds).sections }))),
  )
  return { kind: "storelib", files, settings, pages, rows }
}
