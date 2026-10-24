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
 *   the last ~64 KB       always, at the same time as the first bytes. A ZIP
 *                         is whatever has an end of central directory record
 *                         there, whatever it is called, so a 10 GB archive
 *                         costs two small reads and nothing skips the check
 *                         by being named .pdf
 *   the directory         only when a ZIP's directory is longer than that
 *   a few entries' starts only when it is a ZIP, 128 KB of packed data from
 *                         at most four of them, unpacked under a hard ceiling
 *                         so its declared sizes are tested, not believed
 *
 * and, in the background after an upload, the SHA-256 of the whole file,
 * streamed through a hash a chunk at a time and never held in memory.
 */
import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { HEAD_BYTES, inspectUpload, type UploadVerdict } from "./inspect"
import type { UploadContext } from "./policy"
import { nodeInflateRaw } from "./zip-inflate"
import { ZIP_TAIL_BYTES } from "./zip"

/** The longest one Range read may take before it is given up on. */
export const READ_TIMEOUT_MS = 25_000

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
      /* A read that never answers must not hold a route open: the largest of
         these (an archive's list) is tens of megabytes, which is seconds. */
      const stop = AbortSignal.timeout(READ_TIMEOUT_MS)
      try {
        const res = await fetch(href, { headers: { Range: `bytes=${start}-${endInclusive}` }, cache: "no-store", signal: stop })
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
  file: { fileName: string; declaredMime?: string | null; size: number; context: UploadContext; budgetMs?: number; maxBytes?: number },
): Promise<UploadVerdict> {
  const reader = storedReader(admin, where.bucket, where.path)
  const size = file.size
  const tailStart = Math.max(0, size - ZIP_TAIL_BYTES)
  /*
    THE END IS READ FOR EVERY FILE, NOT ONLY ONE NAMED LIKE AN ARCHIVE. A ZIP
    is whatever has an end of central directory record at its end, whatever
    its name and whatever its first bytes say, so deciding from the name was
    how an archive dressed as a PDF skipped every ZIP check. It costs one more
    small Range read, made at the same time as the first bytes, so nothing
    waits any longer than before.
  */
  const wantsTail = size > HEAD_BYTES
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
    /* So an archive's declared sizes are tested, not believed (zip.ts). */
    inflate: nodeInflateRaw,
    context: file.context,
    budgetMs: file.budgetMs,
    /* A bucket with its own ceiling (onepage-assets: videos up to 2 GB) is held to that, not to its context's. */
    maxBytes: file.maxBytes,
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
