"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE REPORTS UNDER THE ANALYTICS CHART
 * ═══════════════════════════════════════════════════════════════════════════
 * Read from app/api/analytics/reports, which counts on the server from every
 * row (lib/analytics/reports.ts has the rules). Drawn here as report cards:
 * a title that explains itself on hover, the figure, how it moved against the
 * period before, and a picture of it.
 *
 * NOTHING MOVES WHILE IT LOADS. Every card has a fixed body height, the first
 * load draws the cards' frames, and a change of period keeps the figures on
 * screen, softened, until the new ones arrive.
 */

import * as React from "react"
import { Globe } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BreakdownRow, Headline, Reports, Series } from "@/lib/analytics/reports"
import { viewerTimeZone } from "@/lib/orders/time-zone"

const VIOLET = "#8b5cf6"
const PREVIOUS = "#c9ccd3"
const DONUT = ["#8b5cf6", "#c4b5fd", "#6d28d9", "#ddd6fe", "#a78bfa"]

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const moneyShort = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 })
const fmtMoney = (cents: number) => money.format((cents || 0) / 100)
const fmtMoneyShort = (cents: number) => (Math.abs(cents) >= 100_000 ? moneyShort.format(cents / 100) : fmtMoney(cents))
const fmtCount = (n: number) => Math.round(n).toLocaleString("en-US")
const fmtPct = (f: number) => `${(f * 100).toFixed(f > 0 && f < 0.1 ? 2 : 1).replace(/\.0+$/, "")}%`

/* ─── Frame ───────────────────────────────────────────────────────────── */

function Card({
  title,
  help,
  aside,
  children,
  className,
}: {
  title: string
  help: string
  aside?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <h3
          title={help}
          className="w-fit max-w-full truncate text-[14px] font-semibold text-[#1a1a2e] underline decoration-[#c4c7cf] decoration-dotted underline-offset-[5px]"
        >
          {title}
        </h3>
        {aside ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{aside}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="inline-flex shrink-0 items-center rounded-lg bg-[#f1f2f4] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-7 cursor-pointer rounded-md px-2.5 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150",
            o.value === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Change({ h, upIsBad = false }: { h: Pick<Headline, "change" | "value">; upIsBad?: boolean }) {
  if (h.change === null) return <span className="text-[13px] text-[#9ca3af]">{h.value > 0 ? "New" : "–"}</span>
  const pct = Math.round(h.change * 100)
  if (pct === 0) return <span className="text-[13px] text-[#9ca3af]">0%</span>
  const good = pct > 0 !== upIsBad
  return (
    <span className={cn("text-[13px] font-medium tabular-nums", good ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  )
}

function Figure({ value, h }: { value: string; h: Headline }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{value}</span>
      <Change h={h} />
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center py-6 text-center text-[13px] text-[#9ca3af]">{children}</div>
}

/* ─── Line chart ──────────────────────────────────────────────────────── */

function LineChart({ series, format, compact }: { series: Series; format: (n: number) => string; compact: (n: number) => string }) {
  const [hover, setHover] = React.useState<number | null>(null)
  const ref = React.useRef<SVGSVGElement>(null)
  /* Drawn at the card's own width, in pixels, so the plot reaches both edges
     and the axis text stays 10px whatever the card's size. Measured before
     the first paint, and again when the card is resized. */
  const box = React.useRef<HTMLDivElement>(null)
  const [W, setW] = React.useState(320)
  React.useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setW(Math.max(160, Math.round(el.getBoundingClientRect().width)))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 150
  const pad = { l: 44, r: 6, t: 8, b: 22 }
  const n = series.current.length
  const max = Math.max(...series.current, ...series.previous, 0)
  const top = max > 0 ? niceCeil(max) : 1
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r))
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b)
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")
  const ticks = [0, top / 2, top]
  const xl = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0]

  React.useEffect(() => {
    if (hover === null) return
    const t = window.setTimeout(() => setHover(null), 4000)
    return () => window.clearTimeout(t)
  }, [hover])

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || n === 0) return
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  return (
    <div ref={box} className="relative mt-3">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-[150px] w-full touch-pan-y select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={(e) => {
          /* A finger lifting off counts as leaving; the figures it asked for
             stay up until the next touch or a few seconds pass. */
          if (e.pointerType === "mouse") setHover(null)
        }}
        role="img"
        aria-label="Chart"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="#9ca3af">
              {compact(t)}
            </text>
          </g>
        ))}
        {xl.map((i) => (
          <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="10" fill="#9ca3af">
            {series.labels[i]}
          </text>
        ))}
        <path d={path(series.previous)} fill="none" stroke={PREVIOUS} strokeWidth={1.5} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={path(series.current)} fill="none" stroke={VIOLET} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {hover !== null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#d1d5db" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <circle cx={x(hover)} cy={y(series.current[hover])} r={3.5} fill="#fff" stroke={VIOLET} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </g>
        ) : null}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-0 z-10 min-w-[140px] -translate-x-1/2 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-2 text-[12px] shadow-[0_8px_24px_-6px_rgba(17,24,39,0.18)]"
          style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }}
        >
          <p className="font-medium text-[#1a1a2e]">{series.labels[hover]}</p>
          <p className="mt-1 flex items-center justify-between gap-3 text-[#303036]">
            <span className="flex items-center gap-1.5"><span className="h-[3px] w-3 rounded bg-[#8b5cf6]" />This period</span>
            <span className="tabular-nums">{format(series.current[hover])}</span>
          </p>
          <p className="flex items-center justify-between gap-3 text-[#6b7280]">
            <span className="flex items-center gap-1.5"><span className="h-0 w-3 border-t-2 border-dashed border-[#c9ccd3]" />Before</span>
            <span className="tabular-nums">{format(series.previous[hover] ?? 0)}</span>
          </p>
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-4 text-[12px] text-[#6b7280]">
        <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-[#8b5cf6]" />This period</span>
        <span className="flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-[#c9ccd3]" />Period before</span>
      </div>
    </div>
  )
}

