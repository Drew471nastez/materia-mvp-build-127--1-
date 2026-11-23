import { NextResponse } from "next/server"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { MAX_BUSINESSES, canAddBusiness, createBusinessAccount, listBusinesses, recordSwitch, requestUser, sessionFor, signedOutAnswer } from "@/lib/businesses/server"
import { setSessionCookies } from "@/lib/businesses/session-cookies"

/**
 * The signed in person's businesses (GET), and another one (POST).
 *
 * POST makes the new business's account, links it, and answers with a
 * session for it, so the browser can go straight into its onboarding. Three
 * an hour: nobody opens businesses faster than that, and each one is an auth
 * account. How many a login can have is MAX_BUSINESSES (lib/businesses/
 * rules), or its own number in business_limits (SQL part 446, written only
 * by Storelib); the database holds the same number (the business_links
 * trigger), and this route only says it nicely.
 */

export const dynamic = "force-dynamic"
const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: Request) {
  const user = await requestUser(request)
  if (!user) return signedOutAnswer(request, NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))
  const businesses = await listBusinesses(user.id)
  const me = businesses.find((b) => b.current)
  /* The login's own limit (business_limits, SQL part 446) rides on every row; null is no limit. */
  const limit = me ? me.limit : MAX_BUSINESSES
  return NextResponse.json(
    { businesses, limit, canAdd: !!me && canAddBusiness(businesses.length, limit) },
    { headers: NO_STORE },
  )
}

export async function POST(request: Request) {
  const user = await requestUser(request)
  if (!user) return signedOutAnswer(request, NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))

  const limited = await rateLimit({
    bucket: "business-create",
    subjects: [`user:${user.id}`, addressSubject(request)],
    windows: [
      { limit: 3, seconds: 3600 },
      { limit: 6, seconds: 86400 },
    ],
    message: "You have tried that a few times. Try again in an hour.",
  })
  if (limited) return limited

  const created = await createBusinessAccount(user)
  if ("error" in created) {
    return NextResponse.json({ error: created.error }, { status: created.status, headers: NO_STORE })
  }

  const session = await sessionFor(created.memberId)
  if (!session) {
    /* Made and linked, only the session failed: it is in the account menu. */
    return NextResponse.json(
      { error: "Your new business is ready. Open it from the account menu.", userId: created.memberId },
      { status: 202, headers: NO_STORE },
    )
  }
  await recordSwitch(user.id, created.memberId, request)
  /* The new business's session in the answer's own cookies, as a switch's (lib/businesses/session-cookies): its setup opens as it with nothing on the page to wait on. */
  const res = NextResponse.json({ userId: created.memberId, session }, { headers: NO_STORE })
  setSessionCookies(res, request, session)
  return res
}
