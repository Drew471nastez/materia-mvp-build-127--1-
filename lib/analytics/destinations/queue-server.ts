import "server-only"

/**
 * ===========================================================================
 *  THE QUEUE: EACH EVENT TO EACH TOOL ONCE, RETRIED UNTIL IT GOES OR FAILS
 * ===========================================================================
 * enqueue() writes one row in analytics_forward_jobs (SQL part 338) per
 * connected tool that takes the event, keyed by the event (`event_key`,
 * unique per tool): a purchase told by the Stripe webhook and again by the
 * buyer's return is one row, and one request to Google. A row holds the
 * event's facts and, per tool, only the person consent allows
 * (./providers personFor); `person` is emptied when the row is done.
 *
 * drain() takes the rows that are due, claims each by its try count (two
 * runs at once never send one row twice), sends it, and writes what
 * happened: sent; asked again later with backoff (a minute, five, half an
 * hour, two hours, six, a day) when the tool was busy or did not answer;
 * failed when it said no, or after the last try; skipped when consent or
 * the tool's own rules leave nothing to send. It runs in after() straight
 * after an enqueue, and in the notification cron every five minutes
 * (app/api/cron/notify).
 *
 * A purchase waits two minutes first (HOLD_MS), so the buyer's thank you
 * page can add their consent and their browser's ids (noteBrowser) before
 * it goes: a Stripe webhook knows the order, not the visitor.
 *
 * Keys are opened here, on the server, and nowhere else; a webhook address
 * or a self hosted PostHog is connected to through lib/api/public-fetch's
 * lookup, so an address on a private network is refused at the socket.
 * Nothing here throws to its caller, and nothing logs a key or a person.
 */

import { after } from "next/server"
import { openSecret } from "@/lib/physical/secrets"
import { readTracking } from "@/lib/store/tracking"
import {
  DESTINATION_NAME,
  POSTHOG_HOSTS,
  TAKES,
  buildRequest,
  consentProblem,
  isDestination,
  nextAttemptAt,
  outcomeOf,
  personFor,
  refusalText,
  type DestinationConfig,
  type DestinationId,
  type DestinationSecret,
  type ForwardEventName,
  type ForwardFacts,
  type ForwardPerson,
  type PersonInput,
  type ProviderRequest,
} from "./providers"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export const SEND_TIMEOUT_MS = 8000
/** A purchase waits this long for the thank you page's consent. */
export const HOLD_MS = 2 * 60_000
/** A row stuck in "sending" (a run that died) is taken again after this. */
const LEASE_MS = 2 * 60_000
/** Done rows are kept this long as the delivery log, then removed. */
export const LOG_DAYS = 30

export interface DestinationRow {
  id: string
  creator_id: string
  provider: string
  status: string
  config: DestinationConfig | null
  secret_ciphertext: string | null
}

export interface JobRow {
  id: string
  destination_id: string
  creator_id: string
  event_name: ForwardEventName
  event_key: string
  subject_ref: string | null
  facts: ForwardFacts
  person: ForwardPerson | null
  status: "queued" | "sending" | "sent" | "failed" | "skipped"
  attempts: number
  next_attempt_at: string
}

export function openDestinationSecret(provider: DestinationId, sealed: string | null | undefined): DestinationSecret | null {
  const plain = openSecret(sealed)
  if (!plain) return null
  if (provider !== "webhook") return { key: plain }
  try {
    const v = JSON.parse(plain) as { url?: unknown; secret?: unknown }
    return typeof v.url === "string" && typeof v.secret === "string" ? { url: v.url, secret: v.secret } : null
  } catch {
    return null
  }
}

/* ── which tools a store has, briefly cached ───────────────────────────── */

type Connected = { at: number; rows: DestinationRow[]; browserPixel: string | null }
const connectedCache = new Map<string, Connected>()
const CACHE_MS = 60_000

/** A change on the status view is seen at once by this server. */
export function forgetDestinations(creatorId: string): void {
  connectedCache.delete(creatorId)
}

const DEST_COLUMNS = "id, creator_id, provider, status, config, secret_ciphertext"

