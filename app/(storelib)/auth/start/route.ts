import { createClient } from "@/lib/supabase/server"
import { oauthQueryFor } from "@/lib/auth/google-oauth-params"
import { NextResponse } from "next/server"
import type { Provider } from "@supabase/supabase-js"
import { classifyOAuthError, describeForLog, loginErrorQuery } from "@/lib/auth/oauth-errors"
import { CARRY_COOKIE, CARRY_MAX_AGE_SECONDS, encodeCarry, readCarry } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"

/**
 * GET /auth/start?provider=google|apple&intent=sell&next=/somewhere
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

  /* Google gets its account chooser, so a person who logged out can pick another account: lib/auth/google-oauth-params.ts. Apple refuses Google's parameters either way. */
  const googleQueryParams = oauthQueryFor(provider)

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      // Clean URL with no nested query params — avoids double-encoding the
      // ?next=... value. /auth/callback already determines the correct
      // destination (/app vs /library) from the database.
      /**
       * NO QUERY STRING ON THIS. Supabase validates redirectTo against the
       * Site URL and the allow-list, and an allow-list entry written as an
       * exact URL would stop matching the moment a parameter is added. The
       * provider is remembered in sessionStorage by the login page instead,
       * which is the tab that pressed the button and is still the tab that
       * gets the answer back. A URL is not worth the risk to every social
       * sign in on the site.
       */
      redirectTo: `${callbackOrigin}/auth/callback`,
      ...(googleQueryParams ? { queryParams: googleQueryParams } : {}),
      // Do NOT let the library navigate — we want the URL to return here so we
      // can redirect to it ourselves (keeping the Set-Cookie for PKCE in scope).
      skipBrowserRedirect: true,
    },
  })

  if (error || !data.url) {
    /** Same rule as the callback: classify, log upstream, redirect a code. */
    const failure = classifyOAuthError({ message: error?.message }, provider)
    console.error(`[auth/start] ${provider} OAuth init failed:`, failure.code, describeForLog({ message: error?.message }))
    return NextResponse.redirect(`${canonicalUrl}/login?${loginErrorQuery(failure, provider)}`)
  }

  // The Supabase client has already written the PKCE code-verifier cookie to
  // the cookie store (via setAll → cookieStore.set). That Set-Cookie header
  // will be present on THIS 302 response, so Chrome Custom Tab stores it.
  const response = NextResponse.redirect(data.url)

  /*
    WHY THEY CAME, KEPT FOR THE WAY BACK. The callback URL cannot carry it
    (see the note on redirectTo above), so Sell on Storelib and the page to
    return to ride in a short lived cookie in this same browser, next to the
    PKCE verifier, and /auth/continue reads it once (lib/auth/continue.ts).
    Nothing to carry clears any cookie an earlier, abandoned attempt left.
  */
  const carry = encodeCarry(readCarry(searchParams, getMainDomain()))
  response.cookies.set(CARRY_COOKIE, carry, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: callbackOrigin.startsWith("https://"),
    maxAge: carry ? CARRY_MAX_AGE_SECONDS : 0,
  })
  return response
}
