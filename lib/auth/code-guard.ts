/**
 * ===========================================================================
 *  A SIX DIGIT CODE GETS FIVE GUESSES
 * ===========================================================================
 * The sign up code (/api/auth/confirm-email) and the device code
 * (/api/security/confirm-device) live in verification_codes, which has no
 * attempts column, and neither route counted a wrong one. A script could walk
 * the million codes.
 *
 * Wrong tries are counted in rate_limit_hits (the table lib/api/rate-limit.ts
 * already keeps), one row per wrong code, against the account or the order
 * the guess was aimed at. They count from the newest code sent, so a fresh
 * code starts with fresh tries, and after MAX_CODE_ATTEMPTS every live code
 * for that account or order is burned: marked used, so even the right one is
 * refused until a new code is sent. Sending is rate limited on its own.
 *
 * Like the rest of the limiter it fails open: when the table cannot be read
 * the guess is still checked against the code, it just is not counted. The
 * code itself stays the gate.
 */
import { MAX_CODE_ATTEMPTS, codeMatches } from "@/lib/account/codes"

export type GuardDb = { from: (table: string) => any }

export const WRONG_CODE_LIMIT = MAX_CODE_ATTEMPTS

export interface CodeRow {
  id: string
  code: string | null
  email?: string | null
  expires_at: string | null
  used_at: string | null
  created_at?: string | null
}

/** The codes for one account or order, newest first, at most `limit`. Sorted here, so it does not lean on the query's order. */
export async function recentCodes(db: GuardDb, column: "user_id" | "order_id", value: string, limit = 20): Promise<CodeRow[]> {
  const { data, error } = await db
    .from("verification_codes")
    .select("id, code, email, expires_at, used_at, created_at")
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error || !Array.isArray(data)) return []
  return [...(data as CodeRow[])].sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
}

/** Wrong guesses since `sinceIso` against this subject. 0 when the count cannot be read (fails open, logged). */
export async function wrongCodeCount(db: GuardDb, bucket: string, subject: string, sinceIso: string): Promise<number> {
  try {
    const { count, error } = await db
      .from("rate_limit_hits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("subject", subject)
      .gte("created_at", sinceIso)
    if (error) {
      console.error(`[code-guard] ${bucket}: counting failed (${error.message ?? "unknown"})`)
      return 0
    }
    return count ?? 0
  } catch {
    return 0
  }
}

export async function recordWrongCode(db: GuardDb, bucket: string, subject: string): Promise<void> {
  try {
    await db.from("rate_limit_hits").insert({ bucket, subject })
  } catch {
    /* Not counted this time; the code is still checked. */
  }
}

/** Every unused code for this account or order, marked used. */
export async function burnCodes(db: GuardDb, column: "user_id" | "order_id", value: string, nowIso = new Date().toISOString()): Promise<void> {
  try {
    await db.from("verification_codes").update({ used_at: nowIso }).eq(column, value).is("used_at", null)
  } catch {
    /* Best effort: the wrong-try count still refuses. */
  }
}

/** Where the count of wrong tries starts: the newest code's creation, and never more than `windowMinutes` back. */
export function countFrom(codes: CodeRow[], windowMinutes: number, now = Date.now()): string {
  const floor = now - windowMinutes * 60_000
  const newest = codes[0]?.created_at ? Date.parse(String(codes[0].created_at)) : NaN
  return new Date(Number.isFinite(newest) ? Math.max(newest, floor) : floor).toISOString()
}

/**
 * Claim one code: marked used only if it still was not, so two requests with
 * the same code cannot both succeed. True when this call claimed it.
 */
export async function claimCode(db: GuardDb, id: string, nowIso = new Date().toISOString()): Promise<boolean> {
  const { data, error } = await db.from("verification_codes").update({ used_at: nowIso }).eq("id", id).is("used_at", null).select("id")
  if (error) return false
  return Array.isArray(data) ? data.length > 0 : !!data
}

export const DEVICE_WRONG_BUCKET = "confirm-device-wrong"
/** How far back a device code's wrong tries are counted when its newest code is older (the codes live 15 minutes). */
const DEVICE_CODE_MINUTES = 15

export type DeviceVerdict = { ok: true; id: string } | { ok: false; status: 400 | 429; error: string; locked: boolean }

/**
 * A device code for one order (/api/security/confirm-device): live, matching,
 * claimed once, five wrong tries and every live code is burned.
 */
export async function checkDeviceCode(db: GuardDb, orderId: string, code: string, now = Date.now()): Promise<DeviceVerdict> {
  const nowIso = new Date(now).toISOString()
  const subject = `order:${orderId}`
  const codes = await recentCodes(db, "order_id", orderId)
  const wrong = await wrongCodeCount(db, DEVICE_WRONG_BUCKET, subject, countFrom(codes, DEVICE_CODE_MINUTES, now))
  if (wrong >= WRONG_CODE_LIMIT) {
    await burnCodes(db, "order_id", orderId, nowIso)
    return { ok: false, status: 429, error: "Too many wrong codes. Ask for a new one.", locked: true }
  }
  const live = codes.filter((row) => !row.used_at && !!row.expires_at && Date.parse(String(row.expires_at)) > now)
  const match = live.find((row) => codeMatches(row.code, code))
  if (!match) {
    /* A used or expired code typed again is not a guess at a new one; anything else is. */
    if (!codes.some((row) => codeMatches(row.code, code))) {
      await recordWrongCode(db, DEVICE_WRONG_BUCKET, subject)
      if (wrong + 1 >= WRONG_CODE_LIMIT) {
        await burnCodes(db, "order_id", orderId, nowIso)
        return { ok: false, status: 400, error: "Too many wrong codes. Ask for a new one.", locked: true }
      }
    }
    return { ok: false, status: 400, error: "Invalid or expired verification code", locked: false }
  }
  if (!(await claimCode(db, match.id, nowIso))) return { ok: false, status: 400, error: "Invalid or expired verification code", locked: false }
  return { ok: true, id: match.id }
}
