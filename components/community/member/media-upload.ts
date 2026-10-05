"use client"

/**
 * ===========================================================================
 *  WHAT THE COMPOSER SENDS, FROM THE BROWSER
 * ===========================================================================
 * Three ways in, by what the file is:
 *
 *   a picture   compressed here (media-compress.ts: 2560px at most, WebP
 *               or JPEG at 0.85, no EXIF, a GIF as it is), into Storelib's
 *               picture storage under the member's own folder, then checked
 *               where it landed by the upload pipeline (confirmUpload)
 *   a video     the community's video route (uploadCommunityVideo), with a
 *               still taken from the file here for the card's thumbnail
 *   any file    the community's file route: asked first (name, type, size),
 *               sent straight to the private bucket, checked where it landed
 *               (/api/community/<id>/files, lib/communities/server/post-files.ts)
 *
 * Browser only; imports nothing from the server.
 */
import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { uploadWithProgress } from "@/lib/storage/upload-with-progress"
import { PICTURE_BUCKET, memberPictureFolder } from "@/lib/communities/post-media"
import type { PostMedia } from "@/lib/communities/types"
import { uploadCommunityVideo, waitUntilPlayable } from "@/lib/video/upload-client"
import type { VideoStatusView } from "@/lib/video/types"
import { apiBase } from "./api"
import { compressPostPicture } from "./media-compress"

export type UploadKind = "image" | "video" | "file"

const PICTURE_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i

/** What a picked file becomes in a post. SVG is a file, not a picture: it can carry script. */
export function uploadKindOf(file: Pick<File, "type" | "name">): UploadKind {
  if (PICTURE_TYPES.test(file.type) || (!file.type && /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name))) return "image"
  if (/^video\/(mp4|quicktime|webm)$/i.test(file.type)) return "video"
  return "file"
}

async function pictureSize(blob: Blob): Promise<{ w: number; h: number }> {
  try {
    const bitmap = await createImageBitmap(blob)
    const out = { w: bitmap.width, h: bitmap.height }
    bitmap.close()
    return out
  } catch {
    return { w: 0, h: 0 }
  }
}

/**
 * THE PICTURE ALREADY IN THIS BROWSER (round 11). A picture just sent is
 * drawn from the file the member picked, under its stored address, for the
 * life of the page: a comment that carries it shows it at once while it is
 * sent and keeps showing the same pixels when the server's copy replaces it,
 * never a blank box that loads again.
 */
const LOCAL = new Map<string, string>()
export function localPicture(url: string): string | null {
  return LOCAL.get(url) ?? null
}

/** Uploads under way, by the composer's key for each, so taking one off the post stops its upload. */
const SENDING = new Map<string, AbortController>()

/** Stops the upload (or the wait) for this key, if there is one. */
export function stopUpload(key: string): void {
  SENDING.get(key)?.abort()
  SENDING.delete(key)
}

export interface PictureUploadOptions {
  key?: string
  onProgress?: (percent: number) => void
}

