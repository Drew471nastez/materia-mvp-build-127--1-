"use client"

/**
 * The small pieces the Orders list and an order's page share. Everything
 * here is drawn for this page, in the /app palette (CLAUDE.md), rather than
 * taken as a library's default.
 */

import * as React from "react"
import { Check, Minus } from "lucide-react"
import { PopoverContent } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { DeliveryStatus, FulfillmentStatus, PaymentStatus } from "@/lib/orders/order-view"
import { FULFILLMENT_LABEL, PAYMENT_LABEL } from "@/lib/orders/order-view"

export const INK = "#1a1a2e"

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function formatMoney(cents: number): string {
  return money.format((cents || 0) / 100)
}

/* ─── Badges ──────────────────────────────────────────────────────────── */

type Tone = "neutral" | "attention" | "critical" | "success"

const TONE: Record<Tone, string> = {
  neutral: "bg-[#f1f2f4] text-[#3f3f46]",
  attention: "bg-[#fff1c2] text-[#5c4300]",
  critical: "bg-[#fde8e7] text-[#8a1c0f]",
  success: "bg-[#e3f5e9] text-[#14532d]",
}

/**
 * A status, as a word on a tint. The attention and critical tones carry a
 * small ring so a status that needs something from the creator can be told
 * apart from one that does not without reading it.
 */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2 text-[12px] font-medium leading-none",
        TONE[tone],
        className,
      )}
    >
      {tone === "attention" || tone === "critical" ? (
        <span aria-hidden className="h-[7px] w-[7px] rounded-full border-[1.5px] border-current" />
      ) : null}
      {children}
    </span>
  )
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const tone: Tone =
    status === "pending" || status === "partially_refunded" ? "attention" : status === "failed" ? "critical" : "neutral"
  return <StatusBadge tone={tone}>{PAYMENT_LABEL[status]}</StatusBadge>
}

export function FulfillmentBadge({ status }: { status: FulfillmentStatus }) {
  return <StatusBadge tone={status === "fulfilled" ? "neutral" : "attention"}>{FULFILLMENT_LABEL[status]}</StatusBadge>
}

export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  if (status === "delivered") return <StatusBadge tone="neutral">Delivered</StatusBadge>
  if (status === "failed") return <StatusBadge tone="critical">Not delivered</StatusBadge>
  return <span className="text-[#9ca3af]">&ndash;</span>
}

/* ─── Checkbox ────────────────────────────────────────────────────────── */

export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  const on = checked || indeterminate
  return (
    <span className="relative inline-flex h-4 w-4 shrink-0">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        ref={(el) => {
          if (el) el.indeterminate = indeterminate
        }}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "peer h-4 w-4 cursor-pointer appearance-none rounded-[5px] border bg-white transition-colors duration-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6]",
          on ? "border-[#1a1a2e] bg-[#1a1a2e]" : "border-[#b5b5bd] hover:border-[#6b7280]",
        )}
      />
      {on ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-white">
          {indeterminate && !checked ? <Minus className="h-3 w-3" strokeWidth={3} /> : <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      ) : null}
    </span>
  )
}

/* ─── Sparkline ───────────────────────────────────────────────────────── */

/**
 * The shape of the period under its number: this period as a line, the one
 * it is compared with dashed behind it, in the same checked blue and grey as
 * the Analytics reports. Both share one vertical scale, or
 * the comparison would lie. Drawn in a fixed box, so a new reading never
 * moves anything around it.
 */
export function Sparkline({ series, previous }: { series: number[]; previous: number[] }) {
  const width = 120
  const height = 26
  const max = Math.max(1, ...series, ...previous)
  const points = (values: number[]) =>
    values
      .map((v, i) => {
        const x = values.length === 1 ? width / 2 : (i / (values.length - 1)) * width
        const y = height - 2 - (v / max) * (height - 4)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(" ")
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block h-[26px] w-full" aria-hidden>
      <polyline
        points={points(previous)}
        fill="none"
        stroke="#b6bcc6"
        strokeWidth="1.25"
        strokeDasharray="3 3"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={points(series)}
        fill="none"
        stroke="#2a78d6"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

/* ─── Popover surface ─────────────────────────────────────────────────── */

export function MenuSurface({
  children,
  className,
  align = "start",
}: {
  children: React.ReactNode
  className?: string
  align?: "start" | "end" | "center"
}) {
  return (
    <PopoverContent
      align={align}
      sideOffset={6}
      collisionPadding={12}
      className={cn(
        "w-auto min-w-[220px] rounded-xl border border-[#e5e7eb] bg-white p-1.5 text-[#1a1a2e] shadow-[0_10px_30px_-8px_rgba(17,24,39,0.18),0_2px_6px_rgba(17,24,39,0.06)]",
        className,
      )}
    >
      {children}
    </PopoverContent>
  )
}

export function MenuOption({
  selected,
  onSelect,
  children,
  hint,
}: {
  selected: boolean
  onSelect: () => void
  children: React.ReactNode
  hint?: string
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors duration-100",
        selected ? "bg-[#f3f4f6]" : "hover:bg-[#f7f7f8]",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-5">{children}</span>
        {hint ? <span className="block text-[12px] leading-4 text-[#6b7280]">{hint}</span> : null}
      </span>
      <Check className={cn("mt-0.5 h-4 w-4 shrink-0 text-[#1a1a2e]", selected ? "opacity-100" : "opacity-0")} />
    </button>
  )
}

/* ─── Buttons ─────────────────────────────────────────────────────────── */

export const buttonSecondary =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e3e4e8] bg-white px-3 text-[13px] font-medium text-[#1a1a2e] shadow-[0_1px_0_rgba(17,24,39,0.05)] transition-colors duration-100 hover:bg-[#f7f7f8] active:bg-[#f1f2f4] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none"

export const buttonPrimary =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(17,24,39,0.25)] transition-colors duration-100 hover:bg-[#2a2a40] active:bg-[#111122] disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer select-none"

export const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#4b5563] transition-colors duration-100 hover:bg-[#f1f2f4] active:bg-[#e8e9ec] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer select-none"

export const card = "rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

/**
 * The page's own action, in the /app violet (CLAUDE.md): Export on the Orders
 * list. A flat fill with a hairline of light on top and a soft violet shadow
 * under it, a step darker on hover and again when pressed. Not a gradient.
 */
export const buttonAccent =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#8b5cf6] px-3 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_1px_2px_rgba(76,29,149,0.28),0_3px_8px_-3px_rgba(139,92,246,0.55)] transition-[background-color,box-shadow] duration-100 hover:bg-[#7c3aed] active:bg-[#6d28d9] active:shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_1px_rgba(76,29,149,0.3)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5cf6] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none cursor-pointer select-none"
