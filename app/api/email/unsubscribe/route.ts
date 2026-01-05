import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - Handle unsubscribe link clicks (renders a confirmation page)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")

  if (!token) {
    return new NextResponse(
      generateHtmlPage("Invalid Link", "This unsubscribe link is invalid or has expired."),
      { status: 400, headers: { "Content-Type": "text/html" } }
    )
  }

  const supabase = await createClient()

  // Find subscriber by unsubscribe token
  const { data: subscriber, error } = await supabase
    .from("subscribers")
    .select("id, email, status, creator_id")
    .eq("unsubscribe_token", token)
    .single()

  if (error || !subscriber) {
    return new NextResponse(
      generateHtmlPage("Invalid Link", "This unsubscribe link is invalid or has expired."),
      { status: 404, headers: { "Content-Type": "text/html" } }
    )
  }

  if (subscriber.status === "unsubscribed") {
    return new NextResponse(
      generateHtmlPage("Already Unsubscribed", "You have already been unsubscribed from this mailing list."),
      { status: 200, headers: { "Content-Type": "text/html" } }
    )
  }

  // Update subscriber status
  const { error: updateError } = await supabase
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
      generateHtmlPage("Error", "There was an error processing your request. Please try again later."),
      { status: 500, headers: { "Content-Type": "text/html" } }
    )
  }

  // Log the unsubscribe event (if we have a recent campaign)
  const { data: recentCampaign } = await supabase
    .from("email_campaigns")
    .select("id")
    .eq("creator_id", subscriber.creator_id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .single()

  if (recentCampaign) {
    await supabase.from("email_events").insert({
      campaign_id: recentCampaign.id,
      subscriber_id: subscriber.id,
      email: subscriber.email,
      event_type: "unsubscribed",
      event_data: { method: "link_click" },
    })
  }

  return new NextResponse(
    generateHtmlPage(
      "Unsubscribed Successfully",
      `You (${maskEmail(subscriber.email)}) have been unsubscribed and will no longer receive emails from this sender.`
    ),
    { status: 200, headers: { "Content-Type": "text/html" } }
  )
}

// POST - Handle unsubscribe via API (for resubscribing or programmatic access)
export async function POST(request: NextRequest) {
  try {
    const { token, action } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const supabase = await createClient()

    // Find subscriber by unsubscribe token
    const { data: subscriber, error } = await supabase
      .from("subscribers")
      .select("id, email, status")
      .eq("unsubscribe_token", token)
      .single()

    if (error || !subscriber) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 })
    }

    if (action === "resubscribe") {
      // Allow resubscribing
      const { error: updateError } = await supabase
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
    const { error: updateError } = await supabase
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
function generateHtmlPage(title: string, message: string): string {
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 24px;
      background: #f0fdf4;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon svg {
      width: 32px;
      height: 32px;
      color: #22c55e;
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
      font-size: 14px;
      color: #9ca3af;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
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
