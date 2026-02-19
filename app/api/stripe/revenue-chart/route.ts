import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

/**
 * GET /api/stripe/revenue-chart?days=7|30|90|all
 *
 * Returns daily revenue aggregated from the seller's connected Stripe account
 * using BalanceTransactions (type=payment) — actual received funds, not payouts.
 *
 * Security: strictly enforces connected account isolation.
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
      return NextResponse.json({ data: [], total: 0 })
    }

    const { searchParams } = new URL(request.url)
    const days = searchParams.get("days") || "30"
    const isAllTime = days === "all"

    const now = Math.floor(Date.now() / 1000)
    const daysNum = parseInt(days, 10) || 30
    const createdGte = isAllTime ? undefined : now - daysNum * 24 * 60 * 60

    // Fetch balance transactions of type "payment" from the connected account.
    // These represent successful payments received by the seller (net of Stripe fees).
    const params: Record<string, any> = {
      type: "payment",
      limit: 100,
    }
    if (createdGte) {
      params.created = { gte: createdGte }
    }

    // Paginate to collect all transactions in the period
    const allTransactions: Array<{ date: string; net: number; gross: number }> = []
    let hasMore = true
    let startingAfter: string | undefined = undefined

    while (hasMore) {
      const listParams: any = { ...params, limit: 100 }
      if (startingAfter) listParams.starting_after = startingAfter

      const result = await stripe.balanceTransactions.list(listParams, {
        stripeAccount: stripeAccountId,
      })

      for (const tx of result.data) {
        const date = new Date(tx.created * 1000)
        const dateKey = date.toISOString().split("T")[0] // YYYY-MM-DD
        allTransactions.push({
          date: dateKey,
          net: tx.net,     // after Stripe fee
          gross: tx.amount, // before Stripe fee (includes platform fee withheld)
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

    // Build sorted date series — fill in zero days for continuous chart
    let startDate: Date
    const endDate = new Date()

    if (isAllTime && allTransactions.length > 0) {
      const earliest = allTransactions.map((t) => t.date).sort()[0]
      startDate = new Date(earliest)
    } else {
      startDate = new Date()
      startDate.setDate(startDate.getDate() - (isAllTime ? 365 : daysNum) + 1)
    }

    const series: Array<{ date: string; revenue: number; gross: number; count: number }> = []
    const cursor = new Date(startDate)
    cursor.setHours(0, 0, 0, 0)

    while (cursor <= endDate) {
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
      currency: (creator.default_currency || "usd").toLowerCase(),
    })
  } catch (error: any) {
    console.error("[Revenue Chart Error]", error)
    return NextResponse.json({ error: error.message || "Failed to fetch revenue data" }, { status: 500 })
  }
}
