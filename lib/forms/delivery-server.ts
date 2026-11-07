import "server-only"
import https from "node:https"
import type net from "node:net"
import { publicLookup } from "@/lib/api/public-fetch"
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { escapeHtml, resolveCreatorIdentity } from "@/lib/email"
import { openSecret } from "@/lib/physical/secrets"
import { platformOrigin } from "@/lib/onepage/return-address"
import { answerText, type Answer } from "./definition"
import { MAX_ATTEMPTS, retryDelayMs, signWebhook, webhookUrlProblem } from "./webhook"
import { FORM_UPLOAD_BUCKET } from "./uploads-server"
import { expireUnpaidBookings } from "./booking-payment"

/*
  EVERYTHING A RESPONSE SENDS, SENT ONCE, RETRIED UNTIL IT IS.

  A response writes one row per thing to send into form_integration_jobs
  (unique per response and kind, so a retried submit never queues twice):
  the owner's email, the visitor's booking decision, the owner's webhook.
  The submit route runs its own jobs right after answering (after()), and
  /api/cron/notify runs whatever is due every five minutes.

  A worker claims a job by setting a lease (locked_until) in the same
  UPDATE that checks nobody else holds it, so two workers never send the
  same job. Success marks it delivered and it is never picked again. A
  failure is tried again after 1 min, 5 min, 30 min, 2 h, 6 h and a day,
  then left as failed with the reason. A crash between sending and marking
  can repeat one send when the lease runs out; nothing else repeats.

  Google Sheets jobs are written as pending_setup and never run: there is
  no Google connection in Storelib yet (see docs/forms/FORMS_BOOKINGS.md).
*/

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; storage: { from: (bucket: string) => any }; rpc?: (...args: any[]) => any }

export type JobProvider = "owner_email" | "visitor_email" | "booking_confirmed" | "booking_declined" | "webhook" | "google_sheets"
const LEASE_MS = 2 * 60_000

export interface WebhookSettings {
  enabled?: boolean
  url?: string
  secret_sealed?: string
  secret_hint?: string
  prepared?: boolean
}
export interface IntegrationSettings {
  notify_email?: boolean
  webhook?: WebhookSettings
  google_sheets?: { prepared?: boolean }
}

/** The jobs a new response queues, from the form's settings. */
export function jobsFor(settings: IntegrationSettings | null | undefined, opts: { booking?: boolean } = {}): { provider: JobProvider; state: "ready" | "pending_setup" }[] {
  const s = settings || {}
  const out: { provider: JobProvider; state: "ready" | "pending_setup" }[] = []
  if (s.notify_email !== false) out.push({ provider: "owner_email", state: "ready" })
  if (s.webhook?.enabled && s.webhook.url && s.webhook.secret_sealed) out.push({ provider: "webhook", state: "ready" })
  if (s.google_sheets?.prepared) out.push({ provider: "google_sheets", state: "pending_setup" })
  void opts
  return out
}

export async function queueJobs(db: Db, input: { ownerId: string; formId: string; submissionId: string; jobs: { provider: JobProvider; state: string }[] }): Promise<string[]> {
  if (!input.jobs.length) return []
  const { data, error } = await db
    .from("form_integration_jobs")
    .upsert(
      input.jobs.map((j) => ({ owner_id: input.ownerId, form_id: input.formId, submission_id: input.submissionId, provider: j.provider, state: j.state })),
      { onConflict: "submission_id,provider", ignoreDuplicates: true },
    )
    .select("id")
  if (error) {
    /* Before part 375 the widened kinds are refused: keep the old prepared rows at least. */
    console.warn("[forms] jobs not queued:", error.code || error.message)
    return []
  }
  return ((data || []) as { id: string }[]).map((r) => r.id)
}

interface JobRow {
  id: string
  owner_id: string
  form_id: string
  submission_id: string
  provider: JobProvider
  attempts: number
}
interface SubmissionRow {
  id: string
  form_id: string
  form_title: string
  form_revision: number
  answers: Answer[]
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  score: number
  status: string
  source_kind: string
  source_url: string | null
  source_block?: string | null
  submitted_at: string
}

