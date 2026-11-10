import "server-only"

/**
 * ===========================================================================
 *  THE COURSE EMAILS, SENT
 * ===========================================================================
 * Run from the hourly creator email cron (app/api/cron/process-scheduled-
 * emails), after the creators' own automations, inside what is left of its
 * time. No cron of its own. When each email is due is decided by ./nudge.ts;
 * this reads the rows, claims each one, and sends.
 *
 * FROM THE CREATOR. Drawn in the layout every creator email uses
 * (lib/email-automation automationEmail) with the creator as their other
 * emails show them (the automation engine's own identity reader: name,
 * reply address, website brand, and the ONE picture of
 * lib/email-campaigns/sender.ts), so a course reminder looks like the
 * creator's welcome email and not like a Storelib notice.
 *
 * NEVER TWICE. Each row is claimed with a conditional update before it is
 * sent (the reminder on the last_nudge_at it was read with, the finished
 * email on completion_emailed_at still empty), so two runs at once send it
 * once. A send that fails puts the claim back, so the next hour tries again.
 *
 * WHO NEVER GETS ONE. A buyer who turned course emails off (the link in
 * every one, or the switch in the player), anybody the creator's list
 * says unsubscribed, bounced or complained, and the creator themselves.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { APP_URL, automationEmail, brandOfIdentity } from "@/lib/email-automation"
import { loadBrand } from "@/lib/email-campaigns/brand-server"
import { signLink } from "@/lib/email-campaigns/link-sign"
import { buildFromHeader, isSmtpConfigured, sendEmail } from "@/lib/mail"
import { supabaseStore } from "@/lib/automations/supabase-store"
import { maskEmail } from "@/lib/privacy/mask-email"
import { courseEmail, finishedDue, reminderDue, QUIET_DAYS, FINISHED_WITHIN_DAYS, STOP_PURPOSE, type EnrollmentState } from "./nudge"
import { lessonNumber, progressMap, resumeLesson, summarize } from "./progress"
import { outlineOf, readCourseTree, readProgress, readProduct, type EnrollmentRow } from "./server"

type Db = SupabaseClient

const BATCH = 25

export function stopUrlFor(enrollmentId: string): string | null {
  const sig = signLink(enrollmentId, STOP_PURPOSE)
  return sig ? `${APP_URL}/api/courses/reminders?e=${encodeURIComponent(enrollmentId)}&s=${sig}` : null
}

export interface CourseEmailSummary {
  available: boolean
  reminders: number
  finished: number
  skipped: number
  failed: number
}

function stateOf(e: EnrollmentRow): EnrollmentState {
  return {
    percent: e.percent,
    completedAt: e.completed_at,
    lastActivityAt: e.last_activity_at,
    lastNudgeAt: e.last_nudge_at ?? null,
    completionEmailedAt: e.completion_emailed_at ?? null,
    emailsOff: !!e.emails_off,
  }
}

export async function runCourseEmails(db: Db, deadline: number, now = new Date()): Promise<CourseEmailSummary> {
  const summary: CourseEmailSummary = { available: true, reminders: 0, finished: 0, skipped: 0, failed: 0 }
  if (!isSmtpConfigured()) return { ...summary, available: false }

  const quietSince = new Date(now.getTime() - QUIET_DAYS * 86_400_000).toISOString()
  const finishedSince = new Date(now.getTime() - FINISHED_WITHIN_DAYS * 86_400_000).toISOString()
  /* A community's own program (part 102) has no product and sends none of these: only rows with a product are read. */
  const [quiet, finished] = await Promise.all([
    db.from("course_enrollments").select("*").not("product_id", "is", null).is("completed_at", null).eq("emails_off", false).gt("percent", 0).lt("last_activity_at", quietSince).order("last_activity_at", { ascending: true }).limit(BATCH * 4),
    db.from("course_enrollments").select("*").not("product_id", "is", null).is("completion_emailed_at", null).eq("emails_off", false).gte("completed_at", finishedSince).limit(BATCH),
  ])
  if (quiet.error || finished.error) return { ...summary, available: false }

  const work: Array<{ kind: "reminder" | "finished"; row: EnrollmentRow }> = [
    ...((finished.data ?? []) as EnrollmentRow[]).filter((r) => finishedDue(stateOf(r), now)).map((row) => ({ kind: "finished" as const, row })),
    ...((quiet.data ?? []) as EnrollmentRow[]).filter((r) => reminderDue(stateOf(r), now)).slice(0, BATCH).map((row) => ({ kind: "reminder" as const, row })),
  ]
  const store = supabaseStore(db as never)

  for (const { kind, row } of work) {
    if (Date.now() > deadline) break
    const outcome = await sendOne(db, store, kind, row, now).catch(() => "failed" as const)
    if (outcome === "sent") summary[kind === "finished" ? "finished" : "reminders"]++
    else if (outcome === "skipped") summary.skipped++
    else summary.failed++
  }
  return summary
}

