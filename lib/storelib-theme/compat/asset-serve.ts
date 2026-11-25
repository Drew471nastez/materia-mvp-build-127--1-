/**
 * ===========================================================================
 *  A THEME'S FILES, ANSWERED WITHOUT A READ EACH (round AQ)
 * ===========================================================================
 * After every deploy a phone's first visit to an imported theme's page asked
 * for 42 scripts at /api/site-theme/assets/..., and each stayed open 5 to 6
 * seconds (andrewrullz.storelib.com, round AP). The addresses are already
 * hashes of the content and sent `immutable` for a year, so that is not why.
 * The reason is Vercel's own cache key: it includes the deployment
 * ("Each request to Vercel's CDN has a cache key derived from ... The unique
 * deployment URL", docs, Purging Vercel CDN cache, "Cache keys"; not
 * configurable). A function's answer is never kept from one deploy to the
 * next, however long it says it may be kept, so every file of every theme is
 * asked of a function again after each deploy, in each region, all at once.
 *
 * What each of those requests costs is what this file cuts:
 *
 *   ONE READ FOR MANY FILES. Requests for the same install that arrive within
 *   BATCH_MS of each other on one server are read together, one query for up
 *   to BATCH_MAX paths, instead of a query each.
 *
 *   NO READ FOR A FILE THIS SERVER ALREADY SERVED. An answer is kept in
 *   memory under its address, but only when the address is a content hash
 *   and the text read hashes to exactly it. The address names the bytes, so
 *   a kept answer can never be another version's: a file that changed has a
 *   new address, which is not kept until it is read. Bounded by size.
 *
 * Draft versions are never kept or batched with the live ones: they carry a
 * pass and read the draft column.
 */

import { resolveFileRows } from "@/lib/website-builder/theme-file-refs"

export type AssetRow = { path: string; content: string | null; draft_content?: string | null }

/** The part of the Supabase client the reads use. */
export interface AssetAdmin {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: string): {
        in(col: string, values: string[]): PromiseLike<{ data: unknown; error: unknown }>
      }
    }
  }
}

/** Requests that arrive this close together are read in one query. */
export const BATCH_MS = 4
/** At most this many paths in one query (each file asks for two: the plain name and its `.liquid`). */
export const BATCH_MAX = 120

type Batch = { paths: Set<string>; done: Promise<AssetRow[]>; fired: boolean }
const batches = new Map<string, Batch>()

/**
 * The rows for `paths` of one install, read together with the other
 * requests of the next BATCH_MS. A read that fails fails every request in
 * it, as each request's own read would have.
 */
export function readAssetRows(admin: AssetAdmin, installId: string, cols: string, paths: string[], wait = BATCH_MS): Promise<AssetRow[]> {
  const key = `${installId}\n${cols}`
  let b = batches.get(key)
  if (!b || b.fired || b.paths.size + paths.length > BATCH_MAX) {
    const paths0 = new Set<string>()
    let fire!: () => void
    const go = new Promise<void>((r) => (fire = r))
    const done = go.then(async () => {
      const { data, error } = await admin.from("store_theme_custom_files").select(cols).eq("install_id", installId).in("path", [...paths0])
      if (error) throw error
      /* Round 27: a reference row's text from the blobs (lib/website-builder/theme-file-refs.ts); rows with text as they are. */
      return resolveFileRows(admin as unknown as Parameters<typeof resolveFileRows>[0], (data ?? []) as AssetRow[])
    })
    const nb: Batch = { paths: paths0, done, fired: false }
    batches.set(key, nb)
    setTimeout(() => {
      nb.fired = true
      if (batches.get(key) === nb) batches.delete(key)
      fire()
    }, wait)
    b = nb
  }
  for (const p of paths) b.paths.add(p)
  const want = new Set(paths)
  return b.done.then((rows) => rows.filter((r) => want.has(r.path)))
}

/* ─────────────────── answers kept under their content address ─────────────────── */

export type KeptAnswer = { body: string | Uint8Array; type: string; cache: string }

/** About this many characters (or bytes) of answers kept per server. */
export const KEPT_MAX = 24_000_000
const kept = new Map<string, KeptAnswer>()
let keptSize = 0
const sizeOf = (a: KeptAnswer) => (typeof a.body === "string" ? a.body.length : a.body.byteLength)
const keyOf = (installId: string, version: string, name: string) => `${installId}\n${version}\n${name}`

/** The answer this server already gave at this address, if it was a content address. */
export function keptAnswer(installId: string, version: string, name: string): KeptAnswer | null {
  const k = keyOf(installId, version, name)
  const hit = kept.get(k)
  if (!hit) return null
  /* Most recently used last, so the oldest goes first. */
  kept.delete(k)
  kept.set(k, hit)
  return hit
}

/**
 * Keeps an answer, only when `version` is a content address and `current`
 * (the hash of what was just read) is exactly it. Anything else (a
 * `published_at` address, a draft, an address a moment behind a save) is
 * answered fresh every time, as before.
 */
export function keepAnswer(installId: string, version: string, name: string, current: string | null, answer: KeptAnswer, isContent: (v: string) => boolean): boolean {
  if (!isContent(version) || current !== version) return false
  const size = sizeOf(answer)
  if (size > KEPT_MAX / 8) return false
  const k = keyOf(installId, version, name)
  const old = kept.get(k)
  if (old) {
    keptSize -= sizeOf(old)
    kept.delete(k)
  }
  while (keptSize + size > KEPT_MAX && kept.size) {
    const first = kept.keys().next().value as string
    keptSize -= sizeOf(kept.get(first) as KeptAnswer)
    kept.delete(first)
  }
  kept.set(k, answer)
  keptSize += size
  return true
}

/** For the tests: forget every kept answer. */
export function forgetKeptAnswers(): void {
  kept.clear()
  keptSize = 0
}
