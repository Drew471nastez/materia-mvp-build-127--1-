import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { supabaseNotifyStore } from "@/lib/notify/store"
import { handleMailgunWebhook } from "@/lib/notify/webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * The keys a delivery may be signed with: the webhook signing key Mailgun
 * shows under Sending > Webhooks, and, for accounts old enough to sign with
 * it, the API key. Both are secrets, so accepting either admits nobody new.
 */
const SIGNING_KEYS = [process.env.MAILGUN_WEBHOOK_SIGNING_KEY, process.env.MAILGUN_API_KEY].filter(
  (k): k is string => typeof k === "string" && k.length > 0,
)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * A DELIVERY WITHOUT A VALID SIGNATURE IS REFUSED, including one with no
 * signature at all. This used to check a signature only when the request
 * carried one, so a POST without it was trusted: anybody could unsubscribe
 * or suppress any address on every creator's list.
 *
 * Mailgun's scheme exactly ("Securing Webhooks"): the hex HMAC-SHA256 of
 * timestamp followed by token, keyed with the account's HTTP webhook signing
 * key, compared in constant time. tests/mailgun-signature.test.ts holds a
 * delivery signed by Mailgun's own documented Python verifier.
 */
function verifyWebhookSignature(signature: unknown): boolean {
  return signatureProblem(signature) === null
}

/**
 * Why a delivery was refused, for the one log line: a body with no signature
 * at all is somebody other than Mailgun, and a well formed signature that
 * matches no key is Mailgun signing with a key this deployment does not
 * have. The two call for different fixes, so the line says which.
 */
function signatureProblem(signature: unknown): "unsigned" | "malformed" | "no matching key" | null {
  if (!signature || typeof signature !== "object") return "unsigned"
  const { timestamp, token, signature: given } = signature as Record<string, unknown>
  if (timestamp == null || typeof token !== "string" || typeof given !== "string" || !token || !given) return "malformed"
  const expectedLength = 64
  if (given.length !== expectedLength) return "malformed"
  const presented = Buffer.from(given, "utf8")
  const ok = SIGNING_KEYS.some((key) => {
    const digest = crypto.createHmac("sha256", key).update(String(timestamp) + token).digest("hex")
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), presented)
  })
  return ok ? null : "no matching key"
}

/**
 * The body, JSON or a form. Mailgun's webhooks send JSON with the signature
 * as an object ({ signature: { timestamp, token, signature }, "event-data" }).
 * Its legacy webhooks post a form with timestamp, token and signature as
 * fields beside the event's own; those are gathered into the same object,
 * so both are checked the same way. Anything else is null.
 */
async function readDelivery(request: Request): Promise<Record<string, unknown> | null> {
  const type = request.headers.get("content-type") || ""
  if (/application\/x-www-form-urlencoded|multipart\/form-data/i.test(type)) {
    const form = await request.formData().catch(() => null)
    if (!form) return null
    const fields: Record<string, unknown> = {}
    for (const [k, v] of form.entries()) if (typeof v === "string") fields[k] = v
    const { timestamp, token, signature, ...event } = fields
    return { ...event, signature: { timestamp, token, signature } }
  }
  const body = await request.json().catch(() => null)
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null
}

/**
 * The Mailgun events email_events.event_type accepts. Mailgun sends more than
 * these ("accepted", "rejected", "stored"); those are handled above where they
 * matter and not written to the table, whose check constraint would refuse them.
 */
const LOGGED_EVENTS = new Set(["delivered", "opened", "clicked", "failed", "complained", "unsubscribed"])

/** "a***@example.com": enough to recognise in a log, not enough to be the address. */
function masked(email: string): string {
  const at = email.indexOf("@")
  return at > 0 ? `${email[0]}***${email.slice(at)}` : "***"
}

/**
 * Mailgun webhook handler for email events.
 *
 * lib/notify/webhook.ts handleMailgunWebhook checks what this route always
 * checked (a signing key is configured, the signature matches) and two more
 * things: the timestamp is within five minutes, so a captured delivery
 * cannot be replayed later, and the event id is recorded once in
 * mailgun_webhook_events, so a retry by Mailgun changes nothing twice. Then:
 *
 * - the list subscribers and campaign rows, as before (handleListEvent):
 *   - failed, permanent: the address marked bounced on every list
 *   - complained: bounced, then unsubscribed
 *   - unsubscribed: unsubscribed
 *   - campaign recipient rows moved to delivered or bounced
 *   - the event logged in email_events
 * - the notification engine's own (lib/notify/tracking.ts): its delivery
 *   row updated, a hard bounce suppressed for all email, a complaint for
 *   optional email with the person's lifecycle, tips and marketing email
 *   turned off, and an unsubscribe from an engine email turning off that
 *   email's category.
 */
