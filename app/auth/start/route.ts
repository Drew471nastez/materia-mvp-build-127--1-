import { createServerClient } from "@supabase/ssr"
import { cookies, headers } from "next/headers"
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
 *   1. Login page opens /auth/start?provider=google&native=true in Browser.open()
 *   2. Chrome Custom Tab opens /auth/start → gets PKCE cookie → follows to Google
 *   3. Google OAuth completes → Chrome lands on /auth/callback?code=...
 *   4. exchangeCodeForSession succeeds (Chrome has the PKCE verifier cookie)
 *   5. /auth/callback detects native via storelib_native_auth cookie → isStorelibApp=true
 *   6. /auth/callback embeds session tokens in /auth/app-callback redirect
 *   7. /auth/app-callback fires client-side JS deep link to storelib://auth/callback
 *   8. handleOAuthCallback in native-oauth.ts calls /auth/sync-session with tokens
 *   9. WebView gets session cookies → redirect to /app ✅
 *
 * WHY WE EXPLICITLY SET PKCE COOKIES ON THE RESPONSE:
 *   Supabase writes the PKCE code-verifier via cookieStore.set() (Next.js cookie
 *   store). In some Next.js runtime versions, cookies written this way are NOT
 *   automatically merged into a NextResponse.redirect() response object.
 *   We capture every cookie Supabase writes and explicitly call
 *   response.cookies.set() to guarantee the Set-Cookie headers are present on
 *   this 302 redirect — which is what Chrome Custom Tab stores.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const isNative = searchParams.get("native") === "true"
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  // CRITICAL: redirectTo MUST use `origin` (the actual request host), NOT
  // `canonicalUrl`.  The PKCE code-verifier cookie is scoped to the host that
  // serves /auth/start.  If we redirect back to a different host (e.g.
  // NEXT_PUBLIC_SITE_URL = storelib.com but we're on a Vercel preview deploy),
  // the callback won't find the cookie → "invalid flow state" error.
  const callbackOrigin = origin

  const cookieStore = await cookies()
  const headerStore = await headers()
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const requestHost = headerStore.get("host") || ""
  const isLocalhost = mainDomain.includes("localhost") || requestHost.includes("localhost")
  const hostWithoutPort = requestHost.split(":")[0]
  // Match the domain logic from lib/supabase/server.ts so cookies are
  // scoped consistently with the rest of the app.
  const cookieDomain =
    !isLocalhost &&
    (hostWithoutPort === mainDomain || hostWithoutPort.endsWith(`.${mainDomain}`))
      ? `.${mainDomain}`
      : undefined

  // Capture every cookie Supabase writes during signInWithOAuth so we can
  // explicitly add them to the redirect response below.
  const capturedCookies: Array<{
    name: string
    value: string
    options: Record<string, unknown>
  }> = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const enhancedOptions = {
              ...options,
              domain: cookieDomain,
              secure: isLocalhost ? (options?.secure ?? false) : true,
              sameSite: (options?.sameSite ?? "lax") as "lax" | "strict" | "none",
            }
            // Write to Next.js cookie store (existing behaviour — may or may
            // not reach the response headers depending on Next.js version)
            try {
              cookieStore.set(name, value, enhancedOptions)
            } catch {}
            // Also capture so we can explicitly call response.cookies.set()
            capturedCookies.push({ name, value, options: enhancedOptions })
          })
        },
      },
    }
  )

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

  const response = NextResponse.redirect(data.url)

  // Explicitly set PKCE and auth cookies on the response object.
  // This guarantees they appear in the Set-Cookie headers of this 302 redirect
  // so Chrome Custom Tab stores them before following to Google OAuth.
  capturedCookies.forEach(({ name, value, options }) => {
    response.cookies.set(
      name,
      value,
      options as Parameters<typeof response.cookies.set>[2]
    )
  })

  // When opened from the native app (Browser.open), mark this as a native
  // auth flow so /auth/callback can detect it via cookie instead of UA string.
  // Chrome Custom Tab uses a standard Chrome UA (not "StorelibApp"), so without
  // this cookie /auth/callback would fall through to the Android DB bridge-token
  // path which requires App Links — those don't fire in Chrome Custom Tab.
  if (isNative) {
    response.cookies.set("storelib_native_auth", "1", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes — long enough for slow OAuth flows
      path: "/auth/callback",
    })
  }

  return response
}
