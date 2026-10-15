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
 * download per recent picture.
 *
 * HOW FAR BACK A RUN LOOKS (sweepWindowMinutes). It looked back a fixed two
 * and a half hours every hour, so every new picture was downloaded about 2.5
 * times. Changed on purpose (the owner: lower Vercel costs): a run now looks
 * back to the start of the last run that read everything in its window
 * (public.cron_runs, part 68: ok, and its answer began {"complete":true}),
 * plus CURSOR_OVERLAP_MIN, never more than the old 150 minutes. Both times
 * are the database's own clock (cron_runs.started_at and objects.created_at
 * are now() on the same server), so the overlap only has to cover an upload
 * that was being written as the last run read. A run that failed, hit its
 * limit, ran out of time, or could not download a file does not move the
 * start, so the next one reads that stretch again; with no record at all
 * (before part 68, a database that cannot be read) it is the old 150.
 *
 * The same pass is the file check for those uploads, since it already holds
 * each picture's bytes: the central check (lib/security/uploads/inspect.ts)
 * runs on every one, and a file that is really a program, a script, a web
 * page or the EICAR test file behind a picture's name is deleted from
 * storage (its URL stops working) and logged. A file that is only not a
 * picture is left alone. When a malware engine is switched on
 * (SECURITY_MALWARE_PROVIDER) it reads each one too.
 *
 * ---------------------------------------------------------------------------
 *  AND EVERYTHING ELSE THAT LANDED IN THOSE BUCKETS
 * ---------------------------------------------------------------------------
 * A picture is not the only thing a browser writes there: a link page's lead
 * magnet, a profile video, a wallpaper clip and a product video all go the
 * same way, and none of them is read above (the pass takes JPEG, PNG and WebP
 * under 25 MB, because those are the ones that carry EXIF). Every one of
 * those is confirmed to the server the moment it finishes
 * (/api/storage/uploaded), and sweepDirectUploads() is what catches the ones
 * that were not: a page closed mid-upload, or somebody who never meant to
 * ask. It reads the FIRST AND LAST BYTES of each by Range, never the whole
 * file, so a two gigabyte video costs two small reads
 * (lib/security/uploads/direct.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js"

import { stripImageMetadata } from "@/lib/images/metadata"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { inspectHead } from "@/lib/security/uploads/inspect"
import { activeProviders } from "@/lib/security/uploads/providers"
import { checkDirectUpload, PUBLIC_DIRECT_UPLOADS } from "@/lib/security/uploads/direct"
import { isPublicImage } from "./file-signature"

/** The old fixed look-back, and still the most a run ever reads. */
export const MAX_WINDOW_MIN = 150
/** Read again before the last complete run's start, for an upload being written as it read. */
export const CURSOR_OVERLAP_MIN = 10
const JOB = "/api/cron/strip-image-metadata"

/** How many minutes back to look, given the last complete run's start (null: none known). Pure, for the tests. */
export function windowFromCursor(lastCompleteStart: number | null, now: number): number {
  if (lastCompleteStart === null || !Number.isFinite(lastCompleteStart) || lastCompleteStart > now) return MAX_WINDOW_MIN
  const minutes = Math.ceil((now - lastCompleteStart) / 60_000) + CURSOR_OVERLAP_MIN
  return Math.max(1, Math.min(MAX_WINDOW_MIN, minutes))
}

/** A recorded answer from a run that read everything it was asked to. */
export function answeredComplete(detail: string | null | undefined): boolean {
  return typeof detail === "string" && detail.startsWith('{"complete":true')
}

/**
 * The look-back for this run, from the job's own run records. Any failure to
 * read them is the old fixed window, so this only ever reads less than
 * before when it knows the earlier stretch was read in full.
 */
export async function sweepWindowMinutes(admin: SupabaseClient, now = Date.now()): Promise<number> {
  try {
    const { data, error } = await admin
      .from("cron_runs")
      .select("started_at, detail")
      .eq("job", JOB)
      .eq("ok", true)
      .order("started_at", { ascending: false })
      .limit(6)
    if (error || !data) return MAX_WINDOW_MIN
    const last = (data as { started_at: string; detail: string | null }[]).find((r) => answeredComplete(r.detail))
    return windowFromCursor(last ? Date.parse(last.started_at) : null, now)
  } catch {
    return MAX_WINDOW_MIN
  }
}

export interface SweepSummary {
  /** Every picture in the window was read: none left by the limit, none failed to download. */
  complete: boolean
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
  const summary: SweepSummary = { complete: false, checked: 0, stripped: 0, removed: 0, errors: [] }
  const providers = activeProviders()
  const limit = Math.max(1, Math.min(options.limit ?? 200, 1000))
  const { data, error } = await admin.rpc("storage_recent_public_images", {
    p_since_minutes: Math.max(1, Math.min(options.sinceMinutes ?? MAX_WINDOW_MIN, 60 * 24 * 30)),
    p_limit: limit,
  })
  if (error) {
    summary.errors.push(error.message)
    return summary
  }

  const rows = (data ?? []) as { bucket_id: string; name: string; mimetype: string }[]
  /* Fewer than the limit: nothing in the window was left for later. */
  let complete = rows.length < limit
  for (const o of rows) {
    try {
      const { data: blob, error: downloadError } = await admin.storage.from(o.bucket_id).download(o.name)
      if (downloadError || !blob) {
        complete = false
        continue
      }
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
      complete = false
      summary.errors.push(`${o.bucket_id}/${o.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  summary.complete = complete
  return summary
}

export interface DirectSweepSummary {
  /** Every file in the window was read: none left by the limit or the budget. */
  complete: boolean
  checked: number
  /** Files that did not belong in the bucket they were in, removed. */
  removed: number
  errors: string[]
}

/**
 * The files in the public buckets the picture pass above does not read: a
 * lead magnet, a video, anything that is not a small JPEG, PNG or WebP. Each
 * one gets the same central check, from a small read of its start and its
 * end, and one that is refused is deleted and logged.
 *
 * Costs two Range reads per file, never a download, and stops inside its own
 * budget. Before supabase/sql/run-now/70_public_upload_safety.sql has run the
 * list is not there, which is said once and then ignored.
 */
export async function sweepDirectUploads(
  admin: SupabaseClient,
  options: { sinceMinutes?: number; limit?: number; budgetMs?: number } = {},
): Promise<DirectSweepSummary> {
  const summary: DirectSweepSummary = { complete: false, checked: 0, removed: 0, errors: [] }
  const stopAt = Date.now() + (options.budgetMs ?? 120_000)
  const limit = Math.max(1, Math.min(options.limit ?? 200, 1000))
  const { data, error } = await admin.rpc("storage_recent_public_objects", {
    p_since_minutes: Math.max(1, Math.min(options.sinceMinutes ?? MAX_WINDOW_MIN, 60 * 24 * 30)),
    p_limit: limit,
  })
  if (error) {
    /* Part 68 has not run: nothing to read, and nothing to say twice. */
    if (!/storage_recent_public_objects/.test(error.message ?? "")) summary.errors.push(error.message)
    else summary.complete = true
    return summary
  }

  const rows = (data ?? []) as { bucket_id: string; name: string }[]
  let complete = rows.length < limit
  for (const o of rows) {
    if (Date.now() > stopAt) {
      complete = false
      break
    }
    if (!Object.hasOwn(PUBLIC_DIRECT_UPLOADS, o.bucket_id)) continue
    try {
      const result = await checkDirectUpload(admin, { bucket: o.bucket_id, path: o.name })
      summary.checked++
      if (!result.ok) summary.removed++
    } catch (e) {
      complete = false
      summary.errors.push(`${o.bucket_id}/${o.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  summary.complete = complete
  return summary
}
