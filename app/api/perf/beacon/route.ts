/**
 * ===========================================================================
 *  WHERE STORELIB'S OWN SPEED MEASUREMENTS LAND
 * ===========================================================================
 * From components/perf/perf-beacon.tsx, every page load on storelib.com,
 * the apps, OnePages and a website's own checkout: a batch of items, each a
 * metric, an area, a route pattern and a number (lib/perf/telemetry.ts
 * says exactly what passes). Public by necessity, as visitors have no
 * session. The collector sends to /api/public/m (lib/perf/config.ts
 * BEACON_PATH), which is this same handler; this address still answers for
 * pages loaded before the move.
 *
 * WHAT IS KEPT is what cleanBatch lets through and phone or computer, read
 * from the user agent here and then forgotten. No address, no cookie, no
 * user. Nothing is set on the response.
 *
 * WHAT IS REFUSED, quietly (a 204 whatever happened): a bot, an address
 * sending more than BEACONS_PER_MINUTE, a body over MAX_BODY_BYTES or not
 * the right shape, and everything past the day's DAILY_CAP, which the
 * database counts (perf_ingest, run-now part 126) so the table stays the
 * same size however busy the day is.
 *
 * BEFORE PART 126 RUNS the function is missing: the route remembers that for
 * ten minutes and stops asking, and the health page says it is waiting.
 */
import { NextResponse, type NextRequest } from "next/server"

import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"
import { BEACONS_PER_MINUTE, DAILY_CAP, MAX_BODY_BYTES } from "@/lib/perf/config"
import { allowedBeacon, type HitStore } from "@/lib/perf/limit"
import { cleanBatch } from "@/lib/perf/telemetry"
import { createAdminClient } from "@/lib/supabase/admin"
import { deviceClassOf } from "@/lib/website-builder/web-vitals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const hits: HitStore = new Map()

let missingUntil = 0

const quiet = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(req: NextRequest) {
  const now = Date.now()
  if (now < missingUntil) return quiet()
  const agent = req.headers.get("user-agent")
  if (isBotAgent(agent)) return quiet()

  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")
  if (!allowedBeacon(address ?? null, now, BEACONS_PER_MINUTE, hits)) return quiet()

  let raw: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BODY_BYTES) return quiet()
    raw = JSON.parse(text)
  } catch {
    return quiet()
  }
  const rows = cleanBatch(raw, deviceClassOf(parseUserAgent(agent).device))
  if (!rows.length) return quiet()

  const { error } = await createAdminClient().rpc("perf_ingest", { p_source: "client", p_rows: rows, p_cap: DAILY_CAP.client })
  if (error) {
    if (/perf_ingest|does not exist|PGRST202|42883|42P01/i.test(`${error.code ?? ""} ${error.message}`)) missingUntil = now + 10 * 60_000
    else console.warn("[perf] beacon not recorded:", error.message)
  }
  return quiet()
}
