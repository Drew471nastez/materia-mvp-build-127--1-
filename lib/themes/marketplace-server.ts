import "server-only"

/**
 * ===========================================================================
 *  THE THEME MARKETPLACE ON THE SERVER
 * ===========================================================================
 * Reads the listings (cached under MARKETPLACE_TAG, so an admin change is on
 * the library and the marketplace on the next request), checks an uploaded
 * zip, and keeps what the live preview draws.
 *
 * A ZIP IS CHECKED THREE TIMES AND NEVER RUN. zip-rules.ts reads each name
 * (traversal, absolute paths, links, kinds, count); the central upload check
 * reads the archive's own directory (bombs, blocked types); then the import
 * pipeline parses it exactly as a creator's import would (readPackage,
 * convertShopifyTheme or the export manifest). Nothing is written to a disk
 * and nothing in it is evaluated: a .storelib file is compiled to a
 * template, Liquid is converted as text, and both only ever render in a
 * visitor's browser.
 *
 * Before part 252 runs there is no table: every read answers the templates
 * listed from code alone and `missing: true`, and the admin page says to run it.
 */
import { randomUUID } from "node:crypto"
import JSZip from "jszip"
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"
import { inspectUpload } from "@/lib/security/uploads/inspect"
import { nodeInflateRaw } from "@/lib/security/uploads/zip-inflate"
import { IMPORT_BUCKET, IMPORT_NOT_A_PACKAGE, looksLikeZip } from "@/lib/website-builder/theme-import"
import { readPackage } from "@/lib/storelib-theme"
import { convertShopifyTheme, isShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { kindLookup, repairChrome } from "@/lib/storelib-theme/section-groups"
import { packageThemeConfig } from "@/lib/storelib-theme/theme-config"
import { pagesFromPackageFiles } from "@/lib/website-builder/theme-pages"
import { parseThemePackageManifest } from "@/lib/website-builder/theme-package-schema"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ownSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"

import {
  MARKETPLACE_TAG,
  MARKETPLACE_PATH,
  THEME_TIERS,
  mergeListings,
  type ThemeListing,
  type ThemePackageKind,
  type ThemeTier,
} from "./marketplace-shared"
import { checkThemeZipEntries, checkThemeZipSize } from "./zip-rules"

export const LISTINGS_TABLE = "theme_marketplace_listings"
export const LISTING_COLUMNS =
  "id, slug, name, author_name, author_avatar_url, category, tier, price_cents, cover_url, screenshots, package_path, package_kind, builtin_theme_id, demo_url, published, sort_order, created_at, updated_at"
/** With the description and phone cover RUN_THEME_RELEASES.sql adds; read with LISTING_COLUMNS as the fallback until it runs. */
export const LISTING_COLUMNS_FULL = `${LISTING_COLUMNS}, description, phone_cover_url`

/** A column RUN_THEME_RELEASES.sql adds, not there yet. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204" || /description|phone_cover_url/.test(error.message ?? ""))
}

/** Packages wait in the private bucket the creator import uses, under a folder of their own. */
export const PACKAGE_BUCKET = IMPORT_BUCKET
/** Covers, screenshots and avatars: the public bucket website pictures are served from. */
export const MEDIA_BUCKET = "store-builder-images"

export const packagePathFor = (listingId: string) => `theme-marketplace/${listingId}/${randomUUID()}.zip`
export const previewPathFor = (listingId: string) => `theme-marketplace/${listingId}/preview.json`
export const PACKAGE_PATH_RE = /^theme-marketplace\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.zip$/i

export type ListingRow = {
  id: string
  slug: string
  name: string
  author_name: string | null
  author_avatar_url: string | null
  category: string | null
  tier: string | null
  price_cents: number | null
  cover_url: string | null
  screenshots: string[] | null
  package_path: string | null
  package_kind: string | null
  builtin_theme_id: string | null
  demo_url: string | null
  published: boolean | null
  sort_order: number | null
  created_at: string | null
  updated_at?: string | null
  description?: string | null
  phone_cover_url?: string | null
}

export function rowToListing(r: ListingRow): ThemeListing {
  const tier = (THEME_TIERS as readonly string[]).includes(r.tier ?? "") ? (r.tier as ThemeTier) : "free"
  const kind = r.package_kind === "storelib" || r.package_kind === "shopify" || r.package_kind === "export" ? (r.package_kind as ThemePackageKind) : null
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    author: r.author_name?.trim() || "Storelib",
    authorAvatar: r.author_avatar_url || null,
    category: r.category || "general",
    tier,
    priceCents: tier === "paid" ? Math.max(0, r.price_cents ?? 0) : 0,
    cover: r.cover_url || null,
    screenshots: withPhoneCover(r.cover_url, r.phone_cover_url ?? null, (r.screenshots ?? []).filter((s) => typeof s === "string" && s.length > 0)),
    description: r.description?.trim() || null,
    phoneCover: r.phone_cover_url || null,
    builtinThemeId: r.builtin_theme_id || null,
    codePackage: null,
    hasPackage: !!r.package_path,
    packageKind: kind,
    demoUrl: r.demo_url || null,
    published: !!r.published,
    sortOrder: r.sort_order ?? 0,
    createdAt: r.created_at ?? new Date(0).toISOString(),
  }
}

