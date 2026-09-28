/**
 * ===========================================================================
 *  THE ENGINE'S ROWS, BEHIND ONE INTERFACE
 * ===========================================================================
 * Everything the engine reads or writes goes through NotifyStore, so the
 * worker, the webhook and the outbox are tested against memory
 * (tests/notify-memory-store.ts) and run against Postgres here, with the
 * service role. Every promise the engine relies on is kept by Postgres:
 *
 *   one event per key          notification_events.event_key UNIQUE, written
 *                              ON CONFLICT DO NOTHING
 *   one job per notification   notification_jobs.idempotency_key UNIQUE
 *   one worker per job         claim_notification_jobs: FOR UPDATE SKIP
 *                              LOCKED and a lease, reclaimed when it lapses
 *   one delivery per channel   notification_deliveries (job_id, channel)
 *                              UNIQUE, written before the send
 *   one in-app row             seller_notifications (creator_id, dedupe_key)
 *   one webhook per event      mailgun_webhook_events primary key
 *
 * Before supabase/sql/run-now/40_notification_engine.sql has run, the tables
 * and functions are missing: reads say "unavailable" (null), writes do
 * nothing, and nothing throws into the caller. Database error text is never
 * logged or returned; codes only.
 */
import type { ProgressFacts } from "@/lib/home/progress"
import type { ReviewRequestFacts } from "@/lib/reviews/request-rules"
import type {
  Channel,
  DomainEvent,
  DomainEventName,
  EntityType,
  JobState,
  NotificationType,
  PlannedJob,
  PreferenceCategory,
  Priority,
  RecipientType,
  Requirement,
  SkipReason,
} from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AdminDb = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }

type PgError = { code?: string | null; message?: string | null } | null | undefined

/** The engine's SQL has not run: a function, table or column is not there. */
export function missingSchema(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return code === "PGRST202" || code === "PGRST204" || code === "PGRST205" || code === "42883" || code === "42P01" || code === "42703"
}

/* ── Rows ─────────────────────────────────────────────────────────────── */

export interface EventRow {
  id: string
  name: DomainEventName
  event_key: string
  user_id: string | null
  creator_id: string | null
  entity_type: EntityType | null
  entity_id: string | null
  payload: Record<string, unknown>
  occurred_at: string
  correlation_id: string | null
  attempts: number
}

export interface JobRow {
  id: string
  event_id: string | null
  type: string
  recipient_type: RecipientType
  recipient_user_id: string | null
  recipient_email: string | null
  creator_id: string | null
  entity_type: string | null
  entity_id: string | null
  idempotency_key: string
  workflow: string | null
  step: string | null
  condition: string | null
  state: JobState
  skip_reason: SkipReason | null
  run_at: string
  expires_at: string | null
  attempts: number
  max_attempts: number
  claimed_by: string | null
  claimed_until: string | null
  data: Record<string, unknown>
  correlation_id: string | null
  sent_at: string | null
  created_at: string
}

export type DeliveryStatus =
  | "sending"
  | "sent"
  | "retry"
  | "failed"
  | "unknown"
  | "skipped"
  | "delivered"
  | "bounced"
  | "complained"
  | "unsubscribed"

export interface DeliveryRow {
  id: string
  job_id: string
  channel: Channel
  provider: string | null
  provider_message_id: string | null
  status: DeliveryStatus
  attempt_count: number
  recipient_email: string | null
  recipient_user_id: string | null
  type: string
  category: PreferenceCategory | null
  requirement: Requirement | null
  skip_reason: string | null
  failure_reason: string | null
  sent_at: string | null
  created_at: string
}

export interface PreferenceRow {
  category: PreferenceCategory
  channel: Channel
  enabled: boolean
  updatedAt: string | null
}

export type PreferenceSource = "settings" | "unsubscribe_link" | "mailgun" | "admin"
/** "review_requests": the address turned review request emails off, and nothing else (run-now part 52). */
export type SuppressionScope = "all" | "optional" | "review_requests"

export interface NewJob extends PlannedJob {
  eventId: string | null
  correlationId: string | null
  condition?: string | null
  maxAttempts: number
}

export interface DeliveryStart {
  jobId: string
  channel: Channel
  provider: string | null
  type: NotificationType
  category: PreferenceCategory
  requirement: Requirement
  recipientEmail: string | null
  recipientUserId: string | null
  correlationId: string | null
}

/**
 * What beginDelivery found:
 *   go         a fresh row, or one a retry left: send now, attempt counted
 *   done       already sent (or delivered): never again
 *   uncertain  a row still "sending": a worker died mid-send, the provider
 *              may have it. Marked unknown and never sent again blindly.
 *   final      failed or skipped for good
 */
