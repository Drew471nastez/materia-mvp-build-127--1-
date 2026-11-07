"use client"

/**
 * ===========================================================================
 *  SALES REPORTS: THE STORE'S MONEY, THE WAY SHOPIFY'S ANALYTICS SHOWS IT
 * ===========================================================================
 * Under the main chart, read from app/api/analytics/commerce for the page's
 * own period, comparison, time zone, product and place (lib/analytics/
 * commerce adds it up):
 *
 *   Total sales breakdown     gross, discounts, returns, net, shipping,
 *                             taxes, tips, total, each against the period
 *                             it is compared with
 *   Total sales over time     this period's line over that one's, in the
 *                             chart's own buckets on the seller's clock
 *   Total sales by channel    each website by its name, the OnePage, the
 *                             creator page, Explore, checkout links
 *   Customers                 average order value, the returning customer
 *                             rate (bought before, or twice in the period)
 *   Shipping                  of the physical orders, how many have gone
 *                             out, how long they waited, what buyers paid
 *                             for delivery
 *
 * EVERY KIND TOGETHER, SPLIT WHERE IT MATTERS. There is no All / Digital /
 * Physical switch any more ("it doesn't make sense ... on mobile there are
 * so many things"). A store that sells both sees the breakdown with a
 * Digital and a Physical column beside the total, and the Shipping card
 * only for a seller of something physical, once the period has a physical
 * order (lib/analytics/sections). Sales are dated by the order, returns by
 * the refund (lib/analytics/refund-dates). Every figure is counted payment
 * by payment by the tabs' own rules (lib/analytics/commerce commerceReport),
 * so Total sales is Revenue.
 *
 * DRAWN BEFORE THE ANSWER. Every card, its title, its switcher and the names
 * of its rows are on the first paint, each body in a fixed height; the
 * numbers fill them. The block used to be one empty 320px box that became
 * four cards of another height when the answer came, and every card under
 * it jumped 360 to 1,000px (scripts/check-analytics-tabs.mjs). The last
 * answer to the same question is kept (lib/analytics/commerce-cache) and
 * drawn at once on a return.
 */
import { useQuietRetry } from "@/lib/ui/quiet-retry"
import * as React from "react"

import { cn } from "@/lib/utils"
import { HelpLabel } from "@/components/app/help-label"
import { ShimmerBlock } from "@/components/ui/shimmer"
import { formatMinor } from "@/lib/markets/money"
import { appLocale } from "@/lib/i18n/format"
import { useStoreCurrency } from "@/lib/store/currency-context"
import { tt } from "@/lib/i18n/text"
import { bucketLabel, type Grain } from "@/lib/analytics/buckets"
import type { ChannelRow, FulfillmentFigures, SalesBreakdown } from "@/lib/analytics/commerce"
import { COMMERCE_FRESH_MS, askCommerce, commerceKey, commerceQuestionOf, keptCommerce } from "@/lib/analytics/commerce-cache"
import { percentText } from "@/lib/analytics/percent"
import { TrendMiniChart } from "@/components/analytics/trend-mini-chart"
import { EmptyState } from "@/components/analytics/empty-state"
import { ReportFill, ReportTabs } from "./analytics-reports"
import { DetailBody, DetailPanel, OpenDetailContext, ViewReport, type DetailRow, type DetailView } from "./report-detail"

type Point = { t: number; total: number; orders: number; aov: number }
interface Answer {
  currency: string
  grain: Grain
  timeZone?: string
  compared?: boolean
  breakdown: SalesBreakdown
  previous: SalesBreakdown
  series: Point[]
  previousSeries: Point[]
  channels: ChannelRow[]
  fulfillment: { hours: number | null; shipped: number }
  fulfillmentBefore?: { hours: number | null; shipped: number }
  fulfillmentRate?: FulfillmentFigures
  fulfillmentRateBefore?: FulfillmentFigures
  truncated?: boolean
  unconverted?: number
  placeUnknown?: boolean
  /** The breakdown of each kind, with every kind counted together (lib/analytics/commerce). */
  kinds?: { digital: SalesBreakdown; physical: SalesBreakdown } | null
}

/** The channels Storelib names itself, in the dashboard's language; a website keeps the name its seller gave it. */
const CHANNEL_NAME: Record<string, () => string> = {
  onepage: () => "OnePage",
  creator_page: () => tt("Creator page"),
  explore: () => tt("Storelib Explore"),
  link: () => tt("Checkout links"),
  admin: () => tt("Test sales"),
}
const channelName = (c: ChannelRow) => (CHANNEL_NAME[c.key] ? CHANNEL_NAME[c.key]() : c.label === "Online store" ? tt("Online store") : c.label)

const ACCENT = "#8b5cf6"
const CHANNEL_ROWS = 5

