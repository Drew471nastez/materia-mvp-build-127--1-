import "server-only"

import type Stripe from "stripe"
import { sendRefundEmails } from "@/lib/email"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { senderPicture } from "@/lib/email-campaigns/sender"
import { allocateRefund, feeShare, type RefundLine } from "./refund-allocation"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { emit } from "@/lib/notify/outbox"
import { postLedger } from "@/lib/payments/ledger"
import { communityAccessAfterEntitlement } from "@/lib/communities/server/payment-hooks"

/**
 * ===========================================================================
 *  A STRIPE REFUND, WRITTEN BACK TO THE ORDERS AND THE SELLER'S BALANCE
 * ===========================================================================
 * Called from the webhook on `charge.refunded`, which Stripe sends for every
 * refund of a charge, whoever made it: the Orders page (app/api/stripe/
 * refund) or somebody in the Stripe dashboard.
 *
 * WHAT THIS REPLACED, AND WHY. The handler looked the order up with
 * `.maybeSingle()` on the PaymentIntent and skipped it if it was already
 * marked refunded. Two things followed:
 *
 *   - A basket is several rows under one PaymentIntent, so the lookup
 *     errored and a basket refunded in the dashboard was never recorded at
 *     all: not on the order, not on the seller's balance.
 *   - The Orders page marks its row refunded the moment Stripe accepts the
 *     refund, before this event arrives, so the handler found it already
 *     refunded and skipped the balance too. The balance on Payouts never
 *     went down for a refund made from Storelib.
 *
 * And the refund email was handed dollars where it formats cents, so a
 * dashboard refund of $10 was emailed as $0.10.
 *
 * NOW every refund of the charge is taken in turn (a second partial refund
 * sends the event again with both), split across the rows it belongs to
 * (lib/stripe/refund-allocation.ts), and applied to each row ONCE: a
 * `ledger_events` row keyed by the refund and the order is the record that
 * it has been, written whether or not the seller has a ledger yet, so a
 * retried or repeated event changes nothing.
 */

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

interface OrderRow extends RefundLine {
  product_id: string | null
  buyer_id: string | null
  variant_id: string | null
  buyer_email?: string | null
  customer_email?: string | null
  created_at?: string | null
  stripe_refund_id?: string | null
}

export interface RefundSyncResult {
  applied: number
  skipped: number
}

async function refundsOf(stripe: Stripe, charge: Stripe.Charge): Promise<Stripe.Refund[]> {
  /* Stripe stopped including `charge.refunds` by default; ask when it is missing. */
  const inline = charge.refunds?.data
  const list = inline && inline.length > 0 ? inline : (await stripe.refunds.list({ charge: charge.id, limit: 100 })).data
  return list
    /* Only money that has actually gone back. A pending refund is applied when refund.updated says it succeeded. */
    .filter((r) => r.status === "succeeded")
    .sort((a, b) => a.created - b.created)
}

interface RefundEvent {
  order_id: string
  stripe_refund_id: string | null
  amount_cents: number | null
}

/** Every refund already recorded against these rows, by any refund. */
async function refundEventsFor(db: Db, orderIds: string[]): Promise<RefundEvent[]> {
  const { data, error } = await db
    .from("ledger_events")
    .select("order_id, stripe_refund_id, amount_cents")
    .eq("event_type", "refund")
    .in("order_id", orderIds)
  if (error) throw new Error(`refund events read failed: ${error.message}`)
  return (data ?? []) as RefundEvent[]
}

async function creatorOf(db: Db, productId: string | null): Promise<string | null> {
  if (!productId) return null
  const { data } = await db.from("products").select("creator_id").eq("id", productId).maybeSingle()
  return (data?.creator_id as string) ?? null
}

/** The row's own record: refunded, how much in all, and by which refund. */
async function markRow(db: Db, row: OrderRow, refund: Stripe.Refund, cents: number, startedHere: boolean, before: number) {
  await db.from("orders").update({ status: "refunded" }).eq("id", row.id)
  /* A refund from the Orders page writes its own amount. */
  if (startedHere) return
  const total = Math.min(Math.max(0, row.amount_cents || 0), before + cents)
  try {
    await db
      .from("orders")
      .update({
        refunded_at: new Date((refund.created || Date.now() / 1000) * 1000).toISOString(),
        /* A copy refunded because the product had sold out says so (lib/checkout/sold-out-refund.ts). */
        refund_reason: refund.metadata?.refund_reason === "sold_out" ? "sold_out" : refund.reason || "requested_by_customer",
        refund_amount_cents: total,
        stripe_refund_id: refund.id,
      })
      .eq("id", row.id)
  } catch {
    /* Older databases have no refund columns; the status above is enough. */
  }
}

