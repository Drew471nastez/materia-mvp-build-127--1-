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
import { ChevronDown, Tag, X } from "lucide-react"
import { MissingImage } from "@/components/media/missing-image"
import { cn } from "@/lib/utils"
import { Reveal, Spinner, TextInput, useCheckoutCurrency, useCurrencyMark, useMoney } from "./ui"
import { useCheckoutLang, useCountryName, useCt } from "./words"

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
  const money = useMoney()
  const ct = useCt()
  return (
    <div data-line-item="" className="flex items-start gap-3.5">
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[8px] border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        {product.thumbnail_url ? (
          <Image src={product.thumbnail_url} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          <MissingImage />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] font-medium leading-snug text-[#1a1a2e]">{product.title}</p>
        {variant && variants.length > 1 ? (
          <div className="relative mt-1.5 inline-flex max-w-full">
            {/* A native select: the phone's own picker, a keyboard's arrows,
                and nothing to build or break. */}
            <select
              aria-label={ct("Option")}
              value={variant.id}
              onChange={(e) => {
                const next = variants.find((v) => v.id === e.target.value)
                if (next) onVariant(next)
              }}
              className="h-8 max-w-full cursor-pointer appearance-none truncate rounded-[6px] border border-[#e1e3e7] bg-white py-0 pl-2.5 pr-7 text-[16px] text-[#4b5563] shadow-[0_1px_1px_rgba(0,0,0,0.03)] outline-none transition-colors hover:border-[#d2d5da] focus:border-[#1a1a2e]/55 sm:text-[13px]"
            >
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.priceCents === 0 ? ct("Free") : money(v.priceCents)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
          </div>
        ) : variant ? (
          <p className="mt-0.5 truncate text-[13px] text-[#6b7280]">{variant.name}</p>
        ) : null}
        <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{isPwyw ? ct("Your price · Qty 1") : ct("Qty {quantity}", { quantity: 1 })}</p>
      </div>
      <p className="shrink-0 text-[14px] font-medium tabular-nums text-[#1a1a2e]">{priceCents === 0 ? ct("Free") : money(priceCents)}</p>
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
  const ct = useCt()
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
          {ct("Add promotion code")}
        </button>
      </Reveal>

      <Reveal open={state === "open"} pad>
        <div data-promo={state === "open" ? "open" : undefined}>
          <label htmlFor={id} className="sr-only">
            {ct("Discount code")}
          </label>
          <div className="relative">
            <TextInput
              ref={inputRef}
              id={id}
              value={code}
              placeholder={ct("Enter discount code")}
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
              {ct("Apply")}
            </button>
          </div>
          {error ? (
            <p id={`${id}-error`} role={quiet ? "status" : "alert"} className={cn("checkout-rise mt-1.5 text-[13px]", quiet ? "text-[#6b7280]" : "text-[#dc2626]")}>
              {ct(error)}
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
              aria-label={ct("Remove discount code")}
              className="grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-[4px] text-[#6b7280] transition-colors hover:bg-black/[0.06] hover:text-[#1a1a2e]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
          <span className="shrink-0 text-[13px] text-[#6b7280]">{ct("{amount} off", { amount: shown.label })}</span>
        </div>
      </Reveal>
    </div>
  )
}

const TIPS = [0, 100, 300, 500] as const
/** The last choice: an amount of the buyer's own. */
const OTHER = -1
const CHOICES: readonly number[] = [...TIPS, OTHER]

/**
 * ===========================================================================
 *  A TIP, FOLDED UNTIL IT IS WANTED
 * ===========================================================================
 * "In the checkout, Add a tip should be collapsed as default." It was a
 * heading with the five choices always open under it ("a little bit more
 * visible, not toggleable"), which put a control most buyers never use in
 * front of every one of them. Now it is one line of the order, "Add a tip
 * for <creator>" in full ink with a chevron, closed on every load, paid or
 * free, phone or computer. Pressed, it opens to the same track of choices;
 * the field for an amount of your own still appears only when Other is
 * chosen. It starts open only when a tip is already on (nothing keeps a tip
 * across a reload today, so that is only ever a tip chosen on this page),
 * and with a tip on its amount sits at the end of the line whether the
 * choices are open or not, like every other line of the order.
 *
 * The amounts sent are the ones this always sent: None, $1, $3 and $5 go to
 * onPreset, an amount typed goes to onCustom, and the page works the tip out
 * from those exactly as before. The choices sit in a light grey track and
 * the chosen one lifts out of it in white, the way iOS and Stripe draw a
 * choice of a few: nothing on the page turns black.
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
  const money = useMoney()
  const CURRENCY_MARK = useCurrencyMark()
  const CHECKOUT_CURRENCY = useCheckoutCurrency()
  const ct = useCt()
  const usingCustom = custom !== ""
  /* Closed unless a tip is actually on when it first draws; after that only the buyer opens and closes it. */
  const [open, setOpen] = React.useState(() => tipCents > 0 || usingCustom)
  /* Other chosen and nothing typed yet: still Other, and no tip until there is an amount. */
  const [otherChosen, setOtherChosen] = React.useState(false)
  const other = usingCustom || otherChosen
  const inputRef = React.useRef<HTMLInputElement>(null)
  const id = `tip-custom${idSuffix}`
  const labelId = `tip-label${idSuffix}`
  const panelId = `tip-choices${idSuffix}`
  /* One tab stop for the group, arrows between the choices, as a radio group
     is used everywhere else. */
  const current = other ? CHOICES.length - 1 : CHOICES.findIndex((c) => c === tipCents)
  const focusable = current >= 0 ? current : 0
  const choose = (i: number) => {
    const cents = CHOICES[i]
    if (cents === OTHER) {
      setOtherChosen(true)
      if (!usingCustom) onPreset(0)
      requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }))
      return
    }
    setOtherChosen(false)
    onPreset(cents)
  }
  const onArrows = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + CHOICES.length) % CHOICES.length
    choose(next)
    /* The thumb is the group's first child; the choices follow it. */
    ;(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next])?.focus()
  }
  return (
    <div data-tip="" data-tip-open={open ? "" : undefined}>
      <button
        type="button"
        data-tip-toggle=""
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        className="-mx-2 flex h-9 w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-3 rounded-[7px] px-2 text-left text-[14px] transition-colors duration-150 hover:bg-black/[0.035] active:bg-black/[0.06] [-webkit-tap-highlight-color:transparent]"
      >
        <span data-tip-label="" id={labelId} className="min-w-0 truncate">
          <span className="font-medium text-[#1a1a2e]">{ct("Add a tip")}</span>
          <span className="text-[#6b7280]"> {ct("for {shop}", { shop: creatorName })}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {tipCents > 0 ? (
            <span data-tip-amount="" className="checkout-rise font-medium tabular-nums text-[#1a1a2e]">
              {money(tipCents)}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn("h-4 w-4 text-[#6b7280] transition-[rotate] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none", open && "rotate-180")}
          />
        </span>
      </button>
      <Reveal open={open} id={panelId} pad className="-mx-[3px]">
        <div className="pt-1.5">
          {/*
            ONE WHITE THUMB THAT SLIDES. The chosen tip used to switch its own
            background on and the last one's off, which read as a blink. Now a
            single raised thumb moves under the choices to the one pressed, and
            only the words change colour: quick, and it says which is on. The
            track carries a faint inner edge so it holds its shape on the grey
            half as well as on white.
          */}
          <div
            role="radiogroup"
            aria-labelledby={labelId}
            className="relative grid grid-cols-5 gap-[3px] rounded-[10px] bg-[#e8eaed] p-[3px] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.04)]"
          >
            <span
              aria-hidden
              data-tip-thumb=""
              className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] rounded-[8px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.12),0_0_0_1px_rgba(16,24,40,0.05)] transition-[translate] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ width: "calc((100% - 18px) / 5)", translate: `calc(${Math.max(0, current)} * (100% + 3px)) 0` }}
            />
            {CHOICES.map((cents, i) => {
              const on = i === current
              return (
                <button
                  key={cents}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={i === focusable ? 0 : -1}
                  onKeyDown={(e) => onArrows(e, i)}
                  onClick={() => choose(i)}
                  className={cn(
                    "relative h-9 min-w-0 cursor-pointer rounded-[8px] text-[13.5px] font-medium tabular-nums outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/25 [-webkit-tap-highlight-color:transparent]",
                    on ? "text-[#1a1a2e]" : "text-[#4b5563] hover:text-[#1a1a2e]",
                  )}
                >
                  {cents === OTHER ? ct("Other") : cents === 0 ? ct("None") : money(cents).replace(".00", "")}
                </button>
              )
            })}
          </div>
          <Reveal open={other} pad className="-mx-[3px]">
            <div className="relative pt-2">
              <label htmlFor={id} className="sr-only">
                {ct("Your own tip, in {currency}", { currency: CHECKOUT_CURRENCY.toUpperCase() })}
              </label>
              <span aria-hidden className="pointer-events-none absolute bottom-0 left-3.5 flex h-11 items-center text-[15px] text-[#a2a7b0]">
                {CURRENCY_MARK}
              </span>
              <TextInput
                ref={inputRef}
                id={id}
                inputMode="decimal"
                placeholder={ct("Amount")}
                value={custom}
                onChange={(e) => {
                  /* Dollars and cents, up to the $1,000 the server takes: what is
                     typed is what the total uses, never a clamped figure behind it. */
                  const typed = e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
                  const [whole, frac] = typed.split(".")
                  const capped = Number(whole || 0) > 1000 ? "1000" : whole
                  onCustom(frac !== undefined ? `${capped}.${frac.slice(0, 2)}` : capped)
                }}
                className={cn("tabular-nums", CURRENCY_MARK.length > 1 ? "pl-12" : "pl-7")}
              />
            </div>
          </Reveal>
        </div>
      </Reveal>
    </div>
  )
}

