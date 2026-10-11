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
import { deliveryEstimate } from "@/lib/physical/rates"
import { CARRIERS, RETURN_LABEL, guessCarrier, orderNumber, trackingUrl as trackingLink } from "@/lib/physical/status"
import { METHODS, shippedByLabel } from "@/lib/physical/fulfillment"
import { PICKUP_READY_LABEL } from "@/lib/physical/pickup"
import { NOTE_MAX } from "@/lib/physical/notes"
import type { DeliveryMethod, FulfillmentMethod, FulfillmentStatus, PickupReady, ReturnStatus, ShipmentStatus } from "@/lib/physical/types"
import type { PhysicalHistory } from "@/lib/orders/timeline"
import { reasonLabel } from "@/lib/store/reasons"
import { useReasons } from "@/lib/store/use-reasons"
import { copyText } from "@/lib/platform/copy-text"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { StatusBadge, buttonPrimary, buttonSecondary, card, iconButton } from "@/app/app/orders/order-parts"
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, SelectInput, TextInput, Toggle, actionKey, api, dateTime, money, peekGet, prefetchGet } from "./ui"

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
  delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null } | null
  deliveryMethod: DeliveryMethod
  pickup: { locationId: string | null; name: string; address: string[]; instructions: string | null; ready: PickupReady } | null
  processingAt: string | null
  buyerNote: string | null
  merchantNote: string | null
  cancelledAt: string | null
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
      if (!orderId) return "The order is still loading."
      setBusy(true)
      const r = await api<{ order: PhysicalOrder }>(pathOf(orderId), { body })
      setBusy(false)
      if (!r.ok) return r.error
      if (r.data.order) setData((d) => (d ? { ...d, order: r.data.order } : d))
      return null
    },
    [orderId],
  )

  return { order, locations: order && data ? data.locations : [], error, setError, busy, act }
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
const countLabel = (n: number) => `${n} ${n === 1 ? "item" : "items"}`

type Dialog = { fulfil: { lines: string[]; locationId: string | null } } | { tracking: PhysicalShipment } | "return" | "cancel" | null

