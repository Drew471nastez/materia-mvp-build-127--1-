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

    console.log("[v0] verify-email API called with:", { userId: userId.slice(0, 8) + "...", email })

    if (!userId || !email) {
      console.log("[v0] Missing userId or email")
      return NextResponse.json({ error: "User ID and email are required" }, { status: 400 })
    }

    if (!resend) {
      console.error("[v0] RESEND_API_KEY is not configured")
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
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
      console.error("[v0] Error checking rate limit:", recentError)
    }

    if (!recentError && recentCodes && recentCodes.length >= 3) {
      console.log("[v0] Rate limit exceeded for user:", userId.slice(0, 8) + "...")
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again in 15 minutes." },
        { status: 429 },
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    console.log("[v0] Generated verification code, inserting into database...")

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

    console.log("[v0] Verification code saved to database, sending email via Resend...")

    try {
      const result = await resend.emails.send({
        from: "Storelib <noreply@storelib.io>",
        to: email,
        subject: `${code} is your Storelib verification code`,
        headers: {
          "X-Priority": "1",
          "X-MSMail-Priority": "High",
          Importance: "high",
        },
        html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 40px 40px 24px 40px;">
              <span style="font-size: 28px; font-weight: 700; color: #10b981; letter-spacing: -0.5px;">Storelib*</span>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 40px;">
              <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #171717; text-align: center;">
                Verify your email
              </h1>
              <p style="margin: 0 0 32px 0; font-size: 15px; color: #737373; text-align: center; line-height: 1.5;">
                Enter this code to complete your signup
              </p>
            </td>
          </tr>
          
          <!-- Code Box -->
          <tr>
            <td style="padding: 0 40px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; padding: 24px;">
                    <p style="margin: 0 0 8px 0; font-size: 13px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 1px;">
                      Your verification code
                    </p>
                    <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #ffffff; font-family: 'SF Mono', 'Roboto Mono', monospace;">
                      ${code}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Expiry Note -->
          <tr>
            <td align="center" style="padding: 16px 40px 0 40px;">
              <p style="margin: 0; font-size: 13px; color: #a3a3a3;">
                This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 32px 40px 40px 40px;">
              <p style="margin: 0; font-size: 13px; color: #a3a3a3; text-align: center; line-height: 1.6;">
                If you didn't create a Storelib account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
        
        <!-- Bottom text -->
        <p style="margin: 24px 0 0 0; font-size: 12px; color: #a3a3a3; text-align: center;">
          Sent by Storelib &bull; Build your digital storefront
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
        `,
        text: `Your Storelib verification code is: ${code}\n\nThis code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.\n\nIf you didn't create a Storelib account, you can safely ignore this email.`,
      })

      console.log("[v0] Resend API result:", result)

      if ("error" in result && result.error) {
        console.error("[v0] Resend API error:", result.error)
        return NextResponse.json({ error: "Failed to send email. Please try again." }, { status: 500 })
      }
    } catch (emailError) {
      console.error("[v0] Error sending verification email:", emailError)
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
    }

    console.log("[v0] Verification email sent successfully to:", email)

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    })
  } catch (error) {
    console.error("[v0] Error in verify-email:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
