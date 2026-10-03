import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { listClassroom } from "@/lib/communities/server/classroom"
import { sessionUserId } from "@/lib/courses/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/community/<id>/classroom
 *   -> { courses: ClassroomCourse[] } (components/community/classroom/model.ts)
 *
 * The community's attached courses for an active member, with their own
 * progress and, for a course they cannot open yet, the reason in words.
 * Opening a course goes through the course player, which asks the
 * community grant again (lib/courses/server.ts ownsProduct).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  if (!gate.community.classroom_enabled) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const courses = await listClassroom(db, gate.community, gate.viewer)
  return NextResponse.json({ courses }, { headers: noStore })
}
