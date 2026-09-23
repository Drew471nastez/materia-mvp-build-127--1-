"use client"

/**
 * ===========================================================================
 *  THE ORDER: WHAT, HOW MUCH, AND THE TWO THINGS A BUYER MAY CHANGE
 * ===========================================================================
 * The product as a line (picture with its quantity, name, option, price),
 * then a discount code and a tip, then the arithmetic. Polaris's order
 * summary, in Storelib's colours: hairlines between the groups, the total
 * the only bold figure on the page.
 *
 * The figures here are the page's own; the server works them out again from
 * the database when the payment is made (lib/checkout/pricing.ts), and it
 * is the server's that is charged.
 */

import * as React from "react"
import Image from "next/image"
import { ChevronDown, Package, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Spinner, TextInput, money } from "./ui"

export interface SummaryVariant {
  id: string
  name: string
  description: string | null
  priceCents: number
}

export interface SummaryProduct {
  title: string
  thumbnail_url: string | null
}

export function LineItem({
  product,
  variant,
  variants,
  onVariant,
  priceCents,
  isPwyw,
}: {
  product: SummaryProduct
  variant: SummaryVariant | null | undefined
  variants: SummaryVariant[]
  onVariant: (v: SummaryVariant) => void
  priceCents: number
  isPwyw?: boolean
}) {
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative h-16 w-16 shrink-0">
        <div className="relative h-full w-full overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white">
          {product.thumbnail_url ? (
            <Image src={product.thumbnail_url} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center">
              <Package className="h-6 w-6 text-[#c4c7cd]" strokeWidth={1.5} />
            </span>
          )}
        </div>
        <span
          aria-label="Quantity 1"
          className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#6b7280] px-1 text-[11px] font-semibold text-white"
        >
          1
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{product.title}</p>
        {variant && variants.length > 1 ? (
          <div className="relative mt-1 inline-flex max-w-full">
            {/* A native select: the phone's own picker, a keyboard's arrows,
                and nothing to build or break. */}
            <select
              aria-label="Option"
              value={variant.id}
              onChange={(e) => {
                const next = variants.find((v) => v.id === e.target.value)
                if (next) onVariant(next)
              }}
              className="h-9 max-w-full cursor-pointer appearance-none truncate rounded-[8px] border border-[#e5e7eb] bg-white py-0 pl-2.5 pr-7 text-[16px] text-[#4b5563] outline-none transition-colors hover:border-[#c9ccd2] focus:border-[#1a1a2e]"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.priceCents === 0 ? "Free" : money(v.priceCents)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
          </div>
        ) : variant ? (
          <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{variant.name}</p>
        ) : null}
        {isPwyw ? <p className="mt-0.5 text-[12.5px] text-[#6b7280]">Your price</p> : null}
      </div>
      <p className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{priceCents === 0 ? "Free" : money(priceCents)}</p>
    </div>
  )
}

