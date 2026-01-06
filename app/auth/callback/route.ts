import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/onboarding"
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // Handle OAuth errors
  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorDescription || error)}`)
  }

  if (code) {
    const supabase = await createClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error("Code exchange error:", exchangeError)
      return NextResponse.redirect(`${origin}/auth/auth-code-error?error=${encodeURIComponent(exchangeError.message)}`)
    }

    if (data.user) {
      const adminSupabase = createAdminClient()
      const userMetadata = data.user.user_metadata

      // Extract avatar from OAuth provider (Google, Apple, etc.)
      // Google provides: avatar_url or picture
      // Apple provides: picture (sometimes)
      const oauthAvatar = userMetadata?.avatar_url || userMetadata?.picture || null
      
      // Extract display name from OAuth provider
      const oauthDisplayName = userMetadata?.full_name || userMetadata?.name || data.user.email?.split("@")[0] || "User"

      // Check if user has a profile
      const { data: existingProfile } = await adminSupabase
        .from("profiles")
        .select("id, is_creator, avatar_url, display_name")
        .eq("id", data.user.id)
        .single()

      if (!existingProfile) {
        // Create new profile for OAuth user
        const { error: profileError } = await adminSupabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          display_name: oauthDisplayName,
          avatar_url: oauthAvatar,
          is_creator: false,
        })

        if (profileError) {
          console.error("Profile creation error:", profileError)
          // Continue anyway - profile might exist from trigger
        }

        // New OAuth user - send to onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Profile exists - check if we should update avatar (if they don't have one yet)
      if (!existingProfile.avatar_url && oauthAvatar) {
        await adminSupabase
          .from("profiles")
          .update({ avatar_url: oauthAvatar })
          .eq("id", data.user.id)
      }

      // Check if user is a creator
      const { data: creator } = await adminSupabase
        .from("creators")
        .select("id, onboarding_completed")
        .eq("user_id", data.user.id)
        .single()

      if (creator) {
        // User is a creator
        if (creator.onboarding_completed === false) {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
        return NextResponse.redirect(`${origin}/app`)
      }

      // User has profile but is not a creator
      // Check if they've been through onboarding before
      if (existingProfile.is_creator === false) {
        // They chose buyer path before or haven't completed onboarding
        // Send to onboarding to let them choose
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Existing customer - send to dashboard
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // No code provided or user not found - return to error page
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
