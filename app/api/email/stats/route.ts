import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

// GET - Fetch campaigns and comprehensive stats for Sent tab
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
    const status = searchParams.get("status") || "sent"

    console.log("[stats] Creator:", creator.id, "timeRange:", timeRange, "status:", status)

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
      case "all":
        startDate = null
        break
    }

    // FETCH ALL CAMPAIGNS (no time filter on the list - we want to show all sent campaigns)
    const { data: allCampaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("status", status)
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[stats] Campaigns error:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    console.log("[stats] Found", allCampaigns?.length || 0, "campaigns")

    // Filter campaigns by time range for STATS only
    const campaignsInRange = (allCampaigns || []).filter(c => {
      if (!startDate) return true
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= startDate
    })

    const campaignIds = campaignsInRange.map(c => c.id)

    // Get recipient stats - check BOTH tables and merge results
    let recipientStats: Record<string, { total: number; uniqueOpens: number; uniqueClicks: number }> = {}

    if (campaignIds.length > 0) {
      // Check email_recipients (new schema)
      const { data: recipients } = await adminSupabase
        .from("email_recipients")
        .select("campaign_id, status, opened_at, clicked_at")
        .in("campaign_id", campaignIds)

      if (recipients && recipients.length > 0) {
        console.log("[stats] Found", recipients.length, "rows in email_recipients")
        recipients.forEach(r => {
          if (!recipientStats[r.campaign_id]) {
            recipientStats[r.campaign_id] = { total: 0, uniqueOpens: 0, uniqueClicks: 0 }
          }
          if (r.status === "sent" || r.status === "delivered") {
            recipientStats[r.campaign_id].total++
          }
          if (r.opened_at) recipientStats[r.campaign_id].uniqueOpens++
          if (r.clicked_at) recipientStats[r.campaign_id].uniqueClicks++
        })
      }

      // ALSO check email_sends (old schema) and merge for campaigns with no recipients data
      const { data: sends } = await adminSupabase
        .from("email_sends")
        .select("campaign_id, status")
        .in("campaign_id", campaignIds)

      if (sends && sends.length > 0) {
        console.log("[stats] Found", sends.length, "rows in email_sends")
        sends.forEach(s => {
          // Only use email_sends data if email_recipients doesn't have data for this campaign
          if (!recipientStats[s.campaign_id]) {
            recipientStats[s.campaign_id] = { total: 0, uniqueOpens: 0, uniqueClicks: 0 }
          }
          // For campaigns without email_recipients data, count from email_sends
          // (We check by seeing if the total is still 0 after processing recipients)
        })

        // For campaigns with no recipient stats yet, count from sends
        sends.forEach(s => {
          if (recipientStats[s.campaign_id] && recipientStats[s.campaign_id].total === 0) {
            if (s.status === "sent" || s.status === "delivered" || s.status === "opened" || s.status === "clicked") {
              recipientStats[s.campaign_id].total++
            }
          }
        })
      }
    }

    // Get event counts for opens and clicks from email_events
    let opensByRecipient: Record<string, Set<string>> = {}
    let clicksByRecipient: Record<string, Set<string>> = {}

    if (campaignIds.length > 0) {
      const { data: events } = await adminSupabase
        .from("email_events")
        .select("campaign_id, event_type, email, recipient_email")
        .in("campaign_id", campaignIds)
        .in("event_type", ["opened", "clicked"])

      if (events && events.length > 0) {
        console.log("[stats] Found", events.length, "events")
        events.forEach(e => {
          const email = e.email || e.recipient_email || "unknown"
          if (e.event_type === "opened") {
            if (!opensByRecipient[e.campaign_id]) opensByRecipient[e.campaign_id] = new Set()
            opensByRecipient[e.campaign_id].add(email)
          }
          if (e.event_type === "clicked") {
            if (!clicksByRecipient[e.campaign_id]) clicksByRecipient[e.campaign_id] = new Set()
            clicksByRecipient[e.campaign_id].add(email)
          }
        })
      }
    }

    // Build campaigns with stats for the LIST (all campaigns, not filtered)
    const campaignsWithStats: CampaignWithStats[] = (allCampaigns || []).map(c => {
      const stats = recipientStats[c.id] || { total: 0, uniqueOpens: 0, uniqueClicks: 0 }
      const eventOpens = opensByRecipient[c.id]?.size || 0
      const eventClicks = clicksByRecipient[c.id]?.size || 0

      return {
        id: c.id,
        subject: c.subject,
        preview_text: c.preview_text,
        status: c.status,
        audience_type: c.audience_type,
        sent_at: c.sent_at,
        created_at: c.created_at,
        recipient_count: stats.total || c.audience_count || 0,
        unique_opens: stats.uniqueOpens || eventOpens,
        unique_clicks: stats.uniqueClicks || eventClicks,
      }
    })

    // Calculate aggregate STATS (from time-filtered campaigns)
    let totalSent = 0
    let totalOpens = 0
    let totalClicks = 0

    campaignsInRange.forEach(c => {
      const stats = recipientStats[c.id] || { total: 0, uniqueOpens: 0, uniqueClicks: 0 }
      const eventOpens = opensByRecipient[c.id]?.size || 0
      const eventClicks = clicksByRecipient[c.id]?.size || 0

      totalSent += stats.total || c.audience_count || 0
      totalOpens += stats.uniqueOpens || eventOpens
      totalClicks += stats.uniqueClicks || eventClicks
    })

    // Get unsubscribe count
    let totalUnsubscribed = 0
    const { data: unsubEvents } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("creator_id", creator.id)
      .eq("event_type", "unsubscribed")

    if (unsubEvents) {
      if (startDate) {
        // Filter by date
        totalUnsubscribed = unsubEvents.length
      } else {
        totalUnsubscribed = unsubEvents.length
      }
    }

    // Get monthly email count
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const { data: monthlyCampaigns } = await adminSupabase
      .from("email_campaigns")
      .select("audience_count")
      .eq("creator_id", creator.id)
      .in("status", ["sent", "sending"])
      .gte("sent_at", startOfMonth.toISOString())

    const monthlyEmailsSent = (monthlyCampaigns || []).reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[stats] Results - totalSent:", totalSent, "opens:", totalOpens, "clicks:", totalClicks, "monthly:", monthlyEmailsSent)

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
