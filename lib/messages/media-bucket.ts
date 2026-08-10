import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  THE ONE BUCKET BOTH KINDS OF ATTACHMENT LIVE IN
 * ===========================================================================
 *
 * THE BUG THIS EXISTS TO CLOSE: sending a voice note failed with
 *
 *     Încărcarea a eșuat: mime type audio/webm is not supported
 *
 * The `messages` bucket is created on first use by whichever route gets there
 * first, and that was the PHOTO route — which declared
 * `allowedMimeTypes: [...ALLOWED]`, a list of image types. Storage enforces
 * that list, so every audio upload into a bucket that already existed was
 * refused by the bucket itself, before anything this app wrote ever ran.
 *
 * Nothing was wrong with the voice route. Its own `createBucket` fallback fires
 * only on "bucket not found", and the bucket was found — correctly configured,
 * for the wrong half of what it now holds.
 *
 * ---------------------------------------------------------------------------
 * WHY A SHARED MODULE RATHER THAN A LONGER LIST IN TWO PLACES
 * ---------------------------------------------------------------------------
 * Adding audio types to the photo route's array would have fixed today and
 * guaranteed tomorrow: two routes, each declaring what the shared bucket
 * accepts, is a definition that only agrees with itself by luck — and the way it
 * disagrees is silent until somebody sends the kind of file the other one
 * forgot. This is one list, imported by both, and a third attachment type is one
 * line here rather than a bug report.
 *
 * ---------------------------------------------------------------------------
 * AND IT REPAIRS A BUCKET THAT IS ALREADY WRONG
 * ---------------------------------------------------------------------------
 * Every deployment that has ever sent a photograph already has the narrow
 * bucket, and no code change alone fixes those: the configuration lives in
 * storage, not in this repository. So a refusal that names a MIME type is
 * treated as exactly what it is — a bucket that needs widening — and the upload
 * is retried once against the corrected bucket rather than handed back to
 * somebody who cannot act on it.
 */

/** The bucket both photographs and voice notes are written to. Private. */
export const MESSAGES_BUCKET = "messages"

/** 10MB covers a phone photograph; the voice route caps itself lower. */
export const MESSAGES_BUCKET_LIMIT = 10 * 1024 * 1024

export const MESSAGE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "image/avif",
]

export const MESSAGE_AUDIO_TYPES = [
  // What Chrome and Firefox record into, with and without the codec parameter —
  // storage matches these literally, and MediaRecorder labels its blobs with the
  // full string.
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/ogg;codecs=opus",
  // What Safari records into.
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]

export const MESSAGE_MEDIA_TYPES = [...MESSAGE_IMAGE_TYPES, ...MESSAGE_AUDIO_TYPES]

/** Storage says this when the bucket's own allowlist is what refused the file. */
export function isMimeRefusal(message: string | null | undefined): boolean {
  return /mime type .* is not supported/i.test(message ?? "")
}

export function isMissingBucket(message: string | null | undefined): boolean {
  return /bucket.*not.*found/i.test(message ?? "")
}

type Admin = ReturnType<typeof createAdminClient>

/**
 * Upload, and fix the bucket if the bucket is what refused it.
 *
 * Two recoveries, each tried once:
 *
 *   no bucket      create it, with the full list. A bucket is not schema —
 *                  there is no data in it to migrate and nothing to get wrong —
 *                  so a missing one is a dead end rather than a decision.
 *
 *   wrong MIME     widen the existing one and retry. This is the case that
 *                  cannot be fixed by deploying code, because the narrow list is
 *                  already sitting in storage on every deployment that has sent
 *                  a photograph.
 *
 * Returns the storage error if it still fails, so the caller can say what
 * actually went wrong rather than shrugging.
 */
export async function uploadMessageMedia(
  admin: Admin,
  path: string,
  file: File | Blob,
  contentType: string,
): Promise<{ error: { message: string } | null }> {
  const put = () =>
    admin.storage
      .from(MESSAGES_BUCKET)
      .upload(path, file as File, { contentType, cacheControl: "31536000", upsert: false })

  let { error } = await put()
  if (!error) return { error: null }

  if (isMissingBucket(error.message)) {
    await admin.storage.createBucket(MESSAGES_BUCKET, {
      public: false,
      fileSizeLimit: MESSAGES_BUCKET_LIMIT,
      allowedMimeTypes: MESSAGE_MEDIA_TYPES,
    })
    ;({ error } = await put())
    return { error: error ?? null }
  }

  if (isMimeRefusal(error.message)) {
    // The bucket exists and is narrower than what this app now sends. Widening
    // is additive — nothing that was accepted before stops being accepted.
    await admin.storage.updateBucket(MESSAGES_BUCKET, {
      public: false,
      fileSizeLimit: MESSAGES_BUCKET_LIMIT,
      allowedMimeTypes: MESSAGE_MEDIA_TYPES,
    })
    ;({ error } = await put())
    return { error: error ?? null }
  }

  return { error }
}
