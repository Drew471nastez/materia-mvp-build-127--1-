/**
 * A picture for a post (its body, a gallery, the featured image), uploaded
 * the way the builder's own image field uploads one
 * (components/website-builder/editor/image-picker.tsx): checked for type and
 * size, without its location and camera details (withoutMetadata), into the
 * store-builder-images bucket at <owner>/blog/<time>.<ext>, the store owner's
 * folder for a team member (websiteUploadOwner) with the server signing it
 * when storage refuses (teamSignedUpload), and recorded (confirmUpload).
 *
 * Answers the picture's public address, or throws with a sentence the
 * editor shows.
 */
import { confirmUpload } from "@/lib/storage/confirm-upload"
import { teamSignedUpload } from "@/lib/team/upload-fallback"
import { websiteUploadOwner } from "@/lib/website-builder/team-upload-owner"
import { createClient } from "@/lib/supabase/client"
import { withoutMetadata } from "@/lib/images/compress"
import { tt } from "@/lib/i18n/text"

export const BLOG_BUCKET = "store-builder-images"
export const BLOG_FOLDER = "blog"
/* The bucket's own list (supabase/migrations/20260929_upload_safety.sql), the same as the builder's image field. */
const TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"])
const EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "avif"])
export const BLOG_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Why a file cannot be a post's picture, or null when it can. */
export function blogImageProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  if (!TYPES.has(file.type) || !EXTENSIONS.has(ext)) return tt("Use JPG, PNG, GIF, WebP or AVIF")
  if (file.size > BLOG_IMAGE_MAX_BYTES) return tt("Image must be under 5 MB")
  return null
}

/** Where a picture goes: the store owner's folder (a team member's too), then blog/, by time. */
export function blogImagePath(owner: string, file: Pick<File, "name">, now: number = Date.now()): string {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase()
  return `${owner}/${BLOG_FOLDER}/${now}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

export async function uploadBlogImage(file: File): Promise<string> {
  const problem = blogImageProblem(file)
  if (problem) throw new Error(problem)
  const body = await withoutMetadata(file)
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error(tt("You were signed out. Sign in again in another tab, then try again."))
  const owner = websiteUploadOwner()
  const filePath = blogImagePath(owner ?? user.id, file)
  const { error } = await supabase.storage.from(BLOG_BUCKET).upload(filePath, body, { cacheControl: "31536000", upsert: true, contentType: file.type })
  if (error && !(owner && owner !== user.id && (await teamSignedUpload(BLOG_BUCKET, filePath, body, file.type)))) throw new Error(tt("Upload failed. Try again."))
  confirmUpload(BLOG_BUCKET, filePath)
  return supabase.storage.from(BLOG_BUCKET).getPublicUrl(filePath).data.publicUrl
}
