"use client"

import * as React from "react"

import {
  Activity,
  Creators,
  Geography,
  Health,
  Live,
  Overview,
  Products,
  Revenue,
  Traffic,
  Users,
} from "./_panels"
import { num } from "./_ui"

/**
 * ===========================================================================
 *  THE SHELL: A GATE, A BAR AND TEN PANELS
 * ===========================================================================
 * The gate here is a convenience, not the lock. Every section is fetched from
 * /api/admin/platform/<section>, which checks the admin cookie itself, so
 * skipping this page with curl gets a 401 rather than a dashboard. A 401 from
 * anywhere puts the login back on screen, which is also what an expired
 * cookie looks like.
 *
 * ---------------------------------------------------------------------------
 *  WHAT REFRESHES ON ITS OWN
 * ---------------------------------------------------------------------------
 * Two intervals, not ten: the live count every 20 seconds, because that is
 * the number that is worth being current, and the panel you are looking at
 * every 60. Nothing else polls, and neither poll runs while the tab is in the
 * background — `document.visibilityState` is checked before each tick, so a
 * dashboard left open overnight is not a thousand queries.
 */

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "live", label: "Live" },
  { id: "revenue", label: "Revenue" },
  { id: "traffic", label: "Traffic" },
  { id: "geography", label: "Geography" },
  { id: "creators", label: "Creators" },
  { id: "products", label: "Products" },
  { id: "users", label: "People" },
  { id: "activity", label: "Activity" },
  { id: "health", label: "Health" },
] as const
type TabId = (typeof TABS)[number]["id"]

type Payload = Record<string, any> | null

