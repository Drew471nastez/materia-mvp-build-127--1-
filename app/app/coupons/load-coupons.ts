import "server-only"

import { createClient } from "@/lib/supabase/server"
import { currentUserForRequest } from "@/lib/auth/request-scope"

/**
 * The signed in creator, their published products (what a code can be
 * limited to) and, when asked, one of their codes. Read with their own
 * client: row-level security answers exactly as it does for the API, and
 * nothing here needs the service role.
 */
export async function loadCouponArea(couponId: string | null) {
  const { user } = await currentUserForRequest()
  if (!user) return { state: "signed-out" as const }
  const supabase = await createClient()
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { state: "no-creator" as const }

  const [products, coupons] = await Promise.all([
    supabase
      .from("products")
      .select("id, title, price_cents, thumbnail_url, status")
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .order("title"),
    couponId
      ? supabase.from("coupons").select("*").eq("id", couponId).eq("creator_id", creator.id).limit(1)
      : supabase.from("coupons").select("*").eq("creator_id", creator.id).order("created_at", { ascending: false }),
  ])

  return {
    state: "ready" as const,
    creatorId: creator.id as string,
    products: products.data ?? [],
    coupons: coupons.data ?? [],
  }
}
