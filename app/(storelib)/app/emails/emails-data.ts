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
import { loadLeads } from "./leads-panel"

export const TABS: EmailsTab[] = ["subscribers", "messages", "leads", "flows", "customer", "published", "scheduled", "drafts", "platforms"]

export function isTab(v: unknown): v is EmailsTab {
  return typeof v === "string" && (TABS as string[]).includes(v)
}

/** The cache key a tab's data is kept under. The Sent tab is kept per period. */
export function tabKey(tab: EmailsTab, period: string): string {
  return tab === "published" ? `emails:published:${period}` : `emails:${tab}`
}

export const reportKey = (id: string) => `emails:report:${id}`
export { campaignKey } from "@/components/email/emails-cache"

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || tt("Could not load"))
  return data as T
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
export function loadSubscribers(): Promise<SubscribersData> {
  return json<SubscribersData>("/api/email/area?part=subscribers")
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
export function loadMessages(): Promise<MessagesData> {
  return json<MessagesData>("/api/email/area?part=messages")
}

export function loadFlows(): Promise<FlowRow[]> {
  return json<FlowRow[]>("/api/email/area?part=flows")
}

export async function loadCampaigns(status: "draft" | "scheduled"): Promise<CampaignRow[]> {
  const r = await json<{ campaigns: CampaignRow[] }>(`/api/email/campaigns?status=${status}`)
  return r.campaigns ?? []
}

export interface SentData {
  campaigns: CampaignRow[]
  overview: OverviewStats
  usage: { sent: number; limit: number }
}

export async function loadSent(rangeQuery: string): Promise<SentData> {
  const r = await json<{
    campaigns: CampaignRow[]
    stats?: { totalSent?: number; totalOpens?: number; totalClicks?: number; totalUnsubscribed?: number; openRate?: number; clickRate?: number }
    monthlyUsage?: { sent?: number; limit?: number }
  }>(`/api/email/stats?${rangeQuery}`)
  return {
    campaigns: r.campaigns ?? [],
    overview: {
      total_sent: r.stats?.totalSent ?? 0,
      total_opened: r.stats?.totalOpens ?? 0,
      total_clicked: r.stats?.totalClicks ?? 0,
      total_unsubscribed: r.stats?.totalUnsubscribed ?? 0,
      open_rate: r.stats?.openRate ?? 0,
      click_rate: r.stats?.clickRate ?? 0,
    },
    usage: { sent: r.monthlyUsage?.sent ?? 0, limit: r.monthlyUsage?.limit ?? 500 },
  }
}

export function loadTab(tab: EmailsTab, rangeQuery: string): Promise<unknown> {
  switch (tab) {
    case "subscribers":
      return loadSubscribers()
    case "messages":
      return loadMessages()
    /* Answers to the creator's forms (./leads-panel): moved here from the Audience item, beside the people Emails already keeps. */
    case "leads":
      return loadLeads()
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
export async function loadPlatforms(): Promise<PlatformsData> {
  const [m, d] = await Promise.all([api<{ marketing: MarketingState[] }>(MARKETING_PATH), api<SendingDomainData>(SENDING_DOMAIN_PATH)])
  if (!m.ok) throw new Error(m.error || tt("Could not load your platforms."))
  return { marketing: m.data.marketing, sending: d.ok ? d.data : { domain: null, ready: true, available: false } }
}

/**
 * The emails a buyer gets from the store, the same read Settings › Customer
 * emails makes (/api/store/emails), through the same kept read, so the
 * editor opened here or there draws at once from it and a save in one is
 * what the other shows.
 */
export async function loadCustomerEmails(): Promise<CustomerEmailsData> {
  const r = await api<CustomerEmailsData>(CUSTOMER_EMAILS_PATH)
  if (!r.ok) throw new Error(r.error || tt("Could not load your customer emails."))
  /* What each has sent, read with the list, so the tab opens with its "sent" lines in place. */
  prefetchCustomerActivity(r.data)
  return r.data
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

export function loadReport(id: string): Promise<EmailReport> {
  return json<EmailReport>(`/api/email/campaigns/${encodeURIComponent(id)}/report`)
}
