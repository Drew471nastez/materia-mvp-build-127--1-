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
import { ChevronDown, Download, Plus, Search, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { HelpLabel } from "@/components/app/help-label"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { NOT_RECORDED, sourceView } from "@/lib/contacts/contact-source"
import { TRIGGERS, isTriggerType, normalizeSteps, stepSummary } from "@/lib/automations/flow-model"
import { ContactDetail, contactReady, prefetchContact } from "./contact-detail"
import type { RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { ShimmerBlock, ShimmerRows, ShimmerSwap } from "@/components/ui/shimmer"
import { ScrollEdge } from "@/components/app/scroll-edge"
import { GUTTER, LIST_WIDTH, MenuOption, MenuSurface, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"

export type EmailsTab = "subscribers" | "flows" | "published" | "scheduled" | "drafts"

export interface SubscriberRow {
  id: string
  email: string
  name?: string
  source: string
  status: string
  subscribed_at: string
  unsubscribed_at?: string | null
  /** Where they joined (lib/contacts/contact-source). Missing before its SQL has run. */
  source_detail?: unknown
  consent_text?: string | null
}

/** What a flow has done, from its send records (email_flow_totals). */
export interface FlowTotals {
  sent: number
  opened: number
  clicked: number
  failed: number
  in_progress: number
}

export interface FlowRow {
  id: string
  name: string
  trigger_type: string
  trigger_config?: unknown
  status: string
  steps?: unknown
  totals?: FlowTotals | null
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
  /* Whether the figures were waited for, so they fade in when they come. */
  const [waited, setWaited] = React.useState(props.loading)
  if (props.loading && !waited) setWaited(true)
  if (readings.length === 0) return null
  return (
    <section aria-label="Email metrics" className={cn(card, "mt-4 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {readings.map((r, i) => (
          <div key={r.label} className={cn("flex min-w-[140px] flex-1 shrink-0 flex-col px-4 py-3", i > 0 && "border-l border-[#eef0f2]")}>
            <HelpLabel label={r.label} description={r.help} className="text-[12px] font-medium text-[#4b5563]" />
            <div className="mt-1 flex h-6 items-baseline gap-2">
              {/* A light gray shape until the figure is in, where a dash stood
                  and then turned into the number. */}
              {props.loading ? (
                <ShimmerBlock className="shimmer-wait h-3.5 w-12 self-center rounded-full" />
              ) : (
                <span className={cn("text-[16px] font-semibold tabular-nums text-[#1a1a2e]", waited && "shimmer-enter")}>{r.value}</span>
              )}
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
    const surface = (s: SubscriberRow) => {
      const v = sourceView(s.source_detail, s.source)
      return v.key.startsWith("site:") ? "website" : v.key
    }
    const fromSites = on.filter((s) => surface(s) === "website").length
    const fromStorelib = on.filter((s) => ["profile", "product", "onepage"].includes(surface(s))).length
    const fromCheckout = on.filter((s) => surface(s) === "checkout").length
    return [
      { label: "Subscribers", help: "Everyone who gets your emails: people who signed up, and buyers.", value: n(on.length + p.checkoutBuyersCount) },
      { label: "From your website", help: "People who signed up on a website you built with Storelib.", value: n(fromSites) },
      { label: "From Storelib", help: "People who signed up on your Storelib profile, a product page or your OnePage.", value: n(fromStorelib) },
      { label: "At checkout", help: "Buyers who asked to hear from you when they paid.", value: n(fromCheckout) },
      { label: "Unsubscribed", help: "People who asked to stop getting your emails. They are never sent another.", value: n(p.subscribers.filter((s) => s.status === "unsubscribed").length) },
    ]
  }
  if (p.tab === "flows") {
    const sum = (k: keyof FlowTotals) => p.flows.reduce((total, f) => total + (f.totals?.[k] ?? 0), 0)
    const sent = sum("sent")
    return [
      { label: "On", help: "Automations that are sending.", value: `${p.flows.filter((f) => f.status === "active").length} of ${p.flows.length}` },
      { label: "In progress", help: "People partway through an automation right now.", value: n(sum("in_progress")) },
      { label: "Emails sent", help: "Every email your automations have sent.", value: n(sent) },
      { label: "Open rate", help: "Of the emails your automations sent, how many were opened. Some mail apps hide opens, so this is a floor.", value: sent ? `${Math.round((sum("opened") / sent) * 1000) / 10}%` : "–" },
    ]
  }
  /* While the first answer is on its way the row is there already, its
     figures in light gray, so it does not arrive with them and push the
     table down. */
  if (p.tab === "published" && (p.overview || p.loading)) {
    const o = p.overview ?? { total_sent: 0, open_rate: 0, total_opened: 0, click_rate: 0, total_clicked: 0, total_unsubscribed: 0 }
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
/**
 * The first column holds still while the rest scrolls under it, on a phone,
 * on the row's own opaque colour (hover included) so nothing shows through
 * it. Its cells carry `data-scroll-edge`: the table's frame draws the shadow
 * at their right side once the rows have moved (components/app/scroll-edge).
 */
const sticky = "sticky left-0 z-[1] bg-white group-hover:bg-[#fafbfb] group-active:bg-[#f4f5f7]"
const stickyHead = "sticky left-0 z-[1] bg-[#fafbfb]"

function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="text-[15px] font-semibold text-[#1a1a2e]">{title}</p>
      <p className="mt-1 max-w-[360px] text-[13px] text-[#6b7280]">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/**
 * The table while its rows are coming: its header strip and five of its 48px
 * rows, in light gray (components/ui/shimmer). Nothing for 200ms, so a quick
 * answer shows only the table.
 */
function Loading() {
  return <ShimmerRows rows={5} header cols={["34%", "16%", "14%", "10%"]} label="Loading" />
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

/** A filter as a chip in the table's toolbar, the way Orders draws its own. */
function FilterChip({
  label,
  value,
  options,
  selected,
  onSelect,
}: {
  label: string
  value: string | null
  options: Array<{ value: string; label: string; hint?: string }>
  selected: string
  onSelect: (value: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "flex h-7 shrink-0 items-center rounded-lg border text-[12px] font-medium",
          value ? "border-[#1a1a2e]/15 bg-[#f1f2f4] text-[#1a1a2e]" : "border-dashed border-[#c9ccd3] text-[#4b5563]",
        )}
      >
        <PopoverTrigger asChild>
          <button type="button" className="flex h-full max-w-[220px] cursor-pointer items-center gap-1 px-2.5">
            <span className="truncate">{value ? `${label}: ${value}` : label}</span>
            {value ? null : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
          </button>
        </PopoverTrigger>
        {value ? (
          <button type="button" aria-label={`Clear ${label}`} className="flex h-full cursor-pointer items-center pr-2 text-[#6b7280] hover:text-[#1a1a2e]" onClick={() => onSelect("")}>
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      <MenuSurface className="max-h-[320px] w-[280px] overflow-y-auto">
        <div role="menu" aria-label={label}>
          {options.map((o) => (
            <MenuOption
              key={o.value}
              selected={o.value === selected}
              hint={o.hint}
              onSelect={() => {
                onSelect(o.value)
                setOpen(false)
              }}
            >
              {o.label}
            </MenuOption>
          ))}
        </div>
      </MenuSurface>
    </Popover>
  )
}

function SubscribersTable(props: EmailsHomeProps) {
  const [searching, setSearching] = React.useState(props.search !== "")
  const [page, setPage] = React.useState(1)
  const [source, setSource] = React.useState("")
  const [open, setOpen] = React.useState<SubscriberRow | null>(null)
  /*
    A contact's sheet rises with its content already in it: the tap waits
    for the contact's automation runs (asked for when the finger landed), at
    most a moment, and then opens it (./contact-detail). The latest tap wins.
  */
  const opening = React.useRef<SubscriberRow | null>(null)
  const openContact = (s: SubscriberRow) => {
    opening.current = s
    void contactReady(s.email).then(() => {
      if (opening.current !== s) return
      opening.current = null
      setOpen(s)
    })
  }
  const q = props.search.trim().toLowerCase()

  /* Every contact's source, read once: the column, the filter and its counts. */
  const views = React.useMemo(() => new Map(props.subscribers.map((s) => [s.id, sourceView(s.source_detail, s.source)])), [props.subscribers])
  const sources = React.useMemo(() => {
    const count = new Map<string, { label: string; n: number }>()
    for (const v of views.values()) {
      const c = count.get(v.key)
      if (c) c.n++
      else count.set(v.key, { label: v.label, n: 1 })
    }
    /* Websites first, by size; then Storelib's own pages; Not recorded last. */
    return [...count.entries()]
      .sort(([ak, a], [bk, b]) => Number(ak === "none") - Number(bk === "none") || Number(!ak.startsWith("site:")) - Number(!bk.startsWith("site:")) || b.n - a.n)
      .map(([key, c]) => ({ value: key, label: c.label, hint: `${c.n.toLocaleString("en-US")} ${c.n === 1 ? "contact" : "contacts"}` }))
  }, [views])

  const rows = React.useMemo(
    () =>
      props.subscribers.filter(
        (s) =>
          (!q || s.email.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q)) &&
          (!source || views.get(s.id)?.key === source),
      ),
    [props.subscribers, q, source, views],
  )
  React.useEffect(() => setPage(1), [q, source])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const sourceName = source ? sources.find((o) => o.value === source)?.label ?? null : null

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

      {props.subscribers.length > 0 ? (
        <div className="orders-strip flex items-center gap-2 overflow-x-auto border-b border-[#eef0f2] px-3 py-2">
          <FilterChip label="Source" value={sourceName} options={[{ value: "", label: "Any source" }, ...sources]} selected={source} onSelect={setSource} />
        </div>
      ) : null}

      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : rows.length === 0 ? (
          q || source ? (
            <Empty title="No subscribers match" body="Try another email or name, or another source." />
          ) : (
            <Empty title="No subscribers yet" body="People who sign up on your website, your Storelib profile or your OnePage show up here, and so do buyers who ask to hear from you." />
          )
        ) : (
          <ScrollEdge>
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead)}>Email</th>
                  <th className={th}>Name</th>
                  <th className={th}>Source</th>
                  <th className={th}>Status</th>
                  <th className={th}>Subscribed</th>
                  <th className={cn(th, "w-12")} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {shown.map((s) => {
                  const v = views.get(s.id)
                  return (
                    <tr
                      key={s.id}
                      data-contact-row=""
                      className="group cursor-pointer hover:bg-[#fafbfb] active:bg-[#f4f5f7]"
                      onPointerDown={() => prefetchContact(s.email)}
                      onPointerEnter={(e) => {
                        if (e.pointerType !== "mouse") return
                        const row = e.currentTarget
                        window.clearTimeout(Number(row.dataset.prefetch))
                        row.dataset.prefetch = String(window.setTimeout(() => prefetchContact(s.email), 80))
                      }}
                      onPointerLeave={(e) => window.clearTimeout(Number(e.currentTarget.dataset.prefetch))}
                      onClick={() => openContact(s)}
                    >
                      <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}><span className="block max-w-[180px] truncate sm:max-w-[260px]">{s.email}</span></td>
                      <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[180px] truncate">{s.name || "–"}</span></td>
                      <td className={td} title={v ? [v.label, v.detail].filter(Boolean).join(" · ") : undefined}>
                        {/* The website's address is the part that matters: it keeps its
                            width, and the detail after it is what gets cut. */}
                        <span className="flex max-w-[380px] items-baseline gap-1.5">
                          <span className={cn("max-w-[230px] shrink-0 truncate", v?.label === NOT_RECORDED ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{v?.label ?? NOT_RECORDED}</span>
                          {v?.detail ? <span className="min-w-0 truncate text-[12px] text-[#6b7280]">{v.detail}</span> : null}
                        </span>
                      </td>
                      <td className={td}>
                        <SubscriberStatus s={s} />
                      </td>
                      <td className={cn(td, "tabular-nums text-[#4b5563]")}>{formatDay(s.subscribed_at)}</td>
                      <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                        <ResponsiveActionMenu
                          title={s.email}
                          align="end"
                          trigger={<RowMenuButton label={`Actions for ${s.email}`} />}
                          items={[
                            { label: "Details", onClick: () => openContact(s) },
                            { label: "Copy email", onClick: () => props.onCopyEmail(s.email) },
                            { label: "Remove", variant: "destructive", separatorBefore: true, onClick: () => props.onRemoveSubscriber(s.id) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollEdge>
        )}
      </ShimmerSwap>
      <Pager page={page} pages={pages} total={rows.length} onPage={setPage} />
      <ContactDetail contact={open} onClose={() => setOpen(null)} />
    </>
  )
}

function FlowsTable(props: EmailsHomeProps) {
  return (
    <>
      <Toolbar tab={props.tab} onTab={props.onTab} />
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.flows.length === 0 ? (
          <Empty
            title="No automations yet"
            body="Start from a welcome series, a thank you after a purchase, or your own. Each one is off until you turn it on."
            action={
              <button type="button" className={buttonAccent} onClick={props.onCreateFlow}>
                <Plus className="h-4 w-4" />
                Create an automation
              </button>
            }
          />
        ) : (
          <ScrollEdge>
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead)}>Automation</th>
                  <th className={th}>Starts when</th>
                  <th className={th}>Steps</th>
                  <th className={cn(th, "text-right")}>In progress</th>
                  <th className={cn(th, "text-right")}>Sent</th>
                  <th className={cn(th, "text-right")}>Opened</th>
                  <th className={th}>On</th>
                  <th className={cn(th, "w-12")} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {props.flows.map((f) => {
                  const trigger = isTriggerType(f.trigger_type) ? TRIGGERS[f.trigger_type].sentence : "Not set"
                  const on = f.status === "active"
                  const t = f.totals
                  return (
                    <tr key={f.id} className="group cursor-pointer hover:bg-[#fafbfb] active:bg-[#f4f5f7]" onClick={() => props.onEditFlow(f)}>
                      <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}>
                        <span className="flex max-w-[180px] items-center gap-2 sm:max-w-[260px]">
                          <span className="truncate">{f.name}</span>
                          {t && t.failed > 0 ? <StatusBadge tone="critical">{t.failed} failed</StatusBadge> : null}
                        </span>
                      </td>
                      <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[240px] truncate">{trigger}</span></td>
                      <td className={cn(td, "text-[#4b5563]")}>{stepSummary(normalizeSteps(f.steps))}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{t ? t.in_progress.toLocaleString("en-US") : "–"}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{t ? t.sent.toLocaleString("en-US") : "–"}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{t && t.sent > 0 ? rate(t.opened, t.sent) : "–"}</td>
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
          </ScrollEdge>
        )}
      </ShimmerSwap>
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
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.campaigns.length === 0 ? (
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
          <ScrollEdge>
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead)}>Subject</th>
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
                    <tr key={c.id} className="group cursor-pointer hover:bg-[#fafbfb] active:bg-[#f4f5f7]" onClick={() => props.onOpenCampaign(c)}>
                      <td data-scroll-edge="" className={cn(td, sticky)}>
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
          </ScrollEdge>
        )}
      </ShimmerSwap>
      <Pager page={page} pages={pages} total={props.campaigns.length} onPage={setPage} />
    </>
  )
}
