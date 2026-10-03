"use client"

/**
 * ===========================================================================
 *  "UPLOAD IMAGE", FROM A QUESTION IN THE CHAT
 * ===========================================================================
 * The run asked for a picture ("Please upload or paste the portrait") and
 * the creator pressed Upload image. The file goes where a picture chosen in
 * the section's own image field goes: the store-builder-images bucket, under
 * their own folder, without its location and camera details, with the
 * upload confirmed to the server (components/website-builder/editor/
 * image-picker.tsx does the same for the field). The address that comes back
 * is put into the setting the question is about.
 *
 * Every refusal is a sentence the chat can show under the pills.
 */

import { createClient } from "@/lib/supabase/client"
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { withoutMetadata } from "@/lib/images/compress"

/** The bucket's own types: it refuses SVG (supabase/migrations/20260929_upload_safety.sql). */
export const ASK_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
}

/** The largest picture the image field takes. */
export const ASK_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export class AskUploadError extends Error {}

/** Why a file cannot be uploaded here, before anything is sent, or null. */
export function uploadProblem(file: { type?: string; size?: number }): string | null {
  if (!file.type || !ASK_IMAGE_TYPES[file.type]) return "Use a JPG, PNG, GIF, WebP or AVIF picture."
  if ((file.size ?? 0) > ASK_IMAGE_MAX_BYTES) return "That picture is over 5 MB. Choose a smaller one."
  return null
}

/** Uploads one picture to the media library and answers with its public address. */
export async function uploadAskImage(file: File): Promise<string> {
  const problem = uploadProblem(file)
  if (problem) throw new AskUploadError(problem)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new AskUploadError("Sign in again to upload pictures.")
  const body = await withoutMetadata(file)
  /* A name of our own: the file's name is never part of the address. */
  const path = `${user.id}/ai/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ASK_IMAGE_TYPES[file.type]}`
  const { error } = await supabase.storage.from("store-builder-images").upload(path, body, {
    cacheControl: "31536000",
    upsert: false,
    contentType: file.type,
  })
  if (error) throw new AskUploadError("The upload did not go through. Try again.")
  confirmUpload("store-builder-images", path)
  return supabase.storage.from("store-builder-images").getPublicUrl(path).data.publicUrl
}
