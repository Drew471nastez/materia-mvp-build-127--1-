import "server-only"

/**
 * ===========================================================================
 *  A CHECKOUT PAID ON AIRWALLEX
 * ===========================================================================
 * The checkout route prices the order, holds the code, builds the metadata
 * and decides Storelib's fee exactly as it does for Stripe
 * (app/api/checkout/stripe-session). Only the last step differs, and it is
 * here:
 *
 *   startAirwallexCheckout  the payment intent, owned by Storelib ("collect
 *                           payments directly"), naming the creator's
 *                           account and splitting their share to it once it
 *                           succeeds; and the fee record, written before the
 *                           buyer is sent to pay, so the split is on record
 *                           whatever happens next.
 *
 *   paidAirwallexCheckout   a payment intent that SUCCEEDED, read back from
 *                           Airwallex (never from the browser's word), as
 *                           the neutral record lib/checkout/fulfil-payment
 *                           makes the order from.
 *
 * The buyer pays on Airwallex's hosted payment page: card numbers never touch
 * Storelib.
 */

import { airwallex, AirwallexError } from "./airwallex/client"
import { readAirwallexConfig } from "./airwallex/config"
import { createPaymentIntent, retrievePaymentIntent, type AwxPaymentIntent } from "./airwallex/resources"
import { toMinor } from "./money"
import { createAdminClient } from "@/lib/supabase/admin"

export interface StartedCheckout {
  intentId: string
  clientSecret: string
  currency: string
  amountMinor: number
  /** Airwallex.js's environment name for the hosted page. */
  env: "sandbox" | "prod"
}

export async function startAirwallexCheckout(input: {
  checkoutId: string
  creatorId: string
  accountId: string
  amountMinor: number
  currency: string
  platformFeeMinor: number
  metadata: Record<string, string>
  returnUrl?: string
  descriptor?: string
}): Promise<StartedCheckout> {
  const cfg = readAirwallexConfig()
  if (cfg.ok === false) throw new Error(cfg.reason)
  const fee = Math.max(0, Math.min(input.platformFeeMinor, input.amountMinor))
  const share = input.amountMinor - fee
  const intent = await createPaymentIntent(airwallex(), {
    orderId: input.checkoutId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    accountId: input.accountId,
    creatorShareMinor: share,
    returnUrl: input.returnUrl,
    descriptor: input.descriptor,
    metadata: input.metadata,
  })
  if (!intent.client_secret) throw new AirwallexError(502, "no_client_secret", null)

  /* The split, on record before the buyer leaves for the payment page. */
  const { error } = await createAdminClient()
    .from("payment_fee_records")
    .upsert(
      {
        provider: "airwallex",
        provider_payment_id: intent.id,
        checkout_id: input.checkoutId,
        creator_id: input.creatorId,
        currency: input.currency.toUpperCase(),
        gross_minor: input.amountMinor,
        platform_fee_minor: fee,
        creator_share_minor: share,
        status: "pending",
      },
      { onConflict: "provider,provider_payment_id" },
    )
  if (error) console.error("[payments] fee record not written", intent.id, error.code)

  return {
    intentId: intent.id,
    clientSecret: intent.client_secret,
    currency: input.currency.toUpperCase(),
    amountMinor: input.amountMinor,
    env: cfg.config.env === "production" ? "prod" : "sandbox",
  }
}

/** The fields a checkout put on the payment, as strings. */
export async function airwallexPaymentMetadata(intentId: string): Promise<Record<string, string> | null> {
  const pi = await retrievePaymentIntent(airwallex(), intentId)
  return stringMap(pi.metadata)
}

function stringMap(m: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!m || typeof m !== "object") return out
  for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = String(v)
  }
  return out
}

/** What lib/checkout/fulfil-payment needs from any provider's paid checkout. */
export interface PaidCheckout {
  provider: "stripe" | "airwallex"
  paymentId: string
  amountMinor: number
  currency: string
  metadata: Record<string, string>
  receiptEmail: string | null
  /** When the payment was made, seconds since 1970. */
  createdSeconds: number
  facts: {
    paymentMethod: string
    cardBrand: string | null
    cardLast4: string | null
    paypalEmail: string | null
    applicationFeeCents: number | null
    transferId: string | null
    destinationPaymentId: string | null
  }
}

export type LoadedCheckout = { ok: true; paid: PaidCheckout; clientSecret: string | null } | { ok: false; status: number; error: string }

/**
 * A SUCCEEDED Airwallex payment intent, as Airwallex says it is. Airwallex
 * unreachable is a 503 (the webhook then answers so Airwallex tries again);
 * an unknown id is a 400.
 */
export async function paidAirwallexCheckout(intentId: string): Promise<LoadedCheckout> {
  if (typeof intentId !== "string" || !/^int_[A-Za-z0-9_-]+$/.test(intentId)) return { ok: false, status: 400, error: "Missing payment." }
  let pi: AwxPaymentIntent
  try {
    pi = await retrievePaymentIntent(airwallex(), intentId)
  } catch (e) {
    if (e instanceof AirwallexError && (e.status === 404 || e.status === 400)) return { ok: false, status: 400, error: "That payment could not be found." }
    return { ok: false, status: 503, error: "The payment could not be checked just now. It is safe; try again in a moment." }
  }
  if ((pi.status ?? "").toUpperCase() !== "SUCCEEDED") return { ok: false, status: 400, error: "The payment has not completed." }
  const currency = (pi.currency ?? "USD").toUpperCase()
  const pm = pi.latest_payment_attempt?.payment_method ?? null
  const metadata = stringMap(pi.metadata)
  const fee = Number.parseInt(metadata.platform_fee_cents || "", 10)
  const created = pi.created_at ? Date.parse(pi.created_at.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN
  return {
    ok: true,
    clientSecret: pi.client_secret ?? null,
    paid: {
      provider: "airwallex",
      paymentId: pi.id,
      amountMinor: toMinor(pi.captured_amount ?? pi.amount ?? 0, currency),
      currency,
      metadata,
      receiptEmail: pi.customer?.email ?? null,
      createdSeconds: Number.isFinite(created) ? Math.floor(created / 1000) : Math.floor(Date.now() / 1000),
      facts: {
        paymentMethod: (pm?.type || "card").toLowerCase(),
        cardBrand: pm?.card?.brand ?? null,
        cardLast4: pm?.card?.last4 ?? null,
        paypalEmail: null,
        applicationFeeCents: Number.isFinite(fee) ? fee : null,
        transferId: null,
        destinationPaymentId: null,
      },
    },
  }
}

/** The fee record follows the payment: succeeded, refunded, disputed. */
export async function markFeeRecord(intentId: string, patch: { status?: string; refundedMinor?: number; clawedBackMinor?: number }): Promise<void> {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.status) update.status = patch.status
  if (typeof patch.refundedMinor === "number") update.refunded_minor = patch.refundedMinor
  if (typeof patch.clawedBackMinor === "number") update.clawed_back_minor = patch.clawedBackMinor
  await createAdminClient().from("payment_fee_records").update(update).eq("provider", "airwallex").eq("provider_payment_id", intentId)
}
