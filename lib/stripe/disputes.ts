import "server-only"
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { isInquiry, reversibleMinor } from "./dispute-facts"

/**
 * ===========================================================================
 *  A DISPUTE ON A STORELIB SALE: WHOSE IT IS, AND THE MONEY
 * ===========================================================================
 * Storelib charges every sale on its own Stripe account and sends the
 * creator's share on (destination charges: `transfer_data.destination` and
 * `application_fee_amount`, app/api/checkout). So a buyer's dispute is
 * opened against Storelib's charge, Stripe takes the money from Storelib,
 * and the event arrives on Storelib's own webhook with no `account` on it.
 *
 * WHAT WAS WRONG. The webhook looked for the creator by `event.account`,
 * found none on every one of these, and answered "received" without doing
 * anything: no order marked disputed, no record, no email, and Storelib
 * paid the whole dispute out of its own balance while the creator kept
 * their share. Only the older charges made directly on a creator's account
 * carried an `account`.
 *
 * NOW the creator is the account the money was transferred to (the charge's
 * transfer destination), or the creator the checkout wrote into the
 * payment's metadata. While the case is open Storelib takes back the
 * creator's share of that sale (a reversal of the transfer, never more than
 * is left of it, once per dispute by its idempotency key), and gives it back
 * if the buyer's bank decides for the creator. An inquiry moves no money,
 * so nothing is taken. Stripe's dispute fee stays with Storelib.
 *
 * Every Stripe call here is one Storelib makes on its own account, with its
 * own key, about a sale the creator made; nothing here is reachable from a
 * browser.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DisputeContext {
  /** The creator's connected account the sale's money went to. */
  accountId: string | null
  /** Storelib's own charge (destination charges). False for an older charge made on the creator's account. */
  onPlatform: boolean
  paymentIntentId: string | null
  chargeId: string | null
  /** The transfer of the creator's share, on a Storelib charge. */
  transferId: string | null
  /** The creator the checkout named in the payment's metadata. */
  creatorId: string | null
}

const idOf = (v: unknown): string | null => {
  if (typeof v === "string" && v) return v
  if (v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string") return (v as { id: string }).id
  return null
}

/** Who and what a dispute is about, read from Stripe with Storelib's own key. Never throws: unknown is null. */
export async function disputeContext(dispute: Stripe.Dispute, accountFromEvent: string | null): Promise<DisputeContext> {
  const chargeId = idOf(dispute.charge)
  let paymentIntentId = idOf(dispute.payment_intent)

  if (accountFromEvent) {
    /* An older charge made on the creator's own account: Stripe has already taken the money from them. */
    if (!paymentIntentId && chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, {}, { stripeAccount: accountFromEvent }).catch(() => null)
      paymentIntentId = idOf(charge?.payment_intent)
    }
    return { accountId: accountFromEvent, onPlatform: false, paymentIntentId, chargeId, transferId: null, creatorId: null }
  }

  const charge = chargeId ? await stripe.charges.retrieve(chargeId).catch(() => null) : null
  paymentIntentId = paymentIntentId ?? idOf(charge?.payment_intent)
  let accountId = idOf(charge?.transfer_data?.destination)
  let creatorId = typeof charge?.metadata?.creator_id === "string" && charge.metadata.creator_id ? charge.metadata.creator_id : null
  if ((!accountId || !creatorId) && paymentIntentId) {
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId).catch(() => null)
    accountId = accountId ?? idOf(intent?.transfer_data?.destination)
    creatorId = creatorId ?? (typeof intent?.metadata?.creator_id === "string" && intent.metadata.creator_id ? intent.metadata.creator_id : null)
  }
  return { accountId, onPlatform: true, paymentIntentId, chargeId, transferId: idOf(charge?.transfer), creatorId }
}

/**
 * The creator a dispute belongs to. The account the money went to decides
 * first (it is where the money is); then the creator the checkout named;
 * then the order the payment wrote.
 */
export async function disputeCreator(db: Db, ctx: DisputeContext): Promise<{ id: string; user_id: string | null } | null> {
  if (ctx.accountId) {
    const { data } = await db.from("creators").select("id, user_id").eq("stripe_account_id", ctx.accountId).maybeSingle()
    if (data) return data
  }
  if (ctx.creatorId) {
    const { data } = await db.from("creators").select("id, user_id").eq("id", ctx.creatorId).maybeSingle()
    if (data) return data
  }
  if (ctx.paymentIntentId) {
    const { data: order } = await db.from("orders").select("product_id").eq("stripe_payment_intent_id", ctx.paymentIntentId).limit(1).maybeSingle()
    if (order?.product_id) {
      const { data: product } = await db.from("products").select("creator_id").eq("id", order.product_id).maybeSingle()
      if (product?.creator_id) {
        const { data } = await db.from("creators").select("id, user_id").eq("id", product.creator_id).maybeSingle()
        if (data) return data
      }
    }
  }
  return null
}

export type TakeBack = { state: "not_needed" | "reversed" | "reversal_failed"; reversedMinor: number; reversalId: string | null }

/**
 * Takes the creator's share of a disputed Storelib sale back while the case
 * is open. Once per dispute (Stripe's idempotency key), never more than is
 * left of the transfer, and never for an inquiry or an older charge Stripe
 * already took from the creator directly.
 */
