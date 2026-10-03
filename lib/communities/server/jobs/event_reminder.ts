import "server-only"

/**
 * EVENT_REMINDER: tells everyone going to an event that it starts tomorrow
 * (window "24h") or in an hour (window "1h"): a row in their community
 * inbox, and an email for members who keep event emails on.
 * Payload { eventId, window, startsAt, cursor? }, queued by
 * lib/communities/server/events.ts ensureReminders once per start time.
 *
 *   ONCE PER PERSON. The inbox row has a dedupe key per event, window, start
 *   and member; the email goes only to members whose row this run wrote, so
 *   a job run again (a retry, a second cron) never sends a second email.
 *   A member whose notifications are off gets neither.
 *   MOVED EVENTS. A job for a start time the event no longer has does
 *   nothing except queue the reminders for the new time.
 *   TOO LATE. A window that has passed sends nothing (no "tomorrow" an hour
 *   before), and nothing goes after the start.
 *   BIG EVENTS. 200 people a page by user id; out of time, it carries on
 *   from where it was in the next run. When every page is done the event's
 *   reminder_24h_at or reminder_1h_at says so.
 */
import { wantsNotification } from "../../permissions"
import { eventTime } from "../../format"
import { EVENT_COLUMNS, type EventRow, type JobRow, type NotifyLevel } from "../../types"
import { siteUrl } from "@/lib/memberships/server"
import { sendEmail } from "@/lib/mail"
import { nowIso, reasonOf, type Db } from "../db"
import { REMINDER_WINDOWS, bulkNotify, ensureReminders, type ReminderWindow } from "../events"
import type { JobContext, JobOutcome } from "./index"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const REMINDER_PAGE = 200

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export function reminderTitle(window: ReminderWindow, title: string): string {
  return (window === "24h" ? `Tomorrow: ${title}` : `Starting in 1 hour: ${title}`).slice(0, 200)
}

/** Whether this window's reminder was already sent for this start time. */
export function alreadySent(e: Pick<EventRow, "reminder_24h_at" | "reminder_1h_at">, window: ReminderWindow, start: number): boolean {
  const at = window === "24h" ? e.reminder_24h_at : e.reminder_1h_at
  if (!at) return false
  /* Sent for an earlier start of a moved event does not count. */
  return Date.parse(at) >= start - REMINDER_WINDOWS[window] - 2 * 60 * 60_000
}

export function reminderEmail(p: { window: ReminderWindow; title: string; when: string; community: string; url: string }): { subject: string; html: string; text: string } {
  const lead = p.window === "24h" ? "is tomorrow" : "starts in an hour"
  const subject = reminderTitle(p.window, p.title)
  const text = `${p.title} ${lead}.\n${p.when}\n\nOpen the event: ${p.url}\n\nYou are getting this because you said you are going, in ${p.community} on Storelib.`
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#1a1a2e;font-size:15px;line-height:1.55;max-width:520px">
<p style="margin:0 0 4px;font-size:13px;color:#6b7280">${esc(p.community)}</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:700">${esc(p.title)} ${lead}</p>
<p style="margin:0 0 20px;color:#4b5563">${esc(p.when)}</p>
<p style="margin:0 0 24px"><a href="${esc(p.url)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:10px">Open the event</a></p>
<p style="margin:0;font-size:12px;color:#9ca3af">You are getting this because you said you are going. Turn event emails off in the community's notification settings.</p>
</div>`
  return { subject, html, text }
}

export async function eventReminder(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  const eventId = typeof job.payload?.eventId === "string" ? job.payload.eventId : ""
  const window = job.payload?.window === "24h" || job.payload?.window === "1h" ? (job.payload.window as ReminderWindow) : null
  if (!UUID.test(eventId) || !window) throw new Error("event_reminder needs payload.eventId and payload.window")
  const cursor = typeof job.payload?.cursor === "string" && UUID.test(job.payload.cursor) ? job.payload.cursor : null

  const { data: row, error } = await db.from("community_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle()
  if (error) throw new Error(`event read: ${reasonOf(error)}`)
  const e = row as EventRow | null
  if (!e || e.status === "cancelled") return
  const start = Date.parse(e.starts_at)
  if (new Date(start).toISOString() !== String(job.payload?.startsAt ?? "")) {
    await ensureReminders(db, e, ctx.now)
    return
  }
  if (ctx.now >= start) return
  if (window === "24h" && ctx.now >= start - REMINDER_WINDOWS["1h"]) return
  if (!cursor && alreadySent(e, window, start)) return

  const { data: community } = await db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", e.community_id).maybeSingle()
  const c = community as { id: string; slug: string; name: string; status: string; suspended_at: string | null; deleted_at: string | null } | null
  if (!c || c.deleted_at || c.suspended_at || c.status === "suspended") return

  const path = `/community/${c.slug}/events/${e.id}`
  const when = eventTime(e.starts_at, e.ends_at, { timeZone: e.timezone || undefined })
  let after = cursor
  for (;;) {
    let q = db.from("community_event_rsvps").select("user_id").eq("event_id", e.id).eq("status", "going").order("user_id", { ascending: true }).limit(REMINDER_PAGE)
    if (after) q = q.gt("user_id", after)
    const { data: rsvps, error: rsvpError } = await q
    if (rsvpError) throw new Error(`rsvps read: ${reasonOf(rsvpError)}`)
    const ids = ((rsvps as { user_id: string }[] | null) ?? []).map((r) => r.user_id)
    if (ids.length === 0) break

    const { data: members } = await db.from("community_members").select("user_id, status, notify_level, email_events").eq("community_id", c.id).in("user_id", ids)
    const wanted = ((members as { user_id: string; status: string; notify_level: NotifyLevel; email_events: boolean }[] | null) ?? []).filter(
      (m) => m.status === "active" && wantsNotification(m.notify_level, "event_reminder"),
    )
    const fresh = await bulkNotify(
      db,
      c.id,
      "event_reminder",
      { type: "event", id: e.id },
      wanted.map((m) => ({ userId: m.user_id, title: reminderTitle(window, e.title), body: when, url: path, dedupeKey: `event_reminder:${e.id}:${window}:${e.starts_at}:${m.user_id}` })),
    )
    const emailTo = wanted.filter((m) => fresh.has(m.user_id) && m.email_events !== false).map((m) => m.user_id)
    if (emailTo.length) {
      const { data: profiles } = await db.from("profiles").select("id, email").in("id", emailTo)
      const mail = reminderEmail({ window, title: e.title, when, community: c.name, url: siteUrl(path) })
      for (const p of (profiles as { id: string; email: string | null }[] | null) ?? []) {
        if (!p.email) continue
        try {
          await sendEmail({ to: p.email, subject: mail.subject, html: mail.html, text: mail.text, tags: [{ name: "community-event-reminder", value: "1" }] })
        } catch (err) {
          console.error(`[communities] reminder email ${e.id}: ${reasonOf(err)}`)
        }
      }
    }
    after = ids[ids.length - 1]
    if (ids.length < REMINDER_PAGE) break
    if (Date.now() >= ctx.deadline - 8_000) return { again: { payload: { ...job.payload, cursor: after } } }
  }
  await db.from("community_events").update(window === "24h" ? { reminder_24h_at: nowIso(ctx.now) } : { reminder_1h_at: nowIso(ctx.now) }).eq("id", e.id)
}
