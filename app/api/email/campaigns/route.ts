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
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    // Filter by time range for stats
    const filteredCampaigns = (campaigns || []).filter((c) => {
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= timeRangeDate
    })

    // Calculate total sent
    const totalSent = filteredCampaigns.reduce((sum, c) => sum + (c.audience_count || 0), 0)

    // Get campaign IDs for events query
    const campaignIds = (campaigns || []).map(c => c.id)

    // Get events for these campaigns
    let opened = 0
    let clicked = 0
    let unsubscribed = 0

    if (campaignIds.length > 0) {
      const { data: events } = await adminSupabase
        .from("email_events")
        .select("event_type, campaign_id, created_at")
        .in("campaign_id", campaignIds)
        .gte("created_at", timeRangeDate.toISOString())

      if (events) {
        opened = events.filter(e => e.event_type === "opened").length
        clicked = events.filter(e => e.event_type === "clicked").length
        unsubscribed = events.filter(e => e.event_type === "unsubscribed").length
      }
    }

    // Calculate monthly usage
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const campaignsThisMonth = (campaigns || []).filter((c) => {
      const sentDate = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return sentDate >= startOfMonth
    })
    const monthlyEmailsSent = campaignsThisMonth.reduce((sum, c) => sum + (c.audience_count || 0), 0)

    return NextResponse.json({
      campaigns: campaigns || [],
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
    })
  } catch (error) {
    console.error("[email/campaigns] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
