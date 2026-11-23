"use client"

import * as React from "react"

import { ACTION_GROUPS, ONLINE_MS, countryFlag, countryName, describeEvent, deviceLabel, groupSessions, isOnline, pageLabel, type TimelineEvent } from "@/lib/activity/creator-activity"
import type { ActivityFeedRow, ActivityPayload, CreatorActivityPayload, PresenceRow } from "@/lib/admin/types"

import { ago, date, num } from "./format"
import type { Route } from "./nav-state"
import { Button, C, DataList, Facts, Filters, LinkText, Panel, type Column } from "./ui"

/**
 * ===========================================================================
 *  CREATOR ACTIVITY: THE LINE, WHO IS ONLINE, EVERYONE'S FEED, ONE CREATOR
 * ===========================================================================
 * Read from /api/admin/platform/activity (lib/admin/views/activity.ts), behind
 * the same admin cookie as every other view.
 *
 * WHY POLLING AND NOT REALTIME. The online list is read every 30 seconds
 * while this tab is visible and never while it is hidden: 120 small reads an
 * hour for the one person who has /admin open, each three head counts and
 * one list of at most 100 rows on an index. A Realtime broadcast would need
 * the server to publish every creator's batch whether anyone is watching or
 * not: with 100 creators online, about 6,000 messages an hour, for a list
 * that changes once a minute per person anyway (that is how often a batch
 * arrives). Polling costs what the admin looks at, not what creators do.
 */

type Go = (r: Partial<Route>) => void
const POLL_MS = 30_000
const ONLINE_MINUTES = Math.round(ONLINE_MS / 60_000)

export const DEFINITIONS = {
  online: `Online now: something arrived from them in the last ${ONLINE_MINUTES} minutes. A tab left open in the background stops counting after that.`,
  live: "Live on Storelib: the first day they had a product on sale (the day that product was added) or a website published, whichever came first.",
  active: "Last active: the last time their open Storelib tab checked in, at most once a minute.",
  kept: "Pages and actions are kept for 30 days. Typed text, field values and IP addresses are never recorded.",
}

async function readActivity<T>(query: string, signal?: AbortSignal): Promise<{ body: T | null; error: string | null }> {
  try {
    const res = await fetch(`/api/admin/platform/activity?${query}`, { cache: "no-store", signal })
    if (res.status === 401) {
      window.location.reload()
      return { body: null, error: null }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok || !body) return { body: null, error: body?.error || "Activity could not be read." }
    return { body: body as T, error: null }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return { body: null, error: null }
    return { body: null, error: "Could not reach the server." }
  }
}

/** Who is online and the line's three counts, every 30 seconds while the tab is visible. */
export function useOnlineActivity(): { data: ActivityPayload | null; error: string | null } {
  const [data, setData] = React.useState<ActivityPayload | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    const read = async () => {
      if (document.visibilityState !== "visible") return
      const got = await readActivity<ActivityPayload>("part=online")
      if (cancelled) return
      if (got.body) {
        setData(got.body)
        setError(null)
      } else if (got.error) setError(got.error)
    }
    void read()
    const id = window.setInterval(read, POLL_MS)
    /* Back on the tab after a while: read now rather than at the next tick. */
    const onVisible = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      cancelled = true
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])
  return { data, error }
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

export function MissingNote({ reason }: { reason?: string | null }) {
  return (
    <div className="px-4 py-6 text-[13px] leading-5 text-[#9b9ba6]" data-activity-missing>
      <p>Activity starts recording once SQL part 430 has run (supabase/sql/run-now/430_creator_activity.sql). Nothing is lost until then except the activity itself.</p>
      {reason ? <p className="mt-2 break-words font-mono text-[12px] text-[#7d7d88]" data-activity-missing-reason>Supabase answered: {reason}</p> : null}
    </div>
  )
}

function timeOf(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
}

/* ── The line at the top of Creators ───────────────────────────────────── */

