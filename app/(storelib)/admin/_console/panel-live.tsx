"use client"

import * as React from "react"

import { countryFlag, countryName, describeEvent, deviceLabel } from "@/lib/activity/creator-activity"
import { ACTION_FILTERS, AREAS, AREA_LABEL, describeLiveAction, isArea, livePageLabel, sessionLength } from "@/lib/live/live"
import type { LiveFeedPayload, LiveFeedRow, LivePayload, LiveSessionPayload, LiveSessionRow } from "@/lib/admin/types"

import { ago, date, money, num } from "./format"
import type { Route } from "./nav-state"
import { ViewHeader } from "./shell"
import { Button, C, DataList, Facts, Figures, Filters, LinkText, Panel, ReadNotes, type Column } from "./ui"

/**
 * ===========================================================================
 *  LIVE: EVERYONE ON STORELIB NOW, WHAT THEY ARE ON, AND WHAT THEY DID
 * ===========================================================================
 * Read from /api/admin/platform/live?part=… (lib/admin/views/live.ts), behind
 * the same admin cookie as every other view.
 *
 *   the figures       online now, signed in or not, sessions today, creators
 *                     in /app, by area and by country
 *   Online now        who checked in within two minutes, newest first; a row
 *                     opens that tab: its pages, its actions, what it paid
 *   Activity          everyone's actions, by area and by action, 50 a page
 *
 * The figures and the list are read every 30 seconds while this tab is
 * visible and never while it is hidden (the same reasoning as round 59's
 * panel-activity: polling costs what the admin looks at, a push would cost
 * what visitors do). Before part 477 has run the view says so in Supabase's
 * own words, and asks again on the next read.
 */

type Go = (r: Partial<Route>) => void
const POLL_MS = 30_000

export const LIVE_NOTES = [
  "Online now: a tab that checked in within the last two minutes. A tab left in the background stops counting after that.",
  "A tab is one visit. Nothing is stored that would tell the same person in two tabs or on two days apart, so sessions today count visits, not people.",
  "A name shows only for someone signed in who said yes to analytics cookies, with no Do Not Track or Global Privacy Control signal. Everyone else is a visitor with a random id that ends when the tab closes.",
  "Pages, named actions, country, device and source only. Typed text, search terms, emails, payment details and IP addresses are never recorded. Actions are kept 30 days, a visitor's pages 7.",
]

async function readLive<T>(query: string, signal?: AbortSignal): Promise<{ body: T | null; error: string | null }> {
  try {
    const res = await fetch(`/api/admin/platform/live?${query}`, { cache: "no-store", signal })
    if (res.status === 401) {
      window.location.reload()
      return { body: null, error: null }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) return { body: null, error: body?.error || "Live could not be read." }
    return { body: body as T, error: null }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { body: null, error: null }
    return { body: null, error: "Could not reach the server." }
  }
}

/** The figures and who is online, now and every 30 seconds while the tab is visible. */
function useLive(area: string): { data: LivePayload | null; error: string | null; key: string } {
  const [state, setState] = React.useState<{ key: string; body: LivePayload } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    const q = new URLSearchParams({ part: "sessions" })
    if (area) q.set("area", area)
    const read = async () => {
      if (document.visibilityState !== "visible") return
      const got = await readLive<LivePayload>(q.toString())
      if (cancelled) return
      if (got.body) {
        setState({ key: area, body: got.body })
        setError(null)
      } else if (got.error) setError(got.error)
    }
    void read()
    const id = window.setInterval(read, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [area])
  return { data: state?.body ?? null, error, key: state?.key ?? "" }
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

function Dot({ on }: { on: boolean }) {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: on ? C.good : C.faint }} />
}

function Country({ code }: { code: string | null }) {
  if (!code) return <span className="text-[#6b6b76]">Unknown</span>
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span aria-hidden>{countryFlag(code)}</span>
      <span className="truncate">{countryName(code)}</span>
    </span>
  )
}

function Who({ who }: { who: LiveSessionRow["who"] }) {
  return who.kind === "account" ? <span className="truncate text-[#ededf0]">{who.label}</span> : <span className="truncate text-[#9b9ba6]">{who.label}</span>
}

