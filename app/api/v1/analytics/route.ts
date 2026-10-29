import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { bearerOf, storeOfApiToken } from "@/lib/analytics/destinations/api-tokens-server"
import { exportCsv, parseExportQuery, readExport } from "@/lib/analytics/destinations/export-api"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * GET /api/v1/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD[&tz=][&format=json|csv][&report=daily|products|pages]
 * Authorization: Bearer sla_…
 *
 * A store's daily visitors, page views, orders and revenue, and its top
 * products and pages, for a spreadsheet, a dashboard or a script
 * (lib/analytics/destinations/export-api). The key is read only and reads
 * one store (Analytics › Send to › Analytics API); the database holds its
 * hash. 60 requests a minute and 2,000 a day per key; wrong keys are
 * counted per address. Never cached.
 */
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }

function problem(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status, headers: { ...HEADERS, ...(status === 401 ? { "WWW-Authenticate": 'Bearer realm="storelib-analytics"' } : {}) } })
}

export async function GET(request: Request) {
  const token = bearerOf(request.headers.get("authorization"))
  if (!token) {
    const limited = await rateLimit({ bucket: "analytics-api-auth-fail", subjects: [addressSubject(request)], windows: [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 3600 }], message: "Too many requests without a valid key. Wait a minute." })
    return limited ?? problem(401, "Send a key from Analytics › Send to › Analytics API as Authorization: Bearer sla_…")
  }
  const db = createAdminClient()
  const who = await storeOfApiToken(db, token)
  if (!who) {
    const limited = await rateLimit({ bucket: "analytics-api-auth-fail", subjects: [addressSubject(request)], windows: [{ limit: 20, seconds: 60 }, { limit: 200, seconds: 3600 }], message: "Too many wrong keys from here. Wait a minute." })
    return limited ?? problem(401, "That key is wrong or was revoked.")
  }
  const limited = await rateLimit({ bucket: "analytics-api", subjects: [`token:${who.tokenId}`], windows: [{ limit: 60, seconds: 60 }, { limit: 2000, seconds: 86400 }], message: "Too many requests with this key. Wait a minute." })
  if (limited) return limited
  const parsed = parseExportQuery(new URL(request.url).searchParams)
  if (parsed.ok === false) return problem(400, parsed.error)
  const answer = await readExport(db, who.creatorId, parsed.q)
  if (parsed.q.format === "csv") {
    return new NextResponse(exportCsv(answer, parsed.q.report), { status: 200, headers: { ...HEADERS, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="storelib-${parsed.q.report}-${parsed.q.from}-${parsed.q.to}.csv"` } })
  }
  return NextResponse.json({ store_id: who.creatorId, ...answer }, { headers: HEADERS })
}