/**
 * The arithmetic, in two parts around the tip: "top" is the subtotal with the
 * promotion code under it and the discount; "bottom" is the total due under a
 * hairline. The tip's own line, with its amount, is the TipPicker's row.
 */
export function Totals({
  part,
  subtotal,
  discountCents,
  discountLabel,
  total,
  isPwyw,
  promo,
  tax,
  currency,
}: {
  part: "top" | "bottom"
  subtotal: number
  discountCents: number
  discountLabel?: string
  total: number
  isPwyw?: boolean
  /** The promotion code's button or field, under the subtotal where Stripe puts it. */
  promo?: React.ReactNode
  /** Settings › Taxes: the tax for the buyer's country, which they can change here. */
  tax?: TaxLine
  /** What the card is charged in, when it is not the platform's (a store's own checkout). */
  currency?: string
}) {
  const money = useMoney()
  const ct = useCt()
  if (part === "top") {
    return (
      <dl data-totals="top" className="text-[14px]">
        <div className="flex justify-between gap-4">
          <dt className="font-medium text-[#1a1a2e]">{isPwyw ? ct("Your price") : ct("Subtotal")}</dt>
          <dd className="font-medium tabular-nums text-[#1a1a2e]">{money(subtotal)}</dd>
        </div>
        {promo ? <div className="mt-3">{promo}</div> : null}
        {discountCents > 0 ? (
          <div className="checkout-rise mt-3 flex justify-between gap-4">
            <dt className="text-[#6b7280]">{discountLabel ? ct("Discount ({code})", { code: discountLabel }) : ct("Discount")}</dt>
            <dd className="tabular-nums text-[#6b7280]">−{money(discountCents)}</dd>
          </div>
        ) : null}
      </dl>
    )
  }
  return (
    <dl data-totals="bottom" className="text-[14px]">
      {tax && !tax.included ? <TaxRow tax={tax} /> : null}
      <div className={cn("flex items-baseline justify-between gap-4 border-t border-black/[0.07] pt-4", tax && !tax.included && "mt-4")}>
        <dt className="text-[15px] font-semibold text-[#1a1a2e]">{ct("Total due")}</dt>
        <dd className="text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{money(total)}</dd>
      </div>
      {tax && tax.included ? <TaxRow tax={tax} /> : null}
    </dl>
  )
}