async function claim(db: Db, job: { id: string; attempts: number }, now: number): Promise<boolean> {
  const { data, error } = await db
    .from("form_integration_jobs")
    .update({ locked_until: new Date(now + LEASE_MS).toISOString(), attempts: job.attempts + 1, updated_at: new Date(now).toISOString() })
    .eq("id", job.id)
    .eq("state", "ready")
    .eq("attempts", job.attempts)
    .or(`locked_until.is.null,locked_until.lt.${new Date(now).toISOString()}`)
    .select("id")
  return !error && Array.isArray(data) && data.length === 1
}

export interface RunSummary {
  taken: number
  delivered: number
  retried: number
  failed: number
  available: boolean
}

/** Runs due jobs (or these ids) until the deadline. */
export async function runFormJobs(db: Db, opts: { ids?: string[]; limit?: number; until?: number; now?: () => number } = {}): Promise<RunSummary> {
  const now = opts.now ?? Date.now
  const summary: RunSummary = { taken: 0, delivered: 0, retried: 0, failed: 0, available: true }
  let query = db.from("form_integration_jobs").select("id,owner_id,form_id,submission_id,provider,attempts").eq("state", "ready")
  query = opts.ids?.length ? query.in("id", opts.ids) : query.lte("next_attempt_at", new Date(now()).toISOString()).order("next_attempt_at", { ascending: true })
  const { data, error } = await query.limit(opts.limit ?? 50)
  if (error) {
    summary.available = false
    return summary
  }
  for (const job of (data || []) as JobRow[]) {
    if (opts.until && now() > opts.until) break
    if (!(await claim(db, job, now()))) continue
    summary.taken++
    const attempts = job.attempts + 1
    try {
      await perform(db, job)
      await db.from("form_integration_jobs").update({ state: "delivered", delivered_at: new Date(now()).toISOString(), locked_until: null, last_error: null, updated_at: new Date(now()).toISOString() }).eq("id", job.id)
      summary.delivered++
    } catch (e) {
      const reason = (e instanceof Error ? e.message : "Not delivered").slice(0, 500)
      const final = attempts >= MAX_ATTEMPTS || (e as { permanent?: boolean }).permanent === true
      await db
        .from("form_integration_jobs")
        .update(
          final
            ? { state: "failed", locked_until: null, last_error: reason, updated_at: new Date(now()).toISOString() }
            : { next_attempt_at: new Date(now() + retryDelayMs(attempts)).toISOString(), locked_until: null, last_error: reason, updated_at: new Date(now()).toISOString() },
        )
        .eq("id", job.id)
      if (final) summary.failed++
      else summary.retried++
    }
  }
  return summary
}

const permanent = (message: string) => Object.assign(new Error(message), { permanent: true })

async function perform(db: Db, job: JobRow): Promise<void> {
  const { data: sub, error } = await db
    .from("form_submissions")
    .select("id,form_id,form_title,form_revision,answers,contact_name,contact_email,contact_phone,score,status,source_kind,source_url,source_block,submitted_at")
    .eq("id", job.submission_id)
    .eq("owner_id", job.owner_id)
    .maybeSingle()
  if (error) throw new Error("The response could not be read.")
  if (!sub) throw permanent("The response was deleted.")
  const submission = sub as SubmissionRow
  const { data: booking } = await db.from("form_bookings").select("id,starts_at,ends_at,status,visitor_timezone").eq("submission_id", submission.id).maybeSingle()
  switch (job.provider) {
    case "owner_email":
      return ownerEmail(db, job, submission, booking)
    case "booking_confirmed":
    case "booking_declined":
    case "visitor_email":
      return visitorEmail(db, job, submission, booking)
    case "webhook":
      return webhook(db, job, submission, booking)
    default:
      throw permanent("This integration is not connected.")
  }
}

type Booking = { id: string; starts_at: string; ends_at: string; status: string; visitor_timezone: string | null } | null

function when(iso: string, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: tz || "UTC", timeZoneName: "short" }).format(new Date(iso))
  } catch {
    return new Date(iso).toUTCString()
  }
}