/** A full refund takes the product back out of the buyer's library; a partial one does not. */
async function revokeIfFull(db: Db, row: OrderRow, cents: number, before: number) {
  if (!row.buyer_id || !row.product_id) return
  if (before + cents < Math.max(0, row.amount_cents || 0)) return
  try {
    let q = db.from("entitlements").delete().eq("buyer_id", row.buyer_id).eq("product_id", row.product_id)
    q = row.variant_id ? q.eq("variant_id", row.variant_id) : q.is("variant_id", null)
    await q
  } catch (e) {
    console.error("[refund-sync] entitlement revoke failed:", e instanceof Error ? e.message : e)
  }
  /*
    And the communities that product opened: a member who has nothing else
    that grants access leaves with it. A refunded membership invoice is not
    this path's business (its library rows are the membership's), so a
    subscriber keeps their community, as they keep the membership itself.
    Never throws.
  */
  try {
    await communityAccessAfterEntitlement(db, { userId: row.buyer_id, productId: row.product_id, orderId: row.id, granted: false })
  } catch (e) {
    console.error("[refund-sync] community access:", e instanceof Error ? e.message : e)
  }
}

/**
 * The seller's balance gives back what they received for this part: the
 * refund less its share of the platform fee, taken from pending first, then
 * available, and anything left as a negative balance.
 *
 * THE EVENT ROW IS WRITTEN FIRST, and it is written whether or not the
 * seller has a ledger yet, because it is also the record that this refund
 * has been applied to this row (alreadyApplied). Written last, a failure
 * between the balance and the event would let a retried webhook take the
 * money off twice; written first, the worst a failure can do is leave the
 * balance short of one refund, which the error log names.
 */
async function applyToLedger(db: Db, row: OrderRow, refund: Stripe.Refund, cents: number, currency: string): Promise<"recorded" | "duplicate" | "no-seller"> {
  const creatorId = await creatorOf(db, row.product_id)
  if (!creatorId) return "no-seller"

  const { data: sale } = await db
    .from("ledger_events")
    .select("fee_cents, released_at")
    .eq("order_id", row.id)
    .eq("event_type", "sale")
    .limit(1)
  const fee = feeShare(Number(sale?.[0]?.fee_cents) || 0, row.amount_cents || 0, cents)
  const net = Math.max(0, cents - fee)
  /*
    Where the money is. While the sale is on hold its part of the balance is
    in pending, and the hold's release gives only what refunds left of it
    (app/api/cron/release-holds). Once released it is in available, and
    taking it from pending instead would take another sale's held money,
    which that sale's release would then pay out again.
  */
  const held = Array.isArray(sale) && sale.length > 0 && !sale[0].released_at

  /* One locked step in the database (lib/payments/ledger), once per refund and row:
     where the money comes from is decided against the balance as it is at that
     moment, not as it was read a moment earlier. Below: before run-now part 64. */
  const posted = await postLedger(db, {
    creatorId,
    key: `refund:${refund.id}:${row.id}`,
    op: held ? "debit_pending_first" : "debit_available_first",
    amountCents: net,
    event: {
      event_type: "refund",
      amount_cents: cents,
      net_seller_cents: net,
      fee_cents: fee,
      currency,
      order_id: row.id,
      stripe_refund_id: refund.id,
      description: `Refund: $${(cents / 100).toFixed(2)}`,
      add_lifetime_refunds: cents,
    },
  })
  if (posted.unavailable === false) return posted.applied ? "recorded" : "duplicate"

  const { data: ledger } = await db.from("seller_ledger").select("*").eq("creator_id", creatorId).maybeSingle()
  let fromPending = 0
  let fromAvailable = 0
  let remaining = 0
  if (ledger && net > 0) {
    remaining = net
    const pending = Math.max(0, ledger.pending_amount || 0)
    const available = Math.max(0, ledger.available_amount || 0)
    if (held) {
      fromPending = Math.min(remaining, pending)
      remaining -= fromPending
      fromAvailable = Math.min(remaining, available)
      remaining -= fromAvailable
    } else {
      fromAvailable = Math.min(remaining, available)
      remaining -= fromAvailable
      fromPending = Math.min(remaining, pending)
      remaining -= fromPending
    }
  }

  const { error: eventError } = await db.from("ledger_events").insert({
    creator_id: creatorId,
    event_type: "refund",
    amount_cents: cents,
    net_seller_cents: net,
    fee_cents: fee,
    currency,
    pending_delta: -fromPending,
    available_delta: -fromAvailable,
    order_id: row.id,
    stripe_refund_id: refund.id,
    description: `Refund: $${(cents / 100).toFixed(2)}`,
  })
  /* 23505: another delivery of this same event got there first (the unique
     index in supabase/sql/RUN_REFUND_LEDGER_ONCE.sql). Already applied. */
  if (eventError && (eventError as { code?: string }).code === "23505") return "duplicate"
  if (eventError) throw new Error(`refund event not recorded: ${eventError.message}`)

  if (ledger && net > 0) {
    const { error: ledgerError } = await db
      .from("seller_ledger")
      .update({
        pending_amount: (ledger.pending_amount || 0) - fromPending,
        available_amount: (ledger.available_amount || 0) - fromAvailable,
        negative_balance: (ledger.negative_balance || 0) + remaining,
        lifetime_refunds: (ledger.lifetime_refunds || 0) + cents,
      })
      .eq("creator_id", creatorId)
    if (ledgerError) console.error("[refund-sync] balance not reduced for refund", refund.id, "order", row.id, ledgerError.message)
  }
  return "recorded"
}

