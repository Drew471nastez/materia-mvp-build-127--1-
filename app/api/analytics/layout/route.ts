import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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
 * Only the signed in seller's own row, found from their session; anything in
 * the body that is not a known report is dropped. Until part 254 has run a
 * write answers 503 not_ready and the page keeps the choice in the browser.
 */
async function sellerOf() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: creator } = await admin.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  return creator ? { admin, userId: user.id, creatorId: (creator as { id: string }).id } : { admin, userId: user.id, creatorId: null }
}

export async function GET() {
  const who = await sellerOf()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  if (!who.creatorId) return NextResponse.json({ reports: null }, { headers: NO_STORE })
  return NextResponse.json({ reports: await readReportLayout(who.admin, who.userId) }, { headers: NO_STORE })
}

export async function PUT(request: Request) {
  const who = await sellerOf()
  if (!who) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE })
  if (!who.creatorId) return NextResponse.json({ error: "Creator not found" }, { status: 404, headers: NO_STORE })
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