function answersHtml(answers: Answer[]): string {
  return answers
    .map(
      (a) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">${escapeHtml(a.label)}</td><td style="padding:6px 0;white-space:pre-wrap">${escapeHtml(a.type === "file" ? a.file?.name || "File" : answerText(a) || "No answer")}</td></tr>`,
    )
    .join("")
}

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f8f9fa;font-family:Inter,Arial,sans-serif;color:#1a1a2e"><div style="max-width:560px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:24px"><h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h1>${body}</div></div></body></html>`
}

async function ownerEmail(db: Db, job: JobRow, s: SubmissionRow, booking: Booking) {
  const identity = await resolveCreatorIdentity(db, job.owner_id).catch(() => null)
  const to = identity?.sellerEmail
  if (!to || !to.includes("@")) throw permanent("No email address on the account.")
  const link = `${platformOrigin()}/app/audience/leads?lead=${encodeURIComponent(s.id)}`
  const who = s.contact_name || s.contact_email || "Someone"
  const slot = booking ? `<p style="margin:0 0 12px"><strong>Requested time:</strong> ${escapeHtml(when(booking.starts_at, null))}${booking.status === "pending" ? " (waiting for your answer)" : ""}</p>` : ""
  const subject = booking ? `Booking request: ${s.form_title}`.slice(0, 200) : `New response: ${s.form_title}`.slice(0, 200)
  const html = shell(
    subject,
    `<p style="margin:0 0 12px">${escapeHtml(who)} sent ${escapeHtml(s.form_title)}.</p>${slot}<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">${answersHtml(s.answers)}</table><a href="${escapeHtml(link)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-size:14px">Open in Leads</a>`,
  )
  const text = `${who} sent ${s.form_title}.\n\n${s.answers.map((a) => `${a.label}: ${a.type === "file" ? a.file?.name || "File" : answerText(a)}`).join("\n")}\n\n${link}`
  const sent = await sendEmail({ to, subject, html, text, from: buildFromHeader("Storelib Forms"), replyTo: s.contact_email || undefined, transactional: true, headers: { "X-Storelib-Job": job.id } })
  if (!sent.success) throw new Error(sent.error || "The email was not sent.")
}

async function visitorEmail(db: Db, job: JobRow, s: SubmissionRow, booking: Booking) {
  if (!s.contact_email) throw permanent("The visitor left no email address.")
  if (!booking) throw permanent("There is no booking on this response.")
  const identity = await resolveCreatorIdentity(db, job.owner_id).catch(() => null)
  const confirmed = job.provider === "booking_confirmed"
  const at = when(booking.starts_at, booking.visitor_timezone)
  const subject = confirmed ? `Confirmed: ${s.form_title}, ${at}` : `Not available: ${s.form_title}`
  const body = confirmed
    ? `<p style="margin:0 0 12px">Your booking is confirmed for <strong>${escapeHtml(at)}</strong>.</p><p style="margin:0">Reply to this email if you need to change it.</p>`
    : `<p style="margin:0 0 12px">The time you asked for, ${escapeHtml(at)}, is not available.</p><p style="margin:0">Reply to this email or book another time.</p>`
  const sent = await sendEmail({
    to: s.contact_email,
    subject: subject.slice(0, 200),
    html: shell(subject, body),
    text: confirmed ? `Your booking is confirmed for ${at}.` : `The time you asked for, ${at}, is not available.`,
    from: buildFromHeader(identity?.fromName || "Storelib"),
    replyTo: identity?.replyTo || identity?.sellerEmail || undefined,
    transactional: true,
    keepBounce: true,
    headers: { "X-Storelib-Job": job.id },
  })
  if (!sent.success) throw new Error(sent.error || "The email was not sent.")
}

export function webhookBody(job: { id: string }, s: SubmissionRow, booking: Booking, event = "form.response"): string {
  return JSON.stringify({
    event,
    delivery_id: job.id,
    form: { id: s.form_id, title: s.form_title, revision: s.form_revision },
    response: {
      id: s.id,
      submitted_at: s.submitted_at,
      status: s.status,
      contact: { name: s.contact_name, email: s.contact_email, phone: s.contact_phone },
      score: s.score,
      answers: s.answers.map((a) => ({ id: a.field_id, label: a.label, type: a.type, value: a.type === "file" ? a.file?.name || null : a.value })),
      source: { kind: s.source_kind, url: s.source_url, block: s.source_block ?? null },
      booking: booking ? { id: booking.id, starts_at: booking.starts_at, ends_at: booking.ends_at, status: booking.status } : null,
    },
  })
}

