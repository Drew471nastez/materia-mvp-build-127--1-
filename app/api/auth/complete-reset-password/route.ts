import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST - Complete password reset using token
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, newPassword } = body

    if (!token || !newPassword) {
      return NextResponse.json({ error: "Token and new password are required" }, { status: 400 })
    }

    if (newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find and validate the reset token
    const { data: resetRequest, error: tokenError } = await adminSupabase
      .from("password_reset_requests")
      .select("*")
      .eq("token", token)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .single()

    if (tokenError || !resetRequest) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
    }

    // Update the user's password
    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
      resetRequest.user_id,
      { password: newPassword }
    )

    if (updateError) {
      console.error("Error updating password:", updateError)
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 })
    }

    // Mark the token as used
    await adminSupabase
      .from("password_reset_requests")
      .update({ used: true })
      .eq("id", resetRequest.id)

    // Clean up old tokens for this user
    await adminSupabase
      .from("password_reset_requests")
      .delete()
      .eq("user_id", resetRequest.user_id)
      .eq("used", true)

    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    })
  } catch (error) {
    console.error("Complete reset password error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
