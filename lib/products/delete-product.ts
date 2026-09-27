import "server-only"

/**
 * ===========================================================================
 *  DELETING A PRODUCT, ON THE SERVER, AND SAYING WHAT HAPPENED
 * ===========================================================================
 * "I tried to delete that product and it didn't delete it."
 *
 * Deleting was `supabase.from("products").delete()` in the browser. What
 * that got wrong, and what happens here instead:
 *
 *   A PRODUCT WITH SALES IS NEVER DELETED. It is archived: status archived
 *   and the archived flag, so it is off every public page and out of the
 *   list's All view, and nothing a buyer has is touched. Deleting it would
 *   have taken, through ON DELETE CASCADE, every buyer's entitlement (their
 *   library access) and the product's files (digital_assets), whether or not
 *   run-now part 32 has run; and before part 32, its orders too, or it was
 *   refused outright (23503) by the ledger_events row a paid sale writes
 *   (supabase/migrations/20260220_seller_ledger.sql).
 *
 *   WHAT COUNTS AS A SALE. Erring on counting: any order row for the product,
 *   whatever its status (paid, pending, refunded, failed, disputed), and any
 *   entitlement to it (a free claim, a gift, an import: somebody's library
 *   holds it). A count that cannot be read is not "no sales": nothing is
 *   changed and the caller is told.
 *
 *   ANYTHING ELSE THAT REFUSES THE DELETE (23503 from a foreign key this
 *   repository does not know) is archived the same way: a refused delete
 *   changed nothing, so archiving is safe.
 *
 *   A DELETE NOBODY WAS ALLOWED TO DO. A delete row level security filters
 *   out is not an error; it deletes nothing and says nothing. Here the row
 *   is read and deleted by the caller's own creator id, and the rows the
 *   database answers with are counted: none is a failure, never a success.
 *
 * It never writes an order, an entitlement or a file, and never touches a
 * product of another creator.
 */

type Row = Record<string, unknown>
type DbError = { code?: string; message?: string; details?: string } | null
type Answer<T> = { data: T; error: DbError; count?: number | null }

/** The part of a Supabase client this needs; the admin client in the route, a fake in the tests. */
export type ProductsDb = {
  from: (table: string) => any
}

export type DeleteProductResult =
  | { kind: "deleted"; product: { id: string; slug: string | null; status: string } }
  | {
      kind: "archived"
      reason: "sales" | "linked"
      message: string
      product: { id: string; slug: string | null; status: string; archived: boolean }
    }
  | { kind: "failed"; status: number; error: string }

export type DeletePreview = { kind: "ready"; hasSales: boolean } | { kind: "failed"; status: number; error: string }

/** A product id is a uuid; anything else is not looked up. */
export const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the creator is told when a product is archived rather than deleted. One line, in a toast. */
export const ARCHIVED_FOR_SALES = "It has sales, so it was archived instead"
export const ARCHIVED_FOR_LINKS = "It is still linked to other records, so it was archived instead"

/** A table this database does not have (42P01, or PGRST205 from the schema cache): nothing in it. */
const noTable = (error: DbError) => !!error && (error.code === "42P01" || error.code === "PGRST205")

/**
 * Has anybody bought, claimed or been given this product? Orders of any
 * status, and entitlements. Null when it could not be read.
 */
export async function productHasSales(db: ProductsDb, productId: string): Promise<boolean | null> {
  const count = async (table: string): Promise<number | null> => {
    try {
      const res = (await db.from(table).select("id", { count: "exact", head: true }).eq("product_id", productId)) as Answer<null>
      if (res.error) return noTable(res.error) ? 0 : null
      return res.count ?? 0
    } catch {
      return null
    }
  }
  const [orders, entitlements] = await Promise.all([count("orders"), count("entitlements")])
  if (orders === null || entitlements === null) return null
  return orders + entitlements > 0
}

type Own = { id: string; slug: string | null; status: string }

