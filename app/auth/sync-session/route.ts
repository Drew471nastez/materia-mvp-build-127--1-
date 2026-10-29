import { createClient } from "@/lib/supabase/server"
import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { keepProviderPhoto, type ProviderPhotoDb } from "@/lib/profile/provider-photo"
import { keepProfileName, type KeepNameDb } from "@/lib/profile/keep-name"
import { classifyOAuthError, describeForLog, loginErrorQuery } from "@/lib/auth/oauth-errors"
import { CONTINUE_PATH, sameOriginPath } from "@/lib/auth/continue"
import { classifyAuthError } from "@/lib/auth/auth-error"
import { logLine } from "@/lib/net/log"
import { REQUEST_ID_HEADER } from "@/lib/net/request-id"

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
 *   On a GET the tokens are query params, and a request's address DOES leave
 *   the device: it is in Vercel's request log. POST (below) takes them in
 *   the body instead, and the session recovery screen (components/native-
 *   auth-gate.tsx), the one caller that runs on the web and during an
 *   outage, again and again, posts. GET stays for the native sign in flows
 *   (lib/auth/native-session.ts, lib/auth/continue-client.ts) until they move.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  /*
    A PATH ON THIS SITE, NEVER AN ADDRESS. This is `${origin}${next}` below,
    and "https://storelib.com" followed by "@evil.com" is evil.com. Anything
    that is not a plain path goes to /auth/continue, which decides where a
    signed in person belongs (lib/auth/continue.ts).
  */
  const next = sameOriginPath(searchParams.get("next"), CONTINUE_PATH)
  return syncSession(request, searchParams.get("access_token"), searchParams.get("refresh_token"), next)
}

/**
 * POST /auth/sync-session, a form: access_token, refresh_token, next.
 *
 * Same origin only. A form post is a top level navigation, so the cookies
 * this writes land as they do on the GET; a page elsewhere posting its own
 * tokens here would sign a visitor into somebody else's account, so a post
 * whose Origin (or Sec-Fetch-Site) is not this site is refused.
 */
export async function POST(request: Request) {
  const { origin } = new URL(request.url)
  const from = request.headers.get("origin")
  const site = request.headers.get("sec-fetch-site")
  if ((from && from !== origin) || (!from && site && site !== "same-origin")) {
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } })
  }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.redirect(`${origin}/login`, 303)
  }
  const str = (k: string) => {
    const v = form.get(k)
    return typeof v === "string" && v ? v : null
  }
  const next = sameOriginPath(str("next"), CONTINUE_PATH)
  return syncSession(request, str("access_token"), str("refresh_token"), next, 303)
}

async function syncSession(request: Request, accessToken: string | null, refreshToken: string | null, next: string, status: 302 | 303 = 302) {
  const { origin } = new URL(request.url)
  if (!accessToken || !refreshToken) {
    console.error("[sync-session] Missing access_token or refresh_token")
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Session sync failed. Please sign in again.")}`,
      status,
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })

  if (error) {
    /*
      SUPABASE DID NOT ANSWER IS NOT "SIGN IN AGAIN" (lib/auth/auth-error.ts). setSession asks Supabase Auth, and
      during an outage that fails with a network error or a 5xx while the tokens are fine. That used to land on
      /login with an error, which is the recovery screen's loop turned into a sign out. Back to where they were
      going instead, no cookies changed: the page there decides again, and the recovery screen counts its tries
      (components/native-auth-gate.tsx MAX_RECOVERIES), so this is never a loop.
    */
    if (!classifyAuthError(error).signedOut) {
      console.warn(logLine("sync_session_unavailable", { reason: classifyAuthError(error).reason, rid: request.headers.get(REQUEST_ID_HEADER) }))
      return NextResponse.redirect(`${origin}${next}`, status)
    }
    /**
     * setSession fails when the tokens have aged out between the exchange and
     * this request. The SDK's message is the wrong thing to show and, like
     * every other upstream string in this flow, it is classified and dropped.
     */
    const failure = classifyOAuthError({ message: error.message })
    console.error("[sync-session] setSession failed:", failure.code, describeForLog({ message: error.message }))
    return NextResponse.redirect(`${origin}/login?${loginErrorQuery(failure)}`, status)
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
  /* And the provider's name over a made up one, the same way (lib/profile/keep-name). */
  if (signedIn) after(() => keepProfileName(createAdminClient() as unknown as KeepNameDb, signedIn).then(() => undefined))

  // Cookies are now written via Set-Cookie on this redirect response.
  // The WebView stores them and sends them on the next request to /app.
  /* Never cached: it carries a session. */
  const res = NextResponse.redirect(`${origin}${next}`, status)
  res.headers.set("Cache-Control", "no-store")
  return res
}
