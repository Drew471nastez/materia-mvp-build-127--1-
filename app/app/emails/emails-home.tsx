"use client"

/**
 * ===========================================================================
 *  EMAILS, IN THE SAME LANGUAGE AS ORDERS AND ANALYTICS
 * ===========================================================================
 * The list screen of /app/emails: subscribers, automations and the emails
 * sent, scheduled and drafted. It was its own dialect: pill tabs with an
 * icon each, a grid of stat boxes, a card per automation, a stack of rows
 * for emails. Everything here is drawn with the Orders page's parts
 * (app/app/orders/order-parts.tsx): the pane's bar, one card with the views
 * as tabs and a search in its toolbar, a dense table whose first column
 * stays put on a phone, a metrics strip above it, and each row's actions in
 * the menu that is a dropdown on a desktop and a sheet on a phone.
 *
 * It owns nothing. The data, the loading and every action stay in page.tsx,
 * which also draws the editors this screen opens.
 */
import * as React from "react"
import { Download, Plus, Search, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { HelpLabel } from "@/components/app/help-label"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import type { RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { GUTTER, LIST_WIDTH, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"

export type EmailsTab = "subscribers" | "flows" | "published" | "scheduled" | "drafts"

export interface SubscriberRow {
  id: string
  email: string
  name?: string
  source: string
  status: string
  subscribed_at: string
  unsubscribed_at?: string | null
}

export interface FlowRow {
  id: string
  name: string
  trigger_type: string
  status: string
  steps?: unknown[]
  stats?: { emails_sent: number; open_rate: number } | null
}

export interface CampaignRow {
  id: string
  subject: string
  sent_at?: string
  scheduled_at?: string
  created_at: string
  recipient_count?: number
  audience_count?: number
  unique_opens?: number
  unique_clicks?: number
}

export interface OverviewStats {
  total_sent: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
  open_rate: number
  click_rate: number
}

export interface EmailsHomeProps {
  tab: EmailsTab
  onTab: (tab: EmailsTab) => void
  loading: boolean
  onNewEmail: () => void

  subscribers: SubscriberRow[]
  /** Buyers who are not on the list, counted as reachable from the store. */
  checkoutBuyersCount: number
  search: string
  onSearch: (q: string) => void
  onExportSubscribers: () => void
  onCopyEmail: (email: string) => void
  onRemoveSubscriber: (id: string) => void

  flows: FlowRow[]
  trigger: (type: string) => { name: string; description: string }
  onCreateFlow: () => void
  onEditFlow: (flow: FlowRow) => void
  onToggleFlow: (flow: FlowRow) => void
  onDeleteFlow: (id: string) => void

  campaigns: CampaignRow[]
  onOpenCampaign: (campaign: CampaignRow) => void
  onViewStats: (campaign: CampaignRow) => void
  onResend: (campaign: CampaignRow) => void
  onEditCampaign: (campaign: CampaignRow) => void
  onDeleteCampaign: (id: string) => void
  isSending: boolean

  overview: OverviewStats | null
  usage: { sent: number; limit: number }
  period: RangeValue
  onPeriod: (value: RangeValue) => void
  today: string
}

const TABS: { id: EmailsTab; label: string }[] = [
  { id: "subscribers", label: "Subscribers" },
  { id: "flows", label: "Automations" },
  { id: "published", label: "Sent" },
  { id: "scheduled", label: "Scheduled" },
  { id: "drafts", label: "Drafts" },
]

const PAGE_SIZE = 50

function formatDay(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function formatWhen(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${formatDay(iso)}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
}

function rate(part: number, whole: number): string {
  if (!whole) return "–"
  return `${Math.round((part / whole) * 1000) / 10}%`
}

export function EmailsHome(props: EmailsHomeProps) {
  const { tab } = props
  return (
    <>
      <PaneBar width={LIST_WIDTH} className="flex min-h-[60px] items-center justify-between gap-3 py-2">
        <h1 className="text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Emails</h1>
        <div className="flex items-center gap-2">
          {tab === "flows" ? (
            <button type="button" className={buttonSecondary} onClick={props.onCreateFlow}>
              <Plus className="h-4 w-4" />
              Automation
            </button>
          ) : null}
          <button type="button" className={buttonAccent} onClick={props.onNewEmail}>
            <Plus className="h-4 w-4" />
            New email
          </button>
        </div>
      </PaneBar>

      <div className={cn("mx-auto pb-24 md:pb-8", LIST_WIDTH, GUTTER)}>
        {tab === "published" ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DateRangePicker value={props.period} onChange={props.onPeriod} today={props.today} />
          </div>
        ) : null}

        <Metrics {...props} />

        <section aria-label="Emails" className={cn(card, "mt-4 overflow-hidden")}>
          {tab === "subscribers" ? <SubscribersTable {...props} /> : null}
          {tab === "flows" ? <FlowsTable {...props} /> : null}
          {tab === "published" || tab === "scheduled" || tab === "drafts" ? <CampaignsTable {...props} /> : null}
        </section>
      </div>
    </>
  )
}

/* ─── The views, as the Orders page draws them ───────────────────────── */

function Tabs({ tab, onTab }: Pick<EmailsHomeProps, "tab" | "onTab">) {
  return (
    <div role="tablist" aria-label="Views" className="orders-strip -my-2 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto py-2">
      {TABS.map((t) => {
        const active = t.id === tab
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onTab(t.id)}
            className={cn(
              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100",
              active ? "bg-[#eceef1] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#f4f5f7]",
            )}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/** The card's top row: the views, and whatever this view can do. */
function Toolbar({ children, ...tabs }: Pick<EmailsHomeProps, "tab" | "onTab"> & { children?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
      <Tabs {...tabs} />
      {children}
    </div>
  )
}

/* ─── Metrics, for the view that is open ─────────────────────────────── */

interface Reading {
  label: string
  help: string
  value: string
  note?: string
}

function Metrics(props: EmailsHomeProps) {
  const readings = readingsFor(props)
  if (readings.length === 0) return null
  return (
    <section aria-label="Email metrics" className={cn(card, "mt-4 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {readings.map((r, i) => (
          <div key={r.label} className={cn("flex min-w-[140px] flex-1 shrink-0 flex-col px-4 py-3", i > 0 && "border-l border-[#eef0f2]")}>
            <HelpLabel label={r.label} description={r.help} className="text-[12px] font-medium text-[#4b5563]" />
            <div className="mt-1 flex h-6 items-baseline gap-2">
              <span className="text-[16px] font-semibold tabular-nums text-[#1a1a2e]">{props.loading ? "–" : r.value}</span>
              {r.note && !props.loading ? <span className="text-[12px] tabular-nums text-[#6b7280]">{r.note}</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function readingsFor(p: EmailsHomeProps): Reading[] {
  const n = (v: number) => Math.round(v).toLocaleString("en-US")
  if (p.tab === "subscribers") {
    const on = p.subscribers.filter((s) => s.status === "subscribed")
    const fromPage = on.filter((s) => s.source === "onepage").length
    return [
      { label: "Subscribers", help: "Everyone who gets your emails: people who signed up, and buyers.", value: n(on.length + p.checkoutBuyersCount) },
      { label: "From your OnePage", help: "People who signed up on your OnePage.", value: n(fromPage) },
      { label: "From your store", help: "People who signed up on your website, and buyers who are not on the list yet.", value: n(on.length - fromPage + p.checkoutBuyersCount) },
      { label: "Unsubscribed", help: "People who asked to stop getting your emails. They are never sent another.", value: n(p.subscribers.filter((s) => s.status === "unsubscribed").length) },
    ]
  }
  if (p.tab === "flows") {
    const sent = p.flows.reduce((sum, f) => sum + (f.stats?.emails_sent ?? 0), 0)
    const withStats = p.flows.filter((f) => (f.stats?.emails_sent ?? 0) > 0)
    const opens = withStats.length ? withStats.reduce((sum, f) => sum + (f.stats?.open_rate ?? 0) * (f.stats?.emails_sent ?? 0), 0) / sent : null
    return [
      { label: "On", help: "Automations that are sending.", value: `${p.flows.filter((f) => f.status === "active").length} of ${p.flows.length}` },
      { label: "Emails sent", help: "Every email your automations have sent.", value: n(sent) },
      { label: "Open rate", help: "Of the emails your automations sent, how many were opened.", value: opens === null ? "–" : `${Math.round(opens * 10) / 10}%` },
    ]
  }
  if (p.tab === "published" && p.overview) {
    const o = p.overview
    const used = p.usage.limit > 0 ? Math.min(100, Math.round((p.usage.sent / p.usage.limit) * 100)) : 0
    return [
      { label: "Sent", help: "Emails delivered to subscribers in this period.", value: n(o.total_sent) },
      { label: "Open rate", help: "Of the emails sent in this period, how many were opened.", value: `${o.open_rate}%`, note: n(o.total_opened) },
      { label: "Click rate", help: "Of the emails sent in this period, how many had a link clicked.", value: `${o.click_rate}%`, note: n(o.total_clicked) },
      { label: "Unsubscribed", help: "People who unsubscribed from an email sent in this period.", value: n(o.total_unsubscribed) },
      { label: "This month", help: "Emails sent this calendar month, against your plan's monthly limit.", value: n(p.usage.sent), note: `of ${n(p.usage.limit)} · ${used}%` },
    ]
  }
  return []
}

/* ─── Tables ─────────────────────────────────────────────────────────── */

const th = "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-[#4b5563]"
const td = "h-12 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]"
/** The first column holds still while the rest scrolls under it, on a phone. */
const sticky = "sticky left-0 z-[1] bg-white group-hover:bg-[#fafbfb]"

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[360px] text-[13px] text-[#6b7280]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="skeleton-deferred divide-y divide-[#f1f2f4]">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-4 px-3">
          <div className="h-3 w-48 rounded bg-[#eef0f3]" />
          <div className="h-3 w-24 rounded bg-[#f1f2f4]" />
          <div className="ml-auto h-3 w-16 rounded bg-[#f1f2f4]" />
        </div>
      ))}
    </div>
  )
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  return (
    <div className="flex h-12 items-center justify-between border-t border-[#eef0f2] px-3 text-[13px] text-[#4b5563]">
      <span className="tabular-nums">
        {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex gap-1">
        <button type="button" className={buttonSecondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button type="button" className={buttonSecondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  )
}

function SubscriberStatus({ s }: { s: SubscriberRow }) {
  if (s.status === "subscribed" && s.unsubscribed_at) return <StatusBadge tone="attention">Resubscribed</StatusBadge>
  if (s.status === "subscribed") return <StatusBadge tone="success">Subscribed</StatusBadge>
  return <StatusBadge tone="neutral">Unsubscribed</StatusBadge>
}

function SubscribersTable(props: EmailsHomeProps) {
  const [searching, setSearching] = React.useState(props.search !== "")
  const [page, setPage] = React.useState(1)
  const q = props.search.trim().toLowerCase()
  const rows = React.useMemo(
    () => (q ? props.subscribers.filter((s) => s.email.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q)) : props.subscribers),
    [props.subscribers, q],
  )
  React.useEffect(() => setPage(1), [q])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <>
      {searching ? (
        <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
          <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 focus-within:border-[#1a1a2e] focus-within:shadow-[0_0_0_1px_#1a1a2e]">
            <Search className="h-4 w-4 shrink-0 text-[#6b7280]" />
            <input
              autoFocus
              type="search"
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
              placeholder="Search by email or name"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
            />
            {props.search ? (
              <button type="button" aria-label="Clear search" className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => props.onSearch("")}>
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </label>
          <button
            type="button"
            className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium text-[#1a1a2e] hover:bg-[#f1f2f4]"
            onClick={() => {
              props.onSearch("")
              setSearching(false)
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <Toolbar tab={props.tab} onTab={props.onTab}>
          <button type="button" aria-label="Search subscribers" className={iconButton} onClick={() => setSearching(true)}>
            <Search className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Export subscribers" className={iconButton} onClick={props.onExportSubscribers}>
            <Download className="h-4 w-4" />
          </button>
        </Toolbar>
      )}

      {props.loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        q ? (
          <Empty title="No subscribers match" body="Try another email or name." />
        ) : (
          <Empty title="No subscribers yet" body="People who sign up on your OnePage or your website show up here, and so do your buyers." />
        )
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
              <tr>
                <th className={cn(th, "sticky left-0 z-[1] bg-[#fafbfb]")}>Email</th>
                <th className={th}>Name</th>
                <th className={th}>Source</th>
                <th className={th}>Status</th>
                <th className={th}>Subscribed</th>
                <th className={cn(th, "w-12")} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {shown.map((s) => (
                <tr key={s.id} className="group hover:bg-[#fafbfb]">
                  <td className={cn(td, sticky, "font-medium")}><span className="block max-w-[180px] truncate sm:max-w-[260px]">{s.email}</span></td>
                  <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[200px] truncate">{s.name || "–"}</span></td>
                  <td className={td}>
                    <StatusBadge tone="neutral">{s.source === "onepage" ? "OnePage" : "Website"}</StatusBadge>
                  </td>
                  <td className={td}>
                    <SubscriberStatus s={s} />
                  </td>
                  <td className={cn(td, "tabular-nums text-[#4b5563]")}>{formatDay(s.subscribed_at)}</td>
                  <td className={cn(td, "w-12 px-2 text-right")}>
                    <ResponsiveActionMenu
                      title={s.email}
                      align="end"
                      trigger={<RowMenuButton label={`Actions for ${s.email}`} />}
                      items={[
                        { label: "Copy email", onClick: () => props.onCopyEmail(s.email) },
                        { label: "Remove", variant: "destructive", separatorBefore: true, onClick: () => props.onRemoveSubscriber(s.id) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={pages} total={rows.length} onPage={setPage} />
    </>
  )
}

function FlowsTable(props: EmailsHomeProps) {
  return (
    <>
      <Toolbar tab={props.tab} onTab={props.onTab} />
      {props.loading ? (
        <Loading />
      ) : props.flows.length === 0 ? (
        <Empty
          title="No automations yet"
          body="Write a welcome email and turn it on, and it goes to everyone who joins your list. Sign-ups are collected either way."
          action={
            <button type="button" className={buttonAccent} onClick={props.onCreateFlow}>
              <Plus className="h-4 w-4" />
              Create an automation
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
              <tr>
                <th className={cn(th, "sticky left-0 z-[1] bg-[#fafbfb]")}>Automation</th>
                <th className={th}>Sends when</th>
                <th className={cn(th, "text-right")}>Emails</th>
                <th className={cn(th, "text-right")}>Sent</th>
                <th className={cn(th, "text-right")}>Opened</th>
                <th className={th}>On</th>
                <th className={cn(th, "w-12")} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {props.flows.map((f) => {
                const trigger = props.trigger(f.trigger_type)
                const emails = (f.steps ?? []).length
                const on = f.status === "active"
                return (
                  <tr key={f.id} className="group cursor-pointer hover:bg-[#fafbfb]" onClick={() => props.onEditFlow(f)}>
                    <td className={cn(td, sticky, "font-medium")}><span className="block max-w-[160px] truncate sm:max-w-[240px]">{f.name}</span></td>
                    <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[280px] truncate">{trigger.description}</span></td>
                    <td className={cn(td, "text-right tabular-nums")}>{emails}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{(f.stats?.emails_sent ?? 0).toLocaleString("en-US")}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{f.stats && f.stats.emails_sent > 0 ? `${f.stats.open_rate}%` : "–"}</td>
                    <td className={td} onClick={(e) => e.stopPropagation()}>
                      <Switch checked={on} onCheckedChange={() => props.onToggleFlow(f)} aria-label={`Send ${f.name} automatically`} />
                    </td>
                    <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                      <ResponsiveActionMenu
                        title={f.name}
                        align="end"
                        trigger={<RowMenuButton label={`Actions for ${f.name}`} />}
                        items={[
                          { label: "Edit", onClick: () => props.onEditFlow(f) },
                          { label: on ? "Turn off" : "Turn on", onClick: () => props.onToggleFlow(f) },
                          { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteFlow(f.id) },
                        ]}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function CampaignsTable(props: EmailsHomeProps) {
  const { tab } = props
  const sent = tab === "published"
  const [page, setPage] = React.useState(1)
  React.useEffect(() => setPage(1), [tab])
  const pages = Math.max(1, Math.ceil(props.campaigns.length / PAGE_SIZE))
  const shown = props.campaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const empty =
    tab === "published"
      ? { title: "Nothing sent in this period", body: "Emails you send show up here with how many were opened and clicked." }
      : tab === "scheduled"
        ? { title: "Nothing scheduled", body: "Write an email and choose when it goes out, and it waits here until then." }
        : { title: "No drafts", body: "An email you start and do not send yet is kept here." }

  return (
    <>
      <Toolbar tab={tab} onTab={props.onTab} />
      {props.loading ? (
        <Loading />
      ) : props.campaigns.length === 0 ? (
        <Empty
          {...empty}
          action={
            <button type="button" className={buttonSecondary} onClick={props.onNewEmail}>
              <Plus className="h-4 w-4" />
              New email
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
              <tr>
                <th className={cn(th, "sticky left-0 z-[1] bg-[#fafbfb]")}>Subject</th>
                <th className={th}>{sent ? "Sent" : tab === "scheduled" ? "Goes out" : "Started"}</th>
                <th className={cn(th, "text-right")}>Recipients</th>
                {sent ? <th className={cn(th, "text-right")}>Opened</th> : null}
                {sent ? <th className={cn(th, "text-right")}>Clicked</th> : null}
                <th className={cn(th, "w-12")} aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f2f4]">
              {shown.map((c) => {
                const recipients = c.recipient_count || c.audience_count || 0
                const resent = /\(Resend\)/.test(c.subject ?? "")
                const items: ActionMenuItem[] = sent
                  ? [
                      { label: "View results", onClick: () => props.onViewStats(c) },
                      { label: props.isSending ? "Sending…" : "Send again", onClick: () => { if (!props.isSending) props.onResend(c) } },
                      { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) },
                    ]
                  : [
                      { label: "Edit", onClick: () => props.onEditCampaign(c) },
                      { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) },
                    ]
                return (
                  <tr key={c.id} className="group cursor-pointer hover:bg-[#fafbfb]" onClick={() => props.onOpenCampaign(c)}>
                    <td className={cn(td, sticky)}>
                      {/* The limit is on the span: a table cell's own max-width is ignored.
                          Narrow on a phone, so the columns scrolling under it still show. */}
                      <span className="flex min-w-0 max-w-[180px] items-center gap-2 sm:max-w-[320px]">
                        <span className="truncate font-medium">{(c.subject ?? "").replace(/\s*\(Resend\)\s*$/, "") || "Untitled"}</span>
                        {resent ? <StatusBadge tone="neutral">Sent again</StatusBadge> : null}
                      </span>
                    </td>
                    <td className={cn(td, "tabular-nums text-[#4b5563]")}>
                      {sent ? formatDay(c.sent_at) : tab === "scheduled" ? formatWhen(c.scheduled_at) : formatDay(c.created_at)}
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{recipients ? recipients.toLocaleString("en-US") : "–"}</td>
                    {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_opens ?? 0, recipients)}</td> : null}
                    {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_clicks ?? 0, recipients)}</td> : null}
                    <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                      <ResponsiveActionMenu title={c.subject} align="end" trigger={<RowMenuButton label={`Actions for ${c.subject}`} />} items={items} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={page} pages={pages} total={props.campaigns.length} onPage={setPage} />
    </>
  )
}
