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
import { createHash } from "node:crypto"
import { stableJson } from "@/lib/stripe/resilience"
import { attemptIdFrom } from "./checkout-attempts"
import { cartFingerprint, cartReceiptToken, freeBasketSessionId, freeClaimReceiptToken } from "./cart-tokens"

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

/*
 * ===========================================================================
 *  A FREE BASKET PRESSED AGAIN IS THE SAME BASKET (round AX)
 * ===========================================================================
 * A basket a code makes free (app/api/checkout/cart, the website's checkout
 * app/api/checkout/site "free") is written by fulfilFreeCart under a session
 * id of its own, which names every line's receipt token (./cart-tokens
 * cartReceiptToken). That id was drawn at random on every press, so a press
 * whose answer was lost and was pressed again wrote a second basket: a second
 * receipt, a second sale notice, the automations twice, a one use code used
 * twice (or "used up" for the buyer's own order), limited copies taken twice.
 *
 * Now the page sends its press's attempt id, and the session id is derived
 * from it with the store, the buyer's email and what was sent in the basket
 * (an HMAC with a server secret). The same press sent again names the same
 * basket: the route finds its first line and answers it before a code's place
 * or a copy is asked for again; two sends in flight at once meet at the orders
 * table's unique receipt tokens, line by line (writeBasket), and only one of
 * them does what is done once per basket. Without an attempt id, or a secret
 * to derive with, the id is random, exactly as before.
 */

/** Bigger than any real basket's JSON: past it the press is not named (a random basket, as before). */
const MAX_BASKET_JSON = 200_000

/** The session id this press writes its free basket under, or null: no attempt id, no email, no lines, no secret. */
export function freeBasketSession(attempt: unknown, parts: { store: string; email: unknown; items: unknown }): string | null {
  const id = attemptIdFrom(attempt)
  const email = typeof parts.email === "string" ? parts.email.trim().toLowerCase() : ""
  if (!id || !email || !Array.isArray(parts.items) || parts.items.length === 0) return null
  let contents: string
  try {
    contents = stableJson(parts.items)
  } catch {
    return null
  }
  if (contents.length > MAX_BASKET_JSON) return null
  return freeBasketSessionId(id, parts.store, email, createHash("sha256").update(contents).digest("hex"))
}

/** What fulfilFreeCart accepts as a named basket: `free_` and the derived id. */
export function isFreeBasketSession(value: unknown): value is string {
  return typeof value === "string" && /^free_[A-Za-z0-9_-]{16,64}$/.test(value)
}

export interface ClaimedBasket {
  receiptToken: string
  sessionFingerprint: string
  /** The store of its first line's product, when it could be read. */
  creatorId: string | null
}

/** The basket an earlier send of this same press already wrote (its first line), or null. Never throws: unread is "none". */
export async function claimedBasket(db: Db, sessionId: string | null): Promise<ClaimedBasket | null> {
  if (!isFreeBasketSession(sessionId)) return null
  try {
    const token = cartReceiptToken(sessionId, 0)
    const { data, error } = await db.from("orders").select("id, receipt_token, stripe_session_id, product_id").eq("receipt_token", token).limit(1)
    if (error || !Array.isArray(data)) return null
    const row = data[0] as { receipt_token?: string; stripe_session_id?: string | null; product_id?: string | null } | undefined
    if (!row || row.receipt_token !== token || row.stripe_session_id !== sessionId) return null
    let creatorId: string | null = null
    if (row.product_id) {
      const { data: product } = await db.from("products").select("creator_id").eq("id", row.product_id).maybeSingle()
      creatorId = typeof product?.creator_id === "string" ? product.creator_id : null
    }
    return { receiptToken: token, sessionFingerprint: cartFingerprint(sessionId), creatorId }
  } catch {
    return null
  }
}
