/**
 * THE PRODUCTS PAGE'S LIST (app/app/products), on the server and in the
 * browser's refresh alike.
 *
 * ONLY THE COLUMNS THE LIST DRAWS. It read `select("*")`: every product's
 * search vector, custom fields, personalization, tags and image JSON went
 * into the page's payload for a list that shows a title, a picture, a price
 * and a status. PRODUCT_LIST_COLUMNS is what products-client.tsx reads off a
 * row (its Product type, the duplicate, the community filter). A database
 * without one of them (an older install) is read with `*` as before.
 *
 * EVERY PRODUCT, A PAGE AT A TIME. One read stops at 1,000 rows without a
 * word, so a store past its thousandth product lost the oldest from the
 * list. Pages of PRODUCT_LIST_PAGE, newest first (created_at, then id, so a
 * page edge is never read twice), up to PRODUCT_LIST_CEILING.
 */
export const PRODUCT_LIST_COLUMNS =
  "id, creator_id, title, type, price_cents, status, thumbnail_url, slug, created_at, archived, description, includes_community, sales_count, community_id, inventory_count, max_purchases"
export const PRODUCT_LIST_PAGE = 1000
export const PRODUCT_LIST_CEILING = 20_000

type DbError = { code?: string; message?: string } | null

const missingColumn = (error: DbError) =>
  !!error && (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(error.message ?? ""))

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

/** Every product of the creator, newest first; `data` is null only when the first page could not be read (as the one read was). */
export async function readProductList<T>(db: Db, creatorId: string): Promise<{ data: T[] | null; error: DbError }> {
  const read = async (columns: string): Promise<{ data: T[] | null; error: DbError }> => {
    const rows: T[] = []
    for (let from = 0; from < PRODUCT_LIST_CEILING; from += PRODUCT_LIST_PAGE) {
      const { data, error } = (await db
        .from("products")
        .select(columns)
        .eq("creator_id", creatorId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PRODUCT_LIST_PAGE - 1)) as { data: T[] | null; error: DbError }
      /* A later page that failed keeps what was read; a first page that failed is the old "no list". */
      if (error) return rows.length ? { data: rows, error } : { data: null, error }
      rows.push(...(data ?? []))
      if (!data || data.length < PRODUCT_LIST_PAGE) break
    }
    return { data: rows, error: null }
  }
  const named = await read(PRODUCT_LIST_COLUMNS)
  if (named.data === null && missingColumn(named.error)) return read("*")
  return named
}