export type DeliveryBegin =
  | { kind: "go"; deliveryId: string; attempt: number }
  | { kind: "done"; deliveryId: string }
  | { kind: "uncertain"; deliveryId: string }
  | { kind: "final"; deliveryId: string }
  | { kind: "unavailable" }

export interface DeliveryPatch {
  status: DeliveryStatus
  providerMessageId?: string | null
  failureReason?: string | null
  skipReason?: string | null
}

/** Provider news about a delivery, from the Mailgun webhook. */
export interface ProviderUpdate {
  status?: DeliveryStatus
  deliveredAt?: string
  failedAt?: string
  openedAt?: string
  clickedAt?: string
  complainedAt?: string
  unsubscribedAt?: string
  failureReason?: string | null
  providerMessageId?: string | null
}

export interface InAppRecord {
  creatorId: string
  userId: string
  type: NotificationType
  dedupeKey: string
  title: string
  message: string
  actionUrl: string | null
  bellType: string
  bellCategory: string
  priority: number
  expiresAt: string | null
  area: string
  correlationId: string | null
  productId?: string | null
  orderId?: string | null
}

/** Facts conditions read, fresh, right before a job sends. Null: could not be read. */
export interface ProductFact {
  id: string
  status: string | null
  type: string | null
  title: string | null
  archived: boolean
  hasFile: boolean
}
export interface PaymentFact {
  stripeAccountId: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  detailsSubmitted: boolean
  status: string | null
  /**
   * What Stripe is still asking this account for, as Stripe's own keys
   * ("individual.verification.document"), from creators.stripe_requirements,
   * which only the account.updated webhook writes. Null when the column is
   * not there (supabase/sql/run-now/63 has not been run) or no webhook has
   * been handled since it was: nothing is known, so the verification
   * reminders do not fire.
   */
  requirements: string[] | null
  /** The date Stripe gave for them, when it gave one. */
  requirementsDueBy: string | null
}

export interface NotifyStore {
  readonly isNotifyStore: true

  /* outbox */
  insertEvent(e: DomainEvent & { source?: string }): Promise<{ status: "inserted" | "duplicate" | "unavailable"; id?: string }>
  claimEvents(limit: number, leaseSeconds: number): Promise<EventRow[] | null>
  /** Processed, or back in the queue with the error until its attempts run out. */
  finishEvent(id: string, error: string | null, retryAt?: string | null): Promise<void>
  creatorUser(creatorId: string): Promise<string | null>

  /* jobs */
  insertJobs(jobs: NewJob[]): Promise<number>
  /** Pending jobs of a workflow for one person, cancelled with the reason. Returns how many. */
  cancelJobs(c: { workflow: string; recipientUserId: string; reason: string }): Promise<number>
  claimJobs(worker: string, limit: number, leaseSeconds: number): Promise<JobRow[] | null>
  /** Only while this worker holds it. True when it changed. */
  finishJob(id: string, worker: string, patch: { state: Exclude<JobState, "pending" | "processing">; skipReason?: SkipReason | null; error?: string | null }): Promise<boolean>
  /** Back to pending at runAt. countAttempt false gives the attempt back (a deferral, not a failure). */
  rescheduleJob(id: string, worker: string, runAt: string, error: string | null, countAttempt: boolean): Promise<boolean>
  /** When this type last went to this person about this thing, other than this job. */
  lastSentAt(q: { type: string; recipientUserId: string | null; recipientEmail: string | null; entityId: string | null; excludeJobId: string }): Promise<string | null>

  /* deliveries */
  beginDelivery(d: DeliveryStart): Promise<DeliveryBegin>
  finishDelivery(id: string, patch: DeliveryPatch): Promise<void>
  /** A channel that was not used, with why, for the trace. Idempotent. */
  skipDelivery(d: DeliveryStart, reason: string): Promise<void>
  /** Email deliveries that left for this address since, of these requirements and categories. */
  emailsSentSince(q: { recipientEmail: string; sinceIso: string; requirements: Requirement[]; categories?: PreferenceCategory[] }): Promise<number>
  findDelivery(q: { deliveryId?: string | null; providerMessageId?: string | null }): Promise<DeliveryRow | null>
  updateDelivery(id: string, patch: ProviderUpdate): Promise<void>

  /* people */
  recipientOf(userId: string): Promise<{ email: string | null; name: string | null } | null>

  /* preferences and suppressions */
  preferences(userId: string): Promise<PreferenceRow[]>
  setPreference(userId: string, category: PreferenceCategory, channel: Channel, enabled: boolean, source: PreferenceSource): Promise<void>
  suppressions(email: string): Promise<SuppressionScope[]>
  suppress(email: string, scope: SuppressionScope, reason: string, source: string): Promise<void>