export interface TaxLine {
  cents: number
  rateBps: number
  included: boolean
  /** "VAT 19%", as Settings › Taxes names the region (lib/tax/rules taxLabel). */
  label?: string
  country: string | null
  /** The countries the store has a tax region for. */
  countries: string[]
  onCountry: (code: string | null) => void
  /** Keeps two copies of the summary (phone and computer) from sharing an id. */
  suffix?: string
}

/**
 * The tax line: "Tax" with its amount added, or "Includes … tax" under the
 * total. The country it is for is a quiet select: a buyer elsewhere picks
 * theirs, and a country with no region pays none, which is what it says.
 */
function TaxRow({ tax }: { tax: TaxLine }) {
  const money = useMoney()
  const ct = useCt()
  const lang = useCheckoutLang()
  const countryName = useCountryName()
  const names = React.useMemo(() => {
    const list = tax.countries.map((code) => ({ code, name: countryName(code) }))
    if (tax.country && !tax.countries.includes(tax.country)) list.push({ code: tax.country, name: countryName(tax.country) })
    return list.sort((a, b) => a.name.localeCompare(b.name, lang))
  }, [tax.countries, tax.country, countryName, lang])
  const id = `checkout-tax-country${tax.suffix ? `-${tax.suffix}` : ""}`
  const named = tax.cents > 0 && tax.label ? ct(tax.label) : ct("Tax")
  const label = tax.included ? (tax.cents > 0 ? (tax.label ? ct("Includes {amount} {tax}", { amount: money(tax.cents), tax: named }) : ct("Includes {amount} tax", { amount: money(tax.cents) })) : ct("No tax included")) : named
  return (
    <div data-tax-line="" className={cn("flex items-baseline justify-between gap-4", tax.included && "mt-2")}>
      <dt className={cn(tax.included ? "text-[13px] text-[#6b7280]" : "text-[#6b7280]")}>
        {label}
        <span className="text-[#9ca3af]"> · </span>
        <label htmlFor={id} className="sr-only">
          {ct("Country for tax")}
        </label>
        <select
          id={id}
          value={tax.country ?? ""}
          onChange={(e) => tax.onCountry(e.target.value || null)}
          className="cursor-pointer appearance-none rounded-md bg-transparent pr-1 text-inherit underline decoration-black/20 underline-offset-[3px] outline-none hover:decoration-black/40 focus-visible:ring-2 focus-visible:ring-black/10"
        >
          <option value="">{ct("Another country")}</option>
          {names.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </dt>
      {tax.included ? null : <dd className="tabular-nums text-[#6b7280]">{tax.cents > 0 ? money(tax.cents) : money(0)}</dd>}
    </div>
  )
}
