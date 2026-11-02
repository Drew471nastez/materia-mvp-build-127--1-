import { type NextRequest, NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { monthlyLimit } from "@/lib/email-campaigns/limits"
import { usedThisMonth } from "@/lib/email-campaigns/queue"

/** The Sent view: everything that has been through Send, however it ended, so nothing disappears. */
const SENT_VIEW = ["queued", "sending", "sent", "partially_failed", "failed", "cancelled"]
/** A recipient row the provider accepted. */
const WENT_OUT = ["sent", "delivered", "bounced", "complained"]

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// GET - Fetch sent campaigns and stats
export async function GET(request: NextRequest) {
  try {
    /* The store's emails, for its owner or a team member given Marketing (lib/team). */
    const gate = await requireTeamPermission("marketing", { read: true })
    if (gate instanceof NextResponse) return gate.status === 401 ? NextResponse.json({ error: "Unauthorized" }, { status: 401 }) : gate
    const adminSupabase = createAdminClient()
    const creator = { id: gate.creatorId }

    const searchParams = request.nextUrl.searchParams
    const timeRange = searchParams.get("timeRange") || "30d"
    const campaignId = searchParams.get("campaignId")

    // If requesting single campaign stats
    if (campaignId) {
      return getCampaignDetails(adminSupabase, creator.id, campaignId)
    }

    // Calculate date range
    const now = new Date()
    let startDate: Date | null = null

    switch (timeRange) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = null
    }
    /* A range from the shared date picker: ?start=&end=, both instants. */
    let endDate: Date | null = null
    const startParam = Date.parse(searchParams.get("start") ?? "")
    const endParam = Date.parse(searchParams.get("end") ?? "")
    if (Number.isFinite(startParam) && Number.isFinite(endParam) && endParam > startParam) {
      startDate = new Date(startParam)
      endDate = new Date(endParam)
    }

    // Get all sent campaigns
    const { data: campaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, preview_text, status, audience_type, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .in("status", SENT_VIEW)
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[stats] Campaigns error:", campaignsError.code)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    if (!campaigns || campaigns.length === 0) {
      const { data: plan } = await adminSupabase.from("creators").select("subscription_plan_id, subscription_status").eq("id", creator.id).maybeSingle()
      return createResponse({
        campaigns: [],
        stats: { totalSent: 0, totalOpens: 0, totalClicks: 0, totalUnsubscribed: 0, openRate: 0, clickRate: 0 },
        monthlyUsage: { sent: 0, limit: monthlyLimit(plan?.subscription_plan_id, plan?.subscription_status) },
      })
    }

    const campaignIds = campaigns.map(c => c.id)

    // Get recipient stats from campaign_recipients
    /* In pages: PostgREST answers a thousand rows at a time, and a list past that was undercounted. */
    const recipientStats: { campaign_id: string; opened_at: string | null; clicked_at: string | null }[] = []
    for (let from = 0; from < 200_000; from += 1000) {
      const { data: page } = await adminSupabase
        .from("campaign_recipients")
        .select("campaign_id, opened_at, clicked_at")
        .in("campaign_id", campaignIds)
        .in("status", WENT_OUT)
        .order("id", { ascending: true })
        .range(from, from + 999)
      recipientStats.push(...(page ?? []))
      if (!page || page.length < 1000) break
    }

    // Aggregate by campaign
    const statsByCampaign: Record<string, { sent: number; opened: number; clicked: number }> = {}
    for (const r of recipientStats || []) {
      if (!statsByCampaign[r.campaign_id]) {
        statsByCampaign[r.campaign_id] = { sent: 0, opened: 0, clicked: 0 }
      }
      statsByCampaign[r.campaign_id].sent++
      if (r.opened_at) statsByCampaign[r.campaign_id].opened++
      if (r.clicked_at) statsByCampaign[r.campaign_id].clicked++
    }

    // Get unsubscribe counts from email_events
    const { data: unsubEvents } = await adminSupabase
      .from("email_events")
      .select("campaign_id")
      .in("campaign_id", campaignIds)
      .eq("event_type", "unsubscribed")

    const unsubsByCampaign: Record<string, number> = {}
    for (const e of unsubEvents || []) {
      if (e.campaign_id) {
        unsubsByCampaign[e.campaign_id] = (unsubsByCampaign[e.campaign_id] || 0) + 1
      }
    }

    // Build campaigns with stats
    const campaignsWithStats = campaigns.map(c => {
      const stats = statsByCampaign[c.id] || { sent: 0, opened: 0, clicked: 0 }
      const recipientCount = stats.sent || c.audience_count || 0
      return {
        id: c.id,
        subject: c.subject,
        preview_text: c.preview_text,
        status: c.status,
        audience_type: c.audience_type,
        sent_at: c.sent_at,
        created_at: c.created_at,
        recipient_count: recipientCount,
        unique_opens: stats.opened,
        unique_clicks: stats.clicked,
        unsubscribed: unsubsByCampaign[c.id] || 0,
      }
    })

    // Calculate aggregate stats (filtered by time range)
    const campaignsInRange = campaigns.filter(c => {
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      if (endDate && sentDate >= endDate) return false
      if (!startDate) return true
      return sentDate >= startDate
    })

    let totalSent = 0
    let totalOpens = 0
    let totalClicks = 0
    let totalUnsubscribed = 0

    for (const c of campaignsInRange) {
      const stats = statsByCampaign[c.id] || { sent: 0, opened: 0, clicked: 0 }
      totalSent += stats.sent || c.audience_count || 0
      totalOpens += stats.opened || 0
      totalClicks += stats.clicked || 0
      totalUnsubscribed += unsubsByCampaign[c.id] || 0
    }

    const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0
    const clickRate = totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0

    // Monthly usage, against the plan's own limit
    const monthlyEmailsSent = await usedThisMonth(adminSupabase, creator.id)
    const { data: plan } = await adminSupabase.from("creators").select("subscription_plan_id, subscription_status").eq("id", creator.id).maybeSingle()

    return createResponse({
      campaigns: campaignsWithStats,
      stats: {
        totalSent,
        totalOpens,
        totalClicks,
        totalUnsubscribed,
        openRate,
        clickRate,
      },
      monthlyUsage: {
        sent: monthlyEmailsSent,
        limit: monthlyLimit(plan?.subscription_plan_id, plan?.subscription_status),
      },
    })

  } catch (error) {
    console.error("[stats] Error:", error instanceof Error ? error.name : "unknown")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Get detailed stats for a single campaign
async function getCampaignDetails(adminSupabase: ReturnType<typeof createAdminClient>, creatorId: string, campaignId: string) {
  // Get campaign
  const { data: campaign, error: campaignError } = await adminSupabase
    .from("email_campaigns")
    .select("*")
    .eq("id", campaignId)
    .eq("creator_id", creatorId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  // Get recipients with their stats
  const { data: recipients } = await adminSupabase
    .from("campaign_recipients")
    .select("id, email, name, status, sent_at, opened_at, clicked_at, open_count, click_count")
    .eq("campaign_id", campaignId)
    .order("sent_at", { ascending: false })

  // Get events for unsubscribes
  const { data: events } = await adminSupabase
    .from("email_events")
    .select("email, event_type, created_at")
    .eq("campaign_id", campaignId)
    .eq("event_type", "unsubscribed")

  // Build unsubscribed set
  const unsubscribedEmails = new Set((events || []).map(e => e.email))

  // Enrich recipients with unsubscribe status
  const enrichedRecipients = (recipients || []).map(r => ({
    ...r,
    unsubscribed: unsubscribedEmails.has(r.email),
  }))

  // Calculate stats
  const totalSent = recipients?.filter(r => WENT_OUT.includes(r.status)).length || 0
  const totalBounced = recipients?.filter(r => r.status === "bounced").length || 0
  const totalOpened = recipients?.filter(r => r.opened_at).length || 0
  const totalClicked = recipients?.filter(r => r.clicked_at).length || 0
  const totalUnsubscribed = unsubscribedEmails.size

  return createResponse({
    campaign: {
      id: campaign.id,
      subject: campaign.subject,
      preview_text: campaign.preview_text,
      body: campaign.body,
      status: campaign.status,
      audience_type: campaign.audience_type,
      sent_at: campaign.sent_at,
      created_at: campaign.created_at,
    },
    recipients: enrichedRecipients,
    stats: {
      sent: totalSent,
      delivered: totalSent - totalBounced,
      opened: totalOpened,
      clicked: totalClicked,
      bounced: totalBounced,
      unsubscribed: totalUnsubscribed,
      openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
      clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0,
    },
  })
}

function createResponse(data: Record<string, unknown>) {
  const response = NextResponse.json(data)
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  return response
}
