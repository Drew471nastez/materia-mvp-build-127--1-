import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Handle click tracking redirects
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const encodedUrl = searchParams.get("url")
  const sendId = searchParams.get("sid")
  const campaignId = searchParams.get("cid")
  const email = searchParams.get("e")

  // If no URL, redirect to homepage
  if (!encodedUrl) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Decode the URL
  let targetUrl: string
  try {
    targetUrl = Buffer.from(encodedUrl, "base64").toString("utf-8")
  } catch {
    // If decoding fails, try using the URL directly
    targetUrl = encodedUrl
  }

  // Validate URL
  try {
    new URL(targetUrl)
  } catch {
    // Invalid URL - redirect to homepage
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Track the click asynchronously (don't delay the redirect)
  if (campaignId && email) {
    trackClick(
      campaignId,
      decodeURIComponent(email),
      targetUrl,
      sendId,
      request
    ).catch(err => {
      console.error("[track/click] Error:", err)
    })
  }

  // Redirect to the target URL
  return NextResponse.redirect(targetUrl)
}

// Track click event
async function trackClick(
  campaignId: string,
  email: string,
  url: string,
  sendId: string | null,
  request: NextRequest
) {
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
      console.log("[track/click] Campaign not found:", campaignId)
      return
    }

    // Check if we already recorded a click for this email+campaign (count unique clicks)
    const { data: existingClick } = await adminSupabase
      .from("email_events")
      .select("id")
      .eq("campaign_id", campaignId)
      .eq("email", email)
      .eq("event_type", "clicked")
      .limit(1)
      .maybeSingle()

    if (existingClick) {
      // Already tracked a click for this email - we still log for URL analytics but it won't affect unique count
      console.log("[track/click] Already have click for:", email, "campaign:", campaignId)
      return
    }

    // Extract tracking metadata
    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                      request.headers.get("x-real-ip") || null

    // Insert the click event
    const { error } = await adminSupabase.from("email_events").insert({
      campaign_id: campaignId,
      creator_id: campaign.creator_id,
      email: email,
      event_type: "clicked",
      url: url,
      user_agent: userAgent,
      ip_address: ipAddress,
      metadata: {
        clicked_at: now,
        send_id: sendId,
        url: url,
      },
    })

    if (error) {
      console.error("[track/click] Insert error:", error)
      return
    }

    console.log("[track/click] Recorded click for:", email, "campaign:", campaignId, "url:", url.substring(0, 50))

    // Also update email_sends table for backwards compatibility
    if (sendId) {
      await adminSupabase
        .from("email_sends")
        .update({ clicked_at: now })
        .eq("id", sendId)
        .is("clicked_at", null)
    } else {
      await adminSupabase
        .from("email_sends")
        .update({ clicked_at: now })
        .eq("campaign_id", campaignId)
        .eq("email", email)
        .is("clicked_at", null)
    }

  } catch (error) {
    console.error("[track/click] Unexpected error:", error)
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