export function ActivityLine({ data, live }: { data: ActivityPayload | null; live?: number | null }) {
  const s = data?.summary
  const parts: string[] = []
  if (data?.missing) parts.push("Activity is not recording yet")
  else if (s) {
    if (s.onlineNow !== null) parts.push(`${num(s.onlineNow)} online now`)
    if (s.activeToday !== null) parts.push(`${num(s.activeToday)} active today`)
    if (s.live !== null) parts.push(`${num(s.live)} live on Storelib`)
  }
  if (typeof live === "number") parts.push(`${num(live)} visitors on creators' pages now`)
  return (
    <p className="flex min-h-5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#c9c9d1] tabular-nums" data-activity-line>
      {parts.length ? (
        parts.map((p, i) => (
          <span key={p} className="inline-flex items-center gap-1.5 whitespace-nowrap">
            {i === 0 && s && !data?.missing ? <Dot on={(s.onlineNow ?? 0) > 0} /> : null}
            {p}
          </span>
        ))
      ) : (
        <span className="text-[#6b6b76]">Reading activity</span>
      )}
    </p>
  )
}

/* ── Online now ────────────────────────────────────────────────────────── */

export function OnlineList({ data, error, go }: { data: ActivityPayload | null; error: string | null; go: Go }) {
  const open = (r: PresenceRow) => (r.creator ? go({ view: "creator", id: r.creator.id, q: "", filter: "", page: 1 }) : undefined)
  const columns: Column<PresenceRow>[] = [
    { key: "who", label: "Creator", width: "minmax(0,1.3fr)", phone: "primary", render: (r) => (r.creator ? <span className="inline-flex min-w-0 max-w-full items-center gap-2"><Dot on /><span className="truncate">{r.creator.name}</span></span> : "Unknown") },
    { key: "page", label: "On", width: "minmax(0,1.2fr)", render: (r) => (r.lastPath ? pageLabel(r.lastPath) : "") },
    { key: "action", label: "Last action", width: "minmax(0,1.4fr)", render: (r) => (r.lastAction ? `${describeEvent({ kind: "action", name: r.lastAction })}, ${ago(r.lastActionAt)}` : "") },
    { key: "country", label: "Country", width: "minmax(0,0.9fr)", render: (r) => <Country code={r.country} /> },
    { key: "device", label: "Device", width: "minmax(0,1.1fr)", render: (r) => deviceLabel(r) },
    { key: "seen", label: "Seen", width: "76px", align: "right", phone: "end", render: (r) => ago(r.lastSeen) },
  ]
  return (
    <Panel title="Online now" meta={data?.online ? `${num(data.online.length)}${data.online.length >= 100 ? ", most recent" : ""}, refreshed every 30 s` : undefined}>
      <div data-activity-online>
        {data?.missing ? (
          <MissingNote reason={data.missingReason} />
        ) : data?.online ? (
          <DataList label="Creators online now" columns={columns} rows={data.online} rowKey={(r) => r.userId} empty="Nobody is online right now." onOpen={open} />
        ) : (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{error ? `Could not be read. ${error}` : "Reading who is online"}</p>
        )}
      </div>
      <p className="border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#6b6b76]">{DEFINITIONS.online}</p>
    </Panel>
  )
}

/* ── Everyone's feed ───────────────────────────────────────────────────── */

const FEED_OPTIONS = [{ id: "all", label: "All" }, { id: "pages", label: "Pages" }, { id: "actions", label: "Actions" }, ...ACTION_GROUPS]

