"use client"

/**
 * ===========================================================================
 *  THE PRODUCT SECTION'S BLOCKS
 * ===========================================================================
 * One component per block type the main product section offers
 * (themes/default/sections/product.json). The section owns what the blocks
 * share (which variant is chosen, how many, the amount a buyer named) and
 * hands it to each as `ctx`; a block draws its part and reads its own
 * settings, and nothing else.
 *
 * A block with nothing to show on this product (a variant picker on a
 * product without variants, the amount box on one with a price) draws
 * nothing on the live page, and one quiet line in the builder so the creator
 * can still find it and click it.
 *
 * MARKUP INJECTED HERE, and why each is safe:
 *   the description       cleaned against the rich text allow list on the
 *                         server (lib/products/product-section-data.ts), and
 *                         again here when the builder only had the raw text
 *   a collapsible tab     its `content`, a richtext setting, cleaned on save
 *                         and on every read (lib/website-builder/sanitize.ts)
 *   custom code           its `html_content`, an html setting, cleaned the
 *                         same way: scripts and handlers never survive
 */

import { useMemo, useState, type CSSProperties, type JSX, type ReactNode } from "react"
import { ChevronDown, Facebook, FileText, Heart, Link2, Mail, Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BlockInstance } from "@/lib/website-builder/types"
import { schemeTokenName } from "@/lib/storelib-theme/color-schemes"
import { cleanStoredHtml, looksLikeHtml, plainTextToHtml } from "@/lib/rich-text/html"
import { breadcrumbTrail } from "@/lib/products/breadcrumbs"
import {
  DEFAULT_LOW_STOCK_TEXT,
  isColorOption,
  isNew,
  lowStock,
  lowStockThreshold,
  pickerOptions,
  stockLeft,
  suggestedAmounts,
  swatchColor,
  valueAvailable,
  valueOf,
  type PriceFacts,
  type ProductSectionData,
  type ProductVariantData,
} from "@/lib/products/product-page-model"
import { deliveryLine, pickupLine } from "@/lib/physical/delivery-lines"
import { DynamicIcon, type SectionPalette } from "../../_shared"
import { useStorefront, useWord } from "../../../theme/storefront-context"

/* ── What every block is handed ───────────────────────────────────────────── */

export interface ProductCtx {
  product: ProductSectionData
  /** True when `product` is the builder's stand-in, not a real product. */
  sample: boolean
  variant: ProductVariantData | null
  chosen: (string | null)[]
  choose: (i: number, value: string) => void
  facts: PriceFacts
  canBuy: boolean
  quantity: number
  setQuantity: (n: number) => void
  maxQuantity: number
  pwywInput: string
  setPwywInput: (v: string) => void
  pwywError: string | null
  palette: SectionPalette
  /** The builder is drawing: show a hint where a block has nothing to draw. */
  inEditor: boolean
  /** Buttons that send somewhere are inert: the inspector is on. */
  inert: boolean
  /** `owned`: the visitor signed in to this website already owns it (lib/site-accounts/owned-products): where their downloads are. */
  buy: { add: () => void; now: () => void; added: boolean; unavailable: string | null; owned?: string | null }
  wishlist: { saved: boolean; toggle: () => void }
  radius: string
  buttonRadius: CSSProperties
  /** A price as the shop prints it, with the currency code when the theme shows codes. */
  money: (cents: number) => string
}

type S = Record<string, unknown>

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d)
const num = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : d)
const on = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d)

/** A block colour: its own when the creator picked one, else the scheme's colour it names or follows. */
export function colorOf(value: unknown, palette: SectionPalette, fallback: keyof SectionPalette | string): string {
  const p = palette as unknown as Record<string, string>
  if (typeof value === "string" && value.trim()) {
    const token = schemeTokenName(value)
    if (token) return p[token] ?? p[fallback as string] ?? ""
    if (!value.trim().startsWith("scheme.")) return value.trim()
  }
  return p[fallback as string] ?? ""
}

/** Left, centre or right, from a plain value or a per-breakpoint one. */
function alignOf(v: unknown): "left" | "center" | "right" {
  const raw = v && typeof v === "object" ? (v as { desktop?: unknown }).desktop : v
  return raw === "center" || raw === "right" ? raw : "left"
}

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const

/** A quiet line in the builder where a block has nothing to show on this product. */
function EditorNote({ ctx, children }: { ctx: ProductCtx; children: ReactNode }) {
  if (!ctx.inEditor) return null
  return (
    /* One quiet line, never a box: a product page with five blocks that do not apply here read as five empty boxes. */
    <p className="flex items-center gap-1.5 text-[12px] italic leading-5" style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph, opacity: 0.55 }} data-editor-note="">
      <span aria-hidden className="h-1 w-1 shrink-0 rounded-full" style={{ background: "currentColor" }} />
      {children}
    </p>
  )
}

/* ── The blocks ───────────────────────────────────────────────────────────── */

