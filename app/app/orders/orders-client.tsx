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
 * the list stays mounted and the order is drawn over it, in its own scroll
 * container, and closing it shows again a list nobody touched.
 *
 * HOW IT MOVES. A slide came out once ("too smooth and flowy", "the top bar
 * takes long and glitchy to load": it was a class put on after the order had
 * drawn, so the bar arrived late and drifted), and the cut that replaced it
 * read as "direct" and "clunky", and the push from the right after it as
 * "not that sliding". Now it is the motion every page layer in /app has,
 * started before the order's first frame is painted and run on the
 * compositor (./order-motion.ts): on a phone the order rises from the
 * bottom, bar and all, over a list that holds still and stays drawn
 * underneath; back drops it down again and the list is exactly where it
 * was, with the row it came from tinted for a moment. Wider, the order's
 * cards fade in under its bar, and back takes it away at once with the list
 * there whole, where it was: it used to settle in from half faded and 2px
 * low, the same "bump" Emails lost (./order-motion `settle: false`).
 * Stepping to the previous or next order only fades the cards under the bar.
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
import { PullToRefresh } from "@/components/ui/pull-to-refresh"
import {
  COLUMNS_COOKIE,
  filterOrders,
  groupOrders,
  paramsFromQuery,
  queryFromParams,
  type ColumnKey,
  type ListQuery,
  type Order,
  type OrderRow,
} from "@/lib/orders/order-view"
import type { OrdersListing } from "@/lib/orders/paged"
import { listingKey, listingParams } from "@/lib/orders/listing-params"
import { rememberTimeZone, viewerTimeZone } from "@/lib/orders/time-zone"
import { DEFAULT_PRESET, RANGE_COOKIE, firstDayOf, rangeWindow, readOrdersPeriod, serializePeriod } from "@/lib/orders/range"
import { OrdersList } from "./orders-list"
import { ExportOrders } from "./export-dialog"
import { BulkFulfilSheet, ImportTrackingSheet, printSelectedSlips } from "./bulk-actions"
import { markRow, moveOrder, stillOrder } from "./order-motion"
import { holdLanding, isTraversing } from "@/lib/ui/app-navigation"
import { backThen } from "@/lib/navigation/go-back"
import { hasConsent } from "@/lib/consent/client"
import { todayIn, type CompareValue, type RangeValue } from "@/lib/date-range/range"
import { writePeriod } from "@/lib/date-range/params"
import { OrderDetail, type OrderAction } from "./order-detail"
import { formatMoney } from "./order-parts"
import { saveFile, savedMessage } from "@/lib/platform/save-file"
import { cn } from "@/lib/utils"
import { tt } from "@/lib/i18n/text"

/** What every change on this page is measured against. */
const PREVIOUS_PERIOD: CompareValue = { mode: "previous_period" }

interface OrdersClientProps {
  /** One page of orders, its figures and its tabs, as the server read them for the address (lib/orders/paged.ts). */
  listing: OrdersListing
  /** What that page answers (lib/orders/listing-params listingKey): when the list asks for something else, it is read again. */
  listingKey: string
  products: Array<{ id: string; title: string }>
  stripeConnected: boolean
  /** The owner refunds; a team member working in the store does not (lib/team). */
  canRefund?: boolean
  hiddenColumns: ColumnKey[]
  /** The range remembered from last time (a cookie), serialized. */
  initialRange: string | null
  timeZone: string
  now: number
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

/**
 * A callback whose identity never changes and which always runs the latest
 * version of `fn`, so the list below can skip rendering when nothing it
 * shows has changed.
 */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = React.useRef(fn)
  React.useLayoutEffect(() => {
    ref.current = fn
  })
  return React.useCallback((...args: A) => ref.current(...args), [])
}

