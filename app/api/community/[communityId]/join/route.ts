import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { joinCommunity, joinRateLimit } from "@/lib/communities/server/join"
import { joinAddressLimit } from "@/lib/communities/server/safety"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "no-store" }

/**
 * POST /api/community/<communityId>/join  { note?, interval?: "month" | "year", answers?: { [questionId]: string | string[] } }
 *
 * The sales page's button. Answers one of
 *   { state: "member", url }     in now (a free tier, or a purchase already owned)
 *   { state: "pending" }         a request is waiting for an admin
 *   { state: "checkout", url }   a paid tier: pay there; nothing is granted here
 * or { error, message } with 401 sign_in, 403 banned | removed | invite_only |
 * suspended | archived, 404 not_found, 409 needs_product | unavailable, and
 * 400 answers_needed (with `field`, the question's id) when the community's
 * questions before joining are not answered (round 32).
 * Joining twice is the same answer twice, never a second row.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const {
    data: { user },
  } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "sign_in", message: "Sign in to join this community." }, { status: 401, headers: noStore })
  const limited = (await joinRateLimit(user.id)) ?? (await joinAddressLimit(request))
  if (limited) return limited
  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const answer = await joinCommunity(admin(), communityId, user.id, { note: body.note, interval: body.interval, answers: body.answers })
  if (!answer.ok) return NextResponse.json({ error: answer.error, message: answer.message, ...(answer.url ? { url: answer.url } : {}), ...(answer.field ? { field: answer.field } : {}) }, { status: answer.status, headers: noStore })
  return NextResponse.json(answer.state === "pending" ? { state: "pending" } : { state: answer.state, url: answer.url }, { headers: noStore })
}