/** "Explore", "Product page, blue brushes" on a creator page, the site's host first on a creator's own website. */
function Place({ area, path, host }: { area: string; path: string | null; host: string | null }) {
  const page = area === "app" ? (path ? describeEvent({ kind: "page", name: path }) : "") : livePageLabel(path, area)
  return (
    <span className="min-w-0 truncate">
      <span className="text-[#ededf0]">{isArea(area) ? AREA_LABEL[area] : area}</span>
      {host ? <span className="text-[#6b6b76]"> {host}</span> : null}
      {page ? <span className="text-[#9b9ba6]">, {page}</span> : null}
    </span>
  )
}

function deviceOf(r: { device: string | null; os: string | null; browser: string | null; shell: string | null }): string {
  return deviceLabel(r)
}

function actionLabel(r: LiveSessionRow): string {
  if (!r.lastAction) return ""
  const label = r.area === "app" ? describeEvent({ kind: "action", name: r.lastAction }) : describeLiveAction(r.lastAction)
  return `${label}, ${ago(r.lastActionAt)}`
}

export function MissingLive({ reason }: { reason?: string | null }) {
  return (
    <div className="px-4 py-6 text-[13px] leading-5 text-[#9b9ba6]" data-live-missing>
      <p>Live starts recording once SQL part 477 has run (supabase/sql/run-now/477_platform_live.sql). Creators in /app still show from part 430.</p>
      {reason ? <p className="mt-2 break-words font-mono text-[12px] text-[#7d7d88]" data-live-missing-reason>Supabase answered: {reason}</p> : null}
    </div>
  )
}

function Notes() {
  return (
    <div className="space-y-1 border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#6b6b76]">
      {LIVE_NOTES.map((n) => (
        <p key={n}>{n}</p>
      ))}
    </div>
  )
}

/* ── The view ──────────────────────────────────────────────────────────── */

export function LiveView({ route, go }: { route: Route; go: Go }) {
  if (route.id) return <LiveSessionView sid={route.id} go={go} />
  return (
    <div className="space-y-4">
      <ViewHeader title="Live" meta="Everyone on Storelib, outside /admin. Times are UTC." />
      <Filters
        label="Live view"
        value={route.tab === "activity" ? "activity" : "online"}
        onChange={(t) => go({ tab: t === "online" ? "" : t, filter: "" })}
        options={[
          { id: "online", label: "Online now" },
          { id: "activity", label: "Activity" },
        ]}
      />
      {route.tab === "activity" ? <LiveFeed go={go} /> : <LiveNow area={route.filter} go={go} />}
    </div>
  )
}

