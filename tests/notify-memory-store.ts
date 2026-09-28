/**
 * ===========================================================================
 *  THE NOTIFICATION ENGINE'S TABLES, IN MEMORY
 * ===========================================================================
 * A NotifyStore (lib/notify/store.ts) over plain arrays, for the engine and
 * webhook tests. It keeps the promises Postgres keeps for the real store:
 * one event per key, one job per idempotency key, one delivery per job and
 * channel, one bell row per dedupe key, one webhook per event id, and a
 * claim that hands a row to one worker only (the claim is synchronous, so
 * two runs at once cannot both take it).
 *
 * `clock` is the store's now, so a test can move time forward and the claim
 * sees delayed jobs come due. `products`, `payments` and friends are the
 * facts the conditions read; a test changes them between plan and send.
 */
import type {
  DeliveryBegin,
  DeliveryRow,
  EventRow,
  InAppRecord,
  JobRow,
  NotifyStore,
  PaymentFact,
  PreferenceRow,
  PreferenceSource,
  ProductFact,
  ReviewRequestFactsRow,
  SuppressionScope,
} from "../lib/notify/store"
import type { Channel, PreferenceCategory } from "../lib/notify/types"

type Delivery = DeliveryRow & { updated_at: string; delivered_at?: string; opened_at?: string; clicked_at?: string; complained_at?: string; unsubscribed_at?: string; failed_at?: string; correlation_id: string | null }
type EventState = EventRow & { processed_at: string | null; claimed_until: string | null; last_error: string | null; source: string }
type JobState = JobRow & { last_error: string | null; finished_at: string | null }

export class MemoryNotifyStore implements NotifyStore {
  readonly isNotifyStore = true as const
  clock = { now: Date.parse("2026-10-01T09:00:00Z") }
  events: EventState[] = []
  jobs: JobState[] = []
  deliveries: Delivery[] = []
  prefs = new Map<string, PreferenceRow & { source: PreferenceSource }>()
  suppressed = new Map<string, { scope: SuppressionScope; reason: string; source: string }>()
  bell: InAppRecord[] = []
  webhooks = new Set<string>()
  users = new Map<string, { email: string | null; name: string | null }>()
  creators = new Map<string, string>()
  productFacts = new Map<string, ProductFact[]>()
  paymentFacts = new Map<string, PaymentFact>()
  payoutStatuses = new Map<string, string | null>()
  closedDisputes = new Set<string>()
  domains = new Map<string, { status: string | null; sslStatus: string | null }>()
  /** Per order: what the review request rule reads (lib/reviews/request-rules). */
  reviewFacts = new Map<string, ReviewRequestFactsRow>()
  /** Set to make a read fail, as a database outage would. */
  failReads = false
  private seq = 0

  private id(prefix: string) {
    this.seq++
    return `${prefix}-0000-4000-8000-${String(this.seq).padStart(12, "0")}`
  }
  private nowIso() {
    return new Date(this.clock.now).toISOString()
  }

  async insertEvent(e: Parameters<NotifyStore["insertEvent"]>[0]) {
    if (this.events.some((x) => x.event_key === e.key)) return { status: "duplicate" as const }
    const row: EventState = {
      id: this.id("aaaaaaaa"),
      name: e.name,
      event_key: e.key,
      user_id: e.userId ?? null,
      creator_id: e.creatorId ?? null,
      entity_type: e.entityType ?? null,
      entity_id: e.entityId ?? null,
      payload: e.payload ?? {},
      occurred_at: e.occurredAt,
      correlation_id: e.correlationId ?? null,
      attempts: 0,
      processed_at: null,
      claimed_until: null,
      last_error: null,
      source: e.source ?? "app",
    }
    this.events.push(row)
    return { status: "inserted" as const, id: row.id }
  }

  async claimEvents(limit: number, leaseSeconds: number) {
    const now = this.clock.now
    const free = this.events.filter((e) => !e.processed_at && (!e.claimed_until || Date.parse(e.claimed_until) < now) && e.attempts < 10).slice(0, limit)
    for (const e of free) {
      e.claimed_until = new Date(now + leaseSeconds * 1000).toISOString()
      e.attempts++
    }
    return free.map((e) => ({ ...e }))
  }

