/**
 * ===========================================================================
 *  WHEN A COURSE EMAIL GOES, AND WHAT IT SAYS
 * ===========================================================================
 * Two emails, both from the creator (their name, their one picture, their
 * colour, lib/email-campaigns/sender.ts), about one course:
 *
 *   a reminder    a course started and not finished, quiet for three days:
 *                 "You're 40% through <course>. Next up is Lesson 5." Once
 *                 per quiet spell: after it, nothing more until they come
 *                 back and go quiet again, and never two within a week.
 *   finished      once, when the last lesson is done, within two weeks of
 *                 it (so a course finished before this existed is not
 *                 congratulated months late).
 *
 * Neither goes when the buyer turned course emails off, unsubscribed from
 * the creator, or the course is finished (for the reminder). Pure: the
 * runner (./emails.ts) reads the rows and sends.
 */

export const QUIET_DAYS = 3
export const REMINDER_GAP_DAYS = 7
export const FINISHED_WITHIN_DAYS = 14

const DAY = 24 * 60 * 60 * 1000

/** What the stop link in each email signs: one enrollment, and nothing else it could be reused for. */
export const STOP_PURPOSE = "course-emails-stop"

export interface EnrollmentState {
  percent: number
  completedAt: string | null
  lastActivityAt: string | null
  lastNudgeAt: string | null
  completionEmailedAt: string | null
  emailsOff: boolean
}

function t(iso: string | null | undefined): number | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : null
}

export function reminderDue(e: EnrollmentState, now: Date): boolean {
  if (e.emailsOff || e.completedAt) return false
  if (!(e.percent > 0 && e.percent < 100)) return false
  const active = t(e.lastActivityAt)
  if (active === null || now.getTime() - active < QUIET_DAYS * DAY) return false
  const nudged = t(e.lastNudgeAt)
  if (nudged === null) return true
  /* One per quiet spell: they have been back since the last one, and a week has passed. */
  return nudged < active && now.getTime() - nudged >= REMINDER_GAP_DAYS * DAY
}

export function finishedDue(e: EnrollmentState, now: Date): boolean {
  if (e.emailsOff || e.completionEmailedAt) return false
  const done = t(e.completedAt)
  return done !== null && now.getTime() - done <= FINISHED_WITHIN_DAYS * DAY
}

export interface CourseEmailInput {
  kind: "reminder" | "finished"
  courseTitle: string
  creatorName: string
  buyerFirstName: string | null
  percent: number
  completed: number
  total: number
  next: { number: number; title: string } | null
  continueUrl: string
  /** Where "stop these emails" goes: one course, not the creator's whole list. */
  stopUrl: string
  /** The creator's page, for "more from" in the finished email. */
  storeUrl: string | null
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}

/** One line, for a subject: no line breaks, not too long. */
function line(s: string, max = 120): string {
  const flat = s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

/**
 * The email's subject, preview line and body, as rich text the creator email
 * layout draws (lib/email-automation automationEmail): short paragraphs and
 * one button, which the layout paints in the creator's own colour.
 */
export function courseEmail(input: CourseEmailInput): { subject: string; previewText: string; body: string } {
  const course = line(input.courseTitle, 90)
  const hi = input.buyerFirstName ? `<p>Hi ${esc(line(input.buyerFirstName, 40))},</p>` : ""
  const button = (label: string) =>
    `<p><a href="${esc(input.continueUrl)}" style="display:inline-block;padding:12px 22px;background-color:#1a1a2e;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${esc(label)}</a></p>`
  const stop = `<p style="font-size:13px">Rather not get these? <a href="${esc(input.stopUrl)}">Stop emails about this course</a>.</p>`

  if (input.kind === "finished") {
    const more = input.storeUrl ? ` <a href="${esc(input.storeUrl)}">See what else ${esc(line(input.creatorName, 60))} has made</a>.` : ""
    return {
      subject: line(`You finished ${course}`),
      previewText: line(`All ${input.total} lessons done. They stay in your library.`),
      body: [
        hi,
        `<p>You finished all ${input.total} ${input.total === 1 ? "lesson" : "lessons"} of <strong>${esc(course)}</strong>. Thank you for taking it.</p>`,
        `<p>The lessons stay in your library, so you can go back to any of them.${more}</p>`,
        button("Open the course"),
        `<p>${esc(line(input.creatorName, 60))}</p>`,
        stop,
      ].join(""),
    }
  }

  const next = input.next ? `Next up is Lesson ${input.next.number}: ${esc(line(input.next.title, 90))}.` : ""
  return {
    subject: line(`You're ${input.percent}% through ${course}`),
    previewText: line(input.next ? `Next up: Lesson ${input.next.number}, ${input.next.title}` : `${input.completed} of ${input.total} lessons done`),
    body: [
      hi,
      `<p>You're ${input.percent}% through <strong>${esc(course)}</strong>, ${input.completed} of ${input.total} lessons done. ${next}</p>`,
      `<p>It is right where you left it.</p>`,
      button(input.next ? `Continue: Lesson ${input.next.number}` : "Continue the course"),
      `<p>${esc(line(input.creatorName, 60))}</p>`,
      stop,
    ].join(""),
  }
}
