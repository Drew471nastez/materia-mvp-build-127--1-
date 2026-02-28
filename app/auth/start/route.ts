import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

/**
 * GET /auth/start?provider=google&next=/app
 *
 * Runs entirely server-side to kick off Google OAuth via Chrome Custom Tab.
 *
 * WHY THIS ROUTE EXISTS — the cookie-jar isolation problem:
 *   The Capacitor WebView and Chrome (Custom Tab) have separate cookie jars.
 *   If the WebView initiates OAuth (supabase.signInWithOAuth), the PKCE code
 *   verifier is set as a cookie in the WebView's jar. When Chrome later hits
 *   /auth/callback, it can't find that cookie → exchangeCodeForSession fails.
 *
 *   Fix: the Android app opens THIS route in a Chrome Custom Tab (not the
 *   WebView). Chrome receives the Set-Cookie from this response (PKCE verifier
 *   goes into Chrome's jar). Chrome then follows the redirect to Supabase OAuth
 *   → Google → /auth/callback. At every step Chrome holds the verifier cookie
 *   and the code exchange succeeds.
 *
 * ANDROID FLOW:
 *   1. Login page sets window.location.href = /auth/start?provider=google
 *   2. StorelibWebViewClient intercepts storelib.com/auth/start → Custom Tab
 *   3. Chrome opens /auth/start → gets PKCE cookie → follows redirect to Supabase
 *   4. Google OAuth completes → Chrome lands on /auth/callback?code=...
 *   5. exchangeCodeForSession succeeds (Chrome has the PKCE verifier)
 *   6. /auth/callback generates a bridge_token and redirects to /app/auth/callback
 *   7. Android App Link fires → MainActivity loads /app/auth/callback in WebView
 *   8. /app/auth/callback validates bridge_token, sets session cookies in WebView
 *   9. Redirect to /app or /library — user is authenticated inside WebView ✅
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get("next") || "/app"
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  const supabase = await createClient()

  // CRITICAL: redirectTo MUST use `origin` (the actual request host), NOT
  // `canonicalUrl`.  The PKCE code-verifier cookie is scoped to the host that
  // serves /auth/start.  If we redirect back to a different host (e.g.
  // NEXT_PUBLIC_SITE_URL = storelib.com but we're on a Vercel preview deploy),
  // the callback won't find the cookie → "invalid flow state" error.
  const callbackOrigin = origin

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      // Clean URL with no query params — avoids double-encoding the nested
      // ?next=... value, which caused Google to return 400 "malformed request".
      // /auth/callback already determines the correct destination (/app vs
      // /library) from the database, so the `next` hint is not needed.
      redirectTo: `${callbackOrigin}/auth/callback`,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
      // Do NOT let the library navigate — we want the URL to return here so we
      // can redirect to it ourselves (and keep the Set-Cookie for PKCE in scope).
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    console.error("OAuth init error:", error)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(error?.message ?? "OAuth initialisation failed")}`
    )
  }

  // The Supabase client has already written the PKCE code-verifier cookie to
  // the cookie store (via setAll → cookieStore.set). That Set-Cookie header
  // will be present on THIS 302 response, so Chrome Custom Tab stores it.
  return NextResponse.redirect(data.url)
}