/**
 * The pictures in the order the preview frames read them: the desktop cover
 * first and the phone's second (theme-detail.tsx reads screenshots[1] as the
 * phone's), then the rest.
 */
function withPhoneCover(cover: string | null, phone: string | null, shots: string[]): string[] {
  if (!phone) return shots
  const desktop = cover ?? shots.find((s) => s !== phone) ?? null
  return [...(desktop ? [desktop] : []), phone, ...shots.filter((s) => s !== phone && s !== desktop)]
}

/** A table that is not there yet, or a column not added yet: the SQL has not run. */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "42703" || /does not exist|schema cache/i.test(error.message ?? "")
}

export async function readListingRows(opts: { includeHidden?: boolean } = {}): Promise<{ rows: ListingRow[]; missing: boolean; failed: boolean }> {
  try {
    const read = (columns: string) => {
      let q = createAdminClient().from(LISTINGS_TABLE).select(columns).order("sort_order", { ascending: true }).limit(500)
      if (!opts.includeHidden) q = q.eq("published", true)
      return q
    }
    let { data, error } = await read(LISTING_COLUMNS_FULL)
    if (isMissingColumn(error)) ({ data, error } = await read(LISTING_COLUMNS))
    if (error) return { rows: [], missing: isMissingRelation(error), failed: !isMissingRelation(error) }
    return { rows: (data ?? []) as unknown as ListingRow[], missing: false, failed: false }
  } catch {
    return { rows: [], missing: false, failed: true }
  }
}

/**
 * Every published listing, Storelib's own templates first unless a row says otherwise.
 * Five minutes in the cache at most, and dropped the moment the admin saves.
 */
export const publishedListings = unstable_cache(
  async (): Promise<ThemeListing[]> => {
    const { rows } = await readListingRows()
    return mergeListings(rows.map(rowToListing))
  },
  ["theme-marketplace-listings-v1"],
  { tags: [MARKETPLACE_TAG], revalidate: 300 },
)

export async function listingBySlug(slug: string): Promise<ThemeListing | null> {
  const all = await publishedListings()
  return all.find((l) => l.slug === slug) ?? null
}

/**
 * The row behind a listing, with the package path the browser never sees.
 * `includeHidden` for Add, which has to know that a template listed from
 * code was hidden by a row before it adds it.
 */
