import "server-only"

import type { createAdminClient } from "@/lib/supabase/admin"

/**
 * THE CREATOR'S ORDERS, BY THE CREATOR, NEVER BY A LIST OF PRODUCT IDS.
 * They were read with `.in("product_id", <every current product>)`: a
 * product the creator had deleted took its sales out of every figure, and a
 * large catalog made the request's address longer than a server takes.
 * Now each order carries its creator (orders.creator_id, supabase/sql/
 * run-now part 32) and is read by it, so a deleted product's orders, which
 * keep no product, are still counted, under "Removed product". Until that
 * part has run the column is missing, and the orders are read through
 * their product (`products!inner`) as Home and Customers read them: the
 * same rows the database still has, since until then deleting a product
 * deleted its orders too.
 */
let creatorColumnMissingUntil = 0

type Admin = ReturnType<typeof createAdminClient>

export type OrderScope = "creator" | "product"
/** The creator's orders as a query to add a period, an order and a page to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopedOrders(admin: Admin, columns: string, scope: OrderScope, creatorId: string, product: string | null): any {
  const select = scope === "creator" ? columns : `${columns}, products!inner(creator_id)`
  let q = admin.from("orders").select(select)
  q = scope === "creator" ? q.eq("creator_id", creatorId) : q.eq("products.creator_id", creatorId)
  return product ? q.eq("product_id", product) : q
}

/** Read by the order's own creator when the database has it, else through the product. */
export async function byCreator<T>(read: (scope: OrderScope) => Promise<T>): Promise<T> {
  if (Date.now() >= creatorColumnMissingUntil) {
    try {
      return await read("creator")
    } catch (error) {
      if (!/creator_id/.test((error as Error).message) || !/column|does not exist|PGRST|schema cache/i.test((error as Error).message)) throw error
      creatorColumnMissingUntil = Date.now() + 5 * 60_000
    }
  }
  return read("product")
}

/** The embedded product was only the filter. */
export const ownRows = <T,>(rows: T[]): T[] => rows.map((row) => {
  if (!row || typeof row !== "object" || !("products" in row)) return row
  const { products: _owner, ...order } = row as T & { products?: unknown }
  return order as T
})


/**
 * Has the creator ever been paid: one paid row is enough (a completed one,
 * or one refunded since), so Home's "Make your first sale" is one row read,
 * not every order the creator has. Home used to read every order for this,
 * and a read stops at 1,000 rows.
 */
export async function creatorHasSale(admin: Admin, creatorId: string): Promise<boolean> {
  try {
    return await byCreator(async (scope) => {
      const { data, error } = await scopedOrders(admin, "id", scope, creatorId, null).in("status", ["completed", "refunded"]).limit(1)
      if (error) throw new Error(error.message)
      return Array.isArray(data) && data.length > 0
    })
  } catch (error) {
    console.error("[creator-orders] first sale not read:", (error as Error).message)
    return false
  }
}
