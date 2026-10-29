import { sendPushToUser, type PushResult } from "./sender"
import { moneyText, saleText } from "./sale-text"

/**
 * Push notification builders for Storelib seller events.
 * Call these from webhook handlers, Stripe listeners, payout jobs, etc.
 */

// ── Sale ─────────────────────────────────────────────────────────────────────

export interface SaleOptions {
  productName: string
  /** Amount in the currency's minor units */
  amountCents: number
  /** The currency it was paid in. Without it the push names no amount rather than guessing one. */
  currency?: string | null
  orderId: string
  productId: string
  /** Other items bought with it, in one basket: "You sold Mug and 2 more". */
  more?: number
  /** A sale that is not an order (a community program or module): the page inside /app a tap opens. */
  url?: string
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

export async function notifySale(userId: string, opts: SaleOptions): Promise<PushResult> {
  const milestone = opts.amountCents > 0 ? await milestoneTitle(userId) : null
  return sendPushToUser(userId, {
    ...saleText(opts, milestone),
    data: opts.url ? { type: "notification", kind: "sale", url: opts.url } : { type: "sale", orderId: opts.orderId, productId: opts.productId },
    sound: "cash",
    /* The same order told twice (two paths, one retry) replaces itself on the phone instead of stacking. */
    collapseKey: `sale:${opts.orderId}`,
  })
}

// ── Payout available ──────────────────────────────────────────────────────────

export async function notifyPayoutAvailable(userId: string, amountCents: number): Promise<PushResult> {
  /* The wallet's balance, in the wallet's own currency (lib/payments/ledger-currency), never dollars by default. */
  const { ledgerCurrency } = await import("@/lib/payments/ledger-currency")
  const amount = moneyText(amountCents, ledgerCurrency())

  return sendPushToUser(userId, {
    title: "Payout available",
    body: amount ? `${amount} is ready to cash out` : "Money is ready to cash out",
    data: {
      type: "payout_available",
    },
  })
}
