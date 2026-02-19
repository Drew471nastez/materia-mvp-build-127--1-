import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * GET /api/stripe/revenue-chart?timeframe=today|yesterday|last_7|this_month|last_90|last_365|all_time
 *
 * Also supports legacy ?days=7|30|90|all for backwards compatibility.
 *
 * For today/yesterday: returns hourly slots (00–23 UTC) with isHourly=true.
 * For other timeframes: returns daily slots.
 *
 * Includes all revenue-related balance transaction types:
 *   Payments : "payment" (destination charge), "charge" (direct charge)
 *   Refunds  : "payment_refund", "refund", "transfer_reversal"
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
      return NextResponse.json({ data: [], total: 0, totalGross: 0, totalRefunds: 0, isHourly: false })
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get("timeframe") || searchParams.get("days") || "last_7"

    // today and yesterday use hourly buckets instead of daily
    const isHourlyMode = timeframe === "today" || timeframe === "yesterday"

    const now = Math.floor(Date.now() / 1000)
    let createdGte: number | undefined = undefined
    let createdLte: number | undefined = undefined
    let seriesEndDate: Date = new Date()

    switch (timeframe) {
      case "today": {
        const start = new Date()
        start.setUTCHours(0, 0, 0, 0)
        createdGte = Math.floor(start.getTime() / 1000)
        break
      }
      case "yesterday": {
        const start = new Date()
        start.setUTCDate(start.getUTCDate() - 1)
        start.setUTCHours(0, 0, 0, 0)
        const end = new Date()
        end.setUTCDate(end.getUTCDate() - 1)
        end.setUTCHours(23, 59, 59, 999)
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
        start.setUTCDate(1)
        start.setUTCHours(0, 0, 0, 0)
        createdGte = Math.floor(start.getTime() / 1000)
        break
      }
      case "last_90":
      case "90":
        createdGte = now - 90 * 86400
        break
      case "last_365":
      case "365":
      case "30":
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

    const baseParams: Record<string, any> = { limit: 100 }
    if (Object.keys(createdFilter).length > 0) {
      baseParams.created = createdFilter
    }

    // All balance transaction types that represent revenue charges or refunds.
    // Connected accounts using destination charges get "payment" / "payment_refund".
    // Connected accounts using direct charges get "charge" / "refund".
    // Manual transfer flows use "transfer" / "transfer_reversal".
    const PAYMENT_TYPES = new Set(["payment", "charge", "transfer"])
    const REFUND_TYPES = new Set(["payment_refund", "refund", "transfer_reversal"])

    const payments: Array<{ date: string; net: number; gross: number }> = []
    const refunds: Array<{ date: string; net: number; gross: number }> = []
    let hasMore = true
    let startingAfter: string | undefined = undefined

    while (hasMore) {
      const listParams: any = { ...baseParams, limit: 100 }
      if (startingAfter) listParams.starting_after = startingAfter

      const result = await stripe.balanceTransactions.list(listParams, {
        stripeAccount: stripeAccountId,
      })

      for (const tx of result.data) {
        const isPayment = PAYMENT_TYPES.has(tx.type)
        const isRefund = REFUND_TYPES.has(tx.type)
        if (!isPayment && !isRefund) continue

        const date = new Date(tx.created * 1000)
        // Hourly mode: bucket by UTC hour (zero-padded "00"–"23")
        // Daily mode: bucket by UTC date "YYYY-MM-DD"
        const dateKey = isHourlyMode
          ? String(date.getUTCHours()).padStart(2, "0")
          : date.toISOString().split("T")[0]

        // Use Stripe's own exchange_rate for accurate USD conversion.
        // Stripe defines: presentment_amount × exchange_rate = account_amount
        // So to get USD: account_amount / exchange_rate = USD amount.
        // For USD accounts exchange_rate is null/undefined — use amounts as-is.
        const rate = (tx as any).exchange_rate as number | null | undefined
        const toUsdCents = (amount: number) =>
          rate ? Math.round(amount / rate) : amount

        const entry = { date: dateKey, net: toUsdCents(tx.net), gross: toUsdCents(tx.amount) }

        if (isPayment) {
          payments.push(entry)
        } else {
          // refund net and amount are negative in Stripe
          refunds.push(entry)
        }
      }

      hasMore = result.has_more
      if (hasMore && result.data.length > 0) {
        startingAfter = result.data[result.data.length - 1].id
      } else {
        hasMore = false
      }
    }

    const allTransactions = [...payments, ...refunds]

    // Aggregate by date/hour key — track payments and refunds separately
    // so the "count" (sale count) reflects only charges, not refunds.
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
        // don't increment count for refunds — count = number of sales
      }
    }

    // Build the series
    const series: Array<{ date: string; revenue: number; gross: number; refundsAbs: number; count: number }> = []

    if (isHourlyMode) {
      // today:     slots 00 → current UTC hour
      // yesterday: slots 00 → 23
      const endHour = timeframe === "today" ? new Date().getUTCHours() : 23
      for (let h = 0; h <= endHour; h++) {
        const key = String(h).padStart(2, "0")
        series.push(bucketMap[key] || { date: key, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
      }
    } else {
      // Daily series with zero-fill for a continuous chart
      const isAllTime = timeframe === "all" || timeframe === "all_time"
      let startDate: Date

      if (isAllTime && allTransactions.length > 0) {
        const earliest = allTransactions.map((t) => t.date).sort()[0]
        startDate = new Date(earliest)
      } else if (createdGte !== undefined) {
        startDate = new Date(createdGte * 1000)
      } else {
        startDate = new Date()
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

    // Summary totals
    const totalGross = payments.reduce((s, t) => s + t.gross, 0)
    const totalRefunds = refunds.reduce((s, t) => s + Math.abs(t.gross), 0)
    const total = allTransactions.reduce((s, t) => s + t.net, 0)

    return NextResponse.json({
      data: series,
      total,          // net after Stripe fees and refunds (can be 0 or negative → clamped in UI)
      totalGross,     // sum of charges (before fees, before refunds)
      totalRefunds,   // sum of refunded amounts (positive number)
      currency: "usd",
      isHourly: isHourlyMode,
    })
  } catch (error: any) {
    console.error("[Revenue Chart Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch revenue data" }, { status: 500 })
  }
}
