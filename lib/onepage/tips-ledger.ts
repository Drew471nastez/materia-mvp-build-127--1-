import "server-only"

/**
 * ===========================================================================
 *  A ONEPAGE TIP ON THE SELLER'S BALANCE, ONCE
 * ===========================================================================
 * A tip (lib/onepage/tips-server) is a destination charge to the creator's
 * connected account, as every Storelib sale is, so Stripe pays it out with
 * the rest. It was kept in onepage_tips and nowhere else: the balance on
 * Payouts (seller_ledger) and its history (ledger_events) left it out, and a
 * refund or a dispute of one took money off a balance that never had it.
 *
 * NOW a paid tip is posted the way a sale is (lib/checkout/fulfil-payment
 * recordSale): through public.ledger_post (run-now part 64), in the
 * wallet's currency (lib/payments/ledger-currency), held until Stripe says
 * the creator's share is available, under the key `tip:<Checkout Session>`.
 * Whichever of the webhook and the visitor's return records the tip first
 * posts it; the other finds the key and changes nothing.
 *
 *   amount   what the tipper paid; fee: the application fee Stripe kept back
 *            (the charge's own application_fee_amount when Stripe answers,
 *            else the one the session was made with, metadata
 *            platform_fee_cents); the creator's net is the difference, which
 *            is what the transfer to their account carries.
 *   refund   `refund:<refund>:tip:<session>`, the refund less its share of the
 *            fee, from pending while the tip is held and from available after,
 *            as an order's refund is (lib/stripe/refund-sync applyToLedger).
 *            A tip refunded in full reads `refunded` in onepage_tips.
 *   dispute  the webhook's own dispute handling takes the creator's share back
 *            and gives it back when won, as for any sale; here the tip is
 *            posted first (never a dispute of a tip the balance never had) and
 *            reads `disputed`, and `paid` again when won.
 *
 * Before part 64 nothing is posted (there is no key to post it once under);
 * part 471 posts every paid tip that has no ledger row yet, once.
 *
 * Every Stripe read and the currency are handed in, so the tests run all of
 * it against stubs (tests/tips-ledger.test.ts).
 */
import type Stripe from "stripe"
import { postLedger, type LedgerResult } from "@/lib/payments/ledger"
import type { LedgerAmounts } from "@/lib/payments/ledger-currency"
import { feeShare } from "@/lib/stripe/refund-allocation"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** The ledger key a tip's sale is posted under: one Checkout Session, one tip, one sale. */
export function tipLedgerKey(checkoutSessionId: string): string {
  return `tip:${checkoutSessionId}`
}

/** The ledger key of one refund of one tip. */
export function tipRefundKey(refundId: string, checkoutSessionId: string): string {
  return `refund:${refundId}:${tipLedgerKey(checkoutSessionId)}`
}

/** A tip as onepage_tips keeps it (run-now part 411). */
export interface TipLedgerRow {
  id?: string | null
  checkout_session_id: string
  payment_intent_id?: string | null
  creator_id: string
  onepage_id?: string | null
  block_id?: string | null
  amount_cents: number
  currency: string
  platform_fee_cents?: number | null
  tipper_name?: string | null
  status?: string | null
}

/** What Stripe says about a tip's charge: when the creator's share is available, and the fee it kept back. */
export interface TipChargeFacts {
  availableOn: Date | null
  applicationFeeCents: number | null
}

export interface TipLedgerDeps {
  /** Amounts in the charge's currency, in the wallet's (lib/payments/ledger-currency toLedger). */
  toLedger: (amounts: number[], currency: string | null | undefined) => Promise<LedgerAmounts>
  /** The tip's charge read from Stripe, or nothing known. Never throws. */
  chargeFacts: (db: Db, tip: TipLedgerRow) => Promise<TipChargeFacts>
  /** "$5.00 (from €4.60)" for a ledger line (lib/payments/ledger-currency ledgerAmountText). */
  amountText: (amount: number, ledger: LedgerAmounts, original: { amount: number; currency: string | null | undefined }) => string
  now?: () => number
}

const DAY_MS = 86_400_000

/** The name a tip is shown under: the tipper's own, or Anonymous. Pure, so the page and the tests read it. */
export function tipperLabel(name: string | null | undefined): string {
  const n = typeof name === "string" ? name.trim() : ""
  return n ? n.slice(0, 80) : "Anonymous"
}

/** The tip's line in the ledger's history: "Tip from Sam: $5.00 (net $4.55)". */
export function tipSaleText(name: string | null | undefined, gross: string, net: string): string {
  return `Tip from ${tipperLabel(name)}: ${gross} (net ${net})`
}

