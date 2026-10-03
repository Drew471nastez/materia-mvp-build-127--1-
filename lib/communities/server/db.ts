import "server-only"

/**
 * THE DATABASE, AS EVERY COMMUNITY MODULE ON THE SERVER SEES IT.
 *
 * Every community table is server only (row level security on, nothing
 * granted to visitors), so reads and writes go through the service role,
 * after the checks in lib/communities/server/context.ts. Until
 * supabase/sql/run-now/81_communities.sql has run, a table or function is
 * missing: missing() says so, and every module answers "not set up" with a
 * safe value instead of throwing.
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { tableMissing } from "@/lib/memberships/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export interface DbError {
  code?: string
  message?: string
}

/** The service role client. */
export function admin(): Db {
  return createAdminClient()
}

/** A table, column or function that is not there yet (42P01, 42703, PGRST202, PGRST204, PGRST205). */
export function missing(error: DbError | null | undefined): boolean {
  if (!error) return false
  return tableMissing(error) || error.code === "PGRST202" || error.code === "42883"
}

/** Two writes raced to one unique key; the other one's row is the row. */
export function isUniqueViolation(error: DbError | null | undefined): boolean {
  return error?.code === "23505"
}

/** What a page or a route says while the part has not run. */
export const NOT_SET_UP = "Communities are not set up on Storelib yet. Try again later."

export function nowIso(now: number = Date.now()): string {
  return new Date(now).toISOString()
}

/** One line for the server log from anything thrown or answered. */
export function reasonOf(error: unknown): string {
  if (!error) return "unknown"
  if (error instanceof Error) return error.message
  if (typeof error === "object") {
    const e = error as DbError
    return `${e.code ?? ""} ${e.message ?? ""}`.trim() || "unknown"
  }
  return String(error)
}
