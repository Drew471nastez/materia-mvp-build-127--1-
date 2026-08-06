import { sendPushToUser } from "./sender"

/**
 * Push notification builders for Storelib seller events.
 * Call these from webhook handlers, Stripe listeners, payout jobs, etc.
 */

// Chat messages live in lib/push/message-notification.ts (every decision) and
// lib/push/message-db.ts (the queries behind them). They are not here because
// a chat push has to be deduplicated, grouped, counted and preference-checked,
// and none of that belongs in a file of one-line payload builders.

// ── Sale ─────────────────────────────────────────────────────────────────────

interface SaleOptions {
  productName: string
  /** Amount in cents */
  amountCents: number
  orderId: string
  productId: string
}

export async function notifySale(userId: string, opts: SaleOptions): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(opts.amountCents / 100)

  await sendPushToUser(userId, {
    title: "🎉 You made a sale!",
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

  await sendPushToUser(userId, {
    title: "Payout available",
    body: `${amount} is ready to cash out`,
    data: {
      type: "payout_available",
    },
  })
}
