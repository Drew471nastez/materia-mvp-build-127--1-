import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { confirmLibraryCheckout } from "@/lib/communities/server/library-checkout"
import { libraryFulfil } from "@/lib/communities/server/library-checkout-deps"
import { isLibraryId } from "@/lib/communities/library"
import { sessionUserId } from "@/lib/courses/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { readJson } from "@/lib/email-campaigns/route-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/library/<itemId>/checkout/confirm { sessionId }
 *   -> { ok: true, itemId, orderId } | 409 { error: "not_paid" } while Stripe is still settling it
 *
 * Asked by the sheet right after Stripe's onComplete. The session is read
 * from Stripe again and must be this member's, paid, and for this item;
 * then the order is made by the product checkout's own fulfilment (the
 * webhook makes the same order, whichever comes first, once), and the item
 * opens because its product is now in their library.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; itemId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, itemId } = await params
  if (!isLibraryId(itemId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const userId = gate.viewer.userId as string
  const limited = await rateLimit({ bucket: "community-library-confirm", subjects: [`user:${userId}`], windows: [{ limit: 30, seconds: 600 }], message: "Too many tries. Wait a minute." })
  if (limited) return limited
  const body = await readJson(request)
  const { stripe } = await import("@/lib/stripe")
  const done = await confirmLibraryCheckout(db, stripe, await libraryFulfil(db, { request }), { sessionId: body.sessionId, userId })
  if (done.ok === false) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  if (done.itemId !== itemId.toLowerCase()) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  return NextResponse.json({ ok: true, itemId: done.itemId, orderId: done.orderId }, { headers: noStore })
}
