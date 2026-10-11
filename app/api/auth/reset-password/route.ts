import { NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { resetPasswordEmail } from "@/lib/account/reset-email"

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
        /* Branded like every account email, and transactional: no click tracking on the link, no stale bounce dropping it (lib/account/reset-email.ts). */
        const mail = resetPasswordEmail({ resetUrl, minutes: 60 })
        const result = await sendEmail({
          from: "Storelib <noreply@storelib.com>",
          to: user.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          transactional: true,
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
