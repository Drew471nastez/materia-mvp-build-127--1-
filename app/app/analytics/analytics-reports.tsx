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
 * in a dialog, so a wheel or a thumb over a card always moves the page.
 *
 * MOTION IS TRANSFORM AND OPACITY, but for the fills. A switcher's pill
 * fades in under the tab, a card arrives by rising and fading, and a card
 * moved in the order slides from where it was (FLIP). A fill (GREY_FILL)
 * grows its own width: it is placed on its own (absolute, or a box nothing
 * else depends on), so nothing around it is laid out again, and its rounded
 * end and its soft edge stay whole, which a slide inside a clipped track
 * could not keep.
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
import { MoreHorizontal } from "lucide-react"
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
import { formatCurrency } from "@/lib/markets/money"

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
const EASE = "cubic-bezier(0.32,0.72,0,1)"

/* The store's own currency (Settings › Languages & Currency), set by AnalyticsReports from the /app layout's: lei for a store in lei. */
let reportCurrency = "USD"
const fmtMoney = (cents: number) => formatCurrency((cents || 0) / 100, reportCurrency, appLocale())
const fmtCount = (n: number) => Math.round(n).toLocaleString(appLocale())
const fmtPct = (f: number) => `${(f * 100).toFixed(f > 0 && f < 0.1 ? 1 : 0).replace(/\.0+$/, "")}%`
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
}: {
  title: string
  help: string
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
          {actions}
        </div>
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

/**
 * A SWITCHER: Polaris's segmented control in Storelib's greys. The chosen
 * tab's white pill fades and settles in (opacity and scale), the others'
 * fade out, so a switch is two compositor layers and no layout. Arrow keys
 * move between tabs, as a tablist's should.
 */
function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label?: string }) {
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
    <div role="tablist" aria-label={label} data-segmented="" onKeyDown={onKey} className="inline-flex shrink-0 items-center gap-0.5 rounded-[10px] bg-[#f1f2f4] p-[3px]">
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
            <span
              aria-hidden
              data-segment-pill=""
              className={cn(
                "absolute inset-0 rounded-[7px] bg-white shadow-[0_1px_2px_rgba(17,24,39,0.10),0_0_0_0.5px_rgba(17,24,39,0.06)] transition-[opacity,scale] duration-200 motion-reduce:transition-none",
                on ? "scale-100 opacity-100" : "scale-[0.92] opacity-0",
              )}
              style={{ transitionTimingFunction: EASE }}
            />
            <span className={cn("relative whitespace-nowrap", on ? "text-[#1a1a2e]" : "text-[#6b7280] group-hover:text-[#1a1a2e]")}>{o.label}</span>
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
 * A FILL: GREY_FILL at its share of the width, grown from the left (its
 * width, 500ms, on a box placed on its own). `share` is 0 to 1; `min` keeps
 * a counted row visible.
 */
function Fill({ share, className, min = 0.02 }: { share: number; className?: string; min?: number }) {
  const s = Math.max(min, Math.min(1, Number.isFinite(share) ? share : 0))
  return (
    <div
      aria-hidden
      data-bar=""
      data-fill="grey"
      data-share={s.toFixed(3)}
      className={cn(GREY_FILL, "transition-[width,filter] duration-500 group-hover:brightness-[0.975] motion-reduce:transition-none", className)}
      style={{ width: `${(s * 100).toFixed(2)}%`, transitionTimingFunction: EASE }}
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
          <span className={cn("min-w-0 truncate text-[13px] text-[#303036]", !lead && "pl-1.5")} title={r.label}>
            {r.label}
          </span>
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
}: {
  rows: ListRow[]
  format: (n: number) => string
  lead?: Lead
  empty: string
  title: string
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
        <button type="button" onClick={() => setAll(true)} className="mt-auto min-h-[32px] w-fit cursor-pointer rounded-md py-1 text-[12px] font-medium text-[#7c3aed] hover:underline">
          {tt("View all {length}", { length: rows.length })}
        </button>
      ) : null}
      <Dialog open={all} onOpenChange={setAll}>
        <DialogContent className="max-h-[80vh] w-[calc(100%-32px)] max-w-[480px] gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white p-0">
          <div className="border-b border-[#eef0f2] px-5 py-4">
            <DialogTitle className="text-[15px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
          </div>
          <ol className="max-h-[calc(80vh-64px)] overflow-y-auto px-5 py-2">
            {rows.map((r) => (
              <Row key={r.key} r={r} max={max} format={format} lead={lead} previous={before(r)} />
            ))}
          </ol>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Breakdown rows as list rows, and their comparison by key. */
function fromBreakdown(rows: BreakdownRow[], note?: (r: BreakdownRow) => string | null): { rows: ListRow[]; previous: Record<string, number> } {
  return {
    rows: rows.map((r) => ({ key: r.key, label: r.label, value: r.value, note: note?.(r) ?? null, code: r.extra?.code })),
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

/** The step where the largest share of people did not go on, among the steps with a rate. */
export function biggestDrop(steps: FunnelStep[]): FunnelStep | null {
  let worst: FunnelStep | null = null
  for (const s of steps) if (s.rate !== null && s.rate < 1 && (!worst || s.rate < (worst.rate ?? 1))) worst = s
  return worst
}

/**
 * FROM A VISIT TO AN ORDER, IN PEOPLE, AS A LIST: five steps one under the
 * other, each a line with its name, its count and the share of the step
 * before, over a thin bar of its count against the visitors. The step that
 * loses the most people says so in its rate's colour and in the line under
 * the list. A step nothing was recorded for, while a later one has
 * something, says "Not recorded" rather than a 0% that would read as nobody
 * going on.
 */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(...steps.map((s) => s.value), 1)
  const drop = biggestDrop(steps)
  return (
    <div className="mt-1 flex flex-1 flex-col" data-funnel="">
      <ol className="flex flex-col gap-1.5">
        {steps.map((s) => {
          const worst = drop?.key === s.key
          return (
            <li
              key={s.key}
              data-step={s.key}
              data-drop={worst ? "" : undefined}
              title={s.recorded ? `${s.label}: ${fmtCount(s.value)}${s.rate !== null ? `, ${fmtPct(s.rate)} ${OF[s.key]}` : ""}` : `${s.label}: ${tt("Not recorded")}`}
            >
              <div className="flex h-5 items-baseline gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-[#303036]">{s.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-[#1a1a2e]">{s.recorded ? fmtCount(s.value) : "–"}</span>
                <span className={cn("w-12 shrink-0 text-right text-[12px] tabular-nums", worst ? "font-medium text-[#b42318]" : "text-[#9ca3af]")}>
                  {!s.recorded ? "" : s.rate !== null ? fmtPct(s.rate) : ""}
                </span>
              </div>
              <Fill share={s.recorded ? s.value / top : 0} min={s.recorded ? 0.015 : 0} className="mt-1 h-[6px] rounded-full" />
            </li>
          )
        })}
      </ol>
      <p className="mt-auto truncate pt-2 text-[12px] text-[#6b7280]" data-funnel-note="">
        {steps.some((s) => !s.recorded)
          ? tt("Not recorded: {steps}", { steps: steps.filter((s) => !s.recorded).map((s) => s.label.toLowerCase()).join(", ") })
          : drop && drop.rate !== null
            ? tt("Biggest drop: {step}, {share} lost", { step: drop.label, share: fmtPct(1 - drop.rate) })
            : " "}
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
        <div className="mt-1 flex flex-col gap-1.5">
          {[1, 0.62, 0.3, 0.22, 0.12].map((w, i) => (
            <div key={i}>
              <div className="flex h-5 items-center gap-2">
                <ShimmerBlock className="h-3 w-1/3 rounded-full" />
                <span className="flex-1" />
                <ShimmerBlock className="h-3 w-9 rounded-full" />
              </div>
              <ShimmerBlock className="mt-1 h-[6px] rounded-[3px]" style={{ width: `${Math.max(8, w * 100)}%` }} />
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
 * A FIGURE AND ITS COLUMNS: the period's number, its change, and one column
 * per bucket of the chart's own buckets, grown from the baseline (scaleY).
 * The added reports' cards: the same series the answer carries, drawn in the
 * card, never on the chart.
 */
function Columns({ value, change, series, format }: { value: string; change: React.ReactNode; series: Series; format: (n: number) => string }) {
  const values = series.current
  const max = Math.max(1, ...values)
  const label = (i: number) => series.labels[i] ?? ""
  return (
    <div className="flex h-full flex-col" data-columns="">
      <div className="flex h-9 items-baseline gap-2.5" data-figure="">
        <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{value}</span>
        {change}
      </div>
      <div className="mt-4 flex h-[150px] items-end gap-[3px]" role="img" aria-label={values.map((v, i) => `${label(i)}: ${format(v)}`).join(", ")}>
        {values.map((v, i) => (
          <div key={i} className="relative h-full min-w-0 flex-1" title={`${label(i)}: ${format(v)}`}>
            <div
              data-column=""
              className="absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-[3px] transition-transform duration-500 motion-reduce:transition-none"
              style={{ background: v > 0 ? ACCENT : "#eceef1", transform: `scaleY(${v > 0 ? Math.max(0.03, v / max) : 0.02})`, transitionTimingFunction: EASE }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#9ca3af]">
        <span>{label(0)}</span>
        <span>{label(values.length - 1)}</span>
      </div>
    </div>
  )
}

/* ─── The cards ───────────────────────────────────────────────────────── */

type SourceTab = "source" | "social" | "campaign"
type DeviceTab = "device" | "browser"
type SignupTab = "property" | "source"
type CountryTab = "visitors" | "orders"
type ProductTab = "all" | "physical" | "digital"

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
 * TOP PRODUCTS, ALL OR ONE KIND. With both kinds on sale, a line of figures
 * over the list: for Physical the units, for Digital the share of orders
 * downloaded at least once.
 */
function ProductsBody({ r, tab, figure }: { r: Reports; tab: ProductTab; figure: boolean }) {
  const kind = (k: string | null | undefined) => (k === "physical" ? "physical" : "digital")
  const physical = r.kinds.find((k) => k.key === "physical")
  const digitalKinds = r.kinds.filter((k) => k.key !== "physical")
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
  const rows: ListRow[] =
    tab === "digital"
      ? r.digital.top.map((p) => ({ key: p.key, label: p.label, value: p.salesCents, note: [plural(p.orders, tt("order"), tt("orders")), p.downloads !== null ? plural(p.downloads, tt("download"), tt("downloads")) : null].filter(Boolean).join(" · ") }))
      : r.topProducts
          .filter((p) => tab === "all" || (p.kind != null && kind(p.kind) === tab))
          .map((p) => ({ key: p.key, label: p.label, value: p.salesCents, note: `${plural(p.orders, tt("order"), tt("orders"))} · ${plural(p.views, tt("view"), tt("views"))}` }))
  const head =
    tab === "physical"
      ? { value: physical?.salesCents ?? 0, note: `${plural(physical?.orders ?? 0, tt("order"), tt("orders"))} · ${plural(physical?.units ?? 0, tt("unit"), tt("units"))}` }
      : tab === "digital"
        ? {
            value: r.digital.salesCents,
            note: [plural(r.digital.orders, tt("order"), tt("orders")), r.digital.downloads && r.digital.orders > 0 ? tt("{share} downloaded", { share: fmtPct(r.digital.downloads.orders / r.digital.orders) }) : null].filter(Boolean).join(" · "),
          }
        : { value: sum(r.kinds.map((k) => k.salesCents)), note: [physical ? tt("{share} physical", { share: fmtPct(physical.share) }) : null, digitalKinds.length ? tt("{share} digital", { share: fmtPct(sum(digitalKinds.map((k) => k.share))) }) : null].filter(Boolean).join(" · ") }
  return (
    <>
      {figure ? (
        <div className="flex h-9 items-baseline gap-2.5" data-figure="">
          <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtMoney(head.value)}</span>
          <span className="truncate text-[12px] tabular-nums text-[#6b7280]">{head.note}</span>
        </div>
      ) : null}
      <List key={tab} title={tt("Top products")} rows={rows} format={fmtMoney} empty={tab === "physical" ? tt("No physical sales in this period.") : tab === "digital" ? tt("No digital sales in this period.") : tt("No product views or orders in this period.")} />
    </>
  )
}

/**
 * THE CARDS, drawn whether or not the answer is in (`r` null): every title
 * and every switcher on the first paint, each body waiting in its own height.
 */
function Grid({ r, property, sections, extra, added }: { r: Reports | null; property: PropertySelector; sections: Sections; extra?: React.ReactNode; added?: AddedProps }) {
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const [deviceTab, setDeviceTab] = React.useState<DeviceTab>("device")
  const [signupTab, setSignupTab] = React.useState<SignupTab>(property.type === "all" ? "property" : "source")
  const [countryTab, setCountryTab] = React.useState<CountryTab>("visitors")
  const [productTab, setProductTab] = React.useState<ProductTab>("all")
  const lists = !!r && !r.partial
  const visits = (row: BreakdownRow) => `${Math.round(row.share * 100)}%`
  const b = r?.breakdowns
  const onePage = property.type === "onepage"
  const both = sections.productKinds
  const tab: ProductTab = both ? productTab : "all"
  const signupsByPage = property.type === "all" && signupTab === "property"
  return (
    <>
      <Card
        card="traffic"
        title={tt("Traffic sources")}
        help={tt("Where each visit came from, judged by its first page: a search engine, a social app, an email, another website, or typed in directly.")}
        tabs={<Tabs label={tt("Traffic sources")} value={sourceTab} onChange={setSourceTab} options={SOURCE_TABS} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const traffic = fromBreakdown(b[sourceTab], visits)
            return <List key={sourceTab} title={tt("Traffic sources")} rows={traffic.rows} previous={traffic.previous} format={fmtCount} lead={{ icon: sourceTab }} empty={SOURCE_EMPTY[sourceTab]} />
          })() : null}
        </Body>
      </Card>

      <Card
        card="referrers"
        title={tt("Referrers")}
        help={tt("The sites and apps that sent each visit, by its first page: one line per company, whichever of its addresses or apps the link came through. Visits with no referrer are Direct, under Traffic sources.")}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const referrers = fromBreakdown(b.referrer, visits)
            return <List title={tt("Referrers")} rows={referrers.rows} previous={referrers.previous} format={fmtCount} lead={{ icon: "referrer" }} empty={tt("No visits from other websites or apps in this period.")} />
          })() : null}
        </Body>
      </Card>

      {onePage ? (
        <Card card="pages" title={tt("Top links")} help={tt("The links and buttons on your OnePage that were tapped most, by the name they have on the page, and how many people tapped each.")}>
          <Body blank={!lists} wait="list">
            {lists && r ? (
              <List
                title={tt("Top links")}
                rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) }))}
                format={fmtCount}
                empty={tt("No link taps in this period. Add links to your OnePage.")}
              />
            ) : null}
          </Body>
        </Card>
      ) : (
        <Card card="pages" title={tt("Top pages")} help={tt("Each page by its exact address and title, with its views and how many people opened it. A page opened again within half an hour counts once.")}>
          <Body blank={!lists} wait="list">
            {lists && r ? (
              <List
                title={tt("Top pages")}
                rows={r.topPages.map((p) => ({ key: p.key, label: p.label, value: p.views, note: [p.title, p.place, plural(p.visitors, tt("visitor"), tt("visitors"))].filter(Boolean).join(" · ") }))}
                format={fmtCount}
                empty={tt("No pages opened in this period. Share a link to one of your pages.")}
              />
            ) : null}
          </Body>
        </Card>
      )}

      {sections.topProducts ? (
        <Card
          card="products"
          title={tt("Top products")}
          help={tt("Revenue from each product, less refunds, with its orders and how often its page was opened. Physical and Digital split them by kind; Digital counts how many orders were downloaded.")}
          tabs={both ? <Tabs label={tt("Top products")} value={tab} onChange={setProductTab} options={[{ value: "all", label: tt("All") }, { value: "physical", label: tt("Physical") }, { value: "digital", label: tt("Digital") }]} /> : undefined}
        >
          <Body blank={!lists} wait={both ? "figure" : "list"}>
            {lists && r ? <ProductsBody r={r} tab={tab} figure={both} /> : null}
          </Body>
        </Card>
      ) : null}

      <Card
        card="funnel"
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
                      <List key={signupTab} title={tt("Subscribers")} rows={signups.rows} previous={signups.previous} format={fmtCount} empty={tt("No sign-ups in this period. Add a sign-up form to your page.")} />
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
        title={tt("Countries")}
        help={tt("Visitors: where visits came from, from their connection. Orders: where buyers are, from the order, with their revenue.")}
        tabs={<Tabs label={tt("Countries")} value={countryTab} onChange={setCountryTab} options={[{ value: "visitors", label: tt("Visitors") }, { value: "orders", label: tt("Orders") }]} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const countries = countryTab === "orders" ? fromBreakdown(b.orderCountry, (row) => fmtMoney(row.extra?.salesCents ?? 0)) : fromBreakdown(b.country, visits)
            return <List key={countryTab} title={tt("Countries")} rows={countries.rows} previous={countries.previous} format={fmtCount} lead={{ flag: true }} empty={countryTab === "orders" ? tt("No orders with a country in this period.") : tt("No locations recorded in this period.")} />
          })() : null}
        </Body>
      </Card>

      <Card card="os" title={tt("Operating systems")} help={tt("Visitors by the system of their device, with its share of all visitors. Read from the browser's signature, and from its platform hint where the signature is vague.")}>
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const systems = fromBreakdown(b.os, visits)
            return <List title={tt("Operating systems")} rows={systems.rows} previous={systems.previous} format={fmtCount} lead={{ icon: "os" }} empty={tt("No visits in this period.")} />
          })() : null}
        </Body>
      </Card>

      <Card
        card="devices"
        title={tt("Devices")}
        help={tt("The device and browser of the first page of each visit.")}
        tabs={<Tabs label={tt("Devices")} value={deviceTab} onChange={setDeviceTab} options={[{ value: "device", label: tt("Device") }, { value: "browser", label: tt("Browser") }]} />}
      >
        <Body blank={!lists} wait="list">
          {lists && b ? (() => {
            const devices = fromBreakdown(b[deviceTab], visits)
            return <List key={deviceTab} title={deviceTab === "device" ? tt("Devices") : tt("Browsers")} rows={devices.rows} previous={devices.previous} format={fmtCount} lead={{ icon: deviceTab }} empty={tt("No visits in this period.")} />
          })() : null}
        </Body>
      </Card>
      {extra}
      {added ? <AddedCards r={r} lists={lists} {...added} /> : null}
    </>
  )
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
  refunds: { get title() { return tt("Refunded orders") }, get help() { return tt("Orders from this period that were refunded, in whole or in part.") } },
  downloads: { get title() { return tt("Downloads") }, get help() { return tt("How many of this period's digital orders were downloaded, and which products.") } },
}