  /* in app */
  insertInApp(row: InAppRecord): Promise<"inserted" | "duplicate" | "unavailable">

  /* webhook */
  /** First time this provider event is seen: "new". Again: "seen". */
  markWebhookSeen(id: string, event: string): Promise<"new" | "seen" | "unavailable">

  /* conditions */
  products(creatorId: string): Promise<ProductFact[] | null>
  payments(creatorId: string): Promise<PaymentFact | null>
  /**
   * How far Getting started has got, by the rules Home's card uses
   * (lib/home/progress.ts), so a reminder about it and the card can never
   * disagree. Null when it could not be read, or when this login has no
   * creator row.
   */
  setupProgress(userId: string): Promise<ProgressFacts | null>
  payoutStatus(payoutId: string): Promise<string | null | undefined>
  disputeClosed(disputeId: string): Promise<boolean | null>
  domainStatus(domainId: string): Promise<{ status: string | null; sslStatus: string | null } | null | undefined>
  /** What a review request needs to decide and to say (lib/reviews/request-rules). Null when it could not be read. */
  reviewRequestFacts(orderId: string): Promise<ReviewRequestFactsRow | null>
}

/** The facts the review request rule reads, and the names the email uses. */
export type ReviewRequestFactsRow = ReviewRequestFacts & {
  creatorName: string | null
  productSlug: string | null
  /** products.thumbnail_url as stored: the picture the review email shows. Null draws a letter tile. */
  productImage: string | null
  /** creators.support_email: where a reply to the review email goes. Null leaves Storelib's. */
  creatorSupportEmail: string | null
}

/** Either kind of handle the public functions accept. */
export type DbLike = AdminDb | NotifyStore

export function storeOf(db: DbLike): NotifyStore {
  return (db as NotifyStore).isNotifyStore === true ? (db as NotifyStore) : supabaseNotifyStore(db as AdminDb)
}

/* ── In-app bell mapping ──────────────────────────────────────────────── */

export const PRIORITY_NUMBER: Record<Priority, number> = { info: 25, normal: 50, important: 75, critical: 95 }

/* ── Postgres ─────────────────────────────────────────────────────────── */

const clip = (s: string | null | undefined, n: number) => (typeof s === "string" ? s.slice(0, n) : null)
const lower = (email: string) => email.trim().toLowerCase()

