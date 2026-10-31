/**
 * ===========================================================================
 *  POST /api/track/ai-visit   { source, path }
 * ===========================================================================
 * One more visit from an AI assistant to one of Storelib's own pages, on
 * today's count (platform_ai_visits, SQL part 347, through
 * bump_platform_ai_visit). Sent by the page the visit landed on, once per
 * tab session, only with a yes to analytics (lib/attribution/ai-visit-
 * browser). lib/attribution/ai-visits.ts has the rules this keeps.
 *
 * AGGREGATE ONLY. What is written is the day, the assistant and the path,
 * and one added to a number. No address, no user agent, no cookie, no
 * visitor id, no referrer is read into the database or kept here; the
 * caller's address is read once, by the shared limiter, to count it.
 *
 * WHAT IS REFUSED, quietly:
 *   another site's request    Sec-Fetch-Site other than same-origin, or an
 *                             Origin or Referer that is not this host
 *   not storelib.com          a creator's domain, a preview deployment
 *                             (countedHost)
 *   a path not ours           aiVisitPath: private, /api, a query, a
 *                             creator's page, a file
 *   no known assistant        aiVisitSource: the landing address's
 *                             utm_source first, then the page's label only
 *                             when it is on the known list
 *   too many from one address rateLimit, bucket "ai-visit", counted in
 *                             memory first like every beacon
 *
 * ALWAYS 204, with nothing set: the page does nothing with the answer and a
 * caller learns nothing from it. BEFORE PART 347 RUNS the function is
 * missing: the route remembers that for ten minutes and stops asking.
 */
import { NextResponse, type NextRequest } from "next/server"

import { addressSubject, LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { aiVisitPath, aiVisitSource, bareHost, countedHost } from "@/lib/attribution/ai-visits"
import { createAdminClient } from "@/lib/supabase/admin"
import { getMainDomain } from "@/lib/url-helpers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** { source, path } is under a hundred bytes. */
const MAX_BODY = 600

let missingUntil = 0

const quiet = () => new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })

function urlOf(value: string | null): URL | null {
  if (!value) return null
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const now = Date.now()
    if (now < missingUntil) return quiet()

    /* This host, and only from a page of this host. */
    const production = process.env.NODE_ENV === "production"
    const host = bareHost(req.headers.get("host"))
    if (!countedHost(host, getMainDomain(), production)) return quiet()
    const site = req.headers.get("sec-fetch-site")
    if (site && site !== "same-origin") return quiet()
    const origin = urlOf(req.headers.get("origin"))
    if (req.headers.get("origin") && (!origin || bareHost(origin.host) !== host)) return quiet()
    const referer = urlOf(req.headers.get("referer"))
    if (req.headers.get("referer") && (!referer || bareHost(referer.host) !== host)) return quiet()

    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return quiet()
    let body: { source?: unknown; path?: unknown } = {}
    try {
      const text = await req.text()
      if (!text || text.length > MAX_BODY) return quiet()
      const parsed = JSON.parse(text) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return quiet()
      body = parsed as typeof body
    } catch {
      return quiet()
    }

    const path = aiVisitPath(body.path, { strict: true })
    if (!path) return quiet()
    const source = aiVisitSource({ refererUrl: referer, clientSource: body.source })
    if (!source) return quiet()

    const limited = await rateLimit({ bucket: "ai-visit", subjects: [addressSubject(req)], windows: LIMITS.aiVisit, memoryFirst: true })
    if (limited) return quiet()

    const { error } = await createAdminClient().rpc("bump_platform_ai_visit", { p_source: source, p_path: path })
    if (error) {
      if (/bump_platform_ai_visit|platform_ai_visits|does not exist|could not find|PGRST202|PGRST205|42883|42P01/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) missingUntil = now + 10 * 60_000
      else console.warn("[ai-visit] not counted:", error.code ?? "")
    }
  } catch {
    /* a count never answers anything but 204 */
  }
  return quiet()
}
