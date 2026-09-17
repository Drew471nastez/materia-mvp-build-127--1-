import "server-only"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCategoryToId } from "@/lib/marketplace/categories"
import { EMPTY_INTERESTS, WEIGHT, MIN_PRODUCTS, MIN_TOP_SCORE, type Interests } from "@/lib/explore/interests"

/**
 * Reads only this person's own rows. The buyer's client is used for the two
 * tables that have row-level security written around the buyer; the admin
 * client is used where a table is keyed by something other than the user id
 * and is always filtered to this user in the same statement.
 */
export interface InterestClients {
  supabase: any
  admin: any
}

export async function readInterests(
  userId: string,
  email?: string | null,
  /** Passed only by tests/for-you, so the threshold can be driven with known
   *  rows rather than asserted from reading this file. */
  clients?: InterestClients,
): Promise<Interests> {
  if (!userId) return EMPTY_INTERESTS

  const supabase = clients ? clients.supabase : await createClient()
  const admin = clients ? clients.admin : createAdminClient()

  /* Three independent questions, so three at once rather than three in a row.
     The library page's note explains why that matters on a dynamic route. */
  const [entitlements, wishlist, subscriptions] = await Promise.all([
    supabase.from("entitlements").select("product_id").eq("buyer_id", userId),
    supabase.from("wishlist_items").select("product_id").eq("user_id", userId),
    email
      ? admin.from("subscribers").select("creator_id").eq("email", email.toLowerCase()).eq("is_active", true)
      : Promise.resolve({ data: [] as Array<{ creator_id: string }> }),
  ])

  /* Typed explicitly: `new Set(...)` off an `any[]` widens to unknown, and the
     project's tsconfig for the suite is stricter than next build is. */
  const ownedIds: string[] = [
    ...new Set<string>((entitlements.data || []).map((r: any) => r.product_id).filter(Boolean)),
  ]
  const wishedIds: string[] = [
    ...new Set<string>((wishlist.data || []).map((r: any) => r.product_id).filter(Boolean)),
  ]
  const subscribedCreatorIds: string[] = [
    ...new Set<string>((subscriptions.data || []).map((r: any) => r.creator_id).filter(Boolean)),
  ]

  const productIds: string[] = [...new Set<string>([...ownedIds, ...wishedIds])]
  if (productIds.length === 0 && subscribedCreatorIds.length === 0) return EMPTY_INTERESTS

  const { data: products } = productIds.length
    ? await admin.from("products").select("id, category, creator_id").in("id", productIds)
    : { data: [] as any[] }

  const categoryScore = new Map<string, number>()
  const creatorScore = new Map<string, number>()

  for (const product of products || []) {
    const weight = ownedIds.includes(product.id) ? WEIGHT.owned : WEIGHT.wishlisted
    const category = normalizeCategoryToId(product.category)
    /* "other" is where everything unrecognised lands, so it is not a taste. */
    if (category && category !== "other" && category !== "all") {
      categoryScore.set(category, (categoryScore.get(category) || 0) + weight)
    }
    if (product.creator_id) {
      creatorScore.set(product.creator_id, (creatorScore.get(product.creator_id) || 0) + weight)
    }
  }
  for (const creatorId of subscribedCreatorIds) {
    creatorScore.set(creatorId, (creatorScore.get(creatorId) || 0) + WEIGHT.subscribed)
  }

  const byScore = (a: [string, number], b: [string, number]) => b[1] - a[1]
  const categories = [...categoryScore.entries()].sort(byScore).map(([id]) => id)
  const creatorIds = [...creatorScore.entries()].sort(byScore).map(([id]) => id)
  const topScore = categoryScore.size ? Math.max(...categoryScore.values()) : 0

  return {
    categories,
    creatorIds,
    ownedProductIds: ownedIds,
    productCount: productIds.length,
    enough: productIds.length >= MIN_PRODUCTS && topScore >= MIN_TOP_SCORE,
  }
}

