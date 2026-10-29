"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE REPORTS UNDER THE ANALYTICS CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * Read from app/api/analytics/reports, which counts on the server from every
 * row (lib/analytics/reports.ts has the rules), for every place together or
 * the one chosen in the property filter. The page reads it once and hands
 * the same answer to the chart at the top and to these cards
 * (useAnalyticsReports), so the two never disagree.
 *
 * IN THIS ORDER: where visits came from, the pages people opened (the
 * OnePage's links when the OnePage is chosen), the products, the way from a
 * visit to an order, the people who signed up, and then countries and
 * devices. Which of them a seller sees follows what they sell and have
 * (lib/analytics/sections). Each list is a name, a bar and one number.
 *
 * EVERY CARD AND EVERY SWITCHER IS ON THE FIRST PAINT. The cards are drawn
 * with their titles and their tabs before any answer: only the body of each
 * waits, in its fixed height, so the answer fills them and moves nothing.
 * They used to wait for the answer as bare frames and grow their tabs when
 * it came, 0.9 to 1.3 s after the page (scripts/check-analytics-tabs.mjs).
 *
 * THE REPORTS A SELLER ADDED are cards of their own after these, in the
 * seller's order, each with a menu to move it or take it off
 * (./add-reports). They are never lines on the chart.
 *
 * NOTHING SCROLLS INSIDE A CARD. A list shows its top five and opens the rest
 * in a dialog, so a wheel or a thumb over a card always moves the page. A
 * long list's dialog has a search above its rows (round 39, AllRows).
 *
 * MOTION IS TRANSFORM AND OPACITY, but for the fills. A switcher's one pill
 * slides to the tab chosen (round 39), a card arrives by rising and fading, and a card
 * moved in the order slides from where it was (FLIP). A fill (GREY_FILL)
 * fills in from its start by a scale the first time it is reached
 * (useFillIn), and a new share grows its own width: it is placed on its own
 * (absolute, or a box nothing else depends on), so nothing around it is laid
 * out again.
 *
 * ROUND 38, THE OWNER: "the progress fills in the analytics in /app and in
 * the community: back in the day it was that light gray gradient, not the
 * purple one. Fully get rid of it." Every fill in these cards (the rows of
 * every list, the funnel's steps, the sales channels, the community's lists
 * and its top posts) is GREY_FILL again, the exact classes the rows had
 * before round 34 (commit 2d229d8b's parent), and none is violet. The
 * chart's line and the added reports' columns are data on a chart, not
 * fills: they stay the accent.
 */

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { MoreHorizontal, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Shimmer, ShimmerBlock, ShimmerSwap } from "@/components/ui/shimmer"
import type { BreakdownRow, FunnelStep, Headline, Reports, Series } from "@/lib/analytics/reports"
import type { CreatorProperties, PropertySelector } from "@/lib/analytics/properties"
import { DEFAULT_SECTIONS_ALL, type ReportId, type Sections } from "@/lib/analytics/sections"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { FRESH_MS, askReport, keptAnswer, questionOf, reportKey } from "@/lib/analytics/report-cache"
import { HelpLabel } from "@/components/app/help-label"
import { SourceIcon, type IconFor } from "@/components/analytics/source-icon"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { formatMinor } from "@/lib/markets/money"
import { changeOf, percentText, ratio, roundShares } from "@/lib/analytics/percent"
import { TrendMiniChart } from "@/components/analytics/trend-mini-chart"
import { DetailBody, DetailPanel, OpenDetailContext, RowLinesContext, ViewReport, type DetailSection, type DetailView, type RowLines } from "./report-detail"

/** Storelib's accent, the one every /app screen uses: the added reports' columns. */
const ACCENT = "#8b5cf6"
/**
 * THE FILL: the light grey gradient the rows had before round 34, class for
 * class (commit 2d229d8b's parent, app/app/analytics/analytics-reports.tsx),
 * with its lit top edge, its hairline and its soft shadow. Every share bar
 * in /app Analytics and in a community's Analytics is this; the dark look's
 * neutral is scripts/gen-theme-dark.mjs's [data-fill="grey"].
 */
export const GREY_FILL =
  "bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)]"
/**
 * The same grey a step deeper, for a thin bar with no name on it (the
 * funnel's steps, the sales channels): at 6px the row's grey all but
 * vanishes on the white card, measured in the round 38 probe's shots.
 */
const GREY_FILL_THIN = "bg-[linear-gradient(180deg,#e8eaee_0%,#dcdfe4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6),inset_0_0_0_1px_rgba(16,24,40,0.04)]"
const EASE = "cubic-bezier(0.32,0.72,0,1)"
/** A switcher's white pill. */
const PILL = "rounded-[7px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.10),0_0_0_0.5px_rgba(17,24,39,0.06)]"

/* The store's own currency (Settings › Languages & Currency), set by AnalyticsReports from the /app layout's: lei for a store in lei. */
let reportCurrency = "USD"
/* Minor units in the currency's own decimals: a yen store's 2500 is ¥2,500, never ¥25 (the tab above reads it the same way). */
const fmtMoney = (cents: number) => formatMinor(cents || 0, reportCurrency, appLocale())
const fmtCount = (n: number) => Math.round(n).toLocaleString(appLocale())
/* "–" for a rate with nothing to divide by, never NaN% (lib/analytics/percent). */
const fmtPct = (f: number | null) => percentText(f)
const plural = (n: number, one: string, many: string) => `${fmtCount(n)} ${n === 1 ? one : many}`

const LIST_ROWS = 5
const BODY = "h-[236px]"

/** Whether there is a period to compare with. Off, every "was" and every percentage goes. */
const ComparedContext = React.createContext(true)

/* ─── Frame ───────────────────────────────────────────────────────────── */

function Card({
  title,
  help,
  tabs,
  actions,
  children,
  className,
  card,
  cardRef,
  detail,
}: {
  title: string
  help: string
  /** The report this card opens (./report-detail), with the tab it is on. */
  detail?: { id: string; tab?: string }
  tabs?: React.ReactNode
  /** Beside the title: an added report's menu. */
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** The card's name for the probes (scripts/check-analytics-page.mjs, check-analytics-tabs.mjs). */
  card: string
  cardRef?: React.Ref<HTMLElement>
}) {
  return (
    <section ref={cardRef} data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <div className="flex min-h-6 min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
          </div>
          {detail ? <ViewReport id={detail.id} tab={detail.tab} label={title} /> : null}
          {actions}
        </div>
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

/**
 * A SWITCHER: Polaris's segmented control in Storelib's greys. Arrow keys
 * move between tabs, as a tablist's should.
 *
 * ONE WHITE PILL THAT SLIDES (round 39, the owner: "switching between pill
 * shapes smooth clean"). It was a pill per tab, the chosen one fading and
 * settling in (opacity and scale from 92%) while the one before faded out:
 * filmed, two half pills on screen at once for 200ms, the new one growing
 * out of nothing. Now there is one pill, under the tab chosen, and a switch
 * slides it to the next tab and gives it that tab's width, 200ms on the
 * /app curve. It is placed on its own (absolute), so its width moves nothing
 * else, and it moves by `translate`, the property the transition names.
 * Until the first measure (the server's markup) the chosen tab draws its own
 * pill where the sliding one will be. With reduced motion it is simply there.
 */
function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label?: string }) {
  const list = React.useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = React.useState<{ x: number; w: number; glide: boolean } | null>(null)
  const was = React.useRef<T | null>(null)
  const shape = options.map((o) => `${o.value}:${o.label}`).join("|")
  React.useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const place = (glide: boolean) => {
      const on = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
      if (!on) return
      const x = on.offsetLeft
      const w = on.offsetWidth
      setThumb((t) => (t && t.x === x && t.w === w ? t : { x, w, glide }))
    }
    place(was.current !== null && was.current !== value && !reduceMotion())
    was.current = value
    /* The words' widths change once the font is in, or in another language: placed again, at once. */
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => place(false)) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [value, shape])
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
    const i = options.findIndex((o) => o.value === value)
    const next = options[(i + (e.key === "ArrowRight" ? 1 : options.length - 1)) % options.length]
    e.preventDefault()
    onChange(next.value)
    const el = e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[options.indexOf(next)]
    el?.focus()
  }
  return (
    <div ref={list} role="tablist" aria-label={label} data-segmented="" onKeyDown={onKey} className="relative inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-[#f1f2f4] p-[3px]">
      {thumb ? (
        <span
          aria-hidden
          data-segment-pill=""
          data-glide={thumb.glide ? "" : undefined}
          className={cn(PILL, "absolute inset-y-[3px] left-0", thumb.glide && "transition-[translate,width] duration-200 motion-reduce:transition-none")}
          style={{ width: thumb.w, translate: `${thumb.x}px 0`, transitionTimingFunction: EASE }}
        />
      ) : null}
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className="group relative h-8 cursor-pointer rounded-[7px] px-3 text-[12.5px] font-medium outline-none [-webkit-tap-highlight-color:transparent] focus-visible:shadow-[0_0_0_2px_rgba(139,92,246,0.4)] sm:h-7 sm:px-2.5 sm:text-[12px]"
          >
            {on && !thumb ? <span aria-hidden data-segment-pill="" className={cn(PILL, "absolute inset-0")} /> : null}
            <span className={cn("relative whitespace-nowrap transition-colors duration-200 motion-reduce:transition-none", on ? "text-[#1a1a2e]" : "text-[#6b7280] group-hover:text-[#1a1a2e]")}>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function Change({ h }: { h: Pick<Headline, "change" | "value"> }) {
  const compared = React.useContext(ComparedContext)
  if (!compared) return null
  if (h.change === null) return <span className="text-[13px] text-[#9ca3af]">{h.value > 0 ? tt("New") : ""}</span>
  const pct = Math.round(h.change * 100)
  if (pct === 0) return <span className="text-[13px] text-[#9ca3af]">0%</span>
  return (
    <span className={cn("text-[13px] font-medium tabular-nums", pct > 0 ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div data-empty="" className="flex flex-1 items-center justify-center px-2 py-6 text-center text-[13px] text-[#6b7280]">
      {children}
    </div>
  )
}

/**
 * A BAR FILLS AS IT IS REACHED. Mounted under the screen (or before its card
 * is in view), it waits at nothing (`data-fill-in="wait"`, app/globals.css)
 * and grows from its start the first time a sliver of it is in the page's
 * scroller: a scale on the compositor, not its width, each row a beat after
 * the one above. Once per bar: it is never emptied again, and a new period
 * moves it by its width as before. Under reduced motion it is simply there.
 */
/* Keeps the scale inside a list row (`.group`), which app/globals.css otherwise strips on a touch screen. */
const KEEP_SCALE = { "data-keep-transform": "" }
const FILL_STAGGER_MS = 45
const FILL_MS = 700
function useFillIn<T extends HTMLElement>() {
  const ref = React.useRef<T>(null)
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.setAttribute("data-fill-in", "wait")
    /* Its place in its list: a row's bar a beat after the row above, the eighth and on together. */
    const row = el.closest("li, [data-row-key], [data-channel], [data-step]")
    const index = row?.parentElement ? Math.min(7, Array.prototype.indexOf.call(row.parentElement.children, row)) : 0
    let done = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return
        io.disconnect()
        const delay = Math.max(0, index) * FILL_STAGGER_MS
        el.style.setProperty("--fill-delay", `${delay}ms`)
        void el.offsetWidth
        el.setAttribute("data-fill-in", "go")
        done = window.setTimeout(() => {
          el.removeAttribute("data-fill-in")
          el.style.removeProperty("--fill-delay")
        }, delay + FILL_MS + 60)
      },
      { root: el.closest<HTMLElement>(".page-scroll"), rootMargin: "0px 0px -6% 0px", threshold: 0 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(done)
      el.removeAttribute("data-fill-in")
    }
  }, [])
  return ref
}

