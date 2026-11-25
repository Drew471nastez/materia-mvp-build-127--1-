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

/**
 * An imported theme is hundreds of files: written in parts, so no one request is megabytes.
 *
 * ROUND 27 (the owner: "adding a theme takes too long"). A Materia template is
 * 986 rows and 28.5 MB of text; written 200 rows at a time, one part after
 * the other, that was five requests of about 6 MB each, in a row. Now each
 * part is at most CHUNK_ROWS rows AND at most CHUNK_CHARS characters (a
 * steadier request the database answers well inside its statement timeout),
 * and up to CHUNK_PARALLEL parts are in flight at once. A part that fails is
 * the answer, as before, and the caller takes the install back with all of
 * its rows (fillImportedInstall).
 */
export const CHUNK_ROWS = 200
export const CHUNK_CHARS = 3_000_000
export const CHUNK_PARALLEL = 3

/** The rows in parts of at most CHUNK_ROWS rows and CHUNK_CHARS characters, in their order. Pure, for the test. */
export function fileChunks<T extends { path: string; content: string }>(files: readonly T[], maxRows = CHUNK_ROWS, maxChars = CHUNK_CHARS): T[][] {
  const parts: T[][] = []
  let part: T[] = []
  let chars = 0
  for (const f of files) {
    const size = f.path.length + (typeof f.content === "string" ? f.content.length : 0)
    if (part.length > 0 && (part.length >= maxRows || chars + size > maxChars)) {
      parts.push(part)
      part = []
      chars = 0
    }
    part.push(f)
    chars += size
  }
  if (part.length) parts.push(part)
  return parts
}

/** Each item through `work`, at most `limit` at a time; the answers in the items' order. */
export async function inPool<T, R>(items: readonly T[], limit: number, work: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const lane = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await work(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane))
  return out
}

export async function insertInChunks(admin: Admin, files: { install_id: string; path: string; content: string }[], parallel = CHUNK_PARALLEL): Promise<{ error: unknown }> {
  let failed: unknown = null
  await inPool(fileChunks(files), parallel, async (part) => {
    /* Once one part failed the install goes anyway: the rest are not sent. */
    if (failed) return
    const { error } = await admin.from("store_theme_custom_files").insert(part)
    if (error && !failed) failed = error
  })
  return { error: failed }
}

/**
 * The catalogue theme a new install points at: the package's claimed id
 * when this database has it, else Storelib Default (registered first when
 * the database lacks it). `theme_id` is NOT NULL and a foreign key.
 */
/* Storelib Default, once this server has seen it in the catalogue: it is never taken out again, so it is not asked for on every import (round 27). */
let defaultKnownUntil = 0
const DEFAULT_KNOWN_MS = 10 * 60_000

export async function catalogThemeId(admin: Admin, claimed: unknown): Promise<string> {
  if (typeof claimed === "string" && UUID.test(claimed)) {
    const { data: known } = await admin.from("themes").select("id").eq("id", claimed).maybeSingle()
    if (known) return claimed
  }
  if (Date.now() < defaultKnownUntil) return STORELIB_DEFAULT_ID
  const { data: haveDefault } = await admin.from("themes").select("id").eq("id", STORELIB_DEFAULT_ID).maybeSingle()
  if (!haveDefault) {
    const def = THEME_REGISTRY.find((t) => t.id === STORELIB_DEFAULT_ID)
    if (def) await admin.from("themes").upsert(themeCatalogRow(def), { onConflict: "id" })
  } else {
    defaultKnownUntil = Date.now() + DEFAULT_KNOWN_MS
  }
  return STORELIB_DEFAULT_ID
}

