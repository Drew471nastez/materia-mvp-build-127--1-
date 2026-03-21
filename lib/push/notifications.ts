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

export async function notifySale(userId: string, opts: SaleOptions): Promise<void> {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(opts.amountCents / 100)

  return sendPushToUser(userId, {
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

  return sendPushToUser(userId, {
    title: "Payout available",
    body: `${amount} is ready to cash out`,
    data: {
      type: "payout_available",
    },
  })
}
