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
 * devices. Each list is a name, a bar and one number, with what else there
 * is to know said quietly beside the name.
 *
 * NOTHING SCROLLS INSIDE A CARD. A list shows its top five and opens the rest
 * in a sheet, so a wheel or a thumb over a card always moves the page.
 *
 * NOTHING MOVES WHILE IT LOADS. Every card body has a fixed height, and a
 * change of period keeps the figures on screen, softened, until the new ones
 * arrive.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { Shimmer, ShimmerBlock, ShimmerSwap } from "@/components/ui/shimmer"
import type { BreakdownRow, FunnelStep, Headline, Reports } from "@/lib/analytics/reports"
import type { CreatorProperties, PropertySelector } from "@/lib/analytics/properties"
import { viewerTimeZone } from "@/lib/orders/time-zone"
import { FRESH_MS, askReport, keptAnswer, questionOf, reportKey } from "@/lib/analytics/report-cache"
import { HelpLabel } from "@/components/app/help-label"
import { SourceIcon, type IconFor } from "@/components/analytics/source-icon"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { formatCurrency } from "@/lib/markets/money"

/** The funnel's steps, in steps of the accent every /app screen uses. */
const FUNNEL = ["#6d28d9", "#8b5cf6", "#a78bfa", "#c4b5fd"]

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
  children,
  className,
  card,
}: {
  title: string
  help: string
  tabs?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** The card's name for the probe (scripts/check-analytics-page.mjs). */
  card: string
}) {
  return (
    <section data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
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
            "h-8 cursor-pointer rounded-md px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 sm:h-7 sm:px-2.5",
            o.value === value ? "bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(17,24,39,0.12)]" : "text-[#6b7280] hover:text-[#1a1a2e]",
          )}
        >
          {o.label}
        </button>
      ))}
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
      <span className="relative block h-[14px] w-[21px] overflow-hidden rounded-[3px] shadow-[0_0_0_0.5px_rgba(17,24,39,0.18),0_1px_2px_rgba(17,24,39,0.12)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/flags/${cc}.svg`} alt="" width={21} height={14} loading="lazy" decoding="async" onError={() => setFailed(true)} className="block h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.22)_0%,rgba(255,255,255,0)_48%,rgba(0,0,0,0.06)_100%)]" />
      </span>
    </span>
  )
}

/**
 * A ROW: the mark, the name and the figure, with the size drawn as a quiet
 * grey bar behind the name, the way Vercel and Plausible draw theirs.
 */
