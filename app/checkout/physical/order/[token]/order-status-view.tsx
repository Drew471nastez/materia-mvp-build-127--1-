"use client"

import * as React from "react"
import { Check, Download, ExternalLink, MapPin, Package, RefreshCw, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressLines } from "@/lib/physical/address"
import { deliveryEstimate } from "@/lib/physical/rates"
import { orderNumber, shipmentLabel } from "@/lib/physical/status"
import type { ShipmentStatus } from "@/lib/physical/types"

interface Props {
  token: string
  justPaid: boolean
  shop: { name: string; avatar: string | null; email: string | null }
  order: {
    id: string
    status: string
    fulfillmentStatus: string
    cancelled: boolean
    createdAt: string
    email: string | null
    name: string | null
    address: Record<string, any> | null
    delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null } | null
    /** Collected by the buyer instead of shipped. */
    pickup: { name: string; address: string[]; instructions: string | null; ready: string } | null
    processing: boolean
    totals: { subtotal: number; discount: number; shipping: number; tax: number; taxIncluded: boolean; total: number; refunded: number }
    lines: { orderId: string; title: string; variantName: string | null; imageUrl: string | null; quantity: number; cents: number; type: string; receiptToken: string | null; returnable: number }[]
    shipments: { id: string; status: string; carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; shippedAt: string | null; deliveredAt: string | null; items: { orderId: string; quantity: number }[] }[]
    returns: { id: string; status: string; createdAt: string }[]
  }
  canReturn: boolean
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "")

const RETURN_TEXT: Record<string, string> = {
  requested: "Return requested. The shop will reply by email.",
  approved: "Return approved. Send the items back using the shop's instructions.",
  in_transit: "Your return is on its way to the shop.",
  received: "The shop received your return.",
  completed: "Return complete.",
  rejected: "The shop couldn't accept this return.",
  cancelled: "Return cancelled.",
}

export function PendingOrder({ reason }: { reason: string | null }) {
  React.useEffect(() => {
    if (reason === "failed" || reason === "not_found") return
    const t = window.setTimeout(() => window.location.reload(), 4000)
    return () => window.clearTimeout(t)
  }, [reason])
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#f8f9fa] px-6 text-center">
      <RefreshCw className={cn("h-7 w-7 text-[#9ca3af]", reason !== "failed" && "animate-spin")} />
      <h1 className="mt-4 text-[22px] font-semibold text-[#1a1a2e]">{reason === "failed" || reason === "not_found" ? "We couldn't confirm your order here" : "Confirming your payment"}</h1>
      <p className="mt-2 max-w-[420px] text-[15px] leading-[22px] text-[#6b7280]">
        {reason === "failed" || reason === "not_found" ? "If you paid, your order is safe: you'll get a confirmation email with a link to it in a few minutes." : "This takes a few seconds. Your confirmation email is on its way."}
      </p>
    </main>
  )
}

