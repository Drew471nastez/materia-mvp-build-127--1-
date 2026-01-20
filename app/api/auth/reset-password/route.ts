import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { Resend } from "resend"
import { nanoid } from "nanoid"
import { createAdminClient } from "@/lib/supabase/admin"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// POST - Send password reset email
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
      email: user.email,
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
    if (resend) {
      try {
        await resend.emails.send({
          from: "Materia <noreply@storelib.com>",
          to: user.email,
          subject: "Reset your password",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
              <p style="color: #666; margin-bottom: 24px;">
                You requested to reset your password on Materia. Click the button below to set a new password:
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
        })
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
    console.error("Reset password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
