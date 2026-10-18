/**
 * ===========================================================================
 *  THE WORK: EVENTS INTO JOBS, DUE JOBS INTO DELIVERIES
 * ===========================================================================
 * Two passes, both claimed from Postgres with a lease, so any number of
 * workers (the cron, a request's after(), a retry) can run at once and never
 * handle the same row together:
 *
 *   events   claim_notification_events: each outbox row is handed to the
 *            orchestrator, its cancellations applied, its jobs written ON
 *            CONFLICT DO NOTHING, and the row marked processed. A failure
 *            leaves it for a later run, a little later each time.
 *
 *   jobs     claim_notification_jobs: each due job is decided again from
 *            what is true now, in this order, and the first "no" ends it:
 *
 *              registry      an unknown type fails
 *              expiry        past expires_at: skipped EXPIRED
 *              attempts      over max_attempts: failed
 *              recipient     the registry's recipient type, and a user for
 *                            a creator or an address for a customer:
 *                            WRONG_RECIPIENT_TYPE, NO_RECIPIENT
 *              condition     read fresh (conditions.ts): CONDITION_NO_LONGER_TRUE
 *              cooldown      the same type to the same person about the same
 *                            thing within the registry's cooldown: COOLDOWN
 *              lifecycle     one lifecycle email a day: the job waits
 *
 *            then each channel on its own:
 *
 *              in app        preference, then the bell row (idempotent)
 *              email         sent elsewhere, the email list (email-budget.ts:
 *                            a type that is never an email is skipped
 *                            EMAIL_BUDGET), address, an amount with no
 *                            currency (held: CURRENCY_UNKNOWN), preference,
 *                            suppression, three optional emails a day, the
 *                            account's daily cap on budgeted emails, then
 *                            the delivery row in "sending", then the send
 *
 * WRITE BEFORE SEND. The delivery row (unique per job and channel) is written
 * before the provider is called. A worker that dies mid-send leaves it in
 * "sending"; whoever claims the job next finds it, marks it unknown and does
 * not send again, because the provider may already have it.
 *
 * RETRIES. A provider "try later" puts the job back to pending at 1 minute,
 * 5 minutes, 30 minutes, 2 hours, then 6 hours, until max_attempts, then it
 * fails. A permanent refusal of the address fails it at once and suppresses
 * the address. A timeout is unknown and never retried.
 *
 * Nothing waits in memory: a delay is a run_at in the table.
 */
import { flagHeldEmail, moneyWithoutCurrency } from "@/lib/money/held-email"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { checkCondition, isConditionName } from "./conditions"
import { ACCOUNT_DAILY_EMAIL_CAP, BUDGETED_TYPES, emailAllowed, emailClass } from "./email-budget"
import type { EmailSend } from "./channels/email"
import type { InAppWrite } from "./channels/in-app"
import { notifyLog, reasonText } from "./log"
import { handle } from "./orchestrator"
import { decide } from "./preferences"
import { REGISTRY, isNotificationType } from "./registry"
import type { DeliveryStart, EventRow, JobRow, NotifyStore, PreferenceRow } from "./store"
import { blocks } from "./suppressions"
import { LIVE_CHANNELS, type Channel, type DomainEvent, type RegistryEntry, type SkipReason } from "./types"

export const LEASE_SECONDS = 120
export const EVENT_LEASE_SECONDS = 60
export const MAX_ATTEMPTS = 5
export const CONCURRENCY = 4
export const OPTIONAL_DAILY_CAP = 3
export const LIFECYCLE_DAILY_CAP = 1
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 6 * 3_600_000]
const DAY_MS = 86_400_000
const LIFECYCLE_WAIT_MS = 6 * 3_600_000
const CONDITION_WAIT_MS = 15 * 60_000

export const UNCERTAIN = "The email service did not answer. It may have arrived, so it was not sent again."

/** How long to wait after this many attempts. */
export function retryDelayMs(attempts: number): number {
  return BACKOFF_MS[Math.max(0, Math.min(BACKOFF_MS.length - 1, attempts - 1))]
}

export interface EngineDeps {
  store: NotifyStore
  email: EmailSend | null
  inApp: InAppWrite | null
  /** The provider's name, for the delivery row. */
  providerName?: string
  worker: string
  now?: () => number
  concurrency?: number
  batch?: number
}

