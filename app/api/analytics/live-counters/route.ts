import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/analytics/live-counters
 *
 * Returns "today" live counters merged with historical rollup data.
 * The dashboard uses this to show real-time stats for the current day
 * combined with pre-aggregated rollup totals for the selected date range.
 *
 * Query params:
 *   - start: start date (YYYY-MM-DD)
 *   - end: end date (YYYY-MM-DD)
 *   - product_id: optional product filter
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator ID
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const start = searchParams.get("start") || new Date().toISOString().slice(0, 10)
    const end = searchParams.get("end") || new Date().toISOString().slice(0, 10)
    const productId = searchParams.get("product_id")

    const today = new Date().toISOString().slice(0, 10)
    const todayStart = `${today}T00:00:00.000Z`

    // 1. Fetch rollup data for historical days (excluding today)
    let rollupQuery = admin
      .from("analytics_daily_rollups")
      .select("*")
      .eq("creator_id", creator.id)
      .gte("rollup_date", start)
      .lte("rollup_date", end)
      .lt("rollup_date", today) // Exclude today — we'll compute it live
      .order("rollup_date", { ascending: true })

    if (productId) {
      rollupQuery = rollupQuery.eq("product_id", productId)
    }

    const { data: rollups } = await rollupQuery

    // 2. Compute today's live counters from raw events
    let todayViewsQuery = admin
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", todayStart)

    let todayUniqueQuery = admin
      .from("analytics_events")
      .select("visitor_id")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", todayStart)

    let todayOrdersQuery = admin
      .from("orders")
      .select("id, amount_cents")
      .eq("status", "completed")
      .gte("created_at", todayStart)

    if (productId) {
      todayViewsQuery = todayViewsQuery.eq("product_id", productId)
      todayUniqueQuery = todayUniqueQuery.eq("product_id", productId)
      todayOrdersQuery = todayOrdersQuery.eq("product_id", productId)
    } else {
      // For store-level, filter orders by creator's products
      const { data: creatorProducts } = await admin
        .from("products")
        .select("id")
        .eq("creator_id", creator.id)

      if (creatorProducts?.length) {
        const productIds = creatorProducts.map(p => p.id)
        todayOrdersQuery = todayOrdersQuery.in("product_id", productIds)
      }
    }

    const [viewsRes, uniqueRes, ordersRes] = await Promise.all([
      todayViewsQuery,
      todayUniqueQuery,
      todayOrdersQuery,
    ])

    // Count unique visitors
    const uniqueVisitors = new Set(
      (uniqueRes.data || []).map((r: { visitor_id: string }) => r.visitor_id).filter(Boolean),
    ).size

    const todayOrders = ordersRes.data || []
    const todayRevenue = todayOrders.reduce((sum: number, o: { amount_cents: number }) => sum + (o.amount_cents || 0), 0)

    // 3. Build the today rollup entry
    const todayRollup = {
      rollup_date: today,
      total_views: viewsRes.count || 0,
      unique_views: uniqueVisitors,
      total_orders: todayOrders.length,
      total_revenue: todayRevenue,
      is_live: true, // Flag to indicate real-time data
    }

    // 4. Aggregate totals across all days
    const historicalRollups = rollups || []
    const allDays = [...historicalRollups, todayRollup]

    const totals = allDays.reduce(
      (acc, day) => ({
        total_views: acc.total_views + (day.total_views || 0),
        unique_views: acc.unique_views + (day.unique_views || 0),
        total_orders: acc.total_orders + (day.total_orders || 0),
        total_revenue: acc.total_revenue + (day.total_revenue || 0),
      }),
      { total_views: 0, unique_views: 0, total_orders: 0, total_revenue: 0 },
    )

    return NextResponse.json({
      totals,
      daily: allDays,
      today: todayRollup,
      range: { start, end },
    })
  } catch (error) {
    console.error("[analytics/live-counters] Error:", error)
    return NextResponse.json({ error: "Failed to fetch counters" }, { status: 500 })
  }
}
