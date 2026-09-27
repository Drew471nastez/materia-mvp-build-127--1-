import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { emailButton } from "@/lib/mail-document"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"

export const runtime = "nodejs"

async function findAuthUserByEmail(adminSupabase: ReturnType<typeof createAdminClient>, email: string) {
  const cleanEmail = email.trim().toLowerCase()

  // Fast path: lookup by profiles table first (works for email/password + OAuth users with profiles)
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle()

  if (profile?.id) {
    const { data: authUserData, error: authUserError } = await adminSupabase.auth.admin.getUserById(profile.id)
    if (!authUserError && authUserData?.user?.email?.toLowerCase() === cleanEmail) {
      return authUserData.user
    }
  }

  // Fallback: paginate through auth users (listUsers is paginated; first page alone misses many users)
  const perPage = 200
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage })
    if (error) break

    const users = data?.users || []
    const matchedUser = users.find((u) => u.email?.toLowerCase() === cleanEmail)
    if (matchedUser) return matchedUser

    if (users.length < perPage) break
  }

  return null
}

function getProviders(user: any): Set<string> {
  const providers = new Set<string>()

  const appProviders = user?.app_metadata?.providers
  if (Array.isArray(appProviders)) {
    for (const p of appProviders) providers.add(String(p).toLowerCase())
  }

  if (Array.isArray(user?.identities)) {
    for (const identity of user.identities) {
      if (identity?.provider) providers.add(String(identity.provider).toLowerCase())
    }
  }

  return providers
}

// POST - Send password reset email (public - no auth required)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    /*
      This form sends mail to an address the caller names. Unlimited, it is a
      way to send somebody a few thousand messages from this domain, which is
      how a domain stops being delivered anywhere. Counted by the address
      being mailed as well as the one asking.
    */
    const limited = await rateLimit({
      bucket: "password-reset",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: LIMITS.email,
      message: "A reset link was already sent. Check your inbox, then try again shortly.",
    })
    if (limited) return limited

    const cleanEmail = email.trim().toLowerCase()
    const adminSupabase = createAdminClient()

    // Find user by email (supports paginated auth users and OAuth-created accounts)
    const user = await findAuthUserByEmail(adminSupabase, cleanEmail)

    if (!user) {
      // For security, don't reveal if email exists or not
      // Just return success to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, we sent a reset link.",
      })
    }

    const providers = getProviders(user)
    const isGoogleOnly = providers.has("google") && !providers.has("email")

    if (isGoogleOnly) {
      return NextResponse.json({
        success: false,
        accountType: "google_only",
        message: "This account was created with Google. Please continue with Google.",
      }, { status: 409 })
    }

    // Rate limit: Check recent password reset attempts (max 3 per hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentRequests } = await adminSupabase
      .from("password_reset_requests")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", oneHourAgo)

    if (recentRequests && recentRequests.length >= 3) {
      return NextResponse.json(
        { error: "Too many reset attempts. Please try again in an hour." },
        { status: 429 }
      )
    }

    // ── Bridge code approach ──────────────────────────────────────────
    // Instead of sending the user to Supabase's verification URL (which
    // appends tokens in a #hash fragment that email clients / Gmail proxy
    // can strip), we generate our OWN one-time code, store it, and send
    // a link like: https://storelib.com/reset-password?code=<bridge_code>
    //
    // When the page loads with ?code=, it calls /api/auth/exchange-reset-code
    // which verifies the code + calls Supabase's verify endpoint server-side
    // (where hash fragments are never at risk) and returns the tokens.
    //
    // We also keep the Supabase generateLink call so the OTP exists in
    // Supabase's DB — exchange-reset-code will call the verify URL later.

    const redirectTo = "https://storelib.com/reset-password"
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Error generating recovery link:", linkError)
      return NextResponse.json({ error: "Failed to create reset request" }, { status: 500 })
    }

    // Generate a cryptographically secure bridge code (48 bytes = 64 URL-safe chars)
    const bridgeCode = randomBytes(48).toString("base64url")

    // Record the bridge code + the Supabase action_link so the exchange
    // endpoint can call Supabase's verify URL server-side.
    await adminSupabase.from("password_reset_requests").insert({
      user_id: user.id,
      email: cleanEmail,
      token: bridgeCode,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      used: false,
    })

    // The primary link the user clicks — uses a query param, never a hash fragment.
    // Works reliably through Gmail proxy, Outlook SafeLinks, and every email client.
    const resetUrl = `https://storelib.com/reset-password?code=${encodeURIComponent(bridgeCode)}`

    // Send password reset email
    if (isSmtpConfigured()) {
      try {
        const result = await sendEmail({
          from: "Storelib <noreply@storelib.com>",
          to: cleanEmail,
          subject: "Reset your password",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
              <p style="color: #666; margin-bottom: 24px;">
                You requested to reset your password. Click the button below to set a new password:
              </p>

              <div style="text-align: center; margin-bottom: 24px;">
                ${emailButton({ href: resetUrl, label: "Reset Password", fill: "#2563eb", padding: "12px 32px", radius: 8, text: "font-weight: 600;", align: "center" })}
              </div>

              <p style="color: #999; font-size: 14px; margin-bottom: 16px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="color: #666; font-size: 12px; word-break: break-all; background: #f5f5f5; padding: 12px; border-radius: 6px;">
                ${resetUrl}
              </p>

              <p style="color: #999; font-size: 12px; margin-top: 24px;">
                This link expires in 1 hour. If you didn't request this, please ignore this email.
              </p>
            </div>
          `,
          text: `Reset your password

You requested to reset your password. Click the link below to set a new password:

${resetUrl}

This link expires in 1 hour. If you didn't request this, please ignore this email.`,
        })

        if (!result.success) {
          console.error("Error sending reset email:", result.error)
          return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 })
        }
      } catch (emailError) {
        console.error("Error sending reset email:", emailError)
        return NextResponse.json({ error: "Failed to send reset email" }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Password reset email sent",
    })
  } catch (error) {
    console.error("Request password reset error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
