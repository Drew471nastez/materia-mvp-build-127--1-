import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Transparent 1x1 GIF for tracking pixel
const TRACKING_PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

// GET - Handle tracking pixel (email opens)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const sendId = searchParams.get("sid")
  const campaignId = searchParams.get("cid")

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

  // Track the open event asynchronously (don't await)
  if (sendId && campaignId) {
    trackOpen(sendId, campaignId, request).catch(console.error)
  }

  return response
}

// POST - Handle click tracking
export async function POST(request: NextRequest) {
  try {
    const { send_id, campaign_id, url, subscriber_id, email } = await request.json()

    if (!campaign_id || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Record the click event
    await adminSupabase.from("email_events").insert({
      campaign_id,
      send_id: send_id || null,
      subscriber_id: subscriber_id || null,
      email: email || "unknown",
      event_type: "clicked",
      event_data: { url },
      user_agent: request.headers.get("user-agent") || null,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
    })

    // Update the send record if we have a send_id
    if (send_id) {
      await adminSupabase
        .from("email_sends")
        .update({ clicked_at: new Date().toISOString(), status: "clicked" })
        .eq("id", send_id)
        .is("clicked_at", null)
    }

    return NextResponse.json({ success: true, redirect: url })
  } catch (error) {
    console.error("Track click error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper to track email opens
async function trackOpen(sendId: string, campaignId: string, request: NextRequest) {
  try {
    const adminSupabase = createAdminClient()

    // Get the send record to find subscriber info
    const { data: send } = await adminSupabase
      .from("email_sends")
      .select("subscriber_id, email")
      .eq("id", sendId)
      .single()

    // Record the open event
    await adminSupabase.from("email_events").insert({
      campaign_id: campaignId,
      send_id: sendId,
      subscriber_id: send?.subscriber_id || null,
      email: send?.email || "unknown",
      event_type: "opened",
      user_agent: request.headers.get("user-agent") || null,
      ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] || null,
    })

    // Update the send record (only if not already opened)
    await adminSupabase
      .from("email_sends")
      .update({ opened_at: new Date().toISOString(), status: "opened" })
      .eq("id", sendId)
      .is("opened_at", null)
  } catch (error) {
    console.error("Track open error:", error)
  }
}

// Handle click redirect (for tracked links)
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
