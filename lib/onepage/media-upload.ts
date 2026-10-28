"use client"

/**
 * ===========================================================================
 *  A ONEPAGE PICTURE OR VIDEO, FROM THE BROWSER STRAIGHT INTO STORAGE
 * ===========================================================================
 * The one way the OnePage editor uploads media. It replaced a dozen copies
 * of `supabase.storage.from("onepage-assets").upload(name, file)` that:
 *
 *   - sent every file, a 1 GB video too, as ONE request with no progress, so
 *     a phone that dropped its connection for a second lost the whole video,
 *     and a file over the project's upload limit just "failed";
 *   - sent no content type, so a .mov or a HEIC whose browser declared none
 *     went up as application/octet-stream and the bucket refused it;
 *   - kept a file's own extension (or none), and swallowed every error into
 *     the console, so nobody saw why.
 *
 * Here: lib/onepage/media-rules.ts says what a file may be; a picture that is
 * a HEIC, or too big, is made a JPEG in the browser (prepareImage); then the
 * file goes straight to Supabase Storage with the person's own session, as
 * one request up to 6 MB and as TUS resumable parts above (2 GB is about 340
 * parts). Progress is real (the request's own upload events), Cancel stops
 * the request in flight and tells storage to forget the parts, and a part
 * that fails on a bad connection is asked about (TUS HEAD) and continued
 * from what storage has, not from zero.
 *
 * Errors are UploadError with a `code` and a sentence a person reads.
 * Nothing here passes through a Next.js route: Vercel's 4.5 MB body limit
 * never applies. The one call to the app after is confirmUpload, the
 * fire-and-forget note that has the server check the stored file.
 */
import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { teamPageOwner } from "@/lib/onepage/team-context"
import { watchUploadStall } from "@/lib/net/request"
import { tt } from "@/lib/i18n/text"
import {
  MAX_ONEPAGE_VIDEO_BYTES,
  ONEPAGE_MEDIA_BUCKET,
  TUS_PART_BYTES,
  checkMedia,
  encodePath,
  formatBytes,
  imageNeedsReencode,
  mediaPath,
  publicMediaUrl,
  readStorageFailure,
  retryable,
  uploadRoute,
  type MediaKind,
  type MediaRefusal,
  type MediaWant,
  type UploadFailure,
} from "./media-rules"

export class UploadError extends Error {
  code: UploadFailure | MediaRefusal | "unreadable"
  constructor(code: UploadError["code"], message: string) {
    super(message)
    this.code = code
  }
}

/** The sentence a person reads for each way an upload can fail. */
export function uploadErrorText(code: UploadError["code"], kind: MediaKind | null = null): string {
  switch (code) {
    case "type":
      return kind === "video" ? tt("Use an MP4, MOV, WebM or M4V video.") : kind === "image" ? tt("Use a JPG, PNG, WebP, GIF or HEIC picture.") : tt("Use a picture or a video file.")
    case "too_large":
      return kind === "video" ? tt("This video is over {limit}. Pick a shorter one.", { limit: formatBytes(MAX_ONEPAGE_VIDEO_BYTES) }) : tt("This file is bigger than uploads allow right now. Try a smaller one.")
    case "empty":
      return tt("This file is empty. Pick another one.")
    case "unreadable":
      return tt("This photo can't be opened in this browser. Save it as a JPG, or open the editor in Safari.")
    case "auth":
      return tt("Sign in again to upload.")
    case "network":
      return tt("The connection dropped. Check it and try again.")
    case "stalled":
      return tt("The upload stopped moving. Check your connection and try again.")
    case "cancelled":
      return tt("Upload stopped.")
    default:
      return tt("The upload did not finish. Try again.")
  }
}

/* ── The request ─────────────────────────────────────────────────────── */

export interface WireRequest {
  method: "POST" | "PATCH" | "HEAD" | "DELETE" | "PUT"
  url: string
  headers: Record<string, string>
  body?: Blob | null
  onProgress?: (sent: number) => void
  signal?: AbortSignal
}
export interface WireResponse {
  status: number
  header(name: string): string | null
  text: string
}
/** Sends one request. Resolves with any answer (status 0 for no answer); rejects only on cancel or a stall. */
export type Wire = (req: WireRequest) => Promise<WireResponse>

