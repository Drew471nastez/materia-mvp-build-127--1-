/**
 * ===========================================================================
 *  WHAT A FAILED QUERY MEANS, IN WORDS AN OWNER CAN ACT ON
 * ===========================================================================
 * The admin shows a reason under every figure it could not read. That reason
 * used to be PostgREST's own message, sent to the browser as it came, which
 * is two problems at once: raw database text leaves the server, and "column
 * orders.creator_id does not exist" tells the reader what broke without
 * saying what to do about it.
 *
 * So every error is translated here, on the server, into one of a few fixed
 * sentences. The table or column is named, because that is what makes the
 * sentence useful, and nothing else from the database's message is kept: no
 * values, no filter text, no hint. The raw message goes to the server log,
 * with any address in it masked.
 *
 * Pure, with no imports, so the suite can run it.
 */

export type DbError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

const RUN_SQL = "Run supabase/sql/RUN_ADMIN_CONSOLE.sql in Supabase."

/** An identifier as the database named it, and nothing that is not one. */
function identifier(raw: string | undefined): string | null {
  if (!raw) return null
  const clean = raw.replace(/["']/g, "").replace(/^public\./, "")
  return /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)?$/.test(clean) ? clean : null
}

export function plainReason(error: unknown, table?: string): string {
  const e = (error && typeof error === "object" ? error : { message: String(error ?? "") }) as DbError
  const code = typeof e.code === "string" ? e.code : ""
  const message = typeof e.message === "string" ? e.message : ""
  const where = table ? ` ${table}` : ""

  if (code === "42703" || /column .* does not exist/i.test(message)) {
    const col = identifier(message.match(/column "?([\w."]+)"? does not exist/i)?.[1])
    const named = col ? (col.includes(".") || !table ? col : `${table}.${col}`) : null
    return named
      ? `The database has no column ${named}. The query asks for something that was never created.`
      : `A column this query asks for is not in the database.`
  }

  if (code === "42P01" || code === "PGRST205" || /relation .* does not exist|could not find the table/i.test(message)) {
    const name = identifier(message.match(/(?:relation|table) "?'?([\w."]+)'?"?/i)?.[1]) ?? table ?? "this table"
    return `The table ${name} is not in the database yet. ${RUN_SQL}`
  }

  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    const fn = identifier(message.match(/function "?([\w.]+)/i)?.[1])
    return `The database function ${fn ?? ""} is not installed yet. ${RUN_SQL}`.replace("  ", " ")
  }

  if (code === "PGRST200" || /could not find a relationship/i.test(message)) {
    return `The database has no link between${where} and the table this query joins to.`
  }

  if (code === "42501" || /permission denied/i.test(message)) {
    return `The database refused access to${where || " this table"}. The server may not be using the service role key.`
  }

  if (code === "23514" || /violates check constraint/i.test(message)) {
    return `The database does not accept that value yet. ${RUN_SQL}`
  }

  if (code === "57014" || /statement timeout|canceling statement/i.test(message)) {
    return "The query took too long and the database stopped it."
  }

  if (code === "22P02" || /invalid input syntax/i.test(message)) {
    return "The search text is not in the shape this field takes."
  }

  if (/Missing SUPABASE_SERVICE_ROLE_KEY|Missing NEXT_PUBLIC_SUPABASE_URL/.test(message)) {
    return "The server has no database address or key configured."
  }

  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network|socket/i.test(message)) {
    return "The database could not be reached."
  }

  return `The database refused this query${code ? ` (code ${code})` : ""}.`
}

/** A message safe for a server log: addresses masked, length bounded. */
export function loggable(error: unknown): string {
  const e = (error && typeof error === "object" ? error : { message: String(error ?? "") }) as DbError
  const text = `${e.code ? `${e.code} ` : ""}${e.message ?? ""}`
  return text
    .replace(/([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, "$1***@$2")
    .slice(0, 300)
}
