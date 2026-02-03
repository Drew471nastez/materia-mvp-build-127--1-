import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// GET - Fetch sent campaigns and stats for the Sent tab
export async function GET(request: NextRequest) {
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

    console.log("[stats] Creator:", creator.id, "timeRange:", timeRange)

    // Calculate date filter for stats
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
        startDate = null
        break
    }

    // STEP 1: Get ALL sent campaigns (no date filter for the list)
    const { data: campaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, preview_text, status, audience_type, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[stats] Campaigns error:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    console.log("[stats] Found", campaigns?.length || 0, "sent campaigns")

    // STEP 2: Get open/click events for ALL campaigns
    const campaignIds = (campaigns || []).map(c => c.id)

    let opensByCampaign: Record<string, number> = {}
    let clicksByCampaign: Record<string, number> = {}

    if (campaignIds.length > 0) {
      // Get events grouped by campaign
      const { data: events } = await adminSupabase
        .from("email_events")
        .select("campaign_id, event_type, email")
        .in("campaign_id", campaignIds)
        .in("event_type", ["opened", "clicked"])

      if (events && events.length > 0) {
        console.log("[stats] Found", events.length, "tracking events")

        // Count unique opens/clicks per campaign (by unique email)
        const openEmails: Record<string, Set<string>> = {}
        const clickEmails: Record<string, Set<string>> = {}

        events.forEach(e => {
          const email = e.email || "unknown"
          if (e.event_type === "opened") {
            if (!openEmails[e.campaign_id]) openEmails[e.campaign_id] = new Set()
            openEmails[e.campaign_id].add(email)
          }
          if (e.event_type === "clicked") {
            if (!clickEmails[e.campaign_id]) clickEmails[e.campaign_id] = new Set()
            clickEmails[e.campaign_id].add(email)
          }
        })

        // Convert to counts
        Object.keys(openEmails).forEach(cid => {
          opensByCampaign[cid] = openEmails[cid].size
        })
        Object.keys(clickEmails).forEach(cid => {
          clicksByCampaign[cid] = clickEmails[cid].size
        })
      }
    }

    // STEP 3: Build campaigns list with stats
    const campaignsWithStats = (campaigns || []).map(c => ({
      id: c.id,
      subject: c.subject,
      preview_text: c.preview_text,
      status: c.status,
      audience_type: c.audience_type,
      sent_at: c.sent_at,
      created_at: c.created_at,
      recipient_count: c.audience_count || 0,
      unique_opens: opensByCampaign[c.id] || 0,
      unique_clicks: clicksByCampaign[c.id] || 0,
    }))

    // STEP 4: Calculate aggregate stats (filtered by timeRange)
    const campaignsInRange = (campaigns || []).filter(c => {
      if (!startDate) return true
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= startDate
    })

    let totalSent = 0
    let totalOpens = 0
    let totalClicks = 0

    campaignsInRange.forEach(c => {
      totalSent += c.audience_count || 0
      totalOpens += opensByCampaign[c.id] || 0
      totalClicks += clicksByCampaign[c.id] || 0
    })

    // Get unsubscribes from events
    let totalUnsubscribed = 0
    const { data: unsubEvents } = await adminSupabase
      .from("email_events")
      .select("id, created_at")
      .eq("creator_id", creator.id)
      .eq("event_type", "unsubscribed")

    if (unsubEvents) {
      if (startDate) {
        totalUnsubscribed = unsubEvents.filter(e => new Date(e.created_at) >= startDate).length
      } else {
        totalUnsubscribed = unsubEvents.length
      }
    }

    // STEP 5: Calculate monthly usage
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyEmailsSent = (campaigns || [])
      .filter(c => c.sent_at && new Date(c.sent_at) >= startOfMonth)
      .reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[stats] Stats - totalSent:", totalSent, "opens:", totalOpens, "clicks:", totalClicks, "monthly:", monthlyEmailsSent)

    // Build response
    const response = NextResponse.json({
      campaigns: campaignsWithStats,
      stats: {
        totalSent,
        totalOpens,
        totalClicks,
        totalUnsubscribed,
        openRate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? Math.round((totalClicks / totalSent) * 100) : 0,
      },
      monthlyUsage: {
        sent: monthlyEmailsSent,
        limit: 3000,
      },
    })

    // Prevent caching
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")

    return response
  } catch (error) {
    console.error("[stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
