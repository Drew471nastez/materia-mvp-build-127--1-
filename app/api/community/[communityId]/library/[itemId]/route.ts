import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { libraryItemPage, touchItem } from "@/lib/communities/server/library"
import { isLibraryId } from "@/lib/communities/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET /api/community/<id>/library/<itemId> -> LibraryItemData
 *
 * One item's page for an active member: its description, and only for a
 * member who may open it, the routes to its files and links (never a file's
 * path, never a link's address). A draft, or a private item off their list,
 * is a 404 like an item that is not there. The view is counted.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ communityId: string; itemId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, itemId } = await params
  if (!isLibraryId(itemId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-library-read", subjects: [memberSubject(String(gate.viewer.userId))], windows: [{ limit: 120, seconds: 60 }], message: "Too many requests. Wait a moment." })
  if (limited) return limited
  const creatorId = gate.community.creator_id
  const page = await libraryItemPage(db, gate.community, gate.viewer, itemId, {
    canBuy: async () => (creatorId ? (await import("@/lib/payments/service")).checkoutReadyForCreator(creatorId) : false),
  })
  if (!page) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await touchItem(db, page.item.id, gate.viewer.userId, "view")
  return NextResponse.json(page, { headers: NO_STORE })
}
