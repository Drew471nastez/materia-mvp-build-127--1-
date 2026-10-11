import "server-only"

/**
 * ===========================================================================
 *  A PARTNER SAYS IT SHIPPED: TRACKING STRAIGHT TO THE BUYER
 * ===========================================================================
 * A warehouse, supplier or print partner that receives a shop's orders
 * (Settings > Shipping > Locations: forwarding by email or webhook,
 * ./jobs-server.ts queueForwarding) used to have one way to say it shipped:
 * reply to the email, and wait for the seller to type the number in. The
 * buyer heard nothing until then. Now each order a partner receives carries
 * a way back:
 *
 *   by email     a link in the order email (/checkout/physical/partner/<token>)
 *                to a one page form: carrier, number, link. Signed for that
 *                order and that location, for 60 days; it shows only what the
 *                email already showed them.
 *   by webhook   POST /api/physical/partner-tracking, signed the same way the
 *                order was sent to them (X-Storelib-Timestamp and
 *                X-Storelib-Signature: v1=HMAC-SHA256(secret, "<ts>.<body>"))
 *                with the shop's own webhook secret.
 *
 * Either one ships that location's items still to ship (fulfilItems, so the
 * stock, the order's status and its timeline move as when the seller does
 * it), and the buyer's shipping email goes with the carrier's tracking link.
 * A later update for the same tracking number moves that shipment on
 * (in transit, out for delivery, delivered), with its email.
 */

import type { Db } from "./auth"
import { fulfilItems, loadOrder, updateShipment, type PhysicalOrder } from "./orders-server"
import { canMoveShipment, orderNumber } from "./status"
import { normaliseTrackingNumber } from "./carriers"
import { openSecret } from "./secrets"
export { PARTNER_LINK_TTL_MS, PARTNER_PAGE_PREFIX, signPartnerLink, verifyPartnerLink, webhookSignatureOk, type PartnerLink } from "./partner-link"
import type { ShipmentStatus } from "./types"

/** The shop's own webhook secret (Settings > Integrations > Your own system), opened, or null. */
export async function shopWebhookSecret(db: Db, creatorId: string): Promise<string | null> {
  const { data } = await db.from("commerce_integrations").select("webhook_secret_ciphertext").eq("creator_id", creatorId).eq("provider", "custom_webhook").maybeSingle()
  return data?.webhook_secret_ciphertext ? openSecret(data.webhook_secret_ciphertext) : null
}

/* ── what a partner's word does ─────────────────────────────────────────── */

const STATUSES: ShipmentStatus[] = ["shipped", "in_transit", "out_for_delivery", "delivered", "failed"]

export function readPartnerStatus(value: unknown): ShipmentStatus | null {
  return typeof value === "string" && (STATUSES as string[]).includes(value) ? (value as ShipmentStatus) : null
}

export type PartnerOutcome =
  | { ok: true; kind: "shipped" | "updated" | "unchanged"; order: PhysicalOrder }
  | { ok: false; error: string; status: number }

/** The items of an order this location still has to ship, as fulfilItems takes them. */
export function openItemsAt(order: Pick<PhysicalOrder, "lines">, locationId: string | null): { orderId: string; quantity: number }[] {
  return order.lines
    .filter((l) => l.requiresShipping && (!locationId || l.locationId === locationId))
    .map((l) => ({ orderId: l.orderId, quantity: Math.max(0, l.quantity - l.fulfilled) }))
    .filter((i) => i.quantity > 0)
}

/**
 * The partner shipped (or a parcel moved on). With a tracking number the
 * order already has, that shipment moves to `status`; otherwise this
 * location's items still to ship are shipped with it. The buyer is emailed
 * either way, as when the seller does it.
 */
export async function partnerShipped(
  db: Db,
  input: { creatorId: string; checkoutId: string; locationId: string | null; carrier?: unknown; trackingNumber?: unknown; trackingUrl?: unknown; status?: unknown; partner: { provider: string; name: string } },
): Promise<PartnerOutcome> {
  const order = await loadOrder(db, { creatorId: input.creatorId, checkoutId: input.checkoutId })
  if (!order) return { ok: false, error: "Order not found.", status: 404 }
  if (order.deliveryMethod === "pickup") return { ok: false, error: "This order is picked up from the shop.", status: 409 }
  const number = normaliseTrackingNumber(typeof input.trackingNumber === "string" ? input.trackingNumber.slice(0, 80) : null)
  const status = readPartnerStatus(input.status) ?? "shipped"
  const existing = number ? order.shipments.find((s) => s.status !== "cancelled" && (s.trackingNumber ?? "").toUpperCase() === number.toUpperCase()) : null
  if (existing) {
    if (status === "shipped" || !canMoveShipment(existing.status, status)) return { ok: true, kind: "unchanged", order }
    const moved = await updateShipment(db, input.creatorId, existing.id, { status, partner: { name: input.partner.name } })
    return moved.ok ? { ok: true, kind: "updated", order: moved.order } : { ok: false, error: moved.error, status: moved.status ?? 400 }
  }
  const items = openItemsAt(order, input.locationId)
  if (items.length === 0) return { ok: true, kind: "unchanged", order }
  const shipped = await fulfilItems(db, input.creatorId, input.checkoutId, {
    items,
    carrier: input.carrier,
    trackingNumber: number,
    trackingUrl: input.trackingUrl,
    notifyBuyer: true,
    key: `partner:${input.locationId ?? "all"}:${number ?? "none"}`,
    locationId: input.locationId,
    partner: input.partner,
  })
  if (!shipped.ok) return { ok: false, error: shipped.error, status: shipped.status ?? 400 }
  /* Delivered in the same breath (a partner that only reports the end): the shipment just made moves on too. */
  if (status !== "shipped" && number) {
    const made = shipped.order.shipments.find((s) => (s.trackingNumber ?? "").toUpperCase() === number.toUpperCase() && s.status === "shipped")
    if (made && canMoveShipment("shipped", status)) {
      const moved = await updateShipment(db, input.creatorId, made.id, { status, partner: { name: input.partner.name } })
      if (moved.ok) return { ok: true, kind: "shipped", order: moved.order }
    }
  }
  return { ok: true, kind: "shipped", order: shipped.order }
}

/** For the partner's page: the order number, and the items this location ships, without prices. */
export function partnerView(order: PhysicalOrder, locationId: string) {
  const mine = order.lines.filter((l) => l.requiresShipping && l.locationId === locationId)
  return {
    number: orderNumber(order.id),
    cancelled: !!order.cancelledAt,
    lines: mine.map((l) => ({ title: l.title, variantName: l.variantName, sku: l.sku, quantity: l.quantity, left: Math.max(0, l.quantity - l.fulfilled) })),
    shipped: order.shipments.filter((s) => s.status !== "cancelled" && (s.locationId === locationId || s.items.some((i) => mine.some((l) => l.orderId === i.orderId)))).map((s) => ({ carrier: s.carrier, trackingNumber: s.trackingNumber, status: s.status })),
  }
}
