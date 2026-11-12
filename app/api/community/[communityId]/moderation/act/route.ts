import { NextResponse, after } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit } from "@/lib/communities/server/creator"
import { CONTENT_ACTIONS, CONTENT_TARGETS, actOnContent, contentActionNeeds } from "@/lib/communities/server/moderation"
import { isOneOf } from "@/lib/communities/types"
import { announceModeration } from "@/lib/communities/server/realtime"
import { announceAddresses } from "@/lib/seo/announce-pages"
import { publicPostAddresses, seenByModeration } from "@/lib/seo/announce-posts"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/moderation/act
 *   { action: remove|restore|pin|unpin|lock|reopen|feature|unfeature|move,
 *     targetType: post|comment|message, targetId, reason?, spaceId? } -> { status }
 * For the moderator menus on posts, comments and chat. The action's own
 * permission (can()), the target must be this community's, and nobody acts
 * on the content of somebody ranked the same or above them. A removed chat
 * message has its body blanked in the same update.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const body = await readJson(request)
  if (!isOneOf(CONTENT_ACTIONS, body.action) || !isOneOf(CONTENT_TARGETS, body.targetType)) return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  const db = admin()
  const gate = await requireMember(db, communityId, user?.id ?? null, contentActionNeeds(body.action))
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.viewer.userId as string)
  if (limited) return limited
  /* Round 45 leftovers: where a public post was, read before a moderator removes or moves it, so search engines look again and drop it (lib/seo/announce-posts.ts). */
  const postId = seenByModeration(body.targetType, body.action) ? String(body.targetId ?? "") : null
  const before = postId ? await publicPostAddresses(gate.community.id, postId) : []
  const done = await actOnContent(db, {
    community: gate.community,
    actor: { userId: gate.viewer.userId as string, role: gate.viewer.role!, perms: gate.viewer.perms ?? null },
    action: body.action,
    targetType: body.targetType,
    targetId: String(body.targetId ?? ""),
    reason: typeof body.reason === "string" ? body.reason : null,
    spaceId: typeof body.spaceId === "string" ? body.spaceId : null,
  })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  const { targetType, action } = body
  after(() => announceModeration(db, gate.community.id, { type: targetType, id: String(body.targetId ?? ""), action }).catch(() => false))
  if (postId) after(async () => announceAddresses([...new Set([...before, ...(await publicPostAddresses(gate.community.id, postId))])]))
  return NextResponse.json({ status: done.status }, { headers: noStore })
}
