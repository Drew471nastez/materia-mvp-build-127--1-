"use client"

/**
 * ===========================================================================
 *  A REPORT, OPENED: THE WHOLE OF IT, BESIDE THE PAGE
 * ===========================================================================
 * Round 41, the owner: "drill-down like Shopify: every report card (and
 * metric tab) can be opened to see a more in-depth view: the full list, the
 * chart over time, comparison to previous period, breakdown".
 *
 * WHERE IT OPENS (round 43, the owner: "a centered modal, not a side panel
 * from the right"). On a computer a window in the middle of the screen, up
 * to 720px wide and 86% of the window tall, over the page under a light
 * scrim that fades in; it rises 8px and grows from 97% as it fades in, and
 * closes the same way back, quicker (app/globals.css .analytics-detail).
 * Escape, the scrim or the X closes it. On a phone it is the shared bottom
 * sheet (components/ui/bottom-sheet), tall, that follows the thumb and
 * flicks closed like every other sheet in /app.
 * Radix's dialog gives the panel its focus trap and its title for a screen
 * reader; nothing here is a page of its own, so the filters and the scroll
 * of the page are untouched when it closes.
 *
 * WHAT IT SHOWS is decided by whoever opens it (DetailView): the figure and
 * its change against the period before, its line over time with the period
 * before dashed (components/analytics/trend-mini-chart, the cards' own chart),
 * and then every row the answer has, not the top five, each with this
 * period, the period before and the change. A list long enough to look
 * through gets a search.
 *
 * EACH ROW'S OWN LINE (round 42, the owner: "each row can show its own small
 * trend over the period"). A section that names its rows' dimension
 * (`lines`: page, link, source, country...) draws a small line per row, the
 * row over the chart's buckets, beside its number. The lines are not in the
 * page's answer: they are asked for when the report opens
 * (app/api/analytics/rows, lib/analytics/row-series), one dimension at a
 * time, and kept for the question, so the page itself reads nothing more.
 * Until they come the column holds a faint rule in its place, so nothing
 * moves when they land; a row with no line (Other, a removed page) keeps the
 * rule.
 */
import * as React from "react"
import { Maximize2, Search, X } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { usePhoneWidth } from "@/components/ui/choice-list"
import { TrendMiniChart } from "@/components/analytics/trend-mini-chart"
import { tt } from "@/lib/i18n/text"

export interface DetailRow {
  key: string
  label: string
  value: number
  /** The period before; undefined when the answer has no comparison for the row. */
  previous?: number
  /** A quiet word beside the name: "Website", "13 orders". */
  note?: string | null
  /** Drawn before the name: a flag, a source's mark. */
  lead?: React.ReactNode
  strong?: boolean
  /** A figure that should fall (returns, discounts): its fall is green. */
  invert?: boolean
  /** Shown instead of formatting `value` (a rate, a dash). */
  text?: string
  previousText?: string
}

/** A dimension's lines, by row key, one number per bucket of the chart; "loading" while asked, "failed" when they could not be read. */
export type RowLines = { state: "loading" | "failed" } | { state: "ready"; series: Record<string, number[]> }

/**
 * The lines of the opened report's sections, by dimension (ReportDetailHost
 * in ./analytics-reports reads them). Without a provider no column is drawn.
 */
export const RowLinesContext = React.createContext<Record<string, RowLines> | null>(null)

export interface DetailSection {
  title: string
  /** The rows' dimension (lib/analytics/row-series RowDim): each row then draws its own line over the period. */
  lines?: string
  rows: DetailRow[]
  format: (n: number) => string
  /** Draws each row's size as a thin bar under its name. */
  bars?: boolean
  empty?: string
  /** The value column's name; "This period" when left out. */
  valueLabel?: string
}

export interface DetailView {
  title: string
  /** The switcher the card had (Source, Social, Campaign), drawn over the figure. */
  tabs?: React.ReactNode
  figure?: { value: string; now?: number | null; before?: number | null; beforeText?: string; invert?: boolean; note?: string | null }
  chart?: { labels: string[]; current: number[]; previous: number[]; format: (n: number) => string; integer?: boolean; label: string }
  sections: DetailSection[]
  /** A line under everything: what the report counts. */
  help?: string
}

/** A card's way into its detail: the page gives each card one (ReportDetailHost), a card without it draws no button. */
export const OpenDetailContext = React.createContext<((id: string, tab?: string) => void) | null>(null)