export async function takeBackForDispute(ctx: DisputeContext, dispute: Stripe.Dispute): Promise<TakeBack> {
  if (!ctx.onPlatform || isInquiry(dispute.status)) return { state: "not_needed", reversedMinor: 0, reversalId: null }
  if (!ctx.transferId) {
    console.error("[disputes] no transfer to take back for", dispute.id)
    return { state: "reversal_failed", reversedMinor: 0, reversalId: null }
  }
  try {
    const already = await reversedFor(ctx.transferId, dispute.id)
    if (already.reversedMinor > 0) return { state: "reversed", ...already }
    const transfer = await stripe.transfers.retrieve(ctx.transferId)
    const amount = reversibleMinor(transfer, dispute.amount)
    /* A sale already refunded in full has nothing left to take back. */
    if (amount <= 0) return { state: "not_needed", reversedMinor: 0, reversalId: null }
    const reversal = await stripe.transfers.createReversal(
      ctx.transferId,
      { amount, description: "A buyer disputed this sale", metadata: { storelib_dispute: dispute.id } },
      { idempotencyKey: `storelib:dispute:${dispute.id}:reversal` },
    )
    return { state: "reversed", reversedMinor: reversal.amount, reversalId: reversal.id }
  } catch (error) {
    console.error("[disputes] take back failed", dispute.id, error instanceof Error ? error.message.slice(0, 160) : "unknown")
    return { state: "reversal_failed", reversedMinor: 0, reversalId: null }
  }
}

/** What this dispute already took back, read from Stripe: the reversal carries the dispute in its metadata. */
export async function reversedFor(transferId: string | null, disputeId: string): Promise<{ reversedMinor: number; reversalId: string | null }> {
  if (!transferId) return { reversedMinor: 0, reversalId: null }
  const list = await stripe.transfers.listReversals(transferId, { limit: 100 }).catch(() => null)
  const mine = (list?.data ?? []).filter((r) => r.metadata?.storelib_dispute === disputeId)
  return { reversedMinor: mine.reduce((s, r) => s + r.amount, 0), reversalId: mine[0]?.id ?? null }
}

export type GiveBack = { state: "not_needed" | "restored" | "restore_failed"; restoredMinor: number; transferId: string | null }

/**
 * The bank decided for the creator: what was taken back goes back to them,
 * once (idempotency key). Tied to the sale's own charge where Stripe allows
 * it, so it is paid from that sale's money; otherwise from Storelib's
 * balance. A failure is logged and recorded for Storelib to finish by hand.
 */
export async function giveBackAfterWon(ctx: DisputeContext, dispute: Stripe.Dispute, reversedMinor: number): Promise<GiveBack> {
  if (!ctx.onPlatform || reversedMinor <= 0 || !ctx.accountId) return { state: "not_needed", restoredMinor: 0, transferId: null }
  const base: Stripe.TransferCreateParams = {
    amount: reversedMinor,
    currency: dispute.currency,
    destination: ctx.accountId,
    description: "Dispute won: your share returned",
    metadata: { storelib_dispute: dispute.id },
  }
  try {
    const t = await stripe.transfers.create(ctx.chargeId ? { ...base, source_transaction: ctx.chargeId } : base, { idempotencyKey: `storelib:dispute:${dispute.id}:restore` })
    return { state: "restored", restoredMinor: t.amount, transferId: t.id }
  } catch (error) {
    /* Only a refusal of the tie to the charge falls back; a network failure must not risk paying twice. */
    const refused = (error as { type?: string } | null)?.type === "StripeInvalidRequestError"
    if (ctx.chargeId && refused) {
      try {
        const t = await stripe.transfers.create(base, { idempotencyKey: `storelib:dispute:${dispute.id}:restore-balance` })
        return { state: "restored", restoredMinor: t.amount, transferId: t.id }
      } catch (second) {
        console.error("[disputes] give back failed", dispute.id, second instanceof Error ? second.message.slice(0, 160) : "unknown")
        return { state: "restore_failed", restoredMinor: 0, transferId: null }
      }
    }
    console.error("[disputes] give back failed", dispute.id, error instanceof Error ? error.message.slice(0, 160) : "unknown")
    return { state: "restore_failed", restoredMinor: 0, transferId: null }
  }
}

/** One row per dispute (run-now part 82). Works without it: the money and the emails do not depend on the record. */
export async function saveDispute(db: Db, row: Record<string, unknown> & { stripe_dispute_id: string }): Promise<void> {
  try {
    const { error } = await db.from("payment_disputes").upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "stripe_dispute_id" })
    if (error && !/payment_disputes|42P01|PGRST205/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) console.error("[disputes] record not saved", error.message)
  } catch (error) {
    console.error("[disputes] record not saved", error instanceof Error ? error.message.slice(0, 160) : "unknown")
  }
}

/** The recorded dispute, if part 82 has run and it was recorded. */
export async function readDispute(db: Db, disputeId: string): Promise<{ reversed_minor: number; recovery: string; inquiry: boolean } | null> {
  try {
    const { data, error } = await db.from("payment_disputes").select("reversed_minor, recovery, inquiry").eq("stripe_dispute_id", disputeId).maybeSingle()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}
