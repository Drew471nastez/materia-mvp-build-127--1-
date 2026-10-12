"use client"

/**
 * ===========================================================================
 *  A VIDEO FROM THE BROWSER TO A COMMUNITY
 * ===========================================================================
 * uploadCommunityVideo sends one file the way the server said (lib/video/
 * types.ts UploadMethod) and tells the server it arrived:
 *
 *   1. the file's own length and size are read here, from its metadata
 *   2. POST <endpoint> { action: "prepare", fileName, contentType, fileSize }
 *      answers an UploadTicket
 *   3. the bytes go straight to storage or the video service, with progress
 *   4. POST <endpoint> { action: "complete", videoId, durationSeconds, width, height }
 *      answers the video's status: ready at once on Storelib's storage,
 *      processing on a video service until its webhook says ready
 *
 * <endpoint> is /api/app/community/<id>/videos for the creator's screens
 * and /api/community/<id>/videos for a member's composer.
 *
 * Browser only; imports nothing from the server.
 */
import { putFailure } from "@/lib/courses/upload-client"
import type { UploadTicket, VideoStatusView } from "./types"
import { watchUploadStall } from "@/lib/net/request"

export class VideoUploadError extends Error {}

export interface VideoMetadata {
  durationSeconds: number | null
  width: number | null
  height: number | null
}

/** The file's length and size, read by the browser from its metadata. Nulls when it cannot tell. */
export function readVideoMetadata(file: Blob): Promise<VideoMetadata> {
  const none: VideoMetadata = { durationSeconds: null, width: null, height: null }
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file)
      const v = document.createElement("video")
      let settled = false
      const done = (m: VideoMetadata) => {
        if (settled) return
        settled = true
        URL.revokeObjectURL(url)
        resolve(m)
      }
      v.preload = "metadata"
      v.muted = true
      v.onloadedmetadata = () =>
        done({
          durationSeconds: Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null,
          width: v.videoWidth || null,
          height: v.videoHeight || null,
        })
      v.onerror = () => done(none)
      setTimeout(() => done(none), 8000)
      v.src = url
    } catch {
      resolve(none)
    }
  })
}

async function call(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new VideoUploadError(typeof json.message === "string" ? json.message : typeof json.error === "string" && json.error.includes(" ") ? json.error : "The video did not upload. Try again.")
  return json
}

function send(method: "PUT" | "POST" | "PATCH", url: string, body: Blob | FormData, headers: Record<string, string>, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => onProgress(e.loaded))
    /* What storage or the service said, in a sentence to act on: a file over storage's one upload limit says so (putFailure, the lesson upload's words). */
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr) : reject(new VideoUploadError(putFailure(xhr.status, xhr.responseText || "")))))
    xhr.addEventListener("error", () => reject(new VideoUploadError("The upload stopped. Check your connection and try again.")))
    /* A dead connection leaves an upload pending with no error at all, sat at its last percentage (lib/net/request). */
    let stalled = false
    const done = watchUploadStall(xhr, () => (stalled = true))
    xhr.addEventListener("loadend", done)
    xhr.addEventListener("abort", () => reject(new VideoUploadError(stalled ? "The upload stopped moving. Check your connection and try again." : "Upload stopped")))
    if (signal?.aborted) {
      done()
      return reject(new VideoUploadError("Upload stopped"))
    }
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.send(body)
  })
}

/** Bunny's TUS upload in one PATCH: make the upload, then send every byte from offset 0. */
async function tus(ticket: UploadTicket, file: File, onProgress: (sent: number) => void, signal?: AbortSignal): Promise<void> {
  const meta = `filetype ${btoa(file.type || "video/mp4")},title ${btoa(ticket.videoId)}`
  const made = await send("POST", String(ticket.url), new Blob([]), { ...ticket.headers, "Tus-Resumable": "1.0.0", "Upload-Length": String(file.size), "Upload-Metadata": meta }, () => undefined, signal)
  const location = made.getResponseHeader("Location")
  if (!location) throw new VideoUploadError("The upload did not start. Try again.")
  const target = new URL(location, String(ticket.url)).toString()
  await send("PATCH", target, file, { ...ticket.headers, "Tus-Resumable": "1.0.0", "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" }, onProgress, signal)
}

