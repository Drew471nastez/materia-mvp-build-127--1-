/**
 * How many rows of a table match, for the admin's payments overview.
 *
 * `select` comes first. In supabase-js, `from(table)` is a query builder that
 * only knows select, insert, update, upsert and delete; the filters (`eq`,
 * `neq`, `not`, ...) belong to what `select` returns. The overview used to
 * filter first and select after, so every filtered count threw
 * "e.not is not a function" and the whole overview answered 500.
 *
 * A failed count is 0 rather than a failed page: one number the database
 * would not give is not a reason to hide the other eleven.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = any

export async function countRows(db: Db, table: string, filter?: (q: Filter) => Filter): Promise<number> {
  try {
    let q = db.from(table).select("id", { count: "exact", head: true })
    if (filter) q = filter(q)
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
