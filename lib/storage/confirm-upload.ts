/**
 * ===========================================================================
 *  "THAT UPLOAD FINISHED"
 * ===========================================================================
 * One line at the end of every place in Storelib that writes straight from
 * the browser into a public bucket. It tells the server where the file landed
 * so the server can read its first and last bytes and check it
 * (/api/storage/uploaded, lib/security/uploads/direct.ts).
 *
 * NOTHING WAITS FOR IT AND NOTHING SHOWS IT. It is not awaited, it never
 * throws, it changes nothing on the page, and a failure is not worth a word:
 * the hourly pass catches whatever never got through. Write it as
 *
 *     confirmUpload(bucket, filePath)
 *
 * on the line after the upload succeeded, before or after the URL is handed
 * on; the order does not matter because the answer is ignored either way.
 */

/** Sends the note. Returns at once; the caller never waits and never reads it. */
export function confirmUpload(bucket: string, path: string): void {
  if (typeof fetch !== "function" || !bucket || !path) return
  try {
    void fetch("/api/storage/uploaded", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket, path }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* A note the server did not get is caught by the hourly pass instead. */
  }
}
