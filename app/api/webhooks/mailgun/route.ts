import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAILGUN_SIGNING_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || process.env.MAILGUN_API_KEY || ""

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Verify Mailgun webhook signature to ensure the request is authentic
 */
function verifyWebhookSignature(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  if (!signingKey || !timestamp || !token || !signature) return false

  const encodedToken = crypto
    .createHmac("sha256", signingKey)
    .update(timestamp.concat(token))
    .digest("hex")

  return encodedToken === signature
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
    const body = await request.json()
    const eventData = body?.["event-data"] || body

    // Verify webhook signature
    const signature = body?.signature
    if (signature && MAILGUN_SIGNING_KEY) {
      const isValid = verifyWebhookSignature(
        MAILGUN_SIGNING_KEY,
        signature.timestamp,
        signature.token,
        signature.signature
      )

      if (!isValid) {
        console.error("[mailgun-webhook] Invalid webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const event = eventData?.event || ""
    const recipient = (eventData?.recipient || "").toLowerCase().trim()
    const severity = eventData?.severity || ""

    if (!recipient) {
      return NextResponse.json({ received: true })
    }

    console.log(`[mailgun-webhook] Event: ${event}, recipient: ${recipient}, severity: ${severity}`)

    // Handle different event types
    switch (event) {
      case "failed": {
        if (severity === "permanent") {
          // Hard bounce — suppress this address
          console.log(`[mailgun-webhook] Hard bounce for: ${recipient}`)
          await suppressEmail(recipient, "bounced", eventData?.["delivery-status"]?.message || "Hard bounce")
        }
        break
      }

      case "complained": {
        // Spam complaint — suppress and unsubscribe
        console.log(`[mailgun-webhook] Spam complaint from: ${recipient}`)
        await suppressEmail(recipient, "complained", "Spam complaint received")
        await unsubscribeEmail(recipient)
        break
      }

      case "unsubscribed": {
        // One-click unsubscribe via List-Unsubscribe header
        console.log(`[mailgun-webhook] Unsubscribe via header: ${recipient}`)
        await unsubscribeEmail(recipient)
        break
      }

      default:
        // Log other events (delivered, opened, clicked) for analytics
        break
    }

    // Log the event in email_events table
    await supabaseAdmin.from("email_events").insert({
      recipient_email: recipient,
      event_type: event,
      metadata: {
        severity,
        message_id: eventData?.message?.headers?.["message-id"] || null,
        reason: eventData?.reason || eventData?.["delivery-status"]?.message || null,
        timestamp: eventData?.timestamp || null,
      },
    }).catch((err) => {
      console.warn("[mailgun-webhook] Failed to log event:", err)
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[mailgun-webhook] Error processing webhook:", error)
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
      console.error(`[mailgun-webhook] Failed to suppress ${email}:`, error)
    } else {
      console.log(`[mailgun-webhook] Suppressed ${email}: ${reason} - ${message}`)
    }
  } catch (err) {
    console.error(`[mailgun-webhook] Error suppressing ${email}:`, err)
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
      console.error(`[mailgun-webhook] Failed to unsubscribe ${email}:`, error)
    } else {
      console.log(`[mailgun-webhook] Unsubscribed ${email}`)
    }
  } catch (err) {
    console.error(`[mailgun-webhook] Error unsubscribing ${email}:`, err)
  }
}
