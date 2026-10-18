import { NextResponse, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { planRefund, type RefundableOrder } from "@/lib/admin/refund-plan"
import { UUID_RE } from "@/lib/admin/platform-metrics"
import { refundableCents } from "@/lib/admin/views/common"
import { maskEmail } from "@/lib/privacy/mask-email"
import { createAdminClient } from "@/lib/supabase/admin"
import { emit } from "@/lib/notify/outbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  GET  /api/admin/orders/refund?id=…   what a refund would send back
 *  POST /api/admin/orders/refund        send it, with that amount echoed
 * ===========================================================================
 * A refund from the admin is the creator's refund (app/api/stripe/refund),
 * made by the platform: the same Stripe call on the platform account, with
 * `reverse_transfer` so the seller's share comes back from them rather than
 * from Storelib, the same idempotency key, and the same bookkeeping after it
 * (lib/stripe/refund-sync.ts, idempotent with the charge.refunded webhook).
 *
 * Always the whole remainder. A partial refund is a conversation with the
 * buyer, and the creator's Orders page is where that happens.
 */

type OrderDb = RefundableOrder & {
  product_id: string | null
  buyer_id: string | null
  variant_id: string | null
  buyer_email: string | null
  customer_email: string | null
  currency: string | null
  created_at: string | null
  product: { title: string | null; creator_id: string | null } | { title: string | null; creator_id: string | null }[] | null
}

const COLUMNS =
  "id, status, amount_cents, refund_amount_cents, stripe_payment_intent_id, product_id, buyer_id, variant_id, buyer_email, customer_email, currency, created_at, product:products(title, creator_id)"

async function readOrder(id: string): Promise<OrderDb | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from("orders").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw error
  return (data as OrderDb | null) ?? null
}