export function supabaseNotifyStore(db: AdminDb, log: (line: string, code?: string) => void = defaultLog): NotifyStore {
  const fail = (what: string, error: PgError) => {
    if (!missingSchema(error)) log(`could not ${what}`, String(error?.code ?? "unknown"))
  }

  return {
    isNotifyStore: true,

    async insertEvent(e) {
      const row = {
        event_key: e.key.slice(0, 500),
        name: e.name,
        user_id: e.userId ?? null,
        creator_id: e.creatorId ?? null,
        entity_type: e.entityType ?? null,
        entity_id: e.entityId ?? null,
        payload: e.payload ?? {},
        occurred_at: e.occurredAt,
        correlation_id: e.correlationId ?? null,
        source: e.source ?? "app",
      }
      const { data, error } = await db.from("notification_events").upsert(row, { onConflict: "event_key", ignoreDuplicates: true }).select("id")
      if (error) {
        fail("record an event", error)
        return { status: "unavailable" }
      }
      const id = ((data ?? [])[0] as { id?: string } | undefined)?.id
      return id ? { status: "inserted", id } : { status: "duplicate" }
    },

    async claimEvents(limit, leaseSeconds) {
      const { data, error } = await db.rpc("claim_notification_events", { p_limit: limit, p_lease_seconds: leaseSeconds })
      if (error) {
        fail("claim events", error)
        return null
      }
      return ((data ?? []) as EventRow[]).map((r) => ({ ...r, payload: (r.payload ?? {}) as Record<string, unknown> }))
    },

    async finishEvent(id, error, retryAt) {
      const now = new Date().toISOString()
      /* A failed event keeps a lease until its retry time, so the same run does not take it straight back. */
      const patch = error ? { last_error: clip(error, 300), claimed_until: retryAt ?? null } : { processed_at: now, last_error: null, claimed_until: null }
      const res = await db.from("notification_events").update(patch).eq("id", id)
      if (res.error) fail("finish an event", res.error)
    },

    async creatorUser(creatorId) {
      const { data, error } = await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
      if (error) {
        fail("read a creator", error)
        return null
      }
      return (data as { user_id?: string | null } | null)?.user_id ?? null
    },

    async insertJobs(jobs) {
      if (jobs.length === 0) return 0
      const rows = jobs.map((j) => ({
        event_id: j.eventId,
        type: j.type,
        recipient_type: j.recipientType,
        recipient_user_id: j.recipientUserId ?? null,
        recipient_email: j.recipientEmail ? lower(j.recipientEmail) : null,
        creator_id: j.creatorId ?? null,
        entity_type: j.entityType ?? null,
        entity_id: j.entityId ?? null,
        idempotency_key: j.idempotencyKey.slice(0, 500),
        workflow: j.workflow ?? null,
        step: j.step ?? null,
        condition: j.condition ?? null,
        run_at: j.runAt,
        expires_at: j.expiresAt ?? null,
        max_attempts: j.maxAttempts,
        data: j.data ?? {},
        correlation_id: j.correlationId,
      }))
      const { data, error } = await db.from("notification_jobs").upsert(rows, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id")
      if (error) {
        fail("plan jobs", error)
        if (missingSchema(error)) return 0
        throw new Error(`jobs not written (${error.code ?? "unknown"})`)
      }
      return (data ?? []).length
    },

    async cancelJobs(c) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("notification_jobs")
        .update({ state: "cancelled", skip_reason: "WORKFLOW_CANCELLED", last_error: clip(c.reason, 300), finished_at: now, updated_at: now })
        .eq("workflow", c.workflow)
        .eq("recipient_user_id", c.recipientUserId)
        .eq("state", "pending")
        .select("id")
      if (error) {
        fail("cancel jobs", error)
        return 0
      }
      return (data ?? []).length
    },

    async claimJobs(worker, limit, leaseSeconds) {
      const { data, error } = await db.rpc("claim_notification_jobs", { p_worker: worker, p_limit: limit, p_lease_seconds: leaseSeconds })
      if (error) {
        fail("claim jobs", error)
        return null
      }
      return ((data ?? []) as JobRow[]).map((r) => ({ ...r, data: (r.data ?? {}) as Record<string, unknown> }))
    },

    async finishJob(id, worker, patch) {
      const now = new Date().toISOString()
      const { data, error } = await db
        .from("notification_jobs")
        .update({
          state: patch.state,
          skip_reason: patch.skipReason ?? null,
          last_error: patch.error ? clip(patch.error, 300) : null,
          claimed_until: null,
          finished_at: now,
          updated_at: now,
          ...(patch.state === "sent" ? { sent_at: now } : {}),
        })
        .eq("id", id)
        .eq("state", "processing")
        .eq("claimed_by", worker)
        .select("id")
      if (error) {
        fail("finish a job", error)
        return false
      }
      return (data ?? []).length === 1
    },

    async rescheduleJob(id, worker, runAt, error, countAttempt) {
      const now = new Date().toISOString()
      const base = { state: "pending", run_at: runAt, last_error: error ? clip(error, 300) : null, claimed_by: null, claimed_until: null, updated_at: now }
      let patch: Record<string, unknown> = base
      if (!countAttempt) {
        const { data: cur } = await db.from("notification_jobs").select("attempts").eq("id", id).maybeSingle()
        const attempts = Number((cur as { attempts?: number } | null)?.attempts ?? 1)
        patch = { ...base, attempts: Math.max(0, attempts - 1) }
      }
      const res = await db.from("notification_jobs").update(patch).eq("id", id).eq("state", "processing").eq("claimed_by", worker).select("id")
      if (res.error) {
        fail("reschedule a job", res.error)
        return false
      }
      return (res.data ?? []).length === 1
    },

    async lastSentAt(q) {
      let query = db.from("notification_jobs").select("sent_at").eq("type", q.type).eq("state", "sent").neq("id", q.excludeJobId)
      if (q.recipientUserId) query = query.eq("recipient_user_id", q.recipientUserId)
      else if (q.recipientEmail) query = query.eq("recipient_email", lower(q.recipientEmail))
      else return null
      query = q.entityId ? query.eq("entity_id", q.entityId) : query.is("entity_id", null)
      const { data, error } = await query.order("sent_at", { ascending: false }).limit(1)
      if (error) {
        fail("read the last send", error)
        return null
      }
      return ((data ?? [])[0] as { sent_at?: string | null } | undefined)?.sent_at ?? null
    },

    async beginDelivery(d) {
      const now = new Date().toISOString()
      const fresh = {
        job_id: d.jobId,
        channel: d.channel,
        provider: d.provider,
        status: "sending",
        attempt_count: 1,
        type: d.type,
        category: d.category,
        requirement: d.requirement,
        recipient_email: d.recipientEmail ? lower(d.recipientEmail) : null,
        recipient_user_id: d.recipientUserId,
        correlation_id: d.correlationId,
        created_at: now,
        updated_at: now,
      }
      const ins = await db.from("notification_deliveries").upsert(fresh, { onConflict: "job_id,channel", ignoreDuplicates: true }).select("id")
      if (ins.error) {
        fail("write a delivery", ins.error)
        return { kind: "unavailable" }
      }
      const inserted = ((ins.data ?? [])[0] as { id?: string } | undefined)?.id
      if (inserted) return { kind: "go", deliveryId: inserted, attempt: 1 }
      const { data: row, error } = await db.from("notification_deliveries").select("id, status, attempt_count").eq("job_id", d.jobId).eq("channel", d.channel).maybeSingle()
      if (error || !row) {
        if (error) fail("read a delivery", error)
        return { kind: "unavailable" }
      }
      const r = row as { id: string; status: DeliveryStatus; attempt_count: number | null }
      if (r.status === "retry") {
        const attempt = (r.attempt_count ?? 0) + 1
        const upd = await db.from("notification_deliveries").update({ status: "sending", attempt_count: attempt, updated_at: now }).eq("id", r.id).eq("status", "retry").select("id")
        if (!upd.error && (upd.data ?? []).length === 1) return { kind: "go", deliveryId: r.id, attempt }
        return { kind: "uncertain", deliveryId: r.id }
      }
      if (r.status === "sending") {
        await db.from("notification_deliveries").update({ status: "unknown", failure_reason: "The worker stopped during the send. It may have arrived, so it was not sent again.", updated_at: now }).eq("id", r.id).eq("status", "sending")
        return { kind: "uncertain", deliveryId: r.id }
      }
      if (r.status === "unknown") return { kind: "uncertain", deliveryId: r.id }
      if (r.status === "failed" || r.status === "skipped" || r.status === "bounced") return { kind: "final", deliveryId: r.id }
      return { kind: "done", deliveryId: r.id }
    },

    async finishDelivery(id, patch) {
      const now = new Date().toISOString()
      const row: Record<string, unknown> = { status: patch.status, updated_at: now }
      if (patch.providerMessageId !== undefined) row.provider_message_id = patch.providerMessageId
      if (patch.failureReason !== undefined) row.failure_reason = clip(patch.failureReason, 300)
      if (patch.skipReason !== undefined) row.skip_reason = patch.skipReason
      if (patch.status === "sent") row.sent_at = now
      if (patch.status === "failed") row.failed_at = now
      const { error } = await db.from("notification_deliveries").update(row).eq("id", id)
      if (error) fail("finish a delivery", error)
    },

    async skipDelivery(d, reason) {
      const now = new Date().toISOString()
      const { error } = await db.from("notification_deliveries").upsert(
        {
          job_id: d.jobId,
          channel: d.channel,
          provider: d.provider,
          status: "skipped",
          skip_reason: reason,
          attempt_count: 0,
          type: d.type,
          category: d.category,
          requirement: d.requirement,
          recipient_email: d.recipientEmail ? lower(d.recipientEmail) : null,
          recipient_user_id: d.recipientUserId,
          correlation_id: d.correlationId,
          created_at: now,
          updated_at: now,
        },
        { onConflict: "job_id,channel", ignoreDuplicates: true },
      )
      if (error) fail("record a skipped channel", error)
    },

    async emailsSentSince(q) {
      let query = db
        .from("notification_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("channel", "email")
        .eq("recipient_email", lower(q.recipientEmail))
        .in("status", ["sending", "sent", "unknown", "delivered"])
        .in("requirement", q.requirements)
        .gte("created_at", q.sinceIso)
      if (q.categories && q.categories.length) query = query.in("category", q.categories)
      const { count, error } = await query
      if (error) {
        fail("count recent emails", error)
        return 0
      }
      return count ?? 0
    },

    async findDelivery(q) {
      const cols = "id, job_id, channel, provider, provider_message_id, status, attempt_count, recipient_email, recipient_user_id, type, category, requirement, skip_reason, failure_reason, sent_at, created_at"
      if (q.deliveryId && /^[0-9a-f-]{36}$/i.test(q.deliveryId)) {
        const { data, error } = await db.from("notification_deliveries").select(cols).eq("id", q.deliveryId).maybeSingle()
        if (error) fail("find a delivery", error)
        if (data) return data as DeliveryRow
      }
      if (q.providerMessageId) {
        const id = q.providerMessageId.replace(/^<|>$/g, "")
        const { data, error } = await db.from("notification_deliveries").select(cols).in("provider_message_id", [id, `<${id}>`]).limit(1)
        if (error) fail("find a delivery", error)
        const row = (data ?? [])[0]
        if (row) return row as DeliveryRow
      }
      return null
    },

    async updateDelivery(id, patch) {
      const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if (patch.status) row.status = patch.status
      if (patch.deliveredAt) row.delivered_at = patch.deliveredAt
      if (patch.failedAt) row.failed_at = patch.failedAt
      if (patch.openedAt) row.opened_at = patch.openedAt
      if (patch.clickedAt) row.clicked_at = patch.clickedAt
      if (patch.complainedAt) row.complained_at = patch.complainedAt
      if (patch.unsubscribedAt) row.unsubscribed_at = patch.unsubscribedAt
      if (patch.failureReason !== undefined) row.failure_reason = clip(patch.failureReason, 300)
      if (patch.providerMessageId) row.provider_message_id = patch.providerMessageId
      /* An open or a click never moves a bounced or complained row back. */
      let query = db.from("notification_deliveries").update(row).eq("id", id)
      if (patch.status === "delivered") query = query.in("status", ["sending", "sent", "unknown", "retry"])
      const { error } = await query
      if (error) fail("update a delivery", error)
      if (patch.status === "delivered" && !error) {
        /* The timestamp still lands when the status was already further along. */
        await db.from("notification_deliveries").update({ delivered_at: patch.deliveredAt ?? new Date().toISOString() }).eq("id", id).is("delivered_at", null)
      }
    },

    async recipientOf(userId) {
      const { data, error } = await db.from("profiles").select("email, display_name").eq("id", userId).maybeSingle()
      if (error) fail("read a profile", error)
      const p = (data ?? null) as { email?: string | null; display_name?: string | null } | null
      let email: string | null = p?.email ?? null
      const name: string | null = p?.display_name ?? null
      /* The login address is the one that is current; profiles.email can lag an email change. */
      try {
        const auth = (db as unknown as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string | null } | null } }> } } }).auth
        const got = auth?.admin?.getUserById ? await auth.admin.getUserById(userId) : null
        const authEmail = got?.data?.user?.email ?? null
        if (authEmail) email = authEmail
      } catch {
        /* profiles.email stands */
      }
      if (!email && !name) return null
      return { email: email ? lower(email) : null, name }
    },

    async preferences(userId) {
      const { data, error } = await db.from("notification_preferences").select("category, channel, enabled, updated_at").eq("user_id", userId)
      if (error) {
        fail("read preferences", error)
        return []
      }
      return ((data ?? []) as { category: PreferenceCategory; channel: Channel; enabled: boolean; updated_at: string | null }[]).map((r) => ({
        category: r.category,
        channel: r.channel,
        enabled: r.enabled === true,
        updatedAt: r.updated_at ?? null,
      }))
    },

    async setPreference(userId, category, channel, enabled, source) {
      const now = new Date().toISOString()
      const { error } = await db
        .from("notification_preferences")
        .upsert({ user_id: userId, category, channel, enabled, source, updated_at: now }, { onConflict: "user_id,category,channel" })
      if (error) {
        fail("save a preference", error)
        if (!missingSchema(error)) throw new Error(`preference not saved (${error.code ?? "unknown"})`)
      }
    },

    async suppressions(email) {
      const { data, error } = await db.from("email_suppressions").select("scope").eq("email", lower(email)).is("lifted_at", null)
      if (error) {
        fail("read suppressions", error)
        return []
      }
      return ((data ?? []) as { scope: SuppressionScope }[]).map((r) => r.scope)
    },

    async suppress(email, scope, reason, source) {
      const now = new Date().toISOString()
      const { error } = await db
        .from("email_suppressions")
        .upsert({ email: lower(email), scope, reason: clip(reason, 100), source: clip(source, 40), lifted_at: null, updated_at: now }, { onConflict: "email,scope" })
      if (error) fail("suppress an address", error)
    },

    async insertInApp(row) {
      const record = {
        creator_id: row.creatorId,
        user_id: row.userId,
        type: row.bellType,
        title: row.title.slice(0, 200),
        message: row.message.slice(0, 600),
        action_url: row.actionUrl,
        product_id: row.productId ?? null,
        order_id: row.orderId ?? null,
        metadata: { area: row.area, engine: "notify", notification_type: row.type, correlation_id: row.correlationId },
        kind: row.type,
        category: row.bellCategory,
        priority: row.priority,
        dedupe_key: row.dedupeKey.slice(0, 500),
        subject_id: row.dedupeKey.slice(0, 200),
        expires_at: row.expiresAt,
      }
      let attempt = await db.from("seller_notifications").upsert(record, { onConflict: "creator_id,dedupe_key", ignoreDuplicates: true }).select("id")
      if (attempt.error && String(attempt.error.code) === "23503") {
        /* The product or order went between the plan and the write. */
        attempt = await db.from("seller_notifications").upsert({ ...record, product_id: null, order_id: null }, { onConflict: "creator_id,dedupe_key", ignoreDuplicates: true }).select("id")
      }
      if (attempt.error && String(attempt.error.code) === "42703") {
        /* expires_at or order_id not there yet: the bell row without them. */
        const { expires_at: _e, order_id: _o, ...older } = record
        void _e
        void _o
        attempt = await db.from("seller_notifications").upsert(older, { onConflict: "creator_id,dedupe_key", ignoreDuplicates: true }).select("id")
      }
      if (attempt.error) {
        if (String(attempt.error.code) === "23505") return "duplicate"
        fail("write an in-app notification", attempt.error)
        if (missingSchema(attempt.error)) return "unavailable"
        throw new Error(`in-app not written (${attempt.error.code ?? "unknown"})`)
      }
      return (attempt.data ?? []).length > 0 ? "inserted" : "duplicate"
    },

    async markWebhookSeen(id, event) {
      const { data, error } = await db.from("mailgun_webhook_events").upsert({ id: id.slice(0, 200), event: clip(event, 40) }, { onConflict: "id", ignoreDuplicates: true }).select("id")
      if (error) {
        fail("record a webhook", error)
        return "unavailable"
      }
      return (data ?? []).length > 0 ? "new" : "seen"
    },

    async products(creatorId) {
      const { data, error } = await db.from("products").select("*").eq("creator_id", creatorId).limit(200)
      if (error) {
        fail("read products", error)
        return null
      }
      const rows = (data ?? []) as Record<string, unknown>[]
      const digital = rows.filter((p) => p.type === "digital").map((p) => String(p.id))
      const withFile = new Set<string>()
      if (digital.length) {
        const assets = await db.from("digital_assets").select("*").in("product_id", digital.slice(0, 200))
        if (assets.error) {
          fail("read product files", assets.error)
          return null
        }
        for (const a of (assets.data ?? []) as Record<string, unknown>[]) {
          const uploaded = typeof a.upload_status !== "string" || a.upload_status === "completed"
          const blocked = a.scan_status === "infected" || a.scan_status === "quarantined"
          if (a.file_path && uploaded && !blocked) withFile.add(String(a.product_id))
        }
      }
      return rows.map((p) => ({
        id: String(p.id),
        status: typeof p.status === "string" ? p.status : null,
        type: typeof p.type === "string" ? p.type : null,
        title: typeof p.title === "string" ? p.title : null,
        archived: p.archived === true || p.status === "archived",
        hasFile: p.type !== "digital" || withFile.has(String(p.id)),
      }))
    },

    async payments(creatorId) {
      const { data, error } = await db.from("creators").select("*").eq("id", creatorId).maybeSingle()
      if (error || !data) {
        if (error) fail("read a creator's payments", error)
        return null
      }
      const c = data as Record<string, unknown>
      /* select *, so a database without part 63's columns simply reads nothing here. */
      const asked = Array.isArray(c.stripe_requirements) ? c.stripe_requirements.filter((r): r is string => typeof r === "string" && r.length > 0).slice(0, 30) : null
      return {
        stripeAccountId: typeof c.stripe_account_id === "string" ? c.stripe_account_id : null,
        chargesEnabled: c.charges_enabled === true,
        payoutsEnabled: c.payouts_enabled === true,
        detailsSubmitted: c.details_submitted === true,
        status: typeof c.stripe_onboarding_status === "string" ? c.stripe_onboarding_status : null,
        requirements: asked,
        requirementsDueBy: typeof c.stripe_requirements_due_at === "string" ? c.stripe_requirements_due_at : null,
      }
    },

    /*
     * Home's own reads (lib/home/progress-server), imported here and not at
     * the top of the file, because they are server only and this module is
     * also compiled for the tests. One read of eight small queries, and only
     * when a setup reminder is due.
     */
    async setupProgress(userId) {
      try {
        const { readProgressFacts } = await import("@/lib/home/progress-server")
        return await readProgressFacts(db, { userId })
      } catch (error) {
        fail("read setup progress", error as PgError)
        return null
      }
    },

    async payoutStatus(payoutId) {
      const { data, error } = await db.from("payouts").select("status").eq("stripe_payout_id", payoutId).limit(1)
      if (error) {
        fail("read a payout", error)
        return null
      }
      const row = (data ?? [])[0] as { status?: string | null } | undefined
      return row ? (row.status ?? null) : undefined
    },

    async disputeClosed(disputeId) {
      const { data, error } = await db.from("ledger_events").select("id").eq("stripe_dispute_id", disputeId).eq("event_type", "dispute_closed").limit(1)
      if (error) {
        fail("read a dispute", error)
        return null
      }
      return (data ?? []).length > 0
    },

    async reviewRequestFacts(orderId) {
      const none: ReviewRequestFactsRow = { order: null, product: null, sellerUserId: null, reviewed: false, suppressed: [], creatorName: null, productSlug: null, productImage: null, creatorSupportEmail: null }
      if (!/^[0-9a-f-]{36}$/i.test(orderId)) return none
      const { data: order, error } = await db.from("orders").select("*").eq("id", orderId).maybeSingle()
      if (error) {
        fail("read an order", error)
        return null
      }
      if (!order) return none
      const o = order as Record<string, any>
      const [{ data: product, error: productError }, reviewed, suppressed] = await Promise.all([
        db.from("products").select("id, title, slug, status, creator_id, thumbnail_url").eq("id", o.product_id).maybeSingle(),
        (async () => {
          /* On this order, by the buyer's account, or on another order of theirs for the same product by the same address. */
          const byOrder = await db.from("reviews").select("id").eq("order_id", o.id).limit(1)
          if (byOrder.error) return null
          if ((byOrder.data ?? []).length) return true
          if (o.buyer_id) {
            const byBuyer = await db.from("reviews").select("id").eq("buyer_id", o.buyer_id).eq("product_id", o.product_id).limit(1)
            if (byBuyer.error) return null
            if ((byBuyer.data ?? []).length) return true
          }
          if (o.buyer_email) {
            const same = await db.from("orders").select("id").eq("buyer_email", lower(String(o.buyer_email))).eq("product_id", o.product_id)
            const ids = ((same.data ?? []) as { id: string }[]).map((r) => r.id).filter((id) => id !== o.id)
            if (ids.length) {
              const byEmail = await db.from("reviews").select("id").in("order_id", ids).limit(1)
              if (byEmail.error) return null
              if ((byEmail.data ?? []).length) return true
            }
          }
          return false
        })(),
        (async () => {
          if (!o.buyer_email) return [] as SuppressionScope[]
          const { data } = await db.from("email_suppressions").select("scope").eq("email", lower(String(o.buyer_email))).is("lifted_at", null)
          return ((data ?? []) as { scope: SuppressionScope }[]).map((r) => r.scope)
        })(),
      ])
      if (productError || reviewed === null) {
        fail("read a review request", productError ?? { code: "reviews" })
        return null
      }
      const p = product as { id: string; title: string | null; slug: string | null; status: string | null; creator_id: string | null; thumbnail_url?: string | null } | null
      let sellerUserId: string | null = null
      let creatorName: string | null = null
      let creatorSupportEmail: string | null = null
      if (p?.creator_id) {
        const { data: creator } = await db.from("creators").select("user_id, display_name, slug, support_email").eq("id", p.creator_id).maybeSingle()
        sellerUserId = (creator as { user_id?: string | null } | null)?.user_id ?? null
        const { data: profile } = sellerUserId ? await db.from("profiles").select("display_name, username").eq("id", sellerUserId).maybeSingle() : { data: null }
        const c = creator as { display_name?: string | null; slug?: string | null; support_email?: string | null } | null
        /* The name the buyer already knows the seller by, the same order lib/email.tsx resolveCreatorIdentity uses. */
        creatorName = (profile as { display_name?: string | null } | null)?.display_name || c?.display_name || (profile as { username?: string | null } | null)?.username || c?.slug || null
        /* Only the address the seller published for support: never their login, which they did not give a buyer. */
        creatorSupportEmail = clip(c?.support_email ?? null, 200)
      }
      return {
        order: {
          id: o.id,
          status: o.status ?? null,
          amount_cents: o.amount_cents ?? null,
          refund_amount_cents: o.refund_amount_cents ?? null,
          source: o.source ?? null,
          source_detail: o.source_detail ?? null,
          created_at: o.created_at ?? null,
          buyer_id: o.buyer_id ?? null,
          buyer_email: o.buyer_email ?? null,
          receipt_token: o.receipt_token ?? null,
          product_id: o.product_id ?? null,
        },
        product: p ? { id: p.id, title: p.title, status: p.status, creator_id: p.creator_id } : null,
        sellerUserId,
        reviewed,
        suppressed,
        creatorName,
        productSlug: p?.slug ?? null,
        productImage: clip(p?.thumbnail_url ?? null, 1000),
        creatorSupportEmail,
      }
    },

    async domainStatus(domainId) {
      const { data, error } = await db.from("custom_domains").select("status, ssl_status").eq("id", domainId).maybeSingle()
      if (error) {
        fail("read a domain", error)
        return null
      }
      if (!data) return undefined
      const d = data as { status?: string | null; ssl_status?: string | null }
      return { status: d.status ?? null, sslStatus: d.ssl_status ?? null }
    },
  }
}

function defaultLog(line: string, code?: string) {
  console.warn(JSON.stringify({ level: "warn", area: "notify", msg: line, code }))
}
