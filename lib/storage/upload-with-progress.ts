/**
 * ===========================================================================
 *  AN UPLOAD THAT SAYS HOW FAR IT HAS GOT
 * ===========================================================================
 * supabase-js uploads with `fetch`, which reports nothing until it is done,
 * so every progress bar in front of it was invented: 30, then 70, then 100.
 * The picture in the profile editor comes into focus as its bytes go up, and
 * that needs the real number, which only XMLHttpRequest's upload events give.
 *
 * The same endpoint supabase-js posts to, with the same session and the same
 * headers, so storage's policies see exactly the request they always have.
 * The product editor has uploaded its photos this way for a long time.
 *
 * If the request cannot even be made (no session in this client, no
 * XMLHttpRequest, a network failure before any answer), it falls back to
 * supabase-js, which is what this replaced: the upload still happens, the
 * progress simply jumps to the end.
 */
import { createClient } from "@/lib/supabase/client"

export interface UploadOptions {
  /** Seconds, as supabase-js takes it. */
  cacheControl?: string
  upsert?: boolean
  contentType?: string
  /** 0 to 100, from the request's own upload events. */
  onProgress?: (percent: number) => void
  /** When aborted, the in-flight request is cancelled. */
  signal?: AbortSignal
}

class HttpError extends Error {}

function viaXhr(url: string, token: string, file: Blob, o: UploadOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (o.signal?.aborted) return reject(new Error("Upload stopped"))
    const xhr = new XMLHttpRequest()
    const onAbort = () => xhr.abort()
    o.signal?.addEventListener("abort", onAbort, { once: true })
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) o.onProgress?.(Math.round((event.loaded / event.total) * 100))
    })
    xhr.addEventListener("load", () => {
      o.signal?.removeEventListener("abort", onAbort)
      if (xhr.status >= 200 && xhr.status < 300) return resolve()
      let message = `Upload failed (${xhr.status})`
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = body.message || body.error || message
      } catch {
        /* Not JSON: the status says enough. */
      }
      reject(new HttpError(message))
    })
    xhr.addEventListener("error", () => {
      o.signal?.removeEventListener("abort", onAbort)
      reject(new Error("network"))
    })
    xhr.addEventListener("abort", () => {
      o.signal?.removeEventListener("abort", onAbort)
      reject(new Error(o.signal?.aborted ? "Upload stopped" : "network"))
    })
    xhr.open("POST", url)
    xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (anon) xhr.setRequestHeader("apikey", anon)
    xhr.setRequestHeader("x-upsert", o.upsert ? "true" : "false")
    xhr.setRequestHeader("cache-control", `max-age=${o.cacheControl ?? "3600"}`)
    xhr.setRequestHeader("content-type", o.contentType || file.type || "application/octet-stream")
    xhr.send(file)
  })
}

export async function uploadWithProgress(bucket: string, path: string, file: Blob, o: UploadOptions = {}): Promise<void> {
  if (o.signal?.aborted) throw new Error("Upload stopped")
  const supabase = createClient()
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error("Sign in again to upload.")
  if (base && token && typeof XMLHttpRequest !== "undefined") {
    try {
      const encoded = path.split("/").map(encodeURIComponent).join("/")
      await viaXhr(`${base.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encoded}`, token, file, o)
      o.onProgress?.(100)
      return
    } catch (err) {
      /* Storage answered and said no: that is the answer, not a reason to try again. */
      if (err instanceof HttpError || (err instanceof Error && err.message === "Upload stopped")) throw err
    }
  }
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: o.cacheControl,
    contentType: o.contentType || file.type,
    upsert: o.upsert,
  })
  if (error) throw error
  o.onProgress?.(100)
}
