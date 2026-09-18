import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isOwnProduct } from "@/lib/reviews/own-product"

// Check if user can review a product and if they already have
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")

  if (!productId) {
    return NextResponse.json({ error: "productId required" }, { status: 400 })
  }

  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({
      canReview: false,
      hasReviewed: false,
      isLoggedIn: false,
      hasPurchased: false,
    })
  }

  /* Your own listing. See lib/reviews/own-product. */
  if (await isOwnProduct(admin, productId, user.id)) {
    return NextResponse.json({
      canReview: false,
      hasReviewed: false,
      isLoggedIn: true,
      hasPurchased: false,
      isOwnProduct: true,
    })
  }

  // Check if user has purchased this product
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .single()

  const hasPurchased = !!entitlement

  // Check if user already reviewed
  const { data: existingReview } = await admin
    .from("reviews")
    .select("id, rating, content, created_at")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .single()

  const hasReviewed = !!existingReview

  return NextResponse.json({
    canReview: hasPurchased && !hasReviewed,
    hasReviewed,
    isLoggedIn: true,
    hasPurchased,
    existingReview: existingReview || null,
  })
}
