import "server-only"

/**
 * ===========================================================================
 *  A STORE'S FILES: EVERY PICTURE IT HAS UPLOADED, IN ONE PLACE
 * ===========================================================================
 * Read straight from storage, where the pictures already are, so nothing has
 * to be copied or kept in step:
 *
 *   store-builder-images   <user id>/<folder>/<file>     the website builder,
 *                                                         the creator page and
 *                                                         this library's own uploads
 *   product-images         <creator id>/<product>/<file> product photos
 *
 * Only the caller's own folders are ever listed or touched. Addresses are
 * Storelib's /media/ ones (lib/storage/media-url), never the storage host.
 *
 * REMOVING IS NOT DELETING. "Remove from Files" marks the file removed in
 * `library_assets` (lib/files/assets.ts) and leaves the object where it is,
 * so a store logo, a receipt, a website section, a product photo, a course
 * video or a checkout icon that still points at the address keeps drawing.
 * The list stops showing it. A removed file the daily cron finds nothing
 * pointing at is collected thirty days later
 * (lib/files/cleanup-removed.ts). A permanent delete is its own call, with
 * its own confirmation, after the person has read where the file is used
 * (lib/files/references.ts).
 */
import { mediaUrl } from "@/lib/storage/media-url"
import { isPosterName, posterPathFor, videoDuration } from "@/lib/media/video"
import { NEEDS_PART, markPurged, removeAssets, removedAssetIds, restoreAssets } from "./assets"
import { collectable, findUsesMany, type UsesResult } from "./references"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any

export type LibraryBucket = "store-builder-images" | "product-images"
export const LIBRARY_FOLDER = "files"
export const MAX_LIBRARY_FILES = 600

export interface LibraryFile {
  /** bucket:path, the file's name for the API. */
  id: string
  bucket: LibraryBucket
  path: string
  name: string
  url: string
  bytes: number | null
  type: string | null
  createdAt: string | null
  /** Where it came from: "Website", "Product photos", "Library". */
  source: string
  /** A video's first frame, stored beside it at upload (lib/files/upload-video.ts), or null. */
  poster?: string | null
  /** A video's length in seconds, from its stored name, or null. */
  duration?: number | null
}

type Entry = { name: string; id: string | null; created_at?: string | null; metadata?: { size?: number; mimetype?: string } | null }

async function list(admin: Admin, bucket: LibraryBucket, prefix: string): Promise<Entry[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } })
  if (error) return []
  return (data ?? []) as Entry[]
}

const isFolder = (e: Entry) => e.id === null && !e.metadata

/**
 * An entry that is there in the listing but has nothing a tile can draw,
 * left out rather than shown as a broken picture ("some tiles show broken
 * image icons"):
 *
 *   empty       0 bytes: an upload that was cut off. Its address answers
 *               with nothing.
 *   hidden      a name starting with a dot (storage's .emptyFolderPlaceholder).
 *   HEIC/HEIF   a phone photo stored as it was taken, whatever its name:
 *               neither the resizer nor most browsers can open it.
 *
 * Anything else that still will not draw (a file whose bytes are not what
 * its name says) is the tile's to handle: a clean placeholder with its type,
 * and gone from the list when its address answers not found
 * (components/files/files-library.tsx).
 */
function drawable(e: Entry): boolean {
  if (e.name.startsWith(".")) return false
  const size = e.metadata?.size
  if (typeof size === "number" && size <= 0) return false
  return !/^image\/hei[cf]/i.test(e.metadata?.mimetype ?? "")
}

const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i
/* The folder a product's videos go into (lib/files/upload-video.ts): listed with the product photos. */
const PRODUCTS_FOLDER = "products"
/* What the builder's video field uploads (components/website-builder/editor/controls/video-picker-control.tsx). */
const VIDEO = /\.(mp4|webm|mov|m4v)$/i

/** Pictures, the videos a video setting can play, or both (Files itself, a product's photos and videos). */
export type LibraryKind = "image" | "video" | "media"

