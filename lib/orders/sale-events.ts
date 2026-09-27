import "server-only"
import { emit } from "@/lib/notify/outbox"

/**
 * ===========================================================================
 *  A SALE, TOLD TO THE NOTIFICATION ENGINE ONCE, WHICHEVER PATH MADE IT
 * ===========================================================================
 * An order is written by whichever of these gets there first: the Stripe
 * webhook, the buyer's return (lib/checkout/fulfil-payment.ts and
 * fulfil-cart-session.ts), or the free checkouts (app/api/checkout/process,
 * quick-free). Each calls this after writing, and the keys make the second
 * caller a no-op:
 *
 *   order.created        order:<orderId>:created   once for the purchase (a
 *                        basket is one purchase, known by its first line)
 *   sale.created         sale:<orderId>:created    once for each line the
 *                        seller hears about, as the seller email is sent
 *   sale.first_created   order:<orderId>:first     once in the creator's life
 *
 * THE FIRST SALE is the guard the old first-sale email had: the creator's
 * `first_sale_email_sent` is not set and no other paid order of theirs
 * exists. The flag is set once the event is in the outbox; two paths that
 * decide for the same order share the key, and the engine plans FIRST_SALE
 * once per creator whatever the key (lib/notify/workflows/sales.ts). A free
 * claim is not a first sale.
 *
 * The creator's user is left for the engine to read from the creator
 * (lib/notify/engine.ts), so this makes no extra query. emit() never throws,
 * and the payloads carry ids and small facts, never a card or a token.
 *
 * The buyer's receipt and the seller's sale email are still sent where they
 * always were (lib/email.tsx, idempotent on email_logs); the engine records
 * the in-app half and does not send them again. That includes FIRST_SALE:
 * the seller's email for the creator's first paid order is drawn as the
 * first sale, so it arrives once, with the order in it.
 */

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface SaleLine {
  orderId: string
  productId: string | null
  productTitle: string | null
  amountCents: number
  feeCents?: number | null
}

export interface SaleNotice {
  creatorId: string
  /** The purchase as the buyer made it. Null for a caller that only wrote later lines of a basket. */
  purchase: { orderId: string; amountCents: number; lineCount: number } | null
  /** Each line this caller wrote, which the seller hears about. */
  lines: SaleLine[]
  currency?: string | null
  buyerEmail?: string | null
  buyerCountry?: string | null
  /** The Stripe event, PaymentIntent or checkout session id that made it. */
  correlationId?: string | null
}

export async function raiseSaleEvents(db: Db, n: SaleNotice): Promise<void> {
  try {
    const currency = (n.currency || "usd").toLowerCase()
    const base = { creatorId: n.creatorId, entityType: "order" as const, correlationId: n.correlationId ?? null }

    if (n.purchase) {
      const first = n.lines.find((l) => l.orderId === n.purchase!.orderId) ?? n.lines[0]
      await emit({
        ...base,
        name: "order.created",
        key: `order:${n.purchase.orderId}:created`,
        entityId: n.purchase.orderId,
        payload: {
          orderId: n.purchase.orderId,
          productId: first?.productId ?? null,
          productTitle: first?.productTitle ?? null,
          amountCents: n.purchase.amountCents,
          currency,
          lineCount: n.purchase.lineCount,
          buyerEmail: n.buyerEmail || null,
          free: n.purchase.amountCents === 0,
        },
      })
    }

    for (const line of n.lines) {
      const fee = typeof line.feeCents === "number" ? line.feeCents : null
      await emit({
        ...base,
        name: "sale.created",
        key: `sale:${line.orderId}:created`,
        entityId: line.orderId,
        payload: {
          orderId: line.orderId,
          productId: line.productId,
          productTitle: line.productTitle,
          amountCents: line.amountCents,
          netCents: fee === null ? null : Math.max(0, line.amountCents - fee),
          currency,
          buyerCountry: n.buyerCountry || null,
          free: line.amountCents === 0,
        },
      })
    }

    if (n.purchase && n.purchase.amountCents > 0 && (await isFirstSale(db, n.creatorId, n.lines.map((l) => l.orderId)))) {
      const line = n.lines[0]
      const fee = typeof line?.feeCents === "number" ? line.feeCents : null
      const { ok } = await emit({
        ...base,
        name: "sale.first_created",
        key: `order:${n.purchase.orderId}:first`,
        entityId: n.purchase.orderId,
        payload: {
          orderId: n.purchase.orderId,
          productId: line?.productId ?? null,
          productTitle: line?.productTitle ?? null,
          amountCents: n.purchase.amountCents,
          netCents: fee === null ? null : Math.max(0, n.purchase.amountCents - fee),
          currency,
          buyerCountry: n.buyerCountry || null,
        },
      })
      if (ok) await db.from("creators").update({ first_sale_email_sent: true }).eq("id", n.creatorId)
    }
  } catch (e) {
    /* The order stands whatever the notifications do. */
    console.error("[notify] sale events:", e instanceof Error ? e.message : e)
  }
}

async function isFirstSale(db: Db, creatorId: string, these: string[]): Promise<boolean> {
  const { data: creator } = await db.from("creators").select("first_sale_email_sent").eq("id", creatorId).maybeSingle()
  if (creator?.first_sale_email_sent) return false
  let others = db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", creatorId)
    .in("status", ["completed", "refunded", "disputed"])
    .gt("amount_cents", 0)
  if (these.length > 0) others = others.not("id", "in", `(${these.join(",")})`)
  const { count, error } = await others
  return !error && count === 0
}
