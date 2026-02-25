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

    const { startDate, endDate, granularity } = getDateRangeWithGranularity(timeframe, customStart, customEnd)

    // Get product IDs
    let productIds: string[] = []
    if (productId === "all") {
      const { data: products } = await supabase.from("products").select("id").eq("creator_id", creator.id)
      productIds = products?.map((p) => p.id) || []
      console.log("[v0] Analytics trend - all products:", {
        creatorId: creator.id,
        productCount: productIds.length,
      })
    } else {
      productIds = [productId]
      console.log("[v0] Analytics trend - specific product:", {
        creatorId: creator.id,
        productId: productId,
      })
    }

    // Fire views + orders queries in parallel — they are independent
    let viewsQuery = supabase
      .from("analytics_events")
      .select("created_at")
      .eq("creator_id", creator.id)
      .eq("event_type", "view")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productId !== "all" && productIds.length > 0) {
      viewsQuery = viewsQuery.in("product_id", productIds)
    }

    let ordersQuery = supabase
      .from("orders")
      .select("created_at, amount_cents")
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())

    if (productIds.length > 0) {
      ordersQuery = ordersQuery.in("product_id", productIds)
    } else {
      ordersQuery = ordersQuery.in("product_id", ["__none__"])
    }

    const [
      { data: viewEvents, error: viewError },
      { data: orders, error: ordersError },
    ] = await Promise.all([viewsQuery, ordersQuery])

    if (viewError) console.error("[v0] Analytics trend - views error:", viewError)
    if (ordersError) console.error("[v0] Analytics trend - orders error:", ordersError)

    // Bucket data by granularity
    const buckets = generateBuckets(startDate, endDate, granularity)
    const trendData = buckets.map((bucket) => {
      const views =
        viewEvents?.filter((e) => {
          const eventDate = new Date(e.created_at)
          return eventDate >= bucket.start && eventDate < bucket.end
        }).length || 0

      const sales =
        orders?.filter((o) => {
          const orderDate = new Date(o.created_at)
          return orderDate >= bucket.start && orderDate < bucket.end
        }).length || 0

      const revenue =
        orders
          ?.filter((o) => {
            const orderDate = new Date(o.created_at)
            return orderDate >= bucket.start && orderDate < bucket.end
          })
          .reduce((sum, o) => sum + o.amount_cents, 0) || 0

      return {
        date: bucket.label,
        views,
        sales,
        revenue,
      }
    })

    console.log("[v0] Analytics trend result:", {
      productId,
      timeframe,
      granularity,
      bucketsCount: buckets.length,
      totalViewsInTrend: viewEvents?.length || 0,
      totalOrdersInTrend: orders?.length || 0,
    })

    return NextResponse.json({ trendData, granularity })
  } catch (error) {
    console.error("[v0] Analytics trend error:", error)
    return NextResponse.json({ error: "Failed to fetch trend data" }, { status: 500 })
  }
}

function getDateRangeWithGranularity(timeframe: string, customStart?: string | null, customEnd?: string | null) {
  let endDate = new Date()
  let startDate = new Date()
  let granularity: "minute" | "hour" | "day" | "week" | "month" = "day"

  if (timeframe === "custom" && customStart && customEnd) {
    startDate = new Date(customStart)
    endDate.setTime(new Date(customEnd).getTime())
    const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays <= 1) granularity = "hour"
    else if (diffDays <= 31) granularity = "day"
    else if (diffDays <= 180) granularity = "week"
    else granularity = "month"
    return { startDate, endDate, granularity }
  }

  switch (timeframe) {
    case "last_30_minutes":
      startDate.setMinutes(startDate.getMinutes() - 30)
      granularity = "minute"
      break
    case "today":
      startDate.setHours(0, 0, 0, 0)
      granularity = "hour"
      break
    case "yesterday":
      startDate.setDate(startDate.getDate() - 1)
      startDate.setHours(0, 0, 0, 0)
      endDate.setDate(endDate.getDate() - 1)
      endDate.setHours(23, 59, 59, 999)
      granularity = "hour"
      break
    case "last_7_days":
      startDate.setDate(startDate.getDate() - 7)
      granularity = "day"
      break
    case "last_30_days":
      startDate.setDate(startDate.getDate() - 30)
      granularity = "day"
      break
    case "this_month":
      startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
      granularity = "day"
      break
    case "last_month":
      startDate = new Date(startDate.getFullYear(), startDate.getMonth() - 1, 1)
      endDate = new Date(endDate.getFullYear(), endDate.getMonth(), 0, 23, 59, 59, 999)
      granularity = "day"
      break
    case "last_6_months":
      startDate.setMonth(startDate.getMonth() - 6)
      granularity = "week"
      break
    case "last_year":
      startDate.setFullYear(startDate.getFullYear() - 1)
      granularity = "month"
      break
    default:
      startDate.setDate(startDate.getDate() - 7)
      granularity = "day"
  }

  return { startDate, endDate, granularity }
}

function generateBuckets(start: Date, end: Date, granularity: "minute" | "hour" | "day" | "week" | "month") {
  const buckets: Array<{ start: Date; end: Date; label: string }> = []
  const current = new Date(start)

  while (current < end) {
    const bucketStart = new Date(current)
    const bucketEnd = new Date(current)
    let label = ""

    switch (granularity) {
      case "minute":
        bucketEnd.setMinutes(bucketEnd.getMinutes() + 1)
        label = bucketStart.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
        current.setMinutes(current.getMinutes() + 1)
        break
      case "hour":
        bucketEnd.setHours(bucketEnd.getHours() + 1)
        label = bucketStart.toLocaleTimeString("en-US", { hour: "2-digit", hour12: true })
        current.setHours(current.getHours() + 1)
        break
      case "day":
        bucketEnd.setDate(bucketEnd.getDate() + 1)
        label = bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        current.setDate(current.getDate() + 1)
        break
      case "week":
        bucketEnd.setDate(bucketEnd.getDate() + 7)
        label = bucketStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        current.setDate(current.getDate() + 7)
        break
      case "month":
        bucketEnd.setMonth(bucketEnd.getMonth() + 1)
        label = bucketStart.toLocaleDateString("en-US", { month: "short", year: "numeric" })
        current.setMonth(current.getMonth() + 1)
        break
    }

    buckets.push({ start: bucketStart, end: bucketEnd, label })
  }

  return buckets
}
