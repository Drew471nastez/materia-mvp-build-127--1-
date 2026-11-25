/**
 * ===========================================================================
 *  AN IMPORTED THEME, STORED AS A NEW WEBSITE (shared, round 26)
 * ===========================================================================
 * What the theme import (app/api/website-builder/themes/import) does with a
 * Shopify-format theme once it is converted: its pictures to the creator's
 * media, each checked as every upload is; a new install (a draft, first in
 * the library, within the library limit, the store's menus written down);
 * then its settings, pages and files, all or nothing. It lived inside the
 * route; it is here so Start with AI can make a website from a Materia
 * template the same way Browse themes does (lib/themes/template-install.ts),
 * without a second copy of any of it. The route keeps its own answers and
 * its cover; this answers plain results.
 *
 * Server only (node:crypto, the service role).
 */
import { createHash } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { MAX_BYTES, MEDIA_TYPES, extensionOf, type MediaKind } from "@/lib/storelib-theme/media"
import { ASSET_MAP_PATH } from "@/lib/storelib-theme/compat/install"
import { conversionSummary, type ConversionReport, type ImportedTheme } from "@/lib/storelib-theme/shopify/convert"
import { ownSectionFields, sanitizeSections, sanitizeThemeSettings } from "@/lib/website-builder/sanitize-sections"
import type { SectionInstance } from "@/lib/website-builder/types"
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, firstSortOrder, isLibraryFullError, keptWithinLimit } from "@/lib/website-builder/library-limit"
import { ensureStoreMenus } from "@/lib/website-builder/store-menus-server"
import { STORELIB_DEFAULT_ID, THEME_REGISTRY, themeCatalogRow } from "@/lib/website-builder/theme-registry"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>

export const IMPORTED_MEDIA_BUCKET = "store-builder-images"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type StoreFailure = { ok: false; status: number; error: string; code?: string }

/**
 * A file inside a package, checked by the central check before it gets a
 * public URL: a picture must be a picture, a video a video, and nothing may
 * be a program, a script or a web page, whatever its extension says.
 */
export function packageFileAllowed(name: string, bytes: Uint8Array, kind: MediaKind): boolean {
  const context = kind === "image" ? "public_image" : kind === "video" ? "video" : "link_page_file"
  return inspectHead({ fileName: name, size: bytes.byteLength || 1, head: bytes.subarray(0, 8192), context }).ok
}

/** An imported theme is hundreds of files: written a few hundred at a time, so no one request is megabytes. */
export async function insertInChunks(admin: Admin, files: { install_id: string; path: string; content: string }[]): Promise<{ error: unknown }> {
  const CHUNK = 200
  for (let i = 0; i < files.length; i += CHUNK) {
    const { error } = await admin.from("store_theme_custom_files").insert(files.slice(i, i + CHUNK))
    if (error) return { error }
  }
  return { error: null }
}

/**
 * The catalogue theme a new install points at: the package's claimed id
 * when this database has it, else Storelib Default (registered first when
 * the database lacks it). `theme_id` is NOT NULL and a foreign key.
 */
export async function catalogThemeId(admin: Admin, claimed: unknown): Promise<string> {
  if (typeof claimed === "string" && UUID.test(claimed)) {
    const { data: known } = await admin.from("themes").select("id").eq("id", claimed).maybeSingle()
    if (known) return claimed
  }
  const { data: haveDefault } = await admin.from("themes").select("id").eq("id", STORELIB_DEFAULT_ID).maybeSingle()
  if (!haveDefault) {
    const def = THEME_REGISTRY.find((t) => t.id === STORELIB_DEFAULT_ID)
    if (def) await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
  }
  return STORELIB_DEFAULT_ID
}

/**
 * The new install's row: a draft, before every website already there. Two
 * at once cannot make one too many: the database refuses, or the recount
 * backs this one out (lib/website-builder/library-limit.ts). The store's
 * menus are written down before the imported website draws them.
 */
export async function createImportedInstall(
  admin: Admin,
  creatorId: string,
  fields: { theme_id: string; name: string; sort_order: number },
  deps: { menus?: typeof ensureStoreMenus } = {},
): Promise<{ ok: true; id: string } | StoreFailure> {
  const { data, error } = await admin
    .from("store_theme_installs")
    .insert({ creator_id: creatorId, ...fields, status: "draft", is_custom: true })
    .select("id")
    .single()
  if (isLibraryFullError(error)) return { ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }
  if (error || !data) return { ok: false, status: 500, error: (error as { message?: string } | null)?.message ?? "Failed to create install" }
  if (!(await keptWithinLimit(admin, creatorId, data.id as string))) return { ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }
  await (deps.menus ?? ensureStoreMenus)(admin, creatorId, { excludeInstallId: data.id as string })
  return { ok: true, id: data.id as string }
}