export function OrderStatusView({ token, justPaid, shop, order, canReturn }: Props) {
  const shipped = order.shipments.some((s) => s.shippedAt)
  const delivered = order.shipments.length > 0 && order.shipments.every((s) => s.status === "delivered")
  const needsShipping = order.lines.some((l) => l.type === "physical")
  const pickup = order.pickup
  const steps = order.cancelled
    ? []
    : needsShipping
      ? [
          { label: "Confirmed", done: true, when: day(order.createdAt) },
          { label: "Processing", done: order.processing || shipped, when: "" },
          { label: pickup ? "Ready for pickup" : "Shipped", done: shipped, when: day(order.shipments.find((s) => s.shippedAt)?.shippedAt ?? null) },
          { label: pickup ? "Picked up" : "Delivered", done: delivered, when: day(order.shipments.find((s) => s.deliveredAt)?.deliveredAt ?? null) },
        ]
      : [{ label: "Confirmed", done: true, when: day(order.createdAt) }]
  const first = order.name?.split(/\s+/)[0]

  return (
    <main className="min-h-dvh bg-[#f8f9fa]">
      <header className="border-b border-[#eef0f2] bg-white">
        <div className="mx-auto flex h-16 max-w-[760px] items-center gap-2.5 px-4 sm:px-6">
          {shop.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.avatar} alt="" className="h-8 w-8 rounded-full border border-[#e5e7eb] object-cover" />
          ) : null}
          <span className="truncate text-[17px] font-semibold text-[#1a1a2e]">{shop.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[760px] space-y-4 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <p className="text-[13px] font-medium text-[#6b7280]">Order {orderNumber(order.id)}</p>
          <h1 className="mt-1 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">
            {order.cancelled
              ? "Your order was cancelled"
              : justPaid
                ? `Thank you${first ? `, ${first}` : ""}!`
                : delivered
                  ? pickup
                    ? "Your order was picked up"
                    : "Your order was delivered"
                  : shipped
                    ? pickup
                      ? "Your order is ready to pick up"
                      : "Your order is on the way"
                    : "Your order is confirmed"}
          </h1>
          {order.email && justPaid ? <p className="mt-1 text-[14px] text-[#6b7280]">A confirmation is on its way to {order.email}.</p> : null}
        </div>

        {steps.length > 1 ? (
          <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
            <ol className="grid grid-cols-4 gap-2">
              {steps.map((s, i) => (
                <li key={s.label} className="relative">
                  <div className="flex items-center">
                    <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full", s.done ? "bg-[#1a1a2e] text-white" : "border-2 border-[#d1d5db] bg-white")}>{s.done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : null}</span>
                    {i < steps.length - 1 ? <span className={cn("mx-2 h-[2px] flex-1 rounded", steps[i + 1].done ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]")} /> : null}
                  </div>
                  <p className="mt-2 text-[12.5px] font-medium leading-4 text-[#1a1a2e] sm:text-[13.5px]">{s.label}</p>
                  <p className="text-[12.5px] text-[#6b7280]">{s.when}</p>
                </li>
              ))}
            </ol>
            {pickup && !shipped ? <p className="mt-4 text-[13.5px] text-[#6b7280]">{pickup.ready}. We'll email you when it's ready.</p> : null}
            {!pickup && order.delivery && !shipped ? <p className="mt-4 text-[13.5px] text-[#6b7280]">{order.delivery.name}{deliveryEstimate(order.delivery) ? `, usually ${deliveryEstimate(order.delivery)} after it ships` : ""}.</p> : null}
          </section>
        ) : null}

        {pickup ? (
          <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6" data-pickup-point="">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f3f4f6]">
                <MapPin className="h-5 w-5 text-[#1a1a2e]" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[#1a1a2e]">Pick up at {pickup.name}</p>
                <p className="mt-0.5 text-[14px] leading-[21px] text-[#4b5563]">{pickup.address.join(", ")}</p>
                {pickup.instructions ? <p className="mt-2 whitespace-pre-line rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13.5px] leading-5 text-[#4b5563]">{pickup.instructions}</p> : null}
                <p className="mt-2 text-[13px] text-[#6b7280]">Bring your order number, {orderNumber(order.id)}.</p>
              </div>
            </div>
          </section>
        ) : null}

        {pickup ? null : order.shipments.map((s) => (
          <section key={s.id} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#f3f4f6]">
                  <Truck className="h-5 w-5 text-[#1a1a2e]" />
                </span>
                <div>
                  <p className="text-[15px] font-semibold text-[#1a1a2e]">{shipmentLabel(s.status as ShipmentStatus, false)?.label ?? "Shipped"}</p>
                  <p className="text-[13px] text-[#6b7280]">{[s.carrier, s.trackingNumber].filter(Boolean).join(" ") || "Tracking not added yet"}</p>
                </div>
              </div>
              {s.trackingUrl ? (
                <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white">
                  Track package
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
            </div>
          </section>
        ))}

        <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
          <h2 className="mb-3 text-[16px] font-semibold text-[#1a1a2e]">Items</h2>
          <ul className="space-y-3">
            {order.lines.map((l) => (
              <li key={l.orderId} className="flex items-start gap-3">
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-[#e5e7eb] object-cover" />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#f3f4f6]">
                    <Package className="h-5 w-5 text-[#9ca3af]" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1a1a2e]">{l.title}</p>
                  <p className="text-[13px] text-[#6b7280]">{[l.variantName, `Qty ${l.quantity}`].filter(Boolean).join(" · ")}</p>
                  {l.receiptToken ? (
                    <a href={`/receipt/${encodeURIComponent(l.receiptToken)}`} className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e] underline underline-offset-4">
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                  ) : null}
                </div>
                <span className="shrink-0 text-[14px] tabular-nums text-[#1a1a2e]">{money(l.cents)}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 space-y-1.5 border-t border-[#eef0f2] pt-4 text-[14px]">
            <Row label="Subtotal" value={money(order.totals.subtotal)} />
            {order.totals.discount ? <Row label="Discount" value={`-${money(order.totals.discount)}`} /> : null}
            {needsShipping ? <Row label={pickup ? "Pickup" : "Shipping"} value={order.totals.shipping ? money(order.totals.shipping) : "Free"} /> : null}
            {order.totals.tax ? <Row label={order.totals.taxIncluded ? "Including tax" : "Tax"} value={money(order.totals.tax)} /> : null}
            <Row label="Total" value={money(order.totals.total)} strong />
            {order.totals.refunded ? <Row label="Refunded" value={`-${money(order.totals.refunded)}`} /> : null}
          </dl>
        </section>

        {order.address ? (
          <section className="grid gap-4 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:grid-cols-2 sm:p-6">
            <div>
              <h2 className="mb-1.5 text-[14px] font-semibold text-[#1a1a2e]">Shipping address</h2>
              <p className="text-[14px] leading-[21px] text-[#4b5563]">
                {addressLines(order.address as any).map((line) => (
                  <span key={line} className="block">
                    {line}
                  </span>
                ))}
              </p>
            </div>
            <div>
              <h2 className="mb-1.5 text-[14px] font-semibold text-[#1a1a2e]">Shipping method</h2>
              <p className="text-[14px] text-[#4b5563]">{order.delivery?.name ?? "Standard"}</p>
            </div>
          </section>
        ) : null}

        {order.returns.length ? (
          <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
            <h2 className="mb-2 text-[16px] font-semibold text-[#1a1a2e]">Returns</h2>
            {order.returns.map((r) => (
              <p key={r.id} className="text-[14px] text-[#4b5563]">
                {day(r.createdAt)}: {RETURN_TEXT[r.status] ?? r.status}
              </p>
            ))}
          </section>
        ) : null}

        {canReturn ? <ReturnRequest token={token} lines={order.lines.filter((l) => l.returnable > 0)} /> : null}

        <p className="pt-2 text-center text-[13px] text-[#6b7280]">
          Questions? {shop.email ? <a href={`mailto:${shop.email}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">Email {shop.name}</a> : "Reply to your order email."}
        </p>
      </div>
    </main>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between", strong && "border-t border-[#eef0f2] pt-2 text-[15px] font-semibold")}>
      <dt className={strong ? "text-[#1a1a2e]" : "text-[#6b7280]"}>{label}</dt>
      <dd className="tabular-nums text-[#1a1a2e]">{value}</dd>
    </div>
  )
}

const REASONS = [
  ["size", "Size or fit"],
  ["damaged", "Arrived damaged"],
  ["defective", "Doesn't work"],
  ["not_as_described", "Not as described"],
  ["wrong_item", "Wrong item"],
  ["changed_mind", "Changed my mind"],
  ["other", "Other"],
] as const

function ReturnRequest({ token, lines }: { token: string; lines: Props["order"]["lines"] }) {
  const [open, setOpen] = React.useState(false)
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [reason, setReason] = React.useState<string>("size")
  const [note, setNote] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  if (state === "sent") return <p className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]">Return requested. The shop will email you with what happens next.</p>
  if (!open) {
    return (
      <div className="text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4">
          Return items
        </button>
      </div>
    )
  }
  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
      <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Return items</h2>
      <ul className="space-y-2">
        {lines.map((l) => (
          <li key={l.orderId} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[14px] text-[#1a1a2e]">
              {l.title}
              {l.variantName ? `, ${l.variantName}` : ""}
            </span>
            <select value={qty[l.orderId] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [l.orderId]: Number(e.target.value) }))} className="h-10 rounded-lg border border-[#d9dce1] px-2 text-[14px]">
              {Array.from({ length: l.returnable + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-[10px] border border-[#d9dce1] px-3 text-[15px]">
        {REASONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} placeholder="Anything the shop should know" className="w-full rounded-[10px] border border-[#d9dce1] px-3 py-2.5 text-[15px]" />
      {error ? <p className="text-[13.5px] text-[#b42318]">{error}</p> : null}
      <button
        type="button"
        disabled={state === "sending" || !Object.values(qty).some((n) => n > 0)}
        onClick={async () => {
          setState("sending")
          setError(null)
          const res = await fetch(`/api/physical/order-status/${encodeURIComponent(token)}/return`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: Object.entries(qty).filter(([, n]) => n > 0).map(([orderId, quantity]) => ({ orderId, quantity })), reason, note }),
          }).catch(() => null)
          const data = res ? await res.json().catch(() => ({})) : {}
          if (!res || !res.ok) {
            setError(typeof data.error === "string" ? data.error : "Couldn't send the request. Try again.")
            setState("idle")
            return
          }
          setState("sent")
        }}
        className="h-12 w-full rounded-[12px] bg-[#1a1a2e] text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {state === "sending" ? "Sending" : "Request return"}
      </button>
    </section>
  )
}
