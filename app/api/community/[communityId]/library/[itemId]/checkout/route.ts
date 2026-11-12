import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { startLibraryCheckout } from "@/lib/communities/server/library-checkout"
import { libraryCheckoutDeps } from "@/lib/communities/server/library-checkout-deps"
import { isLibraryId } from "@/lib/communities/library"
import { addressSubject, rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { detectedCountry } from "@/lib/store/settings-server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/library/<itemId>/checkout
 *   -> { clientSecret, sessionId, amountCents, currency }
 *
 * The Embedded Checkout session for one sold Library item, for the signed
 * in active member asking (lib/communities/server/library-checkout.ts). The
 * body is not read: the price, the product, the creator's account, the fee
 * and the tax are all the server's. Limited like every payment on Storelib.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; itemId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, itemId } = await params
  if (!isLibraryId(itemId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return authUnavailableResponse()
  const user = who.kind === "user" ? who.user : null
  const db = admin()
  const gate = await requireMember(db, communityId, user?.id ?? null, "view")
  if (gate instanceof NextResponse) return gate
  const limited = await rateLimit({
    bucket: "payment",
    subjects: [addressSubject(request), `user:${gate.viewer.userId}`],
    windows: LIMITS.payment,
    message: "Too many payment attempts just now. Wait a few minutes and try again.",
  })
  if (limited) return limited
  const { data: profile } = await db.from("profiles").select("display_name").eq("id", gate.viewer.userId).maybeSingle()
  const started = await startLibraryCheckout(db, await libraryCheckoutDeps(db), {
    community: gate.community,
    viewer: gate.viewer,
    itemId,
    buyer: { userId: gate.viewer.userId as string, email: user?.email ?? null, name: (profile as { display_name?: string | null } | null)?.display_name ?? null, country: detectedCountry(request.headers) },
  })
  if (started.ok === false) return NextResponse.json({ error: started.error, code: started.code }, { status: started.status, headers: noStore })
  return NextResponse.json({ clientSecret: started.clientSecret, sessionId: started.sessionId, amountCents: started.amountCents, currency: started.currency }, { headers: noStore })
}
