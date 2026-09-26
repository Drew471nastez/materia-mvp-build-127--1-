/**
 * ===========================================================================
 *  THE ADMIN'S VIEW OF THE ENGINE: ONE NOTIFICATION TRACED, AND THE COUNTS
 * ===========================================================================
 * /admin/notifications (app/admin/notifications) reads this through
 * /api/admin/notifications, which checks the admin cookie first.
 *
 *   TRACE   search by a recipient's email or user id, an event key, a job,
 *           event or delivery id, a provider message id, or a type; filter
 *           by type and job state. Answers event, then its jobs (state, skip
 *           reason, run_at, attempts), then each job's deliveries (channel,
 *           provider, message id, status, times, failure reason).
 *   STATS   public.notification_admin_stats (run-now part 41): counts by
 *           type and status over 7 or 30 days, the types failing most, and
 *           for each onboarding reminder how many did the task within three
 *           days of it.
 *
 * WHAT IS NEVER SHOWN. Every field is picked by name, so a column added
 * later does not appear by accident: no job data (only its keys), no event
 * payload, no email body, no token. Addresses are masked ("ja***@gmail.com")
 * everywhere but the search box the admin typed them into, and addresses
 * inside error text are masked too.
 */
import { maskEmail } from "@/lib/privacy/mask-email"

import { NOTIFICATION_TYPES } from "./types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any }
type PgError = { code?: string | null; message?: string | null } | null | undefined

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const JOB_STATES = ["pending", "processing", "sent", "skipped", "cancelled", "failed"] as const
const TRACE_LIMIT = 25

export type QueryKind = { kind: "empty" } | { kind: "email"; value: string; raw: string } | { kind: "uuid"; value: string } | { kind: "type"; value: string } | { kind: "text"; value: string }

export function classifyQuery(raw: unknown): QueryKind {
  const q = typeof raw === "string" ? raw.trim().slice(0, 200) : ""
  if (!q) return { kind: "empty" }
  if (/^[^\s@,()"<>]+@[^\s@,()"<>]+\.[^\s@,()"<>]+$/.test(q)) return { kind: "email", value: q.toLowerCase(), raw: q }
  if (UUID.test(q)) return { kind: "uuid", value: q.toLowerCase() }
  if ((NOTIFICATION_TYPES as readonly string[]).includes(q.toUpperCase())) return { kind: "type", value: q.toUpperCase() }
  return { kind: "text", value: q }
}

/** Any address inside a line of text, masked. */
export function maskText(text: unknown, max = 300): string | null {
  if (typeof text !== "string" || !text) return null
  return text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (m) => maskEmail(m)).slice(0, max)
}

export function missingSchema(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return ["PGRST202", "PGRST204", "PGRST205", "42883", "42P01", "42703"].includes(code)
}

/* ── Trace ────────────────────────────────────────────────────────────── */

export interface TraceDelivery {
  id: string
  channel: string
  provider: string | null
  providerMessageId: string | null
  status: string
  attempts: number
  createdAt: string | null
  sentAt: string | null
  deliveredAt: string | null
  failedAt: string | null
  openedAt: string | null
  clickedAt: string | null
  complainedAt: string | null
  unsubscribedAt: string | null
  failureReason: string | null
  skipReason: string | null
}

export interface TraceJob {
  id: string
  type: string
  state: string
  skipReason: string | null
  runAt: string | null
  expiresAt: string | null
  attempts: number
  maxAttempts: number | null
  workflow: string | null
  step: string | null
  recipient: string
  recipientUserId: string | null
  createdAt: string | null
  sentAt: string | null
  lastError: string | null
  /** Which facts the template was given, never their values. */
  dataKeys: string[]
  deliveries: TraceDelivery[]
}

export interface TraceEvent {
  id: string | null
  name: string | null
  key: string | null
  occurredAt: string | null
  processedAt: string | null
  attempts: number | null
  lastError: string | null
  jobs: TraceJob[]
}

export type Row = Record<string, unknown>
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null)
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0)

export function deliveryOf(r: Row): TraceDelivery {
  return {
    id: String(r.id),
    channel: String(r.channel ?? ""),
    provider: s(r.provider),
    providerMessageId: s(r.provider_message_id),
    status: String(r.status ?? ""),
    attempts: n(r.attempt_count),
    createdAt: s(r.created_at),
    sentAt: s(r.sent_at),
    deliveredAt: s(r.delivered_at),
    failedAt: s(r.failed_at),
    openedAt: s(r.opened_at),
    clickedAt: s(r.clicked_at),
    complainedAt: s(r.complained_at),
    unsubscribedAt: s(r.unsubscribed_at),
    failureReason: maskText(r.failure_reason),
    skipReason: s(r.skip_reason),
  }
}

