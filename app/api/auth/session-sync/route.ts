import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * POST /api/auth/session-sync   { access_token, refresh_token }
 *
 * Re-writes the native app's session cookies from the tokens the Capacitor
 * client is currently holding.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * On native the session lives in Capacitor Preferences, and /auth/sync-session
 * copies it into cookies once at sign-in so Next.js server code can see it.
 * "Once" was the bug. Supabase rotates refresh tokens, so an hour later the
 * Preferences copy has moved on and the cookie copy is holding a token that no
 * longer works — and whichever of the two refreshed second got "Invalid Refresh
 * Token: Already Used" and signed the person out.
 *
 * This is the mirror being kept in step. lib/native-oauth.ts calls it on every
 * TOKEN_REFRESHED, so the cookie copy is always a COPY of the authority rather
 * than a second thing racing it, and middleware.ts deliberately never refreshes
 * a native request.
 *
 * The existing GET /auth/sync-session is unchanged and still owns the sign-in
 * navigation. This is the quiet upkeep afterwards: a fetch, no navigation, so
 * it can happen mid-session without the app moving.
 *
 * ---------------------------------------------------------------------------
 * On the tokens being in the body
 * ---------------------------------------------------------------------------
 * `setSession` validates them against Supabase — an invalid pair sets no
 * cookies and returns 400. A caller can only ever install a session they
 * already hold the tokens for, in their own browser, which is not an escalation
 * of anything. It is strictly better than the existing GET, which carries them
 * in a query string and therefore into access logs.
 *
 * Nothing about either token is logged here.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: { access_token?: unknown; refresh_token?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 })
  }

  const accessToken = typeof body.access_token === "string" ? body.access_token : ""
  const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token : ""
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: "missing tokens" }, { status: 400 })
  }

  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })
    if (error) {
      // The message, never the tokens.
      console.error("[session-sync] setSession failed:", error.message)
      return NextResponse.json({ error: "invalid session" }, { status: 400 })
    }
  } catch (e: any) {
    console.error("[session-sync] failed:", e?.message ?? e)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }

  // Cookies were written by setSession through the server client's `setAll`,
  // which works here because a Route Handler is allowed to set them — the
  // whole reason this is a route and not something the client does itself.
  return NextResponse.json({ ok: true })
}
