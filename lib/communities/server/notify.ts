import "server-only"

/**
 * ===========================================================================
 *  A MEMBER'S INBOX, AND THE JOBS THAT FILL IT
 * ===========================================================================
 * notifyMember writes one row in community_notifications, the member's in app
 * inbox (the bell reads its own rows through realtime). It respects what the
 * member asked to hear (notify_level, wantsNotification in permissions.ts),
 * never tells somebody about their own action, and is once per dedupe key:
 * the same reply notified twice is one row.
 *
 * Work too big for one request (telling every member about an announcement,
 * event reminders, recounts, the daily rollup) is a row in community_jobs,
 * queued once per idempotency key and run by /api/cron/community every five
 * minutes through runCommunityJobs. A worker claims jobs with a lease
 * (public.community_claim_jobs, FOR UPDATE SKIP LOCKED), so two runs at once
 * never take the same job; a run that dies leaves its lease to run out and
 * the job is claimed again; a job that fails is retried later, further apart
 * each time, and given up after five attempts.
 *
 * The handler for each kind lives in lib/communities/server/jobs/<kind>.ts
 * and is listed in jobs/index.ts.
 *
 * LIKES ARE GROUPED. A like does not add a row per person: the first like
 * on a post in a window (LIKE_WINDOW_MS, counted from the epoch so every
 * server agrees) writes "Mara liked your post", and each one after it in
 * the same window rewrites that row as "7 people liked your post", marks it
 * unread again and moves it to the top. The count is the post's likes from
 * other people in the window, read once (community_reactions has the
 * time). So a post that takes off is one row in the bell, not two hundred.
 *
 * NEW POSTS AND REPORTS go through the queue too: queueNewPost tells
 * members on their phones (jobs/fanout_announcement.ts, reason "post": the
 * owner's and admins' posts reach the default level, a member's post only
 * those at Everything), and queueReportDigest plans the one email a day each
 * moderator gets about new reports (jobs/report_digest.ts).
 *
 * SO DO PROGRAMS, EVENT CHANGES AND THE WEEKLY DIGEST: notifyProgramPublished
 * (Learn calls it), notifyEventChanged (the event editor calls it) and
 * scheduleWeeklyDigest (account settings), each once per key.
 */
import { wantsNotification } from "../permissions"
import { JOB_COLUMNS, type JobKind, type JobRow, type NotificationKind, type NotifyLevel } from "../types"
import { missing, nowIso, reasonOf, type Db } from "./db"
import type { JobOutcome } from "./jobs/index"
import { pushCommunityRow, pushSoon } from "@/lib/notifications/push-bridge"
import { reportDigestKey, reportDigestPlan } from "@/lib/notifications/report-digest"

export interface NotifyInput {
  userId: string
  communityId: string
  kind: NotificationKind
  actorId?: string | null
  target?: { type: string; id: string } | null
  title: string
  body?: string | null
  url: string
  /** Once per key: "reply:<commentId>:<userId>". A like is grouped instead (likeKey). */
  dedupeKey: string
  /** For tests: the time a like is grouped by. */
  now?: number
}

/** One bell row per post (or comment, or message) per window of this long, for likes. */
export const LIKE_WINDOW_MS = 6 * 60 * 60_000

/** The row a like joins: one per person, liked thing and window. */
export function likeKey(userId: string, target: { type: string; id: string }, now: number): string {
  return `likes:${target.type}:${target.id}:${userId}:${Math.floor(now / LIKE_WINDOW_MS)}`
}

/** "Mara Pop liked your post", then "7 people liked your post". */
export function likeTitle(count: number, actorName: string, noun: string): string {
  return count <= 1 ? `${actorName || "A member"} liked your ${noun}` : `${count} people liked your ${noun}`
}

/** The liked thing's name as a title says it, from the title reactions.ts wrote: "post", "comment", "message". */
function likedNoun(title: string, type: string): string {
  const m = /liked your (\w+)/.exec(title)
  return m ? m[1] : type
}

/** The actor's name as reactions.ts wrote it at the front of the title. */
function likedBy(title: string): string {
  const at = title.indexOf(" liked your ")
  return at > 0 ? title.slice(0, at) : ""
}

export type NotifyOutcome = "sent" | "duplicate" | "skipped" | "unavailable"

