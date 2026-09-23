"use client"

import * as React from "react"
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Package,
  RotateCcw,
  Send,
} from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { cn } from "@/lib/utils"
import { SOURCE_LABEL, dayHeading, fullDate, itemsLabel, timeOfDay, type Order, type OrderRow } from "@/lib/orders/order-view"
import {
  DeliveryBadge,
  FulfillmentBadge,
  PaymentBadge,
  buttonPrimary,
  buttonSecondary,
  card,
  formatMoney,
  iconButton,
} from "./order-parts"

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
  canStep: { newer: boolean; older: boolean }
  onAction: (order: Order, action: OrderAction) => Promise<string>
  onNotice: (message: string) => void
}

export function OrderDetail({ order, timeZone, now, onBack, onStep, canStep, onAction, onNotice }: OrderDetailProps) {
  const [dialog, setDialog] = React.useState<"refund" | "email" | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  const refundable = order.lines.filter((l) => l.status === "completed" && (l.amount_cents || 0) > 0 && l.stripe_payment_intent_id)
  const hasReceipt = order.lines.some((l) => l.receipt_token)
  const firstReceipt = order.lines.find((l) => l.receipt_token)?.receipt_token

  const run = async (label: string, action: OrderAction) => {
    setBusy(label)
    try {
      onNotice(await onAction(order, action))
      return true
    } catch (error) {
      onNotice((error as Error)?.message || "Something went wrong. Try again.")
      return false
    } finally {
      setBusy(null)
    }
  }

  const items: ActionMenuItem[] = [
    ...(refundable.length > 0
      ? [{ label: "Refund", icon: <RotateCcw className="h-4 w-4" />, onClick: () => setDialog("refund") }]
      : []),
    ...(hasReceipt
      ? [{ label: "Resend receipt", icon: <Send className="h-4 w-4" />, onClick: () => void run("resend", { kind: "resend" }) }]
      : []),
    { label: "Download invoice", icon: <Download className="h-4 w-4" />, onClick: () => void run("invoice", { kind: "invoice" }) },
    ...(hasReceipt
      ? [{ label: "Change customer email", icon: <Mail className="h-4 w-4" />, onClick: () => setDialog("email") }]
      : []),
    ...(firstReceipt
      ? [{ label: "View receipt", icon: <ExternalLink className="h-4 w-4" />, href: `/receipt/${firstReceipt}`, target: "_blank" as const, separatorBefore: true }]
      : []),
    {
      label: "Copy order ID",
      icon: <Copy className="h-4 w-4" />,
      separatorBefore: !firstReceipt,
      onClick: () => {
        void navigator.clipboard?.writeText(order.id).then(
          () => onNotice("Order ID copied"),
          () => onNotice("Could not copy"),
        )
      },
    },
  ]

  return (
    <div className="mx-auto max-w-[1040px] px-4 pb-6 sm:px-6 lg:px-8">
      {/* Title bar. Stays in reach while the order scrolls under it. */}
      <div className="sticky top-0 z-10 -mx-4 flex min-h-[60px] items-center gap-2 bg-[#f8f9fa] px-4 pt-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <button type="button" onClick={onBack} aria-label="Back to orders" className={cn(iconButton, "-ml-1.5 h-9 w-9")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1">
          <h1 className="text-[20px] font-bold leading-7 text-[#1a1a2e]">#{order.number}</h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <PaymentBadge status={order.payment} />
            <FulfillmentBadge status={order.fulfillment} />
          </div>
        </div>
        <ResponsiveActionMenu
          title={`Order #${order.number}`}
          menuWidth="w-56"
          items={items}
          trigger={
            <button type="button" className={cn(buttonSecondary, "shrink-0")} disabled={busy !== null}>
              <span className="hidden sm:inline">More actions</span>
              <MoreHorizontal className="h-4 w-4 sm:hidden" />
              <ChevronDown className="hidden h-4 w-4 sm:block" />
            </button>
          }
        />
        {onStep ? (
          <div className="hidden shrink-0 items-center sm:flex">
            <button type="button" aria-label="Newer order" disabled={!canStep.newer} onClick={() => onStep(-1)} className={iconButton}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Older order" disabled={!canStep.older} onClick={() => onStep(1)} className={iconButton}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
      <p className="ml-9 text-[13px] text-[#6b7280] sm:ml-10">
        {fullDate(order.createdAt, timeZone)}
        {order.source ? ` from ${SOURCE_LABEL[order.source]}` : ""}
      </p>

      <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid min-w-0 gap-4">
          <FulfillmentCard order={order} timeZone={timeZone} busy={busy} onResend={hasReceipt ? () => void run("resend", { kind: "resend" }) : null} />
          <PaymentCard
            order={order}
            busy={busy}
            onRefund={refundable.length > 0 ? () => setDialog("refund") : null}
            onInvoice={() => void run("invoice", { kind: "invoice" })}
          />
          <Timeline order={order} timeZone={timeZone} now={now} />
        </div>
        <div className="grid min-w-0 gap-4">
          <CustomerCard order={order} onEdit={hasReceipt ? () => setDialog("email") : null} onNotice={onNotice} />
          <DetailsCard order={order} />
        </div>
      </div>

      <RefundDialog
        open={dialog === "refund"}
        lines={refundable}
        onClose={() => setDialog(null)}
        onSubmit={async (line, amountCents, reason) => {
          const ok = await run("refund", { kind: "refund", line, amountCents, reason })
          if (ok) setDialog(null)
        }}
        busy={busy === "refund"}
      />
      <EmailDialog
        open={dialog === "email"}
        current={order.customerEmail || ""}
        onClose={() => setDialog(null)}
        onSubmit={async (email) => {
          const ok = await run("email", { kind: "email", email })
          if (ok) setDialog(null)
        }}
        busy={busy === "email"}
      />
    </div>
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
        <img src={src} alt="" width={44} height={44} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[#9ca3af]">
          <Package className="h-4 w-4" />
        </div>
      )}
    </div>
  )
}

function FulfillmentCard({
  order,
  timeZone,
  busy,
  onResend,
}: {
  order: Order
  timeZone: string
  busy: string | null
  onResend: (() => void) | null
}) {
  return (
    <section className={card}>
      <CardHead aside={<DeliveryBadge status={order.delivery} />}>
        <FulfillmentBadge status={order.fulfillment} />
        <span className="truncate text-[12px] text-[#6b7280]">#{order.number}-F1</span>
      </CardHead>
      <div className="px-4 pb-1 pt-2 text-[13px] text-[#4b5563]">
        <p>
          {order.fulfillment === "fulfilled"
            ? order.deliveredAt
              ? `Sent by email on ${fullDate(order.deliveredAt, timeZone)}`
              : "Access given when the payment went through"
            : "Waiting for the payment"}
        </p>
        <p className="text-[#6b7280]">Digital product, no shipping</p>
      </div>
      <ul className="mx-4 mt-2 divide-y divide-[#f0f1f3] border-y border-[#f0f1f3]">
        {order.lines.map((line) => {
          const cents = line.amount_cents || 0
          return (
            <li key={line.id} className="flex items-center gap-3 py-3">
              <Thumb line={line} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[#1a1a2e]">{line.product?.title || "Product removed"}</p>
                <p className="truncate text-[12px] text-[#6b7280]">
                  {[line.variant_name, line.product?.type ? line.product.type.replace(/^./, (c) => c.toUpperCase()) : null]
                    .filter(Boolean)
                    .join(" · ") || "Digital"}
                  {line.status === "refunded" ? " · Refunded" : ""}
                </p>
              </div>
              <span className="hidden text-[13px] tabular-nums text-[#6b7280] sm:inline">{formatMoney(cents)} &times; 1</span>
              <span className="w-[76px] text-right text-[13px] font-medium tabular-nums text-[#1a1a2e]">{formatMoney(cents)}</span>
            </li>
          )
        })}
      </ul>
      {onResend ? (
        <div className="flex justify-end px-4 py-3">
          <button type="button" className={buttonSecondary} onClick={onResend} disabled={busy !== null}>
            {busy === "resend" ? "Sending…" : "Resend receipt"}
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
      <span className="w-[110px] shrink-0">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[#6b7280]">{middle}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}

function paymentMethodOf(order: Order): string | null {
  const line = order.lines[0]
  if (order.totalCents === 0) return "No payment needed"
  if (line.card_brand) {
    const brand = line.card_brand.replace(/^./, (c) => c.toUpperCase())
    return line.card_last4 ? `${brand} •••• ${line.card_last4}` : brand
  }
  if (line.payment_method === "paypal") return line.paypal_email ? `PayPal, ${line.paypal_email}` : "PayPal"
  if (line.payment_method && line.payment_method !== "card") return line.payment_method.replace(/_/g, " ")
  return line.stripe_payment_intent_id ? "Card" : null
}

function PaymentCard({
  order,
  busy,
  onRefund,
  onInvoice,
}: {
  order: Order
  busy: string | null
  onRefund: (() => void) | null
  onInvoice: () => void
}) {
  const received = order.payment === "failed" || order.payment === "pending" ? 0 : order.totalCents
  const net = received - order.refundedCents
  const earnings = Math.max(0, net - (order.refundedCents >= received ? 0 : order.feeCents))
  const method = paymentMethodOf(order)
  return (
    <section className={card}>
      <CardHead>
        <PaymentBadge status={order.payment} />
      </CardHead>
      <div className="mx-4 mt-2 rounded-xl border border-[#eceef1] px-3 py-2">
        <Row label="Subtotal" middle={itemsLabel(order.itemCount)} value={formatMoney(order.subtotalCents)} />
        {order.tipCents > 0 ? <Row label="Tip" value={formatMoney(order.tipCents)} /> : null}
        <Row label="Total" value={formatMoney(order.totalCents)} strong />
        <div className="my-1.5 border-t border-[#f0f1f3]" />
        <Row label="Paid" middle={method || undefined} value={formatMoney(received)} />
        {order.refundedCents > 0 ? <Row label="Refunded" value={`−${formatMoney(order.refundedCents)}`} /> : null}
        {order.feeCents > 0 && received > 0 ? (
          <>
            <Row label="Storelib fee" value={`−${formatMoney(order.refundedCents >= received ? 0 : order.feeCents)}`} muted />
            <Row label="You receive" value={formatMoney(earnings)} strong />
          </>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 px-4 py-3">
        <button type="button" className={buttonSecondary} onClick={onInvoice} disabled={busy !== null}>
          {busy === "invoice" ? "Preparing…" : "Invoice"}
        </button>
        {onRefund ? (
          <button type="button" className={buttonPrimary} onClick={onRefund} disabled={busy !== null}>
            Refund
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

function CustomerCard({
  order,
  onEdit,
  onNotice,
}: {
  order: Order
  onEdit: (() => void) | null
  onNotice: (message: string) => void
}) {
  const line = order.lines[0]
  const device = [line.buyer_device_type, line.buyer_os, line.buyer_browser].filter(Boolean).join(", ")
  return (
    <section className={cn(card, "px-4 py-3.5")}>
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Customer</h2>
      <p className="mt-2 text-[13px] text-[#1a1a2e]">{order.customerName || "No name given"}</p>

      <div className="mt-3 flex items-center justify-between">
        <h3 className="text-[12px] font-medium text-[#6b7280]">Contact</h3>
        {onEdit ? (
          <button type="button" onClick={onEdit} className="text-[12px] font-medium text-[#6d4ae0] hover:underline">
            Edit
          </button>
        ) : null}
      </div>
      {order.customerEmail ? (
        <button
          type="button"
          title="Copy email"
          onClick={() =>
            void navigator.clipboard?.writeText(order.customerEmail!).then(
              () => onNotice("Email copied"),
              () => onNotice("Could not copy"),
            )
          }
          className="mt-1 block max-w-full truncate text-left text-[13px] text-[#6d4ae0] hover:underline"
        >
          {order.customerEmail}
        </button>
      ) : (
        <p className="mt-1 text-[13px] text-[#9ca3af]">No email</p>
      )}

      {line.buyer_country ? (
        <>
          <h3 className="mt-3 text-[12px] font-medium text-[#6b7280]">Location</h3>
          <p className="mt-1 text-[13px] text-[#303036]">
            {flagOf(line.buyer_country_code)} {line.buyer_country}
          </p>
        </>
      ) : null}
      {device ? (
        <>
          <h3 className="mt-3 text-[12px] font-medium text-[#6b7280]">Device</h3>
          <p className="mt-1 text-[13px] text-[#303036]">{device}</p>
        </>
      ) : null}
    </section>
  )
}

function DetailsCard({ order }: { order: Order }) {
  return (
    <section className={cn(card, "px-4 py-3.5")}>
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Order details</h2>
      <dl className="mt-2 grid gap-2 text-[13px]">
        <div>
          <dt className="text-[12px] font-medium text-[#6b7280]">Source</dt>
          <dd className="text-[#303036]">{order.source ? SOURCE_LABEL[order.source] : "Not recorded"}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium text-[#6b7280]">Delivery method</dt>
          <dd className="text-[#303036]">{order.customerEmail ? "Email, and the buyer's library" : "The buyer's library"}</dd>
        </div>
        <div>
          <dt className="text-[12px] font-medium text-[#6b7280]">Order ID</dt>
          <dd className="truncate font-mono text-[12px] text-[#303036]">{order.id}</dd>
        </div>
      </dl>
    </section>
  )
}

/* ─── Timeline ────────────────────────────────────────────────────────── */

interface TimelineEvent {
  id: string
  at: string | null
  text: string
  detail?: string
  tone?: "done" | "upcoming" | "problem"
}

function localEvents(order: Order): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const who = order.customerName || order.customerEmail
  events.push({
    id: "placed",
    at: order.createdAt,
    text: `${who ? `${who} placed` : "Placed"} this order${order.source ? ` on ${order.source === "website" ? "your website" : "Storelib"}` : ""}.`,
  })
  if (order.payment !== "pending" && order.payment !== "failed") {
    const method = paymentMethodOf(order)
    events.push({
      id: "paid",
      at: order.createdAt,
      text: order.totalCents > 0 ? `A ${formatMoney(order.totalCents)} payment was processed.` : "Free order, nothing to pay.",
      detail: order.totalCents > 0 && method ? method : undefined,
    })
  }
  if (order.payment === "failed") events.push({ id: "failed", at: order.createdAt, text: "The payment failed.", tone: "problem" })
  if (order.fulfillment === "fulfilled") {
    events.push({ id: "access", at: order.createdAt, text: `Access given to ${itemsLabel(order.itemCount)}.` })
  }
  for (const line of order.lines) {
    if (line.buyer_notified_at) {
      events.push({ id: `mail-${line.id}`, at: line.buyer_notified_at, text: `Receipt sent to ${line.buyer_email || "the buyer"}.` })
    } else if ((line.buyer_email_last_error || "").trim()) {
      events.push({
        id: `mail-${line.id}`,
        at: null,
        text: "The receipt email did not arrive.",
        detail: line.buyer_email_last_error || undefined,
        tone: "problem",
      })
    }
    if (line.status === "refunded") {
      const cents = line.refund_amount_cents && line.refund_amount_cents > 0 ? line.refund_amount_cents : line.amount_cents
      events.push({
        id: `refund-${line.id}`,
        at: line.refunded_at || null,
        text: `${formatMoney(cents)} refunded${order.lines.length > 1 && line.product ? ` for ${line.product.title}` : ""}.`,
        detail: line.refund_reason ? line.refund_reason.replace(/_/g, " ") : undefined,
      })
    }
  }
  return events
}

const STRIPE_EVENTS = new Set(["funds_available", "payout_created", "payout_paid"])

function Timeline({ order, timeZone, now }: { order: Order; timeZone: string; now: number }) {
  const [remote, setRemote] = React.useState<TimelineEvent[]>([])
  const paidLine = order.lines.find((l) => (l.amount_cents || 0) > 0 && l.stripe_payment_intent_id)

  /* Payout steps come from Stripe, a second or so later. The timeline runs
     oldest first, so they arrive at its foot and move nothing above them. */
  React.useEffect(() => {
    setRemote([])
    if (!paidLine || order.payment === "failed" || order.payment === "pending") return
    let alive = true
    fetch(`/api/stripe/order-timeline?orderId=${encodeURIComponent(paidLine.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json?.timeline) return
        setRemote(
          (json.timeline as Array<{ id: string; label: string; description: string; timestamp: string | null; status: string }>)
            .filter((e) => STRIPE_EVENTS.has(e.id))
            .map((e) => ({
              id: e.id,
              at: e.timestamp,
              text: e.label,
              detail: e.description,
              tone: e.status === "completed" ? "done" : "upcoming",
            })),
        )
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [paidLine?.id, order.payment])

  const events = [...localEvents(order), ...remote]
  const done = events.filter((e) => e.tone !== "upcoming")
  const upcoming = events.filter((e) => e.tone === "upcoming")
  done.sort((a, b) => (a.at ? Date.parse(a.at) : Infinity) - (b.at ? Date.parse(b.at) : Infinity))

  /* Grouped by day, like a conversation: the day once as a heading, and
     only the time beside each event. An event with no time of its own sits
     in the day of the one before it. */
  const groups: Array<{ day: string; events: TimelineEvent[] }> = []
  for (const event of done) {
    const day = event.at ? dayHeading(event.at, now, timeZone) : groups.at(-1)?.day ?? "Earlier"
    const last = groups.at(-1)
    if (last && last.day === day) last.events.push(event)
    else groups.push({ day, events: [event] })
  }
  if (upcoming.length > 0) groups.push({ day: "Next", events: upcoming })
  const total = done.length + upcoming.length
  let index = 0

  return (
    <section className={cn(card, "px-4 pb-2 pt-3.5")}>
      <h2 className="text-[13px] font-semibold text-[#1a1a2e]">Timeline</h2>
      <ol className="mt-2">
        {groups.map((group) => (
          <li key={group.day}>
            <p className="pb-2 pl-[23px] pt-1 text-[12px] font-medium text-[#6b7280]">{group.day}</p>
            <ol>
              {group.events.map((event) => {
                const last = ++index === total
                return (
                  <li key={event.id} className="relative flex gap-3 pb-4">
                    {!last ? <span aria-hidden className="absolute left-[5px] top-[14px] h-[calc(100%+2px)] w-px bg-[#e5e7eb]" /> : null}
                    <span
                      aria-hidden
                      className={cn(
                        "relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full border-2",
                        event.tone === "upcoming"
                          ? "border-[#c9ccd3] bg-white"
                          : event.tone === "problem"
                            ? "border-[#d92d20] bg-[#d92d20]"
                            : "border-[#8b5cf6] bg-[#8b5cf6]",
                      )}
                    />
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className={cn("text-[13px]", event.tone === "upcoming" ? "text-[#6b7280]" : "text-[#1a1a2e]")}>{event.text}</p>
                        {event.detail ? <p className="mt-0.5 text-[12px] text-[#6b7280] first-letter:uppercase">{event.detail}</p> : null}
                      </div>
                      {event.at ? (
                        <time dateTime={event.at} title={fullDate(event.at, timeZone)} className="shrink-0 text-[12px] tabular-nums text-[#6b7280]">
                          {group.day === "Next" ? dayHeading(event.at, now, timeZone) : timeOfDay(event.at, timeZone)}
                        </time>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ─── Dialogs ─────────────────────────────────────────────────────────── */

const dialogShell =
  "w-[calc(100%-32px)] max-w-[440px] gap-0 rounded-2xl border border-[#e5e7eb] bg-white p-0 shadow-[0_24px_60px_-12px_rgba(17,24,39,0.3)]"

function RefundDialog({
  open,
  lines,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean
  lines: OrderRow[]
  onClose: () => void
  onSubmit: (line: OrderRow, amountCents: number, reason: string) => void
  busy: boolean
}) {
  const [lineId, setLineId] = React.useState<string>("")
  const [amount, setAmount] = React.useState("")
  const [reason, setReason] = React.useState("requested_by_customer")
  const line = lines.find((l) => l.id === lineId) ?? lines[0]
  const max = line ? (line.amount_cents || 0) / 100 : 0

  React.useEffect(() => {
    if (!open) return
    setLineId(lines[0]?.id ?? "")
    setAmount(lines[0] ? ((lines[0].amount_cents || 0) / 100).toFixed(2) : "")
    setReason("requested_by_customer")
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = Number.parseFloat(amount)
  const valid = line && Number.isFinite(value) && value > 0 && value <= max + 1e-9

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className={dialogShell} showCloseButton={false}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid && line) onSubmit(line, Math.round(value * 100), reason)
          }}
        >
          <div className="px-5 pb-1 pt-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">Refund</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-[#6b7280]">
              The money goes back to the buyer&apos;s original payment method, and they get an email about it.
            </DialogDescription>
          </div>
          <div className="grid gap-3 px-5 py-4">
            {lines.length > 1 ? (
              <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
                Item
                <select
                  value={line?.id}
                  onChange={(e) => {
                    const next = lines.find((l) => l.id === e.target.value)
                    setLineId(e.target.value)
                    if (next) setAmount(((next.amount_cents || 0) / 100).toFixed(2))
                  }}
                  className="h-9 rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[13px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]"
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {(l.product?.title || "Product") + ", " + formatMoney(l.amount_cents || 0)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
              Amount
              <div className="flex h-9 items-center rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e]">
                <span className="text-[13px] text-[#6b7280]">$</span>
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="min-w-0 flex-1 bg-transparent pl-1 text-[13px] tabular-nums text-[#1a1a2e] outline-none"
                />
                <span className="text-[12px] text-[#9ca3af]">of {formatMoney(Math.round(max * 100))}</span>
              </div>
            </label>
            <label className="grid gap-1.5 text-[12px] font-medium text-[#4b5563]">
              Reason
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[13px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]"
              >
                <option value="requested_by_customer">The buyer asked for it</option>
                <option value="duplicate">Charged twice</option>
                <option value="fraudulent">Fraudulent</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={buttonPrimary} disabled={!valid || busy}>
              {busy ? "Refunding…" : valid ? `Refund ${formatMoney(Math.round(value * 100))}` : "Refund"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EmailDialog({
  open,
  current,
  onClose,
  onSubmit,
  busy,
}: {
  open: boolean
  current: string
  onClose: () => void
  onSubmit: (email: string) => void
  busy: boolean
}) {
  const [email, setEmail] = React.useState(current)
  React.useEffect(() => {
    if (open) setEmail(current)
  }, [open, current])
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && email.trim() !== current
  return (
    <Dialog open={open} onOpenChange={(o) => (!o && !busy ? onClose() : undefined)}>
      <DialogContent className={dialogShell} showCloseButton={false}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) onSubmit(email.trim())
          }}
        >
          <div className="px-5 pb-1 pt-5">
            <DialogTitle className="text-[16px] font-semibold text-[#1a1a2e]">Change customer email</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] text-[#6b7280]">
              The receipt and access link go to the new address. An order&apos;s email can be changed once.
            </DialogDescription>
          </div>
          <div className="px-5 py-4">
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 w-full rounded-lg border border-[#d5d7dd] bg-white px-2.5 text-[13px] text-[#1a1a2e] outline-none focus:border-[#1a1a2e]"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-[#eef0f2] px-5 py-3">
            <button type="button" className={buttonSecondary} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={buttonPrimary} disabled={!valid || busy}>
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