export interface WorkSummary {
  available: boolean
  events: number
  eventErrors: number
  planned: number
  cancelled: number
  jobs: number
  sent: number
  skipped: number
  failed: number
  retried: number
  deferred: number
  stoppedForTime: boolean
}

export function emptySummary(): WorkSummary {
  return { available: true, events: 0, eventErrors: 0, planned: 0, cancelled: 0, jobs: 0, sent: 0, skipped: 0, failed: 0, retried: 0, deferred: 0, stoppedForTime: false }
}

const clock = (deps: EngineDeps) => (deps.now ?? Date.now)()
const iso = (ms: number) => new Date(ms).toISOString()

/* ── Events ──────────────────────────────────────────────────────────── */

export function eventOf(row: EventRow): DomainEvent {
  return {
    id: row.id,
    name: row.name,
    key: row.event_key,
    userId: row.user_id,
    creatorId: row.creator_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload ?? {},
    occurredAt: row.occurred_at,
    correlationId: row.correlation_id,
  }
}

export async function handleEvent(deps: EngineDeps, row: EventRow, summary: WorkSummary): Promise<void> {
  const correlationId = row.correlation_id ?? row.id
  try {
    const userId = row.user_id ?? (row.creator_id ? await deps.store.creatorUser(row.creator_id) : null)
    const { jobs, cancel } = handle(eventOf(row), { now: clock(deps), userId, creatorId: row.creator_id })
    for (const c of cancel) summary.cancelled += await deps.store.cancelJobs(c)
    summary.planned += await deps.store.insertJobs(
      jobs.map((j) => ({ ...j, eventId: row.id, correlationId, condition: REGISTRY[j.type].condition ?? null, maxAttempts: MAX_ATTEMPTS })),
    )
    await deps.store.finishEvent(row.id, null)
    notifyLog("info", "event handled", { event: row.name, eventId: row.id, correlationId, jobs: jobs.length, cancels: cancel.length })
  } catch (error) {
    summary.eventErrors++
    const wait = Math.min(3_600_000, 60_000 * 2 ** Math.max(0, row.attempts - 1))
    await deps.store.finishEvent(row.id, reasonText(error), iso(clock(deps) + wait)).catch(() => undefined)
    notifyLog("warn", "event not handled", { event: row.name, eventId: row.id, correlationId, attempts: row.attempts, error: reasonText(error) })
  }
}

/* ── Jobs ────────────────────────────────────────────────────────────── */

type ChannelOutcome =
  | { kind: "sent" }
  | { kind: "skip"; reason: SkipReason }
  | { kind: "retry"; error: string }
  | { kind: "failed"; error: string }

export type JobOutcome = "sent" | "skipped" | "failed" | "retried" | "deferred" | "lost"

