import "server-only"

/**
 * ===========================================================================
 *  WHAT HAPPENS TO A PRODUCT FILE, FROM UPLOAD TO DOWNLOAD
 * ===========================================================================
 * scan_status on digital_assets keeps the states a malware engine needs, but
 * with Storelib's built-in checks alone (production) a file is never left
 * waiting:
 *
 *   clean     the built-in checks passed (scan_result.engine "builtin"). Set
 *             the moment the upload completes; buyers can download it.
 *   blocked   the built-in checks, or an engine, refused it. Never served.
 *   infected, quarantined
 *             the same, as the ClamAV scanner wrote them before. Never served.
 *   pending_scan, scanning, null
 *             a file from before these checks (or written by an older path).
 *             SERVED: the download gate checks its first bytes once, as the
 *             old header check did, writes the answer and hands it out. A
 *             buyer is never told a file is "still being checked".
 *
 * After an upload has answered (next/server after(), so the creator never
 * waits for it):
 *
 *   1. the SHA-256 of the whole file, streamed from storage, into
 *      digital_assets.checksum and scan_result.sha256 (for dedupe and the
 *      admin page; never shown to anyone);
 *   2. any malware engine that is switched on (providers.ts). None is in
 *      production, so this step does nothing and calls nothing.
 *
 * The daily storage cron runs sweepAssets(): older files that never had these
 * checks (the backfill) and hashes that did not finish in time, a few at a
 * time inside a time budget.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { after } from "next/server"

import { logSecurityEvent, logUploadVerdict } from "./audit"
import type { UploadVerdict } from "./inspect"
import { activeProviders } from "./providers"
import { hashStoredObject, inspectStoredObject, storedReader } from "./stored"
import { inspectHead, HEAD_BYTES } from "./inspect"

export const BLOCKED_STATUSES: ReadonlySet<string> = new Set(["blocked", "infected", "quarantined"])
export const UNRESOLVED_STATUSES: ReadonlySet<string> = new Set(["", "null", "pending_scan", "scanning"])

export interface AssetRow {
  id: string
  file_path: string | null
  file_name: string | null
  mime_type?: string | null
  file_size?: number | null
  storage_bucket?: string | null
  scan_status?: string | null
  scan_result?: Record<string, unknown> | null
  uploaded_by?: string | null
}

const PRIVATE_BUCKET = "digital-products"

/**
 * Hashing reads the whole file back out of storage, which costs time and
 * transfer. Right after an upload, files up to 1 GB are hashed (well inside
 * the route's time); the daily sweep takes up to 2 GB, five a run. Larger
 * files are recorded as not hashed rather than read again every day.
 */
export const AFTER_UPLOAD_HASH_MAX_BYTES = 1024 * 1024 * 1024
export const SWEEP_HASH_MAX_BYTES = 2 * 1024 * 1024 * 1024

/**
 * Runs `task` after the response has been sent when there is a request to
 * attach it to (next/server after()), or straight away otherwise (a cron, a
 * test). Never throws into the caller.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  const safe = () => task().catch((e) => console.warn("[file-security] background step failed:", e instanceof Error ? e.message : e))
  try {
    after(safe)
  } catch {
    void safe()
  }
}

/** What scan_result says after the built-in checks. Never a file's contents. */
export function builtinResult(verdict: UploadVerdict, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    engine: "builtin",
    checkedAt: new Date().toISOString(),
    detectedType: verdict.detectedType,
    ...(verdict.ok ? {} : { code: verdict.code }),
    ...(verdict.notes.length ? { notes: verdict.notes.map((n) => n.code) } : {}),
    ...(verdict.archive ? { archive: verdict.archive } : {}),
    ...extra,
  }
}

/**
 * The background half of a completed product upload: the hash, then any
 * engine. `deadlineMs` is how long it may take in all; a hash that does not
 * finish is left for the daily sweep.
 */
