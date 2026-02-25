import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const timeframe = searchParams.get("timeframe") || "last_7_days"
    const productId = searchParams.get("productId") || "all"
    const customStart = searchParams.get("customStart")
    const customEnd = searchParams.get("customEnd")

    const { startDate, endDate } = getDateRange(timeframe, customStart, customEnd)

    let productIds: string[] = []
    if (productId === "all") {
      const { data: products } = await supabase.from("products").select("id").eq("creator_id", creator.id)
      productIds = products?.map((p) => p.id) || []
    } else {
      productIds = [productId]
    }

    // Fire views + orders queries in parallel — they are independent
    let viewsQuery = supabase
      .from("analytics_events")
      .select("visitor_id, session_id, product_id")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productId !== "all" && productIds.length > 0) {
      viewsQuery = viewsQuery.in("product_id", productIds)
    }

    let ordersQuery = supabase
      .from("orders")
      .select("amount_cents")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productIds.length > 0) {
      ordersQuery = ordersQuery.in("product_id", productIds)
    } else {
      ordersQuery = ordersQuery.in("product_id", ["__none__"])
    }

    const [{ data: viewEvents }, { data: orders }] = await Promise.all([viewsQuery, ordersQuery])

    // Unique views = (visitor_id or session fallback) + product/store
    const uniqueViewKeys = new Set(
      (viewEvents || [])
        .map((e: any) => `${(e.visitor_id || e.session_id || "unknown")}__${e.product_id || "store"}`)
        .filter(Boolean),
    )
    const totalViews = uniqueViewKeys.size || 0

    const totalOrders = orders?.length || 0
    const totalRevenue = orders?.reduce((sum, o) => sum + o.amount_cents, 0) || 0

    let conversionRate = 0
    if (totalViews > 0) {
      conversionRate = (totalOrders / totalViews) * 100
    }

    return NextResponse.json({
      totalViews,
      totalOrders,
      totalRevenue,
      conversionRate: Number(conversionRate.toFixed(2)),
    })
  } catch (error) {
    console.error("[v0] Analytics summary error:", error)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}

function getDateRange(timeframe: string, customStart?: string | null, customEnd?: string | null) {
  const endDate = new Date()
  let startDate = new Date()

  if (timeframe === "custom" && customStart && customEnd) {
    startDate = new Date(customStart)
    return { startDate, endDate: new Date(customEnd) }
  }

  switch (timeframe) {
    case "last_30_minutes":
      startDate.setMinutes(startDate.getMinutes() - 30)
      break
    case "today":
      startDate.setHours(0, 0, 0, 0)
      break
    case "yesterday":
      startDate.setDate(startDate.getDate() - 1)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(0, 0, 0, 0)
      break
    case "last_7_days":
      startDate.setDate(startDate.getDate() - 7)
      break
    case "last_30_days":
      startDate.setDate(startDate.getDate() - 30)
      break
    case "this_month":
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      break
    case "last_month":
      startDate = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1)
      endDate.setDate(0)
      break
    case "last_6_months":
      startDate.setMonth(startDate.getMonth() - 6)
      break
    case "last_year":
      startDate.setFullYear(startDate.getFullYear() - 1)
      break
    default:
      startDate.setDate(startDate.getDate() - 7)
  }

  return { startDate, endDate }
}
