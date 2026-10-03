"use client"

import * as React from "react"

import { ago, date, money, num } from "../_console/format"
import { Banner, Button, ConfirmDialog, DataList, Facts, Figures, Filters, Pager, Panel, Placeholder, SearchField, Status, TextArea, Toolbar, cx, type Column, type FigureItem } from "../_console/ui"

/**
 * ===========================================================================
 *  COMMUNITIES, FOR THE WHOLE OF STORELIB, ON THE CONSOLE'S DARK SURFACE
 * ===========================================================================
 * The switch first, because it is the one thing on this page that changes
 * every creator's and every member's Storelib at once. Turning it on is one
 * press; turning it off asks first and says what it does and what it keeps.
 * POST /api/admin/flags, the same route every platform switch uses.
 *
 * Then the figures, each counted from rows by /api/admin/communities, and
 * two lists: every community (search, filters, a page at a time; a row
 * opens what can be done to it) and the reports members escalated to
 * Storelib, which say what was reported and why and never show the
 * reported content.
 *
 * The console's own primitives (app/admin/_console/ui.tsx): one hairline for
 * every edge, a dot of colour beside a status and nowhere else.
 */

type Figure = { value: number; unreadable?: undefined } | { value: null; unreadable: string }

interface Totals {
  communities: Figure
  published: Figure
  paid: Figure
  free: Figure
  activeMembers30d: Figure
  revenue30dCents: Figure
  revenueCurrency: string | null
  openReports: Figure
  escalatedReports: Figure
  failedJobs: Figure
}

export interface AdminCommunity {
  id: string
  slug: string
  name: string
  status: string
  visibility: string
  access: string
  memberCount: number
  postCount: number
  platformHidden: boolean
  suspendedAt: string | null
  suspendedReason: string | null
  createdAt: string
  creator: { id: string | null; name: string | null; username: string | null }
}

export interface AdminReport {
  id: string
  community: { id: string; name: string; slug: string } | null
  targetType: string
  reason: string
  status: string
  createdAt: string
  resolvedAt: string | null
}

type Paged<T> = { rows: T[]; total: number; page: number; pages: number } | { unavailable: string }

export interface OverviewAnswer {
  enabled: boolean
  totals: Totals
  list: Paged<AdminCommunity>
}

type View = "communities" | "reports"
type ListFilter = "all" | "published" | "draft" | "suspended" | "hidden" | "archived"

const FILTERS: { id: ListFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Draft" },
  { id: "suspended", label: "Suspended" },
  { id: "hidden", label: "Hidden" },
  { id: "archived", label: "Archived" },
]

export const SWITCH_DESCRIPTION = "Enable communities, memberships, member feeds, events and community discovery across Storelib."

const TARGET_WORDS: Record<string, string> = { post: "A post", comment: "A comment", member: "A member", message: "A chat message" }
const REASON_WORDS: Record<string, string> = { spam: "Spam", abuse: "Abuse", harassment: "Harassment", off_topic: "Off topic", illegal: "Illegal", other: "Other" }
const ACCESS_WORDS: Record<string, string> = { free: "Free", paid: "Paid", invite_only: "Invite only", product: "With a product", custom: "Custom" }

async function call<T>(url: string, init?: RequestInit): Promise<T | { error: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init })
    if (res.status === 401) {
      window.location.reload()
      return { error: "Signed out." }
    }
    const body = await res.json().catch(() => null)
    if (!res.ok) return { error: (body && typeof body.error === "string" && body.error) || "That did not work." }
    return body as T
  } catch {
    return { error: "Could not reach Storelib." }
  }
}

const post = (url: string, body: unknown) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

/** Where a community's own page is, for everyone. */
export const publicPath = (slug: string) => `/community/${encodeURIComponent(slug)}`