export async function afterProductUpload(
  admin: SupabaseClient,
  asset: AssetRow,
  options: { deadlineMs?: number; userId?: string | null; knownSha256?: string | null } = {},
): Promise<void> {
  if (!asset.file_path) return
  const bucket = asset.storage_bucket || PRIVATE_BUCKET
  const deadline = Date.now() + (options.deadlineMs ?? 45_000)

  const size = Number(asset.file_size) || 0
  const hashed = options.knownSha256
    ? { sha256: options.knownSha256 }
    : size > 0 && size <= AFTER_UPLOAD_HASH_MAX_BYTES
      ? await hashStoredObject(admin, bucket, asset.file_path, deadline)
      : null
  if (hashed || size > SWEEP_HASH_MAX_BYTES) {
    const { data } = await admin.from("digital_assets").select("scan_result").eq("id", asset.id).maybeSingle()
    const before = (data?.scan_result ?? {}) as Record<string, unknown>
    await admin
      .from("digital_assets")
      .update(hashed ? { checksum: hashed.sha256, scan_result: { ...before, sha256: hashed.sha256 } } : { scan_result: { ...before, sha256Skipped: "too_large" } })
      .eq("id", asset.id)
  }

  for (const provider of activeProviders()) {
    const left = deadline - Date.now()
    if (left < 5_000) break
    const result = await provider.scan({
      fileName: asset.file_name || asset.file_path,
      context: "product_file",
      size: Number(asset.file_size) || null,
      stored: { admin, bucket, path: asset.file_path },
      ref: `asset:${asset.id}`,
      deadlineMs: left,
    })
    const infected = result.status === "infected"
    if (infected) await blockAsset(admin, asset, { code: "provider_infected", provider: provider.name, threat: result.threat, remove: true })
    else if (result.status === "clean") await noteProvider(admin, asset.id, provider.name, result)
    await logSecurityEvent(admin, {
      event: "provider_scan",
      outcome: infected ? "removed" : result.status === "clean" ? "info" : "noted",
      context: "product_file",
      code: infected ? "provider_infected" : result.status,
      provider: provider.name,
      assetId: asset.id,
      bucket,
      path: asset.file_path,
      userId: options.userId ?? asset.uploaded_by ?? null,
      bytes: Number(asset.file_size) || null,
      sha256: result.sha256 ?? hashed?.sha256 ?? null,
      detail: { status: result.status, threat: result.threat, reason: result.reason, durationMs: result.durationMs, engineVersion: result.engineVersion, signatures: result.signatures },
    })
  }
}

async function noteProvider(admin: SupabaseClient, assetId: string, provider: string, result: { durationMs: number; engineVersion?: string | null }) {
  const { data } = await admin.from("digital_assets").select("scan_result").eq("id", assetId).maybeSingle()
  const before = (data?.scan_result ?? {}) as Record<string, unknown>
  const providers = { ...((before.providers as Record<string, unknown>) ?? {}), [provider]: { status: "clean", at: new Date().toISOString(), engineVersion: result.engineVersion ?? null } }
  await admin.from("digital_assets").update({ scan_result: { ...before, providers } }).eq("id", assetId)
}

/**
 * Marks a file blocked so it is never served. `remove` also deletes the
 * object: done for a file an engine found infected, never for a file from
 * before these checks, which is kept for the admin to look at.
 */
