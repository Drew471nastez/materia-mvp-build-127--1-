import { createClient } from "@/lib/supabase/server"
import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { keepProviderPhoto, type ProviderPhotoDb } from "@/lib/profile/provider-photo"
import { classifyOAuthError, describeForLog, loginErrorQuery } from "@/lib/auth/oauth-errors"
import { CONTINUE_PATH, sameOriginPath } from "@/lib/auth/continue"

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
  /*
    A PATH ON THIS SITE, NEVER AN ADDRESS. This is `${origin}${next}` below,
    and "https://storelib.com" followed by "@evil.com" is evil.com. Anything
    that is not a plain path goes to /auth/continue, which decides where a
    signed in person belongs (lib/auth/continue.ts).
  */
  const next = sameOriginPath(searchParams.get("next"), CONTINUE_PATH)

  if (!accessToken || !refreshToken) {
    console.error("[sync-session] Missing access_token or refresh_token")
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Session sync failed. Please sign in again.")}`
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    /**
     * setSession fails when the tokens have aged out between the exchange and
     * this request. The SDK's message is the wrong thing to show and, like
     * every other upstream string in this flow, it is classified and dropped.
     */
    const failure = classifyOAuthError({ message: error.message })
    console.error("[sync-session] setSession failed:", failure.code, describeForLog({ message: error.message }))
    return NextResponse.redirect(`${origin}/login?${loginErrorQuery(failure)}`)
  }

  /*
    THE APP'S SIGN IN LANDS HERE (lib/native-oauth.ts), never on the web
    callback, so this is where the app's Google sign in keeps the
    provider's photo for a profile that has none (lib/profile/provider-photo).
    After the answer, so nobody waits for it; it never overwrites a photo
    they set and never fails the sign in.
  */
  const signedIn = data.user
  if (signedIn) after(() => keepProviderPhoto(createAdminClient() as unknown as ProviderPhotoDb, signedIn).then(() => undefined))

  // Cookies are now written via Set-Cookie on this redirect response.
  // The WebView stores them and sends them on the next request to /app.
  return NextResponse.redirect(`${origin}${next}`)
}
