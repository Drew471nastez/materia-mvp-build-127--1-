/**
 * ===========================================================================
 *  RELEASES: WRITTEN ON PUBLISH, READ BY THE LIVE WEBSITE
 * ===========================================================================
 * What a release is, and why, is ./site-releases.ts. This is the database
 * half (SQL part 180):
 *
 *   recordRelease   after a Publish (the publish route, once the answer has
 *                   gone): the live rows read, hashed here, the new blobs
 *                   written, the release row, then the pointer. Best effort:
 *                   it never fails a Publish, and when it fails the website
 *                   is drawn from its rows exactly as before.
 *   pruneReleases   the newest RELEASES_KEPT of a website kept, older ones
 *                   deleted. Blobs are left (see below).
 *   livePointer     which release a creator's published website is drawn
 *                   from: the one read held under the site's tag, briefly.
 *   releaseManifest a release's manifest, held for good: it never changes.
 *   releaseFiles    its files, read in groups named by their sha256s
 *                   (blobGroups), each held for good.
 *
 * KEPT HONEST BY THE DATABASE. A live file, setting or page changed any way
 * but a Publish (a file deleted or renamed in the code editor, a live
 * setting saved) makes the trigger `site_live_release_forget` clear the
 * pointer and count `rev` up, so the website goes back to its rows. A
 * release is pointed at only when `rev` has not moved since the rows were
 * read for it, so an edit that lands while a release is being written is
 * never hidden behind it.
 *
 * BEFORE PART 180 RUNS the tables are not there: every read here answers
 * "no release" and is not asked again for a few minutes on this server
 * (releasesMissing, as marketsMissing in lib/markets/server.ts), and the
 * website is drawn from its rows exactly as before.
 *
 * BLOBS ARE NOT DELETED. A blob is shared by every release and website with
 * the same text, so knowing one is unused means reading every manifest, and
 * a publish writing at the same moment may already be counting on it being
 * there. Pruning releases keeps the table of releases small; the blobs only
 * grow by text that is new to Storelib. Collecting them belongs in a nightly
 * job that can take a lock, not in a publish.
 */
import { revalidateTag, unstable_cache } from "next/cache"
import { gunzipSync, gzipSync } from "node:zlib"
import { PUBLISHED_HOLD_S } from "@/lib/delivery/holds"
import { createAdminClient } from "@/lib/supabase/admin"
import { keyedAs } from "./last-good"
import { blobGroups, buildManifest, filesOf, readManifest, releaseList, RELEASES_KEPT, rollbackFailure, sha256Hex, type ReleaseListItem, type ReleaseManifest, type ReleasePage, type RollbackFailure } from "./site-releases"
import { logEvent } from "@/lib/net/log"
import { refsOn, resolveRefs, withRefColumn } from "./theme-file-refs"

type DbError = { code?: string; message?: string } | null
type Result<T = unknown> = { data: T; error: DbError }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from(table: string): any }

/** Part 180 has not run: a table, or the link between two, is not there (or not in the API's schema cache yet). */
export function releasesMissing(error: DbError | undefined): boolean {
  if (!error) return false
  return ["42P01", "PGRST205", "PGRST204", "PGRST200", "42703"].includes(error.code ?? "") || /does not exist|schema cache|relationship/i.test(error.message ?? "")
}

/* Known missing on this server, until then: nothing is asked again in the meantime. */
let missingUntil = 0
const MISSING_WAIT_MS = 5 * 60_000
export const releasesKnownMissing = (now = Date.now()) => now < missingUntil
function noteMissing(now = Date.now()) {
  missingUntil = now + MISSING_WAIT_MS
}
/** For the tests: forget that the tables were missing. */
export function resetReleasesMissing() {
  missingUntil = 0
}

/** How long the pointer is held. Only Publish, a restore and an unpublish move it, and each clears it at once through the site's tag (round 54: an hour, lib/delivery/holds.ts). */
export const POINTER_HOLD_S = PUBLISHED_HOLD_S

