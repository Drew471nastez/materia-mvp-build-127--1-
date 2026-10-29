import { syncPlatformsSoon } from "@/lib/contacts/checkout-contact"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { exitContactRuns } from "@/lib/automations/supabase-store"
import { maskEmail } from "@/lib/subscriber-unsubscribe-page"
import { answerUnsubscribeLink, loadListSender, pageLimited, pageResponse } from "@/lib/subscriber-unsubscribe-server"

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

/*
  GET: the link opened in a browser (a mail client that opens the
  List-Unsubscribe address instead of posting to it). It changes NOTHING:
  mail security scanners open every link in an email, and a GET that
  unsubscribed took people off lists without them. It answers the same page
  as /unsubscribe, which asks, and whose button is the POST below.
*/
export async function GET(request: NextRequest) {
  return answerUnsubscribeLink(request)
}

/*
  POST: a request as JSON ({ token, action }), the ONE-CLICK unsubscribe
  mail clients send from the List-Unsubscribe header (RFC 8058): a form body
  "List-Unsubscribe=One-Click" posted to the URL in the header, token in the
  query string (Gmail and Yahoo require it of bulk senders; campaigns point
  their header here), and the page's own button: a plain form with token
  and action, answered with the page in its new state so it works with no
  JavaScript at all (lib/subscriber-unsubscribe-page.ts).
*/
export async function POST(request: NextRequest) {
  /* The page's own button: answered with the page, not JSON. */
  let fromPage = false
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
      else if (form.has("token")) {
        fromPage = true
        token = form.get("token")
        action = form.get("action") === "resubscribe" ? "resubscribe" : "unsubscribe"
      }
    }
    const pageAction = action === "resubscribe" ? "resubscribe" : "unsubscribe"

    if (fromPage && (await pageLimited(request))) return pageResponse({ kind: "limited" }, 429)

    if (!token) {
      return fromPage ? pageResponse({ kind: "invalid" }, 400) : NextResponse.json({ error: "Missing token" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find subscriber by token
    const { data: subscriber, error } = await adminSupabase
      .from("subscribers")
      .select("id, email, status, creator_id")
      .eq("unsubscribe_token", token)
      .single()

    if (error || !subscriber) {
      return fromPage ? pageResponse({ kind: "invalid" }, 400) : NextResponse.json({ error: "Invalid token" }, { status: 404 })
    }
    const sender = fromPage ? await loadListSender(adminSupabase, subscriber.creator_id) : null
    const shown = { token, sender: sender ?? { name: "This sender", imageUrl: null }, maskedEmail: maskEmail(subscriber.email) }
    const failed = () => pageResponse({ kind: "error", token, sender, action: pageAction }, 500)

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
        return fromPage ? failed() : NextResponse.json({ error: "Failed to resubscribe" }, { status: 500 })
      }

      await syncPlatformsSoon(adminSupabase, subscriber.creator_id)
      if (fromPage) return pageResponse({ kind: "on", ...shown })
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
      return fromPage ? failed() : NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 })
    }
    await endAutomations(adminSupabase, subscriber)
    /* Unsubscribed on the store's connected email platforms too, within the minute. */
    await syncPlatformsSoon(adminSupabase, subscriber.creator_id)

    if (fromPage) {
      /*
        A person who opened the link and pressed Unsubscribe: recorded as the
        link click it is, against the creator's latest campaign, the way the
        link recorded it when opening it unsubscribed.
      */
      const { data: recentCampaign } = await adminSupabase
        .from("email_campaigns")
        .select("id")
        .eq("creator_id", subscriber.creator_id)
        .eq("status", "sent")
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      const { error: eventError } = await adminSupabase.from("email_events").insert({
        campaign_id: recentCampaign?.id || null,
        creator_id: subscriber.creator_id,
        email: subscriber.email,
        event_type: "unsubscribed",
        metadata: { method: "link_click", unsubscribed_at: now, subscriber_id: subscriber.id },
      })
      /* The unsubscribe itself worked; a missing event is not the reader's problem. */
      if (eventError) console.error("[unsubscribe] Event insert error:", eventError)
      console.log("[unsubscribe] Unsubscribed:", maskEmail(subscriber.email))
      return pageResponse({ kind: "off", ...shown })
    }

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
    if (fromPage) return pageResponse({ kind: "error", token: null, sender: null, action: "unsubscribe" }, 500)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
