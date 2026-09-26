/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE: EVERY CREATOR, EVERY HOUR, AND ON THE EVENTS
 * ===========================================================================
 * The hourly cron (app/api/cron/notifications) calls runNotificationEngine:
 *
 *   1. CLAIM a batch of creators, least recently evaluated first, with a
 *      lease (notification_claim_creators: FOR UPDATE SKIP LOCKED). Two runs
 *      at once never evaluate the same creator; a run that dies lets its
 *      lease run out and the next run takes them. The order is the cursor:
 *      a run that stops at its time budget leaves the rest at the front of
 *      the queue for the next one, so no account, however large, holds up
 *      the others.
 *   2. READ the rows already written for them and their data, a few queries
 *      per batch, not per creator (lib/notifications/snapshot.ts).
 *   3. PLAN each creator (lib/notifications/plan.ts) and APPLY it: resolve,
 *      then insert. Every insert is ON CONFLICT (creator_id, dedupe_key) DO
 *      NOTHING, so a row is written once however many runs or webhooks
 *      reach the same conclusion.
 *   4. PUSH the new critical and milestone rows, each after taking the row's
 *      pushed_at (UPDATE ... WHERE pushed_at IS NULL): one push per row.
 *   5. FINISH the batch (evaluated_at, lease released) and take the next,
 *      until the time budget is spent.
 *
 * Events (lib/notifications/events.ts) run the same planner for one creator
 * and a few rules, straight after the webhook that changed something, so a
 * failed payout or a first sale is known within seconds, not within the hour.
 *
 * Before its SQL has run the claim function does not exist: the run says
 * `available: false` and does nothing, and the events do nothing either.
 *
 * The logs carry counts and error codes only: no creator, no address, no
 * product name.
 */
import { planCreator } from "./plan"
import { HISTORY_DAYS, DAY_MS } from "./policy"
import { pushPayloadOf, type NotificationPush } from "./push"
import { DIGEST_KIND, RULES } from "./rules"
import type { CreatorSnapshot, ExistingRow, Plan, PlannedRow, Rule, SnapshotPart } from "./types"
import { NOTIFICATION_TYPES } from "@/lib/notify/types"

export const ALL_PARTS: ReadonlySet<SnapshotPart> = new Set<SnapshotPart>([
  "creator",
  "products",
  "files",
  "payouts",
  "disputes",
  "domains",
  "campaigns",
  "emailHealth",
  "subscribers",
  "sales",
  "traffic",
  "checkout",
  "recovery",
  "coupons",
  "reviews",
  "delivery",
  "website",
])

/*
 * The notification engine (lib/notify) writes its bell rows into the same
 * table, with its notification type as the kind. They are known here so a
 * full run never retires them as a removed rule's rows.
 */
export const KNOWN_KINDS: ReadonlySet<string> = new Set([...RULES.map((r) => r.kind), DIGEST_KIND, ...NOTIFICATION_TYPES])

/** A row as written: the plan's row and whose it is. */
export interface NewRow extends PlannedRow {
  creatorId: string
  userId: string
  at: string
}

export interface NotificationStore {
  /** Up to `limit` creators due an evaluation, leased. Null when the engine's SQL has not run. */
  claimCreators(limit: number, leaseSeconds: number): Promise<string[] | null>
  /** Marks them evaluated and lets go of their lease. */
  finishCreators(ids: string[], at: string): Promise<void>
  /** Their engine rows: open, recent (since), and every milestone. Null when they cannot be read. */
  existing(creatorIds: string[], since: string): Promise<ExistingRow[] | null>
  /** Writes the row unless its dedupe key is taken. The new row's id, or null when it was. */
  insert(row: NewRow): Promise<string | null>
  /** Marks these of the creator's rows resolved, those still open. */
  resolve(creatorId: string, ids: string[], at: string): Promise<void>
  /** The right to push this row: true for exactly one caller. */
  claimPush(id: string, at: string): Promise<boolean>
}

export interface SnapshotSource {
  load(creatorIds: string[], parts: ReadonlySet<SnapshotPart>, existing: ReadonlyMap<string, ExistingRow[]>, now: number): Promise<Map<string, CreatorSnapshot>>
}

export interface Pusher {
  send(userId: string, push: NotificationPush): Promise<void>
}

export interface ApplyResult {
  inserted: Array<{ id: string; row: PlannedRow }>
  resolved: number
  pushed: number
  deferred: number
}

function iso(ms: number) {
  return new Date(ms).toISOString()
}

/**
 * Applies one creator's plan: resolve, insert, push. `pushInline: false`
 * takes the push rights without sending, for a caller that says it itself
 * (the sale push that becomes the milestone's).
 */
export async function applyPlan(
  store: NotificationStore,
  pusher: Pusher | null,
  who: { creatorId: string; userId: string },
  plan: Plan,
  now: number,
  pushInline = true,
): Promise<ApplyResult> {
  const at = iso(now)
  const out: ApplyResult = { inserted: [], resolved: 0, pushed: 0, deferred: plan.deferred }
  if (plan.resolve.length > 0) {
    await store.resolve(who.creatorId, plan.resolve, at)
    out.resolved = plan.resolve.length
  }
  for (const row of plan.inserts) {
    const id = await store.insert({ ...row, creatorId: who.creatorId, userId: who.userId, at })
    if (id) out.inserted.push({ id, row })
  }
  for (const { id, row } of out.inserted) {
    if (!row.push || row.baseline || row.foldedInto) continue
    if (!(await store.claimPush(id, at))) continue
    if (!pushInline) continue
    if (!pusher) continue
    try {
      await pusher.send(who.userId, pushPayloadOf(row))
      out.pushed++
    } catch {
      /* The row is there either way; a push is a courtesy. */
    }
  }
  return out
}

