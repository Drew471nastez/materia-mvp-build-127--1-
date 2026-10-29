/**
 * ===========================================================================
 *  WHEN SOMETHING BREAKS, IT IS WRITTEN DOWN AND THE OWNER HEARS, ONCE
 * ===========================================================================
 * Errors used to reach the Vercel log and nothing else: a checkout failing
 * all night was found out from a creator in the morning.
 *
 * reportError() does three things and never throws:
 *   1. the console line, as before, so the Vercel log still has it;
 *   2. public.error_events (run-now part 68): one row per kind of error,
 *      counted, with its newest context, which the admin's Health view lists;
 *   3. the owner is told, by email to ALERT_EMAIL and by a POST to
 *      ALERT_WEBHOOK_URL (Slack or Discord), the first time a kind of error
 *      happens and again at most once an hour while it keeps happening.
 *
 * Every server error reaches it without anybody calling it
 * (instrumentation.ts, onRequestError), and the places that catch their own
 * errors (the Stripe webhook, the scheduled jobs, account deletion, browser
 * errors) call it themselves. Nothing personal is sent: email addresses are
 * masked and anything named like a secret is dropped.
 */

export type ErrorSource = "server" | "client" | "cron" | "webhook" | "payments" | "account" | "notify"

export interface ErrorReport {
  source: ErrorSource
  /** Where: a route and method, a job, a function. */
  where: string
  error: unknown
  context?: Record<string, unknown>
}

const EMAIL_LIKE = /[^\s@<>"',;]+@[^\s@<>"',;]+/g
const SECRET_NAME = /token|secret|password|authorization|signature|api[_-]?key|cookie|card|iban/i

function mask(text: string): string {
  return text.replace(EMAIL_LIKE, (m) => `${m.slice(0, 2)}***@${m.split("@")[1] ?? ""}`)
}

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message)
  return String(error)
}

/**
 * The same kind of error, whatever its numbers: ids, amounts and times are
 * taken out before hashing, so a thousand failed orders are one row.
 */
export function fingerprintOf(source: string, where: string, message: string): string {
  const shape = `${source}|${where.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|\d+/gi, "#")}|${message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27}/gi, "#")
    .replace(/\b(evt|pi|ch|re|po|acct|cus|sub|in|dp|cs)_[A-Za-z0-9]+/g, "$1_#")
    .replace(/\d+/g, "#")
    .slice(0, 300)}`
  /* FNV-1a, 64 bit: the same answer in Node and at the edge, no crypto module needed. */
  let h = BigInt("0xcbf29ce484222325")
  for (let i = 0; i < shape.length; i++) {
    h ^= BigInt(shape.charCodeAt(i))
    h = (h * BigInt("0x100000001b3")) & BigInt("0xffffffffffffffff")
  }
  return h.toString(16).padStart(16, "0")
}

function cleanContext(context: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    if (SECRET_NAME.test(k)) continue
    if (v === null || typeof v === "number" || typeof v === "boolean") out[k] = v
    else if (typeof v === "string") out[k] = mask(v).slice(0, 300)
  }
  return out
}

export async function reportError(report: ErrorReport): Promise<void> {
  try {
    const message = mask(messageOf(report.error)).slice(0, 2000)
    const where = report.where.slice(0, 300)
    const context = cleanContext(report.context)
    const stack = report.error instanceof Error && report.error.stack ? mask(report.error.stack).split("\n").slice(0, 8).join("\n") : null
    console.error(`[${report.source}] ${where}: ${message}`)

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const fingerprint = fingerprintOf(report.source, where, message)
    /* Plain fetch, not the client: this runs in onRequestError too, at the edge as well as in Node. */
    const res = await fetch(`${url}/rest/v1/rpc/storelib_note_error`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_fingerprint: fingerprint, p_source: report.source, p_location: where, p_message: message, p_context: { ...context, ...(stack ? { stack } : {}) } }),
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return
    const tell = (await res.json()) === true
    if (tell) await tellOwner(report.source, where, message, context)
  } catch {
    /* Reporting an error must never become the error. */
  }
}