export function ActivityFeed({ go }: { go: Go }) {
  const [filter, setFilter] = React.useState("all")
  /* The cursors of the pages before this one, so Newer goes back without a count. */
  const [stack, setStack] = React.useState<string[]>([])
  const [cursor, setCursor] = React.useState<string | null>(null)
  const [state, setState] = React.useState<{ key: string; body: ActivityPayload } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const key = `${filter}|${cursor ?? ""}`

  React.useEffect(() => {
    const controller = new AbortController()
    const q = new URLSearchParams({ part: "feed", filter })
    if (cursor) q.set("before", cursor)
    void readActivity<ActivityPayload>(q.toString(), controller.signal).then((got) => {
      if (got.body) {
        setState({ key, body: got.body })
        setError(null)
      } else if (got.error) setError(got.error)
    })
    return () => controller.abort()
  }, [key, filter, cursor])

  const feed = state?.body.feed ?? null
  const columns: Column<ActivityFeedRow>[] = [
    { key: "what", label: "What", width: "minmax(0,2fr)", phone: "primary", render: (r) => <span className={r.kind === "action" ? "text-[#ededf0]" : undefined}>{r.label}</span> },
    { key: "kind", label: "Kind", width: "72px", render: (r) => <span className="text-[#6b6b76]">{r.kind === "action" ? "Action" : "Page"}</span> },
    {
      key: "who",
      label: "Creator",
      width: "minmax(0,1.2fr)",
      render: (r) => (r.creator ? <LinkText onClick={() => go({ view: "creator", id: r.creator!.id, q: "", filter: "", page: 1 })}>{r.creator.handle ? `@${r.creator.handle}` : r.creator.name}</LinkText> : "Unknown"),
    },
    { key: "when", label: "When", width: "96px", align: "right", phone: "end", render: (r) => ago(r.at) },
  ]
  return (
    <div className="space-y-3">
      <Filters
        label="Filter activity"
        value={filter}
        onChange={(f) => {
          setFilter(f)
          setStack([])
          setCursor(null)
        }}
        options={FEED_OPTIONS}
      />
      <Panel title="Activity" meta="Every creator, newest first">
        <div data-activity-feed>
          {state?.body.missing ? (
            <MissingNote reason={state.body.missingReason} />
          ) : feed ? (
            <>
              <DataList label="Creator activity" columns={columns} rows={feed.rows} rowKey={(r) => String(r.id)} empty="Nothing recorded for this filter in the last 30 days." onOpen={(r) => (r.creator ? go({ view: "creator", id: r.creator.id, q: "", filter: "", page: 1 }) : undefined)} />
              <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] px-4 py-2">
                <p className="text-[12px] text-[#6b6b76] tabular-nums">{stack.length ? `Page ${stack.length + 1}` : "Newest"}</p>
                <div className="flex gap-1.5">
                  <Button
                    variant="quiet"
                    className="h-10 sm:h-8"
                    disabled={!stack.length}
                    onClick={() => {
                      const prev = stack.slice(0, -1)
                      setCursor(stack[stack.length - 1] || null)
                      setStack(prev)
                    }}
                  >
                    Newer
                  </Button>
                  <Button
                    variant="quiet"
                    className="h-10 sm:h-8"
                    disabled={!feed.next}
                    onClick={() => {
                      setStack((s) => [...s, cursor ?? ""])
                      setCursor(feed.next)
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
      </Panel>
    </div>
  )
}

/* ── One creator ───────────────────────────────────────────────────────── */

export function CreatorActivityPanel({ creatorId }: { creatorId: string }) {
  const [body, setBody] = React.useState<CreatorActivityPayload | null>(null)
  const [older, setOlder] = React.useState<CreatorActivityPayload["timeline"]>([])
  const [next, setNext] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    setBody(null)
    setOlder([])
    void readActivity<CreatorActivityPayload>(`part=creator&id=${encodeURIComponent(creatorId)}`, controller.signal).then((got) => {
      if (got.body) {
        setBody(got.body)
        setNext(got.body.next)
      } else if (got.error) setError(got.error)
    })
    return () => controller.abort()
  }, [creatorId])

  const more = async () => {
    if (!next || busy) return
    setBusy(true)
    const got = await readActivity<CreatorActivityPayload>(`part=creator&id=${encodeURIComponent(creatorId)}&before=${encodeURIComponent(next)}`)
    setBusy(false)
    if (got.body) {
      const seen = new Set([...(body?.timeline ?? []), ...older].map((t) => t.id))
      setOlder((o) => [...o, ...got.body!.timeline.filter((t) => !seen.has(t.id))])
      setNext(got.body.next)
    } else if (got.error) setError(got.error)
  }

  const p = body?.presence ?? null
  const online = isOnline(p?.lastSeen)
  const sessions = React.useMemo(() => groupSessions([...(body?.timeline ?? []), ...older] as TimelineEvent[]), [body, older])

  return (
    <Panel title="Activity" meta="In /app and the website editor" id="activity">
      <div data-activity-card>
        {!body ? (
          <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{error ? `Could not be read. ${error}` : "Reading activity"}</p>
        ) : body.missing ? (
          <MissingNote reason={body.missingReason} />
        ) : (
          <>
            <div className="grid min-w-0 grid-cols-1 lg:grid-cols-2 lg:divide-x lg:divide-white/[0.06]">
              <div className="min-w-0">
              <Facts
                items={[
                  { label: "Live on Storelib since", value: body.liveSince ? date(body.liveSince) : "Not live yet" },
                  {
                    label: "Last active",
                    value: p?.lastSeen ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Dot on={online} />
                        {online ? "Online now" : ago(p.lastSeen)}
                      </span>
                    ) : (
                      "Not seen since recording started"
                    ),
                  },
                  { label: "Now on", value: p?.lastPath ? pageLabel(p.lastPath) : "" },
                  { label: "Sessions", value: body.sessions7 === null || body.sessions30 === null ? "Could not be read" : `${num(body.sessions7)} in 7 days, ${num(body.sessions30)} in 30` },
                ]}
              />
              </div>
              <div className="min-w-0 border-t border-white/[0.06] lg:border-t-0">
              <Facts
                items={[
                  { label: "Country", value: <Country code={p?.country ?? null} /> },
                  { label: "Device", value: p ? deviceLabel(p) : "" },
                  ...(body.places.length > 1 ? [{ label: "Also seen on", value: body.places.slice(1, 4).map((pl) => [countryName(pl.country), deviceLabel(pl)].filter(Boolean).join(", ")).join("; ") }] : []),
                ]}
              />
              </div>
            </div>

            <div className="border-t border-white/[0.08]">
              {sessions.length ? (
                sessions.map((s) => (
                  <div key={`${s.start}-${s.events[0]?.id}`} className="border-b border-white/[0.06] last:border-b-0" data-activity-session>
                    <p className="flex items-baseline justify-between gap-3 bg-white/[0.02] px-4 py-2 text-[12px] text-[#9b9ba6] tabular-nums">
                      <span className="truncate">
                        {date(s.start)}, {timeOf(s.start)} to {timeOf(s.end)} UTC
                      </span>
                      <span className="shrink-0 text-[#6b6b76]">{s.events.length === 1 ? "1 event" : `${s.events.length} events`}</span>
                    </p>
                    <ol>
                      {s.events.map((e) => (
                        <li key={e.id} className="flex min-w-0 items-baseline gap-3 px-4 py-1.5 text-[13px]" data-row>
                          <span className="w-11 shrink-0 text-[12px] text-[#6b6b76] tabular-nums">{timeOf(e.at)}</span>
                          <span className={e.kind === "page" ? "min-w-0 flex-1 truncate text-[#9b9ba6]" : "min-w-0 flex-1 truncate text-[#ededf0]"}>{e.label}</span>
                          <span className="shrink-0 text-[12px] text-[#6b6b76]">{e.kind === "page" ? "Page" : e.kind === "action" ? "Action" : "Saved"}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))
              ) : (
                <p className="px-4 py-6 text-[13px] text-[#6b6b76]">Nothing recorded in the last 30 days.</p>
              )}
            </div>
            {next ? (
              <div className="border-t border-white/[0.08] px-4 py-2">
                <Button variant="quiet" className="-ml-3 h-10 sm:h-8" disabled={busy} onClick={() => void more()}>
                  {busy ? "Reading" : "Show older"}
                </Button>
              </div>
            ) : null}
            <div className="space-y-1 border-t border-white/[0.08] px-4 py-2.5 text-[12px] leading-4 text-[#6b6b76]">
              <p>{DEFINITIONS.live}</p>
              <p>{DEFINITIONS.online}</p>
              <p>{DEFINITIONS.kept}</p>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
