import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Transparent 1x1 GIF pixel
const TRACKING_PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
)

// GET - Handle tracking pixel requests (email opens)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const campaignId = searchParams.get("cid") || searchParams.get("c")
  const email = searchParams.get("e")

  // Always return the tracking pixel immediately
  const response = new NextResponse(TRACKING_PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRACKING_PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })

  // Track the open asynchronously (don't block the pixel response)
  if (campaignId && email) {
    trackOpen(campaignId, decodeURIComponent(email), request).catch(err => {
      console.error("[track/open] Error:", err)
    })
  }

  return response
}

// Track email open event
async function trackOpen(campaignId: string, email: string, request: NextRequest) {
  try {
    const adminSupabase = createAdminClient()
    const now = new Date().toISOString()

    // Get campaign to find creator_id
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaignId)
      .single()

    if (!campaign) {
      console.log("[track/open] Campaign not found:", campaignId)
      return
    }

    // Check if we already recorded an open for this email+campaign (prevent duplicates)
    const { data: existingEvent } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("email", email)
      .eq("event_type", "opened")
      .limit(1)
      .maybeSingle()

    if (existingEvent) {
      // Already tracked this open
      console.log("[track/open] Already recorded open for:", email, "campaign:", campaignId)
      return
    }

    // Extract tracking metadata
    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                      request.headers.get("x-real-ip") || null

    // Insert the open event
    const { error } = await adminSupabase.from("email_events").insert({
      campaign_id: campaignId,
      creator_id: campaign.creator_id,
      email: email,
      event_type: "opened",
      user_agent: userAgent,
      ip_address: ipAddress,
      metadata: {
        opened_at: now,
      },
    })

    if (error) {
      console.error("[track/open] Insert error:", error)
      return
    }

    console.log("[track/open] Recorded open for:", email, "campaign:", campaignId)

    // Also update email_sends table for backwards compatibility
    await adminSupabase
      .from("email_sends")
      .update({ opened_at: now })
      .eq("campaign_id", campaignId)
      .eq("email", email)
      .is("opened_at", null)

  } catch (error) {
    console.error("[track/open] Unexpected error:", error)
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
