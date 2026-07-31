import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * The buyer's side of order history.
 *
 *   GET /api/orders/purchases → { orders: [...] }
 *
 * The orders read goes through the caller's own client, so RLS ("users can view
 * their own orders") is the access check — not a WHERE clause we hope matches
 * it. The admin client only decorates rows the caller already got back: the
 * listing may have been unpublished or sold since (invisible to the buyer under
 * products RLS, but their receipt shouldn't blank out because of it), and the
 * seller's name lives two joins away in tables a buyer has no SELECT rights on.
 */

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, product_id, amount_cents, status, created_at")
    .eq("buyer_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50)
  if (error) {
    console.error("[orders/purchases] list failed:", error.message)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
  if (!orders?.length) return NextResponse.json({ orders: [] })

  const admin = createAdminClient()
  const productIds = [...new Set(orders.map((o) => o.product_id).filter(Boolean))]

  const { data: products } = await admin
    .from("products")
    .select("id, title, slug, thumbnail_url, price_cents, creator_id")
    .in("id", productIds)
  const productById = new Map((products ?? []).map((p) => [p.id, p]))

  // Seller chain: products.creator_id → creators.user_id → profiles. Two hops,
  // resolved as two batched lookups rather than a nested join so a missing link
  // anywhere degrades to "seller unknown" instead of dropping the order row.
  const creatorIds = [...new Set((products ?? []).map((p) => p.creator_id).filter(Boolean))]
  const { data: creators } = creatorIds.length
    ? await admin.from("creators").select("id, user_id").in("id", creatorIds)
    : { data: [] }
  const userIdByCreator = new Map((creators ?? []).map((c) => [c.id, c.user_id]))

  const sellerUserIds = [...new Set((creators ?? []).map((c) => c.user_id).filter(Boolean))]
  const { data: profiles } = sellerUserIds.length
    ? await admin.from("profiles").select("id, display_name, username").in("id", sellerUserIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    orders: orders.map((o) => {
      const product = productById.get(o.product_id) ?? null
      const sellerUserId = product ? userIdByCreator.get(product.creator_id) : null
      const seller = sellerUserId ? (profileById.get(sellerUserId) ?? null) : null
      return {
        id: o.id,
        createdAt: o.created_at,
        amountCents: o.amount_cents,
        status: o.status,
        product: product
          ? { title: product.title, slug: product.slug, thumbnail_url: product.thumbnail_url, price_cents: product.price_cents }
          : null,
        seller: seller ? { display_name: seller.display_name, username: seller.username } : null,
      }
    }),
  })
}
