/**
 * ===========================================================================
 *  A PUBLISH, KEPT AS A RELEASE THAT NEVER CHANGES
 * ===========================================================================
 * Live and draft are columns on the same rows, edited in place, so the only
 * name a published website had was "whatever the rows say now". A release
 * is what they said at the moment of Publish, written once and never
 * changed (SQL part 180):
 *
 *   site_releases       one row per publish: the live theme settings, every
 *                       page's live sections, and every live file by path
 *                       with the sha256 of its text (the manifest below)
 *   theme_file_blobs    each file's text once, by its sha256, shared by
 *                       every release and website that has it
 *   site_live_releases  which release a website is drawn from now
 *
 * Because a release never changes, anything read through it can be held
 * for good: a blob by its sha256, a group of blobs by the sha256 of their
 * sha256s (blobGroups). A cold server reads a theme's files from the data
 * cache instead of reading megabytes from the database. Only the pointer is
 * read under the site's tag, briefly.
 *
 * This file is the pure half (the manifest, the hashes, the groups), so the
 * tests drive it without a database. The reads and writes are in
 * ./site-releases-server.ts.
 */
import { createHash } from "node:crypto"

export const MANIFEST_VERSION = 1

export interface ReleaseFile {
  path: string
  sha256: string
  /** Bytes of the text as UTF-8. */
  size: number
}

export interface ReleasePage {
  page_key: string
  /** The page's live `sections` column, as it was. */
  sections: unknown
}

export interface ReleaseManifest {
  v: typeof MANIFEST_VERSION
  /** The live `store_theme_settings.settings`, as it was (null: the install had no settings row). */
  settings: unknown
  pages: ReleasePage[]
  files: ReleaseFile[]
}

export const sha256Hex = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex")

const SHA = /^[0-9a-f]{64}$/

/**
 * The manifest of what is live, and the text of each file by its sha256.
 *
 * A file whose live text is empty is not in it: an empty `content` is
 * "nothing published at this path" (a file made in the code editor and not
 * yet published), which is how both readers already treat it
 * (compat-site.ts installFiles, storefront-render.ts sectionSources). Paths
 * and pages are sorted, so the same site makes the same manifest.
 */
export function buildManifest(input: { settings: unknown; pages: ReleasePage[]; files: Record<string, string> }): { manifest: ReleaseManifest; blobs: Map<string, string>; totalBytes: number } {
  const blobs = new Map<string, string>()
  const files: ReleaseFile[] = []
  let totalBytes = 0
  for (const path of Object.keys(input.files).sort()) {
    const text = input.files[path]
    if (typeof text !== "string" || text === "") continue
    const sha256 = sha256Hex(text)
    const size = Buffer.byteLength(text, "utf8")
    blobs.set(sha256, text)
    files.push({ path, sha256, size })
    totalBytes += size
  }
  const pages = [...input.pages]
    .filter((p) => typeof p.page_key === "string")
    .map((p) => ({ page_key: p.page_key, sections: p.sections ?? null }))
    .sort((a, b) => (a.page_key < b.page_key ? -1 : a.page_key > b.page_key ? 1 : 0))
  return { manifest: { v: MANIFEST_VERSION, settings: input.settings ?? null, pages, files }, blobs, totalBytes }
}

/** A manifest as stored, checked: anything that does not read as one is no release (the rows are drawn instead). */
export function readManifest(value: unknown): ReleaseManifest | null {
  const m = value as Partial<ReleaseManifest> | null
  if (!m || typeof m !== "object" || m.v !== MANIFEST_VERSION || !Array.isArray(m.files) || !Array.isArray(m.pages)) return null
  for (const f of m.files) {
    if (!f || typeof f.path !== "string" || typeof f.sha256 !== "string" || !SHA.test(f.sha256)) return null
  }
  for (const p of m.pages) if (!p || typeof p.page_key !== "string") return null
  return m as ReleaseManifest
}

/**
 * THE FILES IN GROUPS, EACH NAMED BY WHAT IT HOLDS. A data cache entry is
 * kept only up to about 2 MB, and a theme is several, so one entry per
 * theme would never be kept; one per file is hundreds of reads of the cache
 * on a cold server. A group is the files whose sha256 falls in one slice,
 * sized to about a megabyte, and its key is the sha256 of its members'
 * sha256s: the same files make the same key, in any release of any website,
 * so a publish that changed one file reads one group again, not the theme.
 */
