"use client"

/**
 * ===========================================================================
 *  EMAILS, IN THE SAME LANGUAGE AS ORDERS AND ANALYTICS
 * ===========================================================================
 * The list screen of /app/emails: subscribers, the messages people wrote
 * through a website's contact form, automations and the emails sent,
 * scheduled and drafted, drawn with the Orders page's parts
 * (app/app/orders/order-parts.tsx): the pane's bar, a metrics strip, a dense
 * table whose first column stays put on a phone, and each row's actions in
 * the menu that is a dropdown on a desktop and a sheet on a phone.
 *
 * THE BAR HOLDS STILL. The title, New automation and New email, and the
 * five tabs are all in the pane's bar, which is never unmounted and never
 * changes height, so switching tabs moves nothing above the content: the
 * tab row keeps its own sideways scroll on a phone, and only what is under
 * the bar changes.
 *
 * A ROW ANSWERS THE FINGER. Every row that opens something darkens while it
 * is pressed, and starts reading what it opens as the pointer arrives on it
 * (or the finger touches it), so the page is ready by the time the click
 * lands: an email's page (read ahead into the cache), a draft or an
 * automation (the route prefetched).
 *
 * It owns no data. The reads, the cache and every action are in
 * app/app/emails/emails-client.tsx.
 */
