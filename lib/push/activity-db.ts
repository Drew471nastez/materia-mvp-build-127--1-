import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { sendPushToUser } from "@/lib/push/sender"
import { createNotification } from "@/lib/notifications"
import {
  buildDigest,
  dayKey,
  dedupeKeyFor,
  planDigest,
  MAX_AGE_MS,
  MAX_EVENTS_PER_DIGEST,
  type ActivityKind,
  type ActivityPlan,
  type PendingActivity,
} from "@/lib/push/activity-notification"

/**
 * The database half of social activity push.
 *
 * Same split as chat: every decision lives in activity-notification.ts and is
 * tested without a database; this file is the queries, and every one of them
 * degrades rather than throws.
 *
 * DEGRADING IS THE POINT, and it means something different here than it does
 * for chat. A chat push that cannot read its preferences SENDS, because a
 * duplicate banner beats silence. An activity push that cannot read anything
 * STAYS QUIET, because the failure mode of guessing on this path is a phone
 * that buzzes for every like — exactly the thing the feature exists to prevent.
 * Missing schema means no activity notifications, loudly logged, and a `like`
 * that still works perfectly.
 */

function isMissingRelation(message?: string | null): boolean {
  const m = (message ?? "").toLowerCase()
  return (
    m.includes("does not exist") ||
    m.includes("schema cache") ||
    m.includes("could not find the table") ||
    m.includes("could not find the")
  )
}

/** Logged once per cold start rather than once per event. */
let warnedMissing = false
function warnMissingOnce(where: string, message?: string | null) {
  if (!isMissingRelation(message)) {
    console.error(`[push:activity] ${where} failed:`, message ?? "unknown")
    return
  }
  if (warnedMissing) return
  warnedMissing = true
  console.error(
    "[push:activity] activity_push_queue is missing — social activity notifications are OFF. " +
      "Run supabase/sql/RUN_ACTIVITY_PUSH.sql",
  )
}

// ───────────────────────────────────────────────────────────────────────────
//  Writing an event
// ───────────────────────────────────────────────────────────────────────────

export interface RecordActivityInput {
  kind: ActivityKind
  /** Who is being told. */
  recipientId: string
  /** Who did it. Omitted for `trending`. */
  actorId?: string | null
  /** The listing. Omitted for `follow`. */
  listingId?: string | null
  /** Overridable for tests; defaults to now. */
  at?: Date
}

/**
 * Queue one event. Never throws, never blocks the feature that called it.
 *
 * Called from `after()` on the like and follow routes, so the person tapping the
 * heart waits for nothing. The insert is `on conflict do nothing` against the
 * unique dedupe key, which is what makes like → unlike → like produce exactly
 * one notification for the rest of time.
 */
export async function recordActivity(input: RecordActivityInput): Promise<boolean> {
  const at = input.at ?? new Date()
  if (!input.recipientId) return false
  // Nobody is notified about themselves. Enforced here rather than at three
  // call sites, because it is a property of the concept.
  if (input.actorId && input.actorId === input.recipientId) return false

  const dedupeKey = dedupeKeyFor(input.kind, {
    actorId: input.actorId,
    listingId: input.listingId,
    recipientId: input.recipientId,
    day: dayKey(at),
  })

  try {
    const admin = createAdminClient()
    const { error } = await admin.from("activity_push_queue").insert({
      recipient_id: input.recipientId,
      kind: input.kind,
      actor_id: input.actorId ?? null,
      listing_id: input.listingId ?? null,
      dedupe_key: dedupeKey,
      created_at: at.toISOString(),
    })
    // 23505 is the mechanism working: this exact event has already been queued.
    if (error && error.code !== "23505") {
      warnMissingOnce("enqueue", error.message)
      return false
    }
    return !error
  } catch (e: any) {
    warnMissingOnce("enqueue", e?.message ?? String(e))
    return false
  }
}

/**
 * The owner of a listing, as a profile id.
 *
 * products.creator_id → creators.id → creators.user_id. Two hops, so it is
 * written once here rather than inline at every call site that needs to know
 * who to tell about a like.
 */
