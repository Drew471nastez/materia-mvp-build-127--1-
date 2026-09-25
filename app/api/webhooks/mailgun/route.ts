import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"
import { ignoreError } from "@/lib/supabase/ignore-error"

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
 */
function verifyWebhookSignature(signature: unknown): boolean {
  if (!signature || typeof signature !== "object") return false
  const { timestamp, token, signature: given } = signature as Record<string, unknown>
  if (timestamp == null || typeof token !== "string" || typeof given !== "string" || !token || !given) return false
  const expectedLength = 64
  if (given.length !== expectedLength) return false
  const presented = Buffer.from(given, "utf8")
  return SIGNING_KEYS.some((key) => {
    const digest = crypto.createHmac("sha256", key).update(String(timestamp) + token).digest("hex")
    return crypto.timingSafeEqual(Buffer.from(digest, "utf8"), presented)
  })
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
 * Mailgun webhook handler for email events:
 * - bounced: Hard bounces → suppress address
 * - complained: Spam complaints → suppress address + unsubscribe
 * - unsubscribed: One-click unsubscribe → mark unsubscribed
 * - failed: Permanent delivery failures → suppress address
 */
export async function POST(request: Request) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Send JSON" }, { status: 400 })
    }
    const eventData = body?.["event-data"] || body

    if (SIGNING_KEYS.length === 0) {
      console.error("[mailgun-webhook] MAILGUN_WEBHOOK_SIGNING_KEY is not configured; refusing the request")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (!verifyWebhookSignature(body?.signature)) {
      console.error("[mailgun-webhook] Invalid webhook signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    const event = eventData?.event || ""
    const recipient = (eventData?.recipient || "").toLowerCase().trim()
    const severity = eventData?.severity || ""

    if (!recipient) {
      return NextResponse.json({ received: true })
    }

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

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[mailgun-webhook] Error processing webhook:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
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
