import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/mail"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"
import { maskEmail } from "@/lib/privacy/mask-email"
import { codeEmail } from "@/lib/account/code-email"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const userIdRaw = body?.userId
    const emailRaw = body?.email

    const userId = typeof userIdRaw === "string" ? userIdRaw.trim() : ""
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : ""

    console.log("[verify-email] API called with:", { userId: userId.slice(0, 8) + "...", email: maskEmail(email) })

    if (!userId || !email) {
      console.log("[verify-email] Missing userId or email")
      return NextResponse.json({ error: "User ID and email are required" }, { status: 400 })
    }

    if (!isSmtpConfigured()) {
      console.error("[verify-email] SMTP is not configured")
      return NextResponse.json({ error: "Email service not configured. Please add SMTP credentials to environment variables." }, { status: 500 })
    }

    const admin = createAdminClient()

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentCodes, error: recentError } = await admin
      .from("verification_codes")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", fifteenMinutesAgo)

    if (recentError) {
      console.error("[verify-email] Error checking rate limit:", recentError)
    }

    if (!recentError && recentCodes && recentCodes.length >= 8) {
      console.log("[verify-email] Rate limit exceeded for user:", userId.slice(0, 8) + "...")
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again in 15 minutes." },
        { status: 429 },
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    console.log("[verify-email] Generated verification code, inserting into database...")

    const { data: inserted, error: codeError } = await admin.from("verification_codes").insert({
      user_id: userId,
      code,
      email,
      expires_at: expiresAt.toISOString(),
    }).select("id").maybeSingle()

    if (codeError) {
      console.error("[verify-email] Error creating verification code:", codeError)
      return NextResponse.json({ error: "Failed to generate verification code" }, { status: 500 })
    }

    console.log("[verify-email] Verification code saved to database, sending email...")

    const letter = codeEmail({
      heading: "Your verification code",
      lead: "Enter this code on Storelib to finish creating your account.",
      code,
      minutes: VERIFICATION_CODE_EXPIRY_MINUTES,
      footer: "If you did not sign up for Storelib, you can ignore this email.",
    })

    try {
      const result = await sendEmail({
        from: EMAIL_FROM,
        replyTo: EMAIL_REPLY_TO,
        to: email,
        /* The code in the subject is what Gmail and Outlook show before the message is opened. */
        subject: `${code} is your Storelib code`,
        transactional: true,
        html: letter.html,
        text: letter.text,
      })

      console.log("[verify-email] SMTP result:", JSON.stringify(result))

      if (!result.success) {
        console.error("[verify-email] SMTP error:", result.error)
        if (inserted?.id) await admin.from("verification_codes").delete().eq("id", inserted.id)
        return NextResponse.json({
          error: "Could not send the code. Try again in a moment."
        }, { status: 500 })
      }

      console.log("[verify-email] Verification email sent successfully to:", maskEmail(email), "ID:", result.messageId)

      return NextResponse.json({
        success: true,
        message: "Verification code sent to your email",
        emailId: result.messageId,
      })
    } catch (emailError) {
      console.error("[verify-email] Error sending verification email:", emailError)
      const errorMessage = emailError instanceof Error ? emailError.message : "Unknown error"
      return NextResponse.json({ error: `Failed to send verification email: ${errorMessage}` }, { status: 500 })
    }
  } catch (error) {
    console.error("[verify-email] Error in verify-email:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