function toFile(admin: Admin, bucket: LibraryBucket, path: string, e: Entry, source: string): LibraryFile {
  const { data } = admin.storage.from(bucket).getPublicUrl(path)
  /* The storage client builds the address with encodeURI, which leaves # and ? as they are: a name with either was cut short there and answered 400. */
  const publicUrl = (data.publicUrl as string).replace(/#/g, "%23").replace(/\?/g, "%3F")
  return {
    id: `${bucket}:${path}`,
    bucket,
    path,
    name: e.name,
    url: mediaUrl(publicUrl),
    bytes: e.metadata?.size ?? null,
    type: e.metadata?.mimetype ?? null,
    createdAt: e.created_at ?? null,
    source,
  }
}

/** Every picture the store has (or every video, or both, with `kind`), newest first. */
export async function listLibrary(admin: Admin, owner: { userId: string; creatorId: string }, kind: LibraryKind = "image"): Promise<LibraryFile[]> {
  const out: LibraryFile[] = []
  const images = kind !== "video"
  const videos = kind !== "image"
  /* Files the owner has taken out of the list. The objects are still there,
     for everything that still points at them; this is the only place the
     list leaves them out (lib/files/assets.ts). Without SQL part 222 the
     list is as it was. */
  const { ids: removed } = await removedAssetIds(admin, owner)
  const gone = (bucket: LibraryBucket, path: string) => removed.size > 0 && removed.has(`${bucket}:${path}`)
  const builderFolders = (await list(admin, "store-builder-images", owner.userId)).filter(isFolder)
  const builder = await Promise.all(builderFolders.slice(0, 40).map(async (f) => ({ folder: f.name, entries: await list(admin, "store-builder-images", `${owner.userId}/${f.name}`) })))
  for (const { folder, entries } of builder) {
    const source = folder === LIBRARY_FOLDER ? "Library" : folder === PRODUCTS_FOLDER ? "Product photos" : "Website"
    /* A video's first frame is part of the video, not a picture of its own. */
    const posters = new Set(entries.filter((e) => isPosterName(e.name) && drawable(e)).map((e) => e.name))
    for (const e of entries) {
      if (isFolder(e) || !drawable(e) || isPosterName(e.name)) continue
      const path = `${owner.userId}/${folder}/${e.name}`
      if (gone("store-builder-images", path)) continue
      if (images && IMAGE.test(e.name)) out.push(toFile(admin, "store-builder-images", path, e, source))
      else if (videos && VIDEO.test(e.name)) {
        const file = toFile(admin, "store-builder-images", path, e, source)
        const posterName = posterPathFor(e.name)
        file.poster = posters.has(posterName) ? toFile(admin, "store-builder-images", posterPathFor(path), { ...e, name: posterName }, source).url : null
        file.duration = videoDuration(e.name)
        out.push(file)
      }
    }
  }
  /* Product photos are pictures only: the product-images bucket holds no video. */
  if (!images) return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MAX_LIBRARY_FILES)
  const productFolders = (await list(admin, "product-images", owner.creatorId)).filter(isFolder)
  const products = await Promise.all(productFolders.slice(0, 120).map(async (f) => ({ folder: f.name, entries: await list(admin, "product-images", `${owner.creatorId}/${f.name}`) })))
  for (const { folder, entries } of products) {
    for (const e of entries) {
      if (isFolder(e) || !IMAGE.test(e.name) || !drawable(e)) continue
      const path = `${owner.creatorId}/${folder}/${e.name}`
      if (gone("product-images", path)) continue
      out.push(toFile(admin, "product-images", path, e, "Product photos"))
    }
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MAX_LIBRARY_FILES)
}

/** A video's first frame goes with it (lib/files/upload-video.ts stores it beside the video). */
function withPoster(bucket: unknown, path: string): string[] {
  return bucket === "store-builder-images" && VIDEO.test(path) ? [path, posterPathFor(path)] : [path]
}

