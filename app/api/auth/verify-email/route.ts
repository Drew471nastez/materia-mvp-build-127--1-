import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured, EMAIL_FROM, EMAIL_REPLY_TO } from "@/lib/mail"
import { claimVerificationSend } from "@/lib/security"
import { maskEmail } from "@/lib/privacy/mask-email"
import { codeEmail } from "@/lib/account/code-email"
import { STORELIB_ORIGIN } from "@/lib/brand/logo"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { routeUser } from "@/lib/auth/route-user"
import { CODE_EXPIRY_MINUTES, sendAccountCode, type CodeDb, type Limiter } from "@/lib/auth/email-code"

export const runtime = "nodejs"

/**
 * POST /api/auth/verify-email  { userId, email? }
 *
 * Mails a sign up code to the ACCOUNT'S OWN address, read from Supabase Auth.
 * The `email` in the request is never where the code goes (lib/auth/email-code.ts
 * explains the guest order takeover this closed, and why no session is required).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)

    if (!isSmtpConfigured()) {
      console.error("[verify-email] SMTP is not configured")
      return NextResponse.json({ error: "Email service not configured. Please add SMTP credentials to environment variables." }, { status: 500 })
    }

    const who = await routeUser({ fresh: false })
    const limit: Limiter = async (bucket, subjects, windows) => !!(await rateLimit({ bucket, subjects, windows }))

    const answer = await sendAccountCode(
      { userId: body?.userId, email: body?.email, sessionUserId: who.kind === "user" ? who.user.id : null, addressSubject: addressSubject(request) },
      {
        db: createAdminClient() as unknown as CodeDb,
        limit,
        origin: STORELIB_ORIGIN,
        claimSend: (key) => claimVerificationSend(key),
        send: async (to, code, copyHref) => {
          const letter = codeEmail({
            heading: "Your verification code",
            lead: "Use this code to verify your email and finish creating your Storelib account. You can copy it and paste it on the verification page.",
            code,
            minutes: CODE_EXPIRY_MINUTES,
            footer: "Storelib will never ask you to share this code. If you did not try to create an account, you can ignore this email.",
            copyHref,
          })
          try {
            const result = await sendEmail({
              from: EMAIL_FROM,
              replyTo: EMAIL_REPLY_TO,
              to,
              /* The code in the subject is what Gmail and Outlook show before the message is opened. */
              subject: `${code} is your Storelib code`,
              transactional: true,
              html: letter.html,
              text: letter.text,
            })
            if (result.success) console.log("[verify-email] sent to:", maskEmail(to), "ID:", result.messageId)
            else console.error("[verify-email] SMTP refused the send for:", maskEmail(to))
            return result
          } catch (error) {
            console.error("[verify-email] Error sending verification email:", error instanceof Error ? error.message : "unknown")
            return { success: false, error }
          }
        },
      },
    )
    return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[verify-email] Error in verify-email:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
