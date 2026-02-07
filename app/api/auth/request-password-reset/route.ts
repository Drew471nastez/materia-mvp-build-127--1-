import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { nanoid } from "nanoid"

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

// POST - Send password reset email (public - no auth required)
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

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

    // Generate reset token
    const resetToken = nanoid(64)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour expiry

    // Store reset token
    const { error: tokenError } = await adminSupabase.from("password_reset_requests").insert({
      user_id: user.id,
      email: cleanEmail,
      token: resetToken,
      expires_at: expiresAt.toISOString(),
      used: false,
    })

    if (tokenError) {
      console.error("Error storing reset token:", tokenError)
      return NextResponse.json({ error: "Failed to create reset request" }, { status: 500 })
    }

    // Generate reset URL
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://storelib.com"
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

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
                <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
                  Reset Password
                </a>
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