/** Whether a file is the caller's own: its path starts with their folder in that bucket. */
export function ownsFile(owner: { userId: string; creatorId: string }, bucket: unknown, path: unknown): path is string {
  if (typeof path !== "string" || path.includes("..") || path.includes("//") || !/^[A-Za-z0-9/_.-]{3,300}$/.test(path)) return false
  if (bucket === "store-builder-images") return path.startsWith(`${owner.userId}/`) && path.split("/").length === 3
  if (bucket === "product-images") return path.startsWith(`${owner.creatorId}/`) && path.split("/").length === 3
  return false
}

/** At most this many in one request: a page of selected files, not a whole bucket. */
export const MAX_DELETE_AT_ONCE = 100

/** Each file the caller named, checked, or the first one that is not theirs. */
function ownedList(owner: { userId: string; creatorId: string }, list: unknown): { ok: true; files: { bucket: LibraryBucket; path: string }[] } | { ok: false } {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DELETE_AT_ONCE) return { ok: false }
  const files: { bucket: LibraryBucket; path: string }[] = []
  for (const item of list) {
    const bucket = (item as { bucket?: unknown } | null)?.bucket
    const path = (item as { path?: unknown } | null)?.path
    if (!ownsFile(owner, bucket, path)) return { ok: false }
    files.push({ bucket: bucket as LibraryBucket, path })
  }
  return { ok: true, files }
}

/** The paths one request touches, per bucket: a video takes its first frame with it. */
function pathsByBucket(files: readonly { bucket: LibraryBucket; path: string }[]): Map<LibraryBucket, string[]> {
  const byBucket = new Map<LibraryBucket, string[]>()
  for (const f of files) {
    const paths = byBucket.get(f.bucket) ?? []
    for (const p of withPoster(f.bucket, f.path)) if (!paths.includes(p)) paths.push(p)
    byBucket.set(f.bucket, paths)
  }
  return byBucket
}

export type LibraryWriteFailure = { ok: false; error: string; status: number }

/**
 * ===========================================================================
 *  REMOVE FROM FILES: THE OBJECT STAYS
 * ===========================================================================
 * The row is marked removed (lib/files/assets.ts) and the list stops showing
 * the file. Nothing is deleted, so the store logo, the receipts, the
 * website, the product photos and the checkout icons that point at the
 * address all keep drawing. The bytes are collected thirty days later by the
 * daily cron, and only if both reference gates say nothing points at them
 * (lib/files/cleanup-removed.ts).
 *
 * WITHOUT SQL PART 222 there is nowhere to write "removed", so the old hard
 * delete is all that is available, and it is only allowed for a file the
 * reference gates agree nothing points at. Anything in use, and anything the
 * gates cannot answer for, refuses and says which part to run. It never
 * deletes something a page is using.
 */
export async function removeFromLibrary(
  admin: Admin,
  owner: { userId: string; creatorId: string },
  list: unknown,
): Promise<{ ok: true; removed: number; retained: boolean } | LibraryWriteFailure> {
  const owned = ownedList(owner, list)
  if (!owned.ok) return { ok: false, error: "That file was not found.", status: 404 }
  const uses = await findUsesMany(admin, owner, owned.files.map((f) => ({ id: `${f.bucket}:${f.path}`, bucket: f.bucket, path: f.path })))
  const written = await removeAssets(
    admin,
    owner,
    owned.files.map((f) => ({ bucket: f.bucket, path: f.path, uses: uses.get(`${f.bucket}:${f.path}`)?.total ?? null })),
  )
  if (written.ok) return { ok: true, removed: owned.files.length, retained: true }
  if (!written.needsPart) return { ok: false, error: "The file could not be removed. Try again in a moment.", status: 500 }

  /* No ledger: a hard delete, and only where nothing points at the file. */
  for (const f of owned.files) {
    const verdict = await collectable(admin, owner, f.bucket, f.path)
    if (!verdict.ok) {
      const where = verdict.uses.uses.map((u) => u.label).join(", ")
      return {
        ok: false,
        error: where ? `${f.path.split("/").pop()} is still used on ${where}. ${NEEDS_PART}` : NEEDS_PART,
        status: 409,
      }
    }
  }
  for (const [bucket, paths] of pathsByBucket(owned.files)) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) return { ok: false, error: "The file could not be removed.", status: 500 }
  }
  return { ok: true, removed: owned.files.length, retained: false }
}