async function connected(db: Db, creatorId: string, now = Date.now()): Promise<Connected> {
  const hit = connectedCache.get(creatorId)
  if (hit && now - hit.at < CACHE_MS) return hit
  let rows: DestinationRow[] = []
  let browserPixel: string | null = null
  try {
    const { data, error } = await db.from("analytics_destinations").select(DEST_COLUMNS).eq("creator_id", creatorId).eq("status", "connected")
    /* Part 338 not run: nothing is connected, and nothing is said. */
    rows = error ? [] : ((data ?? []) as DestinationRow[]).filter((r) => isDestination(r.provider))
    if (rows.some((r) => r.provider === "meta")) {
      const { data: s } = await db.from("store_settings").select("tracking").eq("creator_id", creatorId).maybeSingle()
      browserPixel = readTracking(s?.tracking).meta_pixel ?? null
    }
  } catch {
    rows = []
  }
  const entry = { at: now, rows, browserPixel }
  if (connectedCache.size > 5000) connectedCache.clear()
  connectedCache.set(creatorId, entry)
  return entry
}

/** Whether the store has any tool connected: the cheap question asked before reading an order. */
export async function hasDestinations(db: Db, creatorId: string): Promise<boolean> {
  return (await connected(db, creatorId)).rows.length > 0
}

/* ── enqueue ───────────────────────────────────────────────────────────── */

export interface EnqueueInput {
  creatorId: string
  event: ForwardEventName
  /** The event's own key, the same whoever tells it: purchase:<ref>, refund:<order>:<refund>, lead:<hash>. */
  key: string
  facts: ForwardFacts
  person?: PersonInput | null
  /** Wait this long before the first try (a purchase: HOLD_MS). */
  holdMs?: number
  /** One tool only (the status view's test). */
  destinationId?: string
  now?: number
}

export interface EnqueueResult {
  queued: number
  /** Ids of the rows written (a test reads its own back). */
  ids: string[]
}

/** Whether one tool gets this event at all, before a row is written. Null when it does. */
function notFor(row: DestinationRow, event: ForwardEventName, person: ForwardPerson, browserPixel: string | null): string | null {
  const tool = row.provider as DestinationId
  if (!TAKES[tool].includes(event)) return "not taken"
  /* A page view without consent is not a row at all: no log of each visit nobody may see. */
  if ((event === "page_view" || event === "view_item") && consentProblem(tool, event, person)) return "no consent"
  /* The store's own Meta pixel already sends ViewContent, with no id to match ours by: sending it again would count each view twice. */
  if (tool === "meta" && event === "view_item" && browserPixel && browserPixel === row.config?.pixel_id) return "browser pixel"
  return null
}

export async function enqueue(db: Db, input: EnqueueInput): Promise<EnqueueResult> {
  const out: EnqueueResult = { queued: 0, ids: [] }
  try {
    const now = input.now ?? Date.now()
    const c = await connected(db, input.creatorId, now)
    const rows = c.rows.filter((r) => !input.destinationId || r.id === input.destinationId)
    if (rows.length === 0) return out
    const person: PersonInput = input.person ?? { consent: { analytics: false, marketing: false } }
    const at = new Date(now).toISOString()
    const due = new Date(now + Math.max(0, input.holdMs ?? 0)).toISOString()
    const inserts = rows
      .map((r) => ({ r, p: personFor(r.provider as DestinationId, person, input.event) }))
      .filter(({ r, p }) => notFor(r, input.event, p, c.browserPixel) === null)
      .map(({ r, p }) => ({
        destination_id: r.id,
        creator_id: input.creatorId,
        event_name: input.event,
        event_key: input.key.slice(0, 200),
        subject_ref: input.facts.ref.slice(0, 100),
        facts: input.facts,
        person: p,
        status: "queued",
        attempts: 0,
        next_attempt_at: due,
        created_at: at,
        updated_at: at,
      }))
    if (inserts.length === 0) return out
    /* The same event again is the row that is there: ignored, never a second send. */
    const { data, error } = await db.from("analytics_forward_jobs").upsert(inserts, { onConflict: "destination_id,event_key", ignoreDuplicates: true }).select("id")
    if (error) return out
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
    return { queued: ids.length || 0, ids }
  } catch {
    return out
  }
}

/**
 * THE BUYER'S CONSENT, FROM THE THANK YOU PAGE. The purchase's rows are
 * still held (HOLD_MS): each is given what this tool may have of the
 * person, by the consent the buyer's browser carries, and sent.
 */