async function loadSection(section: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`/api/admin/platform/${section}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
  if (res.status === 401) throw new Error("unauthorised")
  if (!res.ok) throw new Error(`Section failed with ${res.status}`)
  return (await res.json()) as Record<string, any>
}

export default function AdminClient() {
  /* Every hook before any early return: an editor on this page once shipped
     React error #310 by putting one after a guard. */
  const [authed, setAuthed] = React.useState<boolean | null>(null)
  const [tab, setTab] = React.useState<TabId>("overview")
  const [data, setData] = React.useState<Payload>(null)
  const [live, setLive] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [revenueDays, setRevenueDays] = React.useState<30 | 90>(30)
  const [query, setQuery] = React.useState("")
  const [debounced, setDebounced] = React.useState("")

  const signedOut = React.useCallback(() => {
    setAuthed(false)
    setData(null)
    setLive(null)
  }, [])

  /** The section currently on screen, with whatever parameters it takes. */
  const params = React.useMemo<Record<string, string>>(() => {
    if (tab === "revenue") return { days: String(revenueDays) }
    if (tab === "users" && debounced) return { q: debounced }
    return {}
  }, [tab, revenueDays, debounced])

  const refresh = React.useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const body = await loadSection(tab, params)
      setData(body)
      setAuthed(true)
    } catch (e) {
      if (e instanceof Error && e.message === "unauthorised") signedOut()
      else setError(e instanceof Error ? e.message : "Could not load this panel.")
    } finally {
      setBusy(false)
    }
  }, [tab, params, signedOut])

  /* Typing in the search box must not be a query per keystroke. */
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(t)
  }, [query])

  /* The panel on screen: once when it changes, then every minute. */
  React.useEffect(() => {
    let cancelled = false
    setData(null)
    void refresh()
    const id = setInterval(() => {
      if (document.visibilityState !== "visible" || cancelled) return
      void refresh()
    }, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [refresh])

  /* The live count, which is the one figure worth being current. */
  React.useEffect(() => {
    if (authed === false) return
    let cancelled = false
    const tick = async () => {
      if (document.visibilityState !== "visible") return
      try {
        const body = await loadSection("live")
        if (!cancelled) {
          setLive(typeof body.liveNow === "number" ? body.liveNow : null)
          setAuthed(true)
        }
      } catch (e) {
        if (!cancelled && e instanceof Error && e.message === "unauthorised") signedOut()
      }
    }
    void tick()
    const id = setInterval(tick, 20_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [authed, signedOut])

  const logout = React.useCallback(async () => {
    await fetch("/api/admin/blog/auth", { method: "DELETE" }).catch(() => {})
    signedOut()
  }, [signedOut])

  if (authed === false) return <Login onDone={() => setAuthed(null)} />

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <header className="sticky top-0 z-40 border-b border-[#e5e7eb]/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
          {/* Left: who and how busy */}
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#1a1a2e] text-[13px] font-bold text-white">
              S
            </span>
            <span className="hidden text-[15px] font-semibold text-[#1a1a2e] lg:inline">Storelib admin</span>
            <span className="flex items-center gap-1.5 rounded-full bg-[#f0fdf4] px-2 py-0.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22c55e] opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#15803d]" />
              </span>
              <span className="text-[12px] font-medium tabular-nums text-[#15803d]">{num(live)} live</span>
            </span>
          </div>

          {/* Middle: the tabs, which scroll rather than wrap or squeeze */}
          <nav className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[14px] font-medium transition-colors ${
                    tab === t.id ? "bg-[#ede9fe] text-[#6d28d9]" : "text-[#6b7280] hover:bg-[#f1f3f5] hover:text-[#1a1a2e]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </nav>

          {/* Right: the labels collapse before the tabs have to */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f3f5] disabled:opacity-60 sm:px-3"
              aria-label="Refresh"
            >
              <span aria-hidden className={busy ? "animate-spin" : undefined}>
                ↻
              </span>
              <span className="hidden xl:inline">Refresh</span>
            </button>
            <a
              href="/admin/blog/dashboard"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-2.5 text-[14px] font-medium text-[#1a1a2e] transition-colors hover:bg-[#f1f3f5] sm:px-3"
              aria-label="Blog admin"
            >
              <span aria-hidden>✎</span>
              <span className="hidden xl:inline">Blog</span>
            </a>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium text-[#6b7280] transition-colors hover:bg-[#f1f3f5] hover:text-[#1a1a2e] sm:px-3"
              aria-label="Sign out"
            >
              <span aria-hidden>⎋</span>
              <span className="hidden xl:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-5 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-4 text-[14px] text-[#b91c1c]">
            {error}
          </div>
        ) : null}

        {tab === "overview" && <Overview data={data} />}
        {tab === "live" && <Live data={data} />}
        {tab === "revenue" && <Revenue data={data} days={revenueDays} onDays={setRevenueDays} />}
        {tab === "traffic" && <Traffic data={data} />}
        {tab === "geography" && <Geography data={data} />}
        {tab === "creators" && <Creators data={data} />}
        {tab === "products" && <Products data={data} />}
        {tab === "users" && <Users data={data} query={query} onQuery={setQuery} />}
        {tab === "activity" && <Activity data={data} />}
        {tab === "health" && <Health data={data} />}
      </main>
    </div>
  )
}

/* ── The gate ────────────────────────────────────────────────────────────── */

function Login({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/blog/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (res.ok) {
        onDone()
        return
      }
      /* "Not configured" is not "wrong password", and telling somebody to try
         again when there is nothing to try is how an evening is spent. */
      if (res.status === 503) {
        const body = await res.json().catch(() => ({}))
        setError(typeof body.error === "string" ? body.error : "The admin is not configured.")
        return
      }
      setError("Invalid username or password")
    } catch {
      setError("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f8f9fa] px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-[18px] font-bold text-white">
            S
          </span>
          <h1 className="text-[20px] font-bold text-[#1a1a2e]">Storelib admin</h1>
          <p className="mt-1 text-[14px] text-[#6b7280]">Sign in to see the platform</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#e5e7eb]/60 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6]"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-[#1a1a2e]">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-[14px] text-[#1a1a2e] outline-none focus:border-[#8b5cf6]"
            />
          </label>

          {error ? <p className="text-[13px] text-[#b91c1c]">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-lg bg-[#1a1a2e] text-[14px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Checking…" : "Sign in"}
          </button>
        </div>
      </form>
    </div>
  )
}
