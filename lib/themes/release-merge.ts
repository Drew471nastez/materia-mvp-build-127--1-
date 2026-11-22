/**
 * ===========================================================================
 *  AN UPDATE, MERGED: THE NEW THEME'S CODE, THE CREATOR'S OWN CONTENT
 * ===========================================================================
 * A creator presses Update on a website made from a marketplace theme. The
 * result is a NEW draft website: this module works out what goes into it,
 * from the website as it stands and the theme at its newest release. The
 * website it was made from is only read, never written, so the live site
 * and the rollback are the same untouched website.
 *
 * What an installed theme holds (lib/storelib-theme/compat/install.ts), and
 * what each part becomes:
 *
 *   the creator's content, kept as it is
 *     store_theme_settings     settings and draft_settings: the theme's
 *                              values (settings_data.json's `current`) with
 *                              the new release's defaults under them, for
 *                              settings the new version adds
 *     store_theme_pages        every page, sections and draft_sections as
 *                              they are (templates/*.json and the section
 *                              groups, as the builder edits them). A page the
 *                              new version adds that the website lacks comes
 *                              in, drawn with the creator's own header,
 *                              footer and overlay
 *     shopify/templates/*.json, shopify/sections/*.json,
 *     shopify/config/settings_data.json
 *                              the theme's own copies of the same: kept, and
 *                              added only where the website has none
 *     shopify/config/assets.json
 *                              the new version's pictures, with every name
 *                              the creator added kept
 *     menus and media          the store's, not the website's: untouched
 *
 *   the theme's code, replaced unless the creator changed it
 *     sections, blocks, snippets, layout (.storelib), shopify/assets/*,
 *     shopify/locales/*, shopify/config/settings_schema.json and every other
 *     theme file. A file the creator EDITED is kept as theirs and reported:
 *     it has an unpublished draft, a save in its history, or (for a website
 *     whose version is known) text no release of the theme ever shipped. A
 *     file only the creator has is kept and reported as theirs. A theme file
 *     the new version no longer has is kept, so no page loses a section.
 *
 *   derived, always the new version's
 *     shopify/config/settings_panel.json, shopify/import-report.json
 *
 * Pure: no database, no storage. tests/theme-releases.test.ts runs it.
 */
import { createHash } from "node:crypto"

export const ASSET_MAP_FILE = "shopify/config/assets.json"
const DERIVED = new Set(["shopify/config/settings_panel.json", "shopify/import-report.json"])
const CONTENT = [/^shopify\/templates\/.+\.json$/, /^shopify\/sections\/[^/]+\.json$/, /^shopify\/config\/settings_data\.json$/]
const CHROME = new Set(["header", "footer", "overlay"])

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")

/** A file that is the creator's content, never replaced by an update. */
export function isContentFile(path: string): boolean {
  return CONTENT.some((r) => r.test(path))
}

/** A file an update writes fresh every time, whatever the website had. */
export function isDerivedFile(path: string): boolean {
  return DERIVED.has(path) || path === ASSET_MAP_FILE
}

/** A file of the theme's code: what a release's manifest hashes. */
export function isThemeCodeFile(path: string): boolean {
  return !isContentFile(path) && !isDerivedFile(path)
}

/** Every code file's hash, the release's manifest. */
export function manifestOf(files: Record<string, string>, hash: (t: string) => string = sha256): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, text] of Object.entries(files)) if (isThemeCodeFile(path)) out[path] = hash(text)
  return out
}

/** The hashes each path has had in any of these manifests. */
export function shippedHashes(manifests: readonly Record<string, string>[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const m of manifests) {
    for (const [path, h] of Object.entries(m ?? {})) {
      if (typeof h !== "string") continue
      const list = (out[path] ??= [])
      if (!list.includes(h)) list.push(h)
    }
  }
  return out
}

export interface FileRow {
  path: string
  content: string
  draft_content?: string | null
}
export interface PageRow {
  page_key: string
  sections: unknown
  draft_sections?: unknown
}
type Section = { group?: unknown } & Record<string, unknown>

export interface NextTheme {
  /** The converted theme's text files, by stored path (convertShopifyTheme's `files`). */
  files: Record<string, string>
  pages: { page_key: string; sections: unknown[] }[]
  settings: { compat: Record<string, unknown>; shopify: Record<string, unknown> }
}

export interface MergeInput {
  current: { files: FileRow[]; settings: unknown; draftSettings: unknown; pages: PageRow[] }
  next: NextTheme
  version: string
  /**
   * What the theme has shipped at each path, from release manifests. Used
   * only when the website's own version is known; for a website added before
   * releases were kept, Storelib cannot know which text it started with, so
   * a file counts as edited only by its draft or its saved history.
   */
  shipped: Record<string, string[]> | null
  /** Paths with a save in store_theme_file_versions. Null when that table could not be read. */
  savedPaths: ReadonlySet<string> | null
  /** The new version's pictures, by name, already stored under the creator's account. */
  assetUrls?: Record<string, string>
  hash?: (text: string) => string
}

export type KeptReason = "edited" | "yours"

export interface MergeResult {
  files: FileRow[]
  settings: Record<string, unknown>
  draftSettings: Record<string, unknown> | null
  pages: PageRow[]
  /** Files kept as the creator's, with why: they edited it, or only they have it. */
  kept: { path: string; why: KeptReason }[]
  /** Theme files the new version no longer has, kept so nothing a page draws goes missing. */
  retired: string[]
  /** Theme files that changed, now the new version's. */
  updated: string[]
  /** Files the new version adds. */
  added: string[]
  /** Pages the new version adds. */
  newPages: string[]
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {})

