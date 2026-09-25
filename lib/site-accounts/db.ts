/**
 * The one shape every website account module talks to the database through:
 * `from(table)` chains, which the Supabase client answers on the server and
 * tests/fake-supabase.ts answers in the tests, with Postgres's promises
 * (unique keys, conditional updates) kept.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = { from: (table: string) => any }

/** Postgres "undefined table", or PostgREST not finding it: the SQL part has not run yet. */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42P01" || error.code === "PGRST205") return true
  const m = String(error.message ?? "").toLowerCase()
  return m.includes("relation") && m.includes("does not exist")
}

/** Postgres "undefined column", or PostgREST not finding one. */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === "42703" || error.code === "PGRST204") return true
  return /column .* does not exist/i.test(String(error.message ?? ""))
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
