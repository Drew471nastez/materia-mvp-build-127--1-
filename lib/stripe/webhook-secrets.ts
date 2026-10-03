import type Stripe from "stripe"

/**
 * ===========================================================================
 *  WHICH SECRET MAY SIGN WHICH EVENT
 * ===========================================================================
 * Stripe signs each webhook destination with its own secret:
 *
 *   "Your account" (Storelib's platform events: checkout, payment intents,
 *   charges, refunds, disputes, Storelib Pro subscriptions, invoices)
 *       → STRIPE_WEBHOOK_SECRET, and the event has no `account`.
 *
 *   "Connected accounts" (a creator's account.updated, their payouts, and
 *   anything else that happens on their connected account)
 *       → STRIPE_CONNECT_WEBHOOK_SECRET, and the event names the `account`.
 *
 * /api/stripe/webhook used to try both secrets on every event and accept the
 * first that verified, so an event of either kind was taken under either
 * secret. Both secrets are Storelib's own, so that was never a forgery hole,
 * but it was looser than Stripe's own model, and it meant nothing ever
 * noticed a destination pointed at the wrong place. Now a secret is only
 * good for its own kind of event:
 *
 *   verified by the platform secret, and the event names no account   → ok
 *   verified by the Connect secret, and the event names an account    → ok
 *   verified, but by the other kind's secret                          → refused
 *   verified by neither                                               → refused
 *
 * This still works wherever the Connect destination's URL points (here, or
 * /api/stripe/webhook/connect), which is why both secrets are still tried:
 * only the pairing is checked now. Nothing unsigned is ever accepted, and
 * the tolerance for a signature's age is Stripe's default.
 *
 * Pure, with Stripe's own constructEvent passed in, so tests verify real
 * signatures made by Stripe's test helper rather than a stub.
 */
export type SignedBy = "platform" | "connect"

export type VerifiedEvent = { ok: true; event: Stripe.Event; signedBy: SignedBy }
export type RefusedEvent = { ok: false; reason: "no_secret" | "invalid_signature" | "wrong_destination" }

type Construct = (body: string, signature: string, secret: string) => Stripe.Event

export function verifyStripeEvent(
  body: string,
  signature: string,
  secrets: { platform?: string | null; connect?: string | null },
  construct: Construct,
): VerifiedEvent | RefusedEvent {
  const platform = secrets.platform?.trim() || null
  const connect = secrets.connect?.trim() || null
  if (!platform && !connect) return { ok: false, reason: "no_secret" }

  const tryWith = (secret: string | null): Stripe.Event | null => {
    if (!secret) return null
    try {
      return construct(body, signature, secret)
    } catch {
      return null
    }
  }

  const asPlatform = tryWith(platform)
  if (asPlatform) return asPlatform.account ? { ok: false, reason: "wrong_destination" } : { ok: true, event: asPlatform, signedBy: "platform" }

  const asConnect = tryWith(connect)
  if (asConnect) return asConnect.account ? { ok: true, event: asConnect, signedBy: "connect" } : { ok: false, reason: "wrong_destination" }

  return { ok: false, reason: "invalid_signature" }
}