export function PhysicalFulfillment({ state, className, onNotice }: { state: PhysicalOrderState; className?: string; onNotice?: (message: string) => void }) {
  const { order, locations, error, setError, busy, act } = state
  const [dialog, setDialog] = React.useState<Dialog>(null)

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
  const number = (s: PhysicalShipment) => `${orderNumber(order.id)}-F${order.shipments.indexOf(s) + 1}`

  return (
    <div className={cn("grid min-w-0 gap-4", className)} data-physical-order="">
      {order.cancelledAt ? <Notice tone="gray">This order was cancelled and its stock released. Refund the payment with Refund if you haven&apos;t.</Notice> : null}

      {[...groups.values()].map((g, gi) => {
        const left = g.lines.reduce((n, l) => n + l.quantity - l.fulfilled, 0)
        const from = pickup ? `Pickup at ${order.pickup?.name ?? "your location"}` : g.method === "self" ? (locName(g.locationId) ? `Ships from ${locName(g.locationId)}` : "Shipped by you") : shippedByLabel(g.method, locName(g.locationId))
        const menu: ActionMenuItem[] = [
          { label: "Packing slip", icon: <Printer className="h-4 w-4" />, onClick: () => printSlip(order, g.lines) },
          ...(gi === 0 && canFulfil && live.length === 0
            ? [order.processingAt
                ? { label: "Back to unfulfilled", icon: <Undo2 className="h-4 w-4" />, onClick: () => void run({ action: "processing", on: false }) }
                : { label: "Mark as in progress", icon: <Clock className="h-4 w-4" />, onClick: () => void run({ action: "processing", on: true }, "Marked as in progress") }]
            : []),
          ...(gi === 0 && !order.cancelledAt && live.length === 0 ? [{ label: "Cancel order", icon: <X className="h-4 w-4" />, variant: "destructive" as const, separatorBefore: true, onClick: () => setDialog("cancel") }] : []),
        ]
        return (
          <section key={`${g.method}:${g.locationId}`} className={cn(card, "min-w-0")} data-ship-group={g.method} data-unfulfilled-card="">
            <CardTop
              badge={<StatusBadge tone="attention">{order.processingAt ? "In progress" : "Unfulfilled"}</StatusBadge>}
              count={left}
              sub={from}
              menu={<CardMenu title="Unfulfilled" items={menu} />}
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
                {pickup ? "Mark ready for pickup" : "Fulfill items"}
              </button>
            </div>
          </section>
        )
      })}

      {order.shipments.map((s) => {
        const items = s.items.reduce((n, i) => n + i.quantity, 0)
        const cancelled = s.status === "cancelled"
        const delivered = s.status === "delivered"
        const badge = cancelled ? (
          <StatusBadge tone="neutral">Cancelled</StatusBadge>
        ) : delivered ? (
          <StatusBadge tone="success">{pickup ? "Picked up" : "Delivered"}</StatusBadge>
        ) : (
          <StatusBadge tone="success">{pickup ? "Ready for pickup" : "Fulfilled"}</StatusBadge>
        )
        const transit = s.status === "in_transit" ? "In transit" : s.status === "out_for_delivery" ? "Out for delivery" : s.status === "failed" ? "Delivery problem" : null
        const menu: ActionMenuItem[] = cancelled
          ? []
          : [
              ...(!pickup && !delivered ? [{ label: s.trackingNumber ? "Edit tracking" : "Add tracking", icon: <Truck className="h-4 w-4" />, onClick: () => setDialog({ tracking: s }) }] : []),
              ...(!pickup && (s.status === "shipped" || s.status === "submitted" || s.status === "pending") ? [{ label: "Mark as in transit", icon: <Truck className="h-4 w-4" />, onClick: () => void run({ action: "shipment", fulfillmentId: s.id, status: "in_transit" }, "Marked as in transit") }] : []),
              ...(returnable ? [{ label: "Start return", icon: <Undo2 className="h-4 w-4" />, onClick: () => setDialog("return") }] : []),
              { label: "Packing slip", icon: <Printer className="h-4 w-4" />, onClick: () => printSlip(order, s.items.map((i) => ({ ...order.lines.find((l) => l.orderId === i.orderId)!, quantity: i.quantity, fulfilled: 0 })).filter((l) => l.title)) },
              ...(!delivered
                ? [{
                    label: pickup ? "Not ready after all" : "Cancel fulfillment",
                    icon: <X className="h-4 w-4" />,
                    variant: "destructive" as const,
                    separatorBefore: true,
                    onClick: () => {
                      if (!window.confirm(pickup ? "Undo ready for pickup? The items go back to unfulfilled." : "Cancel this fulfillment? Its items go back to unfulfilled and back in stock.")) return
                      void run({ action: "shipment", fulfillmentId: s.id, status: "cancelled", notifyBuyer: false }, "Fulfillment cancelled")
                    },
                  }]
                : []),
            ]
        return (
          <section key={s.id} className={cn(card, "min-w-0", cancelled && "opacity-60")} data-shipment={s.status}>
            <CardTop badge={badge} count={items} sub={[number(s), s.shippedAt ? dateTime(s.shippedAt) : null, locName(s.locationId)].filter(Boolean).join(" · ")} menu={menu.length ? <CardMenu title={number(s)} items={menu} /> : null} />
            {!pickup && !cancelled ? <TrackingRow shipment={s} transit={transit} onAdd={() => setDialog({ tracking: s })} onNotice={onNotice} /> : null}
            {pickup && !cancelled && order.pickup ? <p className="px-4 pt-2 text-[13px] text-[#4b5563]">At {order.pickup.name}</p> : null}
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
                  onClick={() => void run({ action: "shipment", fulfillmentId: s.id, status: "delivered" }, pickup ? "Marked as picked up" : "Marked as delivered")}
                >
                  {pickup ? <Check className="h-3.5 w-3.5" /> : <PackageCheck className="h-3.5 w-3.5" />}
                  {pickup ? "Mark picked up" : "Mark as delivered"}
                </button>
              </div>
            ) : delivered && s.deliveredAt ? (
              <p className="px-4 py-3 text-[12px] text-[#6b7280]">
                {pickup ? "Picked up" : "Delivered"} {dateTime(s.deliveredAt)}
              </p>
            ) : (
              <div className="h-3" />
            )}
          </section>
        )
      })}

      {error ? <Notice>{error}</Notice> : null}

      {order.returns.length > 0 ? <ReturnsCard order={order} busy={busy} onMove={(returnId, status, extra) => void run({ action: "return_move", returnId, status, ...extra })} /> : null}

      {dialog && typeof dialog === "object" && "fulfil" in dialog ? (
        <FulfilDialog
          order={order}
          only={dialog.fulfil.lines}
          from={pickup ? (order.pickup?.name ?? null) : locName(dialog.fulfil.locationId)}
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            const e = await act({ action: "fulfil", locationId: dialog.fulfil.locationId, ...body })
            if (!e) {
              setDialog(null)
              onNotice?.(pickup ? "Marked ready for pickup" : "Items fulfilled")
            }
            return e
          }}
        />
      ) : null}
      {dialog === "return" ? <ReturnDialog order={order} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "return", ...body }); if (!e) { setDialog(null); onNotice?.("Return opened") } return e }} /> : null}
      {dialog === "cancel" ? <CancelDialog onClose={() => setDialog(null)} onSubmit={async (reason) => { const e = await act({ action: "cancel", reason }); if (!e) { setDialog(null); onNotice?.("Order cancelled") } return e }} /> : null}
      {dialog && typeof dialog === "object" && "tracking" in dialog ? <TrackingDialog shipment={dialog.tracking} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "shipment", fulfillmentId: dialog.tracking.id, ...body }); if (!e) { setDialog(null); onNotice?.("Tracking saved") } return e }} /> : null}
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
        <span className="text-[12px] text-[#6b7280]">{transit ? `${transit}, no tracking number` : "No tracking number"}</span>
        <button type="button" onClick={onAdd} className="text-[12px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
          Add tracking
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
        aria-label="Copy tracking number"
        title="Copy tracking number"
        className={cn(iconButton, "h-7 w-7 shrink-0")}
        onClick={async () => onNotice?.((await copyText(s.trackingNumber!)) ? "Tracking number copied" : "Could not copy the tracking number")}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      {s.trackingUrl ? (
        <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonSecondary, "h-7 shrink-0 px-2.5 text-[12px]")}>
          Track
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
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
        <p className="truncate text-[12px] text-[#6b7280]">{[line.variantName, line.sku ? `SKU ${line.sku}` : null].filter(Boolean).join(" · ") || "Ships"}</p>
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
export function ShippingCard({ order, onNotice, className }: { order: PhysicalOrder | null; onNotice?: (m: string) => void; className?: string }) {
  if (!order) return <section className={cn(card, "h-[148px] animate-pulse", className)} aria-busy="true" />
  const pickup = order.deliveryMethod === "pickup"
  const lines = addressLines(order.address as any)
  const paid = order.shippingCents - order.shippingDiscountCents
  return (
    <section className={cn(card, "px-4 py-3.5", className)} data-shipping-card="">
      {pickup && order.pickup ? (
        <>
          <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Picked up at</h2>
          <p className="mt-2 text-[13px] leading-[19px] text-[#303036]">
            {[order.pickup.name, ...order.pickup.address].map((l, i) => (
              <span key={`${i}:${l}`} className="block">
                {l}
              </span>
            ))}
          </p>
          <p className="mt-1 text-[12px] text-[#6b7280]">{PICKUP_READY_LABEL[order.pickup.ready]}</p>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Shipping address</h2>
            {lines.length ? (
              <button
                type="button"
                aria-label="Copy shipping address"
                title="Copy shipping address"
                className={cn(iconButton, "-mr-1.5 h-7 w-7")}
                onClick={async () => onNotice?.((await copyText(lines.join("\n"))) ? "Address copied" : "Could not copy the address")}
                data-copy-address=""
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            ) : null}
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
            <p className="mt-1.5 text-[13px] text-[#9ca3af]">No address</p>
          )}
          {lines.length && order.address?.country ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lines.filter((l) => l !== order.address?.phone && l !== order.address?.name).join(", "))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-[#6d4ae0] hover:underline"
            >
              <MapPin className="h-3 w-3" />
              View map
            </a>
          ) : null}
        </>
      )}
      <div className="mt-3 border-t border-[#f0f1f3] pt-3">
        <h3 className="text-[12px] font-medium text-[#6b7280]">{pickup ? "Delivery" : "Shipping method"}</h3>
        <p className="mt-0.5 flex items-baseline justify-between gap-3 text-[13px] text-[#303036]" data-shipping-method="">
          <span className="min-w-0 truncate">{pickup ? "Local pickup" : (order.delivery?.name ?? "Not recorded")}</span>
          <span className="shrink-0 tabular-nums">{pickup || paid <= 0 ? "Free" : money(paid, order.currency)}</span>
        </p>
        {!pickup && order.delivery && deliveryEstimate(order.delivery) ? <p className="text-[12px] text-[#6b7280]">{deliveryEstimate(order.delivery)}</p> : null}
      </div>
    </section>
  )
}

