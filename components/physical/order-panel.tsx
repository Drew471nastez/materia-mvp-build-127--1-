"use client"

/**
 * ===========================================================================
 *  A PHYSICAL ORDER ON THE ORDERS PAGE: SHIP IT, TRACK IT, TAKE IT BACK
 * ===========================================================================
 * In place of the download card on an order with something to ship
 * (app/app/orders/order-detail.tsx). Payment, the customer and the refund
 * dialog stay the Orders page's own; this is what happens to the goods:
 *
 *   Unfulfilled   what is still to ship, and Fulfill items (all or some,
 *                 with carrier, tracking and an email to the buyer)
 *   Shipments     each with its tracking, moved on to in transit, out for
 *                 delivery or delivered, or cancelled (stock back)
 *   Returns       opened here or asked for by the buyer, approved,
 *                 received (back in stock where chosen) and closed
 *   Timeline      everything that happened, newest first
 *
 * Every action goes to /api/physical/orders/[id] and comes back as the
 * whole order again, so the card always shows what the server holds.
 */

import * as React from "react"
import { Package, PackageCheck, Printer, Truck, Undo2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressLines } from "@/lib/physical/address"
import { deliveryEstimate } from "@/lib/physical/rates"
import { CARRIERS, FULFILLMENT_LABEL, RETURN_LABEL, SHIPMENT_LABEL, orderNumber } from "@/lib/physical/status"
import type { FulfillmentStatus, ReturnStatus, ShipmentStatus } from "@/lib/physical/types"
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, BTN_SECONDARY, Field, Modal, Notice, NumberInput, Pill, SelectInput, TextInput, Toggle, actionKey, api, dateTime, money } from "./ui"

interface Line {
  orderId: string
  title: string
  variantName: string | null
  sku: string | null
  imageUrl: string | null
  type: string
  quantity: number
  requiresShipping: boolean
  locationId: string | null
  fulfilled: number
  returned: number
  amountCents: number
  refundedCents: number
}
interface Shipment {
  id: string
  status: ShipmentStatus
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  shippedAt: string | null
  deliveredAt: string | null
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
interface Order {
  id: string
  status: string
  fulfillmentStatus: FulfillmentStatus
  returnStatus: ReturnStatus
  currency: string
  totalCents: number
  refundedCents: number
  shippingCents: number
  shippingDiscountCents: number
  address: Record<string, any> | null
  delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null } | null
  buyerNote: string | null
  merchantNote: string | null
  cancelledAt: string | null
  lines: Line[]
  shipments: Shipment[]
  returns: ReturnRec[]
  events: { id: number; kind: string; message: string; actor: string; createdAt: string }[]
}
interface Loc {
  id: string
  name: string
}

const REASON_LABEL: Record<string, string> = {
  size: "Size or fit",
  damaged: "Damaged",
  defective: "Defective",
  not_as_described: "Not as described",
  wrong_item: "Wrong item",
  changed_mind: "Changed mind",
  other: "Other",
}

const CARD = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