/** For the tests: forget that Storelib Default was seen. */
export function forgetCatalogDefault(): void {
  defaultKnownUntil = 0
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

/** How many pictures go up at once (round 27): one after the other, a template's 49 were about ten seconds of the wait. */
export const MEDIA_PARALLEL = 6

/**
 * The names already in the creator's imported folder, so a picture stored by
 * an earlier import (the same bytes give the same name: its sha256) is not
 * sent again. A listing that fails is "none known": everything is uploaded,
 * as before. At most a few pages are asked; past them, uploads decide.
 */
export async function importedNamesOf(admin: Admin, userId: string, pages = 3): Promise<Set<string>> {
  const names = new Set<string>()
  try {
    const bucket = admin.storage.from(IMPORTED_MEDIA_BUCKET)
    for (let page = 0; page < pages; page++) {
      const { data, error } = await bucket.list(`${userId}/imported`, { limit: 1000, offset: page * 1000, sortBy: { column: "name", order: "asc" } })
      if (error || !Array.isArray(data)) break
      for (const f of data as { name?: unknown }[]) if (typeof f?.name === "string") names.add(f.name)
      if (data.length < 1000) break
    }
  } catch {
    /* none known: every picture is uploaded */
  }
  return names
}

/**
 * A converted Shopify-format theme as a new website: its media, the install, its rows. All or nothing.
 * `name` replaces the theme's own name (Start with AI names its website itself).
 * `mark` changes the settings before they are written (the marketplace's note of where a theme came from),
 * so the website is right in its first write rather than after three more.
 */
export async function storeImportedTheme(
  admin: Admin,
  who: { userId: string; creatorId: string },
  theme: ImportedTheme,
  report: ConversionReport,
  opts: { name?: string; menus?: typeof ensureStoreMenus; mark?: (settings: Record<string, unknown>) => Record<string, unknown>; timing?: (step: string) => void } = {},
): Promise<StoredTheme | StoreFailure> {
  const lap = opts.timing ?? (() => {})
  /*
    ROUND 27: WHAT DOES NOT WAIT FOR WHAT. The library's first place and the
    catalogue row need only the creator, and the pictures only the user, so
    the two reads go out while the pictures go up, a few at a time, each
    already stored by an earlier import skipped (its name is its hash).
  */
  const placeAsked = Promise.all([firstSortOrder(admin, who.creatorId), catalogThemeId(admin, null)])
  placeAsked.catch(() => {})
  const known = theme.binaries.length ? await importedNamesOf(admin, who.userId) : new Set<string>()
  type Stored = { name: string; url: string; kind: MediaKind } | { name: string; skipped: string }
  const stored = await inPool(theme.binaries, MEDIA_PARALLEL, async (asset): Promise<Stored> => {
    try {
      const ext = extensionOf(asset.name)
      const type = MEDIA_TYPES[ext]
      if (!type || asset.bytes.byteLength > MAX_BYTES[type.kind] || !packageFileAllowed(asset.name, asset.bytes, type.kind)) {
        return { name: asset.name, skipped: "It is not a picture or video Storelib stores" }
      }
      const file = `${createHash("sha256").update(asset.bytes).digest("hex").slice(0, 32)}.${ext}`
      const path = `${who.userId}/imported/${file}`
      if (!known.has(file)) {
        const { error } = await admin.storage.from(IMPORTED_MEDIA_BUCKET).upload(path, Buffer.from(asset.bytes), { contentType: type.mime, upsert: true, cacheControl: "31536000" })
        if (error) return { name: asset.name, skipped: "It could not be stored. Import the theme again to retry" }
      }
      return { name: asset.name, url: admin.storage.from(IMPORTED_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl, kind: type.kind }
    } catch {
      return { name: asset.name, skipped: "It could not be stored. Import the theme again to retry" }
    }
  })
  const addresses: Record<string, string> = {}
  const imported: Partial<Record<MediaKind, number>> = {}
  for (const s of stored) {
    if ("skipped" in s) {
      report.skipped.push({ file: `assets/${s.name}`, reason: s.skipped })
      continue
    }
    addresses[s.name] = s.url
    imported[s.kind] = (imported[s.kind] ?? 0) + 1
  }
  lap("media")
  /* The whole report is kept with the theme, where the code editor shows it. */
  const files: Record<string, string> = { ...theme.files, [ASSET_MAP_PATH]: JSON.stringify(addresses, null, 2), "shopify/import-report.json": JSON.stringify({ summary: conversionSummary(report), ...report }, null, 2) }
  const own = ownSectionFields(Object.entries(files).filter(([p]) => p.endsWith(".storelib")).map(([path, content]) => ({ path, content })))
  const pages = theme.pages.map((p) => ({ page_key: p.page_key, sections: sanitizeSections(p.sections as unknown as SectionInstance[], own) }))
  const clean = sanitizeThemeSettings(theme.settings as unknown as Record<string, unknown>)
  const settings = opts.mark ? opts.mark(clean) : clean

  const name = (opts.name ?? theme.name).slice(0, 80)
  const [sortOrder, themeId] = await placeAsked
  const made = await createImportedInstall(admin, who.creatorId, { theme_id: themeId, name, sort_order: sortOrder }, { menus: opts.menus })
  if (made.ok === false) return made
  lap("install")
  const rows = Object.entries(files).map(([path, content]) => ({ install_id: made.id, path, content }))
  const filled = await fillImportedInstall(admin, made.id, settings, pages, rows)
  lap("rows")
  if (filled) return filled
  return { ok: true, installId: made.id, name, imported }
}
