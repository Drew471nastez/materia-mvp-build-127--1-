"use client"

/**
 * ===========================================================================
 *  A PHYSICAL ORDER ON THE ORDERS PAGE: SHIP IT, TRACK IT, TAKE IT BACK
 * ===========================================================================
 * Laid out as Shopify lays out an order that ships, in the order's own
 * columns (app/app/orders/order-detail.tsx) rather than a block of its own:
 *
 *   main column   one Unfulfilled card per place the parcel leaves from,
 *                 with Fulfill items (quantities, tracking number, carrier,
 *                 the email to the buyer); one card per shipment with its
 *                 tracking, Mark as delivered, and in its menu tracking
 *                 changes, a return or cancelling it; the returns, once
 *                 there is one
 *   side column   the shipping address (copied in one press) and the
 *                 delivery the buyer chose and paid for; the buyer's note
 *   timeline      shipped with tracking, delivered, returns, emails and the
 *                 shop's own notes, among the order's other entries
 *                 (lib/orders/timeline physicalEvents)
 *
 * The digital lines of a mixed order keep their own card: only the lines
 * that ship are drawn here. Every action goes to /api/physical/orders/[id]
 * and comes back as the whole order again, so what is drawn is always what
 * the server holds.
 */

import * as React from "react"
import { Check, ClipboardCopy, Clock, Copy, ExternalLink, MapPin, MoreHorizontal, Package, PackageCheck, Printer, Truck, Undo2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressLines } from "@/lib/physical/address"
import { countryName } from "@/lib/checkout/countries"
import { deliveryEstimate } from "@/lib/physical/rates"
import { CARRIERS, RETURN_LABEL, canMoveShipment, guessCarrier, orderNumber, trackingUrl as trackingLink } from "@/lib/physical/status"
import { METHODS, shippedByLabel } from "@/lib/physical/fulfillment"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { NOTE_MAX } from "@/lib/physical/notes"
import { CANCELLED_AT_BUYERS_REQUEST, openCancelRequest } from "@/lib/physical/buyer-cancel"
import type { DeliveryMethod, FulfillmentMethod, FulfillmentStatus, PickupReady, ReturnStatus, ShipmentStatus } from "@/lib/physical/types"
import type { PhysicalHistory } from "@/lib/orders/timeline"
import { reasonLabel } from "@/lib/store/reasons"
import { useReasons } from "@/lib/store/use-reasons"
import { copyText } from "@/lib/platform/copy-text"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { TRACKING_LABEL, isTrackingStatus } from "@/lib/physical/tracking/labels"
import { TrackingTimeline, estimatedDay } from "./tracking-timeline"
import { StatusBadge, buttonPrimary, buttonSecondary, card, iconButton } from "@/app/app/orders/order-parts"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, SelectInput, TextInput, Toggle, actionKey, api, dateTime, money, peekGet, prefetchGet } from "./ui"
import { LabelFields, ShipModeSwitch, useLabelFlow, useOrderLabels, voidLabelRequest } from "./buy-label"
import { tt } from "@/lib/i18n/text"
import type { PaymentState } from "@/lib/physical/cash-on-delivery"

export interface PhysicalLine {
  orderId: string
  title: string
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  type: string
  quantity: number
  unitCents: number
  discountCents: number
  requiresShipping: boolean
  locationId: string | null
  fulfillmentMethod: FulfillmentMethod | null
  fulfilled: number
  returned: number
  amountCents: number
  refundedCents: number
  /** The buyer's words for this line from an imported theme's product form (an engraving). */
  properties?: Record<string, string> | null
}
export interface PhysicalShipment {
  id: string
  status: ShipmentStatus
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  deliveredAt: string | null
  createdAt: string
  locationId: string | null
  items: { orderId: string; quantity: number }[]
  /** Tracked and never marked delivered 60 days after shipping (lib/physical/unconfirmed-delivery-server.ts). */
  unconfirmedAt?: string | null
  /** The carrier's scans and state when Storelib follows the parcel (lib/physical/tracking); mode off when tracking is not set up yet. */
  checkpoints?: { at: string; status: string; message: string; location: string | null }[]
  tracking?: { mode: "auto" | "paused" | "off"; status: string | null; estimatedDelivery: string | null; checkedAt: string | null; providerName: string | null; error: string | null }
}
interface ReturnRec {
  id: string
  status: string
  reason: string
  requestedBy: string
  customerNote: string | null
  merchantNote: string | null
  createdAt: string
  refundedCents: number
  reasonLabel?: string | null
  items: { id: string; orderId: string; quantity: number; restock: boolean; restockedQuantity: number }[]
}
export interface PhysicalOrder {
  id: string
  status: string
  fulfillmentStatus: FulfillmentStatus
  returnStatus: ReturnStatus
  currency: string
  buyerName: string | null
  buyerPhone: string | null
  totalCents: number
  refundedCents: number
  shippingCents: number
  shippingDiscountCents: number
  address: Record<string, any> | null
  delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null; kind?: "ship" | "local"; note?: string | null } | null
  deliveryMethod: DeliveryMethod
  pickup: { locationId: string | null; name: string; address: string[]; instructions: string | null; ready: PickupReady; hours?: string | null } | null
  processingAt: string | null
  buyerNote: string | null
  /** An imported theme's cart attributes: a gift message, a delivery date (SQL part 164). */
  cartAttributes?: Record<string, string>
  merchantNote: string | null
  cancelledAt: string | null
  /** How it is paid (lib/physical/cash-on-delivery.ts): cash still to collect on delivery, or collected. */
  payment?: PaymentState
  cashCollectedAt?: string | null
  lines: PhysicalLine[]
  shipments: PhysicalShipment[]
  returns: ReturnRec[]
  events: { id: number; kind: string; message: string; actor: string; createdAt: string; detail?: Record<string, unknown> | null }[]
}
interface Loc {
  id: string
  name: string
}

/* ─── The order, read and acted on ───────────────────────────────────── */

const pathOf = (orderRowId: string) => `/api/physical/orders/${encodeURIComponent(orderRowId)}`

/**
 * One physical order, by any of its lines' ids: what a row press already
 * read (./ui prefetchGet, from app/app/orders/order-prefetch) on the first
 * frame, then the server's answer. `act` sends one action and draws the
 * order that comes back. A refund made with the Orders page's own dialog
 * bumps `revision`, and the order catches up with it.
 */
export function usePhysicalOrder(orderRowId: string | null, revision = 0) {
  const [data, setData] = React.useState<{ id: string; order: PhysicalOrder; locations: Loc[] } | null>(() => {
    const kept = orderRowId ? peekGet<{ order: PhysicalOrder; locations: Loc[] }>(pathOf(orderRowId)) : null
    return kept && orderRowId ? { id: orderRowId, ...kept } : null
  })
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (!orderRowId) return
    let alive = true
    setError(null)
    const kept = peekGet<{ order: PhysicalOrder; locations: Loc[] }>(pathOf(orderRowId))
    setData((d) => (d?.id === orderRowId ? d : kept ? { id: orderRowId, ...kept } : null))
    void api<{ order: PhysicalOrder; locations: Loc[] }>(pathOf(orderRowId)).then((r) => {
      if (!alive) return
      if (r.ok) setData({ id: orderRowId, order: r.data.order, locations: r.data.locations })
      else setError(r.error)
    })
    return () => {
      alive = false
    }
  }, [orderRowId])

  const order = orderRowId && data?.id === orderRowId ? data.order : null
  const orderId = order?.id ?? null
  React.useEffect(() => {
    if (revision === 0 || !orderId) return
    void api<{ order: PhysicalOrder }>(pathOf(orderId), { body: { action: "refunded" } }).then((r) => {
      if (r.ok) setData((d) => (d && d.order.id === r.data.order.id ? { ...d, order: r.data.order } : d))
    })
  }, [revision]) // eslint-disable-line react-hooks/exhaustive-deps

  const act = React.useCallback(
    async (body: Record<string, unknown>): Promise<string | null> => {
      if (!orderId) return tt("The order is still loading.")
      setBusy(true)
      const r = await api<{ order: PhysicalOrder }>(pathOf(orderId), { body })
      setBusy(false)
      if (!r.ok) return r.error
      if (r.data.order) setData((d) => (d ? { ...d, order: r.data.order } : d))
      return null
    },
    [orderId],
  )

  /* An order that came back from elsewhere (Buy a label, ./buy-label.tsx), drawn as the server holds it. */
  const replace = React.useCallback((next: PhysicalOrder | null | undefined) => {
    if (next) setData((d) => (d && d.order.id === next.id ? { ...d, order: next } : d))
  }, [])

  return { order, locations: order && data ? data.locations : [], error, setError, busy, act, replace }
}
export type PhysicalOrderState = ReturnType<typeof usePhysicalOrder>

/** Read ahead of a row press (app/app/orders/order-prefetch), so the order draws whole on its first frame. */
export function prefetchPhysicalOrder(orderRowId: string): void {
  prefetchGet([pathOf(orderRowId)])
}

