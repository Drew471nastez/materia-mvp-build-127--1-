/**
 * ===========================================================================
 *  THE LAST GOOD COPY EVERY SERVER CAN READ (EVD-1)
 * ===========================================================================
 * ./last-good.ts keeps a site's last good copy in this server's memory. A
 * server that has not served the site yet (a new deploy, a scale-out during
 * the very slowness that made the reads fail) has none, and its visitor got
 * "One moment": about 1,400 times in a week in production.
 *
 * This keeps the copy in Next's data cache instead, which every server of a
 * deployment reads (on Vercel, the shared Data Cache), under a FIXED name
 * (./last-good.ts keyedAs), so it also outlives a deploy. Nothing new to run:
 * no bucket, no table, no SQL.
 *
 *   keepShared   after a read that WORKED: the value, written at most every
 *                REFRESH_S per server (a fresh entry is left alone; a stale
 *                one is replaced behind the visitor, as Next refreshes any
 *                unstable_cache entry).
 *   sharedCopy   after a read that FAILED: the copy, or undefined. Its
 *                callback never produces a value, so a failed read never
 *                writes one.
 *
 * WHAT MAY GO IN: only what the live site already shows anybody on the
 * internet (the published site, its published files, the release pointer).
 * Never a draft, a preview, a cart or anything of the person visiting: the
 * callers keep a preview away from here, as they keep it away from the
 * in-memory copy.
 *
 * NEVER LONGER THAN THE LIVE SITE. Each copy carries the site's own tags
 * (creatorSiteTag, and creatorShopTag where it holds products), and Publish,
 * Unpublish and a take down expire those at once (revalidatePublishedSite,
 * `expire: 0`), so after one of them there is no copy until a read works
 * again. A copy is only ever served instead of an ERROR: a read that worked
 * and found nothing (a site taken down, a banned creator) is answered as it
 * always was.
 *
 * HOW NEXT KEEPS IT (next/dist/server/web/spec-extension/unstable-cache.js,
 * Next 16.1): an entry older than its revalidate is returned at once and
 * read again behind the visitor; when that read throws, the error is logged
 * and the stale entry is kept ("Return the stale value on error"). During an
 * ISR revalidation the read is awaited and the stale value returned on error.
 * Only an entry that is MISSING runs the callback in the foreground. So a
 * copy, once written, is there for every server until a tag expires it or
 * the cache evicts it. tests/rel-sites2.test.ts drives the real Next code.
 *
 * SIZE. Next refuses an entry over 2MB (incremental-cache/index.js, "items
 * over 2MB can not be cached"); a copy that big is not attempted
 * (SHARED_MAX), and a theme's files are kept in parts (keepSharedFiles).
 */
import { createHash } from "node:crypto"
import { unstable_cache } from "next/cache"
import { keyedAs } from "./last-good"

/** How often one server refreshes a copy, at most. Also the entry's revalidate. */
export const SHARED_REFRESH_S = 300
/** How long a copy is kept before it may be written again when nothing cleared it (round 54). */
export const SHARED_ENTRY_S = 3600
/** Characters of JSON a copy may be. Next's limit is 2MB of the entry, which holds the copy as an escaped JSON string. */
export const SHARED_MAX = 1_400_000
/** A part of a theme's files, in characters of JSON. */
export const FILES_PART_MAX = 700_000

class NoSharedCopy extends Error {
  constructor() {
    super("no shared copy (a failed read never writes one)")
    this.name = "NoSharedCopy"
  }
}

/* When this server last wrote each copy: written again only after SHARED_REFRESH_S. */
const written = new Map<string, number>()
const WRITTEN_MAX = 2000

function noteWritten(id: string, now: number) {
  written.delete(id)
  written.set(id, now)
  while (written.size > WRITTEN_MAX) {
    const oldest = written.keys().next().value
    if (oldest === undefined) break
    written.delete(oldest)
  }
}

