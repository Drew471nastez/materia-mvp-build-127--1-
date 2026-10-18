/**
 * STRIPE KEEPS AT MOST 50 METADATA KEYS ON A PAYMENT, and refuses the whole
 * payment when there are more. Every checkout that writes its own metadata
 * runs it through `fitStripeMetadata` just before Stripe, so the limit is
 * checked in one place instead of trusted to each route's arithmetic.
 *
 * Over the limit, only the buyer's device (type, system, browser) may be
 * left out: those three are for the order page's "Device" line and nothing
 * else reads them as money or access. Every other key is the order's record
 * (price, fee, tax, code, items, the business on the invoice) and is never
 * dropped. If the payment still does not fit, the checkout is refused before
 * anything is charged, rather than charged and recorded without its record.
 */
import { checkoutMsg } from "@/lib/markets/checkout-words"

export const STRIPE_METADATA_LIMIT = 50

/** Left out last-in-first, and only when the payment would not fit otherwise. */
export const DROPPABLE_METADATA_KEYS = ["buyer_browser", "buyer_os", "buyer_device_type"] as const

export type FittedMetadata = { ok: true; metadata: Record<string, string>; dropped: string[] } | { ok: false; count: number }

export function fitStripeMetadata(metadata: Record<string, string>, limit = STRIPE_METADATA_LIMIT): FittedMetadata {
  const out = { ...metadata }
  const dropped: string[] = []
  for (const key of DROPPABLE_METADATA_KEYS) {
    if (Object.keys(out).length <= limit) break
    if (key in out) {
      delete out[key]
      dropped.push(key)
    }
  }
  const count = Object.keys(out).length
  return count <= limit ? { ok: true, metadata: out, dropped } : { ok: false, count }
}

/** What the buyer reads when a payment cannot carry its record (it should not happen with today's keys). */
export const METADATA_TOO_LARGE_MESSAGE = checkoutMsg("This order is too large to pay in one go. Remove an item and try again.")
