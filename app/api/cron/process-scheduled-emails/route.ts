import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendEmail, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/mail"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { automationEmail, personalizeText, standingOf } from "@/lib/email-automation"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { maskEmail } from "@/lib/privacy/mask-email"
import { runDueJobs } from "@/lib/automations/run"
import { runCampaignQueue } from "@/lib/email-campaigns/queue"
import { runAbandonedSweep } from "@/lib/automations/abandoned-run"
import { recordCronRun } from "@/lib/observability/report"

/**
 * ===========================================================================
 *  THE HOURLY RUN OF EVERY AUTOMATION
 * ===========================================================================
 * Three queues, one after the other, inside the function's time:
 *
 *   campaigns    scheduled campaigns that are due, and any campaign send
 *                whose worker ran out of time (lib/email-campaigns/queue.ts).
 *                Each recipient row is claimed before it is sent, so this
 *                and the worker the Send button started never both send it.
 *   the engine   email_flow_jobs, claimed a few at a time with a lease, so
 *                this and any other worker (the `after()` that runs straight
 *                after a trigger) never take the same step. See
 *                lib/automations/engine.ts.
 *   the older    scheduled_flow_emails, from before the engine, or from a
 *                database that has not run its SQL yet. Each row is taken
 *                with a conditional update (pending to sending) before it is
 *                sent, so two runs at once cannot both send it. A failure is
 *                tried again twice, half an hour apart, then kept as failed
 *                with its reason.
 *
 * The reply says what was done and never quotes an address or a database
 * error.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes max

/** Stop claiming new work with time left to finish what was claimed. */
const CAMPAIGN_BUDGET_MS = 90_000
const ENGINE_BUDGET_MS = 130_000
const LEGACY_BUDGET_MS = 45_000
/**
 * THE WHOLE RUN'S CLOCK. Each queue's budget used to count from its own
 * start, so a slow campaign queue and a busy checkout sweep pushed the
 * engine's 130 seconds, and the batch it was still sending, past the
 * function's 300. A function stopped mid send leaves that email "sending",
 * which the engine then never sends (it cannot know whether it arrived) and
 * marks the run failed. So the engine stops claiming by ENGINE_DEADLINE_MS
 * after the run began, leaving room for the batch it holds, and the older
 * queue stops by LEGACY_DEADLINE_MS, whatever came before them.
 */
const ENGINE_DEADLINE_MS = 220_000
const LEGACY_DEADLINE_MS = 280_000
const LEGACY_ATTEMPTS = 3

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
  } catch {
    console.error("[cron/scheduled-emails] Could not read a creator's name for sending")
    return { fromName: PLATFORM_BRAND_NAME, replyTo: DEFAULT_SUPPORT }
  }
}

