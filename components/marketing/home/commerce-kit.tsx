"use client"

/**
 * ===========================================================================
 *  THE COMMERCE SECTIONS' SHARED PARTS (home page, wave 12, track commerce)
 * ===========================================================================
 * How it works, Checkout, Sell everywhere and the Earnings calculator share:
 *
 *   the products     six kinds a creator sells, each with an EXAMPLE
 *                    production cost (a print partner's typical price for a
 *                    blank and its print; a download or a course has none)
 *   the fee          Storelib's real fee, worked out by the same function
 *                    checkout charges with (lib/payments/fees/calculate)
 *   the motion       one IntersectionObserver hook that pauses a section's
 *                    loops offscreen and in background tabs, the reduced
 *                    motion query, and a number that counts to its value
 *   the controls     the chip row and the slider both money sections use,
 *                    so the picker and the calculator read as one system
 *
 * Nothing here is a claim about a particular seller: every figure drawn from
 * it is labelled as an example where it is shown.
 */
import type { SectionStyle } from "./lazy-section"
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react"
import { calculateStorelibFee } from "@/lib/payments/fees/calculate"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { PRO_PRICE_CENTS } from "@/lib/billing/plans"

/* ── Products ────────────────────────────────────────────────────────── */

export type CommerceKind = "tee" | "hoodie" | "sweatshirt" | "cap" | "download" | "course"

export interface CommerceProduct {
  id: CommerceKind
  label: string
  /** Example production cost in cents: what a print partner charges for the blank and its print. 0 for a download or a course. */
  baseCents: number
  /** Where the price slider starts, and its range, in whole dollars. */
  price: number
  min: number
  max: number
  /** One line under the figures. */
  note: string
}

export const COMMERCE_PRODUCTS: readonly CommerceProduct[] = [
  { id: "tee", label: "T-shirt", baseCents: 1250, price: 30, min: 15, max: 60, note: "Printed when it sells, so there is no stock to buy first." },
  { id: "hoodie", label: "Hoodie", baseCents: 2700, price: 55, min: 35, max: 110, note: "Printed when it sells, so there is no stock to buy first." },
  { id: "sweatshirt", label: "Sweatshirt", baseCents: 2250, price: 48, min: 30, max: 95, note: "Printed when it sells, so there is no stock to buy first." },
  { id: "cap", label: "Cap", baseCents: 1500, price: 28, min: 18, max: 55, note: "Embroidered when it sells, so there is no stock to buy first." },
  { id: "download", label: "Digital download", baseCents: 0, price: 19, min: 2, max: 99, note: "No production cost. The file is delivered the moment they pay." },
  { id: "course", label: "Course", baseCents: 0, price: 129, min: 9, max: 499, note: "No production cost. Students start the moment they pay." },
] as const

export function commerceProduct(id: CommerceKind): CommerceProduct {
  return COMMERCE_PRODUCTS.find((p) => p.id === id) ?? COMMERCE_PRODUCTS[0]
}

/** Grow's monthly price in cents, read from lib/billing/plans (tests/home-w12-commerce.test.ts holds them equal). */
export const COMMERCE_PRO_MONTHLY_CENTS = PRO_PRICE_CENTS

/** How many currencies checkout can charge in: the fee rules are written per currency. */
export const COMMERCE_CURRENCY_COUNT = Object.keys(CURRENCY_FEE_RULES).length

export type CommercePlan = "free" | "pro"

/** One sale, as checkout works out Storelib's fee for it (USD). Merch ships, so it pays the physical card rate; a download or a course the digital one. */
export function commerceSale(priceCents: number, kind: CommerceKind, plan: CommercePlan = "free") {
  const productKind = commerceProduct(kind).baseCents > 0 ? "physical" : "digital"
  const fee = calculateStorelibFee({ grossMinor: priceCents, currency: "USD", sellerPlan: plan === "free" ? "free" : "paid", productKind }).totalStorelibFeeMinor
  const baseCents = commerceProduct(kind).baseCents
  return { priceCents, feeCents: fee, baseCents, profitCents: priceCents - fee - baseCents }
}

/* ── Money words ─────────────────────────────────────────────────────── */

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "$1,240" for whole amounts and big figures, "$14.81" otherwise. */
export function commerceUsd(cents: number, cents2 = Math.abs(cents) < 100_000 && cents % 100 !== 0): string {
  return (cents2 ? usd2 : usd0).format(cents / 100)
}

/* ── Motion ──────────────────────────────────────────────────────────── */

export function useCommerceReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const q = matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setReduced(q.matches)
    sync()
    q.addEventListener("change", sync)
    return () => q.removeEventListener("change", sync)
  }, [])
  return reduced
}

