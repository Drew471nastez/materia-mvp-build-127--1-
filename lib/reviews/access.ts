import "server-only"

/**
 * ===========================================================================
 *  WHOSE REVIEW IS THIS, AND WHO IS ASKING
 * ===========================================================================
 * Two ways to prove a review is yours, the same two the downloads take:
 *
 *   an account     the signed in user is the review's buyer_id
 *   a receipt      the receipt token of the order the review is on. A guest
 *                  who bought without an account reviews, edits and deletes
 *                  from the link in their email, and never has to sign in.
 *
 * And one way to be the seller: the signed in user owns the creator the
 * review's product belongs to. A seller answers and reports; they never
 * edit or delete a buyer's words.
 */
import { canDeliver, isPlausibleToken, isUuid } from "@/lib/receipts/rules"
import { missingColumn } from "./store"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface OrderRow {
  id: string
  product_id: string
  buyer_id: string | null
  buyer_email: string | null
  buyer_first_name?: string | null
  status?: string | null
  amount_cents?: number | null
  refund_amount_cents?: number | null
  receipt_token?: string | null
  created_at?: string | null
}

export interface ReviewRow {
  id: string
  product_id: string
  creator_id: string
  buyer_id: string | null
  order_id: string | null
  rating: number
  content: string
  created_at: string
  edited_at?: string | null
  status?: string | null
  reviewer_name?: string | null
  seller_reply?: string | null
  seller_reply_at?: string | null
}

/** The order a receipt token names, or null for a token that is not one. */
export async function orderByReceipt(db: Db, token: unknown): Promise<OrderRow | null> {
  if (!isPlausibleToken(token)) return null
  const { data } = await db.from("orders").select("*").eq("receipt_token", token).limit(1).maybeSingle()
  return (data as OrderRow | null) ?? null
}

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "")

/**
 * The account a receipt's review belongs to: the order's own buyer, or the
 * signed in person when the order is a guest's and was bought with their
 * verified address. Null for a guest.
 */
export function accountForOrder(order: OrderRow, user: { id: string; email?: string | null } | null): string | null {
  if (order.buyer_id) return order.buyer_id
  if (user && lower(user.email) && lower(user.email) === lower(order.buyer_email)) return user.id
  return null
}

/**
 * The review this buyer already wrote of this product, if any: on this
 * order, by their account, or on another order of theirs for the same
 * product bought with the same address. One review a buyer and product.
 */
export async function existingReview(
  db: Db,
  { productId, buyerId, order }: { productId: string; buyerId: string | null; order: OrderRow | null },
): Promise<ReviewRow | null> {
  if (buyerId) {
    const { data } = await db.from("reviews").select("*").eq("buyer_id", buyerId).eq("product_id", productId).limit(1).maybeSingle()
    if (data) return data as ReviewRow
  }
  if (!order) return null
  const orderIds = new Set<string>([order.id])
  const email = lower(order.buyer_email)
  if (email) {
    const { data: same } = await db.from("orders").select("id").eq("buyer_email", email).eq("product_id", productId)
    for (const o of (same ?? []) as { id: string }[]) orderIds.add(o.id)
  }
  const { data } = await db.from("reviews").select("*").in("order_id", [...orderIds]).limit(1).maybeSingle()
  return (data as ReviewRow | null) ?? null
}

export type Proof = { user: { id: string; email?: string | null } | null; receiptToken?: unknown }

export type OwnResult = { ok: true; review: ReviewRow; order: OrderRow | null } | { ok: false; status: number; error: string }

/** The review, when the person asking wrote it. */
export async function ownReview(db: Db, reviewId: unknown, proof: Proof): Promise<OwnResult> {
  if (!isUuid(reviewId)) return { ok: false, status: 404, error: "That review is not there any more." }
  const { data } = await db.from("reviews").select("*").eq("id", reviewId).maybeSingle()
  const review = data as ReviewRow | null
  if (!review) return { ok: false, status: 404, error: "That review is not there any more." }
  if (proof.user && review.buyer_id && review.buyer_id === proof.user.id) return { ok: true, review, order: null }
  if (proof.receiptToken) {
    const order = await orderByReceipt(db, proof.receiptToken)
    if (order && review.order_id === order.id) return { ok: true, review, order }
    if (order && review.product_id === order.product_id && lower(order.buyer_email)) {
      /* A review written from another order of theirs for the same product, by the same address. */
      const { data: mine } = await db.from("orders").select("id").eq("buyer_email", lower(order.buyer_email)).eq("product_id", order.product_id)
      if (((mine ?? []) as { id: string }[]).some((o) => o.id === review.order_id)) return { ok: true, review, order }
    }
  }
  if (!proof.user && !proof.receiptToken) return { ok: false, status: 401, error: "Sign in to change your review." }
  return { ok: false, status: 403, error: "Only the person who wrote a review can change it." }
}

export type SellerResult =
  | { ok: true; review: ReviewRow; product: { id: string; title: string | null; slug: string | null } }
  | { ok: false; status: number; error: string }

/** The review, when the signed in person sells the product it is about. */
/** `teamStore`: round 41, the store a team member with Products works in (lib/team/server teamStoreIdFor); its reviews are theirs to answer too. */
export async function sellersReview(db: Db, reviewId: unknown, userId: string | null, teamStore: string | null = null): Promise<SellerResult> {
  if (!userId) return { ok: false, status: 401, error: "Sign in to answer reviews." }
  if (!isUuid(reviewId)) return { ok: false, status: 404, error: "That review is not there any more." }
  const { data } = await db.from("reviews").select("*").eq("id", reviewId).maybeSingle()
  const review = data as ReviewRow | null
  if (!review) return { ok: false, status: 404, error: "That review is not there any more." }
  const [{ data: creator }, { data: product }] = await Promise.all([
    db.from("creators").select("id, user_id").eq("id", review.creator_id).maybeSingle(),
    db.from("products").select("id, title, slug, creator_id").eq("id", review.product_id).maybeSingle(),
  ])
  if (!creator || (creator.user_id !== userId && !(teamStore && creator.id === teamStore))) return { ok: false, status: 403, error: "Only the seller can do that." }
  return { ok: true, review, product: { id: review.product_id, title: product?.title ?? null, slug: product?.slug ?? null } }
}

/** Whether an order still lets its buyer review (paid, or free, and not refunded, failed or disputed). */
export const orderStillReviewable = (order: OrderRow) => canDeliver(order)

/**
 * Write, and when run-now part 52 has not run yet (a column it adds is missing), try
 * again without those columns. The caller says which fields are the new ones.
 */
export async function writeWithFallback<T>(
  attempt: (withNew: boolean) => PromiseLike<{ data: T | null; error: { code?: string | null; message?: string | null } | null }>,
): Promise<{ data: T | null; error: { code?: string | null; message?: string | null } | null; old: boolean }> {
  const first = await attempt(true)
  if (first.error && missingColumn(first.error)) return { ...(await attempt(false)), old: true }
  return { ...first, old: false }
}