/** A figure card with nothing to show: its line in the figure's place, at the figure's height, so the card does not move when a number comes (round 49). */
/*
  A FIGURE WITH NOTHING TO COUNT (round 51, the owner: "Average order value shows 'No orders in this period.' in a big
  empty card"). The sentence stood where the number goes. Now the card says its zero, quiet, the one short line where
  the change goes, and the faint shape of a line at its right; the same rows a filled card has, so nothing moves when
  the first order comes.
*/
function FigureEmpty({ children }: { children: React.ReactNode }) {
  return (
    <span data-empty="" className="text-[12.5px] leading-[18px] text-[#6b7280]">
      {children}
    </span>
  )
}

function Card({ title, help, children, className, card, tabs, detail }: { title: string; help: string; children: React.ReactNode; className?: string; card: string; tabs?: React.ReactNode; detail?: string }) {
  return (
    <section data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <div className="flex min-h-6 min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
          </div>
          {detail ? <ViewReport id={detail} label={title} /> : null}
        </div>
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Delta({ now, before, invert = false, compared }: { now: number; before: number; invert?: boolean; compared: boolean }) {
  if (!compared) return null
  /* Nothing then and nothing now: no change to show, and no dash beside the figure (round 49). */
  if (before === 0) return now > 0 ? <span className="text-[12px] text-[#9ca3af]">{tt("New")}</span> : null
  const pct = Math.round(((now - before) / Math.abs(before)) * 100)
  if (pct === 0) return <span className="text-[12px] tabular-nums text-[#9ca3af]">0%</span>
  const good = invert ? pct < 0 : pct > 0
  return (
    <span className={cn("text-[12px] font-medium tabular-nums", good ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↗" : "↘"} {Math.abs(pct)}%
    </span>
  )
}

/** A number still on its way: a light block the size of a figure, so the row keeps its height. */
const Pending = ({ w = "w-16" }: { w?: string }) => <ShimmerBlock className={cn("inline-block h-3.5 rounded-full align-middle", w)} />

/**
 * A metric over time: this period's line over the dashed one it is compared
 * with, drawn and read by components/analytics/trend-mini-chart, the
 * figures' chart's own line and hover. It read the pointer itself before,
 * re-rendering on every move, and was the one chart on the page a finger
 * could not scrub.
 */
function LineChart({ series, previous, format, value, grain, timeZone, label, integer, emptyText }: { series: Point[]; previous: Point[]; format: (n: number) => string; value: (p: Point) => number; grain: Grain; timeZone: string; label: string; integer: boolean; emptyText?: string }) {
  const labels = React.useMemo(() => series.map((p) => bucketLabel(p.t, grain, timeZone)), [series, grain, timeZone])
  const current = React.useMemo(() => series.map(value), [series, value])
  const before = React.useMemo(() => previous.map(value), [previous, value])
  return <TrendMiniChart labels={labels} current={current} previous={before} format={format} height={150} integer={integer} label={label} readoutTop={-50} emptyText={emptyText} />
}

/** The legend under the chart: drawn from the start, its words are the period's, not the answer's. */
function Legend({ compared }: { compared: boolean }) {
  return (
    <div className="mt-2 flex h-5 items-center gap-4 text-[12px] text-[#6b7280]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded" style={{ background: ACCENT }} />
        {tt("This period")}
      </span>
      {compared ? (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-3 border-t border-dashed border-[#9ca3af]" />
          {tt("Previous period")}
        </span>
      ) : null}
    </div>
  )
}

export interface CommerceReportsProps {
  span: { start: number; end: number }
  /** What the period is compared with: the chart's own instants, or null for none. */
  compare: { start: number; end: number } | null
  /** Kept for a caller that still names one kind; the page counts every kind together. */
  kind?: string
  timeZone: string
  /** "all" or a product id. The sales cards follow the same product as the chart. */
  product?: string
  /** "all", "creator_page", "onepage" or "website:<id>". */
  property?: string
  /** Shipping in the breakdown, for a store that ships, while what is chosen could ship. */
  showShipping?: boolean
  /** The Shipping card, on the same terms, once the period has a physical order. */
  showFulfillment?: boolean
  /** A store that sells both kinds: the breakdown has a Digital and a Physical column. */
  showKinds?: boolean
  /** Who is signed in: a kept answer counted for anybody else is never drawn. */
  viewer?: string | null
  /** The page's minute: asks the same question again. */
  refresh?: number
  /** The period and what it is compared with, as the page names them, under an opened report's title. */
  rangeText?: string
  againstText?: string | null
}

type Metric = "total" | "aov" | "orders"
type Shape = { showShipping: boolean; showFulfillment: boolean; showKinds: boolean }

export function CommerceReports({ span, compare, timeZone, product = "all", property = "all", kind = "all", showShipping: askShipping = true, showFulfillment: askFulfillment = true, showKinds: askKinds = false, viewer = null, refresh = 0, rangeText, againstText = null }: CommerceReportsProps) {
  const currency = useStoreCurrency()
  const key = commerceKey({ start: span.start, end: span.end, compare, product, property, timeZone, currency, kind })
  const question = commerceQuestionOf(key)
  const [state, setState] = React.useState<{ data: Answer | null; question: string; loading: boolean; shape?: Shape }>(() => ({ data: null, question: "", loading: true }))
  const asked: Shape = { showShipping: askShipping, showFulfillment: askFulfillment, showKinds: askKinds }
  const [metric, setMetric] = React.useState<Metric>("total")
  const refreshed = React.useRef(refresh)
  /* A failed read asks again twice, quietly, then says so with Try again (round 53, lib/ui/quiet-retry). It used to leave the gray shapes for good. */
  const quiet = useQuietRetry(question)
  const [failed, setFailed] = React.useState(false)

  /* Before the paint: the kept answer to this question, so a return draws its numbers in the first frame. */
  React.useLayoutEffect(() => {
    const known = keptCommerce<Answer>(key, viewer)
    setState((s) => (known && s.question !== question ? { data: known.answer, question, loading: true, shape: asked } : { ...s, loading: true }))
    const polled = refreshed.current !== refresh
    refreshed.current = refresh
    if (known && !polled && Date.now() - known.at < COMMERCE_FRESH_MS) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    let live = true
    askCommerce<Answer>(key, viewer)
      .then((d) => {
        if (!live) return
        setFailed(false)
        setState({ data: d, question, loading: false, shape: asked })
      })
      .catch(() => {
        if (!live) return
        const gaveUp = quiet.failed()
        setFailed(gaveUp)
        setState((s) => ({ ...s, loading: !gaveUp }))
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewer, refresh, quiet.tick])

  const data = state.data
  /* Numbers for another question stay on screen, softened, until this one's land. */
  const soft = !!data && state.question !== question
  /*
    THE CARDS OF THE ANSWER ON SCREEN (round 51). Shipping, the shipping line and the Digital and Physical columns
    followed the type the moment it was chosen, while the numbers were still the last type's: All to Digital took the
    Shipping card away at once and the Digital cards came 600ms later, a jump each (scripts/check-analytics-empty-r51.mjs
    SWITCH). Until the new answer lands they are the old answer's, and everything changes in the one frame.
  */
  const { showShipping, showFulfillment, showKinds } = soft && state.shape ? state.shape : asked
  const compared = compare !== null && data?.compared !== false
  /* In the currency's own decimals, as the tab above: a yen store's 2500 is ¥2,500. */
  const money = React.useCallback((n: number) => formatMinor(n, data?.currency || currency || "USD", appLocale()), [data?.currency, currency])
  const b = data?.breakdown
  const p = data?.previous
  /* The Digital and Physical columns: a store that sells both, every kind counted together. */
  const kinds = showKinds ? data?.kinds ?? null : null
  const rows: Array<{ key: keyof SalesBreakdown; label: string; sign?: "-"; strong?: boolean; invert?: boolean }> = [
    { key: "gross", label: tt("Gross sales") },
    { key: "discounts", label: tt("Discounts"), sign: "-", invert: true },
    { key: "returns", label: tt("Returns"), sign: "-", invert: true },
    { key: "net", label: tt("Net sales"), strong: true },
    ...(showShipping ? [{ key: "shipping" as const, label: tt("Shipping charges") }] : []),
    { key: "taxes", label: tt("Taxes") },
    { key: "tips", label: tt("Tips") },
    { key: "total", label: tt("Total sales"), strong: true },
  ]
  /*
    Round 51: while the answer is on its way the breakdown draws the three lines it always has, not all eight. It drew
    every line and then took away the ones at nothing, so the card fell from 378px to 246px when the numbers came
    (scripts/check-analytics-empty-r51.mjs); most periods hold no discount, return, tax or tip.
  */
  const shownRows = rows.filter((r) => r.key === "gross" || r.key === "net" || r.key === "total" || (!!b && (b[r.key] as number) !== 0) || (!!p && (p[r.key] as number) !== 0))
  const signed = (v: number, sign?: "-") => (sign && v > 0 ? `−${money(v)}` : money(v))
  const channels = (data?.channels ?? []).slice(0, CHANNEL_ROWS)
  const channelMax = Math.max(1, ...channels.map((c) => c.total))
  const hours = data?.fulfillment.hours ?? null
  const waitText = hours === null ? null : hours < 1 ? tt("{n} min", { n: Math.max(1, Math.round(hours * 60)) }) : hours < 48 ? tt("{n} h", { n: Math.round(hours * 10) / 10 }) : tt("{n} days", { n: Math.round((hours / 24) * 10) / 10 })
  const rate = data?.fulfillmentRate ?? null
  const rateBefore = data?.fulfillmentRateBefore ?? null
  const grain = data?.grain ?? "day"
  const zone = data?.timeZone ?? timeZone
  /*
    THE SHIPPING CARD, ONLY WHEN THERE WAS SOMETHING TO SHIP: a store that
    ships, and a physical order in the period (in the whole, or in the
    Physical column). A month of downloads only is no reason for a card of
    dashes.
  */
  const physicalOrders = Math.max(rate?.orders ?? 0, kinds?.physical.orders ?? 0)
  const shipping = showFulfillment && !!data && physicalOrders > 0

  const figures = [
    /* Nothing to divide by is said in words, not a dash (round 49). */
    { key: "aov", title: tt("Average order value"), blank: !!b && !b.orders, value: b ? money(b.orders ? b.aov : 0) : null, delta: b && !b.orders ? <FigureEmpty>{tt("No orders in this period.")}</FigureEmpty> : b && p && b.orders && p.orders ? <Delta compared={compared} now={b.aov} before={p.aov} /> : null, help: tt("Gross sales less discounts, divided by orders.") },
    {
      key: "returning",
      title: tt("Returning customer rate"),
      blank: !!b && !b.customers,
      value: b ? percentText(b.customers ? b.returningRate : 0) : null,
      delta: b && !b.customers ? <FigureEmpty>{tt("No customers in this period.")}</FigureEmpty> : b && p ? (
        b.customers ? (
          <span className="inline-flex items-center gap-2">
            {/* A period with no customer had no rate: nothing to compare with, not "New". */}
            {p.customers ? <Delta compared={compared} now={b.returningRate} before={p.returningRate} /> : null}
            <span className="text-[12px] tabular-nums text-[#6b7280]">{tt("{n} of {count}", { n: b.returningCustomers, count: b.customers })}</span>
          </span>
        ) : null
      ) : null,
      help: tt("Customers who had ordered before, or ordered twice in this period, out of every customer who ordered in it."),
    },
  ]

  const metricValue = React.useCallback((pt: Point) => (metric === "aov" ? pt.aov : metric === "orders" ? pt.orders : pt.total), [metric])
  const metricFormat = React.useCallback((n: number) => (metric === "orders" ? Math.round(n).toLocaleString(appLocale()) : money(n)), [metric, money])
  const head = b && p ? (metric === "aov" ? { now: b.aov, before: p.aov, text: money(b.orders ? b.aov : 0) } : metric === "orders" ? { now: b.orders, before: p.orders, text: b.orders.toLocaleString(appLocale()) } : { now: b.total, before: p.total, text: money(b.total) }) : null

  /* ── Each card, opened (./report-detail): its own panel, drawn from this answer. ── */
  /*
    OPENING A CARD RENDERS THE PANEL, NOT THE CARDS (round 49, "no long tasks over 50ms during open"). The panel's
    state was this component's, so a press rendered every sales card again under the opening panel: one 130ms task
    at 1440 wide (scripts/check-analytics-r49.mjs). It is CommerceDetail's now; the cards hand it a way to build the
    view from this answer (buildDetail) and open it through a stable callback, so they are not rendered by a press.
  */
  const opener = React.useRef<((id: string, metric: Metric) => void) | null>(null)
  const metricNow = React.useRef(metric)
  metricNow.current = metric
  const openDetail = React.useCallback((id: string) => opener.current?.(id, id === "aov" ? "aov" : metricNow.current), [])
  const buildDetail = React.useCallback((detailId: string | null, detailMetric: Metric, setDetailMetric: (m: Metric) => void): DetailView | null => {
    if (!detailId || !data || !b || !p) return null
    const count = (n: number) => Math.round(n).toLocaleString(appLocale())
    if (detailId === "sales-over-time" || detailId === "aov") {
      const m = detailMetric
      const pick = (pt: Point) => (m === "aov" ? pt.aov : m === "orders" ? pt.orders : pt.total)
      const fmt = m === "orders" ? count : money
      const labels = data.series.map((pt) => bucketLabel(pt.t, grain, zone))
      const now = m === "aov" ? b.aov : m === "orders" ? b.orders : b.total
      const before = m === "aov" ? p.aov : m === "orders" ? p.orders : p.total
      const name = m === "aov" ? tt("Average order value") : m === "orders" ? tt("Orders") : tt("Total sales")
      return {
        title: m === "aov" ? tt("Average order value over time") : m === "orders" ? tt("Orders over time") : tt("Total sales over time"),
        tabs: <ReportTabs label={tt("Sales over time")} value={m} onChange={setDetailMetric} options={[{ value: "total", label: tt("Total sales") }, { value: "aov", label: tt("Average order value") }, { value: "orders", label: tt("Orders") }]} />,
        figure: { value: m === "aov" && !b.orders ? "–" : fmt(now), now, before, beforeText: fmt(before) },
        chart: { labels, current: data.series.map(pick), previous: compared ? data.previousSeries.map(pick) : [], format: fmt, integer: m === "orders", label: name },
        sections: [{ title: tt("Over time"), format: fmt, rows: data.series.map((pt, i) => ({ key: `${i}`, label: labels[i], value: pick(pt), previous: compared && data.previousSeries[i] ? pick(data.previousSeries[i]) : compared ? 0 : undefined })) }],
      }
    }
    if (detailId === "sales-by-channel") {
      return {
        title: tt("Total sales by channel"),
        figure: { value: money(b.total), now: b.total, before: p.total, beforeText: money(p.total) },
        sections: [{ title: tt("Channels"), format: money, bars: true, valueLabel: tt("Sales"), empty: tt("No sales in this period."), rows: (data.channels ?? []).map((c) => ({ key: c.key, label: channelName(c), value: c.total, note: tt("{count, plural, one {# order} other {# orders}}", { count: c.orders }) })) }],
        help: tt("Where each order was placed: each of your websites by its name, your OnePage, your creator page, Storelib Explore or a checkout link opened on its own."),
      }
    }
    if (detailId === "returning") {
      return {
        title: tt("Returning customer rate"),
        figure: { value: b.customers ? percentText(b.returningRate) : "–", now: b.customers ? b.returningRate : null, before: p.customers ? p.returningRate : null, beforeText: p.customers ? percentText(p.returningRate) : undefined },
        sections: [
          {
            title: tt("Customers"),
            format: count,
            rows: [
              { key: "customers", label: tt("Customers"), value: b.customers, previous: p.customers },
              { key: "returning", label: tt("Returning customers"), value: b.returningCustomers, previous: p.returningCustomers },
              { key: "new", label: tt("New customers"), value: b.customers - b.returningCustomers, previous: p.customers - p.returningCustomers },
              { key: "orders", label: tt("Orders"), value: b.orders, previous: p.orders },
            ],
          },
        ],
        help: tt("Customers who had ordered before, or ordered twice in this period, out of every customer who ordered in it."),
      }
    }
    if (detailId === "shipping") {
      return {
        title: tt("Shipping"),
        sections: [
          {
            title: tt("This period's physical orders"),
            format: count,
            rows: [
              { key: "fulfilled", label: tt("Fulfilled"), value: rate?.rate ?? 0, text: rate && rate.rate !== null ? percentText(rate.rate) : "–", previous: rateBefore?.rate ?? undefined, previousText: rateBefore && rateBefore.rate !== null ? percentText(rateBefore.rate) : "–" },
              { key: "sent", label: tt("Sent"), value: rate?.fulfilled ?? 0, previous: rateBefore?.fulfilled },
              { key: "parcels", label: tt("Parcels shipped"), value: data.fulfillment.shipped, previous: data.fulfillmentBefore?.shipped },
              { key: "wait", label: tt("Time to ship"), value: hours ?? 0, text: waitText ?? "–", invert: true, previous: data.fulfillmentBefore?.hours ?? undefined, previousText: data.fulfillmentBefore?.hours == null ? "–" : undefined },
              { key: "charged", label: tt("Shipping charged"), value: (kinds ? kinds.physical.shipping : b.shipping) || 0, text: money((kinds ? kinds.physical.shipping : b.shipping) || 0), previous: p.shipping, previousText: money(p.shipping) },
            ],
          },
        ],
        help: tt("This period's physical orders: the share shipped or delivered, how long a parcel waited from payment to shipped, and the shipping buyers paid."),
      }
    }
    if (detailId === "sales-breakdown") {
      const line = (bd: SalesBreakdown, before: SalesBreakdown | null): DetailRow[] =>
        rows.map((r) => ({ key: r.key, label: r.label, value: bd[r.key] as number, previous: before ? (before[r.key] as number) : undefined, strong: r.strong, invert: r.invert, text: signed(bd[r.key] as number, r.sign), previousText: before ? signed(before[r.key] as number, r.sign) : undefined }))
      return {
        title: tt("Sales breakdown"),
        figure: { value: money(b.total), now: b.total, before: p.total, beforeText: money(p.total) },
        sections: [
          { title: kinds ? tt("Total") : tt("Sales breakdown"), format: money, rows: line(b, p) },
          ...(kinds ? [{ title: tt("Digital"), format: money, rows: line(kinds.digital, null) }, { title: tt("Physical"), format: money, rows: line(kinds.physical, null) }] : []),
        ],
        help: tt("Gross sales less discounts and returns is net sales. Add shipping, taxes and tips for total sales."),
      }
    }
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, b, p, compared, money, grain, zone, kinds, showShipping])
  const range = rangeText ? (againstText ? tt("{range} compared with {against}", { range: rangeText, against: againstText }) : rangeText) : null

  /*
    THE LAYOUT, BALANCED (round 41, the owner: "the report cards leave a big empty area on the right"). From 1024px
    three columns: sales over time takes two and the height of two rows, with Average order value and the Returning
    customer rate one above the other beside it, so the short figures fill the column the chart leaves; then the
    channels beside the breakdown (one column and two), and Shipping the whole width. The short figures used to stack
    under the chart with the half beside them empty, and the channels sat in a tall card of their own across from the
    chart. Below 1024px every card is the full width, one under the other.
  */
  /* Given up on (round 53): one line with Try again where the cards would be, not gray shapes that never fill. */
  if (failed && !data) {
    return (
      <div role="alert" data-read-failed="" data-commerce-reports="" className="flex items-center justify-between gap-3 rounded-xl border border-[#fde8e7] bg-[#fff7f6] px-4 py-3">
        <p className="min-w-0 text-[13px] text-[#8a1c0f]">{tt("The sales reports could not be loaded.")}</p>
        <button type="button" onClick={quiet.again} className="h-8 shrink-0 cursor-pointer rounded-lg px-3 text-[13px] font-medium text-[#8a1c0f] hover:bg-[#fde8e7]">
          {tt("Try again")}
        </button>
      </div>
    )
  }
  return (
    <OpenDetailContext.Provider value={openDetail}>
    <div aria-busy={state.loading} className={cn("grid grid-cols-1 gap-4 transition-opacity duration-200 lg:grid-cols-3", soft ? "opacity-60 delay-150" : "opacity-100")} data-commerce-reports="">

      <Card
        card="sales-over-time"
        detail="sales-over-time"
        className="lg:col-span-2 lg:row-span-2"
        title={metric === "aov" ? tt("Average order value over time") : metric === "orders" ? tt("Orders over time") : tt("Total sales over time")}
        help={tt("This period against the one before it, at the same points. Point at a day to read it.")}
        tabs={
          <ReportTabs
            label={tt("Sales over time")}
            value={metric}
            onChange={setMetric}
            options={[
              { value: "total", label: tt("Total sales") },
              { value: "aov", label: tt("Average order value") },
              { value: "orders", label: tt("Orders") },
            ]}
          />
        }
      >
        <div className="h-[208px]">
          <div className="mb-3 flex h-7 items-baseline gap-2.5" data-figure="">
            {head ? (
              <>
                <span className="text-[22px] font-bold tabular-nums tracking-tight text-[#1a1a2e]">{head.text}</span>
                <Delta compared={compared} now={head.now} before={head.before} />
              </>
            ) : (
              <Pending w="w-20" />
            )}
          </div>
          {data ? (
            <LineChart series={data.series} previous={compared ? data.previousSeries : []} format={metricFormat} value={metricValue} grain={grain} timeZone={zone} integer={metric === "orders"} label={metric === "aov" ? tt("Average order value") : metric === "orders" ? tt("Orders") : tt("Total sales")} emptyText={metric === "total" ? tt("No sales in this period.") : tt("No orders in this period.")} />
          ) : (
            <div aria-hidden className="relative h-[150px]">
              <span className="absolute inset-x-0 bottom-0.5 h-px bg-[#eceef1]" />
            </div>
          )}
        </div>
        <Legend compared={compare !== null} />
      </Card>

      {/*
        The two figures, each a card of its own beside the chart: the name and its way in on top, the number and
        its change under it. They share the chart's height between them from 1024px, and are short rows under it
        on a phone.
      */}
      {figures.map((f) => (
        <section key={f.key} data-card={f.key} className="relative flex min-h-[96px] min-w-0 flex-col justify-between gap-3 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <div className="flex min-h-6 items-center gap-2">
            <div className="min-w-0 flex-1">
              <HelpLabel as="h3" label={f.title} description={f.help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
            </div>
            <ViewReport id={f.key} label={f.title} />
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <span className={cn("flex h-8 items-center whitespace-nowrap text-[26px] font-bold leading-8 tabular-nums tracking-tight transition-colors duration-200", f.blank ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{f.value ?? <Pending w="w-20" />}</span>
            <span className="h-[18px] whitespace-nowrap">{f.delta}</span>
          </div>
        </section>
      ))}

      <Card card="sales-by-channel" title={tt("Total sales by channel")} detail="sales-by-channel" help={tt("Where each order was placed: each of your websites by its name, your OnePage, your creator page, Storelib Explore or a checkout link opened on its own.")}>
        {/* Round 51: as tall as its empty state (a line and four ghost rows), so a period with no sale and the wait for one are the same card. */}
        <div className="min-h-[164px]">
          {!data ? (
            <div aria-hidden className="space-y-3">
              {[0.9, 0.55, 0.3].map((w, i) => (
                <div key={i}>
                  <div className="flex h-5 items-center justify-between">
                    <Pending w="w-24" />
                    <Pending w="w-16" />
                  </div>
                  <ShimmerBlock className="mt-1.5 h-1.5 rounded-full" style={{ width: `${w * 100}%` }} />
                </div>
              ))}
            </div>
          ) : channels.length === 0 ? (
            <EmptyState>{tt("No sales in this period.")}</EmptyState>
          ) : (
            <div className="space-y-3">
              {channels.map((c) => (
                <div key={c.key} data-channel={c.key}>
                  <div className="flex h-5 items-center justify-between gap-3 text-[13.5px]">
                    <span className="truncate text-[#303036]">{channelName(c)}</span>
                    <span className="shrink-0 tabular-nums text-[#1a1a2e]">
                      {money(c.total)} <span className="text-[12px] text-[#9ca3af]">· {tt("{count, plural, one {# order} other {# orders}}", { count: c.orders })}</span>
                    </span>
                  </div>
                  <ReportFill share={c.total / channelMax} thin className="mt-1.5 h-1.5 rounded-full" />
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/*
        THE BREAKDOWN LAST, AND SHORT (round 23, the owner: "the total sales breakdown seems too complicated, too much
        text, and should not be the first"). Sales over time leads, as Shopify's analytics does; the breakdown follows
        the figures, with only the lines that hold money in either period (gross, net and total always), and no
        change column: the change is the chart's.
      */}
      <Card card="sales-breakdown" title={tt("Sales breakdown")} detail="sales-breakdown" help={tt("Gross sales less discounts and returns is net sales. Add shipping, taxes and tips for total sales.")} className="lg:col-span-2">
        {kinds || (showKinds && !data) ? (
          /* The columns' names, over the amounts they head; there while the answer comes, so the lines do not move down. */
          <div className="flex h-7 items-end justify-between gap-3 border-b border-[#f1f2f4] pb-1.5 text-[11.5px] font-medium text-[#6b7280]" data-kind-columns="">
            <span />
            <span className="flex shrink-0 items-center gap-2 sm:gap-3">
              <span className="w-[72px] text-right sm:w-[84px]">{tt("Digital")}</span>
              <span className="w-[72px] text-right sm:w-[84px]">{tt("Physical")}</span>
              <span className="w-[76px] text-right sm:w-[88px]">{tt("Total")}</span>
            </span>
          </div>
        ) : null}
        <div className="divide-y divide-[#f1f2f4]">
          {shownRows.map((r) => (
            <div key={r.key} data-line={r.key} className={cn("flex h-[37px] items-center justify-between gap-3", kinds ? "text-[12.5px] sm:text-[13.5px]" : "text-[13.5px]", r.strong ? "font-semibold text-[#1a1a2e]" : "text-[#374151]")}>
              {/* With the kind columns a phone has room for "Shipping", not "Shipping charges". */}
              <span className="min-w-0 truncate">{kinds && r.key === "shipping" ? <><span className="sm:hidden">{tt("Shipping")}</span><span className="hidden sm:inline">{r.label}</span></> : r.label}</span>
              <span className="flex shrink-0 items-center gap-2 sm:gap-3">
                {kinds ? (
                  <>
                    <span data-kind="digital" className="w-[72px] text-right tabular-nums text-[#4b5563] sm:w-[84px]">{signed(kinds.digital[r.key] as number, r.sign)}</span>
                    <span data-kind="physical" className="w-[72px] text-right tabular-nums text-[#4b5563] sm:w-[84px]">{signed(kinds.physical[r.key] as number, r.sign)}</span>
                  </>
                ) : null}
                <span data-kind="total" className={cn("text-right tabular-nums", kinds ? "w-[76px] sm:w-[88px]" : "min-w-[88px]")}>{b ? signed(b[r.key] as number, r.sign) : <Pending />}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>
      {shipping && b ? (
        /*
          SHIPPING, A SECTION OF ITS OWN, only for a period with a physical order: how many went out, how
          long they waited and what buyers paid for delivery. Three figures in one card, side by side from
          sm up and one under the other on a phone.
        */
        <Card card="shipping" title={tt("Shipping")} detail="shipping" help={tt("This period's physical orders: the share shipped or delivered, how long a parcel waited from payment to shipped, and the shipping buyers paid.")} className="lg:col-span-3">
          <dl className="grid grid-cols-1 divide-y divide-[#f1f2f4] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <div data-card="fulfil" className="flex items-center justify-between gap-3 py-2.5 sm:block sm:py-0 sm:pr-5">
              <dt className="text-[13px] text-[#4b5563]">{tt("Fulfilled")}</dt>
              <dd className="flex flex-col items-end gap-0.5 sm:mt-1 sm:items-start">
                <span className="text-[22px] font-bold leading-7 tabular-nums tracking-tight text-[#1a1a2e]">{rate && rate.rate !== null ? percentText(rate.rate) : "–"}</span>
                <span className="inline-flex items-center gap-2 text-[12px] tabular-nums text-[#6b7280]">
                  {rate && rate.rate !== null && rateBefore && rateBefore.rate !== null ? <Delta compared={compared} now={rate.rate} before={rateBefore.rate} /> : null}
                  {rate && rate.orders ? tt("{n} of {count} sent", { n: rate.fulfilled, count: rate.orders }) : null}
                </span>
              </dd>
            </div>
            <div data-shipping="wait" className="flex items-center justify-between gap-3 py-2.5 sm:block sm:px-5 sm:py-0">
              <dt className="text-[13px] text-[#4b5563]">{tt("Time to ship")}</dt>
              <dd className="flex flex-col items-end gap-0.5 sm:mt-1 sm:items-start">
                <span className="text-[22px] font-bold leading-7 tabular-nums tracking-tight text-[#1a1a2e]">{waitText ?? "–"}</span>
                <span className="text-[12px] tabular-nums text-[#6b7280]">{data?.fulfillment.shipped ? tt("{count, plural, one {# parcel} other {# parcels}}", { count: data.fulfillment.shipped }) : tt("None shipped yet")}</span>
              </dd>
            </div>
            <div data-shipping="charged" className="flex items-center justify-between gap-3 py-2.5 sm:block sm:py-0 sm:pl-5">
              <dt className="text-[13px] text-[#4b5563]">{tt("Shipping charged")}</dt>
              <dd className="flex flex-col items-end gap-0.5 sm:mt-1 sm:items-start">
                <span className="text-[22px] font-bold leading-7 tabular-nums tracking-tight text-[#1a1a2e]">{money((kinds ? kinds.physical.shipping : b.shipping) || 0)}</span>
                <span className="text-[12px] tabular-nums text-[#6b7280]">{tt("{count, plural, one {# physical order} other {# physical orders}}", { count: physicalOrders })}</span>
              </dd>
            </div>
          </dl>
        </Card>
      ) : null}
      {data?.truncated ? (
        <p data-commerce-truncated="" className="text-[12px] text-[#6b7280] lg:col-span-3">{tt("This period has more orders than one report reads at once, so these figures leave the latest ones out. Choose a shorter period for exact figures.")}</p>
      ) : null}
      {data?.placeUnknown ? (
        <p className="text-[12px] text-[#6b7280] lg:col-span-3">{tt("Orders do not record their page on this store yet, so the sales reports count every page.")}</p>
      ) : null}
    </div>
      <CommerceDetail opener={opener} build={buildDetail} range={range} soft={soft} compared={compared} />
    </OpenDetailContext.Provider>
  )
}

/**
 * READ AHEAD (round 41): the sales reports for a question about to be asked
 * (a pointer resting on Digital), fetched now and kept (lib/analytics/
 * commerce-cache), so the tap draws them from memory. Joins one on its way.
 */
export function prefetchCommerce(q: { start: number; end: number; compare: { start: number; end: number } | null; product: string; property: string; timeZone: string; currency?: string; kind?: string }, viewer: string | null) {
  try {
    const key = commerceKey(q)
    const known = keptCommerce(key, viewer)
    if (known && Date.now() - known.at < COMMERCE_FRESH_MS) return
    askCommerce(key, viewer).catch(() => {})
  } catch {
    /* a read ahead that fails is a tap that asks for itself */
  }
}

/** The opened sales card: its own state, so opening, switching its tab and closing render the panel alone. */
function CommerceDetail({ opener, build, range, soft, compared }: { opener: React.MutableRefObject<((id: string, metric: Metric) => void) | null>; build: (id: string | null, metric: Metric, setMetric: (m: Metric) => void) => DetailView | null; range: string | null; soft: boolean; compared: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [id, setId] = React.useState<string | null>(null)
  const [metric, setMetric] = React.useState<Metric>("total")
  React.useEffect(() => {
    opener.current = (next, m) => {
      setId(next)
      setMetric(m)
      setOpen(true)
    }
    return () => {
      opener.current = null
    }
  }, [opener])
  const view = React.useMemo(() => build(id, metric, setMetric), [build, id, metric])
  return (
    <DetailPanel open={open} onClose={() => setOpen(false)} title={view?.title ?? ""} sub={range} panelKey={id ?? undefined}>
      <div data-detail-id={id ?? undefined} className={cn("transition-opacity duration-200", soft ? "opacity-60 delay-150" : "opacity-100")}>
        {view ? <DetailBody view={view} compared={compared} /> : null}
      </div>
    </DetailPanel>
  )
}
