import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * ===========================================================================
 *  YOU CANNOT DO THINGS TO YOURSELF
 * ===========================================================================
 *
 * A marketplace has a whole family of the same bug: buying your own listing,
 * saving it, reviewing it, following yourself, messaging yourself. Each one is
 * individually small and individually silly, and together they are the way
 * every number on the platform stops meaning anything — a seller with a
 * hundred saves and five reviews, all their own.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE FILE
 * ---------------------------------------------------------------------------
 * The guards were being written one at a time, in whichever route noticed. That
 * produced follows and messages correctly refusing, and wishlist and reviews
 * quietly allowing — the same rule, remembered in two places and forgotten in
 * two others. One function, asked by every route, cannot drift like that.
 *
 * ---------------------------------------------------------------------------
 * IT MUST BE ASKED ON THE SERVER
 * ---------------------------------------------------------------------------
 * The interface already hides most of these buttons, and hiding a button is
 * worth doing — but it is a courtesy to the person using the app, not a
 * control. Anything reachable by a request has to be refused by the code that
 * handles the request.
 *
 * ---------------------------------------------------------------------------
 * A FAILED LOOKUP DOES NOT BLOCK
 * ---------------------------------------------------------------------------
 * These return `false` — "not yours" — when the owner cannot be determined. The
 * cost of being wrong in that direction is somebody saving their own jumper.
 * The cost of being wrong in the other is a database hiccup that stops
 * everybody on the platform from saving anything, which is a much worse day.
 */

/** Who owns a listing? The profile id of the seller, or null if unknowable. */
export async function ownerOfProduct(
  admin: SupabaseClient,
  productId: string,
): Promise<string | null> {
  if (!productId) return null
  try {
    const { data, error } = await admin
      .from("products")
      // `creators` is the seller's shop row; `user_id` on it is the profile
      // that actually belongs to a person. Comparing against creator_id would
      // compare a shop to a human and never match.
      .select("creator:creators!inner(user_id)")
      .eq("id", productId)
      .maybeSingle()
    if (error || !data) return null
    const creator = (data as { creator?: { user_id?: string } | Array<{ user_id?: string }> }).creator
    // PostgREST returns an object for a to-one embed and an array for a to-many
    // one, and which of the two you get depends on how the foreign key is
    // declared. Handling both means this cannot start returning null after a
    // schema change nobody connected to it.
    const row = Array.isArray(creator) ? creator[0] : creator
    return row?.user_id ?? null
  } catch {
    return null
  }
}

/** Is this person the seller of this listing? */
export async function isOwnProduct(
  admin: SupabaseClient,
  userId: string | null | undefined,
  productId: string,
): Promise<boolean> {
  if (!userId) return false
  const owner = await ownerOfProduct(admin, productId)
  return owner !== null && owner === userId
}

/**
 * The refusals, in the buyer's language, so every route says the same thing
 * about the same rule.
 */
export const SELF_ACTION_MESSAGE = {
  buy: "Nu îți poți cumpăra propriul articol.",
  save: "Nu îți poți salva propriul articol.",
  review: "Nu îți poți recenza propriul articol.",
  follow: "Nu te poți urmări pe tine.",
  message: "Nu îți poți trimite mesaj despre propriul articol.",
  offer: "Nu poți face o ofertă pentru propriul articol.",
} as const

/** One shape for all of them, so a client can branch on the code. */
export const SELF_ACTION_CODE = "own_item" as const
