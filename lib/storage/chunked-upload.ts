/**
 * ===========================================================================
 *  THE UPLOADER FOR A PRODUCT'S FILES
 * ===========================================================================
 * One file, from the page straight to storage, never through a function:
 *
 *   1. (no browser checksum: the server hashes the stored file afterwards)
 *   2. preparing           /api/v2/upload/prepare: the server builds the path,
 *                          checks quota, rate and file limits, and makes a
 *                          pending record. A second prepare for the same file
 *                          sends its assetId and gets the same record back.
 *   3. uploading           the bytes. Files up to 6 MB go in one PUT to the
 *                          signed URL. Larger ones go by TUS, Supabase's
 *                          resumable protocol, in 6 MB parts: storage keeps
 *                          every part it has acknowledged, so a dropped
 *                          connection or a pause continues from the last part
 *                          storage confirmed, not from zero. If TUS is not
 *                          available (an older database without the policy
 *                          that lets a person write the one path reserved for
 *                          them), the whole file goes by signed URL instead.
 *   4. completing          /api/v2/upload/complete: the server reads the size
 *                          and a few small ranges back from storage and runs
 *                          the file check (lib/security/uploads).
 *   5. complete
 *
 * PAUSE AND RESUME. pause() stops the request in flight. A stopped request is
 * never counted as done: the run waits, and complete() is only called after
 * every byte has been acknowledged by storage. resume() lets the same run
 * carry on, asking storage how much it has (TUS HEAD) before sending more.
 * It used to be that an aborted request RESOLVED, so a pause went straight on
 * to complete() with half a file, and resume() started again from 0%.
 *
 * CANCEL. abort() stops everything. A cancel that arrives while the file is
 * being completed is checked after complete() returns too, so the file is
 * never handed to onComplete, and /api/v2/upload/cancel removes the record
 * and the bytes. Anything that still slips through (a closed tab) is pending
 * or unattached and the storage cleanup cron removes it.
 *
 * The public shape (constructor options, start, pause, resume, abort,
 * getStatus, destroy, the callbacks and the statuses) is unchanged.
 */

// ── Types ──────────────────────────────────────────────────────────

export interface UploadOptions {
  file: File
  productId?: string
  folder?: string // "digital" | "product-images"
  onProgress?: (percent: number, bytesUploaded: number, bytesTotal: number) => void
  onComplete?: (result: UploadResult) => void
  onError?: (error: UploadError) => void
  onStatusChange?: (status: UploadStatus) => void
  /** Unused since the chunked path was removed; kept so callers still compile. */
  chunkSize?: number
  /** Max retry attempts per part. Default: 3 */
  maxRetries?: number
  /**
   * The signed in person's access token, for resumable uploads. Defaults to
   * the browser session (lib/supabase/client). Tests pass their own.
   */
  getAccessToken?: () => Promise<string | null>
}

export interface UploadResult {
  assetId: string | null
  path: string
  bucket: string
  publicUrl: string
  checksum: string
  fileName: string
  fileSize: number
  mimeType: string
  /** The file check's verdict, as /complete said: "clean" for every file it accepted. */
  scanStatus?: string | null
}

export interface UploadError {
  message: string
  code: string
  retryable: boolean
  httpStatus?: number
}

export type UploadStatus =
  | "idle"
  | "preparing"
  | "computing_checksum"
  | "uploading"
  | "completing"
  | "complete"
  | "paused"
  | "error"
  | "aborted"

// ── Constants ──────────────────────────────────────────────────────

const MAX_RETRIES = 3
const RETRY_BASE_DELAY_MS = 1000

/** Supabase's TUS endpoint takes parts of exactly this size (the last may be smaller). */
export const RESUMABLE_PART_BYTES = 6 * 1024 * 1024

/** Up to this, one PUT to the signed URL; above it, resumable parts. */
export const SINGLE_PUT_MAX_BYTES = RESUMABLE_PART_BYTES

/** Vercel's function body limit, for the last resort through the server. */
const SERVER_UPLOAD_MAX_BYTES = 4 * 1024 * 1024

// ── SHA-256 Checksum ───────────────────────────────────────────────

/**
 * Compute SHA-256 checksum of a File using Web Crypto API.
 * For large files (>100MB), computes a fast fingerprint from the
 * first and last 2MB + file metadata to avoid out-of-memory crashes.
 */
