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
import { ReportFill, ReportTabs } from "./analytics-reports"

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

function Card({ title, help, children, className, card, tabs }: { title: string; help: string; children: React.ReactNode; className?: string; card: string; tabs?: React.ReactNode }) {
  return (
    <section data-card={card} className={cn("flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]", className)}>
      <header className="flex min-h-[52px] flex-col justify-center gap-2.5 px-5 pt-4">
        <div className="min-w-0">
          <HelpLabel as="h3" label={title} description={help} className="max-w-full truncate text-[14px] font-semibold text-[#1a1a2e]" />
        </div>
        {tabs ? <div className="orders-strip -mx-1 overflow-x-auto px-1">{tabs}</div> : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5 pt-2">{children}</div>
    </section>
  )
}

function Delta({ now, before, invert = false, compared }: { now: number; before: number; invert?: boolean; compared: boolean }) {
  if (!compared) return null
  if (before === 0) return <span className="text-[12px] text-[#9ca3af]">{now > 0 ? tt("New") : "–"}</span>
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
function LineChart({ series, previous, format, value, grain, timeZone, label, integer }: { series: Point[]; previous: Point[]; format: (n: number) => string; value: (p: Point) => number; grain: Grain; timeZone: string; label: string; integer: boolean }) {
  const labels = React.useMemo(() => series.map((p) => bucketLabel(p.t, grain, timeZone)), [series, grain, timeZone])
  const current = React.useMemo(() => series.map(value), [series, value])
  const before = React.useMemo(() => previous.map(value), [previous, value])
  return <TrendMiniChart labels={labels} current={current} previous={before} format={format} height={150} integer={integer} label={label} readoutTop={-50} />
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
}

type Metric = "total" | "aov" | "orders"

export function CommerceReports({ span, compare, timeZone, product = "all", property = "all", kind = "all", showShipping = true, showFulfillment = true, showKinds = false, viewer = null, refresh = 0 }: CommerceReportsProps) {
  const currency = useStoreCurrency()
  const key = commerceKey({ start: span.start, end: span.end, compare, product, property, timeZone, currency, kind })
  const question = commerceQuestionOf(key)
  const [state, setState] = React.useState<{ data: Answer | null; question: string; loading: boolean }>(() => ({ data: null, question: "", loading: true }))
  const [metric, setMetric] = React.useState<Metric>("total")
  const refreshed = React.useRef(refresh)

  /* Before the paint: the kept answer to this question, so a return draws its numbers in the first frame. */
  React.useLayoutEffect(() => {
    const known = keptCommerce<Answer>(key, viewer)
    setState((s) => (known && s.question !== question ? { data: known.answer, question, loading: true } : { ...s, loading: true }))
    const polled = refreshed.current !== refresh
    refreshed.current = refresh
    if (known && !polled && Date.now() - known.at < COMMERCE_FRESH_MS) {
      setState((s) => ({ ...s, loading: false }))
      return
    }
    let live = true
    askCommerce<Answer>(key, viewer)
      .then((d) => live && setState({ data: d, question, loading: false }))
      .catch(() => live && setState((s) => ({ ...s, loading: false })))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, viewer, refresh])

  const data = state.data
  /* Numbers for another question stay on screen, softened, until this one's land. */
  const soft = !!data && state.question !== question
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
  const shownRows = rows.filter((r) => r.key === "gross" || r.key === "net" || r.key === "total" || !b || (b[r.key] as number) !== 0 || (!!p && (p[r.key] as number) !== 0))
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
    { key: "aov", title: tt("Average order value"), value: b ? (b.orders ? money(b.aov) : "–") : null, delta: b && p && b.orders && p.orders ? <Delta compared={compared} now={b.aov} before={p.aov} /> : null, help: tt("Gross sales less discounts, divided by orders.") },
    {
      key: "returning",
      title: tt("Returning customer rate"),
      value: b ? (b.customers ? percentText(b.returningRate) : "–") : null,
      delta: b && p ? (
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
  const head = b && p ? (metric === "aov" ? { now: b.aov, before: p.aov, text: b.orders ? money(b.aov) : "–" } : metric === "orders" ? { now: b.orders, before: p.orders, text: b.orders.toLocaleString(appLocale()) } : { now: b.total, before: p.total, text: money(b.total) }) : null

  return (
    <div aria-busy={state.loading} className={cn("grid grid-cols-1 gap-3 transition-opacity duration-300 lg:grid-cols-2", soft ? "opacity-60" : "opacity-100")} data-commerce-reports="">

      <Card
        card="sales-over-time"
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
            <LineChart series={data.series} previous={compared ? data.previousSeries : []} format={metricFormat} value={metricValue} grain={grain} timeZone={zone} integer={metric === "orders"} label={metric === "aov" ? tt("Average order value") : metric === "orders" ? tt("Orders") : tt("Total sales")} />
          ) : (
            <div aria-hidden className="relative h-[150px]">
              <span className="absolute inset-x-0 bottom-0.5 h-px bg-[#eceef1]" />
            </div>
          )}
        </div>
        <Legend compared={compare !== null} />
      </Card>

      <Card card="sales-by-channel" title={tt("Total sales by channel")} help={tt("Where each order was placed: each of your websites by its name, your OnePage, your creator page, Storelib Explore or a checkout link opened on its own.")}>
        <div className="h-[200px]">
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
            <p className="flex h-full items-center justify-center text-center text-[13px] text-[#6b7280]">{tt("No sales in this period.")}</p>
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
        The figures, one under the other beside the channels: the name on the left, never cut, and the number on
        the right with its change under it. Three tiles side by side squeezed the names ("Returning customer rate")
        and the numbers ("22 min") on a laptop, so they stack at every width.
      */}
      <div className="grid grid-cols-1 content-start gap-3">
        {figures.map((f) => (
          <section key={f.key} data-card={f.key} className="flex min-h-[76px] min-w-0 items-center justify-between gap-4 rounded-2xl border border-[#e5e7eb]/60 bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <HelpLabel as="h3" label={f.title} description={f.help} className="min-w-0 text-[13.5px] font-medium leading-5 text-[#4b5563]" />
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="flex h-7 items-center whitespace-nowrap text-[22px] font-bold leading-7 tabular-nums tracking-tight text-[#1a1a2e]">{f.value ?? <Pending w="w-20" />}</span>
              <span className="h-[18px] whitespace-nowrap">{f.delta}</span>
            </div>
          </section>
        ))}
      </div>

      {shipping && b ? (
        /*
          SHIPPING, A SECTION OF ITS OWN, only for a period with a physical order: how many went out, how
          long they waited and what buyers paid for delivery. Three figures in one card, side by side from
          sm up and one under the other on a phone.
        */
        <Card card="shipping" title={tt("Shipping")} help={tt("This period's physical orders: the share shipped or delivered, how long a parcel waited from payment to shipped, and the shipping buyers paid.")} className="lg:col-span-2">
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
      {/*
        THE BREAKDOWN LAST, AND SHORT (round 23, the owner: "the total sales breakdown seems too complicated, too much
        text, and should not be the first"). Sales over time leads, as Shopify's analytics does; the breakdown follows
        the figures, with only the lines that hold money in either period (gross, net and total always), and no
        change column: the change is the chart's.
      */}
      <Card card="sales-breakdown" title={tt("Sales breakdown")} help={tt("Gross sales less discounts and returns is net sales. Add shipping, taxes and tips for total sales.")} className="lg:col-span-2">
        {kinds ? (
          /* The columns' names, over the amounts they head. */
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
      {data?.truncated ? (
        <p data-commerce-truncated="" className="text-[12px] text-[#6b7280] lg:col-span-2">{tt("This period has more orders than one report reads at once, so these figures leave the latest ones out. Choose a shorter period for exact figures.")}</p>
      ) : null}
      {data?.placeUnknown ? (
        <p className="text-[12px] text-[#6b7280] lg:col-span-2">{tt("Orders do not record their page on this store yet, so the sales reports count every page.")}</p>
      ) : null}
    </div>
  )
}
