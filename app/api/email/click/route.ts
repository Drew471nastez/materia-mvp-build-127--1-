import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET - Handle click tracking redirect
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get("url")
  const sendId = searchParams.get("sid")
  const campaignId = searchParams.get("cid")
  const email = searchParams.get("e") // Optional email for tracking

  console.log("[click] Click tracking request:", { url: url?.substring(0, 50), sendId, campaignId, email })

  // Default redirect if URL is missing
  if (!url) {
    console.log("[click] No URL provided, redirecting to home")
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Record the click - only requires campaignId now (sendId is optional)
  if (campaignId) {
    trackClick(campaignId, url, sendId, email, request).catch(console.error)
  }

  // Redirect to the actual URL
  try {
    // Decode the URL (it was base64 encoded)
    const decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    console.log("[click] Redirecting to:", decodedUrl)
    return NextResponse.redirect(decodedUrl)
  } catch {
    // If decoding fails, try using the URL directly
    console.log("[click] Failed to decode, redirecting to raw URL")
    return NextResponse.redirect(url)
  }
}

async function trackClick(campaignId: string, url: string, sendId: string | null, email: string | null, request: NextRequest) {
  try {
    const adminSupabase = createAdminClient()
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const userAgent = request.headers.get("user-agent") || null

    // Get campaign to find creator_id
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaignId)
      .single()

    // Get the send record to find subscriber info (if sendId provided)
    let recipientEmail = email || "unknown"
    if (sendId) {
      const { data: send } = await adminSupabase
        .from("email_sends")
        .select("subscriber_id, email")
        .eq("id", sendId)
        .single()
      if (send?.email) {
        recipientEmail = send.email
      }
    }

    // Decode URL for storage
    let decodedUrl = url
    try {
      decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    } catch {}

    // Record the click event with correct schema
    const { error: insertError } = await adminSupabase.from("email_events").insert({
      campaign_id: campaignId,
      creator_id: campaign?.creator_id || null,
      recipient_email: recipientEmail,
      event_type: "clicked",
      metadata: {
        url: decodedUrl,
        send_id: sendId,
        clicked_at: new Date().toISOString(),
        user_agent: userAgent,
        ip_address: ipAddress,
      },
    })

    if (insertError) {
      console.error("[click-track] Insert error (trying without creator_id):", insertError.message)
      // Try again without creator_id in case column doesn't exist
      const { error: retryError } = await adminSupabase.from("email_events").insert({
        campaign_id: campaignId,
        recipient_email: recipientEmail,
        event_type: "clicked",
        metadata: {
          url: decodedUrl,
          send_id: sendId,
          clicked_at: new Date().toISOString(),
          user_agent: userAgent,
          ip_address: ipAddress,
        },
      })
      if (retryError) {
        console.error("[click-track] Retry insert error:", retryError.message)
      } else {
        console.log("[click-track] Tracked click (without creator_id) for campaign:", campaignId, "email:", recipientEmail)
      }
    } else {
      console.log("[click-track] Tracked click for campaign:", campaignId, "email:", recipientEmail)
    }

    // Update the send record (only if sendId provided and not already clicked)
    if (sendId) {
      await adminSupabase
        .from("email_sends")
        .update({ clicked_at: new Date().toISOString() })
        .eq("id", sendId)
        .is("clicked_at", null)
    }
  } catch (error) {
    console.error("Track click error:", error)
  }
}
