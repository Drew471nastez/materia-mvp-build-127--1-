/**
 * ===========================================================================
 *  SCHEDULED POSTS AND DRAFTS (round 32)
 * ===========================================================================
 * A post the people who run a community write now and put up later, or keep
 * as a draft (run-now part 188). Pure and browser safe: the editor and the
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

/** The local day and time inputs for an ISO time, in the browser's zone: ["2026-10-15", "09:30"]. */
export function localParts(iso: string | null, fallback: number = Date.now() + 3_600_000): [string, string] {
  const t = iso ? Date.parse(iso) : fallback
  const d = new Date(Number.isFinite(t) ? t : fallback)
  const p = (n: number) => String(n).padStart(2, "0")
  return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`]
}

/** The ISO time for a local day and time, or null when either is missing or not a time. */
export function fromLocalParts(day: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(time)) return null
  const t = new Date(`${day}T${time}:00`).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
