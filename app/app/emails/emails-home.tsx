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
import { SegmentedPills } from "@/components/app/segmented-pills"
import { EDGE_FADE_FIRST, useEdgeFade } from "@/components/app/use-edge-fade"
import { GUTTER, LIST_WIDTH, MenuOption, MenuSurface, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { HOVER_PREFETCH_MS } from "../orders/order-prefetch"
import { layerLinkClick, openLayer } from "./layer-nav"
import { CustomerEmailsPanel, type CustomerEmailsData } from "@/components/app/settings/customer-emails-panel"
import { emailsOf } from "@/lib/emails/customer-catalog"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"

export type EmailsTab = "subscribers" | "messages" | "flows" | "customer" | "published" | "scheduled" | "drafts"

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
  /** The Customer emails tab's read (the store, its saved words), when it has come. */
  customerEmails?: CustomerEmailsData | null
  /** Physical commerce is on: the shipping, pickup and return emails are listed too. */
  physical: boolean
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
  { id: "subscribers", get label() { return tt("Subscribers") } },
  { id: "messages", get label() { return tt("Messages") } },
  { id: "flows", get label() { return tt("Automations") } },
  { id: "customer", get label() { return tt("Customer emails") } },
  { id: "published", get label() { return tt("Sent") } },
  { id: "scheduled", get label() { return tt("Scheduled") } },
  { id: "drafts", get label() { return tt("Drafts") } },
]

const PAGE_SIZE = 50

function formatDay(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }))
}

function formatWhen(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return `${formatDay(iso)}, ${d.toLocaleTimeString(appLocale(), zoned({ hour: "numeric", minute: "2-digit" }))}`
}

function rate(part: number, whole: number): string {
  if (!whole) return "–"
  return `${Math.round((part / whole) * 1000) / 10}%`
}

/**
 * A row that opens something: darker while pressed, by mouse or finger.
 * `data-pressed` covers a quick tap that :active alone can miss on iOS, and
 * is cleared when the finger lifts, slides off or scrolls the list. A finger
 * darkens a row only after 120ms still on it (round 24, the owner: rows lit
 * up under a scrolling finger): a scroll cancels the pointer before then.
 */