export async function listingRowBySlug(slug: string, opts: { includeHidden?: boolean } = {}): Promise<ListingRow | null> {
  try {
    const read = (columns: string) => {
      let q = createAdminClient().from(LISTINGS_TABLE).select(columns).eq("slug", slug)
      if (!opts.includeHidden) q = q.eq("published", true)
      return q.maybeSingle()
    }
    let { data, error } = await read(LISTING_COLUMNS_FULL)
    if (isMissingColumn(error)) ({ data, error } = await read(LISTING_COLUMNS))
    if (error || !data) return null
    return data as unknown as ListingRow
  } catch {
    return null
  }
}

/** After any admin change: the library page, the marketplace and its theme pages read again. */
export function revalidateMarketplace(slugs: string[] = []): void {
  try {
    revalidateTag(MARKETPLACE_TAG, { expire: 0 })
    revalidatePath(MARKETPLACE_PATH)
    for (const s of slugs) revalidatePath(`${MARKETPLACE_PATH}/${s}`)
    revalidatePath("/app/website-builder")
  } catch {
    /* Outside a request (a script): nothing is cached to drop. */
  }
}

/* ── A zip, checked ──────────────────────────────────────────────────────── */

/** What the live preview draws: the home page, the theme's settings and its own section files. */
export interface ThemePreviewData {
  settings: ThemeSettingsValues
  sections: SectionInstance[]
  sources: Record<string, string>
}

export type ZipVerdict =
  | { ok: true; kind: ThemePackageKind; name: string; files: number; preview: ThemePreviewData | null }
  | { ok: false; error: string; errors?: string[] }

/** A pasted reference to a file in the package, cleared: the preview draws the section's empty state. */
function clearAssetRefs(node: unknown): unknown {
  if (typeof node === "string") return node.startsWith("asset://") || node.startsWith("images/") ? "" : node
  if (Array.isArray(node)) return node.map(clearAssetRefs)
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) out[k] = clearAssetRefs(v)
    return out
  }
  return node
}

/**
 * The checks every zip gets before anything reads it as a theme: the size,
 * the central archive check, then each name (zip-rules.ts). Shared with the
 * releases a template's overlay is uploaded as, which are not whole themes.
 */
export async function checkThemeZipSafety(buf: Buffer): Promise<{ ok: true; zip: JSZip; files: number } | { ok: false; error: string }> {
  const sizeProblem = checkThemeZipSize(buf.byteLength)
  if (sizeProblem) return { ok: false, error: sizeProblem }
  if (!looksLikeZip(buf)) return { ok: false, error: IMPORT_NOT_A_PACKAGE }

  /* The central check every upload gets: the archive's own directory, before anything is unpacked. */
  const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
  const verdict = await inspectUpload({
    fileName: "theme.zip",
    size: bytes.byteLength,
    head: bytes.subarray(0, 8192),
    tail: { bytes: bytes.subarray(Math.max(0, bytes.byteLength - 70_000)), start: Math.max(0, bytes.byteLength - 70_000) },
    readRange: async (a, b) => bytes.subarray(a, b + 1),
    inflate: nodeInflateRaw,
    context: "theme_package",
  })
  if (!verdict.ok) return { ok: false, error: (verdict as { userMessage?: string }).userMessage || IMPORT_NOT_A_PACKAGE }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buf)
  } catch {
    return { ok: false, error: IMPORT_NOT_A_PACKAGE }
  }
  const entries = Object.values(zip.files).map((f) => ({ name: f.name, dir: f.dir, unixPermissions: typeof f.unixPermissions === "number" ? f.unixPermissions : null }))
  const rules = checkThemeZipEntries(entries)
  if (rules.ok === false) return { ok: false, error: (rules as { error: string }).error }
  return { ok: true, zip, files: (rules as { files: number }).files }
}