/** Stripe's real fee for the tip, else the one the session was made with. Never below 0 or above the tip. */
export function tipFeeCents(tip: Pick<TipLedgerRow, "amount_cents" | "platform_fee_cents">, stripeFee: number | null | undefined): number {
  const raw = typeof stripeFee === "number" && Number.isFinite(stripeFee) ? stripeFee : Number(tip.platform_fee_cents)
  const fee = Number.isFinite(raw) ? Math.round(raw) : 0
  return Math.min(Math.max(0, fee), Math.max(0, tip.amount_cents))
}

/** Read from Stripe on the server, bounded: a slow Stripe never holds the webhook (the three day estimate covers it). */
async function stripeChargeFacts(db: Db, tip: TipLedgerRow): Promise<TipChargeFacts> {
  const facts: TipChargeFacts = { availableOn: null, applicationFeeCents: null }
  if (!tip.payment_intent_id) return facts
  try {
    const { stripe } = await import("@/lib/stripe")
    const pi = await stripe.paymentIntents.retrieve(tip.payment_intent_id, { expand: ["latest_charge.transfer"] }, { timeout: 5_000, maxNetworkRetries: 1 })
    const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? (pi.latest_charge as Stripe.Charge) : null
    if (!charge) return facts
    if (typeof charge.application_fee_amount === "number") facts.applicationFeeCents = charge.application_fee_amount
    const transfer = charge.transfer && typeof charge.transfer === "object" ? (charge.transfer as Stripe.Transfer) : null
    const dest = transfer?.destination_payment
    const destId = typeof dest === "string" ? dest : (dest?.id ?? null)
    if (!destId) return facts
    const { data: seller } = await db.from("creators").select("stripe_account_id").eq("id", tip.creator_id).maybeSingle()
    const account = (seller as { stripe_account_id?: string | null } | null)?.stripe_account_id
    if (!account) return facts
    const destCharge = await stripe.charges.retrieve(destId, { expand: ["balance_transaction"] }, { stripeAccount: account, timeout: 5_000, maxNetworkRetries: 1 })
    const bt = destCharge.balance_transaction as Stripe.BalanceTransaction | null
    if (bt && typeof bt === "object" && bt.available_on) facts.availableOn = new Date(bt.available_on * 1000)
  } catch {
    /* estimated by the caller */
  }
  return facts
}

/** The real thing: Stripe, and the wallet's currency at the day's ECB rate. */
export async function defaultTipLedgerDeps(): Promise<TipLedgerDeps> {
  const { toLedger, ledgerAmountText } = await import("@/lib/payments/ledger-currency")
  return { toLedger, amountText: ledgerAmountText, chargeFacts: stripeChargeFacts }
}

export type TipPost = "posted" | "already" | "unavailable" | "skipped"

/** Whether the tip's sale is on the ledger already (one row under its key). A failed read is "no": the key still holds. */
async function tipSaleRow(db: Db, sessionId: string): Promise<{ amount_cents: number | null; fee_cents: number | null; released_at: string | null; currency: string | null } | null> {
  try {
    const { data, error } = await db.from("ledger_events").select("amount_cents, fee_cents, released_at, currency").eq("idempotency_key", tipLedgerKey(sessionId)).limit(1).maybeSingle()
    if (error) return null
    return (data as { amount_cents: number | null; fee_cents: number | null; released_at: string | null; currency: string | null } | null) ?? null
  } catch {
    return null
  }
}

/**
 * THE TIP'S SALE, POSTED ONCE. Called by the webhook and the visitor's return
 * (recordTipFromSession), by a refund or a dispute of the tip (so neither
 * ever takes back a tip the balance never had), and safe to call any number
 * of times: the database keeps one row under the key. Throws only when the
 * database refuses the post, so the webhook answers 500 and Stripe retries.
 */
