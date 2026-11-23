"use client"

import * as React from "react"

import type { ViewId } from "@/lib/admin/types"

import { ActionDialog, type Action, type Outcome } from "./actions"
import { apiQuery, parseRoute, routeQuery, type Route } from "./nav-state"
import { Shell } from "./shell"
import { Banner, Button, Delayed, Placeholder } from "./ui"
import { CreatorView, CreatorsView, OrdersView, PayoutsView, ProductsView } from "./view-commerce"
import { OverviewView } from "./view-overview"
import { OpsView } from "./view-ops"
import { AudienceView, AuditView, EmailView, PeopleView, SystemView, WebsitesView } from "./view-platform"

/**
 * ===========================================================================
 *  THE CONSOLE: WHERE YOU ARE, WHAT IT SAYS, AND WHAT YOU CAN CHANGE
 * ===========================================================================
 * The server has already checked the admin cookie before this renders (see
 * app/admin/page.tsx), and every read below goes through
 * /api/admin/platform/<view>, which checks it again. A 401 from anywhere
 * means the cookie expired, and the page reloads onto the sign in.
 *
 * WHAT DOES NOT FLASH. A view keeps what it last showed while the next read
 * is in flight, with a thin line at the top of the window after a moment.
 * A view opened for the first time shows its placeholder only if the read
 * takes longer than a third of a second, so a fast answer paints once.
 *
 * WHAT REFRESHES. The visitors-now count every 30 seconds and the overview
 * every minute, and neither while the tab is hidden.
 */

type Data = Record<string, any> | null // eslint-disable-line @typescript-eslint/no-explicit-any

export function renderView(route: Route, data: Data, props: { go: (r: Partial<Route>) => void; query: string; onQuery: (q: string) => void; act: (a: Action) => void; live?: number | null }) {
  if (!data) return null
  const common = { route, ...props }
  switch (route.view) {
    case "overview":
      return <OverviewView data={data as never} go={props.go} />
    case "creators":
      return <CreatorsView data={data as never} {...common} />
    case "creator":
      return <CreatorView data={data as never} {...common} />
    case "products":
      return <ProductsView data={data as never} {...common} />
    case "orders":
      return <OrdersView data={data as never} {...common} />
    case "payouts":
      return <PayoutsView data={data as never} {...common} />
    case "websites":
      return <WebsitesView data={data as never} {...common} />
    case "email":
      return <EmailView data={data as never} {...common} />
    case "audience":
      return <AudienceView data={data as never} {...common} />
    case "people":
      return <PeopleView data={data as never} {...common} />
    case "audit":
      return <AuditView data={data as never} {...common} />
    case "system":
      return <SystemView data={data as never} {...common} />
    case "ops":
      return <OpsView data={data as never} />
  }
}

const SEARCHABLE: ViewId[] = ["creators", "products", "orders", "websites", "people"]

