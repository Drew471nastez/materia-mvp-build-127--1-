import "server-only"

/**
 * ===========================================================================
 *  THE CHECKS EVERY UPLOAD ROUTE MAKES
 * ===========================================================================
 * One place for what used to be written differently, or not at all, in each
 * route:
 *
 *   uploadRateLimit        how often one person may start an upload. Counted
 *                          in Postgres (lib/api/rate-limit.ts), per user, with
 *                          a per minute window against scripts and the plan's
 *                          hourly one against slow floods. It used to count
 *                          digital_assets rows by `uploaded_by = creator id`,
 *                          a column that holds the USER id, so it counted zero
 *                          and never refused anything.
 *   tooManyPendingUploads  how many uploads one person may have open at once.
 *   productFileLimit       how many files one product may hold.
 *   storedObjectSize       the size storage recorded, not the size declared.
 *   readStoredHead         the first bytes of a stored object, by Range, so a
 *                          file that went straight to storage is still checked
 *                          by its magic bytes before anything is marked done.
 *   cleanStoredPublicImage the same picture rules as a server upload
 *                          (lib/storage/public-image.ts), applied to one that
 *                          went up by signed URL, and the malware scan when it
 *                          is on (screenPublicBytes).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextResponse } from "next/server"

import { rateLimit, type RateWindow } from "@/lib/api/rate-limit"
import { scanBytes } from "@/lib/security/file-scanner"
import { recordScan, type ScanSource } from "@/lib/security/scan-log"
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

/** Null when this person may start another upload, or the 429 to send. */
export function uploadRateLimit(userId: string, planId?: string | null): Promise<NextResponse | null> {
  return rateLimit({
    bucket: "upload",
    subjects: [`user:${userId}`],
    windows: uploadWindows(planId),
    message: "That is a lot of uploads in a short time. Wait a minute and try again.",
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
 * the owner, nothing climbs out, nothing is absolute.
 */
export function ownsStoragePath(path: unknown, ownerIds: (string | null | undefined)[]): path is string {
  if (typeof path !== "string" || path.length === 0 || path.length > 512) return false
  if (path.startsWith("/") || path.includes("\\") || path.split("/").some((p) => p === ".." || p === "." || p === "")) return false
  const first = path.split("/")[0]
  return ownerIds.some((id) => typeof id === "string" && id.length > 0 && id === first)
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

/**
 * The first `bytes` of a stored object. A Range request through a signed URL
 * that lives one minute; if storage answers with the whole object anyway, the
 * stream is cancelled after the first chunk that covers the range.
 */
export async function readStoredHead(
  admin: SupabaseClient,
  bucket: string,
  path: string,
  bytes = 8192,
): Promise<Uint8Array | null> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return null
  try {
    const res = await fetch(data.signedUrl, { headers: { Range: `bytes=0-${bytes - 1}` } })
    if (!res.ok || !res.body) return null
    const reader = res.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    while (total < bytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
    reader.cancel().catch(() => {})
    const out = new Uint8Array(Math.min(total, bytes))
    let o = 0
    for (const c of chunks) {
      const take = Math.min(c.length, out.length - o)
      out.set(c.subarray(0, take), o)
      o += take
      if (o >= out.length) break
    }
    return out
  } catch {
    return null
  }
}

/**
 * ===========================================================================
 *  THE MALWARE SCAN FOR A PUBLIC FILE THAT PASSES THROUGH A ROUTE
 * ===========================================================================
 * Pictures and small files that a route holds in memory anyway: scanned
 * before they are stored (or, for one already stored, before the route says
 * it is done). Infected is refused. No verdict (scanner off, down or slow)
 * lets the file through: it has already passed the picture checks or the
 * header check, it is public the moment it is stored so there is no pending
 * state to hold it in, and a profile photo that cannot be saved because a
 * scanner is restarting is a broken app, not a safer one. Every outcome is
 * in the scan log.
 *
 * Twelve seconds at most: a picture is scanned in well under one.
 */
export async function screenPublicBytes(
  admin: SupabaseClient,
  bytes: Uint8Array,
  where: { source: ScanSource; bucket: string; path: string; logClean?: boolean },
): Promise<{ blocked: boolean; threat?: string }> {
  const result = await scanBytes(bytes, { ref: `${where.bucket}/${where.path}`, deadlineMs: 12_000, retries: 1 })
  const blocked = result.status === "infected"
  if (result.status !== "clean" || where.logClean !== false) {
    await recordScan(admin, { source: where.source, bucket: where.bucket, path: where.path, result, action: blocked ? "refused" : "kept" })
  }
  return blocked ? { blocked, threat: result.threat } : { blocked }
}

/** What a creator is told when a file they uploaded was flagged. */
export const FLAGGED_UPLOAD = "That file was flagged by the virus scan and was not saved."

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
    return { ok: false, error: "That picture is over 25 MB. Choose a smaller one.", status: 413 }
  }
  const { data: blob, error } = await admin.storage.from(bucket).download(path)
  if (error || !blob) return { ok: false, error: "The upload could not be checked. Try again.", status: 500 }
  const checked = preparePublicImage(new Uint8Array(await blob.arrayBuffer()))
  if (!checked.ok) {
    await admin.storage.from(bucket).remove([path]).catch(() => undefined)
    return checked
  }
  /* The bytes that will be served, stripped or not. */
  const screened = await screenPublicBytes(admin, checked.bytes, { source: "public_image", bucket, path })
  if (screened.blocked) {
    await admin.storage.from(bucket).remove([path]).catch(() => undefined)
    return { ok: false, error: FLAGGED_UPLOAD, status: 400 }
  }
  if (checked.stripped) {
    const { error: upErr } = await admin.storage.from(bucket).upload(path, checked.bytes, {
      contentType: checked.mime,
      cacheControl: "31536000",
      upsert: true,
    })
    if (upErr) return { ok: false, error: "The upload could not be checked. Try again.", status: 500 }
  }
  return { ok: true, stripped: checked.stripped }
}
