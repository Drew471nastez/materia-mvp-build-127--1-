"use client"

/**
 * ===========================================================================
 *  A VIDEO UP, WITH ITS FIRST FRAME AND ITS LENGTH
 * ===========================================================================
 * One way a video goes up from the browser, wherever it was dropped: the
 * Files library, "Choose from your files", a product's photos and videos.
 *
 *   1. The browser opens the file itself (a <video> on a blob address), reads
 *      its length and draws a frame from its first second onto a canvas. A
 *      file it cannot play (an HEVC .mov in Chrome, say) still goes up, just
 *      without the frame: every player falls back to the video's own.
 *   2. The video goes into the owner's folder in store-builder-images as
 *      `<stamp>-<random>-<seconds>s.<ext>`, and the frame beside it as
 *      `<same>.poster.jpg` (lib/media/video.ts reads both back from the name).
 *   3. confirmUpload asks the server to check both (lib/security/uploads/
 *      direct.ts): a file whose bytes are not a real video is removed.
 *
 * The type and size are refused here first, with the words a person reads;
 * the bucket refuses them again on its own (SQL part 16 allowed types, part
 * 70 size), and the server's check after is the one that cannot be skipped.
 */
import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { mediaUrl } from "@/lib/storage/media-url"
import { MAX_VIDEO_BYTES, MAX_VIDEO_TEXT, VIDEO_TYPES, posterPathFor } from "@/lib/media/video"
import { watchUploadStall } from "@/lib/net/request"

export const VIDEO_BUCKET = "store-builder-images"

/** Why a file is not taken as a video, in words, or null when it is. */
export function videoRefusal(f: { name: string; type: string; size: number }): string | null {
  if (!VIDEO_TYPES[f.type]) return `${f.name}: only MP4, WebM and MOV videos.`
  if (f.size > MAX_VIDEO_BYTES) return `${f.name} is over ${MAX_VIDEO_TEXT}.`
  if (f.size === 0) return `${f.name} is empty.`
  return null
}

/** Whether a picked or dropped file is a video (by its declared type, or its name when the browser gave none). */
export function isVideoFile(f: { name: string; type: string }): boolean {
  return f.type.startsWith("video/") || (!f.type && /\.(mp4|webm|mov|m4v)$/i.test(f.name))
}

export interface VideoProbe {
  /** A JPEG of a frame from the first second, or null when the browser could not draw one. */
  poster: Blob | null
  /** Seconds, or null. */
  duration: number | null
  width: number
  height: number
}

/**
 * The file's length and a frame from its first second, read in the browser.
 * Never throws and never takes longer than `timeoutMs`.
 */
export function probeVideo(file: Blob, timeoutMs = 8000): Promise<VideoProbe> {
  const none: VideoProbe = { poster: null, duration: null, width: 0, height: 0 }
  if (typeof document === "undefined") return Promise.resolve(none)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const v = document.createElement("video")
    let done = false
    const finish = (out: VideoProbe) => {
      if (done) return
      done = true
      clearTimeout(timer)
      v.removeAttribute("src")
      v.load()
      URL.revokeObjectURL(url)
      resolve(out)
    }
    const timer = setTimeout(() => finish({ ...none, duration: Number.isFinite(v.duration) ? v.duration : null }), timeoutMs)
    v.muted = true
    v.playsInline = true
    v.preload = "auto"
    v.onerror = () => finish(none)
    v.onloadedmetadata = () => {
      const d = Number.isFinite(v.duration) ? v.duration : null
      /* A frame from the first second: half a second in skips a fade from black, and a clip shorter than that gives its middle. */
      v.currentTime = d !== null ? Math.min(0.5, d / 2) : 0
    }
    v.onseeked = () => {
      const duration = Number.isFinite(v.duration) ? v.duration : null
      const w = v.videoWidth
      const h = v.videoHeight
      if (!w || !h) return finish({ ...none, duration })
      /* At most 1280 wide: a frame for a tile and a gallery's first paint, not a still to print. */
      const scale = Math.min(1, 1280 / w)
      const c = document.createElement("canvas")
      c.width = Math.round(w * scale)
      c.height = Math.round(h * scale)
      const g = c.getContext("2d")
      if (!g) return finish({ ...none, duration, width: w, height: h })
      try {
        g.drawImage(v, 0, 0, c.width, c.height)
        c.toBlob((b) => finish({ poster: b, duration, width: w, height: h }), "image/jpeg", 0.85)
      } catch {
        finish({ ...none, duration, width: w, height: h })
      }
    }
    v.src = url
  })
}

