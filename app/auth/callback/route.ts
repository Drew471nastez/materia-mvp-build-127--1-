import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

/**
 * GET /auth/callback?code=<code>
 *
 * Supabase redirects here after Google OAuth on web.
 * Native app OAuth is handled client-side via NativeAuthHandler + handleNativeOAuthCallback.
 *
 * Steps:
 *  1. Exchange the PKCE auth code for a session.
 *  2. Upsert the user profile.
 *  3. Determine destination: creator → /app, buyer → /library, new user → /signup/success.
 *  4. Redirect.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  if (error) {
    console.error("[auth/callback] OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorDescription || error)}`
    )
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
  }

  // 1. Exchange PKCE code for session
  const supabase = await createClient()
  const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !data.user || !data.session) {
    console.error("[auth/callback] Exchange error:", exchangeError)

    // ── Recover from the "code verifier missing" case silently ──
    // This error happens when the browser no longer has the PKCE verifier
    // cookie (e.g. duplicate callback, stale tab, cookie domain mismatch,
    // or the user already completed sign-in in another tab). If the user
    // ALREADY has a valid session — which is the common case when this
    // fires — we should NOT kick them back to /login with a scary
    // "Session expired" banner. Just check their current auth state and
    // redirect to /app (creator), /library (buyer), or /login (truly
    // unauthenticated), without any error query string.
    const isVerifierError = exchangeError?.message?.toLowerCase().includes("code verifier")
    if (isVerifierError) {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (currentUser) {
        // Already signed in — just take them home.
        return NextResponse.redirect(`${origin}/app`)
      }
      // Not signed in. Send them to /login WITHOUT the scary error — the
      // login page itself will prompt them calmly.
      return NextResponse.redirect(`${origin}/login`)
    }

    // Any other exchange error — also don't expose raw SDK messages. Send
    // them to /login cleanly.
    return NextResponse.redirect(`${origin}/login`)
  }

  // 2. Upsert profile
  const admin = createAdminClient()
  const { avatar_url, full_name, name, picture } = data.user.user_metadata ?? {}
  const displayName = full_name || name || data.user.email?.split("@")[0] || "User"
  const avatarUrl = avatar_url || picture || null

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id, is_creator, avatar_url, welcome_completed, email_verified")
    .eq("id", data.user.id)
    .single()

  if (!existingProfile) {
    await admin.from("profiles").insert({
      id: data.user.id,
      email: data.user.email,
      display_name: displayName,
      avatar_url: avatarUrl,
      is_creator: false,
      welcome_completed: false,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
    })
  } else {
    const updates: Record<string, unknown> = {}
    if (!existingProfile.avatar_url && avatarUrl) updates.avatar_url = avatarUrl
    if (!existingProfile.email_verified) {
      updates.email_verified = true
      updates.email_verified_at = new Date().toISOString()
    }
    if (Object.keys(updates).length > 0) {
      await admin.from("profiles").update(updates).eq("id", data.user.id)
    }
  }

  // 3. Determine destination
  let nextPath = "/signup/success"

  if (existingProfile) {
    const { data: creatorRow } = await admin
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

  return NextResponse.redirect(`${origin}${nextPath}`)
}
