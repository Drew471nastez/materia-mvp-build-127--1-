import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

// GET - Debug endpoint to check email system state
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

    // Get ALL campaigns for this creator using admin client (bypass RLS)
    const { data: allCampaignsAdmin, error: adminCampaignsError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, status, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })

    // Get campaigns using regular client (subject to RLS)
    const { data: allCampaignsRLS, error: rlsCampaignsError } = await supabase
      .from("email_campaigns")
      .select("id, subject, status, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .order("created_at", { ascending: false })

    // Get only "sent" campaigns using admin client
    const { data: sentCampaignsAdmin, error: sentAdminError } = await adminSupabase
      .from("email_campaigns")
      .select("id, subject, status, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })

    // Get only "sent" campaigns using regular client
    const { data: sentCampaignsRLS, error: sentRLSError } = await supabase
      .from("email_campaigns")
      .select("id, subject, status, audience_count, sent_at, created_at")
      .eq("creator_id", creator.id)
      .eq("status", "sent")
      .order("created_at", { ascending: false })

    // Get all email events
    const { data: events, error: eventsError } = await adminSupabase
      .from("email_events")
      .select("id, campaign_id, event_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50)

    // Get events for this creator's campaigns
    const campaignIds = (allCampaignsAdmin || []).map(c => c.id)
    const { data: creatorEvents } = await adminSupabase
      .from("email_events")
      .select("id, campaign_id, event_type, created_at")
      .in("campaign_id", campaignIds.length > 0 ? campaignIds : ['none'])
      .order("created_at", { ascending: false })

    // Calculate stats
    const totalSentAdmin = (sentCampaignsAdmin || []).reduce((sum, c) => sum + (c.audience_count || 0), 0)
    const totalSentRLS = (sentCampaignsRLS || []).reduce((sum, c) => sum + (c.audience_count || 0), 0)

    const eventCounts = {
      opened: (creatorEvents || []).filter(e => e.event_type === "opened").length,
      clicked: (creatorEvents || []).filter(e => e.event_type === "clicked").length,
      sent: (creatorEvents || []).filter(e => e.event_type === "sent").length,
      unsubscribed: (creatorEvents || []).filter(e => e.event_type === "unsubscribed").length,
    }

    return NextResponse.json({
      creator_id: creator.id,

      // Campaign counts
      campaigns: {
        all_admin: allCampaignsAdmin?.length || 0,
        all_rls: allCampaignsRLS?.length || 0,
        sent_admin: sentCampaignsAdmin?.length || 0,
        sent_rls: sentCampaignsRLS?.length || 0,
      },

      // Errors
      errors: {
        adminCampaignsError: adminCampaignsError?.message || null,
        rlsCampaignsError: rlsCampaignsError?.message || null,
        sentAdminError: sentAdminError?.message || null,
        sentRLSError: sentRLSError?.message || null,
        eventsError: eventsError?.message || null,
      },

      // Stats
      stats: {
        totalSent_admin: totalSentAdmin,
        totalSent_rls: totalSentRLS,
        events: eventCounts,
      },

      // Raw data
      allCampaigns_admin: allCampaignsAdmin,
      allCampaigns_rls: allCampaignsRLS,
      sentCampaigns_admin: sentCampaignsAdmin,
      sentCampaigns_rls: sentCampaignsRLS,
      recent_events: creatorEvents?.slice(0, 20),
    })
  } catch (error) {
    console.error("[email/debug] Error:", error)
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 })
  }
}