export interface RunOptions {
  store: NotificationStore
  source: SnapshotSource
  pusher: Pusher | null
  rules?: readonly Rule[]
  /** Epoch ms the run must be done by. */
  deadline: number
  clock?: () => number
  batchSize?: number
  leaseSeconds?: number
  /** Creators evaluated side by side within a batch. */
  concurrency?: number
}

export interface RunSummary {
  available: boolean
  batches: number
  creators: number
  inserted: number
  critical: number
  resolved: number
  pushed: number
  deferred: number
  digests: number
  errors: number
  /** Time budget reached with creators possibly still waiting. */
  stoppedForTime: boolean
}

/** The margin kept before the deadline: one batch's worth of work. */
export const SAFETY_MS = 20_000

async function eachLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(workers)
}

export async function runNotificationEngine(o: RunOptions): Promise<RunSummary> {
  const clock = o.clock ?? Date.now
  const rules = o.rules ?? RULES
  const batch = o.batchSize ?? 25
  const lease = o.leaseSeconds ?? 300
  const summary: RunSummary = { available: true, batches: 0, creators: 0, inserted: 0, critical: 0, resolved: 0, pushed: 0, deferred: 0, digests: 0, errors: 0, stoppedForTime: false }

  while (true) {
    if (clock() > o.deadline - SAFETY_MS) {
      summary.stoppedForTime = true
      break
    }
    let ids: string[] | null
    try {
      ids = await o.store.claimCreators(batch, lease)
    } catch {
      summary.errors++
      break
    }
    if (ids === null) {
      summary.available = false
      break
    }
    if (ids.length === 0) break
    summary.batches++
    const now = clock()
    const rows = await o.store.existing(ids, iso(now - HISTORY_DAYS * DAY_MS)).catch(() => null)
    if (rows === null) {
      /* Nothing can be decided without knowing what was said: leave the lease to run out. */
      summary.errors++
      break
    }
    const byCreator = new Map<string, ExistingRow[]>()
    for (const id of ids) byCreator.set(id, [])
    for (const r of rows) byCreator.get(r.creator_id)?.push(r)
    let snapshots: Map<string, CreatorSnapshot>
    try {
      snapshots = await o.source.load(ids, ALL_PARTS, byCreator, now)
    } catch {
      summary.errors++
      break
    }
    await eachLimited(ids, o.concurrency ?? 5, async (creatorId) => {
      const snapshot = snapshots.get(creatorId)
      const userId = snapshot?.creator?.userId
      if (!snapshot || !userId) return
      try {
        const plan = planCreator({ rules, snapshot, existing: byCreator.get(creatorId) ?? [], now, complete: true, knownKinds: KNOWN_KINDS })
        const r = await applyPlan(o.store, o.pusher, { creatorId, userId }, plan, now)
        summary.creators++
        summary.inserted += r.inserted.filter((x) => !x.row.baseline && !x.row.foldedInto).length
        summary.critical += r.inserted.filter((x) => x.row.category === "critical").length
        summary.digests += r.inserted.filter((x) => x.row.kind === DIGEST_KIND).length
        summary.resolved += r.resolved
        summary.pushed += r.pushed
        summary.deferred += r.deferred
      } catch {
        summary.errors++
      }
    })
    await o.store.finishCreators(ids, iso(clock())).catch(() => {
      summary.errors++
    })
  }
  return summary
}

export interface EvaluateOptions {
  store: NotificationStore
  source: SnapshotSource
  pusher: Pusher | null
  creatorId: string
  rules: readonly Rule[]
  now?: number
  /** Facts the event carries that the database does not keep (Stripe's account). */
  context?: Partial<Pick<CreatorSnapshot, "stripeAccount">>
  /** The caller pushes for itself: push rights are taken, nothing is sent. */
  pushInline?: boolean
}

/**
 * One creator, a few rules, now: what a webhook calls. Rows of kinds these
 * rules do not make are left alone. Never throws.
 */
export async function evaluateCreator(o: EvaluateOptions): Promise<ApplyResult | null> {
  const now = o.now ?? Date.now()
  try {
    const rows = await o.store.existing([o.creatorId], iso(now - HISTORY_DAYS * DAY_MS))
    if (rows === null) return null
    const parts = new Set<SnapshotPart>(["creator", ...o.rules.flatMap((r) => r.needs)])
    const snapshots = await o.source.load([o.creatorId], parts, new Map([[o.creatorId, rows]]), now)
    const base = snapshots.get(o.creatorId)
    const userId = base?.creator?.userId
    if (!base || !userId) return null
    const snapshot: CreatorSnapshot = { ...base, ...o.context }
    const plan = planCreator({ rules: o.rules, snapshot, existing: rows, now, complete: false })
    return await applyPlan(o.store, o.pusher, { creatorId: o.creatorId, userId }, plan, now, o.pushInline !== false)
  } catch {
    return null
  }
}
