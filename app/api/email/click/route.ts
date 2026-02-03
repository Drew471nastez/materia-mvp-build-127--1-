import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Handle click tracking redirects
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const encodedUrl = searchParams.get("url")
  const token = searchParams.get("t") // tracking_token
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
    targetUrl = encodedUrl
  }

  // Validate URL
  try {
    new URL(targetUrl)
  } catch {
    return NextResponse.redirect(new URL("/", request.url))
  }

  // Track the click asynchronously
  if (token || (campaignId && email)) {
    trackClick(
      token,
      campaignId,
      email ? decodeURIComponent(email) : null,
      targetUrl,
      request
    ).catch(err => {
      console.error("[track/click] Error:", err)
    })
  }

  // Redirect to the target URL
  return NextResponse.redirect(targetUrl)
}

async function trackClick(
  token: string | null,
  campaignId: string | null,
  email: string | null,
  url: string,
  request: NextRequest
) {
  try {
    const adminSupabase = createAdminClient()
    const now = new Date().toISOString()
    const userAgent = request.headers.get("user-agent") || null
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null

    let recipient = null

    // Find recipient by token (preferred) or by campaign+email
    if (token) {
      const { data } = await adminSupabase
        .from("campaign_recipients")
        .select("id, campaign_id, creator_id, email, clicked_at, click_count")
        .eq("tracking_token", token)
        .single()
      recipient = data
    } else if (campaignId && email) {
      const { data } = await adminSupabase
        .from("campaign_recipients")
        .select("id, campaign_id, creator_id, email, clicked_at, click_count")
        .eq("campaign_id", campaignId)
        .eq("email", email)
        .single()
      recipient = data
    }

    if (!recipient) {
      console.log("[track/click] Recipient not found")
      return
    }

    // Always increment click count
    const newClickCount = (recipient.click_count || 0) + 1

    // Update recipient record
    if (!recipient.clicked_at) {
      // First click
      await adminSupabase
        .from("campaign_recipients")
        .update({ clicked_at: now, click_count: newClickCount })
        .eq("id", recipient.id)
    } else {
      // Additional click
      await adminSupabase
        .from("campaign_recipients")
        .update({ click_count: newClickCount })
        .eq("id", recipient.id)
    }

    // Always log click events (unlike opens, we track all clicks)
    await adminSupabase.from("email_events").insert({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      creator_id: recipient.creator_id,
      email: recipient.email,
      event_type: "clicked",
      url: url,
      user_agent: userAgent,
      ip_address: ipAddress,
      metadata: { clicked_at: now, url: url },
    })

    console.log("[track/click] Recorded click for:", recipient.email, "url:", url.substring(0, 50))

  } catch (error) {
    console.error("[track/click] Error:", error)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  })
}