/** What the order's timeline draws from a physical order (lib/orders/timeline physicalEvents). */
export function historyOf(order: PhysicalOrder): PhysicalHistory {
  return { pickup: order.deliveryMethod === "pickup", shipments: order.shipments, events: order.events }
}

/* ─── Main column: to fulfil, shipments, returns ─────────────────────── */

const lineName = (l: PhysicalLine) => `${l.title}${l.variantName ? `, ${l.variantName}` : ""}`
const countLabel = (n: number) => tt("{n, plural, one {# item} other {# items}}", { n })

type Dialog = { fulfil: { lines: string[]; locationId: string | null } } | { tracking: PhysicalShipment } | "return" | "cancel" | null

export function PhysicalFulfillment({
  state,
  number: shown,
  className,
  onNotice,
  onRefund,
  onRefundAll,
}: {
  state: PhysicalOrderState
  /** The order's number on the Orders page (#1004), for each shipment's own (#1004-F1). */
  number?: number
  className?: string
  onNotice?: (message: string) => void
  /** Opens the order's Refund dialog: a received return offers it, and the refund is counted on that return (noteRefund). */
  onRefund?: (() => void) | null
  /** Refunds every paid line in full, through the Orders page's own refund: a buyer's cancel request said yes to. Absent for a team member. */
  onRefundAll?: (() => Promise<string>) | null
}) {
  const { order, locations, error, setError, busy, act, replace } = state
  const [dialog, setDialog] = React.useState<Dialog>(null)
  /* Labels bought with Shippo or EasyPost, read again whenever a shipment comes or goes: printed and voided from the shipment's card. */
  const [labels, setLabels] = useOrderLabels(order?.id ?? null, order ? order.shipments.map((x) => `${x.id}:${x.status}`).join(",") : "")

  if (!order) {
    if (error) return <Notice className={className}>{error}</Notice>
    return (
      <section className={cn(card, "min-w-0 px-4 py-3.5", className)} aria-busy="true" data-physical-loading="">
        <div className="h-[22px] w-28 animate-pulse rounded-[7px] bg-[#f1f2f4]" />
        <div className="mt-4 flex items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-lg bg-[#f1f2f4]" />
          <div className="h-3 flex-1 animate-pulse rounded bg-[#f1f2f4]" />
        </div>
        <div className="mt-4 ml-auto h-8 w-28 animate-pulse rounded-lg bg-[#f1f2f4]" />
      </section>
    )
  }

  const pickup = order.deliveryMethod === "pickup"
  const request = openCancelRequest(order)
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null
  const unfulfilled = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
  /* Who sends what, and from where: one card per method and place, each fulfilled on its own. */
  const groups = new Map<string, { method: FulfillmentMethod; locationId: string | null; lines: PhysicalLine[] }>()
  for (const l of unfulfilled) {
    const method = pickup ? "self" : (l.fulfillmentMethod ?? "self")
    const key = `${method}:${pickup ? "pickup" : (l.locationId ?? "")}`
    const g = groups.get(key) ?? { method, locationId: pickup ? (order.pickup?.locationId ?? null) : l.locationId, lines: [] }
    g.lines.push(l)
    groups.set(key, g)
  }
  const canFulfil = !order.cancelledAt && order.status !== "refunded" && order.status !== "pending"
  const returnable = order.status !== "refunded" && order.lines.some((l) => (l.requiresShipping ? l.fulfilled : l.quantity) - l.returned > 0)
  const run = async (body: Record<string, unknown>, done?: string) => {
    const e = await act(body)
    setError(e)
    if (!e && done) onNotice?.(done)
  }
  const live = order.shipments.filter((s) => s.status !== "cancelled")
  const number = (s: PhysicalShipment) => `${shown ? `#${shown}` : orderNumber(order.id)}-F${order.shipments.indexOf(s) + 1}`

  return (
    <div className={cn("grid min-w-0 gap-4", className)} data-physical-order="">
      {order.cancelledAt ? (
        <Notice tone="gray">
          {order.payment === "cod_due" ? tt("This order was cancelled and its stock released. It was to be paid in cash on delivery, so there is nothing to refund.") : tt("This order was cancelled and its stock released. Refund the payment with Refund if you haven't.")}
        </Notice>
      ) : null}

      {/* Paid in cash when it arrives (lib/physical/cash-on-delivery.ts): the shop marks the cash received here. */}
      {!order.cancelledAt && order.payment === "cod_due" ? (
        <section className={cn(card, "min-w-0 px-4 py-3.5")} data-cash-due="">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="attention">{tt("Cash on delivery")}</StatusBadge>
          </div>
          <p className="mt-2 text-[13.5px] leading-5 text-[#1a1a2e]">
            {pickup ? tt("{amount} to collect when it's picked up.", { amount: money(order.totalCents - order.refundedCents, order.currency) }) : tt("{amount} to collect when it's delivered.", { amount: money(order.totalCents - order.refundedCents, order.currency) })}
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {/* The buyer would not pay, or it could not be delivered: nothing to refund, and what went out comes back as a return. */}
            <button
              type="button"
              className={cn(buttonSecondary, "h-9 sm:h-8")}
              disabled={busy}
              data-cash-refused=""
              onClick={() => {
                if (!window.confirm(pickup ? tt("Mark this order as not picked up? It is cancelled, nothing is refunded, and its stock goes back.") : tt("Mark this order as refused on delivery? It is cancelled, nothing is refunded, and what was sent comes back as a return."))) return
                void run({ action: "cash_refused" }, tt("Marked as refused"))
              }}
            >
              {pickup ? tt("Not picked up") : tt("Refused on delivery")}
            </button>
            <button
              type="button"
              className={cn(buttonPrimary, "h-9 sm:h-8")}
              disabled={busy}
              data-cash-collected=""
              onClick={() => {
                if (!window.confirm(tt("Mark this order as paid? Only do this once you have the cash."))) return
                void run({ action: "cash_collected" }, tt("Marked as paid"))
              }}
            >
              {tt("Mark as paid")}
            </button>
          </div>
        </section>
      ) : null}
      {order.payment === "cod_collected" && order.cashCollectedAt ? (
        <p className="px-1 text-[13px] leading-5 text-[#6b7280]" data-cash-paid="">
          {tt("Paid in cash on {date}", { date: dateTime(order.cashCollectedAt) })}
        </p>
      ) : null}

      {/* The buyer pressed Cancel order on their order page (lib/physical/buyer-cancel.ts): the shop's answer, here. */}
      {request ? (
        <section className={cn(card, "min-w-0 px-4 py-3.5")} data-cancel-request="">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="attention">{tt("Cancel requested")}</StatusBadge>
            <span className="text-[12px] text-[#6b7280]">{dateTime(request.at)}</span>
          </div>
          <p className="mt-2 text-[13.5px] leading-5 text-[#1a1a2e]">{order.buyerName?.trim() || tt("The buyer")} {tt("asked to cancel this order before it ships. Don't send it yet.")}</p>
          {request.reason ? <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("Reason: {reason}", { reason: request.reason })}</p> : null}
          {order.events.some((e) => e.kind === "fulfillment.forwarded") ? <p className="mt-1 text-[13px] leading-5 text-[#b45309]">{tt("It was already sent to your print partner. Cancel it there too.")}</p> : null}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className={cn(buttonSecondary, "h-9 sm:h-8")} disabled={busy} data-cancel-keep="" onClick={() => void run({ action: "cancel_decline" }, tt("Order kept. Let the buyer know you're sending it."))}>
              {tt("Keep order")}
            </button>
            <button
              type="button"
              className={cn(buttonPrimary, "h-9 sm:h-8")}
              disabled={busy}
              data-cancel-approve=""
              onClick={async () => {
                if (!window.confirm(onRefundAll ? tt("Cancel this order and refund the buyer in full? Its stock goes back on sale.") : tt("Cancel this order? Its stock goes back on sale. The owner refunds it."))) return
                const e = await act({ action: "cancel", reason: CANCELLED_AT_BUYERS_REQUEST })
                if (e) return setError(e)
                onNotice?.(onRefundAll ? await onRefundAll() : tt("Order cancelled. The buyer was emailed."))
              }}
            >
              {onRefundAll ? tt("Cancel and refund") : tt("Cancel order")}
            </button>
          </div>
        </section>
      ) : null}

      {[...groups.values()].map((g, gi) => {
        const left = g.lines.reduce((n, l) => n + l.quantity - l.fulfilled, 0)
        const from = pickup ? tt("Pickup at {value}", { value: order.pickup?.name ?? tt("your location") }) : g.method === "self" ? (locName(g.locationId) ? tt("Ships from {name}", { name: locName(g.locationId) }) : tt("Shipped by you")) : shippedByLabel(g.method, locName(g.locationId))
        const menu: ActionMenuItem[] = [
          { label: tt("Packing slip"), icon: <Printer className="h-4 w-4" />, onClick: () => printSlip(order, g.lines) },
          ...(gi === 0 && canFulfil && live.length === 0
            ? [order.processingAt
                ? { label: tt("Back to unfulfilled"), icon: <Undo2 className="h-4 w-4" />, onClick: () => void run({ action: "processing", on: false }) }
                : { label: tt("Mark as in progress"), icon: <Clock className="h-4 w-4" />, onClick: () => void run({ action: "processing", on: true }, tt("Marked as in progress")) }]
            : []),
          ...(gi === 0 && !order.cancelledAt && live.length === 0 ? [{ label: tt("Cancel order"), icon: <X className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setDialog("cancel") }] : []),
        ]
        return (
          <section key={`${g.method}:${g.locationId}`} className={cn(card, "min-w-0")} data-ship-group={g.method} data-unfulfilled-card="">
            <CardTop
              badge={<StatusBadge tone="attention">{order.processingAt ? tt("In progress") : tt("Unfulfilled")}</StatusBadge>}
              count={left}
              sub={from}
              menu={<CardMenu title={tt("Unfulfilled")} items={menu} />}
            />
            <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
              {g.lines.map((l) => (
                <LineRow key={l.orderId} line={l} quantity={l.quantity - l.fulfilled} currency={order.currency} />
              ))}
            </ul>
            {g.method !== "self" && !pickup ? <p className="mx-4 mt-3 text-[12px] leading-[17px] text-[#6b7280]">{METHODS[g.method].afterSale}</p> : null}
            <div className="flex justify-end px-4 py-3">
              <button
                type="button"
                className={cn(buttonPrimary, "h-9 sm:h-8")}
                onClick={() => setDialog({ fulfil: { lines: g.lines.map((l) => l.orderId), locationId: g.locationId } })}
                disabled={busy || !canFulfil}
                data-fulfil=""
              >
                {pickup ? tt("Mark ready for pickup") : tt("Fulfill items")}
              </button>
            </div>
          </section>
        )
      })}

      {order.shipments.map((s) => {
        const items = s.items.reduce((n, i) => n + i.quantity, 0)
        const cancelled = s.status === "cancelled"
        const delivered = s.status === "delivered"
        const problem = s.status === "failed"
        const badge = cancelled ? (
          <StatusBadge tone="neutral">{tt("Cancelled")}</StatusBadge>
        ) : problem ? (
          <StatusBadge tone="critical">{tt("Delivery problem")}</StatusBadge>
        ) : s.unconfirmedAt && !delivered ? (
          <StatusBadge tone="attention">{tt("Delivery not confirmed")}</StatusBadge>
        ) : delivered ? (
          <StatusBadge tone="success">{pickup ? tt("Picked up") : tt("Delivered")}</StatusBadge>
        ) : (
          <StatusBadge tone="success">{pickup ? tt("Ready for pickup") : tt("Fulfilled")}</StatusBadge>
        )
        const transit = s.status === "in_transit" ? tt("In transit") : s.status === "out_for_delivery" ? tt("Out for delivery") : s.status === "failed" ? tt("Delivery problem") : null
        const label = labels.find((l) => l.fulfillmentId === s.id && l.status !== "voided") ?? null
        const labelUnused = !!label && (label.status === "purchased" || label.status === "void_rejected") && (s.status === "shipped" || s.status === "pending" || s.status === "submitted")
        const menu: ActionMenuItem[] = cancelled
          ? []
          : [
              ...(label?.labelUrl && label.status === "purchased" ? [{ label: tt("Print label"), icon: <Printer className="h-4 w-4" />, onClick: () => window.open(label.labelUrl!, "_blank", "noopener") }] : []),
              ...(labelUnused
                ? [{
                    label: tt("Void label"),
                    icon: <X className="h-4 w-4" />,
                    onClick: async () => {
                      if (!window.confirm(tt("Void this {providerName} label? {cost} is refunded once the carrier agrees it wasn't used, and the items go back to unfulfilled.", { providerName: label!.providerName, cost: label!.cost }))) return
                      const r = await voidLabelRequest(order.id, label!.id)
                      if (r.ok === false) return setError(r.error)
                      replace(r.order)
                      setLabels(labels.map((l) => (l.id === r.label.id ? r.label : l)))
                      onNotice?.(r.label.status === "voided" ? tt("Label voided and refunded") : tt("Label void requested"))
                    },
                  }]
                : []),
              ...(!pickup && !delivered ? [{ label: s.trackingNumber ? tt("Edit tracking") : tt("Add tracking"), icon: <Truck className="h-4 w-4" />, onClick: () => setDialog({ tracking: s }) }] : []),
              /* Where the parcel is, set by hand when no carrier reports it: each step a buyer reads on their order page, the last two emailed. */
              ...(!pickup && (s.status === "shipped" || s.status === "submitted" || s.status === "pending" || s.status === "failed") ? [{ label: tt("Mark as in transit"), icon: <Truck className="h-4 w-4" />, onClick: () => void run({ action: "shipment", fulfillmentId: s.id, status: "in_transit" }, tt("Marked as in transit")) }] : []),
              ...(!pickup && (s.status === "shipped" || s.status === "submitted" || s.status === "pending" || s.status === "in_transit" || s.status === "failed") ? [{ label: tt("Mark as out for delivery"), icon: <Truck className="h-4 w-4" />, onClick: () => void run({ action: "shipment", fulfillmentId: s.id, status: "out_for_delivery" }, tt("Marked as out for delivery. The buyer was emailed.")) }] : []),
              ...(!pickup && !delivered && s.status !== "failed" ? [{ label: tt("Report a delivery problem"), icon: <X className="h-4 w-4" />, onClick: () => { if (window.confirm(tt("Mark this package as having a delivery problem? The buyer sees it on their order page."))) void run({ action: "shipment", fulfillmentId: s.id, status: "failed" }, tt("Marked as a delivery problem")) } }] : []),
              /* Courier tracking moves this shipment by itself; the seller can stop that for this one parcel and set it by hand. */
              ...(!pickup && !delivered && s.tracking?.mode === "auto" ? [{ label: tt("Pause automatic updates"), icon: <Clock className="h-4 w-4" />, onClick: () => void run({ action: "tracking_auto", fulfillmentId: s.id, on: false }, tt("Automatic updates paused for this package")) }] : []),
              ...(!pickup && !delivered && s.tracking?.mode === "paused" ? [{ label: tt("Resume automatic updates"), icon: <Clock className="h-4 w-4" />, onClick: () => void run({ action: "tracking_auto", fulfillmentId: s.id, on: true }, tt("Automatic updates on again")) }] : []),
              ...(returnable ? [{ label: tt("Start return"), icon: <Undo2 className="h-4 w-4" />, onClick: () => setDialog("return") }] : []),
              { label: tt("Packing slip"), icon: <Printer className="h-4 w-4" />, onClick: () => printSlip(order, s.items.map((i) => ({ ...order.lines.find((l) => l.orderId === i.orderId)!, quantity: i.quantity, fulfilled: 0 })).filter((l) => l.title)) },
              /* Only while the parcel is still with the shop (lib/physical/status canMoveShipment): one the carrier has comes back as a return. */
              ...(canMoveShipment(s.status, "cancelled")
                ? [{
                    label: pickup ? tt("Not ready after all") : tt("Cancel fulfillment"),
                    icon: <X className="h-4 w-4" />,
                    variant: "destructive" as const,
                    separatorBefore: true,
                    onClick: () => {
                      if (!window.confirm(pickup ? tt("Undo ready for pickup? The items go back to unfulfilled.") : tt("Cancel this fulfillment? Its items go back to unfulfilled and back in stock."))) return
                      void run({ action: "shipment", fulfillmentId: s.id, status: "cancelled", notifyBuyer: false }, tt("Fulfillment cancelled"))
                    },
                  }]
                : []),
            ]
        return (
          <section key={s.id} className={cn(card, "min-w-0", cancelled && "opacity-60")} data-shipment={s.status}>
            <CardTop badge={badge} count={items} sub={[number(s), s.shippedAt ? dateTime(s.shippedAt) : null, locName(s.locationId)].filter(Boolean).join(" · ")} menu={menu.length ? <CardMenu title={number(s)} items={menu} /> : null} />
            {!pickup && !cancelled ? <TrackingRow shipment={s} transit={problem ? null : transit} onAdd={() => setDialog({ tracking: s })} onNotice={onNotice} /> : null}
            {!pickup && !cancelled && s.tracking ? <CarrierUpdates shipment={s} /> : null}
            {label && !cancelled ? (
              <p className="mx-4 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-[18px] text-[#6b7280]" data-shipment-label={label.status}>
                <span>
                  {tt("{providerName} label · {cost} your cost", { providerName: label.providerName, cost: label.cost })}{label.testMode ? tt(" · test") : ""}
                  {label.status === "void_pending" ? tt(" · void requested") : label.status === "void_rejected" ? tt(" · void refused") : ""}
                </span>
                {label.labelUrl && label.status === "purchased" ? (
                  <a href={label.labelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-[#1a1a2e] underline-offset-2 hover:underline" data-shipment-label-print="">
                    <Printer className="h-3.5 w-3.5" aria-hidden />
                    {tt("Print label")}
                  </a>
                ) : null}
              </p>
            ) : null}
            {/* What the buyer reads on their order page and in the Delivery problem email, said here in the shop's words, with the next step. */}
            {problem ? (
              <p className="mx-4 mt-2 rounded-lg bg-[#fef3f2] px-3 py-2 text-[12.5px] leading-[18px] text-[#b42318]" data-delivery-problem="">
                {tt("The carrier reported a problem delivering this package. The buyer sees it and gets the Delivery problem email. Contact them or the carrier, then mark it in transit or delivered when it moves.")}
              </p>
            ) : null}
            {s.unconfirmedAt && !delivered && !problem && !cancelled ? (
              <p className="mx-4 mt-2 rounded-lg bg-[#fffaeb] px-3 py-2 text-[12.5px] leading-[18px] text-[#93370d]" data-delivery-unconfirmed="">
                {tt("Shipped 60 days ago and never marked delivered. Check with the carrier or the buyer, then mark it delivered or report a delivery problem.")}
              </p>
            ) : null}
            {pickup && !cancelled && order.pickup ? <p className="px-4 pt-2 text-[13px] text-[#4b5563]">{tt("At {name}", { name: order.pickup.name })}</p> : null}
            <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
              {s.items.map((i) => {
                const l = order.lines.find((x) => x.orderId === i.orderId)
                return l ? <LineRow key={i.orderId} line={l} quantity={i.quantity} currency={order.currency} /> : null
              })}
            </ul>
            {!cancelled && !delivered ? (
              <div className="flex justify-end px-4 py-3">
                <button
                  type="button"
                  className={cn(buttonSecondary, "h-9 sm:h-8")}
                  disabled={busy}
                  data-mark-delivered=""
                  onClick={() => void run({ action: "shipment", fulfillmentId: s.id, status: "delivered" }, pickup ? tt("Marked as picked up") : tt("Marked as delivered"))}
                >
                  {pickup ? <Check className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
                  {pickup ? tt("Mark picked up") : tt("Mark as delivered")}
                </button>
              </div>
            ) : delivered && s.deliveredAt ? (
              <p className="px-4 py-3 text-[12px] text-[#6b7280]">
                {pickup ? tt("Picked up") : tt("Delivered")} {dateTime(s.deliveredAt)}
              </p>
            ) : (
              <div className="h-3" />
            )}
          </section>
        )
      })}

      {error ? <Notice>{error}</Notice> : null}

      {order.returns.length > 0 ? <ReturnsCard order={order} busy={busy} onRefund={onRefund} onMove={(returnId, status, extra) => void run({ action: "return_move", returnId, status, ...extra })} /> : null}

      {dialog && typeof dialog === "object" && "fulfil" in dialog ? (
        <FulfilDialog
          order={order}
          only={dialog.fulfil.lines}
          from={pickup ? (order.pickup?.name ?? null) : locName(dialog.fulfil.locationId)}
          locationId={dialog.fulfil.locationId}
          onLabel={(next, label) => {
            replace(next)
            setLabels([...labels.filter((l) => l.id !== label.id), label])
            onNotice?.(tt("Label bought. The items are marked shipped."))
          }}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const e = await act({ action: "fulfil", locationId: dialog.fulfil.locationId, ...body })
            if (!e) {
              setDialog(null)
              onNotice?.(pickup ? tt("Marked ready for pickup") : tt("Items fulfilled"))
            }
            return e
          }}
        />
      ) : null}
      {dialog === "return" ? <ReturnDialog order={order} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "return", ...body }); if (!e) { setDialog(null); onNotice?.(tt("Return opened")) } return e }} /> : null}
      {dialog === "cancel" ? <CancelDialog onClose={() => setDialog(null)} onSubmit={async (reason) => { const e = await act({ action: "cancel", reason }); if (!e) { setDialog(null); onNotice?.(tt("Order cancelled")) } return e }} /> : null}
      {dialog && typeof dialog === "object" && "tracking" in dialog ? <TrackingDialog shipment={dialog.tracking} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "shipment", fulfillmentId: dialog.tracking.id, ...body }); if (!e) { setDialog(null); onNotice?.(tt("Tracking saved")) } return e }} /> : null}
    </div>
  )
}