  async finishEvent(id: string, error: string | null, retryAt?: string | null) {
    const e = this.events.find((x) => x.id === id)
    if (!e) return
    if (error) {
      e.last_error = error
      e.claimed_until = retryAt ?? null
    } else {
      e.processed_at = this.nowIso()
      e.claimed_until = null
      e.last_error = null
    }
  }

  async creatorUser(creatorId: string) {
    return this.creators.get(creatorId) ?? null
  }

  async insertJobs(jobs: Parameters<NotifyStore["insertJobs"]>[0]) {
    let n = 0
    for (const j of jobs) {
      if (this.jobs.some((x) => x.idempotency_key === j.idempotencyKey)) continue
      n++
      this.jobs.push({
        id: this.id("bbbbbbbb"),
        event_id: j.eventId,
        type: j.type,
        recipient_type: j.recipientType,
        recipient_user_id: j.recipientUserId ?? null,
        recipient_email: j.recipientEmail ? j.recipientEmail.toLowerCase() : null,
        creator_id: j.creatorId ?? null,
        entity_type: j.entityType ?? null,
        entity_id: j.entityId ?? null,
        idempotency_key: j.idempotencyKey,
        workflow: j.workflow ?? null,
        step: j.step ?? null,
        condition: j.condition ?? null,
        state: "pending",
        skip_reason: null,
        run_at: j.runAt,
        expires_at: j.expiresAt ?? null,
        attempts: 0,
        max_attempts: j.maxAttempts,
        claimed_by: null,
        claimed_until: null,
        data: j.data ?? {},
        correlation_id: j.correlationId,
        sent_at: null,
        created_at: this.nowIso(),
        last_error: null,
        finished_at: null,
      })
    }
    return n
  }

  async cancelJobs(c: { workflow: string; recipientUserId: string; reason: string }) {
    let n = 0
    for (const j of this.jobs) {
      if (j.workflow === c.workflow && j.recipient_user_id === c.recipientUserId && j.state === "pending") {
        j.state = "cancelled"
        j.skip_reason = "WORKFLOW_CANCELLED"
        j.last_error = c.reason
        n++
      }
    }
    return n
  }

  async claimJobs(worker: string, limit: number, leaseSeconds: number) {
    const now = this.clock.now
    for (const j of this.jobs) {
      if (j.state === "pending" && j.expires_at && Date.parse(j.expires_at) <= now) {
        j.state = "skipped"
        j.skip_reason = "EXPIRED"
      }
    }
    const due = this.jobs
      .filter((j) => ((j.state === "pending" && Date.parse(j.run_at) <= now) || (j.state === "processing" && j.claimed_until && Date.parse(j.claimed_until) < now)) && (!j.expires_at || Date.parse(j.expires_at) > now))
      .sort((a, b) => Date.parse(a.run_at) - Date.parse(b.run_at))
      .slice(0, limit)
    for (const j of due) {
      j.state = "processing"
      j.claimed_by = worker
      j.claimed_until = new Date(now + leaseSeconds * 1000).toISOString()
      j.attempts++
    }
    return due.map((j) => ({ ...j, data: { ...j.data } }))
  }

  async finishJob(id: string, worker: string, patch: Parameters<NotifyStore["finishJob"]>[2]) {
    const j = this.jobs.find((x) => x.id === id)
    if (!j || j.state !== "processing" || j.claimed_by !== worker) return false
    j.state = patch.state
    j.skip_reason = patch.skipReason ?? null
    j.last_error = patch.error ?? null
    j.claimed_until = null
    j.finished_at = this.nowIso()
    if (patch.state === "sent") j.sent_at = this.nowIso()
    return true
  }

  async rescheduleJob(id: string, worker: string, runAt: string, error: string | null, countAttempt: boolean) {
    const j = this.jobs.find((x) => x.id === id)
    if (!j || j.state !== "processing" || j.claimed_by !== worker) return false
    j.state = "pending"
    j.run_at = runAt
    j.last_error = error
    j.claimed_by = null
    j.claimed_until = null
    if (!countAttempt) j.attempts = Math.max(0, j.attempts - 1)
    return true
  }

