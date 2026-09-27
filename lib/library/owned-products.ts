/**
 * ===========================================================================
 *  WHAT A BUYER OWNS STAYS THEIRS WHEN THE CREATOR ARCHIVES IT
 * ===========================================================================
 * The library and the buyer's own pages read their entitlements with the
 * buyer's session and the product beside each one, `product:products(*)`.
 * That embedded read goes through the products table's row level security,
 * which lets a visitor see a PUBLISHED product and its creator see their
 * own, and nothing else. So the day a creator archived or unpublished a
 * product, every buyer's entitlement to it came back with `product: null`:
 * a course player that 404'd, a product gone from My Library unless an
 * order happened to carry it as well, and a gift or a claim with no order
 * gone for good. Gumroad, and every platform, keeps what was paid for.
 *
 * This fills the product back in, by id, with the server's client, for the
 * rows that came back without one. It is only ever handed rows the buyer's
 * own session read and filtered to their own buyer id, so it never shows a
 * product to someone who does not own it. A product that was really
 * deleted is still missing afterwards, which is right: there is nothing to
 * show. A row that already has its product is left alone, so a library
 * where nothing is archived pays no extra round trip.
 */

type Owned = { product_id?: string | null; product?: unknown }

/** The part of a Supabase client this needs: the admin client, or a fake. */
export type OwnedProductsDb = {
  from: (table: string) => any
}

export async function fillOwnedProducts<T extends Owned>(
  admin: OwnedProductsDb,
  rows: readonly T[] | null | undefined,
  columns = "*",
): Promise<T[]> {
  const list = (rows ?? []).slice()
  const missing = [...new Set(list.filter((r) => !r.product && typeof r.product_id === "string" && r.product_id).map((r) => r.product_id as string))]
  if (missing.length === 0) return list
  try {
    const { data, error } = await admin.from("products").select(columns).in("id", missing)
    if (error || !Array.isArray(data)) return list
    const byId = new Map<string, unknown>((data as Array<{ id: string }>).map((p) => [p.id, p]))
    return list.map((r) => (!r.product && r.product_id && byId.has(r.product_id) ? { ...r, product: byId.get(r.product_id) } : r))
  } catch {
    return list
  }
}

/** One row, for the pages that read a single entitlement. */
export async function fillOwnedProduct<T extends Owned>(admin: OwnedProductsDb, row: T | null | undefined, columns = "*"): Promise<T | null> {
  if (!row) return null
  const [filled] = await fillOwnedProducts(admin, [row], columns)
  return filled ?? row
}
