import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { emailButton } from "@/lib/mail-document"

export const runtime = "nodejs"

// POST - Send password reset email (authenticated - for logged-in users from settings)
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

    // Generate Supabase recovery link (creates the OTP in Supabase's DB)
    const redirectTo = "https://storelib.com/reset-password"
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: "recovery",
      email: user.email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error("Error generating recovery link:", linkError)
      return NextResponse.json({ error: "Failed to create reset request" }, { status: 500 })
    }

    // Bridge code: query-param based link that works through all email clients
    const bridgeCode = randomBytes(48).toString("base64url")

    await adminSupabase.from("password_reset_requests").insert({
      user_id: user.id,
      email: user.email,
      token: bridgeCode,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      used: false,
    })

    const resetUrl = `https://storelib.com/reset-password?code=${encodeURIComponent(bridgeCode)}`

    // Send password reset email
    if (isSmtpConfigured()) {
      try {
        const result = await sendEmail({
          from: "Storelib <noreply@storelib.com>",
          to: user.email,
          subject: "Reset your password",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Reset your password</h1>
              <p style="color: #666; margin-bottom: 24px;">
                You requested to reset your password on Storelib. Click the button below to set a new password:
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

You requested to reset your password on Storelib. Click the button below to set a new password:

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
    console.error("Reset password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