/**
 * A FILL: GREY_FILL at its share of the width. It fills in as it is reached
 * (useFillIn), and a new share moves its width, 500ms, on a box placed on
 * its own. `share` is 0 to 1; `min` keeps a counted row visible.
 */
function Fill({ share, className, min = 0.02, thin = false }: { share: number; className?: string; min?: number; thin?: boolean }) {
  const s = Math.max(min, Math.min(1, Number.isFinite(share) ? share : 0))
  const ref = useFillIn<HTMLDivElement>()
  return (
    <div
      ref={ref}
      aria-hidden
      data-bar=""
      data-fill="grey"
      {...KEEP_SCALE}
      data-share={s.toFixed(3)}
      className={cn(thin ? GREY_FILL_THIN : GREY_FILL, "transition-[width,filter] duration-500 group-hover:brightness-[0.975] motion-reduce:transition-none", className)}
      style={{ width: `${(s * 100).toFixed(2)}%`, transitionTimingFunction: EASE }}
    />
  )
}

/** A funnel step's column, filled upwards as it is reached. */
function StepFill({ height }: { height: number }) {
  const ref = useFillIn<HTMLSpanElement>()
  return (
    <span
      ref={ref}
      data-bar=""
      data-fill="grey"
      data-fill-axis="y"
      {...KEEP_SCALE}
      className={cn(GREY_FILL_THIN, "block w-6 max-w-[calc(100%-8px)] rounded-t-[4px] transition-[height,filter] duration-500 group-hover:brightness-[0.93] motion-reduce:transition-none")}
      style={{ height, transitionTimingFunction: EASE }}
    />
  )
}

/* ─── Lists ───────────────────────────────────────────────────────────── */

type Lead = { flag: true } | { icon: IconFor } | null

/** One row of a list: a name, a bar for its size, one number, and a quiet line beside the name. */
interface ListRow {
  key: string
  label: string
  value: number
  /** What else there is to know, beside the name: "148 visitors", "Studio". */
  note?: string | null
  code?: string
  /** Round 39: a row that is a thing of its own (a community's post) opens it, in a new tab. */
  href?: string
}

