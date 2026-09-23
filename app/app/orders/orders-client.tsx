"use client"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ORDERS: A LIST, AND AN ORDER OPENED OVER IT
 * ═══════════════════════════════════════════════════════════════════════════
 * "When I click an order it should open a subpage, and I can go back to the
 * list of orders where I left it."
 *
 * An order's page is not a second route. A route change unmounts the list,
 * and everything that makes "where I left it" true goes with it: how far down
 * the page was, how far the table was swiped sideways, what was ticked. So
 * the list stays mounted and the order slides in over it, in its own scroll
 * container, and closing it slides it away again from a list nobody touched.
 *
 * The address still says which order is open (`?order=`), pushed as a real
 * history entry: the browser's back button, the Android back gesture and a
 * swipe back on iOS all close it, a reload opens it again, and a link to it
 * can be shared. Next.js syncs pushState into useSearchParams without asking
 * the server for anything, so opening an order costs no request at all.
 *
 * Everything else the list shows (view, search, filters, page, period) is in
 * the address too, replaced rather than pushed, so the list comes back the
 * same after a reload and back does not have to walk through every keystroke.
 */

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  COLUMNS_COOKIE,
  filterOrders,
  groupOrders,
  pageOf,
  paramsFromQuery,
  queryFromParams,
  type ColumnKey,
  type ListQuery,
  type Order,
  type OrderRow,
} from "@/lib/orders/order-view"
import { rememberTimeZone, viewerTimeZone } from "@/lib/orders/time-zone"
import { readMetrics } from "@/lib/orders/metrics"
import { DEFAULT_PRESET, RANGE_COOKIE, firstDayOf, rangeWindow, readOrdersPeriod, serializePeriod } from "@/lib/orders/range"
import { OrdersList } from "./orders-list"
import { ExportOrdersDialog } from "./export-dialog"
import { hasConsent } from "@/lib/consent/client"
import { todayIn, type CompareValue, type RangeValue } from "@/lib/date-range/range"
import { writePeriod } from "@/lib/date-range/params"
import { OrderDetail, type OrderAction } from "./order-detail"
import { formatMoney } from "./order-parts"

interface OrdersClientProps {
  rows: OrderRow[]
  products: Array<{ id: string; title: string }>
  stripeConnected: boolean
  hiddenColumns: ColumnKey[]
  /** The range remembered from last time (a cookie), serialized. */
  initialRange: string | null
  timeZone: string
  now: number
}

type Stage = "closed" | "entering" | "open" | "closing"

/** The slide in globals.css (.orders-detail) takes 320ms. */
const SLIDE_MS = 330