export async function noteBrowser(db: Db, creatorId: string, ref: string, person: PersonInput, now: number = Date.now()): Promise<number> {
  try {
    const { data, error } = await db.from("analytics_forward_jobs").select("id, destination_id, event_name, person, status").eq("creator_id", creatorId).eq("subject_ref", ref).eq("status", "queued").limit(20)
    if (error || !Array.isArray(data) || data.length === 0) return 0
    const c = await connected(db, creatorId)
    let n = 0
    for (const job of data as Pick<JobRow, "id" | "destination_id" | "event_name" | "person" | "status">[]) {
      const dest = c.rows.find((r) => r.id === job.destination_id)
      if (!dest) continue
      const p = personFor(dest.provider as DestinationId, person, job.event_name)
      await db.from("analytics_forward_jobs").update({ person: p, next_attempt_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }).eq("id", job.id).eq("status", "queued")
      n++
    }
    return n
  } catch {
    return 0
  }
}

/* ── sending ───────────────────────────────────────────────────────────── */

export type Answer = { status: number; body: unknown }

export interface Transport {
  /** `publicOnly`: an address the store typed (a webhook, a self hosted PostHog), connected to by lib/api/public-fetch's lookup. */
  send: (req: ProviderRequest, publicOnly: boolean) => Promise<Answer>
}

async function fixedHost(req: ProviderRequest): Promise<Answer> {
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body, signal: AbortSignal.timeout(SEND_TIMEOUT_MS), cache: "no-store", redirect: "manual" })
    const text = await res.text().catch(() => "")
    let body: unknown = text.slice(0, 4000)
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* kept as text for the error line */
    }
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

export const realTransport: Transport = {
  send: async (req, publicOnly) => {
    if (!publicOnly) return fixedHost(req)
    const { postPublic } = await import("@/lib/onepage/integrations/deliver-server")
    const a = await postPublic(req.url, req.body, req.headers, SEND_TIMEOUT_MS)
    let body: unknown = a.body
    if (typeof body === "string") {
      try {
        body = JSON.parse(body)
      } catch {
        /* text */
      }
    }
    return { status: a.status, body }
  },
}

export type SendOutcome = { status: "sent"; code: number } | { status: "retry"; code: number; error: string } | { status: "failed"; code: number | null; error: string } | { status: "skipped"; error: string }

/** One row, one try. Pure of the database: the caller writes what happened. */
export async function sendOnce(job: Pick<JobRow, "event_name" | "event_key" | "facts" | "person">, dest: DestinationRow, transport: Transport, now = Date.now(), opts: { validate?: boolean } = {}): Promise<SendOutcome> {
  const tool = dest.provider
  if (!isDestination(tool)) return { status: "skipped", error: "Unknown tool." }
  const secret = openDestinationSecret(tool, dest.secret_ciphertext)
  if (!secret) return { status: "failed", code: null, error: `${DESTINATION_NAME[tool]} needs connecting again.` }
  const built = buildRequest({ tool, event: job.event_name, eventKey: job.event_key, facts: job.facts, person: job.person, config: dest.config ?? {}, secret, storeId: dest.creator_id, now, validate: opts.validate })
  if (built.ok === false) return { status: "skipped", error: built.skip }
  const host = (() => {
    try {
      return new URL(built.request.url).origin
    } catch {
      return ""
    }
  })()
  const publicOnly = tool === "webhook" || (tool === "posthog" && !(POSTHOG_HOSTS as readonly string[]).includes(host))
  let a: Answer
  try {
    a = await transport.send(built.request, publicOnly)
  } catch {
    a = { status: 0, body: null }
  }
  const outcome = outcomeOf(tool, a.status, a.body)
  if (outcome === "ok") return { status: "sent", code: a.status }
  const error = refusalText(tool, a.status, a.body)
  return outcome === "retry" ? { status: "retry", code: a.status, error } : { status: "failed", code: a.status || null, error }
}

export interface DrainSummary {
  taken: number
  sent: number
  retried: number
  failed: number
  skipped: number
}

