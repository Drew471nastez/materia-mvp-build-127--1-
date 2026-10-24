import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { libraryShelf } from "@/lib/communities/server/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community/<id>/library -> LibraryShelfData
 *
 * The community's Library for an active member: every item they may see,
 * each with whether it opens and what opens it (lib/communities/server/
 * library.ts libraryShelf). Never a file or a link. 404 while the Library
 * is off.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-library-read", subjects: [memberSubject(String(gate.viewer.userId))], windows: [{ limit: 120, seconds: 60 }], message: "Too many requests. Wait a moment." })
  if (limited) return limited
  const shelf = await libraryShelf(db, gate.community, gate.viewer)
  if (!shelf) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json(shelf, { headers: NO_STORE })
}