function writeAddress(mutate: (p: URLSearchParams) => void, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search)
  mutate(params)
  const qs = params.toString()
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`
  if (mode === "push") window.history.pushState(null, "", url)
  else window.history.replaceState(null, "", url)
}

function findOrder(orders: Order[], id: string | null): Order | null {
  if (!id) return null
  return orders.find((o) => o.id === id) ?? orders.find((o) => o.lines.some((l) => l.id === id)) ?? null
}

export function OrdersClient(props: OrdersClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  /* ── Data ─────────────────────────────────────────────────────────────── */
  const [rows, setRows] = React.useState(props.rows)
  React.useEffect(() => setRows(props.rows), [props.rows])
  const orders = React.useMemo(() => groupOrders(rows), [rows])

  /* ── Clock and zone: the server's first, then the viewer's ─────────────── */
  const [timeZone, setTimeZone] = React.useState(props.timeZone)
  const [now, setNow] = React.useState(props.now)
  React.useEffect(() => {
    const zone = viewerTimeZone()
    if (zone !== props.timeZone) setTimeZone(zone)
    rememberTimeZone(zone)
    setNow(Date.now())
    const tick = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(tick)
  }, [props.timeZone])

  /* ── The address is the state ───────────────────────────────────────── */
  const query = queryFromParams(searchParams)
  /*
    THE PERIOD AND ITS COMPARISON: the same picker every page in /app has.
    The address first (a shared link), then what this creator chose last
    time (a cookie, kept only with Preferences allowed), then the last 30
    days. Older links (?range=30d, ?period=7d) still open what they meant.
  */
  const [remembered, setRemembered] = React.useState<string>(props.initialRange ?? "")
  const earliest = orders.length ? Date.parse(orders[orders.length - 1].createdAt) : null
  const firstDay = firstDayOf(earliest, timeZone)
  const today = todayIn(timeZone, now)
  const { period, compare } = React.useMemo(
    () => readOrdersPeriod(new URLSearchParams(searchParams.toString()), remembered, today, firstDay),
    [searchParams, remembered, today, firstDay],
  )
  const openId = searchParams.get("order")

  const [searchText, setSearchText] = React.useState(query.q)
  const searchTimer = React.useRef<number | undefined>(undefined)
  const onSearchText = (q: string) => {
    setSearchText(q)
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      writeAddress((p) => {
        const next = paramsFromQuery({ ...queryFromParams(p), q, page: 1 }, p)
        p.forEach((_, k) => p.delete(k))
        next.forEach((v, k) => p.set(k, v))
      }, "replace")
    }, 250)
  }
  React.useEffect(() => () => window.clearTimeout(searchTimer.current), [])

  const onQuery = (next: Partial<ListQuery>) => {
    writeAddress((p) => {
      const merged = paramsFromQuery({ ...queryFromParams(p), q: searchText, ...next }, p)
      p.forEach((_, k) => p.delete(k))
      merged.forEach((v, k) => p.set(k, v))
    }, "replace")
    if (next.q !== undefined) setSearchText(next.q)
    if (next.view !== undefined || next.source !== undefined || next.product !== undefined) setSelected(new Set())
    if (next.page !== undefined) listRef.current?.scrollTo({ top: 0 })
  }

  const remember = (p: RangeValue, c: CompareValue) => {
    const value = serializePeriod(p, c)
    setRemembered(value)
    if (hasConsent("preferences")) {
      document.cookie = value
        ? `${RANGE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
        : `${RANGE_COOKIE}=; path=/; max-age=0; samesite=lax`
    }
  }
  const onRange = (v: RangeValue) => {
    remember(v, compare)
    writeAddress((params) => {
      params.delete("period")
      writePeriod(params, v, null, DEFAULT_PRESET)
      params.delete("page")
    }, "replace")
    setSelected(new Set())
    listRef.current?.scrollTo({ top: 0 })
  }
  const onCompare = (c: CompareValue) => {
    remember(period, c)
    writeAddress((params) => writePeriod(params, null, c, DEFAULT_PRESET), "replace")
  }

  /* ── What the list shows ────────────────────────────────────────────── */
  const span = React.useMemo(
    () => rangeWindow(period, compare, now, timeZone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.preset, period.start, period.end, compare.mode, compare.range?.start, compare.range?.end, now, timeZone],
  )
  const filtered = React.useMemo(
    () => filterOrders(orders, { ...query, q: searchText }, span),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, query.view, query.source, query.product, query.sort, searchText, span],
  )
  const page = pageOf(filtered, query.page)
  const metrics = React.useMemo(() => readMetrics(orders, span, span.previous, timeZone), [orders, span, timeZone])

  /* ── Columns, remembered in a cookie so the server draws the same table ─ */
  const [hidden, setHidden] = React.useState(() => new Set(props.hiddenColumns))
  const onToggleColumn = (key: ColumnKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      /* Remembered between visits only with Preferences allowed; this visit keeps it either way. */
      if (hasConsent("preferences")) document.cookie = `${COLUMNS_COOKIE}=${[...next].join(".")}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  }

  /* ── Selection ──────────────────────────────────────────────────────── */
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const onSelect = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  /* ── The order over the list ────────────────────────────────────────── */
  const target = findOrder(orders, openId)
  const [shown, setShown] = React.useState<Order | null>(target)
  const [stage, setStage] = React.useState<Stage>(target ? "open" : "closed")
  const pushed = React.useRef(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const detailRef = React.useRef<HTMLDivElement>(null)

  /* The slide is a CSS animation (.orders-detail in globals.css), not a
     transition between two states. A transition needs the page to be drawn
     once in its starting place before it moves, and on a phone the tap
     arrives in step with the frame, so the starting place was never drawn:
     measured, the order simply appeared. An animation starts when the
     element does. The timer only says when it has finished. */
  React.useEffect(() => {
    if (target) {
      setShown(target)
      if (stage === "closed" || stage === "closing") {
        setStage("entering")
        detailRef.current?.scrollTo({ top: 0 })
        const done = window.setTimeout(() => setStage("open"), SLIDE_MS)
        return () => window.clearTimeout(done)
      }
      return
    }
    if (stage === "open" || stage === "entering") {
      pushed.current = false
      setStage("closing")
      const done = window.setTimeout(() => {
        setStage("closed")
        setShown(null)
      }, SLIDE_MS)
      return () => window.clearTimeout(done)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  /* Stepping to the next order starts it at its top. */
  React.useEffect(() => {
    if (stage === "open") detailRef.current?.scrollTo({ top: 0 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown?.id])

  /* An address naming an order that is not this creator's, or not there. */
  React.useEffect(() => {
    if (openId && !target) writeAddress((p) => p.delete("order"), "replace")
  }, [openId, target])

  const onOpen = (id: string) => {
    pushed.current = true
    writeAddress((p) => p.set("order", id), "push")
  }
  const onBack = () => {
    if (pushed.current) window.history.back()
    else writeAddress((p) => p.delete("order"), "replace")
  }
  const at = shown ? filtered.findIndex((o) => o.id === shown.id) : -1
  const onStep = (dir: -1 | 1) => {
    const next = filtered[at + dir]
    if (next) writeAddress((p) => p.set("order", next.id), "replace")
  }

  /* ── Notices ────────────────────────────────────────────────────────── */
  const [notice, setNotice] = React.useState<string | null>(null)
  const noticeTimer = React.useRef<number | undefined>(undefined)
  const onNotice = (message: string) => {
    setNotice(message)
    window.clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3200)
  }

  /* ── Actions ────────────────────────────────────────────────────────── */
  const patchRows = (ids: string[], patch: Partial<OrderRow>) =>
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)))

  const onAction = async (order: Order, action: OrderAction): Promise<string> => {
    const withReceipt = order.lines.filter((l) => l.receipt_token)
    switch (action.kind) {
      case "refund": {
        const res = await fetch("/api/stripe/refund", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: action.line.id, reason: action.reason, amount: action.amountCents / 100 }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || "The refund did not go through.")
        patchRows([action.line.id], {
          status: "refunded",
          refund_amount_cents: action.amountCents,
          refunded_at: new Date().toISOString(),
          refund_reason: action.reason,
        })
        router.refresh()
        return `Refunded ${formatMoney(action.amountCents)}`
      }
      case "resend": {
        for (const line of withReceipt) {
          const res = await fetch("/api/receipt/resend", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiptToken: line.receipt_token, orderId: line.id, resendType: "buyer" }),
          })
          const data = await res.json().catch(() => ({}))
          if (data?.limitReached) throw new Error("This receipt has been sent the most times allowed.")
          if (!res.ok || data?.success === false) throw new Error(data?.error || "The receipt was not sent.")
        }
        router.refresh()
        return `Receipt sent to ${order.customerEmail || "the buyer"}`
      }
      case "invoice": {
        for (const [i, line] of order.lines.entries()) {
          const res = await fetch(`/api/invoice?orderId=${encodeURIComponent(line.id)}`)
          if (!res.ok) throw new Error("The invoice could not be made.")
          const url = URL.createObjectURL(await res.blob())
          const a = document.createElement("a")
          a.href = url
          a.download = `invoice-${order.number}${order.lines.length > 1 ? `-${i + 1}` : ""}.pdf`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
        }
        return order.lines.length > 1 ? "Invoices downloaded" : "Invoice downloaded"
      }
      case "email": {
        for (const line of withReceipt) {
          const res = await fetch("/api/receipt/update-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ receiptToken: line.receipt_token, orderId: line.id, newEmail: action.email }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data?.error || "The email was not changed.")
        }
        patchRows(
          withReceipt.map((l) => l.id),
          { buyer_email: action.email },
        )
        router.refresh()
        return `Email changed to ${action.email}`
      }
    }
  }

  /* Export opens the dialog; which orders and which file are chosen there. */
  const [exporting, setExporting] = React.useState(false)
  const onExport = () => setExporting(true)
  const filtering = Boolean(searchText.trim()) || query.source !== "any" || Boolean(query.product) || query.view !== "all"

  const listCovered = stage === "open"

  return (
    <div className="orders-stage app-page-enter relative h-full overflow-hidden bg-[#f8f9fa]">
      <div
        ref={listRef}
        className="orders-pane page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
        inert={listCovered}
        aria-hidden={listCovered || undefined}
        style={{ visibility: listCovered ? "hidden" : undefined }}
      >
        <OrdersList
          allOrders={orders}
          pageOrders={page.items}
          matching={filtered.length}
          range={page}
          query={{ ...query, q: searchText }}
          onQuery={onQuery}
          searchText={searchText}
          onSearchText={onSearchText}
          period={period}
          onPeriod={onRange}
          compare={compare}
          onCompare={onCompare}
          today={today}
          firstDay={firstDay}
          comparable={span.previous !== null}
          metrics={metrics}
          hidden={hidden}
          onToggleColumn={onToggleColumn}
          selected={selected}
          onSelect={onSelect}
          onOpen={onOpen}
          onExport={onExport}
          products={props.products}
          stripeConnected={props.stripeConnected}
          now={now}
          timeZone={timeZone}
        />
      </div>

      {shown ? (
        <div
          ref={detailRef}
          className="orders-pane orders-detail page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#f8f9fa]"
          data-stage={stage}
          role="region"
          aria-label={`Order ${shown.number}`}
        >
          <OrderDetail
            order={orders.find((o) => o.id === shown.id) ?? shown}
            timeZone={timeZone}
            now={now}
            onBack={onBack}
            onStep={at >= 0 ? onStep : null}
            canStep={{ newer: at > 0, older: at >= 0 && at < filtered.length - 1 }}
            onAction={onAction}
            onNotice={onNotice}
          />
        </div>
      ) : null}

      <ExportOrdersDialog
        open={exporting}
        onClose={() => setExporting(false)}
        all={orders}
        pageOrders={page.items}
        matching={filtered}
        period={period}
        filtering={filtering}
        selected={selected}
        timeZone={timeZone}
        onDone={onNotice}
      />

      <div
        aria-live="polite"
        className="pointer-events-none fixed left-1/2 top-[calc(68px+env(safe-area-inset-top,0px)+12px)] z-[100] -translate-x-1/2 md:top-[calc(58px+env(safe-area-inset-top,0px)+12px)]"
      >
        {notice ? (
          <div className="max-w-[calc(100vw-2rem)] truncate rounded-xl bg-[#1a1a2e] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-200">
            {notice}
          </div>
        ) : null}
      </div>
    </div>
  )
}
