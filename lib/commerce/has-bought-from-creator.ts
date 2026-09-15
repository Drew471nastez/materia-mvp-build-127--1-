/**
 * ===========================================================================
 *  HAS THIS VIEWER BOUGHT ANYTHING FROM THIS CREATOR
 * ===========================================================================
 * Asked so a creator's contact address can be shown to the people who have
 * actually bought from them and to nobody else.
 *
 * THE JOIN IS THE AUTHORITY, NOT THE DENORMALISED COLUMN. `entitlements` has
 * a `creator_id`, and reading it would be one less hop — but it is a copy of
 * a fact that lives on the product, and a copy can be missing on rows written
 * before it existed or by a path that forgot it. A buyer wrongly told they
 * have not bought anything is a broken page for the one person who paid.
 * `products.creator_id` is where the fact lives, so that is what is asked.
 *
 * IT IS A SERVER QUESTION AND IT HAS TO STAY ONE. What this gates is whether
 * an address is put into the page AT ALL — not whether it is displayed. An
 * address hidden with a class is an address in the HTML, readable by anyone
 * who looks, which is the same as not gating it.
 *
 * FALSE IS THE ANSWER WHEN ANYTHING GOES WRONG: no viewer, no creator, a
 * query that errors. The cost of a wrong `false` is a buyer who has to use
 * the receipt already in their inbox; the cost of a wrong `true` is a
 * published email address that cannot be unpublished.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export async function hasBoughtFromCreator(
  supabase: Pick<SupabaseClient, "from">,
  buyerId: string | null | undefined,
  creatorId: string | null | undefined,
): Promise<boolean> {
  if (!buyerId || !creatorId) return false
  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("id, products!inner(creator_id)")
      .eq("buyer_id", buyerId)
      .eq("products.creator_id", creatorId)
      .limit(1)
    if (error) return false
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}
