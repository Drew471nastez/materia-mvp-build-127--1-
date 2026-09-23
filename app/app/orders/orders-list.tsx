"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowUpDown,
  CalendarDays,
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
import {
  COLUMNS,
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
import { RANGE_PRESETS, comparisonLabel, rangeLabel, windowLabel, type Range, type RangeWindow } from "@/lib/orders/range"
import { DateRangePickerModal } from "@/components/app/date-range-picker-modal"
import { HelpLabel } from "@/components/app/help-label"
import {
  Checkbox,
  DeliveryBadge,
  FulfillmentBadge,
  MenuOption,
  MenuSurface,
  PaymentBadge,
  Sparkline,
  buttonSecondary,
  card,
  formatMoney,
  iconButton,
} from "./order-parts"

export interface OrdersListProps {
  allOrders: Order[]
  pageOrders: Order[]
  matching: number
  range: { page: number; pages: number; from: number; to: number }
  query: ListQuery
  onQuery: (next: Partial<ListQuery>) => void
  searchText: string
  onSearchText: (q: string) => void
  dateRange: Range
  span: RangeWindow
  onDateRange: (r: Range) => void
  metrics: MetricReading[]
  hidden: Set<ColumnKey>
  onToggleColumn: (key: ColumnKey) => void
  selected: Set<string>
  onSelect: (ids: string[], on: boolean) => void
  onOpen: (id: string) => void
  onExport: (only?: Set<string>) => void
  products: Array<{ id: string; title: string }>
  stripeConnected: boolean
  now: number
  timeZone: string
}

export function OrdersList(props: OrdersListProps) {
  const { allOrders, stripeConnected } = props
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Orders</h1>
        <button
          type="button"
          className={buttonSecondary}
          onClick={() => props.onExport()}
          disabled={allOrders.length === 0}
        >
          <Download className="h-4 w-4" />
          Export
        </button>
      </div>

      {!stripeConnected ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-[#f3e3b3] bg-[#fffaeb] px-4 py-3 text-[13px] text-[#5c4300]">
          <span>Payouts are not set up, so paid orders cannot be paid out to you yet.</span>
          <Link href="/app/payouts" className="font-medium underline underline-offset-2">
            Set up payouts
          </Link>
        </div>
      ) : null}

      <RangeRow dateRange={props.dateRange} span={props.span} onDateRange={props.onDateRange} timeZone={props.timeZone} />

      <MetricsStrip metrics={props.metrics} comparable={props.span.previous !== null} />

      <OrdersTable {...props} />
    </div>
  )
}

/* ─── The date range ───────────────────────────────────────────────── */

function isoDayLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function RangeRow({
  dateRange,
  span,
  onDateRange,
  timeZone,
}: {
  dateRange: Range
  span: RangeWindow
  onDateRange: (r: Range) => void
  timeZone: string
}) {
  const [open, setOpen] = React.useState(false)
  const [custom, setCustom] = React.useState(false)
  const label = rangeLabel(dateRange, timeZone)
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={cn(buttonSecondary, "gap-2 pl-2.5")} aria-label={`Date range: ${label}`}>
            <CalendarDays className="h-4 w-4 text-[#4b5563]" />
            {label}
            <ChevronDown className="h-3.5 w-3.5 text-[#6b7280]" />
          </button>
        </PopoverTrigger>
        <MenuSurface className="w-[240px]">
          <div role="menu" aria-label="Date range">
            {RANGE_PRESETS.map((p) => (
              <MenuOption
                key={p.key}
                selected={dateRange.key === p.key}
                onSelect={() => {
                  onDateRange({ key: p.key })
                  setOpen(false)
                }}
              >
                {p.label}
              </MenuOption>
            ))}
            <div className="my-1 border-t border-[#eef0f2]" />
            <MenuOption
              selected={dateRange.key === "custom"}
              hint={dateRange.key === "custom" ? label : "Pick the first and last day"}
              onSelect={() => {
                setOpen(false)
                setCustom(true)
              }}
            >
              Custom range
            </MenuOption>
          </div>
        </MenuSurface>
      </Popover>
      <span className="text-[13px] text-[#6b7280]">
        {windowLabel(span, timeZone)}
        {comparisonLabel(dateRange, span) ? <span className="hidden sm:inline">, {comparisonLabel(dateRange, span)}</span> : null}
      </span>
      <DateRangePickerModal
        open={custom}
        onOpenChange={setCustom}
        initialStart={dateRange.key === "custom" && dateRange.from ? new Date(`${dateRange.from}T00:00:00`) : null}
        initialEnd={dateRange.key === "custom" && dateRange.to ? new Date(`${dateRange.to}T00:00:00`) : null}
        onApply={(start, end) => {
          onDateRange({ key: "custom", from: isoDayLocal(start), to: isoDayLocal(end) })
          setCustom(false)
        }}
      />
    </div>
  )
}

/* ─── Metrics ─────────────────────────────────────────────────────────── */