/** The rows that are due, each sent once, for about `budgetMs`. Never throws. */
export async function drain(db: Db, opts: { budgetMs?: number; limit?: number; transport?: Transport; now?: () => number; creatorId?: string } = {}): Promise<DrainSummary> {
  const summary: DrainSummary = { taken: 0, sent: 0, retried: 0, failed: 0, skipped: 0 }
  const clock = opts.now ?? Date.now
  const started = clock()
  const budget = opts.budgetMs ?? 20_000
  const transport = opts.transport ?? realTransport
  const dests = new Map<string, DestinationRow | null>()
  try {
    const nowIso = new Date(started).toISOString()
    let q = db
      .from("analytics_forward_jobs")
      .select("id, destination_id, creator_id, event_name, event_key, subject_ref, facts, person, status, attempts, next_attempt_at")
      .or(`and(status.eq.queued,next_attempt_at.lte.${nowIso}),and(status.eq.sending,next_attempt_at.lte.${nowIso})`)
    if (opts.creatorId) q = q.eq("creator_id", opts.creatorId)
    const { data, error } = await q.order("next_attempt_at", { ascending: true }).limit(opts.limit ?? 50)
    if (error || !Array.isArray(data)) return summary
    for (const job of data as JobRow[]) {
      if (clock() - started > budget) break
      /* Claimed by its try count: a second run that read the same row finds the count moved and leaves it. The lease is next_attempt_at, so a run that dies frees it. */
      const attempts = (job.attempts ?? 0) + 1
      const t = clock()
      const { data: claimed } = await db
        .from("analytics_forward_jobs")
        .update({ status: "sending", attempts, next_attempt_at: new Date(t + LEASE_MS).toISOString(), locked_until: new Date(t + LEASE_MS).toISOString(), updated_at: new Date(t).toISOString() })
        .eq("id", job.id)
        .eq("attempts", job.attempts ?? 0)
        .in("status", ["queued", "sending"])
        .select("id")
      if (!Array.isArray(claimed) || claimed.length === 0) continue
      summary.taken++
      if (!dests.has(job.destination_id)) {
        const { data: d } = await db.from("analytics_destinations").select(DEST_COLUMNS).eq("id", job.destination_id).maybeSingle()
        dests.set(job.destination_id, (d as DestinationRow | null) ?? null)
      }
      const dest = dests.get(job.destination_id) ?? null
      let result: SendOutcome
      if (!dest || dest.status !== "connected") result = { status: "skipped", error: "The tool is no longer connected." }
      else result = await sendOnce(job, dest, transport, t)
      await finish(db, job.id, attempts, result, clock())
      if (result.status === "sent") summary.sent++
      else if (result.status === "skipped") summary.skipped++
      else if (result.status === "retry" && nextAttemptAt(attempts, clock())) summary.retried++
      else summary.failed++
    }
    /* Now and then, the log past LOG_DAYS goes. */
    if (Math.random() < 0.05) {
      const before = new Date(started - LOG_DAYS * 86_400_000).toISOString()
      await db.from("analytics_forward_jobs").delete().in("status", ["sent", "failed", "skipped"]).lt("updated_at", before)
    }
  } catch {
    /* the next run takes what is left */
  }
  return summary
}

/** What happened to one row. `person` goes once it is done: the log keeps the event, not who. */
export async function finish(db: Db, id: string, attempts: number, r: SendOutcome, now: number): Promise<void> {
  const at = new Date(now).toISOString()
  let patch: Record<string, unknown>
  if (r.status === "sent") patch = { status: "sent", sent_at: at, response_status: r.code, last_error: null, person: null, locked_until: null }
  else if (r.status === "skipped") patch = { status: "skipped", last_error: r.error.slice(0, 500), person: null, locked_until: null }
  else {
    const next = r.status === "retry" ? nextAttemptAt(attempts, now) : null
    patch = next
      ? { status: "queued", next_attempt_at: next, response_status: r.code || null, last_error: r.error.slice(0, 500), locked_until: null }
      : { status: "failed", response_status: r.code || null, last_error: r.error.slice(0, 500), person: null, locked_until: null }
  }
  try {
    await db.from("analytics_forward_jobs").update({ ...patch, updated_at: at }).eq("id", id)
  } catch {
    /* the lease ends and the row is taken again */
  }
}

/** After the response, inside a request; outside one (a script, a test) now. Never throws. */
export function afterResponse(task: () => Promise<unknown>): void {
  const safe = () =>
    task().catch(() => {
      /* nothing to tell the caller */
    })
  try {
    after(safe)
  } catch {
    void safe()
  }
}

/** Send what is due for this store, after the response. */
export function drainSoon(db: Db, creatorId: string): void {
  afterResponse(() => drain(db, { creatorId, limit: 20, budgetMs: 15_000 }))
}
