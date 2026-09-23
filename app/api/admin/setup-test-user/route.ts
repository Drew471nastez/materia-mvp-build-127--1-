import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireBearerSecret } from "@/lib/api/require-secret"

export const runtime = "nodejs"

/**
 * POST /api/admin/setup-test-user
 * Sets (or creates) the password for a specific account used in demos/testing.
 * Protected by ADMIN_SECRET env var.
 */
export async function POST(request: Request) {
  try {
    /*
      THIS USED TO BE OPEN WHEN ADMIN_SECRET WAS NOT SET. The comment said so
      and called it initial setup: with no secret configured, anybody who
      found this URL could set the password of the account named below to the
      value named below, and create it if it did not exist.

      Nothing in the product calls this route. It is here for one person's
      initial setup and is safe to delete outright; until somebody says so it
      refuses every caller that cannot present the secret.
    */
    const denied = requireBearerSecret(request, "ADMIN_SECRET")
    if (denied) return denied

    const targetEmail = "andreibalan134@gmail.com"
    const targetPassword = "Test1234!"

    const adminSupabase = createAdminClient()

    // Look up the user by email
    const { data: users, error: listError } = await adminSupabase.auth.admin.listUsers()

    if (listError) {
      console.error("Error listing users:", listError)
      return NextResponse.json({ error: "Failed to list users" }, { status: 500 })
    }

    const existingUser = users?.users?.find((u) => u.email === targetEmail)

    if (existingUser) {
      // User exists — update their password
      const { data: updateData, error: updateError } = await adminSupabase.auth.admin.updateUserById(
        existingUser.id,
        { password: targetPassword }
      )

      if (updateError) {
        console.error("Error updating password:", updateError)
        return NextResponse.json({ error: "Failed to update password" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: "updated",
        userId: existingUser.id,
        email: targetEmail,
        message: `Password updated successfully for ${targetEmail}`,
      })
    } else {
      // User does not exist — create them with confirmed email
      const { data: createData, error: createError } = await adminSupabase.auth.admin.createUser({
        email: targetEmail,
        password: targetPassword,
        email_confirm: true,
      })

      if (createError) {
        console.error("Error creating user:", createError)
        return NextResponse.json({ error: "Failed to create user" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        action: "created",
        userId: createData?.user?.id,
        email: targetEmail,
        message: `User created successfully with email ${targetEmail} and the specified password`,
      })
    }
  } catch (error) {
    console.error("Setup test user error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
