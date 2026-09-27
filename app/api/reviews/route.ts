import { type NextRequest, NextResponse, after } from "next/server"
import { revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkReviewEligibility } from "@/lib/reviews/eligibility"
import { resolveSellerEmail, sendReviewNotificationEmail } from "@/lib/email"
import { productTag } from "@/lib/commerce/product-page-cache"
import { canDeliver, isUuid } from "@/lib/receipts/rules"

const MAX_REVIEW_CHARS = 1000
const ALREADY_REVIEWED = "You already reviewed this product."

// GET - Fetch reviews for a product
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  const creatorId = searchParams.get("creatorId")
  const limit = Number.parseInt(searchParams.get("limit") || "10")
  const offset = Number.parseInt(searchParams.get("offset") || "0")

  if (!productId && !creatorId) {
    return NextResponse.json({ error: "productId or creatorId required" }, { status: 400 })
  }

  const admin = createAdminClient()

  let query = admin
    .from("reviews")
    .select(`
      *,
      buyer:profiles!buyer_id(id, display_name, avatar_url)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (productId) {
    query = query.eq("product_id", productId)
  } else if (creatorId) {
    query = query.eq("creator_id", creatorId)
  }

  const { data: reviews, error } = await query

  if (error) {
    console.error("[v0] Error fetching reviews:", error)
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }

  // Get total count
  let countQuery = admin.from("reviews").select("id", { count: "exact", head: true })
  if (productId) {
    countQuery = countQuery.eq("product_id", productId)
  } else if (creatorId) {
    countQuery = countQuery.eq("creator_id", creatorId)
  }

  const { count } = await countQuery

  return NextResponse.json({
    reviews: reviews || [],
    total: count || 0,
    hasMore: offset + limit < (count || 0),
  }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
  })
}

// POST - Create a new review
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  /* What arrives is whatever a browser sent: shape is checked, not trusted. */
  let body: { productId?: unknown; rating?: unknown; content?: unknown; orderId?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  const productId = typeof body.productId === "string" ? body.productId : ""
  const rating = Number(body.rating)
  const content = typeof body.content === "string" ? body.content.trim() : ""
  const orderId = isUuid(body.orderId) ? body.orderId : null

  if (!isUuid(productId) || !body.rating || !content) {
    return NextResponse.json({ error: "productId, rating, and content are required" }, { status: 400 })
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Rating must be between 1 and 5" }, { status: 400 })
  }

  if (content.length < 10) {
    return NextResponse.json({ error: "Review must be at least 10 characters" }, { status: 400 })
  }
  if (content.length > MAX_REVIEW_CHARS) {
    return NextResponse.json({ error: `Keep the review under ${MAX_REVIEW_CHARS} characters` }, { status: 400 })
  }

  /*
    BEFORE the purchase check, because a creator CAN hold an entitlement to
    their own product and would otherwise pass it. See lib/reviews/eligibility
    for what counts as connected to the seller and what this cannot see.
  */
  const eligibility = await checkReviewEligibility(admin, {
    productId,
    userId: user.id,
    email: user.email,
  })
  if (!eligibility.ok) {
    /* The code, never the address or the account it was matched against:
       telling somebody WHICH signal caught them is a map for the next go. */
    console.warn("[reviews] refused", { productId, code: eligibility.code })
    return NextResponse.json({ error: eligibility.message }, { status: 403 })
  }

  /*
    Bought it. `limit(1)`, never `.single()`: somebody who bought the product
    twice holds two entitlements, and `.single()` answers an error for two
    rows, which read as "you must purchase this product" to a paying buyer.
  */
  const { data: entitlement } = await admin
    .from("entitlements")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle()

  if (!entitlement) {
    return NextResponse.json({ error: "You must purchase this product to leave a review" }, { status: 403 })
  }

  /* And still has it: an entitlement outlives a refund (the download route
     reads the order for that), so a buyer whose every order for this product
     was refunded, failed or disputed has nothing to review. An entitlement
     with no order behind it (a creator's grant) is left as it was. */
  const { data: ownOrders } = await admin.from("orders").select("*").eq("buyer_id", user.id).eq("product_id", productId)
  if (Array.isArray(ownOrders) && ownOrders.length > 0 && !ownOrders.some((o: any) => canDeliver(o))) {
    return NextResponse.json({ error: "Only a completed purchase can be reviewed." }, { status: 403 })
  }

  /* One review per buyer per product. A second one is refused, plainly;
     the receipt shows the first instead of the form (/api/reviews/check). */
  const { data: existingReview } = await admin
    .from("reviews")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle()

  if (existingReview) {
    return NextResponse.json({ error: ALREADY_REVIEWED, alreadyReviewed: true }, { status: 409 })
  }

  // Get product with creator info (including user_id for notifications)
  const { data: product } = await admin
    .from("products")
    .select("id, title, slug, creator_id, creator:creators!inner(id, user_id)")
    .eq("id", productId)
    .single()

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  // Get reviewer's profile for display name
  const { data: reviewerProfile } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single()

  const reviewerName = reviewerProfile?.display_name || reviewerProfile?.username || "A customer"

  // Create the review
  const { data: review, error } = await admin
    .from("reviews")
    .insert({
      product_id: productId,
      creator_id: product.creator_id,
      buyer_id: user.id,
      /* Only an order of this buyer's for this product; any other id is dropped. */
      order_id: orderId && Array.isArray(ownOrders) && ownOrders.some((o: any) => o.id === orderId) ? orderId : null,
      rating,
      content,
    })
    .select(`
      *,
      buyer:profiles!buyer_id(id, display_name, avatar_url)
    `)
    .single()

  if (error) {
    /* Two presses at once both passed the check above; the unique index
       (run-now part 47) lets one in and refuses the other. */
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: ALREADY_REVIEWED, alreadyReviewed: true }, { status: 409 })
    }
    console.error("[reviews] Error creating review:", error.message)
    return NextResponse.json({ error: "The review did not save. Try again." }, { status: 500 })
  }

  console.log("[reviews] ✅ Review created successfully:", review.id)

  /*
    THE PRODUCT PAGE'S REVIEWS ARE SHARED BETWEEN VISITORS NOW
    (lib/commerce/product-page-cache.ts), so a review that is written and then
    not there when the buyer looks is the same bug as a save that appears to
    do nothing. The tag clears it immediately; the sixty-second backstop is
    only there for the paths that forget, and this one does not.
  */
  revalidateTag(productTag(productId), "max")
  /* The product row itself (its review count) is cached under its slug. */
  if (product.slug) revalidateTag(productTag(product.slug), "max")

  // Create notification and send email to seller (don't block response on this)
  const creatorUserId = (product.creator as any)?.user_id
  if (creatorUserId) {
    try {
      // Get seller email
      const sellerEmail = await resolveSellerEmail(admin, product.creator_id)
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

      // Create in-app notification
      const notificationData = {
        creator_id: product.creator_id,
        user_id: creatorUserId,
        type: "new_review",
        title: `New ${rating} star review on ${product.title}`,
        message: `${reviewerName}: “${content.trim().replace(/\s+/g, " ").slice(0, 120)}”`,
        action_url: `/p/${product.slug}#testimonials`,
        product_id: product.id,
        review_id: review.id,
        metadata: {
          reviewer_name: reviewerName,
          rating,
          content_preview: content.trim().substring(0, 100),
        },
      }

      const { error: notifError } = await admin
        .from("seller_notifications")
        .insert(notificationData)

      if (notifError) {
        console.error("[reviews] Failed to create notification:", notifError)
      } else {
        console.log("[reviews] ✅ Notification created for seller")
        /* The creator's first review is a milestone: that row becomes it, and pushes (lib/notifications/events.ts). */
        const reviewCreatorId = product.creator_id as string
        after(async () => (await import("@/lib/notifications/events")).noteReview(reviewCreatorId))
      }

      // Send email notification (async, don't wait)
      sendReviewNotificationEmail(admin, {
        sellerEmail,
        creatorId: product.creator_id,
        productTitle: product.title,
        productSlug: product.slug,
        reviewerName,
        reviewRating: rating,
        reviewContent: content.trim(),
        baseUrl,
      })
        .then((result) => {
          if (result.success) {
            // Update notification with email sent status
            admin
              .from("seller_notifications")
              .update({ email_sent_at: new Date().toISOString() })
              .eq("review_id", review.id)
              .then(() => console.log("[reviews] ✅ Email sent to seller"))
          } else {
            // Update notification with email error
            admin
              .from("seller_notifications")
              .update({ email_error: result.error })
              .eq("review_id", review.id)
              .then(() => console.log("[reviews] ❌ Email failed:", result.error))
          }
        })
        .catch((err) => {
          console.error("[reviews] Email sending error:", err)
        })
    } catch (notifyErr) {
      console.error("[reviews] Error in notification flow:", notifyErr)
      // Don't fail the review creation if notification fails
    }
  }

  return NextResponse.json({ review })
}
