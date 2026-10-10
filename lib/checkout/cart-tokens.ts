/**
 * The receipt token and session fingerprint of a basket's lines, derived from
 * the Checkout Session rather than drawn at random, so the buyer's return and
 * Stripe's webhook write the same values and the orders table's UNIQUE
 * receipt token turns a race into "already there" (lib/checkout/fulfil-cart-session).
 * An HMAC with a server secret: repeatable here, unguessable anywhere else.
 */
import { createHmac } from "node:crypto"
import { nanoid } from "nanoid"

/** Unguessable and repeatable: the same basket line always gets the same token. */
function derived(kind: string, sessionId: string, index = 0): string {
  const secret = process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) return nanoid(32)
  return createHmac("sha256", secret).update(`${kind}:${sessionId}:${index}`).digest("base64url").slice(0, 32)
}

export const cartReceiptToken = (sessionId: string, index: number) => derived("cart-receipt", sessionId, index)
export const cartFingerprint = (sessionId: string) => derived("cart-session", sessionId)

/** A buyer's private link to their case about an order (lib/support/cases-server.ts): the same for every email about it, and only its hash is stored. */
export const orderCaseSecret = (caseId: string) => derived("order-case", caseId)
