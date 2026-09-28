import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deleteAccount } from "@/lib/account/delete-account"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { recordAdminAction } from "@/lib/admin/audit"
import { maskEmail } from "@/lib/privacy/mask-email"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * POST /api/admin/delete-user
 * Delete a specific user by ID or email. Protected by ADMIN_SECRET env var.
 *
 * Body: { user_id?: string, email?: string }
 * Provide either user_id or email to identify the user.
 *
 * Called by a script with the secret, not by the admin console, so the gate
 * is the bearer secret rather than the admin cookie.
 */
export async function POST(request: Request) {
  try {
    /* This one was already right. It goes through the shared guard so there
       is one shape to read and one place for the next person to copy. */
    const denied = requireBearerSecret(request, "ADMIN_SECRET")
    if (denied) return denied

    const body = await request.json().catch(() => ({}))
    const user_id = typeof body.user_id === "string" ? body.user_id : ""
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""

    if (!user_id && !email) {
      return NextResponse.json(
        { error: "Provide either user_id or email" },
        { status: 400 },
      )
    }
    if (user_id && !UUID_RE.test(user_id)) {
      return NextResponse.json({ error: "user_id is not an id" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    /*
      Resolved through profiles, which carries every account's address.
      `auth.admin.listUsers()` answers the first fifty accounts only, so an
      address beyond them read as "not found".
    */
    let targetUserId = user_id
    if (!targetUserId && email) {
      const { data: profile, error: lookupError } = await adminSupabase.from("profiles").select("id").ilike("email", email).maybeSingle()
      if (lookupError) {
        console.error("[admin] delete-user lookup:", lookupError.code, lookupError.message)
        return NextResponse.json({ error: "Could not look the address up." }, { status: 500 })
      }
      if (!profile) {
        return NextResponse.json({ error: `No account uses ${maskEmail(email)}` }, { status: 404 })
      }
      targetUserId = profile.id
    }

    // Verify user exists
    const { data: targetUser, error: getUserError } = await adminSupabase.auth.admin.getUserById(targetUserId)
    if (getUserError || !targetUser?.user) {
      return NextResponse.json({ error: "No account has that id" }, { status: 404 })
    }

    /* The data and the sign in account; retired, not wiped, when anything under it is somebody's record (lib/account/delete-account). */
    const outcome = await deleteAccount(adminSupabase, targetUserId, "admin")
    if (!outcome.ok) {
      return NextResponse.json({ error: `The account could not be fully deleted: ${outcome.failures.slice(0, 3).join("; ")}` }, { status: 500 })
    }
    await recordAdminAction(adminSupabase, {
      action: "delete_account",
      targetType: "account",
      targetId: targetUserId,
      targetLabel: targetUser.user.email ? maskEmail(targetUser.user.email) : null,
    })

    return NextResponse.json({
      success: true,
      message: `Account ${targetUser.user.email ? maskEmail(targetUser.user.email) : targetUserId} deleted`,
    })
  } catch (error) {
    console.error("[admin] delete-user:", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "The account could not be deleted. The server log has the details." }, { status: 500 })
  }
}
