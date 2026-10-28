"use client"

/**
 * ===========================================================================
 *  WHEN STORAGE REFUSES A TEAM MEMBER'S WRITE (round 41)
 * ===========================================================================
 * An editor writes a picture straight into a public bucket under the store's
 * folder. For the owner that is their own folder and storage takes it, as
 * before; for a team member storage refuses it (its policies answer only for
 * the account's own folder). Then, and only then, the browser asks the
 * server for a signed address for that one path (app/api/team/upload-url,
 * lib/team/uploads), which checks the member's permissions on the server,
 * and puts the file there.
 *
 * Resolves true when the file went up this way, false when the server said
 * no (the caller then shows its own failure, as before).
 */
export async function teamSignedUpload(bucket: string, path: string, body: Blob, type: string, onProgress: (p: number) => void = () => {}): Promise<boolean> {
  let signedUrl: string | null = null
  try {
    const r = await fetch("/api/team/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ bucket, path }) })
    if (!r.ok) return false
    signedUrl = ((await r.json()) as { signedUrl?: string }).signedUrl ?? null
  } catch {
    return false
  }
  if (!signedUrl) return false
  return new Promise<boolean>((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total)
    })
    xhr.addEventListener("load", () => resolve(xhr.status >= 200 && xhr.status < 300))
    xhr.addEventListener("error", () => resolve(false))
    xhr.open("PUT", signedUrl!)
    xhr.setRequestHeader("Content-Type", type || "application/octet-stream")
    xhr.setRequestHeader("Cache-Control", "max-age=31536000")
    xhr.send(body)
  })
}
