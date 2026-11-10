"use client"

/**
 * THE LAYOUT TAB'S PICKERS FOR A BLOCK OF MANY (round AL): how the cards are
 * arranged, as pictures; a carousel's cards in view; how many to show. Kept
 * apart from block-settings so a block's own editor that also draws on the
 * live page (components/onepage/storelib-blocks) brings in no more than
 * these, and the same look serves a shelf, a group and a feed of posts.
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"
import { Segmented } from "@/components/onepage/editor-kit"
import { ChoiceMark } from "@/components/onepage/choice-marks"
import type { OnePageTheme } from "@/lib/onepage/types"

const heading = "text-[14px] font-semibold text-[#1a1a2e]"

/** The page's theme, for a picture of a layout drawn deep inside a block's own editor (given by components/onepage/tabs/links-tab BlockEditor). */
export const EditorThemeContext = React.createContext<Partial<OnePageTheme> | null>(null)

/* ── Layout: how a block of many is arranged ───────────────────────────── */

export type ArrangeKind = "list" | "grid" | "carousel" | "single"

/** What an arrangement's picture draws in each card: the block's own picture, name and line (a price), where it has them. */
export type ArrangeItem = { image?: string | null; title?: string | null; meta?: string | null }

/**
 * A few cards drawn as the page draws them, in the page's button colours.
 * Round AQ: with the block's own things in them, its products' pictures,
 * names and prices, a group's titles, a gallery's pictures. A grey stand-in
 * is drawn only where the block has nothing to show (no picture, no name).
 */
function ArrangeThumb({ kind, theme, items }: { kind: ArrangeKind; theme?: Partial<OnePageTheme> | null; items: ArrangeItem[] }) {
  const btn = theme?.button_color || "#1a1a2e"
  const ink = theme?.button_text_color || "#ffffff"
  const page = theme?.background_color || "#f7f7f8"
  const r = Math.max(2, Math.min(Number(theme?.button_border_radius ?? 8) * 0.35, 8))
  const item = (i: number): ArrangeItem => (items.length ? items[i % items.length] : {})
  const pic = (i: number, cls: string) => {
    const src = item(i).image
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt="" className={cn("block shrink-0 object-cover", cls)} style={{ borderRadius: Math.max(2, r - 1) }} draggable={false} />
    ) : (
      <span className={cn("block shrink-0", cls)} style={{ background: `color-mix(in srgb, ${ink} 26%, ${btn})`, borderRadius: Math.max(2, r - 1) }} />
    )
  }
  const line = (w: string, o = 0.85) => <span className="block h-[3px] shrink-0 rounded-full" style={{ width: w, background: ink, opacity: o }} />
  /* Real words, small, where the block has them; a bar of their colour where it does not. */
  const words = (text: string | null | undefined, w: string, o = 0.85, size = 7) =>
    text?.trim() ? (
      <span className="block min-w-0 max-w-full truncate font-semibold leading-none" style={{ fontSize: size, color: ink, opacity: o }}>
        {text.trim()}
      </span>
    ) : (
      line(w, o)
    )
  const card = (i: number, style?: React.CSSProperties) => (
    <span key={i} className="flex min-w-0 flex-col gap-[3px] p-[3px]" style={{ background: btn, borderRadius: r, ...style }}>
      {pic(i, "aspect-square w-full")}
      {words(item(i).title, "70%")}
      {item(i).title?.trim() && !item(i).meta?.trim() ? null : words(item(i).meta, "40%", 0.6, 6.5)}
    </span>
  )
  let body: React.ReactNode
  if (kind === "list") {
    body = (
      <span className="flex w-full flex-col gap-[5px]">
        {/* As many rows as the block has, up to three: two products are two rows, not a third repeating the first. */}
        {[0, 1, 2].slice(0, items.length ? Math.min(3, items.length) : 3).map((i) => (
          <span key={i} className="flex h-[17px] items-center gap-1.5 px-[3px]" style={{ background: btn, borderRadius: r }}>
            {pic(i, "h-[11px] w-[11px]")}
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              {words(item(i).title, "60%")}
              {item(i).title?.trim() && !item(i).meta?.trim() ? null : words(item(i).meta, "30%", 0.6, 6)}
            </span>
          </span>
        ))}
      </span>
    )
  } else if (kind === "single") {
    body = <span className="block w-[46%]">{pic(0, "aspect-[4/5] w-full")}</span>
  } else if (kind === "grid") {
    body = <span className="grid w-[78%] grid-cols-2 gap-[5px]">{[0, 1].map((i) => card(i))}</span>
  } else {
    body = (
      <span className="flex w-full gap-[5px] overflow-hidden">
        {[0, 1, 2].map((i) => card(i, { width: "44%", flexShrink: 0, opacity: i === 2 ? 0.6 : 1 }))}
      </span>
    )
  }
  return (
    <span aria-hidden className="flex h-full w-full items-center justify-center overflow-hidden rounded-xl px-[10%] text-left" style={{ background: page }}>
      {body}
    </span>
  )
}

