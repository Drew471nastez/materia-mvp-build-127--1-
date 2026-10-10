import "server-only"

/**
 * ===========================================================================
 *  EVERY STORE STARTS WITH TWO COLLECTIONS, AS ON SHOPIFY
 * ===========================================================================
 *   All products   smart: every product in the shop, newest first
 *   Home page      by hand: what the creator picks to show on the home page
 *
 * Made once per store, the first time its collections are read with none
 * there (Products › Collections, or the website builder's pickers), and
 * marked in `default_collections_given` (part 108, server only) so
 * deleting them is final. Before part 108 is run there is no mark, and they
 * are made whenever a store has no collections at all. Never throws: a store that
 * could not get them simply has none, as before.
 */
import { createAdminClient } from "@/lib/supabase/admin"

export const DEFAULT_COLLECTIONS = [
  {
    title: "All products",
    slug: "all-products",
    description: "Every product in the store.",
    kind: "smart" as const,
    rules: [{ field: "price", op: "greater_than", value: "-1" }],
    match: "all" as const,
    sort: "newest" as const,
  },
  {
    title: "Home page",
    slug: "home-page",
    description: "Products picked for the home page.",
    kind: "manual" as const,
    rules: [],
    match: "all" as const,
    sort: "manual" as const,
  },
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True when it made them just now. */
export async function ensureDefaultCollections(creatorId: string): Promise<boolean> {
  if (!UUID.test(creatorId)) return false
  try {
    const db = createAdminClient()
    const { data: mark, error: markErr } = await db.from("default_collections_given").select("creator_id").eq("creator_id", creatorId).maybeSingle()
    if (!markErr && mark) return false
    const remember = async () => {
      if (!markErr) await db.from("default_collections_given").upsert({ creator_id: creatorId }, { onConflict: "creator_id", ignoreDuplicates: true })
    }
    const { count } = await db.from("product_collections").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
    if ((count ?? 0) > 0) {
      await remember()
      return false
    }
    const { error } = await db
      .from("product_collections")
      .upsert(DEFAULT_COLLECTIONS.map((c) => ({ creator_id: creatorId, ...c, published: true })), { onConflict: "creator_id,slug", ignoreDuplicates: true })
    if (error) return false
    await remember()
    return true
  } catch {
    return false
  }
}