  async lastSentAt(q: Parameters<NotifyStore["lastSentAt"]>[0]) {
    const rows = this.jobs.filter(
      (j) =>
        j.type === q.type &&
        j.state === "sent" &&
        j.id !== q.excludeJobId &&
        (q.recipientUserId ? j.recipient_user_id === q.recipientUserId : q.recipientEmail ? j.recipient_email === q.recipientEmail.toLowerCase() : false) &&
        (q.entityId ? j.entity_id === q.entityId : j.entity_id === null),
    )
    const times = rows.map((j) => j.sent_at).filter((t): t is string => !!t).sort()
    return times.length ? times[times.length - 1] : null
  }

  async beginDelivery(d: Parameters<NotifyStore["beginDelivery"]>[0]): Promise<DeliveryBegin> {
    const found = this.deliveries.find((x) => x.job_id === d.jobId && x.channel === d.channel)
    if (!found) {
      const row: Delivery = {
        id: this.id("cccccccc"),
        job_id: d.jobId,
        channel: d.channel,
        provider: d.provider,
        provider_message_id: null,
        status: "sending",
        attempt_count: 1,
        recipient_email: d.recipientEmail ? d.recipientEmail.toLowerCase() : null,
        recipient_user_id: d.recipientUserId,
        type: d.type,
        category: d.category,
        requirement: d.requirement,
        skip_reason: null,
        failure_reason: null,
        sent_at: null,
        created_at: this.nowIso(),
        updated_at: this.nowIso(),
        correlation_id: d.correlationId,
      }
      this.deliveries.push(row)
      return { kind: "go", deliveryId: row.id, attempt: 1 }
    }
    if (found.status === "retry") {
      found.status = "sending"
      found.attempt_count++
      return { kind: "go", deliveryId: found.id, attempt: found.attempt_count }
    }
    if (found.status === "sending") {
      found.status = "unknown"
      found.failure_reason = "The worker stopped during the send."
      return { kind: "uncertain", deliveryId: found.id }
    }
    if (found.status === "unknown") return { kind: "uncertain", deliveryId: found.id }
    if (found.status === "failed" || found.status === "skipped" || found.status === "bounced") return { kind: "final", deliveryId: found.id }
    return { kind: "done", deliveryId: found.id }
  }

  async finishDelivery(id: string, patch: Parameters<NotifyStore["finishDelivery"]>[1]) {
    const d = this.deliveries.find((x) => x.id === id)
    if (!d) return
    d.status = patch.status
    if (patch.providerMessageId !== undefined) d.provider_message_id = patch.providerMessageId
    if (patch.failureReason !== undefined) d.failure_reason = patch.failureReason
    if (patch.skipReason !== undefined) d.skip_reason = patch.skipReason
    if (patch.status === "sent") d.sent_at = this.nowIso()
  }

  async skipDelivery(d: Parameters<NotifyStore["skipDelivery"]>[0], reason: string) {
    if (this.deliveries.some((x) => x.job_id === d.jobId && x.channel === d.channel)) return
    this.deliveries.push({
      id: this.id("dddddddd"),
      job_id: d.jobId,
      channel: d.channel,
      provider: d.provider,
      provider_message_id: null,
      status: "skipped",
      attempt_count: 0,
      recipient_email: d.recipientEmail,
      recipient_user_id: d.recipientUserId,
      type: d.type,
      category: d.category,
      requirement: d.requirement,
      skip_reason: reason,
      failure_reason: null,
      sent_at: null,
      created_at: this.nowIso(),
      updated_at: this.nowIso(),
      correlation_id: d.correlationId,
    })
  }

  async emailsSentSince(q: Parameters<NotifyStore["emailsSentSince"]>[0]) {
    return this.deliveries.filter(
      (d) =>
        d.channel === "email" &&
        d.recipient_email === q.recipientEmail.toLowerCase() &&
        ["sending", "sent", "unknown", "delivered"].includes(d.status) &&
        d.requirement !== null &&
        q.requirements.includes(d.requirement) &&
        d.created_at >= q.sinceIso &&
        (!q.categories || (d.category !== null && q.categories.includes(d.category))),
    ).length
  }

