import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST - Validate password reset token
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ valid: false, error: "Token is required" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Find the reset token
    const { data: resetRequest, error } = await adminSupabase
      .from("password_reset_requests")
      .select("*")
      .eq("token", token)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .single()

    if (error || !resetRequest) {
      return NextResponse.json({ valid: false, error: "Invalid or expired reset link" })
    }

    return NextResponse.json({
      valid: true,
      email: resetRequest.email,
    })
  } catch (error) {
    console.error("Validate reset token error:", error)
    return NextResponse.json({ valid: false, error: "Internal server error" }, { status: 500 })
  }
}