import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, Download, Plus, Search, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { HelpLabel } from "@/components/app/help-label"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { NOT_RECORDED, sourceView } from "@/lib/contacts/contact-source"
import { TRIGGERS, isTriggerType, normalizeSteps, stepSummary } from "@/lib/automations/flow-model"
import { contactReady, contactStatusLabel, prefetchContact } from "./contact-detail"
import type { RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { ShimmerBlock, ShimmerRows, ShimmerSwap } from "@/components/ui/shimmer"
import { ScrollEdge } from "@/components/app/scroll-edge"
import { GUTTER, LIST_WIDTH, MenuOption, MenuSurface, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { HOVER_PREFETCH_MS } from "../orders/order-prefetch"
import { layerLinkClick, openLayer } from "./layer-nav"

export type EmailsTab = "subscribers" | "messages" | "flows" | "published" | "scheduled" | "drafts"

/** A message from a contact form on one of the creator's websites (site_contact_messages, lib/site-contact). */
export interface MessageRow {
  id: string
  email: string
  name: string | null
  subject: string | null
  message: string
  site: string | null
  page: string | null
  consent?: boolean | null
  subscriber_id?: string | null
  created_at: string
  /** When the creator opened it. Null is new. */
  read_at: string | null
}

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
  /** Where its send is: queued, sending, sent, partially_failed, failed, cancelled. */
  status?: string
  sent_at?: string
  scheduled_at?: string
  created_at: string
  updated_at?: string
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
  /** A pointer resting on a tab: its data can be read ahead. */
  onTabIntent?: (tab: EmailsTab) => void
  /** Nothing to show for this tab yet. */
  loading: boolean

  subscribers: SubscriberRow[]
  /** Buyers who are not on the list, counted as reachable from the store. */
  checkoutBuyersCount: number
  search: string
  onSearch: (q: string) => void
  onExportSubscribers: () => void
  onCopyEmail: (email: string) => void
  onRemoveSubscriber: (id: string) => void

  messages: MessageRow[]
  /** The messages table exists (its SQL part has run). */
  messagesAvailable: boolean
  /** A message's row: the message opens over the list, as a contact does. */
  onOpenMessage: (message: MessageRow) => void
  onToggleRead: (message: MessageRow) => void
  onDeleteMessage: (id: string) => void

  flows: FlowRow[]
  onToggleFlow: (flow: FlowRow) => void
  onDeleteFlow: (id: string) => void
  onDuplicateFlow: (flow: FlowRow) => void

  campaigns: CampaignRow[]
  /** Opens a sent or scheduled email's page over the list. */
  onOpenCampaign: (campaign: CampaignRow) => void
  /** A subscriber's row: their page opens over the list, as an order's does. */
  onOpenContact: (contact: SubscriberRow) => void
  /** A pointer arriving on a row, or a finger touching it: read what it opens. */
  onCampaignIntent: (campaign: CampaignRow) => void
  onDuplicateCampaign: (campaign: CampaignRow) => void
  onDeleteCampaign: (id: string) => void

  overview: OverviewStats | null
  usage: { sent: number; limit: number }
  period: RangeValue
  onPeriod: (value: RangeValue) => void
  today: string
}

export const TABS: { id: EmailsTab; label: string }[] = [
  { id: "subscribers", label: "Subscribers" },
  { id: "messages", label: "Messages" },
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

/**
 * A row that opens something: darker while pressed, by mouse or finger.
 * `data-pressed` covers a quick tap that :active alone can miss on iOS, and
 * is cleared when the finger lifts, slides off or scrolls the list.
 */
function usePress() {
  const [pressed, setPressed] = React.useState<string | null>(null)
  const hover = React.useRef(0)
  const bind = (id: string, intent?: () => void) => ({
    "data-pressed": pressed === id ? "true" : undefined,
    onPointerDown: (e: React.PointerEvent) => {
      intent?.()
      if ((e.target as HTMLElement).closest("button, input, [role=switch], [role=menu]")) return
      setPressed(id)
    },
    onPointerUp: () => setPressed(null),
    onPointerLeave: () => {
      window.clearTimeout(hover.current)
      setPressed(null)
    },
    onPointerCancel: () => setPressed(null),
    /* A pointer resting on the row, as on Orders' rows: passing over it asks for nothing. */
    onPointerEnter: (e: React.PointerEvent) => {
      if (!intent || e.pointerType !== "mouse") return
      window.clearTimeout(hover.current)
      hover.current = window.setTimeout(intent, HOVER_PREFETCH_MS)
    },
    onTouchStart: intent,
    onFocus: intent,
  })
  return bind
}

const pressable = "group cursor-pointer transition-colors duration-75 hover:bg-[#fafbfb] active:bg-[#f4f5f7] data-[pressed=true]:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]"

export function EmailsHome(props: EmailsHomeProps) {
  const { tab } = props
  const router = useRouter()
  return (
    <>
      <PaneBar width={LIST_WIDTH} className="pb-1 pt-2">
        <div className="flex min-h-[48px] items-center justify-between gap-2">
          <h1 className="shrink-0 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">Emails</h1>
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={cn(buttonSecondary, "px-2.5 sm:px-3")} data-new-automation="">
              <Plus className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="sm:hidden">Automation</span>
              <span className="hidden sm:inline">New automation</span>
            </Link>
            <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={cn(buttonAccent, "px-2.5 sm:px-3")} data-new-email="">
              <Plus className="h-4 w-4 shrink-0" />
              New email
            </Link>
          </div>
        </div>
        <Tabs tab={tab} onTab={props.onTab} onIntent={props.onTabIntent} counts={{ messages: props.messages.filter((m) => !m.read_at).length }} />
      </PaneBar>

      <div className={cn("mx-auto min-h-full pb-24 md:pb-8", LIST_WIDTH, GUTTER)} data-tab-content={tab}>
        <Metrics {...props} />

        <section aria-label={TABS.find((t) => t.id === tab)?.label ?? "Emails"} className={cn(card, "mt-4 overflow-hidden")}>
          {tab === "subscribers" ? <SubscribersTable {...props} /> : null}
          {tab === "messages" ? <MessagesTable {...props} /> : null}
          {tab === "flows" ? <FlowsTable {...props} /> : null}
          {tab === "published" || tab === "scheduled" || tab === "drafts" ? <CampaignsTable {...props} /> : null}
        </section>
      </div>
    </>
  )
}

/* ─── The tabs, in the bar ───────────────────────────────────────────── */

function Tabs({ tab, onTab, onIntent, counts }: { tab: EmailsTab; onTab: (t: EmailsTab) => void; onIntent?: (t: EmailsTab) => void; counts?: Partial<Record<EmailsTab, number>> }) {
  const stripRef = React.useRef<HTMLDivElement>(null)
  /* The chosen tab scrolled into view on a phone, without moving the page. */
  React.useLayoutEffect(() => {
    const strip = stripRef.current
    const el = strip?.querySelector<HTMLElement>(`[data-tab="${tab}"]`)
    if (!strip || !el) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft) strip.scrollLeft = left - 8
    else if (left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + el.offsetWidth - strip.clientWidth + 8
  }, [tab])
  return (
    <div ref={stripRef} role="tablist" aria-label="Views" className="orders-strip -mx-1 flex h-11 items-center gap-0.5 overflow-x-auto px-1" data-email-tabs="">
      {TABS.map((t) => {
        const active = t.id === tab
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={active}
            onClick={() => onTab(t.id)}
            onPointerEnter={() => onIntent?.(t.id)}
            onTouchStart={() => onIntent?.(t.id)}
            className={cn(
              "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-colors duration-100 [-webkit-tap-highlight-color:transparent]",
              active ? "bg-[#e8e9ec] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2] active:bg-[#e8e9ec]",
            )}
          >
            {t.label}
            {/* New messages, counted in the tab's own quiet type: a number, not a pill. */}
            {counts?.[t.id] ? <span className="ml-1.5 tabular-nums text-[#8b5cf6]" data-tab-count="">{counts[t.id]}</span> : null}
          </button>
        )
      })}
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

/**
 * ONE STRIP, THE SAME HEIGHT ON EVERY TAB, so the table under it starts at
 * the same place whichever tab is open and nothing below the bar moves
 * because of a tab switch alone. The Sent tab's period is the strip's first
 * cell, not a row of its own above it.
 */
function Metrics(props: EmailsHomeProps) {
  const readings = readingsFor(props)
  /* Figures that were waited for fade in when they come; a tab read from
     the cache draws its figures at once. */
  const [waitedOn, setWaitedOn] = React.useState<EmailsTab | null>(props.loading ? props.tab : null)
  if (props.loading && waitedOn !== props.tab) setWaitedOn(props.tab)
  if (!props.loading && waitedOn !== null && waitedOn !== props.tab) setWaitedOn(null)
  const waited = waitedOn === props.tab
  return (
    <section aria-label="Email metrics" className={cn(card, "mt-4 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {props.tab === "published" ? (
          <div className="flex min-w-[150px] shrink-0 flex-col px-4 py-3">
            <span className="text-[12px] font-medium text-[#4b5563]">Period</span>
            <div className="mt-1 flex h-6 items-center">
              <DateRangePicker value={props.period} onChange={props.onPeriod} today={props.today} className="-ml-1.5 h-7 px-1.5" />
            </div>
          </div>
        ) : null}
        {readings.map((r, i) => (
          <div key={r.label} className={cn("flex min-w-[140px] flex-1 shrink-0 flex-col px-4 py-3", (i > 0 || props.tab === "published") && "border-l border-[#eef0f2]")}>
            <HelpLabel label={r.label} description={r.help} className="whitespace-nowrap text-[12px] font-medium text-[#4b5563]" />
            <div className="mt-1 flex h-6 items-baseline gap-2">
              {/* A light gray shape until the figure is in. */}
              {props.loading ? (
                <ShimmerBlock className="shimmer-wait h-3.5 w-12 self-center rounded-full" />
              ) : (
                <span className={cn("truncate text-[16px] font-semibold tabular-nums text-[#1a1a2e]", waited && "shimmer-enter")}>{r.value}</span>
              )}
              {r.note && !props.loading ? <span className={cn("truncate text-[12px] tabular-nums text-[#6b7280]", waited && "shimmer-enter")}>{r.note}</span> : null}
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
    /* Buyers who never asked for news: the ones kept as contacts, and the
       ones who bought before contacts were kept (checkoutBuyersCount). */
    const customers = p.subscribers.filter((s) => s.status === "customer").length + p.checkoutBuyersCount
    return [
      { label: "Subscribers", help: "People on your list. Your emails go to them.", value: n(on.length) },
      { label: "From your website", help: "People who signed up on a website you built with Storelib.", value: n(fromSites) },
      { label: "From Storelib", help: "People who signed up on your Storelib profile, a product page or your OnePage.", value: n(fromStorelib) },
      { label: "At checkout", help: "Buyers who asked to hear from you when they paid.", value: n(fromCheckout) },
      { label: "Customers", help: "Buyers who did not ask for news. They get emails about what they bought, never one you send to your list.", value: n(customers) },
      { label: "Unsubscribed", help: "People who asked to stop getting your emails. They are never sent another.", value: n(p.subscribers.filter((s) => s.status === "unsubscribed").length) },
    ]
  }
  if (p.tab === "messages") {
    const week = Date.now() - 7 * 86_400_000
    return [
      { label: "Messages", help: "Messages people sent through the contact form on your website. Each one is emailed to you too.", value: n(p.messages.length) },
      { label: "New", help: "Messages you have not opened here yet.", value: n(p.messages.filter((m) => !m.read_at).length) },
      { label: "Last 7 days", help: "Messages sent in the last seven days.", value: n(p.messages.filter((m) => Date.parse(m.created_at) >= week).length) },
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
  if (p.tab === "published") {
    /* While the answer is on its way the figures are light gray shapes
       (Metrics). An answer without them says so with a dash, never a zero
       that was not counted. */
    const o = p.overview
    const used = p.usage.limit > 0 ? Math.min(100, Math.round((p.usage.sent / p.usage.limit) * 100)) : 0
    return [
      { label: "Sent", help: "Emails delivered to subscribers in this period.", value: o ? n(o.total_sent) : "–" },
      { label: "Open rate", help: "Of the emails sent in this period, how many were opened.", value: o ? `${o.open_rate}%` : "–", note: o ? n(o.total_opened) : undefined },
      { label: "Click rate", help: "Of the emails sent in this period, how many had a link clicked.", value: o ? `${o.click_rate}%` : "–", note: o ? n(o.total_clicked) : undefined },
      { label: "Unsubscribed", help: "People who unsubscribed from an email sent in this period.", value: o ? n(o.total_unsubscribed) : "–" },
      { label: "This month", help: "Emails sent this calendar month, against your plan's monthly limit.", value: n(p.usage.sent), note: `of ${n(p.usage.limit)} · ${used}%` },
    ]
  }
  if (p.tab === "scheduled") {
    const next = p.campaigns.map((c) => c.scheduled_at).filter((x): x is string => !!x).sort()[0]
    return [
      { label: "Scheduled", help: "Emails waiting to go out.", value: n(p.campaigns.length) },
      { label: "Next goes out", help: "When the next scheduled email is sent.", value: next ? formatWhen(next) : "–" },
      { label: "Recipients", help: "About how many people the scheduled emails go to, counted when each was scheduled.", value: n(p.campaigns.reduce((t, c) => t + (c.audience_count ?? 0), 0)) },
    ]
  }
  const last = p.campaigns.map((c) => c.updated_at ?? c.created_at).filter(Boolean).sort().at(-1)
  return [
    { label: "Drafts", help: "Emails you started and have not sent.", value: n(p.campaigns.length) },
    { label: "Last edited", help: "When a draft was last changed.", value: last ? formatDay(last) : "–" },
  ]
}

/* ─── Tables ─────────────────────────────────────────────────────────── */

const th = "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-[#4b5563]"
const td = "h-12 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]"
/**
 * The first column holds still while the rest scrolls under it, on a phone,
 * on the row's own opaque colour (hover and press included) so nothing shows
 * through it. Its cells carry `data-scroll-edge`: the table's frame draws the
 * shadow at their right side once the rows have moved
 * (components/app/scroll-edge).
 */
const sticky = "orders-sticky sticky left-0 z-[1] bg-white transition-colors duration-75 group-hover:bg-[#fafbfb] group-active:bg-[#f4f5f7] group-data-[pressed=true]:bg-[#f4f5f7]"
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

/** A send that is not simply done says so, in the tone of how much it needs the creator. */
function SendBadge({ status }: { status?: string }) {
  if (status === "queued" || status === "sending") return <StatusBadge tone="attention">Sending</StatusBadge>
  if (status === "partially_failed") return <StatusBadge tone="critical">Partly sent</StatusBadge>
  if (status === "failed") return <StatusBadge tone="critical">Not sent</StatusBadge>
  if (status === "cancelled") return <StatusBadge tone="neutral">Stopped</StatusBadge>
  return null
}

function SubscriberStatus({ s }: { s: SubscriberRow }) {
  const label = contactStatusLabel(s)
  return <StatusBadge tone={label === "Resubscribed" ? "attention" : label === "Subscribed" ? "success" : "neutral"}>{label}</StatusBadge>
}

/** The Status filter's groups: a customer is its own, bounced and spam go with the ones who left. */
const STATUS_GROUPS: Array<{ value: string; label: string; match: (status: string) => boolean }> = [
  { value: "subscribed", label: "Subscribed", match: (s) => s === "subscribed" },
  { value: "customer", label: "Customers", match: (s) => s === "customer" },
  /* People who wrote through a website's contact form and did not ask for news. */
  { value: "wrote", label: "Wrote to you", match: (s) => s === "wrote" },
  { value: "unsubscribed", label: "Unsubscribed", match: (s) => s !== "subscribed" && s !== "customer" && s !== "wrote" },
]

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
  const [status, setStatus] = React.useState("")
  const press = usePress()
  /*
    A contact's page opens with its content already in it: the tap waits
    for the contact's automation runs (asked for when the finger landed), at
    most a moment, and then opens it (./contact-detail). The row stays
    pressed while it waits. The latest tap wins.
  */
  const opening = React.useRef<SubscriberRow | null>(null)
  const [waiting, setWaiting] = React.useState<string | null>(null)
  const openContact = (s: SubscriberRow) => {
    opening.current = s
    setWaiting(s.id)
    void contactReady(s.email).then(() => {
      if (opening.current !== s) return
      opening.current = null
      setWaiting(null)
      props.onOpenContact(s)
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
          (!source || views.get(s.id)?.key === source) &&
          (!status || !!STATUS_GROUPS.find((g) => g.value === status)?.match(s.status)),
      ),
    [props.subscribers, q, source, status, views],
  )
  React.useEffect(() => setPage(1), [q, source, status])
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const shown = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const sourceName = source ? sources.find((o) => o.value === source)?.label ?? null : null
  const statuses = React.useMemo(
    () =>
      STATUS_GROUPS.map((g) => {
        const n = props.subscribers.filter((s) => g.match(s.status)).length
        return { value: g.value, label: g.label, hint: `${n.toLocaleString("en-US")} ${n === 1 ? "contact" : "contacts"}` }
      }),
    [props.subscribers],
  )
  const statusName = status ? STATUS_GROUPS.find((g) => g.value === status)?.label ?? null : null

  return (
    <>
      {/* One toolbar row, always the same height: the source filter and the tools, or the search. */}
      <div className="flex h-12 items-center gap-2 border-b border-[#eef0f2] px-2">
        {searching ? (
          <>
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[#d5d7dd] bg-white px-2.5 transition-[border-color,box-shadow] duration-150 focus-within:border-[#c9ccd3] focus-within:shadow-[0_0_0_3px_rgba(17,17,19,0.06)]">
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
          </>
        ) : (
          <>
            <div className="orders-strip flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1">
              {props.subscribers.length > 0 ? (
                <>
                  <FilterChip label="Status" value={statusName} options={[{ value: "", label: "Any status" }, ...statuses]} selected={status} onSelect={setStatus} />
                  <FilterChip label="Source" value={sourceName} options={[{ value: "", label: "Any source" }, ...sources]} selected={source} onSelect={setSource} />
                </>
              ) : null}
            </div>
            <button type="button" aria-label="Search subscribers" className={iconButton} onClick={() => setSearching(true)}>
              <Search className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Export subscribers" className={iconButton} onClick={props.onExportSubscribers}>
              <Download className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : rows.length === 0 ? (
          q || source || status ? (
            <Empty title="No subscribers match" body="Try another email or name, or another source." />
          ) : (
            <Empty title="No subscribers yet" body="People who sign up on your website, your Storelib profile or your OnePage show up here, and so do buyers who ask to hear from you." />
          )
        ) : (
          <ScrollEdge>
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead, "w-px")}>Email</th>
                  <th className={th}>Name</th>
                  <th className={th}>Source</th>
                  <th className={th}>Status</th>
                  <th className={th}>Added</th>
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
                      data-order-id={s.id}
                      className={cn("orders-row", pressable)}
                      onClick={() => openContact(s)}
                      {...press(s.id, () => prefetchContact(s.email))}
                      {...(waiting === s.id ? { "data-pressed": "true" } : null)}
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
    </>
  )
}

/** "maralind.storelib.com/contact": where on which website a message was written. */
export function messageWhere(m: Pick<MessageRow, "site" | "page">): string {
  const page = m.page && m.page !== "home" ? `/${m.page}` : ""
  return m.site ? `${m.site}${page}` : page ? page.slice(1) : ""
}

/** A reply in the creator's own mail app, to the person who wrote, on the same subject. */
export function replyHref(m: Pick<MessageRow, "email" | "subject">): string {
  const subject = m.subject ? `?subject=${encodeURIComponent(`Re: ${m.subject}`)}` : ""
  return `mailto:${encodeURIComponent(m.email)}${subject}`
}

/**
 * THE MESSAGES. What people wrote through the contact form on the creator's
 * websites, newest first, as Shopify keeps a store's contact form messages
 * in its inbox: who, what about, where, when, and new ones in bold with the
 * accent's dot. A row opens the message over the list (./message-detail);
 * its menu replies in the creator's own mail app, marks it read or new, and
 * deletes it.
 */
function MessagesTable(props: EmailsHomeProps) {
  const press = usePress()
  const [page, setPage] = React.useState(1)
  const pages = Math.max(1, Math.ceil(props.messages.length / PAGE_SIZE))
  const shown = props.messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.messages.length === 0 ? (
          <Empty
            title="No messages yet"
            body={
              props.messagesAvailable
                ? "When somebody writes to you through the contact form on your website, the message shows here and in your email."
                : "Messages from your website's contact form are emailed to you. They show here once Storelib has finished setting this up."
            }
          />
        ) : (
          <ScrollEdge>
            <table className="w-full min-w-[720px] border-collapse" data-messages-table="">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead, "w-px")}>From</th>
                  <th className={th}>Message</th>
                  <th className={th}>Sent from</th>
                  <th className={th}>Received</th>
                  <th className={cn(th, "w-12")} aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {shown.map((m) => {
                  const fresh = !m.read_at
                  const who = m.name || m.email
                  const preview = m.message.replace(/\s+/g, " ").trim()
                  return (
                    <tr
                      key={m.id}
                      data-message-row={m.id}
                      data-unread={fresh ? "true" : undefined}
                      data-order-id={m.id}
                      className={cn("orders-row", pressable)}
                      onClick={() => props.onOpenMessage(m)}
                      {...press(m.id)}
                    >
                      <td data-scroll-edge="" className={cn(td, sticky)}>
                        <span className="flex max-w-[180px] items-center gap-2 sm:max-w-[240px]">
                          {fresh ? <span aria-label="New" className="h-2 w-2 shrink-0 rounded-full bg-[#8b5cf6]" /> : <span aria-hidden className="w-2 shrink-0" />}
                          <span className={cn("truncate", fresh ? "font-semibold" : "font-medium")}>{who}</span>
                        </span>
                      </td>
                      <td className={td}>
                        <span className="flex max-w-[420px] items-baseline gap-1.5">
                          {m.subject ? <span className={cn("max-w-[200px] shrink-0 truncate", fresh ? "font-semibold" : "font-medium")}>{m.subject}</span> : null}
                          <span className="min-w-0 truncate text-[#6b7280]">{preview}</span>
                        </span>
                      </td>
                      <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[220px] truncate">{messageWhere(m) || "–"}</span></td>
                      <td className={cn(td, "tabular-nums text-[#4b5563]")}>{formatWhen(m.created_at)}</td>
                      <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                        <ResponsiveActionMenu
                          title={who}
                          align="end"
                          trigger={<RowMenuButton label={`Actions for the message from ${who}`} />}
                          items={[
                            { label: "Open", onClick: () => props.onOpenMessage(m) },
                            { label: "Reply", onClick: () => { window.location.href = replyHref(m) } },
                            { label: fresh ? "Mark as read" : "Mark as new", onClick: () => props.onToggleRead(m) },
                            { label: "Copy email", onClick: () => props.onCopyEmail(m.email) },
                            { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteMessage(m.id) },
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
      <Pager page={page} pages={pages} total={props.messages.length} onPage={setPage} />
    </>
  )
}

/**
 * THE AUTOMATIONS. From 768px a table, one column per number. On a phone a
 * table of eight columns is a strip to scroll sideways with the name cut to
 * "Welcome ser...", so there each automation is a row of its own: the name
 * in full, what starts it, its steps and what it has done, with its switch
 * and its menu at the end, where a thumb is. Tapping the row opens it.
 */
function FlowsTable(props: EmailsHomeProps) {
  const router = useRouter()
  const press = usePress()
  const href = (f: FlowRow) => `/app/emails/flow/${f.id}`
  const menu = (f: FlowRow, on: boolean): ActionMenuItem[] => [
    { label: "Edit", onClick: () => openLayer(router, href(f)) },
    { label: on ? "Turn off" : "Turn on", onClick: () => props.onToggleFlow(f) },
    { label: "Duplicate", onClick: () => props.onDuplicateFlow(f) },
    { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteFlow(f.id) },
  ]
  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.flows.length === 0 ? (
          <Empty
            title="No automations yet"
            body="Start from a welcome series, a thank you after a purchase, or your own. Each one is off until you turn it on."
            action={
              <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={buttonAccent}>
                <Plus className="h-4 w-4" />
                Create an automation
              </Link>
            }
          />
        ) : (
          <>
            <ul aria-label="Automations" className="divide-y divide-[#f1f2f4] md:hidden" data-flow-list="">
              {props.flows.map((f) => {
                const trigger = isTriggerType(f.trigger_type) ? TRIGGERS[f.trigger_type].sentence : "Not set"
                const on = f.status === "active"
                const t = f.totals
                const numbers = t ? [t.in_progress > 0 ? `${t.in_progress.toLocaleString("en-US")} in progress` : null, `${t.sent.toLocaleString("en-US")} sent`, t.sent > 0 ? `${rate(t.opened, t.sent)} opened` : null].filter(Boolean).join(" · ") : null
                return (
                  <li
                    key={f.id}
                    className={cn(pressable, "flex min-h-[72px] items-center gap-3 py-3 pl-4 pr-2")}
                    data-flow-row={f.id}
                    onClick={() => openLayer(router, href(f))}
                    {...press(f.id, () => router.prefetch(href(f)))}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={href(f)} prefetch={false} className="min-w-0 break-words text-[15px] font-semibold leading-5 text-[#1a1a2e] outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                          {f.name}
                        </Link>
                        {t && t.failed > 0 ? <StatusBadge tone="critical">{t.failed} failed</StatusBadge> : null}
                      </p>
                      <p className="mt-0.5 text-[13px] leading-[18px] text-[#4b5563]">{trigger}</p>
                      <p className="mt-0.5 text-[12px] leading-4 tabular-nums text-[#6b7280]">
                        {stepSummary(normalizeSteps(f.steps))}
                        {numbers ? ` · ${numbers}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <span className="flex h-11 items-center px-1.5">
                        <Switch checked={on} onCheckedChange={() => props.onToggleFlow(f)} aria-label={`Send ${f.name} automatically`} />
                      </span>
                      <ResponsiveActionMenu title={f.name} align="end" trigger={<RowMenuButton label={`Actions for ${f.name}`} className="h-11 w-11" />} items={menu(f, on)} />
                    </div>
                  </li>
                )
              })}
            </ul>
            <ScrollEdge frameClassName="max-md:hidden">
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
                      <tr key={f.id} className={pressable} data-flow-row={f.id} onClick={() => openLayer(router, href(f))} {...press(f.id, () => router.prefetch(href(f)))}>
                        <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}>
                          <span className="flex max-w-[180px] items-center gap-2 sm:max-w-[260px]">
                            <Link href={href(f)} prefetch={false} className="truncate outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                              {f.name}
                            </Link>
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
                          <ResponsiveActionMenu title={f.name} align="end" trigger={<RowMenuButton label={`Actions for ${f.name}`} />} items={menu(f, on)} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </ScrollEdge>
          </>
        )}
      </ShimmerSwap>
    </>
  )
}

function CampaignsTable(props: EmailsHomeProps) {
  const { tab } = props
  const router = useRouter()
  const press = usePress()
  const sent = tab === "published"
  const drafts = tab === "drafts"
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
  const open = (c: CampaignRow) => (drafts ? openLayer(router, `/app/emails/edit/${c.id}`) : props.onOpenCampaign(c))

  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.campaigns.length === 0 ? (
          <Empty
            {...empty}
            action={
              <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={buttonSecondary}>
                <Plus className="h-4 w-4" />
                New email
              </Link>
            }
          />
        ) : (
          <ScrollEdge>
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead)}>Subject</th>
                  <th className={th}>{sent ? "Sent" : tab === "scheduled" ? "Goes out" : "Edited"}</th>
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
                  const title = (c.subject ?? "").replace(/\s*\(Resend\)\s*$/, "") || "Untitled"
                  const items: ActionMenuItem[] = drafts
                    ? [
                        { label: "Edit", onClick: () => open(c) },
                        { label: "Duplicate", onClick: () => props.onDuplicateCampaign(c) },
                        { label: "Delete", variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) },
                      ]
                    : [
                        { label: sent ? "View results" : "Open", onClick: () => open(c) },
                        ...(tab === "scheduled" ? [{ label: "Edit", onClick: () => openLayer(router, `/app/emails/edit/${c.id}`) }] : []),
                        { label: "Duplicate", onClick: () => props.onDuplicateCampaign(c) },
                        ...(c.status === "queued" || c.status === "sending" ? [] : [{ label: "Delete", variant: "destructive" as const, separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) }]),
                      ]
                  return (
                    <tr key={c.id} className={cn("orders-row", pressable)} data-campaign-row={c.id} data-order-id={c.id} onClick={() => open(c)} {...press(c.id, () => props.onCampaignIntent(c))}>
                      <td data-scroll-edge="" className={cn(td, sticky)}>
                        {/* The limit is on the span: a table cell's own max-width is ignored.
                            Narrow on a phone, so the columns scrolling under it still show. */}
                        <span className="flex min-w-0 max-w-[180px] items-center gap-2 sm:max-w-[320px]">
                          <span className="truncate font-medium">{title}</span>
                          {resent ? <StatusBadge tone="neutral">Sent again</StatusBadge> : null}
                          {sent ? <SendBadge status={c.status} /> : null}
                        </span>
                      </td>
                      <td className={cn(td, "tabular-nums text-[#4b5563]")}>
                        {sent ? formatDay(c.sent_at) : tab === "scheduled" ? formatWhen(c.scheduled_at) : formatDay(c.updated_at ?? c.created_at)}
                      </td>
                      <td className={cn(td, "text-right tabular-nums")}>{recipients ? recipients.toLocaleString("en-US") : "–"}</td>
                      {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_opens ?? 0, recipients)}</td> : null}
                      {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_clicks ?? 0, recipients)}</td> : null}
                      <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                        <ResponsiveActionMenu title={title} align="end" trigger={<RowMenuButton label={`Actions for ${title}`} />} items={items} />
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
