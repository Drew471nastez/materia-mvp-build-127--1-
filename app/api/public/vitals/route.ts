/**
 * ===========================================================================
 *  WHERE A PUBLISHED SITE'S SPEED MEASUREMENTS LAND
 * ===========================================================================
 * One beacon per page load from components/website-builder/site-vitals.tsx:
 * a site id and up to three numbers. Public by necessity (visitors have no
 * session), under /api/public/ because that is the prefix the proxy keeps
 * for exactly this kind of endpoint.
 *
 * WHAT IS KEPT, and it is all that is kept: the site, the three numbers,
 * phone or computer, and the day. No address, no cookie, no user agent, no
 * time of day. Nothing is set on the response.
 *
 * WHAT IS REFUSED, quietly (a 204 whatever happened, so a script learns
 * nothing by trying):
 *   a body that is not a site id and a believable number (web-vitals.ts),
 *   a site that is not published, a bot, one address sending too many,
 *   and anything past the day's sample for that site (the database keeps at
 *   most SAMPLE_CAP page loads per site, per device, per day, which is plenty
 *   for a 75th percentile and keeps the table the same size however busy
 *   the site is).
 *
 * BEFORE THE SQL IS RUN (supabase/sql/RUN_SITE_VITALS.sql) the insert fails,
 * the route remembers that for ten minutes and stops asking, and the website
 * page says it is collecting data.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"
import { cleanBeacon, deviceClassOf } from "@/lib/website-builder/web-vitals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Page loads kept per site, per device, per day. */
const SAMPLE_CAP = 1000
const MAX_BODY = 2048

/** Beacons per address per minute, per server instance. Counted in memory:
    a per-page-view database write to count page views would double the cost
    of the thing being limited. */
const PER_MINUTE = 30
const hits = new Map<string, { n: number; until: number }>()

function allowed(address: string | null, now: number): boolean {
  if (!address) return true
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.until < now) hits.delete(k)
    if (hits.size > 5000) hits.clear()
  }
  const seen = hits.get(address)
  if (!seen || seen.until < now) {
    hits.set(address, { n: 1, until: now + 60_000 })
    return true
  }
  seen.n += 1
  return seen.n <= PER_MINUTE
}

/** Which sites are published, remembered for five minutes per instance. */
const sites = new Map<string, { creatorId: string | null; until: number }>()
let missingUntil = 0

const quiet = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

export async function POST(req: NextRequest) {
  const now = Date.now()
  if (now < missingUntil) return quiet()
  if (isBotAgent(req.headers.get("user-agent"))) return quiet()

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
  const beacon = cleanBeacon(raw)
  if (!beacon) return quiet()

  const admin = createAdminClient()

  let site = sites.get(beacon.installId)
  if (!site || site.until < now) {
    const { data } = await admin
      .from("store_theme_installs")
      .select("creator_id, status")
      .eq("id", beacon.installId)
      .maybeSingle()
    const row = data as { creator_id?: string; status?: string } | null
    site = { creatorId: row?.status === "published" ? row.creator_id ?? null : null, until: now + 5 * 60_000 }
    if (sites.size > 5000) sites.clear()
    sites.set(beacon.installId, site)
  }
  if (!site.creatorId) return quiet()

  const { error } = await admin.rpc("record_site_vital", {
    p_install: beacon.installId,
    p_creator: site.creatorId,
    p_device: deviceClassOf(parseUserAgent(req.headers.get("user-agent")).device),
    p_lcp: beacon.lcp,
    p_inp: beacon.inp,
    p_cls: beacon.cls,
    p_cap: SAMPLE_CAP,
  })
  if (error) {
    /* The function is not there yet: stop asking for a while. */
    if (/record_site_vital|does not exist|PGRST202|42883/i.test(`${error.code ?? ""} ${error.message}`)) missingUntil = now + 10 * 60_000
    else console.warn("[vitals] not recorded:", error.message)
  }
  return quiet()
}