function CardTop({ badge, count, sub, menu }: { badge: React.ReactNode; count: number; sub: string; menu: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 px-4 pt-3">
      <div className="min-w-0">
        <div className="flex min-h-8 items-center gap-2">
          {badge}
          <span className="text-[12px] tabular-nums text-[#6b7280]">{countLabel(count)}</span>
        </div>
        <p className="truncate text-[12px] leading-4 text-[#6b7280]">{sub}</p>
      </div>
      {menu}
    </div>
  )
}

function CardMenu({ title, items }: { title: string; items: ActionMenuItem[] }) {
  return (
    <ResponsiveActionMenu
      title={title}
      items={items}
      menuWidth="w-52"
      trigger={
        <button type="button" aria-label={`${title}: more actions`} className={cn(iconButton, "-mr-1.5 shrink-0")}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      }
    />
  )
}

/** The carrier and number, the link to follow it, and a copy of the number: what a shop is asked for most. */
function TrackingRow({ shipment: s, transit, onAdd, onNotice }: { shipment: PhysicalShipment; transit: string | null; onAdd: () => void; onNotice?: (m: string) => void }) {
  if (!s.trackingNumber) {
    return (
      <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-lg bg-[#f7f7f8] px-3 py-2">
        <span className="text-[12px] text-[#6b7280]">{transit ? tt("{transit}, no tracking number", { transit }) : tt("No tracking number")}</span>
        <button type="button" onClick={onAdd} className="text-[12px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
          {tt("Add tracking")}
        </button>
      </div>
    )
  }
  return (
    <div className="mx-4 mt-2 flex items-center gap-2 rounded-lg bg-[#f7f7f8] py-1.5 pl-3 pr-1.5" data-tracking="">
      <Truck className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[#1a1a2e]">
          {s.carrier ? `${s.carrier} ` : ""}
          <span className="font-mono text-[12px] font-normal">{s.trackingNumber}</span>
        </p>
        {transit ? <p className="text-[11.5px] text-[#6b7280]">{transit}</p> : null}
      </div>
      <button
        type="button"
        aria-label={tt("Copy tracking number")}
        title={tt("Copy tracking number")}
        className={cn(iconButton, "h-7 w-7 shrink-0")}
        onClick={async () => onNotice?.((await copyText(s.trackingNumber!)) ? tt("Tracking number copied") : tt("Could not copy the tracking number"))}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {s.trackingUrl ? (
        <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "h-7 shrink-0 px-2.5 text-[12px]")}>
          {tt("Track")}
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  )
}

/**
 * What the carrier says about the parcel (lib/physical/tracking): its state, the estimated delivery and its scans,
 * Updated automatically while Storelib follows it; paused, or not set up yet, said plainly, with the statuses still the
 * seller's to set from the menu.
 */
function CarrierUpdates({ shipment: s }: { shipment: PhysicalShipment }) {
  const t = s.tracking!
  const delivered = s.status === "delivered"
  const said = t.status && isTrackingStatus(t.status) ? TRACKING_LABEL[t.status].label : null
  const eta = delivered ? null : estimatedDay(t.estimatedDelivery)
  const checked = t.checkedAt ? dateTime(t.checkedAt) : null
  if (t.mode === "off") {
    if (delivered) return null
    return (
      <p className="mx-4 mt-2 text-[12px] leading-[17px] text-[#6b7280]" data-tracking-mode="off">
        {tt("Automatic updates turn on when Storelib's tracking is set up. Until then, set the status from the menu.")}
      </p>
    )
  }
  return (
    <div className="mx-4 mt-2" data-tracking-mode={t.mode}>
      <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] leading-[17px] text-[#6b7280]">
        {t.mode === "auto" ? (
          <span className="inline-flex items-center gap-1 font-medium text-[#166534]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16a34a]" />
            {tt("Updated automatically")}
          </span>
        ) : (
          <span className="font-medium text-[#92400e]">{tt("Automatic updates paused")}</span>
        )}
        {said ? <span>· {said}</span> : t.mode === "auto" && !checked ? <span>· {tt("Checking with the carrier")}</span> : null}
        {eta ? <span>· {tt("Estimated delivery {eta}", { eta })}</span> : null}
        {checked && t.mode === "auto" && !delivered ? <span className="text-[#9ca3af]">· {tt("Checked {checked}", { checked })}</span> : null}
      </p>
      {t.error && t.mode === "auto" && !delivered ? <p className="mt-1 text-[12px] leading-[17px] text-[#92400e]">{tt("The carrier couldn't be read last time: {error} Storelib tries again.", { error: t.error })}</p> : null}
      {s.checkpoints && s.checkpoints.length > 0 ? <TrackingTimeline checkpoints={s.checkpoints} size="seller" className="mt-2 rounded-lg border border-[#f0f1f3] px-3 py-2.5" /> : null}
    </div>
  )
}

function LineRow({ line, quantity, currency }: { line: PhysicalLine; quantity: number; currency: string }) {
  /* What one unit sold for, its share of the line's discount taken off. */
  const unit = line.quantity > 0 ? Math.max(0, Math.round((line.unitCents * line.quantity - (line.discountCents || 0)) / line.quantity)) : line.unitCents
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#eceef1] bg-[#f4f5f7]">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" width={44} height={44} decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[#9ca3af]">
            <Package className="h-4 w-4" />
          </div>
        )}
        {quantity > 1 ? <span className="absolute -right-0 -top-0 rounded-bl-md bg-[#1a1a2e] px-1 text-[10px] font-semibold leading-[14px] text-white">{quantity}</span> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#1a1a2e]">{line.title}</p>
        {line.variantName || line.sku ? <p className="truncate text-[12px] text-[#6b7280]">{[line.variantName, line.sku ? tt("SKU {sku}", { sku: line.sku }) : null].filter(Boolean).join(" · ")}</p> : null}
      </div>
      <span className="hidden text-[13px] tabular-nums text-[#6b7280] sm:inline">
        {money(unit, currency)} &times; {quantity}
      </span>
      <span className="w-[76px] text-right text-[13px] font-medium tabular-nums text-[#1a1a2e]">
        <span className="sm:hidden">&times; {quantity}</span>
        <span className="hidden sm:inline">{money(unit * quantity, currency)}</span>
      </span>
    </li>
  )
}

