import "server-only"

/**
 * ===========================================================================
 *  DELETING A PRODUCT, ON THE SERVER, AND SAYING WHAT HAPPENED
 * ===========================================================================
 * "I tried to delete that product and it didn't delete it."
 *
 * Deleting was `supabase.from("products").delete()` in the browser. Three
 * things went wrong with that, and this is where each is handled:
 *
 *   A PRODUCT WITH SALES. orders.product_id referenced products ON DELETE
 *   CASCADE (scripts/004_create_orders_entitlements.sql) until run-now part
 *   32 made it SET NULL. Before part 32, the delete took the product's
 *   orders with it; and every paid sale also wrote a ledger_events row whose
 *   order_id references orders with no ON DELETE rule
 *   (supabase/migrations/20260220_seller_ledger.sql), so a product with a
 *   paid sale could not be deleted at all: Postgres refused with 23503 and
 *   the product stayed. Now a product with sales is deleted only where the
 *   database keeps its orders (part 32, seen as orders.creator_id, the same
 *   signal lib/analytics/creator-orders reads), and archived everywhere
 *   else: off every page and out of the default list, its sales untouched.
 *   Anything else that still refuses the delete (23503 from a table this
 *   repository does not know) is archived the same way, since a refused
 *   delete changed nothing.
 *
 *   A DELETE NOBODY WAS ALLOWED TO DO. A delete row level security filters
 *   out is not an error; it deletes nothing and says nothing. Here the row
 *   is read and deleted by the caller's own creator id, and the rows the
 *   database answers with are counted: none is a failure, never a success.
 *
 *   ONE ANSWER. The caller gets `deleted`, `archived` (with the one line
 *   that says why) or a failure with a message, and nothing in between.
 *
 * It never deletes an order, and never touches a product of another creator.
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

/** A product id is a uuid; anything else is not looked up. */
export const PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What the creator is told when a product is archived rather than deleted. One line, in a toast. */
export const ARCHIVED_FOR_SALES = "It has sales, so it was archived instead"
export const ARCHIVED_FOR_LINKS = "It is still linked to other records, so it was archived instead"

/**
 * Does this database keep a deleted product's orders? Part 32 adds
 * orders.creator_id and turns the product foreign key into SET NULL in one
 * transaction, so the column is there exactly when the rule is. A read that
 * fails for any other reason counts as no: the product is archived, which
 * loses nothing, rather than deleted, which might.
 */
export async function ordersOutliveProducts(db: ProductsDb): Promise<boolean> {
  try {
    const res = (await db.from("orders").select("creator_id").limit(1)) as Answer<Row[] | null>
    return !res.error
  } catch {
    return false
  }
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
  const slug = (found.data.slug as string | null) ?? null
  const status = String(found.data.status ?? "draft")

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

  /* Its sales. A count that cannot be read is not "no sales". */
  const sold = (await db.from("orders").select("id", { count: "exact", head: true }).eq("product_id", productId)) as Answer<null>
  if (sold.error) return { kind: "failed", status: 500, error: "Could not check its sales. Nothing was deleted" }
  if ((sold.count ?? 0) > 0 && !(await ordersOutliveProducts(db))) return archive("sales")

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
      return archive((sold.count ?? 0) > 0 ? "sales" : "linked")
    }
    console.error("[delete-product] delete failed:", gone.error.code, gone.error.message)
    return { kind: "failed", status: 500, error: "Could not delete the product" }
  }
  if (!gone.data || gone.data.length === 0) return { kind: "failed", status: 409, error: "Could not delete the product" }

  return { kind: "deleted", product: { id: productId, slug, status } }
}