async function findOwn(db: ProductsDb, creatorId: string, productId: string): Promise<Own | { kind: "failed"; status: number; error: string }> {
  if (!creatorId) return { kind: "failed", status: 403, error: "No store on this account" }
  if (!PRODUCT_ID.test(productId)) return { kind: "failed", status: 400, error: "That is not a product" }
  /* Theirs, or nothing: by the id AND the caller's own creator. */
  const found = (await db
    .from("products")
    .select("id, slug, status")
    .eq("id", productId)
    .eq("creator_id", creatorId)
    .maybeSingle()) as Answer<Row | null>
  if (found.error) return { kind: "failed", status: 500, error: "Could not read the product. Nothing was deleted" }
  if (!found.data) return { kind: "failed", status: 404, error: "This product is not in your store" }
  return { id: productId, slug: (found.data.slug as string | null) ?? null, status: String(found.data.status ?? "draft") }
}

const SALES_UNREAD = "Could not check its sales. Nothing was deleted"

/** What pressing Delete will do, for the question asked before it: delete, or archive because it has sales. */
export async function previewDelete(db: ProductsDb, { creatorId, productId }: { creatorId: string; productId: string }): Promise<DeletePreview> {
  const own = await findOwn(db, creatorId, productId)
  if ("kind" in own) return own
  const hasSales = await productHasSales(db, productId)
  if (hasSales === null) return { kind: "failed", status: 500, error: SALES_UNREAD }
  return { kind: "ready", hasSales }
}

async function archiveOwn(db: ProductsDb, creatorId: string, productId: string): Promise<Answer<Row[] | null>> {
  const write = (status: string) =>
    db.from("products").update({ status, archived: true }).eq("id", productId).eq("creator_id", creatorId).select("id, slug, status, archived")
  let res = (await write("archived")) as Answer<Row[] | null>
  /* 23514: a status check from before "archived". A draft with the flag is off every page just the same (lib/products/archive.ts). */
  if (res.error?.code === "23514") res = (await write("draft")) as Answer<Row[] | null>
  return res
}

export async function deleteOwnProduct(
  db: ProductsDb,
  { creatorId, productId }: { creatorId: string; productId: string },
): Promise<DeleteProductResult> {
  const own = await findOwn(db, creatorId, productId)
  if ("kind" in own) return own
  const { slug, status } = own

  const archive = async (reason: "sales" | "linked"): Promise<DeleteProductResult> => {
    const res = await archiveOwn(db, creatorId, productId)
    const row = Array.isArray(res.data) ? res.data[0] : undefined
    if (res.error || !row) return { kind: "failed", status: 500, error: "Could not delete the product" }
    return {
      kind: "archived",
      reason,
      message: reason === "sales" ? ARCHIVED_FOR_SALES : ARCHIVED_FOR_LINKS,
      product: { id: productId, slug, status: String(row.status ?? "archived"), archived: row.archived === true },
    }
  }

  /* Bought, claimed or given to anybody: archived, never deleted, so no buyer loses it. */
  const hasSales = await productHasSales(db, productId)
  if (hasSales === null) return { kind: "failed", status: 500, error: SALES_UNREAD }
  if (hasSales) return archive("sales")

  const gone = (await db
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("creator_id", creatorId)
    .select("id")) as Answer<Row[] | null>
  if (gone.error) {
    /* A row that still points at it, and says so. The delete changed nothing, so archiving is safe. */
    if (gone.error.code === "23503") {
      console.error("[delete-product] refused by a foreign key, archived instead:", gone.error.message, gone.error.details ?? "")
      return archive("linked")
    }
    console.error("[delete-product] delete failed:", gone.error.code, gone.error.message)
    return { kind: "failed", status: 500, error: "Could not delete the product" }
  }
  if (!gone.data || gone.data.length === 0) return { kind: "failed", status: 409, error: "Could not delete the product" }

  return { kind: "deleted", product: { id: productId, slug, status } }
}
