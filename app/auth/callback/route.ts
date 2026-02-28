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
 *  4. Generate a short-lived bridge_token (UUID stored in oauth_bridge_tokens).
 *  5. Redirect to /app/auth/callback?bridge_token=<uuid>&next=<path>.
 *
 * On Android the App Link registered for /app/auth/callback fires at step 5,
 * closing the Custom Tab and opening MainActivity with the full URL.
 * MainActivity loads that full URL inside the WebView.
 * /app/auth/callback then validates the bridge_token, writes the session
 * cookies into the WebView's jar, and redirects to the final destination.
 *
 * On web (no App Link), the browser navigates to /app/auth/callback directly,
 * which performs the same session-cookie dance and redirects the user.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")
  // next hint forwarded from /auth/start; overridden server-side by user type
  const nextHint = searchParams.get("next") || "/app"

  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

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

  // ── 4. Generate bridge token ────────────────────────────────────────────
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
    return NextResponse.redirect(
      `${canonicalUrl}/login?error=${encodeURIComponent("Auth bridge failed. Please try again.")}`
    )
  }

  // ── 5. Redirect to App Link target ─────────────────────────────────────
  // On Android this URL triggers the App Link → MainActivity opens and loads
  // this URL in the WebView. On web the browser navigates here directly.
  return NextResponse.redirect(
    `${canonicalUrl}/app/auth/callback?bridge_token=${bridgeRow.id}&next=${encodeURIComponent(nextPath)}`
  )
}
