import "server-only"

import { CRON_JOBS } from "./schema-expectations"
import { SQL_PARTS } from "./sql-parts.generated"
import { Reader, isoDaysAgo } from "./platform-metrics"
import { STRIPE_COMMERCE_EVENTS } from "./commerce-docs-facts"
import { platformTrackingState, trackingWebhookUrl } from "@/lib/physical/tracking/provider"

/**
 * ===========================================================================
 *  THE LIVE STATUS ON /admin/physical-commerce
 * ===========================================================================
 * Everything here is read from where it really lives, for all of Storelib
 * (no single creator): the jobs' own run records (public.cron_runs, part 68)
 * and the work they leave behind, the environment the server runs with,
 * Stripe's own list of webhook endpoints, the record of which SQL parts ran
 * (public.storelib_applied_parts, part 67), and counts of rows.
 *
 * Every figure is a value or null. Null is printed as "Could not be read"
 * with the reason beside it, never as zero, and a thing that is not set up
 * says "Not configured". No secret ever leaves this file: a key is reduced
 * to its mode (test or live) and whether it is there.
 */

export type Health = "ok" | "late" | "failed" | "off" | "unknown"

export interface JobStatus {
  path: string
  name: string
  schedule: string
  what: string
  /** The newest run's start, finish, and whether it worked; null before any run or when unreadable. */
  lastRun: { startedAt: string; finishedAt: string | null; ok: boolean | null; status: number | null } | null
  runs24h: number | null
  failed24h: number | null
  /** The sign of its work, in words: "Last checkout decided 2 h ago". */
  evidence: { label: string; at: string | null; value?: string | null }[]
  health: Health
  note: string
}

export interface StripeStatus {
  secretKey: "live" | "test" | "restricted" | "missing" | "invalid"
  publishableKey: "live" | "test" | "missing" | "invalid"
  modesMatch: boolean | null
  platformWebhookSecret: boolean
  connectWebhookSecret: boolean
  /** Stripe's own list of endpoints, when the key lets us ask. */
  endpoint: {
    asked: boolean
    reason: string | null
    url: string | null
    status: string | null
    missingEvents: string[]
    allEvents: boolean
  }
  lastEventAt: string | null
  lastProcessedAt: string | null
  events24h: number | null
  failed24h: number | null
}

export interface PartStatus {
  part: string
  file: string
  state: "applied" | "missing" | "changed" | "unknown"
  appliedAt: string | null
}

export interface TableStatus {
  table: string
  present: boolean | null
  reason: string | null
}

export interface CountStatus {
  id: string
  label: string
  value: number | null
  reason: string | null
}

export interface CommerceStatus {
  generatedAt: string
  physical: { enabled: boolean | null; source: "env" | "database" | null; reason: string | null }
  jobs: JobStatus[]
  email: { provider: "Mailgun"; configured: boolean; domainSet: boolean; keySet: boolean; fromSet: boolean; webhookKeySet: boolean; lastSentAt: string | null; cronSecretSet: boolean }
  stripe: StripeStatus
  parts: PartStatus[]
  tables: TableStatus[]
  counts: CountStatus[]
  /**
   * Courier tracking (lib/physical/tracking): Storelib's own aggregator from the environment (never the key), and
   * what the cron did with it, read from fulfillments (part 160). Null figures could not be read.
   */
  tracking?: {
    configured: boolean
    provider: string | null
    /** aftership or 17track: which dashboard the address goes in. */
    providerId: "aftership" | "17track" | null
    /**
     * The address Storelib's own account sends updates to, token and all (lib/physical/tracking/provider.ts
     * trackingWebhookUrl). Only this admin page shows it: the token is what proves a delivery is the platform's.
     */
    webhookUrl: string | null
    webhooks: boolean
    chosen: string | null
    following: number | null
    checked24h: number | null
    failing: number | null
    ownAccounts: number | null
    lastCheckedAt: string | null
    reason: string | null
  }
}

/**
 * The SQL parts physical and digital commerce stand on, by number. A part
 * not in the repository yet (this round's 152 to 157 before they merge) is
 * simply not listed.
 */
export const COMMERCE_PARTS = ["13", "19", "35", "36", "78", "109", "110", "111", "112", "113", "116", "117", "118", "127", "129", "131", "150", "152", "153", "154", "155", "156", "157", "160", "161", "162", "163"]

