"use client"

/**
 * The offer editor's fields (./offer-editor.tsx): an amount with the store's
 * currency sign, the product picker, a quantity break's tiers, and the round
 * mark of a single choice. The sizes are the coupon editor's, so the two
 * pages type alike: 16px on a phone so iOS does not zoom, 44px to press.
 */

import * as React from "react"
import { Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { secondaryDepth } from "@/components/ui/depth-button"
import { MAX_TIERS, MAX_TIER_BADGE, MAX_TIER_LABEL, type TierDiscountType } from "@/lib/offers/pricing"
import { tierOf, type TierDraft } from "./offer-draft"
import { Tick } from "../coupons/coupon-parts"
import { ProductThumb } from "../products/collections/collection-parts"
import { tierWords, type OfferProduct } from "./offer-parts"
import { ThumbScroll } from "@/components/app/thumb-scroll"

export const FIELD =
  "h-11 w-full min-w-0 rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-[#9ca3af] focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:rounded-lg sm:text-[14px]"
export const BAD = "border-[#f0b4ab] focus:border-[#e3897c]"
export const LABEL = "mb-1.5 block text-[13px] font-medium text-[#4b5563]"
export const HINT = "text-[13px] leading-5 text-[#6b7280]"
export const ERR = "mt-1.5 text-[13px] font-medium leading-5 text-[#b42318]"
export const SECTION_TITLE = "text-[15px] font-semibold text-[#1a1a2e] sm:text-[14px]"
/** iOS's curve and the segmented control's time (../products/new/editor-controls.tsx Segmented). */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const SLIDE_MS = 200
const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

export function MoneyField({ id, sign, value, onChange, bad, placeholder, className }: { id: string; sign: string; value: string; onChange: (v: string) => void; bad?: boolean; placeholder?: string; className?: string }) {
  const wide = sign.length > 1
  return (
    <span className={cn("relative block", className ?? "w-[180px]")}>
      <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">
        {sign}
      </span>
      <input id={id} inputMode="decimal" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, "").slice(0, 12))} aria-invalid={bad || undefined} className={cn(FIELD, wide ? "pl-12" : "pl-8", "tabular-nums", bad && BAD)} />
    </span>
  )
}