export async function computeSHA256(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "no-crypto-api"
  }

  const PARTIAL_HASH_THRESHOLD = 100 * 1024 * 1024 // 100MB
  const SAMPLE_SIZE = 2 * 1024 * 1024 // 2MB

  // For large files, hash first+last 2MB + metadata to avoid OOM
  if (file.size > PARTIAL_HASH_THRESHOLD) {
    onProgress?.(10)
    const head = await file.slice(0, SAMPLE_SIZE).arrayBuffer()
    onProgress?.(30)
    const tail = await file.slice(Math.max(0, file.size - SAMPLE_SIZE)).arrayBuffer()
    onProgress?.(50)

    // Combine head + tail + metadata into a single buffer
    const meta = new TextEncoder().encode(`${file.name}:${file.size}:${file.lastModified}`)
    const combined = new Uint8Array(head.byteLength + tail.byteLength + meta.byteLength)
    combined.set(new Uint8Array(head), 0)
    combined.set(new Uint8Array(tail), head.byteLength)
    combined.set(meta, head.byteLength + tail.byteLength)

    const hashBuffer = await crypto.subtle.digest("SHA-256", combined)
    onProgress?.(100)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }

  // For smaller files, hash the whole thing
  onProgress?.(10)
  const buffer = await file.arrayBuffer()
  onProgress?.(50)
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)
  onProgress?.(100)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

// ── Helpers ────────────────────────────────────────────────────────

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

function isUploadError(e: unknown): e is UploadError {
  return !!e && typeof e === "object" && "code" in e && "message" in e
}

/** A stopped request, which is not an answer about the file. */
const PAUSED: UploadError = { message: "Upload paused", code: "PAUSED", retryable: true }

/** TUS could not be used here: send the file by signed URL instead. */
const NO_RESUMABLE: UploadError = { message: "Resumable upload unavailable", code: "NO_RESUMABLE", retryable: true }

