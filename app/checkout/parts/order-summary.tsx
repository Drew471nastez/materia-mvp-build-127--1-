"use client"

/**
 * ===========================================================================
 *  THE ORDER: WHAT, HOW MUCH, AND THE TWO THINGS A BUYER MAY CHANGE
 * ===========================================================================
 * Laid out as Stripe Checkout lays its summary: the product as a line with
 * its picture, "Qty 1" and the price; the subtotal; a small grey "Add
 * promotion code" button that opens into the field; the tip; and the total
 * due under a hairline. Nothing sits on the picture: the number badge there
 * read as a notification, not a quantity.
 *
 * The figures here are the page's own; the server works them out again from
 * the database when the payment is made (lib/checkout/pricing.ts), and it
 * is the server's that is charged.
 */

import * as React from "react"
import Image from "next/image"
import { ChevronDown, Package, Tag, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Reveal, Spinner, TextInput, money } from "./ui"

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
    <div data-line-item="" className="flex items-start gap-3.5">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {product.thumbnail_url ? (
          <Image src={product.thumbnail_url} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center">
            <Package className="h-5 w-5 text-[#c4c7cd]" strokeWidth={1.5} />
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{product.title}</p>
        {variant && variants.length > 1 ? (
          <div className="relative mt-1.5 inline-flex max-w-full">
            {/* A native select: the phone's own picker, a keyboard's arrows,
                and nothing to build or break. */}
            <select
              aria-label="Option"
              value={variant.id}
              onChange={(e) => {
                const next = variants.find((v) => v.id === e.target.value)
                if (next) onVariant(next)
              }}
              className="h-8 max-w-full cursor-pointer appearance-none truncate rounded-[6px] border border-[#e1e3e7] bg-white py-0 pl-2.5 pr-7 text-[16px] text-[#4b5563] shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors hover:border-[#d2d5da] focus:border-[#1a1a2e]/55 sm:text-[13px]"
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
        <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{isPwyw ? "Your price · Qty 1" : "Qty 1"}</p>
      </div>
      <p className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{priceCents === 0 ? "Free" : money(priceCents)}</p>
    </div>
  )
}

/**
 * THE CODE, THE WAY STRIPE ASKS FOR IT: a small grey button until it is
 * wanted, then the field with Apply inside it; once taken, the code as a
 * tag with a cross. A code from the link, or one already typed, opens as
 * the field.
 *
 * The three are always in the page, each in a Reveal, and exactly one is
 * open. So a change of state is one folding while the next unfolds: the
 * height moves between them instead of jumping, and clicking away from an
 * empty field closes it as softly as it opened.
 */
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
  quiet = false,
}: {
  code: string
  onCode: (v: string) => void
  applied: boolean
  label: string
  busy: boolean
  error: string | null
  /** The error is about a code the page applied from its link: grey and polite, not red and urgent. */
  quiet?: boolean
  onApply: () => void
  onRemove: () => void
  idSuffix: string
}) {
  const [opened, setOpened] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const addRef = React.useRef<HTMLButtonElement>(null)
  const open = opened || code !== "" || !!error
  const state: "add" | "open" | "applied" = applied ? "applied" : open ? "open" : "add"
  const id = `discount-code${idSuffix}`
  /* The tag keeps showing the code it was for while it folds away after Remove. */
  const [shown, setShown] = React.useState({ code, label })
  if (applied && (shown.code !== code || shown.label !== label)) setShown({ code, label })
  /* A code is typed wherever the field already is: focus moves without the page or the clip scrolling to it. */
  const focusField = () => requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
  const close = (refocus: boolean) => {
    setOpened(false)
    if (refocus) requestAnimationFrame(() => addRef.current?.focus({ preventScroll: true }))
  }

  return (
    <div data-promo-state={state} className="-m-[3px]">
      <Reveal open={state === "add"} pad>
        <button
          ref={addRef}
          type="button"
          data-promo="add"
          onClick={() => {
            setOpened(true)
            focusField()
          }}
          className="inline-flex h-8 cursor-pointer items-center rounded-[6px] bg-[#e9ebee] px-3 text-[13px] font-medium text-[#1a1a2e] transition-colors duration-150 hover:bg-[#e1e3e7] active:bg-[#d9dce1] [-webkit-tap-highlight-color:transparent]"
        >
          Add promotion code
        </button>
      </Reveal>

      <Reveal open={state === "open"} pad>
        <div data-promo={state === "open" ? "open" : undefined}>
          <label htmlFor={id} className="sr-only">
            Discount code
          </label>
          <div className="relative">
            <TextInput
              ref={inputRef}
              id={id}
              value={code}
              placeholder="Enter discount code"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={64}
              invalid={!!error && !quiet}
              aria-describedby={error ? `${id}-error` : undefined}
              onChange={(e) => onCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  onApply()
                }
                if (e.key === "Escape" && !code) close(true)
              }}
              onBlur={() => {
                if (!code && !error) close(false)
              }}
              className="pr-20 uppercase placeholder:normal-case"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onApply}
              disabled={!code.trim() || busy}
              className="absolute right-1.5 top-1/2 flex h-8 -translate-y-1/2 cursor-pointer items-center gap-1.5 rounded-[6px] px-3 text-[13px] font-semibold text-[#1a1a2e] transition-colors duration-150 hover:bg-[#f1f2f4] disabled:cursor-not-allowed disabled:text-[#a2a7b0] disabled:hover:bg-transparent"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : null}
              Apply
            </button>
          </div>
          {error ? (
            <p id={`${id}-error`} role={quiet ? "status" : "alert"} className={cn("checkout-rise mt-1.5 text-[13px]", quiet ? "text-[#6b7280]" : "text-[#dc2626]")}>
              {error}
            </p>
          ) : null}
        </div>
      </Reveal>

      <Reveal open={state === "applied"} pad>
        <div data-promo={state === "applied" ? "applied" : undefined} className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-[6px] bg-[#e9ebee] py-1 pl-2 pr-1 text-[13px] font-medium text-[#1a1a2e]">
            <Tag aria-hidden className="h-3.5 w-3.5 shrink-0 text-[#6b7280]" />
            <span className="truncate uppercase tracking-wide">{shown.code}</span>
            <button
              type="button"
              onClick={() => {
                close(true)
                onRemove()
              }}
              aria-label="Remove discount code"
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-[#6b7280] transition-colors hover:bg-black/[0.06] hover:text-[#1a1a2e]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="shrink-0 text-[13px] text-[#6b7280]">{shown.label} off</span>
        </div>
      </Reveal>
    </div>
  )
}