const sumOf = (xs: number[] | undefined) => (xs ?? []).reduce((a, b) => a + b, 0)
const delta = (value: number, previous: number): Headline => ({ value, previous, change: previous === 0 ? null : (value - previous) / previous })

function AddedBody({ id, r }: { id: ReportId; r: Reports }) {
  if (id === "pageviews") return <Columns value={fmtCount(r.views.value)} change={<Change h={r.views} />} series={r.views.series} format={fmtCount} />
  if (id === "sessions") return <Columns value={fmtCount(r.sessions.value)} change={<Change h={r.sessions} />} series={r.sessions.series} format={fmtCount} />
  if (id === "clicks") {
    const h = delta(r.linkClicks?.value ?? 0, sumOf(r.linkClicks?.series.previous))
    return <Columns value={fmtCount(h.value)} change={<Change h={h} />} series={r.linkClicks.series} format={fmtCount} />
  }
  if (id === "refunds") {
    const h = delta(sumOf(r.refunds?.series.current), sumOf(r.refunds?.series.previous))
    return <Columns value={fmtCount(h.value)} change={<Change h={h} />} series={r.refunds.series} format={fmtCount} />
  }
  if (id === "toplinks") {
    return <List title={REPORT_COPY.toplinks.title} rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, tt("person"), tt("people")) }))} format={fmtCount} empty={tt("No link taps in this period. Add links to your OnePage.")} />
  }
  if (r.digital?.downloads == null) return <Empty>{r.digital && r.digital.downloads === null ? tt("Downloads could not be read. Refresh the page to try again.") : tt("No downloads in this period.")}</Empty>
  return (
    <>
      <div className="flex h-9 items-baseline gap-2.5" data-figure="">
        <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtCount(r.digital.downloads.total)}</span>
        <span className="truncate text-[12px] tabular-nums text-[#6b7280]">{r.digital.orders > 0 ? tt("{share} of orders", { share: fmtPct(r.digital.downloads.orders / r.digital.orders) }) : tt("No digital orders")}</span>
      </div>
      <List title={REPORT_COPY.downloads.title} rows={r.digital.top.map((p) => ({ key: p.key, label: p.label, value: p.downloads ?? 0, note: plural(p.orders, tt("order"), tt("orders")) }))} format={fmtCount} empty={tt("No downloads in this period.")} />
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
            <Body blank={!lists} wait={id === "toplinks" ? "list" : id === "downloads" ? "figure" : "columns"}>
              {lists && r ? <AddedBody id={id} r={r} /> : null}
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
  }, [start, end, cs, ce, product, property, refresh, viewer, ccy])
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
}) {
  reportCurrency = useStoreCurrency()
  return state ? (
    <ReportsView state={state} property={property} sections={sections} extra={extra} added={added} />
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

function ReportsView({ state, property, sections, extra, added }: { state: ReportsState; property: PropertySelector; sections: Sections; extra?: React.ReactNode; added?: AddedProps }) {
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
      <div aria-busy={loading} data-analytics-cards="" data-soft={soft ? "" : undefined} className={cn("relative grid gap-4 transition-opacity duration-300 md:grid-cols-2 xl:grid-cols-3", soft ? "opacity-60" : "opacity-100")}>
        {failed && (!shown || shown.reports.partial) ? (
          <p className="rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3 text-[13px] text-[#8a1c0f] md:col-span-2 xl:col-span-3">
            {tt("The reports could not be loaded. Refresh the page to try again.")}
          </p>
        ) : null}

        <Grid r={shown?.reports ?? null} property={countedFor} sections={sections} extra={extra} added={added} />

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
