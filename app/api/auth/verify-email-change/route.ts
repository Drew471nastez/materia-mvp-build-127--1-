import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST - Verify code and update email
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const adminSupabase = createAdminClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { code } = body

    if (!code) {
      return NextResponse.json({ error: "Verification code is required" }, { status: 400 })
    }

    const cleanCode = code.trim()

    // Find the verification code
    const { data: codeRecord, error: codeError } = await adminSupabase
      .from("email_change_codes")
      .select("*")
      .eq("user_id", user.id)
      .eq("code", cleanCode)
      .eq("verified", false)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (codeError || !codeRecord) {
      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    // Mark the code as verified
    await adminSupabase
      .from("email_change_codes")
      .update({ verified: true })
      .eq("id", codeRecord.id)

    // Update the user's email in Supabase Auth
    const { error: updateError } = await adminSupabase.auth.admin.updateUserById(user.id, {
      email: codeRecord.new_email,
      email_confirm: true,
    })

    if (updateError) {
      console.error("Error updating user email:", updateError)
      return NextResponse.json({ error: "Failed to update email" }, { status: 500 })
    }

    // Also update the profile email
    await adminSupabase
      .from("profiles")
      .update({ email: codeRecord.new_email })
      .eq("id", user.id)

    // Clean up old codes
    await adminSupabase
      .from("email_change_codes")
      .delete()
      .eq("user_id", user.id)

    return NextResponse.json({
      success: true,
      message: "Email updated successfully",
      newEmail: codeRecord.new_email,
    })
  } catch (error) {
    console.error("Verify email change error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
