import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

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

        // New users - redirect to client-side complete page which checks localStorage
        // for any stored redirect (e.g., returning to receipt page after signup)
        return NextResponse.redirect(`${origin}/auth/complete?new=1`)
      }

      // Update avatar if not set
      if (!existingProfile.avatar_url && oauthAvatar) {
        await adminSupabase
          .from("profiles")
          .update({ avatar_url: oauthAvatar })
          .eq("id", data.user.id)
      }

      // For existing users, redirect to client-side complete page
      // This allows the page to check localStorage for any stored redirect URL
      // (e.g., returning to receipt page after login for review)
      return NextResponse.redirect(`${origin}/auth/complete`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
