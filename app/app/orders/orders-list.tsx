"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  ListFilter,
  Search,
  X,
} from "lucide-react"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { presetRange, rangeLabel, type RangeValue } from "@/lib/date-range/range"
import {
  COLUMNS,
  SHIP_FILTERS,
  SORTS,
  SOURCE_LABEL,
  VIEWS,
  inView,
  itemsLabel,
  listDate,
  type ColumnKey,
  type ListQuery,
  type Order,
} from "@/lib/orders/order-view"
import { METRICS, type MetricReading } from "@/lib/orders/metrics"
import { fromLabel, sourceText } from "@/lib/orders/order-source"
import { HelpLabel } from "@/components/app/help-label"
import { ScrollEdge } from "@/components/app/scroll-edge"
import {
  Checkbox,
  DeliveryBadge,
  FulfillmentBadge,
  MenuOption,
  MenuSurface,
  PaymentBadge,
  ShipBadge,
  Sparkline,
  buttonAccent,
  buttonSecondary,
  card,
  formatMoney,
  iconButton,
  GUTTER,
  LIST_BAR,
  LIST_WIDTH,
  PaneBar,
} from "./order-parts"
import { HOVER_PREFETCH_MS, prefetchOrder } from "./order-prefetch"
import { tt } from "@/lib/i18n/text"
import { appLocale } from "@/lib/i18n/format"

export interface OrdersListProps {
  allOrders: Order[]
  pageOrders: Order[]
  matching: number
  range: { page: number; pages: number; from: number; to: number }
  query: ListQuery
  onQuery: (next: Partial<ListQuery>) => void
  searchText: string
  onSearchText: (q: string) => void
  period: RangeValue
  onPeriod: (v: RangeValue) => void
  today: string
  /** The first order's day, where "All time" begins. */
  firstDay?: string
  /** There is a window to compare with, so the changes mean something. */
  comparable: boolean
  metrics: MetricReading[]
  hidden: Set<ColumnKey>
  onToggleColumn: (key: ColumnKey) => void
  selected: Set<string>
  onSelect: (ids: string[], on: boolean) => void
  onOpen: (id: string) => void
  onExport: () => void
  products: Array<{ id: string; title: string }>
  stripeConnected: boolean
  now: number
  timeZone: string
}

