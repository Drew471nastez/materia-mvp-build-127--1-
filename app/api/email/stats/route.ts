import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// GET - Fetch email stats for the current user
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
    const timeRange = searchParams.get("timeRange") || "30d"
    const campaignId = searchParams.get("campaignId")

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
        timeRangeDate = new Date(0) // Beginning of time
        break
      default:
        timeRangeDate.setDate(now.getDate() - 30)
    }

    // If fetching stats for a specific campaign
    if (campaignId) {
      const { data: events } = await adminSupabase
        .from("email_events")
        .select("event_type")
        .eq("campaign_id", campaignId)

      const counts = {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      }

      if (events) {
        for (const event of events) {
          const type = event.event_type as keyof typeof counts
          if (type in counts) {
            counts[type]++
          }
        }
      }

      return NextResponse.json({ stats: counts })
    }

    // Fetch all events for this creator using admin client (bypasses RLS)
    const { data: events, error: eventsError } = await adminSupabase
      .from("email_events")
      .select("event_type, campaign_id, created_at")
      .eq("creator_id", creator.id)
      .gte("created_at", timeRangeDate.toISOString())

    if (eventsError) {
      console.error("[email/stats] Events query error:", eventsError)
    }

    // Count events by type
    const opened = events?.filter((e) => e.event_type === "opened").length || 0
    const clicked = events?.filter((e) => e.event_type === "clicked").length || 0
    const unsubscribed = events?.filter((e) => e.event_type === "unsubscribed").length || 0

    // Get campaigns for this creator to calculate total sent
    const { data: campaigns } = await supabase
      .from("email_campaigns")
      .select("id, audience_count, status, sent_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .gte("sent_at", timeRangeDate.toISOString())

    const totalSent = campaigns?.reduce((sum, c) => sum + (c.audience_count || 0), 0) || 0

    // Get subscriber count
    const { count: subscriberCount } = await supabase
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .eq("creator_id", creator.id)
      .eq("status", "subscribed")

    return NextResponse.json({
      stats: {
        totalSent,
        opened,
        clicked,
        unsubscribed,
        subscriberCount: subscriberCount || 0,
      },
      events: events || [],
    })
  } catch (error) {
    console.error("[email/stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
