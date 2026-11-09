"use client"

import { displayEmail } from "@/lib/businesses/email-alias"
import * as React from "react"

import type { Stats, TraceDelivery, TraceEvent, TraceJob } from "@/lib/notify/admin-trace"
import { NOTIFICATION_TYPES } from "@/lib/notify/types"

import { ago, num } from "../_console/format"
import { Banner, DataList, Figures, Filters, Panel, Placeholder, SearchField, Status, Toolbar, type Column } from "../_console/ui"

/**
 * ===========================================================================
 *  NOTIFICATIONS, TRACED AND COUNTED, ON THE CONSOLE'S DARK SURFACE
 * ===========================================================================
 * Two views of /api/admin/notifications:
 *
 *   TRACE    a search box (an address, a user, job, event or delivery id, an
 *            event key, a Mailgun message id, a type) and filters by type and
 *            job state. Each event is a panel; under it its jobs, and under
 *            each job its deliveries, one line each. Addresses are masked in
 *            everything the server sends back.
 *   COUNTS   7 or 30 days: the statuses across every type, the types
 *            failing most, onboarding reminders and how many did the task
 *            within three days, and why jobs were skipped.
 *
 * The console's own primitives (app/admin/_console/ui.tsx): one hairline for
 * every edge, a dot of colour beside a status and nowhere else.
 */

type View = "trace" | "counts"
type Trace = { events: TraceEvent[]; jobs: number } | { unavailable: string } | null
type Counts = { stats: Stats } | { unavailable: string } | null

const STATES = [
  { id: "", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "sent", label: "Sent" },
  { id: "skipped", label: "Skipped" },
  { id: "failed", label: "Failed" },
  { id: "cancelled", label: "Cancelled" },
] as const

/** The console's tone, with the words a delivery uses. */
function statusOf(s: string): string {
  if (s === "delivered") return "completed"
  if (s === "bounced" || s === "complained") return "failed"
  if (s === "processing" || s === "retry" || s === "unknown") return "pending"
  return s
}