function RowChange({ value, previous }: { value: number; previous: number | undefined }) {
  const compared = React.useContext(ComparedContext)
  if (!compared || previous === undefined) return null
  if (previous <= 0) return <span className="text-[12px] text-[#c4c7cf]">{value > 0 ? tt("New") : ""}</span>
  const pct = Math.round(((value - previous) / previous) * 100)
  if (pct === 0) return <span className="text-[12px] text-[#9ca3af]">0%</span>
  return (
    <span className={cn("text-[12px] tabular-nums", pct > 0 ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  )
}

/**
 * A COUNTRY'S FLAG, drawn, not typed. SVGs (public/flags, country-flag-icons,
 * MIT) at 3:2, with a hairline edge so white flags keep their shape.
 * Anything that is not a country is the globe.
 */
function Flag({ code }: { code: string }) {
  const cc = (code || "").toUpperCase()
  const [failed, setFailed] = React.useState(false)
  if (!/^[A-Z]{2}$/.test(cc) || failed) return <SourceIcon kind="source" value="referral" />
  return (
    <span aria-hidden data-flag={cc} className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="relative block h-[14px] w-[21px] overflow-hidden rounded-[3px] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/flags/${cc}.svg`} alt="" width={21} height={14} loading="lazy" decoding="async" onError={() => setFailed(true)} className="block h-full w-full object-cover" />
      </span>
    </span>
  )
}

/** A ROW: the mark, the name and the figure, with the size drawn as a flat bar behind the name. */
function Row({ r, max, format, lead, previous }: { r: ListRow; max: number; format: (n: number) => string; lead: Lead; previous?: number }) {
  const compared = React.useContext(ComparedContext) && previous !== undefined
  return (
    <li className="group flex h-10 items-center gap-3" data-row-key={r.key}>
      <div className="relative flex h-8 min-w-0 flex-1 items-center">
        <Fill share={r.value / max} className="absolute inset-y-0 left-0 rounded-md" />
        <div className="relative flex min-w-0 items-center gap-2 pl-1">
          {lead && "flag" in lead ? <Flag code={r.code ?? r.key} /> : lead ? <SourceIcon kind={lead.icon} value={r.key} /> : null}
          {r.href ? (
            <a href={r.href} target="_blank" rel="noopener noreferrer" className={cn("min-w-0 truncate text-[13px] text-[#303036] underline-offset-2 hover:underline", !lead && "pl-1.5")} title={r.label}>
              {r.label}
            </a>
          ) : (
            <span className={cn("min-w-0 truncate text-[13px] text-[#303036]", !lead && "pl-1.5")} title={r.label}>
              {r.label}
            </span>
          )}
          {r.note ? <span className="min-w-0 max-w-[45%] shrink truncate pr-2 text-[12px] tabular-nums text-[#9ca3af]">{r.note}</span> : null}
        </div>
      </div>
      <span className="shrink-0 text-[13px] font-medium tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
      {compared ? (
        <span className="w-11 shrink-0 text-right">
          <RowChange value={r.value} previous={previous} />
        </span>
      ) : null}
    </li>
  )
}
function List({
  rows,
  format,
  lead = null,
  empty,
  title,
  previous,
  onAll,
}: {
  rows: ListRow[]
  format: (n: number) => string
  lead?: Lead
  empty: string
  title: string
  /** "View all" opens the card's report (./report-detail) rather than the list's own dialog. */
  onAll?: () => void
  /** The comparison's number for each row, by key; left out, the list is not compared. */
  previous?: Record<string, number>
}) {
  const [all, setAll] = React.useState(false)
  if (rows.length === 0) return <Empty>{empty}</Empty>
  const max = Math.max(...rows.map((r) => r.value), 1)
  const shown = rows.slice(0, LIST_ROWS)
  const before = (r: ListRow) => (previous ? previous[r.key] ?? 0 : undefined)
  return (
    <>
      <ol className="mt-0.5" data-list="">
        {/* Keyed by place, not by name: when new numbers change the order, each line keeps its spot and only its words and bar change, so nothing jumps. */}
        {shown.map((r, i) => (
          <Row key={i} r={r} max={max} format={format} lead={lead} previous={before(r)} />
        ))}
      </ol>
      {rows.length > LIST_ROWS ? (
        <button type="button" data-view-all="" onClick={() => (onAll ? onAll() : setAll(true))} className="mt-auto min-h-[32px] w-fit cursor-pointer rounded-md py-1 text-[12px] font-medium text-[#7c3aed] hover:underline">
          {tt("View all {length}", { length: rows.length })}
        </button>
      ) : null}
      {onAll ? null : <AllRows open={all} onOpenChange={setAll} title={title} rows={rows} render={(r) => <Row key={r.key} r={r} max={max} format={format} lead={lead} previous={before(r)} />} />}
    </>
  )
}

/** A list long enough to be looked through gets a search above it. */
const SEARCH_FROM = 9

/** Lower case and without accents, so "sao" finds São Paulo. */
const folded = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

/**
 * EVERY ROW OF A LIST, in the /app dialog: its name and how many there are,
 * a search when there are more than a glance takes in (SEARCH_FROM), and
 * the rows as the card draws them, scrolling inside the dialog. The search
 * keeps the dialog's height, so the rows never jump while one types; a
 * search that finds nothing says so in the rows' place.
 */
function AllRows({ open, onOpenChange, title, rows, render }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; rows: ListRow[]; render: (r: ListRow) => React.ReactNode }) {
  const [query, setQuery] = React.useState("")
  React.useEffect(() => {
    if (!open) setQuery("")
  }, [open])
  const q = folded(query.trim())
  const found = q ? rows.filter((r) => folded(`${r.label} ${r.note ?? ""}`).includes(q)) : rows
  const searchable = rows.length >= SEARCH_FROM
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-all-rows="" className={cn("w-[calc(100%-32px)] max-w-[480px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0", searchable ? "h-[min(80vh,640px)] grid-rows-[auto_auto_minmax(0,1fr)]" : "max-h-[80vh]")}>
        <div className="flex items-baseline gap-2 border-b border-[#eef0f2] px-5 py-4 pr-12">
          <DialogTitle className="min-w-0 truncate text-[15px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
          <span className="shrink-0 text-[13px] tabular-nums text-[#9ca3af]">{fmtCount(rows.length)}</span>
        </div>
        {searchable ? (
          <label data-all-search="" className="mx-5 mt-3 flex h-10 cursor-text items-center gap-2 rounded-lg bg-[#f4f5f7] pl-3 pr-1 transition-[background-color,box-shadow] duration-150 focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_#d1d5db,0_0_0_3px_rgba(17,24,39,0.05)] sm:h-9">
            <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={tt("Search {list}", { list: title })}
              placeholder={tt("Search")}
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-[#9ca3af] hover:text-[#4b5563]">
                <X className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </label>
        ) : null}
        <ol className={cn("overflow-y-auto overscroll-contain px-5 py-2", searchable ? "min-h-0" : "max-h-[calc(80vh-64px)]")} data-all-list="">
          {found.length ? found.map(render) : <li className="flex h-24 items-center justify-center text-center text-[13px] text-[#6b7280]">{tt("Nothing matches “{query}”.", { query: query.trim() })}</li>}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

/** Breakdown rows as list rows, and their comparison by key. */
function fromBreakdown(rows: BreakdownRow[], note?: ((r: BreakdownRow) => string | null) | "share"): { rows: ListRow[]; previous: Record<string, number> } {
  /*
    "share": each row's share of the visits. When the rows are the whole (nothing cut off the list) the
    rounded shares add up to exactly 100% (lib/analytics/percent roundShares): three equal sources read 34%, 33% and
    33%, where rounding each on its own wrote 33% three times, 99%.
  */
  const whole = Math.abs(rows.reduce((a, r) => a + r.share, 0) - 1) < 1e-9
  const shares = note === "share" ? (whole ? roundShares(rows.map((r) => r.value)) : rows.map((r) => Math.round(r.share * 100))) : null
  return {
    rows: rows.map((r, i) => ({ key: r.key, label: r.label, value: r.value, note: shares ? `${shares[i]}%` : typeof note === "function" ? note(r) : null, code: r.extra?.code })),
    previous: Object.fromEntries(rows.map((r) => [r.key, r.previous])),
  }
}

/* ─── Funnel ──────────────────────────────────────────────────────────── */

/** What each step's rate is of: the step before it. */
const OF: Record<FunnelStep["key"], string> = {
  visitors: "",
  get product() { return tt("of visitors") },
  get cart() { return tt("of product viewers") },
  get checkout() { return tt("of those who added to cart") },
  get orders() { return tt("of checkouts") },
}

/** The short name under a step's column, where five have to fit across a phone. */
const SHORT: Record<FunnelStep["key"], string> = {
  get visitors() { return tt("Visitors") },
  get product() { return tt("Product") },
  get cart() { return tt("Cart") },
  get checkout() { return tt("Checkout") },
  get orders() { return tt("Orders") },
}

/** The step where the largest share of people did not go on, among the steps with a rate. */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null
  for (const s of steps) if (s.rate !== null && s.rate < 1 && (!worst || s.rate < (worst.rate ?? 1))) worst = s
  return worst
}

/** A count that fits a fifth of a phone: 1,284, 12.9K. */
const fmtStep = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1).replace(/\.0$/, "")}K` : fmtCount(n))

/** The bars' room, in pixels: the tallest step fills it. */
const FUNNEL_PLOT = 84

/**
 * FROM A VISIT TO AN ORDER, AS FIVE STAGES ACROSS. The owner: "a different
 * UI, more smooth and clean". Each stage is a column: its count on top, a
 * thin bar for its size against the busiest stage (24px at most, square on
 * the baseline, its top rounded), its name under the baseline. Between two
 * stages, on the line under the names, the share of people who went on;
 * the stage that loses the most says so in red, and the line under the
 * strip names it. The figure above is the share of visitors who ordered,
 * the Conversion tab's own number. A stage nothing was recorded for, while
 * a later one has something, is a dashed outline and "–", not a 0% that
 * would read as nobody going on.
 *
 * Every number is written on the card, so a hover only lifts the column;
 * its full sentence is the column's title and accessible name.
 */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(...steps.map((s) => (s.recorded ? s.value : 0)), 1)
  const drop = biggestDrop(steps)
  const first = steps[0]
  const last = steps[steps.length - 1]
  const converted = first && last && first.recorded && last.recorded ? ratio(last.value, first.value) : null
  const sentence = (s: FunnelStep) => (s.recorded ? `${s.label}: ${fmtCount(s.value)}${s.rate !== null ? `, ${fmtPct(s.rate)} ${OF[s.key]}` : ""}` : `${s.label}: ${tt("Not recorded")}`)
  return (
    <div className="flex flex-1 flex-col" data-funnel="">
      <div className="flex h-9 items-baseline gap-2" data-figure="">
        <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]" data-funnel-converted="">{fmtPct(converted)}</span>
        <span className="truncate text-[12px] text-[#6b7280]">{tt("of visitors ordered")}</span>
      </div>
      <ol className="mt-3 grid grid-cols-5" data-funnel-steps="">
        {steps.map((s, i) => {
          const worst = drop?.key === s.key
          const h = s.recorded ? Math.max(3, Math.round((s.value / top) * FUNNEL_PLOT)) : FUNNEL_PLOT
          return (
            <li key={s.key} data-step={s.key} data-drop={worst ? "" : undefined} title={sentence(s)} aria-label={sentence(s)} className="group relative flex min-w-0 flex-col items-center">
              <span className="h-5 text-[13px] font-semibold tabular-nums text-[#1a1a2e]">{s.recorded ? fmtStep(s.value) : "–"}</span>
              <span aria-hidden className="relative mt-1 flex w-full items-end justify-center" style={{ height: FUNNEL_PLOT }}>
                {s.recorded ? (
                  <StepFill height={h} />
                ) : (
                  <span data-bar="" data-unrecorded="" className="block h-full w-6 max-w-[calc(100%-8px)] rounded-t-[4px] border border-dashed border-[#d1d5db]" />
                )}
              </span>
              <span aria-hidden className="h-px w-full bg-[#e5e7eb]" />
              <span className="mt-1.5 w-full truncate px-0.5 text-center text-[11.5px] text-[#6b7280]">{SHORT[s.key]}</span>
              {i > 0 ? (
                /* The share who went on from the stage before, on the line between the two names. */
                <span
                  data-step-rate={s.key}
                  className={cn("absolute bottom-[-20px] left-0 -translate-x-1/2 whitespace-nowrap text-[11.5px] tabular-nums", worst ? "font-medium text-[#b42318]" : "text-[#9ca3af]")}
                >
                  {s.recorded && s.rate !== null ? fmtPct(s.rate) : ""}
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className="mt-auto truncate pt-7 text-[12px] text-[#6b7280]" data-funnel-note="">
        {steps.some((s) => !s.recorded)
          ? tt("Not recorded: {steps}", { steps: steps.filter((s) => !s.recorded).map((s) => s.label.toLowerCase()).join(", ") })
          : drop && drop.rate !== null
            ? tt("Biggest drop: {step}, {share} lost", { step: drop.label, share: fmtPct(1 - drop.rate) })
            : " "}
      </p>
    </div>
  )
}

/* ─── Loading ─────────────────────────────────────────────────────────── */

type WaitKind = "list" | "funnel" | "figure" | "columns"

/* Row widths that vary the way names do, the same on every render. */
const ROW_SPREAD = [0.82, 0.64, 0.74, 0.52, 0.6]

/**
 * A card whose figures are still on their way, drawn as the card will be in
 * light gray (components/ui/shimmer). Each card's body is a fixed 236px
 * (BODY), so whatever arrives moves nothing.
 */
function Waiting({ kind }: { kind: WaitKind }) {
  if (kind === "funnel") {
    return (
      <Shimmer>
        {/* The funnel's own shape: the figure, five columns on one baseline, their names. */}
        <div className="flex h-9 items-center">
          <ShimmerBlock className="h-6 w-16 rounded-lg" />
        </div>
        <div className="mt-3 grid grid-cols-5">
          {[1, 0.62, 0.3, 0.22, 0.12].map((w, i) => (
            <div key={i} className="flex flex-col items-center">
              <ShimmerBlock className="h-3 w-8 rounded-full" />
              <div className="mt-2 flex w-full items-end justify-center" style={{ height: FUNNEL_PLOT }}>
                <ShimmerBlock className="w-6 rounded-t-[4px]" style={{ height: Math.max(4, Math.round(w * FUNNEL_PLOT)) }} />
              </div>
              <ShimmerBlock className="mt-2 h-2.5 w-10 rounded-full" />
            </div>
          ))}
        </div>
      </Shimmer>
    )
  }
  if (kind === "columns") {
    return (
      <Shimmer className="mt-0.5">
        <div className="flex h-9 items-center">
          <ShimmerBlock className="h-6 w-20 rounded-lg" />
        </div>
        <div className="mt-4 flex h-[150px] items-end gap-1">
          {[0.4, 0.62, 0.5, 0.8, 0.56, 0.7, 0.46].map((h, i) => (
            <ShimmerBlock key={i} className="flex-1 rounded-[3px]" style={{ height: `${h * 100}%` }} />
          ))}
        </div>
      </Shimmer>
    )
  }
  return (
    <Shimmer className="mt-0.5">
      {kind === "figure" ? (
        <div className="flex h-9 items-center">
          <ShimmerBlock className="h-6 w-20 rounded-lg" />
        </div>
      ) : null}
      {ROW_SPREAD.slice(0, kind === "figure" ? 4 : 5).map((w, i) => (
        <div key={i} className="flex h-10 items-center gap-3">
          <div className="flex h-8 min-w-0 flex-1 items-center">
            <ShimmerBlock className="h-8 rounded-md" style={{ width: `${Math.max(30, w * 100)}%` }} />
          </div>
          <ShimmerBlock className="h-3 w-9 shrink-0 rounded-full" />
        </div>
      ))}
    </Shimmer>
  )
}

/**
 * A card's body: its fixed height, the skeleton while `blank`, and the
 * figures crossfading in over it when they come (ShimmerSwap).
 */
function Body({ blank, wait, children }: { blank: boolean; wait: WaitKind; children: React.ReactNode }) {
  return (
    <ShimmerSwap loading={blank} skeleton={<Waiting kind={wait} />} className={BODY} contentClassName="h-full flex flex-col">
      {children}
    </ShimmerSwap>
  )
}

/**
 * A FIGURE OVER TIME, AND WHAT MAKES IT UP: the period's number and its
 * change, its line across the chart's own buckets with the period before as
 * a quiet dashed line (components/analytics/trend-mini-chart: the figures'
 * chart's own line and hover, so pointing at a day reads it), and its three
 * largest parts as compact rows with thin bars. The added Page views, Visits,
 * Link clicks and Refunds cards.
 */
function Trend({ value, change, note, series, format, rows, rowsEmpty, rowsTitle, label }: { value: string; change: React.ReactNode; note?: React.ReactNode; series: Series; format: (n: number) => string; rows: ListRow[]; rowsEmpty: string; rowsTitle: string; label: string }) {
  const compared = React.useContext(ComparedContext)
  const top = rows.slice(0, 3)
  const rowMax = Math.max(1, ...top.map((r) => r.value))
  return (
    <div className="flex h-full flex-col" data-trend="">
      <div className="flex h-9 items-baseline gap-2.5" data-figure="">
        <span className="text-[24px] font-bold tracking-tight text-[#1a1a2e]">{value}</span>
        {change}
        {note ? <span className="ml-auto truncate text-[12px] tabular-nums text-[#6b7280]" data-trend-note="">{note}</span> : null}
      </div>
      <div className="mt-3" data-trend-line="">
        <TrendMiniChart labels={series.labels} current={series.current} previous={compared ? series.previous : EMPTY} format={format} height={92} label={label} />
      </div>
      <ol className="mt-4 flex flex-col gap-1.5" aria-label={rowsTitle} data-trend-rows="">
        {top.length ? (
          top.map((r) => (
            <li key={r.key} className="min-w-0" data-row-key={r.key}>
              <div className="flex h-[18px] items-baseline gap-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate text-[#303036]" title={r.label}>{r.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
              </div>
              <Fill share={r.value / rowMax} min={0.02} thin className="mt-0.5 h-1 rounded-full" />
            </li>
          ))
        ) : (
          <li className="text-[12.5px] text-[#6b7280]">{rowsEmpty}</li>
        )}
      </ol>
    </div>
  )
}
const EMPTY: number[] = []

/* ─── The cards ───────────────────────────────────────────────────────── */

type SourceTab = "source" | "social" | "campaign"
type DeviceTab = "device" | "browser"
type SignupTab = "property" | "source"
type CountryTab = "visitors" | "orders"

const SOURCE_TABS: Array<{ value: SourceTab; label: string }> = [
  { value: "source", get label() { return tt("Source") } },
  { value: "social", get label() { return tt("Social") } },
  { value: "campaign", get label() { return tt("Campaign") } },
]
const SOURCE_EMPTY: Record<SourceTab, string> = {
  get source() { return tt("No visits in this period. Share your link to bring some in.") },
  get social() { return tt("No visits from social apps. Add your link to your bio.") },
  get campaign() { return tt("No visits from tagged links. Add utm_campaign to a link to see it here.") },
}

/**
 * TOP PRODUCTS, EVERY KIND TOGETHER. A store that sells both kinds sees the
 * whole above the list with its split ("62% digital · 38% physical", the two
 * rounded to add up to 100) and each row named by its kind beside its
 * orders, rather than a switch to flip between them: "on mobile there are so
 * many things".
 */
function ProductsBody({ r, both, onAll }: { r: Reports; both: boolean; onAll?: () => void }) {
  const kindName = (k: string | null | undefined) => (k === "physical" ? tt("Physical") : k ? tt("Digital") : null)
  const rows: ListRow[] = r.topProducts.map((p) => ({
    key: p.key,
    label: p.label,
    value: p.salesCents,
    note: [both ? kindName(p.kind) : null, plural(p.orders, tt("order"), tt("orders")), plural(p.views, tt("view"), tt("views"))].filter(Boolean).join(" · "),
  }))
  const physical = r.kinds.filter((k) => k.key === "physical")
  const digital = r.kinds.filter((k) => k.key !== "physical")
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const cents = [sum(digital.map((k) => k.salesCents)), sum(physical.map((k) => k.salesCents))]
  const [digitalShare, physicalShare] = roundShares(cents)
  const split = cents[0] + cents[1] > 0 ? tt("{digital}% digital · {physical}% physical", { digital: digitalShare, physical: physicalShare }) : null
  return (
    <>
      {both ? (
        <div className="flex h-9 items-baseline gap-2.5" data-figure="">
          <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtMoney(cents[0] + cents[1])}</span>
          {split ? <span className="truncate text-[12px] tabular-nums text-[#6b7280]" data-kind-split="">{split}</span> : null}
        </div>
      ) : null}
      <List title={tt("Top products")} rows={rows} format={fmtMoney} empty={tt("No product views or orders in this period.")} onAll={onAll} />
    </>
  )
}

/**
 * THE CARDS, drawn whether or not the answer is in (`r` null): every title
 * and every switcher on the first paint, each body waiting in its own height.
 */
function Grid({ r, property, sections, extra, added, standing = [] }: { r: Reports | null; property: PropertySelector; sections: Sections; extra?: React.ReactNode; added?: AddedProps; standing?: readonly ReportId[] }) {
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const [deviceTab, setDeviceTab] = React.useState<DeviceTab>("device")
  const [signupTab, setSignupTab] = React.useState<SignupTab>(property.type === "all" ? "property" : "source")
  const [countryTab, setCountryTab] = React.useState<CountryTab>("visitors")
  const lists = !!r && !r.partial
  const visits = "share" as const
  const b = r?.breakdowns
  const onePage = property.type === "onepage"
  const both = sections.productKinds
  const signupsByPage = property.type === "all" && signupTab === "property"
  /* Every card opens its report (./report-detail), and a list's "View all" opens the same. */
  const openDetail = React.useContext(OpenDetailContext)
  const all = (id: string, tab?: string) => (openDetail ? () => openDetail(id, tab) : undefined)
  return (
    <>
      <Card
        card="traffic"
        detail={{ id: "traffic", tab: sourceTab }}
        title={tt("Traffic sources")}
        help={tt("Where each visit came from, judged by its first page: a search engine, a social app, an email, another website, or typed in directly.")}
        tabs={<Tabs label={tt("Traffic sources")} value={sourceTab} onChange={setSourceTab} options={SOURCE_TABS} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const traffic = fromBreakdown(b[sourceTab], visits)
            return <List key={sourceTab} title={tt("Traffic sources")} rows={traffic.rows} previous={traffic.previous} format={fmtCount} lead={{ icon: sourceTab }} empty={SOURCE_EMPTY[sourceTab]} onAll={all("traffic", sourceTab)} />
          })() : null}
        </Body>
      </Card>

      <Card
        card="referrers"
        detail={{ id: "referrers" }}
        title={tt("Referrers")}
        help={tt("The sites and apps that sent each visit, by its first page: one line per company, whichever of its addresses or apps the link came through. Visits with no referrer are Direct, under Traffic sources.")}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const referrers = fromBreakdown(b.referrer, visits)
            return <List title={tt("Referrers")} rows={referrers.rows} previous={referrers.previous} format={fmtCount} lead={{ icon: "referrer" }} empty={tt("No visits from other websites or apps in this period.")} onAll={all("referrers")} />
          })() : null}
        </Body>
      </Card>

      {onePage ? (
        <Card card="pages" detail={{ id: "links" }} title={tt("Top links")} help={tt("The links and buttons on your OnePage that were tapped most, by the name they have on the page, and how many people tapped each.")}>
          <Body blank={!lists} wait="list">
            {lists && r ? (
              <List
                title={tt("Top links")}
                rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) }))}
                format={fmtCount}
                empty={tt("No link taps in this period. Add links to your OnePage.")}
                onAll={all("links")}
              />
            ) : null}
          </Body>
        </Card>
      ) : (
        <Card card="pages" detail={{ id: "pages" }} title={tt("Top pages")} help={tt("Each page by its exact address and title, with its views and how many people opened it. A page opened again within half an hour counts once.")}>
          <Body blank={!lists} wait="list">
            {lists && r ? (
              <List
                title={tt("Top pages")}
                rows={r.topPages.map((p) => ({ key: p.key, label: p.label, value: p.views, note: [p.title, p.place, plural(p.visitors, tt("visitor"), tt("visitors"))].filter(Boolean).join(" · ") }))}
                format={fmtCount}
                empty={tt("No pages opened in this period. Share a link to one of your pages.")}
                onAll={all("pages")}
              />
            ) : null}
          </Body>
        </Card>
      )}

      {r?.siteClicks && !onePage ? (
        <Card card="siteclicks" detail={{ id: "siteclicks" }} title={tt("Clicks between pages")} help={siteClicksHelp()}>
          <Body blank={!lists} wait="list">
            {lists ? (
              <List
                title={tt("Clicks between pages")}
                rows={r.siteClicks.rows.map((x) => ({ key: x.key, label: x.label, value: x.clicks, note: siteClickNote(x) }))}
                previous={Object.fromEntries(r.siteClicks.rows.map((x) => [x.key, x.previous]))}
                format={fmtCount}
                empty={tt("No clicks between pages in this period.")}
                onAll={all("siteclicks")}
              />
            ) : null}
          </Body>
        </Card>
      ) : null}

      {sections.topProducts ? (
        <Card
          card="products"
          detail={{ id: "products" }}
          title={tt("Top products")}
          help={tt("Sales of each product in this period, less the refunds made in it, with its orders and how often its page was opened. With both kinds on sale, each row says which it is.")}
        >
          <Body blank={!lists} wait={both ? "figure" : "list"}>
            {lists && r ? <ProductsBody r={r} both={both} onAll={all("products")} /> : null}
          </Body>
        </Card>
      ) : null}

      {/*
        WHAT A KIND NEEDS, WITHOUT ADDING IT (round 43, the owner: "the same completeness for Digital and Physical"):
        Digital shows Downloads and Refunds, Physical its Refunds (returns), as cards of the page's own, beside Top
        products. One the seller already added is drawn once, where they put it.
      */}
      {standing.filter((id) => !added?.ids.includes(id)).map((id) => (
        <Card key={`standing-${id}`} card={`standing-${id}`} detail={{ id: `added:${id}` }} title={REPORT_COPY[id].title} help={REPORT_COPY[id].help}>
          <Body blank={!lists} wait="figure">
            {lists && r ? <AddedBody id={id} r={r} onAll={all(`added:${id}`)} /> : null}
          </Body>
        </Card>
      ))}

      <Card
        card="funnel"
        detail={{ id: "funnel" }}
        title={tt("Funnel")}
        help={tt("Of the people who visited, how many opened a product, added it to the cart or pressed Buy, started a checkout, and how many orders came in. Each step is a share of the one before; the step that loses the most people is marked in red.")}
      >
        <Body blank={!lists} wait="funnel">
          {lists && r ? (r.funnel.every((s) => s.value === 0) ? <Empty>{tt("No visits in this period.")}</Empty> : <Funnel steps={r.funnel} />) : null}
        </Body>
      </Card>

      {sections.subscribers ? (
        <Card
          card="subscribers"
          detail={{ id: "subscribers", tab: signupsByPage ? "property" : "source" }}
          title={tt("Subscribers")}
          help={tt("People who left their email on your pages or at checkout, and where they came from. Imports and contacts you added yourself are not counted.")}
          tabs={property.type === "all" ? <Tabs label={tt("Subscribers")} value={signupTab} onChange={setSignupTab} options={[{ value: "property", label: tt("Page") }, { value: "source", label: tt("Source") }]} /> : undefined}
        >
          <Body blank={!lists} wait="figure">
            {lists && r ? (
              r.subscribers === null ? (
                <Empty>{tt("Sign-ups could not be read. Refresh the page to try again.")}</Empty>
              ) : (
                (() => {
                  const signups = fromBreakdown(signupsByPage ? r.subscribers.byProperty : r.subscribers.bySource)
                  return (
                    <>
                      <div className="flex h-9 items-baseline gap-2.5" data-figure="">
                        <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtCount(r.subscribers.value)}</span>
                        <Change h={r.subscribers} />
                      </div>
                      <List key={signupTab} title={tt("Subscribers")} rows={signups.rows} previous={signups.previous} format={fmtCount} empty={tt("No sign-ups in this period. Add a sign-up form to your page.")} onAll={all("subscribers", signupsByPage ? "property" : "source")} />
                    </>
                  )
                })()
              )
            ) : null}
          </Body>
        </Card>
      ) : null}

      <Card
        card="countries"
        detail={{ id: "countries", tab: countryTab }}
        title={tt("Countries")}
        help={tt("Visitors: where visits came from, from their connection. Orders: where buyers are, from the order, with their revenue.")}
        tabs={<Tabs label={tt("Countries")} value={countryTab} onChange={setCountryTab} options={[{ value: "visitors", label: tt("Visitors") }, { value: "orders", label: tt("Orders") }]} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const countries = countryTab === "orders" ? fromBreakdown(b.orderCountry, (row) => fmtMoney(row.extra?.salesCents ?? 0)) : fromBreakdown(b.country, visits)
            return <List key={countryTab} title={tt("Countries")} rows={countries.rows} previous={countries.previous} format={fmtCount} lead={{ flag: true }} empty={countryTab === "orders" ? tt("No orders with a country in this period.") : tt("No locations recorded in this period.")} onAll={all("countries", countryTab)} />
          })() : null}
        </Body>
      </Card>

      <Card card="os" detail={{ id: "os" }} title={tt("Operating systems")} help={tt("Visitors by the system of their device, with its share of all visitors. Read from the browser's signature, and from its platform hint where the signature is vague.")}>
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const systems = fromBreakdown(b.os, visits)
            return <List title={tt("Operating systems")} rows={systems.rows} previous={systems.previous} format={fmtCount} lead={{ icon: "os" }} empty={tt("No visits in this period.")} onAll={all("os")} />
          })() : null}
        </Body>
      </Card>

      <Card
        card="devices"
        detail={{ id: "devices", tab: deviceTab }}
        title={tt("Devices")}
        help={tt("The device and browser of the first page of each visit.")}
        tabs={<Tabs label={tt("Devices")} value={deviceTab} onChange={setDeviceTab} options={[{ value: "device", label: tt("Device") }, { value: "browser", label: tt("Browser") }]} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const devices = fromBreakdown(b[deviceTab], visits)
            return <List key={deviceTab} title={deviceTab === "device" ? tt("Devices") : tt("Browsers")} rows={devices.rows} previous={devices.previous} format={fmtCount} lead={{ icon: deviceTab }} empty={tt("No visits in this period.")} onAll={all("devices", deviceTab)} />
          })() : null}
        </Body>
      </Card>
      {extra}
      {added ? <AddedCards r={r} lists={lists} {...added} /> : null}
    </>
  )
}

/* ─── A report, opened (./report-detail) ─────────────────────────────── */

/** Every bucket of a series as a row: the day (or week, or month), this period and the period before at the same point. */
function overTime(series: Series | { labels: string[]; current: Array<number | null>; previous: Array<number | null> }, format: (n: number) => string, title = tt("Over time"), rate = false): DetailSection {
  return {
    title,
    format,
    rows: series.labels.map((label, i) => {
      const now = series.current[i]
      const before = series.previous.length ? series.previous[i] : undefined
      return {
        key: `${i}`,
        label,
        value: now ?? 0,
        previous: before === undefined ? undefined : before ?? 0,
        text: rate && now === null ? "–" : undefined,
        previousText: rate && before === null ? "–" : undefined,
      }
    }),
  }
}

const leadOf = (lead: Lead, row: { key: string; code?: string }): React.ReactNode => (lead && "flag" in lead ? <Flag code={row.code ?? row.key} /> : lead ? <SourceIcon kind={lead.icon} value={row.key} /> : null)

/** A breakdown's every row, with the period before and each row's share of the whole. */
function breakdownSection(title: string, rows: BreakdownRow[], lead: Lead, note: "share" | ((r: BreakdownRow) => string | null) = "share", format = fmtCount, lines?: string): DetailSection {
  const list = fromBreakdown(rows, note)
  return { title, format, bars: true, lines, rows: list.rows.map((r) => ({ key: r.key, label: r.label, value: r.value, previous: list.previous[r.key], note: r.note, lead: leadOf(lead, r) })) }
}

const chartOf = (series: Series, format: (n: number) => string, label: string, integer = true): DetailView["chart"] => ({ labels: series.labels, current: series.current, previous: series.previous, format, integer, label })
const figureOf = (h: { value: number; previous: number }, format: (n: number) => string, note?: string | null): DetailView["figure"] => ({ value: format(h.value), now: h.value, before: h.previous, beforeText: format(h.previous), note })
const rateText = (f: number | null) => fmtPct(f)

/** A button's places: the page it is on and the page it leads to, and the site under All when there are several. */
function siteClickNote(x: { from: string; to: string; place: string | null; label: string }): string {
  const route = x.label === x.to ? tt("from {from}", { from: x.from }) : `${x.from} → ${x.to}`
  return x.place ? `${route} · ${x.place}` : route
}
const siteClicksHelp = () => tt("Links and buttons on your website that open another of its pages, by their words: the page each was pressed on, the page it opened, and how often. Each button counts once per visit.")

/** The four figures over the chart, opened. */
export type MetricDetail = "views" | "revenue" | "orders" | "conversion" | "pageviews" | "clicks"

/**
 * WHAT EACH REPORT OPENS TO: its figure and change, its line over time, and
 * every row of what makes it up, from the answer the page already has. The
 * cards about visits (sources, referrers, countries, systems, devices) share
 * the visitors' line, since a row's own line is not in the answer.
 */
function detailFor(id: string, tab: string | undefined, r: Reports, setTab: (t: string) => void): DetailView | null {
  const b = r.breakdowns
  const visitors = { figure: figureOf(r.visitors, fmtCount), chart: chartOf(r.visitors.series, fmtCount, tt("Visitors")) }
  const tabs = <T extends string>(value: T, options: Array<{ value: T; label: string }>, label: string) => <Tabs label={label} value={value} onChange={(v) => setTab(v)} options={options} />
  switch (id) {
    case "metric:views":
      return { title: tt("Visitors"), ...visitors, sections: [overTime(r.visitors.series, fmtCount), breakdownSection(tt("By source"), b.source, { icon: "source" }, "share", fmtCount, "source")], help: tt("People who opened one of your pages, each counted once per day.") }
    case "metric:pageviews":
    case "added:pageviews":
      return { title: tt("Page views"), figure: figureOf(r.views, fmtCount), chart: chartOf(r.views.series, fmtCount, tt("Page views")), sections: [overTime(r.views.series, fmtCount), { title: tt("By page"), format: fmtCount, bars: true, lines: "page", rows: r.topPages.map((p) => ({ key: p.key, label: p.title || p.label, value: p.views, note: p.title ? p.label : p.place })) }], help: REPORT_COPY.pageviews.help }
    case "added:sessions":
      return { title: tt("Visits"), figure: figureOf(r.sessions, fmtCount), chart: chartOf(r.sessions.series, fmtCount, tt("Visits")), sections: [overTime(r.sessions.series, fmtCount), breakdownSection(tt("By source"), b.source, { icon: "source" }, "share", fmtCount, "source")], help: REPORT_COPY.sessions.help }
    case "metric:clicks":
    case "added:clicks": {
      const h = delta(r.linkClicks?.value ?? 0, sumOf(r.linkClicks?.series.previous))
      return { title: tt("Link clicks"), figure: figureOf(h, fmtCount), chart: chartOf(r.linkClicks.series, fmtCount, tt("Link clicks")), sections: [overTime(r.linkClicks.series, fmtCount), { title: tt("By link"), format: fmtCount, bars: true, lines: "link", rows: r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) })) }], help: REPORT_COPY.clicks.help }
    }
    case "metric:revenue":
      return {
        title: tt("Total revenue"),
        figure: figureOf(r.sales, fmtMoney, tt("Less refunds")),
        chart: chartOf(r.sales.series, fmtMoney, tt("Total revenue"), false),
        sections: [
          overTime(r.sales.series, fmtMoney),
          { title: tt("By product"), format: fmtMoney, bars: true, lines: "product", rows: r.topProducts.map((p) => ({ key: p.key, label: p.label, value: p.salesCents, note: plural(p.orders, tt("order"), tt("orders")) })) },
          ...(r.kinds.length > 1 ? [{ title: tt("By kind"), format: fmtMoney, bars: true, rows: r.kinds.map((k) => ({ key: k.key, label: k.label, value: k.salesCents, note: plural(k.orders, tt("order"), tt("orders")) })) }] : []),
        ],
      }
    case "metric:orders":
      return {
        title: tt("Total orders"),
        figure: figureOf(r.orders, fmtCount, tt("Paid and free")),
        chart: chartOf(r.orders.series, fmtCount, tt("Orders")),
        sections: [overTime(r.orders.series, fmtCount), { title: tt("By product"), format: fmtCount, bars: true, rows: [...r.topProducts].sort((x, y) => y.orders - x.orders).filter((p) => p.orders > 0).map((p) => ({ key: p.key, label: p.label, value: p.orders, note: fmtMoney(p.salesCents) })) }],
      }
    case "metric:conversion":
    case "funnel": {
      const c = r.conversion
      const series = { labels: c.series.labels, current: c.series.current.map((x) => (x === null ? 0 : x * 100)), previous: c.series.previous.map((x) => (x === null ? 0 : x * 100)) }
      const pct = (n: number) => `${n > 0 && n < 10 ? n.toFixed(1).replace(/\.0$/, "") : Math.round(n)}%`
      return {
        title: id === "funnel" ? tt("Funnel") : tt("Conversion rate"),
        figure: { value: rateText(c.value), now: c.value, before: c.previous, beforeText: rateText(c.previous), note: tt("of visitors ordered") },
        chart: { labels: series.labels, current: series.current, previous: series.previous, format: pct, integer: false, label: tt("Conversion rate") },
        sections: [
          { title: tt("Steps"), format: fmtCount, bars: true, rows: r.funnel.map((st) => ({ key: st.key, label: st.label, value: st.recorded ? st.value : 0, text: st.recorded ? undefined : "–", note: st.rate !== null && st.recorded ? `${fmtPct(st.rate)} ${OF[st.key]}` : null })) },
          overTime(c.series, rateText, tt("Over time"), true),
        ],
        help: tt("Of the people who visited, how many opened a product, added it to the cart or pressed Buy, started a checkout, and how many orders came in. Each step is a share of the one before; the step that loses the most people is marked in red."),
      }
    }
    case "traffic": {
      const t = (SOURCE_TABS.some((o) => o.value === tab) ? tab : "source") as SourceTab
      return { title: tt("Traffic sources"), tabs: tabs(t, SOURCE_TABS, tt("Traffic sources")), ...visitors, sections: [breakdownSection(SOURCE_TABS.find((o) => o.value === t)!.label, b[t], { icon: t }, "share", fmtCount, t)] }
    }
    case "referrers":
      return { title: tt("Referrers"), ...visitors, sections: [breakdownSection(tt("Referrers"), b.referrer, { icon: "referrer" }, "share", fmtCount, "referrer")] }
    case "pages":
      return { title: tt("Top pages"), figure: figureOf(r.views, fmtCount), chart: chartOf(r.views.series, fmtCount, tt("Page views")), sections: [{ title: tt("Pages"), format: fmtCount, bars: true, lines: "page", valueLabel: tt("Views"), rows: r.topPages.map((p) => ({ key: p.key, label: p.label, value: p.views, note: [p.title, p.place, plural(p.visitors, tt("visitor"), tt("visitors"))].filter(Boolean).join(" · ") })) }] }
    case "links":
    case "added:toplinks": {
      const h = delta(r.linkClicks?.value ?? 0, sumOf(r.linkClicks?.series.previous))
      return { title: id === "links" ? tt("Top links") : REPORT_COPY.toplinks.title, figure: figureOf(h, fmtCount), chart: chartOf(r.linkClicks.series, fmtCount, tt("Link clicks")), sections: [{ title: tt("Links"), format: fmtCount, bars: true, lines: "link", valueLabel: tt("Taps"), rows: r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) })) }] }
    }
    case "products": {
      const kindName = (k: string | null | undefined) => (k === "physical" ? tt("Physical") : k ? tt("Digital") : null)
      return {
        title: tt("Top products"),
        figure: figureOf(r.sales, fmtMoney),
        chart: chartOf(r.sales.series, fmtMoney, tt("Total sales"), false),
        sections: [
          { title: tt("Products"), format: fmtMoney, bars: true, lines: "product", valueLabel: tt("Sales"), rows: r.topProducts.map((p) => ({ key: p.key, label: p.label, value: p.salesCents, note: [kindName(p.kind), plural(p.orders, tt("order"), tt("orders")), plural(p.views, tt("view"), tt("views"))].filter(Boolean).join(" · ") })) },
          ...(r.kinds.length > 1 ? [{ title: tt("By kind"), format: fmtMoney, bars: true, rows: r.kinds.map((k) => ({ key: k.key, label: k.label, value: k.salesCents, note: plural(k.orders, tt("order"), tt("orders")) })) }] : []),
        ],
      }
    }
    case "siteclicks": {
      const c = r.siteClicks
      if (!c) return { title: tt("Clicks between pages"), sections: [{ title: tt("Buttons"), format: fmtCount, rows: [], empty: tt("Clicks between pages could not be read. Refresh the page to try again.") }] }
      return {
        title: tt("Clicks between pages"),
        figure: figureOf(c, fmtCount),
        sections: [{ title: tt("Buttons"), format: fmtCount, bars: true, lines: "nav", valueLabel: tt("Clicks"), rows: c.rows.map((x) => ({ key: x.key, label: x.label, value: x.clicks, previous: x.previous, note: siteClickNote(x) })) }],
        help: siteClicksHelp(),
      }
    }
    case "subscribers": {
      if (!r.subscribers) return { title: tt("Subscribers"), sections: [{ title: tt("Subscribers"), format: fmtCount, rows: [], empty: tt("Sign-ups could not be read. Refresh the page to try again.") }] }
      const t = tab === "property" ? "property" : "source"
      return {
        title: tt("Subscribers"),
        tabs: tabs(t, [{ value: "property", label: tt("Page") }, { value: "source", label: tt("Source") }], tt("Subscribers")),
        figure: figureOf(r.subscribers, fmtCount),
        sections: [breakdownSection(t === "property" ? tt("By page") : tt("By source"), t === "property" ? r.subscribers.byProperty : r.subscribers.bySource, null, () => null)],
      }
    }
    case "countries": {
      const t = tab === "orders" ? "orders" : "visitors"
      return {
        title: tt("Countries"),
        tabs: tabs(t, [{ value: "visitors", label: tt("Visitors") }, { value: "orders", label: tt("Orders") }], tt("Countries")),
        ...(t === "orders" ? { figure: figureOf(r.orders, fmtCount), chart: chartOf(r.orders.series, fmtCount, tt("Orders")) } : visitors),
        sections: [t === "orders" ? breakdownSection(tt("Orders by country"), b.orderCountry, { flag: true }, (row) => fmtMoney(row.extra?.salesCents ?? 0)) : breakdownSection(tt("Visitors by country"), b.country, { flag: true }, "share", fmtCount, "country")],
      }
    }
    case "os":
      return { title: tt("Operating systems"), ...visitors, sections: [breakdownSection(tt("Operating systems"), b.os, { icon: "os" })] }
    case "devices": {
      const t = tab === "browser" ? "browser" : "device"
      return { title: tt("Devices"), tabs: tabs(t, [{ value: "device", label: tt("Device") }, { value: "browser", label: tt("Browser") }], tt("Devices")), ...visitors, sections: [breakdownSection(t === "device" ? tt("Devices") : tt("Browsers"), b[t], { icon: t }, "share", fmtCount, t)] }
    }
    case "added:refunds": {
      const h = delta(r.refunds.value, r.refunds.previous)
      return {
        title: tt("Refunds"),
        figure: figureOf(h, fmtCount, r.refunds.cents > 0 ? tt("{amount} back", { amount: fmtMoney(r.refunds.cents) }) : null),
        chart: chartOf(r.refunds.series, fmtCount, tt("Refunds")),
        sections: [overTime(r.refunds.series, fmtCount), { title: tt("Refunds by kind"), format: fmtCount, bars: true, rows: r.kinds.filter((k) => k.refunds > 0).map((k) => ({ key: k.key, label: k.label, value: k.refunds })) }],
        help: REPORT_COPY.refunds.help,
      }
    }
    case "added:downloads": {
      const d = r.digital?.downloads
      return {
        title: REPORT_COPY.downloads.title,
        figure: d ? { value: fmtCount(d.total), note: r.digital.orders > 0 ? tt("{share} of orders", { share: fmtPct(d.orders / r.digital.orders) }) : tt("No digital orders") } : undefined,
        sections: [{ title: tt("By product"), format: fmtCount, bars: true, empty: d === null ? tt("Downloads could not be read. Refresh the page to try again.") : tt("No downloads in this period."), rows: d ? r.digital.top.map((p) => ({ key: p.key, label: p.label, value: p.downloads ?? 0, note: plural(p.orders, tt("order"), tt("orders")) })) : [] }],
        help: REPORT_COPY.downloads.help,
      }
    }
  }
  return null
}

/**
 * THE PAGE'S REPORTS, OPENABLE. Wraps the page: every card under it (and the
 * figures over the chart) opens its report through OpenDetailContext, and the
 * one panel is drawn here from the answer on screen, so what it shows is
 * always the page's own numbers, for the page's own filters, and a new answer
 * updates an open panel in place. The report stays drawn while the panel
 * slides out.
 */
export function ReportDetailHost({ state, range, against, question, children }: { state: ReportsState; range: string; against: string | null; /** The page's question (lib/analytics/report-cache reportKey), for each row's own line. */ question?: string; children: React.ReactNode }) {
  reportCurrency = useStoreCurrency()
  const [open, setOpen] = React.useState(false)
  const [which, setWhich] = React.useState<{ id: string; tab?: string } | null>(null)
  const openDetail = React.useCallback((id: string, tab?: string) => {
    setWhich({ id, tab })
    setOpen(true)
  }, [])
  const setTab = React.useCallback((tab: string) => setWhich((w) => (w ? { ...w, tab } : w)), [])
  /*
    A REPORT BY ITS ADDRESS (round 42): ?report=traffic, the way the /app
    search opens one (lib/search/app-pages.ts). Opened once on arriving, or
    when the address names another while the page is open, and the word
    taken out of the address in place, so Back and a reload keep the page
    without opening the panel again.
  */
  const askedReport = useReportParam()
  React.useEffect(() => {
    if (!askedReport || !titleOf(askedReport)) return
    openDetail(askedReport)
    try {
      const url = new URL(window.location.href)
      url.searchParams.delete("report")
      window.history.replaceState(window.history.state, "", url.toString())
    } catch {
      /* An address that can't be written: the report is open all the same. */
    }
  }, [askedReport, openDetail])
  const shown = state.data && state.data.reports.partial && state.lists && !state.lists.reports.partial ? state.lists : state.data
  const r = shown && !shown.reports.partial ? shown.reports : null
  const view = which && r ? detailFor(which.id, which.tab, r, setTab) : null
  const compared = !!r && r.compared !== false && against !== null
  const title = view?.title ?? (which ? titleOf(which.id) : "")
  const lines = useRowLines(open ? question : undefined, view)
  return (
    <OpenDetailContext.Provider value={openDetail}>
      {children}
      <DetailPanel open={open} onClose={() => setOpen(false)} title={title} sub={against ? tt("{range} compared with {against}", { range, against }) : range} panelKey={which ? `${which.id}` : undefined}>
        <ComparedContext.Provider value={compared}>
          <div data-detail-id={which?.id} aria-busy={!view} className={cn("transition-opacity duration-200", state.stale ? "opacity-60 delay-150" : "opacity-100")}>
            {view ? (
              <RowLinesContext.Provider value={lines}>
                <DetailBody view={view} compared={compared} />
              </RowLinesContext.Provider>
            ) : (
              <Waiting kind="list" />
            )}
          </div>
        </ComparedContext.Provider>
      </DetailPanel>
    </OpenDetailContext.Provider>
  )
}

/** The report the address names, read from the address as it changes (next/navigation keeps useSearchParams in step with history). */
function useReportParam(): string | null {
  const params = useSearchParams()
  return params?.get("report") ?? null
}

/* ─── Each row's own line, asked for when a report opens ─────────────── */

/** Lines already asked for, by question and dimension: a report opened again is drawn at once. A few, the latest kept. */
const askedLines = new Map<string, Promise<RowLines>>()
const LINES_KEPT = 24

function askLines(question: string, dim: string): Promise<RowLines> {
  const key = `${question}|${dim}`
  const known = askedLines.get(key)
  if (known) return known
  const p: Promise<RowLines> = fetch(`/api/analytics/rows?${question}&dim=${encodeURIComponent(dim)}`, { credentials: "same-origin" })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { series?: Record<string, number[]> }
      return { state: "ready" as const, series: body.series ?? {} }
    })
    .catch(() => {
      /* A failure is not kept: the next opening asks again. */
      askedLines.delete(key)
      return { state: "failed" as const }
    })
  askedLines.set(key, p)
  while (askedLines.size > LINES_KEPT) askedLines.delete(askedLines.keys().next().value as string)
  return p
}

/**
 * THE OPENED REPORT'S LINES (./report-detail RowLinesContext): for each
 * dimension its sections name, asked once the panel is open
 * (app/api/analytics/rows) and never before, so the page itself reads
 * nothing more. A dimension not in yet reads "loading".
 */
function useRowLines(question: string | undefined, view: DetailView | null): Record<string, RowLines> {
  const dims = view ? [...new Set(view.sections.map((s) => s.lines).filter((d): d is string => !!d))].join(",") : ""
  const [got, setGot] = React.useState<Record<string, RowLines>>({})
  React.useEffect(() => {
    if (!question || !dims) return
    let live = true
    for (const dim of dims.split(",")) {
      const key = `${question}|${dim}`
      void askLines(question, dim).then((answer) => {
        if (live) setGot((g) => (g[key] === answer ? g : { ...g, [key]: answer }))
      })
    }
    return () => {
      live = false
    }
  }, [question, dims])
  return React.useMemo(() => {
    const out: Record<string, RowLines> = {}
    if (!question) return out
    for (const dim of dims ? dims.split(",") : []) out[dim] = got[`${question}|${dim}`] ?? { state: "loading" }
    return out
  }, [question, dims, got])
}

/** A report's name before its numbers are in. */
function titleOf(id: string): string {
  if (id.startsWith("added:")) return REPORT_COPY[id.slice(6) as ReportId]?.title ?? ""
  return ({ traffic: tt("Traffic sources"), referrers: tt("Referrers"), pages: tt("Top pages"), links: tt("Top links"), products: tt("Top products"), funnel: tt("Funnel"), subscribers: tt("Subscribers"), countries: tt("Countries"), os: tt("Operating systems"), devices: tt("Devices"), "metric:views": tt("Visitors"), "metric:revenue": tt("Total revenue"), "metric:orders": tt("Total orders"), "metric:conversion": tt("Conversion rate"), "metric:pageviews": tt("Page views"), "metric:clicks": tt("Link clicks"), siteclicks: tt("Clicks between pages") } as Record<string, string>)[id] ?? ""
}

/**
 * READ AHEAD (round 41): the answer to a question the seller is about to ask
 * (a pointer resting on Digital), asked now and kept (lib/analytics/
 * report-cache), so the tap is answered from memory. Joins a request already
 * on its way, and asks nothing for a question answered within FRESH_MS.
 */
export function prefetchReports(q: { start: number; end: number; compare: { start: number; end: number } | null; product: string; property: string; currency?: string; kind?: string }, viewer: string | null) {
  try {
    const ccy = (q.currency || "").trim().toUpperCase()
    const key = reportKey({ ...q, timeZone: viewerTimeZone(), currency: /^[A-Z]{3}$/.test(ccy) ? ccy : undefined })
    const known = keptAnswer(questionOf(key), viewer)
    if (known && Date.now() - known.at < FRESH_MS) return
    const { promise, release } = askReport(key)
    promise.catch(() => {}).finally(release)
  } catch {
    /* a read ahead that fails is a tap that asks for itself */
  }
}

/* ─── The reports the seller added ────────────────────────────────────── */

export interface AddedProps {
  /** In the seller's order, only the ones drawn for what is chosen now. */
  ids: readonly ReportId[]
  onMove: (id: ReportId, by: -1 | 1) => void
  onRemove: (id: ReportId) => void
}

/** Every added report's name and what its card says it counts. */
export const REPORT_COPY: Record<ReportId, { title: string; help: string }> = {
  pageviews: { get title() { return tt("Page views") }, get help() { return tt("Every page opened, one per page per visitor per half hour.") } },
  sessions: { get title() { return tt("Visits") }, get help() { return tt("Visits to your pages. A visit ends after 30 minutes without a page.") } },
  clicks: { get title() { return tt("Link clicks") }, get help() { return tt("Links and buttons tapped, including the ones on your OnePage.") } },
  toplinks: { get title() { return tt("OnePage links") }, get help() { return tt("The links on your OnePage tapped most, and by how many people.") } },
  refunds: { get title() { return tt("Refunds") }, get help() { return tt("Refunds made in this period, on the day each was made, whenever the order was placed. Total sales takes them off on that day too.") } },
  downloads: { get title() { return tt("Downloads") }, get help() { return tt("How many of this period's digital orders were downloaded, and which products.") } },
}

const sumOf = (xs: number[] | undefined) => (xs ?? []).reduce((a, b) => a + b, 0)
const delta = (value: number, previous: number): Headline => ({ value, previous, change: changeOf(value, previous) })

function AddedBody({ id, r, onAll }: { id: ReportId; r: Reports; onAll?: () => void }) {
  if (id === "pageviews") {
    const perVisitor = ratio(r.views.value, r.visitors.value)
    return (
      <Trend
        value={fmtCount(r.views.value)}
        change={<Change h={r.views} />}
        note={perVisitor !== null ? tt("{n} per visitor", { n: perVisitor.toFixed(1).replace(/\.0$/, "") }) : null}
        series={r.views.series}
        format={fmtCount}
        label={tt("Page views")}
        rows={r.topPages.map((p) => ({ key: p.key, label: p.title || p.label, value: p.views }))}
        rowsTitle={tt("Most viewed pages")}
        rowsEmpty={tt("No pages opened in this period.")}
      />
    )
  }
  if (id === "sessions") {
    return (
      <Trend
        value={fmtCount(r.sessions.value)}
        change={<Change h={r.sessions} />}
        series={r.sessions.series}
        format={fmtCount}
        label={tt("Visits")}
        rows={r.breakdowns.source.map((b) => ({ key: b.key, label: b.label, value: b.value }))}
        rowsTitle={tt("Visits by source")}
        rowsEmpty={tt("No visits in this period.")}
      />
    )
  }
  if (id === "clicks") {
    const h = delta(r.linkClicks?.value ?? 0, sumOf(r.linkClicks?.series.previous))
    return (
      <Trend
        value={fmtCount(h.value)}
        change={<Change h={h} />}
        series={r.linkClicks.series}
        format={fmtCount}
        label={tt("Link clicks")}
        rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks }))}
        rowsTitle={tt("Most clicked links")}
        rowsEmpty={tt("No link clicks in this period.")}
      />
    )
  }
  if (id === "refunds") {
    /* Refunds made in the period, dated by the refund (lib/analytics/refund-dates), and the money that went back. */
    const h = delta(r.refunds.value, r.refunds.previous)
    const refunded = r.kinds.filter((k) => k.refunds > 0).map((k) => ({ key: k.key, label: k.label, value: k.refunds }))
    return (
      <Trend
        value={fmtCount(h.value)}
        change={<Change h={h} />}
        note={r.refunds.cents > 0 ? tt("{amount} back", { amount: fmtMoney(r.refunds.cents) }) : null}
        series={r.refunds.series}
        format={fmtCount}
        label={tt("Refunds")}
        rows={refunded}
        rowsTitle={tt("Refunds by kind")}
        rowsEmpty={tt("No refunds in this period.")}
      />
    )
  }
  if (id === "toplinks") {
    return <List title={REPORT_COPY.toplinks.title} rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) }))} format={fmtCount} empty={tt("No link taps in this period. Add links to your OnePage.")} onAll={onAll} />
  }
  if (r.digital?.downloads == null) return <Empty>{r.digital && r.digital.downloads === null ? tt("Downloads could not be read. Refresh the page to try again.") : tt("No downloads in this period.")}</Empty>
  return (
    <>
      <div className="flex h-9 items-baseline gap-2.5" data-figure="">
        <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtCount(r.digital.downloads.total)}</span>
        <span className="truncate text-[12px] tabular-nums text-[#6b7280]">{r.digital.orders > 0 ? tt("{share} of orders", { share: fmtPct(r.digital.downloads.orders / r.digital.orders) }) : tt("No digital orders")}</span>
      </div>
      <List title={REPORT_COPY.downloads.title} rows={r.digital.top.map((p) => ({ key: p.key, label: p.label, value: p.downloads ?? 0, note: plural(p.orders, tt("order"), tt("orders")) }))} format={fmtCount} empty={tt("No downloads in this period.")} onAll={onAll} />
    </>
  )
}

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

/**
 * THE ADDED REPORTS, each a card of its own, in the seller's order. One
 * added is there in the same frame the picker closes, rising in; one moved
 * slides from where it was to where it is (FLIP: its old place measured
 * before the change, the difference played back as a transform); one taken
 * off fades out and the ones after it slide up into its place.
 */
function AddedCards({ r, lists, ids, onMove, onRemove }: AddedProps & { r: Reports | null; lists: boolean }) {
  const els = React.useRef(new Map<ReportId, HTMLElement>())
  const places = React.useRef(new Map<ReportId, { x: number; y: number }>())
  const seen = React.useRef<Set<ReportId> | null>(null)
  const [arriving, setArriving] = React.useState<ReadonlySet<ReportId>>(new Set())
  const openDetail = React.useContext(OpenDetailContext)
  const order = ids.join(",")

  React.useLayoutEffect(() => {
    const fresh = new Set<ReportId>()
    const motion = !reduceMotion()
    for (const id of ids) {
      const el = els.current.get(id)
      if (!el) continue
      const now = { x: el.offsetLeft, y: el.offsetTop }
      const was = places.current.get(id)
      if (seen.current && !seen.current.has(id)) fresh.add(id)
      else if (was && motion && (was.x !== now.x || was.y !== now.y) && typeof el.animate === "function") {
        el.animate([{ transform: `translate(${was.x - now.x}px, ${was.y - now.y}px)` }, { transform: "none" }], { duration: 300, easing: EASE })
      }
      places.current.set(id, now)
    }
    for (const id of [...places.current.keys()]) if (!ids.includes(id)) places.current.delete(id)
    /* The first render is the page's own: its reports are simply there, not arriving. */
    if (seen.current && fresh.size) setArriving(fresh)
    seen.current = new Set(ids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order])

  const remove = (id: ReportId) => {
    const el = els.current.get(id)
    if (!el || reduceMotion() || typeof el.animate !== "function") return onRemove(id)
    el.style.pointerEvents = "none"
    el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(0.97)" }], { duration: 160, easing: "cubic-bezier(0.4,0,1,1)", fill: "forwards" }).finished.then(
      () => onRemove(id),
      () => onRemove(id),
    )
  }

  if (!ids.length) return null
  return (
    <>
      {ids.map((id, i) => {
        const items: ActionMenuItem[] = [
          { id: "up", label: tt("Move up"), disabled: i === 0, onClick: () => onMove(id, -1) },
          { id: "down", label: tt("Move down"), disabled: i === ids.length - 1, onClick: () => onMove(id, 1) },
          { id: "remove", label: tt("Remove report"), variant: "destructive", separatorBefore: true, onClick: () => remove(id) },
        ]
        const copy = REPORT_COPY[id]
        return (
          <Card
            key={id}
            card={id}
            detail={{ id: `added:${id}` }}
            title={copy.title}
            help={copy.help}
            className={cn("relative", arriving.has(id) && "analytics-card-in")}
            cardRef={(el: HTMLElement | null) => {
              if (el) els.current.set(id, el)
              else els.current.delete(id)
            }}
            actions={
              <ResponsiveActionMenu
                title={copy.title}
                items={items}
                trigger={
                  <button
                    type="button"
                    data-report-menu={id}
                    aria-label={tt("Options for {report}", { report: copy.title })}
                    className="-mr-1.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#6b7280] outline-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_2px_rgba(139,92,246,0.4)] active:bg-[#e9eaed] [-webkit-tap-highlight-color:transparent]"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                }
              />
            }
          >
            <Body blank={!lists} wait={id === "toplinks" ? "list" : "figure"}>
              {lists && r ? <AddedBody id={id} r={r} onAll={openDetail ? () => openDetail(`added:${id}`) : undefined} /> : null}
            </Body>
          </Card>
        )
      })}
    </>
  )
}

/* ─── The data, read once for the whole page ──────────────────────────── */

export interface StoreAllTime {
  orders: number
  salesCents: number
}

export interface ReportsAnswer {
  key: string
  reports: Reports
  allTime: StoreAllTime | null
  truncated: boolean
  /** Sales in another currency, converted to the store's at their own day's rate; `unconverted` had no rate and are left out. */
  conversion?: { currency: string; converted: number; unconverted: number } | null
  /** The place the server counted ("all", "onepage", "website:<id>"), and the creator's places. */
  property?: string
  properties?: CreatorProperties
}

export interface ReportsState {
  data: ReportsAnswer | null
  /**
   * The last whole answer, lists included. The same as `data` except while
   * `data` is a quick first answer (Reports `partial`) to a new question.
   */
  lists: ReportsAnswer | null
  loading: boolean
  failed: boolean
  /**
   * The figures on screen answer another question than the one being asked:
   * a new period, place or product is on its way. Only then does anything go
   * soft. The page's minute refresh asks the same question again, and that
   * is never stale: the figures stay as they are until the new ones land.
   */
  stale: boolean
}

const noSubscription = () => () => {}

function answerOf(json: Record<string, unknown>, key: string): ReportsAnswer {
  return { ...json, allTime: json.allTime ?? null, truncated: !!json.truncated, key } as unknown as ReportsAnswer
}

/**
 * The page's one read of /api/analytics/reports. `compare` is the period
 * just before, or null for All time. A new question drops the one in flight,
 * so a quick run of taps cannot land out of order. `refresh` asks the same
 * question again, for the page's minute poll.
 *
 * WHAT IS ALREADY KNOWN IS SHOWN AT ONCE (lib/analytics/report-cache). The
 * last complete answer to this question in this tab, or the one the sidebar
 * fetched when the pointer came near, is on screen before the first paint,
 * sharp, and the page asks again behind it. A kept answer under FRESH_MS old
 * is the answer, and nothing is asked. An answer on its way for the same
 * question, a prefetch, is joined rather than asked again.
 *
 * FIGURES, THEN LISTS. The server sends the figures as soon as it has
 * counted them, then everything. The figures go on screen when there is
 * nothing better for this question there already; the whole answer
 * replaces them, and a card that was waiting fills in.
 *
 * `viewer` is who is signed in: a kept answer counted for anybody else is
 * never shown.
 */
export function useAnalyticsReports({
  start,
  end,
  compare,
  product,
  property,
  refresh = 0,
  viewer = null,
  currency = "",
  kind = "all",
}: {
  start: number
  end: number
  compare: { start: number; end: number } | null
  product: string
  /** "all", "creator_page", "onepage" or "website:<id>". */
  property: string
  refresh?: number
  viewer?: string | null
  /** The store's selling currency: a change asks again, and does not reuse the old totals. */
  currency?: string
  /** The All / Digital / Physical switch: a question of its own, kept apart from the others. */
  kind?: string
}): ReportsState {
  /*
    A page opened from inside the app starts with the kept answer in its very
    first render, so its cards are simply there rather than fading in. Not
    while hydrating a full load: the server drew that page without one, and
    the first render has to match it (the layout effect below adopts it, still
    before the first paint).
  */
  const ccy = currency.trim().toUpperCase()
  const questionKey = (cs: number | null, ce: number | null) =>
    reportKey({
      start,
      end,
      compare: cs !== null && ce !== null ? { start: cs, end: ce } : null,
      product,
      property,
      timeZone: viewerTimeZone(),
      currency: /^[A-Z]{3}$/.test(ccy) ? ccy : undefined,
      kind,
    })
  const hydrated = React.useSyncExternalStore(noSubscription, () => true, () => false)
  const [state, setState] = React.useState<{ data: ReportsAnswer | null; lists: ReportsAnswer | null; loading: boolean; failed: boolean; asking: string }>(() => {
    const known = hydrated ? keptAnswer(questionOf(questionKey(compare?.start ?? null, compare?.end ?? null)), viewer) : null
    const data = known ? answerOf(known.answer, known.key) : null
    return { data, lists: data, loading: true, failed: false, asking: data ? questionOf(data.key) : "" }
  })
  /* The last answer's text, so an answer that says nothing new changes nothing on screen. */
  const lastText = React.useRef("")
  /* The minute's refresh always asks, however recent the kept answer. */
  const refreshed = React.useRef(refresh)
  const cs = compare?.start ?? null
  const ce = compare?.end ?? null
  /*
    Before the paint: a kept answer goes on screen in the same frame the page
    first draws, and not one frame later.
  */
  React.useLayoutEffect(() => {
    const key = questionKey(cs, ce)
    const question = questionOf(key)
    const known = keptAnswer(question, viewer)
    setState((s) => {
      const onScreen = s.data && questionOf(s.data.key) === question && !s.data.reports.partial ? s.data : null
      if (known && !onScreen) {
        lastText.current = JSON.stringify(known.answer)
        const data = answerOf(known.answer, known.key)
        return { data, lists: data, loading: true, failed: false, asking: question }
      }
      /* Same question, same state: a refresh does not even re-render the page until it has something to say. */
      return s.loading && !s.failed && s.asking === question ? s : { ...s, loading: true, failed: false, asking: question }
    })
    const polled = refreshed.current !== refresh
    refreshed.current = refresh
    if (known && !polled && Date.now() - known.at < FRESH_MS) {
      setState((s) => (s.asking === question ? { ...s, loading: false } : s))
      return
    }

    let live = true
    const { promise, release } = askReport(key, (figures) => {
      if (!live) return
      setState((s) => {
        /* A whole answer for this question is already on screen: it stays until the next whole one. */
        if (s.data && questionOf(s.data.key) === question && !s.data.reports.partial) return s
        const { part: _part, ...json } = figures
        return { ...s, data: answerOf(json, key), asking: question }
      })
    })
    promise
      .then((json) => {
        if (!live) return
        const text = JSON.stringify(json)
        setState((s) => {
          /* NOTHING NEW, NOTHING DRAWN: the minute refresh usually brings the same numbers. */
          if (s.data && questionOf(s.data.key) === question && text === lastText.current) return { ...s, loading: false, failed: false }
          lastText.current = text
          const data = answerOf(json, key)
          return { data, lists: data, loading: false, failed: false, asking: question }
        })
      })
      .catch((e) => {
        if (!live || (e as Error).name === "AbortError") return
        /* A failed refresh of the same question keeps the figures on screen;
           figures for a different question would read as this one's, so those go. */
        setState((s) => ({ ...s, data: s.data && questionOf(s.data.key) === question ? s.data : null, loading: false, failed: true }))
      })
    return () => {
      live = false
      release()
    }
  }, [start, end, cs, ce, product, property, refresh, viewer, ccy, kind])
  const stale = state.loading && !!state.data && questionOf(state.data.key) !== state.asking
  return React.useMemo(
    () => ({ data: state.data, lists: state.lists, loading: state.loading, failed: state.failed, stale }),
    [state.data, state.lists, state.loading, state.failed, stale],
  )
}

/**
 * The cards. Given the page's answer as `state`; without one they read
 * their own, with the period just before as the comparison, which is what
 * the probe in scripts/render-analytics-reports.tsx mounts.
 */
export function AnalyticsReports({
  start,
  end,
  product = "all",
  property = { type: "all" },
  state,
  sections = DEFAULT_SECTIONS_ALL,
  extra,
  added,
  standing,
}: {
  start?: Date
  end?: Date
  product?: string
  property?: PropertySelector
  state?: ReportsState
  /** Which cards this seller sees, for what is chosen (lib/analytics/sections). */
  sections?: Sections
  /** Cards of the page's own after these (the communities). */
  extra?: React.ReactNode
  /** The reports the seller added: cards of their own, never figures on the chart. */
  added?: AddedProps
  /** Reports drawn without being added, for what is chosen (Digital: downloads and refunds; Physical: refunds). */
  standing?: readonly ReportId[]
}) {
  reportCurrency = useStoreCurrency()
  return state ? (
    <ReportsView state={state} property={property} sections={sections} extra={extra} added={added} standing={standing} />
  ) : (
    <SelfLoading start={(start ?? new Date()).getTime()} end={(end ?? new Date()).getTime()} product={product} property={property} sections={sections} currency={reportCurrency} />
  )
}

function SelfLoading({ start, end, product, property, sections, currency }: { start: number; end: number; product: string; property: PropertySelector; sections: Sections; currency: string }) {
  const compare = React.useMemo(() => ({ start: start - (end - start), end: start }), [start, end])
  const key = property.type === "all" ? "all" : property.type === "website" ? `website:${property.id}` : property.type
  const state = useAnalyticsReports({ start, end, compare, product, property: key, currency })
  return <ReportsView state={state} property={property} sections={sections} />
}

function ReportsView({ state, property, sections, extra, added, standing }: { state: ReportsState; property: PropertySelector; sections: Sections; extra?: React.ReactNode; added?: AddedProps; standing?: readonly ReportId[] }) {
  const { data, lists, loading, failed, stale } = state
  /* A quick first answer to a new question keeps the last whole answer's lists on screen, softened, until the rest comes. */
  const shown = data && data.reports.partial && lists && !lists.reports.partial ? lists : data
  const soft = stale || (!!data?.reports.partial && shown !== data)
  const onScreen = (shown?.property as string | undefined) ?? null
  /* The place the cards were counted for, so a switch never labels one place's lists with another's names. */
  const countedFor: PropertySelector = onScreen
    ? onScreen === "all"
      ? { type: "all" }
      : onScreen.startsWith("website:")
        ? { type: "website", id: onScreen.slice(8) }
        : { type: onScreen as "creator_page" | "onepage" }
    : property

  return (
    <ComparedContext.Provider value={shown ? shown.reports.compared !== false : true}>
      {/* Softened by opacity alone while new figures are on their way: no blur, nothing but the compositor. */}
      <div aria-busy={loading} data-analytics-cards="" data-soft={soft ? "" : undefined} className={cn("relative grid gap-4 transition-opacity duration-200 md:grid-cols-2 xl:grid-cols-3", soft ? "opacity-60 delay-150" : "opacity-100")}>
        {failed && (!shown || shown.reports.partial) ? (
          <p className="rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3 text-[13px] text-[#8a1c0f] md:col-span-2 xl:col-span-3">
            {tt("The reports could not be loaded. Refresh the page to try again.")}
          </p>
        ) : null}

        <Grid r={shown?.reports ?? null} property={countedFor} sections={sections} extra={extra} added={added} standing={standing} />

        {shown?.truncated ? (
          <p className="text-[12px] text-[#9ca3af] md:col-span-2 xl:col-span-3">
            {tt("This period has more activity than one report reads at once. Choose a shorter period for exact figures.")}
          </p>
        ) : null}

        {shown?.conversion && (shown.conversion.converted > 0 || shown.conversion.unconverted > 0) ? (
          <p data-analytics-converted="" className="text-[12px] text-[#9ca3af] md:col-span-2 xl:col-span-3">
            {shown.conversion.unconverted > 0
              ? tt("Sales in other currencies are shown in {currency} at each day's exchange rate. {count} could not be converted yet and are not included.", { currency: shown.conversion.currency, count: shown.conversion.unconverted })
              : tt("Sales in other currencies are shown in {currency} at each day's exchange rate.", { currency: shown.conversion.currency })}
          </p>
        ) : null}
      </div>
    </ComparedContext.Provider>
  )
}

/*
  THE SAME CARDS ELSEWHERE. A community's Analytics (components/community/
  creator/analytics-section.tsx) and the sales reports (./commerce-reports)
  draw their cards, rows, bars and switchers with these, so a list reads the
  same on every Analytics screen in /app.
*/
export { Card as ReportCard, Tabs as ReportTabs, List as ReportList, Empty as ReportEmpty, Body as ReportBody, ComparedContext as ReportComparedContext, Fill as ReportFill, Change as ReportChange }
export type { ListRow as ReportListRow }
