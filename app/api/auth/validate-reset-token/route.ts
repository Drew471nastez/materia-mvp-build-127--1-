import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"

// POST - Validate password reset token
export async function POST(request: Request) {
  try {
    /* Round 48: no page calls this any more (the reset runs through exchange-reset-code), and it still answers, so it is limited and typed like the rest. */
    const limited = await rateLimit({ bucket: "reset-validate", subjects: [addressSubject(request)], windows: [{ limit: 10, seconds: 600 }, { limit: 50, seconds: 86400 }] })
    if (limited) return limited
    const body = await request.json()
    const { token } = body

    if (typeof token !== "string" || !token || token.length > 200) {
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
