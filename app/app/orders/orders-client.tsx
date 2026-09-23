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
import { useSearchParams } from "next/navigation"
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
import { saveFile, savedMessage } from "@/lib/platform/save-file"

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

/**
 * The slide in globals.css (.orders-detail) takes 320ms at most. The stage
 * moves on when the animation says it has ended; this is only the net under
 * that, for an animation that never runs (a hidden tab, a style not loaded).
 */
const SLIDE_MS = 330
const SLIDE_NET_MS = SLIDE_MS + 120

/** Asked each time, so changing the setting applies without a reload. */
function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
}

/** What an action on an order sends back about each row's receipt email. */
interface LineDelivery {
  id: string
  buyer_email?: string | null
  buyer_notified_at: string | null
  buyer_email_last_error: string | null
}

async function postJson(url: string, body?: unknown): Promise<{ res: Response; data: any }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

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

  /* The order the last step went to, and from which side, so that order
     (and only that one, not the one being left) plays the step in. */
  const [step, setStep] = React.useState<{ id: string; dir: "previous" | "next" } | null>(null)
  const stageRef = React.useRef(stage)
  React.useLayoutEffect(() => {
    stageRef.current = stage
  }, [stage])

  /* The slide is a CSS animation (.orders-detail in globals.css), not a
     transition between two states. A transition needs the page to be drawn
     once in its starting place before it moves, and on a phone the tap
     arrives in step with the frame, so the starting place was never drawn:
     measured, the order simply appeared. An animation starts when the
     element does, and says when it has ended (onAnimationEnd below). With
     reduced motion asked for there is no slide, and no wait for one. */
  React.useEffect(() => {
    if (target) {
      setShown(target)
      if (stage === "closed" || stage === "closing") {
        if (prefersReducedMotion()) {
          setStage("open")
          return
        }
        setStage("entering")
        const net = window.setTimeout(() => setStage((s) => (s === "entering" ? "open" : s)), SLIDE_NET_MS)
        return () => window.clearTimeout(net)
      }
      return
    }
    if (stage === "open" || stage === "entering") {
      pushed.current = false
      if (prefersReducedMotion()) {
        setStage("closed")
        setShown(null)
        return
      }
      setStage("closing")
      const net = window.setTimeout(finishClosing, SLIDE_NET_MS)
      return () => window.clearTimeout(net)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id])

  function finishClosing() {
    if (stageRef.current !== "closing") return
    setStage("closed")
    setShown(null)
    setStep(null)
  }

  const onSlideEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return
    if (stage === "entering") setStage("open")
    else if (stage === "closing") finishClosing()
  }

  /* Each order starts at its top, before it is drawn: after the paint, the
     next order showed for a frame at the last one's scroll position. */
  React.useLayoutEffect(() => {
    detailRef.current?.scrollTo({ top: 0 })
  }, [shown?.id])

  /* An address naming an order that is not this creator's, or not there. */
  React.useEffect(() => {
    if (openId && !target) writeAddress((p) => p.delete("order"), "replace")
  }, [openId, target])

  const onOpen = (id: string) => {
    setStep(null)
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
    if (!next) return
    setStep({ id: next.id, dir: dir < 0 ? "previous" : "next" })
    writeAddress((p) => p.set("order", next.id), "replace")
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

  /* What a send wrote to each row, straight from the server's answer: the
     page shows it at once, with no reload of every order. */
  const applyDelivery = (lines: LineDelivery[] | undefined) => {
    if (!Array.isArray(lines) || lines.length === 0) return
    const byId = new Map(lines.map((l) => [l.id, l]))
    setRows((prev) =>
      prev.map((r) => {
        const d = byId.get(r.id)
        if (!d) return r
        return {
          ...r,
          buyer_email: d.buyer_email ?? r.buyer_email,
          buyer_notified_at: d.buyer_notified_at,
          buyer_email_last_error: d.buyer_email_last_error,
        }
      }),
    )
  }

  const onAction = async (order: Order, action: OrderAction): Promise<string> => {
    switch (action.kind) {
      case "refund": {
        const { res, data } = await postJson("/api/stripe/refund", {
          orderId: action.line.id,
          reason: action.reason,
          amount: action.amountCents / 100,
        })
        if (!res.ok) throw new Error(data?.error || "The refund did not go through.")
        const cents = typeof data?.amount === "number" ? data.amount : action.amountCents
        patchRows([action.line.id], {
          status: "refunded",
          refund_amount_cents: cents,
          refunded_at: typeof data?.refundedAt === "string" ? data.refundedAt : new Date().toISOString(),
          refund_reason: action.reason,
        })
        return `Refunded ${formatMoney(cents)}`
      }
      case "resend": {
        const { res, data } = await postJson(`/api/app/orders/${encodeURIComponent(order.id)}/resend`)
        applyDelivery(data?.lines)
        if (!res.ok) throw new Error(data?.error || "The receipt was not sent. Try again.")
        if (data?.failed > 0) return `Sent ${data.sent} of ${data.sent + data.failed} receipts. ${data.error ?? ""}`.trim()
        return `Receipt sent to ${order.customerEmail || "the buyer"}`
      }
      case "invoice": {
        const outcome = await saveFile({
          name: `invoice-${order.number}.pdf`,
          viewable: true,
          file: async () => {
            const res = await fetch(`/api/invoice?orderId=${encodeURIComponent(order.id)}&tz=${encodeURIComponent(timeZone)}`)
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              throw new Error(data?.error || "The invoice could not be made. Try again.")
            }
            return res.blob()
          },
          link: async (disposition) => {
            const { res, data } = await postJson("/api/invoice", { orderId: order.id, disposition, timeZone })
            if (!res.ok || !data?.url) throw new Error(data?.error || "The invoice could not be made. Try again.")
            return data.url as string
          },
        })
        return savedMessage(outcome, "Invoice")
      }
      case "email": {
        const { res, data } = await postJson(`/api/app/orders/${encodeURIComponent(order.id)}/email`, { email: action.email })
        if (!res.ok) throw new Error(data?.error || "The email was not changed. Try again.")
        const email = typeof data?.email === "string" ? data.email : action.email
        patchRows(Array.isArray(data?.ids) ? data.ids : order.lines.map((l) => l.id), { buyer_email: email })
        applyDelivery(data?.lines)
        if (data?.sent > 0) return `Email changed. Receipt sent to ${email}`
        if (data?.failed > 0) return `Email changed, but the receipt did not send. ${data.error ?? ""}`.trim()
        return `Email changed to ${email}`
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
          onAnimationEnd={onSlideEnd}
          role="region"
          aria-label={`Order ${shown.number}`}
        >
          {/* Keyed by the order, so a step to the next one draws it fresh
              (its menus and dialogs closed) and plays the short step in. */}
          <div key={shown.id} className="orders-step" data-dir={step?.id === shown.id ? step.dir : undefined}>
            <OrderDetail
              order={orders.find((o) => o.id === shown.id) ?? shown}
              timeZone={timeZone}
              now={now}
              onBack={onBack}
              onStep={at >= 0 ? onStep : null}
              canStep={{ previous: at > 0, next: at >= 0 && at < filtered.length - 1 }}
              position={at >= 0 ? { index: at, count: filtered.length } : null}
              onAction={onAction}
              onNotice={onNotice}
            />
          </div>
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
