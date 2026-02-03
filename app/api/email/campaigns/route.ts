import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// GET - Fetch campaigns for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
    const {
      data: { user },
    } = await supabase.auth.getUser()

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

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") || "sent"
    const timeRange = searchParams.get("timeRange") || "30d"

    console.log("[email/campaigns] Fetching campaigns for creator:", creator.id, "status:", status, "timeRange:", timeRange)

    // Calculate time range date
    const now = new Date()
    let timeRangeDate = new Date()

    switch (timeRange) {
      case "7d":
        timeRangeDate.setDate(now.getDate() - 7)
        break
      case "30d":
        timeRangeDate.setDate(now.getDate() - 30)
        break
      case "90d":
        timeRangeDate.setDate(now.getDate() - 90)
        break
      case "all":
        timeRangeDate = new Date(0)
        break
      default:
        timeRangeDate.setDate(now.getDate() - 30)
    }

    // Get campaigns using ADMIN client (bypasses RLS)
    const { data: campaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("status", status)
      .order("created_at", { ascending: false })

    if (campaignsError) {
      console.error("[email/campaigns] Error fetching campaigns:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns", details: campaignsError.message }, { status: 500 })
    }

    console.log("[email/campaigns] Found", campaigns?.length || 0, "campaigns with status:", status)

    // Filter by time range for stats calculation
    const filteredCampaigns = (campaigns || []).filter((c) => {
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= timeRangeDate
    })

    // Calculate total sent from audience_count
    const totalSent = filteredCampaigns.reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[email/campaigns] Total sent (filtered by timeRange):", totalSent)

    // Get ALL campaign IDs for events query (not just filtered ones)
    const allCampaignIds = (campaigns || []).map(c => c.id)
    const filteredCampaignIds = filteredCampaigns.map(c => c.id)

    // Get events for these campaigns
    let opened = 0
    let clicked = 0
    let unsubscribed = 0

    if (filteredCampaignIds.length > 0) {
      // Query events by campaign IDs within time range
      const { data: events, error: eventsError } = await adminSupabase
        .from("email_events")
        .select("event_type, campaign_id, created_at")
        .in("campaign_id", filteredCampaignIds)
        .gte("created_at", timeRangeDate.toISOString())

      if (eventsError) {
        console.error("[email/campaigns] Error fetching events:", eventsError)
      } else if (events) {
        opened = events.filter(e => e.event_type === "opened").length
        clicked = events.filter(e => e.event_type === "clicked").length
        unsubscribed = events.filter(e => e.event_type === "unsubscribed").length
        console.log("[email/campaigns] Events found:", { opened, clicked, unsubscribed, total: events.length })
      }
    }

    // Also try querying by creator_id in case events exist but campaign_id is null
    const { data: creatorEvents, error: creatorEventsError } = await adminSupabase
      .from("email_events")
      .select("event_type, campaign_id, created_at")
      .eq("creator_id", creator.id)
      .gte("created_at", timeRangeDate.toISOString())

    if (!creatorEventsError && creatorEvents && creatorEvents.length > 0) {
      // Merge with existing counts (avoid double counting)
      const existingCampaignIds = new Set(filteredCampaignIds)
      const additionalOpens = creatorEvents.filter(e =>
        e.event_type === "opened" && (!e.campaign_id || !existingCampaignIds.has(e.campaign_id))
      ).length
      const additionalClicks = creatorEvents.filter(e =>
        e.event_type === "clicked" && (!e.campaign_id || !existingCampaignIds.has(e.campaign_id))
      ).length
      const additionalUnsubs = creatorEvents.filter(e =>
        e.event_type === "unsubscribed" && (!e.campaign_id || !existingCampaignIds.has(e.campaign_id))
      ).length

      if (additionalOpens > 0 || additionalClicks > 0 || additionalUnsubs > 0) {
        console.log("[email/campaigns] Additional events from creator_id query:", { additionalOpens, additionalClicks, additionalUnsubs })
        opened += additionalOpens
        clicked += additionalClicks
        unsubscribed += additionalUnsubs
      }
    }

    // Calculate monthly usage
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const campaignsThisMonth = (campaigns || []).filter((c) => {
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= startOfMonth
    })
    const monthlyEmailsSent = campaignsThisMonth.reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[email/campaigns] Monthly emails sent:", monthlyEmailsSent)

    // Return filtered campaigns to match stats (user can see all by selecting "all" time range)
    return NextResponse.json({
      campaigns: timeRange === "all" ? (campaigns || []) : filteredCampaigns,
      stats: {
        totalSent,
        opened,
        clicked,
        unsubscribed,
        openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? Math.round((clicked / totalSent) * 100) : 0,
      },
      monthlyUsage: {
        sent: monthlyEmailsSent,
        limit: 3000,
      },
      debug: {
        creatorId: creator.id,
        totalCampaignCount: campaigns?.length || 0,
        filteredCampaignCount: filteredCampaigns.length,
        timeRangeDate: timeRangeDate.toISOString(),
        timeRange,
      }
    })
  } catch (error) {
    console.error("[email/campaigns] Error:", error)
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 })
  }
}
