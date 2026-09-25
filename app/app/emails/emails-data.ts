"use client"

/**
 * The reads behind each tab of /app/emails and an email's own page, each
 * under one key in the shared cache (components/email/emails-cache.ts), so a
 * tab read once is there the next time it is opened.
 */
import { createClient } from "@/lib/supabase/client"
import type { RecipientCounts } from "@/lib/email-campaigns/state"
import type { CampaignRow, EmailsTab, FlowRow, FlowTotals, OverviewStats, SubscriberRow } from "./emails-home"

export const TABS: EmailsTab[] = ["subscribers", "flows", "published", "scheduled", "drafts"]

export function isTab(v: unknown): v is EmailsTab {
  return typeof v === "string" && (TABS as string[]).includes(v)
}

/** The cache key a tab's data is kept under. The Sent tab is kept per period. */
export function tabKey(tab: EmailsTab, period: string): string {
  return tab === "published" ? `emails:published:${period}` : `emails:${tab}`
}

export const reportKey = (id: string) => `emails:report:${id}`
export { campaignKey } from "@/components/email/emails-cache"

let who: Promise<{ creatorId: string } | null> | null = null

/** The signed-in creator, read once for the life of the page. */
export function currentCreator(): Promise<{ creatorId: string } | null> {
  if (!who) {
    who = (async () => {
      const supabase = createClient()
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) return null
      const { data } = await supabase.from("creators").select("id").eq("user_id", auth.user.id).maybeSingle()
      return data ? { creatorId: data.id as string } : null
    })().catch(() => {
      who = null
      return null
    })
  }
  return who
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || "Could not load")
  return data as T
}

export interface SubscribersData {
  rows: SubscriberRow[]
  /** Buyers who are not on the list, counted as reachable from the store. */
  buyers: number
}

export async function loadSubscribers(): Promise<SubscribersData> {
  const me = await currentCreator()
  if (!me) throw new Error("Sign in again to see your subscribers.")
  const supabase = createClient()
  const { data, error } = await supabase
    .from("subscribers")
    .select("id, email, name, source, source_detail, consent_text, status, subscribed_at, unsubscribed_at")
    .eq("creator_id", me.creatorId)
    .order("subscribed_at", { ascending: false })
  let rows = data as SubscriberRow[] | null
  if (error) {
    /* Before the contact-source columns existed. */
    const basic = await supabase.from("subscribers").select("id, email, name, source, status, subscribed_at, unsubscribed_at").eq("creator_id", me.creatorId).order("subscribed_at", { ascending: false })
    if (basic.error) throw new Error("Could not load your subscribers.")
    rows = basic.data as SubscriberRow[]
  }
  const list = rows ?? []

  let buyers = 0
  const { data: products } = await supabase.from("products").select("id").eq("creator_id", me.creatorId)
  if (products && products.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("buyer_email")
      .in("product_id", products.map((p: { id: string }) => p.id))
      .eq("status", "completed")
    const onList = new Set(list.map((s) => s.email.toLowerCase()))
    buyers = new Set((orders ?? []).map((o: { buyer_email?: string | null }) => o.buyer_email?.toLowerCase()).filter((e: string | undefined): e is string => !!e && !onList.has(e))).size
  }
  return { rows: list, buyers }
}

export async function loadFlows(): Promise<FlowRow[]> {
  const me = await currentCreator()
  if (!me) throw new Error("Sign in again to see your automations.")
  const supabase = createClient()
  const { data, error } = await supabase
    .from("email_flows")
    .select("id, name, trigger_type, trigger_config, status, steps, updated_at")
    .eq("creator_id", me.creatorId)
    .order("created_at", { ascending: false })
  if (error) throw new Error("Could not load your automations.")
  /* What each has sent, from the engine's own records. Before its SQL has run there are none, and the columns read a dash. */
  const { data: totals } = await supabase.rpc("email_flow_totals").then(
    (r: { data: unknown }) => r,
    () => ({ data: null }),
  )
  const byFlow = new Map<string, FlowTotals>((Array.isArray(totals) ? totals : []).map((t: FlowTotals & { flow_id: string }) => [t.flow_id, t]))
  return (data ?? []).map((f: FlowRow) => ({ ...f, totals: byFlow.get(f.id) ?? null }))
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
    case "flows":
      return loadFlows()
    case "published":
      return loadSent(rangeQuery)
    case "scheduled":
      return loadCampaigns("scheduled")
    case "drafts":
      return loadCampaigns("draft")
  }
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
  sender: { name: string; from: string; replyTo: string; address: string | null } | null
  upgraded: boolean
}

export function loadReport(id: string): Promise<EmailReport> {
  return json<EmailReport>(`/api/email/campaigns/${encodeURIComponent(id)}/report`)
}
