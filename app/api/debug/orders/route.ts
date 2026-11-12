import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const adminSupabase = createAdminClient()

    // Get current user
    const who = await routeUser({ fresh: true })
    if (who.kind === "unavailable") return authUnavailableResponse()
    if (who.kind !== "user") {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }
    const user = who.user

    // Get creator for this user
    const { data: creator, error: creatorError } = await adminSupabase
      .from("creators")
      .select("*")
      .eq("user_id", user.id)
      .single()

    // Get ALL products (no filter)
    const { data: allProducts, error: allProductsError } = await adminSupabase
      .from("products")
      .select("id, title, creator_id, status")
      .limit(50)

    // Get products for this creator
    const { data: creatorProducts, error: creatorProductsError } = creator ? await adminSupabase
      .from("products")
      .select("id, title, creator_id, status")
      .eq("creator_id", creator.id) : { data: null, error: null }

    // Get ALL orders (no filter)
    const { data: allOrders, error: allOrdersError } = await adminSupabase
      .from("orders")
      .select("id, product_id, buyer_email, amount_cents, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50)

    // Get orders for creator's products
    const productIds = creatorProducts?.map(p => p.id) || []
    const { data: creatorOrders, error: creatorOrdersError } = productIds.length > 0 ? await adminSupabase
      .from("orders")
      .select("id, product_id, buyer_email, amount_cents, status, created_at")
      .in("product_id", productIds)
      .order("created_at", { ascending: false }) : { data: null, error: null }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      creator: creator ? {
        id: creator.id,
        user_id: creator.user_id,
      } : null,
      creatorError,

      allProducts: {
        count: allProducts?.length || 0,
        data: allProducts,
        error: allProductsError,
      },

      creatorProducts: {
        count: creatorProducts?.length || 0,
        productIds,
        data: creatorProducts,
        error: creatorProductsError,
      },

      allOrders: {
        count: allOrders?.length || 0,
        data: allOrders,
        error: allOrdersError,
      },

      creatorOrders: {
        count: creatorOrders?.length || 0,
        data: creatorOrders,
        error: creatorOrdersError,
      },
    })
  } catch (error: any) {
    return NextResponse.json({
      error: "Server error",
      message: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
