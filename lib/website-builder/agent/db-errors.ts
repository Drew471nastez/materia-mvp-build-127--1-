/**
 * ===========================================================================
 *  "NOT SET UP YET", TOLD APART FROM "BROKEN"
 * ===========================================================================
 * Ask Storelib keeps its conversations, their pictures and their reports in
 * tables and a bucket that arrive with the database update (supabase/sql/
 * run-now, parts 24, 28 and 33). Until the update runs, a read or a write
 * fails, and the chat should say the true thing: the step is not taken yet,
 * which is not a fault to report. These say which kind of failure a
 * database or storage error is. Pure, so tests hold them without a database.
 */

type DbError = { code?: string; message?: string } | null | undefined

/**
 * A missing table or column, however the layer in front of Postgres chose
 * to say it. Postgres says 42P01 for a missing relation and 42703 for a
 * missing column; PostgREST says PGRST205 when its schema cache has never
 * seen the table, and PGRST204 for a column it has not seen.
 */
export function isMissingTable(error: DbError): boolean {
  const code = error?.code ?? ""
  if (code === "42P01" || code === "42703" || code === "PGRST205" || code === "PGRST204" || code === "PGRST202") return true
  const message = (error?.message ?? "").toLowerCase()
  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  )
}

/** Supabase Storage answering for a bucket that has not been created. */
export function isMissingBucket(error: { message?: string; status?: unknown; statusCode?: unknown } | null | undefined): boolean {
  if (!error) return false
  if (/bucket not found/i.test(error.message ?? "")) return true
  return String(error.statusCode ?? error.status ?? "") === "404" && /bucket/i.test(error.message ?? "")
}