export async function processJob(deps: EngineDeps, claimed: JobRow): Promise<JobOutcome> {
  const { store, worker } = deps
  let job = claimed
  const now = clock(deps)
  const correlationId = job.correlation_id ?? job.id
  const fields = { jobId: job.id, type: job.type, correlationId, attempt: job.attempts }

  const finish = async (state: "sent" | "skipped" | "failed" | "cancelled", skipReason: SkipReason | null, error: string | null): Promise<JobOutcome> => {
    const ok = await store.finishJob(job.id, worker, { state, skipReason, error })
    notifyLog(state === "failed" ? "warn" : "info", `job ${state}`, { ...fields, skipReason, error })
    if (!ok) return "lost"
    return state === "cancelled" ? "skipped" : state
  }
  const skip = (reason: SkipReason) => finish("skipped", reason, null)

  if (!isNotificationType(job.type)) return finish("failed", null, "Unknown notification type")
  const entry = REGISTRY[job.type]

  if (job.expires_at && Date.parse(job.expires_at) <= now) return skip("EXPIRED")
  if (job.attempts > job.max_attempts) return finish("failed", null, "Too many attempts")

  /* A creator template never goes to a customer, and the reverse. */
  if (job.recipient_type !== entry.recipient) return skip("WRONG_RECIPIENT_TYPE")
  if (entry.recipient === "creator" && !job.recipient_user_id) return skip("NO_RECIPIENT")
  if (entry.recipient === "customer" && !job.recipient_email) return skip("NO_RECIPIENT")

  const conditionName = job.condition ?? entry.condition ?? null
  if (conditionName && isConditionName(conditionName)) {
    const facts: Record<string, unknown> = {}
    const holds = await checkCondition(store, conditionName, job, facts, now)
    if (holds === null) {
      await store.rescheduleJob(job.id, worker, iso(now + CONDITION_WAIT_MS), "The condition could not be read", true)
      return "retried"
    }
    if (!holds) {
      /* Which rule said no, for the trace (lib/reviews/request-rules names them). */
      if (typeof facts.reviewSkipped === "string") notifyLog("info", "review request not due", { ...fields, why: facts.reviewSkipped })
      return skip("CONDITION_NO_LONGER_TRUE")
    }
    /* The email names what is true now (the draft as it is today), not what the plan knew. */
    if (Object.keys(facts).length) job = { ...job, data: { ...(job.data ?? {}), ...facts } }
  }

  if (entry.cooldownSeconds > 0) {
    const last = await store.lastSentAt({ type: job.type, recipientUserId: job.recipient_user_id, recipientEmail: job.recipient_user_id ? null : job.recipient_email, entityId: job.entity_id, excludeJobId: job.id })
    if (last && now - Date.parse(last) < entry.cooldownSeconds * 1000) return skip("COOLDOWN")
  }

  const channels = entry.channels.filter((c): c is Channel => LIVE_CHANNELS.includes(c))
  const wantsEmail = channels.includes("email") && !entry.emailSentElsewhere

  let recipient: { email: string | null; name: string | null } | null = null
  if (job.recipient_user_id) recipient = await store.recipientOf(job.recipient_user_id)
  /* A second business of a login has the owner's address with a tag (lib/businesses/email-alias): its mail goes to the owner's own inbox, as the sale and refund emails do. A customer's address is theirs as given. */
  const given = (job.recipient_email || recipient?.email || "").trim()
  const address = (entry.recipient === "customer" ? given : ownerAddress(given) ?? "").toLowerCase() || null

  let prefs: PreferenceRow[] | null = null
  const preferences = async () => (prefs ??= job.recipient_user_id ? await store.preferences(job.recipient_user_id) : [])
  /* One lifecycle nudge a day, when the email would go at all: the job waits rather than drops, and its expiry ends the wait. */
  if (wantsEmail && address && (!job.recipient_user_id || decide(await preferences(), entry, "email")) && entry.category === "lifecycle" && entry.requirement !== "required_service") {
    const recent = await store.emailsSentSince({ recipientEmail: address, sinceIso: iso(now - DAY_MS), requirements: ["optional_product", "marketing"], categories: ["lifecycle"] })
    if (recent >= LIFECYCLE_DAILY_CAP) {
      const at = now + LIFECYCLE_WAIT_MS
      if (job.expires_at && Date.parse(job.expires_at) <= at) return skip("DAILY_CAP")
      await store.rescheduleJob(job.id, worker, iso(at), "One lifecycle email a day", false)
      notifyLog("info", "job deferred", { ...fields, reason: "lifecycle daily cap" })
      return "deferred"
    }
  }

  const start = (channel: Channel): DeliveryStart => ({
    jobId: job.id,
    channel,
    provider: channel === "email" ? (deps.providerName ?? "mailgun") : "storelib",
    type: entry.type,
    category: entry.category,
    requirement: entry.requirement,
    recipientEmail: channel === "email" ? address : null,
    recipientUserId: job.recipient_user_id,
    correlationId,
  })
  const skipChannel = async (channel: Channel, reason: SkipReason): Promise<ChannelOutcome> => {
    await store.skipDelivery(start(channel), reason)
    return { kind: "skip", reason }
  }

  const outcomes: { channel: Channel; outcome: ChannelOutcome }[] = []
  /* The bell first: it is idempotent and cannot be sent twice, so a retry for the email costs it nothing. */
  const ordered = [...channels.filter((c) => c === "in_app"), ...channels.filter((c) => c !== "in_app")]
  for (const channel of ordered) {
    let outcome: ChannelOutcome
    try {
      outcome = channel === "in_app" ? await deliverInApp() : channel === "email" ? await deliverEmail() : { kind: "skip", reason: "NO_RECIPIENT" }
    } catch (error) {
      outcome = { kind: "retry", error: reasonText(error) }
    }
    outcomes.push({ channel, outcome })
  }

  async function deliverInApp(): Promise<ChannelOutcome> {
    if (!deps.inApp || entry.recipient !== "creator" || !job.recipient_user_id || !job.creator_id) return skipChannel("in_app", "NO_RECIPIENT")
    if (!decide(await preferences(), entry, "in_app")) return skipChannel("in_app", "PREFERENCE_OFF")
    const begun = await store.beginDelivery(start("in_app"))
    if (begun.kind === "unavailable") return { kind: "retry", error: "The delivery could not be recorded" }
    if (begun.kind === "done") return { kind: "sent" }
    if (begun.kind === "final") return { kind: "skip", reason: "DUPLICATE" }
    /* A bell row is idempotent on its dedupe key, so an interrupted write is simply written again. */
    const wrote = await deps.inApp({ job, entry, recipientName: recipient?.name ?? null })
    if (wrote === "unavailable") {
      await store.finishDelivery(begun.deliveryId, { status: "retry", failureReason: "The bell could not be written" })
      return { kind: "retry", error: "The bell could not be written" }
    }
    await store.finishDelivery(begun.deliveryId, { status: "sent" })
    return { kind: "sent" }
  }

  async function deliverEmail(): Promise<ChannelOutcome> {
    if (entry.emailSentElsewhere) return skipChannel("email", "EMAIL_SENT_ELSEWHERE")
    if (!emailAllowed(entry.type)) return skipChannel("email", "EMAIL_BUDGET")
    if (!deps.email || !address) return skipChannel("email", "NO_RECIPIENT")
    /* An amount with no currency is never emailed, not even as a bare number: held and flagged for the admin. */
    if (moneyWithoutCurrency(job.data)) {
      await flagHeldEmail({ email: "Notification", orderId: typeof job.data?.orderId === "string" ? job.data.orderId : null, type: String(entry.type) })
      return skipChannel("email", "CURRENCY_UNKNOWN")
    }
    if (job.recipient_user_id && !decide(await preferences(), entry, "email")) return skipChannel("email", "PREFERENCE_OFF")
    if (!job.recipient_user_id && entry.requirement === "marketing") return skipChannel("email", "PREFERENCE_OFF")
    if (blocks(await store.suppressions(address), entry.requirement)) return skipChannel("email", "SUPPRESSED")
    if (entry.requirement !== "required_service") {
      const recent = await store.emailsSentSince({ recipientEmail: address, sinceIso: iso(now - DAY_MS), requirements: ["optional_product", "marketing"] })
      if (recent >= OPTIONAL_DAILY_CAP) return skipChannel("email", "DAILY_CAP")
    }
    const budgeted = emailClass(entry.type) === "budgeted"
    const budgetedSince = () => store.emailsSentSince({ recipientEmail: address, sinceIso: iso(now - DAY_MS), requirements: ["required_service", "optional_product", "marketing"], types: BUDGETED_TYPES })
    if (budgeted && (await budgetedSince()) >= ACCOUNT_DAILY_EMAIL_CAP) return skipChannel("email", "DAILY_CAP")

    const begun = await store.beginDelivery(start("email"))
    if (begun.kind === "unavailable") return { kind: "retry", error: "The delivery could not be recorded" }
    if (begun.kind === "done") return { kind: "sent" }
    if (begun.kind === "uncertain") return { kind: "failed", error: UNCERTAIN }
    if (begun.kind === "final") return { kind: "failed", error: "Already failed" }
    if (entry.requirement !== "required_service") {
      /* Counted again with this row written: another worker sending to the same address at the same moment cannot take both the last places. */
      const counted = await store.emailsSentSince({ recipientEmail: address, sinceIso: iso(now - DAY_MS), requirements: ["optional_product", "marketing"] })
      if (counted > OPTIONAL_DAILY_CAP) {
        await store.finishDelivery(begun.deliveryId, { status: "skipped", skipReason: "DAILY_CAP" })
        return { kind: "skip", reason: "DAILY_CAP" }
      }
    }
    /* The account's cap, counted again with this row written, for the same reason. */
    if (budgeted && (await budgetedSince()) > ACCOUNT_DAILY_EMAIL_CAP) {
      await store.finishDelivery(begun.deliveryId, { status: "skipped", skipReason: "DAILY_CAP" })
      return { kind: "skip", reason: "DAILY_CAP" }
    }

    const result = await deps.email!({ job, entry, to: address, recipientName: recipient?.name ?? null, deliveryId: begun.deliveryId })
    switch (result.status) {
      case "sent":
        await store.finishDelivery(begun.deliveryId, { status: "sent", providerMessageId: result.providerMessageId ?? null })
        return { kind: "sent" }
      case "unknown":
        await store.finishDelivery(begun.deliveryId, { status: "unknown", failureReason: result.error ?? UNCERTAIN })
        return { kind: "failed", error: result.error ?? UNCERTAIN }
      case "retry":
        await store.finishDelivery(begun.deliveryId, { status: "retry", failureReason: result.error ?? "Try again later" })
        return { kind: "retry", error: result.error ?? "Try again later" }
      case "failed":
      default:
        await store.finishDelivery(begun.deliveryId, { status: result.permanent ? "bounced" : "failed", failureReason: result.error ?? "Refused" })
        if (result.permanent) {
          await store.suppress(address, "all", "invalid_address", "provider")
          notifyLog("warn", "address suppressed", { ...fields, email: address, reason: "permanent failure" })
        }
        return { kind: "failed", error: result.error ?? "Refused" }
    }
  }

  const retry = outcomes.find((o) => o.outcome.kind === "retry")
  if (retry && retry.outcome.kind === "retry") {
    if (job.attempts >= job.max_attempts) return finish("failed", null, retry.outcome.error)
    await store.rescheduleJob(job.id, worker, iso(now + retryDelayMs(job.attempts)), retry.outcome.error, true)
    notifyLog("info", "job retry", { ...fields, error: retry.outcome.error, inMs: retryDelayMs(job.attempts) })
    return "retried"
  }
  if (outcomes.some((o) => o.outcome.kind === "sent")) return finish("sent", null, null)
  const failure = outcomes.find((o) => o.outcome.kind === "failed")
  if (failure && failure.outcome.kind === "failed") return finish("failed", null, failure.outcome.error)
  const first = outcomes.find((o) => o.channel === "email")?.outcome ?? outcomes[0]?.outcome
  return skip(first && first.kind === "skip" ? first.reason : "NO_RECIPIENT")
}

