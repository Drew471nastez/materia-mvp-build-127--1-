import { NextResponse } from "next/server"
import { requireTeamPermission } from "@/lib/team/server"
import { readReportLayout, writeReportLayout } from "@/lib/analytics/report-layout"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NO_STORE = { "Cache-Control": "private, no-store" }

/**
 * THE REPORTS A SELLER ADDED TO /app/analytics (app/app/analytics/
 * add-reports), kept with the seller (lib/analytics/report-layout, SQL part
 * 254), so their phone and their laptop show the same cards.
 *
 *   GET   { reports: ["pageviews", ...] | null }
 *   PUT   { reports: [...] }  the whole list, in its order; 204
 *
 * Only the row of the store the session works in; anything in
 * the body that is not a known report is dropped. Until part 254 has run a
 * write answers 503 not_ready and the page keeps the choice in the browser.
 */
/** The row is the store's: its owner, or a team member given Analytics (lib/team), reads and changes it. */
async function sellerOf() {
  const gate = await requireTeamPermission("analytics")
  if (gate instanceof NextResponse) return gate
  return { admin: gate.db, ownerUserId: gate.ownerUserId, creatorId: gate.creatorId }
}

export async function GET() {
  const who = await sellerOf()
  if (who instanceof NextResponse) return who.status === 401 ? NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE }) : NextResponse.json({ reports: null }, { headers: NO_STORE })
  return NextResponse.json({ reports: who.ownerUserId ? await readReportLayout(who.admin, who.ownerUserId) : null }, { headers: NO_STORE })
}

export async function PUT(request: Request) {
  const who = await sellerOf()
  if (who instanceof NextResponse) return who
  let body: unknown
  try {
    const text = await request.text()
    if (text.length > 4000) return NextResponse.json({ error: "Too large" }, { status: 413, headers: NO_STORE })
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400, headers: NO_STORE })
  }
  const raw = body && typeof body === "object" ? (body as { reports?: unknown }).reports : null
  if (!Array.isArray(raw)) return NextResponse.json({ error: "Bad body" }, { status: 400, headers: NO_STORE })
  const saved = await writeReportLayout(who.admin, who.creatorId, raw)
  if (!saved.ok) return NextResponse.json({ error: saved.reason }, { status: saved.reason === "not_ready" ? 503 : 500, headers: NO_STORE })
  return new NextResponse(null, { status: 204, headers: NO_STORE })
}
