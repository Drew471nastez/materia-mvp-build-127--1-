import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * GET /api/stripe/revenue-chart?timeframe=today|yesterday|last_7|this_month|last_90|last_365|all_time
 *
 * Buyer-facing chart uses order records (USD) as source of truth.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { data: products } = await adminSupabase
      .from("products")
      .select("id")
      .eq("creator_id", creator.id)

    const productIds = (products || []).map((p) => p.id)
    if (productIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, totalGross: 0, totalRefunds: 0, currency: "usd", isHourly: false })
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get("timeframe") || searchParams.get("days") || "last_7"
    const isHourlyMode = timeframe === "today" || timeframe === "yesterday"

    const now = new Date()
    let createdGte: Date | null = null
    let createdLte: Date | null = null
    let seriesEndDate: Date = new Date(now)

    switch (timeframe) {
      case "today": {
        const start = new Date(now)
        start.setUTCHours(0, 0, 0, 0)
        createdGte = start
        break
      }
      case "yesterday": {
        const start = new Date(now)
        start.setUTCDate(start.getUTCDate() - 1)
        start.setUTCHours(0, 0, 0, 0)
        const end = new Date(now)
        end.setUTCDate(end.getUTCDate() - 1)
        end.setUTCHours(23, 59, 59, 999)
        createdGte = start
        createdLte = end
        seriesEndDate = end
        break
      }
      case "last_7":
      case "7": {
        const start = new Date(now)
        start.setUTCDate(start.getUTCDate() - 7)
        createdGte = start
        break
      }
      case "this_month": {
        const start = new Date(now)
        start.setUTCDate(1)
        start.setUTCHours(0, 0, 0, 0)
        createdGte = start
        break
      }
      case "last_90":
      case "90": {
        const start = new Date(now)
        start.setUTCDate(start.getUTCDate() - 90)
        createdGte = start
        break
      }
      case "last_365":
      case "365":
      case "30": {
        const start = new Date(now)
        start.setUTCDate(start.getUTCDate() - 365)
        createdGte = start
        break
      }
      case "all":
      case "all_time":
        break
      default: {
        const daysNum = parseInt(timeframe, 10)
        if (!isNaN(daysNum)) {
          const start = new Date(now)
          start.setUTCDate(start.getUTCDate() - daysNum)
          createdGte = start
        }
        break
      }
    }

    let query = adminSupabase
      .from("orders")
      .select("status, amount_cents, fee_cents, refund_amount_cents, created_at")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: true })

    if (createdGte) query = query.gte("created_at", createdGte.toISOString())
    if (createdLte) query = query.lte("created_at", createdLte.toISOString())

    const { data: orders } = await query

    const payments: Array<{ date: string; net: number; gross: number }> = []
    const refunds: Array<{ date: string; net: number; gross: number }> = []

    for (const order of orders || []) {
      const date = new Date(order.created_at)
      const dateKey = isHourlyMode
        ? String(date.getUTCHours()).padStart(2, "0")
        : date.toISOString().split("T")[0]

      if (order.status === "completed") {
        const gross = order.amount_cents || 0
        const fee = order.fee_cents || 0
        payments.push({ date: dateKey, gross, net: gross - fee })
      } else if (order.status === "refunded") {
        const refundAbs = order.refund_amount_cents || order.amount_cents || 0
        refunds.push({ date: dateKey, gross: -refundAbs, net: -refundAbs })
      }
    }

    const allTransactions = [...payments, ...refunds]
    const bucketMap: Record<string, { date: string; revenue: number; gross: number; refundsAbs: number; count: number }> = {}

    for (const tx of payments) {
      if (!bucketMap[tx.date]) {
        bucketMap[tx.date] = { date: tx.date, revenue: tx.net, gross: tx.gross, refundsAbs: 0, count: 1 }
      } else {
        bucketMap[tx.date].revenue += tx.net
        bucketMap[tx.date].gross += tx.gross
        bucketMap[tx.date].count += 1
      }
    }

    for (const tx of refunds) {
      if (!bucketMap[tx.date]) {
        bucketMap[tx.date] = { date: tx.date, revenue: tx.net, gross: tx.gross, refundsAbs: Math.abs(tx.gross), count: 0 }
      } else {
        bucketMap[tx.date].revenue += tx.net
        bucketMap[tx.date].gross += tx.gross
        bucketMap[tx.date].refundsAbs += Math.abs(tx.gross)
      }
    }

    const series: Array<{ date: string; revenue: number; gross: number; refundsAbs: number; count: number }> = []

    if (isHourlyMode) {
      const endHour = timeframe === "today" ? new Date().getUTCHours() : 23
      for (let h = 0; h <= endHour; h++) {
        const key = String(h).padStart(2, "0")
        series.push(bucketMap[key] || { date: key, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
      }
    } else {
      const isAllTime = timeframe === "all" || timeframe === "all_time"
      let startDate: Date

      if (isAllTime && allTransactions.length > 0) {
        const earliest = allTransactions.map((t) => t.date).sort()[0]
        startDate = new Date(earliest)
      } else if (createdGte) {
        startDate = new Date(createdGte)
      } else {
        startDate = new Date(now)
        startDate.setUTCDate(startDate.getUTCDate() - 365)
      }

      const cursor = new Date(startDate)
      cursor.setUTCHours(0, 0, 0, 0)

      while (cursor <= seriesEndDate) {
        const key = cursor.toISOString().split("T")[0]
        series.push(bucketMap[key] || { date: key, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }

    const totalGross = payments.reduce((s, t) => s + t.gross, 0)
    const totalRefunds = refunds.reduce((s, t) => s + Math.abs(t.gross), 0)
    const total = allTransactions.reduce((s, t) => s + t.net, 0)

    return NextResponse.json({
      data: series,
      total,
      totalGross,
      totalRefunds,
      currency: "usd",
      isHourly: isHourlyMode,
    })
  } catch (error: any) {
    console.error("[Revenue Chart Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch revenue data" }, { status: 500 })
  }
}