export async function POST(request: Request) {
  try {
    const body: any = await readDelivery(request)
    if (!body) return NextResponse.json({ error: "Send JSON" }, { status: 400 })

    if (SIGNING_KEYS.length === 0) {
      console.error("[mailgun-webhook] MAILGUN_WEBHOOK_SIGNING_KEY is not configured; refusing the request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!verifyWebhookSignature(body?.signature)) {
      /* "no matching key" is Mailgun signing with a key this deployment does not have: MAILGUN_WEBHOOK_SIGNING_KEY is not the account's HTTP webhook signing key. */
      console.error(`[mailgun-webhook] Invalid webhook signature: ${signatureProblem(body?.signature)}`)
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const answer = await handleMailgunWebhook(body, {
      signingKeys: SIGNING_KEYS,
      store: supabaseNotifyStore(supabaseAdmin),
      legacy: handleListEvent,
    })
    if (answer.status !== 200) console.error(`[mailgun-webhook] Refused: ${String(answer.body.error ?? answer.status)}`)
    return NextResponse.json(answer.body, { status: answer.status })
  } catch (error) {
    console.error("[mailgun-webhook] Error processing webhook:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * What an event means for creators' lists and campaigns, as this route has
 * always handled it. Runs once per Mailgun event id.
 */
async function handleListEvent(eventData: any) {
  const event = eventData?.event || ""
  const recipient = (eventData?.recipient || "").toLowerCase().trim()
  const severity = eventData?.severity || ""

  if (!recipient) return

  console.log(`[mailgun-webhook] Event: ${event}, recipient: ${masked(recipient)}, severity: ${severity}`)

  // Handle different event types
  switch (event) {
    case "failed": {
      if (severity === "permanent") {
        // Hard bounce — suppress this address
        console.log(`[mailgun-webhook] Hard bounce for: ${masked(recipient)}`)
        await suppressEmail(recipient, "bounced", eventData?.["delivery-status"]?.message || "Hard bounce")
      }
      break
    }

    case "complained": {
      // Spam complaint — suppress and unsubscribe
      console.log(`[mailgun-webhook] Spam complaint from: ${masked(recipient)}`)
      await suppressEmail(recipient, "complained", "Spam complaint received")
      await unsubscribeEmail(recipient)
      break
    }

    case "unsubscribed": {
      // One-click unsubscribe via List-Unsubscribe header
      console.log(`[mailgun-webhook] Unsubscribe via header: ${masked(recipient)}`)
      await unsubscribeEmail(recipient)
      break
    }

    default:
      // Log other events (delivered, opened, clicked) for analytics
      break
  }

  await recordCampaignDelivery(event, severity, eventData)

  // Log the event in email_events table
  // `.catch()` here threw instead of logging — a PostgREST builder has no
  // `catch` — so this webhook answered 500 on every delivery event.
  //
  // The address goes in `email`: 20260203_rebuild_email_sent_system.sql
  // rebuilt this table without recipient_email, so every write from here
  // was refused and the admin bounce list stayed empty. A Mailgun name the
  // table's event_type does not allow ("accepted", "rejected", "stored")
  // would be refused the same way, so it is not written at all.
  if (LOGGED_EVENTS.has(event)) {
    const logged = await ignoreError(
      supabaseAdmin.from("email_events").insert({
        email: recipient,
        event_type: event,
        metadata: {
          severity,
          message_id: eventData?.message?.headers?.["message-id"] || null,
          reason: eventData?.reason || eventData?.["delivery-status"]?.message || null,
          timestamp: eventData?.timestamp || null,
        },
      }),
    )
    if (logged === null) console.warn("[mailgun-webhook] Failed to log event")
  }
}

/**
 * A campaign message's fate, on its own recipient row. Campaign sends carry
 * the row's id as a Mailgun variable (lib/email-campaigns/queue.ts), so the
 * event names the exact row: delivered, or bounced for good. A row only
 * moves forward, never back from bounced to delivered.
 */
async function recordCampaignDelivery(event: string, severity: string, eventData: any) {
  const vars = eventData?.["user-variables"] || {}
  const recipientId = typeof vars.recipient_id === "string" ? vars.recipient_id : null
  const campaignId = typeof vars.campaign_id === "string" ? vars.campaign_id : null
  if (!recipientId || !campaignId) return
  const now = new Date().toISOString()
  try {
    if (event === "delivered") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "delivered", delivered_at: now })
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .in("status", ["sent", "sending"])
    } else if (event === "failed" && severity === "permanent") {
      await supabaseAdmin
        .from("campaign_recipients")
        .update({ status: "bounced", bounced_at: now, error_message: "The receiving mail server refused it." })
        .eq("id", recipientId)
        .eq("campaign_id", campaignId)
        .in("status", ["sent", "sending", "delivered"])
    }
  } catch (err) {
    console.error("[mailgun-webhook] campaign delivery not recorded:", err instanceof Error ? err.message : "unknown error")
  }
}

/**
 * Suppress an email address by marking all subscriber records as bounced
 */
async function suppressEmail(email: string, reason: string, message: string) {
  try {
    // Update all subscriber records for this email
    const { error } = await supabaseAdmin
      .from("subscribers")
      .update({
        status: "bounced",
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .in("status", ["subscribed", "pending"])

    if (error) {
      console.error(`[mailgun-webhook] Failed to suppress ${masked(email)}:`, error.code, error.message)
    } else {
      console.log(`[mailgun-webhook] Suppressed ${masked(email)}: ${reason} - ${message}`)
    }
  } catch (err) {
    console.error(`[mailgun-webhook] Error suppressing ${masked(email)}:`, err instanceof Error ? err.message : "unknown error")
  }
}

/**
 * Unsubscribe an email address from all creator lists
 */
async function unsubscribeEmail(email: string) {
  try {
    const { error } = await supabaseAdmin
      .from("subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)
      .eq("status", "subscribed")

    if (error) {
      console.error(`[mailgun-webhook] Failed to unsubscribe ${masked(email)}:`, error.code, error.message)
    } else {
      console.log(`[mailgun-webhook] Unsubscribed ${masked(email)}`)
    }
  } catch (err) {
    console.error(`[mailgun-webhook] Error unsubscribing ${masked(email)}:`, err instanceof Error ? err.message : "unknown error")
  }
}