/** Put files the owner removed earlier back in the list. The objects never went anywhere. */
export async function restoreToLibrary(admin: Admin, owner: { userId: string; creatorId: string }, list: unknown): Promise<{ ok: true; restored: number } | LibraryWriteFailure> {
  const owned = ownedList(owner, list)
  if (!owned.ok) return { ok: false, error: "That file was not found.", status: 404 }
  const paths: { bucket: string; path: string }[] = []
  for (const [bucket, list2] of pathsByBucket(owned.files)) for (const p of list2) paths.push({ bucket, path: p })
  const out = await restoreAssets(admin, owner, paths)
  if (!out.ok) return { ok: false, error: out.needsPart ? NEEDS_PART : "That could not be put back. Try again in a moment.", status: out.needsPart ? 409 : 500 }
  return { ok: true, restored: owned.files.length }
}

/**
 * ===========================================================================
 *  DELETE PERMANENTLY: THE BYTES GO
 * ===========================================================================
 * A different button with a different promise, so the words can be true.
 * The caller has to send `confirm: "permanent"`, which the dialog only
 * sends after it has shown where the file is used and what will empty.
 */
export async function purgeLibraryFiles(
  admin: Admin,
  owner: { userId: string; creatorId: string },
  list: unknown,
  confirmed: boolean,
): Promise<{ ok: true; removed: number } | LibraryWriteFailure> {
  const owned = ownedList(owner, list)
  if (!owned.ok) return { ok: false, error: "That file was not found.", status: 404 }
  if (!confirmed) return { ok: false, error: "Confirm the permanent delete first.", status: 400 }
  for (const [bucket, paths] of pathsByBucket(owned.files)) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) return { ok: false, error: "The file could not be deleted.", status: 500 }
  }
  const touched: { bucket: string; path: string }[] = []
  for (const [bucket, paths] of pathsByBucket(owned.files)) for (const p of paths) touched.push({ bucket, path: p })
  await removeAssets(admin, owner, touched.map((t) => ({ ...t })))
  await markPurged(admin, touched)
  return { ok: true, removed: owned.files.length }
}

/** Where each of these files is used, for the dialog that asks before a delete. */
export async function libraryUses(admin: Admin, owner: { userId: string; creatorId: string }, list: unknown): Promise<{ ok: true; uses: Record<string, UsesResult> } | LibraryWriteFailure> {
  const owned = ownedList(owner, list)
  if (!owned.ok) return { ok: false, error: "That file was not found.", status: 404 }
  const found = await findUsesMany(admin, owner, owned.files.map((f) => ({ id: `${f.bucket}:${f.path}`, bucket: f.bucket, path: f.path })))
  const uses: Record<string, UsesResult> = {}
  for (const [id, result] of found) uses[id] = result
  return { ok: true, uses }
}

/* The old names, kept so nothing that imports them breaks. Both now remove
   from the list and keep the object. */
export async function deleteLibraryFile(admin: Admin, owner: { userId: string; creatorId: string }, bucket: unknown, path: unknown): Promise<{ ok: true } | LibraryWriteFailure> {
  const out = await removeFromLibrary(admin, owner, [{ bucket, path }])
  return out.ok ? { ok: true } : out
}

export async function deleteLibraryFiles(admin: Admin, owner: { userId: string; creatorId: string }, list: unknown): Promise<{ ok: true; removed: number } | LibraryWriteFailure> {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DELETE_AT_ONCE) return { ok: false, error: "Choose the files to remove.", status: 400 }
  const out = await removeFromLibrary(admin, owner, list)
  return out.ok ? { ok: true, removed: out.removed } : out
}
