import "server-only"

/**
 * ===========================================================================
 *  A FILE ALREADY IN STORAGE, CHECKED WITHOUT DOWNLOADING IT
 * ===========================================================================
 * Product files go from the browser straight to storage, so the server never
 * holds them. This reads only what the checks need, each part a Range
 * request through one short signed URL:
 *
 *   the first 8 KB        always (the file's signature)
 *   the last ~64 KB       only for a ZIP (its table of contents), read at the
 *                         same time as the first bytes when the name already
 *                         says ZIP, so a 10 GB archive costs two small reads
 *   the directory         only when a ZIP's directory is longer than that
 *
 * and, in the background after an upload, the SHA-256 of the whole file,
 * streamed through a hash a chunk at a time and never held in memory.
 */
import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { extensionOf } from "./filename"
import { HEAD_BYTES, inspectUpload, type UploadVerdict } from "./inspect"
import type { UploadContext } from "./policy"
import { ZIP_TAIL_BYTES } from "./zip"

/** Extensions that are ZIPs inside: read the end with the start. */
const ZIP_LIKE = new Set(["zip", "docx", "xlsx", "pptx", "epub", "sketch", "procreate", "afpackage", "apk", "aab", "ipa", "jar", "odt", "ods", "odp", "xd", "fig", "brushset", "swatches", "cbz", "unitypackage", "storelibtheme"])

export interface StoredReader {
  read(start: number, endInclusive: number): Promise<Uint8Array | null>
}

/** One signed URL for all the reads of one check. */
export function storedReader(admin: SupabaseClient, bucket: string, path: string): StoredReader {
  let signed: Promise<string | null> | null = null
  const url = () => {
    signed ??= Promise.resolve(admin.storage.from(bucket).createSignedUrl(path, 60)).then(
      ({ data, error }) => (error || !data?.signedUrl ? null : data.signedUrl),
      () => null,
    )
    return signed
  }
  return {
    async read(start, endInclusive) {
      const href = await url()
      if (!href || endInclusive < start) return null
      const want = endInclusive - start + 1
      try {
        const res = await fetch(href, { headers: { Range: `bytes=${start}-${endInclusive}` }, cache: "no-store" })
        /* A server that ignored the range would send the whole file: only acceptable from the start. */
        if (!res.body || (res.status !== 206 && !(res.status === 200 && start === 0))) {
          res.body?.cancel().catch(() => {})
          return null
        }
        const reader = res.body.getReader()
        const out = new Uint8Array(want)
        let o = 0
        while (o < want) {
          const { done, value } = await reader.read()
          if (done || !value) break
          const take = Math.min(value.length, want - o)
          out.set(value.subarray(0, take), o)
          o += take
        }
        reader.cancel().catch(() => {})
        return o === want ? out : out.subarray(0, o)
      } catch {
        return null
      }
    },
  }
}

/**
 * inspectUpload() for a file in storage: the first bytes, and a ZIP's end.
 * `size` is storage's own record of the file (upload-guard storedObjectSize).
 */
export async function inspectStoredObject(
  admin: SupabaseClient,
  where: { bucket: string; path: string },
  file: { fileName: string; declaredMime?: string | null; size: number; context: UploadContext; budgetMs?: number },
): Promise<UploadVerdict> {
  const reader = storedReader(admin, where.bucket, where.path)
  const size = file.size
  const tailStart = Math.max(0, size - ZIP_TAIL_BYTES)
  const wantsTail = size > HEAD_BYTES && (ZIP_LIKE.has(extensionOf(file.fileName)) || /zip/i.test(file.declaredMime ?? ""))
  const [head, early] = await Promise.all([
    size > 0 ? reader.read(0, Math.min(size, HEAD_BYTES) - 1) : Promise.resolve(new Uint8Array(0)),
    wantsTail ? reader.read(tailStart, size - 1) : Promise.resolve(null),
  ])
  return inspectUpload({
    fileName: file.fileName,
    declaredMime: file.declaredMime,
    size,
    head,
    tail: early ? { bytes: early, start: tailStart } : size <= HEAD_BYTES && head ? { bytes: head, start: 0 } : null,
    readRange: (a, b) => reader.read(a, b),
    context: file.context,
    budgetMs: file.budgetMs,
  })
}

/** The SHA-256 of bytes in memory. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/**
 * The SHA-256 of a stored file, streamed. Null when it could not be read or
 * did not finish by `deadline` (a Date.now() value): the next pass tries again.
 */
export async function hashStoredObject(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  deadline: number,
): Promise<{ sha256: string; bytes: number } | null> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1000, deadline - Date.now()))
  try {
    const res = await fetch(data.signedUrl, { signal: controller.signal, cache: "no-store" })
    if (!res.ok || !res.body) {
      res.body?.cancel().catch(() => {})
      return null
    }
    const hash = createHash("sha256")
    let bytes = 0
    const reader = res.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        hash.update(value)
        bytes += value.length
      }
    }
    return { sha256: hash.digest("hex"), bytes }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
