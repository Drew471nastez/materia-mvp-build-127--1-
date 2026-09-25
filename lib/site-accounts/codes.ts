/**
 * ===========================================================================
 *  A SIGN-IN CODE IS EXCHANGED ONCE
 * ===========================================================================
 * The code rides in a redirect, so it can be seen in a browser's history for
 * the two minutes it is good for. Once is the rule that makes that harmless:
 * the exchange writes the code's id into site_account_codes, whose primary
 * key refuses a second row, and only the request whose insert landed gets a
 * session. Two tabs, a double click, a replayed URL: one wins, the rest are
 * told the link was used.
 *
 * POSTGRES, NOT MEMORY. Serverless functions share nothing, so "have I seen
 * this id" held in a variable is a question every instance answers "no" to.
 *
 * CLOSED WHEN IT CANNOT CHECK. Before supabase/sql/run-now's site accounts
 * part has run there is no table, and a code that cannot be proved unused is
 * refused rather than trusted. The website's account page says signing in is
 * not available yet and links to the Library on storelib.com instead.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type ClaimOutcome = "claimed" | "used" | "unavailable" | "failed"

/** Postgres "undefined table", or PostgREST not finding it. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const m = String(error.message ?? "").toLowerCase()
  return m.includes("relation") && m.includes("does not exist")
}

export async function claimCode(
  db: Db,
  code: { j: string; c: string; u: string; h: string },
): Promise<ClaimOutcome> {
  try {
    const { error } = await db.from("site_account_codes").insert({ jti: code.j, creator_id: code.c, user_id: code.u, host: code.h })
    if (!error) return "claimed"
    if (error.code === "23505") return "used"
    if (isMissingTable(error)) return "unavailable"
    console.warn("[site-accounts] could not record a code:", error.code ?? "error")
    return "failed"
  } catch (error) {
    console.warn("[site-accounts] could not record a code:", (error as Error)?.name ?? "error")
    return "failed"
  }
}

/** Codes live two minutes; their ids are kept a day, then swept now and then. */
export async function sweepCodes(db: Db, now = Date.now()): Promise<void> {
  try {
    await db.from("site_account_codes").delete().lt("used_at", new Date(now - 24 * 60 * 60_000).toISOString())
  } catch {
    /* Tidying only. */
  }
}
