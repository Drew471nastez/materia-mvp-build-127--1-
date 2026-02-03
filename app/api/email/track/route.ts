import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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
      "Pragma": "no-cache",
      "Expires": "0",
    },
  })

  // Track the open event asynchronously (don't block response)
  if (campaignId && email) {
    trackOpen(campaignId, decodeURIComponent(email), request).catch(err => {
      console.error("[track] Open tracking error:", err)
    })
  }

  return response
}

// Helper to track email opens
async function trackOpen(campaignId: string, email: string, request: NextRequest) {
  try {
    const adminSupabase = createAdminClient()
    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const now = new Date().toISOString()

    // Get campaign info
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaignId)
      .single()

    if (!campaign) {
      console.error("[track] Campaign not found:", campaignId)
      return
    }

    // Check if already opened (prevent duplicate events)
    const { data: existingEvent } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("event_type", "opened")
      .or(`email.eq.${email},recipient_email.eq.${email}`)
      .maybeSingle()

    // Insert event if not already tracked
    if (!existingEvent) {
      await adminSupabase.from("email_events").insert({
        campaign_id: campaignId,
        creator_id: campaign.creator_id,
        email: email,
        recipient_email: email,
        event_type: "opened",
        user_agent: userAgent,
        ip_address: ipAddress,
        metadata: { opened_at: now },
        created_at: now,
      })
      console.log("[track] Recorded open event for:", email, "campaign:", campaignId)
    }

    // Update email_recipients table if it exists
    try {
      const { error: updateError } = await adminSupabase
        .from("email_recipients")
        .update({
          opened_at: now,
          open_count: adminSupabase.rpc ? 1 : 1, // Increment would be ideal but just set to 1 for simplicity
        })
        .eq("campaign_id", campaignId)
        .eq("email", email)
        .is("opened_at", null) // Only update if not already opened

      if (updateError && !updateError.message.includes("does not exist")) {
        console.log("[track] Updated recipient opened_at")
      }
    } catch {
      // Table might not exist, ignore
    }

    // Also try email_sends table (old schema)
    try {
      await adminSupabase
        .from("email_sends")
        .update({ opened_at: now })
        .eq("campaign_id", campaignId)
        .eq("email", email)
        .is("opened_at", null)
    } catch {
      // Table might not exist, ignore
    }

  } catch (error) {
    console.error("[track] Error tracking open:", error)
  }
}

// Handle CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