function niceCeil(v: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10
  return nice * exp
}

/* ─── Donut ───────────────────────────────────────────────────────────── */

function Donut({ rows, total, format }: { rows: BreakdownRow[]; total: string; format: (n: number) => string }) {
  const R = 52
  const C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="mt-2 flex flex-1 items-center gap-x-5 sm:gap-x-6">
      <div className="relative h-[112px] w-[112px] shrink-0 sm:h-[140px] sm:w-[140px]">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f2f4" strokeWidth="18" />
          {rows.map((r, i) => {
            const len = r.share * C
            const seg = (
              <circle
                key={r.key}
                cx="70"
                cy="70"
                r={R}
                fill="none"
                stroke={DONUT[i % DONUT.length]}
                strokeWidth="18"
                strokeDasharray={`${Math.max(0, len - (rows.length > 1 ? 2 : 0))} ${C}`}
                strokeDashoffset={-offset}
              />
            )
            offset += len
            return seg
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[14px] font-bold tabular-nums text-[#1a1a2e] sm:text-[17px]">{total}</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-2 text-[13px]">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: DONUT[i % DONUT.length] }} />
            <span className="min-w-0 flex-1 truncate text-[#303036]">{r.label}</span>
            <span className="tabular-nums text-[#1a1a2e]">{format(r.value)}</span>
            <span className="w-10 text-right tabular-nums text-[#9ca3af]">{Math.round(r.share * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─── Lists ───────────────────────────────────────────────────────────── */

function BarList({
  rows,
  format,
  sub,
  flag,
  empty,
}: {
  rows: BreakdownRow[]
  format: (n: number) => string
  sub?: (r: BreakdownRow) => string | null
  flag?: boolean
  empty: string
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ol className="mt-1 space-y-3">
      {rows.map((r) => {
        const s = sub?.(r)
        return (
          <li key={r.key}>
            <div className="flex items-baseline gap-2 text-[13px]">
              {flag ? <span className="w-5 shrink-0 text-[14px] leading-none">{flagOf(r.extra?.code ?? r.key)}</span> : null}
              <span className="min-w-0 flex-1 truncate text-[#303036]" title={r.label}>{r.label}</span>
              <span className="shrink-0 tabular-nums font-medium text-[#1a1a2e]">{format(r.value)}</span>
              <span className="w-12 shrink-0 text-right"><RowChange r={r} /></span>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              {flag ? <span className="w-5 shrink-0" /> : null}
              <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
                <div className="h-full rounded-full bg-[#8b5cf6] transition-[width] duration-500" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
              </div>
              <span className="w-12 shrink-0" />
            </div>
            {s ? <p className={cn("mt-1 text-[12px] text-[#9ca3af]", flag && "pl-7")}>{s}</p> : null}
          </li>
        )
      })}
    </ol>
  )
}

function RowChange({ r }: { r: BreakdownRow }) {
  if (r.previous <= 0) return <span className="text-[12px] text-[#c4c7cf]">{r.value > 0 ? "New" : "–"}</span>
  const pct = Math.round(((r.value - r.previous) / r.previous) * 100)
  if (pct === 0) return <span className="text-[12px] text-[#9ca3af]">0%</span>
  return (
    <span className={cn("text-[12px] tabular-nums", pct > 0 ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "+" : "−"}
      {Math.abs(pct)}%
    </span>
  )
}

function flagOf(code: string): React.ReactNode {
  if (!code || code.length !== 2 || !/^[A-Z]{2}$/i.test(code)) return <Globe className="h-3.5 w-3.5 text-[#9ca3af]" />
  return String.fromCodePoint(...code.toUpperCase().split("").map((c) => 127397 + c.charCodeAt(0)))
}

/* ─── Funnel ──────────────────────────────────────────────────────────── */

function Funnel({ steps }: { steps: Reports["funnel"] }) {
  const top = Math.max(steps[0]?.value ?? 0, ...steps.map((s) => s.value), 1)
  return (
    <div className="mt-2 grid flex-1 grid-cols-4 gap-2">
      {steps.map((s, i) => {
        const prevRate = steps[0].previous > 0 ? s.previous / steps[0].previous : null
        return (
          <div key={s.key} className={cn("flex min-w-0 flex-col", i > 0 && "border-l border-[#eef0f2] pl-2")}>
            <p className="truncate text-[12px] text-[#6b7280]" title={s.label}>{s.label}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{i === 0 ? fmtCount(s.value) : fmtPct(s.rate)}</p>
            <p className="text-[12px] tabular-nums text-[#9ca3af]">
              {i === 0 ? "visits" : `${fmtCount(s.value)} ${s.value === 1 ? "visit" : "visits"}`}
            </p>
            <div className="mt-3 flex h-[88px] items-end">
              <div
                className="w-full rounded-t-md bg-[#8b5cf6] transition-[height] duration-500"
                style={{ height: `${Math.max(3, (s.value / top) * 100)}%`, opacity: 1 - i * 0.18 }}
              />
            </div>
            {i > 0 && prevRate !== null ? (
              <p className="mt-1.5 text-[11px] tabular-nums text-[#9ca3af]">was {fmtPct(prevRate)}</p>
            ) : (
              <p className="mt-1.5 text-[11px] text-transparent">.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── The grid ────────────────────────────────────────────────────────── */

type SourceTab = "source" | "referrer" | "social" | "campaign"
type PlaceTab = "country" | "city"
type DeviceTab = "device" | "browser" | "os"

export function AnalyticsReports({ start, end, product }: { start: Date; end: Date; product: string }) {
  const [data, setData] = React.useState<{ reports: Reports; truncated: boolean } | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [failed, setFailed] = React.useState(false)
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const [placeTab, setPlaceTab] = React.useState<PlaceTab>("country")
  const [deviceTab, setDeviceTab] = React.useState<DeviceTab>("device")

  const startMs = start.getTime()
  const endMs = end.getTime()
  React.useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    setFailed(false)
    const q = new URLSearchParams({
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      tz: viewerTimeZone(),
      product,
    })
    fetch(`/api/analytics/reports?${q}`, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        setData(json)
        setLoading(false)
      })
      .catch((e) => {
        if ((e as Error).name === "AbortError") return
        setFailed(true)
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [startMs, endMs, product])

  const r = data?.reports
  const soft = loading && !!data
  const blank = !r

  return (
    <div
      aria-busy={loading}
      className={cn("grid gap-4 transition-[opacity,filter] duration-300 md:grid-cols-2 xl:grid-cols-3", soft && "opacity-60 blur-[0.5px]")}
    >
      {failed && !r ? (
        <p className="rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3 text-[13px] text-[#8a1c0f] md:col-span-2 xl:col-span-3">
          The reports could not be loaded. Refresh the page to try again.
        </p>
      ) : null}

      <Card title="Total sales by channel" help="Money taken in the period, less refunds, split by where the order was placed.">
        <div className="h-[196px]">
          {blank ? <Skeleton /> : r!.salesByChannel.length === 0 ? (
            <Empty>No sales in this period</Empty>
          ) : (
            <Donut rows={r!.salesByChannel} total={fmtMoneyShort(r!.sales.value)} format={fmtMoneyShort} />
          )}
        </div>
      </Card>

      <Card title="Average order value over time" help="Paid orders only: the average amount a paying buyer spent in one order.">
        <div className="h-[236px]">
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtMoney(r!.aov.value)} h={r!.aov} />
              <LineChart series={r!.aov.series} format={fmtMoney} compact={(n) => fmtMoneyShort(n)} />
            </>
          )}
        </div>
      </Card>

      <Card title="Total sales by product" help="Each product's share of the money taken, less refunds.">
        <div className="h-[236px] overflow-y-auto overscroll-contain report-scroll -mr-2 pr-2">
          {blank ? <Skeleton /> : (
            <BarList
              rows={r!.salesByProduct}
              format={fmtMoney}
              sub={(row) => `${fmtCount(row.extra?.orders ?? 0)} sold`}
              empty="No sales in this period"
            />
          )}
        </div>
      </Card>

      <Card title="Sessions over time" help="Visits to your Storelib page and your website. A visit ends after 30 minutes without opening a page.">
        <div className="h-[236px]">
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtCount(r!.sessions.value)} h={r!.sessions} />
              <LineChart series={r!.sessions.series} format={fmtCount} compact={fmtCount} />
            </>
          )}
        </div>
      </Card>

      <Card title="Conversion rate over time" help="Orders divided by visits.">
        <div className="h-[236px]">
          {blank ? <Skeleton lines /> : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <LineChart series={r!.conversion.series} format={fmtPct} compact={(n) => `${Math.round(n * 100)}%`} />
            </>
          )}
        </div>
      </Card>

      <Card title="Conversion rate breakdown" help="Of the visits in the period, how many pressed Buy, reached the checkout, and ordered.">
        <div className="h-[236px]">
          {blank ? <Skeleton /> : (
            <>
              <Figure value={fmtPct(r!.conversion.value)} h={r!.conversion} />
              <Funnel steps={r!.funnel} />
            </>
          )}
        </div>
      </Card>

      <Card
        title="Sessions by traffic source"
        help="Where each visit came from, judged by the first page of the visit."
        aside={
          <Tabs
            value={sourceTab}
            onChange={setSourceTab}
            options={[
              { value: "source", label: "Source" },
              { value: "referrer", label: "Referrer" },
              { value: "social", label: "Social" },
              { value: "campaign", label: "Campaign" },
            ]}
          />
        }
        className="md:col-span-2 xl:col-span-1"
      >
        <div className="h-[300px] overflow-y-auto overscroll-contain report-scroll -mr-2 pr-2">
          {blank ? <Skeleton /> : (
            <BarList
              rows={r!.breakdowns[sourceTab]}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of visits`}
              empty={
                sourceTab === "referrer"
                  ? "No visits from other websites in this period"
                  : sourceTab === "social"
                    ? "No visits from social apps in this period"
                    : sourceTab === "campaign"
                      ? "No visits from links with a utm_campaign"
                      : "No visits in this period"
              }
            />
          )}
        </div>
      </Card>

      <Card
        title="Sessions by location"
        help="Where visitors were, from their connection. Orders and sales are from the buyer's country."
        aside={<Tabs value={placeTab} onChange={setPlaceTab} options={[{ value: "country", label: "Country" }, { value: "city", label: "City" }]} />}
      >
        <div className="h-[300px] overflow-y-auto overscroll-contain report-scroll -mr-2 pr-2">
          {blank ? <Skeleton /> : (
            <BarList
              rows={r!.breakdowns[placeTab]}
              format={fmtCount}
              flag={placeTab === "country"}
              sub={(row) =>
                placeTab === "country" && (row.extra?.orders ?? 0) > 0
                  ? `${fmtCount(row.extra!.orders!)} ${row.extra!.orders === 1 ? "order" : "orders"}, ${fmtMoney(row.extra!.salesCents ?? 0)}`
                  : null
              }
              empty="No locations recorded in this period"
            />
          )}
        </div>
      </Card>

      <Card
        title="Sessions by device"
        help="The device, browser and system of the first page of each visit."
        aside={
          <Tabs
            value={deviceTab}
            onChange={setDeviceTab}
            options={[
              { value: "device", label: "Device" },
              { value: "browser", label: "Browser" },
              { value: "os", label: "System" },
            ]}
          />
        }
      >
        <div className="h-[300px] overflow-y-auto overscroll-contain report-scroll -mr-2 pr-2">
          {blank ? <Skeleton /> : (
            <BarList
              rows={r!.breakdowns[deviceTab]}
              format={fmtCount}
              sub={(row) => `${Math.round(row.share * 100)}% of visits`}
              empty="No visits in this period"
            />
          )}
        </div>
      </Card>

      <Card title="Sessions by landing page" help="The page each visit started on." className="md:col-span-2">
        <div className="h-[236px] overflow-y-auto overscroll-contain report-scroll -mr-2 pr-2">
          {blank ? <Skeleton /> : <BarList rows={r!.breakdowns.landing} format={fmtCount} empty="No visits in this period" />}
        </div>
      </Card>

      <Card title="Sessions by channel" help="Visits to your Storelib page, and visits to the website you built.">
        <div className="h-[196px]">
          {blank ? <Skeleton /> : r!.sessions.value === 0 ? (
            <Empty>No visits in this period</Empty>
          ) : (
            <Donut rows={r!.breakdowns.channel} total={fmtCount(r!.sessions.value)} format={fmtCount} />
          )}
        </div>
      </Card>

      {data?.truncated ? (
        <p className="text-[12px] text-[#9ca3af] md:col-span-2 xl:col-span-3">
          This period has more activity than one report reads at once. Choose a shorter period for exact figures.
        </p>
      ) : null}
    </div>
  )
}

function Skeleton({ lines = false }: { lines?: boolean }) {
  return (
    <div className="animate-pulse" aria-hidden>
      {lines ? <div className="h-7 w-28 rounded-md bg-[#f1f2f4]" /> : null}
      <div className={cn("space-y-3", lines ? "mt-4" : "mt-1")}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded bg-[#f3f4f6]" style={{ width: `${88 - i * 14}%` }} />
        ))}
      </div>
    </div>
  )
}