/** The tables, by the part that makes them. */
export const COMMERCE_TABLES = [
  "commerce_settings",
  "store_settings",
  "commerce_checkouts",
  "inventory_locations",
  "inventory_levels",
  "inventory_reservations",
  "shipping_profiles",
  "shipping_zones",
  "shipping_rates",
  "shipping_packages",
  "commerce_tax_rates",
  "commerce_tax_overrides",
  "fulfillments",
  "commerce_returns",
  "commerce_reasons",
  "sales_channels",
  "product_channel_listings",
  "commerce_jobs",
  "commerce_integrations",
  "checkout_starts",
  "commerce_tracking_accounts",
  "order_cases",
  "store_offers",
  "stripe_webhook_events",
  "cron_runs",
]

/** The three jobs the owner asked to watch, and what each one is for in commerce. */
export const WATCHED_JOBS: { path: string; name: string }[] = [
  { path: "/api/cron/process-scheduled-emails", name: "Abandoned checkout reminders (hourly email job)" },
  { path: "/api/cron/physical", name: "Low stock emails, order emails and stock holds (physical commerce job)" },
  { path: "/api/cron/rollup-daily", name: "Daily rollup: analytics and the performance score" },
]

const HOUR = 3_600_000

/** How long after its schedule a job counts as late. Hourly: 3 hours. Every few minutes: 1 hour. Daily: 30 hours. */
export function lateAfterHours(schedule: string): number {
  const [minute, hour] = schedule.split(" ")
  if (hour === "*") return /^\d+$/.test(minute) ? 3 : 1
  return 30
}

/** sk_live_ → live. The key itself never leaves. */
export function keyMode(key: string | undefined, kind: "secret" | "publishable"): "live" | "test" | "restricted" | "missing" | "invalid" {
  const k = key?.trim()
  if (!k) return "missing"
  if (kind === "publishable") return k.startsWith("pk_live_") ? "live" : k.startsWith("pk_test_") ? "test" : "invalid"
  if (k.startsWith("sk_live_")) return "live"
  if (k.startsWith("sk_test_")) return "test"
  if (k.startsWith("rk_live_") || k.startsWith("rk_test_")) return "restricted"
  return "invalid"
}

/** A job's health from its last run and its schedule. */
export function jobHealth(lastRun: JobStatus["lastRun"], schedule: string, now = Date.now()): { health: Health; note: string } {
  if (!lastRun) return { health: "unknown", note: "No run recorded yet." }
  const age = now - new Date(lastRun.startedAt).getTime()
  if (lastRun.ok === false) return { health: "failed", note: `The last run failed${lastRun.status ? ` (answered ${lastRun.status})` : ""}.` }
  if (age > lateAfterHours(schedule) * HOUR) return { health: "late", note: "Has not run as often as its schedule says." }
  if (lastRun.ok === null) return { health: "ok", note: "Running now, or stopped before it wrote its result." }
  return { health: "ok", note: "Ran on time and worked." }
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("Stripe did not answer in time")), ms))])