export async function ownerOfListing(listingId: string): Promise<string | null> {
  if (!listingId) return null
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("products")
      .select("id, creators(user_id)")
      .eq("id", listingId)
      .maybeSingle()
    const creators: any = (data as any)?.creators
    const owner = Array.isArray(creators) ? creators[0]?.user_id : creators?.user_id
    return typeof owner === "string" ? owner : null
  } catch (e: any) {
    console.error("[push:activity] owner lookup failed:", e?.message ?? e)
    return null
  }
}

/**
 * "Somebody saved your listing" — the whole path, from a product id to a queued
 * event, including working out who to tell.
 *
 * On Storelib the heart on a product card IS the wishlist, so a save and a like
 * are the same act and there is only one event for both. Calling them two
 * things in the notification copy would be inventing a distinction the product
 * does not have.
 */
export async function recordListingLike(listingId: string, actorId: string, at?: Date): Promise<boolean> {
  const owner = await ownerOfListing(listingId)
  if (!owner || owner === actorId) return false
  // The in-app feed row and the push are written from the same place so they
  // cannot disagree about what happened. createNotification swallows its own
  // failures and skips self-notifications.
  await createNotification(createAdminClient(), {
    userId: owner,
    kind: "like",
    actorId,
    listingId,
  })
  return recordActivity({ kind: "like", recipientId: owner, actorId, listingId, at })
}

// ───────────────────────────────────────────────────────────────────────────
//  Reading, claiming, sending
// ───────────────────────────────────────────────────────────────────────────

interface QueueRow {
  id: string
  kind: ActivityKind
  actor_id: string | null
  listing_id: string | null
  created_at: string
}

function toPending(rows: QueueRow[]): PendingActivity[] {
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    actorId: r.actor_id,
    listingId: r.listing_id,
    createdAt: Date.parse(r.created_at),
  }))
}

/** Recipients with at least one unsent event. One query, capped. */
async function recipientsWithPending(limit: number): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("activity_push_queue")
    .select("recipient_id")
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) {
    warnMissingOnce("scan", error.message)
    return []
  }
  // Distinct, in JS. PostgREST has no DISTINCT and a view for this would be one
  // more object to keep in step with the table for a list that is short by
  // construction — it is bounded by how many people had activity in a window.
  return Array.from(new Set((data ?? []).map((r: any) => r.recipient_id as string).filter(Boolean)))
}

async function pendingFor(recipientId: string): Promise<PendingActivity[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("activity_push_queue")
    .select("id, kind, actor_id, listing_id, created_at")
    .eq("recipient_id", recipientId)
    .is("notified_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_EVENTS_PER_DIGEST)
  if (error) {
    warnMissingOnce("read", error.message)
    return []
  }
  return toPending((data ?? []) as QueueRow[])
}

async function stateFor(userId: string): Promise<{ enabled: boolean; preview: boolean; lastPushAt: number | null }> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("profiles")
    .select("push_activity_enabled, push_preview_enabled, activity_push_last_at")
    .eq("id", userId)
    .maybeSingle()
  // See the note at the top: unknown means DO NOT SEND here. A missing column
  // that defaulted to "send" would turn a half-run migration into the spam this
  // feature exists to avoid.
  if (error || !data) {
    if (error) warnMissingOnce("prefs", error.message)
    return { enabled: false, preview: false, lastPushAt: null }
  }
  const last = (data as any).activity_push_last_at
  return {
    enabled: (data as any).push_activity_enabled !== false,
    preview: (data as any).push_preview_enabled !== false,
    lastPushAt: last ? Date.parse(last) : null,
  }
}

/**
 * Take the events, and find out how many we actually got.
 *
 * `update … where notified_at is null … returning *` is the claim, and Postgres
 * decides it — the same discipline as message_push_log's primary key, for the
 * same reason: two cron instances must not both send.
 *
 * The claim can be PARTIAL. Two overlapping runs can read {1,2,3} and {1,2,3,4}
 * and win {1,2,3} and {4} respectively, which is why the digest text is built
 * from what came back here rather than from what was read. The rare cost is one
 * extra push saying "1 apreciere" — and it carries the same collapse id, so it
 * replaces the larger one rather than stacking beside it. Overlapping runs are
 * not expected at a fifteen-minute schedule; this is the behaviour if they do.
 */
