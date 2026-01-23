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
        .select("id, is_creator, avatar_url, display_name")
        .eq("id", data.user.id)
        .single()

      if (!existingProfile) {
        const { error: profileError } = await adminSupabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          display_name: oauthDisplayName,
          avatar_url: oauthAvatar,
          is_creator: false,
        })

        if (profileError) {
          console.error("Profile creation error:", profileError)
        }

        // New users go to signup success to choose creator or buyer
        return NextResponse.redirect(`${origin}/signup/success`)
      }

      if (!existingProfile.avatar_url && oauthAvatar) {
        await adminSupabase
          .from("profiles")
          .update({ avatar_url: oauthAvatar })
          .eq("id", data.user.id)
      }

      const { data: creator } = await adminSupabase
        .from("creators")
        .select("id, onboarding_completed")
        .eq("user_id", data.user.id)
        .single()

      if (creator) {
        if (creator.onboarding_completed === false) {
          return NextResponse.redirect(`${origin}/signup/success`)
        }
        return NextResponse.redirect(`${origin}/app`)
      }

      if (existingProfile.is_creator === false) {
        return NextResponse.redirect(`${origin}/signup/success`)
      }

      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
