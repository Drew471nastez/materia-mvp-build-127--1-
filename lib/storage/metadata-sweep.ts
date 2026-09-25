import "server-only"

/**
 * ===========================================================================
 *  EVERY PUBLIC PHOTO LOSES ITS GPS, HOWEVER IT WAS UPLOADED
 * ===========================================================================
 * Pictures reach the public buckets three ways: through a server route (which
 * strips their metadata on the way, lib/storage/public-image.ts), by signed
 * URL (stripped when /api/v2/upload/complete checks them), and straight from
 * the browser with the person's own session, where no server ever sees them.
 * Most of the app uses the third way: avatars, covers, galleries, link page
 * images, camera photos on the phone. Some of those paths re-encode through a
 * canvas, which drops the metadata; the rest upload the original, GPS and all.
 *
 * This is the net under all of them. Every hour it reads the pictures created
 * in the last two and a half hours (supabase function
 * storage_recent_public_images), downloads each JPEG, PNG and WebP, and when
 * one still carries EXIF, XMP or text metadata, writes the same bytes back
 * without it, at the same path and URL. The pixels are untouched (lossless,
 * lib/images/metadata.ts) and the orientation is kept.
 *
 * An image already clean is downloaded and left alone, so a run costs one
 * download per recent picture; the windows overlap so a missed hour is
 * caught by the next.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { stripImageMetadata } from "@/lib/images/metadata"
import { isPublicImage } from "./file-signature"

export interface SweepSummary {
  checked: number
  stripped: number
  errors: string[]
}

export async function sweepImageMetadata(
  admin: SupabaseClient,
  options: { sinceMinutes?: number; limit?: number } = {},
): Promise<SweepSummary> {
  const summary: SweepSummary = { checked: 0, stripped: 0, errors: [] }
  const { data, error } = await admin.rpc("storage_recent_public_images", {
    p_since_minutes: Math.max(1, Math.min(options.sinceMinutes ?? 150, 60 * 24 * 30)),
    p_limit: Math.max(1, Math.min(options.limit ?? 200, 1000)),
  })
  if (error) {
    summary.errors.push(error.message)
    return summary
  }

  for (const o of (data ?? []) as { bucket_id: string; name: string; mimetype: string }[]) {
    try {
      const { data: blob, error: downloadError } = await admin.storage.from(o.bucket_id).download(o.name)
      if (downloadError || !blob) continue
      summary.checked++
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const kind = isPublicImage(bytes)
      if (!kind?.mime) continue
      const clean = stripImageMetadata(bytes)
      if (clean === bytes) continue
      const { error: uploadError } = await admin.storage.from(o.bucket_id).upload(o.name, clean, {
        contentType: kind.mime,
        cacheControl: "31536000",
        upsert: true,
      })
      if (uploadError) summary.errors.push(`${o.bucket_id}/${o.name}: ${uploadError.message}`)
      else summary.stripped++
    } catch (e) {
      summary.errors.push(`${o.bucket_id}/${o.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return summary
}
