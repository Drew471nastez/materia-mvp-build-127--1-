import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// GET - Handle unsubscribe link clicks (renders a confirmation page)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")

  if (!token) {
    return new NextResponse(
      generateHtmlPage("Invalid Link", "This unsubscribe link is invalid or has expired.", "error"),
      { status: 400, headers: { "Content-Type": "text/html" } },
    )
  }

  const adminSupabase = createAdminClient()

  // Find subscriber by unsubscribe token
  const { data: subscriber, error } = await adminSupabase
    .from("subscribers")
    .select("id, email, status, creator_id")
    .eq("unsubscribe_token", token)
    .single()

  if (error || !subscriber) {
    return new NextResponse(
      generateHtmlPage("Invalid Link", "This unsubscribe link is invalid or has expired.", "error"),
      { status: 404, headers: { "Content-Type": "text/html" } },
    )
  }

  if (subscriber.status === "unsubscribed") {
    return new NextResponse(
      generateHtmlPage("Already Unsubscribed", "You have already been unsubscribed from this mailing list.", "info"),
      { status: 200, headers: { "Content-Type": "text/html" } },
    )
  }

  // Update subscriber status
  const { error: updateError } = await adminSupabase
    .from("subscribers")
    .update({
      status: "unsubscribed",
      is_active: false,
      unsubscribed_at: new Date().toISOString(),
    })
    .eq("id", subscriber.id)

  if (updateError) {
    console.error("Error unsubscribing:", updateError)
    return new NextResponse(
      generateHtmlPage("Error", "There was an error processing your request. Please try again later.", "error"),
      { status: 500, headers: { "Content-Type": "text/html" } },
    )
  }

  // Log the unsubscribe event (if we have a recent campaign)
  const { data: recentCampaign } = await adminSupabase
    .from("email_campaigns")
    .select("id")
    .eq("creator_id", subscriber.creator_id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .single()

  if (recentCampaign) {
    const { error: insertError } = await adminSupabase.from("email_events").insert({
      campaign_id: recentCampaign.id,
      creator_id: subscriber.creator_id,
      recipient_email: subscriber.email,
      event_type: "unsubscribed",
      metadata: { method: "link_click", unsubscribed_at: new Date().toISOString() },
    })

    if (insertError) {
      console.error("[unsubscribe] Insert error (trying without creator_id):", insertError.message)
      // Try again without creator_id in case column doesn't exist
      const { error: retryError } = await adminSupabase.from("email_events").insert({
        campaign_id: recentCampaign.id,
        recipient_email: subscriber.email,
        event_type: "unsubscribed",
        metadata: { method: "link_click", unsubscribed_at: new Date().toISOString() },
      })
      if (retryError) {
        console.error("[unsubscribe] Retry insert error:", retryError.message)
      } else {
        console.log("[unsubscribe] Tracked unsubscribe (without creator_id) for:", subscriber.email)
      }
    } else {
      console.log("[unsubscribe] Tracked unsubscribe event for:", subscriber.email)
    }
  }

  return new NextResponse(
    generateHtmlPage(
      "Unsubscribed Successfully",
      `You (${maskEmail(subscriber.email)}) have been unsubscribed and will no longer receive emails from this sender.`,
      "success",
    ),
    { status: 200, headers: { "Content-Type": "text/html" } },
  )
}

// POST - Handle unsubscribe via API (for resubscribing or programmatic access)
export async function POST(request: NextRequest) {
  try {
    const { token, action } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find subscriber by unsubscribe token
    const { data: subscriber, error } = await adminSupabase
      .from("subscribers")
      .select("id, email, status")
      .eq("unsubscribe_token", token)
      .single()

    if (error || !subscriber) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 })
    }

    if (action === "resubscribe") {
      // Allow resubscribing
      const { error: updateError } = await adminSupabase
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          unsubscribed_at: null,
        })
        .eq("id", subscriber.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Resubscribed successfully" })
    }

    // Default action: unsubscribe
    const { error: updateError } = await adminSupabase
      .from("subscribers")
      .update({
        status: "unsubscribed",
        is_active: false,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", subscriber.id)

    if (updateError) {
      return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "Unsubscribed successfully" })
  } catch (error) {
    console.error("Unsubscribe error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Helper to mask email for privacy
function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const maskedLocal = local.length > 2 ? local[0] + "***" + local[local.length - 1] : "***"
  return `${maskedLocal}@${domain}`
}

// Helper to generate HTML page
function generateHtmlPage(title: string, message: string, type: "success" | "error" | "info"): string {
  const colors = {
    success: { bg: "#f0fdf4", icon: "#22c55e" },
    error: { bg: "#fef2f2", icon: "#ef4444" },
    info: { bg: "#eff6ff", icon: "#3b82f6" },
  }

  const icons = {
    success: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />`,
    error: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />`,
    info: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`,
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f9fafb;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      background: ${colors[type].bg};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      stroke: ${colors[type].icon};
      fill: none;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #6b7280;
      line-height: 1.6;
    }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
    }
    .footer p {
      font-size: 13px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
        ${icons[type]}
      </svg>
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="footer">
      <p>Powered by Storelib</p>
    </div>
  </div>
</body>
</html>
`
}
