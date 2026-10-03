/**
 * ===========================================================================
 *  A PRODUCT THAT SELLS A COMMUNITY TIER IS NOT LISTED AS A PRODUCT
 * ===========================================================================
 * products.community_id marks a product that sells a tier (a membership for
 * a monthly or yearly price, a community product for a one time one). It is
 * found through its community: Explore's communities, the creator's
 * Communities tab, the community's own page. Every product list (Explore and
 * its categories, the creator's grid, OnePage blocks, the website's shop,
 * quick search, the sitemap) leaves it out, and its product page sends to
 * the community.
 *
 * BEFORE PART 81 THE COLUMN IS NOT THERE, and PostgREST refuses a select or
 * a filter that names a column it does not have (42703, or PGRST204 from the
 * schema cache). So a list asks with the filter first and, only on that
 * refusal, again without it: every product is an ordinary product until the
 * part has run. Pure and browser safe: quick search runs in the browser.
 */

type PgError = { code?: string | null; message?: string | null } | null | undefined

/** The refusal of a column that does not exist yet. */
export function missingColumnError(error: unknown): boolean {
  const e = error as PgError
  const code = String(e?.code ?? "")
  return code === "42703" || code === "PGRST204" || (code === "PGRST100" && /community_id/.test(String(e?.message ?? "")))
}

/** Whether a product row sells a community tier. */
export function sellsCommunity(row: { community_id?: string | null } | null | undefined): boolean {
  return typeof row?.community_id === "string" && row.community_id.length > 0
}

/** The rows that are ordinary products. */
export function withoutCommunityProducts<T>(rows: readonly T[]): T[] {
  return rows.filter((r) => !sellsCommunity(r as { community_id?: string | null }))
}

/**
 * A products read with `community_id IS NULL` added, asked again without it
 * when the column is not there yet. `run(true)` must add the filter.
 */
export async function excludingCommunityProducts<R extends { error?: unknown }>(run: (exclude: boolean) => PromiseLike<R>): Promise<R> {
  const first = await run(true)
  if (first?.error && missingColumnError(first.error)) return run(false)
  return first
}
