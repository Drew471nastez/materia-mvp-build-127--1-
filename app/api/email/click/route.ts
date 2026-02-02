import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET - Handle click tracking redirect
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get("url")
  const sendId = searchParams.get("sid")
  const campaignId = searchParams.get("cid")

  // Default redirect if URL is missing
  if (!url) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Record the click asynchronously
  if (sendId && campaignId) {
    trackClick(sendId, campaignId, url, request).catch(console.error)
  }

  // Redirect to the actual URL
  try {
    // Decode the URL (it was base64 encoded)
    const decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    return NextResponse.redirect(decodedUrl)
  } catch {
    // If decoding fails, try using the URL directly
    return NextResponse.redirect(url)
  }
}

async function trackClick(sendId: string, campaignId: string, url: string, request: NextRequest) {
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

    // Get the send record to find subscriber info
    const { data: send } = await adminSupabase
      .from("email_sends")
      .select("subscriber_id, email")
      .eq("id", sendId)
      .single()

    // Decode URL for storage
    let decodedUrl = url
    try {
      decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    } catch {}

    // Record the click event with correct schema
    const { error: insertError } = await adminSupabase.from("email_events").insert({
      campaign_id: campaignId,
      creator_id: campaign?.creator_id || null,
      recipient_email: send?.email || "unknown",
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
        recipient_email: send?.email || "unknown",
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
        console.log("[click-track] Tracked click (without creator_id) for campaign:", campaignId, "email:", send?.email)
      }
    } else {
      console.log("[click-track] Tracked click for campaign:", campaignId, "email:", send?.email)
    }

    // Update the send record (only if not already clicked)
    await adminSupabase
      .from("email_sends")
      .update({ clicked_at: new Date().toISOString() })
      .eq("id", sendId)
      .is("clicked_at", null)
  } catch (error) {
    console.error("Track click error:", error)
  }
}