/**
 * THE WAY IN, ON EVERY CARD (round 43, the owner: "a clean icon button, not
 * the View report text"): a quiet 32px square with the expand mark at the
 * right of the card's title row, its name said to a screen reader and in a
 * tooltip on a computer ("View report"). A card outside a page that can open
 * reports (another screen drawing these cards) has none.
 */
export function ViewReport({ id, tab, className, label }: { id: string; tab?: string; className?: string; /** The report's own name, for the tooltip and a screen reader: "View Traffic sources". */ label?: string }) {
  const open = React.useContext(OpenDetailContext)
  if (!open) return null
  const name = label ? tt("View {report}", { report: label }) : tt("View report")
  return (
    <Tooltip delayDuration={350}>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-view-report={id}
          aria-label={name}
          onClick={() => open(id, tab)}
          className={cn(
            "-my-1 -mr-1.5 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-[#9ca3af] outline-none transition-[background-color,color,scale] duration-150 [-webkit-tap-highlight-color:transparent] hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_2px_rgba(139,92,246,0.4)] active:scale-95 active:bg-[#e9eaed] motion-reduce:transition-none",
            /* A finger gets the full 44px around the 32px square. */
            "relative before:absolute before:-inset-1.5 before:content-[''] sm:before:hidden",
            className,
          )}
        >
          <Maximize2 className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="hidden sm:block">{name}</TooltipContent>
    </Tooltip>
  )
}

/* ─── The panel ─────────────────────────────────────────────────────── */

/**
 * The frame: a centred window on a computer, the shared sheet on a phone.
 * `sub` is the period and what it is compared with, under the title.
 */
