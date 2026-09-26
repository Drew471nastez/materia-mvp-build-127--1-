import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { exitContactRuns } from "@/lib/automations/supabase-store"

/**
 * Their automations end with them: every run of this address with this
 * creator is marked "Unsubscribed." and its waiting email cancelled, so the
 * builder and the contact's page say they left at once. Nothing more would
 * have been sent either way (the engine reads their standing before every
 * step); this keeps the records true. Never a reason to fail the unsubscribe.
 */
async function endAutomations(db: ReturnType<typeof createAdminClient>, subscriber: { creator_id: string; email: string }) {
  try {
    await exitContactRuns(db, subscriber.creator_id, subscriber.email, "Unsubscribed.")
  } catch {
    console.error("[unsubscribe] Could not end the automations of an address that left")
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET - Handle unsubscribe link clicks (renders a confirmation page)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")

  if (!token) {
    return renderPage("Invalid Link", "This unsubscribe link is invalid or has expired.", "error")
  }

  const adminSupabase = createAdminClient()

  // Find subscriber by unsubscribe token
  const { data: subscriber, error } = await adminSupabase
    .from("subscribers")
    .select("id, email, status, creator_id")
    .eq("unsubscribe_token", token)
    .single()

  if (error || !subscriber) {
    return renderPage("Invalid Link", "This unsubscribe link is invalid or has expired.", "error")
  }

  // Check if already unsubscribed
  if (subscriber.status === "unsubscribed") {
    return renderPage("Already Unsubscribed", "You have already been unsubscribed from this mailing list.", "info")
  }

  // Unsubscribe the user
  const now = new Date().toISOString()
  const { error: updateError } = await adminSupabase
    .from("subscribers")
    .update({
      status: "unsubscribed",
      is_active: false,
      unsubscribed_at: now,
    })
    .eq("id", subscriber.id)

  if (updateError) {
    console.error("[unsubscribe] Update error:", updateError)
    return renderPage("Error", "There was an error processing your request. Please try again later.", "error")
  }
  await endAutomations(adminSupabase, subscriber)

  // Record the unsubscribe event
  // Find the most recent campaign sent to this subscriber to associate the unsubscribe
  const { data: recentCampaign } = await adminSupabase
    .from("email_campaigns")
    .select("id")
    .eq("creator_id", subscriber.creator_id)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Log the unsubscribe event
  const { error: eventError } = await adminSupabase.from("email_events").insert({
    campaign_id: recentCampaign?.id || null,
    creator_id: subscriber.creator_id,
    email: subscriber.email,
    event_type: "unsubscribed",
    metadata: {
      method: "link_click",
      unsubscribed_at: now,
      subscriber_id: subscriber.id,
    },
  })

  if (eventError) {
    console.error("[unsubscribe] Event insert error:", eventError)
    // Continue anyway - unsubscribe was successful
  }

  console.log("[unsubscribe] Unsubscribed:", maskEmail(subscriber.email))

  return renderPage(
    "Unsubscribed Successfully",
    `You (${maskEmail(subscriber.email)}) have been unsubscribed and will no longer receive emails from this sender.`,
    "success"
  )
}

/*
  POST: the unsubscribe page's own request ({ token, action } as JSON), and
  the ONE-CLICK unsubscribe mail clients send from the List-Unsubscribe
  header (RFC 8058): a form body "List-Unsubscribe=One-Click" posted to the
  URL in the header, token in the query string. Gmail and Yahoo require that
  second one of bulk senders; campaigns point their header here.
*/
export async function POST(request: NextRequest) {
  try {
    let token: string | null = request.nextUrl.searchParams.get("token")
    let action: string | undefined
    if ((request.headers.get("content-type") || "").includes("application/json")) {
      const body = await request.json().catch(() => ({}))
      token = typeof body?.token === "string" ? body.token : token
      action = typeof body?.action === "string" ? body.action : undefined
    } else {
      const form = new URLSearchParams(await request.text().catch(() => ""))
      /* A one-click request can only ever unsubscribe. */
      if (form.get("List-Unsubscribe") === "One-Click") action = "unsubscribe"
    }

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find subscriber by token
    const { data: subscriber, error } = await adminSupabase
      .from("subscribers")
      .select("id, email, status, creator_id")
      .eq("unsubscribe_token", token)
      .single()

    if (error || !subscriber) {
      return NextResponse.json({ error: "Invalid token" }, { status: 404 })
    }

    const now = new Date().toISOString()

    if (action === "resubscribe") {
      // Resubscribe - keep unsubscribed_at to track that they were once unsubscribed (for "resubscribed" badge)
      const { error: updateError } = await adminSupabase
        .from("subscribers")
        .update({
          status: "subscribed",
          is_active: true,
          // Note: We intentionally DON'T clear unsubscribed_at so we can show "resubscribed" badge
        })
        .eq("id", subscriber.id)

      if (updateError) {
        return NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "Resubscribed successfully" })
    }

    // Default: Unsubscribe
    const { error: updateError } = await adminSupabase
      .from("subscribers")
      .update({
        status: "unsubscribed",
        is_active: false,
        unsubscribed_at: now,
      })
      .eq("id", subscriber.id)

    if (updateError) {
      return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 })
    }
    await endAutomations(adminSupabase, subscriber)

    // Record the event
    await adminSupabase.from("email_events").insert({
      creator_id: subscriber.creator_id,
      email: subscriber.email,
      event_type: "unsubscribed",
      metadata: {
        method: "api",
        unsubscribed_at: now,
      },
    })

    return NextResponse.json({ success: true, message: "Unsubscribed successfully" })

  } catch (error) {
    console.error("[unsubscribe] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Mask email for privacy
function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  if (!local || !domain) return email
  const masked = local.length > 2
    ? local[0] + "***" + local[local.length - 1]
    : "***"
  return `${masked}@${domain}`
}

// Render HTML page
function renderPage(title: string, message: string, type: "success" | "error" | "info"): NextResponse {
  const colors = {
    success: { bg: "#f0fdf4", icon: "#22c55e", border: "#86efac" },
    error: { bg: "#fef2f2", icon: "#ef4444", border: "#fca5a5" },
    info: { bg: "#eff6ff", icon: "#3b82f6", border: "#93c5fd" },
  }

  const icons = {
    success: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />`,
    error: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />`,
    info: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />`,
  }

  const html = `<!DOCTYPE html>
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
</html>`

  return new NextResponse(html, {
    status: type === "error" ? 400 : 200,
    headers: { "Content-Type": "text/html" },
  })
}