export async function postTipSale(db: Db, tip: TipLedgerRow, deps?: TipLedgerDeps): Promise<TipPost> {
  if (!tip?.checkout_session_id || !tip.creator_id || !Number.isInteger(tip.amount_cents) || tip.amount_cents <= 0) return "skipped"
  /* Before part 64 there is no ledger_post to post it once under: part 471 posts it later. */
  if (typeof db?.rpc !== "function") return "unavailable"
  if (await tipSaleRow(db, tip.checkout_session_id)) return "already"
  const d = deps ?? (await defaultTipLedgerDeps())
  const facts = await d.chargeFacts(db, tip).catch(() => ({ availableOn: null, applicationFeeCents: null }) as TipChargeFacts)
  const charged = tip.amount_cents
  const chargedFee = tipFeeCents(tip, facts.applicationFeeCents)
  const wallet = await d.toLedger([charged, chargedFee], tip.currency)
  const [total, fee] = wallet.amounts
  const net = Math.max(0, total - fee)
  const now = d.now ? d.now() : Date.now()
  const holdUntil = facts.availableOn ?? new Date(now + 3 * DAY_MS)
  const key = tipLedgerKey(tip.checkout_session_id)
  const posted: LedgerResult = await postLedger(db, {
    creatorId: tip.creator_id,
    key,
    op: "sale",
    amountCents: net,
    event: {
      event_type: "sale",
      amount_cents: total,
      net_seller_cents: net,
      fee_cents: fee,
      currency: wallet.currency,
      order_id: null,
      hold_until: holdUntil.toISOString(),
      description: tipSaleText(tip.tipper_name, d.amountText(total, wallet, { amount: charged, currency: tip.currency }), d.amountText(net, { ...wallet, converted: false }, { amount: net, currency: wallet.currency })),
      metadata: {
        kind: "tip",
        tip_key: key,
        tip_id: tip.id ?? null,
        checkout_session_id: tip.checkout_session_id,
        payment_intent_id: tip.payment_intent_id ?? null,
        onepage_id: tip.onepage_id ?? null,
        block_id: tip.block_id ?? null,
        tipper_name: tip.tipper_name ?? null,
        charged_cents: charged,
        charged_fee_cents: chargedFee,
        charged_currency: String(tip.currency || "").toLowerCase(),
      },
      add_lifetime_earnings: total,
      add_lifetime_fees: fee,
    },
  })
  if (posted.unavailable === true) return "unavailable"
  return posted.applied ? "posted" : "already"
}

const TIP_COLUMNS = "id, checkout_session_id, payment_intent_id, creator_id, onepage_id, block_id, amount_cents, currency, platform_fee_cents, tipper_name, status"

/** The tip a PaymentIntent paid, or null (not a tip, or before part 411). */
export async function tipForPaymentIntent(db: Db, paymentIntentId: string | null | undefined): Promise<TipLedgerRow | null> {
  if (!paymentIntentId) return null
  try {
    const { data, error } = await db.from("onepage_tips").select(TIP_COLUMNS).eq("payment_intent_id", paymentIntentId).limit(1).maybeSingle()
    if (error) return null
    return (data as TipLedgerRow | null) ?? null
  } catch {
    return null
  }
}

async function setTipStatus(db: Db, tip: TipLedgerRow, status: "paid" | "refunded" | "disputed") {
  if (tip.status === status) return
  try {
    await db.from("onepage_tips").update({ status }).eq("checkout_session_id", tip.checkout_session_id)
  } catch {
    /* The ledger is the money; the status is for the lists. */
  }
}

type RefundStripe = { refunds: { list(params: { charge: string; limit?: number }): Promise<{ data: Stripe.Refund[] }> } }

