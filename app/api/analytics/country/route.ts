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

    // Get product IDs
    let productIds: string[] = []
    if (productId === "all") {
      const { data: products } = await supabase.from("products").select("id").eq("creator_id", creator.id)
      productIds = products?.map((p) => p.id) || []
      console.log("[v0] Analytics country - all products:", {
        creatorId: creator.id,
        productCount: productIds.length,
      })
    } else {
      productIds = [productId]
      console.log("[v0] Analytics country - specific product:", {
        creatorId: creator.id,
        productId: productId,
      })
    }

    // Fire views + orders queries in parallel — they are independent
    let viewsQuery = supabase
      .from("analytics_events")
      .select("country_code, country_name, session_id, product_id")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .not("country_code", "is", null)

    if (productId !== "all") {
      viewsQuery = viewsQuery.eq("product_id", productId)
    }

    let ordersQuery = supabase
      .from("orders")
      .select("amount_cents, buyer_country")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .not("buyer_country", "is", null)

    if (productIds.length > 0) {
      ordersQuery = ordersQuery.in("product_id", productIds)
    } else {
      ordersQuery = ordersQuery.in("product_id", ["__none__"])
    }

    const [
      { data: viewEvents, error: viewError },
      { data: orders, error: ordersError },
    ] = await Promise.all([viewsQuery, ordersQuery])

    if (viewError) console.error("[v0] Analytics country - views error:", viewError)
    if (ordersError) console.error("[v0] Analytics country - orders error:", ordersError)

    const countryMap = new Map<
      string,
      { code: string; name: string; views: number; orders: number; revenue: number; viewKeys: Set<string> }
    >()

    viewEvents?.forEach((event) => {
      const code = event.country_code
      const name = event.country_name || code

      if (!countryMap.has(code)) {
        countryMap.set(code, { code, name, views: 0, orders: 0, revenue: 0, viewKeys: new Set() })
      }
      const stats = countryMap.get(code)!

      // This way, 3 different product pages = 3 views, but refreshing same page = 1 view
      const viewKey = `${event.session_id}__${event.product_id || "store"}`
      if (!stats.viewKeys.has(viewKey)) {
        stats.viewKeys.add(viewKey)
        stats.views++
      }
    })

    orders?.forEach((order) => {
      const code = order.buyer_country
      if (!code) return

      if (!countryMap.has(code)) {
        countryMap.set(code, { code, name: code, views: 0, orders: 0, revenue: 0, viewKeys: new Set() })
      }
      const stats = countryMap.get(code)!
      stats.orders++
      stats.revenue += order.amount_cents
    })

    const countryData = Array.from(countryMap.values())
      .map((country) => ({
        code: country.code,
        name: country.name,
        views: country.views, // Now represents unique visitors
        orders: country.orders,
        revenue: country.revenue,
        conversionRate: Number((country.views > 0 ? (country.orders / country.views) * 100 : 0).toFixed(2)),
      }))
      .sort((a, b) => b.views - a.views)

    console.log("[v0] Analytics country result:", {
      productId,
      timeframe,
      countriesCount: countryData.length,
      totalViews: viewEvents?.length || 0,
      totalOrders: orders?.length || 0,
    })

    return NextResponse.json({ countryData })
  } catch (error) {
    console.error("[v0] Analytics country error:", error)
    return NextResponse.json({ error: "Failed to fetch country analytics" }, { status: 500 })
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
