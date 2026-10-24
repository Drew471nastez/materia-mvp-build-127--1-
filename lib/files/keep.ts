import "server-only"

/**
 * ===========================================================================
 *  DELETE IN FILES TAKES A FILE OUT OF FILES, NEVER OUT OF A PRODUCT
 * ===========================================================================
 * Round 39, the owner: "if someone deletes files and those files are
 * associated with product photos across Storelib and things like this,
 * ensure we keep them even if they delete them from the files."
 *
 * Delete in Files (one, or several from Select) asks, for every file, whether
 * anything of the shop's still shows it:
 *
 *   1. the rows that name a file by place (lib/files/usage-server.ts usesIn):
 *      products, variants, website pages and theme settings, OnePages,
 *      collections, the profile, communities, store settings
 *   2. for a file none of those name, the catch-all the daily storage
 *      cleanup asks, every table with the owner's id in it
 *      (storage_object_referenced, run-now parts 18 and 280): a course
 *      lesson, a membership post, an email, a community post
 *
 * A file still in use is HIDDEN: its file_details row gets hidden_at (part
 * 280), Files and the builder's chooser stop listing it, and the stored
 * picture stays exactly where it is, so the product, the page or the
 * buyer's download that shows it is unchanged. A file nothing uses is
 * removed from storage, as before, with its frame (a video's poster) and its
 * file_details row.
 *
 * ON A DOUBT, KEEP. A table that exists but could not be read, or a
 * catch-all that answered with an error, keeps the file (hidden), never
 * removes it.
 *
 * BEFORE PART 280 there is no hidden_at to write: a file in use is kept and
 * stays in Files, and the answer says which and that part 280 lets Files
 * hide them. The catch-all is still asked (it then also counts a file's own
 * alt text as a use, which keeps a few files that could have gone, never
 * the other way). Nothing in use is ever removed.
 *
 * The daily cleanup (lib/storage/cleanup.ts) asks the same catch-all before
 * it removes a product photo, so a hidden file that something shows is never
 * swept; one nothing shows any more is, like any other.
 */
import { MAX_DELETE_AT_ONCE, deleteLibraryFiles, ownsFile, type LibraryBucket } from "./library"
import { usedByPhrase } from "./kept-words"
import { ELSEWHERE, hiddenColumnReady, loadUseSources, referencedAnywhere, usesIn, type FileUse } from "./usage-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any
type Owner = { userId: string; creatorId: string }

export interface KeptFile {
  id: string
  uses: FileUse[]
}

export type RemoveResult =
  | {
      ok: true
      /** Removed from storage: nothing used them. */
      deleted: string[]
      /** Taken out of Files, kept in storage: still shown somewhere. */
      hidden: KeptFile[]
      /** Still shown somewhere and still in Files, because part 280 has not run. */
      kept: KeptFile[]
    }
  | { ok: false; error: string; status: number }

/** How many catch-all questions run at once: a page of selected files, not a stampede. */
const AT_ONCE = 6

async function eachLimited<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const run = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, items.length) }, run))
}

export async function removeFromFiles(admin: Admin, owner: Owner, list: unknown): Promise<RemoveResult> {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DELETE_AT_ONCE) return { ok: false, error: "Choose the files to delete.", status: 400 }
  const files: { bucket: LibraryBucket; path: string; id: string }[] = []
  for (const item of list) {
    const bucket = (item as { bucket?: unknown } | null)?.bucket
    const path = (item as { path?: unknown } | null)?.path
    if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
    const id = `${bucket}:${path}`
    if (!files.some((f) => f.id === id)) files.push({ bucket: bucket as LibraryBucket, path, id })
  }

  const [src, ready] = await Promise.all([loadUseSources(admin, owner), hiddenColumnReady(admin)])
  const inUse = new Map<string, FileUse[]>()
  const free: typeof files = []
  for (const f of files) {
    const uses = usesIn(src, f.bucket, f.path)
    if (uses.length || src.doubt) inUse.set(f.id, uses)
    else free.push(f)
  }
  /*
    What no row names by place: the catch-all. Asked before part 280 too
    (AA3): a picture in a course lesson, an email or a community post is
    named by no row above, and removing it would leave that place blank.
    Before 280 the catch-all also counts a file's own alt text as a use, so
    a file with alt text is kept rather than removed: on a doubt, keep.
  */
  const clear: typeof files = []
  await eachLimited(free, async (f) => {
    const anywhere = await referencedAnywhere(admin, f.bucket, f.path)
    if (anywhere === true) inUse.set(f.id, [ELSEWHERE])
    else clear.push(f)
  })

  const deleted: string[] = []
  if (clear.length) {
    const gone = await deleteLibraryFiles(admin, owner, clear.map((f) => ({ bucket: f.bucket, path: f.path })))
    /* `=== false`, not `!gone.ok`: the push tests compile without strict, where only this narrows. */
    if (gone.ok === false) return { ok: false, error: gone.error, status: gone.status }
    deleted.push(...clear.map((f) => f.id))
    /* Their alt text goes with them. Best effort: a row left behind names nothing that exists. */
    for (const f of clear) {
      try {
        await admin.from("file_details").delete().eq("bucket", f.bucket).eq("path", f.path)
      } catch {
        /* nothing to tidy */
      }
    }
  }

  const keptList = files.filter((f) => inUse.has(f.id)).map((f) => ({ id: f.id, uses: inUse.get(f.id) ?? [] }))
  if (!keptList.length) return { ok: true, deleted, hidden: [], kept: [] }
  if (!ready) return { ok: true, deleted, hidden: [], kept: keptList }

  const now = new Date().toISOString()
  const rows = files.filter((f) => inUse.has(f.id)).map((f) => ({ bucket: f.bucket, path: f.path, creator_id: owner.creatorId, hidden_at: now, updated_at: now }))
  const { error } = await admin.from("file_details").upsert(rows, { onConflict: "bucket,path" })
  if (error) return { ok: true, deleted, hidden: [], kept: keptList }
  return { ok: true, deleted, hidden: keptList, kept: [] }
}

/** What Files says about the ones it kept and could not hide: where they show, in a few words. */
export function keptMessage(kept: KeptFile[]): string | null {
  if (!kept.length) return null
  const uses = kept.flatMap((k) => k.uses)
  if (!uses.length) return kept.length === 1 ? "This file could not be checked right now, so it stays. Try again in a moment." : `${kept.length} files could not be checked right now, so they stay. Try again in a moment.`
  const by = usedByPhrase(uses)
  const what = kept.length === 1 ? "This file is still used" : `${kept.length} files are still used`
  return `${what}${by ? ` by ${by}` : ""}, so ${kept.length === 1 ? "it stays" : "they stay"}. Run SQL part 280 in Supabase so Files can hide ${kept.length === 1 ? "it" : "them"} and keep ${kept.length === 1 ? "it" : "them"} there.`
}
