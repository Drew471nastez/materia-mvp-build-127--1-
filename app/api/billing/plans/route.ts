import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { withCodePrice } from "@/lib/billing/plans"

export async function GET() {
  try {
    const supabase = await createClient()

    // Fetch all active subscription plans
    const { data: plans, error } = await supabase
      .from("subscription_plans")
      .select("*")
      .eq("is_active", true)
      .order("price_cents", { ascending: true })

    if (error) {
      console.error("Error fetching subscription plans:", error)
      return NextResponse.json(
        { error: "Failed to fetch subscription plans" },
        { status: 500 }
      )
    }

    /* At the price checkout charges (lib/billing/plans withCodePrice), whatever the stored row says. */
    return NextResponse.json({ plans: (plans ?? []).map(withCodePrice) }, {
      headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
    })
  } catch (error) {
    console.error("Error in GET /api/billing/plans:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