export function jobOf(r: Row, deliveries: TraceDelivery[]): TraceJob {
  const data = r.data && typeof r.data === "object" && !Array.isArray(r.data) ? Object.keys(r.data as object).slice(0, 30) : []
  return {
    id: String(r.id),
    type: String(r.type ?? ""),
    state: String(r.state ?? ""),
    skipReason: s(r.skip_reason),
    runAt: s(r.run_at),
    expiresAt: s(r.expires_at),
    attempts: n(r.attempts),
    maxAttempts: typeof r.max_attempts === "number" ? r.max_attempts : null,
    workflow: s(r.workflow),
    step: s(r.step),
    recipient: r.recipient_email ? maskEmail(r.recipient_email) : r.recipient_user_id ? "Account" : "(none)",
    recipientUserId: s(r.recipient_user_id),
    createdAt: s(r.created_at),
    sentAt: s(r.sent_at),
    lastError: maskText(r.last_error),
    dataKeys: data,
    deliveries,
  }
}

/** Jobs grouped under their event, newest event first; jobs with no event last. */
export function groupTrace(jobs: readonly Row[], events: readonly Row[], deliveries: readonly Row[]): TraceEvent[] {
  const byJob = new Map<string, TraceDelivery[]>()
  for (const d of deliveries) {
    const list = byJob.get(String(d.job_id)) ?? []
    list.push(deliveryOf(d))
    byJob.set(String(d.job_id), list)
  }
  const eventById = new Map(events.map((e) => [String(e.id), e]))
  const groups = new Map<string, TraceEvent>()
  for (const j of jobs) {
    const eventId = s(j.event_id)
    const key = eventId ?? "none"
    let g = groups.get(key)
    if (!g) {
      const e = eventId ? eventById.get(eventId) : undefined
      g = {
        id: eventId,
        name: e ? s(e.name) : null,
        key: e ? s(e.event_key) : null,
        occurredAt: e ? s(e.occurred_at) : null,
        processedAt: e ? s(e.processed_at) : null,
        attempts: e && typeof e.attempts === "number" ? e.attempts : null,
        lastError: e ? maskText(e.last_error) : null,
        jobs: [],
      }
      groups.set(key, g)
    }
    g.jobs.push(jobOf(j, byJob.get(String(j.id)) ?? []))
  }
  const time = (g: TraceEvent) => Date.parse(g.occurredAt ?? g.jobs[0]?.createdAt ?? "") || 0
  return [...groups.values()].sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || time(b) - time(a))
}

export interface TraceQuery {
  q?: string | null
  type?: string | null
  state?: string | null
}

export type TraceResult = { ok: true; events: TraceEvent[]; jobs: number; searched: QueryKind["kind"] } | { ok: false; unavailable: boolean; reason: string }

/**
 * The trace. Every read is by an exact value (an address, an id, a key), so
 * each is an index lookup, and at most 25 jobs come back, newest first.
 */
export async function traceDeliveries(db: Db, query: TraceQuery): Promise<TraceResult> {
  const kind = classifyQuery(query.q)
  const type = typeof query.type === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(query.type) ? query.type : kind.kind === "type" ? kind.value : null
  const state = typeof query.state === "string" && (JOB_STATES as readonly string[]).includes(query.state) ? query.state : null

  const fail = (error: PgError): TraceResult => ({
    ok: false,
    unavailable: missingSchema(error),
    reason: missingSchema(error) ? "The notification tables are not in this database yet (run-now part 40)." : `A read failed (${error?.code ?? "unknown"}).`,
  })

  /* Who or what was searched for, as job filters. */
  let or: string | null = null
  let ids: string[] | null = null
  if (kind.kind === "email") {
    /* A Mailgun message id looks like an address too: "<2026...@storelib.com>". */
    const [{ data: profiles }, { data: byMessage }] = await Promise.all([
      db.from("profiles").select("id").eq("email", kind.value).limit(5),
      db.from("notification_deliveries").select("job_id").in("provider_message_id", [kind.raw, `<${kind.raw}>`]).limit(10),
    ])
    const users = ((profiles ?? []) as Row[]).map((p) => String(p.id)).filter((id) => UUID.test(id))
    const jobIds = ((byMessage ?? []) as Row[]).map((d) => String(d.job_id)).filter((id) => UUID.test(id))
    or = [`recipient_email.eq."${kind.value}"`, ...users.map((u) => `recipient_user_id.eq.${u}`), ...jobIds.map((j) => `id.eq.${j}`)].join(",")
  } else if (kind.kind === "uuid") {
    const { data: byDelivery, error } = await db.from("notification_deliveries").select("job_id").eq("id", kind.value).limit(1)
    if (error) return fail(error)
    const jobIds = ((byDelivery ?? []) as Row[]).map((d) => `id.eq.${String(d.job_id)}`)
    or = [`id.eq.${kind.value}`, `recipient_user_id.eq.${kind.value}`, `event_id.eq.${kind.value}`, `correlation_id.eq.${kind.value}`, `creator_id.eq.${kind.value}`, ...jobIds].join(",")
  } else if (kind.kind === "text") {
    const [events, deliveries] = await Promise.all([
      db.from("notification_events").select("id").eq("event_key", kind.value).limit(5),
      db.from("notification_deliveries").select("job_id").eq("provider_message_id", kind.value).limit(10),
    ])
    if (events.error) return fail(events.error)
    if (deliveries.error) return fail(deliveries.error)
    const eventIds = ((events.data ?? []) as Row[]).map((e) => String(e.id))
    const jobIds = ((deliveries.data ?? []) as Row[]).map((d) => String(d.job_id))
    ids = jobIds
    if (eventIds.length) or = [`event_id.in.(${eventIds.join(",")})`, ...(jobIds.length ? [`id.in.(${jobIds.join(",")})`] : [])].join(",")
    else if (!jobIds.length) return { ok: true, events: [], jobs: 0, searched: kind.kind }
  }

  let q = db.from("notification_jobs").select("*")
  if (or) q = q.or(or)
  else if (ids) q = q.in("id", ids)
  if (type) q = q.eq("type", type)
  if (state) q = q.eq("state", state)
  const jobs = await q.order("created_at", { ascending: false }).limit(TRACE_LIMIT)
  if (jobs.error) return fail(jobs.error)
  const jobRows = (jobs.data ?? []) as Row[]
  if (!jobRows.length) return { ok: true, events: [], jobs: 0, searched: kind.kind }

  const eventIds = [...new Set(jobRows.map((j) => s(j.event_id)).filter((x): x is string => !!x))]
  const [events, deliveries] = await Promise.all([
    eventIds.length ? db.from("notification_events").select("*").in("id", eventIds) : Promise.resolve({ data: [], error: null }),
    db.from("notification_deliveries").select("*").in("job_id", jobRows.map((j) => String(j.id))).order("created_at", { ascending: true }),
  ])
  if (deliveries.error) return fail(deliveries.error)
  return {
    ok: true,
    events: groupTrace(jobRows, events.error ? [] : ((events.data ?? []) as Row[]), (deliveries.data ?? []) as Row[]),
    jobs: jobRows.length,
    searched: kind.kind,
  }
}

