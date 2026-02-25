import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

type DeviceRow = {
  device: string
  views: number
  orders: number
  conversionRate: number
}

type ViewEvent = {
  device_type: string | null
  session_id: string | null
  visitor_id: string | null
  product_id: string | null
  created_at: string
}

type OrderRow = {
  id: string
  created_at: string
}

const DEFAULT_DEVICES: string[] = ["mobile", "desktop", "tablet", "unknown"]

function normalizeDevice(device: string | null | undefined): string {
  const d = (device || "").trim().toLowerCase()
  if (d === "mobile" || d === "desktop" || d === "tablet") return d
  return "unknown"
}

function ensureDefaultDevices(map: Map<string, { views: number; orders: number; viewKeys: Set<string> }>) {
  DEFAULT_DEVICES.forEach((d) => {
    if (!map.has(d)) map.set(d, { views: 0, orders: 0, viewKeys: new Set() })
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
      .select("device_type, session_id, visitor_id, product_id, created_at")
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

    if (viewError) console.error("[v0] Analytics device - views error:", viewError)
    if (ordersError) console.error("[v0] Analytics device - orders error:", ordersError)

    const viewEvents: ViewEvent[] = (viewEventsRaw as any[]) || []
    const orders: OrderRow[] = (ordersRaw as any[]) || []

    /**
     * Build map
     */
    const deviceMap = new Map<string, { views: number; orders: number; viewKeys: Set<string> }>()
    ensureDefaultDevices(deviceMap)

    // Sort views ASC for stable "latest prior" matching
    viewEvents.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    // 1) Unique views per device (identity + product/store)
    for (const ev of viewEvents) {
      const device = normalizeDevice(ev.device_type)

      if (!deviceMap.has(device)) deviceMap.set(device, { views: 0, orders: 0, viewKeys: new Set() })
      const stats = deviceMap.get(device)!

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
        const device = normalizeDevice(bestMatch.device_type)
        if (!deviceMap.has(device)) deviceMap.set(device, { views: 0, orders: 0, viewKeys: new Set() })
        deviceMap.get(device)!.orders++
      }
    }

    // Make sure default devices remain present even if empty
    ensureDefaultDevices(deviceMap)

    // Build response
    const deviceData: DeviceRow[] = Array.from(deviceMap.entries())
      .map(([device, data]) => ({
        device,
        views: data.views,
        orders: data.orders,
        conversionRate: Number((data.views > 0 ? (data.orders / data.views) * 100 : 0).toFixed(2)),
      }))
      // Put defaults in order: mobile, desktop, tablet, unknown
      .sort((a, b) => {
        const order = { mobile: 0, desktop: 1, tablet: 2, unknown: 3 }
        return (order[a.device as keyof typeof order] ?? 999) - (order[b.device as keyof typeof order] ?? 999)
      })

    return NextResponse.json({ deviceData })
  } catch (error) {
    console.error("[v0] Analytics device error:", error)
    return NextResponse.json({ error: "Failed to fetch device data" }, { status: 500 })
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
