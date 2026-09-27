import "server-only"

/**
 * ===========================================================================
 *  THE SECURITY LOG FOR FILES
 * ===========================================================================
 * public.file_security_events (supabase/sql/run-now/59_file_security_events.sql):
 * one row for each thing an admin may want to look back at, and nothing for
 * the ordinary case:
 *
 *   upload         refused (with the check and what it found), or accepted
 *                  with notes (an encrypted ZIP, a ZIP too large to list in
 *                  time, a name that did not match its bytes). A plain
 *                  accepted upload writes no row: digital_assets has it.
 *   provider_scan  a malware engine's verdict, when one is switched on.
 *   download       a download refused (no access, a blocked file).
 *   rate_limit     an upload or download refused for coming too often.
 *   backfill       an older file checked for the first time, and what that found.
 *   admin_test     the test tool on /admin/security.
 *
 * Never a file's contents, never a secret, never a whole IP address (a short
 * one way hash, enough to see that refusals came from one place). Server
 * only: row level security is on and no policy lets a browser read or write.
 * Writing a row never fails an upload or a download: before part 59 has run
 * the table is missing, which is said once in the server log and then ignored.
 */
import { createHash } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { UploadVerdict } from "./inspect"
import type { UploadContext } from "./policy"

export type SecurityEvent = "upload" | "provider_scan" | "download" | "rate_limit" | "backfill" | "admin_test"
export type SecurityOutcome = "accepted" | "noted" | "refused" | "removed" | "denied" | "limited" | "info"

export interface SecurityEventInput {
  event: SecurityEvent
  outcome: SecurityOutcome
  context?: UploadContext | string | null
  code?: string | null
  userId?: string | null
  creatorId?: string | null
  assetId?: string | null
  bucket?: string | null
  path?: string | null
  fileName?: string | null
  bytes?: number | null
  detectedType?: string | null
  sha256?: string | null
  provider?: string | null
  detail?: Record<string, unknown> | null
  ip?: string | null
}

export const SECURITY_LOG_TABLE = "file_security_events"

let saidMissing = false
function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || new RegExp(SECURITY_LOG_TABLE).test(error.message ?? "")
}

/** A short one way hash of an address: the same address reads the same, and cannot be read back. */
export function hashAddress(ip: string | null | undefined): string | null {
  if (!ip) return null
  return createHash("sha256").update(`storelib-file-security:${ip}`).digest("hex").slice(0, 16)
}

function clip(value: string | null | undefined, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null
}

export async function logSecurityEvent(admin: SupabaseClient, e: SecurityEventInput): Promise<void> {
  try {
    const { error } = await admin.from(SECURITY_LOG_TABLE).insert({
      event: e.event,
      outcome: e.outcome,
      context: clip(e.context ?? null, 40),
      code: clip(e.code ?? null, 60),
      user_id: e.userId ?? null,
      creator_id: e.creatorId ?? null,
      asset_id: e.assetId ?? null,
      bucket: clip(e.bucket ?? null, 80),
      path: clip(e.path ?? null, 512),
      file_name: clip(e.fileName ?? null, 200),
      bytes: typeof e.bytes === "number" && Number.isFinite(e.bytes) ? Math.round(e.bytes) : null,
      detected_type: clip(e.detectedType ?? null, 100),
      sha256: e.sha256 && /^[a-f0-9]{64}$/.test(e.sha256) ? e.sha256 : null,
      provider: clip(e.provider ?? null, 40),
      detail: e.detail ?? null,
      ip_hash: hashAddress(e.ip),
    })
    if (error && missingTable(error) && !saidMissing) {
      saidMissing = true
      console.info(`[file-security] ${SECURITY_LOG_TABLE} is not there yet (supabase/sql/run-now/59_file_security_events.sql); events are not logged`)
    }
  } catch {
    /* A log row is never worth failing an upload or a download for. */
  }
}

/**
 * The row for an upload's verdict, or none: a plain accepted upload is not
 * logged. Refused uploads always are, with what the check found.
 */
export async function logUploadVerdict(
  admin: SupabaseClient,
  verdict: UploadVerdict,
  where: {
    context: UploadContext
    userId?: string | null
    creatorId?: string | null
    assetId?: string | null
    bucket?: string | null
    path?: string | null
    bytes?: number | null
    sha256?: string | null
    event?: SecurityEvent
    outcome?: SecurityOutcome
  },
): Promise<void> {
  if (verdict.ok && verdict.notes.length === 0 && !where.outcome) return
  await logSecurityEvent(admin, {
    event: where.event ?? "upload",
    outcome: where.outcome ?? (verdict.ok ? "noted" : "refused"),
    context: where.context,
    code: verdict.ok ? verdict.notes[0]?.code ?? "accepted" : verdict.code,
    userId: where.userId,
    creatorId: where.creatorId,
    assetId: where.assetId,
    bucket: where.bucket,
    path: where.path,
    fileName: verdict.safeName,
    bytes: where.bytes,
    detectedType: verdict.detectedType,
    sha256: where.sha256,
    detail: {
      ...(verdict.detail ? { found: verdict.detail } : {}),
      ...(verdict.notes.length ? { notes: verdict.notes } : {}),
      ...(verdict.archive ? { archive: verdict.archive } : {}),
    },
  })
}