/* ── Stats ────────────────────────────────────────────────────────────── */

export const STATUS_KEYS = ["queued", "sent", "delivered", "failed", "bounced", "opened", "clicked", "unsubscribed", "complained"] as const
export type StatusKey = (typeof STATUS_KEYS)[number]

export interface TypeStats {
  type: string
  counts: Record<StatusKey, number>
  skipped: number
  cancelled: number
}

export interface Stats {
  days: number
  totals: Record<StatusKey, number>
  byType: TypeStats[]
  /** The types failing most: failed and bounced over what was sent. */
  topFailing: { type: string; failed: number; sent: number; rate: number }[]
  skipReasons: { reason: string; count: number }[]
  lifecycle: { type: string; reminded: number; settled: number; completed: number; rate: number | null }[]
}

const zero = (): Record<StatusKey, number> => ({ queued: 0, sent: 0, delivered: 0, failed: 0, bounced: 0, opened: 0, clicked: 0, unsubscribed: 0, complained: 0 })

/** What the SQL function answered, as the page shows it. Anything missing counts as nothing. */
export function summarizeStats(raw: unknown, days: number): Stats {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as Row[]) : [])
  const byType = new Map<string, TypeStats>()
  const entry = (type: string) => {
    let t = byType.get(type)
    if (!t) byType.set(type, (t = { type, counts: zero(), skipped: 0, cancelled: 0 }))
    return t
  }
  for (const j of list("jobs")) {
    const t = entry(String(j.type))
    t.counts.queued += n(j.queued)
    t.skipped += n(j.skipped)
    t.cancelled += n(j.cancelled)
    /* A job that failed before any delivery was written is a failure too. */
    t.counts.failed += n(j.failed)
  }
  for (const d of list("deliveries")) {
    const t = entry(String(d.type))
    for (const k of ["sent", "delivered", "failed", "bounced", "opened", "clicked", "unsubscribed", "complained"] as const) t.counts[k] += n(d[k])
  }
  const totals = zero()
  for (const t of byType.values()) for (const k of STATUS_KEYS) totals[k] += t.counts[k]
  const rows = [...byType.values()].sort((a, b) => b.counts.sent + b.counts.queued - (a.counts.sent + a.counts.queued) || a.type.localeCompare(b.type))
  const topFailing = rows
    .map((t) => ({ type: t.type, failed: t.counts.failed + t.counts.bounced, sent: t.counts.sent }))
    .filter((t) => t.failed > 0)
    .map((t) => ({ ...t, rate: t.failed / Math.max(t.sent + t.failed, 1) }))
    .sort((a, b) => b.failed - a.failed || b.rate - a.rate)
    .slice(0, 5)
  return {
    days,
    totals,
    byType: rows,
    topFailing,
    skipReasons: list("skip_reasons").map((r) => ({ reason: String(r.reason ?? "none"), count: n(r.n) })),
    lifecycle: list("lifecycle").map((l) => ({
      type: String(l.type),
      reminded: n(l.reminded),
      settled: n(l.settled),
      completed: n(l.completed),
      rate: n(l.settled) > 0 ? n(l.completed) / n(l.settled) : null,
    })),
  }
}

export function parseDays(raw: unknown): 7 | 30 {
  return raw === "30" || raw === 30 ? 30 : 7
}
