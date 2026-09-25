import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { audienceRefusal, cleanDraft, DRAFT_COLUMNS } from "@/lib/email-campaigns/drafts"
import { isResponse, readJson, requireCreator, UUID } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

// GET - Fetch campaigns and stats for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    // Get the current user
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

    // Get query params
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get("status") || "sent"
    const timeRange = searchParams.get("timeRange") || "30d"

    console.log("[campaigns] Fetching for creator:", creator.id, "status:", status, "timeRange:", timeRange)

    // Calculate time range
    const now = new Date()
    let timeRangeDate = new Date()

    switch (timeRange) {
      case "7d": timeRangeDate.setDate(now.getDate() - 7); break
      case "30d": timeRangeDate.setDate(now.getDate() - 30); break
      case "90d": timeRangeDate.setDate(now.getDate() - 90); break
      case "all": timeRangeDate = new Date(0); break
      default: timeRangeDate.setDate(now.getDate() - 30)
    }
    /* A range from the shared date picker: ?start=&end=, both instants. */
    let timeRangeEnd: Date | null = null
    const startParam = Date.parse(searchParams.get("start") ?? "")
    const endParam = Date.parse(searchParams.get("end") ?? "")
    if (Number.isFinite(startParam) && Number.isFinite(endParam) && endParam > startParam) {
      timeRangeDate = new Date(startParam)
      timeRangeEnd = new Date(endParam)
    }

    // FETCH ALL CAMPAIGNS with specified status (using admin to bypass RLS)
    const { data: allCampaigns, error: campaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("*")
      .eq("creator_id", creator.id)
      .eq("status", status)
      .order("sent_at", { ascending: false, nullsFirst: false })

    if (campaignsError) {
      console.error("[campaigns] Error:", campaignsError)
      return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
    }

    console.log("[campaigns] Found", allCampaigns?.length || 0, "campaigns with status:", status)

    // Filter campaigns by time range for stats ONLY
    const campaignsInTimeRange = (allCampaigns || []).filter(c => {
      const date = c.sent_at ? new Date(c.sent_at) : new Date(c.created_at)
      return date >= timeRangeDate && (!timeRangeEnd || date < timeRangeEnd)
    })

    // Calculate TOTAL SENT from campaigns in time range
    const totalSent = campaignsInTimeRange.reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[campaigns] Total sent in timeRange:", totalSent, "from", campaignsInTimeRange.length, "campaigns")

    // Get ALL campaigns for this creator (any status with sent_at) for monthly calculation
    const { data: allSentCampaigns } = await adminSupabase
      .from("email_campaigns")
      .select("id, audience_count, sent_at, status")
      .eq("creator_id", creator.id)
      .not("sent_at", "is", null)

    // Calculate monthly usage (this month)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthlyEmails = (allSentCampaigns || [])
      .filter(c => new Date(c.sent_at) >= startOfMonth)
      .reduce((sum, c) => sum + (c.audience_count || 0), 0)

    console.log("[campaigns] Monthly emails:", monthlyEmails)

    // Get events for stats (opens, clicks, unsubscribes)
    let opened = 0, clicked = 0, unsubscribed = 0

    const campaignIds = campaignsInTimeRange.map(c => c.id)

    if (campaignIds.length > 0) {
      const { data: events } = await adminSupabase
        .from("email_events")
        .select("event_type")
        .in("campaign_id", campaignIds)

      if (events) {
        opened = events.filter(e => e.event_type === "opened").length
        clicked = events.filter(e => e.event_type === "clicked").length
        unsubscribed = events.filter(e => e.event_type === "unsubscribed").length
      }
    }

    // Also check events by creator_id for any orphaned events
    const { data: creatorEvents } = await adminSupabase
      .from("email_events")
      .select("event_type, campaign_id")
      .eq("creator_id", creator.id)
      .gte("created_at", timeRangeDate.toISOString())
      .lt("created_at", (timeRangeEnd ?? new Date(Date.now() + 60_000)).toISOString())

    if (creatorEvents) {
      const campaignIdSet = new Set(campaignIds)
      const orphanedOpens = creatorEvents.filter(e =>
        e.event_type === "opened" && !campaignIdSet.has(e.campaign_id)
      ).length
      const orphanedClicks = creatorEvents.filter(e =>
        e.event_type === "clicked" && !campaignIdSet.has(e.campaign_id)
      ).length
      const orphanedUnsubs = creatorEvents.filter(e =>
        e.event_type === "unsubscribed" && !campaignIdSet.has(e.campaign_id)
      ).length

      opened += orphanedOpens
      clicked += orphanedClicks
      unsubscribed += orphanedUnsubs
    }

    console.log("[campaigns] Events - opened:", opened, "clicked:", clicked, "unsubscribed:", unsubscribed)

    // Return response with no caching
    const response = NextResponse.json({
      // Return ALL campaigns (not filtered) so new ones always show
      campaigns: allCampaigns || [],
      stats: {
        totalSent,
        opened,
        clicked,
        unsubscribed,
        openRate: totalSent > 0 ? Math.round((opened / totalSent) * 100) : 0,
        clickRate: totalSent > 0 ? Math.round((clicked / totalSent) * 100) : 0,
      },
      monthlyUsage: {
        sent: monthlyEmails,
        limit: 3000,
      },
    })

    // Set no-cache headers
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")

    return response
  } catch (error) {
    console.error("[campaigns] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST: start a draft. The page picks the id, so a retried request (a slow
 * network, a double tap) finds the draft it already made instead of making
 * a second one.
 */
export async function POST(request: NextRequest) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  const id = typeof body.id === "string" && UUID.test(body.id) ? body.id : null
  const cleaned = await cleanDraft(ctx.admin, ctx.creatorId, body)
  if (!cleaned.ok) return NextResponse.json({ error: cleaned.error, field: cleaned.field }, { status: cleaned.status })

  const row = {
    ...(id ? { id } : {}),
    creator_id: ctx.creatorId,
    subject: cleaned.patch.subject ?? "",
    preview_text: cleaned.patch.preview_text ?? null,
    body: cleaned.patch.body ?? "",
    audience_type: cleaned.patch.audience_type ?? "all",
    segment_id: cleaned.patch.segment_id ?? null,
    status: "draft",
    ...(cleaned.patch.track_opens !== undefined ? { track_opens: cleaned.patch.track_opens } : {}),
  }
  const { data, error } = await ctx.admin.from("email_campaigns").insert(row).select(DRAFT_COLUMNS).maybeSingle()
  if (error?.code === "23505" && id) {
    const { data: existing } = await ctx.admin.from("email_campaigns").select(DRAFT_COLUMNS).eq("id", id).eq("creator_id", ctx.creatorId).maybeSingle()
    if (existing) return NextResponse.json({ campaign: existing })
    return NextResponse.json({ error: "Could not start this draft. Reload and try again." }, { status: 409 })
  }
  if (error || !data) {
    const refusal = await audienceRefusal(ctx.admin, error, row.audience_type)
    if (refusal) return NextResponse.json({ error: refusal, field: "audience" }, { status: 422 })
    console.error("[campaigns] draft insert failed:", error?.code)
    return NextResponse.json({ error: "Could not save this draft. Check your connection and try again." }, { status: 500 })
  }
  return NextResponse.json({ campaign: data }, { status: 201 })
}