function Breadcrumbs({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const trail = breadcrumbTrail({ template: "product", product: { title: ctx.product.title }, shopLabel: str(s.shop_label, "Shop") })
  const sep = { slash: "/", chevron: "›", dot: "·" }[str(s.separator, "slash")] ?? "/"
  const color = colorOf(s.color, ctx.palette, "text_muted")
  return (
    <nav aria-label="Breadcrumb" style={{ fontSize: num(s.size, 13), color, textAlign: alignOf(s.align) }} data-breadcrumbs="">
      <ol className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((c, i) => (
          <li key={i} className="inline-flex items-center gap-2">
            {c.url ? <a href={c.url} className="hover:underline underline-offset-4">{c.label}</a> : <span aria-current="page" style={{ color: ctx.palette.heading }}>{c.label}</span>}
            {i < trail.length - 1 ? <span aria-hidden className="opacity-60">{sep}</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Badges({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const { facts } = ctx
  const out: string[] = []
  const sale = facts.compareAtCents !== null && facts.compareAtCents > facts.priceCents
  if (on(s.show_sale, true) && sale) {
    const pct = Math.round(((facts.compareAtCents! - facts.priceCents) / facts.compareAtCents!) * 100)
    out.push(on(s.sale_percent, false) && pct > 0 ? `${pct}% off` : str(s.sale_label, "Sale"))
  }
  if (on(s.show_new, false) && isNew(ctx.product.created_at, num(s.new_days, 30))) out.push(str(s.new_label, "New"))
  if (on(s.show_sold_out, true) && !ctx.canBuy && !ctx.sample) out.push(str(s.sold_out_label, "Sold out"))
  if (out.length === 0) return <EditorNote ctx={ctx}>Badges show on a sale, a new product or a sold out one</EditorNote>
  const bg = colorOf(s.background, ctx.palette, "heading")
  const fg = colorOf(s.text_color, ctx.palette, "background")
  return (
    <div className="flex flex-wrap gap-2" style={{ justifyContent: JUSTIFY[alignOf(s.align)] }} data-product-badges="">
      {out.map((label) => (
        <span key={label} className="inline-block px-2.5 py-1 text-[12px] font-semibold leading-none" style={{ background: bg, color: fg, borderRadius: str(s.shape, "pill") === "square" ? 4 : 999 }}>
          {label}
        </span>
      ))}
    </div>
  )
}

function Title({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const Tag = str(s.tag, "h1") === "h2" ? "h2" : "h1"
  const size = num(s.size, 32)
  return (
    <Tag
      className="m-0 leading-[1.15] tracking-[-0.01em]"
      style={{
        fontSize: `clamp(${Math.max(18, Math.round(size * 0.72))}px, 5cqi, ${size}px)`,
        fontWeight: Number(str(s.weight, "700")) || 700,
        color: colorOf(s.color, ctx.palette, "heading"),
        textAlign: alignOf(s.align),
        fontFamily: "var(--theme-font-heading, inherit)",
      }}
    >
      {ctx.product.title}
    </Tag>
  )
}

/**
 * STAR RATING: the product's Storelib Reviews rating under its name, the way
 * a reviews app's badge sits on a Shopify product page, linking down to the
 * Product reviews section (#reviews). From `rating`, which the page fills
 * only while the app is on and the product has published reviews on this
 * website (lib/reviews/storefront.ts productRating). Without one it draws
 * nothing on the live page: no row of grey stars on a product nobody has
 * reviewed yet.
 */
function Rating({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const r = ctx.product.rating
  if (!r || !(r.count > 0)) return <EditorNote ctx={ctx}>Stars show here once this product has a published review in Storelib Reviews</EditorNote>
  const size = num(s.size, 16)
  const muted = ctx.palette.text_muted ?? ctx.palette.paragraph
  const star = colorOf(s.star_color, ctx.palette, "") || r.star_color
  const stars = "★★★★★"
  return (
    <div className="flex" style={{ justifyContent: JUSTIFY[alignOf(s.align)] }} data-product-rating="">
      <a href="#reviews" className="inline-flex items-center gap-2 no-underline hover:underline underline-offset-4" style={{ color: muted, fontSize: Math.max(12, Math.round(size * 0.85)) }}>
        <span role="img" aria-label={`${r.average_label} out of 5 stars`} className="relative inline-block leading-none" style={{ fontSize: size, letterSpacing: 2, color: `color-mix(in srgb, ${ctx.palette.paragraph} 22%, transparent)` }}>
          {stars}
          <span aria-hidden className="absolute inset-y-0 left-0 overflow-hidden whitespace-nowrap" style={{ width: `${r.percent}%`, color: star }}>
            {stars}
          </span>
        </span>
        {on(s.show_average, true) ? <span className="font-semibold tabular-nums" style={{ color: ctx.palette.heading }}>{r.average_label}</span> : null}
        {on(s.show_count, true) ? <span>({r.count_label})</span> : null}
      </a>
    </div>
  )
}

function Price({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const { facts } = ctx
  const size = num(s.size, 24)
  const color = colorOf(s.color, ctx.palette, "heading")
  const sale = on(s.show_compare, true) && facts.compareAtCents !== null && facts.compareAtCents > facts.priceCents
  const pct = sale ? Math.round(((facts.compareAtCents! - facts.priceCents) / facts.compareAtCents!) * 100) : 0
  let main: string
  if (facts.payWhatYouWant) main = facts.minCents > 0 ? `${str(s.pwyw_prefix, "From")} ${ctx.money(facts.minCents)}`.trim() : "Pay what you want"
  else main = facts.priceCents === 0 ? str(s.free_label, "Free") : ctx.money(facts.priceCents)
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" style={{ justifyContent: JUSTIFY[alignOf(s.align)] }} data-product-price="">
      <span className="font-semibold tabular-nums" style={{ fontSize: size, color }}>{main}</span>
      {sale ? (
        <>
          <s className="tabular-nums" style={{ fontSize: Math.max(12, Math.round(size * 0.66)), color: ctx.palette.text_muted ?? ctx.palette.paragraph }}>{ctx.money(facts.compareAtCents!)}</s>
          {on(s.show_saving, true) && pct > 0 ? <span className="text-[13px] font-semibold" style={{ color: colorOf(s.sale_color, ctx.palette, "accent") }}>Save {pct}%</span> : null}
        </>
      ) : null}
    </div>
  )
}

const PICK_SIZE = { small: 34, medium: 42, large: 50 } as const

function VariantPicker({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const p = ctx.product
  const options = pickerOptions(p, str(s.fallback_name, "Option") || "Option")
  if (options.length === 0) return <EditorNote ctx={ctx}>This product has no variants</EditorNote>
  const style = str(s.style, "pills")
  const h = PICK_SIZE[str(s.size, "medium") as keyof typeof PICK_SIZE] ?? 42
  const ink = ctx.palette.heading
  const selBg = colorOf(s.selected_bg, ctx.palette, "heading")
  const selFg = colorOf(s.selected_text, ctx.palette, "background")
  const line = colorOf(s.border, ctx.palette, "border")
  const square = str(s.swatch_shape, "circle") === "square"

  /* A value's picture, for a colour without a colour name: the first variant with it that has one. */
  const pictureOf = (i: number, value: string) => (p.variants ?? []).find((v) => valueOf(p, v, i) === value && v.image_url)?.image_url ?? null

  return (
    <div className="flex flex-col gap-5" data-variant-picker="">
      {options.map((o, i) => {
        const current = ctx.chosen[i] ?? null
        const swatches = on(s.swatches, true) && isColorOption(o.name) && o.values.some((v) => swatchColor(v) || pictureOf(i, v))
        const legend = (
          <legend className="mb-2 text-[14px] font-medium" style={{ color: ink }}>
            {o.name}
            {on(s.show_value, true) && current ? <span style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph, fontWeight: 400 }}>: {current}</span> : null}
          </legend>
        )
        if (swatches) {
          return (
            <fieldset key={o.name} className="m-0 border-0 p-0">
              {legend}
              <div className="flex flex-wrap gap-2.5">
                {o.values.map((value) => {
                  const chosen = current === value
                  const open = valueAvailable(p, ctx.chosen, i, value)
                  const color = swatchColor(value)
                  const pic = color ? null : pictureOf(i, value)
                  return (
                    <button
                      key={value}
                      type="button"
                      aria-label={open ? value : `${value}, sold out`}
                      aria-pressed={chosen}
                      title={value}
                      onClick={(e) => { e.stopPropagation(); ctx.choose(i, value) }}
                      className={cn("relative shrink-0 overflow-hidden p-[3px] transition-shadow", !open && "opacity-45")}
                      style={{ width: h - 4, height: h - 4, borderRadius: square ? 6 : 999, boxShadow: chosen ? `0 0 0 2px ${selBg}` : `0 0 0 1px ${line}` }}
                      data-swatch={value}
                    >
                      <span
                        className="block h-full w-full"
                        style={{
                          borderRadius: square ? 4 : 999,
                          background: color ?? (pic ? `center / cover no-repeat url("${pic.replace(/"/g, "%22")}")` : ctx.palette.border),
                          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)",
                        }}
                      />
                      {!open ? <span aria-hidden className="absolute left-1/2 top-1/2 h-[1.5px] w-full -translate-x-1/2 -translate-y-1/2 -rotate-45" style={{ background: ink }} /> : null}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )
        }
        if (style === "dropdown") {
          return (
            <fieldset key={o.name} className="m-0 border-0 p-0">
              {legend}
              <div className="relative">
                <select
                  value={current ?? ""}
                  onChange={(e) => ctx.choose(i, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={o.name}
                  className="w-full appearance-none border bg-transparent px-3.5 pr-10 text-[15px]"
                  style={{ height: h + 4, borderColor: line, color: ink, borderRadius: `var(--theme-input-radius, ${ctx.radius})` }}
                >
                  {o.values.map((value) => (
                    <option key={value} value={value}>
                      {value}
                      {valueAvailable(p, ctx.chosen, i, value) ? "" : " (sold out)"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ink }} aria-hidden />
              </div>
            </fieldset>
          )
        }
        return (
          <fieldset key={o.name} className="m-0 border-0 p-0">
            {legend}
            <div className="flex flex-wrap gap-2">
              {o.values.map((value) => {
                const chosen = current === value
                const open = valueAvailable(p, ctx.chosen, i, value)
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={chosen}
                    onClick={(e) => { e.stopPropagation(); ctx.choose(i, value) }}
                    className={cn("border px-4 text-[14px] font-medium transition-colors", !open && "line-through opacity-50")}
                    /* Theme settings › Variant pills: its radius and border once set (lib/website-builder/theme-css.ts), this section's until then. */
                    data-variant-pill=""
                    style={{
                      minHeight: h,
                      borderRadius: `var(--theme-pill-radius, ${ctx.radius})`,
                      borderWidth: "var(--theme-pill-border-width, 1px)",
                      borderColor: chosen ? selBg : line,
                      background: chosen ? selBg : "transparent",
                      color: chosen ? selFg : ink,
                    }}
                  >
                    {value}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}
    </div>
  )
}

function PayWhatYouWant({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const { facts } = ctx
  if (!facts.payWhatYouWant) return <EditorNote ctx={ctx}>Shows on a product priced pay what you want</EditorNote>
  const amounts = suggestedAmounts(str(s.amounts), facts.minCents, facts.suggestedCents)
  const accent = colorOf(s.accent, ctx.palette, "heading")
  const ink = ctx.palette.heading
  const typedCents = Math.round(parseFloat(ctx.pwywInput.replace(/[$,\s]/g, "")) * 100)
  return (
    <div className="space-y-2.5" data-pwyw="">
      <label htmlFor="pwyw-amount" className="block text-[14px] font-medium" style={{ color: ink }}>
        {str(s.label, "Name your price")}
      </label>
      {amounts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {amounts.map((c) => {
            const chosen = typedCents === c
            return (
              <button
                key={c}
                type="button"
                aria-pressed={chosen}
                onClick={(e) => { e.stopPropagation(); ctx.setPwywInput((c / 100).toFixed(c % 100 ? 2 : 0)) }}
                className="h-10 border px-4 text-[14px] font-medium tabular-nums"
                style={{ borderRadius: `var(--theme-pill-radius, ${ctx.radius})`, borderColor: chosen ? accent : ctx.palette.border, background: chosen ? accent : "transparent", color: chosen ? ctx.palette.background : ink }}
              >
                {ctx.money(c)}
              </button>
            )
          })}
        </div>
      ) : null}
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px]" style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph }} aria-hidden>$</span>
        <input
          id="pwyw-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder={(Math.max(facts.minCents, facts.suggestedCents ?? 0) / 100).toFixed(facts.minCents % 100 || (facts.suggestedCents ?? 0) % 100 ? 2 : 0)}
          value={ctx.pwywInput}
          onChange={(e) => ctx.setPwywInput(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-invalid={ctx.pwywError ? true : undefined}
          aria-describedby="pwyw-help"
          className="h-12 w-full border bg-transparent pl-8 pr-3.5 text-[16px] tabular-nums outline-none"
          style={{ borderRadius: `var(--theme-input-radius, ${ctx.radius})`, borderColor: ctx.pwywError ? "#dc2626" : ctx.palette.border, color: ink }}
        />
      </div>
      <p id="pwyw-help" className="text-[13px]" style={{ color: ctx.pwywError ? "#dc2626" : ctx.palette.text_muted ?? ctx.palette.paragraph }}>
        {ctx.pwywError ?? (on(s.show_minimum, true) ? (facts.minCents > 0 ? `${ctx.money(facts.minCents)} or more` : "Any amount, including nothing") : "")}
      </p>
    </div>
  )
}

function Quantity({ s, ctx }: { s: S; ctx: ProductCtx }) {
  if (ctx.product.type !== "physical" && !ctx.sample) return <EditorNote ctx={ctx}>Only a product that ships has a quantity</EditorNote>
  const h = PICK_SIZE[str(s.size, "medium") as keyof typeof PICK_SIZE] ?? 42
  const ink = ctx.palette.heading
  const q = ctx.quantity
  return (
    <div className="flex items-center gap-3" data-quantity="">
      {str(s.label, "Quantity") ? <span className="text-[14px] font-medium" style={{ color: ink }}>{str(s.label, "Quantity")}</span> : null}
      <div className="inline-flex items-center border" style={{ borderColor: ctx.palette.border, borderRadius: `var(--theme-input-radius, ${ctx.radius})`, height: h }}>
        <button type="button" aria-label="Fewer" disabled={q <= 1} onClick={(e) => { e.stopPropagation(); ctx.setQuantity(q - 1) }} className="grid h-full place-items-center disabled:opacity-35" style={{ width: h, color: ink }}>
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="number"
          min={1}
          max={ctx.maxQuantity}
          value={q}
          aria-label={str(s.label, "Quantity") || "Quantity"}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => ctx.setQuantity(Number(e.target.value) || 1)}
          className="h-full w-10 bg-transparent text-center text-[15px] tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          style={{ color: ink }}
        />
        <button type="button" aria-label="More" disabled={q >= ctx.maxQuantity} onClick={(e) => { e.stopPropagation(); ctx.setQuantity(q + 1) }} className="grid h-full place-items-center disabled:opacity-35" style={{ width: h, color: ink }}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function BuyButtons({ s, ctx }: { s: S; ctx: ProductCtx }) {
  /* A label left as the English default is the shop's own word, in the page's language (lib/markets/ui-words.ts); one the store wrote is translated with its section. */
  const w = useWord()
  const label = (value: unknown, english: string, word: Parameters<typeof w>[0]) => {
    const own = str(value, english)
    return own.trim() === english ? w(word) : own
  }
  const { facts, buy } = ctx
  const free = !facts.payWhatYouWant && facts.priceCents === 0
  /* Nothing to collect on a free product, so no basket to put it in: one button straight to the download. */
  const showAdd = on(s.show_add, true) && !free
  const showBuy = on(s.show_buy, true) || !showAdd
  const h = num(s.height, 52)
  const fill = colorOf(s.fill, ctx.palette, "primary_button_background")
  const text = colorOf(s.text_color, ctx.palette, "primary_button_text")
  const outline = colorOf(s.outline, ctx.palette, "heading")
  const row = str(s.layout, "stacked") === "row"
  const soldOut = !ctx.canBuy && !buy.unavailable
  const disabled = ctx.inert || !ctx.canBuy || !!buy.unavailable
  /* In the editor the buttons do nothing but are drawn as a visitor sees them: faded only when a visitor would find them so. */
  const faded = !ctx.canBuy || !!buy.unavailable
  const blocked = buy.unavailable ?? (soldOut ? w("sold_out") : null)
  /* Already theirs: no second purchase, the way to the files instead (Gumroad's "View content"). */
  if (buy.owned) {
    return (
      <div className="flex flex-col gap-2.5" data-buy-buttons="" data-owned="">
        <p className="m-0 text-[14px] font-medium" style={{ color: outline }}>
          You already own this.
        </p>
        <a
          href={buy.owned}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full shrink-0 items-center justify-center px-5 text-[15px] font-semibold no-underline transition-opacity hover:opacity-90"
          style={{ height: h, minHeight: h, background: fill, color: text, border: `2px solid ${fill}`, ...ctx.buttonRadius }}
          data-owned-downloads=""
        >
          Go to your downloads
        </a>
      </div>
    )
  }
  return (
    <div className={cn("flex flex-col gap-2.5", row && "@[480px]:flex-row")} data-buy-buttons="">
      {showAdd ? (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); buy.add() }}
          className={cn("w-full shrink-0 border-2 px-5 text-[15px] font-semibold transition-opacity hover:opacity-85 disabled:cursor-not-allowed", faded && "opacity-50", row && "@[480px]:w-auto @[480px]:flex-1")}
          style={{ height: h, minHeight: h, borderColor: outline, color: outline, background: "transparent", ...ctx.buttonRadius }}
          data-add-to-cart=""
        >
          {blocked ?? (buy.added ? w("added_to_cart") : label(s.add_label, "Add to cart", "add_to_cart"))}
        </button>
      ) : null}
      {showBuy ? (
        <button
          type="button"
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); buy.now() }}
          className={cn("w-full shrink-0 px-5 text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed", faded && "opacity-50", row && "@[480px]:w-auto @[480px]:flex-1")}
          style={{ height: h, minHeight: h, background: fill, color: text, border: `2px solid ${fill}`, ...ctx.buttonRadius }}
          data-buy-now=""
        >
          {blocked ?? (free ? label(s.free_label, "Get it free", "get_it_free") : label(s.buy_label, "Buy now", "buy_now"))}
        </button>
      ) : null}
    </div>
  )
}

function LowStock({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const left = stockLeft(ctx.product, ctx.variant)
  const color = colorOf(s.color, ctx.palette, "accent")
  const dot = on(s.show_dot, true)
  /* Website settings › Commerce: whether stock is shown at all, and the site's own wording. */
  const commerce = useStorefront().commerce
  const line = (text: string) => (
    <p className="m-0 flex items-center gap-2 text-[14px] font-medium" style={{ color }} data-low-stock="">
      {dot ? <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} /> : null}
      {text}
    </p>
  )
  if (commerce?.showStockLeft === false) return <EditorNote ctx={ctx}>Stock is hidden in Website settings › Commerce</EditorNote>
  // 0 (the new default): the product's own low stock line, else the shop's (Settings › Locations).
  const threshold = lowStockThreshold(s.threshold, ctx.product.low_stock_at)
  const own = str(s.text)
  const text = own && own !== DEFAULT_LOW_STOCK_TEXT ? own : commerce?.lowStockText || DEFAULT_LOW_STOCK_TEXT
  if (lowStock(left, threshold)) return line(text.replace(/\{count\}/g, String(left)))
  if (str(s.in_stock_text) && ctx.canBuy && !ctx.sample) return line(str(s.in_stock_text))
  return <EditorNote ctx={ctx}>Shows when {threshold} or fewer are left</EditorNote>
}

/**
 * DELIVERY AND PICKUP: what it costs to have one delivered at home and how
 * long it takes, and where the chosen option can be picked up, from the
 * shop's own rates and locations (lib/physical/storefront-facts.ts). The
 * pickup line follows the variant picker: an option no pickup point holds
 * is not said to be there. Shopify draws pickup under its buy buttons;
 * here it is a block of its own, so it can be moved or taken out.
 */
function Delivery({ s, ctx }: { s: S; ctx: ProductCtx }) {
  if (ctx.product.type !== "physical" && !ctx.sample) return <EditorNote ctx={ctx}>Only a product that ships has delivery</EditorNote>
  const d = ctx.product.delivery ?? null
  const ink = colorOf(s.color, ctx.palette, "text")
  const muted = ctx.palette.text_muted ?? ctx.palette.paragraph
  const variantId = ctx.variant?.id ?? ctx.product.variants?.[0]?.id ?? null
  const ship = on(s.show_delivery, true) ? deliveryLine(d?.ship ?? null, ctx.money) : null
  const freeOver = on(s.show_delivery, true) && d?.ship && d.ship.priceCents > 0 && d.ship.freeFromCents ? `Free delivery on orders over ${ctx.money(d.ship.freeFromCents)}` : null
  const points = on(s.show_pickup, true) && variantId ? d?.pickup?.[variantId] : undefined
  const pickup = pickupLine(points)
  /* The shop takes it round itself near one of its locations (Settings › Locations, local delivery): the buy box's words. */
  const local = on(s.show_delivery, true) && d?.local === true ? "Local delivery available near the shop" : null
  if (!ship && !pickup && !local) {
    return <EditorNote ctx={ctx}>{ctx.sample ? "Delivery and pickup show here for a product that ships" : "Set up rates in Settings, Shipping and delivery, or pickup in Locations"}</EditorNote>
  }
  const row = (icon: string, text: string, sub: string | null, key: string) => (
    <div className="flex items-start gap-2.5" data-delivery-line={key}>
      <span className="mt-[1px] shrink-0" style={{ color: ink }}>
        <DynamicIcon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 text-[14px] leading-5" style={{ color: ink }}>
        {text}
        {sub ? <span className="block text-[13px]" style={{ color: muted }}>{sub}</span> : null}
      </span>
    </div>
  )
  return (
    <div className="flex flex-col gap-2.5" data-delivery="">
      {ship ? row("truck", ship, freeOver, "ship") : null}
      {local ? row("map-pin", local, null, "local") : null}
      {pickup ? row("store", pickup, points?.[0]?.ready ?? null, "pickup") : null}
    </div>
  )
}

/** The description as safe markup: the server's cleaned copy, or cleaned here from the raw text. */
function useDescriptionHtml(p: ProductSectionData): string {
  return useMemo(() => {
    if (typeof p.description_html === "string") return p.description_html
    const raw = p.description ?? ""
    return looksLikeHtml(raw) ? cleanStoredHtml(raw) : plainTextToHtml(raw)
  }, [p.description_html, p.description])
}

const PROSE = "[&_p]:my-0 [&_p+p]:mt-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:font-semibold [&_img]:my-3 [&_img]:max-w-full [&_img]:h-auto"

function Description({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const html = useDescriptionHtml(ctx.product)
  if (!html) return <EditorNote ctx={ctx}>The product&apos;s description goes here</EditorNote>
  return (
    <div
      className={cn("leading-relaxed", PROSE)}
      style={{ fontSize: num(s.size, 15), color: colorOf(s.color, ctx.palette, "text") }}
      data-product-description=""
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function CollapsibleTab({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const description = useDescriptionHtml(ctx.product)
  const html = on(s.use_description, false) ? description : str(s.content)
  const border = colorOf(s.border, ctx.palette, "border")
  return (
    <details className="group/tab border-b" style={{ borderColor: border }} open={on(s.open, false) || undefined} data-collapsible-tab="">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-[15px] font-medium [&::-webkit-details-marker]:hidden" style={{ color: ctx.palette.heading }} onClick={(e) => e.stopPropagation()}>
        {str(s.heading, "Details")}
        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/tab:rotate-180" aria-hidden />
      </summary>
      <div className={cn("pb-4 text-[14px] leading-relaxed", PROSE)} style={{ color: ctx.palette.text }} dangerouslySetInnerHTML={{ __html: html }} />
    </details>
  )
}

/* The product's own questions, from the editor's FAQ card: each answer folded under its question, as plain text. */
function ProductFaq({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const faqs = ctx.product.faqs ?? []
  if (!faqs.length) return <EditorNote ctx={ctx}>This product&apos;s questions show here, from the FAQ in the product editor</EditorNote>
  const border = colorOf(s.border, ctx.palette, "border")
  const heading = str(s.heading, "Questions").trim()
  return (
    <div data-product-faq="">
      {heading ? <p className="m-0 pb-1 text-[15px] font-semibold" style={{ color: ctx.palette.heading }}>{heading}</p> : null}
      {faqs.map((f, i) => (
        <details key={i} className="group/faq border-b" style={{ borderColor: border }} open={(on(s.open_first, false) && i === 0) || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-[14.5px] font-medium [&::-webkit-details-marker]:hidden" style={{ color: ctx.palette.heading }} onClick={(e) => e.stopPropagation()}>
            {f.question}
            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/faq:rotate-180" aria-hidden />
          </summary>
          <p className="m-0 whitespace-pre-line pb-4 text-[14px] leading-relaxed" style={{ color: ctx.palette.text }}>
            {f.answer}
          </p>
        </details>
      ))}
    </div>
  )
}

/* The custom fields the creator shows to buyers (Material, Care): a label and its value on each line, links as links. */
function ProductDetails({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const rows = ctx.product.details ?? []
  if (!rows.length) return <EditorNote ctx={ctx}>Custom fields set to show on the product page go here</EditorNote>
  const border = colorOf(s.border, ctx.palette, "border")
  const heading = str(s.heading, "Details").trim()
  return (
    <div data-product-details="">
      {heading ? <p className="m-0 pb-1 text-[15px] font-semibold" style={{ color: ctx.palette.heading }}>{heading}</p> : null}
      <dl className="m-0">
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-b py-2.5 text-[14px] leading-relaxed" style={{ borderColor: border }} data-detail={r.key}>
            <dt className="font-medium" style={{ color: ctx.palette.heading }}>{r.label}</dt>
            <dd className="m-0 whitespace-pre-line" style={{ color: ctx.palette.text }}>
              {r.type === "url" ? (
                <a href={ctx.inert ? undefined : r.value} target="_blank" rel="nofollow noopener noreferrer" className="break-all underline underline-offset-2">
                  {r.value.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                r.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Text({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const text = str(s.text)
  if (!text.trim()) return <EditorNote ctx={ctx}>Empty text</EditorNote>
  return (
    <p
      className="m-0 whitespace-pre-line"
      style={{
        fontSize: num(s.size, 14),
        fontWeight: Number(str(s.weight, "400")) || 400,
        textTransform: on(s.uppercase, false) ? "uppercase" : undefined,
        letterSpacing: on(s.uppercase, false) ? "0.06em" : undefined,
        color: colorOf(s.color, ctx.palette, "text"),
        textAlign: alignOf(s.align),
      }}
    >
      {text}
    </p>
  )
}

function IconWithText({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const size = num(s.icon_size, 20)
  return (
    <div className="flex items-start gap-3" data-icon-text="">
      {str(s.icon) ? (
        <span className="mt-0.5 shrink-0" style={{ color: colorOf(s.color, ctx.palette, "heading"), width: size, height: size }}>
          <DynamicIcon name={str(s.icon)} className="h-full w-full" />
        </span>
      ) : null}
      <div className="min-w-0">
        {str(s.heading) ? <p className="m-0 text-[14px] font-semibold" style={{ color: ctx.palette.heading }}>{str(s.heading)}</p> : null}
        {str(s.text) ? <p className="m-0 text-[13.5px]" style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph }}>{str(s.text)}</p> : null}
      </div>
    </div>
  )
}

function XMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function PinterestMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
    </svg>
  )
}

function Share({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const [copied, setCopied] = useState(false)
  const color = colorOf(s.color, ctx.palette, "text")
  const here = () => (typeof window !== "undefined" ? window.location.href.split("#")[0] : "")
  const title = ctx.product.title
  const go = (url: string) => {
    if (ctx.inert) return
    window.open(url, "_blank", "noopener,noreferrer")
  }
  const links: { key: string; label: string; icon: ReactNode; act: () => void }[] = []
  if (on(s.copy, true))
    links.push({
      key: "copy",
      label: copied ? "Link copied" : "Copy link",
      icon: <Link2 className="h-4 w-4" />,
      act: () => {
        if (ctx.inert) return
        void navigator.clipboard?.writeText(here()).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) }, () => {})
      },
    })
  if (on(s.x, true)) links.push({ key: "x", label: "Share on X", icon: <XMark />, act: () => go(`https://twitter.com/intent/tweet?url=${encodeURIComponent(here())}&text=${encodeURIComponent(title)}`) })
  if (on(s.facebook, true)) links.push({ key: "facebook", label: "Share on Facebook", icon: <Facebook className="h-4 w-4" />, act: () => go(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(here())}`) })
  if (on(s.pinterest, false))
    links.push({ key: "pinterest", label: "Pin on Pinterest", icon: <PinterestMark />, act: () => go(`https://pinterest.com/pin/create/button/?url=${encodeURIComponent(here())}&description=${encodeURIComponent(title)}`) })
  if (on(s.email, false)) links.push({ key: "email", label: "Share by email", icon: <Mail className="h-4 w-4" />, act: () => { if (!ctx.inert) window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(here())}` } })
  if (links.length === 0) return <EditorNote ctx={ctx}>Turn on a way to share</EditorNote>
  return (
    <div className="flex flex-wrap items-center gap-1.5" style={{ color }} data-share="">
      {str(s.label, "Share") ? <span className="mr-1.5 text-[14px] font-medium">{str(s.label, "Share")}</span> : null}
      {links.map((l) => (
        <button key={l.key} type="button" aria-label={l.label} title={l.label} onClick={(e) => { e.stopPropagation(); l.act() }} className="grid h-9 w-9 place-items-center rounded-full transition-opacity hover:opacity-70">
          {l.icon}
        </button>
      ))}
      <span className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>
    </div>
  )
}

function Wishlist({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const color = colorOf(s.color, ctx.palette, "text")
  const saved = ctx.wishlist.saved
  const label = saved ? str(s.saved_label, "Saved to wishlist") : str(s.label, "Add to wishlist")
  const button = str(s.style, "link") === "button"
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={(e) => { e.stopPropagation(); ctx.wishlist.toggle() }}
      className={cn("inline-flex items-center gap-2 text-[14px] font-medium transition-opacity hover:opacity-80", button && "h-11 w-full justify-center border px-4")}
      style={{ color, ...(button ? { borderColor: ctx.palette.border, ...ctx.buttonRadius } : {}) }}
      data-wishlist=""
    >
      <Heart className="h-4 w-4" fill={saved ? "currentColor" : "none"} aria-hidden />
      <span className={button ? "" : "underline underline-offset-4"}>{label}</span>
    </button>
  )
}

function Divider({ s, ctx }: { s: S; ctx: ProductCtx }) {
  return (
    <hr
      className="m-0 border-0"
      style={{ borderTop: `${num(s.thickness, 1)}px ${str(s.style, "solid")} ${colorOf(s.color, ctx.palette, "border")}`, width: `${num(s.width, 100)}%` }}
    />
  )
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function Files({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const [all, setAll] = useState(false)
  const files = ctx.product.files ?? []
  if (files.length === 0) return <EditorNote ctx={ctx}>Lists the files a download holds</EditorNote>
  const show = Math.max(1, num(s.show, 4))
  const shown = all ? files : files.slice(0, show)
  return (
    <div className="border p-4" style={{ borderColor: ctx.palette.border, borderRadius: `var(--theme-radius, ${ctx.radius})` }} data-files="">
      {str(s.heading) ? <p className="m-0 mb-2 text-[14px] font-semibold" style={{ color: ctx.palette.heading }}>{str(s.heading)}</p> : null}
      <ul className="m-0 list-none space-y-1.5 p-0">
        {shown.map((f, i) => (
          <li key={i} className="flex items-center gap-2 text-[14px]" style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph }}>
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {(f.file_name.split(".").pop() ?? "").toUpperCase() || "File"} ({fileSize(f.file_size)})
          </li>
        ))}
      </ul>
      {files.length > show ? (
        <button type="button" className="mt-2 text-[14px] font-medium underline underline-offset-4" style={{ color: ctx.palette.heading }} onClick={(e) => { e.stopPropagation(); setAll((v) => !v) }}>
          {all ? "Show less" : `Show all ${files.length}`}
        </button>
      ) : null}
    </div>
  )
}

function CustomCode({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const html = str(s.html_content)
  const prop = useMemo(() => ({ __html: html }), [html])
  if (!html.trim()) return <EditorNote ctx={ctx}>Add HTML and CSS in the block&apos;s settings</EditorNote>
  return <div data-custom-code="" dangerouslySetInnerHTML={prop} />
}

const BLOCKS: Record<string, (props: { s: S; ctx: ProductCtx }) => JSX.Element | null> = {
  breadcrumbs: Breadcrumbs,
  badges: Badges,
  title: Title,
  rating: Rating,
  price: Price,
  variant_picker: VariantPicker,
  pay_what_you_want: PayWhatYouWant,
  quantity: Quantity,
  buy_buttons: BuyButtons,
  low_stock: LowStock,
  delivery: Delivery,
  description: Description,
  collapsible_tab: CollapsibleTab,
  product_faq: ProductFaq,
  product_details: ProductDetails,
  text: Text,
  icon_with_text: IconWithText,
  share: Share,
  wishlist: Wishlist,
  divider: Divider,
  files: Files,
  custom_code: CustomCode,
}

/** One block, in its wrapper: the canvas selects it by `data-block-id`, and its spacing is its own. */
export function ProductBlock({ block, ctx }: { block: BlockInstance; ctx: ProductCtx }) {
  const Draw = BLOCKS[block.type]
  if (!Draw) return ctx.inEditor ? <div data-block-id={block.id}><EditorNote ctx={ctx}>A block this section no longer has</EditorNote></div> : null
  const s = block.settings ?? {}
  /* `empty:hidden`: a block with nothing to draw on this product takes no room, its spacing included. */
  return (
    <div className="empty:hidden" data-block-id={block.id} data-block-type={block.type} style={{ marginTop: num(s.margin_top, 0), marginBottom: num(s.margin_bottom, 16) }}>
      <Draw s={s} ctx={ctx} />
    </div>
  )
}
