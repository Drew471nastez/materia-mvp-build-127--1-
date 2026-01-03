import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const userIdRaw = body?.userId
    const emailRaw = body?.email

    const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : ""
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : ""

    if (!userId || !email) {
      return NextResponse.json({ error: "User ID and email are required" }, { status: 400 })
    }

    const admin = createAdminClient()

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentCodes, error: recentError } = await admin
      .from("verification_codes")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", fifteenMinutesAgo)

    if (!recentError && recentCodes && recentCodes.length >= 3) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again in 15 minutes." },
        { status: 429 },
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    const { error: codeError } = await admin.from("verification_codes").insert({
      user_id: userId,
      code,
      email,
      expires_at: expiresAt.toISOString(),
    })

    if (codeError) {
      console.error("[v0] Error creating verification code:", codeError)
      return NextResponse.json({ error: "Failed to generate verification code" }, { status: 500 })
    }

    // Send verification email
    if (resend) {
      try {
        await resend.emails.send({
          from: "Materia <noreply@materiabuilder.store>",
          to: email,
          subject: "Verify your Materia account",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your email</h1>
              <p style="color: #666; margin-bottom: 24px;">
                Welcome to Materia! Enter the code below to verify your email and complete your signup.
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
                If you didn't create this account, please ignore this email.
              </p>
            </div>
          `,
        })
        console.log("[v0] Verification code email sent to:", email)
      } catch (emailError) {
        console.error("[v0] Error sending verification email:", emailError)
        return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    })
  } catch (error) {
    console.error("[v0] Error in verify-email:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
