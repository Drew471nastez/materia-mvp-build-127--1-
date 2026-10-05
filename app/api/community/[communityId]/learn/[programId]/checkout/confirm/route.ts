import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { confirmProgramCheckout } from "@/lib/communities/server/learn-checkout"
import { isUuid } from "@/lib/courses/access"
import { sessionUserId } from "@/lib/courses/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/learn/<programId>/checkout/confirm { sessionId }
 *   -> { ok: true, programId } | 409 { error: "not_paid" } while Stripe is still settling it
 *
 * Asked by the sheet right after Stripe's onComplete. The session is read
 * from Stripe again and must be this member's, paid, and for this program;
 * then the program is theirs (the webhook makes the same grant, whichever
 * comes first, once).
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; programId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, programId } = await params
  if (!isUuid(programId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const userId = gate.viewer.userId as string
  const limited = await rateLimit({ bucket: "community-program-confirm", subjects: [`user:${userId}`], windows: [{ limit: 30, seconds: 600 }], message: "Too many tries. Wait a minute." })
  if (limited) return limited
  const body = await readJson(request)
  const { stripe } = await import("@/lib/stripe")
  const done = await confirmProgramCheckout(db, stripe, { sessionId: body.sessionId, userId })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  if (done.programId !== programId) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ ok: true, programId: done.programId }, { headers: noStore })
}
