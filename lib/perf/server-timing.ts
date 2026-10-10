import "server-only"

import { after } from "next/server"

import { parseUserAgent } from "@/lib/analytics/user-agent"
import { createAdminClient } from "@/lib/supabase/admin"
import { deviceClassOf } from "@/lib/website-builder/web-vitals"

import { DAILY_CAP, SERVER_SAMPLE_RATE, type Area } from "./config"
import { serverRow, type PerfRow } from "./telemetry"

/**
 * ===========================================================================
 *  HOW LONG STORELIB'S OWN API TOOK TO ANSWER, FROM ONE REQUEST IN FIVE
 * ===========================================================================
 * Vercel's observability API is not enabled on this project, so the routes
 * that matter time themselves:
 *
 *     async function postHandler(request: Request) { ... }
 *     export const POST = timed("checkout", "/api/checkout/process", postHandler)
 *
 * The wrapper never changes what the route answers. For a request that did
 * not draw the sample it is one Math.random() and a straight call. For one
 * that did, it notes the time until the response was ready and its status
 * (500 when the handler threw, which is then thrown on unchanged), and puts
 * a row in a small buffer in memory.
 *
 * WRITTEN IN BATCHES, after the response has gone (next/server `after`), when
 * FLUSH_AT rows are waiting or the oldest has waited FLUSH_AFTER_MS. So the
 * database sees one insert per hundred or so requests, and a request never
 * waits on it. Rows in the buffer of an instance that is shut down are lost;
 * that only thins a sample.
 */

const FLUSH_AT = 25
const FLUSH_AFTER_MS = 15_000
const MAX_BUFFER = 200

const buffer: PerfRow[] = []
let oldest = 0
let missingUntil = 0

async function flush(): Promise<void> {
  if (!buffer.length) return
  const rows = buffer.splice(0, buffer.length)
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
}

function record(area: Area, route: string, request: unknown, ms: number, status: number) {
  const agent = request instanceof Request ? request.headers.get("user-agent") : null
  const row = serverRow(area, route, deviceClassOf(parseUserAgent(agent).device), ms, status)
  if (!row) return
  if (buffer.length >= MAX_BUFFER) return
  if (!buffer.length) oldest = Date.now()
  buffer.push(row)
  if (buffer.length >= FLUSH_AT || Date.now() - oldest > FLUSH_AFTER_MS) {
    try {
      after(flush)
    } catch {
      void flush()
    }
  }
}

/** Times a route handler for one request in SERVER_SAMPLE_RATE; see above. */
export function timed<A extends unknown[], R extends Response>(area: Area, route: string, handler: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
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

/** For the tests: what is waiting to be written. */
export function pendingTimings(): readonly PerfRow[] {
  return buffer
}