export function DiscountForm({
  code,
  onCode,
  applied,
  label,
  busy,
  error,
  onApply,
  onRemove,
  idSuffix,
}: {
  code: string
  onCode: (v: string) => void
  applied: boolean
  label: string
  busy: boolean
  error: string | null
  onApply: () => void
  onRemove: () => void
  idSuffix: string
}) {
  if (applied) {
    return (
      <div className="checkout-rise flex items-center justify-between gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-3.5 py-2.5">
        <span className="min-w-0 truncate text-[14px] text-[#1a1a2e]">
          <span className="font-medium uppercase tracking-wide">{code}</span>
          <span className="text-[#6b7280]"> · {label} off</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove discount code"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#6b7280] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1a2e]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }
  const id = `discount-code${idSuffix}`
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Discount code
      </label>
      <div className="flex gap-2">
        <TextInput
          id={id}
          value={code}
          placeholder="Enter discount code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={64}
          invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onApply()
            }
          }}
        />
        <button
          type="button"
          onClick={onApply}
          disabled={!code.trim() || busy}
          className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-[10px] border border-[#d4d6db] bg-white px-4 text-[14px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f7f7f8] disabled:cursor-not-allowed disabled:text-[#9ca3af] disabled:hover:bg-white"
        >
          {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
          Apply
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[13px] text-[#dc2626]">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const TIPS = [0, 100, 300, 500] as const

/**
 * A tip, as four choices and your own amount. The choices are a segmented
 * row, the way Polaris draws a choice of a few, rather than a row of pills.
 */
export function TipPicker({
  creatorName,
  tipCents,
  custom,
  onPreset,
  onCustom,
  idSuffix,
}: {
  creatorName: string
  tipCents: number
  custom: string
  onPreset: (cents: number) => void
  onCustom: (text: string) => void
  idSuffix: string
}) {
  const usingCustom = custom !== ""
  const id = `tip-custom${idSuffix}`
  /* One tab stop for the group, arrows between the choices, as a radio group
     is used everywhere else. */
  const current = usingCustom ? -1 : TIPS.findIndex((c) => c === tipCents)
  const focusable = current >= 0 ? current : 0
  const onArrows = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + TIPS.length) % TIPS.length
    onPreset(TIPS[next])
    ;(e.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus()
  }
  return (
    <fieldset>
      <legend className="mb-2.5 text-[14px] font-medium text-[#1a1a2e]">Add a tip for {creatorName}</legend>
      <div role="radiogroup" aria-label="Tip" className="grid grid-cols-4 overflow-hidden rounded-[10px] border border-[#d4d6db] bg-white">
        {TIPS.map((cents, i) => {
          const on = !usingCustom && tipCents === cents
          return (
            <button
              key={cents}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={i === focusable ? 0 : -1}
              onKeyDown={(e) => onArrows(e, i)}
              onClick={() => onPreset(cents)}
              className={cn(
                "h-11 text-[14px] font-medium tabular-nums transition-colors duration-150",
                i > 0 && "border-l border-[#e5e7eb]",
                on ? "bg-[#1a1a2e] text-white" : "text-[#374151] hover:bg-[#f7f7f8]",
              )}
            >
              {cents === 0 ? "None" : money(cents).replace(".00", "")}
            </button>
          )
        })}
      </div>
      <div className="relative mt-2">
        <label htmlFor={id} className="sr-only">
          Your own tip, in dollars
        </label>
        <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#6b7280]">
          $
        </span>
        <TextInput
          id={id}
          inputMode="decimal"
          placeholder="Your own amount"
          value={custom}
          onChange={(e) => {
            /* Dollars and cents, up to the $1,000 the server takes: what is
               typed is what the total uses, never a clamped figure behind it. */
            const typed = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
            const [whole, frac] = typed.split(".")
            const capped = Number(whole || 0) > 1000 ? "1000" : whole
            onCustom(frac !== undefined ? `${capped}.${frac.slice(0, 2)}` : capped)
          }}
          className="pl-7"
        />
      </div>
    </fieldset>
  )
}

export function Totals({
  subtotal,
  discountCents,
  discountLabel,
  tipCents,
  total,
  isPwyw,
}: {
  subtotal: number
  discountCents: number
  discountLabel?: string
  tipCents: number
  total: number
  isPwyw?: boolean
}) {
  return (
    <dl className="space-y-2 text-[14px]">
      <div className="flex justify-between gap-4">
        <dt className="text-[#4b5563]">{isPwyw ? "Your price" : "Subtotal"}</dt>
        <dd className="tabular-nums text-[#1a1a2e]">{money(subtotal)}</dd>
      </div>
      {discountCents > 0 ? (
        <div className="checkout-rise flex justify-between gap-4">
          <dt className="text-[#4b5563]">Discount{discountLabel ? ` (${discountLabel})` : ""}</dt>
          <dd className="tabular-nums text-[#1a1a2e]">−{money(discountCents)}</dd>
        </div>
      ) : null}
      {tipCents > 0 ? (
        <div className="checkout-rise flex justify-between gap-4">
          <dt className="text-[#4b5563]">Tip</dt>
          <dd className="tabular-nums text-[#1a1a2e]">{money(tipCents)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-4 pt-2">
        <dt className="text-[17px] font-semibold text-[#1a1a2e]">Total</dt>
        <dd className="text-[17px] font-semibold tabular-nums text-[#1a1a2e]">
          <span className="mr-1.5 text-[12px] font-medium text-[#6b7280]">USD</span>
          {money(total)}
        </dd>
      </div>
    </dl>
  )
}