/** The browser's XMLHttpRequest, the one API with upload progress. */
export const xhrWire: Wire = (req) =>
  new Promise((resolve, reject) => {
    if (req.signal?.aborted) return reject(new UploadError("cancelled", uploadErrorText("cancelled")))
    const xhr = new XMLHttpRequest()
    let stalled = false
    const onAbort = () => xhr.abort()
    req.signal?.addEventListener("abort", onAbort, { once: true })
    const done = req.body ? watchUploadStall(xhr, () => (stalled = true)) : () => {}
    const finish = () => {
      done()
      req.signal?.removeEventListener("abort", onAbort)
    }
    if (req.body && req.onProgress) {
      xhr.upload.addEventListener("progress", (e) => req.onProgress?.(e.loaded))
    }
    xhr.addEventListener("load", () => {
      finish()
      resolve({ status: xhr.status, header: (n) => xhr.getResponseHeader(n), text: typeof xhr.responseText === "string" ? xhr.responseText : "" })
    })
    xhr.addEventListener("error", () => {
      finish()
      resolve({ status: 0, header: () => null, text: "" })
    })
    xhr.addEventListener("abort", () => {
      finish()
      if (req.signal?.aborted) reject(new UploadError("cancelled", uploadErrorText("cancelled")))
      else if (stalled) reject(new UploadError("stalled", uploadErrorText("stalled")))
      else resolve({ status: 0, header: () => null, text: "" })
    })
    xhr.open(req.method, req.url)
    for (const [k, v] of Object.entries(req.headers)) xhr.setRequestHeader(k, v)
    xhr.send(req.body ?? null)
  })

/* ── The upload ──────────────────────────────────────────────────────── */

export interface MediaProgress {
  loaded: number
  total: number
  /** 0 to 100. */
  percent: number
}

export interface MediaUploadOptions {
  /** What the file is called in storage, before the time and a random part: "wallpaper-video". */
  prefix: string
  /** What the caller asked for; a file that is not it is refused before anything is sent. */
  want?: MediaWant
  bucket?: string
  onProgress?: (p: MediaProgress) => void
  /** "preparing" while a picture is made smaller, then "uploading". */
  onStage?: (stage: "preparing" | "uploading") => void
  signal?: AbortSignal
  /* For tests and the probe: */
  wire?: Wire
  session?: () => Promise<{ token: string; userId: string } | null>
  baseUrl?: string
  anonKey?: string
  /** Milliseconds before the first retry; doubles each time. */
  retryDelayMs?: number
  maxRetries?: number
  /** Round 41: whose folder. Left out, the page owner's for a team member (lib/onepage/team-context teamPageOwner), else the signed in account's. */
  owner?: string | null
}

export interface MediaUploadResult {
  url: string
  path: string
  bucket: string
  mime: string
  size: number
  kind: MediaKind
}

async function browserSession(): Promise<{ token: string; userId: string } | null> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  let session = data.session
  /* A long video outlives an hour's token: take a fresh one when this one is close to its end. */
  if (session?.expires_at && session.expires_at * 1000 - Date.now() < 120_000) {
    const refreshed = await supabase.auth.refreshSession().catch(() => null)
    session = refreshed?.data.session ?? session
  }
  return session?.access_token && session.user?.id ? { token: session.access_token, userId: session.user.id } : null
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new UploadError("cancelled", uploadErrorText("cancelled")))
    const t = setTimeout(resolve, ms)
    signal?.addEventListener("abort", () => {
      clearTimeout(t)
      reject(new UploadError("cancelled", uploadErrorText("cancelled")))
    }, { once: true })
  })

function b64(text: string): string {
  if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(text)))
  return Buffer.from(text, "utf8").toString("base64")
}

/**
 * Checks, prepares and uploads one picture or video. Resolves with its public
 * address; rejects with an UploadError whose message is the sentence to show.
 */