/** POST to a public https address only, the socket's own lookup refusing private addresses. */
export function postSigned(url: string, body: string, headers: Record<string, string>, timeoutMs = 10_000): Promise<number> {
  const problem = webhookUrlProblem(url)
  if (problem) return Promise.reject(permanent(problem))
  return new Promise((resolve, reject) => {
    const req = https.request(
      new URL(url),
      {
        method: "POST",
        lookup: publicLookup as unknown as net.LookupFunction,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body).toString(), "user-agent": "Storelib-Webhooks/1.0", ...headers },
      },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      },
    )
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timed out")))
    req.on("error", reject)
    req.end(body)
  })
}

async function webhook(db: Db, job: JobRow, s: SubmissionRow, booking: Booking) {
  const { data: form } = await db.from("native_forms").select("integration_settings").eq("id", job.form_id).eq("owner_id", job.owner_id).maybeSingle()
  const settings = ((form?.integration_settings || {}) as IntegrationSettings).webhook
  if (!settings?.enabled || !settings.url) throw permanent("The webhook was turned off.")
  const secret = openSecret(settings.secret_sealed)
  if (!secret) throw permanent("The webhook secret could not be read. Create a new one.")
  const body = webhookBody(job, s, booking)
  const timestamp = Math.floor(Date.now() / 1000)
  const status = await postSigned(settings.url, body, {
    "x-storelib-timestamp": String(timestamp),
    "x-storelib-signature": signWebhook(secret, timestamp, body),
    "x-storelib-event": "form.response",
    "x-storelib-delivery": job.id,
  })
  if (status < 200 || status >= 300) throw new Error(`The webhook answered ${status}.`)
}

/**
 * The daily housekeeping the cron does after the jobs: responses past a
 * form's retention period are deleted with their files, and uploads that
 * no response took within a day are removed.
 */
export async function sweepForms(db: Db, opts: { until: number; now?: number }): Promise<{ expired: number; orphans: number }> {
  const now = opts.now ?? Date.now()
  let expired = 0,
    orphans = 0
  /* Unpaid booking holds past their time: cancelled, so the slot is free again (lib/forms/booking-payment.ts). */
  expired += await expireUnpaidBookings(db, new Date(now).toISOString()).catch(() => 0)
  const { data: forms, error } = await db.from("native_forms").select("id,owner_id,retention_days").not("retention_days", "is", null).limit(200)
  if (!error) {
    for (const f of (forms || []) as { id: string; owner_id: string; retention_days: number }[]) {
      if (Date.now() > opts.until) break
      const before = new Date(now - f.retention_days * 86_400_000).toISOString()
      const { data: old } = await db.from("form_submissions").select("id").eq("form_id", f.id).eq("owner_id", f.owner_id).lt("submitted_at", before).limit(200)
      const ids = ((old || []) as { id: string }[]).map((r) => r.id)
      if (!ids.length) continue
      const { data: files } = await db.from("form_uploads").select("id,path").in("submission_id", ids)
      if (files?.length) {
        await db.storage.from(FORM_UPLOAD_BUCKET).remove((files as { path: string }[]).map((x) => x.path)).catch(() => null)
        await db.from("form_uploads").delete().in("id", (files as { id: string }[]).map((x) => x.id))
      }
      const { error: delError } = await db.from("form_submissions").delete().in("id", ids).eq("owner_id", f.owner_id)
      if (!delError) expired += ids.length
    }
  }
  const { data: loose } = await db
    .from("form_uploads")
    .select("id,path")
    .is("submission_id", null)
    .lt("created_at", new Date(now - 86_400_000).toISOString())
    .limit(200)
  if (loose?.length && Date.now() < opts.until) {
    await db.storage.from(FORM_UPLOAD_BUCKET).remove((loose as { path: string }[]).map((x) => x.path)).catch(() => null)
    await db.from("form_uploads").delete().in("id", (loose as { id: string }[]).map((x) => x.id))
    orphans = loose.length
  }
  return { expired, orphans }
}
