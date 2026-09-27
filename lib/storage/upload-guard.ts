import "server-only"

/**
 * ===========================================================================
 *  THE CHECKS EVERY UPLOAD ROUTE MAKES
 * ===========================================================================
 * One place for what used to be written differently, or not at all, in each
 * route. What a file may BE is decided by lib/security/uploads (inspect.ts);
 * this is the rest:
 *
 *   uploadRateLimit        how often one person may start an upload. Counted
 *                          in Postgres (lib/api/rate-limit.ts), per user, with
 *                          a per minute window against scripts and the plan's
 *                          hourly one against slow floods. A refusal is
 *                          written to the security log.
 *   tooManyPendingUploads  how many uploads one person may have open at once.
 *   productFileLimit       how many files one product may hold.
 *   storedObjectSize       the size storage recorded, not the size declared.
 *   readStoredHead         the first bytes of a stored object, by Range.
 *   cleanStoredPublicImage the same picture rules as a server upload
 *                          (lib/storage/public-image.ts), applied to one that
 *                          went up by signed URL.
 *   screenInBackground     a malware engine's look at a public file, after
 *                          the answer has gone back. Does nothing, and calls
 *                          nothing, unless SECURITY_MALWARE_PROVIDER names one.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextResponse } from "next/server"

import { rateLimit, type RateWindow } from "@/lib/api/rate-limit"
import { logSecurityEvent } from "@/lib/security/uploads/audit"
import { isSafeStoragePath } from "@/lib/security/uploads/filename"
import { userMessage, type UploadContext } from "@/lib/security/uploads/policy"
import { runAfterResponse } from "@/lib/security/uploads/pipeline"
import { activeProviders } from "@/lib/security/uploads/providers"
import { storedReader } from "@/lib/security/uploads/stored"
import { createAdminClient } from "@/lib/supabase/admin"
import { getPlanLimits } from "./plans"
import { preparePublicImage, PUBLIC_IMAGE_MAX_BYTES } from "./public-image"

/** Headers for every upload and download answer: never cached, never sniffed. */
export const UPLOAD_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } as const

/** The rate windows for one person's uploads on a plan. */
export function uploadWindows(planId: string | null | undefined): RateWindow[] {
  return [
    { limit: 30, seconds: 60 },
    { limit: getPlanLimits(planId).rateLimit.uploadsPerHour, seconds: 3600 },
  ]
}

/** Null when this person may start another upload, or the 429 to send. A refusal is logged. */
export async function uploadRateLimit(userId: string, planId?: string | null): Promise<NextResponse | null> {
  const limited = await rateLimit({
    bucket: "upload",
    subjects: [`user:${userId}`],
    windows: uploadWindows(planId),
    message: "That is a lot of uploads in a short time. Wait a minute and try again.",
  })
  if (limited) logRateLimit({ bucket: "upload", userId })
  return limited
}

/** A rate limit refusal in the security log, without holding up the 429. */
export function logRateLimit(where: { bucket: string; userId?: string | null; ip?: string | null }): void {
  runAfterResponse(async () => {
    await logSecurityEvent(createAdminClient(), { event: "rate_limit", outcome: "limited", code: where.bucket, userId: where.userId ?? null, ip: where.ip ?? null })
  })
}

/** Uploads one person may have started and not finished, at the same time. */
export const MAX_PENDING_UPLOADS = 8

export async function tooManyPendingUploads(admin: SupabaseClient, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error } = await admin
    .from("digital_assets")
    .select("id", { count: "exact", head: true })
    .eq("uploaded_by", userId)
    .eq("upload_status", "pending")
    .gte("created_at", since)
  if (error) return false
  return (count ?? 0) >= MAX_PENDING_UPLOADS
}

/** Why this product cannot take another file on this plan, or null. */
export async function productFileLimit(
  admin: SupabaseClient,
  productId: string,
  planId: string | null | undefined,
): Promise<string | null> {
  const max = getPlanLimits(planId).maxFilesPerProduct
  const { count, error } = await admin
    .from("digital_assets")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .in("upload_status", ["pending", "completed"])
  if (error) return null
  return (count ?? 0) >= max ? `A product can hold ${max} files on your plan. Remove one to add another.` : null
}

/**
 * Whether a storage path sits under one of these ids: the first segment is
 * the owner, nothing climbs out, nothing is absolute
 * (lib/security/uploads/filename.ts isSafeStoragePath).
 */
export function ownsStoragePath(path: unknown, ownerIds: (string | null | undefined)[]): path is string {
  return isSafeStoragePath(path, ownerIds)
}