export async function uploadOnePageMedia(file: File | Blob, o: MediaUploadOptions): Promise<MediaUploadResult> {
  const name = (file as File).name || ""
  const verdict = checkMedia({ name, type: file.type, size: file.size }, o.want ?? "any")
  if (!verdict.ok || !verdict.kind) throw new UploadError(verdict.code ?? "type", uploadErrorText(verdict.code ?? "type", verdict.kind))
  const kind: MediaKind = verdict.kind

  let body: Blob = file
  let mime = verdict.mime
  let ext = verdict.ext
  if (imageNeedsReencode({ kind, mime: verdict.mime, ext: verdict.ext, convert: verdict.convert }, file.size)) {
    o.onStage?.("preparing")
    const prepared = await prepareImage(file)
    body = prepared.blob
    mime = prepared.mime
    ext = prepared.ext
  }

  const base = (o.baseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
  const anon = o.anonKey ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  const getSession = o.session ?? browserSession
  const wire = o.wire ?? xhrWire
  const bucket = o.bucket ?? ONEPAGE_MEDIA_BUCKET
  const maxRetries = o.maxRetries ?? 5
  const delay = o.retryDelayMs ?? 800
  if (!base) throw new UploadError("server", uploadErrorText("server"))

  const first = await getSession()
  if (!first) throw new UploadError("auth", uploadErrorText("auth"))
  /* Round 41: a team member editing the store's OnePage uploads into the page owner's folder (lib/onepage/team-context), never their own. */
  const teamOwner = o.owner === undefined ? teamPageOwner() : o.owner
  const path = mediaPath(teamOwner ?? first.userId, o.prefix, ext)
  const total = body.size
  let lastReported = -1
  const report = (loaded: number) => {
    const clamped = Math.max(0, Math.min(total, loaded))
    const percent = total > 0 ? Math.min(100, Math.floor((clamped / total) * 100)) : 100
    if (percent === lastReported && clamped !== total) return
    lastReported = percent
    o.onProgress?.({ loaded: clamped, total, percent })
  }
  const headersFor = async () => {
    const s = (await getSession()) ?? first
    const h: Record<string, string> = { Authorization: `Bearer ${s.token}` }
    if (anon) h.apikey = anon
    return h
  }
  const fail = (res: WireResponse): never => {
    const code = readStorageFailure(res.status, res.text)
    if (code === "too_large" || code === "type" || code === "auth") console.warn(`[onepage upload] storage said ${res.status}: ${res.text.slice(0, 300)}`)
    /* Storage's "too large" for a file under our own limit is the bucket's or the project's upload limit (Supabase dashboard > Storage > Settings), not the file's fault. */
    const words = code === "too_large" ? uploadErrorText("too_large", null) : uploadErrorText(code, kind)
    throw Object.assign(new UploadError(code, words), { status: res.status })
  }

  o.onStage?.("uploading")
  report(0)

  if (teamOwner && teamOwner !== first.userId) {
    /* Storage's own policies answer only for the account's own folder, so the server signs this one path when the member holds OnePage (app/api/team/upload-url), and the file goes up as one request. */
    await signedPut({ wire, bucket, path, body, mime, report, fail, signal: o.signal })
  } else if (uploadRoute(total) === "single") {
    for (let attempt = 0; ; attempt++) {
      const res = await wire({
        method: "POST",
        url: `${base}/storage/v1/object/${bucket}/${encodePath(path)}`,
        headers: { ...(await headersFor()), "x-upsert": "true", "cache-control": "max-age=31536000", "content-type": mime },
        body,
        onProgress: report,
        signal: o.signal,
      })
      if (res.status >= 200 && res.status < 300) break
      const code = readStorageFailure(res.status, res.text)
      if (!retryable(code, res.status) || attempt >= Math.min(2, maxRetries)) fail(res)
      await wait(delay * 2 ** attempt, o.signal)
    }
  } else {
    await resumable({ wire, base, bucket, path, body, mime, headersFor, report, fail, signal: o.signal, maxRetries, delay })
  }

  report(total)
  confirmUpload(bucket, path)
  return { url: publicMediaUrl(base, bucket, path), path, bucket, mime, size: total, kind }
}

/** A team member's upload (round 41): a signed address for the path from the server, then one PUT with progress. */
async function signedPut(a: { wire: Wire; bucket: string; path: string; body: Blob; mime: string; report: (n: number) => void; fail: (res: WireResponse) => never; signal?: AbortSignal }): Promise<void> {
  let signedUrl: string | null = null
  try {
    const r = await fetch("/api/team/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ bucket: a.bucket, path: a.path }), signal: a.signal })
    if (r.status === 401) throw new UploadError("auth", uploadErrorText("auth"))
    if (r.ok) signedUrl = ((await r.json()) as { signedUrl?: string }).signedUrl ?? null
  } catch (e) {
    if (e instanceof UploadError) throw e
    if (a.signal?.aborted) throw new UploadError("cancelled", uploadErrorText("cancelled"))
    throw new UploadError("network", uploadErrorText("network"))
  }
  if (!signedUrl) throw new UploadError("server", uploadErrorText("server"))
  const res = await a.wire({ method: "PUT", url: signedUrl, headers: { "content-type": a.mime, "cache-control": "max-age=31536000" }, body: a.body, onProgress: a.report, signal: a.signal })
  if (res.status < 200 || res.status >= 300) a.fail(res)
}

async function resumable(a: {
  wire: Wire
  base: string
  bucket: string
  path: string
  body: Blob
  mime: string
  headersFor: () => Promise<Record<string, string>>
  report: (n: number) => void
  fail: (res: WireResponse) => never
  signal?: AbortSignal
  maxRetries: number
  delay: number
}): Promise<void> {
  const endpoint = `${a.base}/storage/v1/upload/resumable`
  const metadata = [
    `bucketName ${b64(a.bucket)}`,
    `objectName ${b64(a.path)}`,
    `contentType ${b64(a.mime)}`,
    `cacheControl ${b64("31536000")}`,
  ].join(",")
  const tus = async () => ({ ...(await a.headersFor()), "Tus-Resumable": "1.0.0" })

  let location: string | null = null
  const create = async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await a.wire({
        method: "POST",
        url: endpoint,
        headers: { ...(await tus()), "Upload-Length": String(a.body.size), "Upload-Metadata": metadata, "x-upsert": "true" },
        signal: a.signal,
      })
      const loc = res.header("Location") || res.header("location")
      if (res.status === 201 && loc) {
        location = new URL(loc, endpoint).toString()
        return
      }
      const code = readStorageFailure(res.status, res.text)
      if (!retryable(code, res.status) || attempt >= a.maxRetries) a.fail(res)
      await wait(a.delay * 2 ** attempt, a.signal)
    }
  }
  /** How much storage has, or null when it no longer knows the upload. */
  const offsetNow = async (): Promise<number | null> => {
    const res = await a.wire({ method: "HEAD", url: location!, headers: await tus(), signal: a.signal })
    if (res.status === 404 || res.status === 410) return null
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error("head"), { res })
    const n = Number(res.header("Upload-Offset"))
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  try {
    await create()
    let offset = 0
    let failures = 0
    while (offset < a.body.size) {
      const end = Math.min(offset + TUS_PART_BYTES, a.body.size)
      const from = offset
      const res = await a.wire({
        method: "PATCH",
        url: location!,
        headers: { ...(await tus()), "Upload-Offset": String(from), "Content-Type": "application/offset+octet-stream" },
        body: a.body.slice(from, end),
        onProgress: (sent) => a.report(from + sent),
        signal: a.signal,
      })
      if (res.status === 204 || (res.status >= 200 && res.status < 300)) {
        const acknowledged = Number(res.header("Upload-Offset"))
        offset = Number.isFinite(acknowledged) && acknowledged > from ? acknowledged : end
        failures = 0
        a.report(offset)
        continue
      }
      const code = readStorageFailure(res.status, res.text)
      /* 409: the offset storage has is not ours; ask it. Anything else that could pass, after a pause. */
      if (res.status !== 409 && !retryable(code, res.status)) a.fail(res)
      if (++failures > a.maxRetries) a.fail(res)
      await wait(a.delay * 2 ** (failures - 1), a.signal)
      try {
        const known = await offsetNow()
        if (known === null) {
          await create()
          offset = 0
        } else {
          offset = known
        }
        a.report(offset)
      } catch {
        /* The question failed too: the next loop tries the same part again. */
      }
    }
  } catch (err) {
    if (err instanceof UploadError && err.code === "cancelled" && location) {
      /* Storage keeps unfinished parts for a day; this asks it to drop them now. */
      void a.wire({ method: "DELETE", url: location, headers: await tus().catch(() => ({})) as Record<string, string> }).catch(() => {})
    }
    throw err
  }
}

