/**
 * ===========================================================================
 *  A FREE CLAIM PRESSED AGAIN IS THE SAME ORDER (round AW)
 * ===========================================================================
 * The free checkouts (app/api/checkout/process for the checkout page and the
 * instant checkout, app/api/checkout/quick-free for a OnePage's free product)
 * write an order on every press, with a receipt token drawn at random. Their
 * answer comes after the order and its emails, so it is the slowest part of
 * the request, and it can be lost: a phone that drops the connection, the app
 * sent to the background. The page then says "Try again", and the second
 * press wrote a second order: a second receipt to the buyer, a second sale
 * notice to the seller, the buyer entered in the creator's purchase
 * automations a second time, and a code's use and a limited copy counted
 * twice, so a "first 50 free" code lost a place to a buyer who already had it.
 *
 * Now the page names its press with an attempt id (lib/checkout/attempt-id,
 * the one the paid checkout already sends), and the order's receipt token is
 * derived from it with the product, the option and the address
 * (./cart-tokens freeClaimReceiptToken, an HMAC with a server secret). The
 * same press sent again names the same token: the route finds that order
 * first and answers it, without taking a code's place or a copy again, and two
 * presses in flight at once meet at the orders table's unique receipt token
 * (23505), where the second answers the first's order. Only the page that made
 * the press knows its attempt id, so nobody else is handed that receipt.
 *
 * A page that sends no attempt id (one loaded before this) gets a token drawn
 * at random, exactly as before. A server with no secret to derive with does too.
 */
import { attemptIdFrom } from "./checkout-attempts"
import { freeClaimReceiptToken } from "./cart-tokens"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface ClaimedOrder {
  id: string
  receipt_token: string
  session_fingerprint: string | null
  product_id: string | null
}

/** The receipt token this press writes its order under, or null: no attempt id was sent (a fresh token, as before). */
export function freeClaimToken(attempt: unknown, parts: { productId: unknown; variantId?: unknown; email: string }): string | null {
  const id = attemptIdFrom(attempt)
  if (!id || typeof parts.productId !== "string" || !parts.productId || !parts.email) return null
  const variant = typeof parts.variantId === "string" && parts.variantId ? parts.variantId : null
  return freeClaimReceiptToken(id, parts.productId, variant, parts.email)
}

/** The order an earlier send of this same press already wrote, for this product, or null. Never throws: unread is "none". */
export async function claimedOrder(db: Db, token: string | null, productId: unknown): Promise<ClaimedOrder | null> {
  if (!token || typeof productId !== "string") return null
  try {
    const { data, error } = await db.from("orders").select("id, receipt_token, session_fingerprint, product_id").eq("receipt_token", token).limit(1)
    if (error || !Array.isArray(data)) return null
    const row = data[0] as ClaimedOrder | undefined
    return row && row.product_id === productId && row.receipt_token === token ? row : null
  } catch {
    return null
  }
}

/** A unique violation: another send of the same press wrote the order a moment ago. */
export function isClaimRace(error: { code?: unknown } | null | undefined): boolean {
  return String(error?.code ?? "") === "23505"
}
