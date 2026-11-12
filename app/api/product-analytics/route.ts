import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("productId")

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    // Get current user from regular client (for auth check)
    const supabase = await createClient()
    const { data: { user }, unavailable } = await readUserForRoute()
    if (unavailable) return authUnavailableResponse()
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Use admin client for all data fetching (bypasses RLS)
    const adminSupabase = createAdminClient()

    // Verify the user owns this product
    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Verify the product belongs to this creator
    const { data: product } = await adminSupabase
      .from("products")
      .select("id, created_at")
      .eq("id", productId)
      .eq("creator_id", creator.id)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 404 })
    }

    // Fetch views from analytics_events table
    const { count: totalViews } = await adminSupabase
      .from("analytics_events")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("event_type", "view")
      .eq("creator_id", creator.id)

    // Fetch ALL orders for this product (including all statuses for debugging)
    const { data: allOrdersData } = await adminSupabase
      .from("orders")
      .select("id, buyer_id, amount_cents, created_at, status")
      .eq("product_id", productId)

    // Filter completed orders for calculations
    const completedOrders = (allOrdersData || []).filter(o => o.status === "completed")

    // Fetch refunds for this product (completed refunds only)
    const { count: totalRefunds } = await adminSupabase
      .from("refunds")
      .select("*", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("status", "completed")

    // Get unique customers from completed orders
    const uniqueCustomers = new Set(completedOrders.map(o => o.buyer_id)).size

    // Calculate revenue from completed orders
    const revenue = completedOrders.reduce((sum, order) => {
      return sum + (order.amount_cents || 0)
    }, 0)

    // Get last 7 days dates
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return date.toISOString().split('T')[0]
    })

    // Get views data for chart from analytics_events
    const { data: dailyViews } = await adminSupabase
      .from("analytics_events")
      .select("created_at")
      .eq("product_id", productId)
      .eq("event_type", "view")
      .eq("creator_id", creator.id)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    // Get orders data for chart
    const { data: dailyOrdersData } = await adminSupabase
      .from("orders")
      .select("created_at, status")
      .eq("product_id", productId)
      .eq("status", "completed")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

    // Build chart data
    const chartData = last7Days.map(date => {
      const dayViews = (dailyViews || []).filter(v =>
        v.created_at?.startsWith(date)
      ).length
      const dayOrders = (dailyOrdersData || []).filter(o =>
        o.created_at?.startsWith(date)
      ).length
      return {
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        views: dayViews,
        orders: dayOrders,
      }
    })

    // Get first and last sale dates from completed orders
    const sortedOrders = [...completedOrders].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )
    const firstSaleData = sortedOrders[0]
    const lastSaleData = sortedOrders[sortedOrders.length - 1]

    const views = totalViews || 0
    const orders = completedOrders.length
    const refunds = totalRefunds || 0
    const conversionRate = views > 0 ? ((orders / views) * 100).toFixed(1) : "0.0"
    const avgOrderValue = orders > 0 ? Math.round(revenue / orders) : 0
    const refundRate = orders > 0 ? ((refunds / orders) * 100).toFixed(1) : "0.0"
    const daysLive = Math.max(1, Math.floor((Date.now() - new Date(product.created_at).getTime()) / (1000 * 60 * 60 * 24)))

    return NextResponse.json({
      views,
      orders,
      revenue,
      conversionRate,
      avgOrderValue,
      refunds,
      refundRate,
      customers: uniqueCustomers,
      chartData,
      daysLive,
      firstSale: firstSaleData?.created_at
        ? new Date(firstSaleData.created_at).toLocaleDateString()
        : "No sales yet",
      lastSale: lastSaleData?.created_at
        ? new Date(lastSaleData.created_at).toLocaleDateString()
        : "No sales yet",
    })
  } catch (error) {
    console.error("Error fetching product analytics:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