async function stripeEndpoint(secretMode: StripeStatus["secretKey"]): Promise<StripeStatus["endpoint"]> {
  const none = { asked: false, url: null, status: null, missingEvents: [], allEvents: false }
  if (secretMode === "missing" || secretMode === "invalid") return { ...none, reason: "No Stripe secret key, so Stripe was not asked." }
  try {
    const { stripe } = await import("@/lib/stripe")
    const list = await withTimeout(stripe.webhookEndpoints.list({ limit: 50 }), 6000)
    const ours = list.data.filter((e) => /\/api\/stripe\/webhook\/?$/.test(new URL(e.url).pathname))
    const live = ours.find((e) => e.status === "enabled") ?? ours[0]
    if (!live) return { asked: true, reason: "Stripe has no endpoint for /api/stripe/webhook.", url: null, status: null, missingEvents: STRIPE_COMMERCE_EVENTS.map((e) => e.type), allEvents: false }
    const events = live.enabled_events ?? []
    const all = events.includes("*")
    return {
      asked: true,
      reason: null,
      url: live.url,
      status: live.status,
      allEvents: all,
      missingEvents: all ? [] : STRIPE_COMMERCE_EVENTS.map((e) => e.type).filter((t) => !events.includes(t as never)),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    /* A restricted key without the webhook permission says so; anything else is said plainly. */
    return { ...none, asked: true, reason: /permission|restricted/i.test(msg) ? "The Stripe key may not list webhook endpoints." : `Stripe could not be asked: ${msg.slice(0, 120)}` }
  }
}

export async function readCommerceStatus(r: Reader = new Reader(), now = Date.now()): Promise<CommerceStatus> {
  const since24 = new Date(now - 24 * HOUR).toISOString()

  /* ── The switch ───────────────────────────────────────────────────── */
  const envRaw = process.env.PHYSICAL_COMMERCE_ENABLED
  const envValue = envRaw === "1" || envRaw === "true" ? true : envRaw === "0" || envRaw === "false" ? false : null
  const switchRow = envValue === null ? await r.rows<{ value: unknown }>("switch", "platform_settings", "value", (q) => q.eq("key", "physical_commerce_enabled").limit(1)) : null
  const physical: CommerceStatus["physical"] =
    envValue !== null
      ? { enabled: envValue, source: "env", reason: null }
      : switchRow === null
        ? { enabled: null, source: null, reason: r.reasonFor("switch") }
        : { enabled: switchRow[0]?.value === true, source: "database", reason: null }

  /* ── The jobs ─────────────────────────────────────────────────────── */
  const jobs = await Promise.all(
    WATCHED_JOBS.map(async (w): Promise<JobStatus> => {
      const def = CRON_JOBS.find((j) => j.path === w.path)
      const schedule = def?.schedule ?? ""
      const [last, runs, fails] = await Promise.all([
        r.rows<{ started_at: string; finished_at: string | null; ok: boolean | null; status: number | null }>(`job ${w.path}`, "cron_runs", "started_at, finished_at, ok, status", (q) => q.eq("job", w.path).order("started_at", { ascending: false }).limit(1)),
        r.count(`job runs ${w.path}`, "cron_runs", (q) => q.eq("job", w.path).gte("started_at", since24)),
        r.count(`job fails ${w.path}`, "cron_runs", (q) => q.eq("job", w.path).eq("ok", false).gte("started_at", since24)),
      ])
      const lastRun = last?.[0] ? { startedAt: last[0].started_at, finishedAt: last[0].finished_at, ok: last[0].ok, status: last[0].status } : null
      const judged = last === null ? { health: "unknown" as Health, note: r.reasonFor(`job ${w.path}`) ?? "The job runs record could not be read (run-now part 68)." } : jobHealth(lastRun, schedule, now)
      return { path: w.path, name: w.name, schedule, what: def?.what ?? "", lastRun, runs24h: runs, failed24h: fails, evidence: await evidenceFor(r, w.path, now), ...judged }
    }),
  )

  /* ── Email ────────────────────────────────────────────────────────── */
  const set = (name: string) => typeof process.env[name] === "string" && process.env[name]!.trim().length > 0
  const lastSent = await r.rows<{ finished_at: string | null }>("email sent", "commerce_jobs", "finished_at", (q) => q.eq("kind", "send_email").eq("status", "done").order("finished_at", { ascending: false }).limit(1))
  const email: CommerceStatus["email"] = {
    provider: "Mailgun",
    configured: set("MAILGUN_API_KEY") && set("MAILGUN_DOMAIN"),
    keySet: set("MAILGUN_API_KEY"),
    domainSet: set("MAILGUN_DOMAIN"),
    fromSet: set("EMAIL_FROM"),
    webhookKeySet: set("MAILGUN_WEBHOOK_SIGNING_KEY"),
    lastSentAt: lastSent?.[0]?.finished_at ?? null,
    cronSecretSet: set("CRON_SECRET"),
  }

  /* ── Stripe ───────────────────────────────────────────────────────── */
  const secretKey = keyMode(process.env.STRIPE_SECRET_KEY, "secret") as StripeStatus["secretKey"]
  const publishableKey = keyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "publishable") as StripeStatus["publishableKey"]
  const secretLive = secretKey === "live" ? true : secretKey === "test" ? false : process.env.STRIPE_SECRET_KEY?.trim().startsWith("rk_live_") ? true : process.env.STRIPE_SECRET_KEY?.trim().startsWith("rk_test_") ? false : null
  const pubLive = publishableKey === "live" ? true : publishableKey === "test" ? false : null
  const [endpoint, lastEvent, lastProcessed, events24h, failed24h] = await Promise.all([
    stripeEndpoint(secretKey),
    r.rows<{ received_at: string }>("stripe last event", "stripe_webhook_events", "received_at", (q) => q.order("received_at", { ascending: false }).limit(1)),
    r.rows<{ processed_at: string }>("stripe last processed", "stripe_webhook_events", "processed_at", (q) => q.not("processed_at", "is", null).order("processed_at", { ascending: false }).limit(1)),
    r.count("stripe events 24h", "stripe_webhook_events", (q) => q.gte("received_at", since24), "event_id"),
    r.count("stripe failed 24h", "stripe_webhook_events", (q) => q.gte("received_at", since24).is("processed_at", null).not("last_error", "is", null), "event_id"),
  ])
  const stripe: StripeStatus = {
    secretKey,
    publishableKey,
    modesMatch: secretLive === null || pubLive === null ? null : secretLive === pubLive,
    platformWebhookSecret: (process.env.STRIPE_WEBHOOK_SECRET ?? "").trim().startsWith("whsec_"),
    connectWebhookSecret: (process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? "").trim().startsWith("whsec_"),
    endpoint,
    lastEventAt: lastEvent?.[0]?.received_at ?? null,
    lastProcessedAt: lastProcessed?.[0]?.processed_at ?? null,
    events24h,
    failed24h,
  }

  /* ── SQL parts and tables ─────────────────────────────────────────── */
  const ran = await r.rows<{ part: string; sha256: string; applied_at: string }>("sql parts", "storelib_applied_parts", "part, sha256, applied_at", (q) => q.limit(500))
  const byPart = new Map((ran ?? []).map((row) => [row.part, row]))
  const parts: PartStatus[] = SQL_PARTS.filter((p) => COMMERCE_PARTS.includes(p.part)).map((p) => {
    const row = byPart.get(p.part)
    return { part: p.part, file: p.file, state: ran === null ? "unknown" : !row ? "missing" : row.sha256 === p.sha256 ? "applied" : "changed", appliedAt: row?.applied_at ?? null }
  })

  const tables = await Promise.all(
    COMMERCE_TABLES.map(async (table): Promise<TableStatus> => {
      try {
        const { error } = await r.db.from(table).select("*", { head: true }).limit(0)
        if (!error) return { table, present: true, reason: null }
        const missing = error.code === "42P01" || error.code === "PGRST205" || (/does not exist|could not find the table/i.test(error.message ?? "") && /relation|table/i.test(error.message ?? ""))
        return { table, present: missing ? false : null, reason: missing ? "Not in the database" : "Could not be checked" }
      } catch {
        return { table, present: null, reason: "Could not be checked" }
      }
    }),
  )

  /* ── Counts, all of Storelib ──────────────────────────────────────── */
  const countSpecs: { id: string; label: string; table: string; shape: Parameters<Reader["count"]>[2]; column?: string }[] = [
    { id: "physical_products", label: "Physical products", table: "products", shape: (q) => q.eq("type", "physical") },
    { id: "physical_live", label: "Physical products published", table: "products", shape: (q) => q.eq("type", "physical").eq("status", "published") },
    { id: "shops", label: "Stores set up for shipping", table: "commerce_settings", shape: (q) => q.not("onboarded_at", "is", null), column: "creator_id" },
    { id: "physical_orders", label: "Paid physical orders", table: "commerce_checkouts", shape: (q) => q.in("status", ["paid", "partially_refunded", "refunded"]) },
    { id: "physical_orders_30d", label: "Paid physical orders, last 30 days", table: "commerce_checkouts", shape: (q) => q.in("status", ["paid", "partially_refunded", "refunded"]).gte("created_at", isoDaysAgo(30, now)) },
    { id: "waiting", label: "Waiting to ship", table: "commerce_checkouts", shape: (q) => q.eq("status", "paid").in("fulfillment_status", ["unfulfilled", "processing", "partially_fulfilled"]).is("cancelled_at", null) },
    { id: "shipments", label: "Shipments", table: "fulfillments", shape: (q) => q },
    { id: "delivered", label: "Shipments delivered", table: "fulfillments", shape: (q) => q.eq("status", "delivered") },
    { id: "returns", label: "Returns", table: "commerce_returns", shape: (q) => q },
    { id: "locations", label: "Locations", table: "inventory_locations", shape: (q) => q },
    { id: "zones", label: "Shipping zones", table: "shipping_zones", shape: (q) => q },
    { id: "tax_regions", label: "Tax regions", table: "commerce_tax_rates", shape: (q) => q },
    { id: "started", label: "Checkouts started, last 7 days", table: "checkout_starts", shape: (q) => q.gte("created_at", isoDaysAgo(7, now)) },
    { id: "digital_orders", label: "Completed orders, all products", table: "orders", shape: (q) => q.eq("status", "completed") },
  ]
  const counts = await Promise.all(
    countSpecs.map(async (c): Promise<CountStatus> => {
      const value = await r.count(`count ${c.id}`, c.table, c.shape, c.column ?? "id")
      return { id: c.id, label: c.label, value, reason: value === null ? r.reasonFor(`count ${c.id}`) : null }
    }),
  )

  /* ── Courier tracking ─────────────────────────────────────────────── */
  const tp = platformTrackingState()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const open = (q: any) => q.not("tracking_number", "is", null).is("tracking_stopped_at", null).eq("tracking_auto", true).in("status", ["shipped", "in_transit", "out_for_delivery", "failed"])
  const [following, checked24h, failing, ownAccounts, lastChecked] = await Promise.all([
    r.count("tracking following", "fulfillments", open),
    r.count("tracking checked", "fulfillments", (q) => q.gte("tracking_checked_at", since24)),
    r.count("tracking failing", "fulfillments", (q) => open(q).not("tracking_error", "is", null)),
    r.count("tracking own", "commerce_tracking_accounts", (q) => q.eq("status", "connected"), "creator_id"),
    r.rows<{ tracking_checked_at: string }>("tracking last", "fulfillments", "tracking_checked_at", (q) => q.not("tracking_checked_at", "is", null).order("tracking_checked_at", { ascending: false }).limit(1)),
  ])
  const tracking: CommerceStatus["tracking"] = {
    configured: tp.configured,
    provider: tp.providerName,
    providerId: tp.provider,
    webhookUrl: (() => {
      try {
        return tp.provider ? trackingWebhookUrl(tp.provider, "platform") : null
      } catch {
        return null
      }
    })(),
    webhooks: tp.webhooks,
    chosen: tp.chosen,
    following,
    checked24h,
    failing,
    ownAccounts,
    lastCheckedAt: lastChecked?.[0]?.tracking_checked_at ?? null,
    reason: following === null ? (r.reasonFor("tracking following") ?? "Not readable before run-now part 160.") : null,
  }

  return { generatedAt: new Date(now).toISOString(), physical, jobs, email, stripe, parts, tables, counts, tracking }
}

