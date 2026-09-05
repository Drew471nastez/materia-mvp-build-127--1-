import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readSessionAuth } from "@/lib/auth/current-user"

/** The shipping fields are optional because the migration may not have run. */
interface SaleRow {
  id: string
  product_id: string | null
  buyer_id: string | null
  buyer_first_name: string | null
  buyer_last_name: string | null
  buyer_email: string | null
  amount_cents: number | null
  status: string | null
  created_at: string | null
  shipping_status?: string | null
  awb_number?: string | null
  ship_fixed_location_id?: number | null
}

/**
 * The seller's side of order history.
 *
 *   GET /api/orders/sales → { orders: [...] }
 *
 * The entitlement is established on the caller's own client: their creator row,
 * then their products (drafts included — a listing taken down after it sold
 * still has a sale to show). Only ids that survive that RLS-checked read go
 * into the orders filter, so the admin client that then fetches the orders can
 * only ever return sales of things the caller provably owns. The orders read
 * itself is admin because orders are the buyers' rows — every seller-facing
 * order read in this codebase goes through the admin client for that reason —
 * as is the buyer-profile lookup that names older orders predating the buyer_*
 * snapshot columns.
 *
 * No creator row is an empty history, not an error: the page is reachable by
 * anyone, and someone who never listed simply hasn't sold anything yet.
 */

export async function GET() {
  const supabase = await createClient()
  // The creator row and the listings under it are both read on the caller's own
  // client, so RLS decides which creator this id can resolve to and which
  // products hang off it. The admin client below is then scoped to product ids
  // that came out of that RLS-scoped read, never to this id — so a session read
  // locally cannot widen what comes back.
  const auth = await readSessionAuth(supabase)
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "auth_unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", auth.userId).maybeSingle()
  if (!creator) return NextResponse.json({ orders: [] })

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, title, slug, thumbnail_url, price_cents")
    .eq("creator_id", creator.id)
    .limit(1000)
  if (productsError) {
    console.error("[orders/sales] products failed:", productsError.message)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
  if (!products?.length) return NextResponse.json({ orders: [] })
  const productById = new Map(products.map((p) => [p.id, p]))

  const admin = createAdminClient()
  const productIds = products.map((p) => p.id)
  // Shipping columns exist only after supabase/sql/RUN_SHIPPING.sql. Ask for
  // them, and fall back on the specific "undefined column" failure so a seller's
  // history still loads on a deployment where shipping is not switched on.
  const BASE =
    "id, product_id, buyer_id, buyer_first_name, buyer_last_name, buyer_email, amount_cents, status, created_at"
  const withShipping = await admin
    .from("orders")
    .select(`${BASE}, shipping_status, awb_number, ship_fixed_location_id`)
    .in("product_id", productIds)
    .order("created_at", { ascending: false })
    .limit(50)

  let orders = withShipping.data as SaleRow[] | null
  let error = withShipping.error
  if (error && false) {
    const base = await admin
      .from("orders")
      .select(BASE)
      .in("product_id", productIds)
      .order("created_at", { ascending: false })
      .limit(50)
    orders = base.data as SaleRow[] | null
    error = base.error
  }
  if (error) {
    console.error("[orders/sales] list failed:", error.message)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
  if (!orders?.length) return NextResponse.json({ orders: [] })

  const buyerIds = [...new Set(orders.map((o) => o.buyer_id).filter(Boolean))]
  const { data: profiles } = buyerIds.length
    ? await admin.from("profiles").select("id, display_name, username").in("id", buyerIds)
    : { data: [] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return NextResponse.json({
    orders: orders.map((o) => {
      const profile = o.buyer_id ? profileById.get(o.buyer_id) : null
      const snapshotName = [o.buyer_first_name, o.buyer_last_name].filter(Boolean).join(" ")
      return {
        id: o.id,
        createdAt: o.created_at,
        amountCents: o.amount_cents,
        status: o.status,
        shippingStatus: o.shipping_status ?? null,
        // Drives the "action needed" nudge in the list: sold, buyer has chosen
        // where it goes, and no label has been produced yet.
        awaitingBuyerAddress: o.awb_number ? false : !o.ship_fixed_location_id,
        product: o.product_id ? (productById.get(o.product_id) ?? null) : null,
        buyer: {
          name: snapshotName || profile?.display_name || profile?.username || null,
          email: o.buyer_email ?? null,
        },
      }
    }),
  })
}
