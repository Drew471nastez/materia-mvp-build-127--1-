"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE
 * ===========================================================================
 * How fast the published website is for the people who visit it, in the
 * shape of Shopify's Web performance report, read top to bottom:
 *
 *   1. the period and the device, one row of two switches;
 *   2. one card: the Core Web Vitals as one rating, the three of them at
 *      their 75th percentile with Google's ratings (FCP and TTFB under them,
 *      smaller), and the chart of whichever one is chosen. The figures are
 *      the chart's tabs, as on /app/analytics;
 *   3. what to fix, only when there is something;
 *   4. where it is slow, one dimension at a time, the five busiest rows
 *      first;
 *   5. the lab test, apart: Google PageSpeed Insights when the server has a
 *      key, else Storelib's quick check (lib/website-builder/lab-run.ts),
 *      each labelled as what it is.
 *
 * A new period never empties the page: the figures on screen stay, dimmed,
 * until the new ones are in (lib/website-builder/perf-view.ts), and the
 * app's progress line runs along the card only past 300ms. The very first
 * load draws a placeholder card after the same 300ms.
 *
 * Every number is from the website's own visitors (lib/perf/site-vitals-
 * inline.ts → app/api/public/vitals → part 210), read by
 * lib/website-builder/web-performance-read.ts. Nothing is drawn that the
 * data does not hold: under MIN_SAMPLES page views a figure says "Not
 * enough visits yet", a chart point with too few visits is a gap, and an
 * insight is only made from a rating the data gave.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, ExternalLink, Loader2 } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { activeLanguage, tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { LoadingLine } from "@/components/app/loading-line"
import { Card, ErrorNote, PageTitle, buttonClass, primaryButtonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"
import { PerformanceChart, DEVICE_COLOR, type ChartPoint } from "./performance-chart"
import {
  CORE_METRICS,
  directionOf,
  formatPerf,
  overallRating,
  ratePerf,
  type BreakdownRow,
  type DeviceView,
  type Insight,
  type PerfMetric,
  type PerfRange,
  type PerfRating,
  type PerfReport,
  type RumMetric,
  type MetricFigure,
} from "@/lib/website-builder/web-performance"
import { fileNameOf, formatBytes, isQuickCheck, type AnyLabResult, type LabResult, type LabStrategy } from "@/lib/website-builder/pagespeed"
import type { QuickCheckResult, QuickFinding } from "@/lib/website-builder/quick-check"
import { PERF_SKELETON_AFTER_MS, initialLoad, loadReducer, loadView, segmentKey } from "@/lib/website-builder/perf-view"

interface StoredLab {
  strategy: LabStrategy
  url: string
  ranAt: string
  result: AnyLabResult
}

type Answer =
  | { available: false; live?: boolean }
  | { available: true; live?: boolean; report: PerfReport; lab: Record<LabStrategy, StoredLab | null> }

/* ── Words, read when drawn so the language's catalog has arrived ─────── */

const SHORT: Record<RumMetric, string> = { lcp: "LCP", inp: "INP", cls: "CLS", fcp: "FCP", ttfb: "TTFB", nav: "" }

function metricName(m: RumMetric): string {
  switch (m) {
    case "lcp":
      return tt("Largest Contentful Paint")
    case "inp":
      return tt("Interaction to Next Paint")
    case "cls":
      return tt("Cumulative Layout Shift")
    case "fcp":
      return tt("First Contentful Paint")
    case "ttfb":
      return tt("Time to First Byte")
    default:
      return tt("Page changes")
  }
}

/**
 * WHAT EACH MEASURE MEANS, IN WORDS (round AK, the owner: "too complex for
 * people"). The big label is what a visitor feels; Google's short name
 * stays beside it, small, for anyone who knows it.
 */
function plainName(m: RumMetric): string {
  switch (m) {
    case "lcp":
      return tt("Loading")
    case "inp":
      return tt("Responsiveness")
    case "cls":
      return tt("Visual stability")
    case "fcp":
      return tt("First content")
    case "ttfb":
      return tt("Server response")
    default:
      return tt("Page changes")
  }
}

/** One sentence for the whole page, from the three. */
function overallLine(r: PerfRating): string {
  return r === "good" ? tt("Fast for most visitors") : r === "poor" ? tt("Slow for many visitors") : tt("Some visitors wait too long")
}

function metricShort(m: RumMetric): string {
  return m === "nav" ? tt("Page changes") : SHORT[m]
}

function ratingLabel(r: PerfRating): string {
  return r === "good" ? tt("Good") : r === "poor" ? tt("Poor") : tt("Needs improvement")
}

const RANGES: PerfRange[] = ["24h", "7d", "30d", "90d"]

function rangeLabel(r: PerfRange): string {
  return r === "24h" ? tt("24 hours") : r === "7d" ? tt("7 days") : r === "30d" ? tt("30 days") : tt("90 days")
}

/**
 * THE PERIOD, AS ANALYTICS PICKS IT: one button that says the period, with
 * a calendar mark, opening a short list with a check on the one shown. The
 * website settings' dark surface, the analytics picker's shape.
 */
function PeriodPicker({ value, onChange }: { value: PerfRange; onChange: (r: PerfRange) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-perf-period=""
          aria-label={tt("Period: last {period}", { period: rangeLabel(value) })}
          className="inline-flex h-9 min-w-[156px] items-center gap-2 self-start rounded-lg border border-white/10 bg-white/[0.06] px-3 text-[13.5px] font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_1px_2px_rgba(0,0,0,0.3)] transition-colors duration-150 hover:bg-white/[0.09] data-[state=open]:bg-white/[0.12] md:h-8 md:text-[13px]"
        >
          <CalendarDays aria-hidden className="h-3.5 w-3.5 text-white/60" strokeWidth={1.9} />
          <span className="min-w-0 flex-1 text-left">{tt("Last {period}", { period: rangeLabel(value) })}</span>
          <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 text-white/50 transition-transform duration-200", open && "rotate-180")} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={6} className="w-[200px] rounded-xl border border-white/10 bg-[#1f1f1f] p-1 text-white shadow-[0_16px_40px_-10px_rgba(0,0,0,0.6)]">
        <div role="radiogroup" aria-label={tt("Period")}>
          {RANGES.map((r) => {
            const on = r === value
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                data-perf-range={r}
                onClick={() => {
                  onChange(r)
                  setOpen(false)
                }}
                className={cn("flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] transition-colors", on ? "bg-white/[0.09] text-white" : "text-white/75 hover:bg-white/[0.06] hover:text-white")}
              >
                <span className="min-w-0 flex-1">{tt("Last {period}", { period: rangeLabel(r) })}</span>
                {on ? <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.25} /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}


function pageTypeLabel(key: string): string {
  switch (key) {
    case "home":
      return tt("Home page")
    case "product":
      return tt("Product pages")
    case "collection":
      return tt("Collections")
    case "page":
      return tt("Pages")
    case "policy":
      return tt("Policies")
    case "blog":
      return tt("Blog")
    case "search":
      return tt("Search")
    case "cart":
      return tt("Cart")
    case "account":
      return tt("Account")
    case "checkout":
      return tt("Checkout")
    default:
      return tt("Other")
  }
}

/** The page type as it reads inside a sentence: "LCP on product pages on mobile is 3.4 s". */
function pageTypePhrase(key: string): string {
  switch (key) {
    case "home":
      return tt("the home page")
    case "product":
      return tt("product pages")
    case "collection":
      return tt("collection pages")
    case "policy":
      return tt("policy pages")
    case "blog":
      return tt("blog pages")
    case "search":
      return tt("the search page")
    case "cart":
      return tt("the cart")
    case "account":
      return tt("account pages")
    case "checkout":
      return tt("checkout")
    default:
      return tt("your pages")
  }
}

function advice(m: PerfMetric): string {
  switch (m) {
    case "lcp":
      return tt("Use a smaller first image, and keep apps and videos from loading before it.")
    case "inp":
      return tt("Something on these pages keeps the browser busy after a tap. Check the apps and embeds added to them.")
    case "cls":
      return tt("Something moves while the page loads. Give images and embeds a fixed size, and avoid bars that push the page down.")
    case "fcp":
      return tt("Fonts, apps or custom code in the page head delay the first paint. Remove the ones you no longer use.")
    default:
      return tt("The first answer from the server is slow. Most of it is the network between your visitors and Storelib, not your design.")
  }
}

function countryName(code: string): string {
  if (code === "(other)") return tt("Other countries")
  if (code === "??") return tt("Unknown")
  try {
    return new Intl.DisplayNames([appLocale()], { type: "region" }).of(code) ?? code
  } catch {
    return code
  }
}

function keyLabel(dim: Dim, key: string): string {
  if (dim === "type") return pageTypeLabel(key)
  if (dim === "country") return countryName(key)
  if (key === "(other)") return dim === "path" ? tt("Other pages") : tt("Other")
  return key
}

function when(iso: string | null | undefined, withDay = false): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString(appLocale(), zoned(today && !withDay ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))
}

const RATING_DOT: Record<PerfRating, string> = { good: "#0ca30c", "needs-improvement": "#fab219", poor: "#d03b3b" }

function percent(share: number): string {
  return new Intl.NumberFormat(appLocale(), { style: "percent", maximumFractionDigits: 0 }).format(share)
}

function count(n: number): string {
  return new Intl.NumberFormat(appLocale(), { notation: n >= 10_000 ? "compact" : "standard" }).format(n)
}

/* ── Small parts ─────────────────────────────────────────────────────── */

/**
 * A row of choices, every one the same width, with one plate that slides to
 * the chosen one on transform. One stop for Tab; the arrow keys, Home and
 * End choose inside it (perf-view segmentKey). Full width on a phone, its
 * own width from md up. Never wider or taller when the choice changes.
 */
function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  name,
  ownWidthFrom = "md",
}: {
  value: T
  options: Array<{ id: T; label: string; title?: string }>
  onChange: (v: T) => void
  label: string
  name: string
  /** Where the row stops filling its line: a row of long words needs a wider screen first. */
  ownWidthFrom?: "md" | "lg"
}) {
  const row = useRef<HTMLDivElement | null>(null)
  const index = Math.max(0, options.findIndex((o) => o.id === value))
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = segmentKey(options.map((o) => o.id), value, e.key)
    if (next === null) return
    e.preventDefault()
    onChange(next)
    const i = options.findIndex((o) => o.id === next)
    row.current?.querySelectorAll<HTMLButtonElement>("[role=radio]")[i]?.focus()
  }
  return (
    <div
      ref={row}
      role="radiogroup"
      aria-label={label}
      data-segmented={name}
      onKeyDown={onKey}
      className={cn(
        "relative grid w-full rounded-[10px] border border-white/[0.1] bg-white/[0.03] p-[3px] md:rounded-lg",
        ownWidthFrom === "md" ? "md:inline-grid md:w-auto md:shrink-0" : "lg:inline-grid lg:w-auto lg:shrink-0",
      )}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        data-segment-plate=""
        className="pointer-events-none absolute bottom-[3px] left-[3px] top-[3px] rounded-[7px] bg-white/[0.11] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none md:rounded-md"
        style={{ width: `calc((100% - 6px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => {
        const on = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={o.title}
            aria-label={o.title}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative z-[1] h-[38px] min-w-0 whitespace-nowrap rounded-[7px] font-medium outline-none transition-colors duration-150 md:h-8 md:rounded-md md:text-[13.5px] [-webkit-tap-highlight-color:transparent]",
              /* Four long words on a phone's width: a little tighter, so every one fits whole. */
              options.length >= 4 ? "px-1 text-[13px] md:px-3" : "px-2 text-[14px] md:px-3.5",
              "focus-visible:ring-2 focus-visible:ring-white/50",
              on ? "text-white" : "text-white/55 hover:text-white/85",
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function RatingMark({ rating, className }: { rating: PerfRating; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium text-white/80", className)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RATING_DOT[rating] }} aria-hidden />
      {ratingLabel(rating)}
    </span>
  )
}

/** The bands as one gradient, each band its share of the width, 2px of nothing between two that touch. */
function bandGradient(parts: Array<[PerfRating, number]>): string {
  const shown = parts.filter(([, s]) => s > 0)
  const total = shown.reduce((t, [, s]) => t + s, 0) || 1
  const stops: string[] = []
  let at = 0
  shown.forEach(([r, s], i) => {
    const from = (at / total) * 100
    at += s
    const to = (at / total) * 100
    const a = i === 0 ? "0%" : `calc(${from.toFixed(2)}% + 1px)`
    const b = i === shown.length - 1 ? "100%" : `calc(${to.toFixed(2)}% - 1px)`
    stops.push(`${RATING_DOT[r]} ${a} ${b}`)
    if (i < shown.length - 1) stops.push(`transparent ${b} calc(${to.toFixed(2)}% + 1px)`)
  })
  return `linear-gradient(to right, ${stops.join(", ")})`
}

/**
 * The share of page views in each of Google's bands, as a bar and in
 * numbers, with the change from the previous period at the end of the same
 * line. Spans throughout: it is drawn inside the tab's button.
 */
function Bands({ metric, figure }: { metric: RumMetric; figure: MetricFigure }) {
  const b = figure.bands
  if (!b) return null
  const parts: Array<[PerfRating, number]> = [
    ["good", b.good],
    ["needs-improvement", b.needsImprovement],
    ["poor", b.poor],
  ]
  const said = parts.map(([r, s]) => `${ratingLabel(r)} ${percent(s)}`).join(", ")
  return (
    <span className="mt-3 block" data-bands="">
      {/* One element painted with a gradient, a 2px gap of the card between bands: a new period repaints it and lays nothing out. */}
      <span className="block h-1.5 overflow-hidden rounded-full" role="img" aria-label={said} title={said} style={{ background: bandGradient(parts) }} />
      {/* Round AK: the three shares are in the bar's label and its tooltip; under it only how it changed. */}
      <span className="mt-1.5 flex min-h-[16px] items-center text-[12px] tabular-nums text-white/50">
        <Delta metric={metric} figure={figure} />
      </span>
    </span>
  )
}

/** "531 ms slower", at the end of the bands' line; the whole sentence for a screen reader and on hover. */
function Delta({ metric, figure }: { metric: RumMetric; figure: MetricFigure }) {
  const dir = directionOf(figure.p75, figure.previous)
  if (dir === null || figure.p75 === null || figure.previous === null) return null
  if (dir === "same") {
    const full = tt("No change from the previous period")
    return <span className="min-w-0 truncate text-white/45" data-delta="same" title={full}>{tt("No change")}<span className="sr-only">{full}</span></span>
  }
  const diff = formatPerf(metric, Math.abs(figure.p75 - figure.previous))
  const better = dir === "better"
  const full =
    metric === "cls"
      ? better
        ? tt("{delta} less shift than the previous period", { delta: diff })
        : tt("{delta} more shift than the previous period", { delta: diff })
      : better
        ? tt("{delta} faster than the previous period", { delta: diff })
        : tt("{delta} slower than the previous period", { delta: diff })
  const short = metric === "cls" ? (better ? tt("{delta} less", { delta: diff }) : tt("{delta} more", { delta: diff })) : better ? tt("{delta} faster", { delta: diff }) : tt("{delta} slower", { delta: diff })
  const Arrow = better ? ArrowDown : ArrowUp
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-0.5 whitespace-nowrap", better ? "text-emerald-300/90" : "text-red-300/90")} data-delta={dir} title={full}>
      <Arrow className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
      <span aria-hidden>{short}</span>
      <span className="sr-only">{full}</span>
    </span>
  )
}

/** The line under a chosen tab, the analytics page's (components/app/metric-tab). */
const TAB_LINE = "#8b5cf6"

/**
 * One of the three Core Web Vitals, and the tab that puts it on the chart.
 * On a phone a row (the name on the left, the figure on the right), from md
 * up a column.
 */
function CoreTab({ metric, figure, selected, onSelect, note }: { metric: PerfMetric; figure: MetricFigure; selected: boolean; onSelect: () => void; note?: string | null }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-metric={metric}
      data-tab={metric}
      onClick={onSelect}
      className={cn(
        "relative block w-full min-w-0 px-4 py-4 text-left outline-none transition-colors duration-200 md:px-6 md:py-5 [-webkit-tap-highlight-color:transparent]",
        "focus-visible:bg-white/[0.05]",
        selected ? "bg-white/[0.035]" : "hover:bg-white/[0.02]",
      )}
    >
      {selected && <span aria-hidden data-tab-line="" className="absolute inset-x-0 bottom-0 h-[1.5px]" style={{ background: TAB_LINE }} />}
      <span className="flex items-start justify-between gap-3 lg:block">
        <span className="min-w-0" title={metricName(metric)}>
          <span className="block text-[14.5px] font-semibold text-white">{plainName(metric)}</span>
          <span className="block truncate text-[12px] text-white/40">{metricShort(metric)}</span>
        </span>
        {/* On a phone a column of its own width, its words from its left edge: a new figure is written in place and nothing beside it moves. */}
        {figure.p75 === null ? (
          <span className="w-[136px] shrink-0 text-[14px] text-white/50 lg:mt-3 lg:block lg:w-auto" data-not-enough="">{tt("Not enough visits yet")}</span>
        ) : (
          <span className="w-[136px] shrink-0 lg:mt-2 lg:block lg:w-auto">
            <span className="block text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white lg:text-[28px]" data-p75="">{formatPerf(metric, figure.p75)}</span>
            {figure.rating && <RatingMark rating={figure.rating} className="mt-0.5" />}
          </span>
        )}
      </span>
      {figure.p75 !== null && (
        <>
          <Bands metric={metric} figure={figure} />
        </>
      )}
      {note && <span className="mt-2 block text-[12.5px] leading-snug text-white/40">{note}</span>}
    </button>
  )
}

/** FCP, TTFB and the page change time: the same tab, smaller. */
function MinorTab({ metric, figure, selected, onSelect }: { metric: RumMetric; figure: MetricFigure; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      data-metric={metric}
      data-tab={metric}
      onClick={onSelect}
      title={metricName(metric)}
      className={cn(
        "relative block min-w-0 px-4 py-3 text-left outline-none transition-colors duration-200 md:px-6 [-webkit-tap-highlight-color:transparent]",
        "focus-visible:bg-white/[0.05]",
        selected ? "bg-white/[0.035]" : "hover:bg-white/[0.02]",
      )}
    >
      {selected && <span aria-hidden data-tab-line="" className="absolute inset-x-0 bottom-0 h-[1.5px]" style={{ background: TAB_LINE }} />}
      <span className="block truncate text-[12.5px] text-white/50">{plainName(metric)}{metric === "nav" ? null : <span className="text-white/30"> · {metricShort(metric)}</span>}</span>
      {figure.p75 === null ? (
        <span className="mt-0.5 block truncate text-[13px] text-white/40" data-not-enough="">{tt("Not enough visits yet")}</span>
      ) : (
        <span className="mt-0.5 flex items-center gap-1.5 text-[15px] font-medium tabular-nums text-white" data-p75="">
          {figure.rating && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RATING_DOT[figure.rating] }} aria-label={ratingLabel(figure.rating)} />}
          {formatPerf(metric, figure.p75)}
        </span>
      )}
    </button>
  )
}

/* ── Breakdown ───────────────────────────────────────────────────────── */

type Dim = "path" | "type" | "browser" | "country"
type SortCol = "key" | "views" | PerfMetric

/** Rows shown before "Show all". */
const FIRST_ROWS = 5

function BreakdownTable({ rows, dim }: { rows: BreakdownRow[]; dim: Dim }) {
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: "views", dir: "desc" })
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => {
    const val = (r: BreakdownRow): number | string | null => (sort.col === "key" ? keyLabel(dim, r.key).toLowerCase() : sort.col === "views" ? r.views : r.metrics[sort.col]?.p75 ?? null)
    return [...rows].sort((a, b) => {
      const x = val(a)
      const y = val(b)
      /* Rows without enough visits for the column go last either way. */
      if (x === null && y === null) return b.views - a.views
      if (x === null) return 1
      if (y === null) return -1
      const c = x < y ? -1 : x > y ? 1 : 0
      return (sort.dir === "asc" ? c : -c) || b.views - a.views
    })
  }, [rows, sort, dim])
  const shown = all ? sorted : sorted.slice(0, FIRST_ROWS)
  const head = (col: SortCol, label: string, className?: string) => {
    const on = sort.col === col
    const Arrow = on && sort.dir === "asc" ? ArrowUp : ArrowDown
    return (
      <th scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("py-2.5 pl-1 pr-1.5 font-medium first:pl-4 last:pr-4 md:px-2 md:first:pl-6 md:last:pr-6", className)}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ col, dir: s.col === col ? (s.dir === "desc" ? "asc" : "desc") : col === "key" ? "asc" : "desc" }))}
          className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/40", on ? "text-white" : "text-white/50")}
        >
          {/* Always there, so a header never changes width when it is chosen; on the inner side of a number column, so the label stays over its numbers. */}
          {col !== "key" && <Arrow className={cn("h-3 w-3 shrink-0 transition-opacity", on ? "opacity-100" : "opacity-0")} aria-hidden />}
          {label}
          {col === "key" && <Arrow className={cn("h-3 w-3 shrink-0 transition-opacity", on ? "opacity-100" : "opacity-0")} aria-hidden />}
        </button>
      </th>
    )
  }
  const cell = (r: BreakdownRow, m: PerfMetric, className?: string) => {
    const f = r.metrics[m]
    const v = f?.p75 ?? null
    return (
      <td className={cn("whitespace-nowrap py-2.5 pl-1 pr-1.5 text-right tabular-nums last:pr-4 md:px-2 md:last:pr-6", className)} title={v === null ? tt("Not enough visits yet") : ratingLabel(ratePerf(m, v))}>
        {v === null ? (
          <span className="text-white/30">–</span>
        ) : (
          <span className="inline-flex items-center justify-end gap-1.5 text-white/85">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RATING_DOT[ratePerf(m, v)] }} aria-hidden />
            {formatPerf(m, v)}
          </span>
        )}
      </td>
    )
  }
  if (rows.length === 0) return <p className="px-4 py-5 text-[14px] text-white/50 md:px-6">{tt("No visits in this period yet.")}</p>
  const first = dim === "path" ? tt("Page") : dim === "type" ? tt("Page type") : dim === "browser" ? tt("Browser") : tt("Country")
  return (
    <div>
      <table className="w-full table-fixed border-collapse text-[13px]" data-breakdown={dim}>
        <colgroup>
          <col />
          <col className="w-[54px] lg:w-[76px]" />
          <col className="w-[64px] lg:w-[84px]" />
          <col className="w-[70px] lg:w-[88px]" />
          <col className="w-[58px] lg:w-[72px]" />
          <col className="hidden lg:table-column lg:w-[80px]" />
          <col className="hidden lg:table-column lg:w-[96px]" />
        </colgroup>
        <thead className="border-b border-white/[0.07] text-left text-[12.5px]">
          <tr>
            {head("key", first)}
            {head("views", tt("Views"), "text-right")}
            {head("lcp", "LCP", "text-right")}
            {head("inp", "INP", "text-right")}
            {head("cls", "CLS", "text-right")}
            {head("fcp", "FCP", "hidden text-right lg:table-cell")}
            {head("ttfb", "TTFB", "hidden text-right lg:table-cell")}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {shown.map((r) => (
            <tr key={r.key} className="h-10">
              <td className="truncate py-2.5 pl-4 pr-2 text-white/85 md:pl-6" title={keyLabel(dim, r.key)}>{keyLabel(dim, r.key)}</td>
              <td className="whitespace-nowrap py-2.5 pl-1 pr-1.5 text-right tabular-nums text-white/70 md:px-2">{count(r.views)}</td>
              {cell(r, "lcp")}
              {cell(r, "inp")}
              {cell(r, "cls")}
              {cell(r, "fcp", "hidden lg:table-cell")}
              {cell(r, "ttfb", "hidden lg:table-cell")}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FIRST_ROWS && (
        <div className="border-t border-white/[0.07] px-4 py-1 md:px-6">
          <button type="button" onClick={() => setAll((a) => !a)} aria-expanded={all} className="h-10 text-[13.5px] font-medium text-white/65 transition-colors hover:text-white md:h-9" data-show-all="">
            {all ? tt("Show fewer") : tt("Show all {count}", { count: rows.length })}
          </button>
        </div>
      )}
    </div>
  )
}

/* ── Insights ────────────────────────────────────────────────────────── */

function insightText(i: Insight): { title: string; body: string | null; evidence: string | null; rating: PerfRating | null } {
  if (i.kind === "all-good") return { title: tt("All three Core Web Vitals are Good."), body: tt("Keep an eye on this after you add apps, videos or large images."), evidence: null, rating: "good" }
  if (i.kind === "slower") {
    return {
      title: tt("{metric} got slower: {from} in the previous period, {to} now.", { metric: metricShort(i.metric), from: formatPerf(i.metric, i.from), to: formatPerf(i.metric, i.to) }),
      body: advice(i.metric),
      evidence: null,
      rating: ratePerf(i.metric, i.to),
    }
  }
  const value = formatPerf(i.metric, i.p75)
  const metric = metricShort(i.metric)
  const title = i.pageType
    ? i.device === "mobile"
      ? tt("{metric} on {pages} on mobile is {value}", { metric, pages: pageTypePhrase(i.pageType), value })
      : tt("{metric} on {pages} on desktop is {value}", { metric, pages: pageTypePhrase(i.pageType), value })
    : i.device === "mobile"
      ? tt("{metric} on mobile is {value}", { metric, value })
      : tt("{metric} on desktop is {value}", { metric, value })
  let evidence: string | null = null
  const e = i.evidence
  if (e?.kind === "largest-file") evidence = tt("In the last lab test, the heaviest image was {file} at {size}.", { file: fileNameOf(e.url), size: formatBytes(e.bytes) })
  else if (e?.kind === "image-savings") evidence = tt("In the last lab test, the page's images could be {size} smaller.", { size: formatBytes(e.bytes) })
  else if (e?.kind === "render-blocking") evidence = tt("In the last lab test, files that hold up the first paint cost {time}.", { time: formatPerf("fcp", e.ms) })
  else if (e?.kind === "server-response") evidence = tt("In the last lab test, the server took {time} to answer.", { time: formatPerf("ttfb", e.ms) })
  return { title, body: advice(i.metric), evidence, rating: i.rating }
}

/* ── Lab test ────────────────────────────────────────────────────────── */

function scoreRating(score: number): PerfRating {
  return score >= 90 ? "good" : score >= 50 ? "needs-improvement" : "poor"
}

function hostList(hosts: string[]): string {
  const shown = hosts.slice(0, 3).join(", ")
  return hosts.length > 3 ? tt("{hosts} and {count} more", { hosts: shown, count: hosts.length - 3 }) : shown
}

/** What a quick check found, one sentence each. */
function findingText(f: QuickFinding): string {
  switch (f.kind) {
    case "slow-server":
      return tt("The server takes {time} to answer. Over 0.8 s, every page starts late.", { time: formatPerf("ttfb", f.ms) })
    case "not-cached":
      return tt("The page was not served from Storelib's cache, so each visit waits for it to be built.")
    case "not-compressed":
      return tt("The page's HTML is sent uncompressed ({size}).", { size: formatBytes(f.bytes) })
    case "heavy-html":
      return tt("The page's HTML is {size}. Long pages with many sections take longer to arrive.", { size: formatBytes(f.bytes) })
    case "blocking":
      return f.scripts > 0
        ? tt("{count, plural, one {# script in the page head loads} other {# scripts in the page head load}} before anything is drawn. Custom code is the usual cause.", { count: f.scripts })
        : tt("{count, plural, one {# stylesheet holds} other {# stylesheets hold}} up the first paint{size}.", { count: f.styles, size: f.bytes ? ` (${formatBytes(f.bytes)})` : "" })
    case "heavy-image":
      return tt("The heaviest image is {file} at {size}. Use a smaller one.", { file: fileNameOf(f.url), size: formatBytes(f.bytes) })
    case "unsized-images":
      return tt("{count, plural, one {# image has} other {# images have}} no width and height, so the page can move as they load.", { count: f.count })
    case "not-lazy":
      return tt("{count, plural, one {# image} other {# images}} lower on the page load straight away instead of when they are scrolled to.", { count: f.count })
    case "font-host":
      return tt("Fonts load from {hosts} before the text is drawn.", { hosts: hostList(f.hosts) })
    case "third-party":
      return tt("The page loads files from {count} other services: {hosts}.", { count: f.hosts.length, hosts: hostList(f.hosts) })
  }
}

function QuickResult({ r }: { r: QuickCheckResult }) {
  const ttfbRating = ratePerf("ttfb", r.ttfb.median)
  const cache = r.edge.cached === true ? tt("Served from cache") : r.edge.cached === false ? tt("Not cached") : tt("Not reported")
  const facts: Array<{ label: string; value: string; rating?: PerfRating }> = [
    { label: tt("Server response"), value: formatPerf("ttfb", r.ttfb.median), rating: ttfbRating },
    { label: tt("Page HTML"), value: r.html.encoding ? `${formatBytes(r.html.bytes)} · ${r.html.encoding}` : `${formatBytes(r.html.bytes)} · ${tt("uncompressed")}` },
    { label: tt("Cache"), value: cache },
    { label: tt("Blocking files"), value: String(r.blocking.styles + r.blocking.scripts) + (r.blocking.bytes ? ` · ${formatBytes(r.blocking.bytes)}` : "") },
    { label: tt("Images"), value: r.images.largest[0]?.bytes ? tt("{count} · largest {size}", { count: r.images.count, size: formatBytes(r.images.largest[0].bytes as number) }) : String(r.images.count) },
    { label: tt("Other services"), value: String(r.thirdParty.length) },
  ]
  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3" data-quick-facts="">
        {facts.map((f) => (
          <div key={f.label} className="min-w-0">
            <dt className="text-[12.5px] leading-snug text-white/50">{f.label}</dt>
            <dd className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[15px] font-medium tabular-nums text-white">
              {f.rating && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RATING_DOT[f.rating] }} aria-label={ratingLabel(f.rating)} />}
              <span className="truncate">{f.value}</span>
            </dd>
          </div>
        ))}
      </dl>
      {r.findings.length > 0 ? (
        <ul className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.07]" data-quick-findings="">
          {r.findings.map((f) => (
            <li key={f.kind} className="flex gap-3 py-2.5 text-[13.5px] leading-snug text-white/80" data-finding={f.kind}>
              <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: RATING_DOT[f.severity] }} aria-label={ratingLabel(f.severity)} />
              <span className="min-w-0">{findingText(f)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 border-t border-white/[0.07] pt-3 text-[13.5px] text-white/60" data-quick-findings="none">{tt("Nothing slow found in this check.")}</p>
      )}
    </>
  )
}

function GoogleResult({ r }: { r: LabResult }) {
  const metrics: Array<[string, string | null, PerfMetric | null, number | null]> = [
    ["LCP", r.metrics.lcp === null ? null : formatPerf("lcp", r.metrics.lcp), "lcp", r.metrics.lcp],
    ["FCP", r.metrics.fcp === null ? null : formatPerf("fcp", r.metrics.fcp), "fcp", r.metrics.fcp],
    ["CLS", r.metrics.cls === null ? null : formatPerf("cls", r.metrics.cls), "cls", r.metrics.cls],
    [tt("Total Blocking Time"), r.metrics.tbt === null ? null : formatPerf("inp", r.metrics.tbt), null, null],
    [tt("Speed Index"), r.metrics.si === null ? null : formatPerf("fcp", r.metrics.si), null, null],
  ]
  return (
    <>
      <div className="flex flex-col gap-x-10 gap-y-4 md:flex-row md:items-start">
        {r.score !== null && (
          <div className="shrink-0">
            <p className="text-[12.5px] text-white/50">{tt("Performance score")}</p>
            <p className="mt-0.5 text-[28px] font-semibold leading-tight text-white">{r.score}</p>
            <RatingMark rating={scoreRating(r.score)} />
          </div>
        )}
        <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3.5 sm:grid-cols-3">
          {metrics.map(([label, value, m, raw]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[12.5px] leading-snug text-white/50">{label}</dt>
              <dd className="mt-0.5 inline-flex items-center gap-1.5 text-[15px] font-medium tabular-nums text-white">
                {m && raw !== null && <span className="h-1.5 w-1.5 rounded-full" style={{ background: RATING_DOT[ratePerf(m, raw)] }} aria-hidden />}
                {value ?? "–"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {r.opportunities.length > 0 && (
        <ul className="mt-5 divide-y divide-white/[0.06] border-t border-white/[0.07]">
          {r.opportunities.map((o) => (
            <li key={o.id} className="flex items-baseline justify-between gap-4 py-2.5 text-[13.5px]">
              <span className="min-w-0 text-white/80">{o.title}</span>
              <span className="shrink-0 tabular-nums text-white/50">
                {o.savingsMs && o.savingsMs >= 50 ? tt("about {time}", { time: formatPerf("lcp", o.savingsMs) }) : o.savingsBytes ? formatBytes(o.savingsBytes) : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

function LabCard({ ctx, lab, onRan }: { ctx: SettingsContext; lab: Record<LabStrategy, StoredLab | null>; onRan: (l: StoredLab) => void }) {
  const [strategy, setStrategy] = useState<LabStrategy>("mobile")
  const [path, setPath] = useState("/")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const current = lab[strategy]
  const pages = useMemo(() => {
    const seen = new Set<string>()
    const list = [{ path: "/", name: tt("Home page") }]
    seen.add("/")
    for (const p of ctx.pages) {
      if (!p.path || seen.has(p.path) || !p.path.startsWith("/")) continue
      seen.add(p.path)
      list.push({ path: p.path, name: p.name })
    }
    return list
  }, [ctx.pages])

  const run = async () => {
    setBusy(true)
    setError(null)
    const failed = tt("The test did not finish. Try again in a minute.")
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/performance/lab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, path, locale: activeLanguage() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.lab) throw new Error(typeof d?.error === "string" ? tt(d.error) : failed)
      onRan(d.lab as StoredLab)
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : failed)
    } finally {
      setBusy(false)
    }
  }

  const r = current?.result ?? null
  const quick = isQuickCheck(r)
  const footer = r ? (quick ? tt("Quick check from Storelib's server. Not a full browser test.") : tt("One simulated visit by Google PageSpeed Insights. Not visitor data.")) : undefined

  return (
    <Card title={tt("Lab test")} footer={footer}>
      <div className="flex flex-col gap-2.5 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center md:px-6" data-lab-controls="">
        <Segmented name="lab-device" value={strategy} onChange={setStrategy} label={tt("Device")} options={[{ id: "mobile", label: tt("Mobile") }, { id: "desktop", label: tt("Desktop") }]} />
        <select value={path} onChange={(e) => setPath(e.target.value)} aria-label={tt("Page to test")} className={cn(inputClass, "min-w-0 sm:w-auto sm:flex-1 md:w-auto md:max-w-[240px] md:flex-1")}>
          {pages.map((p) => (
            <option key={p.path} value={p.path}>{p.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void run()} disabled={busy || !ctx.live} className={cn(primaryButtonClass, "max-sm:w-full")} data-lab-run="">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {busy ? tt("Testing") : tt("Run test")}
        </button>
      </div>
      {error && <p className="px-4 py-3 text-[13.5px] text-red-300 md:px-6" role="alert">{error}</p>}
      {r && current ? (
        <div className={cn("px-4 py-4 transition-opacity duration-200 md:px-6", busy && "opacity-50")} data-lab-result={strategy} data-lab-source={quick ? "quick" : "pagespeed"}>
          {quick ? <QuickResult r={r as QuickCheckResult} /> : <GoogleResult r={r as LabResult} />}
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45" data-lab-meta="">
            <span>{tt("Tested {time}", { time: when(current.ranAt, true) })}</span>
            <span aria-hidden>·</span>
            <span className="min-w-0 max-w-full truncate">{current.url}</span>
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(current.url)}&form_factor=${strategy}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-white/70 underline underline-offset-2 hover:text-white"
            >
              {quick ? tt("Test in PageSpeed Insights") : tt("Full report")}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </div>
      ) : (
        <p className="px-4 py-4 text-[14px] text-white/50 md:px-6" data-lab-empty="">{ctx.live ? tt("Not tested yet.") : tt("Publish your website to test it.")}</p>
      )}
    </Card>
  )
}

/* ── The first load, when it is slow ─────────────────────────────────── */

/** The summary card's frame, drawn only after PERF_SKELETON_AFTER_MS, so a quick answer never shows it. */
function Placeholder() {
  return (
    <section
      data-perf-loading=""
      aria-busy
      aria-label={tt("Reading visitor speed")}
      className="mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] opacity-0 md:mt-6"
      style={{ animation: `skeleton-reveal 260ms ease-out ${PERF_SKELETON_AFTER_MS}ms forwards` }}
    >
      <div className="h-[52px] border-b border-white/[0.07]" />
      <div className="grid divide-y divide-white/[0.07] lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-4 md:px-6 md:py-5">
            <div className="h-3.5 w-10 rounded bg-white/[0.07]" />
            <div className="mt-3 h-6 w-20 rounded bg-white/[0.07]" />
            <div className="mt-4 h-1.5 w-full rounded-full bg-white/[0.06]" />
          </div>
        ))}
      </div>
      <div className="h-[232px] border-t border-white/[0.07]" />
    </section>
  )
}

/* ── The page ────────────────────────────────────────────────────────── */

/** The last answer per website and range, so coming back draws at once and reads again quietly. */
const lastAnswers = new Map<string, Answer>()

const DIMS: Dim[] = ["path", "type", "browser", "country"]

export function PerformanceSettings({ ctx }: { ctx: SettingsContext }) {
  const [range, setRange] = useState<PerfRange>("7d")
  const [device, setDevice] = useState<DeviceView>("all")
  const [metric, setMetric] = useState<RumMetric>("lcp")
  const [dim, setDim] = useState<Dim>("path")
  /* FCP, TTFB and page changes, folded under "More measures" until asked for (round AK). */
  const [more, setMore] = useState(false)
  const keyOf = useCallback((r: PerfRange) => `${ctx.installId}|${r}`, [ctx.installId])
  const [state, dispatch] = useReducer(loadReducer<Answer>, null, () => initialLoad<Answer>(lastAnswers.get(`${ctx.installId}|7d`) ?? null, `${ctx.installId}|7d`))
  const asked = useRef(0)
  const tabs = useRef<HTMLDivElement | null>(null)

  const load = useCallback(
    async (r: PerfRange) => {
      const id = ++asked.current
      const key = keyOf(r)
      dispatch({ type: "ask", key, id, cached: lastAnswers.get(key) ?? null })
      try {
        const res = await fetch(`/api/website-builder/themes/${ctx.installId}/performance?range=${r}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof d?.error === "string" ? tt(d.error) : tt("Could not load visitor speed. Try again."))
        lastAnswers.set(key, d as Answer)
        dispatch({ type: "answer", key, id, answer: d as Answer })
      } catch (e) {
        dispatch({ type: "fail", id, error: e instanceof Error && e.message ? e.message : tt("Could not load visitor speed. Try again.") })
      }
    },
    [ctx.installId, keyOf],
  )

  useEffect(() => {
    void load(range)
  }, [range, load])

  const answer = state.shown
  const view = loadView(state)
  const report = answer && answer.available ? answer.report : null
  const live = answer?.live ?? ctx.live

  const filters = (
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2.5 md:mt-6" data-perf-filters="">
      <PeriodPicker value={range} onChange={setRange} />
      <Segmented
        name="device"
        value={device}
        onChange={setDevice}
        label={tt("Device")}
        options={[
          { id: "all", label: tt("All") },
          { id: "mobile", label: tt("Mobile") },
          { id: "desktop", label: tt("Desktop") },
        ]}
      />
    </div>
  )

  let body: ReactNode
  if (state.error && !answer) {
    body = (
      <>
        <ErrorNote>{state.error}</ErrorNote>
        <button type="button" className={cn(buttonClass, "mt-3")} onClick={() => void load(range)}>{tt("Try again")}</button>
      </>
    )
  } else if (!answer) {
    body = <Placeholder />
  } else if (!answer.available) {
    body = (
      <Card>
        <div className="px-4 py-5 md:px-6" data-perf-empty="unavailable">
          <p className="text-[15px] font-medium text-white">{tt("Visitor speed is not set up yet")}</p>
          <p className="mt-1 text-[14px] text-white/55">{tt("Storelib is finishing the setup for this. Nothing is wrong with your website.")}</p>
        </div>
      </Card>
    )
  } else if (report && report.state === "no-data") {
    const recent = ctx.publishedAt && Date.now() - Date.parse(ctx.publishedAt) < 2 * 86_400_000
    body = (
      <Card>
        <div className={cn("px-4 py-5 transition-opacity duration-200 md:px-6", view.dim && "opacity-50")} data-perf-empty={live ? (recent ? "new" : "no-visits") : "unpublished"}>
          {!live ? (
            <>
              <p className="text-[15px] font-medium text-white">{tt("Publish your website to see how fast it is for visitors.")}</p>
              <button type="button" onClick={ctx.onPublish} className={cn(primaryButtonClass, "mt-4")}>{tt("Publish")}</button>
            </>
          ) : recent ? (
            <>
              <p className="text-[15px] font-medium text-white">{tt("Published {time}. Speed shows here after the first visits.", { time: when(ctx.publishedAt, true) })}</p>
              <p className="mt-1 text-[14px] text-white/55">{tt("A visit is counted when the visitor leaves the page.")}</p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-medium text-white">{tt("No visits measured in the last {period}.", { period: rangeLabel(range) })}</p>
              {report.lastViewAt && <p className="mt-1 text-[14px] text-white/55">{tt("Last visit measured {time}.", { time: when(report.lastViewAt, true) })}</p>}
            </>
          )}
        </div>
      </Card>
    )
  } else if (report) {
    const s = report.summary[device]
    const devices: Array<"mobile" | "desktop"> = device === "all" ? ["mobile", "desktop"] : [device]
    const points: ChartPoint[] = report.series.map((p) => ({
      t: p.t,
      values: { mobile: p.values.mobile[metric] ?? null, desktop: p.values.desktop[metric] ?? null },
      samples: { mobile: p.samples.mobile[metric] ?? 0, desktop: p.samples.desktop[metric] ?? 0 },
    }))
    const inpNote =
      report.noInpShare !== null && report.noInpShare >= 0.01
        ? tt("Safari does not report INP, so {share} of page views are not in it.", { share: percent(report.noInpShare) })
        : null
    const minor: RumMetric[] = s.metrics.nav.samples > 0 ? ["fcp", "ttfb", "nav"] : ["fcp", "ttfb"]
    const order: RumMetric[] = more ? [...CORE_METRICS, ...minor] : [...CORE_METRICS]
    const overall = overallRating(s)
    const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
      const next = segmentKey(order, metric, e.key)
      if (next === null) return
      e.preventDefault()
      setMetric(next)
      tabs.current?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)?.focus()
    }
    body = (
      <div className={cn("transition-opacity duration-200", view.dim && "opacity-50")} aria-busy={view.busy} data-perf-body="" data-dim={view.dim ? "" : undefined}>
        <section className="relative mt-5 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] md:mt-6" data-perf-summary="">
          <LoadingLine active={view.busy} />
          {/* Round AK: one plain sentence first, Google's name for it small beside. */}
          <div className="flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/[0.07] px-4 py-3 md:px-6" data-overall={overall ?? "none"}>
            {overall ? (
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-white">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RATING_DOT[overall] }} aria-hidden />
                {overallLine(overall)}
              </h2>
            ) : (
              <h2 className="text-[14px] font-semibold text-white/80">{tt("Not enough visits yet")}</h2>
            )}
            <span className="text-[12.5px] text-white/40">{tt("Core Web Vitals")}</span>
          </div>
          <div ref={tabs} role="tablist" aria-label={tt("Measure")} onKeyDown={onTabKey}>
            <div className="grid divide-y divide-white/[0.07] lg:grid-cols-3 lg:divide-x lg:divide-y-0" data-vitals="">
              {CORE_METRICS.map((m) => (
                <CoreTab key={m} metric={m} figure={s.metrics[m]} selected={metric === m} onSelect={() => setMetric(m)} note={m === "inp" ? inpNote : undefined} />
              ))}
            </div>
            {more && (
              <div className={cn("grid divide-x divide-white/[0.07] border-t border-white/[0.07] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200", minor.length === 3 ? "grid-cols-3" : "grid-cols-2")} data-minor="">
                {minor.map((m) => (
                  <MinorTab key={m} metric={m} figure={s.metrics[m]} selected={metric === m} onSelect={() => setMetric(m)} />
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-white/[0.07] px-4 md:px-6">
            <button
              type="button"
              aria-expanded={more}
              data-perf-more=""
              onClick={() => {
                if (more && !CORE_METRICS.includes(metric as PerfMetric)) setMetric("lcp")
                setMore(!more)
              }}
              className="inline-flex h-9 items-center gap-1.5 text-[12.5px] font-medium text-white/55 transition-colors hover:text-white/85"
            >
              {more ? tt("Fewer measures") : tt("More measures")}
              <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform duration-200", more && "rotate-180")} />
            </button>
          </div>
          <div role="tabpanel" aria-label={metricName(metric)} className="border-t border-white/[0.07] px-2 pb-3 pt-3 md:px-4" data-perf-panel="">
            <div className="flex min-h-[24px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 pb-1">
              <p className="text-[13px] text-white/60">{tt("{metric} at the 75th percentile", { metric: metricShort(metric) })}</p>
              {devices.length > 1 && (
                <div className="flex gap-4 text-[12.5px] text-white/60" data-legend="">
                  {devices.map((d) => (
                    <span key={d} className="inline-flex items-center gap-1.5">
                      <span className="h-[2px] w-3.5 rounded-full" style={{ background: DEVICE_COLOR[d] }} aria-hidden />
                      {d === "mobile" ? tt("Mobile") : tt("Desktop")}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <PerformanceChart
              points={points}
              metric={metric}
              devices={devices}
              grain={report.range === "24h" ? "hour" : "day"}
              label={tt("{metric} at the 75th percentile over the last {period}", { metric: metricShort(metric), period: rangeLabel(report.range) })}
            />
          </div>
        </section>

        {report.insights.length > 0 && (
          <Card title={tt("What to fix")}>
            {report.insights.map((i, k) => {
              const t = insightText(i)
              return (
                <div key={k} className="flex gap-3 px-4 py-4 md:px-6" data-insight={i.kind}>
                  {t.rating && <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: RATING_DOT[t.rating] }} aria-label={ratingLabel(t.rating)} />}
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-medium text-white">{t.title}</p>
                    {t.evidence && <p className="mt-1 text-[13.5px] text-white/70">{t.evidence}</p>}
                    {t.body && <p className="mt-1 text-[13.5px] leading-snug text-white/55">{t.body}</p>}
                  </div>
                </div>
              )
            })}
          </Card>
        )}

        <Card>
          <div className="flex flex-col gap-3 px-4 py-3.5 lg:flex-row lg:items-center lg:justify-between md:px-6">
            <h2 className="text-[14px] font-semibold text-white/90">{tt("Where it is slow")}</h2>
            <Segmented
              name="dim"
              ownWidthFrom="lg"
              value={dim}
              onChange={setDim}
              label={tt("Group by")}
              options={DIMS.map((d) => ({ id: d, label: d === "path" ? tt("Pages") : d === "type" ? tt("Types") : d === "browser" ? tt("Browsers") : tt("Countries") }))}
            />
          </div>
          <BreakdownTable key={`${dim}|${device}`} rows={report.breakdowns[dim][device]} dim={dim} />
        </Card>
      </div>
    )
  }

  const views = report && report.state === "ready" ? report.summary[device].views : null
  return (
    <>
      <PageTitle>{tt("Performance")}</PageTitle>
      {filters}
      {/* Always one line tall, so nothing under it moves when it fills in. */}
      <p className="mt-3 min-h-[20px] text-[13px] text-white/50" data-perf-updated="">
        {report
          ? [tt("Real visitor data"), views !== null ? tt("{count, plural, one {# page view} other {# page views}}", { count: views }) : null, tt("Updated {time}", { time: when(report.updatedAt) })].filter(Boolean).join(" · ")
          : null}
      </p>
      {report && !live && report.state === "ready" && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13.5px] text-white/70">{tt("This website is offline. These are visits from when it was live.")}</p>
      )}
      {report?.partial && <p className="mt-3 text-[13px] text-amber-200/90">{tt("Part of this period is still being counted, so these numbers may be low.")}</p>}
      {state.error && answer && <ErrorNote>{state.error}</ErrorNote>}
      {body}
      {answer && answer.available && (
        <LabCard
          ctx={{ ...ctx, live }}
          lab={answer.lab}
          onRan={(l) => {
            const next: Answer = { ...answer, lab: { ...answer.lab, [l.strategy]: l } }
            lastAnswers.set(keyOf(range), next)
            dispatch({ type: "patch", answer: next })
            void load(range)
          }}
        />
      )}
    </>
  )
}
