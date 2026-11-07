import { moneyCaller } from "@/lib/team/money"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { byCreator, ownRows, scopedOrders } from "@/lib/analytics/creator-orders"
import { displayEmail } from "@/lib/businesses/email-alias"

const TAX_SUMMARY_PAGE = 1_000
const TAX_SUMMARY_MAX_ROWS = 200_000

/**
 * GET /api/stripe/tax-summary?year=2025
 *
 * Generates a draft earnings summary for sellers who don't meet the
 * federal 1099-K threshold ($20K + 200 transactions). This is NOT an
 * official tax document — it's a convenience export sellers can share
 * with their tax professional.
 *
 * Returns a JSON summary (the client renders it as a downloadable PDF-like view).
 */
export async function GET(request: Request) {
  try {
    const adminSupabase = createAdminClient()

    /* The owner, or a team member who may see the store's payouts (round 42, lib/team/money): the store's own Stripe account, never the member's. */
    const who = await moneyCaller("payouts", "view", { read: true })
    if (!who.ok) return who.response

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear() - 1), 10)

    // Validate year range
    if (year < 2020 || year > new Date().getFullYear()) {
      return NextResponse.json({ error: "Invalid year" }, { status: 400 })
    }

    const { data: creator } = await adminSupabase
      .from("creators")
      .select("id, user_id")
      .eq("id", who.creatorId)
      .single()

    if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

    // Get profile for name
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", who.ownerUserId)
      .single()

    // Fetch all products
    const { data: products } = await adminSupabase
      .from("products")
      .select("id, title")
      .eq("creator_id", creator.id)

    const productIds = (products || []).map((p) => p.id)
    const productMap = new Map((products || []).map((p) => [p.id, p.title]))

    if (productIds.length === 0) {
      return NextResponse.json({
        year,
        sellerName: profile?.display_name || "Seller",
        sellerEmail: displayEmail(profile?.email) || "",
        grossEarnings: 0,
        platformFees: 0,
        netEarnings: 0,
        refunds: 0,
        transactionCount: 0,
        monthlyBreakdown: [],
        productBreakdown: [],
        generatedAt: new Date().toISOString(),
        disclaimer: "This is NOT an official tax document. It is a draft earnings summary for informational purposes only. Consult a tax professional for filing guidance.",
      })
    }

    // Fetch all orders for the year
    const startDate = `${year}-01-01T00:00:00Z`
    const endDate = `${year + 1}-01-01T00:00:00Z`

    /*
      EVERY ORDER OF THE YEAR, A PAGE AT A TIME. One read stops at 1,000 rows, so a store past its thousandth
      order of the year was summarised from the first thousand; and an .in() of every product id grows the
      address with the catalogue. Read by the order's creator (by its product on a database without the column,
      lib/analytics/creator-orders), 1,000 rows a page, in a stable order. A page that fails fails the summary
      rather than leaving sales out of a tax figure.
    */
    const orders = await byCreator(async (scope) => {
      const out: Array<Record<string, unknown>> = []
      for (let from = 0; from < TAX_SUMMARY_MAX_ROWS; from += TAX_SUMMARY_PAGE) {
        const { data, error } = await scopedOrders(adminSupabase, "id, amount_cents, fee_cents, created_at, status, product_id, refund_amount_cents, currency", scope, creator.id, null)
          .in("status", ["completed", "refunded", "disputed"])
          .gte("created_at", startDate)
          .lt("created_at", endDate)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + TAX_SUMMARY_PAGE - 1)
        if (error) throw new Error(`orders read failed: ${error.message}`)
        const rows = ownRows((data ?? []) as Array<Record<string, unknown>>)
        out.push(...rows)
        if (rows.length < TAX_SUMMARY_PAGE) return out
      }
      throw new Error(`more than ${TAX_SUMMARY_MAX_ROWS} orders in ${year}: summary not made from part of them`)
    })

    /*
      IN US DOLLARS. A 1099-K summary is an American form with a dollar line,
      so each sale is converted at its own day's ECB rate (lib/money/
      report-currency), never its lei or euro cents read as cents of a
      dollar. A sale no rate converts is counted in `unconverted`, its money
      left out rather than guessed.
    */
    const usd = await inStoreCurrency(adminSupabase, creator.id, (orders || []) as Array<{ amount_cents: number | null; fee_cents: number | null; created_at: string; status: string; product_id: string; refund_amount_cents: number | null; currency: string | null }>, "USD")
    const allOrders = usd.rows

    // Aggregate totals
    let grossEarnings = 0
    let platformFees = 0
    let refunds = 0
    let transactionCount = 0

    // Monthly breakdown
    const monthly: Record<string, { gross: number; fees: number; refunds: number; count: number }> = {}
    // Product breakdown
    const byProduct: Record<string, { gross: number; fees: number; count: number }> = {}

    for (const order of allOrders) {
      const month = new Date(order.created_at).toISOString().slice(0, 7) // "2025-01"
      if (!monthly[month]) monthly[month] = { gross: 0, fees: 0, refunds: 0, count: 0 }
      if (!byProduct[order.product_id]) byProduct[order.product_id] = { gross: 0, fees: 0, count: 0 }

      const amount = order.amount_cents || 0
      const fee = order.fee_cents || 0

      grossEarnings += amount
      platformFees += fee
      transactionCount += 1
      monthly[month].gross += amount
      monthly[month].fees += fee
      monthly[month].count += 1
      byProduct[order.product_id].gross += amount
      byProduct[order.product_id].fees += fee
      byProduct[order.product_id].count += 1

      if (order.status === "refunded") {
        const refundAmt = order.refund_amount_cents || amount
        refunds += refundAmt
        monthly[month].refunds += refundAmt
      }
    }

    const netEarnings = grossEarnings - platformFees - refunds

    // Format monthly breakdown
    const monthlyBreakdown = Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month,
        monthLabel: new Date(month + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        grossCents: data.gross,
        feesCents: data.fees,
        refundsCents: data.refunds,
        netCents: data.gross - data.fees - data.refunds,
        transactionCount: data.count,
      }))

    // Format product breakdown
    const productBreakdown = Object.entries(byProduct)
      .sort(([, a], [, b]) => b.gross - a.gross)
      .map(([productId, data]) => ({
        productId,
        productName: productMap.get(productId) || "Unknown Product",
        grossCents: data.gross,
        feesCents: data.fees,
        netCents: data.gross - data.fees,
        transactionCount: data.count,
      }))

    /* Every sale is a transaction, converted or not. */
    transactionCount += usd.unconverted
    const isEligible = grossEarnings >= 2000000 && transactionCount >= 200

    return NextResponse.json({
      year,
      sellerName: profile?.display_name || "Seller",
      sellerEmail: displayEmail(profile?.email) || "",
      grossEarnings,
      platformFees,
      netEarnings,
      refunds,
      transactionCount,
      isEligible,
      currency: "usd",
      unconverted: usd.unconverted,
      monthlyBreakdown,
      productBreakdown,
      generatedAt: new Date().toISOString(),
      disclaimer: "This is NOT an official tax document. It is a draft earnings summary for informational purposes only. Consult a tax professional for filing guidance.",
    })
  } catch (error: any) {
    console.error("[Tax Summary Error]", error)
    return NextResponse.json({ error: error.message || "Failed to generate tax summary" }, { status: 500 })
  }
}
