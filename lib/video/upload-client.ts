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
import type { UploadTicket, VideoStatusView } from "./types"

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
    xhr.addEventListener("load", () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr) : reject(new VideoUploadError("The upload did not finish. Try again."))))
    xhr.addEventListener("error", () => reject(new VideoUploadError("The upload stopped. Check your connection and try again.")))
    xhr.addEventListener("abort", () => reject(new VideoUploadError("Upload stopped")))
    if (signal?.aborted) return reject(new VideoUploadError("Upload stopped"))
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