export async function notifyMember(db: Db, n: NotifyInput): Promise<NotifyOutcome> {
  if (n.actorId && n.actorId === n.userId) return "skipped"
  try {
    const { data: member, error: memberError } = await db
      .from("community_members")
      .select("status, notify_level")
      .eq("community_id", n.communityId)
      .eq("user_id", n.userId)
      .maybeSingle()
    if (memberError) {
      if (missing(memberError)) return "unavailable"
      throw memberError
    }
    if (!member) return "skipped"
    /* News about their own membership reaches them whatever its state; everything else needs an active member. */
    if (member.status !== "active" && n.kind !== "membership") return "skipped"
    if (!wantsNotification(member.notify_level as NotifyLevel, n.kind)) return "skipped"
    if (n.kind === "reaction" && n.target) return await notifyLike(db, n, (member.notify_level as NotifyLevel | null) ?? null)
    const { data, error } = await db
      .from("community_notifications")
      .upsert(
        {
          user_id: n.userId,
          community_id: n.communityId,
          kind: n.kind,
          actor_id: n.actorId ?? null,
          target_type: n.target?.type ?? null,
          target_id: n.target?.id ?? null,
          title: (n.title || "").trim().slice(0, 200) || "Community update",
          body: n.body ? n.body.trim().slice(0, 500) : null,
          url: n.url,
          dedupe_key: n.dedupeKey.slice(0, 300),
        },
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      )
      .select("id")
    if (error) {
      if (missing(error)) return "unavailable"
      throw error
    }
    if (!(Array.isArray(data) && data.length > 0)) return "duplicate"
    /* A new row, never a duplicate: it may also reach their phone (lib/notifications/push-bridge.ts), after the response. */
    await pushSoon(() =>
      pushCommunityRow(db, {
        userId: n.userId,
        communityId: n.communityId,
        kind: n.kind,
        actorId: n.actorId ?? null,
        title: (n.title || "").trim().slice(0, 200) || "Community update",
        body: n.body ? n.body.trim().slice(0, 500) : null,
        url: n.url,
        dedupeKey: n.dedupeKey,
        level: (member.notify_level as NotifyLevel | null) ?? null,
      }),
    )
    return "sent"
  } catch (e) {
    console.error(`[communities] notification ${n.dedupeKey}: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/**
 * A like, grouped (see LIKES ARE GROUPED above). New row: told as any new
 * row is. Existing row: rewritten with the count, unread again, and handed
 * to the phone the same way, where the five minute window decides whether
 * it pushes now or is held for the digest.
 */
async function notifyLike(db: Db, n: NotifyInput, level: NotifyLevel | null): Promise<NotifyOutcome> {
  const target = n.target!
  const now = n.now ?? Date.now()
  const key = likeKey(n.userId, target, now)
  const noun = likedNoun(n.title || "", target.type)
  const actorName = likedBy(n.title || "")
  const first = likeTitle(1, actorName, noun)
  const { data, error } = await db
    .from("community_notifications")
    .upsert(
      { user_id: n.userId, community_id: n.communityId, kind: "reaction", actor_id: n.actorId ?? null, target_type: target.type, target_id: target.id, title: first.slice(0, 200), body: n.body ? n.body.trim().slice(0, 500) : null, url: n.url, dedupe_key: key },
      { onConflict: "dedupe_key", ignoreDuplicates: true },
    )
    .select("id")
  if (error) {
    if (missing(error)) return "unavailable"
    throw error
  }
  let title = first
  if (!(Array.isArray(data) && data.length > 0)) {
    /* Somebody liked it before in this window: the row says how many now. */
    const windowStart = new Date(Math.floor(now / LIKE_WINDOW_MS) * LIKE_WINDOW_MS).toISOString()
    const { count, error: countError } = await db
      .from("community_reactions")
      .select("id", { count: "exact", head: true })
      .eq("target_type", target.type)
      .eq("target_id", target.id)
      .neq("user_id", n.userId)
      .gte("created_at", windowStart)
    if (countError && !missing(countError)) throw countError
    title = likeTitle(Math.max(2, count ?? 2), actorName, noun)
    const { error: updateError } = await db
      .from("community_notifications")
      .update({ title: title.slice(0, 200), actor_id: n.actorId ?? null, read_at: null, created_at: new Date(now).toISOString() })
      .eq("dedupe_key", key)
    if (updateError) {
      if (missing(updateError)) return "unavailable"
      throw updateError
    }
  }
  await pushSoon(() =>
    pushCommunityRow(db, { userId: n.userId, communityId: n.communityId, kind: "reaction", actorId: n.actorId ?? null, title, body: n.body ? n.body.trim().slice(0, 500) : null, url: n.url, dedupeKey: key, level }),
  )
  return "sent"
}

/* ── New posts and reports, through the queue ──────────────────────────── */

/**
 * A new post in an ordinary space: the members at Everything or the default level hear it on
 * their phones, a page at a time (jobs/fanout_announcement.ts, reason
 * "post"). An announcement or an @everyone already has its own fan out and
 * is not queued twice. Once per post.
 */
export async function queueNewPost(db: Db, p: { communityId: string; postId: string; actorId: string }): Promise<QueueOutcome> {
  return queueJob(db, {
    kind: "fanout_announcement",
    payload: { communityId: p.communityId, postId: p.postId, actorId: p.actorId, reason: "post", after: null },
    idempotencyKey: `fanout_post:${p.postId}`,
  })
}

/**
 * A report came in: each moderator who reviews reports is owed one email
 * about it, at most once a day per community, never one per report
 * (lib/notifications/report-digest.ts says when). The first report of a quiet day
 * queues today's email an hour later, so a burst arrives as one; a report
 * after today's email went waits for tomorrow's. The job is a push_digest
 * row with report: true (the queue takes no new kind without SQL), handled
 * by jobs/report_digest.ts.
 */
export async function queueReportDigest(db: Db, r: { communityId: string; userIds: readonly string[]; now?: number }): Promise<number> {
  const now = r.now ?? Date.now()
  let queued = 0
  for (const userId of new Set(r.userIds)) {
    const today = reportDigestKey(r.communityId, userId, now)
    const { data: had } = await db.from("community_jobs").select("state").eq("idempotency_key", today).maybeSingle()
    const plan = reportDigestPlan(now, (had as { state: string } | null)?.state ?? null)
    if (!plan) continue
    const outcome = await queueJob(db, {
      kind: "push_digest",
      payload: { report: true, userId, communityId: r.communityId, since: new Date(now - 5_000).toISOString(), day: plan.day },
      runAt: new Date(plan.runAt),
      idempotencyKey: reportDigestKey(r.communityId, userId, plan.dayStart),
    })
    if (outcome === "queued") queued++
  }
  return queued
}

/* ── Programs, event changes and the weekly digest, through the queue ─── */

export interface ProgramPublished {
  communityId: string
  /** The program's id (a uuid, or a slug of letters, digits, _ and -). */
  programId: string
  /** Set when one lesson of an existing program opened, rather than the program itself. */
  lessonId?: string | null
  /** The program's title. */
  title: string
  lessonTitle?: string | null
  /** Its page in this community: "/community/<slug>/learn/<program>" (anything else tells nobody). */
  url: string
  /** Who published it: never told. */
  actorId?: string | null
  /**
   * Who may see it, as an access rule (tierIds, productIds, minLevel, roles):
   * a program open from a member level or to a tier. Left out, every member
   * hears (a free program, or one sold on its own that anyone can buy).
   */
  access?: Record<string, unknown> | null
}

/**
 * A NEW PROGRAM OR LESSON in Learn: every member who can see it gets one
 * bell row and, under their "Programs and lessons" switch, a push
 * (jobs/fanout_program.ts). Learn calls this when a program is published,
 * and with lessonId when a lesson is added to a published program. Once per
 * program, and once per lesson: publishing again tells nobody twice.
 */
export async function notifyProgramPublished(db: Db, p: ProgramPublished): Promise<QueueOutcome> {
  const lesson = p.lessonId ? `:${p.lessonId}` : ""
  return queueJob(db, {
    kind: "fanout_announcement",
    payload: {
      reason: "program",
      communityId: p.communityId,
      programId: p.programId,
      lessonId: p.lessonId ?? null,
      title: String(p.title ?? "").slice(0, 120),
      lessonTitle: p.lessonTitle ? String(p.lessonTitle).slice(0, 120) : null,
      url: p.url,
      actorId: p.actorId ?? null,
      access: p.access ?? null,
      after: null,
    },
    idempotencyKey: `fanout_program:${p.programId}${lesson}`,
  })
}

/**
 * AN EVENT THAT CHANGED, told to the people going (jobs/fanout_event.ts):
 * "moved" when its start changed, "cancelled", or "updated" for a change
 * worth telling them (the place, the link). Pushes at once. Once per change:
 * a move is keyed by its new start, the rest by `stamp` (the event's
 * updated_at, or now), so saving twice tells nobody twice.
 */
export async function notifyEventChanged(db: Db, e: { eventId: string; communityId: string; change: "moved" | "updated" | "cancelled"; startsAt?: string | null; stamp?: string | null; actorId?: string | null }): Promise<QueueOutcome> {
  const stamp = e.change === "moved" && e.startsAt ? new Date(e.startsAt).toISOString() : (e.stamp ?? new Date().toISOString()).slice(0, 40)
  return queueJob(db, {
    kind: "fanout_event",
    payload: { eventId: e.eventId, communityId: e.communityId, change: e.change, stamp, actorId: e.actorId ?? null },
    idempotencyKey: `fanout_event_change:${e.eventId}:${e.change}:${stamp}`,
  })
}

/**
 * THE WEEKLY DIGEST, the first of it: queued when the person turns it on in
 * Settings (and again whenever Settings reads it on, harmlessly), for the
 * coming Monday morning in their time; each one queues the next
 * (jobs/weekly_digest.ts).
 */
export async function scheduleWeeklyDigest(db: Db, userId: string, tz: string | null, now: number = Date.now()): Promise<QueueOutcome> {
  const { weeklyJob } = await import("./jobs/weekly_digest")
  const j = weeklyJob(userId, now, tz)
  return queueJob(db, { kind: j.kind, payload: j.payload, runAt: j.run_at, idempotencyKey: j.idempotency_key })
}

/* ── The job queue ──────────────────────────────────────────────────────── */

export const JOB_MAX_ATTEMPTS = 5
export const JOB_LEASE_SECONDS = 120
const JOB_BATCH = 10

/** The wait before a failed job's next try: 1, 2, 4, 8 minutes, at most an hour. */
export function jobBackoffMs(attempts: number): number {
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempts - 1))
}

export type QueueOutcome = "queued" | "exists" | "unavailable"

/** Puts a job on the queue once per idempotency key. */
export async function queueJob(db: Db, j: { kind: JobKind; payload: Record<string, unknown>; runAt?: string | Date | null; idempotencyKey: string }): Promise<QueueOutcome> {
  try {
    const runAt = j.runAt ? new Date(j.runAt).toISOString() : nowIso()
    const { data, error } = await db
      .from("community_jobs")
      .upsert({ kind: j.kind, payload: j.payload ?? {}, run_at: runAt, idempotency_key: j.idempotencyKey.slice(0, 300) }, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id")
    if (error) {
      if (!missing(error)) console.error(`[communities] job ${j.idempotencyKey} not queued: ${reasonOf(error)}`)
      return "unavailable"
    }
    return Array.isArray(data) && data.length > 0 ? "queued" : "exists"
  } catch (e) {
    console.error(`[communities] job ${j.idempotencyKey} not queued: ${reasonOf(e)}`)
    return "unavailable"
  }
}

export interface CommunityJobSummary {
  available: boolean
  claimed: number
  done: number
  retried: number
  failed: number
  continued: number
  scheduled: number
  ms: number
}

async function finish(db: Db, job: JobRow, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db.from("community_jobs").update(patch).eq("id", job.id).eq("state", "running")
  if (error) console.error(`[communities] job ${job.id} not marked: ${reasonOf(error)}`)
}

/**
 * The recurring jobs, queued once per period for each kind that has a
 * handler: the daily rollup (yesterday's figures) and the hourly trending
 * score. A kind without a handler is never queued.
 */
async function scheduleRecurring(db: Db, kinds: ReadonlySet<string>, now: number): Promise<number> {
  const day = new Date(now - 86_400_000).toISOString().slice(0, 10)
  const hour = new Date(now).toISOString().slice(0, 13)
  let n = 0
  if (kinds.has("rollup") && (await queueJob(db, { kind: "rollup", payload: { day }, idempotencyKey: `rollup:${day}` })) === "queued") n++
  if (kinds.has("trending") && (await queueJob(db, { kind: "trending", payload: { hour }, idempotencyKey: `trending:${hour}` })) === "queued") n++
  return n
}

/**
 * ONLY SOME KINDS, CLAIMED ONE BY ONE. public.community_claim_jobs takes any
 * kind, so while communities are switched off the cron claims the platform
 * kinds (PLATFORM_JOB_KINDS) itself: it reads the due ones and takes each
 * with an update that names the state and attempts it read, so of two runs
 * at once only one gets a job (compare and set). A lease that ran out is
 * taken again the same way, and one that ran out five times is given up,
 * as the function does.
 */
async function claimKinds(db: Db, kinds: readonly JobKind[], limit: number): Promise<{ data: JobRow[] | null; error: { code?: string; message?: string } | null }> {
  const now = nowIso()
  const [due, stale] = await Promise.all([
    db.from("community_jobs").select(JOB_COLUMNS).in("kind", kinds).eq("state", "pending").lte("run_at", now).order("run_at", { ascending: true }).order("id", { ascending: true }).limit(limit),
    db.from("community_jobs").select(JOB_COLUMNS).in("kind", kinds).eq("state", "running").lt("lease_until", now).order("lease_until", { ascending: true }).limit(limit),
  ])
  if (due.error) return { data: null, error: due.error }
  const claimed: JobRow[] = []
  for (const job of [...((due.data as JobRow[] | null) ?? []), ...((stale.data as JobRow[] | null) ?? [])].slice(0, limit)) {
    if (job.state === "running" && job.attempts >= JOB_MAX_ATTEMPTS) {
      await db.from("community_jobs").update({ state: "failed", finished_at: now, lease_until: null, last_error: job.last_error ?? "its lease ran out 5 times" }).eq("id", job.id).eq("state", "running").eq("attempts", job.attempts)
      continue
    }
    const { data } = await db
      .from("community_jobs")
      .update({ state: "running", lease_until: nowIso(Date.now() + JOB_LEASE_SECONDS * 1000), attempts: job.attempts + 1 })
      .eq("id", job.id)
      .eq("state", job.state)
      .eq("attempts", job.attempts)
      .select(JOB_COLUMNS)
    const row = Array.isArray(data) ? (data[0] as JobRow | undefined) : undefined
    if (row) claimed.push(row)
  }
  return { data: claimed, error: null }
}

/**
 * The cron's body: claims due jobs and runs each by its kind until the
 * budget is spent. A handler may hand back `again` to carry on in the next
 * run (a fan out over thousands of members, a page at a time). With `kinds`,
 * only jobs of those kinds are claimed and only their recurring jobs queued
 * (the cron passes PLATFORM_JOB_KINDS while communities are off).
 */
export async function runCommunityJobs(db: Db, opts: { budgetMs: number; now?: number; kinds?: readonly JobKind[] }): Promise<CommunityJobSummary> {
  const started = Date.now()
  const deadline = started + Math.max(1000, opts.budgetMs)
  const summary: CommunityJobSummary = { available: true, claimed: 0, done: 0, retried: 0, failed: 0, continued: 0, scheduled: 0, ms: 0 }
  const { JOB_HANDLERS } = await import("./jobs/index")
  const only = opts.kinds ? new Set<string>(opts.kinds) : null
  summary.scheduled = await scheduleRecurring(db, new Set(Object.keys(JOB_HANDLERS).filter((k) => !only || only.has(k))), opts.now ?? Date.now())

  while (Date.now() < deadline - 5_000) {
    const { data, error } = opts.kinds
      ? await claimKinds(db, opts.kinds, JOB_BATCH)
      : await db.rpc("community_claim_jobs", { p_limit: JOB_BATCH, p_lease_seconds: JOB_LEASE_SECONDS })
    if (error) {
      if (missing(error)) summary.available = false
      else console.error(`[communities] jobs not claimed: ${reasonOf(error)}`)
      break
    }
    const jobs = (data as JobRow[] | null) ?? []
    if (jobs.length === 0) break
    summary.claimed += jobs.length
    for (const job of jobs) {
      const handler = only && !only.has(job.kind) ? undefined : JOB_HANDLERS[job.kind]
      try {
        if (!handler) throw new Error(`no handler for ${job.kind}`)
        if (Date.now() >= deadline - 2_000) throw new Error("out of time before it started")
        const outcome = (await handler(db, job, { deadline, now: Date.now() })) as JobOutcome | undefined
        if (outcome && outcome.again) {
          await finish(db, job, {
            state: "pending",
            lease_until: null,
            attempts: 0,
            payload: outcome.again.payload ?? job.payload,
            run_at: outcome.again.runAt ?? nowIso(),
            last_error: null,
          })
          summary.continued++
        } else {
          await finish(db, job, { state: "done", lease_until: null, finished_at: nowIso(), last_error: null })
          summary.done++
        }
      } catch (e) {
        const message = reasonOf(e).slice(0, 1000)
        if (job.attempts >= JOB_MAX_ATTEMPTS) {
          await finish(db, job, { state: "failed", lease_until: null, finished_at: nowIso(), last_error: message })
          summary.failed++
        } else {
          await finish(db, job, { state: "pending", lease_until: null, run_at: nowIso(Date.now() + jobBackoffMs(job.attempts)), last_error: message })
          summary.retried++
        }
        console.error(`[communities] job ${job.id} (${job.kind}) attempt ${job.attempts}: ${message}`)
      }
    }
  }
  summary.ms = Date.now() - started
  return summary
}

/** One job as the queue holds it, for the admin and for tests. */
export async function readJob(db: Db, id: number): Promise<JobRow | null> {
  const { data, error } = await db.from("community_jobs").select(JOB_COLUMNS).eq("id", id).maybeSingle()
  if (error) return null
  return (data as JobRow | null) ?? null
}