const productOf = (o: OrderDb) => (Array.isArray(o.product) ? o.product[0] : o.product) ?? null

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "That is not an order id." }, { status: 400 })

  try {
    const order = await readOrder(id)
    if (!order) return NextResponse.json({ error: "No order has that id." }, { status: 404 })
    /* A preview is the plan with the amount the person is about to read filled in. */
    const preview = planRefund(order, refundableCents(order))
    if (!preview.ok) return NextResponse.json({ error: preview.error }, { status: preview.status })
    const email = order.buyer_email || order.customer_email
    return NextResponse.json(
      {
        id: order.id,
        amount: preview.amount,
        currency: order.currency ? String(order.currency).toUpperCase() : null,
        product: productOf(order)?.title || "Untitled",
        buyer: email ? maskEmail(email) : "No address",
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    return adminFailure("refund preview", error, "The order could not be read.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { orderId?: unknown; confirm?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : ""
  if (!UUID_RE.test(orderId)) return NextResponse.json({ error: "That is not an order id." }, { status: 400 })
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : ""

  let order: OrderDb | null
  try {
    order = await readOrder(orderId)
  } catch (error) {
    return adminFailure("refund read", error, "The order could not be read. Nothing was refunded.")
  }

  const plan = planRefund(order, body.confirm)
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status })
  const o = order!

  const { stripe } = await import("@/lib/stripe")
  let refundId: string
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: o.stripe_payment_intent_id!,
        amount: plan.amount,
        reason: "requested_by_customer",
        reverse_transfer: true,
        metadata: { order_id: o.id, product_id: o.product_id ?? "", refunded_by: "storelib_admin", refund_reason: reason || "admin" },
      },
      { idempotencyKey: plan.idempotencyKey },
    )
    refundId = refund.id
    if (refund.status === "failed" || refund.status === "canceled") {
      return NextResponse.json({ error: "Stripe did not complete the refund. Nothing was changed." }, { status: 402 })
    }
    /* Not confirmed yet: refund.updated marks the order when it succeeds. */
    if (refund.status !== "succeeded") return NextResponse.json({ ok: true, pending: true, refundId })
  } catch (error) {
    const e = error as { type?: string; raw?: { message?: string } }
    /* Stripe's own sentence for a refund it refused is useful; anything else stays in the log. */
    const said = e?.type === "StripeInvalidRequestError" && e.raw?.message ? `Stripe refused: ${e.raw.message}` : "Stripe did not make the refund. Nothing was changed."
    return adminFailure("refund stripe", error, said, 502)
  }

  const admin = createAdminClient()
  const notes: string[] = []

  /* The row, at once, with the running total; the webhook agrees with it later. */
  const { error: rowError } = await admin
    .from("orders")
    .update({ status: "refunded", refunded_at: new Date().toISOString(), refund_reason: reason || "Refunded by Storelib", refund_amount_cents: plan.total, stripe_refund_id: refundId })
    .eq("id", o.id)
  if (rowError) {
    console.error("[admin] refund row update:", rowError.code, rowError.message)
    notes.push("The order row will update when Stripe's refund event arrives.")
  }

  /* The notification engine, under the key charge.refunded raises too (lib/stripe/refund-sync.ts). */
  {
    const creatorId = productOf(o)?.creator_id ?? null
    await emit({
      name: "order.refunded",
      key: `refund:${o.id}:${refundId}`,
      creatorId,
      entityType: "order",
      entityId: o.id,
      correlationId: refundId,
      payload: {
        orderId: o.id,
        refundId,
        productId: o.product_id ?? null,
        amountCents: plan.amount,
        currency: o.currency ? String(o.currency).toLowerCase() : null,
        full: plan.total >= (o.amount_cents ?? 0),
        reason: reason || "Refunded by Storelib",
        byStorelib: true,
        buyerEmail: o.buyer_email || o.customer_email || null,
      },
    })
  }

  /* The seller's balance and the buyer's library: the same code the webhook runs, once per refund. */
  try {
    const { syncChargeRefund } = await import("@/lib/stripe/refund-sync")
    const pi = await stripe.paymentIntents.retrieve(o.stripe_payment_intent_id!, { expand: ["latest_charge"] })
    const charge = pi.latest_charge && typeof pi.latest_charge === "object" ? pi.latest_charge : null
    if (charge) await syncChargeRefund(admin, stripe, charge as import("stripe").Stripe.Charge)
  } catch (error) {
    console.error("[admin] refund ledger:", error instanceof Error ? error.message : "unknown")
    notes.push("The seller's balance will update when Stripe's refund event arrives.")
  }

  if (plan.total >= (o.amount_cents ?? 0) && o.buyer_id && o.product_id) {
    let revoke = admin.from("entitlements").delete().eq("buyer_id", o.buyer_id).eq("product_id", o.product_id)
    revoke = o.variant_id ? revoke.eq("variant_id", o.variant_id) : revoke.is("variant_id", null)
    const { error } = await revoke
    if (error) console.error("[admin] refund entitlement:", error.code, error.message)
  }

  /* The buyer is told, and so is the seller, with the same emails a creator's refund sends. */
  try {
    const email = o.buyer_email || o.customer_email
    const product = productOf(o)
    if (email && product?.creator_id) {
      const { data: creator } = await admin.from("creators").select("user_id, slug, display_name").eq("id", product.creator_id).maybeSingle()
      const seller = creator?.user_id ? (await admin.auth.admin.getUserById(creator.user_id)).data.user?.email ?? undefined : undefined
      const { sendRefundEmails } = await import("@/lib/email")
      await sendRefundEmails({
        buyerEmail: email,
        sellerEmail: seller,
        sellerContactEmail: seller,
        productTitle: product.title || "Your purchase",
        refundAmount: plan.amount,
        currency: (o.currency || "").toUpperCase(),
        orderId: o.id,
        reason: reason || "Refunded by Storelib",
        storeName: creator?.display_name || creator?.slug || "Storelib",
        orderDate: o.created_at ?? undefined,
        /* The seller's one picture, as every email of theirs carries it (lib/email-campaigns/sender). */
        sellerAvatarUrl: await (async () => {
          const { loadBrand } = await import("@/lib/email-campaigns/brand-server")
          const { senderPicture } = await import("@/lib/email-campaigns/sender")
          const brand = await loadBrand(admin, product.creator_id as string).catch(() => null)
          return senderPicture({ photoUrl: brand?.avatarUrl, logoUrl: brand?.logoUrl })?.url ?? undefined
        })(),
      })
    }
  } catch (error) {
    console.error("[admin] refund email:", error instanceof Error ? error.message : "unknown")
    notes.push("The refund emails could not be sent.")
  }

  const recorded = await recordAdminAction(admin, {
    action: "refund",
    targetType: "order",
    targetId: o.id,
    targetLabel: productOf(o)?.title ?? null,
    reason: reason || null,
    detail: { amount_cents: plan.amount, stripe_refund_id: refundId, creator_id: productOf(o)?.creator_id ?? null },
  })
  if (!recorded) notes.push("Not written to the audit log: its table is missing. Run supabase/sql/RUN_ADMIN_CONSOLE.sql.")

  return NextResponse.json({ ok: true, amount: plan.amount, notes }, { headers: { "Cache-Control": "no-store" } })
}
