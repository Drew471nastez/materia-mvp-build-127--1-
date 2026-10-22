import { NextResponse } from "next/server"
import { rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, sessionUserId } from "@/lib/communities/server/feed"
import { itemAccess, itemLinkUrl, touchItem } from "@/lib/communities/server/library"
import { cleanLinkUrl, isLibraryId } from "@/lib/communities/library"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; itemId: string; index: string }> }

/**
 * GET /api/community/<id>/library/<itemId>/links/<n> -> 302 to the link
 *
 * A link of a Library resource is the thing itself (a shared folder, a
 * template, a recording), so its address is never in a page: only a member
 * who opens the item is sent on to it, from here, and the open is counted
 * as a download. The address is checked again before anyone is sent to it.
 */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, itemId, index } = await params
  const n = /^\d{1,2}$/.test(index) ? Number(index) : -1
  if (!isLibraryId(itemId) || n < 0) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({ bucket: "community-library-file", subjects: [memberSubject(String(gate.viewer.userId))], windows: [{ limit: 60, seconds: 600 }, { limit: 400, seconds: 86400 }], message: "Too many requests just now. Wait a few minutes and try again." })
  if (limited) return limited
  const access = await itemAccess(db, gate.community, gate.viewer, itemId)
  if (!access) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  if (!access.gate.open) return NextResponse.json({ error: "This is locked for you.", code: "locked" }, { status: 403, headers: NO_STORE })
  const url = cleanLinkUrl(itemLinkUrl(access.row, n))
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  await touchItem(db, access.row.id, gate.viewer.userId, "download")
  return NextResponse.redirect(url, { status: 302, headers: { ...NO_STORE, "Referrer-Policy": "no-referrer" } })
}