export async function checkThemeZip(buf: Buffer): Promise<ZipVerdict> {
  const safe = await checkThemeZipSafety(buf)
  if (safe.ok === false) return { ok: false, error: (safe as { error: string }).error }
  const { zip, files } = safe as { zip: JSZip; files: number }

  if (isShopifyTheme(zip)) {
    const converted = await convertShopifyTheme(zip, { fallbackName: "Imported theme" })
    if (converted.ok === false) return { ok: false, error: (converted as { error: string }).error }
    return { ok: true, kind: "shopify", name: (converted as { theme: { name: string } }).theme.name, files, preview: null }
  }

  if (zip.file("theme.json")) {
    const read = await readPackage(new Uint8Array(buf), { knownTypes: Object.keys(SECTION_SCHEMAS) })
    if (read.ok === false) {
      const errors = ((read as { errors: { message: string }[] }).errors ?? []).map((e) => e.message)
      return { ok: false, error: errors[0] ?? "This package is not valid", errors: errors.slice(0, 10) }
    }
    const pkg = (read as { value: { files: Record<string, string>; theme: { name?: unknown } } }).value
    const config = packageThemeConfig(pkg.files)
    if (config.ok === false) {
      const errors = (config as { errors: { line?: number; message: string }[] }).errors
      return { ok: false, error: `config/settings_schema.json did not read: ${errors.slice(0, 3).map((e) => `${e.line ? `line ${e.line}: ` : ""}${e.message}`).join("; ")}` }
    }
    const settings = sanitizeThemeSettings(clearAssetRefs((config as { settings: Record<string, unknown> }).settings) as Record<string, unknown>)
    const own = ownSectionFields(Object.entries(pkg.files).map(([path, content]) => ({ path, content })))
    const kinds = kindLookup(pkg.files, SECTION_SCHEMAS as never)
    const home = pagesFromPackageFiles(pkg.files, kinds).find((p) => p.page_key === "home")
    const sources: Record<string, string> = {}
    for (const [path, content] of Object.entries(pkg.files)) {
      if (path.endsWith(".storelib") && DEFAULT_THEME_SOURCES[path] !== content) sources[path] = content
    }
    return {
      ok: true,
      kind: "storelib",
      name: String(pkg.theme.name ?? "Imported theme").slice(0, 80),
      files,
      preview: { settings: settings as ThemeSettingsValues, sections: sanitizeSections(clearAssetRefs(home?.sections ?? []) as SectionInstance[], own), sources },
    }
  }

  const manifestFile = zip.file("manifest.json")
  if (!manifestFile) return { ok: false, error: "This zip is not a Storelib or Shopify theme. A theme has theme.json, or the folders sections, templates and layout." }
  const parsed = parseThemePackageManifest(await manifestFile.async("string"))
  if (parsed.ok === false) return { ok: false, error: (parsed as { error: string }).error }
  const manifest = (parsed as { manifest: { install?: { name?: string }; settings?: Record<string, unknown>; pages?: { page_key: string; sections: unknown }[] } }).manifest
  const homePage = (manifest.pages ?? []).find((p) => p.page_key === "home")
  const sections = repairChrome(sanitizeSections(clearAssetRefs(homePage?.sections ?? []) as SectionInstance[]), kindLookup(undefined, SECTION_SCHEMAS as never)).sections
  return {
    ok: true,
    kind: "export",
    name: (manifest.install?.name ?? "Imported theme").slice(0, 80),
    files,
    preview: { settings: sanitizeThemeSettings(clearAssetRefs(manifest.settings ?? {}) as Record<string, unknown>) as ThemeSettingsValues, sections, sources: {} },
  }
}

/** The preview a package left at upload, or null. Cached with the listings. */
export const storedPreview = unstable_cache(
  async (listingId: string, _version: string): Promise<ThemePreviewData | null> => {
    void _version
    try {
      const { data, error } = await createAdminClient().storage.from(PACKAGE_BUCKET).download(previewPathFor(listingId))
      if (error || !data) return null
      const parsed = JSON.parse(await data.text()) as ThemePreviewData
      if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.sections)) return null
      return { settings: parsed.settings ?? {}, sections: parsed.sections, sources: parsed.sources ?? {} }
    } catch {
      return null
    }
  },
  ["theme-marketplace-preview-v1"],
  { tags: [MARKETPLACE_TAG], revalidate: 3600 },
)
