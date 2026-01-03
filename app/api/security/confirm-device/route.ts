import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { cookies, headers } from "next/headers"
import { MAX_DEVICES_PER_ORDER, generateFingerprint } from "@/lib/security"

export async function POST(request: Request) {
  try {
    const { orderId, code } = await request.json()

    if (!orderId || !code) {
      return NextResponse.json({ error: "Order ID and code are required" }, { status: 400 })
    }

    const admin = createAdminClient()
    const headersList = await headers()
    const cookieStore = await cookies()

    // Find valid verification code
    const { data: verification, error: verifyError } = await admin
      .from("verification_codes")
      .select("*")
      .eq("order_id", orderId)
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .single()

    if (verifyError || !verification) {
      // Log failed attempt
      await admin.from("security_events").insert({
        order_id: orderId,
        event_type: "verification_failed",
        metadata: { reason: "invalid_or_expired_code" },
      })

      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    // Mark code as used
    await admin.from("verification_codes").update({ used_at: new Date().toISOString() }).eq("id", verification.id)

    // Get order
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, allowed_fingerprints, session_fingerprint")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Generate new fingerprint for this device
    const userAgent = headersList.get("user-agent") || "unknown"
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown"
    const newFingerprint = generateFingerprint(userAgent, ip)

    // Check if device limit reached
    const allowedFingerprints = order.allowed_fingerprints || []
    if (allowedFingerprints.length >= MAX_DEVICES_PER_ORDER && !allowedFingerprints.includes(newFingerprint)) {
      await admin.from("security_events").insert({
        order_id: orderId,
        event_type: "device_limit_reached",
        fingerprint: newFingerprint,
        ip,
        user_agent: userAgent,
      })

      return NextResponse.json(
        {
          error: `Device limit reached. Maximum ${MAX_DEVICES_PER_ORDER} devices allowed per order.`,
          limitReached: true,
        },
        { status: 403 },
      )
    }

    // Add new fingerprint if not already present
    if (!allowedFingerprints.includes(newFingerprint)) {
      const updatedFingerprints = [...allowedFingerprints, newFingerprint]
      await admin.from("orders").update({ allowed_fingerprints: updatedFingerprints }).eq("id", orderId)
    }

    // Set secure cookie
    cookieStore.set("materia_session", newFingerprint, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    })

    // Log successful verification
    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "verification_success",
      fingerprint: newFingerprint,
      ip,
      user_agent: userAgent,
    })

    return NextResponse.json({
      success: true,
      message: "Device verified successfully",
    })
  } catch (error) {
    console.error("[v0] Error in confirm-device:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