function usePress() {
  /*
    WRITTEN ON THE ROW, NOT KEPT IN STATE (round 25). A press held in React
    state drew the whole table again on the way down, again on the way up
    and again as a contact waited to open: on a computer one long task of
    290 to 350ms from the click to the contact's page, with the pointer's up
    and its click queued behind it (scripts/check-emails-r24.mjs). The tint
    is one attribute on one row, as order-motion's markRow writes the picked
    one, and nothing is drawn again.
  */
  const hover = React.useRef(0)
  const touch = React.useRef(0)
  const held = React.useRef<HTMLElement | null>(null)
  const lift = () => {
    window.clearTimeout(touch.current)
    const el = held.current
    held.current = null
    if (el && !el.hasAttribute("data-waiting")) delete el.dataset.pressed
  }
  const bind = (_id: string, intent?: () => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      intent?.()
      if ((e.target as HTMLElement).closest("button, input, [role=switch], [role=menu]")) return
      window.clearTimeout(touch.current)
      const el = e.currentTarget
      held.current = el
      if (e.pointerType === "touch") touch.current = window.setTimeout(() => { if (held.current === el) el.dataset.pressed = "true" }, 120)
      else el.dataset.pressed = "true"
    },
    onPointerUp: lift,
    onPointerLeave: () => {
      window.clearTimeout(hover.current)
      lift()
    },
    onPointerCancel: lift,
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

/*
  ONE OF THE TWO LISTS IS DRAWN (round 25). A phone's rows and a computer's
  table were both rendered, one hidden by CSS: every draw of a tab (a press,
  a contact opening over it) built a hundred rows for fifty. Once the page
  knows its width it draws only the one that shows; before then (the
  server's markup, the first paint) both are there and CSS picks, so
  nothing flashes. null until known.
*/
const NARROW = "(max-width: 639px)"
function useNarrow(): boolean | null {
  return React.useSyncExternalStore(
    (changed) => {
      const m = window.matchMedia(NARROW)
      m.addEventListener("change", changed)
      return () => m.removeEventListener("change", changed)
    },
    () => window.matchMedia(NARROW).matches,
    () => null,
  )
}

const pressable = "group cursor-pointer transition-colors duration-75 hover:bg-[#fafbfb] pointer-fine:active:bg-[#f4f5f7] data-[pressed=true]:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]"

/**
 * A ROW ON A PHONE, AS ORDERS DRAWS ONE (app/app/orders/orders-list.tsx
 * PhoneRow): what it is and its figure on top at 17px, a line under it at
 * 15px, a quiet line at 14px, then its badges; its menu at the end, where a
 * thumb is. A table to swipe sideways stays a computer's.
 */
function PhoneItem({ head, aside, line, meta, badges, menu, ...row }: { head: React.ReactNode; aside?: React.ReactNode; line?: React.ReactNode; meta?: React.ReactNode; badges?: React.ReactNode; menu: React.ReactNode } & React.LiHTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string | undefined>) {
  return (
    <li {...row} className={cn("orders-row", pressable, "flex items-center gap-1 py-3 pl-4 pr-1.5")} data-email-phone-row="">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <div className="min-w-0 truncate text-[17px] font-semibold leading-6 text-[#1a1a2e]">{head}</div>
          {aside ? <span className="shrink-0 text-[14px] tabular-nums text-[#6b7280]">{aside}</span> : null}
        </div>
        {line ? <div className="mt-0.5 truncate text-[15px] leading-5 text-[#303036]">{line}</div> : null}
        {meta ? <div className="mt-0.5 truncate text-[14px] leading-5 text-[#6b7280]">{meta}</div> : null}
        {badges ? <div className="mt-1.5 flex flex-wrap gap-1.5">{badges}</div> : null}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {menu}
      </div>
    </li>
  )
}

export function EmailsHome(props: EmailsHomeProps) {
  const { tab } = props
  const router = useRouter()
  return (
    <>
      <PaneBar width={LIST_WIDTH} sticky className="pb-1 pt-2">
        <div className="flex min-h-[48px] items-center justify-between gap-2">
          <h1 className="shrink-0 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Emails")}</h1>
          <div className="flex min-w-0 items-center gap-2">
            <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={cn(buttonSecondary, "px-2.5 sm:px-3")} data-new-automation="">
              <Plus className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="sm:hidden">{tt("Automation")}</span>
              <span className="hidden sm:inline">{tt("New automation")}</span>
            </Link>
            <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={cn(buttonAccent, "px-2.5 sm:px-3")} data-new-email="">
              <Plus className="h-4 w-4 shrink-0" />
              {tt("New email")}
            </Link>
          </div>
        </div>
        <Tabs tab={tab} onTab={props.onTab} onIntent={props.onTabIntent} counts={{ messages: props.messages.filter((m) => !m.read_at).length }} />
      </PaneBar>

      <div className={cn("mx-auto min-h-full pb-24 md:pb-8", LIST_WIDTH, GUTTER)} style={{ minHeight: "var(--pane-h, 100%)" }} data-tab-content={tab}>
        <Metrics {...props} />

        <section aria-label={TABS.find((t) => t.id === tab)?.label ?? tt("Emails")} className={cn(card, "mt-4 overflow-hidden")}>
          {tab === "subscribers" ? <SubscribersTable {...props} /> : null}
          {tab === "messages" ? <MessagesTable {...props} /> : null}
          {tab === "flows" ? <FlowsTable {...props} /> : null}
          {/* The emails buyers and members get, in three families: the same list, editor and saved words as Settings › Customer emails. */}
          {tab === "customer" ? <CustomerEmailsPanel bare /> : null}
          {tab === "published" || tab === "scheduled" || tab === "drafts" ? <CampaignsTable {...props} /> : null}
        </section>
      </div>
    </>
  )
}

/* ─── The tabs, in the bar ───────────────────────────────────────────── */