/** What the buyer wrote at checkout, and the shop's older single note. Only when there is one. */
export function BuyerNoteCard({ order, className }: { order: PhysicalOrder | null; className?: string }) {
  if (!order || (!order.buyerNote && !order.merchantNote)) return null
  return (
    <section className={cn(card, "px-4 py-3.5", className)}>
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Notes</h2>
      {order.buyerNote ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">From the buyer</p>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[#303036]">{order.buyerNote}</p>
        </>
      ) : null}
      {order.merchantNote ? (
        <>
          <p className="mt-2 text-[12px] font-medium text-[#6b7280]">Yours</p>
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
          aria-label="Add a note to this order"
          placeholder="Add a note"
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
          <span className="text-[11.5px] text-[#9ca3af]">Only you can see notes</span>
          <button type="button" className={cn(buttonPrimary, "h-7 px-2.5 text-[12px]")} disabled={!text.trim() || busy} onClick={() => void post()} data-note-post="">
            {busy ? "Posting…" : "Post"}
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
      <button type="button" className={step} aria-label="One fewer" disabled={value <= 0} onClick={() => onChange(Math.max(0, value - 1))}>
        &minus;
      </button>
      <span className="min-w-[52px] text-center text-[13px] tabular-nums text-[#1a1a2e]" aria-live="polite">
        {value} <span className="text-[#9ca3af]">of {max}</span>
      </span>
      <button type="button" className={step} aria-label="One more" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
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
      <Field label="Tracking number">
        <TextInput
          value={tracking}
          maxLength={60}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Optional"
          onChange={(e) => {
            const v = e.target.value.replace(/\s/g, "")
            setTracking(v)
            if (!picked.current) setCarrier(guessCarrier(v) ?? "")
          }}
        />
      </Field>
      <Field label="Carrier">
        <SelectInput
          value={carrier}
          onChange={(v) => {
            picked.current = true
            setCarrier(v)
          }}
        >
          <option value="">Choose a carrier</option>
          {CARRIERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </SelectInput>
      </Field>
      {carrier === "Other" ? (
        <>
          <Field label="Carrier name">
            <TextInput value={other} maxLength={40} onChange={(e) => setOther(e.target.value)} />
          </Field>
          <Field label="Tracking link" hint="Optional, https://">
            <TextInput value={url} maxLength={500} inputMode="url" onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </>
      ) : null}
      {link ? (
        <p className="truncate text-[12.5px] text-[#6b7280] sm:col-span-2" data-tracking-link="">
          The buyer can follow it at <span className="text-[#1a1a2e]">{new URL(link).hostname.replace(/^www\./, "")}</span>
        </p>
      ) : null}
    </div>
  )
}

function FulfilDialog({ order, only, from, onClose, onSubmit }: { order: PhysicalOrder; only: string[]; from: string | null; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
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
  const verb = pickup ? "Mark ready" : "Fulfill"
  return (
    <Modal
      open
      onClose={onClose}
      title={pickup ? "Ready for pickup" : "Fulfill items"}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
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
            {busy ? "Saving…" : chosen === 0 ? verb : `${verb} ${countLabel(chosen)}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {from ? <p className="text-[13px] text-[#6b7280]">{pickup ? `Pickup at ${from}` : `Ships from ${from}`}</p> : null}
        <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
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
                  {l.variantName || l.sku ? <p className="truncate text-[12px] text-[#6b7280]">{[l.variantName, l.sku ? `SKU ${l.sku}` : null].filter(Boolean).join(" · ")}</p> : null}
                </div>
              </div>
              <Stepper value={qty[l.orderId] ?? 0} max={l.quantity - l.fulfilled} onChange={(n) => setQty((q) => ({ ...q, [l.orderId]: n }))} label={`Units of ${l.title}`} />
            </li>
          ))}
        </ul>
        {pickup ? null : <TrackingFields tracking={tracking} setTracking={setTracking} carrier={carrier} setCarrier={setCarrier} other={other} setOther={setOther} url={url} setUrl={setUrl} />}
        <Toggle
          label={pickup ? "Tell the buyer it's ready" : "Send shipment details to the buyer"}
          description={pickup ? "With your pickup address and instructions." : tracking.trim() ? "An email with the tracking link." : "An email saying it's on the way."}
          checked={notify}
          onChange={setNotify}
        />
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function TrackingDialog({ shipment, onClose, onSubmit }: { shipment: PhysicalShipment; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const known = CARRIERS.includes(shipment.carrier ?? "") ? (shipment.carrier ?? "") : shipment.carrier ? "Other" : ""
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
      title={shipment.trackingNumber ? "Edit tracking" : "Add tracking"}
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
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
            {busy ? "Saving…" : "Save"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <TrackingFields tracking={tracking} setTracking={setTracking} carrier={carrier} setCarrier={setCarrier} other={other} setOther={setOther} url={url} setUrl={setUrl} />
        <Toggle label="Email the buyer the new number" checked={notify} onChange={setNotify} />
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
      title="Start a return"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
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
            Create return
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
                  <Stepper value={qty[l.orderId] ?? 0} max={can} onChange={(n) => setQty((q) => ({ ...q, [l.orderId]: n }))} label={`Units of ${l.title} to return`} />
                </div>
                {l.type === "physical" && (qty[l.orderId] ?? 0) > 0 ? (
                  <label className="flex items-center gap-2 text-[13px] text-[#4b5563]">
                    <input type="checkbox" checked={restock[l.orderId] !== false} onChange={(e) => setRestock((r) => ({ ...r, [l.orderId]: e.target.checked }))} className="h-4 w-4 accent-[#1a1a2e]" />
                    Put back in stock when received
                  </label>
                ) : null}
              </li>
            )
          })}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason">
            <SelectInput value={reason} onChange={setReason}>
              {reasons.map(({ value: v, label: l }) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="How it comes back">
            <SelectInput value={method} onChange={setMethod}>
              <option value="ship_back">The buyer ships it back</option>
              <option value="drop_off">The buyer drops it off</option>
              <option value="no_return_needed">Keep it, no need to send</option>
            </SelectInput>
          </Field>
        </div>
        <Field label="Instructions for the buyer" hint="Emailed with the approval">
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[16px] outline-none focus:border-[#9ca3af] sm:text-[14px]" />
        </Field>
        <p className="text-[12.5px] text-[#6b7280]">Refund the money with Refund on this order when you&apos;re ready. A return doesn&apos;t refund by itself.</p>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function ReturnsCard({ order, busy, onMove }: { order: PhysicalOrder; busy: boolean; onMove: (returnId: string, status: string, extra?: Record<string, unknown>) => void }) {
  const nameOfLine = (id: string) => {
    const l = order.lines.find((x) => x.orderId === id)
    return l ? lineName(l) : "Item"
  }
  return (
    <section className={cn(card, "min-w-0")} data-returns="">
      <div className="flex min-h-[44px] items-center gap-2 px-4 pt-3">
        <h3 className="text-[13px] font-semibold text-[#1a1a2e]">Returns</h3>
        {order.returnStatus !== "none" ? <StatusBadge tone={order.returnStatus === "requested" ? "attention" : "neutral"}>{RETURN_LABEL[order.returnStatus].label}</StatusBadge> : null}
      </div>
      <ul className="space-y-3 px-4 pb-4 pt-1">
        {order.returns.map((r) => (
          <ReturnBlock key={r.id} r={r} nameOfLine={nameOfLine} busy={busy} onMove={(status, extra) => onMove(r.id, status, extra)} />
        ))}
      </ul>
    </section>
  )
}

function ReturnBlock({ r, nameOfLine, busy, onMove }: { r: ReturnRec; nameOfLine: (id: string) => string; busy: boolean; onMove: (status: string, extra?: Record<string, unknown>) => void }) {
  const tone = r.status === "requested" ? "attention" : r.status === "completed" ? "success" : "neutral"
  const label: Record<string, string> = { requested: "Requested", approved: "Approved", rejected: "Declined", in_transit: "On its way back", received: "Received", completed: "Closed", cancelled: "Cancelled" }
  const reasons = useReasons("return")
  const small = "h-8 px-3 text-[12.5px]"
  return (
    <li className="rounded-xl border border-[#eceef1] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-[#1a1a2e]">
          <StatusBadge tone={tone}>{label[r.status] ?? r.status}</StatusBadge>
          <span className="truncate">{reasonLabel(r.reason, "return", reasons)}</span>
          {r.requestedBy === "buyer" ? <span className="shrink-0 text-[12px] font-normal text-[#6b7280]">asked by the buyer</span> : null}
        </p>
        <span className="text-[12px] text-[#9ca3af]">{dateTime(r.createdAt)}</span>
      </div>
      <ul className="mt-1.5 text-[13px] text-[#4b5563]">
        {r.items.map((i) => (
          <li key={i.id}>
            {i.quantity} &times; {nameOfLine(i.orderId)}
            {i.restockedQuantity ? <span className="text-[#166534]"> · back in stock</span> : i.restock ? <span className="text-[#6b7280]"> · restock on receipt</span> : null}
          </li>
        ))}
      </ul>
      {r.customerNote ? <p className="mt-1.5 text-[13px] italic text-[#4b5563]">&ldquo;{r.customerNote}&rdquo;</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.status === "requested" ? (
          <>
            <button type="button" className={cn(BTN_PRIMARY, small)} disabled={busy} onClick={() => onMove("approved")}>
              Approve
            </button>
            <button type="button" className={cn(BTN_DANGER, small)} disabled={busy} onClick={() => onMove("rejected")}>
              Decline
            </button>
          </>
        ) : null}
        {r.status === "approved" || r.status === "in_transit" ? (
          <button type="button" className={cn(BTN_PRIMARY, small)} disabled={busy} onClick={() => onMove("received")}>
            Mark received
          </button>
        ) : null}
        {r.status === "received" ? (
          <button type="button" className={cn(BTN_SECONDARY, small)} disabled={busy} onClick={() => onMove("completed")}>
            Close return
          </button>
        ) : null}
        {r.status === "approved" || r.status === "requested" ? (
          <button type="button" className={cn(BTN_SECONDARY, small)} disabled={busy} onClick={() => onMove("cancelled")}>
            Cancel return
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
      title="Cancel this order?"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Keep order
          </button>
          <button type="button" className={BTN_DANGER} onClick={async () => setError(await onSubmit(reason))}>
            Cancel order
          </button>
        </>
      }
    >
      <p className="text-[14px] leading-[21px] text-[#4b5563]">Its stock goes back on sale. The payment isn&apos;t refunded by this: use Refund on the order for that.</p>
      <Field label="Reason" hint="Optional, for your history" className="mt-3">
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
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${esc(orderNumber(order.id))}</title><style>body{font-family:Inter,Arial,sans-serif;color:#1a1a2e;padding:32px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left;font-size:14px}small{color:#6b7280}.addr{margin-top:16px;font-size:14px;line-height:1.5}</style></head><body><h1>Packing slip</h1><div>Order ${esc(orderNumber(order.id))}</div><div class="addr">${order.deliveryMethod === "pickup" ? `<strong>Pickup by</strong><br>${esc(order.buyerName ?? "The buyer")}<br>at ${esc(order.pickup?.name ?? "your location")}` : `<strong>Ship to</strong><br>${addressLines(order.address as any).map(esc).join("<br>")}`}</div><table><thead><tr><th>Item</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${rows}</tbody></table>${order.buyerNote ? `<p class="addr"><strong>Note</strong><br>${esc(order.buyerNote)}</p>` : ""}<script>window.onload=function(){window.print()}</script></body></html>`)
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
          <h3 className="mb-2 text-[13px] font-semibold text-[#1a1a2e]">Order history</h3>
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
            {order.events.length === 0 ? <li className="text-[13px] text-[#6b7280]">Nothing yet.</li> : null}
          </ol>
        </section>
      ) : null}
    </div>
  )
}