function split(path: string): { folder: string; name: string } {
  const slash = path.lastIndexOf("/")
  return { folder: slash === -1 ? "" : path.slice(0, slash), name: path.slice(slash + 1) }
}

/** The size storage recorded for an object, or null when it is not there. */
export async function storedObjectSize(admin: SupabaseClient, bucket: string, path: string): Promise<number | null> {
  const { folder, name } = split(path)
  const { data, error } = await admin.storage.from(bucket).list(folder, { search: name, limit: 100 })
  if (error || !data) return null
  const entry = data.find((f) => f.name === name)
  if (!entry) return null
  const size = Number((entry.metadata as { size?: unknown } | null)?.size)
  return Number.isFinite(size) ? size : 0
}

/** The first `bytes` of a stored object, by one Range request through a one minute signed URL. */
export async function readStoredHead(admin: SupabaseClient, bucket: string, path: string, bytes = 8192): Promise<Uint8Array | null> {
  return storedReader(admin, bucket, path).read(0, bytes - 1)
}

/**
 * ===========================================================================
 *  A MALWARE ENGINE'S LOOK AT A PUBLIC FILE, AFTER THE ANSWER
 * ===========================================================================
 * Pictures and small files a route holds in memory, or a file just stored.
 * The built-in checks have already decided the upload. When an engine is
 * switched on (SECURITY_MALWARE_PROVIDER), it reads the file once the
 * response has gone, and a file it finds infected is removed (its URL stops
 * working) and logged. With none switched on (production) this returns at
 * once and does nothing.
 */
export function screenInBackground(
  admin: SupabaseClient,
  where: { bytes?: Uint8Array; bucket: string; path: string; context: UploadContext; userId?: string | null; fileName?: string },
): void {
  const providers = activeProviders()
  if (providers.length === 0) return
  runAfterResponse(async () => {
    for (const provider of providers) {
      const result = await provider.scan({
        fileName: where.fileName ?? where.path,
        context: where.context,
        size: where.bytes?.byteLength ?? null,
        ...(where.bytes ? { bytes: where.bytes } : { stored: { admin, bucket: where.bucket, path: where.path } }),
        ref: `${where.bucket}/${where.path}`,
        deadlineMs: 45_000,
      })
      const infected = result.status === "infected"
      if (infected) await admin.storage.from(where.bucket).remove([where.path]).catch(() => undefined)
      if (infected || result.status === "no_verdict") {
        await logSecurityEvent(admin, {
          event: "provider_scan",
          outcome: infected ? "removed" : "noted",
          context: where.context,
          code: infected ? "provider_infected" : "no_verdict",
          provider: provider.name,
          bucket: where.bucket,
          path: where.path,
          userId: where.userId ?? null,
          sha256: result.sha256 ?? null,
          detail: { threat: result.threat, reason: result.reason, durationMs: result.durationMs },
        })
      }
      if (infected) return
    }
  })
}

/**
 * A picture that went to a public bucket by signed URL, made to follow the
 * same rules as one sent through the server: refused and removed if it is not
 * a picture or is too large, and rewritten without its metadata when it had
 * any. The URL does not change.
 */
export async function cleanStoredPublicImage(
  admin: SupabaseClient,
  bucket: string,
  path: string,
): Promise<{ ok: true; stripped: boolean } | { ok: false; error: string; status: number }> {
  const size = await storedObjectSize(admin, bucket, path)
  if (size === null) return { ok: false, error: "The upload did not arrive. Try again.", status: 400 }
  if (size > PUBLIC_IMAGE_MAX_BYTES) {
    await admin.storage.from(bucket).remove([path]).catch(() => undefined)
    return { ok: false, error: userMessage("too_large", "public_image"), status: 413 }
  }
  const { data: blob, error } = await admin.storage.from(bucket).download(path)
  if (error || !blob) return { ok: false, error: "The upload didn't finish. Try again.", status: 500 }
  const checked = preparePublicImage(new Uint8Array(await blob.arrayBuffer()))
  if (!checked.ok) {
    await admin.storage.from(bucket).remove([path]).catch(() => undefined)
    return checked
  }
  /* The bytes that will be served, stripped or not, when an engine is on. */
  screenInBackground(admin, { bytes: checked.bytes, bucket, path, context: "public_image" })
  if (checked.stripped) {
    const { error: upErr } = await admin.storage.from(bucket).upload(path, checked.bytes, {
      contentType: checked.mime,
      cacheControl: "31536000",
      upsert: true,
    })
    if (upErr) return { ok: false, error: "The upload didn't finish. Try again.", status: 500 }
  }
  return { ok: true, stripped: checked.stripped }
}
