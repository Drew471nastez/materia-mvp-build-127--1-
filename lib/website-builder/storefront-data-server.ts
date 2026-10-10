/**
 * ===========================================================================
 *  THE ROWS BEHIND A PAGE'S OWN FACTS
 * ===========================================================================
 * The three reads storefront-data.ts needs and cannot make itself: the
 * creator's public profile, how many products the shop has, and any product
 * a section picked that is not among the newest the shop already loaded.
 *
 * Public data only, and one creator's only. The profile is what the
 * creator's own Storelib page shows anybody (name, headline, bio, photo);
 * the products are published ones whose `creator_id` is this creator. Every
 * read returns an empty answer rather than throwing, because a page whose
 * facts could not be read is still a page, drawn with those facts empty.
 */
import "server-only"

import { cardsFromRows, PRODUCT_COLUMN_SETS, type ProductCard, type ProductRow } from "./shop-products"
import type { CreatorFacts } from "./storefront-data"
import { offChannel } from "@/lib/store/channel-filter"

/** The narrow shape these reads need, so a test can hand in a fake. */
type Row = Record<string, unknown>
interface Query {
  eq: (col: string, val: string) => Query
  in: (col: string, vals: string[]) => Query
  limit: (n: number) => PromiseLike<{ data: Row[] | null; error?: unknown }>
  maybeSingle: () => PromiseLike<{ data: Row | null }>
}
interface CountQuery {
  eq: (col: string, val: string) => CountQuery & PromiseLike<{ count: number | null }>
}
export type StorefrontDb = {
  from: (table: string) => {
    select: {
      (cols: string): Query
      (cols: string, opts: { count: "exact"; head: true }): CountQuery
    }
  }
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** What the creator's own public page shows about them, and nothing more. */
export async function creatorFacts(db: StorefrontDb, creatorId: string): Promise<CreatorFacts> {
  if (!creatorId) return {}
  try {
    const { data: creator } = await db.from("creators").select("user_id, display_name, headline, bio").eq("id", creatorId).maybeSingle()
    if (!creator) return {}
    const userId = text(creator.user_id)
    const { data: profile } = userId
      ? await db.from("profiles").select("display_name, avatar_url").eq("id", userId).maybeSingle()
      : { data: null }
    const avatar = text(profile?.avatar_url)
    return {
      name: text(profile?.display_name) || text(creator.display_name),
      headline: text(creator.headline),
      bio: text(creator.bio),
      avatar: /^https?:\/\//i.test(avatar) ? avatar : "",
    }
  } catch {
    return {}
  }
}

/** How many products the shop has published. Null when it cannot be counted. */
export async function publishedProductCount(db: StorefrontDb, creatorId: string): Promise<number | null> {
  if (!creatorId) return null
  try {
    const { count } = await db.from("products").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("status", "published")
    return typeof count === "number" ? count : null
  } catch {
    return null
  }
}

/** Most a page may name that the newest-products list did not already hold. */
export const MAX_PICKED_PRODUCTS = 48

/**
 * The products a section picked, by id or by slug, that the page does not
 * have yet. Published and this creator's only: a picker holding somebody
 * else's product id finds nothing, which is the same as a deleted product.
 */
export async function pickedProducts(
  db: StorefrontDb,
  creatorId: string,
  refs: { ids: string[]; slugs: string[] },
): Promise<ProductCard[]> {
  if (!creatorId) return []
  const ids = refs.ids.filter((i) => /^[0-9a-f-]{8,64}$/i.test(i)).slice(0, MAX_PICKED_PRODUCTS)
  const slugs = refs.slugs.filter((s) => /^[a-z0-9][a-z0-9-_.]{0,200}$/i.test(s)).slice(0, MAX_PICKED_PRODUCTS)
  if (ids.length === 0 && slugs.length === 0) return []
  try {
    /*
      THE SAME CARD THE SHOP'S OWN LIST DRAWS. This read the six columns a
      card needs to exist, so a product a section picked that was not among
      the newest came without its gallery, its kind or its options: a grid of
      chosen products lost its second pictures and its add buttons on the
      live site and kept them in the builder. The full columns, falling back
      as the shop's list does, and the options read the same way.
    */
    for (const cols of PRODUCT_COLUMN_SETS) {
      const reads: PromiseLike<{ data: Row[] | null; error?: unknown }>[] = []
      if (ids.length) reads.push(db.from("products").select(cols).eq("creator_id", creatorId).eq("status", "published").in("id", ids).limit(MAX_PICKED_PRODUCTS))
      if (slugs.length) reads.push(db.from("products").select(cols).eq("creator_id", creatorId).eq("status", "published").in("slug", slugs).limit(MAX_PICKED_PRODUCTS))
      const [results, offStore] = await Promise.all([Promise.all(reads), offChannel(db, creatorId, "storefront")])
      if (results.some((r) => r.error)) continue
      /* A product a section picked and then taken off the Online store (Settings › Sales channels) is left out. */
      const picked = results.flatMap((r) => (r.data ?? []) as unknown as ProductRow[]).filter((p) => !offStore.has(String(p.id)))
      return await cardsFromRows(db, picked, creatorId)
    }
    return []
  } catch {
    return []
  }
}
