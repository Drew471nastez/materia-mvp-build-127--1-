"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { includedTaxLabel } from "@/lib/tax/rules"
import { OrderHelp } from "@/components/support/order-help"
import { AlertTriangle, Check, Copy, Download, ExternalLink, MapPin, Minus, Package, Plus, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { addressLines } from "@/lib/physical/address"
import { deliveryEstimate } from "@/lib/physical/rates"
import { orderNumber, shipmentLabel } from "@/lib/physical/status"
import type { ShipmentStatus } from "@/lib/physical/types"
import type { BuyerCancelState } from "@/lib/physical/buyer-cancel"
import { TRACKING_LABEL, isTrackingStatus } from "@/lib/physical/tracking/labels"
import { TrackingTimeline, estimatedDay } from "@/components/physical/tracking-timeline"
import { CarrierLogo } from "@/components/physical/carrier-logo"
import { AppAvatar } from "@/components/app/app-avatar"
import { formatMinor } from "@/lib/markets/money"
import { sellerMailto } from "@/lib/physical/seller-mailto"
import { estimateText, useCheckoutLang, useCt } from "@/app/checkout/parts/words"
import { checkoutMsg, type CheckoutT } from "@/lib/markets/checkout-words"
import { LiveStatus } from "./live-status"
import { splitSavings } from "@/lib/receipts/discount"
import { StoreLogo } from "@/components/brand/store-logo"

interface Props {
  token: string
  justPaid: boolean
  /** The store's return reasons (Settings › Returns and refunds), as the buyer reads them. */
  reasons?: { value: string; label: string }[]
  /**
   * The shop as its website draws it (lib/checkout/brand-server): `avatarKind` logo is drawn as it is (a wordmark is
   * wide), a photo round beside the name. `websiteUrl`: the live website the order came from (lib/physical/store-link.ts).
   */
  shop: { name: string; avatar: string | null; avatarKind?: "logo" | "photo" | null; email: string | null; phone?: string | null; websiteUrl?: string | null; legal?: { name: string; lines: string[]; taxId: string | null; taxIdLabel: string } | null }
  /** This page's own address, for the letter Email the shop opens. */
  orderUrl?: string | null
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
    /** The discount code used, when one was. */
    coupon?: string | null
    /** The store's offers inside `totals.discount`, each by the name the checkout showed it; the rest is the code's. */
    savings?: { label: string; cents: number }[]
    /** A receipt token of the order's, which opens its invoice PDF; null when it has none (cash, free). */
    invoiceToken?: string | null
    /** Each refund's credit note (lib/checkout/credit-note.ts): its number and its PDF's link. */
    creditNotes?: { number: string; href: string }[]
    /** Collected by the buyer instead of shipped. */
    pickup: { name: string; address: string[]; instructions: string | null; ready: string; hours?: string | null } | null
    processing: boolean
    /** `taxLabel`: "VAT 19%", as the checkout named it. `currency`: what it was charged in. */
    totals: { subtotal: number; discount: number; shipping: number; tax: number; taxIncluded: boolean; taxLabel?: string; total: number; refunded: number; currency?: string }
    /** Paid in cash when it arrives (lib/physical/cash-on-delivery.ts): "due" until the shop has the cash, "paid" after. */
    cash?: "due" | "paid" | null
    /** What a paid order was paid with (lib/physical/orders-server paidWith): the card's brand and last four, PayPal, Link. */
    paidWith?: { method: string; brand: string | null; last4: string | null } | null
    /** `shipped`, `returned`: how many of the line went out and came back; `refunded`: money went back on it. */
    lines: { orderId: string; title: string; variantName: string | null; properties?: [string, string][]; files?: { id: string; name: string; url: string }[]; imageUrl: string | null; quantity: number; unitCents?: number; cents: number; type: string; receiptToken: string | null; returnable: number; shipped?: number; returned?: number; refunded?: boolean }[]
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
    returnPolicy?: { days: number; endsAt: string | null; open: boolean; started?: boolean; assumed?: boolean } | null
  }
  canReturn: boolean
  /** Cancel order (lib/physical/buyer-cancel.ts): offered, asked and waiting, or answered with a no. */
  cancel?: BuyerCancelState
  /** Cancel order, when offered, cancels and refunds at once (cancelMode "now"); otherwise it asks the shop. */
  cancelNow?: boolean
}

