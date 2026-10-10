/**
 * ===========================================================================
 *  THE TWO COLLECTIONS EVERY STORE STARTS WITH
 * ===========================================================================
 * As a Shopify store does: a hand-picked one for the home page, and one that
 * holds every product. Both are ordinary collections from the moment they
 * exist: renamed, filled, emptied or deleted like any other, and a deleted
 * one is not made again.
 *
 *   Home page     slug `frontpage`, which is the name Shopify themes look
 *                 up (collections['frontpage']), empty until products are
 *                 picked for it
 *   All products  slug `all`, so /collections/all is a real page; smart,
 *                 its one condition true of every product, so each new
 *                 product is in it without anybody adding it
 *
 * Made in two places that agree: SQL part 108 (a trigger on every new
 * store, whichever way it was made) and ensureDefaultCollections below,
 * called when onboarding finishes, for a database the part has not reached.
 */
import type { CollectionRule } from "./collections"

export interface DefaultCollection {
  title: string
  slug: string
  kind: "manual" | "smart"
  rules: CollectionRule[]
  match: "all" | "any"
  sort: "manual" | "newest"
}

export const DEFAULT_COLLECTIONS: readonly DefaultCollection[] = [
  { title: "Home page", slug: "frontpage", kind: "manual", rules: [], match: "all", sort: "manual" },
  { title: "All products", slug: "all", kind: "smart", rules: [{ field: "price", op: "greater_than", value: "-1" }], match: "all", sort: "newest" },
]

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * The two, for a store that has just been made and has no collections yet.
 * A store that already has any is left as it is: those are the creator's,
 * and a default they deleted stays deleted. Never throws; a store opens
 * without them rather than not at all.
 */
export async function ensureDefaultCollections(db: Db, creatorId: string): Promise<void> {
  try {
    const { count, error } = await db.from("product_collections").select("id", { count: "exact", head: true }).eq("creator_id", creatorId)
    if (error || (count ?? 0) > 0) return
    await db
      .from("product_collections")
      .upsert(
        DEFAULT_COLLECTIONS.map((c) => ({ creator_id: creatorId, title: c.title, slug: c.slug, kind: c.kind, rules: c.rules, match: c.match, sort: c.sort, published: true })),
        { onConflict: "creator_id,slug", ignoreDuplicates: true },
      )
  } catch {
    /* Before the collections tables exist, or the database is away: the store opens without them. */
  }
}