export const GROUP_TARGET_BYTES = 1_000_000

export interface BlobGroup {
  key: string
  shas: string[]
}

export function blobGroups(files: ReleaseFile[], target = GROUP_TARGET_BYTES): BlobGroup[] {
  const unique = new Map<string, number>()
  for (const f of files) unique.set(f.sha256, Math.max(0, Number(f.size) || 0))
  let total = 0
  for (const n of unique.values()) total += n
  /* A power of two up to 256 slices, by the first four hex digits of the sha256. */
  let count = 1
  while (count < 256 && total / count > target) count *= 2
  const slices = new Map<number, string[]>()
  for (const sha of [...unique.keys()].sort()) {
    const at = parseInt(sha.slice(0, 4), 16) % count
    const list = slices.get(at) ?? []
    list.push(sha)
    slices.set(at, list)
  }
  return [...slices.keys()].sort((a, b) => a - b).map((at) => {
    const shas = slices.get(at)!
    return { key: sha256Hex(`${count}:${shas.join(",")}`), shas }
  })
}

/** The files of a release, path to text, from its blobs. Null when any blob is missing or is not what its sha256 says: the rows are drawn instead. */
export function filesOf(manifest: ReleaseManifest, blobs: Map<string, string> | Record<string, string>): Record<string, string> | null {
  const get = blobs instanceof Map ? (sha: string) => blobs.get(sha) : (sha: string) => (blobs as Record<string, string>)[sha]
  const out: Record<string, string> = {}
  for (const f of manifest.files) {
    const text = get(f.sha256)
    if (typeof text !== "string") return null
    out[f.path] = text
  }
  return out
}

/** The release's live settings row, as the readers take it (preview-link.ts themeSettings). */
export const settingsRowOf = (manifest: ReleaseManifest) => ({ settings: manifest.settings ?? null, draft_settings: null })

/** The release's page rows, as the readers take them (preview-link.ts pageSections): the live half only. */
export const pageRowsOf = (manifest: ReleaseManifest) => manifest.pages.map((p) => ({ page_key: p.page_key, sections: p.sections ?? null, draft_sections: null }))

/** Releases kept per website. Older ones are deleted after a publish (pruneReleases). */
export const RELEASES_KEPT = 20

// ── Going back to one (SQL part 186) ────────────────────────────────────────

/** A published version as Backups & Versions lists it. */
export interface ReleaseListItem {
  id: string
  createdAt: string
  files: number
  /** Made by restoring an earlier version, not by Publish. */
  restored: boolean
  /** What the live website is drawn from now. */
  live: boolean
}

export interface ReleaseRow {
  id: string
  created_at: string
  file_count?: number | null
  restored_from?: string | null
}

/**
 * The list, newest first. Only the release the pointer names is "live", and
 * only while this website is the published one: after an edit outside
 * Publish the pointer is cleared (part 180's trigger) and no version is
 * what the website shows exactly, so none says so.
 */
export function releaseList(rows: ReleaseRow[], liveReleaseId: string | null | undefined, installLive: boolean): ReleaseListItem[] {
  return [...rows]
    .filter((r) => r && typeof r.id === "string" && typeof r.created_at === "string")
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      files: Math.max(0, Number(r.file_count) || 0),
      restored: typeof r.restored_from === "string" && r.restored_from !== "",
      live: installLive && !!liveReleaseId && r.id === liveReleaseId,
    }))
}

export type RollbackFailure = "missing" | "not_found" | "unreadable" | "failed"

/**
 * Why `rollback_site_release` refused, from its error: the function not
 * there (part 186 not run), a release that is not this website's (P0002),
 * one it cannot put back whole (22023: unreadable, or a file's text gone),
 * or anything else.
 */
export function rollbackFailure(error: { code?: string; message?: string } | null | undefined): RollbackFailure {
  const code = error?.code ?? ""
  if (["PGRST202", "42883", "42P01", "42703", "PGRST205"].includes(code) || /could not find the function/i.test(error?.message ?? "")) return "missing"
  if (code === "P0002") return "not_found"
  if (code === "22023") return "unreadable"
  return "failed"
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isReleaseId = (value: unknown): value is string => typeof value === "string" && UUID.test(value)