export async function uploadCommunityVideo(input: {
  endpoint: string
  file: File
  /** Percent, 0 to 100. */
  onProgress?: (percent: number) => void
  signal?: AbortSignal
}): Promise<VideoStatusView> {
  const { file } = input
  const report = (sent: number) => input.onProgress?.(file.size ? Math.min(100, Math.round((sent / file.size) * 100)) : 0)
  const meta = await readVideoMetadata(file)
  const prepared = await call(input.endpoint, { action: "prepare", fileName: file.name, contentType: file.type, fileSize: file.size })
  const ticket = prepared.ticket as UploadTicket
  if (!ticket?.videoId) throw new VideoUploadError("The video did not upload. Try again.")

  if (ticket.method === "storage" || ticket.method === "put") {
    await send("PUT", String(ticket.url), file, { "Content-Type": file.type || "application/octet-stream", ...ticket.headers }, report, input.signal)
  } else if (ticket.method === "post") {
    const form = new FormData()
    form.append("file", file, file.name)
    await send("POST", String(ticket.url), form, ticket.headers, report, input.signal)
  } else {
    await tus(ticket, file, report, input.signal)
  }
  report(file.size)

  const done = await call(input.endpoint, { action: "complete", videoId: ticket.videoId, ...meta })
  return done.video as VideoStatusView
}

/*
  WAITING UNTIL IT PLAYS (round 13). A video on a service comes back from
  "complete" as processing; the composer keeps its Post button waiting and
  asks where the video is (GET <endpoint>/<videoId>) until it is ready or
  has failed: quickly at first, then every few seconds, for as long as
  processing takes (WAIT_GIVE_UP_MS). A dropped connection is asked again,
  not reported; a failure says the service's own reason when it gave one.
*/

/** What a failed video says: the service's reason when it gave one. */
export function processingFailure(reason: string | null | undefined): string {
  const r = (reason || "").replace(/\s+/g, " ").trim().replace(/\.$/, "")
  return r ? `This video could not be processed: ${r}.` : PROCESSING_FAILED
}

/** The waits between two questions: quick at first, then every five seconds. */
export const WAIT_STEPS_MS = [1500, 2000, 3000, 5000] as const
/** After this long it stops and says so. */
export const WAIT_GIVE_UP_MS = 30 * 60_000

export const PROCESSING_FAILED = "This video could not be processed. Try another file."
export const PROCESSING_TOO_LONG = "This video is taking too long to process. Try again later."

/** The wait before question number `n` (0 based). */
export function waitStep(n: number): number {
  return WAIT_STEPS_MS[Math.min(n, WAIT_STEPS_MS.length - 1)]
}

function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t)
        reject(new VideoUploadError("Upload stopped"))
      },
      { once: true },
    )
  })
}

export async function waitUntilPlayable(input: {
  endpoint: string
  video: VideoStatusView
  signal?: AbortSignal
  /** Tests pass a clock and a quicker pause. */
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}): Promise<VideoStatusView> {
  const now = input.now ?? Date.now
  const sleep = input.sleep ?? pause
  const started = now()
  let video = input.video
  for (let n = 0; ; n++) {
    if (video.status === "ready") return video
    if (video.status === "failed") throw new VideoUploadError(processingFailure(video.error))
    if (now() - started > WAIT_GIVE_UP_MS) throw new VideoUploadError(PROCESSING_TOO_LONG)
    await sleep(waitStep(n), input.signal)
    try {
      const res = await fetch(`${input.endpoint}/${encodeURIComponent(video.id)}`, { cache: "no-store", credentials: "same-origin", signal: input.signal })
      if (res.status === 404) throw new VideoUploadError("The video was removed. Add it again.")
      if (!res.ok) continue
      const body = (await res.json().catch(() => ({}))) as { video?: VideoStatusView }
      if (body.video?.id === video.id) video = body.video
    } catch (e) {
      if (e instanceof VideoUploadError) throw e
      if (input.signal?.aborted) throw new VideoUploadError("Upload stopped")
      /* Offline for a moment: asked again on the next step. */
    }
  }
}