async function claim(ids: string[], at: Date): Promise<PendingActivity[]> {
  if (ids.length === 0) return []
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("activity_push_queue")
    .update({ notified_at: at.toISOString() })
    .in("id", ids)
    .is("notified_at", null)
    .select("id, kind, actor_id, listing_id, created_at")
  if (error) {
    warnMissingOnce("claim", error.message)
    return []
  }
  return toPending((data ?? []) as QueueRow[])
}

/**
 * The one name a digest can contain.
 *
 * Only the single-event digests name anybody — "Ana te urmărește acum" — so
 * this resolves exactly one profile and only when there is exactly one event
 * and previews are on. Anything else would be a lookup whose result is thrown
 * away.
 */
async function nameOf(userId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("profiles")
      .select("display_name, username")
      .eq("id", userId)
      .maybeSingle()
    return (data as any)?.display_name?.trim() || (data as any)?.username?.trim() || null
  } catch {
    return null
  }
}

/** Record that a digest went out. The rate-limit floor, in the database. */
async function stampLastPush(userId: string, at: Date): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from("profiles")
      .update({ activity_push_last_at: at.toISOString() })
      .eq("id", userId)
    if (error) console.error("[push:activity] stamp failed:", error.message)
  } catch (e: any) {
    console.error("[push:activity] stamp failed:", e?.message ?? e)
  }
}

/**
 * Drop what is too old to be news.
 *
 * Marked notified rather than deleted, so the dedupe key survives and a like
 * that expired unsent cannot be re-queued by the same person tomorrow. The
 * housekeeping delete in the SQL file is what eventually removes the rows.
 */
async function expireStale(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - MAX_AGE_MS).toISOString()
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("activity_push_queue")
      .update({ notified_at: now.toISOString() })
      .is("notified_at", null)
      .lt("created_at", cutoff)
      .select("id")
    if (error) {
      warnMissingOnce("expire", error.message)
      return 0
    }
    return (data ?? []).length
  } catch {
    return 0
  }
}

export interface DigestResult {
  recipientId: string
  plan: ActivityPlan
  delivery?: { sent: number; invalid: number; failed: number; attempted: number }
}

/** One person: plan, claim, build from what was claimed, send, stamp. */
export async function digestFor(recipientId: string, now: Date): Promise<DigestResult> {
  const [pending, state] = await Promise.all([pendingFor(recipientId), stateFor(recipientId)])

  const plan = planDigest(pending, { now, ...state }, recipientId)
  if (!plan.send) return { recipientId, plan }

  const claimed = await claim(plan.eventIds, now)
  if (claimed.length === 0) {
    return { recipientId, plan: { send: false, reason: "claim-lost", eventIds: [] } }
  }

  if (claimed.length === 1 && claimed[0].actorId && state.preview) {
    claimed[0].actorName = await nameOf(claimed[0].actorId)
  }

  const built = buildDigest(claimed, state.preview, recipientId)
  const delivery = await sendPushToUser(recipientId, {
    title: built.text.title,
    body: built.text.body,
    data: built.data,
    threadId: built.threadId,
    collapseId: built.collapseId,
    // No `badge`. The badge is the unread MESSAGE count and an activity digest
    // must not overwrite it — a phone showing "3" that means "some likes" is
    // worse than a phone showing nothing.
  })

  await stampLastPush(recipientId, now)

  console.log(
    `[push:activity] to=${recipientId} events=${claimed.length} ` +
      `likes=${built.data.likes} follows=${built.data.follows} trending=${built.data.trending} ` +
      `devices=${delivery.attempted} ok=${delivery.sent} invalid=${delivery.invalid} retryable=${delivery.failed}`,
  )

  return {
    recipientId,
    // Rebuilt from the CLAIMED rows, not the read ones — see `claim` above.
    plan: { ...plan, ...built, eventIds: claimed.map((e) => e.id) },
    delivery,
  }
}