/* The page's language as a locale for dates and amounts; English as before. */
const dateLocale = (lang: string) => (lang === "en" ? "en-US" : lang)
/* In the currency the order was charged in (commerce_checkouts.currency), written the page language's way, as its checkout wrote it (lib/markets/money formatMinor): never a bare dollar sign. */
const moneyIn = (c: number, currency?: string, lang = "en") => formatMinor(c, (currency || "USD").toUpperCase(), dateLocale(lang))
/* Dates in the page's language (the order's, ../parts/words.tsx); English as before. */
const day = (iso: string | null, lang: string) => (iso ? new Date(iso).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric", year: "numeric" }) : "")
/* A step's day: the year is in the line above it. */
const dayShort = (iso: string | null, lang: string) => (iso ? new Date(iso).toLocaleDateString(dateLocale(lang), { month: "short", day: "numeric" }) : "")
const dayTime = (iso: string, lang: string) => new Date(iso).toLocaleString(dateLocale(lang), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

/* A card with a little depth: the /app card, a softer shadow under it. */
const card = "rounded-2xl border border-[#e5e7eb]/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_20px_-14px_rgba(16,24,40,0.14)]"

/** A local delivery's steps, in the shop's own words: nobody else carries it. */
function localLabel(status: string, ct: CheckoutT): string {
  return status === "delivered" ? ct("Delivered") : status === "out_for_delivery" ? ct("On its way to you today") : status === "failed" ? ct("Delivery problem") : ct("Being prepared for delivery")
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

const returnText = (status: string, ct: CheckoutT): string | null =>
  ({
    requested: ct("Return requested. The shop will reply by email."),
    approved: ct("Return approved. Send the items back using the shop's instructions."),
    in_transit: ct("Your return is on its way to the shop."),
    received: ct("The shop received your return."),
    completed: ct("Return complete."),
    rejected: ct("The shop couldn't accept this return."),
    cancelled: ct("Return cancelled."),
  })[status] ?? null

export function PendingOrder({ reason }: { reason: string | null }) {
  const ct = useCt()
  React.useEffect(() => {
    if (reason === "failed" || reason === "not_found") return
    const t = window.setTimeout(() => window.location.reload(), 4000)
    return () => window.clearTimeout(t)
  }, [reason])
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#f8f9fa] px-6 text-center">
      <RefreshCw className={cn("h-7 w-7 text-[#9ca3af]", reason !== "failed" && "animate-spin")} />
      <h1 className="mt-4 text-[22px] font-semibold text-[#1a1a2e]">{reason === "failed" || reason === "not_found" ? ct("We couldn't confirm your order here") : ct("Confirming your payment")}</h1>
      <p className="mt-2 max-w-[420px] text-[15px] leading-[22px] text-[#6b7280]">
        {reason === "failed" || reason === "not_found" ? ct("If you paid, your order is safe: you'll get a confirmation email with a link to it in a few minutes.") : ct("This takes a few seconds. Your confirmation email is on its way.")}
      </p>
    </main>
  )
}

/** The shop across the top, drawn as its website's checkout draws it (app/checkout/parts/shop-bar.tsx), with the way back to its website. */
function ShopHeader({ shop }: { shop: Props["shop"] }) {
  const ct = useCt()
  const face =
    shop.avatarKind === "logo" && shop.avatar ? (
      <StoreLogo src={shop.avatar} alt={shop.name} height={32} className="max-w-[160px] sm:max-w-[200px]" data-shop-logo="" />
    ) : (
      <>
        <AppAvatar src={shop.avatar} name={shop.name} alt="" size={30} className="shadow-[0_0_0_1px_rgba(17,17,19,0.06),0_1px_2px_rgba(17,17,19,0.08)]" />
        <span className="truncate">{shop.name}</span>
      </>
    )
  const faceClass = "flex min-h-[44px] min-w-0 items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 text-[15px] font-semibold text-[#1a1a2e]"
  return (
    <header className="bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(17,17,19,0.055),0_4px_12px_-10px_rgba(17,17,19,0.09)]" data-shop-header="">
      <div className="mx-auto flex h-14 max-w-[1040px] items-center gap-2 px-4 sm:h-16 sm:px-6">
        {shop.websiteUrl ? (
          <a href={shop.websiteUrl} className={cn(faceClass, "outline-none transition-colors duration-150 hover:bg-black/[0.035] focus-visible:outline-2 focus-visible:outline-[#1a1a2e]/40")}>
            {face}
          </a>
        ) : (
          <span className={faceClass}>{face}</span>
        )}
        {shop.websiteUrl ? (
          <a href={shop.websiteUrl} data-visit-store="" className="ml-auto inline-flex h-9 shrink-0 items-center rounded-[9px] border border-[#e1e3e7] bg-white px-3.5 text-[13.5px] font-medium text-[#1a1a2e] shadow-[0_1px_1px_rgba(17,17,19,0.04)] transition-[scale,background-color] duration-150 hover:bg-[#fafafb] active:scale-[0.97]">
            {ct("Visit the store")}
          </a>
        ) : null}
      </div>
    </header>
  )
}

export function OrderStatusView({ token, justPaid, shop, orderUrl, order, canReturn, reasons, help, cancel, cancelNow }: Props) {
  /* The page in the language the order was placed in (../parts/words.tsx). */
  const ct = useCt()
  const lang = useCheckoutLang()
  /* Cancel order and Return items open from the help panel (components/support/order-help.tsx), where every way to reach the shop is. */
  const [cancelOpen, setCancelOpen] = React.useState(false)
  const [returnOpen, setReturnOpen] = React.useState(false)
  const openFlow = (which: "cancel" | "return") => {
    if (which === "cancel") setCancelOpen(true)
    else setReturnOpen(true)
    window.setTimeout(() => document.getElementById(`order-${which}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
  }
  const local = order.delivery?.kind === "local"
  const money = (c: number) => moneyIn(c, order.totals.currency, lang)
  /* The discount as the checkout listed it: each offer, then the code's part. */
  const saved = splitSavings(order.totals.discount, order.savings)
  const shipped = order.shipments.some((s) => s.shippedAt)
  /* Every parcel so far arrived and nothing is left to send: one delivered parcel of a partly shipped order is not the order (lib/physical/status fulfillmentStatusOf, as the shop reads it). */
  const delivered = order.shipments.length > 0 && order.shipments.every((s) => s.status === "delivered") && order.fulfillmentStatus !== "partially_fulfilled"
  const needsShipping = order.lines.some((l) => l.type === "physical")
  const pickup = order.pickup
  /* The carrier's estimate for the parcel still on its way that arrives last. */
  const arrives = estimatedDay(order.shipments.filter((s) => s.status !== "delivered").map((s) => s.tracking?.estimatedDelivery).filter((t): t is string => !!t).sort().pop() ?? null, dateLocale(lang))
  const steps = order.cancelled
    ? []
    : needsShipping
      ? [
          { label: ct("Confirmed"), done: true, when: dayShort(order.createdAt, lang) },
          { label: ct("Being prepared"), done: order.processing || shipped, when: "" },
          { label: pickup ? ct("Ready for pickup") : ct("Shipped"), done: shipped, when: dayShort(order.shipments.find((s) => s.shippedAt)?.shippedAt ?? null, lang) },
          { label: pickup ? ct("Picked up") : ct("Delivered"), done: delivered, when: delivered ? dayShort(order.shipments.find((s) => s.deliveredAt)?.deliveredAt ?? null, lang) : arrives ? ct("Est. {day}", { day: arrives }) : "" },
        ]
      : [{ label: ct("Confirmed"), done: true, when: day(order.createdAt, lang) }]
  const first = order.name?.split(/\s+/)[0]
  const number = orderNumber(order.id)
  const estimate = order.delivery ? deliveryEstimate(order.delivery) : ""
  /* Which line a parcel holds, by its order row. */
  const lineOf = (id: string) => order.lines.find((l) => l.orderId === id) ?? null
  /* Several parcels, or one holding part of the order: each says what is in it. */
  const partly = order.shipments.length > 1 || order.lines.some((l) => l.type === "physical" && (l.shipped ?? 0) > 0 && (l.shipped ?? 0) < l.quantity)
  const policy = order.returnPolicy
  /* The seller's own window (Settings › Returns), in days from delivery: a date once the parcel arrived, the rule until then. */
  const returnHint = policy ? (policy.started && policy.endsAt ? ct("Until {day}", { day: day(policy.endsAt, lang) }) : ct("Within {count, plural, one {# day} other {# days}} of delivery", { count: policy.days })) : null
  const left = Math.max(0, order.totals.total - order.totals.refunded)

  /* Email the shop: a letter ready to finish, in the page's language, naming the order and linking back to it (lib/physical/seller-mailto.ts). */
  const mailHref = sellerMailto(shop.email, {
    subject: ct("Question about order {number}", { number }),
    lines: [ct("Hi {shop},", { shop: shop.name }), "", ct("I'm writing about my order {number}, placed on {day}.", { number, day: day(order.createdAt, lang) }), "", "", "", ...(orderUrl ? [ct("Order page: {url}", { url: orderUrl })] : []), ...(order.name ? ["", ct("Thanks,"), order.name] : [])],
  })

  return (
    <main className="min-h-dvh bg-[#f8f9fa]">
      {/* The page follows the order by itself (./live-status.tsx), slower once nothing is left to happen. */}
      <LiveStatus token={token} settled={order.cancelled || (delivered && !order.returns.some((r) => ["requested", "approved", "in_transit", "received"].includes(r.status)))} />
      <ShopHeader shop={shop} />
      <div className="mx-auto grid max-w-[1040px] gap-4 px-4 pb-12 pt-5 sm:px-6 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:gap-y-4">
        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1">
          <section className={cn(card, "p-5 sm:p-7")} data-order-status="">
            <p className="text-[13px] font-medium text-[#6b7280]">
              {ct("Order {number}", { number: orderNumber(order.id) })}
              {order.createdAt ? <> · {day(order.createdAt, lang)}</> : null}
            </p>
            <h1 className="mt-1.5 text-[24px] font-bold leading-[1.2] tracking-[-0.01em] text-[#1a1a2e] [overflow-wrap:anywhere] sm:text-[28px]">
              {order.cancelled
                ? ct("Your order was cancelled")
                : justPaid
                  ? first ? ct("Thank you, {name}!", { name: first }) : ct("Thank you!")
                  : !delivered && order.shipments.some((s) => s.status === "failed")
                    ? ct("There's a problem with your delivery")
                  : delivered
                    ? pickup
                      ? ct("Your order was picked up")
                      : ct("Your order was delivered")
                    : shipped
                      ? pickup
                        ? ct("Your order is ready to pick up")
                        : ct("Your order is on the way")
                      : ct("Your order is confirmed")}
            </h1>
            {order.email && justPaid ? <p className="mt-1.5 text-[14.5px] leading-[22px] text-[#6b7280]">{ct("A confirmation is on its way to {email}.", { email: order.email })}</p> : null}
            {order.cancelled ? (
              <p className="mt-2 text-[14.5px] leading-[22px] text-[#4b5563]" data-order-cancelled="">
                {order.totals.refunded > 0 ? ct("A refund of {amount} is on its way to your original payment method. Banks usually take 5 to 10 business days to show it.", { amount: money(order.totals.refunded) }) : order.cash || order.totals.total === 0 ? ct("Nothing was charged.") : null}
              </p>
            ) : null}

            {steps.length > 1 ? (
              <ol className="mt-6 grid grid-cols-4" data-order-steps="">
                {steps.map((s, i) => (
                  <li key={s.label} className="min-w-0 pr-1.5">
                    <div className="flex items-center">
                      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-300", s.done ? "bg-[#1a1a2e] text-white" : "border-2 border-[#d1d5db] bg-white")}>{s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : null}</span>
                      {i < steps.length - 1 ? <span aria-hidden className={cn("ml-1.5 h-[2px] flex-1 rounded-full transition-colors duration-300", steps[i + 1].done ? "bg-[#1a1a2e]" : "bg-[#e5e7eb]")} /> : null}
                    </div>
                    <p className={cn("mt-2 text-[12.5px] font-medium leading-4 [overflow-wrap:anywhere] sm:text-[13.5px]", s.done ? "text-[#1a1a2e]" : "text-[#6b7280]")}>{s.label}</p>
                    {s.when ? <p className="mt-0.5 text-[12px] leading-4 text-[#6b7280] sm:text-[12.5px]">{s.when}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
            {!order.cancelled && pickup && !shipped ? <p className="mt-5 border-t border-[#eef0f2] pt-4 text-[14px] leading-5 text-[#4b5563]">{ct(pickup.ready)}. {ct("We'll email you when it's ready.")}</p> : null}
            {!order.cancelled && !pickup && local && !shipped ? <p className="mt-5 border-t border-[#eef0f2] pt-4 text-[14px] leading-5 text-[#4b5563]">{ct("{shop} delivers this order to you.", { shop: shop.name })}{order.delivery?.note ? ` ${order.delivery.note}` : ""}</p> : null}
            {/* The method on its line, the estimate on the next: never run together into one word. */}
            {!order.cancelled && !pickup && !local && order.delivery && !shipped ? (
              <div className="mt-5 border-t border-[#eef0f2] pt-4 text-[14px] leading-5" data-delivery-estimate="">
                <p className="font-medium text-[#1a1a2e]">{ct(order.delivery.name)}</p>
                {estimate ? <p className="mt-0.5 text-[#6b7280]">{ct("Usually arrives {estimate} after it ships.", { estimate: estimateText(ct, estimate) })}</p> : null}
              </div>
            ) : null}
          </section>

          {pickup && !order.cancelled ? (
            <section className={cn(card, "p-5 sm:p-6")} data-pickup-point="">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#f3f4f6]">
                  <MapPin className="h-5 w-5 text-[#1a1a2e]" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#1a1a2e]">{ct("Pick up at {place}", { place: pickup.name })}</p>
                  <p className="mt-0.5 text-[14px] leading-[21px] text-[#4b5563]">{pickup.address.join(", ")}</p>
                  {pickup.hours ? <p className="mt-1 text-[13.5px] text-[#4b5563]" data-pickup-hours=""><span className="font-medium text-[#1a1a2e]">{ct("Open")}</span> {pickup.hours}</p> : null}
                  {pickup.instructions ? <p className="mt-2 whitespace-pre-line rounded-lg bg-[#f8f9fa] px-3 py-2 text-[13.5px] leading-5 text-[#4b5563]">{pickup.instructions}</p> : null}
                  <p className="mt-2 text-[13px] text-[#6b7280]">{ct("Bring your order number, {number}.", { number: orderNumber(order.id) })}</p>
                </div>
              </div>
            </section>
          ) : null}

          {pickup ? null : order.shipments.map((s, i) => {
            const problem = s.status === "failed"
            const updates = buyerUpdates(s)
            /* What the carrier said last, when it says more than the status: ready to collect, a delivery attempt, returned to sender. */
            const carrierSaid = s.tracking?.status && isTrackingStatus(s.tracking.status) && s.status !== "delivered" && ["available_for_pickup", "attempt_failed", "returned"].includes(s.tracking.status) ? ct(TRACKING_LABEL[s.tracking.status].label) : null
            const eta = s.status !== "delivered" ? estimatedDay(s.tracking?.estimatedDelivery, dateLocale(lang)) : null
            const checkpoints = local ? [] : (s.checkpoints ?? [])
            const inside = partly ? s.items.flatMap((it) => (lineOf(it.orderId) ? [{ it, line: lineOf(it.orderId)! }] : [])) : []
            return (
              <section key={s.id} className={cn(card, "p-5 sm:p-6")} data-shipment-status={s.status}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {problem ? (
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[#fee4e2]">
                        <AlertTriangle className="h-5 w-5 text-[#b42318]" />
                      </span>
                    ) : (
                      <CarrierLogo carrier={local ? null : s.carrier} size={40} />
                    )}
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-[#1a1a2e]">
                        {local ? localLabel(s.status, ct) : (carrierSaid ?? (shipmentLabel(s.status as ShipmentStatus, false)?.label ? ct(shipmentLabel(s.status as ShipmentStatus, false).label) : ct("Shipped")))}
                        {order.shipments.length > 1 ? <span className="font-normal text-[#6b7280]"> · {ct("Package {n} of {count}", { n: i + 1, count: order.shipments.length })}</span> : null}
                      </p>
                      <div className="flex min-w-0 items-center gap-0.5 text-[13.5px] text-[#6b7280]">
                        {local ? ct("Delivered by the shop") : s.carrier || s.trackingNumber ? (
                          <>
                            <span className="truncate">{[s.carrier, s.trackingNumber].filter(Boolean).join(" · ")}</span>
                            {s.trackingNumber ? <CopyNumber value={s.trackingNumber} /> : null}
                          </>
                        ) : ct("Tracking not added yet")}
                      </div>
                    </div>
                  </div>
                  {s.trackingUrl && !local ? (
                    <a href={s.trackingUrl} target="_blank" rel="noreferrer" className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#1a1a2e] px-4 text-[14px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] transition-[scale,background-color] duration-150 hover:bg-[#262640] active:scale-[0.98] sm:h-10 sm:w-auto">
                      {ct("Track package")}
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
                {eta && !problem ? (
                  <p className="mt-3 text-[14px] text-[#1a1a2e]" data-estimated-delivery="">
                    <span className="text-[#6b7280]">{ct("Estimated delivery")}</span> <span className="font-medium">{eta}</span>
                  </p>
                ) : null}
                {problem ? (
                  <p className="mt-3 rounded-[10px] bg-[#fef3f2] px-3 py-2 text-[13.5px] leading-5 text-[#b42318]">
                    {s.tracking?.status === "returned" ? ct("The carrier is sending this package back to the shop.") : s.tracking?.status === "attempt_failed" ? ct("The carrier tried to deliver this package and couldn't.") : ct("The carrier reported a problem delivering this package.")} {ct("{shop} will be in touch, or reply to your order email.", { shop: shop.name })}
                  </p>
                ) : null}
                {inside.length ? (
                  <ul className="mt-4 space-y-2 border-t border-[#eef0f2] pt-3" data-shipment-items="">
                    {inside.map(({ it, line }) => (
                      <li key={it.orderId} className="flex items-center gap-2.5 text-[13.5px] text-[#4b5563]">
                        <Thumb src={line.imageUrl} size={32} />
                        <span className="min-w-0 truncate">
                          <span className="tabular-nums text-[#1a1a2e]">{it.quantity} ×</span> {line.title}
                          {line.variantName ? <span className="text-[#6b7280]"> · {line.variantName}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {checkpoints.length > 0 ? (
                  <TrackingTimeline checkpoints={checkpoints} ct={ct} locale={dateLocale(lang)} className="mt-4 border-t border-[#eef0f2] pt-3" />
                ) : updates.length > 1 ? (
                  <ol className="mt-4 space-y-2 border-t border-[#eef0f2] pt-3" data-shipment-updates="">
                    {updates.map((u, j) => (
                      <li key={`${u.status}:${u.at}`} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className={cn(j === 0 ? "font-medium text-[#1a1a2e]" : "text-[#6b7280]")}>{local ? localLabel(u.status, ct) : shipmentLabel(u.status as ShipmentStatus, false)?.label ? ct(shipmentLabel(u.status as ShipmentStatus, false).label) : u.status}</span>
                        <span className="shrink-0 tabular-nums text-[12.5px] text-[#9ca3af]">{dayTime(u.at, lang)}</span>
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>
            )
          })}
        </div>

        {/* The order itself: what was bought and paid, then where it goes. Beside the status on a wide screen, under it on a phone. */}
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <section className={cn(card, "p-5 sm:p-6")} data-order-items="">
            <h2 className="mb-4 text-[16px] font-semibold text-[#1a1a2e]">{ct("Items")}</h2>
            <ul className="space-y-4">
              {order.lines.map((l) => {
                const unit = l.unitCents ?? Math.round(l.cents / Math.max(1, l.quantity))
                const full = unit * l.quantity
                const sent = l.shipped ?? 0
                const back = l.returned ?? 0
                const notes = [
                  l.type === "physical" && !order.cancelled && sent > 0 && sent < l.quantity ? ct("{sent} of {count} sent", { sent, count: l.quantity }) : null,
                  back > 0 ? ct("{count, plural, one {# returned} other {# returned}}", { count: back }) : null,
                  l.refunded && !order.cancelled ? ct("Refunded") : null,
                ].filter((x): x is string => !!x)
                return (
                  <li key={l.orderId} className="flex items-start gap-3" data-order-line="">
                    <Thumb src={l.imageUrl} size={56} />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[14px] font-medium leading-5 text-[#1a1a2e]">{l.title}</p>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-[#6b7280]">{[l.variantName, ...(l.properties ?? []).map(([k, v]) => `${k}: ${v}`), ct("Qty {quantity}", { quantity: l.quantity })].filter(Boolean).join(" · ")}</p>
                      {l.files?.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5" data-line-files="">
                          {l.files.map((f) => (
                            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" title={f.name}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={f.url} alt={f.name} width={44} height={44} className="h-11 w-11 rounded-md border border-[#e5e7eb] object-cover" referrerPolicy="no-referrer" />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {notes.length ? <p className="mt-0.5 text-[12.5px] leading-[18px] text-[#92400e]" data-line-progress="">{notes.join(" · ")}</p> : null}
                      {l.receiptToken ? (
                        <a href={`/receipt/${encodeURIComponent(l.receiptToken)}`} className="mt-1 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e] underline underline-offset-4">
                          <Download className="h-3.5 w-3.5" />
                          {ct("Download")}
                        </a>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      {full > l.cents ? <p className="text-[12.5px] tabular-nums text-[#9ca3af] line-through">{money(full)}</p> : null}
                      <p className="text-[14px] tabular-nums text-[#1a1a2e]">{l.cents === 0 ? ct("Free") : money(l.cents)}</p>
                      {l.quantity > 1 && full === l.cents ? <p className="text-[12.5px] tabular-nums text-[#6b7280]" data-unit-price="">{l.quantity} × {money(unit)}</p> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
            <dl className="mt-5 space-y-2 border-t border-[#eef0f2] pt-4 text-[14px]">
              <Row label={ct("Subtotal")} value={money(order.totals.subtotal)} />
              {/* Each offer by its own name, then the code's part named by the code: the checkout's rows (lib/checkout/summary-rows), never the offers counted as the code's. */}
              {saved.rows.map((s) => (
                <Row key={s.label} label={s.label} value={`-${money(s.cents)}`} />
              ))}
              {saved.rest > 0 ? <Row label={order.coupon ? ct("Discount ({code})", { code: order.coupon }) : ct("Discount")} value={`-${money(saved.rest)}`} /> : null}
              {needsShipping ? <Row label={pickup ? ct("Pickup") : ct("Shipping")} value={order.totals.shipping ? money(order.totals.shipping) : ct("Free")} /> : null}
              {order.totals.tax ? <Row label={order.totals.taxIncluded ? (order.totals.taxLabel && !/^tax$/i.test(order.totals.taxLabel.trim()) ? ct("Including {tax}", { tax: includedTaxLabel(order.totals.taxLabel).replace(/^Including /, "") }) : ct("Including tax")) : order.totals.taxLabel ? ct(order.totals.taxLabel) : ct("Tax")} value={money(order.totals.tax)} /> : null}
              <Row label={ct("Total")} value={`${money(order.totals.total)}${order.totals.currency && order.totals.currency.toUpperCase() === "USD" ? " USD" : ""}`} strong />
              {order.totals.refunded ? <Row label={ct("Refunded")} value={`-${money(order.totals.refunded)}`} /> : null}
            </dl>
            {paidWithText(order.paidWith, ct) ? (
              <p data-order-paid-with="" className="mt-3 text-[13.5px] text-[#6b7280]">
                {ct("Paid with {method}", { method: paidWithText(order.paidWith, ct) as string })}
              </p>
            ) : null}
            {order.invoiceToken ? (
              <a
                data-order-invoice=""
                href={`/api/checkout/invoice?token=${encodeURIComponent(order.invoiceToken)}`}
                download
                className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 hover:decoration-[#1a1a2e] print:hidden"
              >
                <Download className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
                {ct("Download invoice (PDF)")}
              </a>
            ) : null}
            {order.creditNotes?.length ? (
              <div className="mt-1 flex flex-wrap gap-x-4 print:hidden" data-order-credit-notes="">
                {order.creditNotes.map((n) => (
                  <a key={n.number} href={n.href} download className="inline-flex min-h-9 items-center gap-1.5 text-[13.5px] font-medium text-[#1a1a2e] underline decoration-[#1a1a2e]/25 underline-offset-2 hover:decoration-[#1a1a2e]">
                    <Download className="h-3.5 w-3.5 text-[#6b7280]" aria-hidden />
                    {ct("Credit note {number}", { number: n.number })}
                  </a>
                ))}
              </div>
            ) : null}
            {order.cash && !order.cancelled ? (
              <p data-cash-payment="" className="mt-3 rounded-[10px] bg-[#f8f9fa] px-3.5 py-2.5 text-[14px] leading-5 text-[#4b5563]">
                {order.cash === "paid" ? ct("Paid in cash.") : pickup ? ct("Pay {amount} in cash when you pick it up.", { amount: money(left) }) : ct("Pay {amount} in cash when it's delivered.", { amount: money(left) })}
              </p>
            ) : null}
          </section>

          {order.address ? (
            <section className={cn(card, "space-y-4 p-5 sm:p-6")} data-order-delivery="">
              <div>
                <h2 className="mb-1.5 text-[14px] font-semibold text-[#1a1a2e]">{ct("Shipping address")}</h2>
                <p className="text-[14px] leading-[21px] text-[#4b5563] [overflow-wrap:anywhere]">
                  {addressLines(order.address as any).map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </p>
              </div>
              <div>
                <h2 className="mb-1.5 text-[14px] font-semibold text-[#1a1a2e]">{local ? ct("Delivery") : ct("Shipping method")}</h2>
                <p className="text-[14px] text-[#4b5563]">{order.delivery?.name ? ct(order.delivery.name) : ct("Standard")}</p>
                {!local && estimate ? <p className="mt-0.5 text-[13px] leading-5 text-[#6b7280]">{estimateText(ct, estimate)}</p> : null}
                {local && order.delivery?.note ? <p className="mt-1 text-[13px] leading-5 text-[#6b7280]">{order.delivery.note}</p> : null}
              </div>
            </section>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-start-2">
          {order.returns.length ? (
            <section className={cn(card, "p-5 sm:p-6")}>
              <h2 className="mb-2 text-[16px] font-semibold text-[#1a1a2e]">{ct("Returns")}</h2>
              <ul className="space-y-2">
                {order.returns.map((r) => (
                  <li key={r.id} className="text-[14px] leading-5 text-[#4b5563]" data-return-status={r.status}>
                    <span className="text-[#6b7280]">{day(r.createdAt, lang)}:</span> {returnText(r.status, ct) ?? r.status}
                    {/* The reason as the store named it, in the page's language when it is one of the usual ones. */}
                    {r.reason ? <span className="block text-[13px] text-[#6b7280]">{ct("Reason: {reason}", { reason: r.reason === "Other" ? ct("Other reason") : ct(r.reason) })}</span> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {cancel === "can_request" && cancelOpen ? <CancelRequest token={token} shopName={shop.name} now={!!cancelNow} refund={order.cash === "due" ? null : left} money={money} onClose={() => setCancelOpen(false)} /> : null}
          {cancel === "requested" ? (
            <p className={cn(card, "px-4 py-3 text-[14px] leading-5 text-[#4b5563]")} data-cancel-state="requested">
              {ct("You asked to cancel this order. {shop} will cancel and refund it, or email you if it has already gone out.", { shop: shop.name })}
            </p>
          ) : null}
          {cancel === "declined" ? (
            <p className="text-center text-[13px] leading-5 text-[#6b7280]" data-cancel-state="declined">
              {ct("{shop} is going ahead with this order. Reply to your order email with any questions.", { shop: shop.name })}
            </p>
          ) : null}

          {canReturn && returnOpen ? <ReturnRequest token={token} lines={order.lines.filter((l) => l.returnable > 0)} reasons={reasons && reasons.length ? reasons : REASONS.map(([value, label]) => ({ value, label }))} until={returnHint} onClose={() => setReturnOpen(false)} /> : null}
          {/* Not delivered yet: the seller's rule, counted from delivery (Settings › Returns), rather than a date guessed from shipping. */}
          {canReturn && policy && !policy.started ? (
            <p className="text-center text-[13px] leading-5 text-[#6b7280]" data-return-assumed="">{ct("Your package hasn't been marked delivered yet. You can return items within {count, plural, one {# day} other {# days}} of delivery.", { count: policy.days })}</p>
          ) : null}
          {!canReturn && policy && !policy.open && policy.endsAt ? (
            <p className="text-center text-[13px] text-[#6b7280]" data-return-closed="">{ct("The return window for this order closed on {day}.", { day: day(policy.endsAt, lang) })}</p>
          ) : null}

          {help ? (
            <OrderHelp kind="physical"
              token={token}
              storeName={shop.name}
              openCase={help.openCase}
              contact={{ email: shop.email, phone: shop.phone ?? null, emailHref: mailHref }}
              cancel={cancel === "can_request" ? { kind: "cancel", label: ct("Cancel order"), hint: ct("Until {shop} starts on it", { shop: shop.name }), onOpen: () => openFlow("cancel") } : null}
              returns={canReturn ? { kind: "return", label: ct("Return items"), hint: returnHint, onOpen: () => openFlow("return") } : null}
            />
          ) : (
            <>
              {cancel === "can_request" && !cancelOpen ? (
                <div className="text-center">
                  <button type="button" onClick={() => openFlow("cancel")} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" data-cancel-button="">
                    {ct("Cancel order")}
                  </button>
                  <p className="mt-1 text-[12.5px] text-[#6b7280]">{ct("Until {shop} starts on it", { shop: shop.name })}</p>
                </div>
              ) : null}
              {canReturn && !returnOpen ? (
                <div className="text-center">
                  <button type="button" onClick={() => openFlow("return")} className="text-[14px] font-medium text-[#1a1a2e] underline underline-offset-4" data-return-button="">
                    {ct("Return items")}
                  </button>
                  {returnHint ? <p className="mt-1 text-[12.5px] text-[#6b7280]">{returnHint}</p> : null}
                </div>
              ) : null}
            </>
          )}

          {/* How to reach the store, every way it gave: Settings › Store details (lib/store/identity-server.ts). */}
          <p className="pt-2 text-center text-[13px] leading-[20px] text-[#6b7280]" data-order-contact="">
            {ct("Questions?")} {mailHref ? <a href={mailHref} data-email-shop="" className="font-medium text-[#1a1a2e] underline underline-offset-4">{ct("Email {shop}", { shop: shop.name })}</a> : ct("Reply to your order email.")}
            {shop.phone ? <> · <a href={`tel:${shop.phone.replace(/[^\d+]/g, "")}`} className="font-medium text-[#1a1a2e] underline underline-offset-4">{shop.phone}</a></> : null}
            {shop.websiteUrl ? <> · <a href={shop.websiteUrl} className="font-medium text-[#1a1a2e] underline underline-offset-4">{ct("Visit the store")}</a></> : null}
          </p>
          {/* The business that sold it, as a receipt must name it (Settings › Store details › Business details). */}
          {shop.legal ? (
            <p className="text-center text-[12.5px] leading-[18px] text-[#9ca3af]" data-order-seller="">
              {ct("Sold by {name}", { name: shop.legal.name })}
              {shop.legal.lines.length ? `, ${shop.legal.lines.join(", ")}` : ""}
              {shop.legal.taxId ? `. ${shop.legal.taxIdLabel} ${shop.legal.taxId}` : ""}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  )
}

function Thumb({ src, size }: { src: string | null; size: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className="shrink-0 rounded-[10px] border border-black/[0.06] bg-white object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-[10px] bg-[#f3f4f6]" style={{ width: size, height: size }}>
      <Package className="h-5 w-5 text-[#9ca3af]" aria-hidden />
    </span>
  )
}

/** A tracking number copied with one press, for the carrier's own app. */
function CopyNumber({ value }: { value: string }) {
  const ct = useCt()
  const [done, setDone] = React.useState(false)
  return (
    <button
      type="button"
      aria-label={ct("Copy")}
      title={ct("Copy")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        } catch {
          /* nothing to copy with: the number is on the page */
        }
      }}
      className="-my-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#9ca3af] transition-colors duration-150 hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
    >
      {done ? <Check className="h-3.5 w-3.5 text-[#15803d]" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
    </button>
  )
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4", strong && "border-t border-[#eef0f2] pt-2.5 text-[15px] font-semibold")}>
      <dt className={strong ? "text-[#1a1a2e]" : "text-[#6b7280]"}>{label}</dt>
      <dd className="tabular-nums text-[#1a1a2e]">{value}</dd>
    </div>
  )
}

const REASONS = [
  ["size", checkoutMsg("Size or fit")],
  ["damaged", checkoutMsg("Arrived damaged")],
  ["defective", checkoutMsg("Doesn't work")],
  ["not_as_described", checkoutMsg("Not as described")],
  ["wrong_item", checkoutMsg("Wrong item")],
  ["changed_mind", checkoutMsg("Changed my mind")],
  /* Not the bare "Other", which is the tip choice "another amount" in Romanian. */
  ["other", checkoutMsg("Other reason")],
] as const

/** How many of one line go back: minus, the number, plus. Big enough to press on a phone; the number never changes width. */
function Stepper({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (n: number) => void }) {
  const ct = useCt()
  const btn = "grid h-10 w-10 place-items-center rounded-[9px] text-[#1a1a2e] transition-[background-color,scale,opacity] duration-150 hover:bg-[#f3f4f6] active:scale-[0.9] disabled:pointer-events-none disabled:opacity-30 sm:h-9 sm:w-9"
  return (
    <div role="group" aria-label={label} className={cn("flex shrink-0 items-center rounded-[12px] border bg-white p-0.5 transition-colors duration-150", value > 0 ? "border-[#1a1a2e]" : "border-[#d9dce1]")} data-return-stepper="">
      <button type="button" className={btn} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label={ct("Fewer")}>
        <Minus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
      <output aria-live="polite" className="w-6 text-center text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{value}</output>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={ct("More")}>
        <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>
    </div>
  )
}

function ReturnRequest({ token, lines, reasons, until, onClose }: { token: string; lines: Props["order"]["lines"]; reasons: { value: string; label: string }[]; until: string | null; onClose: () => void }) {
  const ct = useCt()
  const router = useRouter()
  /* One line alone, one of it: that is what goes back, already chosen. */
  const [qty, setQty] = React.useState<Record<string, number>>(() => (lines.length === 1 && lines[0].returnable === 1 ? { [lines[0].orderId]: 1 } : {}))
  const [reason, setReason] = React.useState<string>(reasons[0]?.value ?? "other")
  const [note, setNote] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const count = Object.values(qty).reduce((n, q) => n + q, 0)
  if (state === "sent") return <p id="order-return" className="scroll-mt-6 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]" data-return-sent="">{ct("Return requested. The shop will email you with what happens next.")}</p>
  return (
    <section id="order-return" className={cn(card, "scroll-mt-6 space-y-4 p-5 sm:p-6")} data-return-form="">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{ct("Return items")}</h2>
        {until ? <p className="text-[12.5px] text-[#6b7280]">{until}</p> : null}
      </div>
      <div>
        <p className="mb-2 text-[13.5px] font-medium text-[#1a1a2e]">{ct("What are you sending back?")}</p>
        <ul className="divide-y divide-[#eef0f2] overflow-hidden rounded-[12px] border border-[#e5e7eb]">
          {lines.map((l) => {
            const n = qty[l.orderId] ?? 0
            return (
              <li key={l.orderId} className={cn("flex items-center gap-3 px-3 py-2.5 transition-colors duration-150", n > 0 ? "bg-[#f8f9fa]" : "bg-white")} data-return-line="">
                <Thumb src={l.imageUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-[14px] font-medium leading-5 text-[#1a1a2e]">{l.title}</p>
                  <p className="text-[12.5px] leading-[18px] text-[#6b7280]">{[l.variantName, ct("{count, plural, one {# can be returned} other {# can be returned}}", { count: l.returnable })].filter(Boolean).join(" · ")}</p>
                </div>
                <Stepper value={n} max={l.returnable} label={l.variantName ? `${l.title}, ${l.variantName}` : l.title} onChange={(v) => setQty((q) => ({ ...q, [l.orderId]: Math.max(0, Math.min(l.returnable, v)) }))} />
              </li>
            )
          })}
        </ul>
      </div>
      <div>
        <p id="return-reason" className="mb-2 block text-[13.5px] font-medium text-[#1a1a2e]">
          {ct("Why are you returning this?")}
        </p>
        <div role="radiogroup" aria-labelledby="return-reason" data-return-reasons="" className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={reason === r.value} onClick={() => setReason(r.value)} className={cn("min-h-9 rounded-full border px-3.5 py-1.5 text-[13.5px] font-medium transition-colors duration-150", reason === r.value ? "border-[#1a1a2e] bg-[#1a1a2e] text-white" : "border-[#d9dce1] bg-white text-[#4b5563] hover:bg-[#f8f9fa]")}>
              {r.label === "Other" ? ct("Other reason") : ct(r.label)}
            </button>
          ))}
        </div>
      </div>
      <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={3} placeholder={ct("Anything the shop should know")} className="w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[16px] leading-[22px] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] sm:text-[15px]" />
      {error ? <p role="alert" className="text-[13.5px] text-[#b42318]">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="h-12 rounded-[10px] px-4 text-[14px] font-medium text-[#4b5563] hover:bg-[#f3f4f6] sm:h-10">
          {ct("Not now")}
        </button>
        <button
          type="button"
          disabled={state === "sending" || count === 0}
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
              setError(res?.status === 429 ? ct("Too many requests. Try again later.") : typeof data.error === "string" ? ct(data.error) : ct("Couldn't send the request. Try again."))
              setState("idle")
              return
            }
            setState("sent")
            router.refresh()
          }}
          className="h-12 rounded-[10px] bg-[#1a1a2e] px-5 text-[15px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(0,0,0,0.12)] transition-[scale,opacity] duration-150 active:scale-[0.98] disabled:opacity-40 sm:h-10"
          data-return-submit=""
        >
          {state === "sending" ? ct("Sending") : count > 0 ? ct("Request return of {count, plural, one {# item} other {# items}}", { count }) : ct("Request return")}
        </button>
      </div>
    </section>
  )
}

/**
 * Cancel order, while nothing has shipped or been started (lib/physical/buyer-cancel.ts). `now`: cancelled and
 * refunded on the spot (lib/physical/buyer-cancel-server.ts), and the page draws itself again, cancelled. Otherwise it
 * asks the shop, which answers from the order; the buyer gets the Order cancelled email if it says yes.
 */
function CancelRequest({ token, shopName, now, refund, money, onClose }: { token: string; shopName: string; now: boolean; refund: number | null; money: (c: number) => string; onClose: () => void }) {
  const ct = useCt()
  const router = useRouter()
  const [reason, setReason] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = React.useState<string | null>(null)
  if (state === "sent") {
    return (
      <p id="order-cancel" className="scroll-mt-6 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[14px] text-[#166534]" data-cancel-state="sent">
        {ct("Request sent. {shop} will cancel and refund your order, or email you if it has already gone out.", { shop: shopName })}
      </p>
    )
  }
  return (
    <section id="order-cancel" className={cn(card, "scroll-mt-6 space-y-3 p-5 sm:p-6")} data-cancel-form="" data-cancel-mode={now ? "now" : "ask"}>
      <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{ct("Cancel this order?")}</h2>
      <p className="text-[14px] leading-[21px] text-[#4b5563]">
        {now
          ? refund && refund > 0
            ? ct("It's cancelled right away and {amount} goes back to your original payment method.", { amount: money(refund) })
            : ct("It's cancelled right away. You won't be charged.")
          : ct("This asks {shop} to cancel it before it ships. Once they do, you get an email and your money back.", { shop: shopName })}
      </p>
      <label htmlFor="cancel-reason" className="block text-[13.5px] font-medium text-[#1a1a2e]">
        {ct("Why are you cancelling? (optional)")}
      </label>
      <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, 300))} rows={2} className="w-full rounded-[10px] border border-[#d9dce1] px-3.5 py-2.5 text-[16px] leading-[22px] outline-none focus:border-[#1a1a2e] focus:ring-[3px] focus:ring-[rgba(26,26,46,0.08)] sm:text-[15px]" />
      {error ? <p role="alert" className="text-[13.5px] text-[#b42318]">{error}</p> : null}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={state === "sending"} className="h-12 rounded-[10px] border border-[#d9dce1] bg-white px-5 text-[15px] font-medium text-[#1a1a2e] hover:bg-[#f8f9fa] sm:h-10">
          {ct("Keep my order")}
        </button>
        <button
          type="button"
          disabled={state === "sending"}
          data-cancel-confirm=""
          onClick={async () => {
            setState("sending")
            setError(null)
            const res = await fetch(`/api/physical/order-status/${encodeURIComponent(token)}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) }).catch(() => null)
            const data = res ? await res.json().catch(() => ({})) : {}
            if (!res || !res.ok) {
              setError(!res || res.status >= 500 ? ct("Couldn't send the request. Try again.") : res.status === 429 ? ct("Too many requests. Try again later.") : typeof data.error === "string" ? ct(data.error) : ct("Couldn't send the request. Try again."))
              setState("idle")
              return
            }
            /* Cancelled now: the page draws the cancelled order and its refund. Asked: the shop answers. */
            if (data.done === "cancelled") {
              router.refresh()
              onClose()
              window.scrollTo({ top: 0, behavior: "smooth" })
              return
            }
            setState("sent")
            router.refresh()
          }}
          className={cn("h-12 rounded-[10px] px-5 text-[15px] font-semibold text-white transition-[scale,opacity,background-color] duration-150 active:scale-[0.98] disabled:opacity-50 sm:h-10", now ? "bg-[#b42318] hover:bg-[#9b1c13]" : "bg-[#1a1a2e] hover:bg-[#262640]")}
        >
          {state === "sending" ? (now ? ct("Cancelling") : ct("Sending")) : now ? ct("Cancel order") : ct("Ask to cancel")}
        </button>
      </div>
    </section>
  )
}

/** "Visa ending 4242", "PayPal", "Link", as the download receipt writes it (app/receipt/[token]/receipt-view.tsx); null when nothing was kept. */
export function paidWithText(p: { method: string; brand: string | null; last4: string | null } | null | undefined, ct: (s: string, v?: Record<string, string | number>) => string): string | null {
  if (!p) return null
  const named: Record<string, string> = { paypal: "PayPal", link: "Link", apple_pay: "Apple Pay", google_pay: "Google Pay", klarna: "Klarna" }
  if (named[p.method]) return named[p.method]
  if (p.method !== "card") return null
  const brand = p.brand ? (p.brand === "amex" ? "American Express" : p.brand.charAt(0).toUpperCase() + p.brand.slice(1)) : null
  if (brand && p.last4) return ct("{brand} ending {last4}", { brand, last4: p.last4 })
  return brand ?? ct("Card")
}
