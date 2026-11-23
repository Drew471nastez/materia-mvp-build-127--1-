import "server-only"

/**
 * ===========================================================================
 *  THEME RELEASES ON THE SERVER: READ, COMPOSED, CONVERTED
 * ===========================================================================
 * The rows (theme_releases, RUN_THEME_RELEASES.sql), and the theme a listing
 * is at its newest published releases, as files and as the converted theme
 * the import and an update both store.
 *
 * WHERE A RELEASE'S FILES ARE. Every release keeps a zip in the private
 * bucket the marketplace's packages use, under theme-releases/<target>/: the
 * zip the admin uploaded, or the files the code had when the admin published
 * from it. A release is pinned: the code moving on after it does not change
 * what it ships.
 *
 * WHAT A TEMPLATE IS AT A RELEASE. A Storelib template is the shared base
 * with its own overlay laid over it (lib/themes/template-packages.ts), so
 * at any moment it is
 *
 *   the base       the newest published base release, or the code's base
 *                  when there has been none
 *   its overlay    the newest published release of the template when it is
 *                  an overlay, or the code's overlay when there has been none
 *
 * and a template release uploaded as a whole theme newer than the base is
 * the template on its own. An uploaded marketplace theme is its newest
 * release, whole.
 *
 * Before the SQL runs there is no table: every read answers no releases and
 * `missing`, and the marketplace works as it did.
 */
import { randomUUID } from "node:crypto"
import { unstable_cache } from "next/cache"

import { createAdminClient } from "@/lib/supabase/admin"

import { MARKETPLACE_TAG } from "./marketplace-shared"
import { PACKAGE_BUCKET, isMissingRelation } from "./marketplace-server"
import { releasedFiles as releasedFilesWith, rowToRelease, unzipLayer, wholeThemeFor as wholeThemeWith, type ReleaseRow } from "./releases-compose"
import type { ThemeRelease } from "./releases-shared"

/* The composing half, files in and files out (./releases-compose.ts). */
export * from "./releases-compose"

export const RELEASES_TABLE = "theme_releases"
/** What a creator's page may read (the same columns RUN_THEME_RELEASES.sql grants). */
export const RELEASE_PUBLIC_COLUMNS = "id, target, family, version, notes, source, published, published_at, created_at"
export const RELEASE_COLUMNS = `${RELEASE_PUBLIC_COLUMNS}, layer, package_path, manifest, files, updated_at`
export const RELEASE_SQL_MISSING = "Theme releases need supabase/sql/RUN_THEME_RELEASES.sql to run first."

export async function readReleaseRows(opts: { includeUnpublished?: boolean; withFiles?: boolean } = {}): Promise<{ rows: ReleaseRow[]; missing: boolean; failed: boolean }> {
  try {
    let q = createAdminClient().from(RELEASES_TABLE).select(opts.withFiles ? RELEASE_COLUMNS : RELEASE_PUBLIC_COLUMNS).order("created_at", { ascending: false }).limit(1000)
    if (!opts.includeUnpublished) q = q.eq("published", true)
    const { data, error } = await q
    if (error) return { rows: [], missing: isMissingRelation(error), failed: !isMissingRelation(error) }
    return { rows: (data ?? []) as unknown as ReleaseRow[], missing: false, failed: false }
  } catch {
    return { rows: [], missing: false, failed: true }
  }
}

/** Every published release, for the library's version line. Cached with the listings and dropped on any admin change. */
export const publishedReleases = unstable_cache(
  async (): Promise<ThemeRelease[]> => (await readReleaseRows()).rows.map(rowToRelease),
  ["theme-releases-v1"],
  { tags: [MARKETPLACE_TAG], revalidate: 300 },
)

export const releaseUploadPath = (target: string) => `theme-releases/${target}/${randomUUID()}.zip`

export async function loadReleaseFiles(row: Pick<ReleaseRow, "package_path">): Promise<Map<string, Buffer>> {
  if (!row.package_path) throw new Error("This release has no files")
  const { data, error } = await createAdminClient().storage.from(PACKAGE_BUCKET).download(row.package_path)
  if (error || !data) throw new Error("This release's files could not be read")
  return unzipLayer(Buffer.from(await data.arrayBuffer()))
}

/** The files a listing is at its newest published releases, read from storage. */
export const releasedFiles = (slug: string, rows: readonly ReleaseRow[]) => releasedFilesWith(slug, rows, loadReleaseFiles)

/** A new release's files made into a whole theme, the base it lays over read from storage. */
export const wholeThemeFor = (target: string, files: Map<string, Buffer>, rows: readonly ReleaseRow[]) => wholeThemeWith(target, files, rows, loadReleaseFiles)
