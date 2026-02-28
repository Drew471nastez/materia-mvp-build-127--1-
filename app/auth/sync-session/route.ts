import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /auth/sync-session?access_token=...&refresh_token=...&next=/app
 *
 * Bridges a native Capacitor PKCE session (stored in Capacitor Preferences /
 * Android SharedPreferences) into the server-side cookie system so that
 * Next.js server components and layouts can authenticate the user.
 *
 * WHY THIS EXISTS — the native storage mismatch:
 *   The Capacitor Supabase client stores sessions in Capacitor Preferences.
 *   Next.js server code (layouts, route handlers) reads sessions from HTTP
 *   cookies.  After a successful native PKCE exchange, no cookies are set,
 *   so every server-side auth check fails → redirect("/login") → loop.
 *
 *   Fix: after exchangeCodeForSession() succeeds in native-oauth.ts (or when
 *   checkAuth() finds an existing native session on the login page), navigate
 *   here with the access + refresh tokens.  This handler calls setSession()
 *   on the server-side Supabase client, which writes the session as Set-Cookie
 *   headers on the 302 redirect response.  The WebView stores those cookies,
 *   and all subsequent server requests include them — auth passes. ✅
 *
 * SECURITY NOTE:
 *   Tokens are passed as query params (visible in server logs).  This is
 *   acceptable in the native WebView context: the URL never leaves the device,
 *   access tokens are short-lived (1 h), and this matches the security posture
 *   of the existing bridge-token flow.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const accessToken = searchParams.get("access_token")
  const refreshToken = searchParams.get("refresh_token")
  const next = searchParams.get("next") ?? "/app"

  if (!accessToken || !refreshToken) {
    console.error("[sync-session] Missing access_token or refresh_token")
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Session sync failed. Please sign in again.")}`
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    console.error("[sync-session] setSession error:", error.message)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    )
  }

  // Cookies are now written via Set-Cookie on this redirect response.
  // The WebView stores them and sends them on the next request to /app.
  return NextResponse.redirect(`${origin}${next}`)
}
