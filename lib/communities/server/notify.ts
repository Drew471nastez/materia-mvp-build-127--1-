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
 */
import { wantsNotification } from "../permissions"
import { JOB_COLUMNS, type JobKind, type JobRow, type NotificationKind, type NotifyLevel } from "../types"
import { missing, nowIso, reasonOf, type Db } from "./db"
import type { JobOutcome } from "./jobs/index"

export interface NotifyInput {
  userId: string
  communityId: string
  kind: NotificationKind
  actorId?: string | null
  target?: { type: string; id: string } | null
  title: string
  body?: string | null
  url: string
  /** Once per key: "reply:<commentId>:<userId>". */
  dedupeKey: string
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
    return Array.isArray(data) && data.length > 0 ? "sent" : "duplicate"
  } catch (e) {
    console.error(`[communities] notification ${n.dedupeKey}: ${reasonOf(e)}`)
    return "unavailable"
  }
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