// ───────────────────────────────────────────────────────────────────────────
//  Trending
// ───────────────────────────────────────────────────────────────────────────

/**
 * How many saves in a day make a listing "trending".
 *
 * A word that means nothing if it fires for two. Five is the smallest number
 * that reads as a crowd on a marketplace this size, and it is a constant rather
 * than a config because the day it needs tuning it needs tuning with data.
 */
export const TREND_MIN_SAVES = 5
/** Ceiling on the scan. A day's saves, not a table scan. */
const TREND_SCAN_LIMIT = 5000

/**
 * Queue a `trending` event for every listing that crossed the threshold today.
 *
 * Called once per digest run. It is safe to call constantly: the dedupe key is
 * `trending:<listing>:<day>`, so the second call of the day inserts nothing.
 * That unique constraint is the whole of "at most one trending notification per
 * listing per day" — there is no state to keep and nothing to reset at midnight.
 */
export async function detectTrending(now: Date): Promise<number> {
  const since = new Date(now.getTime() - 24 * 60 * 60_000).toISOString()
  let rows: Array<{ product_id: string | null }> = []
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from("wishlist_items")
      .select("product_id")
      .gte("created_at", since)
      .limit(TREND_SCAN_LIMIT)
    if (error) {
      console.error("[push:activity] trending scan failed:", error.message)
      return 0
    }
    rows = (data ?? []) as any
  } catch (e: any) {
    console.error("[push:activity] trending scan failed:", e?.message ?? e)
    return 0
  }

  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.product_id) continue
    counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1)
  }

  let queued = 0
  for (const [listingId, n] of counts) {
    if (n < TREND_MIN_SAVES) continue
    const owner = await ownerOfListing(listingId)
    if (!owner) continue
    if (await recordActivity({ kind: "trending", recipientId: owner, listingId, at: now })) queued++
  }
  return queued
}

// ───────────────────────────────────────────────────────────────────────────
//  The run
// ───────────────────────────────────────────────────────────────────────────

/** Recipients handled per run. A ceiling, so one run cannot become a job. */
const MAX_RECIPIENTS_PER_RUN = 400
/** Concurrency. Enough to hide latency, not enough to exhaust the pool. */
const CHUNK = 10

export interface RunSummary {
  scanned: number
  sent: number
  skipped: Record<string, number>
  expired: number
  trendingQueued: number
}

/**
 * The whole sweep, called by the cron and by nothing else.
 *
 * Order matters: trending is detected FIRST so a listing that crossed the line
 * in the last quarter of an hour can join this run's digest instead of waiting
 * for the next one, and expiry runs before the scan so nothing ancient is read
 * only to be discarded.
 */
export async function runActivityDigest(now: Date = new Date()): Promise<RunSummary> {
  const trendingQueued = await detectTrending(now)
  const expired = await expireStale(now)

  const recipients = (await recipientsWithPending(MAX_EVENTS_PER_DIGEST * 4)).slice(0, MAX_RECIPIENTS_PER_RUN)

  const skipped: Record<string, number> = {}
  let sent = 0

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const results = await Promise.all(
      recipients.slice(i, i + CHUNK).map((id) =>
        digestFor(id, now).catch((e): DigestResult => {
          console.error("[push:activity] digest failed:", e?.message ?? e)
          return { recipientId: id, plan: { send: false, reason: "nothing-pending", eventIds: [] } }
        }),
      ),
    )
    for (const r of results) {
      if (r.plan.send) sent++
      else skipped[r.plan.reason ?? "unknown"] = (skipped[r.plan.reason ?? "unknown"] ?? 0) + 1
    }
  }

  const summary: RunSummary = { scanned: recipients.length, sent, skipped, expired, trendingQueued }
  console.log(`[push:activity] run ${JSON.stringify(summary)}`)
  return summary
}