function MetricsStrip({ metrics, comparable }: { metrics: MetricReading[]; comparable: boolean }) {
  return (
    <section aria-label="Order metrics" className={cn(card, "mt-3 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {metrics.map((reading, i) => {
          const meta = METRICS.find((m) => m.key === reading.key)!
          return (
            <div
              key={reading.key}
              className={cn(
                "flex min-w-[150px] flex-1 shrink-0 flex-col justify-between px-4 pb-2 pt-3",
                i > 0 && "border-l border-[#eef0f2]",
              )}
            >
              <HelpLabel label={meta.label} description={meta.help} className="text-[12px] font-medium text-[#4b5563]" />
              <div className="mt-1 flex h-6 items-baseline gap-2">
                <span className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">
                  {meta.money ? formatMoney(reading.value) : Math.round(reading.value).toLocaleString("en-US")}
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
    return <span className="text-[12px] text-[#9ca3af]">{reading.value > 0 ? "New" : "–"}</span>
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

  const filtering = query.q.trim() !== "" || query.source !== "any" || query.product !== ""
  const [searching, setSearching] = React.useState(filtering)
  const searchRef = React.useRef<HTMLInputElement>(null)

  const columns = COLUMNS.filter((c) => !hidden.has(c.key))
  const pageIds = pageOrders.map((o) => o.id)
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length
  const allOnPage = pageIds.length > 0 && selectedOnPage === pageIds.length

  /* The shadow on the Order column's edge says there is more to the left.
     Written straight to the element: a scroll handler that sets state would
     re-render fifty rows on every frame of a swipe. */
  const scrollerRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const mark = () => {
      el.dataset.scrolled = el.scrollLeft > 1 ? "true" : "false"
      el.dataset.overflow = el.scrollWidth > el.clientWidth + 1 ? "true" : "false"
    }
    mark()
    el.addEventListener("scroll", mark, { passive: true })
    const ro = new ResizeObserver(mark)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", mark)
      ro.disconnect()
    }
  }, [pageOrders.length === 0])

  return (
    <section aria-label="Orders" className={cn(card, "mt-4 overflow-hidden")}>
      {/* Toolbar: one row, the same height whether searching or not. */}
      <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
        {searching ? (
          <>
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e]">
              <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
              <input
                ref={searchRef}
                autoFocus
                type="search"
                value={props.searchText}
                onChange={(e) => props.onSearchText(e.target.value)}
                placeholder="Search by order, customer or product"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] [&::-webkit-search-cancel-button]:hidden"
              />
              {props.searchText ? (
                <button type="button" aria-label="Clear search" className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => props.onSearchText("")}>
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
            <button
              type="button"
              className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]"
              onClick={() => {
                props.onSearchText("")
                onQuery({ q: "", source: "any", product: "", page: 1 })
                setSearching(false)
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <ViewTabs allOrders={allOrders} query={query} onQuery={onQuery} />
            <button
              type="button"
              className={cn(iconButton, "ml-auto w-auto gap-1 px-2")}
              aria-label="Search and filter"
              title="Search and filter"
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

      {searching ? <FilterRow query={query} onQuery={onQuery} products={props.products} /> : null}

      {pageOrders.length === 0 ? (
        <EmptyState
          hasOrders={allOrders.length > 0}
          filtering={filtering || query.view !== "all"}
          rangeName={props.dateRange.key === "all" ? null : rangeLabel(props.dateRange, props.timeZone)}
          onClear={() => {
            props.onSearchText("")
            onQuery({ view: "all", q: "", source: "any", product: "", page: 1 })
            setSearching(false)
          }}
          onAllTime={() => props.onDateRange({ key: "all" })}
        />
      ) : (
        <div ref={scrollerRef} className="orders-scroller overflow-x-auto overscroll-x-contain" data-scrolled="false">
          <table className="w-full min-w-max border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr className="h-9 text-left text-[12px] font-medium text-[#4b5563]">
                <th scope="col" className="orders-sticky left-0 w-10 bg-[#f7f7f8] p-0">
                  <label className="flex h-9 w-10 cursor-pointer items-center pl-3">
                    <Checkbox
                      label={allOnPage ? "Deselect all on this page" : "Select all on this page"}
                      checked={allOnPage}
                      indeterminate={selectedOnPage > 0 && !allOnPage}
                      onChange={(on) => onSelect(pageIds, on)}
                    />
                  </label>
                </th>
                {selected.size > 0 ? (
                  <th scope="col" colSpan={columns.length + 1} className="orders-sticky orders-edge left-10 bg-[#f7f7f8] px-2 font-normal">
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-[#1a1a2e]">{selected.size} selected</span>
                      <button type="button" className={cn(buttonSecondary, "h-7 px-2.5 text-[12px]")} onClick={() => props.onExport(selected)}>
                        Export selected
                      </button>
                      <button
                        type="button"
                        className="h-7 rounded-lg px-2 text-[12px] font-medium text-[#4b5563] hover:bg-[#ececef]"
                        onClick={() => onSelect([...selected], false)}
                      >
                        Clear
                      </button>
                    </div>
                  </th>
                ) : (
                  <>
                    <th scope="col" className="orders-sticky orders-edge left-10 bg-[#f7f7f8] pl-2 pr-4">
                      Order
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
                    className="group h-10 cursor-pointer"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("a,button,input,label")) return
                      onOpen(order.id)
                    }}
                  >
                    <td className={cn("orders-sticky left-0 w-10 border-t border-[#f0f1f3] p-0", rowBg)}>
                      <label className="flex h-10 w-10 cursor-pointer items-center pl-3">
                        <Checkbox
                          label={`Select order ${order.number}`}
                          checked={isSelected}
                          onChange={(on) => onSelect([order.id], on)}
                        />
                      </label>
                    </td>
                    <td className={cn("orders-sticky orders-edge left-10 border-t border-[#f0f1f3] pl-2 pr-4", rowBg)}>
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
        </div>
      )}

      {allOrders.length > 0 ? (
        <div className="flex h-11 items-center justify-between gap-3 border-t border-[#eef0f2] bg-[#fafafb] px-3">
          <span className="text-[12px] tabular-nums text-[#6b7280]">
            {matching > 0 ? `${range.from}–${range.to} of ${matching.toLocaleString("en-US")}` : "0 orders"}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              className={cn(buttonSecondary, "h-7 w-8 px-0")}
              disabled={range.page <= 1}
              onClick={() => onQuery({ page: range.page - 1 })}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next page"
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
        <span className="text-[#9ca3af]">No customer</span>
      )
    case "source":
      return order.source ? (
        <span>{SOURCE_LABEL[order.source]}</span>
      ) : (
        <span className="text-[#9ca3af]" title="Not recorded for this order">
          &ndash;
        </span>
      )
    case "total":
      return <span className="font-medium text-[#1a1a2e]">{formatMoney(order.totalCents)}</span>
    case "payment":
      return <PaymentBadge status={order.payment} />
    case "fulfillment":
      return <FulfillmentBadge status={order.fulfillment} />
    case "items":
      return <span>{itemsLabel(order.itemCount)}</span>
    case "delivery":
      return <DeliveryBadge status={order.delivery} />
    case "method":
      return order.customerEmail ? <span>Email</span> : <span className="text-[#9ca3af]">&ndash;</span>
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
    <div role="tablist" aria-label="Views" className="orders-strip -my-2 flex min-w-0 items-center gap-0.5 overflow-x-auto py-2">
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
}: {
  query: ListQuery
  onQuery: (next: Partial<ListQuery>) => void
  products: Array<{ id: string; title: string }>
}) {
  const product = products.find((p) => p.id === query.product)
  return (
    <div className="orders-strip flex items-center gap-2 overflow-x-auto border-b border-[#eef0f2] px-3 py-2">
      <FilterChip
        label="Source"
        value={query.source === "any" ? null : SOURCE_LABEL[query.source]}
        onClear={() => onQuery({ source: "any", page: 1 })}
        options={[
          { value: "any", label: "Any source" },
          { value: "storelib", label: "Storelib" },
          { value: "website", label: "Website" },
        ]}
        selected={query.source}
        onSelect={(v) => onQuery({ source: v as ListQuery["source"], page: 1 })}
      />
      {products.length > 1 ? (
        <FilterChip
          label="Product"
          value={product ? product.title : null}
          onClear={() => onQuery({ product: "", page: 1 })}
          options={[{ value: "", label: "Any product" }, ...products.map((p) => ({ value: p.id, label: p.title }))]}
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
          <button type="button" aria-label={`Clear ${label}`} className="flex h-full cursor-pointer items-center pr-2 text-[#6b7280] hover:text-[#1a1a2e]" onClick={onClear}>
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
        <button type="button" className={cn(iconButton, "shrink-0")} aria-label="Columns" title="Columns">
          <Columns3 className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <MenuSurface align="end" className="w-[220px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]">Columns</p>
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
  const title = !hasOrders ? "No orders yet" : filtering ? "No orders match" : `No orders in ${rangeName ? rangeName.toLowerCase().replace(/^last/, "the last") : "this period"}`
  const body = !hasOrders
    ? "Orders from your Storelib page and your website show up here as soon as someone buys."
    : filtering
      ? "Try another search, or clear the filters."
      : "Your earlier orders are still here. Choose a longer period to see them."
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[340px] text-[13px] text-[#6b7280]">{body}</p>
      {hasOrders ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {filtering ? (
            <button type="button" className={buttonSecondary} onClick={onClear}>
              Clear filters
            </button>
          ) : null}
          {rangeName ? (
            <button type="button" className={buttonSecondary} onClick={onAllTime}>
              Show all time
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
          aria-label="Sort"
          title="Sort"
        >
          <ArrowUpDown className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <MenuSurface align="end" className="w-[200px]">
        <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-[#6b7280]">Sort by</p>
        <div role="menu" aria-label="Sort">
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
