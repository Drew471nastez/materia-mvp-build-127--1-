/**
 * ===========================================================================
 *  UPDATE: AN UPDATED COPY IN THE LIBRARY, NEVER A CHANGE TO THE WEBSITE
 * ===========================================================================
 * POST /api/website-builder/themes/[installId]/update runs this. The website
 * the creator pressed Update on is READ, and nothing else: no row of it, its
 * settings, pages or files is written, so the live site stays exactly as it
 * is and is the rollback. What is written is a new draft website beside it:
 *
 *   1. the website and its settings; the releases it has not taken
 *      (lib/themes/releases-shared.ts versionState). None: up to date.
 *   2. room in the library (THEME_INSTALL_LIMIT): a full one is refused
 *      before anything is read or stored, with the library's own sentence
 *   3. the theme at its newest release (lib/themes/releases-server.ts)
 *   4. the website's pages, files and their saved history
 *   5. the merge (lib/themes/release-merge.ts): the new code, the creator's
 *      content, their edited files kept and listed
 *   6. the copy, all or nothing: a write that fails removes it again
 *
 * The client is passed in, so tests/theme-releases.test.ts runs this on a
 * recording stand-in and checks that the source website is never written.
 */
import { LIBRARY_FULL_CODE, LIBRARY_FULL_MESSAGE, isLibraryFullError, keptWithinLimit, librarySlotsLeft, nextSortOrder } from "@/lib/website-builder/library-limit"

import { mergeThemeUpdate, type FileRow, type MergeResult, type NextTheme, type PageRow } from "./release-merge"
import { updatedCopyName, versionState, type ThemeRelease } from "./releases-shared"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type NextThemeResult = { ok: true; theme: NextTheme; version: string; shipped: Record<string, string[]> } | { ok: false; error: string }

export interface UpdateDeps {
  db: Db
  creatorId: string
  installId: string
  /** Published releases. */
  releases: readonly ThemeRelease[]
  nextTheme: (slug: string) => Promise<NextThemeResult>
  /** The new version's pictures stored under the creator's account, by their name in assets/. */
  storeAssets?: (theme: NextTheme) => Promise<Record<string, string>>
}

export type UpdateOutcome =
  | ({ ok: true; installId: string; name: string; version: string; sourceId: string } & Pick<MergeResult, "kept" | "retired" | "updated" | "added" | "newPages">)
  | { ok: false; status: number; error: string; code?: string }

export const UP_TO_DATE = "This theme is up to date."
export const NOT_FROM_MARKETPLACE = "This website was not added from a theme with updates."

const CHUNK = 100

export async function runThemeUpdate(deps: UpdateDeps): Promise<UpdateOutcome> {
  const { db, creatorId, installId } = deps

  const { data: source } = await db.from("store_theme_installs").select("id, name, theme_id, creator_id").eq("id", installId).eq("creator_id", creatorId).maybeSingle()
  if (!source) return { ok: false, status: 404, error: "Theme not found" }
  const { data: stored } = await db.from("store_theme_settings").select("settings, draft_settings").eq("install_id", installId).maybeSingle()
  const settings = stored?.settings ?? {}
  const draftSettings = stored?.draft_settings ?? null

  /* The draft's record of where it came from is the newer one when there is a draft. */
  const state = versionState(draftSettings ?? settings, deps.releases) ?? versionState(settings, deps.releases)
  if (!state) return { ok: false, status: 409, error: NOT_FROM_MARKETPLACE }
  if (!state.pending.length) return { ok: false, status: 409, error: UP_TO_DATE, code: "up_to_date" }

  /* An update is a copy, and a copy counts: refused before anything is read or stored. */
  if ((await librarySlotsLeft(db, creatorId)) === 0) return { ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }

  const next = await deps.nextTheme(state.slug)
  if (next.ok === false) return { ok: false, status: 500, error: (next as { error: string }).error }
  const ready = next as Extract<NextThemeResult, { ok: true }>

  const { data: pageRows } = await db.from("store_theme_pages").select("page_key, sections, draft_sections").eq("install_id", installId)
  const withDrafts = await db.from("store_theme_custom_files").select("path, content, draft_content").eq("install_id", installId)
  const files: FileRow[] = withDrafts.error ? ((await db.from("store_theme_custom_files").select("path, content").eq("install_id", installId)).data ?? []) : (withDrafts.data ?? [])
  const history = await db.from("store_theme_file_versions").select("path").eq("install_id", installId).limit(20000)
  const savedPaths = history.error ? null : new Set<string>(((history.data ?? []) as { path: string }[]).map((r) => r.path))

  const assetUrls = deps.storeAssets ? await deps.storeAssets(ready.theme) : {}
  const merged = mergeThemeUpdate({
    current: { files, settings, draftSettings, pages: (pageRows ?? []) as PageRow[] },
    next: ready.theme,
    version: ready.version,
    shipped: state.installed ? ready.shipped : null,
    savedPaths,
    assetUrls,
  })

  const name = updatedCopyName(String(source.name ?? "Website"), ready.version)
  const sortOrder = await nextSortOrder(db, creatorId)
  const { data: made, error: madeErr } = await db
    .from("store_theme_installs")
    .insert({ creator_id: creatorId, theme_id: source.theme_id, name, status: "draft", is_custom: true, parent_install_id: installId, sort_order: sortOrder })
    .select("id")
    .single()
  if (isLibraryFullError(madeErr)) return { ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }
  if (madeErr || !made?.id) return { ok: false, status: 500, error: "Could not make the updated copy. Try again." }
  const copyId = made.id as string
  if (!(await keptWithinLimit(db, creatorId, copyId))) return { ok: false, status: 400, error: LIBRARY_FULL_MESSAGE, code: LIBRARY_FULL_CODE }

  const undo = async (): Promise<UpdateOutcome> => {
    await db.from("store_theme_installs").delete().eq("id", copyId).eq("creator_id", creatorId)
    return { ok: false, status: 500, error: "Could not make the updated copy. Try again." }
  }
  const { error: settingsErr } = await db.from("store_theme_settings").insert({ install_id: copyId, settings: merged.settings, draft_settings: merged.draftSettings })
  if (settingsErr) return undo()
  if (merged.pages.length) {
    const { error } = await db.from("store_theme_pages").insert(merged.pages.map((p) => ({ install_id: copyId, page_key: p.page_key, sections: p.sections, draft_sections: p.draft_sections ?? null })))
    if (error) return undo()
  }
  const rows = merged.files.map((f) => (withDrafts.error ? { install_id: copyId, path: f.path, content: f.content } : { install_id: copyId, path: f.path, content: f.content, draft_content: f.draft_content ?? null }))
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from("store_theme_custom_files").insert(rows.slice(i, i + CHUNK))
    if (error) return undo()
  }

  return { ok: true, installId: copyId, name, version: ready.version, sourceId: installId, kept: merged.kept, retired: merged.retired, updated: merged.updated, added: merged.added, newPages: merged.newPages }
}
