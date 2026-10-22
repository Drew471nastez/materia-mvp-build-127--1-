/**
 * ===========================================================================
 *  THE WHOLE THEME, READ FOR GITHUB
 * ===========================================================================
 * Everything an install is, as the builder has it (drafts first): its
 * settings, its pages, every file it saved, and for a theme of Storelib's own
 * the built-in files under them. ./layout.ts turns it into a repository.
 *
 * Reads only. A read that fails throws: a half-read theme sent to GitHub
 * would look like files deleted.
 */
import { compatOf, ASSET_MAP_PATH } from "@/lib/storelib-theme/compat/install"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { builtInSettingsSchema } from "@/lib/storelib-theme/theme-config"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { storeMenusOrNull, withStoreMenus } from "@/lib/website-builder/store-menus-server"
import type { ThemeSnapshot } from "./layout"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export class SnapshotError extends Error {}

/** Pictures fetched for one export, at most, and in all. */
const MEDIA_FILE_MAX = 15 * 1024 * 1024
const MEDIA_TOTAL_MAX = 60 * 1024 * 1024

async function allFiles(db: Db, installId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const page = 1000
  for (let from = 0; from < 20_000; from += page) {
    let res = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId).order("path").range(from, from + page - 1)
    if (res.error) res = await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId).order("path").range(from, from + page - 1)
    if (res.error) throw new SnapshotError("Could not read this website's files. Try again.")
    const rows = (res.data ?? []) as { path: string; content: string | null; draft_content?: string | null }[]
    for (const r of rows) {
      const text = r.draft_content ?? r.content
      if (typeof text === "string" && text.trim() !== "") out[r.path] = text
    }
    if (rows.length < page) break
  }
  return out
}

/** The built-in sections Storelib draws itself, with no .storelib file: their schemas, to read. */
export function referenceSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [type, schema] of Object.entries(SECTION_SCHEMAS)) {
    if (`sections/${type}.storelib` in DEFAULT_THEME_SOURCES) continue
    out[type] = schema
  }
  return out
}

export async function readSnapshot(
  db: Db,
  installId: string,
  /* creatorId: whose store's menus the builder shows (lib/website-builder/store-menus-server.ts). */
  opts: { name: string; creatorId?: string | null; fetchMedia?: (url: string, maxBytes: number) => Promise<Uint8Array | null> },
): Promise<ThemeSnapshot> {
  const [settingsRow, pagesRes, files, storeMenus] = await Promise.all([
    db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle(),
    db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId),
    allFiles(db, installId),
    opts.creatorId ? storeMenusOrNull(db, opts.creatorId) : Promise.resolve(null),
  ])
  if (settingsRow.error) throw new SnapshotError("Could not read this website's settings. Try again.")
  if (pagesRes.error) throw new SnapshotError("Could not read this website's pages. Try again.")
  /*
    The menus the builder's Navigation shows: the store's, once it keeps
    them, over the theme's own copy. Without this the repository held the
    menus as they were before the store took them over, and an agent edited
    menus nobody sees.
  */
  const settings = withStoreMenus(((settingsRow.data?.draft_settings ?? settingsRow.data?.settings) ?? {}) as Record<string, unknown>, storeMenus)
  const pages = ((pagesRes.data ?? []) as { page_key: string; sections: unknown; draft_sections: unknown }[])
    .map((p) => ({ page_key: p.page_key, sections: (p.draft_sections ?? p.sections ?? []) as unknown }))
    .sort((a, b) => (a.page_key < b.page_key ? -1 : 1))
  const compat = compatOf(settings) !== null

  const snap: ThemeSnapshot = {
    name: opts.name,
    compat,
    settings,
    pages,
    files,
    defaults: compat ? {} : { ...(DEFAULT_THEME_SOURCES as Record<string, string>) },
    referenceSchemas: compat ? undefined : referenceSchemas(),
    settingsSchema: compat ? undefined : builtInSettingsSchema(),
    storeMenus: storeMenus !== null,
  }

  /* An imported theme's pictures live in storage; the repository gets their bytes, within limits. */
  if (compat && opts.fetchMedia) {
    let map: Record<string, string> = {}
    try {
      map = JSON.parse(files[ASSET_MAP_PATH] ?? "{}") as Record<string, string>
    } catch {
      map = {}
    }
    const media: Record<string, Uint8Array> = {}
    const skipped: { name: string; reason: string }[] = []
    let total = 0
    for (const [name, url] of Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (typeof url !== "string" || !url) continue
      if (total >= MEDIA_TOTAL_MAX) {
        skipped.push({ name, reason: `Pictures over ${MEDIA_TOTAL_MAX / 1048576} MB in all stay in Storelib` })
        continue
      }
      try {
        const bytes = await opts.fetchMedia(url, Math.min(MEDIA_FILE_MAX, MEDIA_TOTAL_MAX - total))
        if (!bytes) {
          skipped.push({ name, reason: "It could not be downloaded from Storelib's storage" })
          continue
        }
        total += bytes.byteLength
        media[name] = bytes
      } catch {
        skipped.push({ name, reason: "It could not be downloaded from Storelib's storage" })
      }
    }
    snap.media = media
    snap.mediaSkipped = skipped
  }
  return snap
}
