"use client"

import * as React from "react"
import { includedTaxLabel } from "@/lib/tax/rules"
import { OrderHelp } from "@/components/support/order-help"
import { AlertTriangle, Check, Download, ExternalLink, MapPin, Package, RefreshCw, Truck } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressLines } from "@/lib/physical/address"
import { deliveryEstimate } from "@/lib/physical/rates"
import { orderNumber, shipmentLabel } from "@/lib/physical/status"
import type { ShipmentStatus } from "@/lib/physical/types"
import type { BuyerCancelState } from "@/lib/physical/buyer-cancel"
import { TRACKING_LABEL, isTrackingStatus } from "@/lib/physical/tracking/labels"
import { TrackingTimeline, estimatedDay } from "@/components/physical/tracking-timeline"

interface Props {
  token: string
  justPaid: boolean
  /** The store's return reasons (Settings › Returns and refunds), as the buyer reads them. */
  reasons?: { value: string; label: string }[]
  shop: { name: string; avatar: string | null; email: string | null; phone?: string | null; websiteUrl?: string | null; legal?: { name: string; lines: string[]; taxId: string | null; taxIdLabel: string } | null }
  /** Get help with this order (lib/support/cases.ts): the open case when there is one; absent when cases aren't switched on. */
  help?: { openCase: { link: string; status: string } | null } | null
  order: {
    id: string
    status: string
    fulfillmentStatus: string
    cancelled: boolean
    createdAt: string
    email: string | null
    name: string | null
    address: Record<string, any> | null
    /** `kind` local: the shop brings it itself, with its note. */
    delivery: { name: string; priceCents: number; minDays: number | null; maxDays: number | null; kind?: "ship" | "local"; note?: string | null } | null
    /** Collected by the buyer instead of shipped. */
    pickup: { name: string; address: string[]; instructions: string | null; ready: string; hours?: string | null } | null
    processing: boolean
    /** `taxLabel`: "VAT 19%", as the checkout named it. `currency`: what it was charged in. */
    totals: { subtotal: number; discount: number; shipping: number; tax: number; taxIncluded: boolean; taxLabel?: string; total: number; refunded: number; currency?: string }
    lines: { orderId: string; title: string; variantName: string | null; imageUrl: string | null; quantity: number; cents: number; type: string; receiptToken: string | null; returnable: number }[]
    /** Each shipment's updates (`updates`, oldest first): shipped, in transit, out for delivery, delivered, a delivery problem. */
    shipments: {
      id: string
      status: string
      carrier: string | null
      trackingNumber: string | null
      trackingUrl: string | null
      shippedAt: string | null
      deliveredAt: string | null
      items: { orderId: string; quantity: number }[]
      updates?: { status: string; at: string }[]
      /** The carrier's scans, newest first, and its state and estimate, when Storelib follows the parcel (lib/physical/tracking). */
      checkpoints?: { at: string; status: string; message: string; location: string | null }[]
      tracking?: { status: string | null; estimatedDelivery: string | null; auto: boolean } | null
    }[]
    returns: { id: string; status: string; createdAt: string; reason?: string | null }[]
    /** Settings > Returns and refunds, for this order: absent when the shop doesn't take returns. */
    returnPolicy?: { days: number; endsAt: string | null; open: boolean } | null
  }
  canReturn: boolean
  /** Cancel order (lib/physical/buyer-cancel.ts): offered, asked and waiting, or answered with a no. */
  cancel?: BuyerCancelState
}

/* In the currency the order was charged in (commerce_checkouts.currency, the platform's: RON or USD), never a bare dollar sign. */
const moneyIn = (c: number, currency?: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() }).format(c / 100)
  } catch {
    return `${(c / 100).toFixed(2)} ${(currency || "").toUpperCase()}`.trim()
  }
}
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "")
const dayTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/** A local delivery's steps, in the shop's own words: nobody else carries it. */
function localLabel(status: string): string {
  return status === "delivered" ? "Delivered" : status === "out_for_delivery" ? "On its way to you today" : status === "failed" ? "Delivery problem" : "Being prepared for delivery"
}

/**
 * A shipment's updates as the buyer reads them: its statuses with when,
 * newest first, each once in a row ("Tracking updated" keeps its status,
 * so it never repeats a line), the shipped moment first of all.
 */
function buyerUpdates(s: Props["order"]["shipments"][number]): { status: string; at: string }[] {
  const seen: { status: string; at: string }[] = []
  for (const u of s.updates ?? []) if (u.status !== "pending" && u.status !== "submitted" && u.status !== "cancelled" && seen[seen.length - 1]?.status !== u.status) seen.push(u)
  if (seen.length === 0 && s.shippedAt) seen.push({ status: "shipped", at: s.shippedAt })
  return seen.reverse()
}

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