export function ProductPicker({ products, chosen, onPick, single = false, money, name, full = false }: { products: OfferProduct[]; chosen: string[]; onPick: (id: string) => void; single?: boolean; money: (minor: number) => string; name: string; full?: boolean }) {
  const [q, setQ] = React.useState("")
  const words = q.toLowerCase().trim()
  /* What is chosen comes first, so a long list never hides it. */
  const ordered = [...products.filter((p) => chosen.includes(p.id)), ...products.filter((p) => !chosen.includes(p.id))]
  const shown = ordered.filter((p) => !words || p.title.toLowerCase().includes(words)).slice(0, 200)
  if (products.length === 0) return <p className={HINT}>{tt("Add a product first, then pick it here.")}</p>
  return (
    <div className="space-y-2" data-product-picker={name}>
      {products.length > 6 ? (
        <label className="relative block">
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input type="search" enterKeyHint="search" data-no-autofocus="" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt("Search products")} aria-label={tt("Search products")} className={cn(FIELD, "pl-9 [&::-webkit-search-cancel-button]:hidden")} />
        </label>
      ) : null}
      {/* The app's own slim bar over the list's edge (components/app/thumb-scroll), not the platform's grey column. */}
      <ThumbScroll className="max-h-[336px] overflow-y-auto overscroll-contain rounded-xl border border-[#e5e7eb]">
      <ul role={single ? "radiogroup" : "group"} aria-label={tt("Products")} className="divide-y divide-[#eef0f2]">
        {shown.map((p) => {
          const on = chosen.includes(p.id)
          const blocked = !on && full
          return (
            <li key={p.id} className="[contain-intrinsic-size:auto_56px] [content-visibility:auto]">
              <button
                type="button"
                role={single ? "radio" : "checkbox"}
                aria-checked={on}
                aria-disabled={blocked || undefined}
                data-pick={p.id}
                onClick={() => !blocked && onPick(p.id)}
                className={cn("flex min-h-[60px] w-full cursor-pointer items-center gap-3 px-3 py-2 text-left outline-none transition-colors duration-100 [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-[52px] sm:hover:bg-[#fafafb]", blocked && "cursor-default opacity-50")}
              >
                {single ? <Radio on={on} /> : <Tick on={on} />}
                <ProductThumb src={p.imageUrl} title={p.title} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5 text-[#1a1a2e] sm:text-[14px]">{p.title}</span>
                  <span className="block truncate text-[13px] leading-[18px] text-[#6b7280] sm:text-[12px]">
                    {p.payWhatYouWant ? tt("Pay what you want, from {amount}", { amount: money(p.priceCents) }) : money(p.priceCents)}
                    {!p.published ? tt(" · Draft") : ""}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {shown.length === 0 ? <li className="px-4 py-6 text-center text-[14px] text-[#6b7280]">{tt("No product matches that.")}</li> : null}
      </ul>
      </ThumbScroll>
    </div>
  )
}

/**
 * A QUANTITY BREAK'S TIERS, one row each, in the order a buyer climbs them:
 * how many they buy, how many come free, the discount on what they pay
 * for, and the words the product page shows (blank: the tier's own, "Buy 2
 * get 1 free"). Each tier is checked in place; the server checks them all
 * again (lib/offers/pricing.ts readTiers).
 */
export function TierEditor({ tiers, onChange, problems, problem, sign, money, currency }: { tiers: TierDraft[]; onChange: (t: TierDraft[]) => void; problems: Record<number, string>; problem: string | null; sign: string; money: (minor: number) => string; currency: string }) {
  const setTier = (i: number, patch: Partial<TierDraft>) => onChange(tiers.map((t, n) => (n === i ? { ...t, ...patch } : t)))
  /* The next tier starts one unit past the last one's whole block (paid and free), so it is always bigger. */
  const add = () => {
    const last = tiers[tiers.length - 1]
    const q = last ? (Math.max(1, Math.floor(Number(last.quantity)) || 1) + Math.max(0, Math.floor(Number(last.freeQuantity)) || 0)) + 1 : 2
    onChange([...tiers, { quantity: String(Math.min(99, q)), freeQuantity: "0", discountType: "percent", value: last?.discountType === "percent" ? String(Math.min(90, (Number(last.value) || 10) + 5)) : "15", label: "", badge: "" }])
  }
  const SMALL = cn(FIELD, "tabular-nums")
  return (
    <section aria-labelledby="offer-tiers" className="space-y-2.5" {...(problem || Object.keys(problems).length ? { "data-problem": "" } : {})}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="offer-tiers" className="text-[14px] font-semibold leading-5 text-[#1a1a2e] max-sm:text-[15px]">
          {tt("Tiers")}
        </h3>
        <span className={HINT}>{tt("{n} of {max}", { n: tiers.length, max: MAX_TIERS })}</span>
      </div>
      <ol className="divide-y divide-[#eef0f2] overflow-hidden rounded-xl border border-[#e5e7eb]" data-tiers="">
        {tiers.map((t, i) => {
          const read = tierOf(t, currency)
          const own = tierWords({ ...read, discountValue: Number.isFinite(read.discountValue) ? read.discountValue : 0 }, money)
          return (
            <li key={i} data-tier={i} className="space-y-2.5 px-3.5 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-[#4b5563]">{tt("Tier {n}", { n: i + 1 })}</span>
                {tiers.length > 1 ? (
                  <button type="button" data-tier-remove={i} onClick={() => onChange(tiers.filter((_, n) => n !== i))} className="-my-1.5 h-9 cursor-pointer rounded-lg px-2 text-[13px] text-[#6b7280] outline-none hover:bg-[#f4f5f7] hover:text-[#1a1a2e] focus-visible:bg-[#f4f5f7] sm:h-7">
                    {tt("Remove")}
                  </button>
                ) : null}
              </div>
              {/* Round 58: "Buy 2, get 1 free" as a sentence with its two numbers in it, then the discount as the app's own choice, never the platform's select. */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[15px] text-[#1a1a2e] sm:text-[14px]">
                <span>{tt("Buy")}</span>
                <input inputMode="numeric" aria-label={tt("Tier {n}: how many they buy", { n: i + 1 })} data-tier-quantity={i} value={t.quantity} onChange={(e) => setTier(i, { quantity: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!problems[i]} className={cn(SMALL, "w-[64px] text-center", problems[i] && BAD)} />
                <span>{tt("get")}</span>
                <input inputMode="numeric" aria-label={tt("Tier {n}: how many come free", { n: i + 1 })} data-tier-free={i} value={t.freeQuantity} onChange={(e) => setTier(i, { freeQuantity: e.target.value.replace(/[^0-9]/g, "").slice(0, 2) })} aria-invalid={!!problems[i]} className={cn(SMALL, "w-[64px] text-center", problems[i] && BAD)} />
                <span>{tt("free")}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="min-w-[240px] flex-1">
                  <ChoiceGrid
                    label={tt("Tier {n}: discount on what they pay for", { n: i + 1 })}
                    value={t.discountType}
                    onChange={(discountType) => setTier(i, { discountType, value: discountType === "percent" ? "10" : "" })}
                    options={[
                      { value: "none" as TierDiscountType, label: tt("No discount") },
                      { value: "percent" as TierDiscountType, label: tt("% off") },
                      { value: "amount" as TierDiscountType, label: tt("Amount off") },
                    ]}
                  />
                </div>
                {t.discountType === "none" ? null : (
                  <label className="relative block w-[120px]">
                    <span className="sr-only">{t.discountType === "percent" ? tt("Percent") : tt("Amount")}</span>
                    {t.discountType === "amount" ? <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">{sign}</span> : null}
                    <input inputMode={t.discountType === "percent" ? "numeric" : "decimal"} data-tier-value={i} value={t.value} onChange={(e) => setTier(i, { value: t.discountType === "percent" ? e.target.value.replace(/[^0-9]/g, "").slice(0, 2) : e.target.value.replace(/[^0-9.,]/g, "").slice(0, 12) })} aria-invalid={!!problems[i]} className={cn(SMALL, t.discountType === "amount" && (sign.length > 1 ? "pl-12" : "pl-8"), t.discountType === "percent" && "pr-8", problems[i] && BAD)} />
                    {t.discountType === "percent" ? <span aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#6b7280]">%</span> : null}
                  </label>
                )}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_160px]">
                <label className="block min-w-0">
                  <span className={LABEL}>{tt("Label")}</span>
                  <input value={t.label} maxLength={MAX_TIER_LABEL} placeholder={own} onChange={(e) => setTier(i, { label: e.target.value })} className={FIELD} />
                </label>
                <label className="block min-w-0">
                  <span className={LABEL}>
                    {tt("Badge")} <span className="font-normal text-[#9ca3af]">{tt("optional")}</span>
                  </span>
                  <input value={t.badge} maxLength={MAX_TIER_BADGE} placeholder={tt("Most popular")} onChange={(e) => setTier(i, { badge: e.target.value })} className={FIELD} />
                </label>
              </div>
              {problems[i] ? <p className={cn(ERR, "mt-0")}>{problems[i]}</p> : null}
            </li>
          )
        })}
      </ol>
      {tiers.length < MAX_TIERS ? (
        <button type="button" data-tier-add="" onClick={add} className={cn(secondaryDepth, "h-11 w-full rounded-xl text-[15px] sm:h-8 sm:w-auto sm:rounded-lg sm:px-3 sm:text-[13px]")}>
          {tt("Add tier")}
        </button>
      ) : null}
      {problem ? <p className={ERR}>{problem}</p> : null}
    </section>
  )
}

export function Radio({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border transition-colors duration-100 sm:h-[18px] sm:w-[18px]", on ? "border-[#111113] bg-[#111113]" : "border-[#c7cad1] bg-white")}>
      <span className={cn("h-[7px] w-[7px] rounded-full bg-white transition-[scale] duration-150 ease-out motion-reduce:transition-none", on ? "scale-100" : "scale-0")} />
    </span>
  )
}

/**
 * FOUR CHOICES ON A PHONE'S WIDTH. The discount's Percent, Amount, Free
 * shipping and None did not fit one track at 390px: each was cut to "Perc…".
 * Two rows of two there, one track from 640px, drawn as the app's segmented
 * control is (app/app/products/new/editor-controls.tsx Segmented): the
 * chosen one lifted onto white. A radio group, so the arrow keys move it.
 *
 * THE WHITE SLIDES, as the segmented control's does: one piece under the
 * labels, moved from the old choice to the new one in 200ms on iOS's curve,
 * across and down the two rows alike, by translate alone. At rest it is
 * never scaled.
 */
export function ChoiceGrid<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  const trackRef = React.useRef<HTMLDivElement>(null)
  const thumbRef = React.useRef<HTMLSpanElement>(null)
  const at = React.useRef<{ x: number; y: number; w: number; h: number } | null>(null)
  const place = React.useCallback(
    (animate: boolean) => {
      const track = trackRef.current
      const thumb = thumbRef.current
      if (!track || !thumb) return
      const button = track.querySelector<HTMLElement>(`[data-value="${CSS.escape(value)}"]`)
      if (!button) return
      const next = { x: button.offsetLeft, y: button.offsetTop, w: button.offsetWidth, h: button.offsetHeight }
      let prev = at.current
      const sliding = typeof thumb.getAnimations === "function" ? thumb.getAnimations() : []
      if (sliding.length && prev) {
        const m = new DOMMatrixReadOnly(getComputedStyle(thumb).transform)
        prev = { x: m.e, y: m.f, w: thumb.offsetWidth * m.a, h: thumb.offsetHeight * m.d }
        for (const a of sliding) a.cancel()
      }
      at.current = next
      thumb.style.width = `${next.w}px`
      thumb.style.height = `${next.h}px`
      thumb.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
      track.setAttribute("data-ready", "")
      if (!animate || !prev || (prev.x === next.x && prev.y === next.y && prev.w === next.w) || reducedMotion() || typeof thumb.animate !== "function") return
      thumb.animate(
        [{ transform: `translate3d(${prev.x}px, ${prev.y}px, 0) scale(${prev.w / next.w}, ${prev.h / next.h})` }, { transform: `translate3d(${next.x}px, ${next.y}px, 0) scale(1, 1)` }],
        { duration: SLIDE_MS, easing: EASE },
      )
    },
    [value],
  )
  const placed = React.useRef(false)
  React.useLayoutEffect(() => {
    place(placed.current)
    placed.current = true
  }, [place])
  const placeRef = React.useRef(place)
  React.useEffect(() => {
    placeRef.current = place
  }, [place])
  /* Two rows become one track at 640px: the white follows without a slide. */
  React.useEffect(() => {
    const track = trackRef.current
    if (!track || typeof ResizeObserver === "undefined") return
    let first = true
    const ro = new ResizeObserver(() => {
      if (first) return void (first = false)
      placeRef.current(false)
    })
    ro.observe(track)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      data-choice-grid=""
      className={cn(
        "relative grid gap-0.5 rounded-[10px] bg-[#eceef1] p-0.5 sm:flex",
        options.length > 3 ? "grid-cols-2" : "grid-flow-col",
        /* Before the white is placed (the server's frame), the chosen one draws its own. */
        "[&:not([data-ready])>[aria-checked=true]]:bg-white [&:not([data-ready])>[aria-checked=true]]:shadow-[0_1px_2px_rgba(17,24,39,0.12)]",
      )}
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        const forward = e.key === "ArrowRight" || e.key === "ArrowDown"
        const next = options[(i + (forward ? 1 : options.length - 1)) % options.length]
        onChange(next.value)
        ;(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
      }}
    >
      <span
        ref={thumbRef}
        aria-hidden
        data-choice-thumb=""
        className="pointer-events-none absolute left-0 top-0 h-0 w-0 origin-top-left rounded-lg bg-white opacity-0 shadow-[0_1px_2px_rgba(17,24,39,0.12),0_0_0_0.5px_rgba(17,24,39,0.06)] sm:rounded-md [[data-ready]>&]:opacity-100"
      />
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!on) onChange(o.value)
            }}
            className={cn(
              "relative h-11 min-w-0 flex-1 basis-0 cursor-pointer truncate rounded-lg px-3 text-[15px] font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:h-8 sm:rounded-md sm:text-[13px] [-webkit-tap-highlight-color:transparent]",
              on ? "text-[#1a1a2e]" : "text-[#4b5563] hover:text-[#1a1a2e]",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A FEW CHOICES WHOSE NAMES ARE LONG, one under another with a round mark:
 * "Anything", "Certain products", "A collection" were cut to "Anythi…" side
 * by side at 390px. Rows of 44px on a phone, 36px from 640px, no box around
 * them, so the picker that follows a choice is the only box. A radio group,
 * so the arrow keys move it.
 */
export function RadioRows<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-radio-rows=""
      className="-my-1 flex flex-col"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return
        e.preventDefault()
        const i = options.findIndex((o) => o.value === value)
        const forward = e.key === "ArrowRight" || e.key === "ArrowDown"
        const next = options[(i + (forward ? 1 : options.length - 1)) % options.length]
        onChange(next.value)
        ;(e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus()
      }}
    >
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            data-value={o.value}
            tabIndex={on ? 0 : -1}
            onClick={() => {
              if (!on) onChange(o.value)
            }}
            className="group -mx-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-left text-[15px] text-[#1a1a2e] outline-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-[#f4f5f7] active:bg-[#f4f5f7] sm:min-h-9 sm:text-[14px] sm:hover:bg-[#fafafb]"
          >
            <Radio on={on} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/* ─── What kind of offer ──────────────────────────────────────────────── */

type KindValue = "quantity_break" | "bundle" | "checkout"

/** A grey block in a kind's small drawing: a product's picture, a line of words, a price. */
const Block = ({ className }: { className: string }) => <span aria-hidden className={cn("block shrink-0 rounded-[4px] bg-[#dfe2e6]", className)} />

/**
 * EACH KIND, DRAWN SMALL. Not a picture of a real offer (the Preview on the
 * right is that, once products are picked): the shape a buyer will meet,
 * so the three can be told apart before a word is read. Tiers stacked with
 * one marked; two products and a plus; a cart line and one more to add.
 */
export function KindDrawing({ kind, on }: { kind: KindValue; on: boolean }) {
  const ink = on ? "bg-[#1a1a2e]" : "bg-[#9ca3af]"
  if (kind === "quantity_break")
    return (
      <span aria-hidden className="mx-auto flex w-full max-w-[132px] flex-col gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn("flex h-[14px] items-center gap-1.5 rounded-[5px] border bg-white px-1.5", i === 1 ? (on ? "border-[#1a1a2e]" : "border-[#9ca3af]") : "border-[#e3e5e8]")}>
            <Block className={cn("h-[4px]", i === 0 ? "w-5" : i === 1 ? "w-8" : "w-7")} />
            {i === 1 ? <span className={cn("ml-auto h-[6px] w-3 rounded-full", ink)} /> : <Block className="ml-auto h-[4px] w-3" />}
          </span>
        ))}
      </span>
    )
  if (kind === "bundle")
    return (
      <span aria-hidden className="mx-auto flex w-full max-w-[132px] flex-col gap-1.5">
        <span className="flex items-center justify-center gap-1">
          <Block className="h-[22px] w-[22px]" />
          <span className="text-[11px] font-semibold leading-none text-[#9ca3af]">+</span>
          <Block className="h-[22px] w-[22px]" />
        </span>
        <span className={cn("block h-[9px] w-full rounded-[4px]", ink)} />
      </span>
    )
  return (
    <span aria-hidden className="mx-auto flex w-full max-w-[132px] flex-col gap-1">
      <span className="flex h-[16px] items-center gap-1.5">
        <Block className="h-[14px] w-[14px]" />
        <Block className="h-[4px] w-10" />
      </span>
      <span className="flex h-[18px] items-center gap-1.5 rounded-[5px] border border-dashed border-[#c7cad1] bg-white px-1">
        <Block className="h-[12px] w-[12px]" />
        <Block className="h-[4px] w-6" />
        <span className={cn("ml-auto h-[8px] w-4 rounded-[3px]", ink)} />
      </span>
    </span>
  )
}