  async findDelivery(q: { deliveryId?: string | null; providerMessageId?: string | null }) {
    if (q.deliveryId) {
      const d = this.deliveries.find((x) => x.id === q.deliveryId)
      if (d) return d
    }
    if (q.providerMessageId) {
      const id = q.providerMessageId.replace(/^<|>$/g, "")
      const d = this.deliveries.find((x) => x.provider_message_id === id || x.provider_message_id === `<${id}>`)
      if (d) return d
    }
    return null
  }

  async updateDelivery(id: string, patch: Parameters<NotifyStore["updateDelivery"]>[1]) {
    const d = this.deliveries.find((x) => x.id === id)
    if (!d) return
    if (patch.status && !(patch.status === "delivered" && !["sending", "sent", "unknown", "retry"].includes(d.status))) d.status = patch.status
    if (patch.deliveredAt) d.delivered_at = patch.deliveredAt
    if (patch.openedAt) d.opened_at = patch.openedAt
    if (patch.clickedAt) d.clicked_at = patch.clickedAt
    if (patch.complainedAt) d.complained_at = patch.complainedAt
    if (patch.unsubscribedAt) d.unsubscribed_at = patch.unsubscribedAt
    if (patch.failedAt) d.failed_at = patch.failedAt
    if (patch.failureReason !== undefined) d.failure_reason = patch.failureReason ?? null
  }

  async recipientOf(userId: string) {
    return this.users.get(userId) ?? null
  }

  async preferences(userId: string) {
    return [...this.prefs.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([, v]) => ({ category: v.category, channel: v.channel, enabled: v.enabled, updatedAt: v.updatedAt }))
  }

  async setPreference(userId: string, category: PreferenceCategory, channel: Channel, enabled: boolean, source: PreferenceSource) {
    this.prefs.set(`${userId}|${category}|${channel}`, { category, channel, enabled, updatedAt: this.nowIso(), source })
  }

  async suppressions(email: string) {
    const e = email.toLowerCase()
    return [...this.suppressed.entries()].filter(([k]) => k.startsWith(`${e}|`)).map(([, v]) => v.scope)
  }

  async suppress(email: string, scope: SuppressionScope, reason: string, source: string) {
    this.suppressed.set(`${email.toLowerCase()}|${scope}`, { scope, reason, source })
  }

  async insertInApp(row: InAppRecord) {
    if (this.bell.some((b) => b.creatorId === row.creatorId && b.dedupeKey === row.dedupeKey)) return "duplicate" as const
    this.bell.push(row)
    return "inserted" as const
  }

  async markWebhookSeen(id: string) {
    if (this.webhooks.has(id)) return "seen" as const
    this.webhooks.add(id)
    return "new" as const
  }

  async products(creatorId: string) {
    if (this.failReads) return null
    return this.productFacts.get(creatorId) ?? []
  }

  async payments(creatorId: string) {
    if (this.failReads) return null
    return this.paymentFacts.get(creatorId) ?? { stripeAccountId: null, chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false, status: null }
  }

  async payoutStatus(payoutId: string) {
    if (this.failReads) return null
    return this.payoutStatuses.has(payoutId) ? this.payoutStatuses.get(payoutId)! : undefined
  }

  async disputeClosed(disputeId: string) {
    if (this.failReads) return null
    return this.closedDisputes.has(disputeId)
  }

  async domainStatus(domainId: string) {
    if (this.failReads) return null
    return this.domains.get(domainId)
  }

  async reviewRequestFacts(orderId: string) {
    if (this.failReads) return null
    const facts = this.reviewFacts.get(orderId)
    if (!facts) return { order: null, product: null, sellerUserId: null, reviewed: false, suppressed: [], creatorName: null, productSlug: null, productImage: null, creatorSupportEmail: null }
    /* The address's review request unsubscribe, as the real store reads it from email_suppressions. */
    const email = facts.order?.buyer_email?.toLowerCase() ?? ""
    return { ...facts, suppressed: [...facts.suppressed, ...(await this.suppressions(email))] }
  }
}