const when = (iso: string | null) => (iso ? ago(iso) : "")
const pct = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`)

async function read<T>(url: string): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store" })
    if (res.status === 401) {
      window.location.reload()
      return { error: "Signed out." }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) return { error: (body && typeof body.error === "string" && body.error) || "That could not be read." }
    return body as T
  } catch {
    return { error: "Could not reach Storelib." }
  }
}

export function NotificationsAdmin() {
  const [view, setView] = React.useState<View>("trace")
  const [q, setQ] = React.useState("")
  const [type, setType] = React.useState("")
  const [state, setState] = React.useState<(typeof STATES)[number]["id"]>("")
  const [days, setDays] = React.useState<"7" | "30">("7")
  const [trace, setTrace] = React.useState<Trace>(null)
  const [counts, setCounts] = React.useState<Counts>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  /* The trace reads again a moment after typing stops, and at once on a filter. */
  const [debounced, setDebounced] = React.useState("")
  React.useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 400)
    return () => window.clearTimeout(t)
  }, [q])

  React.useEffect(() => {
    if (view !== "trace") return
    let live = true
    setBusy(true)
    const p = new URLSearchParams({ view: "trace" })
    if (debounced) p.set("q", debounced)
    if (type) p.set("type", type)
    if (state) p.set("state", state)
    void read<Trace>(`/api/admin/notifications?${p}`).then((r) => {
      if (!live) return
      setBusy(false)
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setTrace(r)
      }
    })
    return () => {
      live = false
    }
  }, [view, debounced, type, state])

  React.useEffect(() => {
    if (view !== "counts") return
    let live = true
    setBusy(true)
    void read<Counts>(`/api/admin/notifications?view=stats&days=${days}`).then((r) => {
      if (!live) return
      setBusy(false)
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setCounts(r)
      }
    })
    return () => {
      live = false
    }
  }, [view, days])

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [font-family:Inter,system-ui,sans-serif]" data-admin-notifications="">
      <div className={`fixed inset-x-0 top-0 z-50 h-[2px] bg-[#8b5cf6] transition-opacity duration-200 ${busy ? "opacity-60" : "opacity-0"}`} aria-hidden />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-8 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0]">
          Console
        </a>
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Notifications</h1>
            <p className="mt-0.5 text-[13px] text-[#9b9ba6]">What the notification engine planned, sent and skipped, and why.</p>
          </div>
          <Filters
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: "trace", label: "Trace" },
              { id: "counts", label: "Counts" },
            ]}
          />
        </div>

        {error ? (
          <div className="mb-4">
            <Banner tone="bad" onClose={() => setError(null)}>
              {error}
            </Banner>
          </div>
        ) : null}

        {view === "trace" ? (
          <div className="space-y-4">
            <Toolbar>
              <SearchField value={q} onChange={setQ} label="Search" placeholder="Email, user id, event key, job id, message id" />
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <label className="relative">
                  <span className="sr-only">Type</span>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="h-9 max-w-[220px] rounded-[8px] border border-white/[0.1] bg-[#0b0b0f] px-2.5 text-[13px] text-[#ededf0] outline-none focus:border-[#8b5cf6]/70"
                  >
                    <option value="">Every type</option>
                    {NOTIFICATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <Filters label="Job state" value={state} onChange={setState} options={[...STATES]} />
              </div>
            </Toolbar>
            {trace === null ? (
              <Placeholder rows={5} />
            ) : "unavailable" in trace ? (
              <Panel>
                <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{trace.unavailable}</p>
              </Panel>
            ) : trace.events.length === 0 ? (
              <Panel>
                <p className="px-4 py-8 text-center text-[13px] text-[#6b6b76]">{debounced ? "Nothing matches that." : "No notifications yet."}</p>
              </Panel>
            ) : (
              <>
                <p className="text-[12px] text-[#6b6b76]">
                  {trace.jobs === 25 ? "The newest 25 jobs." : `${num(trace.jobs)} ${trace.jobs === 1 ? "job" : "jobs"}.`}
                </p>
                {trace.events.map((e) => (
                  <EventPanel key={e.id ?? "none"} event={e} />
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Filters
              label="Days"
              value={days}
              onChange={setDays}
              options={[
                { id: "7", label: "7 days" },
                { id: "30", label: "30 days" },
              ]}
            />
            {counts === null ? <Placeholder rows={6} /> : "unavailable" in counts ? (
              <Panel>
                <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{counts.unavailable}</p>
              </Panel>
            ) : (
              <CountsView stats={counts.stats} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function EventPanel({ event }: { event: TraceEvent }) {
  return (
    <Panel
      title={event.name ?? "No event"}
      meta={[event.key, event.occurredAt ? when(event.occurredAt) : null, event.processedAt ? "processed" : event.id ? "not processed yet" : null].filter(Boolean).join(" · ")}
    >
      {event.lastError ? <p className="border-b border-white/[0.08] px-4 py-2 text-[12px] text-[#f47067]">{event.lastError}</p> : null}
      <ul className="divide-y divide-white/[0.06]">
        {event.jobs.map((j) => (
          <JobRow key={j.id} job={j} />
        ))}
      </ul>
    </Panel>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === "") return null
  return (
    <span className="min-w-0 whitespace-nowrap">
      <span className="text-[#6b6b76]">{label} </span>
      <span className="text-[#c9c9d1]">{children}</span>
    </span>
  )
}

function JobRow({ job }: { job: TraceJob }) {
  return (
    <li className="px-4 py-3" data-trace-job={job.id}>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-[13px] font-medium text-[#ededf0]">{job.type}</span>
        <Status value={statusOf(job.state)} label={job.skipReason ? `${job.state}: ${job.skipReason}` : job.state} />
        <span className="text-[12px] text-[#9b9ba6]">{displayEmail(job.recipient) ?? job.recipient}</span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-0.5 text-[12px]">
        <Fact label="run at">{job.runAt ? new Date(job.runAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null}</Fact>
        <Fact label="attempts">{job.maxAttempts ? `${job.attempts} of ${job.maxAttempts}` : job.attempts}</Fact>
        <Fact label="workflow">{job.workflow ? `${job.workflow}${job.step ? ` / ${job.step}` : ""}` : null}</Fact>
        <Fact label="sent">{when(job.sentAt)}</Fact>
        <Fact label="job">
          <span className="font-mono text-[11.5px]">{job.id.slice(0, 8)}</span>
        </Fact>
        <Fact label="data">{job.dataKeys.length ? job.dataKeys.join(", ") : null}</Fact>
      </div>
      {job.lastError ? <p className="mt-1 text-[12px] text-[#f47067] [overflow-wrap:anywhere]">{job.lastError}</p> : null}
      {job.deliveries.length ? (
        <ul className="mt-2 space-y-1 border-l border-white/[0.08] pl-3">
          {job.deliveries.map((d) => (
            <DeliveryLine key={d.id} delivery={d} />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

function DeliveryLine({ delivery: d }: { delivery: TraceDelivery }) {
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]" data-trace-delivery={d.id}>
      <span className="w-12 shrink-0 text-[#9b9ba6]">{d.channel === "in_app" ? "In app" : d.channel}</span>
      <Status value={statusOf(d.status)} label={d.status} />
      <Fact label="via">{d.provider}</Fact>
      <Fact label="id">{d.providerMessageId ? <span className="font-mono text-[11.5px]">{d.providerMessageId.slice(0, 40)}</span> : null}</Fact>
      <Fact label="tries">{d.attempts > 1 ? d.attempts : null}</Fact>
      <Fact label="sent">{when(d.sentAt)}</Fact>
      <Fact label="delivered">{when(d.deliveredAt)}</Fact>
      <Fact label="opened">{when(d.openedAt)}</Fact>
      <Fact label="clicked">{when(d.clickedAt)}</Fact>
      <Fact label="failed">{when(d.failedAt)}</Fact>
      <Fact label="complained">{when(d.complainedAt)}</Fact>
      <Fact label="unsubscribed">{when(d.unsubscribedAt)}</Fact>
      {d.failureReason || d.skipReason ? <span className="basis-full text-[#f47067] [overflow-wrap:anywhere]">{d.failureReason ?? d.skipReason}</span> : null}
    </li>
  )
}

function CountsView({ stats }: { stats: Stats }) {
  const t = stats.totals
  const byType: Column<Stats["byType"][number]>[] = [
    { key: "type", label: "Type", width: "minmax(0,2.2fr)", phone: "primary", render: (r) => r.type },
    ...(["queued", "sent", "delivered", "failed", "bounced", "opened", "clicked", "unsubscribed", "complained"] as const).map((k) => ({
      key: k,
      label: k.charAt(0).toUpperCase() + k.slice(1),
      width: "minmax(0,1fr)",
      align: "right" as const,
      phone: "secondary" as const,
      render: (r: Stats["byType"][number]) => (
        <span>
          <span className="lg:hidden text-[#6b6b76]">{k} </span>
          {num(r.counts[k])}
        </span>
      ),
    })),
  ]
  return (
    <>
      <Figures
        columns={5}
        items={[
          { label: "Queued", value: num(t.queued) },
          { label: "Sent", value: num(t.sent) },
          { label: "Delivered", value: num(t.delivered) },
          { label: "Failed", value: num(t.failed) },
          { label: "Bounced", value: num(t.bounced) },
          { label: "Opened", value: num(t.opened) },
          { label: "Clicked", value: num(t.clicked) },
          { label: "Unsubscribed", value: num(t.unsubscribed) },
          { label: "Complained", value: num(t.complained) },
          { label: "Skipped", value: num(stats.skipReasons.reduce((a, s) => a + s.count, 0)) },
        ]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Failing most" meta={`last ${stats.days} days`}>
          <DataList
            label="Failing most"
            rows={stats.topFailing}
            rowKey={(r) => r.type}
            empty="Nothing failed."
            columns={[
              { key: "type", label: "Type", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.type },
              { key: "failed", label: "Failed or bounced", width: "minmax(0,1fr)", align: "right", render: (r) => num(r.failed) },
              { key: "rate", label: "Rate", width: "72px", align: "right", phone: "end", render: (r) => pct(r.rate) },
            ]}
          />
        </Panel>
        <Panel title="Onboarding reminders" meta="did the task within 3 days">
          <DataList
            label="Onboarding reminders"
            rows={stats.lifecycle}
            rowKey={(r) => r.type}
            empty="No reminders sent."
            columns={[
              { key: "type", label: "Reminder", width: "minmax(0,2fr)", phone: "primary", render: (r) => r.type },
              { key: "reminded", label: "Reached", width: "minmax(0,1fr)", align: "right", render: (r) => num(r.reminded) },
              { key: "done", label: "Did it", width: "minmax(0,1fr)", align: "right", render: (r) => `${num(r.completed)} of ${num(r.settled)}` },
              { key: "rate", label: "Share", width: "64px", align: "right", phone: "end", render: (r) => pct(r.rate) },
            ]}
          />
          <p className="border-t border-white/[0.08] px-4 py-2 text-[12px] text-[#6b6b76]">
            Counted once three days have passed since the reminder.
          </p>
        </Panel>
      </div>
      <Panel title="By type" meta={`last ${stats.days} days`}>
        <DataList label="By type" rows={stats.byType} rowKey={(r) => r.type} empty="Nothing sent in these days." columns={byType} />
      </Panel>
      <Panel title="Skipped, by reason">
        <DataList
          label="Skipped, by reason"
          rows={stats.skipReasons}
          rowKey={(r) => r.reason}
          empty="Nothing skipped."
          columns={[
            { key: "reason", label: "Reason", width: "minmax(0,3fr)", phone: "primary", render: (r) => r.reason },
            { key: "count", label: "Jobs", width: "minmax(0,1fr)", align: "right", phone: "end", render: (r) => num(r.count) },
          ]}
        />
      </Panel>
    </>
  )
}
