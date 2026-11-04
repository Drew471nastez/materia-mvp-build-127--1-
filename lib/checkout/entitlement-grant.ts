/**
 * THE BUYER'S LIBRARY ENTRY, OR AN ERROR: NEVER A SILENT "DONE"
 *
 * Product, basket and physical orders each gave a signed in buyer their
 * library entry inside a follow-up step (lib/checkout/followups). supabase-js
 * does not throw, so an insert that failed (a timeout, a moment's outage)
 * returned { error } unread, the step was recorded done, and the ten minute
 * sweep never tried again: paid, and not in the library.
 *
 * Now a failed read or insert throws, the follow-up records the step as
 * failed, and the sweep runs it again. Still idempotent: an existing entry is
 * read first, and an insert that loses a race to another (unique violation,
 * 23505) is the entry being there.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export async function ensureEntitlement(
  db: Db,
  e: { buyerId: string; creatorId: string; productId: string; variantId: string | null },
): Promise<"had" | "granted"> {
  let q = db.from("entitlements").select("id").eq("buyer_id", e.buyerId).eq("product_id", e.productId)
  q = e.variantId ? q.eq("variant_id", e.variantId) : q.is("variant_id", null)
  /* Any row is enough: two copies of the same entitlement made maybeSingle() error, read as none, and insert a third. */
  const { data: owned, error: readError } = await q.limit(1)
  if (readError) throw new Error(`entitlement not read: ${readError.message ?? readError.code ?? "error"}`)
  if (Array.isArray(owned) && owned.length > 0) return "had"
  const { error } = await db.from("entitlements").insert({
    buyer_id: e.buyerId,
    creator_id: e.creatorId,
    product_id: e.productId,
    variant_id: e.variantId,
    community_access: false,
  })
  if (error && String(error.code ?? "") !== "23505") throw new Error(`entitlement not written: ${error.message ?? error.code ?? "error"}`)
  return error ? "had" : "granted"
}
