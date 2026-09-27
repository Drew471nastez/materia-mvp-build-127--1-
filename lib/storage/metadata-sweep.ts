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
 *
 * The same pass is the file check for those uploads, since it already holds
 * each picture's bytes: the central check (lib/security/uploads/inspect.ts)
 * runs on every one, and a file that is really a program, a script, a web
 * page or the EICAR test file behind a picture's name is deleted from
 * storage (its URL stops working) and logged. A file that is only not a
 * picture is left alone. When a malware engine is switched on
 * (SECURITY_MALWARE_PROVIDER) it reads each one too.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { stripImageMetadata } from "@/lib/images/metadata"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { activeProviders } from "@/lib/security/uploads/providers"
import { isPublicImage } from "./file-signature"

export interface SweepSummary {
  checked: number
  stripped: number
  /** Files that were not pictures but programs, scripts or pages, removed. */
  removed: number
  errors: string[]
}

export async function sweepImageMetadata(
  admin: SupabaseClient,
  options: { sinceMinutes?: number; limit?: number } = {},
): Promise<SweepSummary> {
  const summary: SweepSummary = { checked: 0, stripped: 0, removed: 0, errors: [] }
  const providers = activeProviders()
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
      /* Dangerous, not merely unusual: a program, a script or page, the EICAR file. */
      const verdict = inspectHead({ fileName: o.name, declaredMime: o.mimetype, size: bytes.length, head: bytes.subarray(0, 8192), context: "product_file", maxBytes: Number.MAX_SAFE_INTEGER })
      const dangerous = !verdict.ok && ["executable_signature", "malware_test_signature", "script_in_document", "disguised_file"].includes(verdict.code)
      let flagged: { code: string; provider: string } | null = dangerous ? { code: verdict.code, provider: "builtin" } : null
      for (const provider of flagged ? [] : providers) {
        const result = await provider.scan({ fileName: o.name, context: "public_image", size: bytes.length, bytes, ref: `${o.bucket_id}/${o.name}`, deadlineMs: 12_000 })
        if (result.status === "infected") flagged = { code: "provider_infected", provider: provider.name }
      }
      if (flagged) {
        const { error: removeError } = await admin.storage.from(o.bucket_id).remove([o.name])
        if (removeError) summary.errors.push(`${o.bucket_id}/${o.name}: flagged but not removed: ${removeError.message}`)
        else summary.removed++
        await logSecurityEvent(admin, { event: "upload", outcome: removeError ? "refused" : "removed", context: "public_image", code: flagged.code, provider: flagged.provider, bucket: o.bucket_id, path: o.name, bytes: bytes.length, detectedType: verdict.detectedType, detail: { found: verdict.detail, via: "image_sweep" } })
        continue
      }
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
