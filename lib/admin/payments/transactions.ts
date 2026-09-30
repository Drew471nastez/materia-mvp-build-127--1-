import "server-only"

import { toOrderRow, ORDER_COLUMNS, type OrderDb } from "@/lib/admin/views/creators"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const TX_COLUMNS =
  "id, created_at, status, amount_cents, fee_cents, currency, buyer_email, customer_email, product_id, refund_amount_cents, stripe_payment_intent_id, payment_method, buyer_country, plan_used, pricing_tier, fee_rule_version, stripe_processing_fee_cents, storelib_net_margin_cents, creator_id, product:products(id, title, creator:creators(id, slug, display_name))"

export async function listPaymentTransactions(db: Db, params: URLSearchParams, page: number, pageSize = 25) {
  let q = db.from("orders").select(TX_COLUMNS, { count: "exact" }).order("created_at", { ascending: false })

  const creator = params.get("creator")
  const currency = params.get("currency")
  const status = params.get("status")
  const tier = params.get("tier")
  const plan = params.get("plan")
  const dispute = params.get("dispute")
  const refund = params.get("refund")
  const since = params.get("since")
  const until = params.get("until")

  if (creator) q = q.eq("creator_id", creator)
  if (currency) q = q.ilike("currency", currency)
  if (status) q = q.eq("status", status)
  if (tier) q = q.eq("pricing_tier", tier)
  if (plan) q = q.eq("plan_used", plan)
  if (dispute === "yes") q = q.eq("status", "disputed")
  if (refund === "yes") q = q.in("status", ["refunded", "partially_refunded"])
  if (since) q = q.gte("created_at", since)
  if (until) q = q.lte("created_at", until)

  const from = (Math.max(1, page) - 1) * pageSize
  const { data, error, count } = await q.range(from, from + pageSize - 1)
  if (error) return { ok: false as const, error: "Could not list transactions." }

  const rows = (data ?? []).map((o: OrderDb & Record<string, unknown>) => {
    const base = toOrderRow(o)
    const gross = o.amount_cents ?? 0
    const fee = o.fee_cents ?? 0
    const processing = o.stripe_processing_fee_cents ?? null
    const margin = o.storelib_net_margin_cents ?? null
    return {
      ...base,
      planUsed: o.plan_used ?? null,
      pricingTier: o.pricing_tier ?? null,
      feeRuleVersion: o.fee_rule_version ?? null,
      stripeProcessingFee: processing,
      storelibMargin: margin,
      creatorProceeds: gross - fee,
      disputeStatus: o.status === "disputed" ? "open" : null,
      refundStatus: o.status === "refunded" || o.status === "partially_refunded" ? o.status : null,
    }
  })

  return { ok: true as const, rows, total: count ?? rows.length, page }
}

export async function getPaymentTransaction(db: Db, orderId: string) {
  const { data, error } = await db.from("orders").select(TX_COLUMNS).eq("id", orderId).maybeSingle()
  if (error || !data) return { ok: false as const, error: "Order not found." }
  const o = data as OrderDb & Record<string, unknown>
  return {
    ok: true as const,
    order: {
      ...toOrderRow(o),
      planUsed: o.plan_used,
      pricingTier: o.pricing_tier,
      feeRuleVersion: o.fee_rule_version,
      stripeProcessingFeeCents: o.stripe_processing_fee_cents,
      storelibNetMarginCents: o.storelib_net_margin_cents,
      stripePaymentIntentId: o.stripe_payment_intent_id,
      creatorId: o.creator_id,
    },
  }
}
