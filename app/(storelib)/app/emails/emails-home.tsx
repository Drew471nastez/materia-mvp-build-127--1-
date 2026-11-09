"use client"

/**
 * ===========================================================================
 *  EMAILS, IN THE SAME LANGUAGE AS ORDERS AND ANALYTICS
 * ===========================================================================
 * The list screen of /app/emails, three tabs since round 51: Campaigns
 * (every email sent, scheduled and drafted, in one list with All, Sent,
 * Scheduled and Drafts above it), Automations and Settings (how email goes
 * out, and the emails buyers get). Subscribers and leads moved to Contacts,
 * the website's messages to Contacts › Forms. Drawn with the Orders page's parts
 * (app/app/orders/order-parts.tsx): the pane's bar, a metrics strip, a dense
 * table whose first column stays put on a phone, and each row's actions in
 * the menu that is a dropdown on a desktop and a sheet on a phone.
 *
 * THE BAR HOLDS STILL. The title, the tab's one main action (New email,
 * Create automation) and the tabs are all in the pane's bar, which is never unmounted and never
 * changes height, so switching tabs moves nothing above the content: the
 * tab row keeps its own sideways scroll on a phone, and only what is under
 * the bar changes. It scrolls away with the page, as every list's bar does
 * (round 28, the owner: not sticky).
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
import { ChevronDown, Plus, X } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { DateRangePicker } from "@/components/app/date-range-picker"
import { HelpLabel } from "@/components/app/help-label"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { TRIGGERS, isTriggerType, normalizeSteps, stepSummary } from "@/lib/automations/flow-model"
import type { RangeValue } from "@/lib/date-range/range"
import { cn } from "@/lib/utils"
import { ShimmerBlock, ShimmerRows, ShimmerSwap } from "@/components/ui/shimmer"
import { ScrollEdge } from "@/components/app/scroll-edge"
import { SegmentedPills } from "@/components/app/segmented-pills"
import { GUTTER, LIST_WIDTH, MenuOption, MenuSurface, PaneBar, RowMenuButton, StatusBadge, buttonAccent, buttonSecondary, card, iconButton } from "../orders/order-parts"
import { HOVER_PREFETCH_MS } from "../orders/order-prefetch"
import { layerLinkClick, openLayer } from "./layer-nav"
import { CUSTOMER_EMAILS_PATH, CustomerEmailsPanel, type CustomerEmailsData } from "@/components/app/settings/customer-emails-panel"
import { ConnectedPlatforms, type PlatformsData } from "@/components/email/connected-platforms"
import { CommunityAutomations } from "@/components/app/emails/community-automations"
import type { CommunityRef } from "@/components/app/emails/community-emails"
import { api as storeApi, peekGet } from "@/components/physical/ui"
import { emailsOf } from "@/lib/emails/customer-list"
import { tt } from "@/lib/i18n/text"
import { appLocale, zoned } from "@/lib/i18n/format"
import { FilterPills } from "@/components/app/filter-pills"
import { ComposeDialog } from "@/components/email/compose/ui"
import { StarterList } from "@/components/email/compose/starter-list"
import type { CampaignShow, EmailsPageTab, SettingsSection } from "./emails-route"
import type { SendingData } from "./emails-data"

/**
 * What is drawn under the bar (round 51): Campaigns' four filters ("all",
 * and "published" for Sent), Automations ("flows"), and Settings' two
 * sections ("platforms" for Sending, "customer").
 */
