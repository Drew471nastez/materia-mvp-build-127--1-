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
}

type Entry = { name: string; id: string | null; created_at?: string | null; metadata?: { size?: number; mimetype?: string } | null }

async function list(admin: Admin, bucket: LibraryBucket, prefix: string): Promise<Entry[]> {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } })
  if (error) return []
  return (data ?? []) as Entry[]
}

const isFolder = (e: Entry) => e.id === null && !e.metadata
const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i
/* What the builder's video field uploads (components/website-builder/editor/controls/video-picker-control.tsx). */
const VIDEO = /\.(mp4|webm|mov|m4v)$/i

/** Pictures, or the videos a video setting can play. */
export type LibraryKind = "image" | "video"

function toFile(admin: Admin, bucket: LibraryBucket, path: string, e: Entry, source: string): LibraryFile {
  const { data } = admin.storage.from(bucket).getPublicUrl(path)
  return {
    id: `${bucket}:${path}`,
    bucket,
    path,
    name: e.name,
    url: mediaUrl(data.publicUrl as string),
    bytes: e.metadata?.size ?? null,
    type: e.metadata?.mimetype ?? null,
    createdAt: e.created_at ?? null,
    source,
  }
}

/** Every picture the store has (or every video, with `kind`), newest first. */
export async function listLibrary(admin: Admin, owner: { userId: string; creatorId: string }, kind: LibraryKind = "image"): Promise<LibraryFile[]> {
  const out: LibraryFile[] = []
  const wanted = kind === "video" ? VIDEO : IMAGE
  const builderFolders = (await list(admin, "store-builder-images", owner.userId)).filter(isFolder)
  const builder = await Promise.all(builderFolders.slice(0, 40).map(async (f) => ({ folder: f.name, entries: await list(admin, "store-builder-images", `${owner.userId}/${f.name}`) })))
  for (const { folder, entries } of builder) {
    for (const e of entries) if (!isFolder(e) && wanted.test(e.name)) out.push(toFile(admin, "store-builder-images", `${owner.userId}/${folder}/${e.name}`, e, folder === LIBRARY_FOLDER ? "Library" : "Website"))
  }
  /* Product photos are pictures only: the product-images bucket holds no video. */
  if (kind === "video") return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MAX_LIBRARY_FILES)
  const productFolders = (await list(admin, "product-images", owner.creatorId)).filter(isFolder)
  const products = await Promise.all(productFolders.slice(0, 120).map(async (f) => ({ folder: f.name, entries: await list(admin, "product-images", `${owner.creatorId}/${f.name}`) })))
  for (const { folder, entries } of products) {
    for (const e of entries) if (!isFolder(e) && IMAGE.test(e.name)) out.push(toFile(admin, "product-images", `${owner.creatorId}/${folder}/${e.name}`, e, "Product photos"))
  }
  return out.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, MAX_LIBRARY_FILES)
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
  const { error } = await admin.storage.from(bucket as LibraryBucket).remove([path])
  if (error) return { ok: false, error: "The file could not be deleted.", status: 500 }
  return { ok: true }
}
