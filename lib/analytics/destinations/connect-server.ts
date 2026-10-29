import "server-only"

/**
 * Connecting, testing and disconnecting the tools Storelib's analytics go to
 * (./providers, ./queue-server), and what each one's status says: connected
 * or not, the last event sent, what is waiting, the recent errors and the
 * last deliveries. For the store's owner (keys and addresses) and a team
 * member with Analytics (the status and Test), through
 * app/api/analytics/destinations.
 *
 * A key is tried with the tool before it is kept (a test event: GA4's
 * validation endpoint and a debug_mode event, Meta's test_event_code, a
 * PostHog storelib_test, a webhook's analytics.test), sealed
 * (lib/physical/secrets), and never comes back: the status shows its last
 * four characters, or the webhook's host. A webhook's signing secret is made
 * here and shown once, on the answer that connected it.
 */

import { randomBytes } from "node:crypto"
import { sealSecret, secretHint } from "@/lib/physical/secrets"
import { DESTINATIONS, DESTINATION_NAME, isDestination, parseConnect, type DestinationConfig, type DestinationId, type DestinationSecret } from "./providers"
import { finish, forgetDestinations, openDestinationSecret, realTransport, sendOnce, type DestinationRow, type Transport } from "./queue-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface DeliveryView {
  id: string
  event: string
  status: string
  at: string
  attempts: number
  code: number | null
  error: string | null
}

export interface DestinationView {
  provider: DestinationId
  connected: boolean
  /** The measurement id, the pixel id, PostHog's host, the webhook's host. */
  label: string | null
  /** The key's last four characters. */
  hint: string | null
  testEventCode: string | null
  lastSentAt: string | null
  lastEvent: string | null
  waiting: number
  errors: { at: string; event: string; error: string }[]
  log: DeliveryView[]
}

export interface DestinationsAnswer {
  ready: boolean
  destinations: DestinationView[]
}

const ROW = "id, creator_id, provider, status, account_label, config, secret_ciphertext"
type Row = DestinationRow & { account_label: string | null }

function tableMissing(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42703")
}
export const NEEDS_SQL = "Sending analytics needs SQL part 338 run in Supabase first."

function hintOf(provider: DestinationId, sealed: string | null): string | null {
  const s = openDestinationSecret(provider, sealed)
  if (!s) return null
  if ("url" in s) {
    try {
      return new URL(s.url).host
    } catch {
      return null
    }
  }
  return secretHint(s.key)
}

export async function loadDestinations(db: Db, creatorId: string): Promise<DestinationsAnswer> {
  const { data, error } = await db.from("analytics_destinations").select(ROW).eq("creator_id", creatorId)
  if (error) return { ready: !tableMissing(error), destinations: DESTINATIONS.map((p) => empty(p)) }
  const rows = new Map<string, Row>(((data ?? []) as Row[]).map((r) => [r.provider, r]))
  const destinations = await Promise.all(
    DESTINATIONS.map(async (provider): Promise<DestinationView> => {
      const r = rows.get(provider)
      if (!r) return empty(provider)
      const { data: jobs } = await db
        .from("analytics_forward_jobs")
        .select("id, event_name, status, attempts, response_status, last_error, sent_at, updated_at")
        .eq("destination_id", r.id)
        .order("updated_at", { ascending: false })
        .limit(25)
      const list = (Array.isArray(jobs) ? jobs : []) as { id: string; event_name: string; status: string; attempts: number; response_status: number | null; last_error: string | null; sent_at: string | null; updated_at: string }[]
      const sent = list.filter((j) => j.status === "sent" && j.sent_at).sort((a, b) => String(b.sent_at).localeCompare(String(a.sent_at)))[0]
      return {
        provider,
        connected: r.status === "connected",
        label: r.account_label,
        hint: hintOf(provider, r.secret_ciphertext),
        testEventCode: typeof r.config?.test_event_code === "string" ? r.config.test_event_code : null,
        lastSentAt: sent?.sent_at ?? null,
        lastEvent: sent?.event_name ?? null,
        waiting: list.filter((j) => j.status === "queued" || j.status === "sending").length,
        errors: list.filter((j) => j.status === "failed" || ((j.status === "queued" || j.status === "sending") && j.last_error)).slice(0, 3).map((j) => ({ at: j.updated_at, event: j.event_name, error: j.last_error ?? "Not sent." })),
        log: list.slice(0, 10).map((j) => ({ id: j.id, event: j.event_name, status: j.status, at: j.sent_at ?? j.updated_at, attempts: j.attempts, code: j.response_status, error: j.status === "sent" ? null : j.last_error })),
      }
    }),
  )
  return { ready: true, destinations }
}

function empty(provider: DestinationId): DestinationView {
  return { provider, connected: false, label: null, hint: null, testEventCode: null, lastSentAt: null, lastEvent: null, waiting: 0, errors: [], log: [] }
}

/* ── a test ────────────────────────────────────────────────────────────── */

export type TestResult = { ok: true } | { ok: false; error: string }

const testFacts = (now: number) => ({ ref: `test-${randomBytes(6).toString("hex")}`, at: new Date(now).toISOString(), test: true, valueCents: 100, currency: "USD", form: "test" })

