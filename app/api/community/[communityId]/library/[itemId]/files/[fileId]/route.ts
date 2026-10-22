import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { itemAccess, signItemFile, touchItem } from "@/lib/communities/server/library"
import { isLibraryId } from "@/lib/communities/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; itemId: string; fileId: string }> }

/**
 * GET /api/community/<id>/library/<itemId>/files/<fileId> -> 302 to a signed address
 *
 * One file of a Library item, for an active member who opens the item,
 * asked again here (lib/communities/library.ts libraryGate): free, their
 * tier, their level, picked, or bought (an entitlement to its product,
 * which a refund takes away). Anybody else gets the same 404 as a file that
 * is not there, or a 403 that says it is locked. The address is signed for
 * five minutes, saves rather than opens, and is made for this request only.
 * A resource's file comes from the uploader's own folder in this community;
 * a product's goes through the same file checks as every buyer download.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, itemId, fileId } = await params
  if (!isLibraryId(itemId) || !isLibraryId(fileId)) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-library-file", subjects: [memberSubject(String(gate.viewer.userId))], windows: [{ limit: 60, seconds: 600 }, { limit: 400, seconds: 86400 }], message: "Too many downloads just now. Wait a few minutes and try again." })
  if (limited) return limited
  const access = await itemAccess(db, gate.community, gate.viewer, itemId)
  if (!access) return NextResponse.json({ error: "File not found" }, { status: 404, headers: NO_STORE })
  if (!access.gate.open) return NextResponse.json({ error: "This is locked for you.", code: "locked" }, { status: 403, headers: NO_STORE })
  const signed = await signItemFile(db, gate.community, access.row, fileId, { creator: access.gate.via === "staff" })
  if (signed.ok === false) return NextResponse.json({ error: signed.error }, { status: signed.status, headers: NO_STORE })
  await touchItem(db, access.row.id, gate.viewer.userId, "download")
  return NextResponse.redirect(signed.url, { status: 302, headers: NO_STORE })
}
