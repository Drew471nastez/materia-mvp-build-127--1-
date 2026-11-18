import { NextResponse, type NextRequest } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { loadCommunity, viewerContext } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { recordMemberLinkClick, seesMemberLinks } from "@/lib/communities/server/member-shortcuts"
import { MEMBER_LINK_ID } from "@/lib/communities/member-link-view"
import { signedOutOrRetry } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string; linkId: string }> }

/**
 * POST /api/community/<id>/links/<linkId>/click -> { ok, counted }
 *
 * A member pressed one of the community's member links (components/
 * community/member/member-links.tsx sends it with navigator.sendBeacon, or a
 * keepalive fetch, as the link opens). Members and staff of the community
 * only, from the community's own pages only, a limited number a minute.
 * Counted once per member, link and day (lib/communities/server/
 * member-shortcuts.ts); the answer says nothing about the link.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  /* sendBeacon and fetch both say where they come from; another site's page may not count presses. */
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return NextResponse.json({ error: "forbidden" }, { status: 403, headers: NO_STORE })
  const { communityId, linkId } = await params
  if (!MEMBER_LINK_ID.test(linkId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const userId = await sessionUserId()
  if (!userId) return signedOutOrRetry(NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))
  const limited = await rateLimit({
    bucket: "community-link-click",
    subjects: [`user:${userId}`, addressSubject(request)],
    windows: [{ limit: 30, seconds: 60 }, { limit: 300, seconds: 3600 }],
    message: "Too many presses at once. Try again shortly.",
  })
  if (limited) return limited
  const db = admin()
  const community = await loadCommunity(db, { id: communityId })
  if (!community) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const viewer = await viewerContext(db, community, userId)
  /* Not a member (or the community is closed to them): the same answer as no such link, so nothing is learnt about the list. */
  if (!seesMemberLinks(community, viewer)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  const outcome = await recordMemberLinkClick(db, { community, viewer, linkId })
  if (outcome === "unknown_link") return NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE })
  return NextResponse.json({ ok: outcome !== "unavailable", counted: outcome === "counted" }, { headers: NO_STORE })
}