function Row({ r, max, format, lead, previous }: { r: ListRow; max: number; format: (n: number) => string; lead: Lead; previous?: number }) {
  const compared = React.useContext(ComparedContext) && previous !== undefined
  return (
    <li className="group flex h-10 items-center gap-3" data-row-key={r.key}>
      <div className="relative flex h-8 min-w-0 flex-1 items-center">
        <div
          aria-hidden
          data-bar=""
          className="absolute inset-y-0 left-0 rounded-md bg-[linear-gradient(180deg,#f8f9fb_0%,#eff1f4_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),inset_0_0_0_1px_rgba(16,24,40,0.045),0_1px_2px_rgba(16,24,40,0.05)] transition-[width,filter] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:brightness-[0.975]"
          style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
        />
        <div className="relative flex min-w-0 items-center gap-2 pl-1">
          {lead && "flag" in lead ? <Flag code={r.code ?? r.key} /> : lead ? <SourceIcon kind={lead.icon} value={r.key} /> : null}
          <span className={cn("min-w-0 truncate text-[13px] text-[#303036]", !lead && "pl-1.5")} title={r.label}>
            {r.label}
          </span>
          {r.note ? <span className="shrink-0 truncate pr-2 text-[12px] tabular-nums text-[#9ca3af]">{r.note}</span> : null}
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

/** What each step's rate is of: the step before it, by name. */
const OF: Record<FunnelStep["key"], string> = {
  visitors: "",
  get product() { return tt("of visitors") },
  get checkout() { return tt("of product viewers") },
  get orders() { return tt("of checkouts") },
}

/**
 * FROM A VISIT TO AN ORDER, IN PEOPLE: four steps, each with its count and
 * what share of the step before went on. A step nothing was recorded for,
 * while a later one has something, says so instead of a 0% that would read
 * as nobody going on.
 */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const top = Math.max(...steps.map((s) => s.value), 1)
  return (
    <div className="mt-2 grid flex-1 grid-cols-4 gap-2" data-funnel="">
      {steps.map((s, i) => (
        <div key={s.key} data-step={s.key} className={cn("flex min-w-0 flex-col", i > 0 && "border-l border-[#eef0f2] pl-2")}>
          <p className="min-h-[32px] text-[12px] leading-4 text-[#6b7280]">{s.label}</p>
          <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#1a1a2e]">{s.recorded ? fmtCount(s.value) : "–"}</p>
          <p className="min-h-[32px] text-[11px] leading-4 tabular-nums text-[#9ca3af]">
            {!s.recorded ? tt("Not recorded") : s.rate !== null ? `${fmtPct(s.rate)} ${OF[s.key]}` : ""}
          </p>
          <div className="mt-auto flex h-[72px] items-end">
            <div
              className="w-full max-w-[24px] rounded-t-[4px] transition-[height] duration-500"
              style={{ height: `${s.recorded ? Math.max(3, (s.value / top) * 100) : 3}%`, background: s.recorded ? FUNNEL[i] : "#e5e7eb" }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Loading ─────────────────────────────────────────────────────────── */

type WaitKind = "list" | "funnel" | "figure"

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
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[1, 0.62, 0.4, 0.22].map((h, i) => (
            <div key={i} className={cn("flex flex-col", i > 0 && "border-l border-[#eef0f2] pl-2")}>
              <ShimmerBlock className="mt-1 h-3 w-4/5 rounded-full" />
              <ShimmerBlock className="mt-3 h-3.5 w-1/2 rounded-full" />
              <div className="mt-8 flex h-[72px] items-end">
                <ShimmerBlock className="w-full max-w-[24px] rounded-b-none rounded-t-[4px]" style={{ height: `${h * 100}%` }} />
              </div>
            </div>
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

/* ─── The cards ───────────────────────────────────────────────────────── */

type SourceTab = "source" | "social" | "referrer" | "campaign"
type DeviceTab = "device" | "browser"
type SignupTab = "property" | "source"

const SOURCE_TABS: Array<{ value: SourceTab; label: string }> = [
  { value: "source", get label() { return tt("Source") } },
  { value: "social", get label() { return tt("Social") } },
  { value: "referrer", get label() { return tt("Referrer") } },
  { value: "campaign", get label() { return tt("Campaign") } },
]
const SOURCE_EMPTY: Record<SourceTab, string> = {
  get source() { return tt("No visits in this period. Share your link to bring some in.") },
  get social() { return tt("No visits from social apps. Add your link to your bio.") },
  get referrer() { return tt("No visits from other websites in this period.") },
  get campaign() { return tt("No visits from tagged links. Add utm_campaign to a link to see it here.") },
}

function Grid({ r, property, perProduct }: { r: Reports; property: PropertySelector; perProduct: boolean }) {
  const [sourceTab, setSourceTab] = React.useState<SourceTab>("source")
  const [deviceTab, setDeviceTab] = React.useState<DeviceTab>("device")
  const [signupTab, setSignupTab] = React.useState<SignupTab>(property.type === "all" ? "property" : "source")
  const lists = !r.partial
  const soft = "transition-[opacity,filter] duration-300"
  const visits = (row: BreakdownRow) => `${Math.round(row.share * 100)}%`
  const b = r.breakdowns
  const onePage = property.type === "onepage"
  const traffic = fromBreakdown(b[sourceTab], visits)
  const countries = fromBreakdown(b.country, visits)
  const devices = fromBreakdown(b[deviceTab], visits)
  const signupsBy = property.type === "all" && signupTab === "property" ? r.subscribers?.byProperty ?? [] : r.subscribers?.bySource ?? []
  const signups = fromBreakdown(signupsBy)
  return (
    <>
      <Card
        card="traffic"
        title={tt("Traffic sources")}
        help={tt("Where each visit came from, judged by its first page: a search engine, a social app, an email, another website, or typed in directly.")}
        className={soft}
        tabs={<Tabs value={sourceTab} onChange={setSourceTab} options={SOURCE_TABS} />}
      >
        <Body blank={!lists} wait="list">
          {lists ? <List key={sourceTab} title={tt("Traffic sources")} rows={traffic.rows} previous={traffic.previous} format={fmtCount} lead={{ icon: sourceTab }} empty={SOURCE_EMPTY[sourceTab]} /> : null}
        </Body>
      </Card>

      {onePage ? (
        <Card card="pages" title={tt("Top links")} help={tt("The links and buttons on your OnePage that were tapped most, by the name they have on the page, and how many people tapped each.")} className={soft}>
          <Body blank={!lists} wait="list">
            {lists ? (
              <List
                title={tt("Top links")}
                rows={r.topLinks.map((l) => ({ key: l.key, label: l.label, value: l.clicks, note: plural(l.visitors, "person", "people") }))}
                format={fmtCount}
                empty={tt("No link taps in this period. Add links to your OnePage.")}
              />
            ) : null}
          </Body>
        </Card>
      ) : (
        <Card card="pages" title={tt("Top pages")} help={tt("The pages opened most, with how many people opened each. A page opened again within half an hour counts once.")} className={soft}>
          <Body blank={!lists} wait="list">
            {lists ? (
              <List
                title={tt("Top pages")}
                rows={r.topPages.map((p) => ({ key: p.key, label: p.label, value: p.views, note: [p.place, plural(p.visitors, "visitor", "visitors")].filter(Boolean).join(" · ") }))}
                format={fmtCount}
                empty={tt("No pages opened in this period. Share a link to one of your pages.")}
              />
            ) : null}
          </Body>
        </Card>
      )}

      <Card card="products" title={tt("Top products")} help={tt("Revenue from each product, less refunds, with its orders and how often its page was opened.")} className={soft}>
        <Body blank={!lists} wait="list">
          {lists ? (
            <List
              title={tt("Top products")}
              rows={r.topProducts.map((p) => ({
                key: p.key,
                label: p.label,
                value: p.salesCents,
                note: `${plural(p.orders, "order", "orders")} · ${plural(p.views, "view", "views")}`,
              }))}
              format={fmtMoney}
              empty={tt("No product views or orders in this period.")}
            />
          ) : null}
        </Body>
      </Card>

      <Card
        card="funnel"
        title={tt("Funnel")}
        help={tt("Of the people who visited, how many opened a product, how many started a checkout, and how many orders came in. Each step is shown as a share of the one before.")}
        className={cn("xl:col-span-2", soft)}
      >
        <Body blank={!lists} wait="funnel">
          {lists ? (r.funnel.every((s) => s.value === 0) ? <Empty>{tt("No visits in this period.")}</Empty> : <Funnel steps={r.funnel} />) : null}
        </Body>
      </Card>

      <Card
        card="subscribers"
        title={tt("Subscribers")}
        help={tt("People who left their email on your pages or at checkout, and where they came from. Imports and contacts you added yourself are not counted.")}
        className={soft}
        tabs={
          property.type === "all" ? (
            <Tabs value={signupTab} onChange={setSignupTab} options={[{ value: "property", label: tt("Page") }, { value: "source", label: tt("Source") }]} />
          ) : undefined
        }
      >
        <Body blank={!lists} wait="figure">
          {lists ? (
            r.subscribers === null ? (
              <Empty>{perProduct ? tt("Sign-ups are counted for your pages, not for one product.") : tt("Sign-ups could not be read. Refresh the page to try again.")}</Empty>
            ) : (
              <>
                <div className="flex h-9 items-baseline gap-2.5" data-figure="">
                  <span className="text-[24px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{fmtCount(r.subscribers.value)}</span>
                  <Change h={r.subscribers} />
                </div>
                <List key={signupTab} title={tt("Subscribers")} rows={signups.rows} previous={signups.previous} format={fmtCount} empty={tt("No sign-ups in this period. Add a sign-up form to your page.")} />
              </>
            )
          ) : null}
        </Body>
      </Card>

      <Card card="countries" title={tt("Countries")} help={tt("Where visits came from, from their connection.")} className={soft}>
        <Body blank={!lists} wait="list">
          {lists ? <List title={tt("Countries")} rows={countries.rows} previous={countries.previous} format={fmtCount} lead={{ flag: true }} empty={tt("No locations recorded in this period.")} /> : null}
        </Body>
      </Card>

      <Card
        card="devices"
        title={tt("Devices")}
        help={tt("The device and browser of the first page of each visit.")}
        className={soft}
        tabs={<Tabs value={deviceTab} onChange={setDeviceTab} options={[{ value: "device", label: tt("Device") }, { value: "browser", label: tt("Browser") }]} />}
      >
        <Body blank={!lists} wait="list">
          {lists ? <List key={deviceTab} title={deviceTab === "device" ? tt("Devices") : tt("Browsers")} rows={devices.rows} previous={devices.previous} format={fmtCount} lead={{ icon: deviceTab }} empty={tt("No visits in this period.")} /> : null}
        </Body>
      </Card>
    </>
  )
}

/** The cards before any answer: every card in its shape. */
function Blank({ property }: { property: PropertySelector }) {
  const cards: Array<[string, string, WaitKind, string?]> = [
    ["traffic", tt("Traffic sources"), "list"],
    ["pages", property.type === "onepage" ? tt("Top links") : tt("Top pages"), "list"],
    ["products", tt("Top products"), "list"],
    ["funnel", tt("Funnel"), "funnel", "xl:col-span-2"],
    ["subscribers", tt("Subscribers"), "figure"],
    ["countries", tt("Countries"), "list"],
    ["devices", tt("Devices"), "list"],
  ]
  return (
    <>
      {cards.map(([card, title, wait, className]) => (
        <Card key={card} card={card} title={title} help="" className={className}>
          <Body blank wait={wait}>
            {null}
          </Body>
        </Card>
      ))}
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
}: {
  start: number
  end: number
  compare: { start: number; end: number } | null
  product: string
  /** "all", "creator_page", "onepage" or "website:<id>". */
  property: string
  refresh?: number
  viewer?: string | null
}): ReportsState {
  /*
    A page opened from inside the app starts with the kept answer in its very
    first render, so its cards are simply there rather than fading in. Not
    while hydrating a full load: the server drew that page without one, and
    the first render has to match it (the layout effect below adopts it, still
    before the first paint).
  */
  const hydrated = React.useSyncExternalStore(noSubscription, () => true, () => false)
  const [state, setState] = React.useState<{ data: ReportsAnswer | null; lists: ReportsAnswer | null; loading: boolean; failed: boolean; asking: string }>(() => {
    const known = hydrated ? keptAnswer(questionOf(reportKey({ start, end, compare, product, property, timeZone: viewerTimeZone() })), viewer) : null
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
    const key = reportKey({ start, end, compare: cs !== null && ce !== null ? { start: cs, end: ce } : null, product, property, timeZone: viewerTimeZone() })
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
  }, [start, end, cs, ce, product, property, refresh, viewer])
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
}: {
  start?: Date
  end?: Date
  product?: string
  property?: PropertySelector
  state?: ReportsState
}) {
  reportCurrency = useStoreCurrency()
  return state ? (
    <ReportsView state={state} property={property} />
  ) : (
    <SelfLoading start={(start ?? new Date()).getTime()} end={(end ?? new Date()).getTime()} product={product} property={property} />
  )
}

function SelfLoading({ start, end, product, property }: { start: number; end: number; product: string; property: PropertySelector }) {
  const compare = React.useMemo(() => ({ start: start - (end - start), end: start }), [start, end])
  const key = property.type === "all" ? "all" : property.type === "website" ? `website:${property.id}` : property.type
  const state = useAnalyticsReports({ start, end, compare, product, property: key })
  return <ReportsView state={state} property={property} />
}

function ReportsView({ state, property }: { state: ReportsState; property: PropertySelector }) {
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
      <div aria-busy={loading} data-analytics-cards="" className={cn("grid gap-4 transition-[opacity,filter] duration-300 md:grid-cols-2 xl:grid-cols-3", soft && "opacity-60 blur-[0.5px]")}>
        {failed && (!shown || shown.reports.partial) ? (
          <p className="rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3 text-[13px] text-[#8a1c0f] md:col-span-2 xl:col-span-3">
            {tt("The reports could not be loaded. Refresh the page to try again.")}
          </p>
        ) : null}

        {shown ? <Grid r={shown.reports} property={countedFor} perProduct={(new URLSearchParams(shown.key).get("product") ?? "all") !== "all"} /> : <Blank property={property} />}

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
  creator/analytics-section.tsx) lists its sources, countries, devices, top
  posts and members with these very cards, rows and tabs, so a list reads the
  same on every Analytics screen in /app.
*/
export { Card as ReportCard, Tabs as ReportTabs, List as ReportList, Empty as ReportEmpty, Body as ReportBody, ComparedContext as ReportComparedContext }
export type { ListRow as ReportListRow }
