import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // Use canonical site URL for redirects (always storelib.com in production)
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin

  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return NextResponse.redirect(`${canonicalUrl}/login?error=${encodeURIComponent(errorDescription || error)}`)
  }

  if (code) {
    // Use shared server client which has proper cross-subdomain cookie handling
    const supabase = await createClient()

    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error("Code exchange error:", exchangeError)
      // If PKCE error, provide a clearer message
      const errorMessage = exchangeError.message.includes("code verifier")
        ? "Session expired. Please try signing in again."
        : exchangeError.message
      return NextResponse.redirect(`${canonicalUrl}/login?error=${encodeURIComponent(errorMessage)}`)
    }

    if (data.user) {
      const adminSupabase = createAdminClient()
      const userMetadata = data.user.user_metadata

      const oauthAvatar = userMetadata?.avatar_url || userMetadata?.picture || null
      const oauthDisplayName = userMetadata?.full_name || userMetadata?.name || data.user.email?.split("@")[0] || "User"

      const { data: existingProfile } = await adminSupabase
        .from("profiles")
        .select("id, is_creator, avatar_url, display_name, welcome_completed")
        .eq("id", data.user.id)
        .single()

      if (!existingProfile) {
        // New user - create profile
        const { error: profileError } = await adminSupabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          display_name: oauthDisplayName,
          avatar_url: oauthAvatar,
          is_creator: false,
          welcome_completed: false,
        })

        if (profileError) {
          console.error("Profile creation error:", profileError)
        }

        // New users — redirect to /app/auth/callback so the Android App Link
        // fires and opens the app. On web (no app installed) that route
        // redirects onward to /app.
        return NextResponse.redirect(`${canonicalUrl}/app/auth/callback`)
      }

      // Update avatar if not set
      if (!existingProfile.avatar_url && oauthAvatar) {
        await adminSupabase
          .from("profiles")
          .update({ avatar_url: oauthAvatar })
          .eq("id", data.user.id)
      }

      // Redirect to /app/auth/callback — the Android App Link intercepts
      // this in Chrome Custom Tab and opens MainActivity directly.
      // On web the route handler at /app/auth/callback redirects to /app.
      return NextResponse.redirect(`${canonicalUrl}/app/auth/callback`)
    }
  }

  return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
}