/** One test event to a tool, as it is or as it would be saved. GA4 is asked to validate it first. */
export async function tryDestination(row: DestinationRow, transport: Transport = realTransport, now = Date.now()): Promise<TestResult & { key?: string; facts?: ReturnType<typeof testFacts> }> {
  const facts = testFacts(now)
  const job = { event_name: "test" as const, event_key: `test:${facts.ref}`, facts, person: null }
  if (row.provider === "ga4") {
    const v = await sendOnce(job, row, transport, now, { validate: true })
    if (v.status !== "sent") return { ok: false, error: "error" in v ? v.error : "Google did not take the test." }
  }
  const r = await sendOnce(job, row, transport, now)
  if (r.status === "sent") return { ok: true, key: job.event_key, facts }
  return { ok: false, error: "error" in r ? r.error : "Not sent." }
}

/* ── saving ─────────────────────────────────────────────────────────────── */

export type SaveResult = { ok: true; signingSecret?: string } | { ok: false; error: string; status?: number; field?: string }

async function rowOf(db: Db, creatorId: string, provider: DestinationId): Promise<Row | null> {
  const { data } = await db.from("analytics_destinations").select(ROW).eq("creator_id", creatorId).eq("provider", provider).maybeSingle()
  return (data as Row | null) ?? null
}

/** Whether a body only reads or tests: what a team member with Analytics may do. Connecting and disconnecting stay the owner's. */
export function memberMay(body: Record<string, unknown>): boolean {
  return body.step === "test" && body.disconnect !== true
}

/**
 *   { provider, step: "connect", measurementId, apiSecret, … }   tried, then kept
 *   { provider, step: "test" }                                    a test event, written to the log
 *   { provider, disconnect: true }
 */
export async function saveDestination(db: Db, creatorId: string, body: Record<string, unknown>, transport: Transport = realTransport): Promise<SaveResult> {
  const provider = body.provider
  if (!isDestination(provider)) return { ok: false, error: "Bad request.", status: 400 }
  const name = DESTINATION_NAME[provider]
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  if (body.disconnect === true) {
    const { error } = await db.from("analytics_destinations").delete().eq("creator_id", creatorId).eq("provider", provider)
    forgetDestinations(creatorId)
    if (error && !tableMissing(error)) return { ok: false, error: "That could not be disconnected. Try again.", status: 500 }
    return { ok: true }
  }

  const existing = await rowOf(db, creatorId, provider)

  if (body.step === "test") {
    if (!existing) return { ok: false, error: `Connect ${name} first.`, status: 400 }
    const t = await tryDestination(existing, transport, now)
    /* The test is in the delivery log like any event. */
    const key = t.ok ? t.key! : `test:failed-${randomBytes(6).toString("hex")}`
    const { data: logged } = await db
      .from("analytics_forward_jobs")
      .insert({ destination_id: existing.id, creator_id: creatorId, event_name: "test", event_key: key, subject_ref: null, facts: t.ok ? t.facts : testFacts(now), person: null, status: "queued", attempts: 1, next_attempt_at: nowIso, created_at: nowIso, updated_at: nowIso })
      .select("id")
      .maybeSingle()
    if (logged?.id) await finish(db, logged.id, 99, t.ok ? { status: "sent", code: 200 } : { status: "failed", code: null, error: "error" in t ? t.error : "" }, now)
    return t.ok ? { ok: true } : { ok: false, error: "error" in t ? t.error : "", status: 400 }
  }

  if (body.step !== "connect") return { ok: false, error: "Bad request.", status: 400 }
  const parsed = parseConnect(provider, body)
  if (parsed.ok === false) return { ok: false, error: parsed.error, field: parsed.field, status: 400 }

  let secret: DestinationSecret | null = parsed.secret
  let signingSecret: string | undefined
  if (provider === "webhook") {
    const url = String((body as { url?: unknown }).url ?? "").trim()
    const kept = existing ? openDestinationSecret("webhook", existing.secret_ciphertext) : null
    /* The same address keeps its secret; a new address, or a press of New secret, gets a new one, shown once. */
    const keep = kept && "url" in kept && kept.url === url && body.newSecret !== true
    const s = keep ? kept.secret : randomBytes(24).toString("base64url")
    if (!keep) signingSecret = s
    secret = { url, secret: s }
  } else if (!secret) {
    const kept = existing ? openDestinationSecret(provider, existing.secret_ciphertext) : null
    if (!kept) return { ok: false, error: provider === "ga4" ? "Paste the API secret." : provider === "meta" ? "Paste the access token." : "Paste the project API key.", field: provider === "ga4" ? "apiSecret" : provider === "meta" ? "accessToken" : "projectKey", status: 400 }
    secret = kept
  }

  const sealed = sealSecret("url" in secret ? JSON.stringify(secret) : secret.key)
  const candidate: DestinationRow = { id: existing?.id ?? "new", creator_id: creatorId, provider, status: "connected", config: parsed.config as DestinationConfig, secret_ciphertext: sealed }
  const t = await tryDestination(candidate, transport, now)
  if (t.ok === false) return { ok: false, error: t.error, status: 400 }

  const row = { creator_id: creatorId, provider, status: "connected", account_label: parsed.label, config: parsed.config, secret_ciphertext: sealed, updated_at: nowIso }
  const { error } = await db.from("analytics_destinations").upsert(row, { onConflict: "creator_id,provider", ignoreDuplicates: false })
  forgetDestinations(creatorId)
  if (error) return { ok: false, error: tableMissing(error) ? NEEDS_SQL : "That could not be saved. Try again.", status: tableMissing(error) ? 409 : 500 }
  return signingSecret ? { ok: true, signingSecret } : { ok: true }
}
