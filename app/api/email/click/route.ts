import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Handle click tracking redirect
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const url = searchParams.get("url")
  const sendId = searchParams.get("sid")
  const campaignId = searchParams.get("cid")
  const email = searchParams.get("e") // Email for tracking

  console.log("[click] Request:", { url: url?.substring(0, 30), sendId, campaignId, email: email?.substring(0, 20) })

  // Default redirect if URL is missing
  if (!url) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Record the click asynchronously (don't block redirect)
  if (campaignId) {
    const decodedEmail = email ? decodeURIComponent(email) : null
    trackClick(campaignId, url, sendId, decodedEmail, request).catch(err => {
      console.error("[click] Tracking error:", err)
    })
  }

  // Redirect to the actual URL
  try {
    const decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    return NextResponse.redirect(decodedUrl)
  } catch {
    return NextResponse.redirect(url)
  }
}

async function trackClick(
  campaignId: string,
  url: string,
  sendId: string | null,
  email: string | null,
  request: NextRequest
) {
  try {
    const adminSupabase = createAdminClient()
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null
    const userAgent = request.headers.get("user-agent") || null
    const now = new Date().toISOString()

    // Get campaign info
    const { data: campaign } = await adminSupabase
      .from("email_campaigns")
      .select("creator_id")
      .eq("id", campaignId)
      .single()

    // Get recipient email from various sources
    let recipientEmail = email || "unknown"

    if (sendId && recipientEmail === "unknown") {
      // Try email_sends table
      const { data: send } = await adminSupabase
        .from("email_sends")
        .select("email")
        .eq("id", sendId)
        .single()
      if (send?.email) recipientEmail = send.email
    }

    // Decode URL for storage
    let decodedUrl = url
    try {
      decodedUrl = Buffer.from(url, "base64").toString("utf-8")
    } catch {}

    // Check if this click already recorded (prevent duplicates per URL)
    const { data: existingClick } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("event_type", "clicked")
      .or(`email.eq.${recipientEmail},recipient_email.eq.${recipientEmail}`)
      .maybeSingle()

    // Record click event
    if (!existingClick) {
      await adminSupabase.from("email_events").insert({
        campaign_id: campaignId,
        creator_id: campaign?.creator_id || null,
        email: recipientEmail,
        recipient_email: recipientEmail,
        event_type: "clicked",
        url: decodedUrl,
        user_agent: userAgent,
        ip_address: ipAddress,
        metadata: {
          url: decodedUrl,
          send_id: sendId,
          clicked_at: now,
        },
        created_at: now,
      })
      console.log("[click] Recorded click for:", recipientEmail, "campaign:", campaignId)
    }

    // Update email_recipients table
    try {
      await adminSupabase
        .from("email_recipients")
        .update({
          clicked_at: now,
          click_count: 1,
        })
        .eq("campaign_id", campaignId)
        .eq("email", recipientEmail)
        .is("clicked_at", null)
    } catch {
      // Table might not exist
    }

    // Update email_sends table (old schema)
    if (sendId) {
      try {
        await adminSupabase
          .from("email_sends")
          .update({ clicked_at: now })
          .eq("id", sendId)
          .is("clicked_at", null)
      } catch {
        // Table might not exist
      }
    }

  } catch (error) {
    console.error("[click] Error:", error)
  }
}
