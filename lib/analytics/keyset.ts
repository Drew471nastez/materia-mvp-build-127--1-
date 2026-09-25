/**
 * EVERY ROW, A PAGE AT A TIME, EACH PAGE WHERE THE LAST ENDED.
 *
 * Supabase answers a read with at most 1,000 rows and says nothing about the
 * rest: a read that is not paged simply stops counting at the thousandth
 * row. This reads every row of a period, in pages sorted by `created_at` and
 * then `id` (rows written in the same millisecond have no order of their
 * own, so a row at the edge of a page could otherwise be read twice or not at
 * all), each page asked for as "from this time, past this id", never "skip
 * the first n", which makes Postgres walk every row before it again.
 *
 * The same reading app/api/analytics/reports does on the server (readAll),
 * for the few reads left in the browser: Home's link taps.
 */

export const KEYSET_PAGE = 1000

export type KeysetAfter = { t: string; id: string } | null

interface KeysetQuery<Q> {
  gte(column: string, value: string): Q
  or(filters: string): Q
}

/** Where a page starts: the period's start, or the last row's time and past its id. */
export function keysetFrom<Q extends KeysetQuery<Q>>(q: Q, start: string, after: KeysetAfter): Q {
  if (!after) return q.gte("created_at", start)
  return q.gte("created_at", after.t).or(`created_at.gt."${after.t}",id.gt.${after.id}`)
}

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Every row, up to `ceiling`; `truncated` says the ceiling was reached. */
export async function readByKeyset<T extends { created_at: string; id?: string | number }>(
  page: (after: KeysetAfter) => Page<T>,
  ceiling = 200_000,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = []
  let after: KeysetAfter = null
  while (rows.length < ceiling) {
    const { data, error } = await page(after)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < KEYSET_PAGE) return { rows, truncated: false }
    const last = data[data.length - 1]
    after = { t: last.created_at, id: String(last.id) }
  }
  return { rows, truncated: true }
}
