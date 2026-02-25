import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const productId = searchParams.get("productId")

    if (!productId) {
      return NextResponse.json({ error: "Product ID is required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get star breakdown
    const { data: reviews, error } = await supabase.from("reviews").select("rating").eq("product_id", productId)

    if (error) {
      console.error("Error fetching reviews breakdown:", error)
      return NextResponse.json({ error: "Failed to fetch reviews breakdown" }, { status: 500 })
    }

    // Calculate breakdown
    const breakdown = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    }

    reviews?.forEach((review) => {
      const rating = review.rating as 1 | 2 | 3 | 4 | 5
      if (rating >= 1 && rating <= 5) {
        breakdown[rating]++
      }
    })

    return NextResponse.json({ breakdown }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    })
  } catch (error) {
    console.error("Error in reviews breakdown API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
