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
 * Only the caller's own folders are ever listed or deleted. Addresses are
 * Storelib's /media/ ones (lib/storage/media-url), never the storage host.
 */
import { mediaUrl } from "@/lib/storage/media-url"
import { isPosterName, posterPathFor, videoDuration } from "@/lib/media/video"

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
  const builderFolders = (await list(admin, "store-builder-images", owner.userId)).filter(isFolder)
  const builder = await Promise.all(builderFolders.slice(0, 40).map(async (f) => ({ folder: f.name, entries: await list(admin, "store-builder-images", `${owner.userId}/${f.name}`) })))
  for (const { folder, entries } of builder) {
    const source = folder === LIBRARY_FOLDER ? "Library" : folder === PRODUCTS_FOLDER ? "Product photos" : "Website"
    /* A video's first frame is part of the video, not a picture of its own. */
    const posters = new Set(entries.filter((e) => isPosterName(e.name) && drawable(e)).map((e) => e.name))
    for (const e of entries) {
      if (isFolder(e) || !drawable(e) || isPosterName(e.name)) continue
      const path = `${owner.userId}/${folder}/${e.name}`
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
    for (const e of entries) if (!isFolder(e) && IMAGE.test(e.name) && drawable(e)) out.push(toFile(admin, "product-images", `${owner.creatorId}/${folder}/${e.name}`, e, "Product photos"))
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

export async function deleteLibraryFile(admin: Admin, owner: { userId: string; creatorId: string }, bucket: unknown, path: unknown): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
  const { error } = await admin.storage.from(bucket as LibraryBucket).remove(withPoster(bucket, path))
  if (error) return { ok: false, error: "The file could not be deleted.", status: 500 }
  return { ok: true }
}

/** At most this many in one delete: a page of selected files, not a whole bucket. */
export const MAX_DELETE_AT_ONCE = 100

/**
 * Several of the caller's own files at once (Files, Select, Delete). Every
 * one is checked first; one that is not theirs refuses the whole request, so
 * a list cannot be used to reach into another folder. Removed one bucket at a
 * time, in one storage call each.
 */
export async function deleteLibraryFiles(admin: Admin, owner: { userId: string; creatorId: string }, list: unknown): Promise<{ ok: true; removed: number } | { ok: false; error: string; status: number }> {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_DELETE_AT_ONCE) return { ok: false, error: "Choose the files to delete.", status: 400 }
  const byBucket = new Map<LibraryBucket, string[]>()
  for (const item of list) {
    const bucket = (item as { bucket?: unknown } | null)?.bucket
    const path = (item as { path?: unknown } | null)?.path
    if (!ownsFile(owner, bucket, path)) return { ok: false, error: "That file was not found.", status: 404 }
    const paths = byBucket.get(bucket as LibraryBucket) ?? []
    for (const p of withPoster(bucket, path)) if (!paths.includes(p)) paths.push(p)
    byBucket.set(bucket as LibraryBucket, paths)
  }
  let removed = 0
  for (const [bucket, paths] of byBucket) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) return { ok: false, error: "The files could not be deleted.", status: 500 }
    removed += paths.filter((p) => !isPosterName(p)).length
  }
  return { ok: true, removed }
}
