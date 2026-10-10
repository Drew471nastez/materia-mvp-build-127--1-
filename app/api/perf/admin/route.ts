/**
 * The figures behind /admin/performance, for the window the page asks for
 * (`?window=24h` or `7d`). The admin cookie is checked first, before any
 * service-role read (lib/admin/gate); a stranger gets a 401 and nothing else.
 */
import { NextResponse, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { readPerfReport } from "@/lib/perf/read"
import { windowOf } from "@/lib/perf/report"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const report = await readPerfReport(windowOf(request.nextUrl.searchParams.get("window")))
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    return adminFailure("perf report", e, "The figures could not be read.")
  }
}
