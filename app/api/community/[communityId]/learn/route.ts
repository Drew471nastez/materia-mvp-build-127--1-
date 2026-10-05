import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { listPrograms } from "@/lib/communities/server/learn"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/learn
 *   -> { programs: ProgramCard[] } (components/community/learn/model.ts)
 *
 * The community's programs for an active member, with their own progress,
 * what they bought, and for a program they cannot open yet the reason in
 * words. Opening one goes through the course player, which asks again for
 * every lesson (lib/courses/server.ts lessonContext).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.classroom_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const programs = await listPrograms(db, gate.community, gate.viewer)
  return NextResponse.json({ programs }, { headers: noStore })
}
