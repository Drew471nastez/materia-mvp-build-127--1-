/**
 * ===========================================================================
 *  SCHEDULED POSTS AND DRAFTS (round 32)
 * ===========================================================================
 * A post the people who run a community write now and put up later, or keep
 * as a draft (run-now part 194). Pure and browser safe: the editor and the
 * server check with the same rules.
 *
 *   draft       kept, not going anywhere; may be half written
 *   scheduled   goes up at publish_at (the community job run, every five
 *               minutes, so within five minutes of the time)
 *   publishing  being put up right now
 *   published   up; post_id is the post it became
 *   failed      could not go up (the space was removed, the author can no
 *               longer post there, the words were refused); the reason is
 *               kept and it can be edited and scheduled again
 */
import { LENGTHS } from "./limits"
import { instantAt, wallClockIn } from "../i18n/format"

export const SCHEDULED_STATUSES = ["draft", "scheduled", "publishing", "published", "failed"] as const
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number]

/** Statuses that can still be edited, rescheduled, published now or deleted. */
export const EDITABLE: readonly ScheduledStatus[] = ["draft", "scheduled", "failed"]

/** The earliest a post can be scheduled: a minute from now (anything sooner is Publish now). */
export const SCHEDULE_MIN_AHEAD_MS = 60_000
/** The latest: a year ahead. */
export const SCHEDULE_MAX_AHEAD_MS = 366 * 86_400_000

export interface ScheduledInput {
  spaceId: string | null
  title: string
  body: string
  /** Null for a draft. */
  publishAt: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Checked<T> = { ok: true; value: T } | { ok: false; error: string; field?: "space" | "title" | "body" | "when" }

/**
 * A scheduled post or a draft as the editor sent it. A draft may be half
 * written; a scheduled post needs what any post needs (a space, a title and
 * words) and a time between a minute and a year from now.
 */
export function checkScheduledInput(raw: unknown, now: number = Date.now()): Checked<ScheduledInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const spaceId = typeof r.spaceId === "string" && UUID.test(r.spaceId) ? r.spaceId : null
  const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim() : ""
  const body = typeof r.body === "string" ? r.body.replace(/\r\n?/g, "\n").trim() : ""
  if (title.length > LENGTHS.postTitle.max) return { ok: false, error: `A title is up to ${LENGTHS.postTitle.max} characters.`, field: "title" }
  if (body.length > LENGTHS.postBody.max) return { ok: false, error: "Keep the post under 20,000 characters.", field: "body" }
  const draft = r.publishAt === null || r.publishAt === undefined || r.publishAt === ""
  if (draft) {
    if (!title && !body) return { ok: false, error: "Write something first.", field: "body" }
    return { ok: true, value: { spaceId, title, body, publishAt: null } }
  }
  if (!spaceId) return { ok: false, error: "Pick a space.", field: "space" }
  if (!title) return { ok: false, error: "Give the post a title.", field: "title" }
  if (!body) return { ok: false, error: "Write something in the post.", field: "body" }
  const at = typeof r.publishAt === "string" && r.publishAt.length <= 40 ? Date.parse(r.publishAt) : NaN
  if (!Number.isFinite(at)) return { ok: false, error: "Pick a day and a time.", field: "when" }
  if (at < now + SCHEDULE_MIN_AHEAD_MS) return { ok: false, error: "Pick a time at least a minute from now, or publish it now.", field: "when" }
  if (at > now + SCHEDULE_MAX_AHEAD_MS) return { ok: false, error: "Pick a time within a year.", field: "when" }
  return { ok: true, value: { spaceId, title, body, publishAt: new Date(at).toISOString() } }
}

/** What the composer sends for a draft (publishAt null) or a scheduled post (round 26, creator/composer-schedule.tsx). */
export function scheduleBody(fields: { spaceId: string | null; title: string; body: string }, publishAt: string | null): ScheduledInput {
  return { spaceId: fields.spaceId, title: fields.title.trim(), body: fields.body.trim(), publishAt }
}

export interface ScheduledPostView {
  id: string
  status: ScheduledStatus
  spaceId: string | null
  spaceName: string | null
  title: string
  body: string
  publishAt: string | null
  publishedAt: string | null
  postId: string | null
  error: string | null
  authorId: string
  authorName: string
  /** The signed in person may change or delete it (its author, or the owner and admins). */
  mine: boolean
  updatedAt: string
}

/**
 * What the Scheduled and drafts panel draws (round 33): its rows, and the spaces the signed in person may post in. The
 * Posts page reads it on the server beside the posts (lib/communities/server/admin-sections.ts feedReads), so the panel is
 * drawn with the page; the route answers the same shape for a read again.
 */
export interface ScheduledPanelData {
  /** False before run-now part 194. */
  ready: boolean
  rows: ScheduledPostView[]
  spaces: { id: string; name: string; kind: string; icon?: string | null }[]
}

/*
  THE DAY AND THE TIME ARE THE CREATOR'S (round 26). The form read and wrote them in the browser's own zone, while every
  other date in the dashboard is in the zone chosen in Settings (lib/i18n/format.ts appTimeZone): a creator in Bucharest
  on a laptop left on New York time scheduled 9:00 and got 16:00. Given a zone, the inputs are that zone's wall clock;
  without one they stay the browser's, as before.
*/

/** The day and time inputs for an ISO time: ["2026-10-15", "09:30"], in `zone` when given, else the browser's zone. */
export function localParts(iso: string | null, fallback: number = Date.now() + 3_600_000, zone?: string): [string, string] {
  const t = iso ? Date.parse(iso) : fallback
  const at = Number.isFinite(t) ? t : fallback
  const p = (n: number) => String(n).padStart(2, "0")
  if (zone) {
    const w = wallClockIn(at, zone)
    return [`${w.y}-${p(w.m + 1)}-${p(w.d)}`, `${p(w.h)}:${p(w.min)}`]
  }
  const d = new Date(at)
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`]
}

/** The ISO time for a day and time (in `zone` when given, else the browser's), or null when either is missing or not a time. */
export function fromLocalParts(day: string, time: string, zone?: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null
  if (zone) {
    const [y, m, d] = day.split("-").map(Number)
    const [h, min] = time.split(":").map(Number)
    if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null
    const t = instantAt(y, m - 1, d, h, min, zone).getTime()
    return Number.isFinite(t) ? new Date(t).toISOString() : null
  }
  const t = new Date(`${day}T${time}:00`).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** When Schedule is first turned on: an hour from now, on the next quarter hour of the zone's clock. */
export function suggestedPublishAt(now: number = Date.now(), zone?: string): string {
  const [day, time] = localParts(null, now + 3_600_000, zone)
  const [h, min] = time.split(":").map(Number)
  const up = Math.ceil(min / 15) * 15
  const base = fromLocalParts(day, `${String(h).padStart(2, "0")}:00`, zone)
  const at = base ? Date.parse(base) + up * 60_000 : now + 3_600_000
  return new Date(at).toISOString()
}
