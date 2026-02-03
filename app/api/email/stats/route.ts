import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Force dynamic rendering - no caching
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

interface CampaignWithStats {
  id: string
  subject: string
  preview_text: string | null
  status: string
  audience_type: string
  sent_at: string | null
  created_at: string
  recipient_count: number
  unique_opens: number
  unique_clicks: number
}

// GET - Fetch sent campaigns and stats for the Sent tab
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator
    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 })
    }

    // Parse query params
    const searchParams = request.nextUrl.searchParams
    const timeRange = searchParams.get("timeRange") || "30d"
    const campaignId = searchParams.get("campaignId") // Optional: get stats for specific campaign

    console.log(`[stats] Request for creator ${creator.id}, timeRange: ${timeRange}, campaignId: ${campaignId || 'all'}`)

    // Calculate date range for aggregate stats
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
      case "all":
      default:
        startDate = null
        break
    }

    // If requesting stats for a specific campaign
    if (campaignId) {
      return await getCampaignStats(adminSupabase, creator.id, campaignId)
    }

    // STEP 1: Get ALL sent campaigns (list always shows all, no date filter)
    const { data: allCampaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, preview_text, status, audience_type, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[stats] Campaigns query error:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    const campaigns = allCampaigns || []
    console.log(`[stats] Found ${campaigns.length} sent campaigns`)

    if (campaigns.length === 0) {
      // No campaigns - return empty stats
      return createStatsResponse({
        campaigns: [],
        stats: { totalSent: 0, totalOpens: 0, totalClicks: 0, totalUnsubscribed: 0, openRate: 0, clickRate: 0 },
        monthlyUsage: { sent: 0, limit: 3000 },
        debug: { queryTime: Date.now() - startTime, campaignCount: 0, eventsQueried: 0 }
      })
    }

    const campaignIds = campaigns.map(c => c.id)

    // STEP 2: Get all tracking events for these campaigns in one query
    const { data: allEvents, error: eventsError } = await adminSupabase
      .from("email_events")
      .select("campaign_id, event_type, email")
      .in("campaign_id", campaignIds)
      .in("event_type", ["opened", "clicked", "unsubscribed"])

    if (eventsError) {
      console.error("[stats] Events query error:", eventsError)
      // Continue without events - campaigns still show
    }

    const events = allEvents || []
    console.log(`[stats] Found ${events.length} tracking events`)

    // STEP 3: Aggregate events by campaign
    const opensByCampaign: Record<string, Set<string>> = {}
    const clicksByCampaign: Record<string, Set<string>> = {}
    const unsubsByCampaign: Record<string, Set<string>> = {}

    for (const event of events) {
      const cid = event.campaign_id
      const email = event.email || "unknown"

      if (event.event_type === "opened") {
        if (!opensByCampaign[cid]) opensByCampaign[cid] = new Set()
        opensByCampaign[cid].add(email)
      } else if (event.event_type === "clicked") {
        if (!clicksByCampaign[cid]) clicksByCampaign[cid] = new Set()
        clicksByCampaign[cid].add(email)
      } else if (event.event_type === "unsubscribed") {
        if (!unsubsByCampaign[cid]) unsubsByCampaign[cid] = new Set()
        unsubsByCampaign[cid].add(email)
      }
    }

    // STEP 4: Build campaigns list with per-campaign stats
    const campaignsWithStats: CampaignWithStats[] = campaigns.map(c => ({
      id: c.id,
      subject: c.subject,
      preview_text: c.preview_text,
      status: c.status,
      audience_type: c.audience_type,
      sent_at: c.sent_at,
      created_at: c.created_at,
      recipient_count: c.audience_count || 0,
      unique_opens: opensByCampaign[c.id]?.size || 0,
      unique_clicks: clicksByCampaign[c.id]?.size || 0,
    }))

    // STEP 5: Calculate aggregate stats (filtered by time range)
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
      totalSent += c.audience_count || 0
      totalOpens += opensByCampaign[c.id]?.size || 0
      totalClicks += clicksByCampaign[c.id]?.size || 0
      totalUnsubscribed += unsubsByCampaign[c.id]?.size || 0
    }

    // Calculate rates
    const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0
    const clickRate = totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0

    // STEP 6: Calculate monthly usage
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyEmailsSent = campaigns
      .filter(c => c.sent_at && new Date(c.sent_at) >= startOfMonth)
      .reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log(`[stats] Aggregate - sent: ${totalSent}, opens: ${totalOpens}, clicks: ${totalClicks}, unsubs: ${totalUnsubscribed}`)
    console.log(`[stats] Monthly usage: ${monthlyEmailsSent}/3000`)
    console.log(`[stats] Query completed in ${Date.now() - startTime}ms`)

    return createStatsResponse({
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
        limit: 3000, // TODO: Get from user's plan
      },
      debug: {
        queryTime: Date.now() - startTime,
        campaignCount: campaigns.length,
        eventsQueried: events.length,
        timeRange,
        campaignsInRange: campaignsInRange.length,
      }
    })

  } catch (error) {
    console.error("[stats] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Get stats for a single campaign
async function getCampaignStats(adminSupabase: ReturnType<typeof createAdminClient>, creatorId: string, campaignId: string) {
  // Verify campaign belongs to creator
  const { data: campaign, error: campaignError } = await adminSupabase
    .from("email_campaigns")
    .select("id, audience_count")
    .eq("id", campaignId)
    .eq("creator_id", creatorId)
    .single()

  if (campaignError || !campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  }

  // Get events for this campaign
  const { data: events } = await adminSupabase
    .from("email_events")
    .select("event_type, email")
    .eq("campaign_id", campaignId)

  const eventCounts = {
    sent: campaign.audience_count || 0,
    delivered: campaign.audience_count || 0, // Assume all sent = delivered for now
    opened: 0,
    clicked: 0,
    bounced: 0,
    unsubscribed: 0,
  }

  const uniqueOpens = new Set<string>()
  const uniqueClicks = new Set<string>()

  for (const event of events || []) {
    switch (event.event_type) {
      case "opened":
        uniqueOpens.add(event.email)
        break
      case "clicked":
        uniqueClicks.add(event.email)
        break
      case "bounced":
        eventCounts.bounced++
        break
      case "unsubscribed":
        eventCounts.unsubscribed++
        break
    }
  }

  eventCounts.opened = uniqueOpens.size
  eventCounts.clicked = uniqueClicks.size

  return createStatsResponse({
    stats: eventCounts,
  })
}

// Helper to create response with no-cache headers
function createStatsResponse(data: Record<string, unknown>) {
  const response = NextResponse.json(data)

  // Aggressive no-cache headers
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0")
  response.headers.set("Pragma", "no-cache")
  response.headers.set("Expires", "0")
  response.headers.set("Surrogate-Control", "no-store")
  response.headers.set("X-Accel-Expires", "0")

  return response
}