const TIPS = [0, 100, 300, 500] as const

/**
 * A tip, as four choices and your own amount. The choices sit in a light
 * grey track and the chosen one lifts out of it in white, the way iOS and
 * Stripe draw a choice of a few: nothing on the page turns black.
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
    <fieldset data-tip="">
      <legend className="mb-2 text-[14px] font-medium text-[#1a1a2e]">Add a tip for {creatorName}</legend>
      <div role="radiogroup" aria-label="Tip" className="grid grid-cols-4 gap-[3px] rounded-[9px] bg-[#e9ebee] p-[3px]">
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
                "h-9 cursor-pointer rounded-[7px] text-[14px] font-medium tabular-nums outline-none transition-[background-color,color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]",
                on
                  ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_1px_rgba(16,24,40,0.04)]"
                  : "text-[#4b5563] hover:bg-white/60 hover:text-[#1a1a2e]",
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
        <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[#9ca3af]">
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

/**
 * The arithmetic, in two parts around the tip: "top" is the subtotal with the
 * promotion code under it and the discount; "bottom" is the tip and the total
 * due under a hairline.
 */
export function Totals({
  part,
  subtotal,
  discountCents,
  discountLabel,
  tipCents,
  total,
  isPwyw,
  promo,
}: {
  part: "top" | "bottom"
  subtotal: number
  discountCents: number
  discountLabel?: string
  tipCents: number
  total: number
  isPwyw?: boolean
  /** The promotion code's button or field, under the subtotal where Stripe puts it. */
  promo?: React.ReactNode
}) {
  if (part === "top") {
    return (
      <dl data-totals="top" className="text-[14px]">
        <div className="flex justify-between gap-4">
          <dt className="font-medium text-[#1a1a2e]">{isPwyw ? "Your price" : "Subtotal"}</dt>
          <dd className="font-medium tabular-nums text-[#1a1a2e]">{money(subtotal)}</dd>
        </div>
        {promo ? <div className="mt-3">{promo}</div> : null}
        {discountCents > 0 ? (
          <div className="checkout-rise mt-3 flex justify-between gap-4">
            <dt className="text-[#6b7280]">Discount{discountLabel ? ` (${discountLabel})` : ""}</dt>
            <dd className="tabular-nums text-[#6b7280]">−{money(discountCents)}</dd>
          </div>
        ) : null}
      </dl>
    )
  }
  return (
    <dl data-totals="bottom" className="text-[14px]">
      {tipCents > 0 ? (
        <div className="checkout-rise mb-3 flex justify-between gap-4">
          <dt className="text-[#6b7280]">Tip</dt>
          <dd className="tabular-nums text-[#6b7280]">{money(tipCents)}</dd>
        </div>
      ) : null}
      <div className="flex items-baseline justify-between gap-4 border-t border-black/[0.07] pt-4">
        <dt className="text-[15px] font-semibold text-[#1a1a2e]">Total due</dt>
        <dd className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{money(total)}</dd>
      </div>
    </dl>
  )
}
