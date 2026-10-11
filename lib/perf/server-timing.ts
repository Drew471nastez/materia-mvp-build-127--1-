import "server-only"

import { after } from "next/server"

import { parseUserAgent } from "@/lib/analytics/user-agent"
import { createAdminClient } from "@/lib/supabase/admin"
import { deviceClassOf } from "@/lib/website-builder/web-vitals"

import { DAILY_CAP, SERVER_ROUTE_PER_MINUTE, SERVER_SAMPLE_RATE, type ServerArea } from "./config"
import { serverRow, type PerfRow } from "./telemetry"

/**
 * ===========================================================================
 *  HOW LONG STORELIB'S OWN API TOOK TO ANSWER, EVERY CALL
 * ===========================================================================
 * Vercel's observability API is not enabled on this project, so the routes
 * that matter time themselves:
 *
 *     async function postHandler(request: Request) { ... }
 *     export const POST = timed("checkout", "/api/checkout/process", postHandler)
 *
 * The wrapper never changes what the route answers. It notes the time until
 * the response was ready and its status (500 when the handler threw, which
 * is then thrown on unchanged), and puts a row in a small buffer in memory.
 * Webhooks are timed the same way under the area `infra`; a scheduled job's
 * run is recorded by lib/observability/report.ts recordCronRun (timedJob).
 *
 * EVERY CALL, UP TO A CAP. SERVER_SAMPLE_RATE is 1: at Storelib's traffic
 * one call in five left the API figures on "insufficient data" for days. A
 * route past SERVER_ROUTE_PER_MINUTE calls a minute on one instance is not
 * recorded for the rest of that minute, so a busy route cannot fill the
 * day's DAILY_CAP alone.
 *
 * WRITTEN AFTER THE RESPONSE HAS GONE (next/server `after`), in one insert
 * for whatever is waiting. It used to wait for twenty five rows or for the next
 * request fifteen seconds on, which on a quiet serverless instance is
 * never: the instance was frozen with its rows in memory, and most timings
 * of a quiet day were lost. Now a recorded call always asks for a write
 * after its response, and only one write is pending at a time per instance,
 * so busy moments still go in batches (up to MAX_BUFFER rows, after(flush)
 * once for all of them). A request never waits on it.
 */

const MAX_BUFFER = 200

const buffer: PerfRow[] = []
let pending = false
let missingUntil = 0

/** Calls recorded per route in the current minute, on this instance. */
const perMinute = new Map<string, { n: number; until: number }>()

async function flush(): Promise<void> {
  pending = false
  if (!buffer.length) return
  const rows = buffer.splice(0, MAX_BUFFER)
  if (Date.now() < missingUntil) return
  try {
    const { error } = await createAdminClient().rpc("perf_ingest", { p_source: "server", p_rows: rows, p_cap: DAILY_CAP.server })
    if (error) {
      if (/perf_ingest|does not exist|PGRST202|42883|42P01/i.test(`${error.code ?? ""} ${error.message}`)) missingUntil = Date.now() + 10 * 60_000
      else console.warn("[perf] server timings not recorded:", error.message)
    }
  } catch {
    /* A timing is never worth a failed request. */
  }
  /* More arrived while this was writing, or more than one insert's worth was waiting. */
  if (buffer.length) schedule()
}

function schedule() {
  if (pending) return
  pending = true
  try {
    after(flush)
  } catch {
    /* Outside a request (a script, a test): written on the next turn instead. */
    setTimeout(() => void flush(), 0)
  }
}

/** Whether this route may record another call this minute (SERVER_ROUTE_PER_MINUTE). */
export function underRouteCap(route: string, now: number, store = perMinute, cap = SERVER_ROUTE_PER_MINUTE): boolean {
  if (store.size > 500) for (const [k, v] of store) if (v.until < now) store.delete(k)
  const seen = store.get(route)
  if (!seen || seen.until < now) {
    store.set(route, { n: 1, until: now + 60_000 })
    return true
  }
  seen.n += 1
  return seen.n <= cap
}

function push(row: PerfRow | null) {
  if (!row || buffer.length >= MAX_BUFFER) return
  buffer.push(row)
  schedule()
}

function record(area: ServerArea, route: string, request: unknown, ms: number, status: number) {
  if (!underRouteCap(route, Date.now())) return
  const agent = request instanceof Request ? request.headers.get("user-agent") : null
  push(serverRow(area, route, deviceClassOf(parseUserAgent(agent).device), ms, status))
}

/** Times a route handler; see above. */
export function timed<A extends unknown[], R extends Response>(area: ServerArea, route: string, handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    if (Math.random() >= SERVER_SAMPLE_RATE) return handler(...args)
    const t0 = performance.now()
    let status = 500
    try {
      const res = await handler(...args)
      status = res.status
      return res
    } finally {
      try {
        record(area, route, args[0], performance.now() - t0, status)
      } catch {
        /* never in the way of an answer */
      }
    }
  }
}

/** A scheduled job's run: how long it took and what it answered (lib/observability/report.ts recordCronRun). */
export function timedJob(job: string, ms: number, status: number): void {
  try {
    push(serverRow("infra", job, "desktop", ms, status, "job"))
  } catch {
    /* never in the way of the job */
  }
}

/** For the tests: what is waiting to be written. */
export function pendingTimings(): readonly PerfRow[] {
  return buffer
}