function parseMap(text: string | undefined): Record<string, string> {
  if (!text) return {}
  try {
    const v = JSON.parse(text)
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** The creator's values over the new version's defaults; the new version's own record of itself; the website's address and version. */
export function mergeSettings(current: unknown, next: NextTheme["settings"], version: string): Record<string, unknown> {
  const cur = obj(current)
  const curCompat = obj(cur.compat)
  const compat: Record<string, unknown> = { ...curCompat, ...next.compat, release: version }
  if (typeof curCompat.listing === "string") compat.listing = curCompat.listing
  return { ...cur, compat, shopify: { ...obj(next.shopify), ...obj(cur.shopify) } }
}

/** A page the new version adds, drawn with the creator's own header, footer and overlay when the website has a home page. */
function pageWithOwnChrome(sections: unknown[], home: PageRow | undefined): unknown[] {
  const own = home ? ((home.draft_sections ?? home.sections) as unknown) : null
  if (!Array.isArray(own)) return sections
  const chrome = (part: string) => own.filter((s) => obj(s).group === part)
  const body = sections.filter((s) => !CHROME.has(String((s as Section)?.group ?? "")))
  return [...chrome("header"), ...body, ...chrome("footer"), ...chrome("overlay")]
}

export function mergeThemeUpdate(input: MergeInput): MergeResult {
  const hash = input.hash ?? sha256
  const { current, next } = input
  const mine = new Map(current.files.map((f) => [f.path, f]))
  const kept: MergeResult["kept"] = []
  const retired: string[] = []
  const updated: string[] = []
  const added: string[] = []
  const out: FileRow[] = []

  /*
    EDITED BY THE CREATOR: an unpublished draft, or a save in the file's
    history. For a website whose version is known, also text that no release
    ever shipped at that path. A website added before releases were kept has
    no such record, so only its drafts and history speak for it; the website
    it was copied from keeps every file whatever happens.
  */
  const edited = (row: FileRow): boolean => {
    if (typeof row.draft_content === "string" && row.draft_content !== row.content) return true
    if (input.savedPaths?.has(row.path)) return true
    if (!input.shipped) return false
    const known = input.shipped[row.path]
    if (!known) return next.files[row.path] !== undefined && next.files[row.path] !== row.content
    return !known.includes(hash(row.content))
  }
  /* A file of the theme's, rather than one the creator made: in a release, or (version unknown) with no draft and no history. */
  const theThemes = (row: FileRow): boolean =>
    input.shipped ? !!input.shipped[row.path] : !input.savedPaths?.has(row.path) && !(typeof row.draft_content === "string" && row.draft_content !== row.content)

  for (const [path, text] of Object.entries(next.files)) {
    if (isDerivedFile(path)) continue
    const row = mine.get(path)
    if (isContentFile(path)) {
      if (row) out.push({ path, content: row.content, draft_content: row.draft_content ?? null })
      else {
        out.push({ path, content: text, draft_content: null })
        added.push(path)
      }
      continue
    }
    if (!row) {
      out.push({ path, content: text, draft_content: null })
      added.push(path)
    } else if (edited(row)) {
      out.push({ path, content: row.content, draft_content: row.draft_content ?? null })
      kept.push({ path, why: "edited" })
    } else {
      out.push({ path, content: text, draft_content: null })
      if (row.content !== text) updated.push(path)
    }
  }

  for (const row of current.files) {
    if (next.files[row.path] !== undefined || isDerivedFile(row.path)) continue
    out.push({ path: row.path, content: row.content, draft_content: row.draft_content ?? null })
    if (isContentFile(row.path)) continue
    if (!theThemes(row)) kept.push({ path: row.path, why: "yours" })
    else if (edited(row)) kept.push({ path: row.path, why: "edited" })
    else retired.push(row.path)
  }

  /* Derived files: the new version's, and the pictures' map with every name the creator added kept. */
  for (const path of DERIVED) if (next.files[path] !== undefined) out.push({ path, content: next.files[path], draft_content: null })
  const assets = { ...parseMap(mine.get(ASSET_MAP_FILE)?.content), ...parseMap(next.files[ASSET_MAP_FILE]), ...(input.assetUrls ?? {}) }
  if (Object.keys(assets).length || mine.has(ASSET_MAP_FILE) || next.files[ASSET_MAP_FILE] !== undefined) {
    out.push({ path: ASSET_MAP_FILE, content: JSON.stringify(assets, null, 2), draft_content: null })
  }

  const pages: PageRow[] = current.pages.map((p) => ({ page_key: p.page_key, sections: p.sections, draft_sections: p.draft_sections ?? null }))
  const have = new Set(pages.map((p) => p.page_key))
  const home = current.pages.find((p) => p.page_key === "home")
  const newPages: string[] = []
  for (const p of next.pages) {
    if (have.has(p.page_key)) continue
    pages.push({ page_key: p.page_key, sections: pageWithOwnChrome(p.sections, home), draft_sections: null })
    have.add(p.page_key)
    newPages.push(p.page_key)
  }

  return {
    files: out,
    settings: mergeSettings(current.settings, next.settings, input.version),
    draftSettings: current.draftSettings && typeof current.draftSettings === "object" ? mergeSettings(current.draftSettings, next.settings, input.version) : null,
    pages,
    kept: kept.sort((a, b) => a.path.localeCompare(b.path)),
    retired: retired.sort(),
    updated: updated.sort(),
    added: added.sort(),
    newPages,
  }
}
