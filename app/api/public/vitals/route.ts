/**
 * ===========================================================================
 *  WHERE A PUBLISHED SITE'S SPEED MEASUREMENTS LAND
 * ===========================================================================
 * One beacon per page view from lib/perf/site-vitals-inline.ts, posted to
 * the page's own host at SITE_BEACON_PATH (/api/public/sv, which re-exports
 * this). Public by necessity (visitors have no session), under /api/public/
 * because that is the prefix the proxy keeps for exactly this kind of
 * endpoint. Website settings › Performance reads what it stores.
 *
 * WHICH SITE: the host the request arrived on, never the body
 * (lib/website-builder/rum-site.ts). A beacon from a host that is not a
 * published website is nothing.
 *
 * WHAT IS KEPT, and it is all that is kept: the path with ids taken out,
 * the kind of page, phone or computer (from the browser's signature and the
 * viewport width), the browser's family, the country the edge reported
 * (x-vercel-ip-country), the connection type and the numbers, checked one
 * by one (lib/website-builder/web-performance.ts cleanRumBeacon). No
 * address, no cookie, no user agent, no identifier. Nothing is set on the
 * response.
 *
 * WHAT IS REFUSED, quietly (a 204 whatever happened, so a script learns
 * nothing by trying): a body that is not a believable beacon, a host that
 * is not a published site, a bot, one address sending too many, one site
 * sending more than a server instance takes a minute. Past the day's full
 * sample the database keeps one page view in ten, then one in a hundred,
 * each with its weight (record_site_rum, part 210).
 *
 * BEFORE THE SQL IS RUN (supabase/sql/run-now/210_site_web_performance.sql)
 * the write fails, the route remembers that for ten minutes and stops
 * asking, and the Performance tab says it is not set up yet.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"
import { rumSiteOfHost } from "@/lib/website-builder/rum-site"
import {
  FAR_SAMPLE_RATE,
  FULL_SAMPLE_UNTIL,
  MAX_BEACON_BYTES,
  MID_SAMPLE_RATE,
  MID_SAMPLE_UNTIL,
  browserFamilyOf,
  cleanRumBeacon,
  countryOf,
  deviceClassFor,
} from "@/lib/website-builder/web-performance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_BODY = MAX_BEACON_BYTES

/** Beacons per address per minute, per server instance. Counted in memory:
    a database write to count page views would double the cost of the thing
    being limited. The address is a key in this map for a minute and is never
    written anywhere. */
const PER_MINUTE = 30
/** Beacons per site per minute, per server instance: a flood aimed at one site stops here. */
const SITE_PER_MINUTE = 600

function underLimit(store: Map<string, { n: number; until: number }>, key: string | null, limit: number, now: number): boolean {
  if (!key) return true
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.until < now) store.delete(k)
    if (store.size > 5000) store.clear()
  }
  const seen = store.get(key)
  if (!seen || seen.until < now) {
    store.set(key, { n: 1, until: now + 60_000 })
    return true
  }
  seen.n += 1
  return seen.n <= limit
}
const hits = new Map<string, { n: number; until: number }>()
const siteHits = new Map<string, { n: number; until: number }>()

function allowed(address: string | null, now: number): boolean {
  return underLimit(hits, address, PER_MINUTE, now)
}

let missingUntil = 0

const quiet = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(req: NextRequest) {
  const now = Date.now()
  if (now < missingUntil) return quiet()
  const agent = req.headers.get("user-agent")
  if (isBotAgent(agent)) return quiet()

  const address = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip")
  if (!allowed(address ?? null, now)) return quiet()

  let raw: unknown
  try {
    const text = await req.text()
    if (text.length > MAX_BODY) return quiet()
    raw = JSON.parse(text)
  } catch {
    return quiet()
  }
  const beacon = cleanRumBeacon(raw)
  if (!beacon) return quiet()

  const admin = createAdminClient()
  const site = await rumSiteOfHost(admin, req.headers.get("host"), now)
  if (!site) return quiet()
  if (!underLimit(siteHits, site.installId, SITE_PER_MINUTE, now)) return quiet()

  const parsed = parseUserAgent(agent)
  const { error } = await admin.rpc("record_site_rum", {
    p_install: site.installId,
    p_creator: site.creatorId,
    p_path: beacon.path,
    p_type: beacon.pageType,
    p_device: deviceClassFor(parsed.device, beacon.width),
    p_browser: browserFamilyOf(parsed.browser),
    p_country: countryOf(req.headers.get("x-vercel-ip-country")),
    p_conn: beacon.connection,
    p_kind: beacon.kind,
    p_lcp: beacon.lcp,
    p_inp: beacon.inp,
    p_cls: beacon.cls,
    p_fcp: beacon.fcp,
    p_ttfb: beacon.ttfb,
    p_nav: beacon.nav,
    p_full: FULL_SAMPLE_UNTIL,
    p_mid: MID_SAMPLE_UNTIL,
    p_mid_rate: MID_SAMPLE_RATE,
    p_far_rate: FAR_SAMPLE_RATE,
  })
  if (error) {
    /* The function is not there yet: stop asking for a while. */
    if (/record_site_rum|does not exist|PGRST202|42883/i.test(`${error.code ?? ""} ${error.message}`)) missingUntil = now + 10 * 60_000
    else console.warn("[vitals] not recorded:", error.message)
  }
  return quiet()
}
