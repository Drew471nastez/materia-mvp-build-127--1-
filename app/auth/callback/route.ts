import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

/**
 * GET /auth/callback?code=<code>&native=true
 *
 * Supabase redirects here after Google OAuth completes (Chrome Custom Tab on
 * Android, browser on web).
 *
 * Steps:
 *  1. Exchange the PKCE auth code for a session.
 *  2. Upsert the user profile.
 *  3. Determine post-login destination from DB.
 *  4a. Native (isStorelibApp): embed tokens in /auth/app-callback redirect →
 *      JS fires storelib:// deep link → handleOAuthCallback → /auth/sync-session.
 *  4b. Web: redirect straight to destination (session cookies already set).
 *  4c. Android non-native: bridge token via DB → App Link → WebView setSession.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code             = searchParams.get("code")
  const error            = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  const nextHint         = searchParams.get("next") || "/app"

  // Use the actual request origin so PKCE verifier cookie domain matches.
  const canonicalUrl = origin

  // ── DEBUG: log everything about the incoming request ─────────────────────
  const userAgent = request.headers.get("user-agent") ?? ""
  const nativeAuthCookie = request.cookies.get("storelib_native_auth")?.value === "1"
  const nativeParam = searchParams.get("native") === "true"
  const isStorelibApp = nativeParam || userAgent.includes("StorelibApp") || nativeAuthCookie

  // Log all incoming cookies (names only — values omitted for security)
  const allCookieNames = [...request.cookies.getAll().map(c => c.name)]
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  const supabaseRef = supabaseUrl ? new URL(supabaseUrl).hostname.split(".")[0] : "unknown"
  const pkceVerifierCookieName = `sb-${supabaseRef}-auth-token-code-verifier`
  const hasPkceVerifier = allCookieNames.includes(pkceVerifierCookieName)

  console.log(`[auth/callback] ▶ request received`)
  console.log(`[auth/callback]   full URL       : ${request.url.slice(0, 200)}`)
  console.log(`[auth/callback]   origin         : ${origin}`)
  console.log(`[auth/callback]   code           : ${code ? `"${code.slice(0, 12)}…" (present)` : "MISSING"}`)
  console.log(`[auth/callback]   error param    : ${error ?? "none"}`)
  console.log(`[auth/callback]   native param   : ${nativeParam}`)
  console.log(`[auth/callback]   native cookie  : ${nativeAuthCookie}`)
  console.log(`[auth/callback]   isStorelibApp  : ${isStorelibApp}`)
  console.log(`[auth/callback]   userAgent      : ${userAgent.slice(0, 100)}`)
  console.log(`[auth/callback]   supabaseRef    : ${supabaseRef}`)
  console.log(`[auth/callback]   pkceVerifier cookie name : ${pkceVerifierCookieName}`)
  console.log(`[auth/callback]   pkceVerifier present     : ${hasPkceVerifier}`)
  console.log(`[auth/callback]   all cookies    : [${allCookieNames.join(", ")}]`)

  if (error) {
    console.error(`[auth/callback] ✗ OAuth provider error: ${error} — ${errorDescription}`)
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (!code) {
    console.error(`[auth/callback] ✗ No code in request`)
    return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
  }

  // ── 1. Exchange PKCE code for session ─────────────────────────────────────
  console.log(`[auth/callback] Calling exchangeCodeForSession…`)
  const supabase = await createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    const isVerifierError =
      exchangeError.message.toLowerCase().includes("code verifier") ||
      exchangeError.message.toLowerCase().includes("pkce") ||
      exchangeError.message.toLowerCase().includes("flow state") ||
      exchangeError.message.toLowerCase().includes("invalid request")

    console.error(`[auth/callback] ✗ exchangeCodeForSession FAILED`)
    console.error(`[auth/callback]   error message  : ${exchangeError.message}`)
    console.error(`[auth/callback]   error code     : ${(exchangeError as any).status ?? "N/A"}`)
    console.error(`[auth/callback]   isVerifierError: ${isVerifierError}`)
    console.error(`[auth/callback]   PKCE cookie present: ${hasPkceVerifier}`)
    console.error(`[auth/callback]   native=true in URL : ${nativeParam}`)
    console.error(`[auth/callback]   storelib_native_auth cookie: ${nativeAuthCookie}`)
    console.error(`[auth/callback]   all cookie names: [${allCookieNames.join(", ")}]`)
    console.error(`[auth/callback]   ── DIAGNOSIS ──────────────────────────────────`)
    if (isVerifierError && !hasPkceVerifier) {
      console.error(`[auth/callback]   ROOT CAUSE: PKCE verifier cookie "${pkceVerifierCookieName}" was NOT sent by Chrome.`)
      console.error(`[auth/callback]   This is the cookie-jar cross-site block issue.`)
      console.error(`[auth/callback]   /auth/start must have set it with SameSite=None.`)
      console.error(`[auth/callback]   Check: did /auth/start run? Was the cookie present in the Set-Cookie response?`)
    } else if (isVerifierError && hasPkceVerifier) {
      console.error(`[auth/callback]   ROOT CAUSE: PKCE verifier cookie IS present but exchange still failed.`)
      console.error(`[auth/callback]   Possible: wrong verifier value, code already used, or Supabase server error.`)
    }

    const errorMessage = isVerifierError
      ? "Session expired. Please try signing in again."
      : exchangeError.message
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent(errorMessage)}`
    )
  }

  if (!data.user || !data.session) {
    console.error(`[auth/callback] ✗ No user/session returned from exchange`)
    return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
  }

  console.log(`[auth/callback] ✓ exchangeCodeForSession succeeded`)
  console.log(`[auth/callback]   userId  : ${data.user.id}`)
  console.log(`[auth/callback]   email   : ${data.user.email}`)

  // ── 2. Upsert profile ──────────────────────────────────────────────────────
  const adminSupabase = createAdminClient()
  const { avatar_url: oauthAvatar = null, full_name, name, picture = null } =
    data.user.user_metadata ?? {}
  const oauthDisplayName =
    full_name || name || data.user.email?.split("@")[0] || "User"
  const avatarUrl = oauthAvatar || picture

  const { data: existingProfile } = await adminSupabase
    .from("profiles")
    .select("id, is_creator, avatar_url, welcome_completed, email_verified")
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
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    })
    if (profileError) console.error("[auth/callback] Profile creation error:", profileError)
    else console.log(`[auth/callback]   ✓ new profile created`)
  } else {
    const updates: Record<string, unknown> = {}
    if (!existingProfile.avatar_url && avatarUrl) updates.avatar_url = avatarUrl
    if (!(existingProfile as any).email_verified) {
      updates.email_verified = true
      updates.email_verified_at = new Date().toISOString()
    }
    if (Object.keys(updates).length > 0) {
      await adminSupabase.from("profiles").update(updates).eq("id", data.user.id)
    }
    console.log(`[auth/callback]   existing profile found`)
  }

  // ── 3. Determine post-login destination ───────────────────────────────────
  let nextPath = "/signup/success"

  if (existingProfile) {
    const { data: creatorRow } = await adminSupabase
      .from("creators")
      .select("id, onboarding_completed")
      .eq("user_id", data.user.id)
      .maybeSingle()

    if (creatorRow?.onboarding_completed) {
      nextPath = "/app"
    } else if (existingProfile.welcome_completed && existingProfile.is_creator === false) {
      nextPath = "/library"
    } else if (existingProfile.welcome_completed && existingProfile.is_creator === true) {
      nextPath = "/app"
    }
  }

  console.log(`[auth/callback]   nextPath       : ${nextPath}`)
  console.log(`[auth/callback]   isStorelibApp  : ${isStorelibApp}`)

  // ── 4. Route based on client type ─────────────────────────────────────────
  if (isStorelibApp) {
    // Native Capacitor app via Chrome Custom Tab:
    //   /auth/callback can't redirect to storelib:// directly (Chrome blocks
    //   server-side 302 → custom schemes). Instead redirect to the bridge page
    //   which fires the deep link from client-side JS.
    //   handleOAuthCallback in native-oauth.ts detects token+refresh_token params
    //   and calls /auth/sync-session to write cookies in the WebView's jar.
    const bridgeUrl =
      `${canonicalUrl}/auth/app-callback` +
      `?token=${encodeURIComponent(data.session.access_token)}` +
      `&refresh_token=${encodeURIComponent(data.session.refresh_token)}` +
      `&next=${encodeURIComponent(nextPath)}` +
      `&native=true`

    console.log(`[auth/callback] ✓ Native path → /auth/app-callback`)
    console.log(`[auth/callback]   bridgeUrl (truncated): ${bridgeUrl.slice(0, 100)}…`)
    return NextResponse.redirect(bridgeUrl)
  }

  const isAndroid = userAgent.toLowerCase().includes("android")

  if (!isAndroid) {
    // Web or iOS: session cookies already set in this browser → go straight.
    console.log(`[auth/callback] ✓ Web path → ${nextPath}`)
    return NextResponse.redirect(`${canonicalUrl}${nextPath}`)
  }

  // Android non-native: bridge token via DB → App Link → WebView setSession.
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
    console.error("[auth/callback] Bridge token creation error:", bridgeError)
    return NextResponse.redirect(`${canonicalUrl}${nextPath}`)
  }

  console.log(`[auth/callback] ✓ Android bridge token path → /app/auth/callback`)
  return NextResponse.redirect(
    `${canonicalUrl}/app/auth/callback?bridge_token=${bridgeRow.id}&next=${encodeURIComponent(nextPath)}`
  )
}
