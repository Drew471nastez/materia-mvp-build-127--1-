import { NextResponse, type NextRequest } from "next/server"
import { callerAddress, rateLimit } from "@/lib/api/rate-limit"
import { DEMO_COOKIE, DEMO_TTL_SECONDS, demoToken, passwordMatches } from "@/lib/payouts-demo/gate"
import { routeUser, signedOutOrRetry } from "@/lib/auth/route-user"

/**
 * POST   { password }  opens the Payouts demo for the signed in person (lib/payouts-demo/gate)
 * DELETE              closes it again
 *
 * Five tries in ten minutes, twenty a day, per person and per address: the
 * password cannot be guessed here.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

async function signedInUserId(): Promise<string | null> {
  const who = await routeUser()
  const user = who.kind === "user" ? who.user : null
  return user?.id ?? null
}

function secureCookie(request: NextRequest): boolean {
  return !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.get("host") || "")
}

export async function POST(request: NextRequest) {
  const userId = await signedInUserId()
  if (!userId) return signedOutOrRetry(NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE }))

  const limited = await rateLimit({
    bucket: "payouts-demo",
    subjects: [userId, callerAddress(request)],
    windows: [{ limit: 5, seconds: 600 }, { limit: 20, seconds: 86400 }],
    message: "Too many tries. Wait a few minutes and try again.",
  })
  if (limited) return limited

  const body = ((await request.json().catch(() => null)) ?? {}) as { password?: unknown }
  if (!passwordMatches(body.password)) {
    return NextResponse.json({ error: "That password is not right." }, { status: 401, headers: NO_STORE })
  }
  const token = demoToken(userId)
  if (!token) return NextResponse.json({ error: "The demo is not available right now." }, { status: 503, headers: NO_STORE })

  const res = NextResponse.json({ ok: true }, { headers: NO_STORE })
  res.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: DEMO_TTL_SECONDS,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true }, { headers: NO_STORE })
  res.cookies.set(DEMO_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}