export function OrdersList(props: OrdersListProps) {
  const { allOrders, stripeConnected } = props
  return (
    <>
      {/* The top bar: the same bar, the pane's full width, as an order's own. */}
      <PaneBar width={LIST_WIDTH} className={LIST_BAR}>
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Orders")}</h1>
        <button
          type="button"
          /* 32px to see, 44px to tap on a phone: the reach is a box around it. */
          className={cn(buttonAccent, "relative before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] sm:before:hidden")}
          onClick={() => props.onExport()}
          disabled={allOrders.length === 0}
          data-orders-export=""
          aria-haspopup="dialog"
        >
          <Download className="h-4 w-4" />
          {tt("Export")}
        </button>
      </PaneBar>
      <div className={cn("mx-auto pb-6", LIST_WIDTH, GUTTER)}>

      {!stripeConnected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[#f3e3b3] bg-[#fffaeb] px-4 py-3 text-[13px] text-[#5c4300]">
          <span>{tt("Payouts are not set up, so paid orders cannot be paid out to you yet.")}</span>
          <Link href="/app/payouts" className="font-medium underline underline-offset-2">
            {tt("Set up payouts")}
          </Link>
        </div>
      ) : null}

      {/*
        The same period picker every page in /app has. No comparison control:
        the changes are always against the period just before, as on
        Analytics.
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <DateRangePicker value={props.period} onChange={props.onPeriod} today={props.today} firstDay={props.firstDay} />
      </div>

      <MetricsStrip metrics={props.metrics} comparable={props.comparable} />

      <OrdersTable {...props} />
      </div>
    </>
  )
}

/* ─── Metrics ─────────────────────────────────────────────────────────── */

function MetricsStrip({ metrics, comparable }: { metrics: MetricReading[]; comparable: boolean }) {
  return (
    <section aria-label={tt("Order metrics")} className={cn(card, "mt-3 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {metrics.map((reading, i) => {
          const meta = METRICS.find((m) => m.key === reading.key)!
          return (
            <div
              key={reading.key}
              className={cn(
                /* At least 150px, and as wide as its figure: "257,00 USD Nowe" is longer than "$257.00 New". */
                "flex flex-[1_0_150px] flex-col justify-between px-4 pb-2 pt-3",
                i > 0 && "border-l border-[#eef0f2]",
              )}
            >
              <HelpLabel label={meta.label} description={meta.help} className="text-[12px] font-medium text-[#4b5563]" />
              <div className="mt-1 flex h-6 items-baseline gap-2 whitespace-nowrap">
                <span className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">
                  {meta.money ? formatMoney(reading.value) : Math.round(reading.value).toLocaleString(appLocale())}
                </span>
                {comparable ? <Change reading={reading} upIsBad={!!meta.upIsBad} /> : null}
              </div>
              <div className="mt-1.5">
                <Sparkline series={reading.series} previous={reading.previousSeries} />
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Change({ reading, upIsBad }: { reading: MetricReading; upIsBad: boolean }) {
  if (reading.change === null) {
    return <span className="text-[12px] text-[#9ca3af]">{reading.value > 0 ? tt("New") : "–"}</span>
  }
  const pct = Math.round(reading.change * 100)
  if (pct === 0) return <span className="text-[12px] text-[#9ca3af]">0%</span>
  const good = pct > 0 !== upIsBad
  return (
    <span className={cn("text-[12px] font-medium tabular-nums", good ? "text-[#15803d]" : "text-[#b42318]")}>
      {pct > 0 ? "↑" : "↓"} {Math.abs(pct)}%
    </span>
  )
}

/* ─── Table ───────────────────────────────────────────────────────────── */

function OrdersTable(props: OrdersListProps) {
  const {
    allOrders,
    pageOrders,
    matching,
    range,
    query,
    onQuery,
    hidden,
    selected,
    onSelect,
    onOpen,
    now,
    timeZone,
  } = props

  const filtering = query.q.trim() !== "" || query.source !== "any" || query.product !== "" || (query.fulfillment ?? "any") !== "any"
  const [searching, setSearching] = React.useState(filtering)
  /* The Fulfillment filter is for a shop that ships something: a shop of downloads never sees it. */
  const ships = React.useMemo(() => allOrders.some((o) => o.shipping), [allOrders])
  const searchRef = React.useRef<HTMLInputElement>(null)

  const columns = COLUMNS.filter((c) => !hidden.has(c.key))
  const pageIds = pageOrders.map((o) => o.id)
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length

  return (
    <section aria-label={tt("Orders")} className={cn(card, "mt-4 overflow-hidden")}>
      {/* Toolbar: one row, the same height whether searching or not. */}
      <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
        {searching ? (
          <>
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]">
              <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
              <input
                ref={searchRef}
                autoFocus
                type="search"
                value={props.searchText}
                onChange={(e) => props.onSearchText(e.target.value)}
                placeholder={tt("Search by order, customer or product")}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
              />
              {props.searchText ? (
                <button type="button" aria-label={tt("Clear search")} className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => props.onSearchText("")}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]"
              onClick={() => {
                props.onSearchText("")
                onQuery({ q: "", source: "any", product: "", fulfillment: "any", page: 1 })
                setSearching(false)
              }}
            >
              {tt("Cancel")}
            </button>
          </>
        ) : (
          <>
            <ViewTabs allOrders={allOrders} query={query} onQuery={onQuery} />
            <button
              type="button"
              className={cn(iconButton, "ml-auto w-auto gap-1 px-2")}
              aria-label={tt("Search and filter")}
              title={tt("Search and filter")}
              onClick={() => setSearching(true)}
            >
              <Search className="h-4 w-4" />
              <ListFilter className="h-4 w-4" />
            </button>
          </>
        )}
        <SortMenu value={query.sort} onChange={(sort) => onQuery({ sort, page: 1 })} />
        <ColumnsMenu hidden={hidden} onToggle={props.onToggleColumn} />
      </div>

      {searching ? <FilterRow query={query} onQuery={onQuery} products={props.products} ships={ships} /> : null}

      {pageOrders.length === 0 ? (
        <EmptyState
          hasOrders={allOrders.length > 0}
          filtering={filtering || query.view !== "all"}
          rangeName={props.period.preset === "all_time" ? null : rangeLabel(props.period)}
          onClear={() => {
            props.onSearchText("")
            onQuery({ view: "all", q: "", source: "any", product: "", fulfillment: "any", page: 1 })
            setSearching(false)
          }}
          onAllTime={() => props.onPeriod({ preset: "all_time", ...presetRange("all_time", props.today, props.firstDay) })}
        />
      ) : (
        /* The Order column's edge casts a shadow once rows have gone under it
           (components/app/scroll-edge.tsx). */
        <ScrollEdge className="orders-scroller">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
                <th scope="col" className="orders-sticky left-0 w-10 bg-[#f7f7f8] p-0">
                  <label className="flex h-9 w-10 cursor-pointer items-center pl-3">
                    <Checkbox
                      label={allOnPage ? tt("Deselect all on this page") : tt("Select all on this page")}
                      checked={allOnPage}
                      indeterminate={selectedOnPage > 0 && !allOnPage}
                      onChange={(on) => onSelect(pageIds, on)}
                    />
                  </label>
                </th>
                {selected.size > 0 ? (
                  <th scope="col" colSpan={columns.length + 1} className="orders-sticky left-10 bg-[#f7f7f8] px-2 font-normal">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[#1a1a2e]">{tt("{size} selected", { size: selected.size })}</span>
                      <button type="button" className={cn(buttonSecondary, "h-7 px-2.5 text-[12px]")} onClick={() => props.onExport()}>
                        {tt("Export selected")}
                      </button>
                      <button
                        type="button"
                        className="h-7 rounded-lg px-2 text-[12px] font-medium text-[#4b5563] hover:bg-[#ececef]"
                        onClick={() => onSelect([...selected], false)}
                      >
                        {tt("Clear")}
                      </button>
                    </div>
                  </th>
                ) : (
                  <>
                    <th scope="col" data-scroll-edge="" className="orders-sticky left-10 bg-[#f7f7f8] pl-2 pr-4">
                      {tt("Order")}
                    </th>
                    {columns.map((c) => (
                      <th
                        key={c.key}
                        scope="col"
                        className={cn("bg-[#f7f7f8] px-3", c.align === "right" && "text-right")}
                      >
                        {c.label}
                      </th>
                    ))}
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {pageOrders.map((order) => {
                const isSelected = selected.has(order.id)
                const rowBg = isSelected ? "bg-[#f4f4f6]" : "bg-white group-hover:bg-[#fafafb]"
                return (
                  <tr
                    key={order.id}
                    data-order-id={order.id}
                    className="orders-row group h-10 cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button,input,label")) return
                      onOpen(order.id)
                    }}
                    /* A finger on the row, or a pointer resting on it, reads
                       what the order's timeline will ask for (./order-prefetch). */
                    onPointerDown={() => prefetchOrder(order)}
                    onPointerEnter={(e) => {
                      if (e.pointerType !== "mouse") return
                      const row = e.currentTarget
                      window.clearTimeout(Number(row.dataset.prefetch))
                      row.dataset.prefetch = String(window.setTimeout(() => prefetchOrder(order), HOVER_PREFETCH_MS))
                    }}
                    onPointerLeave={(e) => window.clearTimeout(Number(e.currentTarget.dataset.prefetch))}
                  >
                    <td className={cn("orders-sticky left-0 w-10 border-t border-[#f0f1f3] p-0", rowBg)}>
                      <label className="flex h-10 w-10 cursor-pointer items-center pl-3">
                        <Checkbox
                          label={tt("Select order {number}", { number: order.number })}
                          checked={isSelected}
                          onChange={(on) => onSelect([order.id], on)}
                        />
                      </label>
                    </td>
                    <td data-scroll-edge="" className={cn("orders-sticky left-10 border-t border-[#f0f1f3] pl-2 pr-4", rowBg)}>
                      <a
                        href={`?order=${encodeURIComponent(order.id)}`}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                          e.preventDefault()
                          onOpen(order.id)
                        }}
                        className="font-semibold text-[#1a1a2e] outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        #{order.number}
                      </a>
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "whitespace-nowrap border-t border-[#f0f1f3] px-3 text-[#303036]",
                          rowBg,
                          c.align === "right" && "text-right tabular-nums",
                        )}
                      >
                        <Cell column={c.key} order={order} now={now} timeZone={timeZone} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </ScrollEdge>
      )}

      {allOrders.length > 0 ? (
        <div className="flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] px-3">
          <span className="text-[12px] tabular-nums text-[#6b7280]">
            {matching > 0 ? tt("{from}–{to} of {value}", { from: range.from, to: range.to, value: matching.toLocaleString(appLocale()) }) : tt("0 orders")}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={tt("Previous page")}
              className={cn(buttonSecondary, "h-7 w-8 px-0")}
              disabled={range.page <= 1}
              onClick={() => onQuery({ page: range.page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label={tt("Next page")}
              className={cn(buttonSecondary, "h-7 w-8 px-0")}
              disabled={range.page >= range.pages}
              onClick={() => onQuery({ page: range.page + 1 })}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function Cell({ column, order, now, timeZone }: { column: ColumnKey; order: Order; now: number; timeZone: string }) {
  switch (column) {
    case "date":
      return <span className="text-[#4b5563]">{listDate(order.createdAt, now, timeZone)}</span>
    case "customer":
      return order.customerName || order.customerEmail ? (
        <span className="block max-w-[200px] truncate">{order.customerName || order.customerEmail}</span>
      ) : (
        <span className="text-[#9ca3af]">{tt("No customer")}</span>
      )
    case "source":
      /* The channel, and where the visit came from when that was seen; the
         whole line (which website, which page, the campaign) on hover and on
         the order's page. */
      return order.source ? (
        <span className="whitespace-nowrap" title={sourceText(order.source, order.sourceDetail)}>
          {SOURCE_LABEL[order.source]}
          {order.sourceDetail?.from ? <span className="text-[#6b7280]"> · {fromLabel(order.sourceDetail.from)}</span> : null}
        </span>
      ) : (
        <span className="text-[#9ca3af]" title={tt("Not recorded for this order")}>
          &ndash;
        </span>
      )
    case "total":
      return <span className="font-medium text-[#1a1a2e]">{formatMoney(order.totalCents)}</span>
    case "payment":
      return <PaymentBadge status={order.payment} />
    case "fulfillment":
      /* A parcel: where it is (Unfulfilled to Delivered, or Returned). A download keeps its two words. */
      return order.shipping ? <ShipBadge stage={order.shipping.stage} problem={order.shipping.problem} /> : <FulfillmentBadge status={order.fulfillment} />
    case "items":
      return <span>{itemsLabel(order.itemCount)}</span>
    case "delivery":
      if (order.shipping) {
        const { stage, pickup } = order.shipping
        if (stage === "delivered" || stage === "returned" || stage === "partially_returned") return <span>{pickup ? tt("Picked up") : tt("Delivered")}</span>
        if (stage === "fulfilled" || stage === "partially_fulfilled") return <span>{pickup ? tt("Ready for pickup") : tt("Shipped")}</span>
        return <span className="text-[#9ca3af]">&ndash;</span>
      }
      return <DeliveryBadge status={order.delivery} />
    case "method":
      if (order.shipping) return <span className="block max-w-[180px] truncate">{order.shipping.pickup ? tt("Local pickup") : order.shipping.method || tt("Shipping")}</span>
      return order.customerEmail ? <span>{tt("Email")}</span> : <span className="text-[#9ca3af]">&ndash;</span>
  }
}

function ViewTabs({
  allOrders,
  query,
  onQuery,
}: {
  allOrders: Order[]
  query: ListQuery
  onQuery: (next: Partial<ListQuery>) => void
}) {
  /* Only the views that have something in them, plus the one that is open. */
  const views = VIEWS.filter((v) => v.value === "all" || v.value === query.view || allOrders.some((o) => inView(o, v.value)))
  return (
    <div role="tablist" aria-label={tt("Views")} className="orders-strip -my-2 flex min-w-0 items-center gap-0.5 overflow-x-auto py-2">
      {views.map((v) => {
        const active = v.value === query.view
        return (
          <button
            key={v.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onQuery({ view: v.value, page: 1 })}
            className={cn(
              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100",
              active ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
            )}
          >
            {v.label}
          </button>
        )
      })}
    </div>
  )
}

function FilterRow({
  query,
  onQuery,
  products,
  ships,
}: {
  query: ListQuery
  onQuery: (next: Partial<ListQuery>) => void
  products: Array<{ id: string; title: string }>
  ships: boolean
}) {
  const product = products.find((p) => p.id === query.product)
  const fulfillment = SHIP_FILTERS.find((f) => f.value === query.fulfillment)
  return (
    <div className="orders-strip flex items-center gap-2 overflow-x-auto border-b border-[#eef0f2] px-3 py-2">
      {ships || fulfillment ? (
        <FilterChip
          label={tt("Fulfillment")}
          value={fulfillment ? fulfillment.label : null}
          onClear={() => onQuery({ fulfillment: "any", page: 1 })}
          options={[{ value: "any", label: tt("Any status") }, ...SHIP_FILTERS]}
          selected={query.fulfillment ?? "any"}
          onSelect={(v) => onQuery({ fulfillment: v as ListQuery["fulfillment"], page: 1 })}
        />
      ) : null}
      <FilterChip
        label={tt("Source")}
        value={query.source === "any" ? null : SOURCE_LABEL[query.source]}
        onClear={() => onQuery({ source: "any", page: 1 })}
        options={[
          { value: "any", label: tt("Any source") },
          { value: "storelib", label: "Storelib" },
          { value: "website", label: tt("Website") },
        ]}
        selected={query.source}
        onSelect={(v) => onQuery({ source: v as ListQuery["source"], page: 1 })}
      />
      {products.length > 1 ? (
        <FilterChip
          label={tt("Product")}
          value={product ? product.title : null}
          onClear={() => onQuery({ product: "", page: 1 })}
          options={[{ value: "", label: tt("Any product") }, ...products.map((p) => ({ value: p.id, label: p.title }))]}
          selected={query.product}
          onSelect={(v) => onQuery({ product: v, page: 1 })}
        />
      ) : null}
    </div>
  )
}

function FilterChip({
  label,
  value,
  options,
  selected,
  onSelect,
  onClear,
}: {
  label: string
  value: string | null
  options: Array<{ value: string; label: string }>
  selected: string
  onSelect: (value: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex h-7 shrink-0 items-center rounded-lg border text-[12px] font-medium",
          value ? "border-[#1a1a2e]/15 bg-[#f1f2f4] text-[#1a1a2e]" : "border-dashed border-[#c9ccd3] text-[#4b5563]",
        )}
      >
        <PopoverTrigger asChild>
          <button type="button" className="flex h-full max-w-[220px] cursor-pointer items-center gap-1 px-2.5">
            <span className="truncate">{value ? `${label}: ${value}` : label}</span>
            {value ? null : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
        </PopoverTrigger>
        {value ? (
          <button type="button" aria-label={tt("Clear {label}", { label })} className="flex h-full cursor-pointer items-center pr-2 text-[#6b7280] hover:text-[#1a1a2e]" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <MenuSurface className="max-h-[320px] w-[260px] overflow-y-auto">
        <div role="menu" aria-label={label}>
          {options.map((o) => (
            <MenuOption
              key={o.value}
              selected={o.value === selected}
              onSelect={() => {
                onSelect(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </MenuOption>
          ))}
        </div>
      </MenuSurface>
    </Popover>
  )
}

function ColumnsMenu({ hidden, onToggle }: { hidden: Set<ColumnKey>; onToggle: (key: ColumnKey) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn(iconButton, "shrink-0")} aria-label={tt("Columns")} title={tt("Columns")}>
          <Columns3 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <MenuSurface align="end" className="w-[220px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]">{tt("Columns")}</p>
        {COLUMNS.map((c) => (
          <label
            key={c.key}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] hover:bg-[#f7f7f8]"
          >
            <Checkbox label={c.label} checked={!hidden.has(c.key)} onChange={() => onToggle(c.key)} />
            {c.label}
          </label>
        ))}
      </MenuSurface>
    </Popover>
  )
}

function EmptyState({
  hasOrders,
  filtering,
  rangeName,
  onClear,
  onAllTime,
}: {
  hasOrders: boolean
  filtering: boolean
  rangeName: string | null
  onClear: () => void
  onAllTime: () => void
}) {
  /* Say which of the three it is: nothing sold yet, nothing in these dates,
     or nothing through these filters. Each has its own way out. */
  const physical = usePhysicalCommerceEnabled()
  const title = !hasOrders ? tt("No orders yet") : filtering ? tt("No orders match") : tt("No orders in this period")
  const body = !hasOrders
    ? tt("Orders from your Storelib page and your website show up here as soon as someone buys.")
    : filtering
      ? tt("Try another search, or clear the filters.")
      : tt("Nothing from {value}. Your earlier orders are still here.", { value: rangeName ?? tt("these dates") })
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">{body}</p>
      {!hasOrders && physical ? (
        /* A store about to sell things that ship: what will happen to its first order, step by step. */
        <a href="/help/physical-products/playbook" target="_blank" rel="noreferrer" className="mt-3 text-[13px] font-medium text-[#1a1a2e] underline underline-offset-2" data-orders-playbook="">
          {tt("What happens when someone orders")}
        </a>
      ) : null}
      {hasOrders ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {filtering ? (
            <button type="button" className={buttonSecondary} onClick={onClear}>
              {tt("Clear filters")}
            </button>
          ) : null}
          {rangeName ? (
            <button type="button" className={buttonSecondary} onClick={onAllTime}>
              {tt("Show all time")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SortMenu({ value, onChange }: { value: ListQuery["sort"]; onChange: (s: ListQuery["sort"]) => void }) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(iconButton, "shrink-0", value !== "newest" && "bg-[#eceef1] text-[#1a1a2e]")}
          aria-label={tt("Sort")}
          title={tt("Sort")}
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <MenuSurface align="end" className="w-[200px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]">{tt("Sort by")}</p>
        <div role="menu" aria-label={tt("Sort")}>
          {SORTS.map((o) => (
            <MenuOption
              key={o.value}
              selected={o.value === value}
              onSelect={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </MenuOption>
          ))}
        </div>
      </MenuSurface>
    </Popover>
  )
}
