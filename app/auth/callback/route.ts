import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/app"

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Check if user has a profile, if not create one
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", data.user.id).single()

      if (!profile) {
        // Create profile from OAuth data
        const userMetadata = data.user.user_metadata
        await supabase.from("profiles").upsert({
          id: data.user.id,
          email: data.user.email,
          display_name: userMetadata?.full_name || userMetadata?.name || data.user.email?.split("@")[0],
          avatar_url: userMetadata?.avatar_url || userMetadata?.picture,
          is_creator: false,
        })
      }

      // Check if user is a creator
      const { data: creator } = await supabase
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

      // New user or customer - send to onboarding
      return NextResponse.redirect(`${origin}/onboarding`)
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
