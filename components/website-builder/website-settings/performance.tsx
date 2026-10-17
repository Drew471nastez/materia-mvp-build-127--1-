"use client"

/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE
 * ===========================================================================
 * How fast the published website is for the people who visit it, in the
 * shape of Shopify's Web performance report: the three Core Web Vitals and
 * two loading measures at their 75th percentile with Google's ratings, the
 * share of page views in each band, the change from the previous period,
 * the line over time, where it is slow (page, page type, browser, country),
 * and what to fix first. Under it, apart, a lab test by Google PageSpeed
 * Insights, which is one simulated load and says so.
 *
 * Every number is from the website's own visitors (lib/perf/site-vitals-
 * inline.ts → app/api/public/vitals → part 210), read by
 * lib/website-builder/web-performance-read.ts. Nothing is drawn that the
 * data does not hold: under MIN_SAMPLES page views a figure says "Not
 * enough visits yet", a chart point with too few visits is a gap, and an
 * insight is only made from a rating the data gave.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { ArrowDown, ArrowUp, ExternalLink, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { activeLanguage, tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { Card, ErrorNote, PageTitle, buttonClass, primaryButtonClass, inputClass } from "./parts"
import type { SettingsContext } from "./types"
import { PerformanceChart, DEVICE_COLOR, type ChartPoint } from "./performance-chart"
import {
  CORE_METRICS,
  directionOf,
  formatPerf,
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
import { fileNameOf, formatBytes, type LabResult, type LabStrategy } from "@/lib/website-builder/pagespeed"

interface StoredLab {
  strategy: LabStrategy
  url: string
  ranAt: string
  result: LabResult
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

function metricShort(m: RumMetric): string {
  return m === "nav" ? tt("Page changes") : SHORT[m]
}

function ratingLabel(r: PerfRating): string {
  return r === "good" ? tt("Good") : r === "poor" ? tt("Poor") : tt("Needs improvement")
}

function rangeLabel(r: PerfRange): string {
  return r === "24h" ? tt("24 hours") : r === "7d" ? tt("7 days") : r === "30d" ? tt("30 days") : tt("90 days")
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

/* ── Small parts ─────────────────────────────────────────────────────── */

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-[10px] border border-white/[0.12] bg-white/[0.03] p-[3px] md:inline-flex md:w-auto md:rounded-lg">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "h-[38px] min-w-0 flex-1 truncate whitespace-nowrap rounded-[7px] font-medium md:flex-none md:px-3",
            /* Four or more on a phone's width: a little tighter, so every label fits whole. */
            options.length >= 4 ? "px-1 text-[13px]" : "px-1.5 text-[14px]",
            " transition-colors duration-150 md:h-8 md:rounded-md md:text-[13.5px] [-webkit-tap-highlight-color:transparent]",
            value === o.id ? "bg-white/[0.12] text-white" : "text-white/60 hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function RatingMark({ rating }: { rating: PerfRating }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/80">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RATING_DOT[rating] }} aria-hidden />
      {ratingLabel(rating)}
    </span>
  )
}

function Bands({ figure }: { figure: MetricFigure }) {
  const b = figure.bands
  if (!b) return null
  const parts: Array<[PerfRating, number]> = [
    ["good", b.good],
    ["needs-improvement", b.needsImprovement],
    ["poor", b.poor],
  ]
  return (
    <div className="mt-3">
      <div className="flex h-1.5 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map(([r, s]) => `${ratingLabel(r)} ${percent(s)}`).join(", ")}>
        {parts.map(([r, s]) => (s > 0 ? <span key={r} style={{ flexGrow: s, background: RATING_DOT[r] }} className="min-w-[2px]" /> : null))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-white/55">
        {parts.map(([r, s]) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: RATING_DOT[r] }} aria-hidden />
            {percent(s)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Delta({ metric, figure }: { metric: RumMetric; figure: MetricFigure }) {
  const dir = directionOf(figure.p75, figure.previous)
  if (dir === null || figure.p75 === null || figure.previous === null) return null
  if (dir === "same") return <p className="mt-2 text-[12.5px] text-white/45">{tt("No change from the previous period")}</p>
  const diff = formatPerf(metric, Math.abs(figure.p75 - figure.previous))
  const better = dir === "better"
  const text =
    metric === "cls"
      ? better
        ? tt("{delta} less shift than the previous period", { delta: diff })
        : tt("{delta} more shift than the previous period", { delta: diff })
      : better
        ? tt("{delta} faster than the previous period", { delta: diff })
        : tt("{delta} slower than the previous period", { delta: diff })
  const Arrow = better ? ArrowDown : ArrowUp
  return (
    <p className={cn("mt-2 inline-flex items-center gap-1 text-[12.5px]", better ? "text-emerald-300" : "text-red-300")} data-delta={dir}>
      <Arrow className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {text}
    </p>
  )
}

function MetricTile({ metric, figure, note }: { metric: RumMetric; figure: MetricFigure; note?: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-4 md:px-6 md:py-5" data-metric={metric}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[14.5px] font-semibold text-white">{metricShort(metric)}</span>
        {metric !== "nav" && <span className="min-w-0 truncate text-[12.5px] text-white/45">{metricName(metric)}</span>}
      </div>
      {figure.p75 === null ? (
        <p className="mt-2 text-[15px] text-white/55" data-not-enough="">{tt("Not enough visits yet")}</p>
      ) : (
        <>
          <p className="mt-1.5 text-[28px] font-semibold leading-tight tracking-[-0.01em] text-white" data-p75="">{formatPerf(metric, figure.p75)}</p>
          {figure.rating && <div className="mt-1"><RatingMark rating={figure.rating} /></div>}
          <Bands figure={figure} />
          <Delta metric={metric} figure={figure} />
        </>
      )}
      {note && <p className="mt-2 text-[12.5px] leading-snug text-white/45">{note}</p>}
    </div>
  )
}

/* ── Breakdown ───────────────────────────────────────────────────────── */

type Dim = "path" | "type" | "browser" | "country"
type SortCol = "key" | "views" | PerfMetric

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
      return sort.dir === "asc" ? c : -c
    })
  }, [rows, sort, dim])
  const shown = all ? sorted : sorted.slice(0, 10)
  const head = (col: SortCol, label: string, className?: string) => {
    const on = sort.col === col
    return (
      <th scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={cn("py-2.5 pl-1 pr-1.5 font-medium first:pl-4 last:pr-4 md:px-2 md:first:pl-6 md:last:pr-6", className)}>
        <button
          type="button"
          onClick={() => setSort((s) => ({ col, dir: s.col === col ? (s.dir === "desc" ? "asc" : "desc") : col === "key" ? "asc" : "desc" }))}
          className={cn("inline-flex items-center gap-1 whitespace-nowrap transition-colors hover:text-white", on ? "text-white" : "text-white/50")}
        >
          {label}
          {on ? sort.dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : null}
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
          <col className="w-[50px] md:w-[72px]" />
          <col className="w-[62px] md:w-[80px]" />
          <col className="w-[70px] md:w-[88px]" />
          <col className="w-[56px] md:w-[70px]" />
          <col className="hidden md:table-column md:w-[80px]" />
          <col className="hidden md:table-column md:w-[96px]" />
        </colgroup>
        <thead className="border-b border-white/[0.07] text-left text-[12.5px]">
          <tr>
            {head("key", first)}
            {head("views", tt("Views"), "text-right")}
            {head("lcp", "LCP", "text-right")}
            {head("inp", "INP", "text-right")}
            {head("cls", "CLS", "text-right")}
            {head("fcp", "FCP", "hidden text-right md:table-cell")}
            {head("ttfb", "TTFB", "hidden text-right md:table-cell")}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {shown.map((r) => (
            <tr key={r.key}>
              <td className="truncate py-2.5 pl-4 pr-2 text-white/85 md:pl-6" title={keyLabel(dim, r.key)}>{keyLabel(dim, r.key)}</td>
              <td className="whitespace-nowrap py-2.5 pl-1 pr-1.5 text-right tabular-nums text-white/70 md:px-2">{new Intl.NumberFormat(appLocale(), { notation: r.views >= 10_000 ? "compact" : "standard" }).format(r.views)}</td>
              {cell(r, "lcp")}
              {cell(r, "inp")}
              {cell(r, "cls")}
              {cell(r, "fcp", "hidden md:table-cell")}
              {cell(r, "ttfb", "hidden md:table-cell")}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 10 && (
        <div className="border-t border-white/[0.07] px-4 py-2.5 md:px-6">
          <button type="button" onClick={() => setAll((a) => !a)} className="h-10 text-[13.5px] font-medium text-white/70 hover:text-white md:h-8">
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
    try {
      const res = await fetch(`/api/website-builder/themes/${ctx.installId}/performance/lab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ strategy, path, locale: activeLanguage() }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d?.lab) throw new Error(d?.error || tt("Google's speed test did not finish. Try again in a minute."))
      onRan(d.lab as StoredLab)
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("Google's speed test did not finish. Try again in a minute."))
    } finally {
      setBusy(false)
    }
  }

  const r = current?.result
  const metrics: Array<[string, string | null, PerfMetric | null]> = r
    ? [
        ["LCP", r.metrics.lcp === null ? null : formatPerf("lcp", r.metrics.lcp), "lcp"],
        ["FCP", r.metrics.fcp === null ? null : formatPerf("fcp", r.metrics.fcp), "fcp"],
        ["CLS", r.metrics.cls === null ? null : formatPerf("cls", r.metrics.cls), "cls"],
        [tt("Total Blocking Time"), r.metrics.tbt === null ? null : formatPerf("inp", r.metrics.tbt), null],
        [tt("Speed Index"), r.metrics.si === null ? null : formatPerf("fcp", r.metrics.si), null],
      ]
    : []
  const rawOf = (m: PerfMetric | null) => (m && r ? (m === "lcp" ? r.metrics.lcp : m === "fcp" ? r.metrics.fcp : r.metrics.cls) : null)

  return (
    <Card title={tt("Lab test")} footer={tt("One simulated visit by Google PageSpeed Insights. Not visitor data.")}>
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-4 md:px-6" data-lab-controls="">
        <Segmented value={strategy} onChange={setStrategy} label={tt("Device")} options={[{ id: "mobile", label: tt("Mobile") }, { id: "desktop", label: tt("Desktop") }]} />
        <select value={path} onChange={(e) => setPath(e.target.value)} aria-label={tt("Page to test")} className={cn(inputClass, "min-w-0 flex-1 md:w-auto md:max-w-[260px] md:flex-none")}>
          {pages.map((p) => (
            <option key={p.path} value={p.path}>{p.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void run()} disabled={busy || !ctx.live} className={cn(primaryButtonClass, "max-md:w-full")}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? tt("Testing, up to a minute") : tt("Run test")}
        </button>
      </div>
      {error && <p className="px-4 py-3 text-[13.5px] text-red-300 md:px-6" role="alert">{error}</p>}
      {r ? (
        <div className="px-4 py-4 md:px-6" data-lab-result={strategy}>
          <div className="flex flex-col gap-x-10 gap-y-4 md:flex-row md:items-start">
            {r.score !== null && (
              <div>
                <p className="text-[12.5px] text-white/50">{tt("Performance score")}</p>
                <p className="mt-0.5 text-[28px] font-semibold leading-tight text-white">{r.score}</p>
                <RatingMark rating={scoreRating(r.score)} />
              </div>
            )}
            <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {metrics.map(([label, value, m]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-[12.5px] leading-snug text-white/50">{label}</dt>
                  <dd className="mt-0.5 inline-flex items-center gap-1.5 text-[15px] font-medium tabular-nums text-white">
                    {m && rawOf(m) !== null && <span className="h-1.5 w-1.5 rounded-full" style={{ background: RATING_DOT[ratePerf(m, rawOf(m) as number)] }} aria-hidden />}
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
          <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/45">
            <span>{tt("Tested {time}", { time: when(current.ranAt, true) })}</span>
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate">{current.url}</span>
            <a
              href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(current.url)}&form_factor=${strategy}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-white/70 underline underline-offset-2 hover:text-white"
            >
              {tt("Full report")}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          </p>
        </div>
      ) : (
        <p className="px-4 py-4 text-[14px] text-white/50 md:px-6">{ctx.live ? tt("No lab test yet.") : tt("Publish your website to test it.")}</p>
      )}
    </Card>
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
  const [answer, setAnswer] = useState<Answer | null>(() => lastAnswers.get(`${ctx.installId}|7d`) ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(0)

  const load = useCallback(
    async (r: PerfRange) => {
      const id = ++asked.current
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/website-builder/themes/${ctx.installId}/performance?range=${r}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(d?.error || tt("Could not load visitor speed. Try again."))
        if (id !== asked.current) return
        lastAnswers.set(`${ctx.installId}|${r}`, d as Answer)
        setAnswer(d as Answer)
      } catch (e) {
        if (id === asked.current) setError(e instanceof Error ? e.message : tt("Could not load visitor speed. Try again."))
      } finally {
        if (id === asked.current) setLoading(false)
      }
    },
    [ctx.installId],
  )

  useEffect(() => {
    const cached = lastAnswers.get(`${ctx.installId}|${range}`)
    if (cached) setAnswer(cached)
    void load(range)
  }, [range, load, ctx.installId])

  const report = answer && answer.available ? answer.report : null
  const live = answer?.live ?? ctx.live

  const filters = (
    <div className="mt-5 flex flex-wrap items-center gap-2.5 md:mt-6" data-perf-filters="">
      <Segmented
        value={range}
        onChange={setRange}
        label={tt("Period")}
        options={(["24h", "7d", "30d", "90d"] as PerfRange[]).map((r) => ({ id: r, label: rangeLabel(r) }))}
      />
      <Segmented
        value={device}
        onChange={setDevice}
        label={tt("Device")}
        options={[
          { id: "all", label: tt("All devices") },
          { id: "mobile", label: tt("Mobile") },
          { id: "desktop", label: tt("Desktop") },
        ]}
      />
    </div>
  )

  let body: ReactNode
  if (error && !answer) {
    body = (
      <>
        <ErrorNote>{error}</ErrorNote>
        <button type="button" className={cn(buttonClass, "mt-3")} onClick={() => void load(range)}>{tt("Try again")}</button>
      </>
    )
  } else if (!answer) {
    body = (
      <p className="mt-6 inline-flex items-center gap-2 text-[14px] text-white/50" data-perf-loading="">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        {tt("Reading visitor speed")}
      </p>
    )
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
        <div className="px-4 py-5 md:px-6" data-perf-empty={live ? (recent ? "new" : "no-visits") : "unpublished"}>
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
    const showNav = s.metrics.nav.samples > 0
    body = (
      <div className={cn("transition-opacity duration-150", loading && "opacity-60")}>
        <Card title={tt("Core Web Vitals")}>
          <div className="grid divide-y divide-white/[0.07] md:grid-cols-3 md:divide-x md:divide-y-0" data-vitals="">
            {CORE_METRICS.map((m) => (
              <MetricTile key={m} metric={m} figure={s.metrics[m]} note={m === "inp" ? inpNote : undefined} />
            ))}
          </div>
        </Card>
        <Card>
          <div className={cn("grid divide-y divide-white/[0.07] md:divide-y-0 md:divide-x", showNav ? "md:grid-cols-3" : "md:grid-cols-2")}>
            <MetricTile metric="fcp" figure={s.metrics.fcp} />
            <MetricTile metric="ttfb" figure={s.metrics.ttfb} />
            {showNav && <MetricTile metric="nav" figure={s.metrics.nav} note={tt("From a tap on a link to the next page, without a reload.")} />}
          </div>
        </Card>

        {report.insights.length > 0 && (
          <Card title={tt("What to fix")}>
            {report.insights.map((i, k) => {
              const t = insightText(i)
              return (
                <div key={k} className="flex gap-3 px-4 py-4 md:px-6" data-insight={i.kind}>
                  {t.rating && <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: RATING_DOT[t.rating] }} aria-hidden />}
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
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 md:px-6">
            <h2 className="text-[14px] font-semibold text-white/90">{tt("Over time")}</h2>
            <Segmented
              value={metric}
              onChange={setMetric}
              label={tt("Measure")}
              options={(["lcp", "inp", "cls", "fcp", "ttfb"] as RumMetric[]).map((m) => ({ id: m, label: SHORT[m] }))}
            />
          </div>
          <div className="px-2 pb-3 pt-3 md:px-4">
            <PerformanceChart points={points} metric={metric} devices={devices} grain={report.range === "24h" ? "hour" : "day"} label={tt("{metric} at the 75th percentile over the last {period}", { metric: metricShort(metric), period: rangeLabel(range) })} />
            {devices.length > 1 && (
              <div className="flex gap-4 px-2 pb-1 pt-1 text-[12.5px] text-white/60" data-legend="">
                {devices.map((d) => (
                  <span key={d} className="inline-flex items-center gap-1.5">
                    <span className="h-[2px] w-3.5 rounded-full" style={{ background: DEVICE_COLOR[d] }} aria-hidden />
                    {d === "mobile" ? tt("Mobile") : tt("Desktop")}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 md:px-6">
            <h2 className="text-[14px] font-semibold text-white/90">{tt("Where it is slow")}</h2>
            <Segmented
              value={dim}
              onChange={setDim}
              label={tt("Group by")}
              options={DIMS.map((d) => ({ id: d, label: d === "path" ? tt("Pages") : d === "type" ? tt("Page types") : d === "browser" ? tt("Browsers") : tt("Countries") }))}
            />
          </div>
          <BreakdownTable key={`${dim}|${device}`} rows={report.breakdowns[dim][device]} dim={dim} />
        </Card>
      </div>
    )
  }

  return (
    <>
      <PageTitle>{tt("Performance")}</PageTitle>
      {filters}
      {report && (
        <p className="mt-3 text-[13px] text-white/50" data-perf-updated="">
          {tt("Real visitor data · Updated {time}", { time: when(report.updatedAt) })}
          {report.state === "ready" ? ` · ${tt("{count, plural, one {# page view} other {# page views}}", { count: report.summary[device].views })}` : ""}
        </p>
      )}
      {report && !live && report.state === "ready" && (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[13.5px] text-white/70">{tt("This website is offline. These are visits from when it was live.")}</p>
      )}
      {report?.partial && <p className="mt-3 text-[13px] text-amber-200/90">{tt("Part of this period is still being counted, so these numbers may be low.")}</p>}
      {error && answer && <ErrorNote>{error}</ErrorNote>}
      {body}
      {answer && answer.available && (
        <LabCard
          ctx={{ ...ctx, live }}
          lab={answer.lab}
          onRan={(l) => {
            const next: Answer = { ...answer, lab: { ...answer.lab, [l.strategy]: l } }
            lastAnswers.set(`${ctx.installId}|${range}`, next)
            setAnswer(next)
            void load(range)
          }}
        />
      )}
    </>
  )
}

