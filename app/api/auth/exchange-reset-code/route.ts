import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

function pathOf(location: string): string {
  try {
    return new URL(location, "https://storelib.com").pathname
  } catch {
    return "(unreadable)"
  }
}

export const runtime = "nodejs"

/**
 * POST /api/auth/exchange-reset-code
 *
 * Exchanges a one-time bridge code (from the password reset email link)
 * for Supabase recovery session tokens.
 *
 * Why this exists:
 *   Supabase's standard recovery flow appends tokens in a #hash fragment
 *   after redirecting through their verification endpoint. Hash fragments
 *   can be stripped by email client proxies (Gmail, Outlook SafeLinks),
 *   causing "link expired" on the /reset-password page.
 *
 *   This endpoint eliminates hash-fragment dependency:
 *   1. Email link uses ?code=<bridge_code> (query param — always preserved)
 *   2. Client sends the code here
 *   3. We look up the code, find the user, generate a fresh recovery session
 *   4. Return access_token + refresh_token directly in JSON
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { code } = body

    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Missing code" }, { status: 400 })
    }

    const adminSupabase = createAdminClient()

    // Look up the bridge code
    const { data: resetRequest, error: lookupError } = await adminSupabase
      .from("password_reset_requests")
      .select("id, user_id, email, used, expires_at")
      .eq("token", code)
      .maybeSingle()

    if (lookupError || !resetRequest) {
      return NextResponse.json(
        { error: "Invalid or expired reset code. Please request a new one." },
        { status: 400 }
      )
    }

    // Check if already used
    if (resetRequest.used) {
      return NextResponse.json(
        { error: "This reset link has already been used. Please request a new one." },
        { status: 400 }
      )
    }

    // Check expiry
    if (new Date(resetRequest.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "This reset link has expired. Please request a new one." },
        { status: 400 }
      )
    }

    // Mark as used IMMEDIATELY (prevent replay)
    await adminSupabase
      .from("password_reset_requests")
      .update({ used: true })
      .eq("id", resetRequest.id)

    // Generate a FRESH recovery link for this user so we get a valid OTP
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
      type: "recovery",
      email: resetRequest.email,
      options: { redirectTo: "https://storelib.com/reset-password" },
    })

    if (linkError || !linkData?.properties?.action_link) {
      /* The kind and status only: an auth error can name the address. */
      console.error("[exchange-reset-code] generateLink failed:", linkError?.name ?? "no link", linkError?.status ?? "")
      return NextResponse.json({ error: "Failed to create recovery session" }, { status: 500 })
    }

    // Call Supabase's verify endpoint SERVER-SIDE with redirect: "manual"
    // so we capture the Location header (which contains the tokens in a hash
    // fragment) without following the redirect. No hash fragment is lost
    // because we read the raw HTTP header.
    const verifyResponse = await fetch(linkData.properties.action_link, {
      redirect: "manual",
    })

    const location = verifyResponse.headers.get("location")
    if (!location) {
      console.error("[exchange-reset-code] No redirect location from verify endpoint")
      return NextResponse.json({ error: "Recovery verification failed" }, { status: 500 })
    }

    // Parse tokens from the Location header's hash fragment
    const hashIndex = location.indexOf("#")
    if (hashIndex === -1) {
      /* The path only: the redirect's query can carry an error naming the account. */
      console.error("[exchange-reset-code] No hash fragment in redirect:", pathOf(location))
      return NextResponse.json({ error: "Recovery verification failed" }, { status: 500 })
    }

    const hashParams = new URLSearchParams(location.substring(hashIndex + 1))
    const accessToken = hashParams.get("access_token")
    const refreshToken = hashParams.get("refresh_token")

    if (!accessToken || !refreshToken) {
      console.error("[exchange-reset-code] Missing tokens in redirect hash")
      return NextResponse.json({ error: "Recovery verification failed" }, { status: 500 })
    }

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      type: "recovery",
    })
  } catch (error) {
    console.error("[exchange-reset-code] Unexpected error:", error instanceof Error ? error.name : "unknown")
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
