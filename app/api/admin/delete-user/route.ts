import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { deleteAllUserData } from "@/app/api/auth/delete-account/route"
import { requireBearerSecret } from "@/lib/api/require-secret"

export const runtime = "nodejs"

/**
 * POST /api/admin/delete-user
 * Delete a specific user by ID or email. Protected by ADMIN_SECRET env var.
 *
 * Body: { user_id?: string, email?: string }
 * Provide either user_id or email to identify the user.
 */
export async function POST(request: Request) {
  try {
    /* This one was already right. It goes through the shared guard so there
       is one shape to read and one place for the next person to copy. */
    const denied = requireBearerSecret(request, "ADMIN_SECRET")
    if (denied) return denied

    const body = await request.json()
    const { user_id, email } = body

    if (!user_id && !email) {
      return NextResponse.json(
        { error: "Provide either user_id or email" },
        { status: 400 },
      )
    }

    const adminSupabase = createAdminClient()

    // Resolve user ID from email if needed
    let targetUserId = user_id

    if (!targetUserId && email) {
      const { data: users, error: listError } = await adminSupabase.auth.admin.listUsers()
      if (listError) {
        return NextResponse.json({ error: `Failed to list users: ${listError.message}` }, { status: 500 })
      }
      const found = users.users.find(
        (u: { email?: string }) => u.email?.toLowerCase() === email.toLowerCase(),
      )
      if (!found) {
        return NextResponse.json({ error: `User not found with email: ${email}` }, { status: 404 })
      }
      targetUserId = found.id
    }

    // Verify user exists
    const { data: targetUser, error: getUserError } = await adminSupabase.auth.admin.getUserById(targetUserId)
    if (getUserError || !targetUser?.user) {
      return NextResponse.json({ error: `User not found: ${targetUserId}` }, { status: 404 })
    }

    // Delete all user data and the auth user
    await deleteAllUserData(adminSupabase, targetUserId)

    return NextResponse.json({
      success: true,
      message: `User ${targetUser.user.email ?? targetUserId} deleted successfully`,
    })
  } catch (error) {
    console.error("Admin delete-user error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    )
  }
}
