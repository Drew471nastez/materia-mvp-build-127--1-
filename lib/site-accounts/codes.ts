import "server-only"

import { randomUUID } from "node:crypto"
import { isMissingTable, UUID, type Db } from "./db"
import { cleanCode, CODE_TRIES, CODE_TTL_MS, codeHash, newCode, sameHash } from "./token"

/**
 * ===========================================================================
 *  THE SIX DIGIT CODE A WEBSITE EMAILS TO SIGN SOMEBODY IN
 * ===========================================================================
 * One row in `site_customer_codes` per code sent (supabase/sql/run-now/33).
 * The rules, each one held by Postgres rather than by memory, because
 * serverless functions share none:
 *
 *   ONE LIVE CODE PER ADDRESS    asking again ends the last one, so there is
 *                                never more than one code to guess.
 *   TEN MINUTES                  expires_at, compared in the UPDATE itself.
 *   FIVE TRIES                   every try is counted by a conditional
 *                                UPDATE that only lands while the count is
 *                                the one that was read; two tries at once
 *                                cannot both be counted as the fourth, and
 *                                the table's own check refuses a sixth.
 *   USED ONCE                    the right code sets used_at in the same
 *                                UPDATE, which only lands while used_at is
 *                                empty. Two tabs, a double click: one wins.
 *   NEVER STORED                 the row keeps an HMAC under its own id.
 *
 * CLOSED WHEN IT CANNOT CHECK. Before part 33 has run there is no table,
 * and no code is sent or accepted; the sign in page says signing in is not
 * available yet.
 */

const CODES = "site_customer_codes"

export type IssueResult =
  | { ok: true; codeId: string; code: string }
  | { ok: false; why: "unavailable" | "failed" }

export type CheckRefusal = "code" | "expired" | "tries" | "unavailable" | "failed"
export type CheckResult = { ok: true; email: string } | { ok: false; why: CheckRefusal }

/** A new code for this address on this website, ending any live one before it. */
export async function issueCode(
  db: Db,
  input: { creatorId: string; email: string; host: string },
  now = Date.now(),
): Promise<IssueResult> {
  if (!UUID.test(input.creatorId)) return { ok: false, why: "failed" }
  const id = randomUUID()
  const code = newCode()
  const hash = codeHash(id, code)
  if (!hash) return { ok: false, why: "unavailable" }
  const at = new Date(now).toISOString()
  try {
    const ended = await db
      .from(CODES)
      .update({ expires_at: at })
      .eq("creator_id", input.creatorId)
      .eq("email", input.email)
      .is("used_at", null)
      .gt("expires_at", at)
    if (ended.error) return { ok: false, why: isMissingTable(ended.error) ? "unavailable" : "failed" }
    const made = await db.from(CODES).insert({
      id,
      creator_id: input.creatorId,
      email: input.email,
      host: input.host,
      code_hash: hash,
      attempts: 0,
      expires_at: new Date(now + CODE_TTL_MS).toISOString(),
      created_at: at,
    })
    if (made.error) return { ok: false, why: isMissingTable(made.error) ? "unavailable" : "failed" }
    return { ok: true, codeId: id, code }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/**
 * The code a visitor typed, against the row their browser is waiting on.
 * `email` on success is the row's, which is the address the code went to.
 */
export async function checkCode(
  db: Db,
  input: { codeId: string; creatorId: string; host: string; code: unknown },
  now = Date.now(),
): Promise<CheckResult> {
  if (!UUID.test(input.codeId)) return { ok: false, why: "expired" }
  /* Not six digits is a typing slip, and costs no try. */
  const typed = cleanCode(input.code)
  if (!typed) return { ok: false, why: "code" }
  const at = new Date(now).toISOString()
  try {
    const { data: row, error } = await db
      .from(CODES)
      .select("id, creator_id, email, host, code_hash, attempts, expires_at, used_at")
      .eq("id", input.codeId)
      .maybeSingle()
    if (error) return { ok: false, why: isMissingTable(error) ? "unavailable" : "failed" }
    const r = row as { id: string; creator_id: string; email: string; host: string; code_hash: string; attempts: number; expires_at: string; used_at: string | null } | null
    /* Another website's code, or one made on another host, is no code here. */
    if (!r || r.creator_id !== input.creatorId || r.host !== input.host) return { ok: false, why: "expired" }
    if (r.used_at || !(Date.parse(r.expires_at) > now)) return { ok: false, why: "expired" }
    const tries = Number(r.attempts) || 0
    if (tries >= CODE_TRIES) return { ok: false, why: "tries" }

    const right = sameHash(codeHash(r.id, typed), r.code_hash)
    const { data: counted, error: countError } = await db
      .from(CODES)
      .update(right ? { attempts: tries + 1, used_at: at } : { attempts: tries + 1 })
      .eq("id", r.id)
      .eq("attempts", tries)
      .is("used_at", null)
      .gt("expires_at", at)
      .select("id")
    if (countError) return { ok: false, why: "failed" }
    /* Another try landed first. Nothing was granted to this one, right or not. */
    if (!Array.isArray(counted) || counted.length !== 1) return { ok: false, why: "code" }
    if (!right) return { ok: false, why: tries + 1 >= CODE_TRIES ? "tries" : "code" }
    return { ok: true, email: r.email }
  } catch {
    return { ok: false, why: "failed" }
  }
}

/** Codes live ten minutes; their rows are kept a day, then swept now and then. */
export async function sweepCodes(db: Db, now = Date.now()): Promise<void> {
  try {
    await db.from(CODES).delete().lt("created_at", new Date(now - 24 * 60 * 60_000).toISOString())
  } catch {
    /* Tidying only. */
  }
}