async function claim(db: Db, kind: "reminder" | "finished", row: EnrollmentRow, now: Date): Promise<boolean> {
  const at = now.toISOString()
  let q = db.from("course_enrollments").update(kind === "finished" ? { completion_emailed_at: at } : { last_nudge_at: at, nudges_sent: (row.nudges_sent ?? 0) + 1 }).eq("id", row.id)
  if (kind === "finished") q = q.is("completion_emailed_at", null)
  else q = row.last_nudge_at ? q.eq("last_nudge_at", row.last_nudge_at) : q.is("last_nudge_at", null)
  const { data, error } = await q.select("id")
  return !error && Array.isArray(data) && data.length === 1
}

async function unclaim(db: Db, kind: "reminder" | "finished", row: EnrollmentRow): Promise<void> {
  await db
    .from("course_enrollments")
    .update(kind === "finished" ? { completion_emailed_at: null } : { last_nudge_at: row.last_nudge_at ?? null, nudges_sent: row.nudges_sent ?? 0 })
    .eq("id", row.id)
}

async function sendOne(db: Db, store: ReturnType<typeof supabaseStore>, kind: "reminder" | "finished", row: EnrollmentRow, now: Date): Promise<"sent" | "skipped" | "failed"> {
  const product = await readProduct(db, row.product_id)
  if (!product?.creator_id) return "skipped"

  /* The buyer's address and name, and never the creator's own course. */
  const [{ data: profile }, { data: creator }] = await Promise.all([
    /* Whole row: first_name is not in every database, and naming a missing column fails the read. */
    db.from("profiles").select("*").eq("id", row.buyer_id).maybeSingle(),
    db.from("creators").select("user_id").eq("id", product.creator_id).maybeSingle(),
  ])
  const email = String((profile as { email?: string | null } | null)?.email ?? "").trim().toLowerCase()
  if (!email || !email.includes("@")) return "skipped"
  if ((creator as { user_id?: string | null } | null)?.user_id === row.buyer_id) return "skipped"

  const standing = await store.standing(product.creator_id, email)
  if (standing.suppressed) return "skipped"

  /* Counted again from the lessons, now: a lesson added since would change "next up". */
  const outline = outlineOf(await readCourseTree(db, row.product_id))
  const progress = progressMap(await readProgress(db, row.buyer_id, outline.flatMap((m) => m.lessons.map((l) => l.id))))
  const numbers = summarize(outline, progress)
  if (numbers.total === 0) return "skipped"
  if (kind === "reminder" && numbers.status === "completed") return "skipped"
  if (kind === "finished" && numbers.status !== "completed") return "skipped"
  const next = kind === "reminder" ? resumeLesson(outline, progress, row.last_lesson_id) : null

  const stopUrl = stopUrlFor(row.id)
  if (!stopUrl) return "skipped"

  if (!(await claim(db, kind, row, now))) return "skipped"

  const identity = await store.identity(product.creator_id)
  const address = await loadBrand(db as never, product.creator_id).then((b) => b.address, () => null)
  const first = ((profile as { first_name?: string | null; display_name?: string | null } | null)?.first_name || (profile as { display_name?: string | null } | null)?.display_name || "").trim().split(/\s+/)[0] || null
  const continueUrl = `${APP_URL}/account/library/courses/${row.product_id}${next ? `?lesson=${next.id}` : ""}`
  const content = courseEmail({
    kind,
    courseTitle: product.title || "your course",
    creatorName: identity.fromName,
    buyerFirstName: first,
    percent: numbers.percent,
    completed: numbers.completed,
    total: numbers.total,
    next: next ? { number: lessonNumber(outline, next.id), title: next.title } : null,
    continueUrl,
    stopUrl,
    storeUrl: identity.storeUrl && identity.storeUrl !== APP_URL ? identity.storeUrl : null,
  })
  const brand = brandOfIdentity(identity)
  const mail = automationEmail({
    body: content.body,
    subject: content.subject,
    previewText: content.previewText,
    fromName: identity.fromName,
    unsubscribeToken: standing.unsubscribeToken,
    brand: address ? { ...brand, address } : brand,
    avatarUrl: identity.avatarUrl ?? null,
    because: "customer",
  })
  /* One click in the mail client: the creator's list when they are on it, otherwise this course's emails. */
  const headers = mail.headers ?? { "List-Unsubscribe": `<${stopUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }

  const sent = await sendEmail({ from: buildFromHeader(identity.fromName), store: product.creator_id, to: email, replyTo: identity.replyTo, subject: content.subject, html: mail.html, text: mail.text, headers })
  if (!sent.success) {
    console.error(`[courses/emails] ${kind} to ${maskEmail(email)} failed`)
    await unclaim(db, kind, row)
    return "failed"
  }
  return "sent"
}
