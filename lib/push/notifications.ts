import { sendPushToUser } from "./sender"

/**
 * Push notification builders for Storelib seller events.
 * Call these from webhook handlers, Stripe listeners, payout jobs, etc.
 */

// ── Sale ─────────────────────────────────────────────────────────────────────

interface SaleOptions {
  productName: string
  /** Amount in cents */
  amountCents: number
  orderId: string
  productId: string
}

/**
 * A sale that is also a milestone (the 1st, 10th or 100th) is one push, not
 * two: the sale's push takes the milestone's title, and the milestone's row
 * is marked pushed so the hourly run does not push it again
 * (lib/notifications/events.ts saleMilestone). Before the notification SQL
 * has run there is no milestone and the push reads as it always did.
 */
async function milestoneTitle(userId: string): Promise<string | null> {
  try {
    const { saleMilestone } = await import("@/lib/notifications/events")
    return (await saleMilestone({ userId }))?.title ?? null
  } catch {
    return null
  }
}

export async function notifySale(userId: string, opts: SaleOptions): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(opts.amountCents / 100)

  const milestone = await milestoneTitle(userId)

  return sendPushToUser(userId, {
    title: milestone ?? "🎉 You made a sale!",
    body: `You sold ${opts.productName} for ${amount}`,
    data: {
      type: "sale",
      orderId: opts.orderId,
      productId: opts.productId,
    },
    sound: "cash",
  })
}

// ── Payout available ──────────────────────────────────────────────────────────

export async function notifyPayoutAvailable(userId: string, amountCents: number): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amountCents / 100)

  return sendPushToUser(userId, {
    title: "Payout available",
    body: `${amount} is ready to cash out`,
    data: {
      type: "payout_available",
    },
  })
}
