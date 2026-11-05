import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Get review stats for a product
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")

  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: product } = await admin
    .from("products")
    .select("reviews_count, reviews_average")
    .eq("id", productId)
    .single()

  if (!product) {
    return NextResponse.json({
      reviewsCount: 0,
      reviewsAverage: 0,
    })
  }

  return NextResponse.json({
    reviewsCount: product.reviews_count || 0,
    reviewsAverage: product.reviews_average || 0,
  }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=86400" },
  })
}