/**
 * Whether the element is on screen (with a margin) and the tab is visible.
 * Sets data-commerce-live on the element too, which the sections' CSS reads
 * to run or pause their loops, so a hidden section never animates.
 */
export function useCommerceLive<T extends HTMLElement>(margin = "120px 0px", withState = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [live, setLive] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    let seen = false
    const apply = () => {
      const on = seen && !document.hidden
      node.toggleAttribute("data-commerce-live", on)
      /* As a transition, so the section re-renders in slices between frames (the attribute above already runs or pauses its CSS loops). */
      if (withState) startTransition(() => setLive(on))
    }
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              seen = entries[entries.length - 1].isIntersecting
              apply()
            },
            { rootMargin: margin },
          )
        : null
    if (io) io.observe(node)
    else {
      seen = true
      apply()
    }
    document.addEventListener("visibilitychange", apply)
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", apply)
    }
  }, [margin, withState])
  return [ref, live]
}

/**
 * A figure that counts to its new value (ease out, about 0.6s). The text is
 * written straight into the span on each frame, so counting never re-renders
 * React. Screen readers get the final value only.
 */
export function CommerceNumber({ cents, className, whole = false }: { cents: number; className?: string; whole?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null)
  const shown = useRef(cents)
  const text = (c: number) => commerceUsd(Math.round(c), whole ? false : undefined)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const from = shown.current
    const to = cents
    if (from === to || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = to
      node.textContent = text(to)
      return
    }
    const start = performance.now()
    const D = 620
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / D)
      const k = 1 - Math.pow(1 - t, 3)
      const v = from + (to - from) * k
      shown.current = v
      const next = text(t < 1 ? (whole ? Math.round(v / 100) * 100 : v) : to)
      if (node.textContent !== next) node.textContent = next
      if (t < 1) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cents, whole])
  return (
    <span className={className}>
      <span ref={ref} aria-hidden="true">
        {text(cents)}
      </span>
      <span className="sr-only">{text(cents)}</span>
    </span>
  )
}

/* ── Controls ────────────────────────────────────────────────────────── */

export function CommerceKindIcon({ kind, className = "h-5 w-5" }: { kind: CommerceKind; className?: string }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className}>
      {kind === "tee" ? <path {...p} d="M8.5 3.5 4 5.8 2.8 10l3 1.1V20.5h12.4V11.1l3-1.1L20 5.8l-4.5-2.3c-.5 1.6-1.9 2.6-3.5 2.6S9 5.1 8.5 3.5Z" /> : null}
      {kind === "hoodie" ? (
        <>
          <path {...p} d="M9 3.6C9.4 2.6 10.6 2 12 2s2.6.6 3 1.6l4.2 2.1L21 11l-2.8 1V21H5.8v-9L3 11l1.8-5.3L9 3.6Z" />
          <path {...p} d="M9 3.6c0 2.3 1.3 4.4 3 4.4s3-2.1 3-4.4M10.6 8v3M13.4 8v3M8.5 16.5h7" />
        </>
      ) : null}
      {kind === "sweatshirt" ? (
        <>
          <path {...p} d="M8.5 3.8 4.4 5.6 2.6 15l2.9.8 1.5-6.2V20.8h10V9.6l1.5 6.2 2.9-.8-1.8-9.4-4.1-1.8c-.5 1.3-1.9 2.2-3.5 2.2s-3-.9-3.5-2.2Z" />
          <path {...p} d="M7 19h10" />
        </>
      ) : null}
      {kind === "cap" ? (
        <>
          <path {...p} d="M3.5 15.5c0-5 3.6-9 8.2-9s8 3.6 8.3 8.2" />
          <path {...p} d="M3.5 15.5c3.5-1.4 9-1.6 16.5-.8 1.2.1 1.5 1.6.4 2.1-4.5 1.9-11.6 2.1-16.9-.1M11.7 6.5V5" />
        </>
      ) : null}
      {kind === "download" ? (
        <>
          <path {...p} d="M14 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.8L14 2.8Z" />
          <path {...p} d="M14 2.8v5h5M12 11v6M9.4 14.6 12 17.2l2.6-2.6" />
        </>
      ) : null}
      {kind === "course" ? (
        <>
          <rect {...p} x="2.8" y="4.5" width="18.4" height="12.5" rx="2.2" />
          <path {...p} d="m10.3 8.2 4.2 2.6-4.2 2.6V8.2ZM8 20.5h8" />
        </>
      ) : null}
    </svg>
  )
}

