import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

// POST - Complete password reset using token
export async function POST(request: Request) {
  try {
    /* Round 48: no page calls this any more (the reset runs through exchange-reset-code), and it still answers, so it is limited and typed like the rest. */
    const limited = await rateLimit({ bucket: "reset-complete", subjects: [addressSubject(request)], windows: [{ limit: 10, seconds: 600 }, { limit: 50, seconds: 86400 }] })
    if (limited) return limited
    const body = await request.json()
    const { token, newPassword } = body

    if (typeof token !== "string" || typeof newPassword !== "string" || !token || !newPassword || token.length > 200 || newPassword.length > 200) {
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

    /* Claimed before the password changes, so one link changes it once (round 48). */
    const { data: claimed } = await adminSupabase
      .from("password_reset_requests")
      .update({ used: true })
      .eq("id", resetRequest.id)
      .eq("used", false)
      .select("id")
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 })
    }

    // Update the user's password
    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
      resetRequest.user_id,
      { password: newPassword }
    )

    if (updateError) {
      console.error("Error updating password:", updateError.name ?? "error", updateError.status ?? "")
      return NextResponse.json({ error: "Failed to update password" }, { status: 500 })
    }

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
