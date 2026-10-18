import "server-only"

/**
 * ===========================================================================
 *  A REFUND OF A SALE PAID ON AIRWALLEX
 * ===========================================================================
 * In "collect payments directly" the payment is Storelib's, so the refund is
 * too: Storelib refunds the buyer from its own payment. The creator's share
 * of that sale was split to their wallet when it succeeded, and Airwallex
 * does not take it back on its own, so the same share of the refund is then
 * charged back from the creator's wallet (the Charges API), exactly what
 * Stripe's `reverse_transfer` does for a Stripe sale. Storelib's fee is not
 * refunded to the creator, the same as on Stripe.
 *
 * ONE REFUND PER SUBMIT. Both calls carry request ids made from the order,
 * what was refunded before and this amount, so a double submit is the same
 * refund and the same charge, never a second of either.
 *
 * The buyer's refund is what matters and it goes first. If the charge back
 * from the creator fails (their wallet is short, say), the refund stands,
 * and the shortfall is recorded for Storelib to settle by hand.
 */

import { airwallex } from "./airwallex/client"
import { chargeCreator, createRefund } from "./airwallex/resources"
import { accountByProviderId, audit, readAccount } from "./store"
import { markFeeRecord } from "./checkout"
import { describe } from "./service"
import { creatorPartOf } from "./model"
import { createAdminClient } from "@/lib/supabase/admin"

export interface AirwallexRefund {
  id: string
  status: string | null
  currency: string
  /** What was taken back from the creator's wallet for it. */
  clawedBackMinor: number
}

export { creatorPartOf } from "./model"

export async function refundAirwallexOrder(r: {
  orderId: string
  creatorId: string
  paymentIntentId: string
  amountMinor: number
  alreadyRefundedMinor: number
  reason: string | null
}): Promise<AirwallexRefund> {
  const key = `${r.orderId}:${r.alreadyRefundedMinor}:${r.amountMinor}`
  const db = createAdminClient()
  const { data: feeRow } = await db
    .from("payment_fee_records")
    .select("currency, gross_minor, creator_share_minor, refunded_minor, clawed_back_minor, creator_id")
    .eq("provider", "airwallex")
    .eq("provider_payment_id", r.paymentIntentId)
    .maybeSingle()
  const fee = feeRow as { currency: string; gross_minor: number; creator_share_minor: number; refunded_minor: number; clawed_back_minor: number; creator_id: string | null } | null
  /* The payment's own currency, from its fee record; without one the refund waits rather than guess. */
  if (!fee?.currency) throw new Error("This payment's currency is not recorded, so the refund was not sent. Contact support.")
  const currency = fee.currency

  const c = airwallex()
  const refund = await createRefund(c, { paymentIntentId: r.paymentIntentId, refundKey: key, amountMinor: r.amountMinor, currency, reason: r.reason ?? undefined })
  await audit({ creatorId: r.creatorId, kind: "refund.created", to: refund.status ?? null, ref: refund.id, actor: "creator" })

  let clawed = 0
  const part = fee ? creatorPartOf(r.amountMinor, fee.gross_minor, fee.creator_share_minor) : 0
  if (part > 0) {
    const { row } = await readAccount(r.creatorId)
    const account = row?.provider_account_id ?? null
    /* The account the sale was split to, and it must still be this creator's. */
    const owner = account ? await accountByProviderId(account) : null
    if (account && owner?.creator_id === r.creatorId) {
      try {
        await chargeCreator(c, { accountId: account, key: `refund:${key}`, amountMinor: part, currency, reference: `Refund of order ${r.orderId.slice(0, 8)}` })
        clawed = part
        await audit({ creatorId: r.creatorId, kind: "refund.clawback", to: "charged", ref: refund.id, actor: "system" })
      } catch (e) {
        console.error("[payments] refund clawback failed", describe(e))
        await audit({ creatorId: r.creatorId, kind: "refund.clawback", to: "failed", ref: refund.id, actor: "system" })
      }
    }
  }

  if (fee) {
    const refunded = fee.refunded_minor + r.amountMinor
    await markFeeRecord(r.paymentIntentId, {
      status: refunded >= fee.gross_minor ? "refunded" : "partially_refunded",
      refundedMinor: refunded,
      clawedBackMinor: fee.clawed_back_minor + clawed,
    })
  }
  return { id: refund.id, status: refund.status ?? null, currency, clawedBackMinor: clawed }
}
