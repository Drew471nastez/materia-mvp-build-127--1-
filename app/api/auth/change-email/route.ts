import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { VERIFICATION_CODE_EXPIRY_MINUTES, verificationLimitPaused } from "@/lib/security"
import { readCurrentUser } from "@/lib/auth/current-user"
import { newCode } from "@/lib/account/codes"
import { codeEmail } from "@/lib/account/code-email"

export const runtime = "nodejs"

/**
 * ===========================================================================
 *  CHANGING THE ACCOUNT EMAIL: A CODE TO EACH ADDRESS
 * ===========================================================================
 * Step one of two. Step two is /api/auth/verify-email-change.
 *
 * It used to send one code, to the NEW address, and change the account as
 * soon as that code came back. Anybody holding a signed in session (a phone
 * left unlocked, a borrowed laptop) could therefore move the account to an
 * address of their own, and the owner found out when they could not sign in.
 * Supabase's own "secure email change" asks both addresses for exactly this
 * reason, and this does the same with Storelib's own mail, which is where
 * every other account email here comes from:
 *
 *   a code to the new address     proves the person can read it
 *   a code to the current address proves the person is the owner
 *
 * Both are needed in step two. If the database has not had
 * supabase/sql/RUN_ACCOUNT_PRIVACY.sql yet there is nowhere to keep the second
 * code, and the change falls back to the new address alone, as it was.
 *
 * The "already taken" check used to read the first page of auth users (fifty
 * of them), so on any real project it missed nearly every account. It asks
 * profiles, which holds every account's address, and step two still handles
 * Supabase refusing a duplicate.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const current = await readCurrentUser(supabase)
    if (current.state === "indeterminate") {
      return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503 })
    }
    const user = current.user
    if (!user || !user.email) {
      return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401 })
    }
    const adminSupabase = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const cleanEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : ""

    if (!EMAIL.test(cleanEmail) || cleanEmail.length > 254) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 })
    }
    if (cleanEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: "That is already your email." }, { status: 400 })
    }

    const { data: taken } = await adminSupabase
      .from("profiles")
      .select("id")
      .ilike("email", cleanEmail)
      .neq("id", user.id)
      .limit(1)
    if (taken && taken.length > 0) {
      return NextResponse.json({ error: "That email is already used by another account." }, { status: 400 })
    }

    // At most three sends per fifteen minutes.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentCodes } = await adminSupabase
      .from("email_change_codes")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", fifteenMinutesAgo)
    if (!verificationLimitPaused() && recentCodes && recentCodes.length >= 3) {
      return NextResponse.json({ error: "Too many tries in a short time. Wait 15 minutes and try again." }, { status: 429 })
    }

    if (!isSmtpConfigured()) {
      return NextResponse.json({ error: "Email is not set up on this server. Try again later." }, { status: 503 })
    }

    const code = newCode()
    const currentCode = newCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString()

    await adminSupabase.from("email_change_codes").delete().eq("user_id", user.id).eq("verified", false)

    const row = { user_id: user.id, new_email: cleanEmail, code, expires_at: expiresAt, verified: false }
    let double = true
    let { error: codeError } = await adminSupabase.from("email_change_codes").insert({ ...row, current_email_code: currentCode })
    if (codeError && (codeError.code === "PGRST204" || codeError.code === "42703")) {
      /* The column is not there yet (RUN_ACCOUNT_PRIVACY.sql). One code, as before. */
      console.warn("[change-email] current_email_code missing: run supabase/sql/RUN_ACCOUNT_PRIVACY.sql")
      double = false
      ;({ error: codeError } = await adminSupabase.from("email_change_codes").insert(row))
    }
    if (codeError) {
      console.error("[change-email] could not store the code:", codeError.code)
      return NextResponse.json({ error: "That did not work. Try again in a moment." }, { status: 500 })
    }

    const toNew = codeEmail({
      heading: "Confirm your new email",
      lead: `Enter this code in Storelib to use ${cleanEmail} for your account.`,
      code,
      minutes: VERIFICATION_CODE_EXPIRY_MINUTES,
      footer: "If you did not ask for this, ignore this email. Nothing changes.",
    })
    const sentNew = await sendEmail({ from: "Storelib <noreply@storelib.com>", to: cleanEmail, subject: `${code} is your Storelib code`, transactional: true, ...toNew })
    if (!sentNew.success) {
      console.error("[change-email] could not send to the new address:", sentNew.error)
      return NextResponse.json({ error: "We could not send the code. Check the address and try again." }, { status: 502 })
    }

    if (double) {
      const toCurrent = codeEmail({
        heading: "Someone asked to change your email",
        lead: `A request was made to change your Storelib email from ${user.email} to ${cleanEmail}. If this was you, enter this code to confirm.`,
        code: currentCode,
        minutes: VERIFICATION_CODE_EXPIRY_MINUTES,
        footer: "If this was not you, do not share this code. Change your password in Settings, Security.",
      })
      const sentCurrent = await sendEmail({ from: "Storelib <noreply@storelib.com>", to: user.email, subject: `${currentCode} confirms your Storelib email change`, transactional: true, ...toCurrent })
      if (!sentCurrent.success) {
        console.error("[change-email] could not send to the current address:", sentCurrent.error)
        return NextResponse.json({ error: "We could not send the code to your current email. Try again in a moment." }, { status: 502 })
      }
    }

    return NextResponse.json({ success: true, double, currentEmail: user.email, newEmail: cleanEmail })
  } catch (error) {
    console.error("[change-email]", error)
    return NextResponse.json({ error: "That did not work. Try again in a moment." }, { status: 500 })
  }
}
