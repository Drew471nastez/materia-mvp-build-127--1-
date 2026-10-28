/**
 * What a list's sub page hands back (components/app/list-return.ts), and how
 * the list lays it over the rows the router kept. Pure, so the tests run it.
 */
export interface ListReturnBase {
  /** The row the page had open, if it was ever saved. */
  id: string | null
  /** It was deleted. */
  deleted?: boolean
  /** What the list says as it comes back. */
  message?: string
}

/** A save or a delete laid over the rows: a saved row replaces its old self, or joins at the end (where a new offer applies); a deleted one goes. */
export function rowsWithReturn<T extends { id: string }>(rows: T[], what: (ListReturnBase & { saved?: T | null }) | null): T[] {
  if (!what?.id) return rows
  if (what.deleted) return rows.filter((r) => r.id !== what.id)
  const saved = what.saved
  if (!saved) return rows
  return rows.some((r) => r.id === what.id) ? rows.map((r) => (r.id === what.id ? saved : r)) : [...rows, saved]
}
