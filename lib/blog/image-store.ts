import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { mediaUrl } from "@/lib/storage/media-url"

/** The bucket and folder every blog picture is stored in: the editor's uploads and Copy to Storelib alike. */
export const BLOG_IMAGE_BUCKET = "lead-form-files-v2"

/**
 * Store a picture that has already passed lib/storage/public-image
 * preparePublicImage, under a new random name, and answer its public
 * address. `media` answers Storelib's own form of it
 * (storelib.com/media/..., lib/storage/media-url) instead of the storage
 * host's.
 */
export async function storeBlogPicture(picture: { bytes: Uint8Array; mime: string; ext: string }, opts: { media?: boolean } = {}): Promise<{ ok: true; url: string } | { ok: false; error: { message?: string } }> {
  const fileName = `blog/${Date.now()}_${crypto.randomUUID().replace(/-/g, "")}.${picture.ext}`
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(BLOG_IMAGE_BUCKET).upload(fileName, picture.bytes, { contentType: picture.mime, cacheControl: "31536000", upsert: false })
  if (error) return { ok: false, error }
  const {
    data: { publicUrl },
  } = supabase.storage.from(BLOG_IMAGE_BUCKET).getPublicUrl(fileName)
  return { ok: true, url: opts.media ? mediaUrl(publicUrl) : publicUrl }
}
