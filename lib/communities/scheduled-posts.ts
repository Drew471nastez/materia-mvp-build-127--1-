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
import { LENGTHS, MAX_MEDIA_PER_POST, POLL_OPTIONS_MAX, POLL_OPTIONS_MIN } from "./limits"
import { instantAt, wallClockIn } from "../i18n/format"
import type { PostMedia } from "./types"

export const SCHEDULED_STATUSES = ["draft", "scheduled", "publishing", "published", "failed"] as const
export type ScheduledStatus = (typeof SCHEDULED_STATUSES)[number]

/** Statuses that can still be edited, rescheduled, published now or deleted. */
export const EDITABLE: readonly ScheduledStatus[] = ["draft", "scheduled", "failed"]

/** The earliest a post can be scheduled: a minute from now (anything sooner is Publish now). */
export const SCHEDULE_MIN_AHEAD_MS = 60_000
/** The latest: a year ahead. */
export const SCHEDULE_MAX_AHEAD_MS = 366 * 86_400_000

/*
  ROUND 27 (B1): WHAT A POST CARRIES GOES UP WITH IT (run-now part 222). The owner: "YES, support scheduling posts with
  pictures, video, files, GIFs, link cards and polls." Part 194 kept a title, the words and a space, and the writer said
  those could only be posted now. Now a scheduled post or a draft keeps `media`, the same list the composer sends for a post
  now (pictures, a video, files, GIFs, videos by link, one link card; lib/communities/types.ts PostMedia), and `poll`. A poll's
  end is kept as how long it runs (1, 3 or 7 days, the composer's choices), not as a date: it starts when the post goes up,
  so a poll scheduled for next week still runs its whole three days. The server checks the media with the post route's own
  rules (feed.ts checkMedia and the uploader's files) when it is saved, and again, as its author, when it goes up.
*/

/** A poll in a scheduled post or a draft: its end as days from when it goes up (null: no end). */
export interface ScheduledPoll {
  question: string
  options: string[]
  multiple: boolean
  closesInDays: number | null
}

/** The poll's ends the composer offers (composer.tsx POLL_ENDS), in days. */
export const POLL_RUNS = [1, 3, 7] as const

export interface ScheduledInput {
  spaceId: string | null
  title: string
  body: string
  /** Null for a draft. */
  publishAt: string | null
  /** What the post carries, as the composer sends it for a post now; checked on the server (feed.ts checkMedia). */
  media: PostMedia[]
  poll: ScheduledPoll | null
}

/**
 * A poll as the editor sent it. A draft keeps a half written one (`whole` false: an empty question or one choice is kept as
 * it is); a scheduled post needs what a post needs: a question and two different choices. Null when there is none, or
 * `false` with the reason when it cannot be kept.
 */
export function checkScheduledPoll(raw: unknown, whole: boolean): { ok: true; value: ScheduledPoll | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "That poll could not be kept." }
  const r = raw as Record<string, unknown>
  const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
  const question = clean(r.question, LENGTHS.pollQuestion.max)
  const seen = new Set<string>()
  const options: string[] = []
  for (const o of Array.isArray(r.options) ? r.options.slice(0, POLL_OPTIONS_MAX * 2) : []) {
    const label = clean(o, LENGTHS.pollOption.max)
    if (whole && (!label || seen.has(label.toLowerCase()))) continue
    seen.add(label.toLowerCase())
    options.push(label)
  }
  if (options.length > POLL_OPTIONS_MAX) return { ok: false, error: `Up to ${POLL_OPTIONS_MAX} choices.` }
  if (whole && !question) return { ok: false, error: "Ask a question for the poll." }
  if (whole && options.length < POLL_OPTIONS_MIN) return { ok: false, error: "Give the poll at least two choices." }
  const days = Number(r.closesInDays)
  const closesInDays = (POLL_RUNS as readonly number[]).includes(days) ? days : null
  return { ok: true, value: { question, options, multiple: r.multiple === true, closesInDays } }
}

/** The poll createPost takes, for a post going up now: its end that many days from `now`. */
export function pollToPost(poll: ScheduledPoll, now: number = Date.now()): { question: string; options: string[]; multiple: boolean; closesAt: string | null } {
  return { question: poll.question, options: poll.options, multiple: poll.multiple, closesAt: poll.closesInDays ? new Date(now + poll.closesInDays * 86_400_000).toISOString() : null }
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
  /* The media list's shape only (each item is checked on the server, as a post's are); the poll as above. */
  const media = (Array.isArray(r.media) ? r.media : []).filter((m): m is PostMedia => !!m && typeof m === "object" && typeof (m as { type?: unknown }).type === "string")
  if (media.length > MAX_MEDIA_PER_POST + 1) return { ok: false, error: `Up to ${MAX_MEDIA_PER_POST} pictures and files in one post.` }
  const poll = checkScheduledPoll(r.poll, !draft)
  if (poll.ok === false) return { ok: false, error: poll.error }
  if (draft) {
    if (!title && !body && !media.length && !poll.value) return { ok: false, error: "Write something first.", field: "body" }
    return { ok: true, value: { spaceId, title, body, publishAt: null, media, poll: poll.value } }
  }
  if (!spaceId) return { ok: false, error: "Pick a space.", field: "space" }
  if (!title) return { ok: false, error: "Give the post a title.", field: "title" }
  if (!body) return { ok: false, error: "Write something in the post.", field: "body" }
  const at = typeof r.publishAt === "string" && r.publishAt.length <= 40 ? Date.parse(r.publishAt) : NaN
  if (!Number.isFinite(at)) return { ok: false, error: "Pick a day and a time.", field: "when" }
  if (at < now + SCHEDULE_MIN_AHEAD_MS) return { ok: false, error: "Pick a time at least a minute from now, or publish it now.", field: "when" }
  if (at > now + SCHEDULE_MAX_AHEAD_MS) return { ok: false, error: "Pick a time within a year.", field: "when" }
  return { ok: true, value: { spaceId, title, body, publishAt: new Date(at).toISOString(), media, poll: poll.value } }
}

/** What the composer sends for a draft (publishAt null) or a scheduled post (round 26, creator/composer-schedule.tsx), with what it carries (round 27). */
export function scheduleBody(fields: { spaceId: string | null; title: string; body: string; media?: PostMedia[]; poll?: ScheduledPoll | null }, publishAt: string | null): ScheduledInput {
  return { spaceId: fields.spaceId, title: fields.title.trim(), body: fields.body.trim(), publishAt, media: fields.media ?? [], poll: fields.poll ?? null }
}

/** The picture a row of the list shows for what a post carries: its first picture, GIF, video still or video's picture. */
export function scheduledThumb(media: PostMedia[] | null | undefined): string | null {
  for (const m of media ?? []) {
    if (m.type === "image") return m.url
    if (m.type === "gif") return m.still
    if (m.type === "video" && m.poster) return m.poster
    if (m.type === "embed" && m.thumb) return m.thumb
  }
  return null
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
  /** What it carries (round 27, part 222): empty before part 222. */
  media: PostMedia[]
  poll: ScheduledPoll | null
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
  /** False before run-now part 222: scheduled posts and drafts keep only their words (round 27). */
  media?: boolean
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