/* ── The run ─────────────────────────────────────────────────────────── */

async function pool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const lanes = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++]
      await fn(item)
    }
  })
  await Promise.all(lanes)
}

function byRecipient(jobs: readonly JobRow[]): JobRow[][] {
  const lanes = new Map<string, JobRow[]>()
  for (const job of jobs) {
    const who = job.recipient_user_id ? `u:${job.recipient_user_id}` : job.recipient_email ? `e:${job.recipient_email.toLowerCase()}` : `j:${job.id}`
    const lane = lanes.get(who)
    if (lane) lane.push(job)
    else lanes.set(who, [job])
  }
  return [...lanes.values()]
}

/**
 * Events first, then due jobs, batch after batch until nothing is left or
 * the budget is spent. What is left is in the tables for the next run.
 */
export async function runWork(deps: EngineDeps, budgetMs: number): Promise<WorkSummary> {
  const summary = emptySummary()
  const started = Date.now()
  const left = () => budgetMs - (Date.now() - started)
  const batch = deps.batch ?? 20
  const concurrency = deps.concurrency ?? CONCURRENCY

  while (left() > 1_000) {
    const events = await deps.store.claimEvents(batch, EVENT_LEASE_SECONDS)
    if (events === null) {
      summary.available = false
      return summary
    }
    if (events.length === 0) break
    summary.events += events.length
    await pool(events, concurrency, (row) => handleEvent(deps, row, summary))
  }

  while (left() > 2_000) {
    const jobs = await deps.store.claimJobs(deps.worker, batch, LEASE_SECONDS)
    if (jobs === null) {
      summary.available = false
      return summary
    }
    if (jobs.length === 0) break
    summary.jobs += jobs.length
    /*
     * One lane per person: their jobs run one after another, so the daily
     * caps and cooldowns each job reads see the one before it. Different
     * people run side by side.
     */
    await pool(byRecipient(jobs), concurrency, async (lane) => {
      for (const job of lane) {
        let outcome: JobOutcome
        try {
          outcome = await processJob(deps, job)
        } catch (error) {
          /* Left processing: the lease runs out and the next claim takes it, with its delivery row to say what happened. */
          notifyLog("error", "job crashed", { jobId: job.id, type: job.type, correlationId: job.correlation_id, error: reasonText(error) })
          continue
        }
        if (outcome === "sent") summary.sent++
        else if (outcome === "skipped") summary.skipped++
        else if (outcome === "failed") summary.failed++
        else if (outcome === "retried") summary.retried++
        else if (outcome === "deferred") summary.deferred++
      }
    })
  }
  summary.stoppedForTime = left() <= 2_000
  return summary
}

export type { RegistryEntry }