/** A picture into the member's own folder of the picture bucket. */
export async function uploadPicture(file: File, userId: string, communityId: string, input: PictureUploadOptions = {}): Promise<Extract<PostMedia, { type: "image" }>> {
  if (uploadKindOf(file) !== "image") throw new Error("That file is not a picture.")
  if (file.size > 25 * 1024 * 1024) throw new Error("That picture is over 25 MB.")
  const ctrl = new AbortController()
  if (input.key) SENDING.set(input.key, ctrl)
  const bump = (p: number) => input.onProgress?.(Math.max(0, Math.min(100, Math.round(p))))
  try {
    bump(4)
    /* Lighter first: 2560px at most, WebP (or JPEG) at 0.85, no EXIF; a GIF keeps its frames (media-compress.ts). */
    const upload = await compressPostPicture(file)
    if (ctrl.signal.aborted) throw new Error("Upload stopped")
    bump(18)
    const size = await pictureSize(upload)
    const supabase = createClient()
    const ext = (upload.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg"
    /* The member's own folder first: storage only lets a person write there. */
    /* The same folder a comment's picture is checked against on the server (comments.ts checkCommentMedia). */
    const path = `${memberPictureFolder(userId, communityId)}${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    await uploadWithProgress(PICTURE_BUCKET, path, upload, {
      cacheControl: "31536000",
      contentType: upload.type || "image/jpeg",
      upsert: false,
      signal: ctrl.signal,
      onProgress: (p) => bump(20 + (p * 78) / 100),
    })
    confirmUpload(PICTURE_BUCKET, path)
    const { data } = supabase.storage.from(PICTURE_BUCKET).getPublicUrl(path)
    try {
      LOCAL.set(data.publicUrl, URL.createObjectURL(upload))
    } catch {
      /* No object addresses here: the stored copy is drawn instead. */
    }
    bump(100)
    return { type: "image", url: data.publicUrl, ...(size.w ? { w: size.w, h: size.h } : {}) }
  } catch (e) {
    const message = e instanceof Error ? e.message : ""
    if (message === "Upload stopped") throw new Error("Upload stopped")
    throw new Error(message && message.includes(" ") ? message : "The picture did not upload. Check the connection and try again.")
  } finally {
    if (input.key && SENDING.get(input.key) === ctrl) SENDING.delete(input.key)
  }
}

/**
 * A still from a video file, for the card: a frame a second in (or the
 * first, for a short clip), as a JPEG. Null when the browser cannot decode
 * it; the video is still posted, its card simply has no picture.
 */
export function videoStill(file: Blob): Promise<{ blob: Blob; w: number; h: number } | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: { blob: Blob; w: number; h: number } | null) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(v)
    }
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    v.muted = true
    v.playsInline = true
    v.preload = "auto"
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 3)
    }
    v.onseeked = () => {
      try {
        const scale = Math.min(1, 1280 / Math.max(v.videoWidth, 1))
        const w = Math.max(1, Math.round(v.videoWidth * scale))
        const h = Math.max(1, Math.round(v.videoHeight * scale))
        const canvas = document.createElement("canvas")
        canvas.width = w
        canvas.height = h
        canvas.getContext("2d")?.drawImage(v, 0, 0, w, h)
        canvas.toBlob((blob) => finish(blob ? { blob, w: v.videoWidth, h: v.videoHeight } : null), "image/jpeg", 0.82)
      } catch {
        finish(null)
      }
    }
    v.onerror = () => finish(null)
    window.setTimeout(() => finish(null), 8000)
    v.src = url
  })
}

/** The still, kept as a picture next to the post's other pictures. Null on any failure. */
export async function uploadVideoPoster(file: File, userId: string, communityId: string): Promise<{ poster: string; w: number; h: number } | null> {
  try {
    const still = await videoStill(file)
    if (!still) return null
    const pic = await uploadPicture(new File([still.blob], "poster.jpg", { type: "image/jpeg" }), userId, communityId)
    return { poster: pic.url, w: still.w, h: still.h }
  } catch {
    return null
  }
}

/**
 * A post's video, from the file to playable (round 13): sent with real
 * progress (onProgress, 0 to 99), then, on a video service, waited on until
 * it plays (onProcessing once, when the bytes are all there). Answers a
 * ready video, or throws with a sentence the member can act on: the Post
 * button stays waiting the whole time, so a post never carries a video
 * that does not play yet.
 */
export async function uploadPostVideo(input: { communityId: string; file: File; key?: string; onProgress?: (percent: number) => void; onProcessing?: () => void }): Promise<VideoStatusView> {
  const endpoint = `${apiBase(input.communityId)}/videos`
  const ctrl = new AbortController()
  if (input.key) SENDING.set(input.key, ctrl)
  try {
    const sent = await uploadCommunityVideo({ endpoint, file: input.file, onProgress: (p) => input.onProgress?.(Math.min(99, p)), signal: ctrl.signal })
    if (sent.status === "ready") return sent
    input.onProcessing?.()
    return await waitUntilPlayable({ endpoint, video: sent, signal: ctrl.signal })
  } finally {
    if (input.key && SENDING.get(input.key) === ctrl) SENDING.delete(input.key)
  }
}

export class FileUploadError extends Error {}

function put(url: string, file: Blob, contentType: string, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => onProgress(e.loaded))
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FileUploadError("The upload did not finish. Try again."))))
    xhr.addEventListener("error", () => reject(new FileUploadError("The upload stopped. Check your connection and try again.")))
    xhr.addEventListener("abort", () => reject(new FileUploadError("Upload stopped")))
    if (signal?.aborted) return reject(new FileUploadError("Upload stopped"))
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream")
    xhr.send(file)
  })
}

async function call(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new FileUploadError(typeof json.error === "string" && json.error.includes(" ") ? json.error : "The file did not upload. Try again.")
  return json
}

/** Any file, through the community's file route. Answers what the post keeps. */
export async function uploadCommunityFile(input: { communityId: string; file: File; onProgress?: (percent: number) => void; signal?: AbortSignal }): Promise<Extract<PostMedia, { type: "file" }>> {
  const { file } = input
  const endpoint = `${apiBase(input.communityId)}/files`
  /* Octet stream for the bytes: storage keeps no type a browser would render, whatever the file says it is. */
  const prepared = await call(endpoint, { action: "prepare", fileName: file.name, fileSize: file.size, contentType: file.type })
  const ticket = prepared.ticket as { fileId?: string; url?: string; name?: string } | undefined
  if (!ticket?.fileId || !ticket.url) throw new FileUploadError("The file did not upload. Try again.")
  await put(ticket.url, file, "application/octet-stream", (sent) => input.onProgress?.(file.size ? Math.min(99, Math.round((sent / file.size) * 100)) : 0), input.signal)
  const done = await call(endpoint, { action: "complete", fileId: ticket.fileId, name: ticket.name || file.name })
  input.onProgress?.(100)
  return done.file as Extract<PostMedia, { type: "file" }>
}