function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error")
  return raw.replace(/[^\s@<>"']+@[^\s@<>"']+/g, "(address)").slice(0, 300)
}

async function runJob(request: Request) {
  const denied = requireBearerSecret(request, "CRON_SECRET")
  if (denied) {
    console.log("[cron/scheduled-emails] Unauthorized request")
    return denied
  }

  if (!isSmtpConfigured()) {
    /* Nothing is claimed, so no attempt is spent on a sender that is not there. */
    console.log("[cron/scheduled-emails] SMTP not configured, skipping")
    return NextResponse.json({ error: "Email sending is not configured" }, { status: 500 })
  }

  const started = Date.now()
  /* Never throws: a campaign cannot hold up the automations after it. */
  const campaigns = await runCampaignQueue(supabaseAdmin, started + CAMPAIGN_BUDGET_MS)

  /* Checkouts left an hour ago enter the creators' reminders first, so the
     engine below sends their first email in this same run. */
  let abandoned: Awaited<ReturnType<typeof runAbandonedSweep>> | { available: false; error: true } = { available: false, error: true }
  try {
    abandoned = await runAbandonedSweep()
  } catch (err) {
    console.error("[cron/scheduled-emails] Checkout reminder sweep failed:", errorText(err))
  }

  let engine: Awaited<ReturnType<typeof runDueJobs>> | { available: false; error: true } = { available: false, error: true }
  try {
    engine = await runDueJobs(Math.max(0, Math.min(ENGINE_BUDGET_MS, started + ENGINE_DEADLINE_MS - Date.now())))
  } catch (err) {
    console.error("[cron/scheduled-emails] Engine run failed:", errorText(err))
  }

  const legacy = await drainLegacyQueue(Math.min(Date.now() + LEGACY_BUDGET_MS, started + LEGACY_DEADLINE_MS))

  const { data: health } = await supabaseAdmin.rpc("email_flow_health").then(
    (r: { data: unknown }) => r,
    () => ({ data: null }),
  )

  console.log("[cron/scheduled-emails] Done:", { campaigns, abandoned, engine, legacy })
  return NextResponse.json({
    campaigns,
    abandoned,
    engine,
    legacy,
    health: Array.isArray(health) ? health[0] ?? null : null,
  })
}

async function drainLegacyQueue(deadline: number): Promise<{ sent: number; failed: number; cancelled: number; retrying: number }> {
  const out = { sent: 0, failed: 0, cancelled: 0, retrying: 0 }
  const now = new Date().toISOString()
  const { data: scheduledEmails, error: fetchError } = await supabaseAdmin
    .from("scheduled_flow_emails")
    .select("*")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(50)

  if (fetchError || !scheduledEmails || scheduledEmails.length === 0) return out

  /* The creator's name, logo, colour and photo as they are NOW, read once per
     creator per run: a row queued days ago is sent in today's look. */
  const looks = new Map<string, ReturnType<typeof loadBrand>>()
  const lookOf = (creatorId: string) => {
    let look = looks.get(creatorId)
    if (!look) {
      look = loadBrand(supabaseAdmin, creatorId)
      looks.set(creatorId, look)
    }
    return look
  }

  for (const email of scheduledEmails) {
    if (Date.now() > deadline) break

    /* Taken, or somebody else has it. Only the run whose update changed the
       row sends it. */
    const { data: taken } = await supabaseAdmin
      .from("scheduled_flow_emails")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", email.id)
      .eq("status", "pending")
      .select("id")
    if (!Array.isArray(taken) || taken.length === 0) continue

    try {
      // Check if flow is still active
      const { data: flow } = await supabaseAdmin
        .from("email_flows")
        .select("status")
        .eq("id", email.flow_id)
        .maybeSingle()

      if (flow?.status !== "active") {
        await supabaseAdmin
          .from("scheduled_flow_emails")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("id", email.id)
        out.cancelled++
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
        out.cancelled++
        continue
      }

      const [identity, look] = await Promise.all([resolveCreatorIdentity(email.creator_id), lookOf(email.creator_id).catch(() => null)])
      const mail = automationEmail({
        body: email.body,
        fromName: identity.fromName,
        unsubscribeToken: standing.unsubscribeToken,
        brand: look ? { name: look.name, logoUrl: look.logoUrl, storeUrl: look.storeUrl, accent: look.accent, address: look.address } : undefined,
        avatarUrl: look?.avatarUrl ?? null,
      })
      /* Queued with the person filled in; the creator's placeholders are filled now, as they are today. */
      const subject = personalizeText(String(email.subject ?? ""), { creatorName: identity.fromName, storeName: look?.name, storeUrl: look?.storeUrl })

      const result = await sendEmail({
        from: buildFromHeaderLocal(identity.fromName),
        to: email.recipient_email.toLowerCase().trim(),
        replyTo: identity.replyTo,
        subject,
        html: mail.html,
        text: mail.text,
        headers: mail.headers,
      })

      if (!result.success) throw new Error(result.error || "Failed to send")

      await supabaseAdmin
        .from("scheduled_flow_emails")
        .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", email.id)

      await ignoreError(
        /* creator_id and email are the table's columns since
           20260203_rebuild_email_sent_system.sql; flow_id is not one of them,
           so it rides in the metadata that already carries the step. */
        supabaseAdmin.from("email_events").insert({
          creator_id: email.creator_id,
          email: email.recipient_email,
          event_type: "sent",
          metadata: { flow_id: email.flow_id, step_id: email.step_id, subject: email.subject, scheduled_for: email.scheduled_for },
        }),
      )
      await ignoreError(supabaseAdmin.rpc("increment_email_usage", { p_creator_id: email.creator_id, p_count: 1 }))
      out.sent++
      console.log(`[cron/scheduled-emails] Sent email to ${maskEmail(email.recipient_email)}`)
    } catch (err) {
      const attempts = Number((email.metadata as { attempts?: number } | null)?.attempts ?? 0) + 1
      const again = attempts < LEGACY_ATTEMPTS
      await supabaseAdmin
        .from("scheduled_flow_emails")
        .update({
          status: again ? "pending" : "failed",
          scheduled_for: again ? new Date(Date.now() + attempts * 30 * 60_000).toISOString() : email.scheduled_for,
          error_message: errorText(err),
          metadata: { ...(email.metadata ?? {}), attempts },
          updated_at: new Date().toISOString(),
        })
        .eq("id", email.id)
      if (again) out.retrying++
      else out.failed++
      console.error(`[cron/scheduled-emails] Failed to send to ${maskEmail(email.recipient_email)}:`, errorText(err))
    }
  }
  return out
}

// Also support POST for manual triggers
export async function POST(request: Request) {
  return GET(request)
}

/* Every run written down, and a failure reported (lib/observability/report, run-now part 68). */
export async function GET(request: Request) {
  return recordCronRun("/api/cron/process-scheduled-emails", request, () => runJob(request))
}