/** The trace each watched job leaves in its own tables. */
async function evidenceFor(r: Reader, path: string, now: number): Promise<JobStatus["evidence"]> {
  if (path === "/api/cron/process-scheduled-emails") {
    const [decided, entered] = await Promise.all([
      r.rows<{ handled_at: string }>("ev abandoned", "checkout_starts", "handled_at", (q) => q.not("handled_at", "is", null).order("handled_at", { ascending: false }).limit(1)),
      r.count("ev abandoned entered", "checkout_starts", (q) => q.eq("outcome", "entered").gte("handled_at", isoDaysAgo(7, now))),
    ])
    return [
      { label: "Last started checkout decided", at: decided === null ? null : decided[0]?.handled_at ?? null, value: decided === null ? "Could not be read" : decided.length ? null : "None yet" },
      { label: "Reminded or entered a reminder, last 7 days", at: null, value: entered === null ? "Could not be read" : String(entered) },
    ]
  }
  if (path === "/api/cron/physical") {
    const [lowStock, done] = await Promise.all([
      r.rows<{ status: string; created_at: string; finished_at: string | null }>("ev low stock", "commerce_jobs", "status, created_at, finished_at", (q) => q.eq("kind", "send_email").eq("payload->>template", "low_stock").order("created_at", { ascending: false }).limit(1)),
      r.rows<{ finished_at: string | null }>("ev jobs done", "commerce_jobs", "finished_at", (q) => q.eq("status", "done").order("finished_at", { ascending: false }).limit(1)),
    ])
    const ls = lowStock?.[0]
    return [
      { label: "Last low stock email", at: ls ? ls.finished_at ?? ls.created_at : null, value: lowStock === null ? "Could not be read" : ls ? (ls.status === "done" ? "Sent" : ls.status) : "None yet" },
      { label: "Last queued job finished", at: done?.[0]?.finished_at ?? null, value: done === null ? "Could not be read" : done.length ? null : "None yet" },
    ]
  }
  if (path === "/api/cron/rollup-daily") {
    const score = await r.rows<{ day: string; score: number | null; computed_at: string }>("ev perf", "perf_scores", "day, score, computed_at", (q) => q.order("day", { ascending: false }).limit(1))
    const s = score?.[0]
    return [{ label: "Newest performance day scored", at: s?.computed_at ?? null, value: score === null ? "Could not be read" : s ? `${s.day}${s.score === null ? ", insufficient data" : `, ${s.score}`}` : "None yet" }]
  }
  return []
}
