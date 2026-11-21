import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { startEventCheckout } from "@/lib/communities/server/event-checkout"
import { isUuid } from "@/lib/courses/access"
import { addressSubject, rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/events/<eventId>/checkout
 *   -> { clientSecret, sessionId, amountCents, currency }
 *   -> { error, code } with code one of not_found, not_member, free,
 *      cancelled, closed, sales_closed, full, already_paid, price_changed,
 *      seller_unavailable, currency, stripe
 *
 * The Embedded Checkout session for one ticket, for the signed in active
 * member asking (lib/communities/server/event-checkout.ts). Nothing is read
 * from the body: the price, the title, the seat and the creator's account
 * are the server's. A seat is held before Stripe is asked, so the last seat
 * is never sold twice. Limited like every payment on Storelib.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; eventId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, eventId } = await params
  if (!isUuid(eventId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
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
  const [{ stripe }, { checkoutReadyForCreator }, { calculatePlatformFeeForCheckout }, { platformChargeCurrency }] = await Promise.all([
    import("@/lib/stripe"),
    import("@/lib/payments/service"),
    import("@/lib/billing/platform-fee-server"),
    import("@/lib/payments/fees/currency-rules"),
  ])
  const started = await startEventCheckout(
    db,
    {
      stripe,
      ready: (creatorId) => checkoutReadyForCreator(creatorId),
      fee: (cents, creatorId, currency) => calculatePlatformFeeForCheckout(cents, creatorId, db, currency, "digital"),
      chargeCurrency: platformChargeCurrency(),
    },
    { community: gate.community, viewer: gate.viewer, eventId, email: user?.email ?? null },
  )
  if (started.ok === false) return NextResponse.json({ error: started.error, code: started.code }, { status: started.status, headers: noStore })
  return NextResponse.json({ clientSecret: started.clientSecret, sessionId: started.sessionId, amountCents: started.amountCents, currency: started.currency }, { headers: noStore })
}