/**
 * THE LIST DOES NOT RENDER WHEN AN ORDER OPENS. Opening one changes only
 * `?order=`, and the list, fifty rows and five sparklines, was drawn again
 * for it in the same task as the order: the frame with the order's bar on
 * it waited for a list nobody could see. Every prop it takes is kept the
 * same object while what it shows is the same, and it is memoised.
 */
const OrdersListMemo = React.memo(OrdersList)

/** After the list has slid back from an order (./order-motion), the opened order's dot goes. */
const SEEN_AFTER_BACK_MS = 450

function findOrder(orders: Order[], id: string | null): Order | null {
  if (!id) return null
  return orders.find((o) => o.id === id) ?? orders.find((o) => o.lines.some((l) => l.id === id)) ?? null
}

export function OrdersClient(props: OrdersClientProps) {
  const searchParams = useSearchParams()

  /*
    BACK TO THE LIST IS THE LIST, AS IT WAS. Coming back to Orders from
    another page by the browser's back (or forward) is a return: the stage
    has already put the list's scroll back, the router kept the rows, and
    the view, search, filters and page are in the address. So, as the
    Emails list does (app/app/emails/emails-client.tsx), it asks the stage
    for no landing (lib/ui/app-navigation holdLanding): no fade from
    nothing, no 2px rise of the whole page. Decided on the first render,
    while the return is still marked; a visit from the rail or the pill
    lands as any page does. scripts/check-lists-back.mjs measures it.
  */
  const [returning] = React.useState(() => isTraversing())
  React.useLayoutEffect(() => {
    if (returning) holdLanding()
  }, [returning])

  /*
    ── Data ───────────────────────────────────────────────────────────────
    ONE PAGE AT A TIME. The server sends the page of orders the list shows,
    the orders either side of it (previous and next on an order's page), the
    open one, the figures and which tabs have something (lib/orders/paged.ts).
    Each order keeps the number it was given over every order the store has:
    `numbers`, never a count of these rows. What the list asks for (view,
    search, filters, sort, page, period, zone) is its key; a different key
    reads the list again, and the page on screen stays until it arrives.
  */
  const [listing, setListing] = React.useState(props.listing)
  const [rows, setRows] = React.useState(props.listing.rows)
  /* Every number seen, by order id: what names ticked orders on other pages to an export. */
  const [numbers, setNumbers] = React.useState<Record<string, number>>(props.listing.numbers)
  const [loading, setLoading] = React.useState(false)
  const orders = React.useMemo(() => groupOrders(rows, numbers), [rows, numbers])
  const openRef = React.useRef<string | null>(null)
  /* A new page in: its rows, and the open order's, which may be on no page of it. */
  const adopt = React.useCallback((next: OrdersListing) => {
    /* A page asked for without its figures (the same period, another page): the figures and tabs stay as they were. */
    setListing((prev) => (next.figures ? next : { ...next, metrics: prev.metrics, summary: { ...prev.summary, total: next.summary.total, earliest: next.summary.earliest } }))
    setNumbers((prev) => ({ ...prev, ...next.numbers }))
    setRows((prev) => {
      const fresh = new Set(next.rows.map((r) => r.id))
      const open = openRef.current ? findOrder(groupOrders(prev, {}), openRef.current) : null
      const kept = open ? open.lines.filter((l) => !fresh.has(l.id)) : []
      return [...next.rows, ...kept]
    })
  }, [])
  /* A pull waits for this: the server's new page, drawn. */
  const rowsArrived = React.useRef<(() => void) | null>(null)
  /* Asked for again after an action, so the counts and figures follow it. */
  const [version, setVersion] = React.useState(0)
  const reread = React.useCallback(() => setVersion((v) => v + 1), [])
  /* Pull to refresh: the page reads its orders again, and the spinner stays until they are on the screen (or 8s). */
  const router = useRouter()
  const onPullRefresh = React.useCallback(
    () =>
      new Promise<void>((resolve) => {
        rowsArrived.current = resolve
        router.refresh()
        window.setTimeout(resolve, 8000)
      }),
    [router],
  )

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
  /* The list's part of it: everything but the open order. */
  const listAddress = React.useMemo(() => {
    const p = new URLSearchParams(searchParams.toString())
    p.delete("order")
    return p.toString()
  }, [searchParams])
  const query = React.useMemo(() => queryFromParams(new URLSearchParams(listAddress)), [listAddress])
  /*
    THE PERIOD AND ITS COMPARISON: the same picker every page in /app has.
    The address first (a shared link), then what this creator chose last
    time (a cookie, kept only with Preferences allowed), then the last 30
    days. Older links (?range=30d, ?period=7d) still open what they meant.
  */
  const [remembered, setRemembered] = React.useState<string>(props.initialRange ?? "")
  const earliest = listing.summary.earliest ? Date.parse(listing.summary.earliest) : null
  const firstDay = firstDayOf(earliest, timeZone)
  const today = todayIn(timeZone, now)
  const { period } = React.useMemo(
    () => readOrdersPeriod(new URLSearchParams(listAddress), remembered, today, firstDay),
    [listAddress, remembered, today, firstDay],
  )
  /*
    ALWAYS THE PERIOD JUST BEFORE. There is no comparison control on this
    page any more (nor on Analytics), so an old link or cookie that says
    ?compare=none or a custom comparison must not leave the changes hidden
    or measured against something nobody can see or change.
  */
  const compare = PREVIOUS_PERIOD
  const openId = searchParams.get("order")
  openRef.current = openId

  const [searchText, setSearchText] = React.useState(query.q)
  const searchTimer = React.useRef<number | undefined>(undefined)
  const onSearchText = useStable((q: string) => {
    setSearchText(q)
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(() => {
      writeAddress((p) => {
        const next = paramsFromQuery({ ...queryFromParams(p), q, page: 1 }, p)
        p.forEach((_, k) => p.delete(k))
        next.forEach((v, k) => p.set(k, v))
      }, "replace")
    }, 250)
  })
  React.useEffect(() => () => window.clearTimeout(searchTimer.current), [])

  const onQuery = useStable((next: Partial<ListQuery>) => {
    writeAddress((p) => {
      const merged = paramsFromQuery({ ...queryFromParams(p), q: searchText, ...next }, p)
      p.forEach((_, k) => p.delete(k))
      merged.forEach((v, k) => p.set(k, v))
    }, "replace")
    if (next.q !== undefined) setSearchText(next.q)
    if (next.view !== undefined || next.source !== undefined || next.product !== undefined || next.fulfillment !== undefined) setSelected(new Set())
    if (next.page !== undefined) listRef.current?.scrollTo({ top: 0 })
  })

  const remember = (p: RangeValue, c: CompareValue) => {
    const value = serializePeriod(p, c)
    setRemembered(value)
    if (hasConsent("preferences")) {
      document.cookie = value
        ? `${RANGE_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; samesite=lax`
        : `${RANGE_COOKIE}=; path=/; max-age=0; samesite=lax`
    }
  }
  const onRange = useStable((v: RangeValue) => {
    remember(v, compare)
    writeAddress((params) => {
      params.delete("period")
      writePeriod(params, v, null, DEFAULT_PRESET)
      params.delete("page")
    }, "replace")
    setSelected(new Set())
    listRef.current?.scrollTo({ top: 0 })
  })

  /* ── What the list shows ────────────────────────────────────────────── */
  const span = React.useMemo(
    () => rangeWindow(period, compare, now, timeZone),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period.preset, period.start, period.end, compare.mode, compare.range?.start, compare.range?.end, now, timeZone],
  )
  /* The page the server sent, in its order, and narrowed at once by what was typed or chosen since (the server's answer follows). */
  const byId = React.useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const pageItems = React.useMemo(
    () => filterOrders(listing.pageIds.map((id) => byId.get(id)).filter((o): o is Order => !!o), { ...query, q: searchText }, null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listing.pageIds, byId, query.view, query.source, query.product, query.fulfillment, query.sort, searchText],
  )
  const page = React.useMemo(() => ({ ...listing.range, items: pageItems }), [listing.range, pageItems])
  /* Previous and next on an order's page walk the list: this page and the order either side of it. */
  const before = listing.before ? byId.get(listing.before) ?? null : null
  const after = listing.after ? byId.get(listing.after) ?? null : null
  const filtered = React.useMemo(() => [...(before ? [before] : []), ...pageItems, ...(after ? [after] : [])], [before, pageItems, after])
  const listQuery = React.useMemo(() => ({ ...query, q: searchText }), [query, searchText])
  const metrics = listing.metrics

  /* ── Asking the server for the page the list shows ──────────────────── */
  const wantedKey = listingKey(query, period, timeZone)
  const wanted = `${wantedKey}#${version}`
  const asked = React.useRef(`${props.listingKey}#0`)
  /*
    THE FIGURES ONLY WHEN THEY CAN HAVE CHANGED. Another page, a search or a
    filter leaves the five figures and the tabs as they were: they are asked
    for again with a new period or zone, after an action, and once a minute
    has passed (the period runs up to now).
  */
  const figuresKey = JSON.stringify([period.preset, period.start, period.end, timeZone, version])
  const hadFigures = React.useRef<{ key: string; at: number } | null>(null)
  if (hadFigures.current === null) hadFigures.current = { key: props.listingKey === wantedKey ? figuresKey : "", at: props.now }
  const askedFor = React.useRef({ query, span, timeZone, figuresKey })
  askedFor.current = { query, span, timeZone, figuresKey }
  React.useEffect(() => {
    if (asked.current === wanted) return
    asked.current = wanted
    const ctrl = new AbortController()
    const { query: q, span: s, timeZone: zone, figuresKey: fk } = askedFor.current
    const had = hadFigures.current
    const figures = !had || had.key !== fk || Date.now() - had.at > 60_000
    const params = listingParams({ query: q, window: { start: s.start, end: s.end }, previous: s.previous, timeZone: zone, open: openRef.current, figures })
    setLoading(true)
    let done = false
    fetch(`/api/app/orders/list?${params.toString()}`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((next: OrdersListing) => {
        done = true
        if (next.figures) hadFigures.current = { key: fk, at: Date.now() }
        adopt(next)
        setLoading(false)
        rowsArrived.current?.()
        rowsArrived.current = null
      })
      .catch(() => {
        /* Aborted for a newer ask, or failed: what is on screen stays. */
        if (!ctrl.signal.aborted) {
          done = true
          setLoading(false)
        }
      })
    return () => {
      ctrl.abort()
      /* Not answered: the next run asks again, even for the same thing. */
      if (!done) asked.current = ""
    }
  }, [wanted, adopt])

  /* The server's own page after a pull to refresh: taken when it answers what the list shows, asked for again when not. */
  const propsListing = React.useRef(props.listing)
  React.useEffect(() => {
    if (propsListing.current === props.listing) return
    propsListing.current = props.listing
    if (props.listingKey === wantedKey) {
      hadFigures.current = { key: figuresKey, at: Date.now() }
      adopt(props.listing)
      rowsArrived.current?.()
      rowsArrived.current = null
    } else reread()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.listing])

  /* ── Columns, remembered in a cookie so the server draws the same table ─ */
  const [hidden, setHidden] = React.useState(() => new Set(props.hiddenColumns))
  const onToggleColumn = useStable((key: ColumnKey) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      /* Remembered between visits only with Preferences allowed; this visit keeps it either way. */
      if (hasConsent("preferences")) document.cookie = `${COLUMNS_COOKIE}=${[...next].join(".")}; path=/; max-age=31536000; samesite=lax`
      return next
    })
  })

  /* ── Selection ──────────────────────────────────────────────────────── */
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const onSelect = useStable((ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    }),
  )

  /* ── The order over the list ────────────────────────────────────────── */
  const shown = findOrder(orders, openId)
  const pushed = React.useRef(false)
  const listRef = React.useRef<HTMLDivElement>(null)
  const detailRef = React.useRef<HTMLDivElement>(null)
  /* Opened straight onto an order (a link, a reload): the page does not fade
     in as a whole, so its bar is at full strength on the first frame. */
  const [openedOnOrder] = React.useState(() => shown !== null)

  /*
    SEEN. An order nobody on the store has opened carries a small dot on the list (SQL part 224, orders.seller_seen_at).
    Opening it is what clears it. The server is told as it opens, once per order (app/api/app/orders/seen). The rows
    change only once the order has closed and the list has slid back, so opening an order still draws nothing of the
    list (THE LIST DOES NOT RENDER WHEN AN ORDER OPENS, above): the dot fades out where the seller is looking.
  */
  const seenSent = React.useRef(new Set<string>())
  const seenPending = React.useRef<string[]>([])
  const unseenShown = shown?.unseen ? shown : null
  React.useEffect(() => {
    if (!unseenShown || seenSent.current.has(unseenShown.id)) return
    seenSent.current.add(unseenShown.id)
    const ids = unseenShown.lines.map((l) => l.id)
    seenPending.current.push(...ids)
    void fetch("/api/app/orders/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }), keepalive: true }).catch(() => undefined)
  }, [unseenShown])
  const anyShown = shown !== null
  React.useEffect(() => {
    if (anyShown || seenPending.current.length === 0) return
    const t = window.setTimeout(() => {
      const ids = new Set(seenPending.current.splice(0))
      const at = new Date().toISOString()
      React.startTransition(() => setRows((prev) => prev.map((r) => (ids.has(r.id) && r.seller_seen_at === null ? { ...r, seller_seen_at: at } : r))))
    }, SEEN_AFTER_BACK_MS)
    return () => window.clearTimeout(t)
  }, [anyShown])

  /*
    THE ORDER THAT IS LEAVING. When the address stops naming an order (back,
    in any of its forms) the order is still drawn, inert, while it slides or
    fades off the list, and taken away when that ends. Worked out while
    rendering, in the same render that closes it, so there is no frame in
    which the order is gone and then back for its exit. How it arrived: from
    the list, or by a step to the previous or next order, which only fades
    the cards.
  */
  const shownId = shown?.id ?? null
  const [lastId, setLastId] = React.useState(shownId)
  const [leavingId, setLeavingId] = React.useState<string | null>(null)
  const [arrival, setArrival] = React.useState<"list" | "step">("list")
  if (shownId !== lastId) {
    setLastId(shownId)
    setLeavingId(shownId === null ? lastId : null)
    if (shownId !== null) setArrival(lastId === null ? "list" : "step")
  }
  const leaving = shown ? null : findOrder(orders, leavingId)
  const displayed = shown ?? leaving

  /* Each order starts at its top, before it is drawn: after the paint, the
     next order showed for a frame at the last one's scroll position. An
     order on its way out keeps where it was. */
  /* A pane drawn for the first time is at its top already, and asking it to
     scroll there made the browser style and lay out the whole page inside
     the commit that starts the order's rise (a 250ms task on a slow phone):
     only a pane that was already up, stepping to the next order, is moved. */
  const scrolledPane = React.useRef<HTMLDivElement | null>(null)
  React.useLayoutEffect(() => {
    const pane = detailRef.current
    const fresh = pane !== scrolledPane.current
    scrolledPane.current = pane
    if (shownId && pane && !fresh) pane.scrollTo({ top: 0 })
  }, [shownId])

  /*
    A browser that already drew its own transition for this entry (Safari's
    swipe back, which slides a picture of the list in) says so on the
    popstate, and the order then just goes: a second slide after the
    browser's own is the double animation this page had once.
  */
  const browserMoved = React.useRef(false)
  React.useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      browserMoved.current = Boolean((e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition)
    }
    window.addEventListener("popstate", onPop, { capture: true })
    return () => window.removeEventListener("popstate", onPop, { capture: true })
  }, [])

  /*
    THE MOVE, before the commit that draws or closes the order is painted.
    Opening from the list pushes; a step between orders changes nothing but
    the cards; closing pops, and the leaving order goes once it is off.
  */
  const settledId = React.useRef(shownId)
  React.useLayoutEffect(() => {
    const was = settledId.current
    settledId.current = shownId
    if (was === shownId) return
    const detail = detailRef.current
    const list = listRef.current
    if (!list) return
    const skip = browserMoved.current
    browserMoved.current = false
    if (shownId !== null) {
      if (was !== null || !detail) return
      markRow(list, shownId, "held")
      if (skip) return stillOrder(detail, list)
      moveOrder("push", detail, list)
      return
    }
    markRow(list, was, "fading")
    if (!detail || skip) {
      stillOrder(detail, list)
      setLeavingId(null)
      return
    }
    /* Back shows the list at once, whole, where it was: no settling in (order-motion, `settle`). */
    moveOrder("pop", detail, list, () => setLeavingId(null), { settle: false })
  }, [shownId])

  /*
    An order on no page the list has (a link from an email, a reload on an
    order from another page) is asked for on its own, numbered as everywhere.
    One that is not this creator's, or not there, takes the address back.
  */
  const hasShown = shown !== null
  React.useEffect(() => {
    if (!openId || hasShown) return
    const ctrl = new AbortController()
    fetch(`/api/app/orders/list?one=${encodeURIComponent(openId)}`, { signal: ctrl.signal, cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((one: { rows: OrderRow[]; numbers: Record<string, number> }) => {
        setNumbers((prev) => ({ ...prev, ...one.numbers }))
        setRows((prev) => {
          const have = new Set(prev.map((r) => r.id))
          return [...prev, ...one.rows.filter((r) => !have.has(r.id))]
        })
      })
      .catch(() => {
        if (!ctrl.signal.aborted) writeAddress((p) => p.delete("order"), "replace")
      })
    return () => ctrl.abort()
  }, [openId, hasShown])
  /* Closed by the browser's own back: nothing of ours pushed an entry now. */
  React.useEffect(() => {
    if (!openId) pushed.current = false
  }, [openId])

  const onOpen = useStable((id: string) => {
    /* The row answers the press on its own frame, before the order is drawn (which on a slow phone takes a while): the same tint it keeps while the order covers it. */
    if (listRef.current) markRow(listRef.current, id, "held")
    pushed.current = true
    writeAddress((p) => p.set("order", id), "push")
  })
  /*
    BACK CLOSES IT EVEN WHEN THE BACK DOES NOTHING. Same as the Emails list:
    the pushed entry is the app's own note, `history.back()` says nothing when
    it does nothing, and the order then sat over the list for ever. A back
    that does not show itself within BACK_WATCH_MS is followed by the address
    being cleared (lib/navigation/go-back backThen).
  */
  const closeOver = () => writeAddress((p) => p.delete("order"), "replace")
  const onBack = () => {
    if (pushed.current) backThen(closeOver)
    else closeOver()
  }
  const at = displayed ? filtered.findIndex((o) => o.id === displayed.id) : -1
  /* Where `filtered` starts in the whole list: the order before this page, or the page's first. */
  const offset = Math.max(0, page.from - 1 - (before ? 1 : 0))
  const onStep = (dir: -1 | 1) => {
    /* Not from an order on its way out (its arrow keys are still listening). */
    const next = shown ? filtered[at + dir] : undefined
    if (!next) return
    /* Onto the order either side of the page: the list behind turns to its page, so the next step has somewhere to go. */
    if (next === before) onQuery({ page: page.page - 1 })
    else if (next === after) onQuery({ page: page.page + 1 })
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
  /* A change shows at once; the page is read again behind it, so its counts, tabs and figures follow. */
  const patchRows = (ids: string[], patch: Partial<OrderRow>) => {
    setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, ...patch } : r)))
    reread()
  }

  /* A parcel fulfilled, delivered or returned on its page: its row in the list says so at once. */
  const onShipping = useStable((checkoutId: string, fulfillment: string, returnStatus: string, cashDue: boolean) => {
    setRows((prev) => prev.map((r) => (r.checkout_id === checkoutId ? { ...r, physical_fulfillment: fulfillment, physical_return: returnStatus, physical_cash_due: cashDue } : r)))
    reread()
  })

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
        if (!res.ok) throw new Error(data?.error || tt("The refund did not go through."))
        const cents = typeof data?.amount === "number" ? data.amount : action.amountCents
        if (data?.pending) return tt("Refund of {amount} is processing. The order updates once it goes through.", { amount: formatMoney(cents, order.currency) })
        patchRows([action.line.id], {
          status: "refunded",
          /* The line's running total, as the row now holds it: a second part refund of $3 after $2 is $5 refunded, not $3. */
          refund_amount_cents: typeof data?.refundedCents === "number" ? data.refundedCents : (action.line.status === "refunded" ? (action.line.refund_amount_cents || 0) : 0) + cents,
          refunded_at: typeof data?.refundedAt === "string" ? data.refundedAt : new Date().toISOString(),
          refund_reason: action.reason,
        })
        return tt("Refunded {amount}", { amount: formatMoney(cents, order.currency) })
      }
      case "resend": {
        const { res, data } = await postJson(`/api/app/orders/${encodeURIComponent(order.id)}/resend`)
        applyDelivery(data?.lines)
        if (!res.ok) throw new Error(data?.error || tt("The receipt was not sent. Try again."))
        if (data?.failed > 0) return `Sent ${data.sent} of ${data.sent + data.failed} receipts. ${data.error ?? ""}`.trim()
        return tt("Receipt sent to {value}", { value: order.customerEmail || tt("the buyer") })
      }
      case "invoice": {
        const outcome = await saveFile({
          name: `invoice-${order.number}.pdf`,
          viewable: true,
          file: async () => {
            const res = await fetch(`/api/invoice?orderId=${encodeURIComponent(order.id)}&tz=${encodeURIComponent(timeZone)}`)
            if (!res.ok) {
              const data = await res.json().catch(() => ({}))
              throw new Error(data?.error || tt("The invoice could not be made. Try again."))
            }
            return res.blob()
          },
          link: async (disposition) => {
            const { res, data } = await postJson("/api/invoice", { orderId: order.id, disposition, timeZone })
            if (!res.ok || !data?.url) throw new Error(data?.error || tt("The invoice could not be made. Try again."))
            return data.url as string
          },
        })
        return savedMessage(outcome, tt("Invoice"))
      }
      case "email": {
        const { res, data } = await postJson(`/api/app/orders/${encodeURIComponent(order.id)}/email`, { email: action.email })
        if (!res.ok) throw new Error(data?.error || tt("The email was not changed. Try again."))
        const email = typeof data?.email === "string" ? data.email : action.email
        patchRows(Array.isArray(data?.ids) ? data.ids : order.lines.map((l) => l.id), { buyer_email: email })
        applyDelivery(data?.lines)
        if (data?.sent > 0) return tt("Email changed. Receipt sent to {email}", { email })
        if (data?.failed > 0) return `Email changed, but the receipt did not send. ${data.error ?? ""}`.trim()
        return tt("Email changed to {email}", { email })
      }
    }
  }

  /* Export opens its sheet or panel; which orders and which file are chosen
     there. The Export button opens it and, on a computer, closes it again. */
  const [exporting, setExporting] = React.useState(false)
  const onExport = useStable(() => setExporting((open) => !open))
  /* Many orders at once (./bulk-actions.tsx): Mark as fulfilled and Packing slips for the ticked ones, a tracking CSV for any. */
  const [bulk, setBulk] = React.useState<"fulfil" | "import" | null>(null)
  const onFulfil = useStable(() => setBulk("fulfil"))
  const onImport = useStable(() => setBulk("import"))
  const onSlips = useStable(() => void printSelectedSlips([...selected]).then((e) => e && onNotice(e)))
  const afterBulk = (message: string) => {
    onNotice(message)
    /* The list reads its page again (not every order), so the fulfilled ones move on. */
    reread()
  }
  const filtering = Boolean(searchText.trim()) || query.source !== "any" || Boolean(query.product) || (query.fulfillment ?? "any") !== "any" || query.view !== "all"

  /* Under a settled order the list is hidden by the stage (app/globals.css,
     `.orders-stage[data-order-open]`), and drawn again while anything moves. */
  const listCovered = shown !== null

  return (
    <div
      className={cn("orders-stage relative h-full overflow-hidden bg-[#f8f9fa]", !openedOnOrder && "app-page-enter")}
      data-order-open={listCovered ? "" : undefined}
    >
      <div
        ref={listRef}
        className="orders-pane orders-list page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
        inert={listCovered}
        aria-hidden={listCovered || undefined}
      >
        <PullToRefresh onRefresh={onPullRefresh}>
        <OrdersListMemo
          summary={listing.summary}
          loading={loading}
          pageOrders={page.items}
          matching={listing.matching}
          range={page}
          query={listQuery}
          onQuery={onQuery}
          searchText={searchText}
          onSearchText={onSearchText}
          period={period}
          onPeriod={onRange}
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
          onFulfil={onFulfil}
          onSlips={onSlips}
          onImport={onImport}
          products={props.products}
          stripeConnected={props.stripeConnected}
          now={now}
          timeZone={timeZone}
        />
        </PullToRefresh>
      </div>

      {displayed ? (
        <div
          ref={detailRef}
          className="orders-pane orders-detail page-scroll absolute inset-0 overflow-y-auto overflow-x-hidden bg-[#f8f9fa]"
          role="region"
          aria-label={tt("Order {number}", { number: displayed.number })}
          data-arrival={arrival}
          data-leaving={shown ? undefined : ""}
          inert={!shown}
          aria-hidden={!shown || undefined}
        >
          <OrderDetail
            order={displayed}
            timeZone={timeZone}
            now={now}
            onBack={onBack}
            onStep={at >= 0 ? onStep : null}
            canStep={{ previous: at > 0, next: at >= 0 && at < filtered.length - 1 }}
            position={at >= 0 ? { index: offset + at, count: Math.max(listing.matching, offset + filtered.length) } : null}
            onAction={onAction}
            onNotice={onNotice}
            onShipping={onShipping}
            canRefund={props.canRefund !== false}
          />
        </div>
      ) : null}

      <ExportOrders
        open={exporting}
        onClose={() => setExporting(false)}
        total={listing.summary.total}
        known={orders}
        numbers={numbers}
        pageOrders={page.items}
        matching={listing.matching}
        query={listQuery}
        span={span}
        period={period}
        filtering={filtering}
        selected={selected}
        timeZone={timeZone}
        onDone={onNotice}
        ships={listing.summary.ships}
      />

      <BulkFulfilSheet ids={bulk === "fulfil" ? [...selected] : []} open={bulk === "fulfil"} onClose={() => setBulk(null)} onDone={afterBulk} />
      <ImportTrackingSheet open={bulk === "import"} onClose={() => setBulk(null)} onDone={afterBulk} />

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