/**
 * Its settings, pages and files, or nothing: any write that fails removes
 * the install again (its rows go with it). Null when everything landed.
 */
export async function fillImportedInstall(
  admin: Admin,
  installId: string,
  settings: Record<string, unknown>,
  pages: { page_key: string; sections: unknown }[],
  files: { install_id: string; path: string; content: string }[],
): Promise<StoreFailure | null> {
  const writes = [
    admin.from("store_theme_settings").insert({ install_id: installId, settings, draft_settings: settings }),
    pages.length > 0 ? admin.from("store_theme_pages").insert(pages.map((p) => ({ install_id: installId, page_key: p.page_key, sections: p.sections }))) : Promise.resolve({ error: null }),
    insertInChunks(admin, files),
  ]
  const failed = (await Promise.all(writes)).find((r) => r.error)
  if (!failed) return null
  await admin.from("store_theme_installs").delete().eq("id", installId)
  return { ok: false, status: 500, error: "Could not import this theme. Try again." }
}

export type StoredTheme = { ok: true; installId: string; name: string; imported: Partial<Record<MediaKind, number>> }

/**
 * A converted Shopify-format theme as a new website: its media, the install, its rows. All or nothing.
 * `name` replaces the theme's own name (Start with AI names its website itself).
 */
export async function storeImportedTheme(
  admin: Admin,
  who: { userId: string; creatorId: string },
  theme: ImportedTheme,
  report: ConversionReport,
  opts: { name?: string; menus?: typeof ensureStoreMenus } = {},
): Promise<StoredTheme | StoreFailure> {
  const addresses: Record<string, string> = {}
  const imported: Partial<Record<MediaKind, number>> = {}
  for (const asset of theme.binaries) {
    try {
      const ext = extensionOf(asset.name)
      const type = MEDIA_TYPES[ext]
      if (!type || asset.bytes.byteLength > MAX_BYTES[type.kind] || !packageFileAllowed(asset.name, asset.bytes, type.kind)) {
        report.skipped.push({ file: `assets/${asset.name}`, reason: "It is not a picture or video Storelib stores" })
        continue
      }
      const path = `${who.userId}/imported/${createHash("sha256").update(asset.bytes).digest("hex").slice(0, 32)}.${ext}`
      const { error } = await admin.storage.from(IMPORTED_MEDIA_BUCKET).upload(path, Buffer.from(asset.bytes), { contentType: type.mime, upsert: true, cacheControl: "31536000" })
      if (error) {
        report.skipped.push({ file: `assets/${asset.name}`, reason: "It could not be stored. Import the theme again to retry" })
        continue
      }
      addresses[asset.name] = admin.storage.from(IMPORTED_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
      imported[type.kind] = (imported[type.kind] ?? 0) + 1
    } catch {
      report.skipped.push({ file: `assets/${asset.name}`, reason: "It could not be stored. Import the theme again to retry" })
    }
  }
  /* The whole report is kept with the theme, where the code editor shows it. */
  const files: Record<string, string> = { ...theme.files, [ASSET_MAP_PATH]: JSON.stringify(addresses, null, 2), "shopify/import-report.json": JSON.stringify({ summary: conversionSummary(report), ...report }, null, 2) }
  const own = ownSectionFields(Object.entries(files).filter(([p]) => p.endsWith(".storelib")).map(([path, content]) => ({ path, content })))
  const pages = theme.pages.map((p) => ({ page_key: p.page_key, sections: sanitizeSections(p.sections as unknown as SectionInstance[], own) }))
  const settings = sanitizeThemeSettings(theme.settings as unknown as Record<string, unknown>)

  const name = (opts.name ?? theme.name).slice(0, 80)
  const sortOrder = await firstSortOrder(admin, who.creatorId)
  const made = await createImportedInstall(admin, who.creatorId, { theme_id: await catalogThemeId(admin, null), name, sort_order: sortOrder }, { menus: opts.menus })
  if (made.ok === false) return made
  const rows = Object.entries(files).map(([path, content]) => ({ install_id: made.id, path, content }))
  const filled = await fillImportedInstall(admin, made.id, settings, pages, rows)
  if (filled) return filled
  return { ok: true, installId: made.id, name, imported }
}
