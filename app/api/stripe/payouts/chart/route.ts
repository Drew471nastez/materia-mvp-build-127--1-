import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, default_currency")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Parse timeframe from query params
    const searchParams = request.nextUrl.searchParams
    const range = searchParams.get("range") || "30d"

    let daysBack: number
    switch (range) {
      case "7d":
        daysBack = 7
        break
      case "30d":
        daysBack = 30
        break
      case "90d":
        daysBack = 90
        break
      case "all":
        daysBack = 3650 // ~10 years
        break
      default:
        daysBack = 30
    }

    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysBack)
    startDate.setHours(0, 0, 0, 0)

    // Get all products for this creator
    const { data: products } = await adminSupabase
      .from("products")
      .select("id")
      .eq("creator_id", creator.id)

    if (!products || products.length === 0) {
      return NextResponse.json({ data: [], currency: creator.default_currency || "USD" })
    }

    const productIds = products.map((p) => p.id)

    // Fetch completed orders within timeframe
    const { data: orders } = await adminSupabase
      .from("orders")
      .select("amount_cents, fee_cents, created_at, status")
      .in("product_id", productIds)
      .eq("status", "completed")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true })

    if (!orders || orders.length === 0) {
      return NextResponse.json({ data: [], currency: creator.default_currency || "USD" })
    }

    // Aggregate by day
    const dailyMap = new Map<string, { revenue: number; orders: number }>()

    // Pre-fill all days in the range so chart has no gaps
    const now = new Date()
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10)
      dailyMap.set(key, { revenue: 0, orders: 0 })
    }

    for (const order of orders) {
      const day = new Date(order.created_at).toISOString().slice(0, 10)
      const existing = dailyMap.get(day) || { revenue: 0, orders: 0 }
      const net = (order.amount_cents || 0) - (order.fee_cents || 0)
      existing.revenue += net
      existing.orders += 1
      dailyMap.set(day, existing)
    }

    // Convert to sorted array
    const chartData = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        revenue: data.revenue,
        orders: data.orders,
      }))

    return NextResponse.json({
      data: chartData,
      currency: creator.default_currency || "USD",
    })
  } catch (error: any) {
    console.error("[Chart Error]", error)
    return NextResponse.json(
      { error: error.message || "Failed to fetch chart data" },
      { status: 500 }
    )
  }
}
