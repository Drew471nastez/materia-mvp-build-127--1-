"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ONE ORDER, OPENED OVER THE LIST
 * ═══════════════════════════════════════════════════════════════════════════
 * What a creator comes here for, in the order they look for it: what was
 * bought and whether the buyer has it, what was paid and what they keep, who
 * bought it, and what happened since. Every action on it goes to a route that
 * checks the order is this creator's before it does anything
 * (lib/orders/owned.ts): the receipt and the email change
 * (app/api/app/orders/[id]), the invoice (app/api/invoice), the refund
 * (app/api/stripe/refund).
 *
 * An order with something to ship is laid out as Shopify's is: what is still
 * to send and each shipment with its tracking in the main column (the
 * digital lines of a mixed order keep their own card), the shipping address
 * and the delivery paid for at the side, and the parcel's history (shipped,
 * delivered, returns, the shop's notes) on the one timeline
 * (components/physical/order-panel.tsx, /api/physical/orders/[id]).
 */

import * as React from "react"
import { includedTaxLabel } from "@/lib/tax/rules"
import {
  ArrowLeft,
  AtSign,
  Banknote,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  ExternalLink,
  Ban,
  CircleDot,
  KeyRound,
  Landmark,
  Mail,
  MailX,
  MessageSquare,
  MoreHorizontal,
  Package,
  PackageCheck,
  Printer,
  RotateCcw,
  Send,
  ShoppingBag,
  Truck,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { CarrierLogo } from "@/components/physical/carrier-logo"
import { carrierOf } from "@/lib/physical/carriers"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { SOURCE_LABEL, canRefundLine, dayHeading, fullDate, itemsLabel, refundableCents, shipStageOf, timeOfDay, type Order, type OrderRow } from "@/lib/orders/order-view"
import { paidThroughAirwallex } from "@/lib/payments/past-provider"
import { originCampaign, sourceText } from "@/lib/orders/order-source"
import {
  groupTimeline,
  orderEvents,
  paymentMethodOf,
  physicalEvents,
  relativeTime,
  type OrderActivity,
  type PhysicalHistory,
  type StripeStep,
  type TimelineEvent,
  type TimelineGlyph,
  type TimelineTone,
} from "@/lib/orders/timeline"
import { copyText } from "@/lib/platform/copy-text"
import { prefetchSlip, shareSlip } from "@/components/physical/slip-share"
import {
  DeliveryBadge,
  FulfillmentBadge,
  PaymentBadge,
  ShipBadge,
  buttonPrimary,
  buttonSecondary,
  card,
  formatMoney,
  GUTTER,
  iconButton,
  ORDER_WIDTH,
  OrderBarFrame,
} from "./order-parts"
import { activityUrl, cachedJson, hasPayoutSteps, paidLineOf, readJson, stripeTimelineUrl } from "./order-prefetch"
import { BuyerNoteCard, NoteComposer, PhysicalFulfillment, ShippingCard, historyOf, printSlip, usePhysicalOrder } from "@/components/physical/order-panel"
import { COD_PAYMENT_METHOD } from "@/lib/physical/cash-on-delivery"
import { currencySymbol, minorPerUnit } from "@/lib/orders/money"
import { useReasons } from "@/lib/store/use-reasons"
import { OrderMessagesCard } from "@/components/support/order-messages-card"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { tt } from "@/lib/i18n/text"

export type OrderAction =
  | { kind: "refund"; line: OrderRow; amountCents: number; reason: string }
  | { kind: "resend" }
  | { kind: "invoice" }
  | { kind: "email"; email: string }

export interface OrderDetailProps {
  order: Order
  timeZone: string
  now: number
  onBack: () => void
  onStep: ((dir: -1 | 1) => void) | null
  /** Previous and next in the list's own order, whatever it is sorted by. */
  canStep: { previous: boolean; next: boolean }
  position: { index: number; count: number } | null
  onAction: (order: Order, action: OrderAction) => Promise<string>
  onNotice: (message: string) => void
  /** A physical order moved on (fulfilled, delivered, returned): the list's row follows. */
  onShipping?: (checkoutId: string, fulfillment: string, returnStatus: string, cashDue: boolean) => void
  /** False for a team member: refunds are the owner's (lib/team/roles). */
  canRefund?: boolean
}

/** A row the buyer has paid for and can download, so its access email can be sent. Never a product that ships: Resend receipt sent a mug's buyer a download email (lib/orders/owned canEmailAccess). */
function canEmail(line: OrderRow): boolean {
  return line.status === "completed" && Boolean(line.receipt_token) && line.product?.type !== "physical"
}

/** A phone: the width from which the shared sheets are not drawn (components/ui/bottom-sheet). */
const PHONE = "(max-width: 639px)"

function usePhone(): boolean {
  const [phone, setPhone] = React.useState(false)
  React.useEffect(() => {
    const mql = window.matchMedia(PHONE)
    const read = () => setPhone(mql.matches)
    read()
    mql.addEventListener("change", read)
    return () => mql.removeEventListener("change", read)
  }, [])
  return phone
}

/**
 * How long the More actions sheet takes to leave a phone's screen after a
 * row is tapped (components/ui/responsive-action-menu waits 140ms before it
 * runs the row, and the sheet's slide is 360ms). A dialog asked for from the
 * menu waits for the rest, so one sheet is on screen at a time: the menu's
 * going down, then the refund's coming up, never the two crossing.
 */
const MENU_SHEET_LEFT_MS = 200

export function OrderDetail({ order, timeZone, now, onBack, onStep, canStep, position, onAction, onNotice, onShipping, canRefund = true }: OrderDetailProps) {
  const [dialog, setDialogNow] = React.useState<"refund" | "email" | null>(null)
  const phone = usePhone()
  const later = React.useRef<number | undefined>(undefined)
  React.useEffect(() => () => window.clearTimeout(later.current), [])
  const setDialog = (next: "refund" | "email" | null) => {
    window.clearTimeout(later.current)
    setDialogNow(next)
  }
  /* From the More actions menu: on a phone, once its sheet is gone. */
  const fromMenu = (next: "refund" | "email") => {
    window.clearTimeout(later.current)
    if (!phone) return setDialogNow(next)
    later.current = window.setTimeout(() => setDialogNow(next), MENU_SHEET_LEFT_MS)
  }
  const [busy, setBusy] = React.useState<string | null>(null)
  /* Bumped after an action lands, so the timeline reads its history again. */
  const [revision, setRevision] = React.useState(0)
  const physicalCommerce = usePhysicalCommerceEnabled()
  /* A line that ships makes this a physical order, opened by that line's id. */
  const physicalOrder = physicalCommerce ? (order.lines.find((l) => l.product?.type === "physical")?.id ?? null) : null
  const physical = usePhysicalOrder(physicalOrder, revision)
  const parcel = physical.order
  /* In a mixed order the downloads keep their own card; the parcel's lines are the physical panel's. */
  const digitalLines = physicalOrder ? order.lines.filter((l) => l.product?.type !== "physical") : order.lines
  /* The bar's word for where the parcel is: the server's answer once it is here, the list's until then. */
  const stage = parcel ? shipStageOf(parcel.fulfillmentStatus, parcel.returnStatus) : physicalOrder ? (order.shipping?.stage ?? null) : null
  /* The list's row follows what the server now says: once after an action here, or once when the list was behind. */
  const row = order.lines.find((l) => l.checkout_id && l.physical_fulfillment)
  React.useEffect(() => {
    if (!parcel || !onShipping) return
    const cashDue = parcel.payment === "cod_due"
    if (row && row.physical_fulfillment === parcel.fulfillmentStatus && (row.physical_return ?? "none") === parcel.returnStatus && (row.physical_cash_due === true) === cashDue) return
    onShipping(parcel.id, parcel.fulfillmentStatus, parcel.returnStatus, cashDue)
  }, [parcel?.id, parcel?.fulfillmentStatus, parcel?.returnStatus, parcel?.payment, row?.physical_fulfillment, row?.physical_return, row?.physical_cash_due]) // eslint-disable-line react-hooks/exhaustive-deps

  /* A card payment, or cash on delivery once the seller has it (lib/physical/cash-on-delivery.ts): before that there is nothing to give back. */
  /* Every line with money left to send back, a part refunded one too, on Stripe or collected cash (lib/orders/order-view canRefundLine). */
  /* The order's packing slip, for one with something to send. Read ahead on a phone, so the print icon shares it in the tap (components/physical/slip-share). */
  const slipHref = parcel && parcel.lines.some((l) => l.requiresShipping) ? `/api/physical/orders/${encodeURIComponent(parcel.id)}/packing-slip` : null
  React.useEffect(() => {
    if (slipHref && phone) prefetchSlip(slipHref)
  }, [slipHref, phone])
  const refundable = order.lines.filter(canRefundLine)
  const emailable = order.lines.some(canEmail)
  const firstReceipt = order.lines.find((l) => l.receipt_token)?.receipt_token

  const run = async (label: string, action: OrderAction) => {
    if (busy) return false
    setBusy(label)
    try {
      onNotice(await onAction(order, action))
      setRevision((r) => r + 1)
      return true
    } catch (error) {
      onNotice((error as Error)?.message || tt("Something went wrong. Try again."))
      return false
    } finally {
      setBusy(null)
    }
  }

  /*
    A BUYER'S CANCEL REQUEST, SAID YES TO (components/physical/order-panel.tsx): once the order is cancelled there,
    every paid line is refunded in full through the same refund the Refund dialog makes (app/api/stripe/refund), so
    the money, the seller's balance and the buyer's Refund email go exactly as they do by hand. Owner only, as Refund is.
  */
  const refundAll = async (): Promise<string> => {
    let total = 0
    setBusy("refund")
    try {
      for (const line of refundable) {
        /* What is left on the line: a part refunded line gives back the rest, never its whole amount again. */
        const cents = refundableCents(line)
        if (cents <= 0) continue
        await onAction(order, { kind: "refund", line, amountCents: cents, reason: "cancelled" })
        total += cents
      }
      return total > 0 ? tt("Order cancelled and {amount} refunded", { amount: formatMoney(total, order.currency) }) : tt("Order cancelled")
    } catch (error) {
      return tt("Order cancelled. {value} Refund it with Refund.", { value: (error as Error)?.message || tt("The refund did not go through.") })
    } finally {
      setBusy(null)
      setRevision((r) => r + 1)
    }
  }

  const copy = async (text: string, what: string) => onNotice((await copyText(text)) ? tt("{what} copied", { what }) : tt("Could not copy the {value}", { value: what.toLowerCase() }))

  /* Arrow keys step through the list on a keyboard, as the chevrons do. */
  React.useEffect(() => {
    if (!onStep) return
    const onKey = (e: KeyboardEvent) => {
      if (dialog || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
      if (document.querySelector("[role=dialog], [role=menu]")) return
      if (e.key === "ArrowLeft" && canStep.previous) onStep(-1)
      else if (e.key === "ArrowRight" && canStep.next) onStep(1)
      else if (e.key === "Escape") onBack()
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onStep, onBack, canStep.previous, canStep.next, dialog])

  const items: ActionMenuItem[] = [
    ...(canRefund && refundable.length > 0
      ? [{ label: tt("Refund"), icon: <RotateCcw className="h-4 w-4" />, onClick: () => fromMenu("refund") }]
      : []),
    ...(emailable
      ? [{ label: tt("Resend receipt"), icon: <Send className="h-4 w-4" />, onClick: () => void run("resend", { kind: "resend" }) }]
      : []),
    { label: tt("Download invoice"), icon: <Download className="h-4 w-4" />, onClick: () => void run("invoice", { kind: "invoice" }) },
    { label: tt("Change customer email"), icon: <Mail className="h-4 w-4" />, onClick: () => fromMenu("email") },
    ...(firstReceipt
      ? [{ label: tt("View receipt"), icon: <ExternalLink className="h-4 w-4" />, href: `/receipt/${firstReceipt}`, target: "_blank" as const, separatorBefore: true }]
      : []),
    {
      label: tt("Copy order ID"),
      icon: <Copy className="h-4 w-4" />,
      separatorBefore: !firstReceipt,
      onClick: () => void copy(order.id, tt("Order ID")),
    },
  ]

  return (
    <>
      {/* The bar: in reach while the order scrolls under it, the pane's full
          width, and drawn on the first frame the order is. */}
      <OrderBarFrame
        back={
          <button type="button" onClick={onBack} aria-label={tt("Back to orders")} className={cn(iconButton, "h-9 w-9")}>
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        title={
          <>
            <h1 className="text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[20px] sm:leading-7">#{order.number}</h1>
            <span className="flex flex-wrap items-center gap-1.5">
              <PaymentBadge status={order.payment} />
              {stage ? <ShipBadge stage={stage} problem={parcel ? parcel.shipments.some((s) => s.status === "failed") : order.shipping?.problem} /> : <FulfillmentBadge status={order.fulfillment} />}
            </span>
          </>
        }
        actions={
          <>
            {slipHref ? (
              /* The packing slip, beside the menu (round 23, as Shopify's app): on a phone to the share sheet as a PDF (components/physical/slip-share), on a computer printed from a frame. */
              <button
                type="button"
                className={cn(buttonSecondary, "shrink-0 px-2.5")}
                aria-label={tt("Packing slip")}
                title={tt("Packing slip")}
                data-slip-print=""
                onClick={() => {
                  if (shareSlip(slipHref)) return
                  if (phone) window.location.assign(slipHref)
                  else void printSlip(slipHref).then((e) => e && onNotice(e))
                }}
              >
                <Printer className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null}
            <ResponsiveActionMenu
              title={tt("Order #{number}", { number: order.number })}
              menuWidth="w-56"
              items={items}
              trigger={
                <button type="button" className={cn(buttonSecondary, "shrink-0 px-2.5 sm:px-3")} disabled={busy !== null} aria-label={tt("More actions")}>
                  <span className="hidden sm:inline">{tt("More actions")}</span>
                  <MoreHorizontal className="h-4 w-4 sm:hidden" />
                  <ChevronDown className="hidden h-4 w-4 sm:block" />
                </button>
              }
            />
            {onStep ? (
              /* Previous and next are a computer's: on a phone the order is one screen with Back, as Shopify's app (round 23). */
              <span className="flex shrink-0 items-center max-sm:hidden">
                {position ? (
                  <span className="ml-1 mr-1 hidden text-[12px] tabular-nums text-[#6b7280] md:inline">
                    {tt("{value} of {count}", { value: position.index + 1, count: position.count })}
                  </span>
                ) : null}
                <button type="button" aria-label={tt("Previous order")} title={tt("Previous order")} disabled={!canStep.previous} onClick={() => onStep(-1)} className={iconButton}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" aria-label={tt("Next order")} title={tt("Next order")} disabled={!canStep.next} onClick={() => onStep(1)} className={iconButton}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            ) : null}
          </>
        }
        subtitle={
          <>
            {fullDate(order.createdAt, timeZone)}
            {order.source ? tt(" from {source}", { source: SOURCE_LABEL[order.source] }) : ""}
          </>
        }
      />

      {/*
        THE CARDS, AS SHOPIFY LAYS THEM OUT. On a wide screen two columns,
        the main one two thirds: what was bought, the payment and the
        timeline one under the other; the customer and the order's details
        beside them, both columns starting under the bar. The side column
        spans a last row that is `1fr`, so however tall it is it never
        stretches a row of the main column: a spanning item that crosses a
        flexible track is left out of sizing the others (CSS Grid 11.5).
        On a phone, one column in the order the source reads: the items, the
        payment, who bought it, the details, then the history.
      */}
      <div key={order.id} className={cn("orders-body mx-auto pt-4 pb-6", ORDER_WIDTH, GUTTER)}>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:grid-rows-[auto_auto_auto_1fr] lg:items-start">
          {/* Something shipped: what is to send, each shipment and its tracking, returns (components/physical/order-panel.tsx), while physical commerce is on. */}
          {physicalOrder && physicalCommerce ? (
            <div className="grid min-w-0 gap-4 lg:col-start-1 lg:row-start-1">
              <PhysicalFulfillment state={physical} number={order.number} onNotice={onNotice} onRefund={canRefund && refundable.length > 0 ? () => setDialog("refund") : null} onRefundAll={canRefund && refundable.length > 0 ? refundAll : null} />
              {digitalLines.length > 0 ? (
                <FulfillmentCard order={order} lines={digitalLines} timeZone={timeZone} busy={busy} onResend={emailable ? () => void run("resend", { kind: "resend" }) : null} />
              ) : null}
            </div>
          ) : (
            <FulfillmentCard
              className="lg:col-start-1 lg:row-start-1"
              order={order}
              lines={order.lines}
              timeZone={timeZone}
              busy={busy}
              onResend={emailable ? () => void run("resend", { kind: "resend" }) : null}
            />
          )}
          <PaymentCard
            className="lg:col-start-1 lg:row-start-2"
            order={order}
            shippingName={parcel ? (parcel.deliveryMethod === "pickup" ? tt("Local pickup") : (parcel.delivery?.name ?? null)) : order.shipping ? (order.shipping.pickup ? tt("Local pickup") : order.shipping.method) : null}
            busy={busy}
            onRefund={canRefund && refundable.length > 0 ? () => setDialog("refund") : null}
            onInvoice={() => void run("invoice", { kind: "invoice" })}
          />
          <div className="grid min-w-0 content-start gap-4 lg:col-start-2 lg:row-span-4 lg:row-start-1">
            {physicalOrder ? <BuyerNoteCard order={parcel} /> : <DigitalNoteCard orderId={order.id} />}
            <CustomerCard order={order} phone={parcel?.buyerPhone ?? null} onEdit={() => setDialog("email")} onCopy={copy} />
            {physicalOrder ? <ShippingCard order={parcel} onNotice={onNotice} onEditAddress={(address, notifyBuyer) => physical.act({ action: "address", address, notifyBuyer })} /> : null}
            <DetailsCard order={order} digital={digitalLines.length > 0} timeZone={timeZone} receipt={firstReceipt ?? null} onCopy={copy} />
          </div>
          <div className="grid min-w-0 content-start gap-4 lg:col-start-1 lg:row-start-3">
            {/* What the buyer wrote with Contact the shop, with the reply box (components/support/order-messages-card.tsx). */}
            <OrderMessagesCard checkoutId={parcel?.id ?? null} orderId={physicalOrder ? null : (order.lines[0]?.id ?? null)} />
            <Timeline
              order={order}
              timeZone={timeZone}
              now={now}
              revision={revision}
              physical={parcel ? historyOf(parcel) : null}
              onNote={parcel ? (text, key) => physical.act({ action: "comment", text, key }) : null}
            />
          </div>
        </div>
      </div>

      <RefundDialog
        phone={phone}
        open={dialog === "refund"}
        lines={refundable}
        currency={order.currency}
        onClose={() => setDialog(null)}
        onSubmit={async (line, amountCents, reason) => {
          const ok = await run("refund", { kind: "refund", line, amountCents, reason })
          if (ok) setDialog(null)
        }}
        busy={busy === "refund"}
      />
      <EmailDialog
        phone={phone}
        open={dialog === "email"}
        current={order.customerEmail || ""}
        sendsReceipt={emailable}
        onClose={() => setDialog(null)}
        onSubmit={async (email) => {
          const ok = await run("email", { kind: "email", email })
          if (ok) setDialog(null)
        }}
        busy={busy === "email"}
      />
    </>
  )
}

/* ─── Cards ───────────────────────────────────────────────────────────── */

function CardHead({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3 px-4 pt-3">
      <div className="flex min-w-0 items-center gap-2">{children}</div>
      {aside}
    </div>
  )
}

function Thumb({ line }: { line: OrderRow }) {
  const src = line.product?.thumbnail_url
  return (
    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-[#eceef1] bg-[#f4f5f7]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={44} height={44} decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[#9ca3af]">
          <Package className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

function accessLine(order: Order, timeZone: string, fulfilled = order.fulfillment === "fulfilled"): string {
  if (!fulfilled) return order.payment === "failed" ? tt("No access: the payment failed") : tt("Access is given when the payment goes through")
  if (order.deliveredAt) return tt("Receipt emailed {date}", { date: fullDate(order.deliveredAt, timeZone) })
  if (order.delivery === "failed") return tt("Access given, but the receipt email did not arrive")
  return tt("Access given when the payment went through")
}

function FulfillmentCard({
  className,
  order,
  lines,
  timeZone,
  busy,
  onResend,
}: {
  className?: string
  order: Order
  /** The lines this card is for: all of them, or a mixed order's downloads. */
  lines: OrderRow[]
  timeZone: string
  busy: string | null
  onResend: (() => void) | null
}) {
  /* A mixed order's downloads are given when it is paid, whatever its parcel is doing. */
  const mixed = lines.length < order.lines.length
  const fulfilled = mixed ? lines.some((l) => l.status === "completed" || l.status === "refunded") : order.fulfillment === "fulfilled"
  const count = lines.reduce((n, l) => n + Math.max(1, l.quantity ?? 1), 0)
  return (
    <section className={cn(card, "min-w-0", className)} data-digital-card="">
      <CardHead aside={<DeliveryBadge status={order.delivery} />}>
        <FulfillmentBadge status={fulfilled ? "fulfilled" : "unfulfilled"} />
        <span className="truncate text-[12px] text-[#6b7280]">{itemsLabel(count)}</span>
      </CardHead>
      <div className="px-4 pb-1 pt-2 text-[13px] text-[#4b5563]">
        <p>{accessLine(order, timeZone, fulfilled)}</p>
        <p className="text-[#6b7280]">{!mixed && lines.some((l) => l.product?.type === "physical") ? tt("Ships to the buyer") : tt("Digital download, no shipping")}</p>
      </div>
      <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
        {lines.map((line) => {
          /* The line's price: what was charged, less the tip and any tax added on top inside it. */
          const cents = Math.max(0, (line.amount_cents || 0) - (line.tip_cents || 0) - (line.tax_included ? 0 : line.tax_cents || 0))
          const kind = line.product?.type ? line.product.type.replace(/^./, (c) => c.toUpperCase()) : null
          return (
            <li key={line.id} className="flex items-center gap-3 py-3">
              <Thumb line={line} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#1a1a2e]">{line.product?.title || tt("Product removed")}</p>
                <p className="truncate text-[12px] text-[#6b7280]">
                  {[line.variant_name, kind].filter(Boolean).join(" · ") || tt("Digital")}
                  {line.status === "refunded" ? <span className="text-[#b42318]"> · {tt("Refunded")}</span> : null}
                </p>
                {/* Every property the line kept (the store's own notes too), and the offers that saved on it by the name the checkout showed. */}
                {line.properties && Object.keys(line.properties).length ? (
                  <p data-order-line-properties="" className="text-[12px] text-[#6b7280] [overflow-wrap:anywhere]">
                    {Object.entries(line.properties).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                  </p>
                ) : null}
                {line.offers?.length ? (
                  <p data-line-offers="" className="text-[12px] text-[#6b7280]">
                    {line.offers.map((o) => `${o.title} −${formatMoney(o.savedCents, order.currency)}`).join(" · ")}
                  </p>
                ) : null}
              </div>
              <span className="hidden text-[13px] tabular-nums text-[#6b7280] sm:inline">{formatMoney(Math.round(cents / Math.max(1, line.quantity ?? 1)), order.currency)} &times; {Math.max(1, line.quantity ?? 1)}</span>
              <span className="w-[76px] text-right text-[13px] font-medium tabular-nums text-[#1a1a2e]">{formatMoney(cents, order.currency)}</span>
            </li>
          )
        })}
      </ul>
      {onResend ? (
        <div className="flex justify-end px-4 py-3">
          <button type="button" className={buttonSecondary} onClick={onResend} disabled={busy !== null}>
            <Send className="h-3.5 w-3.5" />
            {busy === "resend" ? tt("Sending…") : tt("Resend receipt")}
          </button>
        </div>
      ) : (
        <div className="h-3" />
      )}
    </section>
  )
}

function Row({ label, middle, value, strong, muted }: { label: string; middle?: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-3 py-1 text-[13px]", strong ? "font-semibold text-[#1a1a2e]" : muted ? "text-[#6b7280]" : "text-[#303036]")}>
      <span className="w-[96px] shrink-0 sm:w-[110px]">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[#6b7280]">{middle}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

function PaymentCard({
  className,
  order,
  shippingName,
  busy,
  onRefund,
  onInvoice,
}: {
  className?: string
  order: Order
  /** The delivery the buyer chose, on an order that ships. */
  shippingName?: string | null
  busy: string | null
  onRefund: (() => void) | null
  onInvoice: () => void
}) {
  /* Cash still to collect is not received yet: You receive waits for Mark as paid. */
  const received = order.payment === "failed" || order.payment === "pending" || order.payment === "voided" || order.payment === "cash_due" ? 0 : order.totalCents
  /* An order shows what the buyer paid, like Shopify: Storelib's fee and the seller's share live in Payouts (the sale's panel), never here. */
  const method = paymentMethodOf(order)
  /* Paid through Airwallex before Storelib moved to Stripe: no Refund here, and where to do it instead (lib/payments/past-provider). */
  const refundElsewhere = order.lines.some((l) => paidThroughAirwallex(l) && refundableCents(l) > 0)
  return (
    <section className={cn(card, "min-w-0", className)}>
      <CardHead>
        <PaymentBadge status={order.payment} />
      </CardHead>
      <div className="mx-4 mt-2 rounded-xl border border-[#eceef1] px-3 py-2">
        <Row label={tt("Subtotal")} middle={itemsLabel(order.itemCount)} value={formatMoney(order.subtotalCents, order.currency)} />
        {order.shipping || order.shippingCents > 0 ? <Row label={tt("Shipping")} middle={shippingName ?? undefined} value={order.shippingCents > 0 ? formatMoney(order.shippingCents, order.currency) : "Free"} /> : null}
        {order.tipCents > 0 ? <Row label={tt("Tip")} value={formatMoney(order.tipCents, order.currency)} /> : null}
        {order.taxCents > 0 && !order.taxIncluded ? <Row label={order.taxLabel || tt("Tax")} value={formatMoney(order.taxCents, order.currency)} /> : null}
        <Row label={tt("Total")} value={formatMoney(order.totalCents, order.currency)} strong />
        {order.taxCents > 0 && order.taxIncluded ? <Row label={includedTaxLabel(order.taxLabel)} value={formatMoney(order.taxCents, order.currency)} muted /> : null}
        <div className="my-1.5 border-t border-[#f0f1f3]" />
        <Row label={order.payment === "pending" || order.payment === "cash_due" ? tt("Due") : tt("Paid")} middle={method || undefined} value={formatMoney(order.payment === "pending" || order.payment === "cash_due" ? order.totalCents : received, order.currency)} />
        {order.refundedCents > 0 ? <Row label={tt("Refunded")} value={`−${formatMoney(order.refundedCents, order.currency)}`} /> : null}
      </div>
      <div className="flex items-center justify-end gap-2 px-4 py-3">
        {refundElsewhere ? <p className="mr-auto min-w-0 text-[12px] leading-snug text-[#6b7280]">{tt("Refund this order in your Airwallex account.")}</p> : null}
        <button type="button" className={buttonSecondary} onClick={onInvoice} disabled={busy !== null}>
          <Download className="h-3.5 w-3.5" />
          {busy === "invoice" ? tt("Preparing…") : tt("Invoice")}
        </button>
        {onRefund ? (
          <button type="button" className={buttonPrimary} onClick={onRefund} disabled={busy !== null}>
            {tt("Refund")}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function flagOf(code: string | null | undefined): string {
  if (!code || code.length !== 2 || code === "XX") return ""
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)))
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] font-medium text-[#6b7280]">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-[13px] text-[#303036]">{children}</dd>
    </div>
  )
}

/**
 * What the buyer wrote for the shop on an order that ships nothing (the
 * website's checkout, an imported theme's cart note), drawn as an order
 * that ships draws its own (components/physical/order-panel BuyerNoteCard).
 * It comes with the order's activity (app/api/app/orders/[id]/activity),
 * which the row already read ahead when the finger rested on it.
 */
function DigitalNoteCard({ orderId }: { orderId: string }) {
  const noteOf = (json: unknown): string | null => {
    const note = (json as { note?: unknown } | null)?.note
    return typeof note === "string" && note.trim() ? note : null
  }
  const [note, setNote] = React.useState<string | null>(() => noteOf(cachedJson(activityUrl(orderId))))
  React.useEffect(() => {
    let live = true
    /* The note never changes after the sale: the answer kept or already on its way is enough (the timeline asks again after an action). */
    void readJson(activityUrl(orderId)).then((json) => {
      if (live && json) setNote(noteOf(json))
    })
    return () => {
      live = false
    }
  }, [orderId])
  if (!note) return null
  return (
    <section className={cn(card, "px-4 py-3.5")} data-order-notes="">
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Notes")}</h2>
      <p className="mt-2 text-[12px] font-medium text-[#6b7280]">{tt("From the buyer")}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-[#303036]">{note}</p>
    </section>
  )
}

function CustomerCard({
  order,
  phone,
  onEdit,
  onCopy,
}: {
  order: Order
  /** On an order that ships, the number given for the delivery. */
  phone?: string | null
  onEdit: () => void
  onCopy: (text: string, what: string) => void
}) {
  const line = order.lines[0]
  const device = [line.buyer_device_type, line.buyer_os, line.buyer_browser].filter(Boolean).join(", ")
  const country = line.buyer_country || line.buyer_country_code
  return (
    <section className={cn(card, "px-4 py-3.5")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Customer")}</h2>
        <button type="button" onClick={onEdit} className="-mr-1 rounded-md px-1 text-[12px] font-medium text-[#6d4ae0] hover:underline">
          {tt("Change email")}
        </button>
      </div>
      <dl className="mt-2 grid gap-2.5">
        <Field label={tt("Name")}>{order.customerName || <span className="text-[#9ca3af]">{tt("Not given")}</span>}</Field>
        <Field label={tt("Email")}>
          {order.customerEmail ? (
            <button
              type="button"
              title={tt("Copy email")}
              onClick={() => onCopy(order.customerEmail!, tt("Email"))}
              className="block max-w-full truncate text-left text-[#6d4ae0] hover:underline"
            >
              {order.customerEmail}
            </button>
          ) : (
            <span className="text-[#9ca3af]">{tt("No email")}</span>
          )}
        </Field>
        {phone ? (
          <Field label={tt("Phone")}>
            <a href={`tel:${phone.replace(/[^+0-9]/g, "")}`} className="text-[#6d4ae0] hover:underline">
              {phone}
            </a>
          </Field>
        ) : null}
        {country ? (
          <Field label={tt("Country")}>
            {flagOf(line.buyer_country_code)} {country}
          </Field>
        ) : null}
        {device ? <Field label={tt("Device")}>{device}</Field> : null}
      </dl>
    </section>
  )
}

function DetailsCard({
  order,
  digital = true,
  timeZone,
  receipt,
  onCopy,
}: {
  order: Order
  /** Whether anything in it downloads; an order that only ships has no receipt email to deliver. */
  digital?: boolean
  timeZone: string
  receipt: string | null
  onCopy: (text: string, what: string) => void
}) {
  return (
    <section className={cn(card, "px-4 py-3.5")}>
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">{tt("Order details")}</h2>
      <dl className="mt-2 grid gap-2.5">
        <Field label={tt("Placed")}>{fullDate(order.createdAt, timeZone)}</Field>
        <Field label={tt("Source")}>
          <span className={order.source ? undefined : "text-[#9ca3af]"}>{sourceText(order.source, order.sourceDetail)}</span>
          {originCampaign(order.sourceDetail) ? (
            <span className="mt-0.5 block break-words text-[12px] text-[#6b7280]">{originCampaign(order.sourceDetail)}</span>
          ) : null}
        </Field>
        <Field label={tt("Delivery")}>
          {order.shipping
            ? [order.shipping.pickup ? tt("Local pickup") : tt("Shipped to the buyer"), digital ? tt("downloads by email") : null].filter(Boolean).join(", ")
            : order.customerEmail
              ? tt("Email, and the buyer's library")
              : tt("The buyer's library")}
        </Field>
        {receipt ? (
          <Field label={tt("Receipt")}>
            <a href={`/receipt/${receipt}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[#6d4ae0] hover:underline">
              {tt("View the buyer's receipt")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </Field>
        ) : null}
        <Field label={tt("Order ID")}>
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate font-mono text-[12px]">{order.id}</span>
            <button
              type="button"
              aria-label={tt("Copy order ID")}
              title={tt("Copy order ID")}
              onClick={() => onCopy(order.id, tt("Order ID"))}
              className={cn(iconButton, "h-7 w-7 shrink-0")}
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </span>
        </Field>
      </dl>
    </section>
  )
}

/* ─── Timeline ────────────────────────────────────────────────────────── */

const GLYPH: Record<TimelineGlyph, LucideIcon> = {
  placed: ShoppingBag,
  paid: Check,
  pending: Clock3,
  failed: X,
  access: KeyRound,
  mail: Mail,
  "mail-failed": MailX,
  resent: Send,
  "email-changed": AtSign,
  refund: RotateCcw,
  funds: Landmark,
  payout: Banknote,
  shipped: Truck,
  delivered: PackageCheck,
  return: Undo2,
  cancelled: Ban,
  note: MessageSquare,
  event: CircleDot,
}

/* Semantic, never the accent: green for what went through, amber for what is
   waiting, red for what failed or went back, grey for the rest. The node is
   white on the panel's grey, so the colour is in the glyph and a tinted
   hairline, not a filled disc: six green discs in a row read as a traffic
   light, six white nodes read as one rail. */
const GLYPH_TONE: Record<TimelineTone, string> = {
  success: "text-[#16803c] border-[#cde9d6]",
  attention: "text-[#9a5b00] border-[#f0dca6]",
  critical: "text-[#b42318] border-[#f3cdc8]",
  neutral: "text-[#4b5563] border-[#e1e3e8]",
  upcoming: "text-[#9ca3af] border-dashed border-[#c9ccd3]",
}

/**
 * THE PANEL THE TIMELINE SITS IN. "In a container: a gray background with
 * depth, rounded corners, with dots behind." A well pressed into the page
 * rather than a card lifted off it, so it reads as the order's record and
 * not as a fifth card: a grey a step under the page's own #f8f9fa, a
 * hairline and a soft shade on the inside edge, and a white line under the
 * outside edge where the light catches the lip. The dots are a CSS radial
 * gradient on a 12px grid at 9 per cent ink: there to give the grey a
 * surface, quiet enough that 12px text over them reads as on plain grey.
 * The heading sits above it on the page, so it is not a card inside a card.
 */
const PANEL_STYLE: React.CSSProperties = {
  backgroundColor: "#f3f4f6",
  backgroundImage: "radial-gradient(circle, rgba(17,24,39,0.09) 1px, transparent 1.25px)",
  backgroundSize: "12px 12px",
  backgroundPosition: "6px 6px",
  boxShadow: "inset 0 0 0 1px rgba(17,24,39,0.06), inset 0 1px 3px rgba(17,24,39,0.06), 0 1px 0 rgba(255,255,255,0.9)",
}

const activityOf = (json: unknown): OrderActivity[] | null =>
  Array.isArray((json as { activity?: unknown } | null)?.activity) ? (json as { activity: OrderActivity[] }).activity : null
const stepsOf = (json: unknown): StripeStep[] | null =>
  Array.isArray((json as { timeline?: unknown } | null)?.timeline) ? (json as { timeline: StripeStep[] }).timeline : null

/** The rail runs through the middle of the 22px node column. */
const RAIL = "absolute left-[10.5px] w-px bg-[#d9dce1]"

function Timeline({
  className,
  order,
  timeZone,
  now,
  revision,
  physical = null,
  onNote = null,
}: {
  className?: string
  order: Order
  timeZone: string
  now: number
  revision: number
  /** A parcel's own history: shipments, deliveries, returns, notes. */
  physical?: PhysicalHistory | null
  /** Posts a note to it; null where notes are not kept (an order that ships nothing). */
  onNote?: ((text: string, key: string) => Promise<string | null>) | null
}) {
  const paidLine = paidLineOf(order)
  const payouts = hasPayoutSteps(order)
  /* What a finger on the row already read (./order-prefetch), so an order
     opened from the list draws its whole timeline on its first frame. */
  const [activity, setActivity] = React.useState<OrderActivity[]>(() => activityOf(cachedJson(activityUrl(order.id))) ?? [])
  const [stripe, setStripe] = React.useState<StripeStep[]>(() =>
    payouts && paidLine ? stepsOf(cachedJson(stripeTimelineUrl(paidLine.id))) ?? [] : [],
  )
  const [open, setOpen] = React.useState<string | null>(null)

  /* History after the sale: receipts sent again, the email changed. Read
     again after every action on the page. */
  React.useEffect(() => {
    let alive = true
    readJson(activityUrl(order.id), revision > 0).then((json) => {
      const list = activityOf(json)
      if (alive && list) setActivity(list)
    })
    return () => {
      alive = false
    }
  }, [order.id, revision])

  /* Payout steps come from Stripe, a second or so later when nobody asked
     for them ahead. What is still to come is kept at the foot, so their
     arrival moves nothing above them. A payment that changes here (a
     refund) reads them again. */
  const firstRead = React.useRef(true)
  React.useEffect(() => {
    const again = !firstRead.current
    firstRead.current = false
    if (!paidLine || !payouts) {
      setStripe([])
      return
    }
    let alive = true
    readJson(stripeTimelineUrl(paidLine.id), again).then((json) => {
      const steps = stepsOf(json)
      if (alive && steps) setStripe(steps)
    })
    return () => {
      alive = false
    }
  }, [paidLine?.id, payouts, order.payment]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = groupTimeline([...orderEvents(order, activity, stripe), ...(physical ? physicalEvents(physical) : [])], now, timeZone)
  const rows: Array<{ kind: "day"; key: string; label: string } | { kind: "event"; key: string; event: TimelineEvent; upcoming: boolean }> = []
  for (const g of groups) {
    rows.push({ kind: "day", key: `day-${g.key}`, label: g.day })
    for (const e of g.events) rows.push({ kind: "event", key: e.id, event: e, upcoming: g.upcoming })
  }
  const firstEvent = rows.findIndex((r) => r.kind === "event")
  const lastEvent = rows.map((r) => r.kind).lastIndexOf("event")

  return (
    <section className={cn("min-w-0", className)} data-order-timeline="">
      <h2 className="px-1 text-[13px] font-semibold text-[#1a1a2e]">{tt("Timeline")}</h2>
      <div data-timeline-panel="" className="mt-2 rounded-[14px] px-3.5 pb-1.5 pt-1 sm:px-4" style={PANEL_STYLE}>
        <ol>
          {rows.map((row, i) => {
            if (row.kind === "day") {
              return (
                <li key={row.key} data-timeline-day="" className="relative grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 pb-2 pt-3">
                  {i > firstEvent && firstEvent >= 0 ? <span aria-hidden className={cn(RAIL, "bottom-0 top-0")} /> : null}
                  <span />
                  <p className="text-[12px] font-medium leading-4 text-[#6b7280]">{row.label}</p>
                </li>
              )
            }
            const { event, upcoming } = row
            const Glyph = GLYPH[event.glyph]
            const exact = event.at ? fullDate(event.at, timeZone) : null
            const short = event.at
              ? upcoming
                ? dayHeading(event.at, now, timeZone)
                : relativeTime(event.at, now) ?? timeOfDay(event.at, timeZone)
              : null
            const expanded = open === event.id
            return (
              <li key={row.key} data-timeline-event="" className="relative grid grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-x-3 pb-3.5">
                {i > firstEvent ? <span aria-hidden className={cn(RAIL, "top-0 h-[11px]")} /> : null}
                {i < lastEvent ? <span aria-hidden className={cn(RAIL, "bottom-0 top-[11px]")} /> : null}
                {/* A parcel a carrier we know has: its logo on the rail instead of the truck (lib/physical/carriers.ts). */}
                {event.carrier && carrierOf(event.carrier) ? (
                  <span aria-hidden className="relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-[6px] bg-white shadow-[0_0_0_2px_#f3f4f6,0_1px_1px_rgba(17,24,39,0.05)]" data-timeline-carrier="">
                    <CarrierLogo carrier={event.carrier} size={22} decorative />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      "relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full border bg-white shadow-[0_1px_1px_rgba(17,24,39,0.05)]",
                      GLYPH_TONE[event.tone],
                    )}
                  >
                    <Glyph className="h-3 w-3" strokeWidth={2.25} />
                  </span>
                )}
                <div className="min-w-0 pt-[2px]">
                  {event.note ? (
                    <>
                      <p className="text-[13px] font-semibold leading-[18px] text-[#1a1a2e]">{tt("You added a note")}</p>
                      <p data-timeline-note="" className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-[#e7e8ec] bg-white px-2.5 py-1.5 text-[13px] leading-[18px] text-[#303036] shadow-[0_1px_1px_rgba(17,24,39,0.03)]">
                        {event.text}
                      </p>
                    </>
                  ) : (
                    <p className={cn("text-[13px] font-semibold leading-[18px]", upcoming ? "text-[#6b7280]" : "text-[#1a1a2e]")}>{event.text}</p>
                  )}
                  {event.detail || event.link ? (
                    <p className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 text-[12px] leading-4 text-[#6b7280]">
                      {event.detail ? <span className="break-words first-letter:uppercase">{event.detail}</span> : null}
                      {event.link ? (
                        <a href={event.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                          {event.link.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </p>
                  ) : null}
                  {expanded && exact ? <p className="mt-0.5 text-[12px] leading-4 tabular-nums text-[#4b5563]">{exact}</p> : null}
                </div>
                {short && exact ? (
                  <button
                    type="button"
                    title={exact}
                    aria-expanded={expanded}
                    aria-label={tt("{short}. Show the exact time", { short })}
                    onClick={() => setOpen(expanded ? null : event.id)}
                    className="-mr-1 rounded-md px-1 pt-[3px] text-[12px] leading-4 tabular-nums text-[#6b7280] hover:text-[#1a1a2e] hover:underline hover:decoration-dotted hover:underline-offset-2"
                  >
                    <time dateTime={event.at!}>{short}</time>
                  </button>
                ) : (
                  <span />
                )}
              </li>
            )
          })}
        </ol>
        {onNote ? <NoteComposer onPost={onNote} /> : null}
      </div>
    </section>
  )
}

/* ─── Dialogs ─────────────────────────────────────────────────────────── */

const dialogShell =
  "w-[calc(100%-32px)] max-w-[440px] gap-0 rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]"

/**
 * ONE SHELL FOR BOTH OF THIS PAGE'S DIALOGS. On a wide screen a dialog in the
 * middle of the window, which fades and settles in and out
 * (components/ui/dialog). On a phone the shared sheet
 * (components/ui/bottom-sheet), with the same motion as every other sheet in
 * /app and above the navigation pill. Only one of the two is ever drawn, and
 * the page keeps one dialog open at a time.
 *
 * While the action is in flight neither can be dismissed: the dialog ignores
 * the request, and the sheet comes back up.
 */
function DialogShell({
  phone,
  open,
  busy,
  onClose,
  title,
  description,
  onSubmit,
  children,
  footer,
}: {
  phone: boolean
  open: boolean
  busy: boolean
  onClose: () => void
  title: string
  description: React.ReactNode
  onSubmit: () => void
  children: React.ReactNode
  footer: React.ReactNode
}) {
  const form = (heading: React.ReactNode) => (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
    >
      {heading}
      {children}
      <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">{footer}</div>
    </form>
  )
  if (phone) {
    return (
      /* While it saves, a pull springs back and a tap outside does nothing
         (`dismissible`), rather than the sheet sliding all the way out and
         coming back up because the close was refused. */
      <BottomSheet isOpen={open} onClose={() => (busy ? undefined : onClose())} dismissible={!busy} label={title} aboveKeyboard>
        {form(
          <div className="px-5 pb-1 pt-2">
            <p className="text-[16px] font-semibold text-[#1a1a2e]">{title}</p>
            <p className="mt-1 text-[13px] text-[#6b7280]">{description}</p>
          </div>,
        )}
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className={dialogShell} showCloseButton={false}>
        {form(
          <div className="px-5 pb-1 pt-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-[#6b7280]">{description}</DialogDescription>
          </div>,
        )}
      </DialogContent>
    </Dialog>
  )
}

const field =
  "h-9 rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[16px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e] sm:text-[13px]"

function RefundDialog({
  phone,
  open,
  lines,
  currency,
  onClose,
  onSubmit,
  busy,
}: {
  phone: boolean
  open: boolean
  lines: OrderRow[]
  /** What the order was charged in (Order.currency): the amounts are typed and shown in it. */
  currency: string
  onClose: () => void
  onSubmit: (line: OrderRow, amountCents: number, reason: string) => void
  busy: boolean
}) {
  const [lineId, setLineId] = React.useState<string>("")
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState("requested_by_customer")
  /* The store's own refund reasons (Settings › Returns and refunds). */
  const reasons = useReasons("refund")
  const line = lines.find((l) => l.id === lineId) ?? lines[0]
  /* Typed in whole units of the order's currency: 100 to the unit for most, 1 for yen. */
  const unit = minorPerUnit(currency)
  const places = Math.round(Math.log10(unit))
  /* What is left to refund on the line: after a part refund, the rest. */
  const max = line ? refundableCents(line) / unit : 0

  React.useEffect(() => {
    if (!open) return
    setLineId(lines[0]?.id ?? "")
    setAmount(lines[0] ? (refundableCents(lines[0]) / unit).toFixed(places) : "")
    setReason("requested_by_customer")
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = Number.parseFloat(amount)
  const valid = line && Number.isFinite(value) && value > 0 && value <= max + 1e-9

  return (
    <DialogShell
      phone={phone}
      open={open}
      busy={busy}
      onClose={onClose}
      title={tt("Refund")}
      description={line?.payment_method === COD_PAYMENT_METHOD ? tt("This records the cash you gave back. Nothing is sent to a card, and the buyer gets an email about it.") : tt("The money goes back to the buyer's original payment method, and they get an email about it.")}
      onSubmit={() => {
        if (valid && line) onSubmit(line, Math.round(value * unit), reason)
      }}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={buttonPrimary} disabled={!valid || busy}>
            {busy ? tt("Refunding…") : valid ? tt("Refund {amount}", { amount: formatMoney(Math.round(value * unit), currency) }) : tt("Refund")}
          </button>
        </>
      }
    >
      <div className="grid gap-3 px-5 py-4">
        {lines.length > 1 ? (
          <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
            {tt("Item")}
            <select
              value={line?.id}
              onChange={(e) => {
                const next = lines.find((l) => l.id === e.target.value)
                setLineId(e.target.value)
                if (next) setAmount((refundableCents(next) / unit).toFixed(places))
              }}
              className={field}
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.product?.title || tt("Product")) + ", " + formatMoney(refundableCents(l), currency)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
          {tt("Amount")}
          <div className="flex h-9 items-center rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e]">
            <span className="text-[13px] text-[#6b7280]">{currencySymbol(currency)}</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))}
              className="min-w-0 flex-1 bg-transparent pl-1 text-[16px] tabular-nums text-[#1a1a2e] outline-none sm:text-[13px]"
            />
            <span className="text-[12px] text-[#9ca3af]">{tt("of {amount}", { amount: formatMoney(Math.round(max * unit), currency) })}</span>
          </div>
        </label>
        <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
          {tt("Reason")}
          <select value={reason} onChange={(e) => setReason(e.target.value)} className={field}>
            {reasons.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </DialogShell>
  )
}

function EmailDialog({
  phone,
  open,
  current,
  sendsReceipt,
  onClose,
  onSubmit,
  busy,
}: {
  phone: boolean
  open: boolean
  current: string
  sendsReceipt: boolean
  onClose: () => void
  onSubmit: (email: string) => void
  busy: boolean
}) {
  const [email, setEmail] = React.useState(current)
  React.useEffect(() => {
    if (open) setEmail(current)
  }, [open, current])
  const trimmed = email.trim()
  const wellFormed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
  const same = trimmed.toLowerCase() === current.trim().toLowerCase()
  const valid = wellFormed && !same
  return (
    <DialogShell
      phone={phone}
      open={open}
      busy={busy}
      onClose={onClose}
      title={tt("Change customer email")}
      description={
        sendsReceipt
          ? tt("The order moves to the new address, and the receipt with the download link is sent there now.")
          : tt("The order moves to the new address. Nothing is sent, as nothing in it has been paid for yet.")
      }
      onSubmit={() => {
        if (valid) onSubmit(trimmed)
      }}
      footer={
        <>
          <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
            {tt("Cancel")}
          </button>
          <button type="submit" className={buttonPrimary} disabled={!valid || busy}>
            {busy ? tt("Saving…") : sendsReceipt ? tt("Save and send") : tt("Save")}
          </button>
        </>
      }
    >
      <div className="px-5 py-4">
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          aria-label={tt("New email address")}
          autoFocus={!phone}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn(field, "w-full")}
        />
        {trimmed && !wellFormed ? <p className="mt-1.5 text-[12px] text-[#b42318]">{tt("Enter a full address, like name@example.com")}</p> : null}
      </div>
    </DialogShell>
  )
}