function entry<T>(label: string, key: string[], tags: string[], produce: () => Promise<T>): Promise<T> {
  /* Rewritten hourly at most (round 54, Vercel cost): every five minutes a whole site's copy (up to 1.4MB) was written again per server. Its tags (the site's, the shop's) clear it at once on Publish and on every save. */
  return unstable_cache(keyedAs(`shared-copy:${label}`, produce), ["shared-copy", label, ...key], { tags, revalidate: SHARED_ENTRY_S })()
}

/** Keep `value` as the copy every server can read. Never throws: a copy not kept is not a page not served. True when it was handed to the cache. */
export async function keepShared<T>(label: string, key: string[], tags: string[], value: T, now = Date.now()): Promise<boolean> {
  const id = `${label}|${key.join("|")}`
  const at = written.get(id)
  if (at !== undefined && now - at < SHARED_REFRESH_S * 1000) return false
  let size = 0
  try {
    size = JSON.stringify(value)?.length ?? 0
  } catch {
    return false
  }
  noteWritten(id, now)
  if (size > SHARED_MAX) return false
  try {
    await entry(label, key, tags, async () => value)
    return true
  } catch {
    return false
  }
}

/** The copy every server can read, or undefined when there is none. Never writes one. */
export async function sharedCopy<T>(label: string, key: string[], tags: string[]): Promise<T | undefined> {
  try {
    return await entry<T>(label, key, tags, async () => {
      throw new NoSharedCopy()
    })
  } catch {
    return undefined
  }
}

/** For the tests: forget when copies were written on this server. */
export function resetSharedWrites(): void {
  written.clear()
}

/**
 * A theme's files (path to text), kept in parts each under FILES_PART_MAX:
 * a theme is a few megabytes and one entry may hold two. The parts are
 * named by a digest of the whole, and the index naming them is written
 * last, so an index never points at parts of another version.
 */
export async function keepSharedFiles(label: string, key: string[], tags: string[], files: Record<string, string>, now = Date.now()): Promise<boolean> {
  const id = `${label}|files|${key.join("|")}`
  const at = written.get(id)
  if (at !== undefined && now - at < SHARED_REFRESH_S * 1000) return false
  noteWritten(id, now)
  const paths = Object.keys(files).sort()
  const hash = createHash("sha256")
  const parts: Record<string, string>[] = []
  let part: Record<string, string> = {}
  let size = 0
  for (const path of paths) {
    const text = files[path]
    hash.update(path).update("\0").update(text).update("\0")
    const cost = JSON.stringify(path).length + JSON.stringify(text).length + 2
    if (size > 0 && size + cost > FILES_PART_MAX) {
      parts.push(part)
      part = {}
      size = 0
    }
    part[path] = text
    size += cost
  }
  if (size > 0 || parts.length === 0) parts.push(part)
  const digest = hash.digest("hex").slice(0, 32)
  /* A file bigger than an entry can hold is a theme that cannot be kept: nothing is written. */
  if (parts.some((p) => JSON.stringify(p).length > SHARED_MAX)) return false
  try {
    await Promise.all(parts.map((p, i) => entry(`${label}:part`, [...key, digest, String(i)], tags, async () => p)))
    await entry(label, key, tags, async () => ({ digest, parts: parts.length }))
    return true
  } catch {
    return false
  }
}

/** The files kept by keepSharedFiles, whole, or undefined when any part is not there. */
export async function sharedFiles(label: string, key: string[], tags: string[]): Promise<Record<string, string> | undefined> {
  const index = await sharedCopy<{ digest?: unknown; parts?: unknown }>(label, key, tags)
  if (!index || typeof index.digest !== "string" || typeof index.parts !== "number" || index.parts < 1) return undefined
  const digest = index.digest
  const parts = await Promise.all(Array.from({ length: index.parts }, (_, i) => sharedCopy<Record<string, string>>(`${label}:part`, [...key, digest, String(i)], tags)))
  if (parts.some((p) => !p || typeof p !== "object")) return undefined
  return Object.assign({}, ...parts) as Record<string, string>
}
