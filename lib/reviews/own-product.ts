import "server-only"

/**
 * ===========================================================================
 *  NOBODY REVIEWS THEIR OWN PRODUCT
 * ===========================================================================
 * Both review endpoints already asked "have you bought this", and a creator
 * can satisfy that about their own work: take an entitlement to your own
 * free product and the purchase check passes. The reviews on the page then
 * show the seller's name against five stars on the seller's own listing,
 * which is what was reported.
 *
 * Ownership is the product's creator ROW, not the product row: `creator_id`
 * on a product points at a creator, and a creator belongs to a `user_id`.
 * Comparing the signed-in user against `creator.user_id` is the only
 * comparison that is true for the person who actually owns the listing.
 *
 * Asked in ONE place because two endpoints need the answer and they must not
 * drift: /api/reviews/check decides whether the form is offered, /api/reviews
 * decides whether a review is accepted. A rule enforced only in the first is
 * a rule enforced nowhere, because the second is reachable without it.
 */
export async function isOwnProduct(
  admin: { from: (table: string) => any },
  productId: string,
  userId: string,
): Promise<boolean> {
  if (!productId || !userId) return false
  const { data } = await admin
    .from("products")
    .select("creator:creators!inner(user_id)")
    .eq("id", productId)
    .maybeSingle()
  const creator = (data as any)?.creator
  /* An embedded one-to-one comes back as an object, and as a single-element
     array from some PostgREST versions. Handle both rather than trust one. */
  const ownerId = Array.isArray(creator) ? creator[0]?.user_id : creator?.user_id
  return Boolean(ownerId) && ownerId === userId
}
