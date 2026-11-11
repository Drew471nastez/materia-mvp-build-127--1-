import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkGuestReviewEligibility, checkReviewEligibility } from "@/lib/reviews/eligibility"
import { canDeliver } from "@/lib/receipts/rules"
import { accountForOrder, existingReview, orderByReceipt, type ReviewRow } from "@/lib/reviews/access"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

/**
 * May this person review this product, and have they already?
 *
 *   ?productId=              as the signed in buyer (the library, a receipt
 *                            seen signed in)
 *   ?receiptToken=           from a receipt link: the token proves the
 *                            purchase, so a guest can review without an
 *                            account (the review request email lands here)
 *
 * The same questions the write endpoint asks, from the same places, so the
 * form is never offered for something that would then be refused. Their
 * own review comes back whole, so the card can show it and let them change
 * or delete it.
 */
function own(review: ReviewRow | null) {
  if (!review) return null
  return {
    id: review.id,
    rating: review.rating,
    content: review.content,
    created_at: review.created_at,
    edited_at: review.edited_at ?? null,
    hidden: review.status === "hidden",
    seller_reply: review.seller_reply ?? null,
    seller_reply_at: review.seller_reply_at ?? null,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  const receiptToken = searchParams.get("receiptToken")

  if (!productId && !receiptToken) {
    return NextResponse.json({ error: "productId required" }, { status: 400 })
  }

  const admin = createAdminClient()

  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null

  const order = receiptToken ? await orderByReceipt(admin, receiptToken) : null
  if (order && (!productId || productId === order.product_id)) {
    const buyerId = accountForOrder(order, user ? { id: user.id, email: user.email } : null)
    const eligibility = buyerId
      ? await checkReviewEligibility(admin, { productId: order.product_id, userId: buyerId, email: order.buyer_email })
      : await checkGuestReviewEligibility(admin, { productId: order.product_id, email: order.buyer_email })
    const mine = await existingReview(admin, { productId: order.product_id, buyerId, order })
    const hasPurchased = eligibility.ok && canDeliver(order)
    return NextResponse.json(
      {
        canReview: hasPurchased && !mine,
        hasReviewed: !!mine,
        isLoggedIn: !!user,
        hasPurchased,
        viaReceipt: true,
        isOwnProduct: eligibility.code === "own_product",
        blockedReason: eligibility.ok ? undefined : eligibility.code,
        existingReview: own(mine),
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  }

  if (!user || !productId) {
    return NextResponse.json({
      canReview: false,
      hasReviewed: false,
      isLoggedIn: !!user,
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

  /* Theirs by account, or written from the receipt of one of their orders. */
  const latest = Array.isArray(ownOrders) && ownOrders.length > 0 ? (ownOrders[0] as any) : null
  const mine = await existingReview(admin, { productId, buyerId: user.id, order: latest })

  return NextResponse.json(
    {
      canReview: hasPurchased && !mine,
      hasReviewed: !!mine,
      isLoggedIn: true,
      hasPurchased,
      /* Their newest order's receipt, so a review written as a guest can be changed from here too. */
      receiptToken: latest?.receipt_token ?? null,
      existingReview: own(mine),
    },
    { headers: { "Cache-Control": "no-store" } },
  )
}