export async function blockAsset(
  admin: SupabaseClient,
  asset: AssetRow,
  why: { code: string; provider?: string; threat?: string; remove?: boolean; result?: Record<string, unknown> },
): Promise<void> {
  const bucket = asset.storage_bucket || PRIVATE_BUCKET
  if (why.remove && asset.file_path) {
    await admin.storage.from(bucket).remove([asset.file_path]).then(
      () => undefined,
      () => undefined,
    )
  }
  const { data } = await admin.from("digital_assets").select("scan_result").eq("id", asset.id).maybeSingle()
  const before = (data?.scan_result ?? {}) as Record<string, unknown>
  await admin
    .from("digital_assets")
    .update({
      scan_status: "blocked",
      ...(why.remove ? { upload_status: "quarantined" } : {}),
      scan_result: { ...before, ...(why.result ?? {}), blocked: { code: why.code, provider: why.provider ?? "builtin", threat: why.threat ?? null, at: new Date().toISOString(), removed: Boolean(why.remove) } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", asset.id)
}

/**
 * The refusals the old header check made on any file, and so the only ones
 * that may take a file from before these checks off sale: a program, a
 * script or page behind a document's name, a program's extension, the EICAR
 * test file. Anything the newer checks find in an older file (a ZIP holding
 * a .exe, say) is written to the log for the admin, and the file keeps
 * selling, because buyers have bought it and the creator did nothing new.
 */
export const LEGACY_BLOCKING: ReadonlySet<string> = new Set([
  "blocked_extension",
  "dangerous_declared_type",
  "executable_signature",
  "script_in_document",
  "disguised_file",
  "malware_test_signature",
])

/**
 * A file with no verdict yet (from before these checks): checked, and the
 * answer written so it is only ever checked once. `archive` false reads only
 * the first bytes, for the download path, where a buyer is waiting.
 */
export async function resolveAsset(
  admin: SupabaseClient,
  asset: AssetRow,
  options: { archive?: boolean; budgetMs?: number; source?: "download" | "sweep" } = {},
): Promise<"clean" | "blocked" | "unread"> {
  if (!asset.file_path) return "unread"
  const bucket = asset.storage_bucket || PRIVATE_BUCKET
  const fileName = asset.file_name || asset.file_path
  const size = Number(asset.file_size) || 0
  let verdict: UploadVerdict
  if (options.archive === false || size <= 0) {
    const head = await storedReader(admin, bucket, asset.file_path).read(0, HEAD_BYTES - 1)
    if (!head) return "unread"
    verdict = inspectHead({ fileName, declaredMime: asset.mime_type, size: Math.max(size, head.length, 1), head, context: "product_file", maxBytes: Number.MAX_SAFE_INTEGER })
  } else {
    verdict = await inspectStoredObject(admin, { bucket, path: asset.file_path }, { fileName, declaredMime: asset.mime_type, size, context: "product_file", budgetMs: options.budgetMs })
  }
  if (verdict.notes.some((n) => n.code === "not_read")) return "unread"

  const blocks = !verdict.ok && LEGACY_BLOCKING.has(verdict.code)
  if (blocks) {
    await blockAsset(admin, asset, { code: verdict.code, result: builtinResult(verdict, { legacy: true }) })
  } else {
    const { data } = await admin.from("digital_assets").select("scan_result").eq("id", asset.id).maybeSingle()
    const before = (data?.scan_result ?? {}) as Record<string, unknown>
    await admin
      .from("digital_assets")
      .update({
        scan_status: "clean",
        scan_result: { ...before, ...builtinResult(verdict, { legacy: true, ...(verdict.ok ? {} : { finding: verdict.code }) }) },
      })
      .eq("id", asset.id)
      .or("scan_status.is.null,scan_status.in.(pending_scan,scanning,scan_error)")
  }
  if (blocks || !verdict.ok || verdict.notes.length) {
    await logUploadVerdict(admin, verdict, {
      context: "product_file",
      assetId: asset.id,
      bucket,
      path: asset.file_path,
      bytes: size || null,
      userId: asset.uploaded_by ?? null,
      event: "backfill",
      outcome: blocks ? "refused" : "noted",
    })
  }
  return blocks ? "blocked" : "clean"
}

export interface SweepSummary {
  resolved: number
  blocked: number
  hashed: number
  providerScans: number
  errors: string[]
}

/**
 * The daily pass (from /api/cron/storage-cleanup): files with no verdict,
 * oldest waiting first, then files with no server hash yet, newest first.
 * Stops inside `budgetMs`. Cheap: a verdict is two small reads; a hash is
 * one streamed read, skipped for a file that failed three times.
 */
export async function sweepAssets(admin: SupabaseClient, options: { budgetMs?: number; limit?: number } = {}): Promise<SweepSummary> {
  const summary: SweepSummary = { resolved: 0, blocked: 0, hashed: 0, providerScans: 0, errors: [] }
  const stopAt = Date.now() + (options.budgetMs ?? 120_000)
  const limit = Math.max(1, Math.min(options.limit ?? 50, 200))
  const columns = "id, file_path, file_name, file_size, mime_type, storage_bucket, scan_status, scan_result, uploaded_by"

  const { data: waiting, error } = await admin
    .from("digital_assets")
    .select(columns)
    .or("scan_status.is.null,scan_status.in.(pending_scan,scanning)")
    .or("upload_status.is.null,upload_status.eq.completed")
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) summary.errors.push(`waiting: ${error.message}`)
  for (const asset of (waiting ?? []) as AssetRow[]) {
    if (stopAt - Date.now() < 5_000) break
    try {
      const status = await resolveAsset(admin, asset, { source: "sweep" })
      if (status === "blocked") summary.blocked++
      else if (status === "clean") summary.resolved++
    } catch (e) {
      summary.errors.push(`${asset.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const { data: unhashed } = await admin
    .from("digital_assets")
    .select(columns)
    .is("scan_result->>sha256", null)
    .eq("scan_status", "clean")
    .or("upload_status.is.null,upload_status.eq.completed")
    .order("created_at", { ascending: false })
    .limit(25)
  let hashes = 0
  for (const asset of (unhashed ?? []) as AssetRow[]) {
    const left = stopAt - Date.now()
    if (left < 15_000 || hashes >= 5) break
    if (!asset.file_path) continue
    const result = (asset.scan_result ?? {}) as { hashAttempts?: unknown; sha256Skipped?: unknown }
    const tries = Number(result.hashAttempts) || 0
    if (tries >= 3 || result.sha256Skipped || (Number(asset.file_size) || 0) > SWEEP_HASH_MAX_BYTES) continue
    hashes++
    const hashed = await hashStoredObject(admin, asset.storage_bucket || PRIVATE_BUCKET, asset.file_path, Date.now() + Math.min(left - 5_000, 120_000))
    const before = (asset.scan_result ?? {}) as Record<string, unknown>
    await admin
      .from("digital_assets")
      .update(hashed ? { checksum: hashed.sha256, scan_result: { ...before, sha256: hashed.sha256 } } : { scan_result: { ...before, hashAttempts: tries + 1 } })
      .eq("id", asset.id)
    if (hashed) summary.hashed++
  }
  return summary
}
