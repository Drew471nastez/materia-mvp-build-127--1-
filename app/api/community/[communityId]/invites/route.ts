import { NextResponse } from "next/server"
import { emailSubject, rateLimit } from "@/lib/api/rate-limit"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { RATE_LIMITS, rateBucket } from "@/lib/communities/limits"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, memberSubject, readJson, sessionUserId } from "@/lib/communities/server/feed"
import { createInvite } from "@/lib/communities/server/invites"
import { checkInvite } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/**
 * POST /api/community/<id>/invites { email?, maxUses?, expiresInDays? }
 *   -> 201 { invite (with its url, shown this once), sent }
 *
 * THE INVITE SHEET'S STAFF HALF (components/community/member/invite-sheet.tsx):
 * the same invites the creator side makes (lib/communities/server/invites.ts
 * createInvite: a random token stored only as its hash, an email invite for
 * that one address and used once, a link with an end date and a number of
 * uses), from inside the community, for whoever may invite here: the owner
 * and its admins (can(role, "invite")), whether or not they have a creator
 * account. A member, a moderator, somebody muted or an archived community is
 * refused by requireMember before anything is read. The tier, when one is
 * sent, must be this community's (createInvite checks it). Rate limited per
 * person and per address, as on the creator side.
 */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "invite")
  if (gate instanceof NextResponse) return gate
  const userId = String(gate.viewer.userId)
  const checked = checkInvite(await readJson(request))
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: NO_STORE })
  const limited = await rateLimit({
    bucket: rateBucket("invite"),
    subjects: [memberSubject(userId), checked.value.email ? emailSubject(checked.value.email) : null],
    windows: RATE_LIMITS.invite,
    message: "That is a lot of invites for one day. Try again tomorrow.",
  })
  if (limited) return limited
  const { data: me } = await db.from("profiles").select("display_name, username").eq("id", userId).maybeSingle()
  const inviterName = me?.display_name || (me?.username ? `@${me.username}` : "A member")
  const made = await createInvite(db, { community: gate.community, createdBy: userId, inviterName, input: checked.value })
  if (!made.ok) return NextResponse.json({ error: made.error }, { status: made.status, headers: NO_STORE })
  return NextResponse.json(made.made, { status: 201, headers: NO_STORE })
}
