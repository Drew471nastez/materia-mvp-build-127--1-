import "server-only"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { routeUser, authUnavailableResponse } from "@/lib/auth/route-user"
export const NO_STORE = { "Cache-Control": "no-store" }
export const PUBLIC_HEADERS = {
  ...NO_STORE,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}
export async function formActor() {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  if (who.kind !== "user") return NextResponse.json({ error: "Sign in to continue." }, { status: 401, headers: NO_STORE })
  return { user: who.user, db: await createClient() }
}
export function formError(error: unknown, status = 400, headers: Record<string, string> = NO_STORE) {
  return NextResponse.json({ error: error instanceof Error ? error.message : "That could not be saved. Try again." }, { status, headers })
}
export async function boundedJson(request: Request, max = 65_536) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error("The request could not be read.")
  const decoder = new TextDecoder()
  let size = 0,
    text = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) {
        await reader.cancel()
        throw new Error("This form is too large.")
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid body")
    return parsed
  } catch {
    throw new Error("The request could not be read.")
  }
}

/** A table, column, function or bucket that SQL part 375 adds is not there yet. */
export function isMissingSchema(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  const message = String(error.message ?? "")
  return (
    ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    /bucket not found|could not find the (table|function|column)|does not exist|schema cache/i.test(message)
  )
}

export const NEEDS_SQL = "This needs the Forms database update (SQL part 375 in Admin › SQL updates). Everything else keeps working."

/*
  WHEN THE FORMS TABLES ARE NOT THERE AT ALL (parts 372 and 375 not run).
  Every forms and leads route answers the same way: a list is an empty list
  marked `missing`, a write is a 503 with code "forms_missing", and the
  page says so in one plain sentence instead of "could not be loaded, try
  again" (a retry can never help until the SQL runs). The answer is
  remembered on this server for a few minutes, so a store without the
  tables does not send a failing query on every visit; once the SQL runs,
  it is picked up within MISSING_FOR_MS with no deploy.
*/

export const FORMS_MISSING = "forms_missing"
export const FORMS_NOT_SET_UP = "Forms are not switched on for this store yet. They need the Forms database update (SQL parts 372 and 375 in Admin › SQL updates). Everything else keeps working."
const MISSING_FOR_MS = 5 * 60 * 1000
let missingUntil = 0

/** A table (not just a column) the forms need is not there. */
export function isMissingTable(error: { code?: unknown; message?: unknown } | null | undefined): boolean {
  if (!error) return false
  const code = String(error.code ?? "")
  const message = String(error.message ?? "")
  return code === "42P01" || code === "PGRST205" || /could not find the table|relation "?[\w.]*"? does not exist/i.test(message)
}

/** The tables were found missing a moment ago on this server: answer without asking again. */
export function formsKnownMissing(now = Date.now()): boolean {
  return now < missingUntil
}

/** Remember (or forget) that the tables are missing. Returns whether they are. */
export function noteFormsTables(error: { code?: unknown; message?: unknown } | null | undefined, now = Date.now()): boolean {
  if (isMissingTable(error)) {
    missingUntil = now + MISSING_FOR_MS
    return true
  }
  if (!error) missingUntil = 0
  return false
}

/** A write or a single read while the tables are missing. */
export function formsMissingResponse(headers: Record<string, string> = NO_STORE) {
  return NextResponse.json({ error: FORMS_NOT_SET_UP, code: FORMS_MISSING }, { status: 503, headers })
}

/** An error that is not a missing table, written to the log with its code so the cause can be found later. */
export function logFormsError(where: string, error: { code?: unknown; message?: unknown } | null | undefined) {
  if (!error) return
  console.error(`[forms] ${where}:`, String(error.code ?? ""), String(error.message ?? "").slice(0, 300))
}