export type EmailsTab = "all" | "published" | "scheduled" | "drafts" | "flows" | "customer" | "platforms"

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
  /** The replies sent from its page, oldest first (lib/site-contact/reply.ts). */
  replies?: { id: string; message: string; created_at: string; pending?: boolean }[]
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
  /** Which list it came from: sent, scheduled or a draft (./emails-data.ts). */
  kind?: "sent" | "scheduled" | "draft"
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
  /** The page's tab: Campaigns, Automations or Settings. */
  pageTab: EmailsPageTab
  onPageTab: (tab: EmailsPageTab) => void
  /** A pointer resting on a tab: its data can be read ahead. */
  onPageTabIntent?: (tab: EmailsPageTab) => void
  /** Campaigns' filter, and Settings' section. */
  show: CampaignShow
  onShow: (show: CampaignShow) => void
  section: SettingsSection
  onSection: (section: SettingsSection) => void
  /**
   * A phone's one row of views (round w5): All, Sent, Scheduled, Drafts,
   * Automations, Customer emails and Delivery side by side, as Emails was
   * on a phone before round 51 nested them under three tabs. Chosen in one
   * step: the tab, its filter or section, and the address together.
   */
  onView?: (view: EmailsTab) => void
  onViewIntent?: (view: EmailsTab) => void
  /** The view whose content is drawn. */
  tab: EmailsTab
  /**
   * The view chosen. It runs ahead of `tab` for a moment when the chosen one
   * has nothing read yet: the content of the last one stays until the next
   * has its rows (./emails-client.tsx), so a switch never shows an empty
   * table. Missing, it is `tab`.
   */
  chosenTab?: EmailsTab
  /** The last view's rows were already held for a while: a skeleton now shows at once, with no wait of its own. */
  skeletonAtOnce?: boolean
  /** Nothing to show for this view yet. */
  loading: boolean

  /** The Customer emails section's read (the store, its saved words), when it has come. */
  customerEmails?: CustomerEmailsData | null
  /** The Customer emails section changed what it read (words saved, the reminder switched): kept for its next look. */
  onCustomerEmails?: (data: CustomerEmailsData) => void
  /** The Sending section's read: the connected email platforms, the sending domain and the sender. */
  platforms?: SendingData | null
  onPlatforms?: (data: PlatformsData) => void
  /** Physical commerce is on: the shipping, pickup and return emails are listed too. */
  physical: boolean

  flows: FlowRow[]
  onToggleFlow: (flow: FlowRow) => void
  onDeleteFlow: (id: string) => void
  onDuplicateFlow: (flow: FlowRow) => void

  campaigns: CampaignRow[]
  /** Opens a sent or scheduled email's page over the list. */
  onOpenCampaign: (campaign: CampaignRow) => void
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

/** The page's three tabs (round 51). */
export const PAGE_TAB_LABELS: { id: EmailsPageTab; label: string }[] = [
  { id: "campaigns", get label() { return tt("Campaigns") } },
  { id: "automations", get label() { return tt("Automations") } },
  { id: "settings", get label() { return tt("Settings") } },
]

/** Campaigns' filter. */
export const SHOW_LABELS: { value: CampaignShow; label: string }[] = [
  { value: "all", get label() { return tt("All") } },
  { value: "sent", get label() { return tt("Sent") } },
  { value: "scheduled", get label() { return tt("Scheduled") } },
  { value: "drafts", get label() { return tt("Drafts") } },
]

/** Settings' two sections. */
export const SECTION_LABELS: { value: SettingsSection; label: string }[] = [
  { value: "sending", get label() { return tt("Delivery") } },
  { value: "customer", get label() { return tt("Customer emails") } },
]

/** Each view's name, for the region it is drawn in. */
export const TABS: { id: EmailsTab; label: string }[] = [
  { id: "all", get label() { return tt("Campaigns") } },
  { id: "published", get label() { return tt("Sent") } },
  { id: "scheduled", get label() { return tt("Scheduled") } },
  { id: "drafts", get label() { return tt("Drafts") } },
  { id: "flows", get label() { return tt("Automations") } },
  { id: "customer", get label() { return tt("Customer emails") } },
  { id: "platforms", get label() { return tt("Delivery") } },
]

/**
 * A PHONE'S VIEWS, ONE ROW (round w5, the owner: "the emails on phone, make
 * it how it was before, more easy, simple, clean"). Before round 51 a phone
 * had one strip of views under the title and nothing else above the list;
 * round 51 put three tabs there and a second row under them (All, Sent,
 * Scheduled, Drafts and Templates, or Delivery and Customer emails), which
 * on a 390px phone cut Drafts off behind Templates. A phone has the one
 * strip again, every view in it; a computer keeps the three tabs and their
 * filters. Templates stay a phone's too: an empty new email offers them
 * before anything is written (components/email/compose/starter-list.tsx).
 */