async function succeededRefunds(stripe: RefundStripe, charge: Stripe.Charge): Promise<Stripe.Refund[]> {
  const inline = charge.refunds?.data
  const list = inline && inline.length > 0 ? inline : (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data
  return list.filter((r) => r.status === "succeeded").sort((a, b) => a.created - b.created)
}

/**
 * A REFUND OF A TIP, as an order's refund is applied (lib/stripe/refund-sync):
 * every succeeded refund of the charge, once each, the refund less its share
 * of the fee, from pending while the tip is held and from available after.
 * Called by the webhook for charge.refunded and refund.updated; a charge that
 * paid no tip answers nothing. Throws when a post is refused, so Stripe
 * sends the event again and only what is missing is posted then.
 */
export async function syncTipRefunds(db: Db, stripe: RefundStripe, charge: Stripe.Charge, deps?: TipLedgerDeps): Promise<{ applied: number; skipped: number }> {
  const result = { applied: 0, skipped: 0 }
  const intent = typeof charge.payment_intent === "string" ? charge.payment_intent : (charge.payment_intent?.id ?? null)
  const tip = await tipForPaymentIntent(db, intent)
  if (!tip) return result
  const d = deps ?? (await defaultTipLedgerDeps())
  /* Never a refund of a tip the balance never had: the sale first, once. */
  await postTipSale(db, tip, d)
  const sale = await tipSaleRow(db, tip.checkout_session_id)
  const refunds = await succeededRefunds(stripe, charge)
  let refunded = 0
  for (const refund of refunds) {
    const cents = Math.min(Math.max(0, refund.amount || 0), Math.max(0, tip.amount_cents - refunded))
    refunded += Math.max(0, refund.amount || 0)
    if (cents <= 0) continue
    const wallet = await d.toLedger([cents, tip.amount_cents], charge.currency || tip.currency)
    const [walletCents, walletTip] = wallet.amounts
    const fee = feeShare(Number(sale?.fee_cents) || 0, Number(sale?.amount_cents) || walletTip, walletCents)
    const net = Math.max(0, walletCents - fee)
    const held = !!sale && !sale.released_at
    const posted = await postLedger(db, {
      creatorId: tip.creator_id,
      key: tipRefundKey(refund.id, tip.checkout_session_id),
      op: held ? "debit_pending_first" : "debit_available_first",
      amountCents: net,
      event: {
        event_type: "refund",
        amount_cents: walletCents,
        net_seller_cents: net,
        fee_cents: fee,
        currency: wallet.currency,
        order_id: null,
        stripe_refund_id: refund.id,
        description: `Tip from ${tipperLabel(tip.tipper_name)} refunded: ${d.amountText(walletCents, wallet, { amount: cents, currency: charge.currency || tip.currency })}`,
        metadata: { kind: "tip", tip_key: tipLedgerKey(tip.checkout_session_id), tip_id: tip.id ?? null, checkout_session_id: tip.checkout_session_id, tipper_name: tip.tipper_name ?? null, charged_cents: cents, charged_currency: String(charge.currency || tip.currency || "").toLowerCase() },
        add_lifetime_refunds: walletCents,
      },
    })
    if (posted.unavailable === true) break
    if (posted.applied) result.applied++
    else result.skipped++
  }
  if (refunded >= tip.amount_cents) await setTipStatus(db, tip, "refunded")
  return result
}

/**
 * A DISPUTE OF A TIP. The money is the webhook's own dispute handling, the
 * same for a tip as for any sale (the creator found from the charge's
 * transfer, their share taken back and given back when won); here the tip
 * is posted first, so the dispute never takes back a tip the balance never
 * had, and its row says where it stands. A PaymentIntent that paid no tip
 * answers false.
 */
export async function noteTipDispute(db: Db, paymentIntentId: string | null | undefined, state: "opened" | "won" | "lost", deps?: TipLedgerDeps): Promise<boolean> {
  const tip = await tipForPaymentIntent(db, paymentIntentId)
  if (!tip) return false
  await postTipSale(db, tip, deps)
  if (tip.status === "refunded") return true
  await setTipStatus(db, tip, state === "won" ? "paid" : "disputed")
  return true
}

/** A tip on the Payouts page: the ledger's sale, with the tip's own amount, name and where it stands. */
export interface PayoutTip {
  id: string
  name: string | null
  amountCents: number
  currency: string
  netCents: number
  walletCurrency: string
  createdAt: string
  status: "paid" | "refunded" | "disputed"
}

/**
 * The creator's latest tips as the ledger has them, for Payouts: only tips
 * posted to the balance, newest first, each with the amount the tipper paid
 * in its own currency and what reached the balance. Empty before part 64 or
 * when the read fails: the list is never the reason the page fails.
 */
export async function payoutTips(db: Db, creatorId: string, limit = 50): Promise<PayoutTip[]> {
  try {
    const { data, error } = await db
      .from("ledger_events")
      .select("id, created_at, amount_cents, net_seller_cents, currency, metadata, idempotency_key")
      .eq("creator_id", creatorId)
      .eq("event_type", "sale")
      .like("idempotency_key", "tip:%")
      .order("created_at", { ascending: false })
      .limit(limit)
    if (error || !Array.isArray(data)) return []
    type Row = { id: string; created_at: string; amount_cents: number | null; net_seller_cents: number | null; currency: string | null; metadata: Record<string, unknown> | null; idempotency_key: string | null }
    const rows = data as Row[]
    const sessions = rows.map((r) => String(r.metadata?.checkout_session_id ?? String(r.idempotency_key ?? "").slice(4))).filter(Boolean)
    const status = new Map<string, string>()
    if (sessions.length > 0) {
      const { data: tips } = await db.from("onepage_tips").select("checkout_session_id, status").in("checkout_session_id", sessions)
      for (const t of (tips ?? []) as Array<{ checkout_session_id: string; status: string | null }>) status.set(t.checkout_session_id, String(t.status || "paid"))
    }
    return rows.map((r) => {
      const m = r.metadata ?? {}
      const session = String(m.checkout_session_id ?? String(r.idempotency_key ?? "").slice(4))
      const s = status.get(session)
      const charged = Number(m.charged_cents)
      const name = typeof m.tipper_name === "string" && m.tipper_name.trim() ? m.tipper_name.trim().slice(0, 80) : null
      return {
        id: r.id,
        name,
        amountCents: Number.isFinite(charged) && charged > 0 ? charged : Number(r.amount_cents) || 0,
        currency: String(m.charged_currency || r.currency || "usd").toLowerCase(),
        netCents: Number(r.net_seller_cents) || 0,
        walletCurrency: String(r.currency || "usd").toLowerCase(),
        createdAt: r.created_at,
        status: s === "refunded" || s === "disputed" ? s : "paid",
      }
    })
  } catch {
    return []
  }
}
