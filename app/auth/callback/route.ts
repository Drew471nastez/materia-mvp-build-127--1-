import { createServerClient } from "@supabase/ssr"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  // Use canonical site URL for redirects (always storelib.com in production)
  const canonicalUrl = process.env.NEXT_PUBLIC_SITE_URL || origin
  const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
  const isLocalhost = mainDomain.includes("localhost")

  if (error) {
    console.error("OAuth error:", error, errorDescription)
    return NextResponse.redirect(`${canonicalUrl}/login?error=${encodeURIComponent(errorDescription || error)}`)
  }

  if (code) {
    const cookieStore = await cookies()

    // Create Supabase client with proper cookie handling for cross-subdomain support
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, {
                  ...options,
                  // Set domain for cross-subdomain support
                  domain: isLocalhost ? undefined : `.${mainDomain}`,
                  secure: !isLocalhost,
                  sameSite: "lax",
                })
              })
            } catch {
              // Ignore errors from Server Components
            }
          },
        },
      }
    )

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

        // New users - redirect to client-side complete page which checks localStorage
        // for any stored redirect (e.g., returning to receipt page after signup)
        return NextResponse.redirect(`${canonicalUrl}/auth/complete?new=1`)
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
      return NextResponse.redirect(`${canonicalUrl}/auth/complete`)
    }
  }

  return NextResponse.redirect(`${canonicalUrl}/auth/auth-code-error`)
}
