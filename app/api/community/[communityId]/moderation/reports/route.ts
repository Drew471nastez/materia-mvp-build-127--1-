import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { listReports, updateReport } from "@/lib/communities/server/moderation"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

async function signedIn(): Promise<string | null> {
  const who = await routeUser()
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  return user?.id ?? null
}

/**
 * GET   /api/community/<communityId>/moderation/reports?status=open|closed|open|reviewing|resolved|dismissed&cursor=
 *       -> { rows, next }: the report queue with what each report is about.
 * PATCH /api/community/<communityId>/moderation/reports { id, status, resolution? }
 * Moderators and above (review_reports).
 */
export async function GET(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await signedIn(), "review_reports")
  if (gate instanceof NextResponse) return gate
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || "open"
  return NextResponse.json(await listReports(db, gate.community.id, { status: status as "open", cursor: url.searchParams.get("cursor") }), { headers: noStore })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await signedIn(), "review_reports")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.viewer.userId as string)
  if (limited) return limited
  const body = await readJson(request)
  const done = await updateReport(db, { community: gate.community, actor: { userId: gate.viewer.userId as string, role: gate.viewer.role! }, id: String(body.id ?? ""), status: body.status, resolution: body.resolution })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
