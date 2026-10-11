import { after, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { googleSignInEmail, resetPasswordEmail } from "@/lib/account/reset-email"
import { rateLimit, addressSubject, emailSubject, LIMITS } from "@/lib/api/rate-limit"
import { encodeCarry, readIntent, safeNext } from "@/lib/auth/continue"
import { getMainDomain } from "@/lib/url-helpers"

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

/** The one answer every address gets, so the form never says which have an account. */
const SENT = { success: true, message: "If an account with that email exists, we sent a reset link." }

/*
 * ===========================================================================
 *  FORGOT PASSWORD: THE SAME ANSWER FOR EVERY ADDRESS
 * ===========================================================================
 * It used to answer "Password reset email sent" for an account, "If an
 * account exists..." for none, a 409 naming Google for a Google-only account,
 * and a 429 only an existing account could reach (its three resets an hour):
 * four answers, so it told anybody which addresses have a Storelib account.
 *
 * Now the answer is SENT, or the 429 of the limit counted on the caller and
 * the typed address before anything is looked up (the same for every
 * address). The lookup and the email happen after the answer (next/server
 * after), so the time it takes says nothing either. An account that signs in
 * with Google or Apple and has no password gets an email saying so, rather
 * than a message on the page; one over its three resets an hour gets nothing.
 *
 * The email is transactional (no click tracking on the link) but keeps the
 * address's bounce record (keepBounce): anybody can type any address here,
 * and clearing a hard bounce on every request would let a stranger do it to
 * somebody else's inbox (lib/mailgun.ts).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === "string" ? body.email : ""

    if (!email.trim()) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    /*
      This form sends mail to an address the caller names. Unlimited, it is a
      way to send somebody a few thousand messages from this domain, which is
      how a domain stops being delivered anywhere. Counted by the address
      being mailed as well as the one asking, before anything is looked up.
    */
    const limited = await rateLimit({
      bucket: "password-reset",
      subjects: [addressSubject(request), emailSubject(email)],
      windows: LIMITS.email,
      message: "A reset link was already sent. Check your inbox, then try again shortly.",
    })
    if (limited) return limited

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
    }

    const cleanEmail = email.trim().toLowerCase()
    /*
      Sell on Storelib, and the page to go back to, when the login that sent
      them to reset their password had them (lib/auth/continue.ts). Both are
      checked here as everywhere else; the reset page hands them on to the
      login it ends on.
    */
    const carry = encodeCarry({ intent: readIntent(body.intent), next: safeNext(body.next, getMainDomain()) })
    after(() => sendReset(cleanEmail, carry))
    return NextResponse.json(SENT)
  } catch (error) {
    console.error("Request password reset error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** After the answer: the account, if there is one, and its email. Never throws. */
async function sendReset(cleanEmail: string, carry: string): Promise<void> {
  try {
    const adminSupabase = createAdminClient()
    const user = await findAuthUserByEmail(adminSupabase, cleanEmail)
    if (!user) return

    const providers = getProviders(user)
    const social = !providers.has("email") && (providers.has("google") || providers.has("apple"))
    if (social) {
      const mail = googleSignInEmail({ loginUrl: "https://storelib.com/login", provider: providers.has("google") ? "Google" : "Apple" })
      await sendEmail({ from: "Storelib <noreply@storelib.com>", to: cleanEmail, subject: mail.subject, html: mail.html, text: mail.text, transactional: true, keepBounce: true })
      return
    }

    // At most three resets an hour per account: over it, nothing is sent (and the page said the same as ever).
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: recentRequests } = await adminSupabase.from("password_reset_requests").select("id").eq("user_id", user.id).gte("created_at", oneHourAgo)
    if (recentRequests && recentRequests.length >= 3) return

    // ── Bridge code approach ──────────────────────────────────────────
    // Instead of sending the user to Supabase's verification URL (which
    // appends tokens in a #hash fragment that email clients / Gmail proxy
    // can strip), we generate our OWN one-time code, store it, and send
    // a link like: https://storelib.com/reset-password?code=<bridge_code>
    //
    // When the page loads with ?code=, it calls /api/auth/exchange-reset-code
    // which verifies the code + calls Supabase's verify endpoint server-side
    // (where hash fragments are never at risk) and returns the tokens.
    const redirectTo = "https://storelib.com/reset-password"
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({ type: "recovery", email: cleanEmail, options: { redirectTo } })
    if (linkError || !linkData?.properties?.action_link) {
      console.error("[request-password-reset] recovery link not made:", linkError?.code ?? linkError?.status ?? "unknown")
      return
    }

    // A cryptographically secure bridge code (48 bytes = 64 URL-safe chars), kept with its expiry.
    const bridgeCode = randomBytes(48).toString("base64url")
    await adminSupabase.from("password_reset_requests").insert({
      user_id: user.id,
      email: cleanEmail,
      token: bridgeCode,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      used: false,
    })

    // A query param, never a hash fragment: works through Gmail's proxy, Outlook SafeLinks and every mail client.
    const resetUrl = `https://storelib.com/reset-password?code=${encodeURIComponent(bridgeCode)}${carry ? `&${carry}` : ""}`
    /* Branded like every account email (lib/account/reset-email.ts). */
    const mail = resetPasswordEmail({ resetUrl, minutes: 60 })
    const result = await sendEmail({
      from: "Storelib <noreply@storelib.com>",
      to: cleanEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      transactional: true,
      keepBounce: true,
    })
    if (!result.success) console.error("[request-password-reset] email not sent")
  } catch (error) {
    console.error("[request-password-reset] failed:", error instanceof Error ? error.message : "unknown")
  }
}
