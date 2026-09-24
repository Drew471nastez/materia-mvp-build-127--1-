import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { maskEmail } from "@/lib/privacy/mask-email"

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
  const token = searchParams.get("t") // tracking_token from campaign_recipients
  const campaignId = searchParams.get("cid")
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

  // Track the open asynchronously
  if (token || (campaignId && email)) {
    trackOpen(token, campaignId, email ? decodeURIComponent(email) : null, request).catch(err => {
      console.error("[track/open] Error:", err)
    })
  }

  return response
}

async function trackOpen(
  token: string | null,
  campaignId: string | null,
  email: string | null,
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
        .select("id, campaign_id, creator_id, email, opened_at")
        .eq("tracking_token", token)
        .single()
      recipient = data
    } else if (campaignId && email) {
      const { data } = await adminSupabase
        .from("campaign_recipients")
        .select("id, campaign_id, creator_id, email, opened_at")
        .eq("campaign_id", campaignId)
        .eq("email", email)
        .single()
      recipient = data
    }

    if (!recipient) {
      console.log("[track/open] Recipient not found")
      return
    }

    // Check if already opened (dedupe)
    if (recipient.opened_at) {
      // Increment open count but don't create another event
      await adminSupabase
        .from("campaign_recipients")
        .update({ open_count: (recipient as { open_count?: number }).open_count || 1 + 1 })
        .eq("id", recipient.id)
      console.log("[track/open] Already opened, incrementing count for:", maskEmail(recipient.email))
      return
    }

    // Update recipient record
    await adminSupabase
      .from("campaign_recipients")
      .update({ opened_at: now, open_count: 1 })
      .eq("id", recipient.id)

    // Insert open event
    await adminSupabase.from("email_events").insert({
      campaign_id: recipient.campaign_id,
      recipient_id: recipient.id,
      creator_id: recipient.creator_id,
      email: recipient.email,
      event_type: "opened",
      user_agent: userAgent,
      ip_address: ipAddress,
      metadata: { opened_at: now },
    })

    console.log("[track/open] Recorded open for:", maskEmail(recipient.email), "campaign:", recipient.campaign_id)

  } catch (error) {
    console.error("[track/open] Error:", error)
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