/* ── Pictures made web friendly ──────────────────────────────────────── */

interface Decoded {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

/** Draws a picture file in this browser, or null when it cannot (a HEIC outside Safari). */
export async function decodeImage(file: Blob): Promise<Decoded | null> {
  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() }
    }
  } catch {
    /* Fall through to an <img>, which some Safari versions decode when createImageBitmap does not. */
  }
  if (typeof document === "undefined") return null
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = "async"
    img.src = url
    await img.decode()
    if (!img.naturalWidth) throw new Error("empty")
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality))
}

/*
  A CANVAS GIVES ITS PIXELS BACK AS SOON AS ITS FILE IS MADE (round 12). A
  4096px picture drawn to a canvas holds 48MB until the canvas is collected,
  whenever that is, and Safari counts every canvas against a hard limit
  ("Total canvas memory use exceeds the maximum limit"). Sized to nothing,
  the canvas lets its pixels go at once.
*/
export function releaseCanvas(canvas: HTMLCanvasElement | null | undefined): void {
  if (!canvas) return
  canvas.width = 0
  canvas.height = 0
}

/**
 * A picture this page can draw and storage keeps: a HEIC becomes a JPEG, and
 * one larger than MAX_STORED_IMAGE_BYTES is drawn again at most 4096px on its
 * long side. A PNG keeps its transparency (WebP where the browser writes it).
 */