/** A POST to storage by XMLHttpRequest, so the page can say how far it is. */
export function putWithProgress(endpoint: string, token: string, key: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest()
    x.open("POST", endpoint)
    x.setRequestHeader("Authorization", `Bearer ${token}`)
    x.setRequestHeader("apikey", key)
    x.setRequestHeader("x-upsert", "false")
    x.setRequestHeader("cache-control", "max-age=31536000")
    x.setRequestHeader("Content-Type", type)
    x.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total)
    }
    /* Every way it can end settles the promise: an abort or a stall used to leave the picker on "Uploading" for good. */
    const done = watchUploadStall(x, () => {})
    x.onloadend = done
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error(`upload ${x.status}`)))
    x.onerror = () => reject(new Error("upload failed"))
    x.onabort = () => reject(new Error("The upload stopped moving. Check your connection and try again."))
    x.send(body)
  })
}

/** One object into a bucket: by XMLHttpRequest with the session when there is one, through the storage client when not. */
export async function putObject(bucket: string, path: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  const supabase = createClient()
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "")
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
  const session = base && key ? (await supabase.auth.getSession()).data.session : null
  if (session?.access_token && base && key && typeof XMLHttpRequest !== "undefined") {
    await putWithProgress(`${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`, session.access_token, key, body, type, onProgress)
  } else {
    const { error } = await supabase.storage.from(bucket).upload(path, body, { cacheControl: "31536000", contentType: type, upsert: false })
    if (error) throw error
  }
  onProgress(1)
}

export interface UploadedVideo {
  path: string
  url: string
  poster: string | null
  duration: number | null
  bytes: number
  type: string
}

/**
 * A video into the signed in person's `folder` ("files" for the library,
 * "products" for a product's media, "videos" for a website video setting) with its first frame beside it.
 * Throws when the video itself did not go up; a frame that did not is let go.
 */
export async function uploadVideo(file: File, folder: "files" | "products" | "videos", onProgress: (p: number) => void = () => {}): Promise<UploadedVideo> {
  const refused = videoRefusal(file)
  if (refused) throw new Error(refused)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("signed out")
  const ext = VIDEO_TYPES[file.type]
  const probe = await probeVideo(file)
  const secs = probe.duration !== null && probe.poster ? `-${Math.max(1, Math.round(probe.duration))}s` : ""
  const path = `${user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${secs}.${ext}`
  /* The frame first, small and quick, so a tile that lists the video can draw it. Only a name with the length stamp promises a frame. */
  let poster: string | null = null
  if (probe.poster && secs) {
    const posterPath = posterPathFor(path)
    try {
      await putObject(VIDEO_BUCKET, posterPath, probe.poster, "image/jpeg", () => {})
      confirmUpload(VIDEO_BUCKET, posterPath)
      poster = mediaUrl(supabase.storage.from(VIDEO_BUCKET).getPublicUrl(posterPath).data.publicUrl)
    } catch {
      poster = null
    }
  }
  /* Without its frame the name drops the stamp, so nothing looks for a frame that is not there. */
  const finalPath = poster ? path : path.replace(/-\d+s\.(\w+)$/, ".$1")
  try {
    await putObject(VIDEO_BUCKET, finalPath, file, file.type, onProgress)
  } catch (e) {
    /* A frame with no video beside it is nothing: let it go. */
    if (poster) void supabase.storage.from(VIDEO_BUCKET).remove([posterPathFor(path)]).then(() => {}, () => {})
    throw e
  }
  confirmUpload(VIDEO_BUCKET, finalPath)
  const url = mediaUrl(supabase.storage.from(VIDEO_BUCKET).getPublicUrl(finalPath).data.publicUrl)
  return { path: finalPath, url, poster, duration: probe.duration, bytes: file.size, type: file.type }
}
