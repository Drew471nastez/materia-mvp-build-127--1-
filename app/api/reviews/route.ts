import { type NextRequest, NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkGuestReviewEligibility, checkReviewEligibility } from "@/lib/reviews/eligibility"
import { resolveSellerEmail, sendReviewNotificationEmail } from "@/lib/email"
import { canDeliver, isUuid } from "@/lib/receipts/rules"
import { checkReviewInput, guestReviewerName } from "@/lib/reviews/rules"
import { readPublishedReviews, refreshReviewStats, missingColumn } from "@/lib/reviews/store"
import { accountForOrder, existingReview, orderByReceipt } from "@/lib/reviews/access"
import { loadReviewsApp } from "@/lib/reviews/app-server"
import { initialStatus } from "@/lib/reviews/app-settings"

const ALREADY_REVIEWED = "You already reviewed this product."

/**
 * ===========================================================================
 *  REVIEWS: READ THE PUBLISHED ONES, WRITE ONE
 * ===========================================================================
 *   GET    ?productId= or ?creatorId=   published reviews, newest first, with
 *                                       the count. A hidden (reported) one is
 *                                       never listed (lib/reviews/store).
 *   POST   { productId, rating, content, orderId? }   as a signed in buyer
 *          { receiptToken, rating, content }           from a receipt link,
 *                                       signed in or not: the token proves
 *                                       the purchase, as it does for downloads
 *
 * Changing or deleting your review is /api/reviews/<id>; the seller's reply
 * and report are /api/reviews/<id>/reply and /report.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const productId = searchParams.get("productId")
  const creatorId = searchParams.get("creatorId")
  const limit = Number.parseInt(searchParams.get("limit") || "10")
  const offset = Number.parseInt(searchParams.get("offset") || "0")

  if (!productId && !creatorId) {
    return NextResponse.json({ error: "productId or creatorId required" }, { status: 400 })
  }

  try {
    const { reviews, total } = await readPublishedReviews(createAdminClient(), { productId, creatorId }, { limit, offset })
    return NextResponse.json(
      { reviews, total, hasMore: offset + reviews.length < total },
      { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } },
    )
  } catch (error) {
    console.error("[reviews] read failed:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Failed to fetch reviews" }, { status: 500 })
  }
}

type Body = { productId?: unknown; rating?: unknown; content?: unknown; orderId?: unknown; receiptToken?: unknown }

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  /* What arrives is whatever a browser sent: shape is checked, not trusted. */
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400 })

  if (body.receiptToken !== undefined && body.receiptToken !== null) return postFromReceipt(admin, user, body)

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const productId = typeof body.productId === "string" ? body.productId : ""
  const orderId = isUuid(body.orderId) ? body.orderId : null
  const input = checkReviewInput(body)
  if (!isUuid(productId)) return NextResponse.json({ error: "productId, rating, and content are required" }, { status: 400 })
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  const { rating, content } = input

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
  const { data: existingByBuyer } = await admin
    .from("reviews")
    .select("id")
    .eq("buyer_id", user.id)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle()

  if (existingByBuyer) {
    return NextResponse.json({ error: ALREADY_REVIEWED, alreadyReviewed: true }, { status: 409 })
  }

  /* Only an order of this buyer's for this product; any other id is dropped. */
  const linkedOrder = orderId && Array.isArray(ownOrders) && ownOrders.some((o: any) => o.id === orderId) ? orderId : null
  return save(admin, { productId, buyerId: user.id, orderId: linkedOrder, reviewerName: null, rating, content })
}

/**
 * FROM A RECEIPT LINK. The token is the order's own credential; whoever
 * holds it is the buyer as far as the receipt page goes, and so for the
 * review too. The review goes on the order's account when it has one (or
 * on the signed in person's, when the guest order was bought with their
 * address); otherwise it is a guest's, named with the first name they
 * bought with.
 */
async function postFromReceipt(admin: ReturnType<typeof createAdminClient>, user: { id: string; email?: string | null } | null, body: Body) {
  const order = await orderByReceipt(admin, body.receiptToken)
  if (!order) return NextResponse.json({ error: "This receipt link does not work." }, { status: 404 })
  const productId = order.product_id
  if (typeof body.productId === "string" && body.productId && body.productId !== productId) {
    return NextResponse.json({ error: "That product is not on this receipt." }, { status: 400 })
  }
  const input = checkReviewInput(body)
  if (!input.ok) return NextResponse.json({ error: input.error }, { status: 400 })
  if (!canDeliver(order)) return NextResponse.json({ error: "Only a completed purchase can be reviewed." }, { status: 403 })

  const buyerId = accountForOrder(order, user)
  const eligibility = buyerId
    ? await checkReviewEligibility(admin, { productId, userId: buyerId, email: order.buyer_email })
    : await checkGuestReviewEligibility(admin, { productId, email: order.buyer_email })
  if (!eligibility.ok) {
    console.warn("[reviews] refused", { productId, code: eligibility.code, via: "receipt" })
    return NextResponse.json({ error: eligibility.message }, { status: 403 })
  }

  if (await existingReview(admin, { productId, buyerId, order })) {
    return NextResponse.json({ error: ALREADY_REVIEWED, alreadyReviewed: true }, { status: 409 })
  }
  return save(admin, {
    productId,
    buyerId,
    orderId: order.id,
    reviewerName: buyerId ? null : guestReviewerName(order.buyer_first_name),
    rating: input.rating,
    content: input.content,
  })
}

