import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// GET - Fetch sent campaigns and stats
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

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

    // Get all sent campaigns
    const { data: campaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, preview_text, body, status, audience_type, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[stats] Campaigns error:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    if (!campaigns || campaigns.length === 0) {
      return createResponse({
        campaigns: [],
        stats: { totalSent: 0, totalOpens: 0, totalClicks: 0, totalUnsubscribed: 0, openRate: 0, clickRate: 0 },
        monthlyUsage: { sent: 0, limit: 3000 },
      })
    }

    const campaignIds = campaigns.map(c => c.id)

    // Get recipient stats from campaign_recipients
    const { data: recipientStats } = await adminSupabase
      .from("campaign_recipients")
      .select("campaign_id, status, opened_at, clicked_at")
      .in("campaign_id", campaignIds)
      .eq("status", "sent")

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
        body: c.body,
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
      if (!startDate) return true
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
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

    // Monthly usage
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyEmailsSent = campaigns
      .filter(c => c.sent_at && new Date(c.sent_at) >= startOfMonth)
      .reduce((sum, c) => sum + (c.audience_count || 0), 0)

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
        limit: 3000,
      },
    })

  } catch (error) {
    console.error("[stats] Error:", error)
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
  const totalSent = recipients?.filter(r => r.status === "sent").length || 0
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
      delivered: totalSent, // Assume all sent = delivered for now
      opened: totalOpened,
      clicked: totalClicked,
      bounced: recipients?.filter(r => r.status === "bounced").length || 0,
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
