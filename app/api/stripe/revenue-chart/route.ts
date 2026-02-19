import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * GET /api/stripe/revenue-chart?timeframe=today|yesterday|last_7|this_month|last_90|last_365|all_time
 *
 * Also supports legacy ?days=7|30|90|all for backwards compatibility.
 *
 * Returns daily revenue aggregated from the seller's connected Stripe account
 * using BalanceTransactions (type=payment) — actual received funds, not payouts.
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
      .select("id, stripe_account_id, default_currency")
      .eq("user_id", user.id)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const stripeAccountId = creator.stripe_account_id
    if (!stripeAccountId) {
      return NextResponse.json({ data: [], total: 0, totalGross: 0 })
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get("timeframe") || searchParams.get("days") || "last_7"

    const now = Math.floor(Date.now() / 1000)
    let createdGte: number | undefined = undefined
    let createdLte: number | undefined = undefined
    let seriesEndDate: Date = new Date()

    switch (timeframe) {
      case "today": {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        createdGte = Math.floor(start.getTime() / 1000)
        break
      }
      case "yesterday": {
        const start = new Date()
        start.setDate(start.getDate() - 1)
        start.setHours(0, 0, 0, 0)
        const end = new Date()
        end.setDate(end.getDate() - 1)
        end.setHours(23, 59, 59, 999)
        createdGte = Math.floor(start.getTime() / 1000)
        createdLte = Math.floor(end.getTime() / 1000)
        seriesEndDate = end
        break
      }
      case "last_7":
      case "7":
        createdGte = now - 7 * 86400
        break
      case "this_month": {
        const start = new Date()
        start.setDate(1)
        start.setHours(0, 0, 0, 0)
        createdGte = Math.floor(start.getTime() / 1000)
        break
      }
      case "last_90":
      case "90":
        createdGte = now - 90 * 86400
        break
      case "last_365":
      case "365":
      case "30": // legacy 30-day maps to nothing special, but keep for compat
        createdGte = now - 365 * 86400
        break
      case "all":
      case "all_time":
        // no filter — fetch everything
        break
      default: {
        const daysNum = parseInt(timeframe, 10)
        if (!isNaN(daysNum)) createdGte = now - daysNum * 86400
        break
      }
    }

    const createdFilter: Record<string, number> = {}
    if (createdGte !== undefined) createdFilter.gte = createdGte
    if (createdLte !== undefined) createdFilter.lte = createdLte

    const baseParams: Record<string, any> = { type: "payment", limit: 100 }
    if (Object.keys(createdFilter).length > 0) {
      baseParams.created = createdFilter
    }

    // Paginate to collect all transactions in the period
    const allTransactions: Array<{ date: string; net: number; gross: number }> = []
    let hasMore = true
    let startingAfter: string | undefined = undefined
    let detectedCurrency: string | null = null

    while (hasMore) {
      const listParams: any = { ...baseParams, limit: 100 }
      if (startingAfter) listParams.starting_after = startingAfter

      const result = await stripe.balanceTransactions.list(listParams, {
        stripeAccount: stripeAccountId,
      })

      for (const tx of result.data) {
        if (!detectedCurrency && tx.currency) {
          detectedCurrency = tx.currency.toLowerCase()
        }
        const date = new Date(tx.created * 1000)
        const dateKey = date.toISOString().split("T")[0]
        allTransactions.push({
          date: dateKey,
          net: tx.net,
          gross: tx.amount,
        })
      }

      hasMore = result.has_more
      if (hasMore && result.data.length > 0) {
        startingAfter = result.data[result.data.length - 1].id
      } else {
        hasMore = false
      }
    }

    // Aggregate by date
    const dayMap: Record<string, { date: string; revenue: number; gross: number; count: number }> = {}
    for (const tx of allTransactions) {
      if (!dayMap[tx.date]) {
        dayMap[tx.date] = { date: tx.date, revenue: tx.net, gross: tx.gross, count: 1 }
      } else {
        dayMap[tx.date].revenue += tx.net
        dayMap[tx.date].gross += tx.gross
        dayMap[tx.date].count += 1
      }
    }

    // Build sorted date series with zero-fill for continuous chart
    let startDate: Date
    const isAllTime = timeframe === "all" || timeframe === "all_time"

    if (isAllTime && allTransactions.length > 0) {
      const earliest = allTransactions.map((t) => t.date).sort()[0]
      startDate = new Date(earliest)
    } else if (createdGte !== undefined) {
      startDate = new Date(createdGte * 1000)
    } else {
      startDate = new Date()
      startDate.setDate(startDate.getDate() - 365)
    }

    const series: Array<{ date: string; revenue: number; gross: number; count: number }> = []
    const cursor = new Date(startDate)
    cursor.setHours(0, 0, 0, 0)

    while (cursor <= seriesEndDate) {
      const key = cursor.toISOString().split("T")[0]
      series.push(dayMap[key] || { date: key, revenue: 0, gross: 0, count: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    const total = allTransactions.reduce((s, t) => s + t.net, 0)
    const totalGross = allTransactions.reduce((s, t) => s + t.gross, 0)

    return NextResponse.json({
      data: series,
      total,
      totalGross,
      currency: detectedCurrency || (creator.default_currency || "usd").toLowerCase(),
    })
  } catch (error: any) {
    console.error("[Revenue Chart Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch revenue data" }, { status: 500 })
  }
}