export async function syncChargeRefund(db: Db, stripe: Stripe, charge: Stripe.Charge): Promise<RefundSyncResult> {
  const result: RefundSyncResult = { applied: 0, skipped: 0 }
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return result

  const { data: found, error } = await db.from("orders").select("*").eq("stripe_payment_intent_id", paymentIntentId)
  if (error) throw new Error(`orders read failed: ${error.message}`)
  const rows = ((found ?? []) as OrderRow[]).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id))
  if (rows.length === 0) return result

  const currency = charge.currency || "usd"
  /*
    WHAT EACH ROW HAS GIVEN BACK is read from the ledger events, which only
    this function writes, and not from the row: the Orders page and its
    missed-refund check (app/app/orders/sales/page.tsx) write the row's
    refund amount too, and adding to a figure somebody else already added
    this refund to is how a $5 refund of a $10 order became $10.
  */
  const events = await refundEventsFor(db, rows.map((r) => r.id))
  const failures: string[] = []

  for (const refund of await refundsOf(stripe, charge)) {
    const mine = events.filter((e) => e.stripe_refund_id === refund.id)
    const done = new Set(mine.map((e) => e.order_id))
    const left = refund.amount - mine.reduce((n, e) => n + (e.amount_cents || 0), 0)
    if (left <= 0) {
      result.skipped += mine.length
      continue
    }
    /* Each row as the other refunds have left it, and only the rows this
       refund has not been applied to yet, sharing only what is left of it:
       a delivery after a partial failure finishes the job rather than
       splitting the whole refund again over rows that changed since. */
    const before = (id: string) =>
      events.filter((e) => e.order_id === id && e.stripe_refund_id !== refund.id).reduce((n, e) => n + (e.amount_cents || 0), 0)
    const open = rows
      .filter((r) => !done.has(r.id))
      .map((r) => ({ id: r.id, amount_cents: r.amount_cents, status: before(r.id) > 0 ? "refunded" : "completed", refund_amount_cents: before(r.id) }))
    const named = typeof refund.metadata?.order_id === "string" ? refund.metadata.order_id : null
    const shares = allocateRefund(open, left, named)
    const touched: Array<{ row: OrderRow; cents: number }> = []

    for (const share of shares) {
      const row = rows.find((r) => r.id === share.id)
      if (!row) continue
      /*
        The Orders page tags its refunds with the creator and the row
        (app/api/stripe/refund) and writes the row's amount itself. Read
        from the refund, not from the row, because this event can arrive
        before the page has finished writing it.
      */
      /* Unless Stripe had not confirmed it there: then this is the only place it is finished. */
      const startedHere = named === row.id && typeof refund.metadata?.creator_id === "string" && refund.metadata?.settled_by !== "webhook"
      const already = before(row.id)
      let outcome: "recorded" | "duplicate" | "no-seller"
      try {
        outcome = await applyToLedger(db, row, refund, share.cents, currency)
      } catch (e) {
        failures.push(`${refund.id}/${row.id}: ${e instanceof Error ? e.message : String(e)}`)
        continue
      }
      if (outcome === "duplicate") {
        result.skipped++
        continue
      }
      await markRow(db, row, refund, share.cents, startedHere, already)
      await revokeIfFull(db, row, share.cents, already)
      /* The notification engine hears about every row's refund, whoever
         started it, under the key the Orders page and the admin refund use
         too (lib/notify/outbox): told once. */
      await raiseRefund(db, row, refund, share.cents, currency, already)
      if (!startedHere) touched.push({ row, cents: share.cents })
      /* Later refunds of the same charge see this one. */
      events.push({ order_id: row.id, stripe_refund_id: refund.id, amount_cents: share.cents })
      result.applied++
    }

    /* One email per refund, for a refund Storelib did not start (the Orders
       page sends its own). In cents: sendRefundEmails formats them. */
    if (touched.length > 0) {
      try {
        await emailRefund(db, touched, refund, currency)
      } catch (e) {
        console.error("[refund-sync] refund email failed:", e instanceof Error ? e.message : e)
      }
    }
  }

  /* Anything not recorded makes the webhook answer 500, so Stripe sends the
     event again, and the rows that were recorded are skipped then. */
  if (failures.length > 0) throw new Error(`not recorded: ${failures.join("; ")}`)
  return result
}

