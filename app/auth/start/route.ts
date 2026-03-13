import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import type { Provider } from "@supabase/supabase-js"

/**
 * GET /auth/start?provider=google|apple&next=/app
 *
 * Runs entirely server-side to kick off OAuth for any provider via PKCE.
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
 *   → provider → /auth/callback. At every step Chrome holds the verifier cookie
 *   and the code exchange succeeds.
 *
 * ANDROID FLOW (same for Google and Apple):
 *   1. Login page sets window.location.href = /auth/start?provider=google|apple
 *   2. StorelibWebViewClient intercepts storelib.com/auth/start → Custom Tab
 *   3. Chrome opens /auth/start → gets PKCE cookie → follows redirect to Supabase
 *   4. OAuth completes → Chrome lands on /auth/callback?code=...
 *   5. exchangeCodeForSession succeeds (Chrome has the PKCE verifier)
 *   6. /auth/callback generates a bridge_token and redirects to /app/auth/callback
 *   7. Android App Link fires → MainActivity loads /app/auth/callback in WebView
 *   8. /app/auth/callback validates bridge_token, sets session cookies in WebView
 *   9. Redirect to /app or /library — user is authenticated inside WebView ✅
 */

const ALLOWED_PROVIDERS: Provider[] = ["google", "apple"]

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  const rawProvider = searchParams.get("provider") ?? "google"
  const provider = ALLOWED_PROVIDERS.includes(rawProvider as Provider)
    ? (rawProvider as Provider)
    : "google"

  const supabase = await createClient()

  // CRITICAL: redirectTo MUST use `origin` (the actual request host), NOT
  // `canonicalUrl`.  The PKCE code-verifier cookie is scoped to the host that
  // serves /auth/start.  If we redirect back to a different host (e.g.
  // NEXT_PUBLIC_SITE_URL = storelib.com but we're on a Vercel preview deploy),
  // the callback won't find the cookie → "invalid flow state" error.
  const callbackOrigin = origin

  // Google requires offline access + re-consent queryParams.
  // Apple does NOT accept these params — omit them entirely for Apple.
  const googleQueryParams =
    provider === "google"
      ? { access_type: "offline", prompt: "consent" }
      : undefined

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // Clean URL with no nested query params — avoids double-encoding the
      // ?next=... value. /auth/callback already determines the correct
      // destination (/app vs /library) from the database.
      redirectTo: `${callbackOrigin}/auth/callback`,
      ...(googleQueryParams ? { queryParams: googleQueryParams } : {}),
      // Do NOT let the library navigate — we want the URL to return here so we
      // can redirect to it ourselves (keeping the Set-Cookie for PKCE in scope).
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    console.error(`[auth/start] ${provider} OAuth init error:`, error)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(error?.message ?? "OAuth initialisation failed")}`
    )
  }

  // The Supabase client has already written the PKCE code-verifier cookie to
  // the cookie store (via setAll → cookieStore.set). That Set-Cookie header
  // will be present on THIS 302 response, so Chrome Custom Tab stores it.
  return NextResponse.redirect(data.url)
}
