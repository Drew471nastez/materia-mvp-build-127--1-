import "server-only"

/**
 * ===========================================================================
 *  STORELIB'S OWN STORAGE: THE DEFAULT, AND IT ALWAYS WORKS
 * ===========================================================================
 * The same way a lesson's video is kept (lib/courses/manage.ts): the browser
 * sends the file straight to the PRIVATE digital-products bucket on a signed
 * upload address for a path the server chose,
 *
 *   <creator id>/community-media/<video id>/<time>-<key>.<ext>
 *
 * then the server checks what landed (its size, its first bytes, by the
 * same file check every upload on Storelib gets) before the video is ready
 * (lib/communities/server/videos.ts completeVideoUpload). Playback is a
 * signed address good for an hour, which answers Range requests, so the
 * browser seeks straight from storage. The bucket is private: there is no
 * permanent public address for any of it.
 *
 * No transcoding: the file plays as it was sent, which for the MP4 every
 * phone and editor makes is what a browser wants.
 */
import { STORAGE_BUCKET } from "@/lib/storage/plans"
import type { MediaVideoRow } from "@/lib/communities/types"
import type { VideoAdapter } from "./provider"

export const COMMUNITY_MEDIA_FOLDER = "community-media"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function randomKey(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20)
}

/** The extension a stored file keeps: letters and digits only, or the fallback. */
export function extensionFor(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".")
  return ((dot === -1 ? "" : name.slice(dot + 1)).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10)) || fallback
}

/** A fresh path for one file of one video. */
export function communityMediaPath(creatorId: string, videoId: string, fileName: string, fallbackExt: string, now: number = Date.now()): string {
  return `${creatorId}/${COMMUNITY_MEDIA_FOLDER}/${videoId}/${now}-${randomKey()}.${extensionFor(fileName, fallbackExt)}`
}

/**
 * A stored path this video may use: under its creator's id, in the community
 * folder, in this video's own folder, nothing climbing out. Checked every
 * time a path is signed, so a row can never be pointed at another
 * creator's file.
 */
export function isCommunityMediaPath(path: unknown, creatorId: string, videoId: string): path is string {
  if (typeof path !== "string" || !path || path.length > 400) return false
  if (!UUID.test(creatorId) || !UUID.test(videoId)) return false
  const parts = path.split("/")
  if (parts.length !== 4 || parts.some((p) => p === "" || p === "." || p === ".." || p.includes("\\"))) return false
  if (parts[0] !== creatorId || parts[1] !== COMMUNITY_MEDIA_FOLDER || parts[2] !== videoId) return false
  return /^[A-Za-z0-9_-]{1,80}\.[a-z0-9]{1,10}$/.test(parts[3])
}

/** A short lived address for one of this video's own files, or null. */
export async function signVideoFile(db: { storage: { from: (b: string) => { createSignedUrl: (p: string, s: number) => Promise<{ data: { signedUrl?: string } | null; error: unknown }> } } }, video: Pick<MediaVideoRow, "id" | "creator_id">, path: string | null | undefined, seconds: number): Promise<{ url: string; expiresAt: number } | null> {
  if (!isCommunityMediaPath(path, video.creator_id, video.id)) return null
  const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUrl(path, seconds)
  if (error || !data?.signedUrl) return null
  return { url: data.signedUrl, expiresAt: Date.now() + seconds * 1000 }
}

export const storageAdapter: VideoAdapter = {
  name: "storage",
  connected: () => true,
  missingKeys: () => [],
  async createUpload(db, input) {
    const path = communityMediaPath(input.video.creator_id, input.video.id, input.fileName, "mp4")
    const { data, error } = await db.storage.from(STORAGE_BUCKET).createSignedUploadUrl(path)
    if (error || !data?.token) throw new Error("storage: could not start the upload")
    return { method: "storage", url: data.signedUrl ?? null, path, token: data.token, headers: {}, patch: { storage_path: path } }
  },
  async playback(db, video, seconds) {
    const signed = await signVideoFile(db, video, video.storage_path, seconds)
    if (!signed) return null
    return { url: signed.url, expiresAt: signed.expiresAt, mime: video.mime, poster: null }
  },
  /* Ready the moment the upload is checked: there is nothing to wait for. */
  poll: async () => null,
  webhook: async () => [],
}