export function CommunitiesAdmin({ initial }: { initial?: OverviewAnswer | null } = {}) {
  const [enabled, setEnabled] = React.useState<boolean | null>(initial ? initial.enabled : null)
  const [totals, setTotals] = React.useState<Totals | null>(initial ? initial.totals : null)
  const [list, setList] = React.useState<Paged<AdminCommunity> | null>(initial ? initial.list : null)
  const [reports, setReports] = React.useState<Paged<AdminReport> | null>(null)
  const [view, setView] = React.useState<View>("communities")
  const [q, setQ] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [filter, setFilter] = React.useState<ListFilter>("all")
  const [page, setPage] = React.useState(1)
  const [reportPage, setReportPage] = React.useState(1)
  const [error, setError] = React.useState<string | null>(null)
  const [said, setSaid] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [open, setOpen] = React.useState<AdminCommunity | null>(null)
  const [reload, setReload] = React.useState(0)
  const skipFirst = React.useRef(Boolean(initial))

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(q.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [q])

  React.useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    let live = true
    setBusy(true)
    const p = new URLSearchParams({ view: "overview", filter, page: String(page) })
    if (debounced) p.set("q", debounced)
    void call<OverviewAnswer>(`/api/admin/communities?${p}`).then((r) => {
      if (!live) return
      setBusy(false)
      if ("error" in r) setError(r.error)
      else {
        setEnabled(r.enabled)
        setTotals(r.totals)
        setList(r.list)
      }
    })
    return () => {
      live = false
    }
  }, [debounced, filter, page, reload])

  React.useEffect(() => {
    if (view !== "reports") return
    let live = true
    setBusy(true)
    void call<{ reports: Paged<AdminReport> }>(`/api/admin/communities?view=reports&page=${reportPage}`).then((r) => {
      if (!live) return
      setBusy(false)
      if ("error" in r) setError(r.error)
      else setReports(r.reports)
    })
    return () => {
      live = false
    }
  }, [view, reportPage])

  const escalated = totals?.escalatedReports.value ?? null

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-[#ededf0] [color-scheme:dark] [font-family:Inter,system-ui,sans-serif]" data-admin-communities="">
      <div className={cx("fixed inset-x-0 top-0 z-50 h-[2px] bg-[#8b5cf6] transition-opacity duration-200", busy ? "opacity-60" : "opacity-0")} aria-hidden />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-5 sm:px-6 lg:px-8 lg:pt-7">
        <a href="/admin" className="-ml-2 mb-1 inline-flex h-10 items-center rounded-[7px] px-2 text-[13px] text-[#9b9ba6] hover:bg-white/[0.04] hover:text-[#ededf0] sm:h-8">
          Console
        </a>
        <div className="mb-5 min-w-0">
          <h1 className="text-[20px] font-semibold tracking-[-0.015em] sm:text-[22px]">Communities</h1>
          <p className="mt-0.5 text-[13px] text-[#9b9ba6]">Every community on Storelib, and the switch that turns them on.</p>
        </div>

        <div className="space-y-4">
          <SwitchPanel
            enabled={enabled}
            onChanged={(next, message) => {
              setEnabled(next)
              setSaid(message)
            }}
            onError={setError}
          />

          {error ? (
            <Banner tone="bad" onClose={() => setError(null)}>
              {error}
            </Banner>
          ) : null}
          {said ? (
            <Banner tone="good" onClose={() => setSaid(null)}>
              {said}
            </Banner>
          ) : null}

          {totals ? <TotalsView totals={totals} /> : <Placeholder rows={0} />}

          <div className="flex min-w-0 items-center justify-between gap-3 pt-2">
            <Filters
              label="Lists"
              value={view}
              onChange={setView}
              options={[
                { id: "communities", label: "Communities" },
                { id: "reports", label: escalated ? `Escalated reports (${num(escalated)})` : "Escalated reports" },
              ]}
            />
          </div>

          {view === "communities" ? (
            <div className="space-y-3">
              <Toolbar>
                <SearchField value={q} onChange={setQ} label="Search communities" placeholder="Name, address or id" />
                <Filters
                  label="Show"
                  value={filter}
                  onChange={(f) => {
                    setFilter(f)
                    setPage(1)
                  }}
                  options={FILTERS}
                />
              </Toolbar>
              {list === null ? (
                <Placeholder rows={6} />
              ) : "unavailable" in list ? (
                <Panel>
                  <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{list.unavailable}</p>
                </Panel>
              ) : (
                <Panel>
                  <CommunityList rows={list.rows} onOpen={setOpen} empty={debounced || filter !== "all" ? "Nothing matches that." : "No communities yet."} />
                  <Pager page={list.page} pages={list.pages} total={list.total} onPage={setPage} />
                </Panel>
              )}
            </div>
          ) : (
            <ReportsView reports={reports} onPage={setReportPage} />
          )}
        </div>
      </div>

      <CommunityDialog
        community={open}
        onClose={() => setOpen(null)}
        onDone={(c, message) => {
          setOpen(null)
          setSaid(message)
          setList((l) => (l && !("unavailable" in l) ? { ...l, rows: l.rows.map((r) => (r.id === c.id ? { ...r, ...c } : r)) } : l))
          setReload((n) => n + 1)
        }}
      />
    </div>
  )
}

