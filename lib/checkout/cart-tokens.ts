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
function tokenSecret(): string | undefined {
  return process.env.RECEIPT_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || undefined
}

function derived(kind: string, sessionId: string, index = 0): string {
  const secret = tokenSecret()
  if (!secret) return nanoid(32)
  return createHmac("sha256", secret).update(`${kind}:${sessionId}:${index}`).digest("base64url").slice(0, 32)
}

export const cartReceiptToken = (sessionId: string, index: number) => derived("cart-receipt", sessionId, index)
export const cartFingerprint = (sessionId: string) => derived("cart-session", sessionId)

/** A buyer's private link to their case about an order (lib/support/cases-server.ts): the same for every email about it, and only its hash is stored. */
export const orderCaseSecret = (caseId: string) => derived("order-case", caseId)

/** A free claim's receipt token for one press of the page (lib/checkout/free-claim.ts): the same press sent again names the same order. */
export const freeClaimReceiptToken = (attemptId: string, productId: string, variantId: string | null, email: string) =>
  derived("free-claim", `${attemptId}:${productId}:${variantId ?? ""}:${email.trim().toLowerCase()}`)

/**
 * A basket a code made free, named for one press of the page (lib/checkout/free-claim.ts freeBasketSession):
 * the same press sent again names the same basket, so its lines' receipt tokens are the ones already written.
 * null without a secret to derive with: the basket gets a random session id, as before.
 */
export function freeBasketSessionId(attemptId: string, store: string, email: string, contentsHash: string): string | null {
  if (!tokenSecret()) return null
  return `free_${derived("free-basket", `${attemptId}:${store}:${email.trim().toLowerCase()}:${contentsHash}`)}`
}