export function PhysicalOrderPanel({ orderRowId, revision = 0, className }: { orderRowId: string; revision?: number; className?: string }) {
  const [order, setOrder] = React.useState<Order | null>(null)
  const [locations, setLocations] = React.useState<Loc[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [dialog, setDialog] = React.useState<"fulfil" | "return" | "cancel" | { tracking: Shipment } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const r = await api<{ order: Order; locations: Loc[] }>(`/api/physical/orders/${orderRowId}`)
    if (!r.ok) return setError(r.error)
    setOrder(r.data.order)
    setLocations(r.data.locations)
  }, [orderRowId])
  React.useEffect(() => {
    void load()
  }, [load])

  /* A refund made with the Orders page's own dialog: the order catches up. */
  React.useEffect(() => {
    if (revision === 0 || !order) return
    void api<{ order: Order }>(`/api/physical/orders/${order.id}`, { body: { action: "refunded" } }).then((r) => r.ok && setOrder(r.data.order))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision])

  const act = async (body: Record<string, unknown>): Promise<string | null> => {
    if (!order) return "Not loaded."
    setBusy(true)
    const r = await api<{ order: Order }>(`/api/physical/orders/${order.id}`, { body })
    setBusy(false)
    if (!r.ok) return r.error
    if ("order" in r.data && r.data.order) setOrder(r.data.order)
    return null
  }

  if (error && !order) return <Notice className={className}>{error}</Notice>
  if (!order) return <div className={cn(CARD, "h-[220px] animate-pulse", className)} aria-busy="true" />

  const unfulfilled = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
  const fs = FULFILLMENT_LABEL[order.fulfillmentStatus]
  const nameOfLine = (id: string) => {
    const l = order.lines.find((x) => x.orderId === id)
    return l ? `${l.title}${l.variantName ? `, ${l.variantName}` : ""}` : "Item"
  }
  const locName = (id: string | null) => locations.find((l) => l.id === id)?.name ?? null

  return (
    <div className={cn("grid min-w-0 gap-4", className)} data-physical-order="">
      {/* ── To ship ── */}
      {unfulfilled.length > 0 && !order.cancelledAt ? (
        <section className={cn(CARD, "min-w-0")}>
          <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 pt-3">
            <div className="flex items-center gap-2">
              <Pill tone={fs.tone}>{fs.label}</Pill>
              <span className="text-[12px] text-[#6b7280]">{unfulfilled.reduce((n, l) => n + l.quantity - l.fulfilled, 0)} to ship</span>
            </div>
            {locName(unfulfilled[0]?.locationId) ? <span className="truncate text-[12px] text-[#6b7280]">From {locName(unfulfilled[0].locationId)}</span> : null}
          </div>
          <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
            {unfulfilled.map((l) => (
              <LineRow key={l.orderId} line={l} quantity={l.quantity - l.fulfilled} />
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
            {order.shipments.length === 0 ? (
              <button type="button" className={BTN_SECONDARY} onClick={() => setDialog("cancel")} disabled={busy}>
                Cancel order
              </button>
            ) : null}
            <button type="button" className={BTN_SECONDARY} onClick={() => printSlip(order)}>
              <Printer className="h-4 w-4" />
              Packing slip
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => setDialog("fulfil")} disabled={busy || order.status === "refunded"}>
              <PackageCheck className="h-4 w-4" />
              Fulfill items
            </button>
          </div>
        </section>
      ) : null}

      {order.cancelledAt ? <Notice tone="gray">This order was cancelled and its stock released. Refund the payment with Refund if you haven't.</Notice> : null}

      {/* ── Shipments ── */}
      {order.shipments.map((s) => {
        const st = SHIPMENT_LABEL[s.status]
        return (
          <section key={s.id} className={cn(CARD, "min-w-0", s.status === "cancelled" && "opacity-60")}>
            <div className="flex min-h-[48px] flex-wrap items-center justify-between gap-2 px-4 pt-3">
              <div className="flex items-center gap-2">
                <Pill tone={st.tone}>{st.label}</Pill>
                <span className="text-[12px] text-[#6b7280]">{dateTime(s.shippedAt)}</span>
              </div>
              {s.trackingNumber ? (
                s.trackingUrl ? (
                  <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="truncate text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2">
                    {[s.carrier, s.trackingNumber].filter(Boolean).join(" ")}
                  </a>
                ) : (
                  <span className="truncate text-[13px] text-[#1a1a2e]">{[s.carrier, s.trackingNumber].filter(Boolean).join(" ")}</span>
                )
              ) : (
                <span className="text-[12.5px] text-[#9ca3af]">No tracking</span>
              )}
            </div>
            <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
              {s.items.map((i) => {
                const l = order.lines.find((x) => x.orderId === i.orderId)
                return l ? <LineRow key={i.orderId} line={l} quantity={i.quantity} /> : null
              })}
            </ul>
            {s.status !== "cancelled" && s.status !== "delivered" ? (
              <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
                <button type="button" className={BTN_GHOST} onClick={() => setDialog({ tracking: s })}>
                  {s.trackingNumber ? "Edit tracking" : "Add tracking"}
                </button>
                {s.status === "shipped" || s.status === "submitted" || s.status === "pending" ? (
                  <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={async () => setError(await act({ action: "shipment", fulfillmentId: s.id, status: "in_transit" }))}>
                    In transit
                  </button>
                ) : null}
                <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={async () => setError(await act({ action: "shipment", fulfillmentId: s.id, status: "delivered" }))}>
                  <Truck className="h-4 w-4" />
                  Mark delivered
                </button>
                <button
                  type="button"
                  className={BTN_GHOST}
                  disabled={busy}
                  onClick={async () => {
                    if (!window.confirm("Cancel this shipment? Its items go back to unfulfilled and back in stock.")) return
                    setError(await act({ action: "shipment", fulfillmentId: s.id, status: "cancelled", notifyBuyer: false }))
                  }}
                >
                  Cancel shipment
                </button>
              </div>
            ) : (
              <div className="h-3" />
            )}
          </section>
        )
      })}

      {error ? <Notice>{error}</Notice> : null}

      {/* ── Delivery and returns ── */}
      <section className={cn(CARD, "min-w-0 px-4 py-4")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-[13px] font-semibold text-[#1a1a2e]">Ship to</h3>
            <p className="mt-1 text-[13px] leading-[19px] text-[#4b5563]">
              {addressLines(order.address as any).map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </p>
          </div>
          <div>
            <h3 className="text-[13px] font-semibold text-[#1a1a2e]">Delivery</h3>
            <p className="mt-1 text-[13px] text-[#4b5563]">
              {order.delivery ? `${order.delivery.name}, ${order.shippingCents - order.shippingDiscountCents === 0 ? "free" : money(order.shippingCents - order.shippingDiscountCents)}` : "Not chosen"}
            </p>
            {order.delivery && deliveryEstimate(order.delivery) ? <p className="text-[12.5px] text-[#6b7280]">{deliveryEstimate(order.delivery)}</p> : null}
            {order.buyerNote ? (
              <>
                <h3 className="mt-3 text-[13px] font-semibold text-[#1a1a2e]">Buyer's note</h3>
                <p className="mt-1 whitespace-pre-wrap text-[13px] text-[#4b5563]">{order.buyerNote}</p>
              </>
            ) : null}
          </div>
        </div>
      </section>

      <section className={cn(CARD, "min-w-0")}>
        <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 pt-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-[#1a1a2e]">Returns</h3>
            {order.returnStatus !== "none" ? <Pill tone={RETURN_LABEL[order.returnStatus].tone}>{RETURN_LABEL[order.returnStatus].label}</Pill> : null}
          </div>
          {order.status !== "refunded" && order.lines.some((l) => (l.requiresShipping ? l.fulfilled : l.quantity) - l.returned > 0) ? (
            <button type="button" className={BTN_GHOST} onClick={() => setDialog("return")}>
              <Undo2 className="h-4 w-4" />
              Start return
            </button>
          ) : null}
        </div>
        {order.returns.length === 0 ? <p className="px-4 pb-4 text-[13px] text-[#6b7280]">No returns.</p> : null}
        <ul className="space-y-3 px-4 pb-4">
          {order.returns.map((r) => (
            <ReturnBlock key={r.id} r={r} nameOfLine={nameOfLine} busy={busy} onMove={async (status, extra) => setError(await act({ action: "return_move", returnId: r.id, status, ...extra }))} />
          ))}
        </ul>
      </section>

      <NoteCard order={order} onSave={(note) => act({ action: "note", note })} />

      <section className={cn(CARD, "min-w-0 px-4 py-4")}>
        <h3 className="mb-2 text-[14px] font-semibold text-[#1a1a2e]">Order history</h3>
        <ol className="space-y-2.5">
          {order.events.map((e) => (
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

      {dialog === "fulfil" ? <FulfilDialog order={order} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "fulfil", ...body }); if (!e) setDialog(null); return e }} /> : null}
      {dialog === "return" ? <ReturnDialog order={order} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "return", ...body }); if (!e) setDialog(null); return e }} /> : null}
      {dialog === "cancel" ? <CancelDialog onClose={() => setDialog(null)} onSubmit={async (reason) => { const e = await act({ action: "cancel", reason }); if (!e) setDialog(null); return e }} /> : null}
      {dialog && typeof dialog === "object" ? <TrackingDialog shipment={dialog.tracking} onClose={() => setDialog(null)} onSubmit={async (body) => { const e = await act({ action: "shipment", fulfillmentId: dialog.tracking.id, ...body }); if (!e) setDialog(null); return e }} /> : null}
    </div>
  )
}

function LineRow({ line, quantity }: { line: Line; quantity: number }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#eceef1] bg-[#f4f5f7]">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[#9ca3af]">
            <Package className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#1a1a2e]">{line.title}</p>
        <p className="truncate text-[12px] text-[#6b7280]">{[line.variantName, line.sku ? `SKU ${line.sku}` : null].filter(Boolean).join(" · ") || "Physical"}</p>
      </div>
      <span className="text-[13px] font-medium tabular-nums text-[#1a1a2e]">&times; {quantity}</span>
    </li>
  )
}

