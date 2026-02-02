import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Transparent 1x1 GIF for tracking pixel
const TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

// GET - Handle tracking pixel (email opens)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const campaignId = searchParams.get("cid") || searchParams.get("c")
  const email = searchParams.get("e")

  // Always return the tracking pixel first for fast response
  const response = new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })

  // Track the open event asynchronously
  if (campaignId && email) {
    trackOpen(campaignId, email, request).catch(console.error)
  }

  return response
}

// POST - Handle click tracking
export async function POST(request: NextRequest) {
  try {
    const { campaign_id, url, email } = await request.json()

    if (!campaign_id || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Get creator_id from campaign
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaign_id)
      .single()

    // Check if click already recorded for this email/campaign/url
    const { data: existing } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaign_id)
      .eq("recipient_email", email || "unknown")
      .eq("event_type", "clicked")
      .maybeSingle()

    if (!existing) {
      // Record the click event
      await adminSupabase.from("email_events").insert({
        campaign_id,
        creator_id: campaign?.creator_id || null,
        recipient_email: email || "unknown",
        event_type: "clicked",
        metadata: {
          url,
          clicked_at: new Date().toISOString(),
          user_agent: request.headers.get("user-agent") || null,
        },
      })
      console.log("[email-track] Tracked click for campaign:", campaign_id, "email:", email)
    }

    return NextResponse.json({ success: true, redirect: url })
  } catch (error) {
    console.error("Track click error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper to track email opens
async function trackOpen(campaignId: string, email: string, request: NextRequest) {
  try {
    const adminSupabase = createAdminClient()
    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

    // Get creator_id from campaign
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaignId)
      .single()

    // Check if this email has already been tracked as opened for this campaign
    const { data: existingOpen } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("recipient_email", email)
      .eq("event_type", "opened")
      .maybeSingle()

    // Only record if not already tracked
    if (!existingOpen) {
      await adminSupabase.from("email_events").insert({
        campaign_id: campaignId,
        creator_id: campaign?.creator_id || null,
        recipient_email: email,
        event_type: "opened",
        metadata: {
          opened_at: new Date().toISOString(),
          user_agent: userAgent,
          ip_address: ipAddress,
        },
      })
      console.log("[email-track] Tracked open for campaign:", campaignId, "email:", email)
    }
  } catch (error) {
    console.error("Track open error:", error)
  }
}

// Handle CORS preflight
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
