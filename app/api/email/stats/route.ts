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

    // Get campaigns for this creator first
    const { data: campaigns } = await supabase
      .from("email_campaigns")
      .select("id, audience_count, status, sent_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .gte("sent_at", timeRangeDate.toISOString())

    const campaignIds = campaigns?.map((c) => c.id) || []

    // Fetch all events for this creator's campaigns using admin client (bypasses RLS)
    // Query by both creator_id AND campaign_id to catch all events
    let allEvents: { event_type: string; campaign_id: string; created_at: string }[] = []

    // First try by creator_id
    const { data: eventsByCreator, error: eventsError1 } = await adminSupabase
      .from("email_events")
      .select("event_type, campaign_id, created_at")
      .eq("creator_id", creator.id)
      .gte("created_at", timeRangeDate.toISOString())

    if (eventsError1) {
      console.error("[email/stats] Events by creator query error:", eventsError1)
    }

    if (eventsByCreator) {
      allEvents = [...eventsByCreator]
    }

    // Also query by campaign_ids to catch events without creator_id
    if (campaignIds.length > 0) {
      const { data: eventsByCampaign, error: eventsError2 } = await adminSupabase
        .from("email_events")
        .select("event_type, campaign_id, created_at")
        .in("campaign_id", campaignIds)
        .gte("created_at", timeRangeDate.toISOString())

      if (eventsError2) {
        console.error("[email/stats] Events by campaign query error:", eventsError2)
      }

      // Merge events, avoiding duplicates based on event properties
      if (eventsByCampaign) {
        const existingKeys = new Set(
          allEvents.map((e) => `${e.campaign_id}-${e.event_type}-${e.created_at}`)
        )
        for (const event of eventsByCampaign) {
          const key = `${event.campaign_id}-${event.event_type}-${event.created_at}`
          if (!existingKeys.has(key)) {
            allEvents.push(event)
            existingKeys.add(key)
          }
        }
      }
    }

    // Count events by type
    const opened = allEvents.filter((e) => e.event_type === "opened").length
    const clicked = allEvents.filter((e) => e.event_type === "clicked").length
    const unsubscribed = allEvents.filter((e) => e.event_type === "unsubscribed").length

    console.log("[email/stats] Found events:", { opened, clicked, unsubscribed, total: allEvents.length })

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
      events: allEvents,
    })
  } catch (error) {
    console.error("[email/stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
