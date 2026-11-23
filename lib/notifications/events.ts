import "server-only"

/**
 * ===========================================================================
 *  THE MOMENTS THAT SHOULD NOT WAIT FOR THE HOURLY RUN
 * ===========================================================================
 * Each is called from where the thing happened, after it has been written,
 * and runs the planner for that one creator and the rules the event can
 * change. None of them throws, none of them takes long (EVENT_BUDGET_MS),
 * and before the engine's SQL has run none of them writes anything.
 *
 *   saleMilestone        lib/push/notifications notifySale, on every sale:
 *                        a sale that is the 1st, 10th or 100th pushes as
 *                        that milestone instead of a second push beside it
 *   noteStripeAccount    account.updated: payouts or card payments off,
 *                        Stripe asking for details by a deadline, a live
 *                        product that cannot be paid for, and back
 *   notePayout           payout.* : a failed payout, and the one after it
 *   noteDispute          charge.dispute.*: opened, and closed
 *   noteReview           a review written: the first one is a milestone
 */
import { createAdminClient } from "@/lib/supabase/admin"
import { evaluateCreator, type ApplyResult } from "./engine"
import { storelibPusher } from "./push-sender"
import { firstReview, SALES_THRESHOLDS, salesMilestone } from "./rules/milestones"
import { disputeOpened, payoutFailed, payoutsNotConnected, stripeRequirementsDue, stripeRestricted } from "./rules/payments"
import { supabaseSnapshots } from "./snapshot"
import { supabaseNotificationStore } from "./supabase-store"
import type { Rule, StripeAccountFacts } from "./types"
import { reviewPush, type ReviewPushInput } from "@/lib/reviews/review-push"

export const EVENT_BUDGET_MS = 2_500
/** The sale's own push waits for this at most: it is on the way to the buyer's receipt. */
export const SALE_BUDGET_MS = 1_200

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve(null)
      },
    )
  })
}

async function run(creatorId: string, rules: readonly Rule[], extra: { stripeAccount?: StripeAccountFacts; pushInline?: boolean; budgetMs?: number } = {}): Promise<ApplyResult | null> {
  if (!creatorId) return null
  try {
    const db = createAdminClient()
    return await within(
      evaluateCreator({
        store: supabaseNotificationStore(db),
        source: supabaseSnapshots(db),
        pusher: storelibPusher,
        creatorId,
        rules,
        context: extra.stripeAccount ? { stripeAccount: extra.stripeAccount } : undefined,
        pushInline: extra.pushInline,
      }),
      extra.budgetMs ?? EVENT_BUDGET_MS,
    )
  } catch {
    return null
  }
}

/**
 * The milestone this sale reached, if it is news: its push title, for the
 * sale's own push to say instead of "You made a sale!". The milestone's row
 * is marked pushed, so the hourly run does not push it again.
 */
export async function saleMilestone(input: { userId: string }): Promise<{ title: string } | null> {
  try {
    const db = createAdminClient()
    const { data: creator } = await db.from("creators").select("id").eq("user_id", input.userId).maybeSingle()
    if (!creator?.id) return null
    /* A creator past every sales milestone (most, soon) costs one more read, not a snapshot. */
    const { data: said, error } = await db.from("seller_notifications").select("subject_id").eq("creator_id", creator.id).eq("kind", "sales_milestone")
    if (error) return null
    const recorded = new Set(((said ?? []) as Array<{ subject_id: string | null }>).map((r) => r.subject_id))
    if (SALES_THRESHOLDS.every((n) => recorded.has(`sales_${n}`))) return null
    const result = await run(creator.id as string, [salesMilestone], { pushInline: false, budgetMs: SALE_BUDGET_MS })
    const reached = (result?.inserted ?? []).filter((x) => x.row.kind === "sales_milestone" && !x.row.baseline).map((x) => x.row)
    if (reached.length === 0) return null
    const top = reached.sort((a, b) => Number(b.data.sales ?? 0) - Number(a.data.sales ?? 0))[0]
    return { title: top.pushTitle ?? top.title }
  } catch {
    return null
  }
}

/** Stripe's account object, as the rules read it. */
export function stripeAccountFacts(account: {
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  capabilities?: object | null
  requirements?: { currently_due?: string[] | null; past_due?: string[] | null; current_deadline?: number | null; disabled_reason?: string | null } | null
}): StripeAccountFacts {
  const r = account.requirements ?? {}
  /*
   * "Can buyers pay you", in Storelib's charge model: a sale is a destination
   * charge, so the account must be able to receive the transfer
   * (lib/payments/stripe/readiness). A seller in another country than the
   * platform has a transfers-only account whose charges_enabled is false for
   * good, and was told "Stripe turned off card payments" forever.
   */
  const transfers = (account.capabilities as Record<string, unknown> | null | undefined)?.transfers
  return {
    chargesEnabled: typeof transfers === "string" ? transfers === "active" : account.charges_enabled === true,
    payoutsEnabled: account.payouts_enabled === true,
    currentlyDue: Array.isArray(r.currently_due) ? r.currently_due.filter((x) => typeof x === "string") : [],
    pastDue: Array.isArray(r.past_due) ? r.past_due.filter((x) => typeof x === "string") : [],
    currentDeadline: typeof r.current_deadline === "number" ? r.current_deadline : null,
    disabledReason: typeof r.disabled_reason === "string" ? r.disabled_reason : null,
  }
}

/* payouts_not_connected is asked too, so "Connect Stripe to get paid" resolves the moment the account is switched on, not an hour later. */
export async function noteStripeAccount(creatorId: string, account: Parameters<typeof stripeAccountFacts>[0]): Promise<void> {
  await run(creatorId, [stripeRestricted, stripeRequirementsDue, payoutsNotConnected], { stripeAccount: stripeAccountFacts(account) })
}

export async function notePayout(creatorId: string): Promise<void> {
  await run(creatorId, [payoutFailed])
}

export async function noteDispute(creatorId: string): Promise<void> {
  await run(creatorId, [disputeOpened])
}

/**
 * A review the seller was just told about in the bell. With the review
 * (r57), the seller's phone hears it once: the first review takes the
 * milestone's title and the milestone row is marked pushed, so the hourly
 * run does not push it again (as a sale's milestone does).
 */
export async function noteReview(creatorId: string, review?: ReviewPushInput): Promise<void> {
  if (!review) {
    await run(creatorId, [firstReview])
    return
  }
  const result = await run(creatorId, [firstReview], { pushInline: false })
  const first = (result?.inserted ?? []).some((x) => x.row.kind === "first_review" && !x.row.baseline)
  try {
    const { sendPushToUser } = await import("@/lib/push/sender")
    await sendPushToUser(review.userId, reviewPush(review, first))
  } catch {
    /* The review and its bell row stand; a push is a courtesy. */
  }
}