/**
 * List, Grid or Carousel as pictures (round AL), one picker for a shelf of
 * products and a group: the owner wanted the choice drawn, as the link's
 * layouts are, not a row of words.
 */
export function ArrangePicker<T extends string>({
  value,
  options,
  theme,
  images,
  items,
  label,
  onChange,
}: {
  value: T
  options: { id: T; kind: ArrangeKind; label: string }[]
  theme?: Partial<OnePageTheme> | null
  /** Pictures alone (a gallery); `items` when the block has names and prices too. */
  images?: (string | null | undefined)[]
  items?: ArrangeItem[]
  label?: string
  onChange: (id: T) => void
}) {
  const pageTheme = React.useContext(EditorThemeContext)
  theme = theme ?? pageTheme
  const given: ArrangeItem[] = items ?? (images ?? []).map((image) => ({ image }))
  const things = given.filter((t) => t.image || t.title?.trim() || t.meta?.trim())
  return (
    <div className="space-y-2.5" data-arrange="">
      <p className={heading}>{label ?? tt("Arrange")}</p>
      <div className="grid grid-cols-3 gap-2.5">
        {options.map((o) => {
          const on = value === o.id
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              data-arrange-choice={o.id}
              onClick={() => onChange(o.id)}
              className="relative flex cursor-pointer flex-col items-stretch rounded-2xl border border-[#e3e4e8] bg-white p-1.5 outline-none hover:border-[#c9cbd1] focus-visible:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(26,26,46,0.45)]"
            >
              <ChoiceMark on={on} />
              <span className="block aspect-[4/3] overflow-hidden rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.05)]">
                <ArrangeThumb kind={o.kind} theme={theme} items={things} />
              </span>
              <span className={cn("block py-1.5 text-center text-[12.5px] font-medium", on ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{o.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** A carousel's cards in view: one, one and a peek, one and a half, or two. */
export const CARDS_IN_VIEW = ["1", "1.2", "1.5", "2"] as const
export type CardsInView = (typeof CARDS_IN_VIEW)[number]
export function CardsInViewControl<T extends string>({ value, options, onChange }: { value: T; options?: readonly T[]; onChange: (v: T) => void }) {
  const list = (options ?? (CARDS_IN_VIEW as unknown as readonly T[])) as readonly T[]
  return (
    <div className="space-y-2.5" data-cards-in-view="">
      <p className={heading}>{tt("Cards in view")}</p>
      <Segmented<T> label={tt("Cards in view")} value={value} options={list.map((id) => ({ id, label: id }))} onChange={onChange} />
    </div>
  )
}

/** How many to show, for a block that reads its own list. */
export function HowManyControl({ value, options, onChange }: { value: number; options: number[]; onChange: (n: number) => void }) {
  return (
    <div className="space-y-2.5" data-how-many="">
      <p className={heading}>{tt("How many")}</p>
      <Segmented label={tt("How many")} value={String(value)} options={options.map((n) => ({ id: String(n), label: String(n) }))} onChange={(v) => onChange(Number(v))} />
    </div>
  )
}
