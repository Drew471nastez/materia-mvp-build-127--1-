import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(request: Request) {
  try {
    const { userId, code } = await request.json()

    if (!userId || !code) {
      return NextResponse.json({ error: "User ID and code are required" }, { status: 400 })
    }

    // Validate code format (should be 6 digits)
    if (!/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "Please enter a valid 6-digit code" }, { status: 400 })
    }

    const admin = createAdminClient()

    // First check if any code exists for this user with this code value
    const { data: anyCodeMatch, error: anyCodeError } = await admin
      .from("verification_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .maybeSingle()

    // If no code matches at all, it's an incorrect code
    if (!anyCodeMatch) {
      console.log("[confirm-email] No matching code found for user:", userId.slice(0, 8) + "...")
      return NextResponse.json({ error: "Incorrect verification code. Please check and try again." }, { status: 400 })
    }

    // Check if code was already used
    if (anyCodeMatch.used_at) {
      console.log("[confirm-email] Code already used for user:", userId.slice(0, 8) + "...")
      return NextResponse.json({ error: "This code has already been used. Please request a new code." }, { status: 400 })
    }

    // Check if code is expired
    if (new Date(anyCodeMatch.expires_at) < new Date()) {
      console.log("[confirm-email] Code expired for user:", userId.slice(0, 8) + "...")
      return NextResponse.json({ error: "This code has expired. Please request a new code." }, { status: 400 })
    }

    // Code is valid - use it
    const verification = anyCodeMatch

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