export interface SecurityLogRow {
  id: string
  created_at: string
  event: string
  outcome: string
  context: string | null
  code: string | null
  user_id: string | null
  creator_id: string | null
  asset_id: string | null
  bucket: string | null
  path: string | null
  file_name: string | null
  bytes: number | null
  detected_type: string | null
  sha256: string | null
  provider: string | null
  detail: Record<string, unknown> | null
  ip_hash: string | null
}

export interface SecurityLogFilter {
  event?: string | null
  outcome?: string | null
  code?: string | null
  limit?: number
  before?: string | null
}

const COLUMNS = "id, created_at, event, outcome, context, code, user_id, creator_id, asset_id, bucket, path, file_name, bytes, detected_type, sha256, provider, detail, ip_hash"

export async function recentSecurityEvents(
  admin: SupabaseClient,
  filter: SecurityLogFilter = {},
): Promise<{ rows: SecurityLogRow[]; unavailable?: string }> {
  let q = admin.from(SECURITY_LOG_TABLE).select(COLUMNS).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(filter.limit ?? 50, 200)))
  if (filter.event) q = q.eq("event", filter.event)
  if (filter.outcome) q = q.eq("outcome", filter.outcome)
  if (filter.code) q = q.eq("code", filter.code)
  if (filter.before) q = q.lt("created_at", filter.before)
  const { data, error } = await q
  if (error) {
    return {
      rows: [],
      unavailable: missingTable(error)
        ? "The security log starts after supabase/sql/run-now/59_file_security_events.sql has run."
        : "The security log could not be read.",
    }
  }
  return { rows: (data ?? []) as SecurityLogRow[] }
}

export interface SecurityCounts {
  day: { refused: number; noted: number; denied: number; limited: number; removed: number }
  week: { refused: number; noted: number; denied: number; limited: number; removed: number }
  /** Refusals in the last seven days, by the check that refused, most first. */
  byCode: { code: string; day: number; week: number }[]
  unavailable?: string
}

/** Counts for the last day and week, from at most the latest 5000 rows of the week. */
export async function securityCounts(admin: SupabaseClient, now = Date.now()): Promise<SecurityCounts> {
  const empty = () => ({ refused: 0, noted: 0, denied: 0, limited: 0, removed: 0 })
  const out: SecurityCounts = { day: empty(), week: empty(), byCode: [] }
  const weekAgo = new Date(now - 7 * 86_400_000).toISOString()
  const dayAgo = now - 86_400_000
  const { data, error } = await admin
    .from(SECURITY_LOG_TABLE)
    .select("created_at, outcome, code")
    .gte("created_at", weekAgo)
    .neq("outcome", "info")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) {
    out.unavailable = missingTable(error) ? "The security log starts after supabase/sql/run-now/59_file_security_events.sql has run." : "The security log could not be read."
    return out
  }
  const codes = new Map<string, { day: number; week: number }>()
  for (const row of (data ?? []) as { created_at: string; outcome: string; code: string | null }[]) {
    const key = row.outcome as keyof SecurityCounts["day"]
    if (!(key in out.week)) continue
    const inDay = new Date(row.created_at).getTime() >= dayAgo
    out.week[key]++
    if (inDay) out.day[key]++
    if (key === "refused" || key === "removed") {
      const c = codes.get(row.code ?? "unknown") ?? { day: 0, week: 0 }
      c.week++
      if (inDay) c.day++
      codes.set(row.code ?? "unknown", c)
    }
  }
  out.byCode = [...codes.entries()].map(([code, n]) => ({ code, ...n })).sort((a, b) => b.week - a.week)
  return out
}

/**
 * Accepted and noted rows go after ninety days, refusals and everything else
 * after a year: the log answers "what happened lately", and a refusal is the
 * part worth keeping longer.
 */
export async function pruneSecurityLog(admin: SupabaseClient, now = Date.now()): Promise<void> {
  try {
    await admin.from(SECURITY_LOG_TABLE).delete().in("outcome", ["accepted", "noted", "info"]).lt("created_at", new Date(now - 90 * 86_400_000).toISOString())
    await admin.from(SECURITY_LOG_TABLE).delete().lt("created_at", new Date(now - 365 * 86_400_000).toISOString())
  } catch {
    /* Before part 59 there is nothing to prune. */
  }
}
