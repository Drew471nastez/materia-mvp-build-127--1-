import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { joinRateLimit, redeemInvite } from "@/lib/communities/server/join"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/invite/redeem  { token }
 *
 * The raw token from an invite link (/community/<slug>/join?invite=<token>).
 * Only its sha256 is looked up, and only an invite of THIS community is
 * redeemed (public.community_redeem_invite counts the use atomically, once
 * per person). Answers
 *   { state: "member", url, already }   in (already: they were a member)
 *   { state: "checkout", url }          an invite to a paid tier that is not
 *                                       complimentary: approved, now pay
 * or { error, message }: 401 sign_in, 400/404 not_found, 410 revoked |
 * expired | used_up, 403 email_mismatch | banned.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in", message: "Sign in to use this invite." }, { status: 401, headers: noStore })
  const limited = await joinRateLimit(user.id)
  if (limited) return limited
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const answer = await redeemInvite(admin(), communityId, user.id, body.token)
  if (!answer.ok) return NextResponse.json({ error: answer.error, message: answer.message }, { status: answer.status, headers: noStore })
  return NextResponse.json(answer.state === "member" ? { state: "member", url: answer.url, already: answer.already } : { state: "checkout", url: answer.url }, { headers: noStore })
}
