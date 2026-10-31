/**
 * EVERY ROW OF A READ, A PAGE AT A TIME (database audit, payments part).
 *
 * A PostgREST read stops at 1,000 rows. The payouts page and /api/stripe/payouts summed a store's 1099-K years and
 * open disputes, and listed its sales, from one read each: past the thousandth order the figures were made from part
 * of the orders and the Sales tab's count stopped at 1,000.
 *
 * `page(from, to)` is the read with its own stable order and `.range(from, to)`. With `max` (a list) it stops there;
 * without (a figure) a read past FIGURES_MAX is an error rather than a sum of part of the orders. `{ data: null }`
 * when the first page failed, or any page of a figure read: the callers treat that as they always treated a failed
 * read.
 */
export const PAGE_ROWS = 1_000
export const FIGURES_MAX = 200_000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rows = any[]

export async function allPages(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, max?: number): Promise<{ data: Rows | null }> {
  const out: Rows = []
  const limit = max ?? FIGURES_MAX
  for (let from = 0; from < limit; from += PAGE_ROWS) {
    const { data, error } = await page(from, Math.min(from + PAGE_ROWS, limit) - 1)
    if (error) return max !== undefined && from > 0 ? { data: out } : { data: null }
    const rows = (data ?? []) as Rows
    out.push(...rows)
    if (rows.length < PAGE_ROWS) return { data: out }
  }
  if (max === undefined) throw new Error(`more than ${FIGURES_MAX} rows: figures not made from part of them`)
  return { data: out }
}