export function DetailPanel({ open, onClose, title, sub, children, panelKey }: { open: boolean; onClose: () => void; title: string; sub?: string | null; children: React.ReactNode; panelKey?: string }) {
  const phone = usePhoneWidth()
  const scroller = React.useRef<HTMLDivElement>(null)
  /* Another report in the same panel starts at its top. */
  React.useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0
  }, [panelKey])
  if (phone) {
    return (
      <BottomSheet
        isOpen={open}
        onClose={onClose}
        label={title}
        height="calc(var(--vv-h, 100dvh) * 0.9)"
        maxHeight="calc(var(--vv-h, 100dvh) * 0.9)"
        scrollKey={panelKey}
        header={
          <div className="px-5 pb-3 pt-2" data-detail-head="">
            <p className="truncate text-[17px] font-semibold text-[#1a1a2e]">{title}</p>
            {sub ? <p className="mt-0.5 truncate text-[12.5px] tabular-nums text-[#6b7280]">{sub}</p> : null}
          </div>
        }
      >
        <div data-report-detail="" data-detail-sheet="" className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </BottomSheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent
        disableDefaultAnimations
        showCloseButton={false}
        aria-describedby={undefined}
        data-report-detail=""
        data-detail-panel=""
        disableOverlayDefaultAnimations={false}
        overlayClassName="bg-[#111827]/[0.28]"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
        }}
        className="analytics-detail flex max-h-[min(86dvh,880px)] w-[min(720px,calc(100vw-48px))] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border border-[#e5e7eb]/70 bg-white p-0 shadow-[0_32px_80px_-24px_rgba(17,24,39,0.35),0_4px_12px_rgba(17,24,39,0.06)] outline-none sm:max-w-none"
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[#eef0f2] px-6 pb-4 pt-5" data-detail-head="">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-[18px] font-semibold text-[#1a1a2e]">{title}</DialogTitle>
            {sub ? <p className="mt-0.5 truncate text-[13px] tabular-nums text-[#6b7280]">{sub}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tt("Close")}
            data-detail-close=""
            className="-mr-2 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg text-[#6b7280] outline-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:shadow-[0_0_0_2px_rgba(139,92,246,0.4)]"
          >
            <X className="h-[18px] w-[18px]" aria-hidden />
          </button>
        </div>
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-8 pt-5" data-detail-scroll="">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── What is in it ─────────────────────────────────────────────────── */

function changeText(now: number, before: number | undefined, invert = false): { text: string; tone: "up" | "down" | "flat" } | null {
  if (before === undefined) return null
  if (before === 0) return now > 0 ? { text: tt("New"), tone: "flat" } : { text: "–", tone: "flat" }
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  if (pct === 0) return { text: "0%", tone: "flat" }
  const good = invert ? pct < 0 : pct > 0
  return { text: `${pct > 0 ? "+" : "−"}${Math.abs(pct)}%`, tone: good ? "up" : "down" }
}

function ChangeCell({ now, before, invert }: { now: number; before: number | undefined; invert?: boolean }) {
  const c = changeText(now, before, invert)
  if (!c) return null
  return <span className={cn("tabular-nums", c.tone === "up" ? "text-[#15803d]" : c.tone === "down" ? "text-[#b42318]" : "text-[#9ca3af]")}>{c.text}</span>
}

/** Lower case and without accents, so "sao" finds São Paulo. */
const folded = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const SEARCH_FROM = 9

/**
 * A ROW'S LINE: its numbers over the period as one thin stroke, scaled to
 * the row's own highest, on a faint base. A row with nothing in it, or whose
 * line has not come yet, is the base alone.
 */
const SPARK_W = 64
const SPARK_H = 20
function RowLine({ values, ready }: { values: number[] | undefined; ready: boolean }) {
  const ys = values && values.length > 1 ? values : null
  const max = ys ? Math.max(...ys.map((v) => Math.max(0, v))) : 0
  const points = ys && max > 0 ? ys.map((v, i) => `${((i / (ys.length - 1)) * SPARK_W).toFixed(1)},${(SPARK_H - 1.5 - (Math.max(0, v) / max) * (SPARK_H - 3)).toFixed(1)}`).join(" ") : null
  return (
    <svg aria-hidden viewBox={`0 0 ${SPARK_W} ${SPARK_H}`} preserveAspectRatio="none" data-row-line={points ? "" : "empty"} className="block h-5 w-[48px] overflow-visible sm:w-[64px]">
      <line x1="0" x2={SPARK_W} y1={SPARK_H - 0.5} y2={SPARK_H - 0.5} stroke="#eef0f2" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {points ? (
        <polyline
          points={points}
          fill="none"
          stroke="#8b5cf6"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={cn("transition-opacity duration-300 motion-reduce:transition-none", ready ? "opacity-100" : "opacity-0")}
        />
      ) : null}
    </svg>
  )
}

function Section({ s, compared }: { s: DetailSection; compared: boolean }) {
  const [query, setQuery] = React.useState("")
  const allLines = React.useContext(RowLinesContext)
  const lines = s.lines && allLines ? allLines[s.lines] ?? { state: "loading" as const } : null
  const series = lines && lines.state === "ready" ? lines.series : null
  const withPrevious = compared && s.rows.some((r) => r.previous !== undefined || r.previousText !== undefined)
  const q = folded(query.trim())
  const rows = q ? s.rows.filter((r) => folded(`${r.label} ${r.note ?? ""}`).includes(q)) : s.rows
  const max = Math.max(1, ...s.rows.map((r) => Math.abs(r.value)))
  return (
    <section className="mt-7 first:mt-0" data-detail-section={s.title}>
      <div className="flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-[#1a1a2e]">{s.title}</h3>
        {s.rows.length > 1 ? <span className="text-[12.5px] tabular-nums text-[#9ca3af]">{s.rows.length}</span> : null}
      </div>
      {s.rows.length >= SEARCH_FROM ? (
        <label className="mt-3 flex h-9 cursor-text items-center gap-2 rounded-lg bg-[#f4f5f7] pl-3 pr-1 transition-[background-color,box-shadow] duration-150 focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_#d1d5db,0_0_0_3px_rgba(17,24,39,0.05)]">
          <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" aria-hidden />
          <input
            type="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tt("Search {list}", { list: s.title })}
            placeholder={tt("Search")}
            data-detail-search=""
            className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button type="button" aria-label={tt("Clear search")} onClick={() => setQuery("")} className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-md text-[#9ca3af] hover:text-[#4b5563]">
              <X className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
        </label>
      ) : null}
      {s.rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#6b7280]">{s.empty ?? tt("Nothing in this period.")}</p>
      ) : (
        <table className="mt-2 w-full table-fixed border-collapse text-[13px]" data-detail-table="">
          <thead>
            <tr className="h-8 text-left text-[11.5px] font-medium text-[#9ca3af]">
              <th className="font-medium">
                <span className="sr-only">{tt("Name")}</span>
              </th>
              {lines ? (
                <th className="w-[60px] font-medium sm:w-[76px]">
                  <span className="sr-only">{tt("Over the period")}</span>
                </th>
              ) : null}
              <th className="w-[96px] text-right font-medium sm:w-[112px]">{s.valueLabel ?? tt("This period")}</th>
              {withPrevious ? <th className="hidden w-[96px] text-right font-medium sm:table-cell">{tt("Previous")}</th> : null}
              {withPrevious ? <th className="w-[60px] text-right font-medium">{tt("Change")}</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f2f4] border-t border-[#f1f2f4]">
            {rows.map((r) => (
              <tr key={r.key} data-detail-row={r.key} className={cn("align-middle", r.strong ? "font-semibold text-[#1a1a2e]" : "text-[#303036]")}>
                <td className="py-2.5 pr-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {r.lead}
                    <span className="min-w-0 truncate" title={r.label}>{r.label}</span>
                    {r.note ? <span className="min-w-0 shrink truncate text-[12px] text-[#9ca3af]">{r.note}</span> : null}
                  </div>
                  {s.bars ? (
                    <span aria-hidden data-detail-bar="" className="mt-1.5 block h-1 rounded-full bg-[linear-gradient(180deg,#e8eaee_0%,#dcdfe4_100%)]" style={{ width: `${Math.max(2, (Math.abs(r.value) / max) * 100).toFixed(1)}%` }} />
                  ) : null}
                </td>
                {lines ? (
                  <td className="py-2.5 pr-1" data-detail-line={lines.state}>
                    <span className="flex justify-end">
                      <RowLine values={series?.[r.key]} ready={!!series} />
                    </span>
                  </td>
                ) : null}
                <td className="py-2.5 text-right font-medium tabular-nums text-[#1a1a2e]">{r.text ?? s.format(r.value)}</td>
                {withPrevious ? <td className="hidden py-2.5 text-right tabular-nums text-[#6b7280] sm:table-cell">{r.previousText ?? (r.previous === undefined ? "" : s.format(r.previous))}</td> : null}
                {withPrevious ? (
                  <td className="py-2.5 text-right text-[12.5px]">
                    <ChangeCell now={r.value} before={r.previous} invert={r.invert} />
                  </td>
                ) : null}
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="h-20 text-center text-[13px] text-[#6b7280]">
                  {tt("Nothing matches “{query}”.", { query: query.trim() })}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
    </section>
  )
}

const NONE: number[] = []

/** The opened report: its switcher, its figure and change, its line over time, and every row. */
export function DetailBody({ view, compared }: { view: DetailView; compared: boolean }) {
  const f = view.figure
  const change = f && f.now !== undefined && f.now !== null && f.before !== undefined && f.before !== null && compared ? changeText(f.now, f.before, f.invert) : null
  return (
    <div data-detail-body="">
      {view.tabs ? <div className="orders-strip -mx-1 mb-4 overflow-x-auto px-1">{view.tabs}</div> : null}
      {f ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1" data-detail-figure="">
          <span className="text-[30px] font-bold leading-9 tabular-nums tracking-tight text-[#1a1a2e]">{f.value}</span>
          {change ? <span className={cn("text-[14px] font-medium tabular-nums", change.tone === "up" ? "text-[#15803d]" : change.tone === "down" ? "text-[#b42318]" : "text-[#9ca3af]")}>{change.text}</span> : null}
          {compared && f.beforeText ? <span className="text-[13px] tabular-nums text-[#6b7280]">{tt("{value} in the previous period", { value: f.beforeText })}</span> : null}
          {f.note ? <span className="basis-full text-[13px] text-[#6b7280]">{f.note}</span> : null}
        </div>
      ) : null}
      {view.chart && view.chart.labels.length > 1 ? (
        <div className="mt-5" data-detail-chart="">
          <TrendMiniChart labels={view.chart.labels} current={view.chart.current} previous={compared ? view.chart.previous : NONE} format={view.chart.format} height={170} integer={view.chart.integer} label={view.chart.label} />
        </div>
      ) : null}
      <div className={f || view.chart ? "mt-8" : undefined}>
        {view.sections.map((s) => (
          <Section key={s.title} s={s} compared={compared} />
        ))}
      </div>
      {view.help ? <p className="mt-8 text-[12.5px] leading-5 text-[#9ca3af]">{view.help}</p> : null}
    </div>
  )
}
