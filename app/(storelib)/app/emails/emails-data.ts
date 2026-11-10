"use client"

/**
 * The reads behind each tab of /app/emails and an email's own page, each
 * under one key in the shared cache (components/email/emails-cache.ts), so a
 * tab read once is there the next time it is opened.
 */
import type { RecipientCounts } from "@/lib/email-campaigns/state"
import type { CampaignRow, EmailsTab, FlowRow, MessageRow, OverviewStats, SubscriberRow } from "./emails-home"
import { api } from "@/components/physical/ui"
import { CUSTOMER_EMAILS_PATH, prefetchCustomerActivity, type CustomerEmailsData } from "@/components/app/settings/customer-emails-panel"
import { tt } from "@/lib/i18n/text"
import { MARKETING_PATH, type MarketingState } from "@/components/app/settings/marketing-sync-panel"
import { SENDING_DOMAIN_PATH, type PlatformsData, type SendingDomainData } from "@/components/email/connected-platforms"
import { campaignsFrom, customerEmailsFrom, errorOf, flowsFrom, isRecord, marketingFrom, reportFrom, sendingDomainFrom, sentFrom } from "@/lib/emails/shapes"

/**
 * WHAT IS READ FOR EACH VIEW (round 51). The page has three tabs; what is
 * read is one of these views, each kept under its own key: Campaigns' four
 * filters (All reads the three others' lists at once), Automations, and
 * Settings' two sections.
 */
export const TABS: EmailsTab[] = ["all", "published", "scheduled", "drafts", "flows", "customer", "platforms"]

export function isTab(v: unknown): v is EmailsTab {
  return typeof v === "string" && (TABS as string[]).includes(v)
}

export { viewOf } from "./emails-route"

/** The cache key a view's data is kept under. Sent, and All with it, are kept per period. */
export function tabKey(tab: EmailsTab, period: string): string {
  return tab === "published" || tab === "all" ? `emails:${tab}:${period}` : `emails:${tab}`
}

export const reportKey = (id: string) => `emails:report:${id}`
export { campaignKey } from "@/components/email/emails-cache"

/*
  A READ THAT IS NOT JSON IS A READ THAT FAILED (wave 7). A 200 whose body
  could not be read (a sign-in page, an empty or cut answer) was taken as
  `{}` and kept as the tab's data: the automations list became an object and
  the page fell over on its next draw (`flows.find is not a function`). Now
  it is a failure the tab says so about, with Try again. What the body is
  made of is then checked by each loader (lib/emails/shapes.ts).
*/
const NOT_READ = Symbol("not read")
async function json(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: "no-store" })
  const data: unknown = await res.json().catch(() => NOT_READ)
  if (!res.ok) throw new Error(errorOf(data) || tt("Could not load"))
  if (data === NOT_READ) throw new Error(tt("Could not load"))
  return data
}

/** The answer in the shape the tab draws, or the read failed: the server's own words if it sent some. */
function shaped<T>(body: unknown, shape: (b: unknown) => T | null): T {
  const out = shape(body)
  if (out === null) throw new Error(errorOf(body) || tt("Could not load"))
  return out
}

export interface SubscribersData {
  rows: SubscriberRow[]
  /** Buyers who are not on the list, counted as reachable from the store. */
  buyers: number
}

/*
  The subscribers, the contact form messages and the automations are read
  on the server (app/api/email/area), by the store the session works in:
  the owner's own, or the one a team member given Marketing works in
  (lib/team). They were read here, under row level security, which answers
  only for the owner.
*/
export async function loadSubscribers(): Promise<SubscribersData> {
  return shaped(await json("/api/email/area?part=subscribers"), (b) => (isRecord(b) && Array.isArray(b.rows) ? { rows: b.rows.filter(isRecord) as unknown as SubscriberRow[], buyers: typeof b.buyers === "number" ? b.buyers : 0 } : null))
}

export interface MessagesData {
  rows: MessageRow[]
  /** The messages table is there (supabase/sql/run-now/30). */
  available: boolean
}

/**
 * What people wrote through the contact forms on the store's websites
 * (lib/site-contact), newest first. `read_at` comes with part 92; before it,
 * every message reads as read rather than the tab failing.
 */
export async function loadMessages(): Promise<MessagesData> {
  return shaped(await json("/api/email/area?part=messages"), (b) => (isRecord(b) && Array.isArray(b.rows) ? { rows: b.rows.filter(isRecord) as unknown as MessageRow[], available: b.available !== false } : null))
}

export async function loadFlows(): Promise<FlowRow[]> {
  return shaped(await json("/api/email/area?part=flows"), (b) => flowsFrom<FlowRow>(b))
}

export async function loadCampaigns(status: "draft" | "scheduled"): Promise<CampaignRow[]> {
  const rows = shaped(await json(`/api/email/campaigns?status=${status}`), (b) => campaignsFrom<CampaignRow>(b))
  return rows.map((c) => ({ ...c, kind: status }))
}

export interface SentData {
  campaigns: CampaignRow[]
  overview: OverviewStats
  usage: { sent: number; limit: number }
}

export async function loadSent(rangeQuery: string): Promise<SentData> {
  const r = shaped(await json(`/api/email/stats?${rangeQuery}`), (b) => sentFrom<CampaignRow>(b))
  return {
    campaigns: r.campaigns.map((c) => ({ ...c, kind: "sent" as const })),
    overview: {
      total_sent: r.stats.totalSent,
      total_opened: r.stats.totalOpens,
      total_clicked: r.stats.totalClicks,
      total_unsubscribed: r.stats.totalUnsubscribed,
      open_rate: r.stats.openRate,
      click_rate: r.stats.clickRate,
    },
    usage: r.monthlyUsage,
  }
}