/** The seller's one picture, as every email of theirs carries it (lib/email-campaigns/sender). */
async function sellerPicture(db: Db, creatorId: string | null | undefined): Promise<string | undefined> {
  if (!creatorId) return undefined
  try {
    const brand = await loadBrand(db, creatorId)
    return senderPicture({ photoUrl: brand.avatarUrl, logoUrl: brand.logoUrl })?.url ?? undefined
  } catch {
    return undefined
  }
}

async function emailRefund(db: Db, touched: Array<{ row: OrderRow; cents: number }>, refund: Stripe.Refund, currency: string) {
  const first = touched[0].row
  const { data: product } = await db
    .from("products")
    .select("title, creator_id, creator:creators(display_name, username, user_id)")
    .eq("id", first.product_id)
    .maybeSingle()
  const creator = (product as any)?.creator
  let sellerEmail: string | undefined
  if (creator?.user_id) {
    const { data: profile } = await db.from("profiles").select("email").eq("id", creator.user_id).maybeSingle()
    sellerEmail = ownerAddress(profile?.email) || undefined
  }
  const title = touched.length === 1 ? (product as any)?.title || "Your purchase" : `${touched.length} items`
  /* An order that ships has its own refund email in the store's look (lib/physical/jobs-server.ts queueRefundEmail,
     keyed by the refunded total, queued by the same webhook): the buyer gets that one, not this one as well. */
  const shipped = touched.some((t) => typeof (t.row as { checkout_id?: unknown }).checkout_id === "string" && (t.row as { checkout_id?: string }).checkout_id)
  await sendRefundEmails({
    buyerEmail: shipped ? undefined : first.buyer_email || first.customer_email || undefined,
    sellerEmail,
    productTitle: title,
    refundAmount: touched.reduce((n, t) => n + t.cents, 0),
    currency,
    orderId: first.id,
    reason: refund.reason || "requested_by_customer",
    storeName: creator?.display_name || creator?.username || "Storelib",
    orderDate: first.created_at || undefined,
    sellerAvatarUrl: await sellerPicture(db, (product as any)?.creator_id),
  })
}

async function raiseRefund(db: Db, row: OrderRow, refund: Stripe.Refund, cents: number, currency: string, before: number) {
  let creatorId = (row as { creator_id?: string | null }).creator_id ?? null
  if (!creatorId && row.product_id) {
    try {
      const { data } = await db.from("products").select("creator_id").eq("id", row.product_id).maybeSingle()
      creatorId = (data?.creator_id as string | undefined) ?? null
    } catch {
      /* Raised without the creator; the engine reads the order. */
    }
  }
  await emit({
    name: "order.refunded",
    key: `refund:${row.id}:${refund.id}`,
    creatorId,
    entityType: "order",
    entityId: row.id,
    correlationId: refund.id,
    payload: {
      orderId: row.id,
      refundId: refund.id,
      productId: row.product_id,
      amountCents: cents,
      currency: currency.toLowerCase(),
      full: before + cents >= (row.amount_cents ?? 0),
      reason: refund.reason || null,
      buyerEmail: row.buyer_email || row.customer_email || null,
    },
  })
}
