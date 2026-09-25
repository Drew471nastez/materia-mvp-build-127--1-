/**
 * ===========================================================================
 *  A SIGNED-IN VISITOR'S SAVED ITEMS, FOR ONE WEBSITE
 * ===========================================================================
 * Kept in `wishlist_items`, the table storelib.com's own wishlist has always
 * used (scripts/012_create_wishlist_table.sql): one row per person and
 * product, unique on (user_id, product_id), with row level security that
 * lets a signed-in person read and change their own rows. So a heart pressed
 * on a creator's website is also in that person's Wishlist in their Library
 * on storelib.com, and one pressed there shows here: one account, one list.
 *
 * A website sees the part of that list that is its creator's products and
 * nothing else. Every read and write here is scoped TWICE, and neither half
 * is optional:
 *
 *   by the person      `user_id` is the signed session's, never a value from
 *                      the request; a function here cannot be asked about
 *                      somebody else;
 *   by the creator     a product is only ever added, listed or merged when it
 *                      is one of this creator's published products, checked
 *                      against `products` on the way in.
 *
 * These run with the server's key because the website has no Supabase
 * session to run them with (its visitors sign in on storelib.com). The
 * scoping above is therefore the whole of the access control, which is why
 * tests/site-accounts.test.ts runs every function against a database that
 * holds other people's rows and other creators' products, and checks none of
 * them is ever read or touched.
 *
 * Every failure is quiet and says so to the caller: `available: false` when
 * the table is not there, so the page falls back to the browser's own list.
 */

import { cleanList, isProductId, merged, WISHLIST_MAX } from "./wishlist-list"
import { isMissingTable } from "./codes"
import { toCard, type ProductCard } from "@/lib/website-builder/shop-products"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export type WishlistResult = { available: true; ids: string[] } | { available: false; ids: string[] }

interface Scope {
  userId: string
  creatorId: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function scoped(scope: Scope): boolean {
  return UUID.test(scope.userId) && UUID.test(scope.creatorId)
}

/** Of these ids, the ones that are this creator's published products. */
export async function creatorProducts(db: Db, creatorId: string, ids: string[]): Promise<Set<string>> {
  const wanted = cleanList(ids)
  if (!UUID.test(creatorId) || wanted.length === 0) return new Set()
  try {
    const { data, error } = await db
      .from("products")
      .select("id")
      .in("id", wanted)
      .eq("creator_id", creatorId)
      .eq("status", "published")
    if (error || !Array.isArray(data)) return new Set()
    return new Set((data as { id: string }[]).map((r) => String(r.id).toLowerCase()))
  } catch {
    return new Set()
  }
}

/** This person's saved items that belong to this creator, newest first. */
export async function listSiteWishlist(db: Db, scope: Scope): Promise<WishlistResult> {
  if (!scoped(scope)) return { available: true, ids: [] }
  try {
    const { data, error } = await db
      .from("wishlist_items")
      .select("product_id, created_at")
      .eq("user_id", scope.userId)
      .order("created_at", { ascending: false })
      .limit(500)
    if (error) return isMissingTable(error) ? { available: false, ids: [] } : { available: true, ids: [] }
    const all = cleanList(((data ?? []) as { product_id: string }[]).map((r) => r.product_id))
    const mine = await creatorProducts(db, scope.creatorId, all)
    return { available: true, ids: all.filter((id) => mine.has(id)).slice(0, WISHLIST_MAX) }
  } catch {
    return { available: true, ids: [] }
  }
}

/** Saves one of this creator's products for this person. Saving twice is saving once. */
export async function addToSiteWishlist(db: Db, scope: Scope, productId: string): Promise<WishlistResult> {
  if (!scoped(scope) || !isProductId(productId)) return listSiteWishlist(db, scope)
  const id = productId.toLowerCase()
  const ok = await creatorProducts(db, scope.creatorId, [id])
  if (!ok.has(id)) return listSiteWishlist(db, scope)
  try {
    const { error } = await db.from("wishlist_items").insert({ user_id: scope.userId, product_id: id })
    if (error && isMissingTable(error)) return { available: false, ids: [] }
    /* 23505: already saved, which is the state being asked for. */
  } catch {
    /* Listed below as it stands. */
  }
  return listSiteWishlist(db, scope)
}

/** Takes one of this creator's products out of this person's list. */
export async function removeFromSiteWishlist(db: Db, scope: Scope, productId: string): Promise<WishlistResult> {
  if (!scoped(scope) || !isProductId(productId)) return listSiteWishlist(db, scope)
  const id = productId.toLowerCase()
  /* Only ever a product of this creator: a website cannot empty the rest of somebody's list. */
  const ok = await creatorProducts(db, scope.creatorId, [id])
  if (ok.has(id)) {
    try {
      const { error } = await db.from("wishlist_items").delete().eq("user_id", scope.userId).eq("product_id", id)
      if (error && isMissingTable(error)) return { available: false, ids: [] }
    } catch {
      /* Listed below as it stands. */
    }
  }
  return listSiteWishlist(db, scope)
}

/**
 * The guest list this browser kept, moved into the account: each of this
 * creator's products not already saved is added. Idempotent, so a merge that
 * is retried, or runs in two tabs, adds nothing twice.
 */
export async function mergeIntoSiteWishlist(db: Db, scope: Scope, guestIds: unknown): Promise<WishlistResult> {
  const guest = cleanList(guestIds)
  const current = await listSiteWishlist(db, scope)
  if (!current.available || guest.length === 0) return current
  const allowed = await creatorProducts(db, scope.creatorId, guest)
  const have = new Set(current.ids)
  const fresh = guest.filter((id) => allowed.has(id) && !have.has(id))
  const room = Math.max(0, WISHLIST_MAX - current.ids.length)
  for (const id of fresh.slice(0, room)) {
    try {
      await db.from("wishlist_items").insert({ user_id: scope.userId, product_id: id })
    } catch {
      /* One that did not save is one fewer, not a failed sign in. */
    }
  }
  const after = await listSiteWishlist(db, scope)
  return after.available ? { available: true, ids: merged(after.ids, []) } : after
}

/**
 * The saved products as the cards a section draws, in the order they were
 * saved. Only this creator's published products: an id from a cookie or a
 * link that is anybody else's, or no longer for sale, is left out.
 */
export async function wishlistCards(db: Db, creatorId: string, ids: string[]): Promise<ProductCard[]> {
  const wanted = cleanList(ids)
  if (!UUID.test(creatorId) || wanted.length === 0) return []
  try {
    const { data, error } = await db
      .from("products")
      .select("id, title, slug, price_cents, compare_at_cents, thumbnail_url, status")
      .in("id", wanted)
      .eq("creator_id", creatorId)
      .eq("status", "published")
    if (error || !Array.isArray(data)) return []
    const byId = new Map((data as { id: string }[]).map((r) => [String(r.id).toLowerCase(), r]))
    return wanted.flatMap((id) => {
      const row = byId.get(id)
      return row ? [toCard(row as Parameters<typeof toCard>[0])] : []
    })
  } catch {
    return []
  }
}