/** The product chips: a radio group, arrow keys move between them. */
export function CommerceKindPicker({ value, onChange, label, dark = false }: { value: CommerceKind; onChange: (k: CommerceKind) => void; label: string; dark?: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const move = (i: number) => {
    const n = COMMERCE_PRODUCTS.length
    const next = COMMERCE_PRODUCTS[(i + n) % n]
    onChange(next.id)
    refs.current[(i + n) % n]?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="cmk-chips" data-dark={dark || undefined}>
      {COMMERCE_PRODUCTS.map((p, i) => {
        const on = p.id === value
        return (
          <button
            key={p.id}
            ref={(n) => {
              refs.current[i] = n
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(p.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault()
                move(i + 1)
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault()
                move(i - 1)
              }
            }}
            className="cmk-chip"
            data-on={on || undefined}
            data-kind={p.id}
          >
            <CommerceKindIcon kind={p.id} className="h-[18px] w-[18px] shrink-0" />
            <span>{p.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A slider with its value, keyboard and screen reader ready (a native range). */
export function CommerceSlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
  valueText,
  hint,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  display: ReactNode
  valueText: string
  hint?: ReactNode
}) {
  const fill = max > min ? (value - min) / (max - min) : 0
  return (
    <div className="cmk-slider">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[15px] font-medium text-[#3f3f46]">
          {label}
        </label>
        <span className="text-[20px] font-semibold tabular-nums tracking-[-0.02em] text-[#18181b]">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={valueText}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cmk-range"
        style={{ "--cmk-fill": fill } as React.CSSProperties}
      />
      {hint ? <div className="mt-1 flex justify-between text-[12.5px] text-[#8b8b94]">{hint}</div> : null}
    </div>
  )
}

/**
 * The shared stylesheet, hoisted once by React (same href) however many
 * sections use it. Ranges: a 6px track filled to the thumb, a 28px thumb
 * inside a 44px tall hit area.
 */
export const COMMERCE_KIT_CSS = `
.cmk-chips{display:flex;flex-wrap:wrap;gap:8px}
.cmk-chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 16px 0 13px;border-radius:999px;border:1px solid #e4e4e7;background:#fff;color:#3f3f46;font-size:14.5px;font-weight:500;cursor:pointer;transition:background-color .2s,border-color .2s,color .2s,transform .2s cubic-bezier(.2,.8,.2,1);-webkit-tap-highlight-color:transparent}
.cmk-chip:hover{border-color:#c9c9cf;color:#18181b}
.cmk-chip:active{transform:scale(.97)}
.cmk-chip[data-on]{background:#18181b;border-color:#18181b;color:#fff}
.cmk-chip:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}
.cmk-slider{display:grid;gap:6px}
.cmk-range{--cmk-fill:.5;appearance:none;-webkit-appearance:none;width:100%;height:44px;margin:0;background:transparent;cursor:pointer;touch-action:pan-y}
.cmk-range::-webkit-slider-runnable-track{height:6px;border-radius:99px;background:linear-gradient(90deg,#7c3aed,#6366f1) 0/calc(var(--cmk-fill)*100%) 100% no-repeat,#e9e9ee}
.cmk-range::-moz-range-track{height:6px;border-radius:99px;background:#e9e9ee}
.cmk-range::-moz-range-progress{height:6px;border-radius:99px;background:linear-gradient(90deg,#7c3aed,#6366f1)}
.cmk-range::-webkit-slider-thumb{-webkit-appearance:none;width:28px;height:28px;margin-top:-11px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 1px rgba(24,24,27,.08),0 2px 8px rgba(24,24,27,.18);transition:transform .15s}
.cmk-range::-moz-range-thumb{width:28px;height:28px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 1px rgba(24,24,27,.08),0 2px 8px rgba(24,24,27,.18)}
.cmk-range:active::-webkit-slider-thumb{transform:scale(1.08)}
.cmk-range:focus-visible{outline:none}
.cmk-range:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px rgba(124,58,237,.28),0 2px 8px rgba(24,24,27,.18)}
.cmk-range:focus-visible::-moz-range-thumb{box-shadow:0 0 0 4px rgba(124,58,237,.28),0 2px 8px rgba(24,24,27,.18)}
.cmk-head{max-width:880px}
.cmk-title{margin:0;font-size:clamp(34px,5vw,72px);font-weight:500;line-height:1.04;letter-spacing:-.05em;text-wrap:balance}
.cmk-sub{margin:20px 0 0;max-width:60ch;font-size:clamp(16px,1.35vw,19px);line-height:1.6;text-wrap:pretty}
`

/** The kit's stylesheet, listed for lazySection's idle style insertion (lazy-section.tsx, SectionStyle). */
export const COMMERCE_KIT_STYLE: SectionStyle = { href: "w12-commerce-kit", precedence: "default", css: COMMERCE_KIT_CSS }

export function CommerceKitStyle() {
  return (
    <style href="w12-commerce-kit" precedence="default">
      {COMMERCE_KIT_CSS}
    </style>
  )
}
