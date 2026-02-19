import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { stripe } from "@/lib/stripe"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: creator } = await admin
      .from("creators")
      .select("id,user_id,stripe_account_id")
      .eq("user_id", user.id)
      .single()

    if (!creator?.stripe_account_id) {
      return NextResponse.json({ points: [], currency: null })
    }

    const tf = request.nextUrl.searchParams.get("timeframe") || "30d"
    const now = Math.floor(Date.now() / 1000)
    const startMap: Record<string, number> = {
      "7d": now - 7 * 24 * 60 * 60,
      "30d": now - 30 * 24 * 60 * 60,
      "90d": now - 90 * 24 * 60 * 60,
      "all": 0,
    }
    const start = startMap[tf] ?? startMap["30d"]

    const txs = await stripe.balanceTransactions.list(
      { limit: 100, ...(start > 0 ? { created: { gte: start } } : {}) },
      { stripeAccount: creator.stripe_account_id }
    )

    const chargeTx = txs.data.filter((t) => t.amount > 0 && (t.type === "charge" || t.reporting_category === "charge"))
    const currency = chargeTx[0]?.currency || null

    const map = new Map<string, number>()
    for (const t of chargeTx) {
      const dateKey = new Date(t.created * 1000).toISOString().slice(0, 10)
      map.set(dateKey, (map.get(dateKey) || 0) + t.amount)
    }

    const points = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }))

    return NextResponse.json({ points, currency })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to load revenue" }, { status: 500 })
  }
}
