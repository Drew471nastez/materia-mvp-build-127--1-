import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendEmail, buildFromHeader, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/mail"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { automationEmail, standingOf } from "@/lib/email-automation"
import { maskEmail } from "@/lib/privacy/mask-email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes max

// Create admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PLATFORM_BRAND_NAME = "Storelib"
const DEFAULT_SUPPORT = EMAIL_REPLY_TO
const FROM_EMAIL = EMAIL_FROM

function buildFromHeaderLocal(displayName?: string) {
  const name = (displayName || "").replace(/[<>]/g, "").trim() || PLATFORM_BRAND_NAME
  // Extract just the email address from FROM_EMAIL if it contains angle brackets
  const emailMatch = FROM_EMAIL.match(/<(.+)>/)
  const email = emailMatch ? emailMatch[1] : FROM_EMAIL
  return `${name} <${email}>`
}

function safeText(s: string) {
  return (s || "").toString().replace(/\s+/g, " ").trim()
}



// Resolve creator identity for sending emails
async function resolveCreatorIdentity(creatorId: string): Promise<{ fromName: string; replyTo: string }> {
  try {
    const { data: creator } = await supabaseAdmin
      .from("creators")
      .select("headline, slug, support_email, user_id")
      .eq("id", creatorId)
      .single()

    let fromName = ""
    let replyTo = ""

    if (creator?.support_email?.trim()) {
      replyTo = creator.support_email.trim()
    }

    if (creator?.user_id) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, display_name, username")
        .eq("id", creator.user_id)
        .single()

      if (profile?.display_name?.trim()) fromName = profile.display_name.trim()
      else if (profile?.username?.trim()) fromName = profile.username.trim()

      if (!replyTo && profile?.email?.trim()) {
        replyTo = profile.email.trim()
      }
    }

    if (!fromName) {
      if (creator?.headline?.trim()) fromName = creator.headline.trim()
      else if (creator?.slug?.trim()) fromName = creator.slug.trim()
    }

    return {
      fromName: fromName || PLATFORM_BRAND_NAME,
      replyTo: replyTo.toLowerCase().trim() || DEFAULT_SUPPORT,
    }
  } catch (err) {
    console.error("[cron/scheduled-emails] Error resolving creator identity:", err)
    return { fromName: PLATFORM_BRAND_NAME, replyTo: DEFAULT_SUPPORT }
  }
}

export async function GET(request: Request) {
  // Verify cron secret for security (optional but recommended)
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) {
    console.log("[cron/scheduled-emails] Unauthorized request")
    return denied
  }

  console.log("[cron/scheduled-emails] Starting scheduled email processing...")

  if (!isSmtpConfigured()) {
    console.log("[cron/scheduled-emails] SMTP not configured, skipping")
    return NextResponse.json({ error: "SMTP not configured" }, { status: 500 })
  }

  try {
    // Get pending scheduled emails that are due
    const now = new Date().toISOString()

    const { data: scheduledEmails, error: fetchError } = await supabaseAdmin
      .from("scheduled_flow_emails")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(50) // Process max 50 emails per run

    if (fetchError) {
      console.error("[cron/scheduled-emails] Error fetching scheduled emails:", fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!scheduledEmails || scheduledEmails.length === 0) {
      console.log("[cron/scheduled-emails] No pending scheduled emails")
      return NextResponse.json({ processed: 0, message: "No pending emails" })
    }

    console.log(`[cron/scheduled-emails] Found ${scheduledEmails.length} pending email(s)`)

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const email of scheduledEmails) {
      try {
        // Check if flow is still active
        const { data: flow } = await supabaseAdmin
          .from("email_flows")
          .select("status")
          .eq("id", email.flow_id)
          .single()

        if (flow?.status !== "active") {
          // Flow is paused or deleted, cancel this email
          await supabaseAdmin
            .from("scheduled_flow_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", email.id)

          console.log(`[cron/scheduled-emails] Cancelled email ${email.id} - flow no longer active`)
          continue
        }

        /**
         * AND THE PERSON IS CHECKED AGAIN, NOT ONLY THE FLOW.
         *
         * This email was queued when somebody signed up, and is being sent
         * days later. Unsubscribing in between did nothing: the row was
         * still pending and still went. Now it is cancelled, and the send
         * carries the unsubscribe link read here.
         */
        const standing = await standingOf(supabaseAdmin, email.creator_id, email.recipient_email)
        if (standing.suppressed) {
          await supabaseAdmin
            .from("scheduled_flow_emails")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("id", email.id)
          console.log(`[cron/scheduled-emails] Cancelled ${email.id} - the address left the list`)
          continue
        }

        // Get creator identity for this email
        const identity = await resolveCreatorIdentity(email.creator_id)
        const mail = automationEmail({
          body: email.body,
          fromName: identity.fromName,
          unsubscribeToken: standing.unsubscribeToken,
        })

        // Send the email
        const result = await sendEmail({
          from: buildFromHeaderLocal(identity.fromName),
          to: email.recipient_email.toLowerCase().trim(),
          replyTo: identity.replyTo,
          subject: email.subject,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
        })

        if (result.success) {
          // Mark as sent
          await supabaseAdmin
            .from("scheduled_flow_emails")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", email.id)

          // Log email event
          await supabaseAdmin.from("email_events").insert({
            flow_id: email.flow_id,
            recipient_email: email.recipient_email,
            event_type: "sent",
            metadata: {
              step_id: email.step_id,
              subject: email.subject,
              scheduled_for: email.scheduled_for,
            },
          })

          // Increment email usage for the creator
          // Ignore if the function doesn't exist. `.catch()` on a PostgREST
          // builder never did that — it threw. See lib/supabase/ignore-error.
          await ignoreError(
            supabaseAdmin.rpc("increment_email_usage", {
              p_creator_id: email.creator_id,
              p_count: 1,
            }),
          )

          sent++
          console.log(`[cron/scheduled-emails] Sent email to ${maskEmail(email.recipient_email)}`)
        } else {
          throw new Error(result.error || "Failed to send")
        }
      } catch (err: any) {
        // Mark as failed
        await supabaseAdmin
          .from("scheduled_flow_emails")
          .update({
            status: "failed",
            error_message: err.message || "Unknown error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", email.id)

        errors.push(`${maskEmail(email.recipient_email)}: ${err.message}`)
        failed++
        console.error(`[cron/scheduled-emails] Failed to send email to ${maskEmail(email.recipient_email)}:`, err.message)
      }
    }

    console.log(`[cron/scheduled-emails] Completed: ${sent} sent, ${failed} failed`)

    return NextResponse.json({
      processed: scheduledEmails.length,
      sent,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err: any) {
    console.error("[cron/scheduled-emails] Fatal error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Also support POST for manual triggers
export async function POST(request: Request) {
  return GET(request)
}
