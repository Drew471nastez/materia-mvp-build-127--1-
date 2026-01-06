import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      const adminSupabase = createAdminClient()

      // Check if user has a profile
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("id, is_creator")
        .eq("id", data.user.id)
        .single()

      if (!profile) {
        const userMetadata = data.user.user_metadata
        await adminSupabase.from("profiles").insert({
          id: data.user.id,
          email: data.user.email,
          display_name: userMetadata?.full_name || userMetadata?.name || data.user.email?.split("@")[0],
          avatar_url: userMetadata?.avatar_url || userMetadata?.picture,
          is_creator: false,
        })

        // New OAuth user - send to onboarding
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      // Check if user is a creator
      const { data: creator } = await adminSupabase
        .from("creators")
        .select("id, onboarding_completed")
        .eq("user_id", data.user.id)
        .single()

      if (creator) {
        if (creator.onboarding_completed === false) {
          return NextResponse.redirect(`${origin}/onboarding`)
        }
        return NextResponse.redirect(`${origin}/app`)
      }

      // Existing customer - send to dashboard
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