/* ─── Side column: where it goes ─────────────────────────────────────── */

/** The shipping address, copied in one press, and the delivery the buyer chose and paid for. */
export function ShippingCard({
  order,
  onNotice,
  onEditAddress,
  className,
}: {
  order: PhysicalOrder | null
  onNotice?: (m: string) => void
  /** Change the address before anything ships (lib/physical/orders-server updateAddress); null where the page can't. */
  onEditAddress?: ((address: Record<string, string>, notifyBuyer: boolean) => Promise<string | null>) | null
  className?: string
}) {
  const [editing, setEditing] = React.useState(false)
  if (!order) return <section className={cn(card, "h-[148px] animate-pulse", className)} aria-busy="true" />
  const pickup = order.deliveryMethod === "pickup"
  const lines = addressLines(order.address as any)
  const paid = order.shippingCents - order.shippingDiscountCents
  /* Only while nothing has gone out: after that the parcel is the carrier's to redirect. */
  const editable = !!onEditAddress && !pickup && !order.cancelledAt && !order.shipments.some((x) => x.status !== "cancelled") && order.lines.some((l) => l.requiresShipping)
  return (
    <section className={cn(card, "px-4 py-3.5", className)} data-shipping-card="">
      {pickup && order.pickup ? (
        <>
          <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Pickup at")}</h2>
          <p className="mt-2 text-[13px] leading-[19px] text-[#303036]">
            {[order.pickup.name, ...order.pickup.address].map((l, i) => (
              <span key={`${i}:${l}`} className="block">
                {l}
              </span>
            ))}
          </p>
          <p className="mt-1 text-[12px] text-[#6b7280]">{PICKUP_READY_LABEL[order.pickup.ready]}</p>
          {order.pickup.hours ? <p className="text-[12px] text-[#6b7280]">{tt("Open {hours}", { hours: order.pickup.hours })}</p> : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Shipping address")}</h2>
            <span className="-mr-1.5 flex items-center">
            {editable ? (
              <button type="button" onClick={() => setEditing(true)} className="h-7 rounded-md px-2 text-[12.5px] font-medium text-[#4b5563] transition-colors hover:bg-[#f4f4f6] hover:text-[#1a1a2e]" data-edit-address="">
                {tt("Edit")}
              </button>
            ) : null}
            {lines.length ? (
              <button
                type="button"
                aria-label={tt("Copy shipping address")}
                title={tt("Copy shipping address")}
                className={cn(iconButton, "h-7 w-7")}
                onClick={async () => onNotice?.((await copyText(lines.join("\n"))) ? tt("Address copied") : tt("Could not copy the address"))}
                data-copy-address=""
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            ) : null}
            </span>
          </div>
          {lines.length ? (
            <address className="mt-1.5 text-[13px] not-italic leading-[19px] text-[#303036]">
              {lines.map((l, i) => (
                <span key={`${i}:${l}`} className="block">
                  {l}
                </span>
              ))}
            </address>
          ) : (
            <p className="mt-1.5 text-[13px] text-[#9ca3af]">{tt("No address")}</p>
          )}
          {lines.length && order.address?.country ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.filter((l) => l !== order.address?.phone && l !== order.address?.name).join(", "))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#6d4ae0] hover:underline"
            >
              <MapPin className="h-3 w-3" />
              {tt("View map")}
            </a>
          ) : null}
        </>
      )}
      <div className="mt-3 border-t border-[#f0f1f3] pt-3">
        <h3 className="text-[12px] font-medium text-[#6b7280]">{pickup ? tt("Delivery") : tt("Shipping method")}</h3>
        <p className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-[#303036]" data-shipping-method="">
          <span className="min-w-0 truncate">{pickup ? tt("Local pickup") : (order.delivery?.name ?? tt("Not recorded"))}</span>
          <span className="shrink-0 tabular-nums">{pickup || paid <= 0 ? "Free" : money(paid, order.currency)}</span>
        </p>
        {!pickup && order.delivery && deliveryEstimate(order.delivery) ? <p className="text-[12px] text-[#6b7280]">{deliveryEstimate(order.delivery)}</p> : null}
        {order.delivery?.kind === "local" ? <p className="text-[12px] text-[#6b7280]" data-local-delivery="">{tt("You deliver this one yourself. Mark it delivered when it's handed over.")}</p> : null}
      </div>
      {editable && onEditAddress ? (
        <AddressEditor
          open={editing}
          address={(order.address ?? {}) as Record<string, unknown>}
          onClose={() => setEditing(false)}
          onSave={async (address, notify) => {
            const problem = await onEditAddress(address, notify)
            if (!problem) {
              setEditing(false)
              onNotice?.(notify ? tt("Address saved. The buyer was emailed.") : tt("Address saved"))
            }
            return problem
          }}
        />
      ) : null}
    </section>
  )
}

