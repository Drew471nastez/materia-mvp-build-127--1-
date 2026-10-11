import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadOrder } from "@/lib/physical/orders-server"
import { loadSettings } from "@/lib/physical/config-server"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { returnWindow, returnableQuantities } from "@/lib/physical/status"
import { progressOf } from "@/lib/physical/orders-server"
import { OrderStatusView, PendingOrder } from "./order-status-view"
import { reasonsFor } from "@/lib/store/reasons-server"
import { reasonLabel } from "@/lib/store/reasons"
import { StoreTracking } from "@/components/website-builder/store-tracking"
import { storeIdentity } from "@/lib/store/identity-server"
import { buyerCaseLink, casesReady, openCaseFor } from "@/lib/support/cases-server"
import { appUrl } from "@/lib/notify/urls"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } }

/**
 * The buyer's order page, reached from the confirmation email and the
 * return from Stripe. The address is a random token only those carry, so
 * it is the buyer's key to their order. Not behind the switch in /admin:
 * an order somebody paid for stays readable.
 */
export default async function OrderStatusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ paid?: string; reason?: string }> }) {
  const { token } = await params
  const { paid, reason } = await searchParams
  if (token === "pending") return <PendingOrder reason={reason ?? null} />
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound()
  const db = createAdminClient()
  const order = await loadOrder(db, { receiptToken: token })
  if (!order || (order.status !== "paid" && order.status !== "refunded" && order.status !== "partially_refunded")) {
    if (order?.status === "pending") return <PendingOrder reason="unpaid" />
    notFound()
  }
  const [store, settings, reasons, ready, open] = await Promise.all([
    storeIdentity(db, order.creatorId),
    loadSettings(db, order.creatorId),
    reasonsFor(db, order.creatorId, "return"),
    casesReady(db),
    openCaseFor(db, { checkoutId: order.id }),
  ])
  const returnable = returnableQuantities(progressOf(order))
  /* Counted from delivery, or from shipping without tracking (lib/physical/status returnWindow), as the return route checks it. */
  const window = returnWindow({ ...order, pickup: order.deliveryMethod === "pickup" }, settings.returnWindowDays)
  const windowOpen = settings.returnsEnabled && window.open
  const openReturn = order.returns.some((r) => ["requested", "approved", "in_transit"].includes(r.status))
  /* The store's pixels hear about the purchase once: on this page as it opens straight from paying (?paid=1), never on a later visit. */
  const purchase = paid === "1" && order.status === "paid" ? { id: order.id, valueCents: order.totalCents, currency: order.currency, quantity: order.lines.reduce((n, l) => n + l.quantity, 0) } : null
  return (
    <>
    {purchase ? <StoreTracking creatorId={order.creatorId} purchase={purchase} /> : null}
    <OrderStatusView
      token={token}
      justPaid={paid === "1"}
      shop={{ name: store.name, avatar: store.logoUrl, email: store.email, phone: store.phone, websiteUrl: store.websiteUrl, legal: store.legal }}
      help={ready ? { openCase: open ? { link: buyerCaseLink(appUrl("/").replace(/\/$/, ""), open.id), status: open.status } : null } : null}
      order={{
        id: order.id,
        status: order.status,
        fulfillmentStatus: order.fulfillmentStatus,
        cancelled: !!order.cancelledAt,
        createdAt: order.paidAt ?? order.createdAt,
        email: order.buyerEmail,
        name: order.buyerName,
        address: order.deliveryMethod === "pickup" ? null : order.address,
        delivery: order.delivery,
        pickup: order.pickup ? { name: order.pickup.name, address: order.pickup.address, instructions: order.pickup.instructions, ready: PICKUP_READY_LABEL[order.pickup.ready], hours: order.pickup.hours ?? null } : null,
        processing: !!order.processingAt,
        totals: { subtotal: order.itemsSubtotalCents, discount: order.discountCents, shipping: order.shippingCents - order.shippingDiscountCents, tax: order.taxCents, taxIncluded: order.taxIncluded, taxLabel: order.taxLabel, total: order.totalCents, refunded: order.refundedCents, currency: order.currency },
        lines: order.lines.map((l) => ({ orderId: l.orderId, title: l.title, variantName: l.variantName, imageUrl: l.imageUrl, quantity: l.quantity, cents: l.unitCents * l.quantity - l.discountCents, type: l.type, receiptToken: l.type === "physical" ? null : l.receiptToken, returnable: returnable.get(l.orderId) ?? 0 })),
        shipments: order.shipments
          .filter((s) => s.status !== "cancelled")
          /* Its updates, oldest first, as statuses only: the seller's own notes stay on their side. */
          .map((s) => ({ id: s.id, status: s.status, carrier: s.carrier, trackingNumber: s.trackingNumber, trackingUrl: s.trackingUrl, shippedAt: s.shippedAt, deliveredAt: s.deliveredAt, items: s.items, updates: [...s.events].reverse().map((e) => ({ status: e.status, at: e.occurredAt })) })),
        returns: order.returns.map((r) => ({ id: r.id, status: r.status, createdAt: r.createdAt, reason: r.reasonLabel || reasonLabel(r.reason, "return", reasons) })),
        returnPolicy: settings.returnsEnabled ? { days: settings.returnWindowDays, endsAt: window.endsAt, open: window.open } : null,
      }}
      reasons={reasons.map((r) => ({ value: r.value, label: r.label }))}
      canReturn={windowOpen && !openReturn && [...returnable.values()].some((n) => n > 0)}
    />
    </>
  )
}
