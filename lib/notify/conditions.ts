/**
 * ===========================================================================
 *  IS IT STILL TRUE, RIGHT NOW
 * ===========================================================================
 * A reminder planned three days ago asks the database again immediately
 * before it sends. Each condition reads fresh rows through the store; what
 * was true when the job was planned does not count.
 *
 *   true      still true: send
 *   false     no longer true: the job is skipped, CONDITION_NO_LONGER_TRUE
 *   null      could not be read: the job waits and asks again later
 *
 * "Still failing" conditions for something the database has no row for (a
 * payout Storelib never recorded) answer true: a critical notice is not
 * dropped because a row is missing.
 */
import { reviewRequestBlock } from "@/lib/reviews/request-rules"
import type { NotifyStore, ProductFact } from "./store"
import type { ConditionName } from "./types"

export interface ConditionJob {
  creator_id: string | null
  entity_id: string | null
  data: Record<string, unknown>
  /** The workflow step ("review_1", "review_2"), for a condition that depends on which one this is. */
  step?: string | null
}

const live = (p: ProductFact) => !p.archived && p.status !== "deleted"
const isDraft = (p: ProductFact) => live(p) && (p.status === "draft" || p.status === "unpublished" || p.status === null)
const isReady = (p: ProductFact) => isDraft(p) && !!p.title && p.title.trim().length > 0 && p.hasFile

/** True when there is such a product, and its id and title go to the email. */
function named(product: ProductFact | undefined, facts?: Record<string, unknown>): boolean {
  if (!product) return false
  if (facts) {
    facts.productId = product.id
    if (product.title && product.title.trim()) facts.productTitle = product.title.trim().slice(0, 200)
  }
  return true
}

export const CONDITION_NAMES: readonly ConditionName[] = [
  "no_product_yet",
  "has_unfinished_draft",
  "has_ready_unpublished_product",
  "payment_setup_incomplete",
  "payment_setup_action_required",
  "payout_still_failed",
  "dispute_still_open",
  "domain_still_failing",
  "review_still_wanted",
]

export function isConditionName(v: unknown): v is ConditionName {
  return typeof v === "string" && (CONDITION_NAMES as readonly string[]).includes(v)
}

/**
 * `facts`, when given, receives what the email needs from the rows just read:
 * the draft a "finish" or "publish" reminder is about (productId,
 * productTitle), so the reminder names the product as it is now.
 */
export async function checkCondition(store: NotifyStore, name: ConditionName, job: ConditionJob, facts?: Record<string, unknown>, now: number = Date.now()): Promise<boolean | null> {
  const creatorId = job.creator_id
  const entityId = job.entity_id
  switch (name) {
    case "no_product_yet": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      return products.filter(live).length === 0
    }
    case "has_unfinished_draft": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      if (products.some((p) => live(p) && p.status === "published")) return false
      return named(products.find((p) => isDraft(p) && !isReady(p)), facts)
    }
    case "has_ready_unpublished_product": {
      if (!creatorId) return false
      const products = await store.products(creatorId)
      if (!products) return null
      if (products.some((p) => live(p) && p.status === "published")) return false
      return named(products.find(isReady), facts)
    }
    case "payment_setup_incomplete": {
      if (!creatorId) return false
      const p = await store.payments(creatorId)
      if (!p) return null
      const complete = p.status === "connected" || (p.chargesEnabled && p.payoutsEnabled && p.detailsSubmitted)
      return !complete
    }
    case "payment_setup_action_required": {
      if (!creatorId) return false
      const p = await store.payments(creatorId)
      if (!p) return null
      return !!p.stripeAccountId && !(p.chargesEnabled && p.payoutsEnabled)
    }
    case "payout_still_failed": {
      const id = entityId ?? (typeof job.data.payoutId === "string" ? job.data.payoutId : null)
      if (!id) return true
      const status = await store.payoutStatus(id)
      if (status === null) return null
      if (status === undefined) return true
      return status === "failed" || status === "canceled"
    }
    case "dispute_still_open": {
      const id = entityId ?? (typeof job.data.disputeId === "string" ? job.data.disputeId : null)
      if (!id) return true
      const closed = await store.disputeClosed(id)
      if (closed === null) return null
      return !closed
    }
    case "domain_still_failing": {
      if (!entityId) return true
      const d = await store.domainStatus(entityId)
      if (d === null) return null
      if (d === undefined) return false
      return d.status === "failed" || d.sslStatus === "failed"
    }
    case "review_still_wanted": {
      /* Every rule is in lib/reviews/request-rules: Storelib order, still theirs, not reviewed, not the seller, not unsubscribed, due. */
      if (!entityId) return false
      const f = await store.reviewRequestFacts(entityId)
      if (!f) return null
      const block = reviewRequestBlock(f, job.step === "review_2" ? "reminder" : "request", now)
      if (block) {
        if (facts) facts.reviewSkipped = block
        return false
      }
      if (facts) {
        facts.productId = f.product?.id ?? null
        if (f.product?.title) facts.productTitle = f.product.title.trim().slice(0, 200)
        facts.receiptToken = f.order?.receipt_token ?? null
        if (f.creatorName) facts.creatorName = f.creatorName.slice(0, 80)
        facts.orderId = f.order?.id ?? null
      }
      return true
    }
    default:
      return true
  }
}
