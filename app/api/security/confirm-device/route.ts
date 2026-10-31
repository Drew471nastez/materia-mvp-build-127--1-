import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"
import { MAX_DEVICES_PER_ORDER, generateFingerprint } from "@/lib/security"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { checkDeviceCode } from "@/lib/auth/code-guard"

// Create admin client that bypasses RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    console.error("[confirm-device] Missing Supabase configuration", {
      hasUrl: !!url,
      hasServiceKey: !!serviceRoleKey,
    })
    throw new Error("Missing Supabase configuration")
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: "public",
    },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : ""
    const code = typeof body?.code === "string" ? body.code.trim() : ""

    console.log("[confirm-device] Starting device confirmation for order:", orderId)

    if (!orderId || !code) {
      return NextResponse.json({ error: "Order ID and code are required" }, { status: 400 })
    }

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orderId)) {
      console.error("[confirm-device] Invalid order ID format:", orderId)
      return NextResponse.json({ error: "Invalid order ID format" }, { status: 400 })
    }

    let admin
    try {
      admin = getAdminClient()
    } catch (err) {
      console.error("[confirm-device] Failed to create admin client:", err)
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    const headersList = await headers()
    const cookieStore = await cookies()

    /*
      FIVE GUESSES PER CODE (lib/auth/code-guard.ts). A device code is six
      digits and nothing counted wrong ones, so the per-order device lock
      could be walked. Limited per caller address too.
    */
    const limited = await rateLimit({
      bucket: "confirm-device-address",
      subjects: [addressSubject(request)],
      windows: [{ limit: 30, seconds: 900 }, { limit: 200, seconds: 86_400 }],
      message: "Too many tries just now. Wait a few minutes and try again.",
    })
    if (limited) return limited

    const verdict = await checkDeviceCode(admin, orderId, code)
    if (!verdict.ok) {
      console.log("[confirm-device] Invalid or expired code for order:", orderId)
      // Log failed attempt (don't fail if this fails)
      try {
        await admin.from("security_events").insert({
          order_id: orderId,
          event_type: "verification_failed",
          metadata: { reason: verdict.locked ? "too_many_wrong_codes" : "invalid_or_expired_code" },
        })
      } catch (err: any) {
        console.warn("[confirm-device] Failed to log security event:", err?.message || err)
      }
      return NextResponse.json({ error: verdict.error }, { status: verdict.status })
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

    // Get domain for cross-subdomain cookie support
    const mainDomain = process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com"
    const isLocalhost = mainDomain.includes("localhost")

    // Set secure cookie with cross-subdomain support
    cookieStore.set("materia_session", newFingerprint, {
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      path: "/",
      domain: isLocalhost ? undefined : `.${mainDomain}`,
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
      console.log("[confirm-device] Security event logged")
    } catch (err: any) {
      console.warn("[confirm-device] Failed to log success event:", err?.message || err)
    }

    console.log("[confirm-device] ✅ Device verified successfully for order:", orderId)

    return NextResponse.json({
      success: true,
      message: "Device verified successfully",
    })
  } catch (error: any) {
    console.error("[confirm-device] Unhandled error:", {
      message: error?.message || error,
      stack: error?.stack,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