export function OrderStatusView({ token, justPaid, shop, order, canReturn, reasons, help, cancel }: Props) {
  const local = order.delivery?.kind === "local"
  const money = (c: number) => moneyIn(c, order.totals.currency)
  const shipped = order.shipments.some((s) => s.shippedAt)
  const delivered = order.shipments.length > 0 && order.shipments.every((s) => s.status === "delivered")
  const needsShipping = order.lines.some((l) => l.type === "physical")
  const pickup = order.pickup
  /* The carrier's estimate for the parcel still on its way that arrives last. */
  const arrives = estimatedDay(order.shipments.filter((s) => s.status !== "delivered").map((s) => s.tracking?.estimatedDelivery).filter((t): t is string => !!t).sort().pop() ?? null)
  const steps = order.cancelled
    ? []
    : needsShipping
      ? [
          { label: "Confirmed", done: true, when: day(order.createdAt) },
          { label: "Processing", done: order.processing || shipped, when: "" },
          { label: pickup ? "Ready for pickup" : "Shipped", done: shipped, when: day(order.shipments.find((s) => s.shippedAt)?.shippedAt ?? null) },
          { label: pickup ? "Picked up" : "Delivered", done: delivered, when: delivered ? day(order.shipments.find((s) => s.deliveredAt)?.deliveredAt ?? null) : arrives ? `Est. ${arrives}` : "" },
        ]
      : [{ label: "Confirmed", done: true, when: day(order.createdAt) }]
  const first = order.name?.split(/\s+/)[0]

  return (
    <main className="min-h-dvh bg-[#f8f9fa]">
      <header className="border-b border-[#eef0f2] bg-white">
        <div className="mx-auto flex h-16 max-w-[760px] items-center gap-2.5 px-4 sm:px-6">
          {shop.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.avatar} alt="" className="h-8 w-auto max-w-[120px] rounded-md object-contain" />
          ) : null}
          <span className="truncate text-[17px] font-semibold text-[#1a1a2e]">{shop.name}</span>
        </div>
      </header>
      <div className="mx-auto max-w-[760px] space-y-4 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <p className="text-[13px] font-medium text-[#6b7280]">
            Order {orderNumber(order.id)}
            {order.createdAt ? <> · {day(order.createdAt)}</> : null}
          </p>
          <h1 className="mt-1 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">
            {order.cancelled
              ? "Your order was cancelled"
              : justPaid
                ? `Thank you${first ? `, ${first}` : ""}!`
                : !delivered && order.shipments.some((s) => s.status === "failed")
                  ? "There's a problem with your delivery"
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
            {!pickup && local && !shipped ? <p className="mt-4 text-[13.5px] text-[#6b7280]">{shop.name} delivers this order to you.{order.delivery?.note ? ` ${order.delivery.note}` : ""}</p> : null}
            {!pickup && !local && order.delivery && !shipped ? <p className="mt-4 text-[13.5px] text-[#6b7280]">{order.delivery.name}{deliveryEstimate(order.delivery) ? `, usually ${deliveryEstimate(order.delivery)} after it ships` : ""}.</p> : null}
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
                {pickup.hours ? <p className="mt-1 text-[13.5px] text-[#4b5563]" data-pickup-hours=""><span className="font-medium text-[#1a1a2e]">Open</span> {pickup.hours}</p> : null}
                {pickup.instructions ? <p className="mt-2 whitespace-pre-line rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13.5px] leading-5 text-[#4b5563]">{pickup.instructions}</p> : null}
                <p className="mt-2 text-[13px] text-[#6b7280]">Bring your order number, {orderNumber(order.id)}.</p>
              </div>
            </div>
          </section>
        ) : null}

        {pickup ? null : order.shipments.map((s, i) => {
          const problem = s.status === "failed"
          const updates = buyerUpdates(s)
          /* What the carrier said last, when it says more than the status: ready to collect, a delivery attempt, returned to sender. */
          const carrierSaid = s.tracking?.status && isTrackingStatus(s.tracking.status) && s.status !== "delivered" && ["available_for_pickup", "attempt_failed", "returned"].includes(s.tracking.status) ? TRACKING_LABEL[s.tracking.status].label : null
          const eta = s.status !== "delivered" ? estimatedDay(s.tracking?.estimatedDelivery) : null
          const checkpoints = local ? [] : (s.checkpoints ?? [])
          return (
            <section key={s.id} className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6" data-shipment-status={s.status}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", problem ? "bg-[#fee4e2]" : "bg-[#f3f4f6]")}>
                    {problem ? <AlertTriangle className="h-5 w-5 text-[#b42318]" /> : <Truck className="h-5 w-5 text-[#1a1a2e]" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[#1a1a2e]">
                      {local ? localLabel(s.status) : (carrierSaid ?? shipmentLabel(s.status as ShipmentStatus, false)?.label ?? "Shipped")}
                      {order.shipments.length > 1 ? <span className="font-normal text-[#6b7280]"> · Package {i + 1} of {order.shipments.length}</span> : null}
                    </p>
                    <p className="text-[13px] text-[#6b7280]">{local ? "Delivered by the shop" : [s.carrier, s.trackingNumber].filter(Boolean).join(" ") || "Tracking not added yet"}</p>
                  </div>
                </div>
                {s.trackingUrl && !local ? (
                  <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white">
                    Track package
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </div>
              {eta && !problem ? (
                <p className="mt-3 text-[14px] text-[#1a1a2e]" data-estimated-delivery="">
                  <span className="text-[#6b7280]">Estimated delivery</span> <span className="font-medium">{eta}</span>
                </p>
              ) : null}
              {problem ? (
                <p className="mt-3 rounded-lg bg-[#fef3f2] px-3 py-2 text-[13.5px] leading-5 text-[#b42318]">
                  {s.tracking?.status === "returned" ? "The carrier is sending this package back to the shop." : s.tracking?.status === "attempt_failed" ? "The carrier tried to deliver this package and couldn't." : "The carrier reported a problem delivering this package."} {shop.name} will be in touch, or reply to your order email.
                </p>
              ) : null}
              {checkpoints.length > 0 ? (
                <TrackingTimeline checkpoints={checkpoints} className="mt-4 border-t border-[#eef0f2] pt-3" />
              ) : updates.length > 1 ? (
                <ol className="mt-4 space-y-2 border-t border-[#eef0f2] pt-3" data-shipment-updates="">
                  {updates.map((u, j) => (
                    <li key={`${u.status}:${u.at}`} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                      <span className={cn(j === 0 ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{local ? localLabel(u.status) : (shipmentLabel(u.status as ShipmentStatus, false)?.label ?? u.status)}</span>
                      <span className="shrink-0 tabular-nums text-[12.5px] text-[#9ca3af]">{dayTime(u.at)}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          )
        })}

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
            {order.totals.tax ? <Row label={order.totals.taxIncluded ? includedTaxLabel(order.totals.taxLabel) : order.totals.taxLabel || "Tax"} value={money(order.totals.tax)} /> : null}
            <Row label="Total" value={`${money(order.totals.total)}${order.totals.currency && order.totals.currency.toUpperCase() === "USD" ? " USD" : ""}`} strong />
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
              <h2 className="mb-1.5 text-[14px] font-semibold text-[#1a1a2e]">{local ? "Delivery" : "Shipping method"}</h2>
              <p className="text-[14px] text-[#4b5563]">{order.delivery?.name ?? "Standard"}</p>
              {local && order.delivery?.note ? <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{order.delivery.note}</p> : null}
            </div>
          </section>
        ) : null}

        {order.returns.length ? (
          <section className="rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6">
            <h2 className="mb-2 text-[16px] font-semibold text-[#1a1a2e]">Returns</h2>
            <ul className="space-y-2">
              {order.returns.map((r) => (
                <li key={r.id} className="text-[14px] leading-5 text-[#4b5563]" data-return-status={r.status}>
                  <span className="text-[#6b7280]">{day(r.createdAt)}:</span> {RETURN_TEXT[r.status] ?? r.status}
                  {r.reason ? <span className="block text-[13px] text-[#6b7280]">Reason: {r.reason}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {cancel === "can_request" ? <CancelRequest token={token} shopName={shop.name} /> : null}
        {cancel === "requested" ? (
          <p className="rounded-2xl border border-[#e5e7eb]/60 bg-white px-4 py-3 text-[14px] leading-5 text-[#4b5563] shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-cancel-state="requested">
            You asked to cancel this order. {shop.name} will cancel and refund it, or email you if it has already gone out.
          </p>
        ) : null}
        {cancel === "declined" ? (
          <p className="text-center text-[13px] leading-5 text-[#6b7280]" data-cancel-state="declined">
            {shop.name} is going ahead with this order. Reply to your order email with any questions.
          </p>
        ) : null}

        {canReturn ? <ReturnRequest token={token} lines={order.lines.filter((l) => l.returnable > 0)} reasons={reasons && reasons.length ? reasons : REASONS.map(([value, label]) => ({ value, label }))} until={order.returnPolicy?.endsAt ?? null} /> : null}
        {!canReturn && order.returnPolicy && !order.returnPolicy.open && order.returnPolicy.endsAt ? (
          <p className="text-center text-[13px] text-[#6b7280]" data-return-closed="">The return window for this order closed on {day(order.returnPolicy.endsAt)}.</p>
        ) : null}

        {help ? <OrderHelp kind="physical" token={token} storeName={shop.name} openCase={help.openCase} /> : null}

        {/* How to reach the store, every way it gave: Settings › Store details (lib/store/identity-server.ts). */}
        <p className="pt-2 text-center text-[13px] leading-[20px] text-[#6b7280]" data-order-contact="">
          Questions? {shop.email ? <a href={`mailto:${shop.email}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">Email {shop.name}</a> : "Reply to your order email."}
          {shop.phone ? <> · <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">{shop.phone}</a></> : null}
          {shop.websiteUrl ? <> · <a href={shop.websiteUrl} className="font-medium text-[#1a1a2e] underline underline-offset-4">Visit the store</a></> : null}
        </p>
        {/* The business that sold it, as a receipt must name it (Settings › Store details › Business details). */}
        {shop.legal ? (
          <p className="text-center text-[12.5px] leading-[18px] text-[#9ca3af]" data-order-seller="">
            Sold by {shop.legal.name}
            {shop.legal.lines.length ? `, ${shop.legal.lines.join(", ")}` : ""}
            {shop.legal.taxId ? `. ${shop.legal.taxIdLabel} ${shop.legal.taxId}` : ""}
          </p>
        ) : null}
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

function ReturnRequest({ token, lines, reasons, until }: { token: string; lines: Props["order"]["lines"]; reasons: { value: string; label: string }[]; until: string | null }) {
  const [open, setOpen] = React.useState(false)
  const [qty, setQty] = React.useState<Record<string, number>>({})
  const [reason, setReason] = React.useState<string>(reasons[0]?.value ?? "other")
  const [note, setNote] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  if (state === "sent") return <p className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]">Return requested. The shop will email you with what happens next.</p>
  if (!open) {
    return (
      <div className="text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" data-return-button="">
          Return items
        </button>
        {until ? <p className="mt-1 text-[12.5px] text-[#6b7280]">Until {day(until)}</p> : null}
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
      <label htmlFor="return-reason" className="block text-[13.5px] font-medium text-[#1a1a2e]">
        Why are you returning this?
      </label>
      <select id="return-reason" data-return-reasons="" value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 w-full rounded-[10px] border border-[#d9dce1] px-3 text-[15px]">
        {reasons.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
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

/**
 * Cancel order, while nothing has shipped or been started (lib/physical/buyer-cancel.ts). It asks the shop: nothing
 * is cancelled or refunded until the shop says yes, and the buyer then gets the Order cancelled email.
 */
function CancelRequest({ token, shopName }: { token: string; shopName: string }) {
  const [open, setOpen] = React.useState(false)
  const [reason, setReason] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  if (state === "sent") {
    return (
      <p className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]" data-cancel-state="sent">
        Request sent. {shopName} will cancel and refund your order, or email you if it has already gone out.
      </p>
    )
  }
  if (!open) {
    return (
      <div className="text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" data-cancel-button="">
          Cancel order
        </button>
        <p className="mt-1 text-[12.5px] text-[#6b7280]">Until {shopName} starts on it</p>
      </div>
    )
  }
  return (
    <section className="space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6" data-cancel-form="">
      <h2 className="text-[16px] font-semibold text-[#1a1a2e]">Cancel this order?</h2>
      <p className="text-[14px] leading-5 text-[#4b5563]">This asks {shopName} to cancel it before it ships. Once they do, you get an email and your money back.</p>
      <label htmlFor="cancel-reason" className="block text-[13.5px] font-medium text-[#1a1a2e]">
        Why are you cancelling? (optional)
      </label>
      <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2} className="w-full rounded-[10px] border border-[#d9dce1] px-3 py-2.5 text-[15px]" />
      {error ? <p className="text-[13.5px] text-[#b42318]">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-[12px] border border-[#d9dce1] bg-white px-5 text-[15px] font-medium text-[#1a1a2e] sm:h-11">
          Keep my order
        </button>
        <button
          type="button"
          disabled={state === "sending"}
          onClick={async () => {
            setState("sending")
            setError(null)
            const res = await fetch(`/api/physical/order-status/${encodeURIComponent(token)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => null)
            const data = res ? await res.json().catch(() => ({})) : {}
            if (!res || !res.ok) {
              setError(typeof data.error === "string" ? data.error : "Couldn't send the request. Try again.")
              setState("idle")
              return
            }
            setState("sent")
          }}
          className="h-12 rounded-[12px] bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white disabled:opacity-50 sm:h-11"
        >
          {state === "sending" ? "Sending" : "Ask to cancel"}
        </button>
      </div>
    </section>
  )
}
