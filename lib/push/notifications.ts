import { sendPushToUser } from "./sender"
import { formatMinor } from "@/lib/markets/money"

/**
 * Push notification builders for Storelib seller events.
 * Call these from webhook handlers, Stripe listeners, payout jobs, etc.
 */

/** "$12.40" or "49.00 lei" in the amount's own currency, or "" when the currency is unknown: never a guessed one. */
function moneyText(minor: number, currency: string | null | undefined): string {
  const code = typeof currency === "string" && /^[a-z]{3}$/i.test(currency.trim()) ? currency.trim().toUpperCase() : null
  if (!code || !Number.isFinite(minor)) return ""
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code })
  } catch {
    return ""
  }
  /* "25.00 lei", as Orders writes the same sale (lib/markets/money formatMinor). */
  return formatMinor(minor, code, "en-US")
}

// ── Sale ─────────────────────────────────────────────────────────────────────

interface SaleOptions {
  productName: string
  /** Amount in the currency's minor units */
  amountCents: number
  /** The currency it was paid in. Without it the push names no amount rather than guessing one. */
  currency?: string | null
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
  const amount = moneyText(opts.amountCents, opts.currency)

  const milestone = await milestoneTitle(userId)

  return sendPushToUser(userId, {
    title: milestone ?? "🎉 You made a sale!",
    body: amount && opts.amountCents > 0 ? `You sold ${opts.productName} for ${amount}` : `You sold ${opts.productName}`,
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