function Tabs({ tab, onTab, onIntent, counts }: { tab: EmailsTab; onTab: (t: EmailsTab) => void; onIntent?: (t: EmailsTab) => void; counts?: Partial<Record<EmailsTab, number>> }) {
  /* Analytics' sliding pill (round 24, the owner: "the pill shapes of the analytics"); the strip scrolls sideways on a phone and keeps the chosen one in view. */
  /* Wider than a phone: the end with more fades instead of a label cut mid word at the track's rounded end (components/app/use-edge-fade). */
  const host = useEdgeFade<HTMLDivElement>("[data-segmented-pills]", tab)
  return (
    <div ref={host} className="flex h-11 items-center" data-email-tabs="">
      <SegmentedPills
        className={EDGE_FADE_FIRST}
        label={tt("Views")}
        value={tab}
        onChange={onTab}
        onIntent={onIntent}
        options={TABS.map((t) => ({
          value: t.id,
          label: (
            <>
              {t.label}
              {/* New messages, counted in the tab's own quiet type: a number, not a pill. */}
              {counts?.[t.id] ? <span className="ml-1.5 tabular-nums text-[#8b5cf6]" data-tab-count="">{counts[t.id]}</span> : null}
            </>
          ),
        }))}
      />
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
    <section aria-label={tt("Email metrics")} className={cn(card, "mt-4 overflow-hidden")}>
      <div className="orders-strip flex overflow-x-auto">
        {props.tab === "published" ? (
          <div className="flex min-w-[150px] shrink-0 flex-col px-4 py-3">
            <span className="text-[12px] font-medium text-[#4b5563]">{tt("Period")}</span>
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
  const n = (v: number) => Math.round(v).toLocaleString(appLocale())
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
      { label: tt("Subscribers"), help: tt("People on your list. Your emails go to them."), value: n(on.length) },
      { label: tt("From your website"), help: tt("People who signed up on a website you built with Storelib."), value: n(fromSites) },
      { label: tt("From Storelib"), help: tt("People who signed up on your Storelib profile, a product page or your OnePage."), value: n(fromStorelib) },
      { label: tt("At checkout"), help: tt("Buyers who asked to hear from you when they paid."), value: n(fromCheckout) },
      { label: tt("Customers"), help: tt("Buyers who did not ask for news. They get emails about what they bought, never one you send to your list."), value: n(customers) },
      { label: tt("Unsubscribed"), help: tt("People who asked to stop getting your emails. They are never sent another."), value: n(p.subscribers.filter((s) => s.status === "unsubscribed").length) },
    ]
  }
  if (p.tab === "messages") {
    const week = Date.now() - 7 * 86_400_000
    return [
      { label: tt("Messages"), help: tt("Messages people sent through the contact form on your website. Each one is emailed to you too."), value: n(p.messages.length) },
      { label: tt("New"), help: tt("Messages you have not opened here yet."), value: n(p.messages.filter((m) => !m.read_at).length) },
      { label: tt("Last 7 days"), help: tt("Messages sent in the last seven days."), value: n(p.messages.filter((m) => Date.parse(m.created_at) >= week).length) },
    ]
  }
  if (p.tab === "flows") {
    const sum = (k: keyof FlowTotals) => p.flows.reduce((total, f) => total + (f.totals?.[k] ?? 0), 0)
    const sent = sum("sent")
    return [
      { label: tt("On"), help: tt("Automations that are sending."), value: `${p.flows.filter((f) => f.status === "active").length} of ${p.flows.length}` },
      { label: tt("In progress"), help: tt("People partway through an automation right now."), value: n(sum("in_progress")) },
      { label: tt("Emails sent"), help: tt("Every email your automations have sent."), value: n(sent) },
      { label: tt("Open rate"), help: tt("Of the emails your automations sent, how many were opened. Some mail apps hide opens, so this is a floor."), value: sent ? `${Math.round((sum("opened") / sent) * 1000) / 10}%` : "–" },
    ]
  }
  if (p.tab === "customer") {
    const c = p.customerEmails
    /* Every family the list shows: digital products, physical products while they are on, communities when there is one. */
    const listed = emailsOf("all", p.physical).filter((e) => e.family !== "communities" || (c?.communities?.length ?? 0) > 0)
    return [
      { label: tt("Emails"), help: tt("The emails your buyers and members get: digital products, physical products and communities, each apart."), value: n(listed.length) },
      { label: tt("Edited"), help: tt("Emails you changed the words of. The rest go out with the default words."), value: c ? n(listed.filter((e) => c.copy[e.id]).length) : "–" },
      { label: tt("Replies go to"), help: tt("Your store's contact email, from Settings › Store details. A buyer who answers an email writes to it."), value: c?.shop.supportEmail || "–" },
    ]
  }
  if (p.tab === "published") {
    /* While the answer is on its way the figures are light gray shapes
       (Metrics). An answer without them says so with a dash, never a zero
       that was not counted. */
    const o = p.overview
    const used = p.usage.limit > 0 ? Math.min(100, Math.round((p.usage.sent / p.usage.limit) * 100)) : 0
    return [
      { label: tt("Sent"), help: tt("Emails delivered to subscribers in this period."), value: o ? n(o.total_sent) : "–" },
      { label: tt("Open rate"), help: tt("Of the emails sent in this period, how many were opened."), value: o ? `${o.open_rate}%` : "–", note: o ? n(o.total_opened) : undefined },
      { label: tt("Click rate"), help: tt("Of the emails sent in this period, how many had a link clicked."), value: o ? `${o.click_rate}%` : "–", note: o ? n(o.total_clicked) : undefined },
      { label: tt("Unsubscribed"), help: tt("People who unsubscribed from an email sent in this period."), value: o ? n(o.total_unsubscribed) : "–" },
      { label: tt("This month"), help: tt("Emails sent this calendar month, against your plan's monthly limit."), value: n(p.usage.sent), note: tt("of {limit} · {used}%", { limit: n(p.usage.limit), used }) },
    ]
  }
  if (p.tab === "scheduled") {
    const next = p.campaigns.map((c) => c.scheduled_at).filter((x): x is string => !!x).sort()[0]
    return [
      { label: tt("Scheduled"), help: tt("Emails waiting to go out."), value: n(p.campaigns.length) },
      { label: tt("Next goes out"), help: tt("When the next scheduled email is sent."), value: next ? formatWhen(next) : "–" },
      { label: tt("Recipients"), help: tt("About how many people the scheduled emails go to, counted when each was scheduled."), value: n(p.campaigns.reduce((t, c) => t + (c.audience_count ?? 0), 0)) },
    ]
  }
  const last = p.campaigns.map((c) => c.updated_at ?? c.created_at).filter(Boolean).sort().at(-1)
  return [
    { label: tt("Drafts"), help: tt("Emails you started and have not sent."), value: n(p.campaigns.length) },
    { label: tt("Last edited"), help: tt("When a draft was last changed."), value: last ? formatDay(last) : "–" },
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
  return <ShimmerRows rows={5} header cols={["34%", "16%", "14%", "10%"]} label={tt("Loading")} />
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(total, page * PAGE_SIZE)
  return (
    <div className="flex h-12 items-center justify-between border-t border-[#eef0f2] px-3 text-[13px] text-[#4b5563]">
      <span className="tabular-nums">
        {tt("{value}–{value2} of {value3}", { value: from.toLocaleString(appLocale()), value2: to.toLocaleString(appLocale()), value3: total.toLocaleString(appLocale()) })}
      </span>
      <div className="flex gap-1">
        <button type="button" className={buttonSecondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {tt("Previous")}
        </button>
        <button type="button" className={buttonSecondary} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          {tt("Next")}
        </button>
      </div>
    </div>
  )
}

/** A send that is not simply done says so, in the tone of how much it needs the creator. */
function SendBadge({ status }: { status?: string }) {
  if (status === "queued" || status === "sending") return <StatusBadge tone="attention">{tt("Sending")}</StatusBadge>
  if (status === "partially_failed") return <StatusBadge tone="critical">{tt("Partly sent")}</StatusBadge>
  if (status === "failed") return <StatusBadge tone="critical">{tt("Not sent")}</StatusBadge>
  if (status === "cancelled") return <StatusBadge tone="neutral">{tt("Stopped")}</StatusBadge>
  return null
}

function SubscriberStatus({ s }: { s: SubscriberRow }) {
  const label = contactStatusLabel(s)
  return <StatusBadge tone={label === "Resubscribed" ? "attention" : label === "Subscribed" ? "success" : "neutral"}>{label}</StatusBadge>
}

/** The Status filter's groups: a customer is its own, bounced and spam go with the ones who left. */
const STATUS_GROUPS: Array<{ value: string; label: string; match: (status: string) => boolean }> = [
  { value: "subscribed", get label() { return tt("Subscribed") }, match: (s) => s === "subscribed" },
  { value: "customer", get label() { return tt("Customers") }, match: (s) => s === "customer" },
  /* People who wrote through a website's contact form and did not ask for news. */
  { value: "wrote", get label() { return tt("Wrote to you") }, match: (s) => s === "wrote" },
  { value: "unsubscribed", get label() { return tt("Unsubscribed") }, match: (s) => s !== "subscribed" && s !== "customer" && s !== "wrote" },
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
          <button type="button" aria-label={tt("Clear {label}", { label })} className="flex h-full cursor-pointer items-center pr-2 text-[#6b7280] hover:text-[#1a1a2e]" onClick={() => onSelect("")}>
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
  const narrow = useNarrow()
  const [searching, setSearching] = React.useState(props.search !== "")
  const [page, setPage] = React.useState(1)
  const [source, setSource] = React.useState("")
  const [status, setStatus] = React.useState("")
  const press = usePress()
  /* The latest props, for the rows' handlers: the rows are drawn once per page of contacts (below), not once per draw of the page. */
  const live = React.useRef(props)
  live.current = props
  /*
    A contact's page opens with its content already in it: the tap waits
    for the contact's automation runs (asked for when the finger landed), at
    most a moment, and then opens it (./contact-detail). The row stays
    pressed while it waits. The latest tap wins.
  */
  const opening = React.useRef<SubscriberRow | null>(null)
  const openContact = (s: SubscriberRow, row?: HTMLElement) => {
    opening.current = s
    /* The row stays pressed while it waits, on the row itself (usePress). */
    if (row) {
      row.dataset.pressed = "true"
      row.setAttribute("data-waiting", "")
    }
    void contactReady(s.email).then(() => {
      if (row) {
        row.removeAttribute("data-waiting")
        delete row.dataset.pressed
      }
      if (opening.current !== s) return
      opening.current = null
      live.current.onOpenContact(s)
    })
  }
  const q = props.search.trim().toLowerCase()
  const subscriberMenu = (s: SubscriberRow): ActionMenuItem[] => [
    { label: tt("Details"), onClick: () => openContact(s) },
    { label: tt("Copy email"), onClick: () => live.current.onCopyEmail(s.email) },
    { label: tt("Remove"), variant: "destructive", separatorBefore: true, onClick: () => live.current.onRemoveSubscriber(s.id) },
  ]

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
      .map(([key, c]) => ({ value: key, label: c.label, hint: tt("{n, plural, one {# contact} other {# contacts}}", { n: c.n }) }))
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
  const shown = React.useMemo(() => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [rows, page])
  const sourceName = source ? sources.find((o) => o.value === source)?.label ?? null : null
  const statuses = React.useMemo(
    () =>
      STATUS_GROUPS.map((g) => {
        const n = props.subscribers.filter((s) => g.match(s.status)).length
        return { value: g.value, label: g.label, hint: tt("{n, plural, one {# contact} other {# contacts}}", { n }) }
      }),
    [props.subscribers],
  )
  const statusName = status ? STATUS_GROUPS.find((g) => g.value === status)?.label ?? null : null

  /*
    THE ROWS, DRAWN ONCE PER PAGE OF CONTACTS (round 25). A contact opening
    over the list, a menu, a search keystroke elsewhere: each drew fifty rows
    and their fifty menus again, 70 to 100ms on a computer between the click
    and the contact's first frame. The same element tree is handed back, so
    React leaves the rows as they are; their handlers read the latest props
    through live, and press and openContact keep nothing of a draw.
  */
  const list = React.useMemo(
    () => (
              <>
              {narrow !== false ? (
              <ul aria-label={tt("Subscribers")} className="divide-y divide-[#f1f2f4] sm:hidden">
                {shown.map((s) => {
                  const v = views.get(s.id)
                  return (
                    <PhoneItem
                      key={s.id}
                      data-contact-row=""
                      data-order-id={s.id}
                      onClick={(e) => openContact(s, e.currentTarget)}
                      {...press(s.id, () => prefetchContact(s.email))}
                      head={s.name || s.email}
                      aside={formatDay(s.subscribed_at)}
                      line={s.name ? s.email : undefined}
                      meta={tt(v?.label ?? NOT_RECORDED)}
                      /* Subscribed is most of them, so only the others are said. */
                      badges={s.status === "subscribed" ? undefined : <SubscriberStatus s={s} />}
                      menu={<ResponsiveActionMenu title={s.email} align="end" trigger={<RowMenuButton label={tt("Actions for {email}", { email: s.email })} className="h-11 w-11" />} items={subscriberMenu(s)} />}
                    />
                  )
                })}
              </ul>
              ) : null}
              {narrow !== true ? (
              <ScrollEdge frameClassName="max-sm:hidden">
                <table className="w-full min-w-[720px] border-collapse">
                  <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                    <tr>
                      <th data-scroll-edge="" className={cn(th, stickyHead, "w-px")}>{tt("Email")}</th>
                      <th className={th}>{tt("Name")}</th>
                      <th className={th}>{tt("Source")}</th>
                      <th className={th}>{tt("Status")}</th>
                      <th className={th}>{tt("Added")}</th>
                      <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
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
                          onClick={(e) => openContact(s, e.currentTarget)}
                          {...press(s.id, () => prefetchContact(s.email))}
                        >
                          <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}><span className="block max-w-[180px] truncate sm:max-w-[260px]">{s.email}</span></td>
                          <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[180px] truncate">{s.name || "–"}</span></td>
                          <td className={td} title={v ? [v.label, v.detail].filter(Boolean).join(" · ") : undefined}>
                            {/* The website's address is the part that matters: it keeps its
                                width, and the detail after it is what gets cut. */}
                            <span className="flex max-w-[380px] items-baseline gap-1.5">
                              <span className={cn("max-w-[230px] shrink-0 truncate", v?.label === NOT_RECORDED ? "text-[#9ca3af]" : "text-[#1a1a2e]")}>{tt(v?.label ?? NOT_RECORDED)}</span>
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
                              trigger={<RowMenuButton label={tt("Actions for {email}", { email: s.email })} />}
                              items={subscriberMenu(s)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </ScrollEdge>
              ) : null}
              </>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- press, openContact and subscriberMenu read refs only (above)
    [shown, narrow, views],
  )

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
                placeholder={tt("Search by email or name")}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-[#1a1a2e] outline-none placeholder:text-[#9ca3af] sm:text-[13px] [&::-webkit-search-cancel-button]:hidden"
              />
              {props.search ? (
                <button type="button" aria-label={tt("Clear search")} className="text-[#9ca3af] hover:text-[#4b5563]" onClick={() => props.onSearch("")}>
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
              {tt("Cancel")}
            </button>
          </>
        ) : (
          <>
            <div className="orders-strip flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1">
              {props.subscribers.length > 0 ? (
                <>
                  <FilterChip label={tt("Status")} value={statusName} options={[{ value: "", label: tt("Any status") }, ...statuses]} selected={status} onSelect={setStatus} />
                  <FilterChip label={tt("Source")} value={sourceName} options={[{ value: "", label: tt("Any source") }, ...sources]} selected={source} onSelect={setSource} />
                </>
              ) : null}
            </div>
            <button type="button" aria-label={tt("Search subscribers")} className={iconButton} onClick={() => setSearching(true)}>
              <Search className="h-4 w-4" />
            </button>
            <button type="button" aria-label={tt("Export subscribers")} className={iconButton} onClick={props.onExportSubscribers}>
              <Download className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : rows.length === 0 ? (
          q || source || status ? (
            <Empty title={tt("No subscribers match")} body={tt("Try another email or name, or another source.")} />
          ) : (
            <Empty title={tt("No subscribers yet")} body={tt("People who sign up on your website, your Storelib profile or your OnePage show up here, and so do buyers who ask to hear from you.")} />
          )
        ) : (
          list
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
  const narrow = useNarrow()
  const press = usePress()
  const [page, setPage] = React.useState(1)
  const pages = Math.max(1, Math.ceil(props.messages.length / PAGE_SIZE))
  const shown = props.messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const messageMenu = (m: MessageRow): ActionMenuItem[] => [
    { label: tt("Open"), onClick: () => props.onOpenMessage(m) },
    { label: tt("Reply"), onClick: () => { window.location.href = replyHref(m) } },
    { label: m.read_at ? tt("Mark as new") : tt("Mark as read"), onClick: () => props.onToggleRead(m) },
    { label: tt("Copy email"), onClick: () => props.onCopyEmail(m.email) },
    { label: tt("Delete"), variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteMessage(m.id) },
  ]
  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.messages.length === 0 ? (
          <Empty
            title={tt("No messages yet")}
            body={
              props.messagesAvailable
                ? tt("When somebody writes to you through the contact form on your website, the message shows here and in your email.")
                : tt("Messages from your website's contact form are emailed to you. They show here once Storelib has finished setting this up.")
            }
          />
        ) : (
          <>
          {narrow !== false ? (
          <ul aria-label={tt("Messages")} className="divide-y divide-[#f1f2f4] sm:hidden">
            {shown.map((m) => {
              const fresh = !m.read_at
              const who = m.name || m.email
              return (
                <PhoneItem
                  key={m.id}
                  data-message-row={m.id}
                  data-unread={fresh ? "true" : undefined}
                  data-order-id={m.id}
                  onClick={() => props.onOpenMessage(m)}
                  {...press(m.id)}
                  head={
                    <>
                      {fresh ? <span aria-label={tt("New")} className="mr-1.5 inline-block h-2 w-2 -translate-y-[2px] rounded-full bg-[#8b5cf6] align-middle" /> : null}
                      <span className={fresh ? undefined : "font-medium"}>{who}</span>
                    </>
                  }
                  aside={formatWhen(m.created_at)}
                  line={m.subject || undefined}
                  meta={m.message.replace(/\s+/g, " ").trim()}
                  menu={<ResponsiveActionMenu title={who} align="end" trigger={<RowMenuButton label={tt("Actions for the message from {who}", { who })} className="h-11 w-11" />} items={messageMenu(m)} />}
                />
              )
            })}
          </ul>
          ) : null}
          {narrow !== true ? (
          <ScrollEdge frameClassName="max-sm:hidden">
            <table className="w-full min-w-[720px] border-collapse" data-messages-table="">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead, "w-px")}>{tt("From")}</th>
                  <th className={th}>{tt("Message")}</th>
                  <th className={th}>{tt("Sent from")}</th>
                  <th className={th}>{tt("Received")}</th>
                  <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
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
                          {fresh ? <span aria-label={tt("New")} className="h-2 w-2 shrink-0 rounded-full bg-[#8b5cf6]" /> : <span aria-hidden className="w-2 shrink-0" />}
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
                          trigger={<RowMenuButton label={tt("Actions for the message from {who}", { who })} />}
                          items={messageMenu(m)}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollEdge>
          ) : null}
          </>
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
    { label: tt("Edit"), onClick: () => openLayer(router, href(f)) },
    { label: on ? tt("Turn off") : tt("Turn on"), onClick: () => props.onToggleFlow(f) },
    { label: tt("Duplicate"), onClick: () => props.onDuplicateFlow(f) },
    { label: tt("Delete"), variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteFlow(f.id) },
  ]
  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.flows.length === 0 ? (
          <Empty
            title={tt("No automations yet")}
            body={tt("Start from a welcome series, a thank you after a purchase, or your own. Each one is off until you turn it on.")}
            action={
              <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={buttonAccent}>
                <Plus className="h-4 w-4" />
                {tt("Create an automation")}
              </Link>
            }
          />
        ) : (
          <>
            <ul aria-label={tt("Automations")} className="divide-y divide-[#f1f2f4] md:hidden" data-flow-list="">
              {props.flows.map((f) => {
                const trigger = isTriggerType(f.trigger_type) ? TRIGGERS[f.trigger_type].sentence : tt("Not set")
                const on = f.status === "active"
                const t = f.totals
                const numbers = t ? [t.in_progress > 0 ? tt("{value} in progress", { value: t.in_progress.toLocaleString(appLocale()) }) : null, tt("{value} sent", { value: t.sent.toLocaleString(appLocale()) }), t.sent > 0 ? tt("{value} opened", { value: rate(t.opened, t.sent) }) : null].filter(Boolean).join(" · ") : null
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
                        <Link href={href(f)} prefetch={false} className="min-w-0 break-words text-[17px] font-semibold leading-6 text-[#1a1a2e] outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                          {f.name}
                        </Link>
                        {t && t.failed > 0 ? <StatusBadge tone="critical">{tt("{failed} failed", { failed: t.failed })}</StatusBadge> : null}
                      </p>
                      <p className="mt-0.5 text-[15px] leading-5 text-[#303036]">{trigger}</p>
                      <p className="mt-0.5 text-[14px] leading-5 tabular-nums text-[#6b7280]">
                        {stepSummary(normalizeSteps(f.steps))}
                        {numbers ? ` · ${numbers}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <span className="flex h-11 items-center px-1.5">
                        <Switch checked={on} onCheckedChange={() => props.onToggleFlow(f)} aria-label={tt("Send {name} automatically", { name: f.name })} />
                      </span>
                      <ResponsiveActionMenu title={f.name} align="end" trigger={<RowMenuButton label={tt("Actions for {name}", { name: f.name })} className="h-11 w-11" />} items={menu(f, on)} />
                    </div>
                  </li>
                )
              })}
            </ul>
            <ScrollEdge frameClassName="max-md:hidden">
              <table className="w-full min-w-[720px] border-collapse">
                <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                  <tr>
                    <th data-scroll-edge="" className={cn(th, stickyHead)}>{tt("Automation")}</th>
                    <th className={th}>{tt("Starts when")}</th>
                    <th className={th}>{tt("Steps")}</th>
                    <th className={cn(th, "text-right")}>{tt("In progress")}</th>
                    <th className={cn(th, "text-right")}>{tt("Sent")}</th>
                    <th className={cn(th, "text-right")}>{tt("Opened")}</th>
                    <th className={th}>{tt("On")}</th>
                    <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f2f4]">
                  {props.flows.map((f) => {
                    const trigger = isTriggerType(f.trigger_type) ? TRIGGERS[f.trigger_type].sentence : tt("Not set")
                    const on = f.status === "active"
                    const t = f.totals
                    return (
                      <tr key={f.id} className={pressable} data-flow-row={f.id} onClick={() => openLayer(router, href(f))} {...press(f.id, () => router.prefetch(href(f)))}>
                        <td data-scroll-edge="" className={cn(td, sticky, "font-medium")}>
                          <span className="flex max-w-[180px] items-center gap-2 sm:max-w-[260px]">
                            <Link href={href(f)} prefetch={false} className="truncate outline-none focus-visible:underline" onClick={(e) => e.stopPropagation()}>
                              {f.name}
                            </Link>
                            {t && t.failed > 0 ? <StatusBadge tone="critical">{tt("{failed} failed", { failed: t.failed })}</StatusBadge> : null}
                          </span>
                        </td>
                        <td className={cn(td, "text-[#4b5563]")}><span className="block max-w-[240px] truncate">{trigger}</span></td>
                        <td className={cn(td, "text-[#4b5563]")}>{stepSummary(normalizeSteps(f.steps))}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{t ? t.in_progress.toLocaleString(appLocale()) : "–"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{t ? t.sent.toLocaleString(appLocale()) : "–"}</td>
                        <td className={cn(td, "text-right tabular-nums")}>{t && t.sent > 0 ? rate(t.opened, t.sent) : "–"}</td>
                        <td className={td} onClick={(e) => e.stopPropagation()}>
                          <Switch checked={on} onCheckedChange={() => props.onToggleFlow(f)} aria-label={tt("Send {name} automatically", { name: f.name })} />
                        </td>
                        <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                          <ResponsiveActionMenu title={f.name} align="end" trigger={<RowMenuButton label={tt("Actions for {name}", { name: f.name })} />} items={menu(f, on)} />
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
  const narrow = useNarrow()
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
      ? { title: tt("Nothing sent in this period"), body: tt("Emails you send show up here with how many were opened and clicked.") }
      : tab === "scheduled"
        ? { title: tt("Nothing scheduled"), body: tt("Write an email and choose when it goes out, and it waits here until then.") }
        : { title: tt("No drafts"), body: tt("An email you start and do not send yet is kept here.") }
  const open = (c: CampaignRow) => (drafts ? openLayer(router, `/app/emails/edit/${c.id}`) : props.onOpenCampaign(c))
  const campaignMenu = (c: CampaignRow): ActionMenuItem[] =>
    drafts
      ? [
          { label: tt("Edit"), onClick: () => open(c) },
          { label: tt("Duplicate"), onClick: () => props.onDuplicateCampaign(c) },
          { label: tt("Delete"), variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) },
        ]
      : [
          { label: sent ? tt("View results") : tt("Open"), onClick: () => open(c) },
          ...(tab === "scheduled" ? [{ label: tt("Edit"), onClick: () => openLayer(router, `/app/emails/edit/${c.id}`) }] : []),
          { label: tt("Duplicate"), onClick: () => props.onDuplicateCampaign(c) },
          ...(c.status === "queued" || c.status === "sending" ? [] : [{ label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) }]),
        ]
  const when = (c: CampaignRow) => (sent ? formatDay(c.sent_at) : tab === "scheduled" ? formatWhen(c.scheduled_at) : formatDay(c.updated_at ?? c.created_at))
  const titleOf = (c: CampaignRow) => (c.subject ?? "").replace(/\s*\(Resend\)\s*$/, "") || tt("Untitled")

  return (
    <>
      <ShimmerSwap loading={props.loading} skeleton={<Loading />}>
        {props.loading ? null : props.campaigns.length === 0 ? (
          <Empty
            {...empty}
            action={
              <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={buttonSecondary}>
                <Plus className="h-4 w-4" />
                {tt("New email")}
              </Link>
            }
          />
        ) : (
          <>
          {narrow !== false ? (
          <ul aria-label={TABS.find((t) => t.id === tab)?.label} className="divide-y divide-[#f1f2f4] sm:hidden">
            {shown.map((c) => {
              const recipients = c.recipient_count || c.audience_count || 0
              const resent = /\(Resend\)/.test(c.subject ?? "")
              const title = titleOf(c)
              const people = recipients ? tt("{n, plural, one {# recipient} other {# recipients}}", { n: recipients }) : null
              return (
                <PhoneItem
                  key={c.id}
                  data-campaign-row={c.id}
                  data-order-id={c.id}
                  onClick={() => open(c)}
                  {...press(c.id, () => props.onCampaignIntent(c))}
                  head={title}
                  aside={when(c)}
                  line={sent && recipients ? tt("{opened} opened · {clicked} clicked", { opened: rate(c.unique_opens ?? 0, recipients), clicked: rate(c.unique_clicks ?? 0, recipients) }) : undefined}
                  meta={people ?? undefined}
                  badges={resent || (sent && c.status && c.status !== "sent") ? <>{resent ? <StatusBadge tone="neutral">{tt("Sent again")}</StatusBadge> : null}{sent ? <SendBadge status={c.status} /> : null}</> : undefined}
                  menu={<ResponsiveActionMenu title={title} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title })} className="h-11 w-11" />} items={campaignMenu(c)} />}
                />
              )
            })}
          </ul>
          ) : null}
          {narrow !== true ? (
          <ScrollEdge frameClassName="max-sm:hidden">
            <table className="w-full min-w-[640px] border-collapse">
              <thead className="border-b border-[#eef0f2] bg-[#fafbfb]">
                <tr>
                  <th data-scroll-edge="" className={cn(th, stickyHead)}>{tt("Subject")}</th>
                  <th className={th}>{sent ? tt("Sent") : tab === "scheduled" ? tt("Goes out") : tt("Edited")}</th>
                  <th className={cn(th, "text-right")}>{tt("Recipients")}</th>
                  {sent ? <th className={cn(th, "text-right")}>{tt("Opened")}</th> : null}
                  {sent ? <th className={cn(th, "text-right")}>{tt("Clicked")}</th> : null}
                  <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {shown.map((c) => {
                  const recipients = c.recipient_count || c.audience_count || 0
                  const resent = /\(Resend\)/.test(c.subject ?? "")
                  const title = titleOf(c)
                  const items = campaignMenu(c)
                  return (
                    <tr key={c.id} className={cn("orders-row", pressable)} data-campaign-row={c.id} data-order-id={c.id} onClick={() => open(c)} {...press(c.id, () => props.onCampaignIntent(c))}>
                      <td data-scroll-edge="" className={cn(td, sticky)}>
                        {/* The limit is on the span: a table cell's own max-width is ignored.
                            Narrow on a phone, so the columns scrolling under it still show. */}
                        <span className="flex min-w-0 max-w-[180px] items-center gap-2 sm:max-w-[320px]">
                          <span className="truncate font-medium">{title}</span>
                          {resent ? <StatusBadge tone="neutral">{tt("Sent again")}</StatusBadge> : null}
                          {sent ? <SendBadge status={c.status} /> : null}
                        </span>
                      </td>
                      <td className={cn(td, "tabular-nums text-[#4b5563]")}>{when(c)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{recipients ? recipients.toLocaleString(appLocale()) : "–"}</td>
                      {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_opens ?? 0, recipients)}</td> : null}
                      {sent ? <td className={cn(td, "text-right tabular-nums")}>{rate(c.unique_clicks ?? 0, recipients)}</td> : null}
                      <td className={cn(td, "w-12 px-2 text-right")} onClick={(e) => e.stopPropagation()}>
                        <ResponsiveActionMenu title={title} align="end" trigger={<RowMenuButton label={tt("Actions for {title}", { title })} />} items={items} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </ScrollEdge>
          ) : null}
          </>
        )}
      </ShimmerSwap>
      <Pager page={page} pages={pages} total={props.campaigns.length} onPage={setPage} />
    </>
  )
}