export async function prepareImage(file: Blob, maxSide = 4096): Promise<{ blob: Blob; mime: string; ext: string }> {
  const decoded = await decodeImage(file)
  if (!decoded) throw new UploadError("unreadable", uploadErrorText("unreadable"))
  let canvas: HTMLCanvasElement | null = null
  try {
    const scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height))
    canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new UploadError("unreadable", uploadErrorText("unreadable"))
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
    const keepsAlpha = file.type === "image/png" || file.type === "image/webp"
    if (keepsAlpha) {
      const webp = await canvasBlob(canvas, "image/webp", 0.9)
      if (webp && webp.type === "image/webp") return { blob: webp, mime: "image/webp", ext: "webp" }
      const png = await canvasBlob(canvas, "image/png", 1)
      if (png) return { blob: png, mime: "image/png", ext: "png" }
    }
    const jpeg = await canvasBlob(canvas, "image/jpeg", 0.9)
    if (!jpeg) throw new UploadError("unreadable", uploadErrorText("unreadable"))
    return { blob: jpeg, mime: "image/jpeg", ext: "jpg" }
  } finally {
    decoded.release()
    releaseCanvas(canvas)
  }
}

/**
 * A picture the cropper can show: the file's own address when this browser
 * draws it, or a JPEG made from it (a HEIC in Safari). Throws an UploadError
 * with the sentence when the file is not a picture this page can use.
 */
export async function openableImage(file: File): Promise<{ url: string; blob: Blob }> {
  const verdict = checkMedia(file, "image")
  if (!verdict.ok) throw new UploadError(verdict.code ?? "type", uploadErrorText(verdict.code ?? "type", "image"))
  if (!verdict.convert) return { url: URL.createObjectURL(file), blob: file }
  const prepared = await prepareImage(file)
  return { url: URL.createObjectURL(prepared.blob), blob: prepared.blob }
}

/** The words for an error of any shape, for the line under an upload. */
export function uploadMessage(err: unknown): string {
  if (err instanceof UploadError) return err.message
  return uploadErrorText("server")
}

/**
 * The cropped part of a picture as a new file: `crop` in percent of the whole
 * picture (lib/onepage/media-crop.ts), drawn at `size` (square side, or the
 * long side for a free crop). The picture is read the same way the cropper
 * showed it (EXIF orientation applied), so what was framed is what is kept.
 */
export async function cropImageBlob(
  file: Blob,
  crop: { x: number; y: number; width: number; height: number },
  o: { size: number; type?: "image/jpeg" | "image/png" | "image/webp"; quality?: number },
): Promise<Blob> {
  const decoded = await decodeImage(file)
  if (!decoded) throw new UploadError("unreadable", uploadErrorText("unreadable"))
  let canvas: HTMLCanvasElement | null = null
  try {
    const sx = (crop.x / 100) * decoded.width
    const sy = (crop.y / 100) * decoded.height
    const sw = Math.max(1, (crop.width / 100) * decoded.width)
    const sh = Math.max(1, (crop.height / 100) * decoded.height)
    /* Never larger than the pixels there are. */
    const scale = Math.min(1, o.size / Math.max(sw, sh))
    canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(sw * scale))
    canvas.height = Math.max(1, Math.round(sh * scale))
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new UploadError("unreadable", uploadErrorText("unreadable"))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(decoded.source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    const type = o.type ?? "image/jpeg"
    const out = await canvasBlob(canvas, type, o.quality ?? 0.92)
    if (out && out.type === type) return out
    const fallback = await canvasBlob(canvas, type === "image/jpeg" ? "image/jpeg" : "image/png", 0.92)
    if (!fallback) throw new UploadError("unreadable", uploadErrorText("unreadable"))
    return fallback
  } finally {
    decoded.release()
    releaseCanvas(canvas)
  }
}
