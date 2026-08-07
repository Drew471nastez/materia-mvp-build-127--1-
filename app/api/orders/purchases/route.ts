import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readSessionAuth } from "@/lib/auth/current-user"
import { isMissingShippingSchema } from "@/lib/shipping/order-access"

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

/** The two shipping fields are optional because the migration may not have run. */
interface PurchaseRow {
  id: string
  product_id: string | null
  amount_cents: number | null
  status: string | null
  created_at: string | null
  shipping_status?: string | null
  awb_number?: string | null
  ship_fixed_location_id?: number | null
}

export async function GET() {
  const supabase = await createClient()
  // The orders read below goes through the caller's own client, so the "users
  // can view their own orders" policy is the access check and this id is only
  // the filter that policy already enforces. The admin client further down
  // never sees it — it is handed product and creator ids taken from rows RLS
  // has already released — so the local session read gives up nothing.
  const auth = await readSessionAuth(supabase)
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  // The shipping columns exist only after supabase/sql/RUN_SHIPPING.sql has been
  // run. Ask for them, and fall back to the base columns on the specific
  // "undefined column" failure — an order history that 500s because shipping is
  // not installed yet would be a much worse answer than one without chips.
  const BASE = "id, product_id, amount_cents, status, created_at"
  const withShipping = await supabase
    .from("orders")
    .select(`${BASE}, shipping_status, awb_number, ship_fixed_location_id`)
    .eq("buyer_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(50)

  let orders = withShipping.data as PurchaseRow[] | null
  let error = withShipping.error
  if (error && isMissingShippingSchema(error)) {
    const base = await supabase
      .from("orders")
      .select(BASE)
      .eq("buyer_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(50)
    orders = base.data as PurchaseRow[] | null
    error = base.error
  }
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
        shippingStatus: o.shipping_status ?? null,
        // The one thing the buyer must actually do. Only meaningful once the
        // shipping columns exist — undefined reads as false, which is right.
        needsAddress: o.awb_number ? false : !o.ship_fixed_location_id,
        product: product
          ? { title: product.title, slug: product.slug, thumbnail_url: product.thumbnail_url, price_cents: product.price_cents }
          : null,
        seller: seller ? { display_name: seller.display_name, username: seller.username } : null,
      }
    }),
  })
}
