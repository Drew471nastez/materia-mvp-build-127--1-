import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkReviewEligibility } from "@/lib/reviews/eligibility"
import { canDeliver } from "@/lib/receipts/rules"

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

  /*
    The same question the write endpoint asks, from the same place, so the
    form is never offered for something that would then be refused.
  */
  const eligibility = await checkReviewEligibility(admin, {
    productId,
    userId: user.id,
    email: user.email,
  })
  if (!eligibility.ok) {
    return NextResponse.json({
      canReview: false,
      hasReviewed: false,
      isLoggedIn: true,
      hasPurchased: false,
      isOwnProduct: eligibility.code === "own_product",
      blockedReason: eligibility.code,
    })
  }

  /* The same purchase question the write endpoint asks (app/api/reviews):
     an entitlement, `limit(1)` because a second purchase is a second row,
     and at least one order for it that was not refunded, when there are any. */
  const [{ data: entitlement }, { data: ownOrders }] = await Promise.all([
    admin.from("entitlements").select("id").eq("buyer_id", user.id).eq("product_id", productId).limit(1).maybeSingle(),
    admin.from("orders").select("*").eq("buyer_id", user.id).eq("product_id", productId),
  ])

  const hasPurchased =
    !!entitlement && !(Array.isArray(ownOrders) && ownOrders.length > 0 && !ownOrders.some((o: any) => canDeliver(o)))

  // Check if user already reviewed
  const { data: existingReview } = await admin
    .from("reviews")
    .select("id, rating, content, created_at")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle()

  const hasReviewed = !!existingReview

  return NextResponse.json({
    canReview: hasPurchased && !hasReviewed,
    hasReviewed,
    isLoggedIn: true,
    hasPurchased,
    existingReview: existingReview || null,
  })
}
