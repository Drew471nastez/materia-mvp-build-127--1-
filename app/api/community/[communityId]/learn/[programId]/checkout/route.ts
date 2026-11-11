import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { requireMember } from "@/lib/communities/server/context"
import { startProgramCheckout } from "@/lib/communities/server/learn-checkout"
import { startModuleCheckout } from "@/lib/communities/server/module-sales"
import { readJson } from "@/lib/email-campaigns/route-auth"
import { isUuid } from "@/lib/courses/access"
import { addressSubject, rateLimit, LIMITS } from "@/lib/api/rate-limit"
import { createClient } from "@/lib/supabase/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * POST /api/community/<communityId>/learn/<programId>/checkout
 *   -> { clientSecret, sessionId, amountCents, currency }
 *
 * The Embedded Checkout session for one paid program, for the signed in
 * active member asking (lib/communities/server/learn-checkout.ts). The body
 * only ever names a module to buy on its own ({ moduleId }); the price, the
 * title and the creator's account are the server's. Limited like every
 * payment on Storelib.
 */
export async function POST(request: Request, { params }: { params: Promise<{ communityId: string; programId: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId, programId } = await params
  if (!isUuid(programId)) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const supabase = await createClient()
  const who = await routeUser()
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
  const deps = {
    stripe,
    ready: (creatorId: string) => checkoutReadyForCreator(creatorId),
    fee: (cents: number, creatorId: string, currency: string) => calculatePlatformFeeForCheckout(cents, creatorId, db, currency),
    chargeCurrency: platformChargeCurrency(),
  }
  /* Round AG: { moduleId } buys one module of the program on its own (lib/communities/server/module-sales.ts); the id only picks which, the price is the server's. */
  const body = await readJson(request).catch(() => ({}) as Record<string, unknown>)
  const moduleId = typeof body.moduleId === "string" && isUuid(body.moduleId) ? body.moduleId : null
  const started = moduleId
    ? await startModuleCheckout(db, deps, { community: gate.community, viewer: gate.viewer, programId, moduleId, email: user?.email ?? null })
    : await startProgramCheckout(db, deps, { community: gate.community, viewer: gate.viewer, programId, email: user?.email ?? null })
  if (started.ok === false) return NextResponse.json({ error: started.error, code: started.code }, { status: started.status, headers: noStore })
  return NextResponse.json({ clientSecret: started.clientSecret, sessionId: started.sessionId, amountCents: started.amountCents, currency: started.currency }, { headers: noStore })
}