export interface LivePointer {
  installId: string
  releaseId: string
}

/**
 * The creator's published install and the release it is drawn from, in one
 * read (the pointer embedded in the install). Null: no published install,
 * no release yet, or part 180 not run. Throws when the database did not
 * answer, so a failed read is never held (the caller draws from the rows).
 */
export async function readLivePointer(db: Db, creatorId: string): Promise<LivePointer | null> {
  if (releasesKnownMissing()) return null
  const r: Result = await db
    .from("store_theme_installs")
    .select("id, site_live_releases ( release_id )")
    .eq("creator_id", creatorId)
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (r.error) {
    if (releasesMissing(r.error)) {
      noteMissing()
      return null
    }
    throw new Error(`release pointer: ${r.error.message ?? r.error.code ?? "the read failed"}`)
  }
  const row = r.data as { id?: string; site_live_releases?: { release_id?: string | null } | { release_id?: string | null }[] | null } | null
  if (!row?.id) return null
  const link = Array.isArray(row.site_live_releases) ? row.site_live_releases[0] : row.site_live_releases
  const releaseId = link?.release_id
  return typeof releaseId === "string" && releaseId ? { installId: row.id, releaseId } : null
}

/** The pointer's own tag, beside the site's: only it is expired when Publish's release is pointed at (releasePointed). */
export const releasePointerTag = (creatorId: string) => `site-release-pointer:${creatorId}`

/**
 * THE RELEASE IS LIVE, SO EVERY SERVER MAY DRAW FROM IT (round AM). Publish
 * clears the site's caches, then writes its release a few seconds later
 * (recordRelease, after the answer). A page drawn in between read the
 * pointer while the trigger had let go of it, and every server kept that
 * "no release" for the pointer's hour: each new server read every file of
 * the theme from the database, a few megabytes, instead of the release's
 * files every server already keeps. Only the pointer is let go here: the
 * held pages stay (the release is those very rows), and the page's marker
 * is the rows' count, which pointing at the release does not change
 * (./live-release.ts), so no page in a browser reloads for it.
 */
export function releasePointed(creatorId: string): void {
  try {
    revalidateTag(releasePointerTag(creatorId), { expire: 0 })
  } catch (e) {
    /* Outside a request (a script): the pointer's own hold runs out instead. */
    logEvent("warn", "site_release_pointer_not_cleared", { msg: "[site-releases] the release pointer was not cleared", reason: e instanceof Error ? e.message : String(e) })
  }
}

