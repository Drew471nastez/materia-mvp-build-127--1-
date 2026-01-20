import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// POST - Send verification code to new email address
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { newEmail } = body

    if (!newEmail) {
      return NextResponse.json({ error: "New email is required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    const cleanEmail = newEmail.trim().toLowerCase()

    // Check if new email is same as current
    if (cleanEmail === user.email?.toLowerCase()) {
      return NextResponse.json({ error: "New email must be different from current email" }, { status: 400 })
    }

    // Check if email is already taken
    const { data: existingUser } = await adminSupabase.auth.admin.listUsers()
    const emailTaken = existingUser?.users?.some(
      (u) => u.email?.toLowerCase() === cleanEmail && u.id !== user.id
    )

    if (emailTaken) {
      return NextResponse.json({ error: "This email is already in use" }, { status: 400 })
    }

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentCodes } = await adminSupabase
      .from("email_change_codes")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", fifteenMinutesAgo)

    if (recentCodes && recentCodes.length >= 3) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again in 15 minutes." },
        { status: 429 }
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    // Delete any existing pending codes for this user
    await adminSupabase
      .from("email_change_codes")
      .delete()
      .eq("user_id", user.id)
      .eq("verified", false)

    // Store verification code
    const { error: codeError } = await adminSupabase.from("email_change_codes").insert({
      user_id: user.id,
      new_email: cleanEmail,
      code,
      expires_at: expiresAt.toISOString(),
      verified: false,
    })

    if (codeError) {
      console.error("Error creating email change code:", codeError)
      return NextResponse.json({ error: "Failed to generate verification code" }, { status: 500 })
    }

    // Send verification email to NEW email address
    if (resend) {
      try {
        await resend.emails.send({
          from: "Storelib <noreply@storelib.com>",
          to: cleanEmail,
          subject: "Verify your new email address",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your new email address</h1>
              <p style="color: #666; margin-bottom: 24px;">
                You requested to change your email address on Materia. Enter this code to confirm:
              </p>

              <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Your verification code:</p>
                <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.1em; color: #000;">
                  ${code}
                </div>
                <p style="margin: 16px 0 0 0; color: #999; font-size: 12px;">
                  This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes
                </p>
              </div>

              <p style="color: #666; font-size: 14px;">
                If you didn't request this change, please ignore this email. Your account email will remain unchanged.
              </p>
            </div>
          `,
        })
      } catch (emailError) {
        console.error("Error sending verification email:", emailError)
        return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your new email address",
    })
  } catch (error) {
    console.error("Change email error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
