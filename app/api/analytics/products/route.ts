import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { startTimer, logSlowRequest } from "@/lib/perf"

type TopProductRow = {
  id: string
  title: string
  cover_image: string | null
  views: number
  orders: number
  revenue: number
  conversionRate: number
}

type ViewEvent = {
  product_id: string | null
  session_id: string | null
  visitor_id: string | null
  created_at: string
}

type OrderRow = {
  id: string
  product_id: string
  amount_cents: number
  created_at: string
}

export async function GET(request: NextRequest) {
  const timer = startTimer()
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).single()
    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const searchParams = request.nextUrl.searchParams
    const timeframe = searchParams.get("timeframe") || "last_7_days"
    const productId = searchParams.get("productId") || "all"
    const customStart = searchParams.get("customStart")
    const customEnd = searchParams.get("customEnd")

    const { startDate, endDate } = getDateRange(timeframe, customStart, customEnd)

    // Get creator's products with details
    const { data: products } = await supabase
      .from("products")
      .select("id, title, thumbnail_url")
      .eq("creator_id", creator.id)
      .eq("status", "published")

    if (!products || products.length === 0) {
      return NextResponse.json({ topProducts: [] })
    }

    // Filter products if specific product selected
    let targetProductIds = products.map((p) => p.id)
    if (productId !== "all") {
      targetProductIds = targetProductIds.filter((id) => id === productId)
    }

    if (targetProductIds.length === 0) {
      return NextResponse.json({ topProducts: [] })
    }

    // Fire views + orders queries in parallel — they are independent
    const [
      { data: viewEventsRaw, error: viewError },
      { data: ordersRaw, error: ordersError },
    ] = await Promise.all([
      supabase
        .from("analytics_events")
        .select("product_id, session_id, visitor_id, created_at")
        .eq("creator_id", creator.id)
        .eq("event_type", "view")
        .in("product_id", targetProductIds)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString()),
      supabase
        .from("orders")
        .select("id, product_id, amount_cents, created_at")
        .eq("creator_id", creator.id)
        .eq("status", "completed")
        .in("product_id", targetProductIds)
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString()),
    ])

    if (viewError) console.error("[v0] Analytics products - views error:", viewError)
    if (ordersError) console.error("[v0] Analytics products - orders error:", ordersError)

    const viewEvents: ViewEvent[] = (viewEventsRaw as any[]) || []
    const orders: OrderRow[] = (ordersRaw as any[]) || []

    /**
     * Build product map
     */
    const productMap = new Map<
      string,
      {
        title: string
        coverImage: string | null
        views: number
        orders: number
        revenue: number
        viewKeys: Set<string>
      }
    >()

    // Initialize all products in the map
    products.forEach((p) => {
      if (targetProductIds.includes(p.id)) {
        productMap.set(p.id, {
          title: p.title,
          coverImage: p.thumbnail_url,
          views: 0,
          orders: 0,
          revenue: 0,
          viewKeys: new Set(),
        })
      }
    })

    // Count unique views per product
    for (const ev of viewEvents) {
      if (!ev.product_id) continue

      const stats = productMap.get(ev.product_id)
      if (!stats) continue

      // identity priority: visitor_id -> session_id
      const identity = ev.visitor_id || ev.session_id || "unknown"
      const viewKey = `${identity}__${ev.product_id}`

      if (!stats.viewKeys.has(viewKey)) {
        stats.viewKeys.add(viewKey)
        stats.views++
      }
    }

    // Sort views ASC for stable attribution matching
    viewEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // Aggregate orders and revenue per product with attribution
    for (const order of orders) {
      const orderTime = new Date(order.created_at).getTime()

      let bestMatch: ViewEvent | null = null
      let bestTime = -1

      // Find closest prior view within 1 hour
      for (const ev of viewEvents) {
        if (ev.product_id !== order.product_id) continue

        const eventTime = new Date(ev.created_at).getTime()
        if (eventTime > orderTime) break

        const diff = orderTime - eventTime
        if (diff >= 0 && diff <= 3600000) {
          if (eventTime > bestTime) {
            bestTime = eventTime
            bestMatch = ev
          }
        }
      }

      // Only count orders that have a matching view
      if (bestMatch) {
        const stats = productMap.get(order.product_id)
        if (stats) {
          stats.orders++
          stats.revenue += order.amount_cents
        }
      }
    }

    // Build response - only include products with views or orders
    const topProducts: TopProductRow[] = Array.from(productMap.entries())
      .map(([id, data]) => ({
        id,
        title: data.title,
        cover_image: data.coverImage,
        views: data.views,
        orders: data.orders,
        revenue: data.revenue,
        conversionRate: Math.min(
          data.views > 0 ? Number((data.orders / data.views) * 100).toFixed(2) : "0",
          "100.00",
        ) as any as number,
      }))
      .filter((p) => p.views > 0 || p.orders > 0) // Only include products with activity
      .sort((a, b) => {
        // Primary sort: Revenue DESC
        if (b.revenue !== a.revenue) {
          return b.revenue - a.revenue
        }
        // Secondary sort: Orders DESC
        if (b.orders !== a.orders) {
          return b.orders - a.orders
        }
        // Tertiary sort: Conversion Rate DESC
        return b.conversionRate - a.conversionRate
      })
      .slice(0, 3) // Top 3 products

    logSlowRequest(timer, request)

    return NextResponse.json({ topProducts })
  } catch (error) {
    logSlowRequest(timer, request, { error: "exception" })
    console.error("[v0] Analytics products error:", error)
    return NextResponse.json({ error: "Failed to fetch top products data" }, { status: 500 })
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