/** The pointer, held under the site's tags for a minute. Null on any failure: the rows are drawn instead, as before releases. */
export async function livePointer(creatorId: string, tags: string[]): Promise<LivePointer | null> {
  if (releasesKnownMissing()) return null
  try {
    /* Named to outlive a deploy (./last-good.ts keyedAs): a cold server reads the pointer every server kept, served stale when the read fails, instead of falling back to the rows (EVD-1). */
    return await unstable_cache(keyedAs("site-live-release:v1", () => readLivePointer(createAdminClient(), creatorId)), ["site-live-release", creatorId], { tags: [...tags, releasePointerTag(creatorId)], revalidate: POINTER_HOLD_S })()
  } catch (e) {
    /* The site is still drawn, from the rows: a warning. */
    logEvent("warn", "site_release_pointer_unread", { msg: "[site-releases] the live release could not be read, drawing from the rows", reason: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/* What this server already read: a release never changes, so nothing here goes stale. */
const manifestsHeld = new Map<string, ReleaseManifest>()
const MANIFESTS_MAX = 50

export async function readReleaseManifest(db: Db, releaseId: string): Promise<ReleaseManifest | null> {
  const r: Result = await db.from("site_releases").select("manifest").eq("id", releaseId).maybeSingle()
  if (r.error) throw new Error(`release: ${r.error.message ?? r.error.code ?? "the read failed"}`)
  return readManifest((r.data as { manifest?: unknown } | null)?.manifest ?? null)
}

/*
  ===========================================================================
   HELD FOR GOOD, COMPRESSED (round AP)
  ===========================================================================
  Production, Nov 8 to 9: "Failed to set Next.js data cache ... items over
  2MB can not be cached (2620744 bytes)", 180 times in a day, on an imported
  theme's live pages (/collections/all, /cart.js, a product) and on the same
  website's /robots.txt and /favicon.ico. The one entry those routes share is
  a release's (its manifest and its groups of file text): one of them was
  2.6 MB as the data cache writes it, so it was never kept, and every server
  that started read it from the database again on its first page, the read
  production logged taking "longer than 20s" when the database was slow.
  Kept gzipped (theme text and section JSON shrink several times over), under
  a new name so an entry of the old shape is never read as this one.
*/
type Packed = { gz: string }
export function packHeld(value: unknown): Packed {
  return { gz: gzipSync(Buffer.from(JSON.stringify(value), "utf8")).toString("base64") }
}
export function unpackHeld<T>(packed: Packed | null | undefined): T | null {
  if (!packed || typeof packed.gz !== "string") return null
  return JSON.parse(gunzipSync(Buffer.from(packed.gz, "base64")).toString("utf8")) as T
}

/** A release's manifest, held for good (in the data cache, and on this server). Null when it cannot be read. */
export async function releaseManifest(releaseId: string): Promise<ReleaseManifest | null> {
  const hit = manifestsHeld.get(releaseId)
  if (hit) return hit
  try {
    /* A release never changes, so its entry is named to outlive a deploy (./last-good.ts keyedAs, EVD-1). */
    const held = await unstable_cache(keyedAs("site-release:v2", async () => { const read = await readReleaseManifest(createAdminClient(), releaseId); return read ? packHeld(read) : null }), ["site-release", "v2", releaseId], { revalidate: false })()
    const m = unpackHeld<ReleaseManifest>(held)
    if (m) {
      if (manifestsHeld.size >= MANIFESTS_MAX) manifestsHeld.delete(manifestsHeld.keys().next().value as string)
      manifestsHeld.set(releaseId, m)
    }
    return m
  } catch (e) {
    console.error("[site-releases] a release could not be read, drawing from the rows:", e instanceof Error ? e.message : e)
    return null
  }
}

const BLOB_READ_CHUNK = 60

/** Blobs by sha256, every one or a throw: a group held with a blob missing would be a theme with a file missing, for good. */
export async function readBlobs(db: Db, shas: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (let i = 0; i < shas.length; i += BLOB_READ_CHUNK) {
    const chunk = shas.slice(i, i + BLOB_READ_CHUNK)
    const r: Result = await db.from("theme_file_blobs").select("sha256, content").in("sha256", chunk)
    if (r.error) throw new Error(`theme blobs: ${r.error.message ?? r.error.code ?? "the read failed"}`)
    for (const row of (r.data ?? []) as { sha256: string; content: string }[]) {
      /* Checked against its own name once, on the way into the cache. */
      if (typeof row.content === "string" && sha256Hex(row.content) === row.sha256) out[row.sha256] = row.content
    }
  }
  const missing = shas.filter((s) => !(s in out))
  if (missing.length) throw new Error(`theme blobs: ${missing.length} not there`)
  return out
}

/**
 * A release's files, path to text. Each group of blobs is held for good
 * under the sha256 of its members, so a cold server reads the data cache,
 * not the database, and a group already read for another release (an
 * unchanged file, another website with the same theme) is read once. Null
 * when any group cannot be read: the rows are drawn instead.
 */
export async function releaseFiles(manifest: ReleaseManifest): Promise<Record<string, string> | null> {
  const groups = blobGroups(manifest.files)
  const blobs = new Map<string, string>()
  try {
    /* A few groups at a time: a large theme is up to 256 of them. */
    for (let i = 0; i < groups.length; i += 8) {
      const read = await Promise.all(groups.slice(i, i + 8).map((g) =>
        /* Named by what they hold (their sha256s) and by a fixed label, not the function's minified text, so a deploy does not send every server back to the database for every theme (EVD-1). */
        unstable_cache(keyedAs("theme-blobs:v2", async () => packHeld(await readBlobs(createAdminClient(), g.shas))), ["theme-blobs", "v2", g.key], { revalidate: false })().then((held) => unpackHeld<Record<string, string>>(held) ?? {}),
      ))
      for (const part of read) for (const [sha, text] of Object.entries(part)) blobs.set(sha, text)
    }
  } catch (e) {
    console.error("[site-releases] a release's files could not be read, drawing from the rows:", e instanceof Error ? e.message : e)
    return null
  }
  return filesOf(manifest, blobs)
}

/** The live release a creator's website is drawn from: its id and manifest, for the published install `installId`. Null: draw from the rows. */
export async function liveRelease(creatorId: string, installId: string | null, tags: string[]): Promise<{ id: string; installId: string; manifest: ReleaseManifest } | null> {
  const pointer = await livePointer(creatorId, tags)
  if (!pointer || (installId !== null && pointer.installId !== installId)) return null
  const manifest = await releaseManifest(pointer.releaseId)
  return manifest ? { id: pointer.releaseId, installId: pointer.installId, manifest } : null
}

// ── Writing ──────────────────────────────────────────────────────────────────

/** Every live file of an install, the half a visitor is shown. Paged as compat-site.ts installFiles reads them. */
async function liveFiles(db: Db, installId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const page = 1000
  /* Round 27: a website's unchanged files may be references to the blobs (./theme-file-refs.ts), resolved before they are hashed. */
  const cols = withRefColumn("path, content", await refsOn())
  for (let from = 0; from < 20_000; from += page) {
    const r: Result = await db.from("store_theme_custom_files").select(cols).eq("install_id", installId).order("path").range(from, from + page - 1)
    if (r.error) throw new Error(`theme files: ${r.error.message ?? r.error.code ?? "the read failed"}`)
    const rows = await resolveRefs((r.data ?? []) as { path: string; content: string | null; blob_sha256?: string | null }[])
    for (const row of rows) if (typeof row.content === "string" && row.content !== "") out[row.path] = row.content
    if (rows.length < page) break
  }
  return out
}

/* One request's worth of new blobs: well under what the API takes in one body. */
const BLOB_WRITE_BYTES = 1_000_000
const BLOB_WRITE_ROWS = 100

export type RecordResult =
  | { ok: true; releaseId: string; live: boolean; files: number; newBlobs: number }
  | { ok: false; reason: "missing" | "failed"; detail: string }

/**
 * The live rows of an install, kept as a release, and the website pointed at
 * it. Called after a successful Publish; never throws.
 *
 * `live` is false when something changed the live rows while this ran (the
 * trigger counted `rev` up): the release is kept for the record and the
 * website stays drawn from its rows until the next Publish.
 */
export async function recordRelease(db: Db, input: { installId: string; creatorId: string }): Promise<RecordResult> {
  const { installId, creatorId } = input
  const fail = (error: DbError | Error | unknown, what: string): RecordResult => {
    const e = error as DbError
    if (e && typeof e === "object" && releasesMissing(e)) {
      noteMissing()
      return { ok: false, reason: "missing", detail: what }
    }
    return { ok: false, reason: "failed", detail: `${what}: ${(e as { message?: string } | null)?.message ?? String(error)}` }
  }
  try {
    /* The pointer row first, and its count read before the rows are: a change after this moves it. */
    const made: Result = await db.from("site_live_releases").upsert({ install_id: installId, creator_id: creatorId }, { onConflict: "install_id", ignoreDuplicates: true })
    if (made.error) return fail(made.error, "pointer")
    const at: Result<{ rev?: number | string } | null> = await db.from("site_live_releases").select("rev").eq("install_id", installId).maybeSingle()
    if (at.error || !at.data) return fail(at.error ?? { message: "no pointer row" }, "pointer")
    const rev = at.data.rev ?? 0

    const [settingsRead, pagesRead, files] = await Promise.all([
      db.from("store_theme_settings").select("settings").eq("install_id", installId).maybeSingle() as Promise<Result<{ settings?: unknown } | null>>,
      db.from("store_theme_pages").select("page_key, sections").eq("install_id", installId) as Promise<Result<ReleasePage[] | null>>,
      liveFiles(db, installId),
    ])
    if (settingsRead.error) return fail(settingsRead.error, "settings")
    if (pagesRead.error) return fail(pagesRead.error, "pages")
    const { manifest, blobs, totalBytes } = buildManifest({ settings: settingsRead.data?.settings ?? null, pages: pagesRead.data ?? [], files })

    /* Only the text Storelib does not hold yet is sent. */
    const shas = [...blobs.keys()]
    const have = new Set<string>()
    for (let i = 0; i < shas.length; i += BLOB_READ_CHUNK) {
      const r: Result<{ sha256: string }[] | null> = await db.from("theme_file_blobs").select("sha256").in("sha256", shas.slice(i, i + BLOB_READ_CHUNK))
      if (r.error) return fail(r.error, "blobs")
      for (const row of r.data ?? []) have.add(row.sha256)
    }
    const fresh = shas.filter((s) => !have.has(s))
    let batch: { sha256: string; content: string; size: number }[] = []
    let bytes = 0
    const flush = async (): Promise<RecordResult | null> => {
      if (!batch.length) return null
      const w: Result = await db.from("theme_file_blobs").upsert(batch, { onConflict: "sha256", ignoreDuplicates: true })
      batch = []
      bytes = 0
      return w.error ? fail(w.error, "blobs") : null
    }
    for (const sha of fresh) {
      const content = blobs.get(sha)!
      const size = Buffer.byteLength(content, "utf8")
      if (batch.length && (bytes + size > BLOB_WRITE_BYTES || batch.length >= BLOB_WRITE_ROWS)) {
        const failed = await flush()
        if (failed) return failed
      }
      batch.push({ sha256: sha, content, size })
      bytes += size
    }
    const failed = await flush()
    if (failed) return failed

    const made2: Result<{ id: string } | null> = await db
      .from("site_releases")
      .insert({ creator_id: creatorId, install_id: installId, manifest, file_count: manifest.files.length, total_bytes: totalBytes })
      .select("id")
      .single()
    if (made2.error || !made2.data) return fail(made2.error ?? { message: "no id" }, "release")
    const releaseId = made2.data.id

    /* Pointed at only if nothing changed the live rows since they were read. */
    const pointed: Result<{ install_id: string }[] | null> = await db
      .from("site_live_releases")
      .update({ release_id: releaseId, updated_at: new Date().toISOString() })
      .eq("install_id", installId)
      .eq("rev", rev)
      .select("install_id")
    if (pointed.error) return fail(pointed.error, "pointer")
    return { ok: true, releaseId, live: (pointed.data ?? []).length > 0, files: manifest.files.length, newBlobs: fresh.length }
  } catch (e) {
    return fail(e, "release")
  }
}

/**
 * The newest `keep` releases of an install kept, and the one it is drawn
 * from whatever its age; the rest deleted. Never throws. Blobs stay (see the
 * top of this file).
 */
export async function pruneReleases(db: Db, installId: string, keep = RELEASES_KEPT): Promise<number> {
  try {
    const [old, live] = await Promise.all([
      db.from("site_releases").select("id").eq("install_id", installId).order("created_at", { ascending: false }).range(keep, keep + 499) as Promise<Result<{ id: string }[] | null>>,
      db.from("site_live_releases").select("release_id").eq("install_id", installId).maybeSingle() as Promise<Result<{ release_id?: string | null } | null>>,
    ])
    if (old.error || live.error) return 0
    const doomed = (old.data ?? []).map((r) => r.id).filter((id) => id !== live.data?.release_id)
    if (!doomed.length) return 0
    const del: Result = await db.from("site_releases").delete().eq("install_id", installId).in("id", doomed)
    return del.error ? 0 : doomed.length
  } catch {
    return 0
  }
}

// ── Going back to one (SQL part 188) ────────────────────────────────────────

export type ReleaseListResult = { available: false } | { available: true; releases: ReleaseListItem[] }

/**
 * A website's published versions, newest first, for Backups & Versions.
 * `available: false` until parts 180 and 188 have both run (the list reads
 * part 188's `restored_from`), so the list hides itself rather than offering
 * a restore that cannot happen. Not noted as missing for the live website's
 * reads (noteMissing): part 180 alone is enough for those. Throws when the
 * database did not answer.
 */
export async function listReleases(db: Db, installId: string, installLive: boolean): Promise<ReleaseListResult> {
  const [rows, live] = await Promise.all([
    db
      .from("site_releases")
      .select("id, created_at, file_count, restored_from")
      .eq("install_id", installId)
      .order("created_at", { ascending: false })
      .limit(RELEASES_KEPT) as Promise<Result<{ id: string; created_at: string; file_count: number | null; restored_from: string | null }[] | null>>,
    db.from("site_live_releases").select("release_id").eq("install_id", installId).maybeSingle() as Promise<Result<{ release_id?: string | null } | null>>,
  ])
  if (rows.error) {
    if (releasesMissing(rows.error)) return { available: false }
    throw new Error(`releases: ${rows.error.message ?? rows.error.code ?? "the read failed"}`)
  }
  if (live.error && !releasesMissing(live.error)) throw new Error(`release pointer: ${live.error.message ?? live.error.code ?? "the read failed"}`)
  return { available: true, releases: releaseList(rows.data ?? [], live.data?.release_id ?? null, installLive) }
}

export type RollbackResult =
  | { ok: true; releaseId: string; wasLive: string[]; files: { path: string; content: string }[] }
  | { ok: false; reason: RollbackFailure; detail: string }

type RpcDb = { rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result> }

/**
 * An earlier release put live again, in one transaction
 * (`rollback_site_release`, SQL part 188): its settings, pages and files
 * written back into the live rows with the drafts cleared, this website
 * switched live as Publish switches it, and the same manifest kept as a new
 * release the website is pointed at. The rows and the pointer then say the
 * same thing, so an edit afterwards that clears the pointer changes nothing
 * a visitor sees. Under Publish's own lock, so the two wait for each other.
 * Never throws.
 */
export async function rollbackRelease(db: RpcDb, input: { installId: string; creatorId: string; releaseId: string }): Promise<RollbackResult> {
  try {
    const r = await db.rpc("rollback_site_release", { p_install: input.installId, p_creator: input.creatorId, p_release: input.releaseId })
    if (r.error) return { ok: false, reason: rollbackFailure(r.error), detail: r.error.message ?? r.error.code ?? "refused" }
    const data = (r.data ?? {}) as { release_id?: unknown; was_live?: unknown; files?: unknown }
    if (typeof data.release_id !== "string") return { ok: false, reason: "failed", detail: "no release id" }
    const files = (Array.isArray(data.files) ? data.files : []).filter(
      (f): f is { path: string; content: string } => !!f && typeof (f as { path?: unknown }).path === "string" && typeof (f as { content?: unknown }).content === "string",
    )
    const wasLive = (Array.isArray(data.was_live) ? data.was_live : []).filter((id): id is string => typeof id === "string")
    return { ok: true, releaseId: data.release_id, wasLive, files }
  } catch (e) {
    return { ok: false, reason: "failed", detail: e instanceof Error ? e.message : String(e) }
  }
}
