import { moneyCaller } from "@/lib/team/money"
import { isTimeZone } from "@/lib/orders/time-zone"
import { addDays, todayIn } from "@/lib/date-range/range"
import { NextResponse } from "next/server"
import { lineMoney } from "@/lib/analytics/reports"
import { createAdminClient } from "@/lib/supabase/admin"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"
import { inStoreCurrency } from "@/lib/money/report-currency-server"

/**
 * GET /api/stripe/revenue-chart?timeframe=today|yesterday|last_7|this_month|last_90|last_365|all_time
 *
 * The chart is the creator's own order records, in the store's currency:
 * each sale charged in another currency (orders.currency) is converted at
 * its own day's ECB rate first (lib/money/report-currency), and one no rate
 * can convert is counted in `unconverted`, never added at a guess.
 */
export async function GET(request: Request) {
  try {
    const adminSupabase = createAdminClient()

    /* The owner, or a team member who may see the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "view")
    if (!who.ok) return who.response

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("id", who.creatorId)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    const { data: products } = await adminSupabase
      .from("products")
      .select("id")
      .eq("creator_id", creator.id)

    const productIds = (products || []).map((p) => p.id)
    if (productIds.length === 0) {
      return NextResponse.json({ data: [], total: 0, totalGross: 0, totalRefunds: 0, currency: (await readStoreCurrency(adminSupabase, creator.id)).currency.toLowerCase(), otherCurrencies: [], unconverted: 0, isHourly: false })
    }

    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get("timeframe") || searchParams.get("days") || "last_7"

    /**
     * A RANGE FROM THE SHARED DATE PICKER: ?start=&end= as instants and ?tz=
     * the creator's zone. Days are then the creator's days, not UTC's, and a
     * range of one day is drawn by the hour. The named timeframes above still
     * work for anything that sends them.
     */
    const startParam = searchParams.get("start")
    const endParam = searchParams.get("end")
    const tzParam = searchParams.get("tz") || "UTC"
    const tz = isTimeZone(tzParam) ? tzParam : "UTC"
    const rangeStart = startParam ? Date.parse(startParam) : NaN
    const rangeEnd = endParam ? Date.parse(endParam) : NaN
    const ranged = Number.isFinite(rangeStart) && Number.isFinite(rangeEnd) && rangeEnd > rangeStart && rangeEnd - rangeStart < 12 * 366 * 86_400_000
    const rangedHourly = ranged && rangeEnd - rangeStart <= 25 * 3_600_000
    const isHourlyMode = ranged ? rangedHourly : timeframe === "today" || timeframe === "yesterday"
    const dayIn = (d: Date) => todayIn(tz, d.getTime())
    const hourIn = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(d).padStart(2, "0")

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
      case "30": {
        /* This fell through to 365 days. */
        const start = new Date(now)
        start.setUTCDate(start.getUTCDate() - 30)
        createdGte = start
        break
      }
      case "last_365":
      case "365": {
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

    if (ranged) {
      createdGte = new Date(rangeStart)
      createdLte = new Date(rangeEnd)
      seriesEndDate = new Date(rangeEnd)
    }

    let query = adminSupabase
      .from("orders")
      .select("status, amount_cents, fee_cents, refund_amount_cents, created_at, currency")
      .in("product_id", productIds)
      .in("status", ["completed", "refunded"])
      .order("created_at", { ascending: true })

    if (createdGte) query = query.gte("created_at", createdGte.toISOString())
    if (createdLte) query = query.lte("created_at", createdLte.toISOString())

    const { data: inPeriod } = await query

    /*
      IN THE STORE'S CURRENCY. Every sale counts, each converted at its own
      day's ECB rate when it was charged in another currency (lib/money/
      report-currency): a market's euro sale or a dollar plan is part of the
      chart, never added in as if it were lei, never left off. A sale no rate
      can convert is reported beside the chart (`unconverted`), not guessed.
    */
    const inStore = await inStoreCurrency(adminSupabase, creator.id, (inPeriod ?? []) as Array<{ status: string; amount_cents: number | null; fee_cents: number | null; refund_amount_cents: number | null; created_at: string; currency: string | null }>)
    const chartCurrency = inStore.currency.toLowerCase()
    const orders = inStore.rows
    /* Sales no rate could convert yet: shown beside the chart in what the buyer paid, never dropped and never guessed. */
    const otherByCurrency = new Map<string, number>()
    for (const row of inStore.left ?? []) {
      const c = String(row.currency ?? "").toLowerCase()
      const g = lineMoney(row as Parameters<typeof lineMoney>[0]).gross
      if (c && g > 0) otherByCurrency.set(c, (otherByCurrency.get(c) ?? 0) + g)
    }
    const otherCurrencies: Array<{ currency: string; gross: number }> = [...otherByCurrency].map(([currency, gross]) => ({ currency, gross }))
    const unconverted = inStore.unconverted

    const payments: Array<{ date: string; net: number; gross: number }> = []
    const refunds: Array<{ date: string; net: number; gross: number }> = []

    for (const order of orders || []) {
      const date = new Date(order.created_at)
      const dateKey = ranged
        ? (isHourlyMode ? hourIn(date) : dayIn(date))
        : isHourlyMode
          ? String(date.getUTCHours()).padStart(2, "0")
          : date.toISOString().split("T")[0]

      /*
        A REFUNDED ORDER IS STILL A SALE, LESS WHAT WENT BACK (lib/analytics/
        reports lineMoney, the rule Analytics and Home count by). The table
        has one status, "refunded", for a partial refund and a full one alike.
        This chart used to leave a refunded order's sale out and take its
        refund off anyway: a 49.00 sale with 5.00 refunded read as -5.00.
      */
      const money = lineMoney(order as Parameters<typeof lineMoney>[0])
      const fee = order.fee_cents || 0
      const sellersShare = Math.max(0, money.gross - fee)
      payments.push({ date: dateKey, gross: money.gross, net: sellersShare })
      /* A refund takes back the seller's share in proportion (the refund route's reverse_transfer); Storelib's fee is kept. */
      if (money.refunded > 0) {
        const takenBack = money.gross > 0 ? Math.round((sellersShare * money.refunded) / money.gross) : 0
        refunds.push({ date: dateKey, gross: -money.refunded, net: -takenBack })
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
        // A refund-only day: gross=0 (no sales), refundsAbs = refund amount
        bucketMap[tx.date] = { date: tx.date, revenue: tx.net, gross: 0, refundsAbs: Math.abs(tx.gross), count: 0 }
      } else {
        bucketMap[tx.date].revenue += tx.net
        // Do NOT subtract from gross — gross tracks completed sales revenue only.
        // This keeps the purple revenue area visible independently of refunds.
        bucketMap[tx.date].refundsAbs += Math.abs(tx.gross)
      }
    }

    const series: Array<{ date: string; revenue: number; gross: number; refundsAbs: number; count: number }> = []

    if (ranged && !isHourlyMode) {
      /* Every day of the range, on the creator's calendar. */
      let day = dayIn(new Date(rangeStart))
      const last = dayIn(new Date(rangeEnd - 1))
      let guard = 0
      while (day <= last && guard++ < 5000) {
        series.push(bucketMap[day] || { date: day, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
        day = addDays(day, 1)
      }
    } else if (ranged) {
      const endHour = Math.min(23, Math.max(0, Number(hourIn(new Date(Math.min(rangeEnd - 1, Date.now()))))))
      for (let h = 0; h <= endHour; h++) {
        const key = String(h).padStart(2, "0")
        series.push(bucketMap[key] || { date: key, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
      }
    } else if (isHourlyMode) {
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
      currency: chartCurrency,
      otherCurrencies,
      unconverted,
      isHourly: isHourlyMode,
    })
  } catch (error: any) {
    console.error("[Revenue Chart Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch revenue data" }, { status: 500 })
  }
}