/** Campaigns › All: what is sent in the period, what is scheduled and the drafts, read together. */
export interface AllData {
  sent: SentData
  scheduled: CampaignRow[]
  drafts: CampaignRow[]
}

export async function loadAll(rangeQuery: string): Promise<AllData> {
  const [sent, scheduled, drafts] = await Promise.all([loadSent(rangeQuery), loadCampaigns("scheduled"), loadCampaigns("draft")])
  return { sent, scheduled, drafts }
}

export { mergeCampaigns } from "./emails-route"

export function loadTab(tab: EmailsTab, rangeQuery: string): Promise<unknown> {
  switch (tab) {
    case "all":
      return loadAll(rangeQuery)
    case "flows":
      return loadFlows()
    case "published":
      return loadSent(rangeQuery)
    case "scheduled":
      return loadCampaigns("scheduled")
    case "drafts":
      return loadCampaigns("draft")
    case "customer":
      return loadCustomerEmails()
    case "platforms":
      return loadPlatforms()
  }
}

/**
 * Emails › Platforms: the connected email platforms (the same read
 * Settings › Integrations makes, so a connect in one is what the other
 * shows) and the store's own sending domain.
 */
export async function loadPlatforms(): Promise<SendingData> {
  const [m, d, who] = await Promise.all([
    api<{ marketing: MarketingState[] }>(MARKETING_PATH),
    api<SendingDomainData>(SENDING_DOMAIN_PATH),
    /* Round 51, Settings › Sending: who the emails are from and where replies go (app/api/email/area?part=sender). */
    json("/api/email/area?part=sender").catch(() => null),
  ])
  if (!m.ok) throw new Error(m.error || tt("Could not load your platforms."))
  if (!isRecord(m.data)) throw new Error(tt("Could not load your platforms."))
  const sender = isRecord(who)
    ? { name: typeof who.name === "string" ? who.name : null, replyTo: typeof who.replyTo === "string" ? who.replyTo : null, replyVia: who.replyVia === "contact" || who.replyVia === "support" || who.replyVia === "account" ? (who.replyVia as "contact" | "support" | "account") : null, fromAddress: typeof who.fromAddress === "string" ? who.fromAddress : null, ownDomain: who.ownDomain === true, storelibAddress: typeof who.storelibAddress === "string" ? who.storelibAddress : null }
    : null
  return { marketing: marketingFrom<MarketingState>(m.data.marketing), sending: d.ok ? sendingDomainFrom<NonNullable<SendingDomainData["domain"]>>(d.data) : { domain: null, ready: true, available: false }, sender }
}

/** Who the store's emails are from, and where a reply goes. */
export interface SenderInfo {
  name: string | null
  replyTo: string | null
  /** Which address replyTo is (lib/emails/reply-to.ts): Store details' contact email, the support email, or the account's own. */
  replyVia?: "contact" | "support" | "account" | null
  /** The address mail leaves from: the store's own once its domain is verified, else Storelib's. */
  fromAddress?: string | null
  ownDomain?: boolean
  /** Storelib's own address, what mail comes from without a verified domain. */
  storelibAddress?: string | null
}

/** Settings › Sending: the platforms and the sending domain, and the sender. */
export type SendingData = PlatformsData & { sender?: SenderInfo | null }

/**
 * The emails a buyer gets from the store, the same read Settings › Customer
 * emails makes (/api/store/emails), through the same kept read, so the
 * editor opened here or there draws at once from it and a save in one is
 * what the other shows.
 */
export async function loadCustomerEmails(): Promise<CustomerEmailsData> {
  const r = await api<CustomerEmailsData>(CUSTOMER_EMAILS_PATH)
  if (!r.ok) throw new Error(r.error || tt("Could not load your customer emails."))
  const data = customerEmailsFrom<CustomerEmailsData>(r.data)
  if (!data) throw new Error(tt("Could not load your customer emails."))
  /* What each has sent, read with the list, so the tab opens with its "sent" lines in place. */
  prefetchCustomerActivity(data)
  return data
}

/* ─── One email ─────────────────────────────────────────────────────── */

export interface EmailReport {
  campaign: {
    id: string
    subject: string
    preview_text: string
    status: string
    audience_type: string
    segment_id: string | null
    audience_count: number
    scheduled_at: string | null
    sent_at: string | null
    completed_at: string | null
    created_at: string | null
    updated_at: string | null
    track_opens: boolean
    last_error: string | null
  }
  counts: RecipientCounts | null
  stats: {
    sent: number
    delivered: number
    bounced: number
    complained: number
    opened: number
    clicked: number
    unsubscribed: number
    failed: number
    unknown: number
    skipped: number
    waiting: number
  } | null
  links: { url: string; clicks: number; people: number }[]
  html: string | null
  /** The email's public page (View in browser), once it is scheduled or sent. */
  view_url?: string | null
  sender: { name: string; from: string; replyTo: string; address: string | null } | null
  upgraded: boolean
}

export async function loadReport(id: string): Promise<EmailReport> {
  return shaped(await json(`/api/email/campaigns/${encodeURIComponent(id)}/report`), (b) => reportFrom<EmailReport>(b))
}
