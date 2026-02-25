import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type TrafficRow = {
  source: string
  views: number
  orders: number
  conversionRate: number
}

type ViewEvent = {
  source_category: string | null
  session_id: string | null
  visitor_id: string | null
  product_id: string | null
  created_at: string
}

type OrderRow = {
  id: string
  created_at: string
}

const DEFAULT_SOURCES: string[] = ["direct", "organic_search", "referral", "email", "paid"]

function normalizeSource(source: string | null | undefined): string {
  const s = (source || "").trim().toLowerCase()
  return s || "direct"
}

function ensureDefaultSources(map: Map<string, { views: number; orders: number; viewKeys: Set<string> }>) {
  DEFAULT_SOURCES.forEach((s) => {
    if (!map.has(s)) map.set(s, { views: 0, orders: 0, viewKeys: new Set() })
  })
}

export async function GET(request: NextRequest) {
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

    // Product filter
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
      .select("source_category, session_id, visitor_id, product_id, created_at")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productId !== "all") {
      viewsQuery = viewsQuery.eq("product_id", productId)
    }

    let ordersQuery = supabase
      .from("orders")
      .select("id, created_at")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productIds.length > 0) ordersQuery = ordersQuery.in("product_id", productIds)
    else ordersQuery = ordersQuery.in("product_id", ["__none__"])

    const [
      { data: viewEventsRaw, error: viewError },
      { data: ordersRaw, error: ordersError },
    ] = await Promise.all([viewsQuery, ordersQuery])

    if (viewError) console.error("[v0] Analytics traffic - views error:", viewError)
    if (ordersError) console.error("[v0] Analytics traffic - orders error:", ordersError)

    const viewEvents: ViewEvent[] = (viewEventsRaw as any[]) || []
    const orders: OrderRow[] = (ordersRaw as any[]) || []

    /**
     * Build map
     */
    const sourceMap = new Map<string, { views: number; orders: number; viewKeys: Set<string> }>()
    ensureDefaultSources(sourceMap)

    // Sort views ASC for stable "latest prior" matching
    viewEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 1) Unique views per source (identity + product/store)
    for (const ev of viewEvents) {
      const source = normalizeSource(ev.source_category)

      if (!sourceMap.has(source)) sourceMap.set(source, { views: 0, orders: 0, viewKeys: new Set() })
      const stats = sourceMap.get(source)!

      // identity priority: visitor_id -> session_id
      const identity = ev.visitor_id || ev.session_id || "unknown"
      const viewKey = `${identity}__${ev.product_id || "store"}`

      if (!stats.viewKeys.has(viewKey)) {
        stats.viewKeys.add(viewKey)
        stats.views++
      }
    }

    // 2) Orders attribution
    for (const order of orders) {
      const orderTime = new Date(order.created_at).getTime()

      let bestMatch: ViewEvent | null = null
      let bestTime = -1

      // views already sorted ASC
      for (let i = 0; i < viewEvents.length; i++) {
        const ev = viewEvents[i]
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

      if (bestMatch) {
        const source = normalizeSource(bestMatch.source_category)
        if (!sourceMap.has(source)) sourceMap.set(source, { views: 0, orders: 0, viewKeys: new Set() })
        sourceMap.get(source)!.orders++
      }
    }

    // ✅ Make sure default sources remain present even if empty
    ensureDefaultSources(sourceMap)

    // Build response
    const trafficSources: TrafficRow[] = Array.from(sourceMap.entries())
      .map(([source, data]) => ({
        source,
        views: data.views,
        orders: data.orders,
        conversionRate: Number((data.views > 0 ? (data.orders / data.views) * 100 : 0).toFixed(2)),
      }))
      // Put defaults on top, then others by views
      .sort((a, b) => {
        const aDefault = DEFAULT_SOURCES.includes(a.source) ? 0 : 1
        const bDefault = DEFAULT_SOURCES.includes(b.source) ? 0 : 1
        if (aDefault !== bDefault) return aDefault - bDefault
        return b.views - a.views
      })

    return NextResponse.json({ trafficSources })
  } catch (error) {
    console.error("[v0] Analytics traffic error:", error)
    return NextResponse.json({ error: "Failed to fetch traffic data" }, { status: 500 })
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