function FulfilDialog({ order, onClose, onSubmit }: { order: Order; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const open = order.lines.filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
  const [qty, setQty] = React.useState<Record<string, string>>(Object.fromEntries(open.map((l) => [l.orderId, String(l.quantity - l.fulfilled)])))
  const [carrier, setCarrier] = React.useState("")
  const [otherCarrier, setOtherCarrier] = React.useState("")
  const [tracking, setTracking] = React.useState("")
  const [trackingUrl, setTrackingUrl] = React.useState("")
  const [notify, setNotify] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const key = React.useRef(actionKey())
  const name = carrier === "Other" ? otherCarrier : carrier
  return (
    <Modal
      open
      onClose={onClose}
      title="Fulfill items"
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
              const e = await onSubmit({
                items: Object.entries(qty).map(([orderId, q]) => ({ orderId, quantity: Number.parseInt(q, 10) || 0 })),
                carrier: name || null,
                trackingNumber: tracking.trim() || null,
                trackingUrl: carrier === "Other" ? trackingUrl.trim() || null : null,
                notifyBuyer: notify,
                key: key.current,
              })
              setBusy(false)
              setError(e)
            }}
          >
            {busy ? "Saving" : "Fulfill items"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="divide-y divide-[#f1f2f4] rounded-xl border border-[#eceef1]">
          {open.map((l) => (
            <li key={l.orderId} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[14px] text-[#1a1a2e]">{l.title}</p>
                <p className="text-[12px] text-[#6b7280]">{[l.variantName, `${l.quantity - l.fulfilled} to ship`].filter(Boolean).join(" · ")}</p>
              </div>
              <NumberInput value={qty[l.orderId] ?? ""} onChange={(v) => setQty((q) => ({ ...q, [l.orderId]: v }))} className="w-[80px] text-right" aria-label={`Units of ${l.title}`} />
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Carrier">
            <SelectInput value={carrier} onChange={setCarrier}>
              <option value="">No tracking</option>
              {CARRIERS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectInput>
          </Field>
          {carrier ? (
            <Field label="Tracking number">
              <TextInput value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value.replace(/\s/g, ""))} />
            </Field>
          ) : null}
          {carrier === "Other" ? (
            <>
              <Field label="Carrier name">
                <TextInput value={otherCarrier} maxLength={40} onChange={(e) => setOtherCarrier(e.target.value)} />
              </Field>
              <Field label="Tracking link" hint="Optional, https://">
                <TextInput value={trackingUrl} maxLength={500} onChange={(e) => setTrackingUrl(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        <Toggle label="Email the buyer" description="Sends the shipping confirmation with the tracking link." checked={notify} onChange={setNotify} />
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function TrackingDialog({ shipment, onClose, onSubmit }: { shipment: Shipment; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const known = CARRIERS.includes(shipment.carrier ?? "") ? shipment.carrier ?? "" : shipment.carrier ? "Other" : ""
  const [carrier, setCarrier] = React.useState(known)
  const [other, setOther] = React.useState(known === "Other" ? shipment.carrier ?? "" : "")
  const [tracking, setTracking] = React.useState(shipment.trackingNumber ?? "")
  const [url, setUrl] = React.useState(shipment.trackingUrl ?? "")
  const [error, setError] = React.useState<string | null>(null)
  return (
    <Modal
      open
      onClose={onClose}
      title="Tracking"
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={async () => setError(await onSubmit({ carrier: carrier === "Other" ? other : carrier || null, trackingNumber: tracking.trim() || null, trackingUrl: carrier === "Other" ? url.trim() || null : null }))}
          >
            Save
          </button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Carrier">
          <SelectInput value={carrier} onChange={setCarrier}>
            <option value="">None</option>
            {CARRIERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Tracking number">
          <TextInput value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value.replace(/\s/g, ""))} />
        </Field>
        {carrier === "Other" ? (
          <>
            <Field label="Carrier name">
              <TextInput value={other} maxLength={40} onChange={(e) => setOther(e.target.value)} />
            </Field>
            <Field label="Tracking link">
              <TextInput value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </>
        ) : null}
      </div>
      {error ? <Notice className="mt-3">{error}</Notice> : null}
    </Modal>
  )
}

function ReturnDialog({ order, onClose, onSubmit }: { order: Order; onClose: () => void; onSubmit: (b: Record<string, unknown>) => Promise<string | null> }) {
  const lines = order.lines.filter((l) => (l.requiresShipping ? l.fulfilled : l.quantity) - l.returned > 0)
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [restock, setRestock] = React.useState<Record<string, boolean>>({})
  const [reason, setReason] = React.useState("other")
  const [method, setMethod] = React.useState("ship_back")
  const [note, setNote] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
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
            onClick={async () =>
              setError(
                await onSubmit({
                  items: Object.entries(qty)
                    .map(([orderId, q]) => ({ orderId, quantity: Number.parseInt(q, 10) || 0, restock: restock[orderId] !== false }))
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
          {lines.map((l) => (
            <li key={l.orderId} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-[#1a1a2e]">{l.title}</p>
                  <p className="text-[12px] text-[#6b7280]">{[l.variantName, `${(l.requiresShipping ? l.fulfilled : l.quantity) - l.returned} can be returned`].filter(Boolean).join(" · ")}</p>
                </div>
                <NumberInput value={qty[l.orderId] ?? ""} placeholder="0" onChange={(v) => setQty((q) => ({ ...q, [l.orderId]: v }))} className="w-[80px] text-right" aria-label={`Units of ${l.title} to return`} />
              </div>
              {l.type === "physical" && Number(qty[l.orderId]) > 0 ? (
                <label className="flex items-center gap-2 text-[13px] text-[#4b5563]">
                  <input type="checkbox" checked={restock[l.orderId] !== false} onChange={(e) => setRestock((r) => ({ ...r, [l.orderId]: e.target.checked }))} className="h-4 w-4 accent-[#1a1a2e]" />
                  Put back in stock when received
                </label>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Reason">
            <SelectInput value={reason} onChange={setReason}>
              {Object.entries(REASON_LABEL).map(([v, l]) => (
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
          <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[14px] outline-none focus:border-[#9ca3af]" />
        </Field>
        <p className="text-[12.5px] text-[#6b7280]">Refund the money with Refund on this order when you're ready. A return doesn't refund by itself.</p>
        {error ? <Notice>{error}</Notice> : null}
      </div>
    </Modal>
  )
}

function ReturnBlock({ r, nameOfLine, busy, onMove }: { r: ReturnRec; nameOfLine: (id: string) => string; busy: boolean; onMove: (status: string, extra?: Record<string, unknown>) => void }) {
  const tone = r.status === "requested" ? "amber" : r.status === "rejected" || r.status === "cancelled" ? "gray" : r.status === "completed" ? "green" : "blue"
  const label: Record<string, string> = { requested: "Requested", approved: "Approved", rejected: "Declined", in_transit: "On its way back", received: "Received", completed: "Closed", cancelled: "Cancelled" }
  return (
    <li className="rounded-xl border border-[#eceef1] px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13.5px] font-medium text-[#1a1a2e]">
          <Pill tone={tone}>{label[r.status] ?? r.status}</Pill>
          {REASON_LABEL[r.reason] ?? r.reason}
          {r.requestedBy === "buyer" ? <span className="text-[12px] font-normal text-[#6b7280]">asked by the buyer</span> : null}
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
            <button type="button" className={cn(BTN_PRIMARY, "h-9")} disabled={busy} onClick={() => onMove("approved")}>
              Approve
            </button>
            <button type="button" className={cn(BTN_DANGER, "h-9")} disabled={busy} onClick={() => onMove("rejected")}>
              Decline
            </button>
          </>
        ) : null}
        {r.status === "approved" || r.status === "in_transit" ? (
          <button type="button" className={cn(BTN_PRIMARY, "h-9")} disabled={busy} onClick={() => onMove("received")}>
            Mark received
          </button>
        ) : null}
        {r.status === "received" ? (
          <button type="button" className={cn(BTN_SECONDARY, "h-9")} disabled={busy} onClick={() => onMove("completed")}>
            Close return
          </button>
        ) : null}
        {r.status === "approved" || r.status === "requested" ? (
          <button type="button" className={cn(BTN_GHOST, "h-9")} disabled={busy} onClick={() => onMove("cancelled")}>
            <X className="h-4 w-4" />
            Cancel
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
      <p className="text-[14px] leading-[21px] text-[#4b5563]">Its stock goes back on sale. The payment isn't refunded by this: use Refund on the order for that.</p>
      <Field label="Reason" hint="Optional, for your history" className="mt-3">
        <TextInput value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error ? <Notice className="mt-3">{error}</Notice> : null}
    </Modal>
  )
}

function NoteCard({ order, onSave }: { order: Order; onSave: (note: string) => Promise<string | null> }) {
  const [note, setNote] = React.useState(order.merchantNote ?? "")
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle")
  const changed = note !== (order.merchantNote ?? "")
  return (
    <section className={cn(CARD, "min-w-0 px-4 py-4")}>
      <h3 className="mb-2 text-[14px] font-semibold text-[#1a1a2e]">Notes</h3>
      <textarea value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Only you can see this" className="w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[14px] outline-none focus:border-[#9ca3af]" />
      {changed || state === "saved" ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className={cn(BTN_SECONDARY, "h-9")}
            disabled={state === "saving" || !changed}
            onClick={async () => {
              setState("saving")
              await onSave(note)
              setState("saved")
              setTimeout(() => setState("idle"), 1500)
            }}
          >
            {state === "saved" ? "Saved" : "Save note"}
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** A packing slip for the box: what to pack and where it goes. No prices. */
function printSlip(order: Order) {
  const w = window.open("", "_blank", "width=720,height=900")
  if (!w) return
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const rows = order.lines
    .filter((l) => l.requiresShipping && l.quantity - l.fulfilled > 0)
    .map((l) => `<tr><td>${esc(l.title)}${l.variantName ? `<br><small>${esc(l.variantName)}</small>` : ""}</td><td>${esc(l.sku ?? "")}</td><td style="text-align:right">${l.quantity - l.fulfilled}</td></tr>`)
    .join("")
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Packing slip ${esc(orderNumber(order.id))}</title><style>body{font-family:Inter,Arial,sans-serif;color:#1a1a2e;padding:32px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left;font-size:14px}small{color:#6b7280}.addr{margin-top:16px;font-size:14px;line-height:1.5}</style></head><body><h1>Packing slip</h1><div>Order ${esc(orderNumber(order.id))}</div><div class="addr"><strong>Ship to</strong><br>${addressLines(order.address as any).map(esc).join("<br>")}</div><table><thead><tr><th>Item</th><th>SKU</th><th style="text-align:right">Qty</th></tr></thead><tbody>${rows}</tbody></table>${order.buyerNote ? `<p class="addr"><strong>Note</strong><br>${esc(order.buyerNote)}</p>` : ""}<script>window.onload=function(){window.print()}</script></body></html>`)
  w.document.close()
}