async function tellOwner(source: string, where: string, message: string, context: Record<string, unknown>) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
  const lines = [
    `Something is failing on Storelib.`,
    ``,
    `Where: ${where}`,
    `What: ${message}`,
    `Kind: ${source}`,
    ...Object.entries(context).slice(0, 8).map(([k, v]) => `${k}: ${String(v)}`),
    ``,
    `You will hear about this one again at most once an hour while it keeps happening. Every occurrence is counted in Admin, Health, Errors: ${site}/admin`,
  ]
  const text = lines.join("\n")
  const hook = process.env.ALERT_WEBHOOK_URL
  const to = process.env.ALERT_EMAIL
  await Promise.all([
    hook
      ? fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, content: text.slice(0, 1900) }), signal: AbortSignal.timeout(4000) }).catch(() => undefined)
      : undefined,
    to
      ? import("@/lib/mailgun")
          .then(({ sendMailgunEmail }) =>
            sendMailgunEmail({
              to,
              subject: `Storelib: ${where.slice(0, 70)} is failing`,
              html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</pre>`,
              text,
              tags: ["ops-alert"],
            }),
          )
          .catch(() => undefined)
      : undefined,
  ])
}

/**
 * Runs one scheduled job and writes down that it ran (public.cron_runs,
 * run-now part 68): when, whether it worked, what it answered. A failure is
 * reported like any other error. The job's own answer is returned unchanged.
 *
 * ONE RUN OF A JOB AT A TIME. Vercel can deliver the same cron more than
 * once, and a job that runs as long as its interval meets its own next run.
 * Two runs of a sweep side by side each take the same rows, send the same
 * email and pay for the same AI twice. The run's own row is the lease: after
 * writing it, a run looks for an earlier row of the same job that has not
 * finished and started within the job's maxDuration (plus a margin). If
 * there is one, this run writes itself down as skipped and does nothing.
 * Two rows written in the same instant are ordered by their ids, so exactly
 * one of them goes ahead. A run the platform killed never finishes its row,
 * and stops counting once its maxDuration is up, so nothing is held for
 * longer than one run could take. Before part 68, or when the database does
 * not answer in time, the job runs as it always did.
 */
export const CRON_LEASE_MARGIN_MS = 30_000

/** Whether an earlier, unfinished run of the same job still holds it. Pure, so the rule has a test. */
export function heldByEarlierRun(rows: { id: number; started_at: string; finished_at: string | null }[], mine: number, leaseMs: number, now = Date.now()): boolean {
  return rows.some((r) => r.id < mine && r.finished_at === null && now - Date.parse(r.started_at) < leaseMs)
}

export async function recordCronRun(
  job: string,
  request: Request,
  run: () => Promise<Response>,
  { maxDurationS = 300 }: { maxDurationS?: number } = {},
): Promise<Response> {
  /* Only a caller holding the cron secret is a run: anybody else is answered 401 by the job and leaves no record. */
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return run()
  /* How long it ran and what it answered, for Infrastructure on /admin/performance (lib/perf/server-timing timedJob). */
  const t0 = performance.now()
  const timing = (status: number) =>
    import("@/lib/perf/server-timing").then((m) => m.timedJob(job, performance.now() - t0, status)).catch(() => undefined)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const headers = key ? { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" } : null
  let id: number | null = null
  if (url && headers) {
    try {
      const res = await fetch(`${url}/rest/v1/cron_runs`, { method: "POST", headers, body: JSON.stringify({ job }), signal: AbortSignal.timeout(3000) })
      if (res.ok) id = ((await res.json()) as Array<{ id: number }>)[0]?.id ?? null
    } catch {
      /* Before part 68, or the database slow: the job still runs. */
    }
  }
  const leaseMs = maxDurationS * 1000 + CRON_LEASE_MARGIN_MS
  if (url && headers && id !== null) {
    try {
      const since = new Date(Date.now() - leaseMs).toISOString()
      const res = await fetch(
        `${url}/rest/v1/cron_runs?select=id,started_at,finished_at&job=eq.${encodeURIComponent(job)}&id=lt.${id}&finished_at=is.null&started_at=gte.${encodeURIComponent(since)}&limit=1`,
        { headers, signal: AbortSignal.timeout(3000) },
      )
      const rows = res.ok ? ((await res.json()) as { id: number; started_at: string; finished_at: string | null }[]) : []
      if (heldByEarlierRun(rows, id, leaseMs)) {
        const detail = JSON.stringify({ skipped: true, reason: "an earlier run of this job is still going", heldBy: rows[0]?.id ?? null })
        await fetch(`${url}/rest/v1/cron_runs?id=eq.${id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ finished_at: new Date().toISOString(), ok: true, status: 200, detail }),
          signal: AbortSignal.timeout(3000),
        }).catch(() => undefined)
        console.info(JSON.stringify({ evt: "cron_skipped_overlap", job, run: id, heldBy: rows[0]?.id ?? null }))
        return new Response(detail, { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } })
      }
    } catch {
      /* Could not tell: the job runs, as before part 68. */
    }
  }
  const finish = async (ok: boolean, status: number, detail: string) => {
    if (!url || !headers || id === null) return
    try {
      await fetch(`${url}/rest/v1/cron_runs?id=eq.${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ finished_at: new Date().toISOString(), ok, status, detail: detail.slice(0, 500) }),
        signal: AbortSignal.timeout(3000),
      })
    } catch {
      /* The run happened; only its record is short. */
    }
  }
  try {
    const answer = await run()
    const ok = answer.status < 400
    let detail = ""
    try {
      detail = (await answer.clone().text()).slice(0, 500)
    } catch {
      /* A body that cannot be read twice is left out of the record. */
    }
    await finish(ok, answer.status, detail)
    await timing(answer.status)
    if (!ok) await reportError({ source: "cron", where: job, error: new Error(`answered ${answer.status}: ${detail.slice(0, 200)}`) })
    return answer
  } catch (error) {
    await finish(false, 500, messageOf(error))
    await timing(500)
    await reportError({ source: "cron", where: job, error })
    throw error
  }
}
