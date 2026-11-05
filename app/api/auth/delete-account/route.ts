import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { VERIFICATION_CODE_EXPIRY_MINUTES, verificationLimitPaused } from "@/lib/security"
import { MAX_CODE_ATTEMPTS, codeMatches, newCode, wrongCodeMessage } from "@/lib/account/codes"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { deleteAccount, deletionBlockers } from "@/lib/account/delete-account"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { platformEmail } from "@/lib/emails/layout"
import { businessGroup, sessionFor } from "@/lib/businesses/server"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"

// POST - Handle account deletion (send code or verify and delete)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const who = await routeUser({ fresh: true })
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { action, code } = body

    /* Money still on its way or owed, or a dispute still open: settle it first (lib/account/delete-account). */
    if (action === "send-code" || action === "verify") {
      const blockers = await deletionBlockers(adminSupabase, user.id)
      if (blockers.length > 0) {
        return NextResponse.json({ error: blockers.join(" "), blockers }, { status: 409 })
      }
    }

    if (action === "send-code") {
      // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data: recentCodes } = await adminSupabase
        .from("account_delete_codes")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", fifteenMinutesAgo)

      if (!verificationLimitPaused() && recentCodes && recentCodes.length >= 3) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again in 15 minutes." },
          { status: 429 }
        )
      }

      // Generate verification code
      const verificationCode = newCode()
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

      // Delete any existing pending codes for this user
      await adminSupabase
        .from("account_delete_codes")
        .delete()
        .eq("user_id", user.id)
        .eq("verified", false)

      // Store verification code
      const { error: codeError } = await adminSupabase.from("account_delete_codes").insert({
        user_id: user.id,
        code: verificationCode,
        expires_at: expiresAt.toISOString(),
        verified: false,
      })

      if (codeError) {
        console.error("Error creating delete code:", codeError)
        return NextResponse.json({ error: "Failed to generate verification code" }, { status: 500 })
      }

      // Send verification email
      if (isSmtpConfigured()) {
        try {
          const result = await sendEmail({
            from: "Storelib <noreply@storelib.com>",
            to: ownerAddress(user.email) || user.email!,
            ...platformEmail({
              subject: "Confirm account deletion",
              heading: "Confirm account deletion",
              label: "Security notice",
              labelColor: "#b91c1c",
              paragraphs: ["You asked to permanently delete your Storelib account. This can't be undone. Enter this code to confirm."],
              code: { value: verificationCode, caption: `It expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.` },
              note: "If you didn't ask for this, ignore this email and change your password.",
            }),
          })

          if (!result.success) {
            console.error("Error sending verification email:", result.error)
            return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
          }
        } catch (emailError) {
          console.error("Error sending verification email:", emailError)
          return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Verification code sent to your email",
      })
    } else if (action === "verify") {
      if (!code) {
        return NextResponse.json({ error: "Verification code is required" }, { status: 400 })
      }

      /* The pending code, whatever was typed, so a wrong guess can be counted
         against it. After five it is thrown away (lib/account/codes.ts). */
      const { data: codeRecord } = await adminSupabase
        .from("account_delete_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!codeRecord) {
        return NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 })
      }
      const attempts = typeof codeRecord.attempts === "number" ? codeRecord.attempts : 0
      if (attempts >= MAX_CODE_ATTEMPTS || !codeMatches(codeRecord.code, String(code))) {
        const next = attempts + 1
        if (next >= MAX_CODE_ATTEMPTS) await adminSupabase.from("account_delete_codes").delete().eq("id", codeRecord.id)
        else await adminSupabase.from("account_delete_codes").update({ attempts: next }).eq("id", codeRecord.id)
        return NextResponse.json({ error: wrongCodeMessage(next) }, { status: 400 })
      }

      // Mark code as verified
      await adminSupabase
        .from("account_delete_codes")
        .update({ verified: true })
        .eq("id", codeRecord.id)

      /*
        ======================================================================
         MORE THAN ONE BUSINESS ON ONE LOGIN (lib/businesses)
        ======================================================================
        Every business of a login is an account of its own, linked to the
        login's first in public.business_links. Deleting is therefore the
        same one thing on every one of them, which is the point: the person
        goes into the store they want gone, opens Settings, and deletes this
        account the way anybody deletes an account.

        DELETING ONE OF THE OTHER BUSINESSES (the signed in account is a
        member of the group, not its first). Only that account and its data
        go. Its row in business_links goes with it, by the cascade on
        auth.users the table was made with and, below, by a delete of its own
        in case a database has lost that cascade, so the account menu's next
        list (the reload the browser does with the first business's session)
        no longer has it. The other businesses of the login are untouched.

        DELETING THE FIRST BUSINESS (the owner of the group) TAKES THE OTHERS
        WITH IT, on purpose. A business account's address is the owner's with
        a tag and its password is 32 random bytes nobody keeps
        (lib/businesses/server): the only door into it is a session of the
        owner's account. Leave them behind and they are stores nobody on
        earth can sign into, still holding customers, orders and Stripe
        details, still being written to. Handing one to somebody is not an
        option either: there is no second person here, only the one login,
        and its address is the owner's. So they are deleted first, each one
        completely, and only then the owner itself. The confirmation the
        person reads says so in the same breath as the products and the sales
        history, so this is deliberate and not a surprise
        (components/app/settings-form-new.tsx).

        A member whose auth account cannot be removed stops the whole
        deletion before the owner is touched: half a group gone is worse than
        none of it, and a second attempt finishes the job because every step
        here can be run twice. Its data goes before its account does, in that
        order, because the creator row is what the rest of a store is keyed by
        and deleting the account can take that row with it (the cascades on
        auth.users) and leave the store behind with nothing pointing at it.
      */
      const group = await businessGroup(user.id)
      if (group?.ownerId === user.id) {
        for (const memberId of group.memberIds) {
          const memberBlockers = await deletionBlockers(adminSupabase, memberId)
          if (memberBlockers.length > 0) {
            return NextResponse.json({ error: `Another business on this login has something to settle first. ${memberBlockers.join(" ")}`, blockers: memberBlockers }, { status: 409 })
          }
        }
        for (const memberId of group.memberIds) {
          const member = await deleteAccount(adminSupabase, memberId, "business_owner")
          if (!member.ok) {
            console.error("Business account deletion failed:", member.failures.join("; "))
            return NextResponse.json({ error: "Failed to delete account. Please contact support." }, { status: 500 })
          }
          await forgetBusinessLinks(adminSupabase, memberId)
        }
      }

      /* Removed, or retired when anything under it is somebody's record (lib/account/delete-account). */
      const outcome = await deleteAccount(adminSupabase, user.id, "self")
      if (!outcome.ok) {
        return NextResponse.json({ error: "Failed to delete account. Please contact support." }, { status: 500 })
      }

      /*
        The link rows naming this account, in case this database no longer
        cascades them off auth.users: a store that is gone must not be left
        in anybody's account menu.
      */
      await forgetBusinessLinks(adminSupabase, user.id)

      /* One of the login's businesses is gone; its owner is still here, so they land back in their first business signed in. */
      const firstBusiness = group && group.ownerId !== user.id ? await sessionFor(group.ownerId) : null
      return NextResponse.json({
        success: true,
        message: "Account successfully deleted",
        ...(firstBusiness ? { firstBusiness: { session: firstBusiness } } : {}),
      })
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Delete account error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * The business_links rows naming an account that has just been deleted,
 * whichever side of the link it was on. auth.users cascades these away
 * already (supabase/migrations/20261001_business_accounts.sql), so this is
 * belt and braces, and harmless when the cascade has already run: without it
 * a database that had lost the cascade would keep listing a store that no
 * longer exists in the account menu.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function forgetBusinessLinks(adminSupabase: any, userId: string) {
  await ignoreError(adminSupabase.from("business_links").delete().eq("member_id", userId))
  await ignoreError(adminSupabase.from("business_links").delete().eq("owner_id", userId))
}
