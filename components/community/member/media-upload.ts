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
import { FAIL_COPY, WAIT_MS, requestJson, watchUploadStall } from "@/lib/net/request"

export type UploadKind = "image" | "video" | "file"

const PICTURE_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i

/** What a picked file becomes in a post. SVG is a file, not a picture: it can carry script. */
export function uploadKindOf(file: Pick<File, "type" | "name">): UploadKind {
  if (PICTURE_TYPES.test(file.type) || (!file.type && /\.(jpe?g|png|webp|gif|heic|heif|avif)$/i.test(file.name))) return "image"
  if (/^video\/(mp4|quicktime|webm|x-m4v)$/i.test(file.type) || (!file.type && /\.(mp4|mov|m4v|webm)$/i.test(file.name))) return "video"
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
 * ===========================================================================
 *  A STILL FROM A VIDEO FILE, FOR THE CARD (round 33: every time it can be)
 * ===========================================================================
 * A frame a little way in (a quarter of the way, a second at most, so a fade
 * from black is past), as a JPEG at 1280px at most. Null only when the
 * browser cannot decode the file at all (an iPhone's HEVC .mov on Chrome);
 * the video is still posted, and its still is filled in later from the
 * first frame its author's browser draws (media.tsx VideoFrame, ./video-posters).
 *
 * What made it fail before, and what it does now:
 *   SEEKING TO WHERE IT WAS   a clip with no length yet (NaN, Infinity on a
 *                             recorded WebM) was sent to 0, where it already
 *                             was: no `seeked` ever came, and after 8s, no still.
 *                             The frame is taken from `loadeddata` when there
 *                             is nowhere to seek to, and from whichever of
 *                             seeked or a played frame comes first.
 *   A VIDEO ON NO PAGE        iOS Safari decodes nothing for a <video> that is
 *                             not in the document. It is put in the page now,
 *                             1px, invisible, and taken out after.
 *   NO FRAME AFTER A SEEK     Safari can answer `seeked` before it has a frame
 *                             to draw. The draw waits for the frame
 *                             (requestVideoFrameCallback where there is one), and
 *                             a muted inline play is tried when nothing has
 *                             come in a while.
 *   A BLACK FRAME             a frame that is all but black is tried once more,
 *                             further in.
 */
export const STILL_WAIT_MS = 15_000
const STILL_EDGE = 1280

type StillOut = { blob: Blob; w: number; h: number }

/** How dark a frame is, 0 to 255, read from a few pixels; NaN when it cannot be read. */
function frameLight(canvas: HTMLCanvasElement): number {
  try {
    const probe = document.createElement("canvas")
    probe.width = 8
    probe.height = 8
    const ctx = probe.getContext("2d", { willReadFrequently: true })
    if (!ctx) return NaN
    ctx.drawImage(canvas, 0, 0, 8, 8)
    const px = ctx.getImageData(0, 0, 8, 8).data
    let sum = 0
    for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
    return sum / (px.length / 4)
  } catch {
    return NaN
  }
}

/** The frame a <video> shows now, drawn at 1280px at most. Null when it has no frame or may not be read. */
export function drawFrame(v: HTMLVideoElement): HTMLCanvasElement | null {
  if (!v.videoWidth || !v.videoHeight || v.readyState < 2) return null
  try {
    const scale = Math.min(1, STILL_EDGE / Math.max(v.videoWidth, v.videoHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(v.videoWidth * scale))
    canvas.height = Math.max(1, Math.round(v.videoHeight * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) return null
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height)
    return canvas
  } catch {
    return null
  }
}

export function videoStill(file: Blob, opts: { waitMs?: number } = {}): Promise<StillOut | null> {
  if (typeof document === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    let done = false
    let retried = false
    let nudged = 0
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    const finish = (out: StillOut | null) => {
      if (done) return
      done = true
      window.clearTimeout(giveUp)
      window.clearTimeout(nudged)
      try {
        v.pause()
        v.removeAttribute("src")
        v.load()
      } catch {
        /* Gone already. */
      }
      v.remove()
      URL.revokeObjectURL(url)
      resolve(out)
    }
    const giveUp = window.setTimeout(() => finish(null), opts.waitMs ?? STILL_WAIT_MS)
    const target = () => {
      const d = v.duration
      return Number.isFinite(d) && d > 0 ? Math.min(1, d / 4) : 0
    }
    const take = () => {
      if (done) return
      const canvas = drawFrame(v)
      if (!canvas) return
      /* All but black (a fade in): once more, further in, when there is further. */
      const light = frameLight(canvas)
      const d = v.duration
      if (!retried && light < 6 && Number.isFinite(d) && d > 1.5) {
        retried = true
        v.currentTime = Math.min(d / 2, 3)
        return
      }
      canvas.toBlob((blob) => finish(blob ? { blob, w: v.videoWidth, h: v.videoHeight } : null), "image/jpeg", 0.82)
    }
    /* After a seek or a played frame: on the frame itself where the browser can say when it is there. */
    const takeWhenPainted = () => {
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback
      if (typeof rvfc === "function" && !v.paused) rvfc.call(v, () => take())
      else window.requestAnimationFrame(() => take())
    }
    v.muted = true
    v.defaultMuted = true
    v.playsInline = true
    v.setAttribute("muted", "")
    v.setAttribute("playsinline", "")
    v.preload = "auto"
    v.disablePictureInPicture = true
    v.setAttribute("aria-hidden", "true")
    v.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1"
    v.addEventListener("loadeddata", () => {
      const t = target()
      if (t > 0.05 && Math.abs(v.currentTime - t) > 0.05) v.currentTime = t
      else takeWhenPainted()
    })
    v.addEventListener("seeked", () => takeWhenPainted())
    v.addEventListener("playing", () => {
      v.pause()
      takeWhenPainted()
    })
    v.addEventListener("error", () => finish(null))
    /* Nothing to draw after a while (Safari holding back the data): a muted inline play, which it allows, brings a frame. */
    nudged = window.setTimeout(() => {
      if (!done && v.readyState < 2) void v.play().catch(() => undefined)
    }, 2500)
    document.body.appendChild(v)
    v.src = url
    v.load()
  })
}

/** The still, kept as a picture next to the post's other pictures. Null on any failure (its still is filled in later, see below). */
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

/*
  ROUND 33, A STILL FILLED IN LATER. A video posted without a still (the browser could not cut one) gets the first frame
  its author's or a moderator's browser draws on the card (media.tsx VideoFrame): sent once, kept by the server for every
  post of theirs carrying it (app/api/community/<id>/videos/<videoId>/poster, lib/communities/server/video-posters.ts).
  Each video is sent once a page, and not again this session once the server has answered either way.
*/
const FILLED = new Set<string>()
const FILL_KEY = "storelib.video-still."

function onceThisSession(key: string): boolean {
  if (FILLED.has(key)) return false
  FILLED.add(key)
  try {
    if (sessionStorage.getItem(FILL_KEY + key)) return false
  } catch {
    /* No session storage: once a page is enough. */
  }
  return true
}

function answered(key: string) {
  try {
    sessionStorage.setItem(FILL_KEY + key, "1")
  } catch {
    /* Private mode: asked again on the next page, answered the same. */
  }
}

/** Sends the frame drawn for this video as its still. Quietly nothing on any failure: the card shows the frame either way. */
export async function sendVideoFrame(communityId: string, videoId: string, frame: Blob, size: { w?: number; h?: number } = {}): Promise<{ poster: string; w: number; h: number; blur: string | null } | null> {
  const key = `${videoId}:frame`
  if (!frame.size || !onceThisSession(key)) return null
  const q = size.w && size.h ? `?w=${Math.round(size.w)}&h=${Math.round(size.h)}` : ""
  try {
    const res = await fetch(`${apiBase(communityId)}/videos/${videoId}/poster${q}`, { method: "POST", body: frame, headers: { "Content-Type": frame.type || "image/jpeg" }, credentials: "same-origin" })
    if (res.status !== 429 && res.status < 500) answered(key)
    if (!res.ok) return null
    return (await res.json()) as { poster: string; w: number; h: number; blur: string | null }
  } catch {
    return null
  }
}

/** Asks for the 16px copies of this video's stills (an older post, seen by its author or a moderator). */
export async function askVideoBlurs(communityId: string, videoId: string): Promise<void> {
  const key = `${videoId}:blur`
  if (!onceThisSession(key)) return
  try {
    const res = await fetch(`${apiBase(communityId)}/videos/${videoId}/poster`, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" }, credentials: "same-origin" })
    if (res.status !== 429 && res.status < 500) answered(key)
  } catch {
    /* Asked again on another page. */
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
    /* A dead connection leaves an upload pending with no error at all, sat at its last percentage (lib/net/request). */
    let stalled = false
    const done = watchUploadStall(xhr, () => (stalled = true))
    xhr.upload.addEventListener("progress", (e) => onProgress(e.loaded))
    xhr.addEventListener("loadend", done)
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new FileUploadError("The upload did not finish. Try again."))))
    xhr.addEventListener("error", () => reject(new FileUploadError("The upload stopped. Check your connection and try again.")))
    xhr.addEventListener("abort", () => reject(new FileUploadError(stalled ? "The upload stopped moving. Check your connection and try again." : "Upload stopped")))
    if (signal?.aborted) {
      done()
      return reject(new FileUploadError("Upload stopped"))
    }
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.open("PUT", url)
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream")
    xhr.send(file)
  })
}

async function call(url: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await requestJson<Record<string, unknown>>(url, { method: "POST", json: body, credentials: "same-origin", timeoutMs: WAIT_MS.write })
  if (r.status === 0) throw new FileUploadError(FAIL_COPY[r.kind ?? "network"])
  const json = r.data as Record<string, unknown>
  if (!r.ok) throw new FileUploadError(typeof json.error === "string" && json.error.includes(" ") ? json.error : "The file did not upload. Try again.")
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
