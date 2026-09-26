import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readCurrentUser } from "@/lib/auth/current-user"
import { accountErrorKind } from "@/lib/auth/account-errors"
import { MAX_CODE_ATTEMPTS, codeMatches, wrongCodeMessage } from "@/lib/account/codes"

export const runtime = "nodejs"

/**
 * Step two of changing the account email (step one: /api/auth/change-email).
 *
 * Needs the code sent to the new address and, when one was sent, the code
 * sent to the current address. Wrong codes are counted against the pending
 * change and after five it is thrown away (lib/account/codes.ts).
 *
 * The change itself is made with the service role, confirmed, because both
 * addresses have just been proven. The session is not touched: the person
 * stays signed in on every device, now under the new address, and the old
 * address is told it happened (EMAIL_CHANGED, lib/notify).
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const current = await readCurrentUser(supabase)
    if (current.state === "indeterminate") {
      return NextResponse.json({ error: "Could not reach Storelib. Check your connection and try again." }, { status: 503 })
    }
    const user = current.user
    if (!user) {
      return NextResponse.json({ error: "Your session ended. Sign in again to change this." }, { status: 401 })
    }
    const adminSupabase = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const code = typeof body?.code === "string" ? body.code.trim() : ""
    const currentCode = typeof body?.currentCode === "string" ? body.currentCode.trim() : ""
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Enter the 6 digit code from your new email." }, { status: 400 })
    }

    const { data: pending } = await adminSupabase
      .from("email_change_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pending) {
      return NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 })
    }

    const attempts = typeof pending.attempts === "number" ? pending.attempts : 0
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await adminSupabase.from("email_change_codes").delete().eq("id", pending.id)
      return NextResponse.json({ error: wrongCodeMessage(attempts) }, { status: 400 })
    }

    const needsCurrent = typeof pending.current_email_code === "string" && pending.current_email_code.length > 0
    if (needsCurrent && !/^\d{6}$/.test(currentCode)) {
      return NextResponse.json({ error: "Enter the 6 digit code from your current email too." }, { status: 400 })
    }

    const right = codeMatches(pending.code, code) && (!needsCurrent || codeMatches(pending.current_email_code, currentCode))
    if (!right) {
      const next = attempts + 1
      if (next >= MAX_CODE_ATTEMPTS) await adminSupabase.from("email_change_codes").delete().eq("id", pending.id)
      else await adminSupabase.from("email_change_codes").update({ attempts: next }).eq("id", pending.id)
      return NextResponse.json({ error: wrongCodeMessage(next) }, { status: 400 })
    }

    await adminSupabase.from("email_change_codes").update({ verified: true }).eq("id", pending.id)

    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
      email: pending.new_email,
      email_confirm: true,
    })
    if (updateError) {
      const kind = accountErrorKind(updateError)
      console.error("[verify-email-change] updateUserById:", updateError.code ?? kind)
      if (kind === "email_taken") {
        return NextResponse.json({ error: "That email is already used by another account." }, { status: 400 })
      }
      return NextResponse.json({ error: "That did not work. Try again in a moment." }, { status: 500 })
    }

    await adminSupabase.from("profiles").update({ email: pending.new_email }).eq("id", user.id)
    await adminSupabase.from("email_change_codes").delete().eq("user_id", user.id)

    /* The old address hears about it: EMAIL_CHANGED from the notification
       engine, raised by the auth.users trigger (supabase/sql/run-now/36)
       with the old and the new address, in the same transaction as the
       change. Not raised here as well, so it is told once. */
    return NextResponse.json({ success: true, newEmail: pending.new_email })
  } catch (error) {
    console.error("[verify-email-change]", error)
    return NextResponse.json({ error: "That did not work. Try again in a moment." }, { status: 500 })
  }
}