async function sessionAccessToken(): Promise<string | null> {
  try {
    const { createClient } = await import("@/lib/supabase/client")
    const { data } = await createClient().auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

// ── Direct Uploader Class ──────────────────────────────────────────

export class DirectUploader {
  private file: File
  private productId?: string
  private folder: string
  private maxRetries: number
  private getAccessToken: () => Promise<string | null>

  private status: UploadStatus = "idle"
  /** The status to go back to when a pause ends. */
  private activeStatus: UploadStatus = "idle"
  private xhr: XMLHttpRequest | null = null
  private aborted = false
  private paused = false
  private waiters: Array<{ resolve: () => void; reject: (e: UploadError) => void }> = []
  private run: Promise<UploadResult> | null = null
  private discarded = false

  // State kept across pauses and retries
  private signedUrl: string | null = null
  private uploadToken: string | null = null
  private uploadPath: string | null = null
  private uploadBucket: string | null = null
  private assetId: string | null = null
  private checksum: string | null = null
  /** The TUS upload's own URL, once storage has made one. */
  private resumableUrl: string | null = null
  /** Bytes storage has acknowledged. Only a successful answer moves it. */
  private confirmed = 0

  // Callbacks
  private onProgress?: UploadOptions["onProgress"]
  private onComplete?: UploadOptions["onComplete"]
  private onError?: UploadOptions["onError"]
  private onStatusChange?: UploadOptions["onStatusChange"]

  // Internet connectivity listeners
  private offlineHandler: (() => void) | null = null
  private onlineHandler: (() => void) | null = null

  constructor(options: UploadOptions) {
    this.file = options.file
    this.productId = options.productId
    this.folder = options.folder || "digital"
    this.maxRetries = options.maxRetries || MAX_RETRIES
    this.onProgress = options.onProgress
    this.onComplete = options.onComplete
    this.onError = options.onError
    this.onStatusChange = options.onStatusChange
    this.getAccessToken = options.getAccessToken ?? sessionAccessToken

    // Auto-pause on internet loss, auto-resume on reconnect
    if (typeof window !== "undefined") {
      this.offlineHandler = () => {
        if (this.status === "uploading" || this.status === "preparing" || this.status === "completing") {
          this.pause()
        }
      }
      this.onlineHandler = () => {
        if (this.status === "paused" && !this.aborted) {
          this.resume().catch(() => {})
        }
      }
      window.addEventListener("offline", this.offlineHandler)
      window.addEventListener("online", this.onlineHandler)
    }
  }

  /** Remove event listeners when upload is done. Call when discarding the uploader. */
  destroy(): void {
    if (typeof window !== "undefined") {
      if (this.offlineHandler) window.removeEventListener("offline", this.offlineHandler)
      if (this.onlineHandler) window.removeEventListener("online", this.onlineHandler)
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Runs the upload. Calling it again while it runs returns the same run. */
  start(): Promise<UploadResult> {
    if (this.run) return this.run
    this.aborted = false
    this.paused = false
    this.run = this.execute().finally(() => {
      this.run = null
    })
    return this.run
  }

  abort(): void {
    if (this.aborted || this.status === "complete") return
    this.aborted = true
    this.paused = false
    this.xhr?.abort()
    const waiting = this.waiters
    this.waiters = []
    for (const w of waiting) w.reject(this.abortError())
    this.setStatus("aborted")
    /* Not running (it failed, or never started): nothing will tidy up but this. */
    if (!this.run) void this.discard()
  }

  pause(): void {
    if (this.paused || this.aborted || !this.run) return
    if (this.status === "complete" || this.status === "error" || this.status === "aborted") return
    this.paused = true
    this.activeStatus = this.status
    this.xhr?.abort()
    this.setStatus("paused")
  }

  /**
   * Carries on where storage left off. While a run is paused this lets the
   * same run continue; after an error it starts again, reusing the record
   * and, for a resumable upload, the parts storage already has.
   */
  resume(): Promise<UploadResult> {
    if (this.aborted) return Promise.reject(this.abortError())
    if (this.paused && this.run) {
      this.paused = false
      this.setStatus(this.activeStatus === "paused" ? "uploading" : this.activeStatus)
      const waiting = this.waiters
      this.waiters = []
      for (const w of waiting) w.resolve()
      return this.run
    }
    return this.start()
  }

  getStatus(): UploadStatus {
    return this.status
  }

  // ── The run ─────────────────────────────────────────────────────

  private async execute(): Promise<UploadResult> {
    try {
      /* No fingerprint in the browser first: reading a large file twice
         delayed every upload, and the server takes the real SHA-256 from
         storage after the upload (lib/security/uploads/pipeline.ts). */
      await this.checkpoint()

      if (!this.uploadPath) {
        this.setStatus("preparing")
        await this.prepare()
      }
      await this.checkpoint()

      this.setStatus("uploading")
      await this.transfer()

      /* Every byte is acknowledged. A cancel or pause that came in the
         meantime is honoured before the file is completed. */
      await this.checkpoint()

      this.setStatus("completing")
      const result = await this.completeWithRetry()

      /* A cancel during completing: the server finished, the person did not
         want it. It is removed, and never reported as done. */
      if (this.aborted) throw this.abortError()

      this.setStatus("complete")
      this.destroy()
      this.onComplete?.(result)
      return result
    } catch (err) {
      if (this.aborted || (isUploadError(err) && err.code === "ABORTED")) {
        this.aborted = true
        this.setStatus("aborted")
        this.destroy()
        await this.discard()
        const abortErr = this.abortError()
        this.onError?.(abortErr)
        throw abortErr
      }

      this.setStatus("error")
      const uploadErr: UploadError = isUploadError(err)
        ? err
        : { message: err instanceof Error ? err.message : String(err), code: "UNKNOWN", retryable: true }
      this.onError?.(uploadErr)
      throw uploadErr
    }
  }

  /** Throws if cancelled; waits while paused. */
  private async checkpoint(): Promise<void> {
    if (this.aborted) throw this.abortError()
    while (this.paused) {
      await new Promise<void>((resolve, reject) => this.waiters.push({ resolve, reject }))
      if (this.aborted) throw this.abortError()
    }
  }

  private setStatus(status: UploadStatus) {
    if (this.status === status) return
    this.status = status
    this.onStatusChange?.(status)
  }

  private abortError(): UploadError {
    return { message: "Upload cancelled", code: "ABORTED", retryable: false }
  }

  private report(sent: number) {
    const total = this.file.size || 1
    this.onProgress?.(Math.min(95, Math.round(5 + (sent / total) * 90)), sent, this.file.size)
  }

  // ── Step 2: prepare ─────────────────────────────────────────────

  /**
   * /api/v2/upload/prepare: a signed upload URL for a path the server built.
   * Sends the assetId it already has, so a second prepare is the same upload.
   */
  private async prepare(): Promise<void> {
    const body = {
      fileName: this.file.name,
      contentType: this.file.type || "application/octet-stream",
      fileSize: this.file.size,
      productId: this.productId,
      folder: this.folder,
      assetId: this.assetId,
    }

    const res = await fetch("/api/v2/upload/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw {
        message: data.error || `Prepare failed: ${res.status}`,
        code: "PREPARE_FAILED",
        retryable: res.status >= 500,
        httpStatus: res.status,
      } as UploadError
    }

    const data = await res.json()
    this.signedUrl = data.signedUrl
    this.uploadToken = data.token
    this.uploadPath = data.path
    this.uploadBucket = data.bucket
    this.assetId = data.assetId ?? this.assetId
  }

  // ── Step 3: the bytes ───────────────────────────────────────────

  private async transfer(): Promise<void> {
    if (this.file.size > SINGLE_PUT_MAX_BYTES) {
      try {
        await this.resumable()
        return
      } catch (err) {
        if (!isUploadError(err) || err.code !== "NO_RESUMABLE") throw err
        /* No TUS here: the whole file by signed URL, as before. */
        this.resumableUrl = null
        this.confirmed = 0
      }
    }
    await this.singlePut()
  }

  /** One PUT of the whole file, retried; a pause waits and sends it again. */
  private async singlePut(): Promise<void> {
    let lastError: UploadError | null = null
    let attempt = 0

    while (attempt <= this.maxRetries) {
      await this.checkpoint()
      try {
        await this.putOnce()
        this.confirmed = this.file.size
        return
      } catch (err) {
        const e = err as UploadError
        if (e.code === "ABORTED") throw e
        if (e.code === "PAUSED") continue // not an attempt: wait for resume, then send again
        lastError = e

        // A signed URL that expired or was refused: ask for a fresh one
        if (e.httpStatus === 400 || e.httpStatus === 403 || e.httpStatus === 413) {
          try {
            await this.prepare()
          } catch {
            // Retry anyway
          }
        }

        attempt++
        if (attempt <= this.maxRetries) {
          await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)))
        }
      }
    }

    // Last resort: through the server, for files a function can take
    if (this.file.size <= SERVER_UPLOAD_MAX_BYTES) {
      await this.checkpoint()
      try {
        await this.uploadViaServer()
        this.confirmed = this.file.size
        return
      } catch (err) {
        if (isUploadError(err) && (err.code === "ABORTED" || err.code === "PAUSED")) throw err
        // Fall through to the original error
      }
    }

    throw lastError ?? { message: "Upload failed", code: "UPLOAD_FAILED", retryable: true }
  }

  /**
   * The file in one PUT to the signed URL. A request stopped by pause or
   * cancel REJECTS (PAUSED or ABORTED): it is not an upload.
   */
  private putOnce(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.signedUrl) {
        reject({ message: "No signed URL", code: "NO_URL", retryable: true })
        return
      }

      const xhr = new XMLHttpRequest()
      this.xhr = xhr

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) this.report(e.loaded)
      })

      xhr.addEventListener("load", () => {
        this.xhr = null
        if (xhr.status >= 200 && xhr.status < 300) {
          this.report(this.file.size)
          resolve()
        } else {
          reject({
            message: `Upload failed: HTTP ${xhr.status}`,
            code: "UPLOAD_HTTP_ERROR",
            retryable: true,
            httpStatus: xhr.status,
          } as UploadError)
        }
      })

      xhr.addEventListener("error", () => {
        this.xhr = null
        reject(this.paused ? PAUSED : ({ message: "Network error during upload", code: "NETWORK_ERROR", retryable: true } as UploadError))
      })

      xhr.addEventListener("abort", () => {
        this.xhr = null
        reject(this.aborted ? this.abortError() : PAUSED)
      })

      xhr.open("PUT", this.signedUrl)
      xhr.setRequestHeader("Content-Type", this.file.type || "application/octet-stream")
      xhr.setRequestHeader("Cache-Control", "max-age=31536000")
      xhr.setRequestHeader("x-upsert", "true")
      xhr.send(this.file)
    })
  }

  // ── Resumable (TUS) ─────────────────────────────────────────────

  private endpoint(): string | null {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    return base ? `${base.replace(/\/+$/, "")}/storage/v1/upload/resumable` : null
  }

  private async tusHeaders(): Promise<Record<string, string>> {
    const token = await this.getAccessToken()
    if (!token) throw NO_RESUMABLE
    const headers: Record<string, string> = { "Tus-Resumable": "1.0.0", Authorization: `Bearer ${token}` }
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (anon) headers.apikey = anon
    return headers
  }

  /** Makes the TUS upload for the reserved path. Any refusal means "use the signed URL". */
  private async createResumable(): Promise<void> {
    const endpoint = this.endpoint()
    if (!endpoint || !this.uploadPath || !this.uploadBucket) throw NO_RESUMABLE
    const headers = await this.tusHeaders()
    const metadata = [
      `bucketName ${b64(this.uploadBucket)}`,
      `objectName ${b64(this.uploadPath)}`,
      `contentType ${b64(this.file.type || "application/octet-stream")}`,
      `cacheControl ${b64("31536000")}`,
    ].join(",")
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: "POST",
        headers: { ...headers, "Upload-Length": String(this.file.size), "Upload-Metadata": metadata, "x-upsert": "true" },
      })
    } catch {
      throw NO_RESUMABLE
    }
    const location = res.headers.get("Location")
    if (res.status !== 201 || !location) throw NO_RESUMABLE
    this.resumableUrl = new URL(location, endpoint).toString()
    this.confirmed = 0
  }

  /** How many bytes storage has for this upload, or null when it no longer knows it. */
  private async resumableOffset(): Promise<number | null> {
    if (!this.resumableUrl) return null
    const headers = await this.tusHeaders()
    const res = await fetch(this.resumableUrl, { method: "HEAD", headers })
    if (res.status === 404 || res.status === 410) return null
    if (!res.ok) throw { message: `Upload check failed: HTTP ${res.status}`, code: "RESUME_CHECK_FAILED", retryable: true, httpStatus: res.status } as UploadError
    const offset = Number(res.headers.get("Upload-Offset"))
    return Number.isFinite(offset) && offset >= 0 ? offset : null
  }

  private async resumable(): Promise<void> {
    if (!this.resumableUrl) await this.createResumable()

    let failures = 0
    let mustAsk = this.confirmed > 0 // resumed after an error: ask storage first
    while (true) {
      await this.checkpoint()

      if (mustAsk) {
        try {
          const offset = await this.resumableOffset()
          if (offset === null) {
            // Storage forgot the upload (it expires): start the parts again
            await this.createResumable()
          } else {
            this.confirmed = offset
          }
          mustAsk = false
        } catch (err) {
          if (isUploadError(err) && err.code === "NO_RESUMABLE") throw err
          failures++
          if (failures > this.maxRetries) throw err
          await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, failures - 1)))
          continue
        }
      }

      if (this.confirmed >= this.file.size) return

      try {
        this.confirmed = await this.sendPart(this.confirmed)
        failures = 0
        this.report(this.confirmed)
      } catch (err) {
        const e = err as UploadError
        if (e.code === "ABORTED") throw e
        /* A pause stopped the part mid way. Storage may have kept some of
           it: after resume, ask how much, rather than trusting either count. */
        mustAsk = true
        if (e.code === "PAUSED") continue
        failures++
        if (failures > this.maxRetries) throw e
        await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, failures - 1)))
      }
    }
  }

  /** One part from `offset`. Resolves with the offset storage acknowledged. */
  private async sendPart(offset: number): Promise<number> {
    const url = this.resumableUrl
    if (!url) throw NO_RESUMABLE
    const headers = await this.tusHeaders()
    const end = Math.min(offset + RESUMABLE_PART_BYTES, this.file.size)
    const part = this.file.slice(offset, end)

    return new Promise<number>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      this.xhr = xhr

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) this.report(offset + e.loaded)
      })

      xhr.addEventListener("load", () => {
        this.xhr = null
        if (xhr.status === 204 || (xhr.status >= 200 && xhr.status < 300)) {
          const acknowledged = Number(xhr.getResponseHeader("Upload-Offset"))
          resolve(Number.isFinite(acknowledged) && acknowledged > offset ? acknowledged : end)
        } else {
          reject({
            message: `Part failed: HTTP ${xhr.status}`,
            code: "PART_FAILED",
            retryable: true,
            httpStatus: xhr.status,
          } as UploadError)
        }
      })

      xhr.addEventListener("error", () => {
        this.xhr = null
        reject(this.paused ? PAUSED : ({ message: "Network error during upload", code: "NETWORK_ERROR", retryable: true } as UploadError))
      })

      xhr.addEventListener("abort", () => {
        this.xhr = null
        reject(this.aborted ? this.abortError() : PAUSED)
      })

      xhr.open("PATCH", url)
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
      xhr.setRequestHeader("Upload-Offset", String(offset))
      xhr.setRequestHeader("Content-Type", "application/offset+octet-stream")
      xhr.send(part)
    })
  }

  /**
   * Fallback: upload through server if direct signed URL fails.
   * Uses XHR for real progress even through the server.
   */
  private uploadViaServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const formData = new FormData()
      formData.append("file", this.file)
      formData.append("folder", this.folder)
      if (this.productId) formData.append("productId", this.productId)
      /* The record /prepare already made, so the server fills it rather than adding a second. */
      if (this.assetId) formData.append("assetId", this.assetId)

      const xhr = new XMLHttpRequest()
      this.xhr = xhr

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) this.report(e.loaded)
      })

      xhr.addEventListener("load", () => {
        this.xhr = null
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            // Server-upload returns the asset directly
            if (data.assetId) this.assetId = data.assetId
            if (data.path) this.uploadPath = data.path
            if (data.bucket) this.uploadBucket = data.bucket
          } catch {
            /* the upload itself succeeded */
          }
          this.report(this.file.size)
          resolve()
        } else {
          let errMsg = `Server upload failed: HTTP ${xhr.status}`
          try {
            const data = JSON.parse(xhr.responseText)
            if (data.error) errMsg = data.error
          } catch { /* ignore */ }
          reject({
            message: errMsg,
            code: "SERVER_UPLOAD_FAILED",
            retryable: xhr.status >= 500,
            httpStatus: xhr.status,
          } as UploadError)
        }
      })

      xhr.addEventListener("error", () => {
        this.xhr = null
        reject(this.paused ? PAUSED : ({ message: "Network error during server upload", code: "NETWORK_ERROR", retryable: true } as UploadError))
      })

      xhr.addEventListener("abort", () => {
        this.xhr = null
        reject(this.aborted ? this.abortError() : PAUSED)
      })

      xhr.open("POST", "/api/v2/upload/server-upload")
      xhr.send(formData)
    })
  }

  // ── Step 4: complete ────────────────────────────────────────────

  /** complete(), retried through a dropped connection; a pause waits for resume. */
  private async completeWithRetry(): Promise<UploadResult> {
    let attempt = 0
    while (true) {
      await this.checkpoint()
      try {
        return await this.complete()
      } catch (err) {
        const e = err as UploadError
        if (this.aborted) throw this.abortError()
        if (e.code !== "NETWORK_ERROR" || attempt >= this.maxRetries) throw e
        attempt++
        if (!this.paused) await new Promise((r) => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1)))
      }
    }
  }

  /**
   * /api/v2/upload/complete: the server checks what storage holds and marks
   * the file done.
   */
  private async complete(): Promise<UploadResult> {
    const body = {
      assetId: this.assetId,
      path: this.uploadPath,
      bucket: this.uploadBucket,
      fileSize: this.file.size,
    }

    let res: Response
    try {
      res = await fetch("/api/v2/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch {
      throw { message: "Network error while finishing the upload", code: "NETWORK_ERROR", retryable: true } as UploadError
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      throw {
        message: data.error || `Complete failed: ${res.status}`,
        code: "COMPLETE_FAILED",
        retryable: res.status >= 500,
        httpStatus: res.status,
      } as UploadError
    }

    const data = await res.json()
    this.onProgress?.(100, this.file.size, this.file.size)

    return {
      assetId: this.assetId,
      path: this.uploadPath || "",
      bucket: this.uploadBucket || "",
      publicUrl: data.publicUrl || "",
      checksum: this.checksum || "",
      fileName: this.file.name,
      fileSize: this.file.size,
      mimeType: this.file.type || "application/octet-stream",
      scanStatus: typeof data?.asset?.scanStatus === "string" ? data.asset.scanStatus : null,
    }
  }

  // ── Cancel ──────────────────────────────────────────────────────

  /**
   * After a cancel: the record and the bytes go (/api/v2/upload/cancel), and
   * the TUS upload is ended. Best effort; what it misses, the storage
   * cleanup cron removes.
   */
  private async discard(): Promise<void> {
    if (this.discarded) return
    this.discarded = true
    const tasks: Promise<unknown>[] = []
    if (this.resumableUrl) {
      const url = this.resumableUrl
      tasks.push(
        this.tusHeaders()
          .then((headers) => fetch(url, { method: "DELETE", headers }))
          .catch(() => undefined),
      )
    }
    if (this.assetId) {
      tasks.push(
        fetch("/api/v2/upload/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assetId: this.assetId }),
          keepalive: true,
        }).catch(() => undefined),
      )
    }
    await Promise.all(tasks)
  }
}
