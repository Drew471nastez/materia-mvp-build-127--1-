/**
 * ===========================================================================
 *  THE PROFILE PHOTO, SAVED FROM THE ONEPAGE EDITOR, AND WHAT WENT WRONG
 * ===========================================================================
 * The crop sheet uploads the framed photo into the account's own folder of
 * the avatars bucket, and then saves its address through the same route
 * Settings uses (app/api/account/avatar). When that second step failed, the
 * sheet said only "The file went up, but it did not save. Try again.": the
 * route's own answer ("Your session ended", "That photo is not in your
 * folder", "The photo did not save. Reload the page") was thrown away, and
 * so was the difference between no answer at all and a refusal. Now the
 * reason is carried to the sheet as a SaveError, whose words it shows
 * (components/onepage/crop-upload).
 */
import { announceAvatar } from "@/lib/account/avatar-store"
import { tt } from "@/lib/i18n/text"

/** A failure after the upload, with words for the person. The crop sheet shows them as they are. */
export class SaveError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = "SaveError"
    this.status = status
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

/** What the route's refusal means, in words: its own when it gave some, else one for its status. */
export function photoSaveMessage(status: number, body: unknown): string {
  const said = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? ((body as { error: string }).error).trim() : ""
  if (said) return tt("The photo went up, but your profile did not take it: {reason}", { reason: said })
  if (status === 401) return tt("The photo went up, but your session ended. Sign in again and try again.")
  if (status === 413) return tt("The photo went up, but it was too large to save. Try a smaller one.")
  if (status === 429) return tt("The photo went up, but too many changes were made at once. Wait a moment and try again.")
  if (status >= 500) return tt("The photo went up, but Storelib could not save it to your profile ({status}). Try again in a moment.", { status: String(status) })
  return tt("The photo went up, but your profile did not take it ({status}). Try again.", { status: String(status) })
}

/** Saves an uploaded photo as the account's profile photo. Throws a SaveError that says why when it does not. */
async function persistAccountPhoto(url: string | null, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<void> {
  let res: Awaited<ReturnType<FetchLike>>
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    res = await Promise.race([fetchImpl("/api/account/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({ url }),
    }), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error("Photo save timed out")) }, 20_000)
    })])
  } catch {
    throw new SaveError(url === null ? tt("Could not reach Storelib. Check your connection and try again.") : tt("The photo went up, but saving it did not reach Storelib. Check your connection and try again."))
  }
  finally { if (timer) clearTimeout(timer) }
  if (res.ok) {
    announceAvatar(url)
    return
  }
  const body = await res.json().catch(() => null)
  const removal = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : tt("The photo was not removed. Try again in a moment.")
  throw new SaveError(url === null ? removal : photoSaveMessage(res.status, body), res.status)
}

// Upload/replace/remove requests from this tab commit and announce in order.
let pendingPhoto: Promise<void> = Promise.resolve()
export function saveAccountPhoto(url: string | null, fetchImpl: FetchLike = fetch as unknown as FetchLike): Promise<void> {
  const next = pendingPhoto.catch(() => undefined).then(() => persistAccountPhoto(url, fetchImpl))
  pendingPhoto = next
  return next
}
