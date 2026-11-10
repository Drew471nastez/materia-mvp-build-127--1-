import "server-only"

/**
 * ===========================================================================
 *  THE NEWEST REVIEW PHOTOGRAPH, KEPT PRIVATELY AND BRIEFLY
 * ===========================================================================
 * The editor's progress panel shows the first screen the design review last
 * looked at, so the creator sees what the agent saw. One JPEG per job at
 * `ai-review/<installId>/<jobId>.jpg` in the PRIVATE bucket the editor's
 * chat pictures already live in (theme-chat-attachments, run-now part 33:
 * no storage policy at all, service role only; nothing reaches it from a
 * browser except through a signed URL a route hands out after proving the
 * job is the caller's).
 *
 * SHORT RETENTION by construction: each new photograph of an install
 * replaces the install's older ones (every other job's file under the
 * install is removed), so at most one exists per website, and it is the
 * draft's latest first screen, never a published page.
 *
 * Never throws: a picture that could not be kept changes nothing about the
 * review.
 */

type Storage = { storage: { from: (bucket: string) => any } } // eslint-disable-line @typescript-eslint/no-explicit-any

export const REVIEW_SHOT_BUCKET = "theme-chat-attachments"
const SIGNED_SECONDS = 10 * 60

const uuidish = (s: string) => /^[0-9a-f-]{8,64}$/i.test(s)

export function reviewShotPath(installId: string, jobId: string): string | null {
  if (!uuidish(installId) || !uuidish(jobId)) return null
  return `ai-review/${installId}/${jobId}.jpg`
}

export async function keepReviewShot(db: Storage, ids: { installId: string; jobId: string }, jpegBase64: string): Promise<boolean> {
  const path = reviewShotPath(ids.installId, ids.jobId)
  if (!path) return false
  try {
    const bucket = db.storage.from(REVIEW_SHOT_BUCKET)
    const { error } = await bucket.upload(path, Buffer.from(jpegBase64, "base64"), { contentType: "image/jpeg", upsert: true, cacheControl: "60" })
    if (error) return false
    /* One per website: the older jobs' photographs go. */
    const { data: listed } = await bucket.list(`ai-review/${ids.installId}`, { limit: 50 })
    const old = ((listed ?? []) as { name: string }[]).map((f) => `ai-review/${ids.installId}/${f.name}`).filter((p) => p !== path)
    if (old.length) await bucket.remove(old)
    return true
  } catch {
    return false
  }
}

/** A short-lived address for the job's photograph. The caller has proved the job is theirs. */
export async function signReviewShot(db: Storage, ids: { installId: string; jobId: string }): Promise<string | null> {
  const path = reviewShotPath(ids.installId, ids.jobId)
  if (!path) return null
  try {
    const { data, error } = await db.storage.from(REVIEW_SHOT_BUCKET).createSignedUrl(path, SIGNED_SECONDS)
    return error ? null : ((data?.signedUrl as string | undefined) ?? null)
  } catch {
    return null
  }
}
