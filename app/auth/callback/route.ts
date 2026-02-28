import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

/**
 * GET /auth/callback?code=<code>&next=<path>
 *
 * Supabase redirects here after Google OAuth completes (inside Chrome Custom
 * Tab on Android, inside the browser on web).
 *
 * Steps:
 *  1. Exchange the PKCE auth code for a session (succeeds because Chrome
 *     holds the PKCE verifier cookie set by /auth/start).
 *  2. Upsert the user profile.
 *  3. Determine the post-login destination based on user type:
 *       creator / seller (has creators row or is_creator=true)  → /app
 *       buyer  (is_creator=false)                               → /library
 *  4a. Web/iOS: session is already in the browser's cookie jar from step 1
 *      → redirect straight to the destination.  No bridge token needed.
 *  4b. Android: generate a short-lived bridge_token (UUID stored in
 *      oauth_bridge_tokens) and redirect to /app/auth/callback?bridge_token=.
 *      The Android App Link fires, MainActivity loads that URL in the WebView,
 *      and /app/auth/callback exchanges the bridge token for session cookies
 *      in the WebView's jar, then redirects to the final destination.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  // next hint forwarded from /auth/start; overridden server-side by user type
  const nextHint = searchParams.get("next") || "/app"

  // Use the actual request origin, not NEXT_PUBLIC_SITE_URL.  The PKCE
  // code-verifier cookie is scoped to the host that served /auth/start, so the
  // callback must run on the same host.  On Vercel preview deployments the
  // origin differs from NEXT_PUBLIC_SITE_URL; using the env var here caused
  // "invalid flow state" because the cookie domain didn't match.
  const canonicalUrl = origin

  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
  }

  // ── 1. Exchange PKCE code for session ───────────────────────────────────
  const supabase = await createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    console.error("Code exchange error:", exchangeError)
    const errorMessage = exchangeError.message.includes("code verifier")
      ? "Session expired. Please try signing in again."
      : exchangeError.message
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(errorMessage)}`
    )
  }

  if (!data.user || !data.session) {
    return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
  }

  // ── 2. Upsert profile ───────────────────────────────────────────────────
  const adminSupabase = createAdminClient()
  const { avatar_url: oauthAvatar = null, full_name, name, picture = null } =
    data.user.user_metadata ?? {}
  const oauthDisplayName =
    full_name || name || data.user.email?.split("@")[0] || "User"
  const avatarUrl = oauthAvatar || picture

  const { data: existingProfile } = await adminSupabase
    .from("profiles")
    .select("id, is_creator, avatar_url, welcome_completed")
    .eq("id", data.user.id)
    .single()

  if (!existingProfile) {
    const { error: profileError } = await adminSupabase.from("profiles").insert({
      id: data.user.id,
      email: data.user.email,
      display_name: oauthDisplayName,
      avatar_url: avatarUrl,
      is_creator: false,
      welcome_completed: false,
    })
    if (profileError) console.error("Profile creation error:", profileError)
  } else if (!existingProfile.avatar_url && avatarUrl) {
    await adminSupabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", data.user.id)
  }

  // ── 3. Determine post-login destination ────────────────────────────────
  // creator/seller → /app, buyer → /library, new user → /app (onboarding)
  let nextPath = "/app"

  if (existingProfile) {
    const { data: creatorRow } = await adminSupabase
      .from("creators")
      .select("id")
      .eq("user_id", data.user.id)
      .maybeSingle()

    if (!creatorRow && existingProfile.is_creator === false) {
      nextPath = "/library"
    }
    // else: has creators row, or is_creator is true/null → keep /app
  }

  // ── 4. Web vs Android path ──────────────────────────────────────────────
  // The bridge-token dance is only needed on Android.  Chrome Custom Tab
  // (Android) and WebView have separate cookie jars: once the Custom Tab
  // completes OAuth, /auth/callback sets session cookies in Chrome's jar,
  // but the WebView can't read them.  The bridge token transfers the tokens
  // through the DB so /app/auth/callback can call setSession() inside the
  // WebView's jar (triggered via the Android App Link on that URL).
  //
  // On web the browser making this request IS the browser the user will
  // continue using, so the Set-Cookie headers from exchangeCodeForSession
  // above are already in its jar — no bridge token needed.  Skipping it
  // avoids a DB round-trip and eliminates the "Auth bridge failed" flash
  // that occurred when the oauth_bridge_tokens table was unavailable.
  //
  // StorelibApp path: when the native Capacitor app opens the OAuth URL via
  // Browser.open(), the Chrome Custom Tab sends our custom User-Agent string
  // "StorelibApp".  In this case we skip the bridge-token DB round-trip and
  // instead embed the tokens directly in the storelib:// deep-link URL.
  // Android intercepts the redirect → fires appUrlOpen → native-oauth.ts
  // calls setSession() with the embedded tokens inside the WebView context.
  const userAgent = request.headers.get("user-agent") ?? ""
  // Dual detection: prefer the explicit ?native=true query param because
  // Chrome Custom Tabs do NOT forward the custom WebView User-Agent
  // (set in MainActivity.java) — they use the standard Chrome UA.
  // The UA check is kept as a belt-and-suspenders fallback in case a
  // future build does inject the custom agent into the Custom Tab.
  const isStorelibApp =
    searchParams.get("native") === "true" ||
    userAgent.includes("StorelibApp")

  if (isStorelibApp) {
    // Redirect to the client-side bridge page, NOT directly to storelib://.
    // Chrome Custom Tab does not reliably follow server-side HTTP 302 redirects
    // to custom schemes, but it DOES follow them when JS calls
    // window.location.replace().  The bridge page renders instantly, detects
    // the StorelibApp UA client-side, and fires the deep link from JS.
    // It also shows a "Continue to App" fallback button after 2.5 s.
    console.log("[auth/callback] Native app detected (native=true or StorelibApp UA) — redirecting to /auth/app-callback bridge")
    const bridgeUrl =
      `${canonicalUrl}/auth/app-callback` +
      `?token=${encodeURIComponent(data.session.access_token)}` +
      `&refresh_token=${encodeURIComponent(data.session.refresh_token)}` +
      `&next=${encodeURIComponent(nextPath)}` +
      `&native=true`
    return NextResponse.redirect(bridgeUrl)
  }

  const isAndroid = userAgent.toLowerCase().includes("android")

  if (!isAndroid) {
    // Web / iOS: session already live in this browser — go straight to dest.
    return NextResponse.redirect(`${canonicalUrl}${nextPath}`)
  }

  // Android: create a short-lived bridge token so /app/auth/callback can
  // call setSession() inside the WebView's cookie jar.
  const { data: bridgeRow, error: bridgeError } = await adminSupabase
    .from("oauth_bridge_tokens")
    .insert({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      next_path: nextPath,
    })
    .select("id")
    .single()

  if (bridgeError || !bridgeRow) {
    console.error("Bridge token creation error:", bridgeError)
    // Fall back to direct redirect — on Android this means the WebView
    // won't have the session, but it's still better than an error loop.
    return NextResponse.redirect(`${canonicalUrl}${nextPath}`)
  }

  // ── 5. Redirect to App Link target ─────────────────────────────────────
  // This URL triggers the Android App Link → MainActivity opens and loads
  // it in the WebView, which then validates the bridge token and finalises
  // the session.
  return NextResponse.redirect(
    `${canonicalUrl}/app/auth/callback?bridge_token=${bridgeRow.id}&next=${encodeURIComponent(nextPath)}`
  )
}
