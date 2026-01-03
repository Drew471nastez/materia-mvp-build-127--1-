import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const { userId, code } = await request.json()

    if (!userId || !code) {
      return NextResponse.json({ error: "User ID and code are required" }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: verification, error: verifyError } = await admin
      .from("verification_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (verifyError || !verification) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    // Mark code as used
    await admin.from("verification_codes").update({ used_at: new Date().toISOString() }).eq("id", verification.id)

    const { error: updateError } = await admin
      .from("profiles")
      .update({ email_verified: true, email_verified_at: new Date().toISOString() })
      .eq("id", userId)

    if (updateError) {
      console.error("[v0] Error updating profile:", updateError)
      return NextResponse.json({ error: "Failed to verify email" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
    })
  } catch (error) {
    console.error("[v0] Error in confirm-email:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
