/**
 * ===========================================================================
 *  A SIGNED-IN CUSTOMER'S SAVED ITEMS, ON ONE WEBSITE
 * ===========================================================================
 * Kept in `site_customer_wishlist` (supabase/sql/run-now/33): one row per
 * customer and product, the customer being a customer of this one creator's
 * website (lib/site-accounts/customers.ts). A guest's list lives in their
 * browser (./wishlist-list.ts) and moves in here when they sign in.
 *
 * Every read and write is scoped TWICE, and neither half is optional:
 *
 *   by the customer    `customer_id` is the signed session's, never a value
 *                      from the request; a function here cannot be asked
 *                      about somebody else;
 *   by the creator     a product is only ever added, listed or merged when it
 *                      is one of this creator's published products, checked
 *                      against `products` on the way in and on the way out.
 *
 * These run with the server's key (the table is closed to the public key,
 * like the rest of part 33), so the scoping above is the whole of the access
 * control, which is why tests/site-accounts.test.ts runs every function
 * against a database that holds other customers' rows and other creators'
 * products, and checks none of them is ever read or touched.
 *
 * Every failure is quiet and says so to the caller: `available: false` when
 * the table is not there, so the page falls back to the browser's own list.
 */

import { cleanList, isProductId, merged, WISHLIST_MAX } from "./wishlist-list"
import { isMissingTable, UUID, type Db } from "./db"
import { toCard, type ProductCard } from "@/lib/website-builder/shop-products"

export type WishlistResult = { available: true; ids: string[] } | { available: false; ids: string[] }

interface Scope {
  customerId: string
  creatorId: string
}

const SAVED = "site_customer_wishlist"

function scoped(scope: Scope): boolean {
  return UUID.test(scope.customerId) && UUID.test(scope.creatorId)
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

/** This customer's saved items that are still this creator's published products, newest first. */
export async function listSiteWishlist(db: Db, scope: Scope): Promise<WishlistResult> {
  if (!scoped(scope)) return { available: true, ids: [] }
  try {
    const { data, error } = await db
      .from(SAVED)
      .select("product_id, created_at")
      .eq("customer_id", scope.customerId)
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

/** Saves one of this creator's products for this customer. Saving twice is saving once. */
export async function addToSiteWishlist(db: Db, scope: Scope, productId: string): Promise<WishlistResult> {
  if (!scoped(scope) || !isProductId(productId)) return listSiteWishlist(db, scope)
  const id = productId.toLowerCase()
  const ok = await creatorProducts(db, scope.creatorId, [id])
  if (!ok.has(id)) return listSiteWishlist(db, scope)
  try {
    const { error } = await db.from(SAVED).insert({ customer_id: scope.customerId, product_id: id })
    if (error && isMissingTable(error)) return { available: false, ids: [] }
    /* 23505: already saved, which is the state being asked for. */
  } catch {
    /* Listed below as it stands. */
  }
  return listSiteWishlist(db, scope)
}

/** Takes one product out of this customer's list. */
export async function removeFromSiteWishlist(db: Db, scope: Scope, productId: string): Promise<WishlistResult> {
  if (!scoped(scope) || !isProductId(productId)) return listSiteWishlist(db, scope)
  const id = productId.toLowerCase()
  try {
    const { error } = await db.from(SAVED).delete().eq("customer_id", scope.customerId).eq("product_id", id)
    if (error && isMissingTable(error)) return { available: false, ids: [] }
  } catch {
    /* Listed below as it stands. */
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
      await db.from(SAVED).insert({ customer_id: scope.customerId, product_id: id })
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