/**
 * EDIT SHIPPING ADDRESS. The fields the checkout asked, filled with what the
 * buyer typed; the country is shown, not changed (shipping and tax were
 * priced for it). "Email the buyer" is on: they are told the new address
 * (Order updated), so a change they didn't ask for is caught before it ships.
 */
function AddressEditor({
  open,
  address,
  onClose,
  onSave,
}: {
  open: boolean
  address: Record<string, unknown>
  onClose: () => void
  onSave: (address: Record<string, string>, notifyBuyer: boolean) => Promise<string | null>
}) {
  const start = React.useCallback(
    () => ({
      name: String(address.name ?? ""),
      company: String(address.company ?? ""),
      line1: String(address.line1 ?? ""),
      line2: String(address.line2 ?? ""),
      city: String(address.city ?? ""),
      region: String(address.region ?? ""),
      postalCode: String(address.postalCode ?? ""),
      phone: String(address.phone ?? ""),
      country: String(address.country ?? ""),
    }),
    [address],
  )
  const [form, setForm] = React.useState(start)
  const [notify, setNotify] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    if (open) {
      setForm(start())
      setError(null)
      setNotify(true)
    }
  }, [open, start])
  const set = (k: keyof ReturnType<typeof start>) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    setBusy(true)
    setError(null)
    const problem = await onSave(form, notify)
    setBusy(false)
    if (problem) setError(problem)
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tt("Edit shipping address")}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void save()} data-save-address="">
            {busy ? tt("Saving") : tt("Save")}
          </button>
        </div>
      }
    >
      <div className="space-y-3" data-address-editor="">
        <Field label={tt("Name")}>
          <TextInput value={form.name} onChange={set("name")} autoComplete="off" maxLength={120} />
        </Field>
        {form.company || address.company ? (
          <Field label={tt("Company")}>
            <TextInput value={form.company} onChange={set("company")} autoComplete="off" maxLength={120} />
          </Field>
        ) : null}
        <Field label={tt("Address")}>
          <TextInput value={form.line1} onChange={set("line1")} autoComplete="off" maxLength={200} />
        </Field>
        <Field label={tt("Apartment, suite, etc.")}>
          <TextInput value={form.line2} onChange={set("line2")} autoComplete="off" maxLength={200} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tt("City")}>
            <TextInput value={form.city} onChange={set("city")} autoComplete="off" maxLength={120} />
          </Field>
          <Field label={tt("Region")}>
            <TextInput value={form.region} onChange={set("region")} autoComplete="off" maxLength={120} />
          </Field>
          <Field label={tt("Postal code")}>
            <TextInput value={form.postalCode} onChange={set("postalCode")} autoComplete="off" maxLength={20} />
          </Field>
        </div>
        <Field label={tt("Phone")}>
          <TextInput value={form.phone} onChange={set("phone")} autoComplete="off" inputMode="tel" maxLength={40} />
        </Field>
        <p className="text-[12.5px] text-[#6b7280]">
          {tt("Country:")} {form.country ? countryName(form.country) : tt("Not recorded")}{tt(". It stays the same: shipping and tax were worked out for it at checkout.")}
        </p>
        <Toggle label={tt("Email the buyer the new address")} checked={notify} onChange={setNotify} />
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