export function AdminConsole({ initial }: { initial: Route }) {
  const [route, setRoute] = React.useState<Route>(initial)
  const [data, setData] = React.useState<{ key: string; body: Data } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [slow, setSlow] = React.useState(false)
  const [live, setLive] = React.useState<number | null>(null)
  const [query, setQuery] = React.useState(initial.q)
  const [action, setAction] = React.useState<Action | null>(null)
  const [outcome, setOutcome] = React.useState<Outcome | null>(null)
  const [tick, setTick] = React.useState(0)

  const key = `${route.view}${apiQuery(route)}`

  /* Read through a ref so a navigation never runs inside a state updater, which React may call twice. */
  const routeRef = React.useRef(route)
  React.useEffect(() => {
    routeRef.current = route
  }, [route])

  const go = React.useCallback((next: Partial<Route>, replace = false) => {
    const cur = routeRef.current
    const merged: Route = { ...cur, ...next }
    if (next.view && next.view !== cur.view) {
      merged.q = next.q ?? ""
      merged.filter = next.filter ?? ""
      merged.page = next.page ?? 1
      merged.id = next.id ?? ""
      merged.tab = next.tab ?? ""
    }
    const url = `/admin${routeQuery(merged)}`
    if (replace) window.history.replaceState(null, "", url)
    else window.history.pushState(null, "", url)
    routeRef.current = merged
    setRoute(merged)
    if (next.view) {
      setQuery(merged.q)
      setOutcome(null)
      window.scrollTo({ top: 0 })
    }
  }, [])

  /* Back and forward move between views without a reload. */
  React.useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search)
      const r = parseRoute((k) => p.get(k))
      setRoute(r)
      setQuery(r.q)
    }
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  /* Typing is not a query per keystroke. */
  React.useEffect(() => {
    if (!SEARCHABLE.includes(route.view)) return
    const q = query.trim()
    if (q === route.q) return
    const t = setTimeout(() => go({ q, page: 1 }, true), 350)
    return () => clearTimeout(t)
  }, [query, route.q, route.view, go])

  /* The view on screen. */
  React.useEffect(() => {
    const controller = new AbortController()
    setBusy(true)
    setError(null)
    const slowTimer = setTimeout(() => setSlow(true), 300)
    fetch(`/api/admin/platform/${route.view}${apiQuery(route)}`, { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (res.status === 401) {
          window.location.reload()
          return
        }
        const body = await res.json().catch(() => null)
        if (!res.ok || !body) {
          setError(body?.error || "This view could not be loaded.")
          return
        }
        setData({ key, body })
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError("Could not reach the server.")
      })
      .finally(() => {
        clearTimeout(slowTimer)
        if (!controller.signal.aborted) {
          setBusy(false)
          setSlow(false)
        }
      })
    return () => {
      controller.abort()
      clearTimeout(slowTimer)
    }
    // `route` is read through `key`, which changes exactly when the request would.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick])

  /* The overview once a minute, and Operations every 30 seconds, while it is being looked at. */
  React.useEffect(() => {
    if (route.view !== "overview" && route.view !== "ops") return
    const id = setInterval(() => {
      if (document.visibilityState === "visible") setTick((t) => t + 1)
    }, route.view === "ops" ? 30_000 : 60_000)
    return () => clearInterval(id)
  }, [route.view])

  /* Visitors now, the one figure worth keeping current. */
  React.useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const res = await fetch("/api/admin/platform/live", { cache: "no-store" })
        if (res.status === 401) return window.location.reload()
        const body = await res.json()
        if (!cancelled) setLive(typeof body.liveNow === "number" ? body.liveNow : null)
      } catch {
        /* The count stays as it was. */
      }
    }
    void read()
    const id = setInterval(read, 30_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const signOut = async () => {
    await fetch("/api/admin/blog/auth", { method: "DELETE" }).catch(() => {})
    window.location.reload()
  }

  /* What was last read for THIS view; another view's data is never drawn here. */
  const shown = data && (data.key === key || (route.view !== "creator" && data.key.split("?")[0] === route.view)) ? data.body : null

  return (
    <Shell current={route.view} onNavigate={(v) => go({ view: v })} live={live} busy={busy && slow} onSignOut={signOut}>
      {outcome ? (
        <div className="mb-4">
          <Banner tone={outcome.tone} onClose={() => setOutcome(null)}>
            {outcome.text}
            {outcome.notes?.map((n) => (
              <span key={n} className="mt-0.5 block text-[12px] text-[#9b9ba6]">{n}</span>
            ))}
          </Banner>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Banner tone="bad">
            {error}{" "}
            <Button variant="quiet" className="ml-1 h-7" onClick={() => setTick((t) => t + 1)}>
              Try again
            </Button>
          </Banner>
        </div>
      ) : null}
      {shown ? (
        renderView(route, shown, { go, query, onQuery: setQuery, act: setAction, live })
      ) : error ? null : (
        <Delayed ms={300}>
          <Placeholder />
        </Delayed>
      )}
      <ActionDialog
        action={action}
        onClose={() => setAction(null)}
        onDone={(o) => {
          setAction(null)
          setOutcome(o)
          setTick((t) => t + 1)
        }}
      />
    </Shell>
  )
}