function LiveNow({ area, go }: { area: string; go: Go }) {
  const shownArea = isArea(area) ? area : ""
  const { data, error, key } = useLive(shownArea)
  const o = data?.overview ?? null
  const fresh = key === shownArea
  const topNow = o?.countriesNow?.[0] ?? null
  const notRead = data?.missing ? "Not recording until SQL part 477 has run" : "The figure did not come back"

  const columns: Column<LiveSessionRow>[] = [
    { key: "who", label: "Who", width: "minmax(0,1.1fr)", phone: "primary", render: (r) => <span className="inline-flex min-w-0 max-w-full items-center gap-2"><Dot on /><Who who={r.who} /></span> },
    { key: "on", label: "On", width: "minmax(0,1.7fr)", render: (r) => <Place area={r.area} path={r.path} host={r.host} /> },
    { key: "action", label: "Last action", width: "minmax(0,1.2fr)", render: (r) => actionLabel(r) },
    { key: "country", label: "From", width: "minmax(0,0.9fr)", render: (r) => <Country code={r.country} /> },
    { key: "device", label: "Device", width: "minmax(0,1.2fr)", render: (r) => deviceOf(r) },
    { key: "source", label: "Source", width: "minmax(0,0.8fr)", render: (r) => (r.area === "app" ? "" : r.source ?? <span className="text-[#6b6b76]">Direct</span>) },
    { key: "time", label: "On site", width: "84px", align: "right", phone: "end", render: (r) => sessionLength(r.started, r.lastSeen) },
  ]

  return (
    <div className="space-y-4">
      {data ? <ReadNotes problems={data.problems} notices={data.notices} /> : null}
      <Figures
        items={[
          { label: "Online now", value: o && o.online !== null ? num(o.online) : "", sub: o && o.signedIn !== null && o.online !== null ? `${num(o.signedIn)} signed in, ${num(Math.max(0, o.online - o.signedIn))} visitors` : undefined, unreadable: o && o.online === null ? notRead : null },
          { label: "Visits today", value: o && o.today !== null ? num(o.today) : "", sub: o && o.todaySignedIn !== null ? `${num(o.todaySignedIn)} signed in` : undefined, unreadable: o && o.today === null ? notRead : null },
          { label: "Creators in /app", value: o ? num(o.areas.app ?? 0) : "", sub: o && o.creatorsToday !== null ? `${num(o.creatorsToday)} today` : undefined },
          { label: "Top country now", value: topNow ? <span className="inline-flex min-w-0 items-center gap-2"><span aria-hidden>{countryFlag(topNow[0])}</span><span className="truncate">{countryName(topNow[0])}</span></span> : "None yet", sub: topNow ? `${num(topNow[1])} online` : undefined },
        ]}
      />

      <Panel title="By area" meta={o && o.sample < 1 ? `Visitors sampled at ${Math.round(o.sample * 100)}%, scaled` : "Online now"}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" data-live-areas>
          {AREAS.map((a) => {
            const n = o?.areas?.[a] ?? 0
            const max = Math.max(1, ...AREAS.map((x) => o?.areas?.[x] ?? 0))
            const selected = shownArea === a
            return (
              <button
                key={a}
                type="button"
                aria-pressed={selected}
                onClick={() => go({ filter: selected ? "" : a })}
                className={`flex min-h-11 min-w-0 items-center gap-3 border-b border-white/[0.06] px-4 py-2 text-left outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05] sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r ${selected ? "bg-white/[0.05]" : ""}`}
                data-live-area={a}
              >
                <span className={`min-w-0 flex-1 truncate text-[13px] ${selected ? "text-[#ededf0]" : "text-[#c9c9d1]"}`}>{AREA_LABEL[a]}</span>
                <span aria-hidden className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="block h-full rounded-full" style={{ width: `${(n / max) * 100}%`, background: selected ? C.accent : "rgba(237,237,240,0.4)" }} />
                </span>
                <span className="w-10 shrink-0 text-right text-[13px] tabular-nums text-[#ededf0]">{o ? num(n) : ""}</span>
              </button>
            )
          })}
        </div>
        {o && (o.countriesNow.length || o.countriesToday.length) ? (
          <div className="space-y-1 px-4 py-2.5 text-[12px] leading-5 text-[#9b9ba6]" data-live-countries>
            {o.countriesNow.length ? (
              <p className="min-w-0">
                <span className="text-[#6b6b76]">Now </span>
                {o.countriesNow.map(([c, n]) => `${countryFlag(c)} ${countryName(c)} ${num(n)}`).join(", ")}
              </p>
            ) : null}
            {o.countriesToday.length ? (
              <p className="min-w-0">
                <span className="text-[#6b6b76]">Today </span>
                {o.countriesToday.map(([c, n]) => `${countryFlag(c)} ${countryName(c)} ${num(n)}`).join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </Panel>

      <Panel
        title={shownArea ? `Online now, ${AREA_LABEL[shownArea as keyof typeof AREA_LABEL]}` : "Online now"}
        meta={data?.sessions ? `${num(data.sessions.length)}${data.sessions.length >= 100 ? ", most recent" : ""}, refreshed every 30 s` : undefined}
        action={shownArea ? <Button variant="quiet" className="-mr-2 h-10 sm:h-8" onClick={() => go({ filter: "" })}>All areas</Button> : undefined}
      >
        <div data-live-online>
          {data?.missing ? <MissingLive reason={data.missingReason} /> : null}
          {data?.sessions && fresh ? (
            <DataList
              label="Online now"
              columns={columns}
              rows={data.sessions}
              rowKey={(r) => r.id}
              empty={shownArea ? "Nobody in this area right now." : "Nobody is online right now."}
              onOpen={(r) => (r.id.startsWith("app:") ? (r.who.kind === "account" && r.who.creatorId ? go({ view: "creator", id: r.who.creatorId, q: "", filter: "", page: 1 }) : undefined) : go({ id: r.id }))}
            />
          ) : !data?.missing ? (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{error ? `Could not be read. ${error}` : "Reading who is online"}</p>
          ) : null}
        </div>
        <Notes />
      </Panel>
    </div>
  )
}

/* ── One tab ───────────────────────────────────────────────────────────── */

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
}

type Step = { key: string; at: string; kind: "page" | "action"; label: string; area: string; orderId: string | null }

export function LiveSessionView({ sid, go }: { sid: string; go: Go }) {
  const [state, setState] = React.useState<{ sid: string; body: LiveSessionPayload } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (document.visibilityState !== "visible") return
      const got = await readLive<LiveSessionPayload>(`part=session&id=${encodeURIComponent(sid)}`)
      if (cancelled) return
      if (got.body) {
        setState({ sid, body: got.body })
        setError(null)
      } else if (got.error) setError(got.error)
    }
    void read()
    const id = window.setInterval(read, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [sid])

  const body = state?.sid === sid ? state.body : null
  const s = body?.session ?? null
  const steps: Step[] = React.useMemo(() => {
    if (!body) return []
    const out: Step[] = [
      ...body.trail.map((t, i) => ({ key: `p${i}-${t.at}`, at: t.at, kind: "page" as const, label: livePageLabel(t.path, t.area), area: t.area, orderId: null })),
      ...body.actions.map((a) => ({ key: `a${a.id}`, at: a.at, kind: "action" as const, label: a.label, area: a.area, orderId: a.orderId })),
    ]
    return out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at) || (x.kind === "action" ? -1 : 1))
  }, [body])
  const online = s?.lastSeen ? Date.now() - Date.parse(s.lastSeen) <= 2 * 60_000 : false

  return (
    <div className="space-y-4">
      <ViewHeader title={s ? s.who.label : "Session"} meta={s ? (online ? "Online now" : `Last seen ${ago(s.lastSeen)}`) : undefined} back={{ label: "Live", onClick: () => go({ id: "" }) }} />
      {body ? <ReadNotes problems={body.problems} notices={body.notices} /> : null}
      <Panel title="This visit" meta={s ? `Started ${date(s.started)}, ${timeOf(s.started ?? "")} UTC` : undefined}>
        <div data-live-session>
          {!body ? (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{error ? `Could not be read. ${error}` : "Reading this visit"}</p>
          ) : body.missing ? (
            <MissingLive reason={body.missingReason} />
          ) : !s ? (
            <p className="px-4 py-6 text-[13px] text-[#6b6b76]">This visit is no longer kept. A visitor&apos;s pages are kept 7 days.</p>
          ) : (
            <>
              <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-white/[0.06]">
                <div className="min-w-0">
                  <Facts
                    items={[
                      {
                        label: "Who",
                        value:
                          s.who.kind === "account" && s.who.creatorId ? (
                            <LinkText onClick={() => go({ view: "creator", id: (s.who as { creatorId: string }).creatorId, q: "", filter: "", page: 1 })}>{s.who.label}, creator page</LinkText>
                          ) : (
                            s.who.label
                          ),
                      },
                      { label: "Now on", value: <Place area={s.area} path={s.path} host={s.host} /> },
                      { label: "On site", value: `${sessionLength(s.started, s.lastSeen) || "under a minute"}, ${s.pages === 1 ? "1 page" : `${num(s.pages)} pages`}` },
                    ]}
                  />
                </div>
                <div className="min-w-0 border-t border-white/[0.06] lg:border-t-0">
                  <Facts
                    items={[
                      { label: "From", value: <Country code={s.country} /> },
                      { label: "Device", value: deviceOf(s) },
                      { label: "Came from", value: s.source ?? "Direct or unknown" },
                    ]}
                  />
                </div>
              </div>
              {body.orders.length ? (
                <div className="border-t border-white/[0.08] px-4 py-2.5" data-live-orders>
                  <p className="text-[12px] text-[#9b9ba6]">Paid in this visit</p>
                  <ul className="mt-1 space-y-1">
                    {body.orders.map((o) => (
                      <li key={o.id} className="flex min-w-0 items-baseline justify-between gap-3 text-[13px]">
                        <LinkText onClick={() => go({ view: "orders", q: o.id, filter: "", page: 1, id: "" })}>Order {o.id.slice(0, 8)}</LinkText>
                        <span className="shrink-0 tabular-nums text-[#ededf0]">{o.amount !== null ? money(o.amount, (o.currency ?? "usd").toUpperCase()) : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <ol className="border-t border-white/[0.08]" data-live-timeline>
                {steps.length ? (
                  steps.map((e) => (
                    <li key={e.key} className="flex min-w-0 items-baseline gap-3 px-4 py-1.5 text-[13px]" data-row>
                      <span className="w-11 shrink-0 text-[12px] text-[#6b6b76] tabular-nums">{timeOf(e.at)}</span>
                      <span className={e.kind === "page" ? "min-w-0 flex-1 truncate text-[#9b9ba6]" : "min-w-0 flex-1 truncate text-[#ededf0]"}>
                        {e.label}
                        {e.kind === "page" && isArea(e.area) ? <span className="text-[#6b6b76]">, {AREA_LABEL[e.area]}</span> : null}
                      </span>
                      {e.orderId ? (
                        <LinkText onClick={() => go({ view: "orders", q: e.orderId!, filter: "", page: 1, id: "" })}>Order</LinkText>
                      ) : (
                        <span className="shrink-0 text-[12px] text-[#6b6b76]">{e.kind === "page" ? "Page" : "Action"}</span>
                      )}
                    </li>
                  ))
                ) : (
                  <p className="px-4 py-6 text-[13px] text-[#6b6b76]">No pages kept for this visit.</p>
                )}
              </ol>
            </>
          )}
        </div>
        <Notes />
      </Panel>
    </div>
  )
}

/* ── Everyone's actions ────────────────────────────────────────────────── */

const AREA_OPTIONS = [{ id: "all", label: "All areas" }, ...AREAS.filter((a) => a !== "app").map((a) => ({ id: a, label: AREA_LABEL[a] }))]
const ACTION_OPTIONS = [{ id: "all", label: "All actions" }, ...ACTION_FILTERS]

export function LiveFeed({ go }: { go: Go }) {
  const [area, setArea] = React.useState("all")
  const [action, setAction] = React.useState("all")
  const [stack, setStack] = React.useState<string[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [state, setState] = React.useState<{ key: string; body: LiveFeedPayload } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const key = `${area}|${action}|${cursor ?? ""}`

  React.useEffect(() => {
    const controller = new AbortController()
    const q = new URLSearchParams({ part: "feed" })
    if (area !== "all") q.set("area", area)
    if (action !== "all") q.set("action", action)
    if (cursor) q.set("before", cursor)
    void readLive<LiveFeedPayload>(q.toString(), controller.signal).then((got) => {
      if (got.body) {
        setState({ key, body: got.body })
        setError(null)
      } else if (got.error) setError(got.error)
    })
    return () => controller.abort()
  }, [key, area, action, cursor])

  const reset = () => {
    setStack([])
    setCursor(null)
  }
  const body = state?.body ?? null
  const columns: Column<LiveFeedRow>[] = [
    { key: "what", label: "What", width: "minmax(0,1.3fr)", phone: "primary", render: (r) => <span className="text-[#ededf0]">{r.label}</span> },
    { key: "who", label: "Who", width: "minmax(0,1.1fr)", render: (r) => <Who who={r.who} /> },
    { key: "where", label: "Where", width: "minmax(0,1.6fr)", render: (r) => <Place area={r.area} path={r.path} host={r.host} /> },
    { key: "country", label: "From", width: "minmax(0,0.9fr)", render: (r) => <Country code={r.country} /> },
    { key: "when", label: "When", width: "96px", align: "right", phone: "end", render: (r) => ago(r.at) },
  ]
  return (
    <div className="space-y-3">
      <Filters label="Filter by area" value={area} onChange={(a) => { setArea(a); reset() }} options={AREA_OPTIONS} />
      <Filters label="Filter by action" value={action} onChange={(a) => { setAction(a); reset() }} options={ACTION_OPTIONS} />
      <Panel title="Activity" meta="Everyone's actions across Storelib, newest first">
        <div data-live-feed>
          {body?.missing ? (
            <MissingLive reason={body.missingReason} />
          ) : body?.rows ? (
            <>
              <DataList label="Everyone's actions" columns={columns} rows={body.rows} rowKey={(r) => String(r.id)} empty="Nothing recorded for this filter in the last 30 days." onOpen={(r) => go({ id: r.sid })} />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2">
                <p className="text-[12px] text-[#6b6b76] tabular-nums">{stack.length ? `Page ${stack.length + 1}` : "Newest"}</p>
                <div className="flex gap-1.5">
                  <Button
                    variant="quiet"
                    className="h-10 sm:h-8"
                    disabled={!stack.length}
                    onClick={() => {
                      setCursor(stack[stack.length - 1] || null)
                      setStack(stack.slice(0, -1))
                    }}
                  >
                    Newer
                  </Button>
                  <Button
                    variant="quiet"
                    className="h-10 sm:h-8"
                    disabled={!body.next}
                    onClick={() => {
                      setStack((s) => [...s, cursor ?? ""])
                      setCursor(body.next)
                    }}
                  >
                    Older
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{error ? `Could not be read. ${error}` : "Reading activity"}</p>
          )}
        </div>
        <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#6b6b76]">What creators do in /app and the website editor is under Creators, Activity.</p>
      </Panel>
    </div>
  )
}