/**
 * What the buyer wrote at checkout, what the shop's cart asked them (an
 * imported theme's cart attributes and each line's properties), and the
 * shop's older single note. Only when there is one.
 */
export function BuyerNoteCard({ order, className }: { order: PhysicalOrder | null; className?: string }) {
  const attributes = Object.entries(order?.cartAttributes ?? {})
  const lineProps = (order?.lines ?? []).filter((l) => l.properties && Object.keys(l.properties).length)
  if (!order || (!order.buyerNote && !order.merchantNote && !attributes.length && !lineProps.length)) return null
  return (
    <section className={cn(card, "px-4 py-3.5", className)} data-order-notes="">
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Notes")}</h2>
      {order.buyerNote ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">{tt("From the buyer")}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[#303036]">{order.buyerNote}</p>
        </>
      ) : null}
      {attributes.length ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">{tt("From the cart")}</p>
          <dl className="mt-0.5 space-y-0.5 text-[13px]" data-order-attributes="">
            {attributes.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-1.5">
                <dt className="text-[#6b7280]">{k}:</dt>
                <dd className="min-w-0 whitespace-pre-wrap break-words text-[#303036]">{v}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}
      {lineProps.length ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">{tt("On the items")}</p>
          <ul className="mt-0.5 space-y-1 text-[13px]" data-order-line-properties="">
            {lineProps.map((l) => (
              <li key={l.orderId} className="break-words text-[#303036]">
                <span className="font-medium">{l.title}</span>
                {l.variantName ? `, ${l.variantName}` : ""}:{" "}
                {Object.entries(l.properties ?? {})
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {order.merchantNote ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">{tt("Yours")}</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[#303036]">{order.merchantNote}</p>
        </>
      ) : null}
    </section>
  )
}

/* ─── The timeline's note box ────────────────────────────────────────── */

/**
 * Shopify's "Leave a comment", under the timeline's last entry: a note only
 * the shop sees, posted to the order's history where it happened. Enter
 * with Cmd or Ctrl posts; Enter alone is a new line.
 */
export function NoteComposer({ onPost }: { onPost: (text: string, key: string) => Promise<string | null> }) {
  const [text, setText] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const key = React.useRef(actionKey())
  const area = React.useRef<HTMLTextAreaElement>(null)
  const post = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    const e = await onPost(t, key.current)
    setBusy(false)
    setError(e)
    if (!e) {
      setText("")
      key.current = actionKey()
      if (area.current) area.current.style.height = ""
    }
  }
  return (
    <div className="mt-1 pb-2" data-note-composer="">
      <div className="rounded-xl border border-[#e3e4e8] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.04)] transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]">
        <textarea
          ref={area}
          value={text}
          rows={1}
          maxLength={NOTE_MAX}
          aria-label={tt("Add a note to this order")}
          placeholder={tt("Add a note")}
          onChange={(e) => {
            setText(e.target.value)
            const el = e.currentTarget
            el.style.height = ""
            el.style.height = `${Math.min(160, el.scrollHeight)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void post()
            }
          }}
          className="block min-h-[40px] w-full resize-none bg-transparent px-3 pt-2.5 text-[16px] leading-5 text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px]"
        />
        <div className="flex items-center justify-between gap-2 px-2 pb-2 pl-3">
          <span className="text-[11.5px] text-[#9ca3af]">{tt("Only you can see notes")}</span>
          <button type="button" className={cn(buttonPrimary, "h-7 px-2.5 text-[12px]")} disabled={!text.trim() || busy} onClick={() => void post()} data-note-post="">
            {busy ? tt("Posting…") : tt("Post")}
          </button>
        </div>
      </div>
      {error ? <p className="mt-1.5 text-[12px] text-[#b42318]">{error}</p> : null}
    </div>
  )
}

/* ─── Dialogs ─────────────────────────────────────────────────────────── */

/** Minus, the number, plus: a thumb's way to choose how many of a line go in this parcel. */
function Stepper({ value, max, onChange, label }: { value: number; max: number; onChange: (n: number) => void; label: string }) {
  const step = "grid h-9 w-9 place-items-center rounded-lg text-[18px] leading-none text-[#1a1a2e] transition-colors hover:bg-[#f1f2f4] active:bg-[#e8e9ec] disabled:opacity-30 sm:h-8 sm:w-8"
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-xl border border-[#e3e4e8] bg-white p-0.5" role="group" aria-label={label}>
      <button type="button" className={step} aria-label={tt("One fewer")} disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        &minus;
      </button>
      <span className="min-w-[52px] text-center text-[13px] tabular-nums text-[#1a1a2e]" aria-live="polite">
        {value} <span className="text-[#9ca3af]">{tt("of {max}", { max })}</span>
      </span>
      <button type="button" className={step} aria-label={tt("One more")} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        +
      </button>
    </div>
  )
}

/**
 * The tracking number first, as Shopify asks for it: the carrier is filled
 * in from the number's shape while it is typed (lib/physical/status
 * guessCarrier), until the shop picks one itself. A carrier we know gets
 * its tracking link made for it; another one can be given its link.
 */
function TrackingFields({
  tracking,
  setTracking,
  carrier,
  setCarrier,
  other,
  setOther,
  url,
  setUrl,
}: {
  tracking: string
  setTracking: (v: string) => void
  carrier: string
  setCarrier: (v: string) => void
  other: string
  setOther: (v: string) => void
  url: string
  setUrl: (v: string) => void
}) {
  const picked = React.useRef(carrier !== "")
  const link = carrier && carrier !== "Other" ? trackingLink(carrier, tracking) : null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={tt("Tracking number")}>
        <TextInput
          value={tracking}
          maxLength={60}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder={tt("Optional")}
          onChange={(e) => {
            const v = e.target.value.replace(/\s/g, "")
            setTracking(v)
            if (!picked.current) setCarrier(guessCarrier(v) ?? "")
          }}
        />
      </Field>
      <Field label={tt("Carrier")}>
        <SelectInput
          value={carrier}
          onChange={(v) => {
            picked.current = true
            setCarrier(v)
          }}
        >
          <option value="">{tt("Choose a carrier")}</option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c === "Other" ? tt("Other") : c}
            </option>
          ))}
        </SelectInput>
      </Field>
      {carrier === "Other" ? (
        <>
          <Field label={tt("Carrier name")}>
            <TextInput value={other} maxLength={40} onChange={(e) => setOther(e.target.value)} />
          </Field>
          <Field label={tt("Tracking link")} hint={tt("Optional, https://")}>
            <TextInput value={url} maxLength={500} inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </>
      ) : null}
      {link ? (
        <p className="truncate text-[12.5px] text-[#6b7280] sm:col-span-2" data-tracking-link="">
          {tt("The buyer can follow it at")} <span className="text-[#1a1a2e]">{new URL(link).hostname.replace(/^www\./, "")}</span>
        </p>
      ) : null}
    </div>
  )
}

function FulfilDialog({ order, only, from, locationId = null, onLabel, onClose, onSubmit }: { order: PhysicalOrder; only: string[]; from: string | null; locationId?: string | null; onLabel?: (order: PhysicalOrder, label: import("./buy-label").LabelView) => void; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const pickup = order.deliveryMethod === "pickup"
  const open = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0 && only.includes(l.orderId))
  const [qty, setQty] = React.useState<Record<string, number>>(() => Object.fromEntries(open.map((l) => [l.orderId, l.quantity - l.fulfilled])))
  const [carrier, setCarrier] = React.useState("")
  const [other, setOther] = React.useState("")
  const [tracking, setTracking] = React.useState("")
  const [url, setUrl] = React.useState("")
  const [notify, setNotify] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = React.useRef(actionKey())
  const chosen = Object.values(qty).reduce((n, q) => n + q, 0)
  const verb = pickup ? tt("Mark ready") : tt("Fulfill")
  /* Buy a label (Shippo, EasyPost), beside Add tracking, while one is connected: ./buy-label.tsx. */
  const flow = useLabelFlow({ orderId: order.id, locationId, items: Object.entries(qty).map(([orderId, quantity]) => ({ orderId, quantity })), notify, enabled: !pickup, onBought: (o, l) => onLabel?.(o, l) })
  const labelMode = !pickup && flow.available && (flow.mode === "label" || !!flow.bought)
  return (
    <Modal
      open
      onClose={onClose}
      title={pickup ? tt("Ready for pickup") : flow.bought ? tt("Label bought") : tt("Fulfill items")}
      footer={
        labelMode ? (
          flow.bought ? (
            <button type="button" className={BTN_SECONDARY} onClick={onClose} data-label-done="">
              {tt("Done")}
            </button>
          ) : (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={onClose}>
                {tt("Cancel")}
              </button>
              <button type="button" className={BTN_PRIMARY} disabled={!flow.footer || flow.footer.disabled} onClick={flow.footer?.onClick} data-label-submit="">
                {flow.footer?.label}
              </button>
            </>
          )
        ) : <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy || chosen === 0}
            data-fulfil-submit=""
            onClick={async () => {
              setBusy(true)
              const e = await onSubmit({
                items: Object.entries(qty).map(([orderId, quantity]) => ({ orderId, quantity })),
                carrier: (carrier === "Other" ? other.trim() : carrier) || null,
                trackingNumber: tracking.trim() || null,
                trackingUrl: carrier === "Other" ? url.trim() || null : null,
                notifyBuyer: notify,
                key: key.current,
              })
              setBusy(false)
              setError(e)
            }}
          >
            {busy ? tt("Saving…") : chosen === 0 ? verb : `${verb} ${countLabel(chosen)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {from && !flow.bought ? <p className="text-[13px] text-[#6b7280]">{pickup ? tt("Pickup at {from}", { from }) : tt("Ships from {from}", { from })}</p> : null}
        <ul className={cn("divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]", flow.bought && "hidden")}>
          {open.map((l) => (
            <li key={l.orderId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[#eceef1] bg-[#f4f5f7]">
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[#9ca3af]">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-[#1a1a2e]">{l.title}</p>
                  {l.variantName || l.sku ? <p className="truncate text-[12px] text-[#6b7280]">{[l.variantName, l.sku ? tt("SKU {sku}", { sku: l.sku }) : null].filter(Boolean).join(" · ")}</p> : null}
                </div>
              </div>
              <Stepper value={qty[l.orderId] ?? 0} max={l.quantity - l.fulfilled} onChange={(n) => setQty((q) => ({ ...q, [l.orderId]: n }))} label={tt("Units of {title}", { title: l.title })} />
            </li>
          ))}
        </ul>
        {pickup ? null : <ShipModeSwitch flow={flow} />}
        {pickup ? null : labelMode ? <LabelFields flow={flow} /> : <TrackingFields tracking={tracking} setTracking={setTracking} carrier={carrier} setCarrier={setCarrier} other={other} setOther={setOther} url={url} setUrl={setUrl} />}
        {flow.bought ? null : (
          <Toggle
            label={pickup ? tt("Tell the buyer it's ready") : tt("Send shipment details to the buyer")}
            description={pickup ? tt("With your pickup address and instructions.") : tracking.trim() || labelMode ? tt("An email with the tracking link.") : tt("An email saying it's on the way.")}
            checked={notify}
            onChange={setNotify}
          />
        )}
        {error && !labelMode ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function TrackingDialog({ shipment, onClose, onSubmit }: { shipment: PhysicalShipment; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const known = CARRIERS.includes(shipment.carrier ?? "") ? (shipment.carrier ?? "") : shipment.carrier ? "Other" : "" // i18n-ignore: the carrier's value, shown through tt()
  const [carrier, setCarrier] = React.useState(known)
  const [other, setOther] = React.useState(known === "Other" ? (shipment.carrier ?? "") : "")
  const [tracking, setTracking] = React.useState(shipment.trackingNumber ?? "")
  const [url, setUrl] = React.useState(known === "Other" ? (shipment.trackingUrl ?? "") : "")
  const [notify, setNotify] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  return (
    <Modal
      open
      onClose={onClose}
      title={shipment.trackingNumber ? tt("Edit tracking") : tt("Add tracking")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(await onSubmit({ carrier: (carrier === "Other" ? other.trim() : carrier) || null, trackingNumber: tracking.trim() || null, trackingUrl: carrier === "Other" ? url.trim() || null : null, notifyBuyer: notify }))
              setBusy(false)
            }}
          >
            {busy ? tt("Saving…") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TrackingFields tracking={tracking} setTracking={setTracking} carrier={carrier} setCarrier={setCarrier} other={other} setOther={setOther} url={url} setUrl={setUrl} />
        <Toggle label={tt("Email the buyer the new number")} checked={notify} onChange={setNotify} />
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function ReturnDialog({ order, onClose, onSubmit }: { order: PhysicalOrder; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const lines = order.lines.filter((l) => (l.requiresShipping ? l.fulfilled : l.quantity) - l.returned > 0)
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [restock, setRestock] = React.useState<Record<string, boolean>>({})
  /* The store's own return reasons (Settings › Returns and refunds). */
  const reasons = useReasons("return")
  const [reason, setReason] = React.useState("other")
  const [method, setMethod] = React.useState("ship_back")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const chosen = Object.values(qty).reduce((n, q) => n + q, 0)
  return (
    <Modal
      open
      onClose={onClose}
      title={tt("Start a return")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Cancel")}
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={chosen === 0}
            onClick={async () =>
              setError(
                await onSubmit({
                  items: Object.entries(qty)
                    .map(([orderId, quantity]) => ({ orderId, quantity, restock: restock[orderId] !== false }))
                    .filter((i) => i.quantity > 0),
                  reason,
                  method,
                  note,
                }),
              )
            }
          >
            {tt("Create return")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
          {lines.map((l) => {
            const can = (l.requiresShipping ? l.fulfilled : l.quantity) - l.returned
            return (
              <li key={l.orderId} className="space-y-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-[#1a1a2e]">{l.title}</p>
                    {l.variantName ? <p className="truncate text-[12px] text-[#6b7280]">{l.variantName}</p> : null}
                  </div>
                  <Stepper value={qty[l.orderId] ?? 0} max={can} onChange={(n) => setQty((q) => ({ ...q, [l.orderId]: n }))} label={tt("Units of {title} to return", { title: l.title })} />
                </div>
                {l.type === "physical" && (qty[l.orderId] ?? 0) > 0 ? (
                  <label className="flex items-center gap-2 text-[13px] text-[#4b5563]">
                    <input type="checkbox" checked={restock[l.orderId] !== false} onChange={(e) => setRestock((r) => ({ ...r, [l.orderId]: e.target.checked }))} className="h-4 w-4 accent-[#1a1a2e]" />
                    {tt("Put back in stock when received")}
                  </label>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tt("Reason")}>
            <SelectInput value={reason} onChange={setReason}>
              {reasons.map(({ value: v, label: l }) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label={tt("How it comes back")}>
            <SelectInput value={method} onChange={setMethod}>
              <option value="ship_back">{tt("The buyer ships it back")}</option>
              <option value="drop_off">{tt("The buyer drops it off")}</option>
              <option value="no_return_needed">{tt("Keep it, no need to send")}</option>
            </SelectInput>
          </Field>
        </div>
        <Field label={tt("Instructions for the buyer")} hint={tt("Emailed with the approval")}>
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
        </Field>
        <p className="text-[12.5px] text-[#6b7280]">{tt("Refund the money with Refund on this order when you're ready. A return doesn't refund by itself.")}</p>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function ReturnsCard({ order, busy, onMove, onRefund }: { order: PhysicalOrder; busy: boolean; onMove: (returnId: string, status: string, extra?: Record<string, unknown>) => void; onRefund?: (() => void) | null }) {
  const nameOfLine = (id: string) => {
    const l = order.lines.find((x) => x.orderId === id)
    return l ? lineName(l) : tt("Item")
  }
  return (
    <section className={cn(card, "min-w-0")} data-returns="">
      <div className="flex min-h-[44px] items-center gap-2 px-4 pt-3">
        <h3 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Returns")}</h3>
        {order.returnStatus !== "none" ? <StatusBadge tone={order.returnStatus === "requested" ? "attention" : "neutral"}>{RETURN_LABEL[order.returnStatus].label}</StatusBadge> : null}
      </div>
      <ul className="space-y-3 px-4 pb-4 pt-1">
        {order.returns.map((r) => (
          <ReturnBlock key={r.id} r={r} currency={order.currency} nameOfLine={nameOfLine} busy={busy} canRefund={!!onRefund && order.status !== "refunded"} onRefund={onRefund ?? undefined} onMove={(status, extra) => onMove(r.id, status, extra)} />
        ))}
      </ul>
    </section>
  )
}

function ReturnBlock({
  r,
  currency,
  nameOfLine,
  busy,
  canRefund,
  onRefund,
  onMove,
}: {
  r: ReturnRec
  currency: string
  nameOfLine: (id: string) => string
  busy: boolean
  canRefund: boolean
  onRefund?: () => void
  onMove: (status: string, extra?: Record<string, unknown>) => void
}) {
  const tone = r.status === "requested" ? "attention" : r.status === "completed" ? "success" : "neutral"
  const label: Record<string, string> = { requested: tt("Requested"), approved: tt("Approved"), rejected: tt("Declined"), in_transit: tt("On its way back"), received: tt("Received"), completed: tt("Closed"), cancelled: tt("Cancelled") }
  const reasons = useReasons("return")
  const small = "h-8 px-3 text-[12.5px]"
  /* Approving or declining asks for the words the buyer's email carries: how to send it back, or why not. */
  const [answer, setAnswer] = React.useState<{ to: "approved" | "rejected"; note: string } | null>(null)
  return (
    <li className="rounded-xl border border-[#eceef1] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#1a1a2e]">
          <StatusBadge tone={tone}>{label[r.status] ?? r.status}</StatusBadge>
          <span className="truncate">{r.reasonLabel || reasonLabel(r.reason, "return", reasons)}</span>
          {r.requestedBy === "buyer" ? <span className="shrink-0 text-[12px] font-normal text-[#6b7280]">{tt("asked by the buyer")}</span> : null}
        </p>
        <span className="text-[12px] text-[#9ca3af]">{dateTime(r.createdAt)}</span>
      </div>
      <ul className="mt-1.5 text-[13px] text-[#4b5563]">
        {r.items.map((i) => (
          <li key={i.id}>
            {i.quantity} &times; {nameOfLine(i.orderId)}
            {i.restockedQuantity ? <span className="text-[#166534]"> · {tt("back in stock")}</span> : i.restock ? <span className="text-[#6b7280]"> · {tt("restock on receipt")}</span> : null}
          </li>
        ))}
      </ul>
      {r.customerNote ? <p className="mt-1.5 text-[13px] italic text-[#4b5563]">&ldquo;{r.customerNote}&rdquo;</p> : null}
      {r.merchantNote && !answer ? <p className="mt-1.5 text-[13px] text-[#4b5563]"><span className="font-medium text-[#1a1a2e]">{tt("Your note:")}</span> {r.merchantNote}</p> : null}
      {r.refundedCents > 0 ? <p className="mt-1.5 text-[13px] text-[#166534]" data-return-refunded="">{tt("Refunded {amount}", { amount: money(r.refundedCents, currency) })}</p> : null}
      {answer ? (
        <div className="mt-2 space-y-2" data-return-answer={answer.to}>
          <label className="block text-[12.5px] font-medium text-[#1a1a2e]" htmlFor={`return-note-${r.id}`}>
            {answer.to === "approved" ? tt("Instructions for the buyer") : tt("Why it can't be returned")}
          </label>
          <textarea
            id={`return-note-${r.id}`}
            autoFocus
            rows={3}
            maxLength={1000}
            value={answer.note}
            onChange={(e) => setAnswer({ ...answer, note: e.target.value })}
            placeholder={answer.to === "approved" ? tt("Pack it in its box, write the order number inside and post it to the address in this email.") : tt("It was used, or it's past the return window.")}
            className="w-full rounded-lg border border-[#d9dce1] px-3 py-2 text-[13.5px] leading-5 focus:border-[#1a1a2e] focus:outline-none"
          />
          <p className="text-[12px] text-[#6b7280]">{answer.to === "approved" ? tt("Emailed to the buyer with your default location's address.") : tt("Emailed to the buyer.")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={cn(answer.to === "approved" ? BTN_PRIMARY : BTN_DANGER, small)}
              disabled={busy}
              onClick={() => {
                onMove(answer.to, { note: answer.note.trim() || null })
                setAnswer(null)
              }}
            >
              {answer.to === "approved" ? tt("Approve and email") : tt("Decline and email")}
            </button>
            <button type="button" className={cn(BTN_SECONDARY, small)} disabled={busy} onClick={() => setAnswer(null)}>
              {tt("Back")}
            </button>
          </div>
        </div>
      ) : null}
      <div className={cn("mt-2 flex flex-wrap gap-2", answer && "hidden")}>
        {r.status === "requested" ? (
          <>
            <button type="button" className={cn(BTN_PRIMARY, small)} disabled={busy} onClick={() => setAnswer({ to: "approved", note: r.merchantNote ?? "" })}>
              {tt("Approve")}
            </button>
            <button type="button" className={cn(BTN_DANGER, small)} disabled={busy} onClick={() => setAnswer({ to: "rejected", note: "" })}>
              {tt("Decline")}
            </button>
          </>
        ) : null}
        {r.status === "approved" || r.status === "in_transit" ? (
          <button type="button" className={cn(BTN_PRIMARY, small)} disabled={busy} onClick={() => onMove("received")}>
            {tt("Mark received")}
          </button>
        ) : null}
        {r.status === "received" && canRefund && onRefund ? (
          <button type="button" className={cn(BTN_PRIMARY, small)} disabled={busy} onClick={onRefund} data-return-refund="">
            {tt("Refund")}
          </button>
        ) : null}
        {r.status === "received" ? (
          <button type="button" className={cn(BTN_SECONDARY, small)} disabled={busy} onClick={() => onMove("completed")}>
            {r.refundedCents > 0 ? tt("Close return") : tt("Close without refund")}
          </button>
        ) : null}
        {r.status === "approved" || r.status === "requested" ? (
          <button type="button" className={cn(BTN_SECONDARY, small)} disabled={busy} onClick={() => onMove("cancelled")}>
            {tt("Cancel return")}
          </button>
        ) : null}
      </div>
    </li>
  )
}

function CancelDialog({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Modal
      open
      onClose={onClose}
      title={tt("Cancel this order?")}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            {tt("Keep order")}
          </button>
          <button type="button" className={BTN_DANGER} onClick={async () => setError(await onSubmit(reason))}>
            {tt("Cancel order")}
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-[21px] text-[#4b5563]">{tt("Its stock goes back on sale. The payment isn't refunded by this: use Refund on the order for that.")}</p>
      <Field label={tt("Reason")} hint={tt("Optional, for your history")} className="mt-3">
        <TextInput value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error ? <Notice className="mt-3">{error}</Notice> : null}
    </Modal>
  )
}

/** A packing slip for the box: what to pack and where it goes. No prices. */
function printSlip(order: PhysicalOrder, lines: PhysicalLine[]) {
  const w = window.open("", "_blank", "width=720,height=900")
  if (!w) return
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const rows = lines
    .filter((l) => l.quantity - l.fulfilled > 0)
    .map((l) => `<tr><td>${esc(l.title)}${l.variantName ? `<br><small>${esc(l.variantName)}</small>` : ""}</td><td>${esc(l.sku ?? "")}</td><td style="text-align:right">${l.quantity - l.fulfilled}</td></tr>`)
    .join("")
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${esc(orderNumber(order.id))}</title><style>body{font-family:Inter,Arial,sans-serif;color:#1a1a2e;padding:32px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left;font-size:14px}small{color:#6b7280}.addr{margin-top:16px;font-size:14px;line-height:1.5}</style></head><body><h1>Packing slip</h1><div>Order ${esc(orderNumber(order.id))}</div><div class="addr">${order.deliveryMethod === "pickup" ? tt("<strong>Pickup by</strong><br>{value}<br>at {value2}", { value: esc(order.buyerName ?? tt("The buyer")), value2: esc(order.pickup?.name ?? tt("your location")) }) : tt("<strong>Ship to</strong><br>{value}", { value: addressLines(order.address as any).map(esc).join("<br>") })}</div><table><thead><tr><th>Item</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${rows}</tbody></table>${order.buyerNote ? `<p class="addr"><strong>Note</strong><br>${esc(order.buyerNote)}</p>` : ""}<script>window.onload=function(){window.print()}</script></body></html>`)
  w.document.close()
}

/* ─── The whole panel, on its own ────────────────────────────────────── */

/**
 * Everything above in one column, for a page that shows a physical order
 * without the Orders page around it (the help screenshots and
 * scripts/render-physical.tsx). The Orders page lays the same parts out in
 * its own columns.
 */
export function PhysicalOrderPanel({ orderRowId, revision = 0, className }: { orderRowId: string; revision?: number; className?: string }) {
  const state = usePhysicalOrder(orderRowId, revision)
  const { order } = state
  const groups = new Map<string, true>()
  if (order) for (const l of order.lines) if (l.requiresShipping) groups.set(`${l.fulfillmentMethod}:${l.locationId}`, true)
  return (
    <div className={cn("grid min-w-0 gap-4", className)}>
      <PhysicalFulfillment state={state} />
      <ShippingCard order={order} />
      <BuyerNoteCard order={order} />
      {order ? (
        <section className={cn(card, "min-w-0 px-4 py-4")}>
          <h3 className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">{tt("Order history")}</h3>
          <ol className="space-y-2.5">
            {order.events.slice(0, 8).map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#c4c8cf]" />
                <div className="min-w-0">
                  <p className="text-[13px] text-[#1a1a2e]">{e.message}</p>
                  <p className="text-[12px] text-[#9ca3af]">{dateTime(e.createdAt)}</p>
                </div>
              </li>
            ))}
            {order.events.length === 0 ? <li className="text-[13px] text-[#6b7280]">{tt("Nothing yet.")}</li> : null}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