/* ── The switch ─────────────────────────────────────────────────────────── */

export function SwitchPanel({
  enabled,
  onChanged,
  onError,
}: {
  enabled: boolean | null
  onChanged: (enabled: boolean, message: string) => void
  onError: (message: string) => void
}) {
  const [confirming, setConfirming] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [dialogError, setDialogError] = React.useState<string | null>(null)

  const save = async (next: boolean) => {
    setSaving(true)
    setDialogError(null)
    const r = await call<{ enabled: boolean }>("/api/admin/flags", post("/api/admin/flags", { key: "communities", enabled: next }))
    setSaving(false)
    if ("error" in r) {
      if (confirming) setDialogError(r.error)
      else onError(r.error)
      return
    }
    setConfirming(false)
    onChanged(
      r.enabled,
      r.enabled
        ? "Communities are on. Every page picks this up within about half a minute."
        : "Communities are off. Nothing was deleted, and turning them on brings everything back as it was.",
    )
  }

  const on = enabled === true
  return (
    <section className="min-w-0 rounded-[10px] border border-white/[0.08] bg-[#111116]" data-community-switch={enabled === null ? "loading" : on ? "on" : "off"}>
      <div className="flex min-w-0 items-start justify-between gap-4 px-4 py-4 sm:items-center">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-[#ededf0]">Communities</h2>
          <p className="mt-1 max-w-[560px] text-[13px] leading-5 text-[#9b9ba6]">{SWITCH_DESCRIPTION}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden text-[13px] text-[#c9c9d1] sm:inline" data-switch-word>
            {enabled === null ? "" : on ? "Enabled" : "Disabled"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-label={on ? "Communities enabled. Turn off" : "Communities disabled. Turn on"}
            disabled={enabled === null || saving}
            onClick={() => (on ? setConfirming(true) : void save(true))}
            className={cx(
              "relative inline-flex h-11 w-[60px] shrink-0 items-center rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/70 disabled:cursor-default disabled:opacity-60 sm:h-8 sm:w-[52px]",
              on ? "bg-[#3fb950]" : "bg-white/[0.14]",
            )}
            data-switch
          >
            <span
              aria-hidden
              className={cx(
                "absolute left-1 h-9 w-9 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4)] transition-[translate] duration-150 ease-out sm:h-6 sm:w-6",
                on ? "translate-x-4 sm:translate-x-5" : "translate-x-0",
              )}
            />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-white/[0.08] px-4 py-2.5 sm:hidden">
        <Status value={enabled === null ? null : on ? "active" : "draft"} label={enabled === null ? "Reading" : on ? "Enabled" : "Disabled"} />
      </div>
      <ConfirmDialog
        open={confirming}
        title="Turn communities off?"
        confirmLabel="Turn off"
        danger
        busy={saving}
        error={dialogError}
        onConfirm={() => void save(false)}
        onClose={() => {
          if (!saving) {
            setConfirming(false)
            setDialogError(null)
          }
        }}
      >
        <p>Every community page, member feed, event and the communities in Explore stop answering for everyone, creators included, until you turn this on again.</p>
        <p className="text-[#ededf0]">Nothing is deleted. Communities, members, posts, events and payments are all kept, and memberships keep billing as before.</p>
      </ConfirmDialog>
    </section>
  )
}

/* ── The figures ────────────────────────────────────────────────────────── */

function figure(label: string, f: Figure, show: (n: number) => string, sub?: React.ReactNode): FigureItem {
  return f.value === null ? { label, value: "", unreadable: f.unreadable } : { label, value: show(f.value), sub }
}

export function TotalsView({ totals: t }: { totals: Totals }) {
  const currency = (t.revenueCurrency || "usd").toUpperCase()
  return (
    <Figures
      columns={4}
      items={[
        figure("Communities", t.communities, num),
        figure("Published", t.published, num),
        figure("Paid", t.paid, num),
        figure("Free", t.free, num),
        figure("Members active, 30 days", t.activeMembers30d, num),
        figure("Community revenue, 30 days", t.revenue30dCents, (n) => money(n, currency), "Orders, less refunds"),
        figure("Open reports", t.openReports, num, t.escalatedReports.value === null ? null : `${num(t.escalatedReports.value)} escalated`),
        figure("Failed community jobs", t.failedJobs, num),
      ]}
    />
  )
}

/* ── Every community ────────────────────────────────────────────────────── */

function stateOf(c: AdminCommunity): { value: string; label: string } {
  if (c.suspendedAt || c.status === "suspended") return { value: "banned", label: "Suspended" }
  return { value: c.status, label: c.status.charAt(0).toUpperCase() + c.status.slice(1) }
}

export function CommunityList({ rows, onOpen, empty }: { rows: AdminCommunity[]; onOpen: (c: AdminCommunity) => void; empty: string }) {
  const columns: Column<AdminCommunity>[] = [
    {
      key: "name",
      label: "Community",
      width: "minmax(0,2.4fr)",
      phone: "primary",
      render: (c) => (
        <span className="min-w-0">
          <span className="text-[#ededf0]">{c.name}</span>
          <span className="hidden text-[#6b6b76] lg:inline"> /{c.slug}</span>
        </span>
      ),
    },
    {
      key: "state",
      label: "Status",
      width: "minmax(0,1.2fr)",
      render: (c) => {
        const s = stateOf(c)
        return (
          <span className="inline-flex min-w-0 items-center gap-2">
            <Status value={s.value} label={s.label} />
            {c.platformHidden ? <span className="truncate text-[12px] text-[#d4a72c]">Hidden</span> : null}
          </span>
        )
      },
    },
    { key: "creator", label: "Creator", width: "minmax(0,1.3fr)", render: (c) => c.creator.name || c.creator.username || <span className="text-[#6b6b76]">No creator</span> },
    { key: "access", label: "Access", width: "minmax(0,1fr)", render: (c) => `${ACCESS_WORDS[c.access] ?? c.access}, ${c.visibility}` },
    {
      key: "members",
      label: "Members",
      width: "88px",
      align: "right",
      phone: "end",
      render: (c) => (
        <span>
          {num(c.memberCount)}
          <span className="text-[#6b6b76] lg:hidden"> {c.memberCount === 1 ? "member" : "members"}</span>
        </span>
      ),
    },
    { key: "posts", label: "Posts", width: "72px", align: "right", phone: "hide", render: (c) => num(c.postCount) },
    { key: "created", label: "Created", width: "104px", align: "right", phone: "hide", render: (c) => date(c.createdAt) },
  ]
  return <DataList label="Communities" rows={rows} rowKey={(c) => c.id} empty={empty} onOpen={onOpen} columns={columns} />
}

/* ── One community, and what can be done to it ──────────────────────────── */

type Act = "suspend" | "unsuspend" | "hide" | "unhide"

const ACT: Record<Act, { title: string; button: string; danger?: boolean; needsReason: boolean; text: string; done: string }> = {
  suspend: {
    title: "Suspend this community",
    button: "Suspend",
    danger: true,
    needsReason: true,
    text: "Its pages and member area close for everyone, its owner included, until the suspension is lifted. Nothing is deleted and memberships keep billing.",
    done: "Suspended.",
  },
  unsuspend: { title: "Lift the suspension", button: "Lift suspension", needsReason: false, text: "It opens again with the status it had before.", done: "The suspension is lifted." },
  hide: {
    title: "Hide from discovery",
    button: "Hide",
    needsReason: true,
    text: "It leaves Explore and search. Its members use it as before, and its address still works.",
    done: "Hidden from discovery.",
  },
  unhide: { title: "Show in discovery again", button: "Show again", needsReason: false, text: "It can appear in Explore and search again, if its owner has discovery on.", done: "Shown in discovery again." },
}

export function CommunityDialog({
  community: c,
  onClose,
  onDone,
  initialAct = null,
}: {
  community: AdminCommunity | null
  onClose: () => void
  onDone: (c: Partial<AdminCommunity> & { id: string }, message: string) => void
  initialAct?: Act | null
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const [act, setAct] = React.useState<Act | null>(initialAct)
  const [reason, setReason] = React.useState("")
  const [saving, setSaving] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    const d = ref.current
    if (!d) return
    if (c && !d.open) d.showModal?.()
    if (!c && d.open) d.close()
    if (c) {
      setAct(initialAct)
      setReason("")
      setErr(null)
    }
  }, [c, initialAct])

  const run = async () => {
    if (!c || !act) return
    const spec = ACT[act]
    if (spec.needsReason && !reason.trim()) {
      setErr("Say why. It is kept in the community's audit log.")
      return
    }
    setSaving(true)
    setErr(null)
    const r = await call<{ community: { id: string; status: string; platformHidden: boolean; suspendedAt: string | null } }>(
      "/api/admin/communities",
      post("/api/admin/communities", { action: act, communityId: c.id, reason: reason.trim() }),
    )
    setSaving(false)
    if ("error" in r) {
      setErr(r.error)
      return
    }
    onDone(
      { id: r.community.id, status: r.community.status, platformHidden: r.community.platformHidden, suspendedAt: r.community.suspendedAt, suspendedReason: act === "suspend" ? reason.trim() : act === "unsuspend" ? null : c.suspendedReason },
      `${c.name}: ${spec.done}`,
    )
  }

  const suspended = Boolean(c && (c.suspendedAt || c.status === "suspended"))
  const spec = act ? ACT[act] : null
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (saving) e.preventDefault()
      }}
      aria-label={c ? c.name : "Community"}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[14px] border border-white/[0.1] bg-[#111116] p-0 text-[#ededf0] backdrop:bg-black/60 sm:m-auto sm:w-[480px] sm:rounded-[12px]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      data-community-dialog
    >
      {c ? (
        <div className="p-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[15px] font-semibold">{c.name}</h2>
              <a href={publicPath(c.slug)} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex h-8 items-center text-[13px] text-[#9b9ba6] underline decoration-white/20 underline-offset-2 hover:text-[#ededf0]">
                Open the public page
              </a>
            </div>
            <Button variant="quiet" onClick={onClose} disabled={saving} className="h-10 sm:h-8">
              Close
            </Button>
          </div>

          <div className="-mx-5 mt-3 border-y border-white/[0.08]">
            <Facts
              items={[
                { label: "Status", value: <Status value={stateOf(c).value} label={stateOf(c).label} /> },
                { label: "Discovery", value: c.platformHidden ? "Hidden by Storelib" : "Not hidden" },
                { label: "Access", value: `${ACCESS_WORDS[c.access] ?? c.access}, ${c.visibility}` },
                { label: "Members", value: num(c.memberCount) },
                { label: "Posts", value: num(c.postCount) },
                { label: "Creator", value: c.creator.name || c.creator.username || "None" },
                { label: "Created", value: `${date(c.createdAt)}, ${ago(c.createdAt)}` },
                ...(suspended && c.suspendedReason ? [{ label: "Suspended for", value: c.suspendedReason }] : []),
              ]}
            />
          </div>

          {spec ? (
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void run()
              }}
            >
              <div>
                <h3 className="text-[14px] font-semibold">{spec.title}</h3>
                <p className="mt-1 text-[13px] leading-5 text-[#9b9ba6]">{spec.text}</p>
              </div>
              <TextArea
                label={spec.needsReason ? "Why (kept in the audit log)" : "Note (optional)"}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={act === "suspend" ? "Spam, a payment problem, a legal request..." : ""}
              />
              {err ? (
                <p className="text-[13px] text-[#f47067]" role="alert">
                  {err}
                </p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="quiet" onClick={() => setAct(null)} disabled={saving} className="h-10 sm:h-9">
                  Back
                </Button>
                <Button type="submit" variant={spec.danger ? "danger" : "primary"} disabled={saving} className="h-10 sm:h-9">
                  {saving ? "Working…" : spec.button}
                </Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button onClick={() => setAct(c.platformHidden ? "unhide" : "hide")} className="h-10 sm:h-9">
                {c.platformHidden ? "Show in discovery" : "Hide from discovery"}
              </Button>
              <Button variant={suspended ? "primary" : "danger"} onClick={() => setAct(suspended ? "unsuspend" : "suspend")} className="h-10 sm:h-9">
                {suspended ? "Lift suspension" : "Suspend"}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </dialog>
  )
}

/* ── Escalated reports: what and why, never the content ─────────────────── */

export function ReportsView({ reports, onPage }: { reports: Paged<AdminReport> | null; onPage: (p: number) => void }) {
  if (reports === null) return <Placeholder rows={5} />
  if ("unavailable" in reports) {
    return (
      <Panel>
        <p className="px-4 py-6 text-[13px] text-[#9b9ba6]">{reports.unavailable}</p>
      </Panel>
    )
  }
  const columns: Column<AdminReport>[] = [
    {
      key: "community",
      label: "Community",
      width: "minmax(0,2fr)",
      phone: "primary",
      render: (r) =>
        r.community ? (
          <a href={publicPath(r.community.slug)} target="_blank" rel="noreferrer" className="text-[#ededf0] underline decoration-white/20 underline-offset-2 hover:decoration-white/60" onClick={(e) => e.stopPropagation()}>
            {r.community.name}
          </a>
        ) : (
          <span className="text-[#6b6b76]">Removed community</span>
        ),
    },
    { key: "what", label: "Reported", width: "minmax(0,1.2fr)", render: (r) => TARGET_WORDS[r.targetType] ?? r.targetType },
    { key: "reason", label: "Reason", width: "minmax(0,1fr)", render: (r) => REASON_WORDS[r.reason] ?? r.reason },
    { key: "status", label: "Status", width: "minmax(0,1fr)", render: (r) => <Status value={r.status === "open" ? "pending" : r.status === "reviewing" ? "scheduled" : "completed"} label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} /> },
    { key: "when", label: "When", width: "96px", align: "right", phone: "end", render: (r) => ago(r.createdAt) },
  ]
  return (
    <Panel title="Escalated to Storelib" meta="what was reported and why; the reported content stays inside its community">
      <DataList label="Escalated reports" rows={reports.rows} rowKey={(r) => r.id} empty="Nothing escalated. All clear." columns={columns} />
      <Pager page={reports.page} pages={reports.pages} total={reports.total} onPage={onPage} />
    </Panel>
  )
}