export const PHONE_VIEWS: { id: EmailsTab; label: string }[] = [
  { id: "all", get label() { return tt("All") } },
  { id: "published", get label() { return tt("Sent") } },
  { id: "scheduled", get label() { return tt("Scheduled") } },
  { id: "drafts", get label() { return tt("Drafts") } },
  { id: "flows", get label() { return tt("Automations") } },
  { id: "customer", get label() { return tt("Customer emails") } },
  { id: "platforms", get label() { return tt("Delivery") } },
]

const PAGE_SIZE = 50

function formatDay(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString(appLocale(), zoned({ month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }))
}

export function formatWhen(iso?: string | null): string {
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
export function usePress() {
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
export function useNarrow(): boolean | null {
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

export const pressable = "group cursor-pointer transition-colors duration-75 hover:bg-[#fafbfb] pointer-fine:active:bg-[#f4f5f7] data-[pressed=true]:bg-[#f4f5f7] [-webkit-tap-highlight-color:transparent]"

/**
 * A ROW ON A PHONE, AS ORDERS DRAWS ONE (app/app/orders/orders-list.tsx
 * PhoneRow): what it is and its figure on top at 17px, a line under it at
 * 15px, a quiet line at 14px, then its badges; its menu at the end, where a
 * thumb is. A table to swipe sideways stays a computer's.
 */
export function PhoneItem({ head, aside, line, meta, badges, menu, ...row }: { head: React.ReactNode; aside?: React.ReactNode; line?: React.ReactNode; meta?: React.ReactNode; badges?: React.ReactNode; menu: React.ReactNode } & React.LiHTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string | undefined>) {
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
  const { tab, pageTab } = props
  const router = useRouter()
  const [templates, setTemplates] = React.useState(false)
  return (
    <>
      {/* Flat, as every list's bar (round 28, the owner): the title, the tab's one action and the tabs scroll away with the page. */}
      <PaneBar width={LIST_WIDTH} className="pb-1 pt-2">
        <div className="flex min-h-[48px] items-center justify-between gap-2 max-sm:mb-1">
          <h1 className="shrink-0 text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Emails")}</h1>
          {/* One main action per tab (round 51): Campaigns writes an email, Automations makes one, Settings has none. A computer's; a phone has both, below. */}
          <div className="flex min-h-9 min-w-0 items-center gap-2 max-sm:hidden">
            {pageTab === "campaigns" ? (
              <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={cn(buttonAccent, "px-2.5 sm:px-3")} data-new-email="">
                <Plus className="h-4 w-4 shrink-0" />
                {tt("New email")}
              </Link>
            ) : pageTab === "automations" ? (
              <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={cn(buttonAccent, "px-2.5 sm:px-3")} data-new-automation="">
                <Plus className="h-4 w-4 shrink-0" />
                {tt("Create automation")}
              </Link>
            ) : null}
          </div>
          {/*
            A PHONE'S TWO ACTIONS, ON EVERY VIEW, as before round 51: an
            automation beside a new email, each 44px tall for a thumb.
          */}
          <div className="flex min-w-0 items-center gap-2 sm:hidden" data-phone-actions="">
            <Link href="/app/emails/flow/new" prefetch onClick={layerLinkClick(router, "/app/emails/flow/new")} className={cn(buttonSecondary, "h-11 px-3")} data-phone-new-automation="">
              {tt("Automation")}
            </Link>
            <Link href="/app/emails/new" prefetch onClick={layerLinkClick(router, "/app/emails/new")} className={cn(buttonAccent, "h-11 px-3")} data-phone-new-email="">
              <Plus className="h-4 w-4 shrink-0" />
              {tt("New email")}
            </Link>
          </div>
        </div>
        <div className="max-sm:hidden">
          <Tabs tab={pageTab} onTab={props.onPageTab} onIntent={props.onPageTabIntent} />
        </div>
        {/* A phone's one row of views (PHONE_VIEWS): the chosen one, ahead of its content as the tabs are. */}
        <div className="sm:hidden">
          <Tabs tab={props.chosenTab ?? tab} onTab={(v) => props.onView?.(v)} onIntent={props.onViewIntent} options={PHONE_VIEWS} marker="data-email-views-phone" />
        </div>
      </PaneBar>

      <div className={cn("mx-auto min-h-full pb-24 md:pb-8", LIST_WIDTH, GUTTER, props.skeletonAtOnce && "shimmer-now")} style={{ minHeight: "var(--pane-h, 100%)" }} data-tab-content={tab} data-tab-pending={props.chosenTab && props.chosenTab !== tab ? props.chosenTab : undefined}>
        {/* Campaigns' filter, and its secondary Templates; Settings' two sections. Pills, as Integrations and Customer emails draw them. */}
        {pageTab === "campaigns" ? (
          <div className="mt-4 flex items-center justify-between gap-3 max-sm:hidden" data-campaign-filter="">
            <FilterPills label={tt("Show")} value={props.show} onChange={props.onShow} options={SHOW_LABELS.map((o) => ({ value: o.value, label: o.label }))} />
            <button type="button" className={cn(buttonSecondary, "shrink-0")} onClick={() => setTemplates(true)} data-email-templates="">
              {tt("Templates")}
            </button>
          </div>
        ) : pageTab === "settings" ? (
          <div className="mt-4 max-sm:hidden" data-settings-sections="">
            <FilterPills label={tt("Settings")} value={props.section} onChange={props.onSection} options={SECTION_LABELS.map((o) => ({ value: o.value, label: o.label }))} />
          </div>
        ) : null}

        {tab === "platforms" ? <SenderCard sender={props.platforms?.sender ?? null} domain={props.platforms?.sending.domain ?? null} loading={props.loading} /> : <Metrics {...props} />}

        <section aria-label={TABS.find((t) => t.id === tab)?.label ?? tt("Emails")} className={cn(card, "mt-4 overflow-hidden")}>
          {tab === "flows" ? <FlowsTable {...props} /> : null}
          {/* The emails buyers and members get, in three families: the same list, editor and saved words as Settings › Customer emails. */}
          {tab === "customer" ? <CustomerEmailsPanel bare source={{ data: props.customerEmails ?? null, onChange: props.onCustomerEmails }} /> : null}
          {tab === "all" || tab === "published" || tab === "scheduled" || tab === "drafts" ? <CampaignsTable {...props} /> : null}
          {/* Klaviyo, Omnisend, Brevo, MailerLite and Kit kept in step, and the store's own sending domain. */}
          {tab === "platforms" ? <ConnectedPlatforms data={props.platforms ?? null} onChange={props.onPlatforms} /> : null}
        </section>
      </div>

      {/*
        TEMPLATES, A SECOND PLACE, NOT A TAB (round 51). The layouts an email
        can start from are chosen in the composer, under an empty email; here
        they are listed so one can be picked first: it opens a new email with
        that layout in it (/app/emails/new?layout=<id>).
      */}
      <ComposeDialog open={templates} onClose={() => setTemplates(false)} title={tt("Templates")}>
        <p className="mb-3 text-[13px] text-[#6b7280]">{tt("Pick one to start a new email with it. You can also pick one in a new email, before you write.")}</p>
        <StarterList
          bare
          withBlank
          className="-mx-4 sm:-mx-5"
          onPick={(id) => {
            setTemplates(false)
            const href = id === "blank" ? "/app/emails/new" : `/app/emails/new?layout=${encodeURIComponent(id)}`
            openLayer(router, href)
          }}
        />
      </ComposeDialog>
    </>
  )
}

/**
 * Settings › Sending: who the store's emails are from, the address they come
 * from, and where a reply goes, each with where it is changed. Read with the
 * platforms (./emails-data.ts loadPlatforms).
 */
function SenderCard({ sender, domain, loading }: { sender: { name: string | null; replyTo: string | null } | null; domain: { domain: string; status: string } | null; loading: boolean }) {
  const rows: Array<{ label: string; value: string; href?: string; action?: string }> = [
    { label: tt("From name"), value: sender?.name || "–", href: "/app/settings?tab=general", action: tt("Edit") },
    { label: tt("From address"), value: domain?.status === "verified" ? tt("Your domain, {domain}", { domain: domain.domain }) : tt("Storelib's address") },
    { label: tt("Replies go to"), value: sender?.replyTo || "–", href: "/app/settings?tab=store", action: tt("Edit") },
  ]
  return (
    <section aria-label={tt("Sender")} className={cn(card, "mt-4 overflow-hidden")} data-sender-card="">
      <dl className="divide-y divide-[#f1f2f4]">
        {rows.map((r) => (
          <div key={r.label} className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
            <dt className="w-[120px] shrink-0 text-[13px] font-medium text-[#6b7280]">{r.label}</dt>
            <dd className="min-w-0 flex-1 truncate text-[14px] text-[#1a1a2e]">{loading ? <ShimmerBlock className="shimmer-wait h-3.5 w-32 rounded-full" /> : r.value}</dd>
            {r.href ? (
              <Link href={r.href} className="shrink-0 text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline">
                {r.action}
              </Link>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  )
}

/* ─── The tabs, in the bar ───────────────────────────────────────────── */

/**
 * A phone's view is 44px to a thumb (round w5): the 36px pill reaches the
 * track's top and bottom edge with a layer of its own that takes the tap and
 * draws nothing, so the pill looks as it did and no tap lands between pills.
 */
const PHONE_PILL_HIT = "[&>button]:before:absolute [&>button]:before:inset-x-0 [&>button]:before:-inset-y-1 [&>button]:before:content-['']"

/** How far in from a faded end the chosen view is kept: the fade (24px, app/globals.css .edge-fade) and a little air. */
const TAB_FADE_CLEAR = 28

function Tabs<T extends string = EmailsPageTab>({
  tab,
  onTab,
  onIntent,
  options = PAGE_TAB_LABELS as unknown as { id: T; label: string }[],
  marker = "data-email-tabs",
}: {
  tab: T
  onTab: (t: T) => void
  onIntent?: (t: T) => void
  /** The pills: the page's three tabs, or a phone's views (PHONE_VIEWS). */
  options?: { id: T; label: string }[]
  marker?: "data-email-tabs" | "data-email-views-phone"
}) {
  /* Analytics' sliding pill (round 24, the owner: "the pill shapes of the analytics"); the strip scrolls sideways on a phone and keeps the chosen one in view. */
  const host = React.useRef<HTMLDivElement>(null)
  /*
    The chosen view clear of a fade. SegmentedPills brings it into view with
    8px to spare, which leaves its edge inside the 24px fade; this runs just
    after (a parent's layout effect follows its child's) and moves the row
    the rest of the way, at once, as the row's own does.
  */
  React.useLayoutEffect(() => {
    const row = host.current?.querySelector<HTMLElement>("[data-segmented-pills]")
    const on = row?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!row || !on || row.scrollWidth <= row.clientWidth + 1) return
    const left = row.scrollLeft
    let next = left
    if (on.offsetLeft - TAB_FADE_CLEAR < left) next = on.offsetLeft - TAB_FADE_CLEAR
    else if (on.offsetLeft + on.offsetWidth + TAB_FADE_CLEAR > left + row.clientWidth) next = on.offsetLeft + on.offsetWidth + TAB_FADE_CLEAR - row.clientWidth
    next = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, next))
    if (Math.abs(next - left) >= 1) row.scrollLeft = next
  }, [tab])
  return (
    <div ref={host} className="flex h-11 items-center" {...{ [marker]: "" }}>
      <SegmentedPills label={tt("Views")} className={cn("edge-fade", marker === "data-email-views-phone" && PHONE_PILL_HIT)} value={tab} onChange={onTab} onIntent={onIntent} options={options.map((t) => ({ value: t.id, label: t.label }))} />
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
        {props.tab === "published" || props.tab === "all" ? (
          <div className="flex min-w-[150px] shrink-0 flex-col px-4 py-3">
            <span className="text-[12px] font-medium text-[#4b5563]">{tt("Period")}</span>
            <div className="mt-1 flex h-6 items-center">
              <DateRangePicker value={props.period} onChange={props.onPeriod} today={props.today} className="-ml-1.5 h-7 px-1.5" />
            </div>
          </div>
        ) : null}
        {readings.map((r, i) => (
          <div key={r.label} className={cn("flex min-w-[140px] flex-1 shrink-0 flex-col px-4 py-3", (i > 0 || props.tab === "published" || props.tab === "all") && "border-l border-[#eef0f2]")}>
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
  if (p.tab === "platforms") {
    const on = (p.platforms?.marketing ?? []).filter((m) => m.connected)
    const last = on.map((m) => m.lastSyncAt).filter((x): x is string => !!x).sort().at(-1)
    const d = p.platforms?.sending.domain ?? null
    return [
      { label: tt("Connected"), help: tt("Email platforms your subscribers and orders go to."), value: p.platforms ? n(on.length) : "–" },
      { label: tt("Subscribers sent"), help: tt("Subscribers who said yes, on every connected platform together."), value: p.platforms ? n(on.reduce((t, m) => t + m.counts.subscribed, 0)) : "–" },
      { label: tt("Last sync"), help: tt("The last time a connected platform was brought up to date."), value: last ? formatWhen(last) : "–" },
      { label: tt("Sending domain"), help: tt("The domain your emails come from once it is verified. Without one, they come from Storelib's address."), value: d ? (d.status === "verified" ? d.domain : tt("Not verified")) : tt("Storelib's") },
    ]
  }
  if (p.tab === "all") {
    /* Campaigns › All: the period's sending, and what is waiting. */
    const o = p.overview
    const scheduled = p.campaigns.filter((c) => c.kind === "scheduled")
    const next = scheduled.map((c) => c.scheduled_at).filter((x): x is string => !!x).sort()[0]
    return [
      { label: tt("Sent"), help: tt("Emails delivered to subscribers in this period."), value: o ? n(o.total_sent) : "–" },
      { label: tt("Open rate"), help: tt("Of the emails sent in this period, how many were opened."), value: o ? `${o.open_rate}%` : "–", note: o ? n(o.total_opened) : undefined },
      { label: tt("Click rate"), help: tt("Of the emails sent in this period, how many had a link clicked."), value: o ? `${o.click_rate}%` : "–", note: o ? n(o.total_clicked) : undefined },
      { label: tt("Scheduled"), help: tt("Emails waiting to go out."), value: n(scheduled.length), note: next ? formatWhen(next) : undefined },
      { label: tt("Drafts"), help: tt("Emails you started and have not sent."), value: n(p.campaigns.filter((c) => c.kind === "draft").length) },
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

export const th = "h-9 whitespace-nowrap px-3 text-left text-[12px] font-medium text-[#4b5563]"
export const td = "h-12 whitespace-nowrap px-3 text-[13px] text-[#1a1a2e]"
/**
 * The first column holds still while the rest scrolls under it, on a phone,
 * on the row's own opaque colour (hover and press included) so nothing shows
 * through it. Its cells carry `data-scroll-edge`: the table's frame draws the
 * shadow at their right side once the rows have moved
 * (components/app/scroll-edge).
 */
export const sticky = "orders-sticky sticky left-0 z-[1] bg-white transition-colors duration-75 group-hover:bg-[#fafbfb] group-active:bg-[#f4f5f7] group-data-[pressed=true]:bg-[#f4f5f7]"
export const stickyHead = "sticky left-0 z-[1] bg-[#fafbfb]"

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
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
export function Loading() {
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

/** A filter as a chip in the table's toolbar, the way Orders draws its own. */
export function FilterChip({
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
 * THE AUTOMATIONS. From 768px a table, one column per number. On a phone a
 * table of eight columns is a strip to scroll sideways with the name cut to
 * "Welcome ser...", so there each automation is a row of its own: the name
 * in full, what starts it, its steps and what it has done, with its switch
 * and its menu at the end, where a thumb is. Tapping the row opens it.
 */
/**
 * The owner's communities, for their automated messages under the store's
 * automations: from the Customer emails read when it is in, otherwise read
 * once here (the same kept read, /api/store/emails).
 */
function useCommunities(known: CustomerEmailsData | null | undefined): CommunityRef[] {
  const [read, setRead] = React.useState<CommunityRef[] | null>(() => peekGet<CustomerEmailsData>(CUSTOMER_EMAILS_PATH)?.communities ?? null)
  const have = known?.communities
  React.useEffect(() => {
    if (have || read) return
    let live = true
    void storeApi<CustomerEmailsData>(CUSTOMER_EMAILS_PATH).then((r) => live && r.ok && setRead(r.data.communities ?? []))
    return () => {
      live = false
    }
  }, [have, read])
  return have ?? read ?? []
}

function FlowsTable(props: EmailsHomeProps) {
  const router = useRouter()
  const press = usePress()
  const communities = useCommunities(props.customerEmails)
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
      {/* Each community's automated messages, with the store's automations; a row opens the community's own manager over this page. */}
      {!props.loading && communities.length ? (
        <section className="border-t border-[#f1f2f4] pb-1" aria-label={tt("Communities")} data-flow-communities="">
          <h3 className="px-4 pt-4 text-[14px] font-semibold text-[#1a1a2e] sm:px-5">{tt("Communities")}</h3>
          <CommunityAutomations communities={communities} titled={communities.length > 1} />
        </section>
      ) : null}
    </>
  )
}

/** Which list a row is from: its own mark, or the view it is drawn in. */
function kindOf(c: CampaignRow, tab: EmailsTab): "sent" | "scheduled" | "draft" {
  if (c.kind) return c.kind
  return tab === "drafts" ? "draft" : tab === "scheduled" ? "scheduled" : "sent"
}

/** In All, each row says what it is: a draft, scheduled, or how its send went. */
function KindBadge({ kind, status }: { kind: "sent" | "scheduled" | "draft"; status?: string }) {
  if (kind === "draft") return <StatusBadge tone="neutral">{tt("Draft")}</StatusBadge>
  if (kind === "scheduled") return <StatusBadge tone="attention">{tt("Scheduled")}</StatusBadge>
  return <SendBadge status={status} />
}

function CampaignsTable(props: EmailsHomeProps) {
  const narrow = useNarrow()
  const { tab } = props
  const router = useRouter()
  const press = usePress()
  const all = tab === "all"
  /* Sent figures (opened, clicked) have columns where sent emails are listed: Sent, and All. */
  const withStats = tab === "published" || all
  const [page, setPage] = React.useState(1)
  React.useEffect(() => setPage(1), [tab])
  const pages = Math.max(1, Math.ceil(props.campaigns.length / PAGE_SIZE))
  const shown = props.campaigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const empty =
    tab === "published"
      ? { title: tt("Nothing sent in this period"), body: tt("Emails you send show up here with how many were opened and clicked.") }
      : tab === "scheduled"
        ? { title: tt("Nothing scheduled"), body: tt("Write an email and choose when it goes out, and it waits here until then.") }
        : tab === "drafts"
          ? { title: tt("No drafts"), body: tt("An email you start and do not send yet is kept here.") }
          : { title: tt("No emails yet"), body: tt("Emails you send, schedule or start writing show up here, with how many were opened and clicked.") }
  const open = (c: CampaignRow) => (kindOf(c, tab) === "draft" ? openLayer(router, `/app/emails/edit/${c.id}`) : props.onOpenCampaign(c))
  const campaignMenu = (c: CampaignRow): ActionMenuItem[] => {
    const kind = kindOf(c, tab)
    return kind === "draft"
      ? [
          { label: tt("Edit"), onClick: () => open(c) },
          { label: tt("Duplicate"), onClick: () => props.onDuplicateCampaign(c) },
          { label: tt("Delete"), variant: "destructive", separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) },
        ]
      : [
          { label: kind === "sent" ? tt("View results") : tt("Open"), onClick: () => open(c) },
          ...(kind === "scheduled" ? [{ label: tt("Edit"), onClick: () => openLayer(router, `/app/emails/edit/${c.id}`) }] : []),
          { label: tt("Duplicate"), onClick: () => props.onDuplicateCampaign(c) },
          ...(c.status === "queued" || c.status === "sending" ? [] : [{ label: tt("Delete"), variant: "destructive" as const, separatorBefore: true, onClick: () => props.onDeleteCampaign(c.id) }]),
        ]
  }
  const when = (c: CampaignRow) => {
    const kind = kindOf(c, tab)
    return kind === "sent" ? formatDay(c.sent_at) : kind === "scheduled" ? formatWhen(c.scheduled_at) : formatDay(c.updated_at ?? c.created_at)
  }
  const titleOf = (c: CampaignRow) => (c.subject ?? "").replace(/\s*\(Resend\)\s*$/, "") || tt("Untitled")
  const badges = (c: CampaignRow, resent: boolean) => {
    const kind = kindOf(c, tab)
    const showKind = all ? kind !== "sent" || (c.status && c.status !== "sent") : kind === "sent" && c.status && c.status !== "sent"
    if (!resent && !showKind) return null
    return (
      <>
        {resent ? <StatusBadge tone="neutral">{tt("Sent again")}</StatusBadge> : null}
        {showKind ? <KindBadge kind={kind} status={c.status} /> : null}
      </>
    )
  }

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
              const sent = kindOf(c, tab) === "sent"
              const people = recipients ? tt("{n, plural, one {# recipient} other {# recipients}}", { n: recipients }) : null
              return (
                <PhoneItem
                  key={c.id}
                  data-campaign-row={c.id}
                  data-campaign-kind={kindOf(c, tab)}
                  data-order-id={c.id}
                  onClick={() => open(c)}
                  {...press(c.id, () => props.onCampaignIntent(c))}
                  head={title}
                  aside={when(c)}
                  line={sent && recipients ? tt("{opened} opened · {clicked} clicked", { opened: rate(c.unique_opens ?? 0, recipients), clicked: rate(c.unique_clicks ?? 0, recipients) }) : undefined}
                  meta={people ?? undefined}
                  badges={badges(c, resent) ?? undefined}
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
                  <th className={th}>{all ? tt("Date") : tab === "published" ? tt("Sent") : tab === "scheduled" ? tt("Goes out") : tt("Edited")}</th>
                  <th className={cn(th, "text-right")}>{tt("Recipients")}</th>
                  {withStats ? <th className={cn(th, "text-right")}>{tt("Opened")}</th> : null}
                  {withStats ? <th className={cn(th, "text-right")}>{tt("Clicked")}</th> : null}
                  <th className={cn(th, "w-12")} aria-label={tt("Actions")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f4]">
                {shown.map((c) => {
                  const recipients = c.recipient_count || c.audience_count || 0
                  const resent = /\(Resend\)/.test(c.subject ?? "")
                  const title = titleOf(c)
                  const items = campaignMenu(c)
                  const sent = kindOf(c, tab) === "sent"
                  return (
                    <tr key={c.id} className={cn("orders-row", pressable)} data-campaign-row={c.id} data-campaign-kind={kindOf(c, tab)} data-order-id={c.id} onClick={() => open(c)} {...press(c.id, () => props.onCampaignIntent(c))}>
                      <td data-scroll-edge="" className={cn(td, sticky)}>
                        {/* The limit is on the span: a table cell's own max-width is ignored.
                            Narrow on a phone, so the columns scrolling under it still show. */}
                        <span className="flex min-w-0 max-w-[180px] items-center gap-2 sm:max-w-[320px]">
                          <span className="truncate font-medium">{title}</span>
                          {badges(c, resent)}
                        </span>
                      </td>
                      <td className={cn(td, "tabular-nums text-[#4b5563]")}>{when(c)}</td>
                      <td className={cn(td, "text-right tabular-nums")}>{recipients ? recipients.toLocaleString(appLocale()) : "–"}</td>
                      {withStats ? <td className={cn(td, "text-right tabular-nums")}>{sent ? rate(c.unique_opens ?? 0, recipients) : "–"}</td> : null}
                      {withStats ? <td className={cn(td, "text-right tabular-nums")}>{sent ? rate(c.unique_clicks ?? 0, recipients) : "–"}</td> : null}
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
