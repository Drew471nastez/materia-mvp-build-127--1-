import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { starBreakdown } from "@/lib/reviews/store"

/** How many published reviews gave each number of stars (the bars under a product's rating). */
export async function GET(request: NextRequest) {
  const productId = request.nextUrl.searchParams.get("productId")
  if (!productId) {
    return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
  }
  const summary = await starBreakdown(createAdminClient(), productId)
  if (!summary) {
    return NextResponse.json({ error: "Failed to fetch reviews breakdown" }, { status: 500 })
  }
  return NextResponse.json(
    { breakdown: summary.stars, count: summary.count, average: summary.average },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  )
}
