import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"
import { MAX_DEVICES_PER_ORDER, generateFingerprint } from "@/lib/security"

// Create admin client that bypasses RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration")
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : ""
    const code = typeof body?.code === "string" ? body.code.trim() : ""

    if (!orderId || !code) {
      return NextResponse.json({ error: "Order ID and code are required" }, { status: 400 })
    }

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orderId)) {
      console.error("[confirm-device] Invalid order ID format:", orderId)
      return NextResponse.json({ error: "Invalid order ID format" }, { status: 400 })
    }

    const admin = getAdminClient()
    const headersList = await headers()
    const cookieStore = await cookies()

    console.log("[confirm-device] Looking up verification code for order:", orderId)

    // Find valid verification code
    const { data: verification, error: verifyError } = await admin
      .from("verification_codes")
      .select("*")
      .eq("order_id", orderId)
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (verifyError) {
      console.error("[confirm-device] Error looking up verification code:", verifyError)
    }

    if (!verification) {
      console.log("[confirm-device] Invalid or expired code for order:", orderId)
      // Log failed attempt (don't fail if this fails)
      try {
        await admin.from("security_events").insert({
          order_id: orderId,
          event_type: "verification_failed",
          metadata: { reason: "invalid_or_expired_code" },
        })
      } catch (err) {
        console.warn("[confirm-device] Failed to log security event:", err)
      }

      return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
    }

    console.log("[confirm-device] ✅ Valid verification code found:", verification.id)

    // Mark code as used
    try {
      await admin.from("verification_codes").update({ used_at: new Date().toISOString() }).eq("id", verification.id)
    } catch (err) {
      console.warn("[confirm-device] Failed to mark code as used:", err)
    }

    // Get order
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, allowed_fingerprints, session_fingerprint")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      console.error("[confirm-device] Order not found:", orderId, orderError)
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    // Generate new fingerprint for this device
    const userAgent = headersList.get("user-agent") || "unknown"
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || "unknown"
    const newFingerprint = generateFingerprint(userAgent, ip)

    console.log("[confirm-device] Generated fingerprint for device")

    // Check if device limit reached
    const allowedFingerprints = order.allowed_fingerprints || []
    if (allowedFingerprints.length >= MAX_DEVICES_PER_ORDER && !allowedFingerprints.includes(newFingerprint)) {
      try {
        await admin.from("security_events").insert({
          order_id: orderId,
          event_type: "device_limit_reached",
          fingerprint: newFingerprint,
          ip,
          user_agent: userAgent,
        })
      } catch (err) {
        console.warn("[confirm-device] Failed to log device limit event:", err)
      }

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
      const { error: updateError } = await admin
        .from("orders")
        .update({ allowed_fingerprints: updatedFingerprints })
        .eq("id", orderId)

      if (updateError) {
        console.error("[confirm-device] Failed to update fingerprints:", updateError)
        return NextResponse.json({ error: "Failed to register device" }, { status: 500 })
      }
    }

    // Set secure cookie
    cookieStore.set("materia_session", newFingerprint, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
    })

    // Log successful verification (don't fail if this fails)
    try {
      await admin.from("security_events").insert({
        order_id: orderId,
        event_type: "verification_success",
        fingerprint: newFingerprint,
        ip,
        user_agent: userAgent,
      })
    } catch (err) {
      console.warn("[confirm-device] Failed to log success event:", err)
    }

    console.log("[confirm-device] ✅ Device verified successfully for order:", orderId)

    return NextResponse.json({
      success: true,
      message: "Device verified successfully",
    })
  } catch (error) {
    console.error("[confirm-device] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