async function save(
  admin: ReturnType<typeof createAdminClient>,
  r: { productId: string; buyerId: string | null; orderId: string | null; reviewerName: string | null; rating: number; content: string },
) {
  const { data: product } = await admin
    .from("products")
    .select("id, title, slug, creator_id, creator:creators!inner(id, user_id)")
    .eq("id", r.productId)
    .single()

  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 })
  }

  /* Storelib Reviews on with approval (lib/reviews/app-settings): a review from the receipt or the library waits like one from the app's own link. */
  const app = await loadReviewsApp(admin, product.creator_id).catch(() => null)
  const status = app?.settings.enabled ? initialStatus(app.settings, r.rating) : "published"
  const row: Record<string, unknown> = {
    product_id: r.productId,
    creator_id: product.creator_id,
    buyer_id: r.buyerId,
    order_id: r.orderId,
    rating: r.rating,
    content: r.content,
    status,
  }
  if (r.reviewerName) row.reviewer_name = r.reviewerName

  const insert = (values: Record<string, unknown>) =>
    admin.from("reviews").insert(values).select(`*, buyer:profiles!buyer_id(id, display_name, avatar_url)`).single()
  let { data: review, error } = await insert(row)
  /* Run-now part 52 not run: no status or reviewer_name column. An account's review saves without them. */
  if (error && missingColumn(error) && r.buyerId) {
    delete row.reviewer_name
    delete row.status
    ;({ data: review, error } = await insert(row))
  }

  if (error || !review) {
    /* Two presses at once both passed the check above; the unique index
       (run-now part 48) lets one in and refuses the other. */
    if ((error as { code?: string } | null)?.code === "23505") {
      return NextResponse.json({ error: ALREADY_REVIEWED, alreadyReviewed: true }, { status: 409 })
    }
    /* A guest's review before run-now part 52: buyer_id is still required there. */
    if (!r.buyerId && (missingColumn(error) || (error as { code?: string } | null)?.code === "23502")) {
      return NextResponse.json({ error: "Sign in to post your review.", needsAccount: true }, { status: 403 })
    }
    console.error("[reviews] Error creating review:", error?.message)
    return NextResponse.json({ error: "The review did not save. Try again." }, { status: 500 })
  }

  console.log("[reviews] review created:", review.id)

  /*
    THE PRODUCT PAGE'S REVIEWS ARE SHARED BETWEEN VISITORS
    (lib/commerce/product-page-cache.ts), so a review that is written and then
    not there when the buyer looks is the same bug as a save that appears to
    do nothing. The ratings are counted again from published reviews and the
    page's cache dropped, product and creator both (lib/reviews/store).
  */
  await refreshReviewStats(admin, { productId: r.productId, creatorId: product.creator_id, productSlug: product.slug })

  const reviewerProfile = r.buyerId
    ? (await admin.from("profiles").select("display_name, username").eq("id", r.buyerId).single()).data
    : null
  const reviewerName = reviewerProfile?.display_name || reviewerProfile?.username || r.reviewerName || "A customer"
  await tellSeller(admin, { product, review, reviewerName, rating: r.rating, content: r.content })

  return NextResponse.json({ review })
}

/** The bell and an email to the seller, pointing at the review in their Reviews list. Never fails the review. */
async function tellSeller(
  admin: ReturnType<typeof createAdminClient>,
  { product, review, reviewerName, rating, content }: { product: any; review: any; reviewerName: string; rating: number; content: string },
) {
  const creatorUserId = (Array.isArray(product.creator) ? product.creator[0] : product.creator)?.user_id
  if (!creatorUserId) return
  try {
    const sellerEmail = await resolveSellerEmail(admin, product.creator_id)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://storelib.com"

    const { error: notifError } = await admin.from("seller_notifications").insert({
      creator_id: product.creator_id,
      user_id: creatorUserId,
      type: "new_review",
      title: `New ${rating} star review on ${product.title}`,
      message: `${reviewerName}: “${content.trim().replace(/\s+/g, " ").slice(0, 120)}”`,
      /* Where the seller can read it whole and answer it. */
      action_url: `/app/reviews?review=${review.id}`,
      product_id: product.id,
      review_id: review.id,
      metadata: {
        reviewer_name: reviewerName,
        rating,
        content_preview: content.trim().substring(0, 100),
      },
    })

    if (notifError) {
      console.error("[reviews] Failed to create notification:", notifError.message)
    } else {
      /* The creator's first review is a milestone: that row becomes it, and pushes (lib/notifications/events.ts). */
      const reviewCreatorId = product.creator_id as string
      after(async () => (await import("@/lib/notifications/events")).noteReview(reviewCreatorId))
    }

    sendReviewNotificationEmail(admin, {
      sellerEmail,
      creatorId: product.creator_id,
      productTitle: product.title,
      productSlug: product.slug,
      reviewerName,
      reviewRating: rating,
      reviewContent: content.trim(),
      baseUrl,
      reviewId: review.id,
    })
      .then((result) => {
        const update = result.success ? { email_sent_at: new Date().toISOString() } : { email_error: result.error }
        return admin.from("seller_notifications").update(update).eq("review_id", review.id)
      })
      .catch((err: unknown) => console.error("[reviews] Email sending error:", err instanceof Error ? err.message : err))
  } catch (notifyErr) {
    console.error("[reviews] Error in notification flow:", notifyErr instanceof Error ? notifyErr.message : notifyErr)
  }
}
