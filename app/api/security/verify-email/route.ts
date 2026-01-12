import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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
    const orderIdRaw = body?.orderId
    const emailRaw = body?.email

    const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : ""
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : ""

    if (!orderId || !email) {
      return NextResponse.json({ error: "Order ID and email are required" }, { status: 400 })
    }

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orderId)) {
      console.error("[verify-email] Invalid order ID format:", orderId)
      return NextResponse.json({ error: "Invalid order ID format" }, { status: 400 })
    }

    const admin = getAdminClient()

    // Verify order exists and email matches
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, buyer_email, product_id, products(title)")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError) {
      console.error("[verify-email] Error fetching order:", orderError)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }

    if (!order) {
      console.error("[verify-email] Order not found:", orderId)
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const buyerEmail = (order.buyer_email || "").toString().trim().toLowerCase()

    if (!buyerEmail || buyerEmail !== email) {
      console.error("[verify-email] Email mismatch. Expected:", buyerEmail, "Got:", email)
      return NextResponse.json({ error: "Email does not match order" }, { status: 403 })
    }

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    let recentCodesCount = 0
    try {
      const { data: recentCodes, error: recentError } = await admin
        .from("verification_codes")
        .select("id")
        .eq("order_id", orderId)
        .gte("created_at", fifteenMinutesAgo)

      if (!recentError && recentCodes) {
        recentCodesCount = recentCodes.length
      }
    } catch (err) {
      // If table doesn't exist or other error, continue without rate limiting
      console.warn("[verify-email] Could not check rate limit:", err)
    }

    if (recentCodesCount >= 3) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again in 15 minutes." },
        { status: 429 },
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    console.log("[verify-email] Attempting to insert verification code for order:", orderId)

    // Try to insert the verification code
    const { data: insertedCode, error: codeError } = await admin
      .from("verification_codes")
      .insert({
        order_id: orderId,
        code,
        email,
        expires_at: expiresAt.toISOString(),
      })
      .select("id")
      .single()

    if (codeError) {
      console.error("[verify-email] Error creating verification code:", {
        message: codeError.message,
        code: codeError.code,
        details: codeError.details,
        hint: codeError.hint,
      })

      // Check if it's a table not found error
      if (codeError.message?.includes("relation") || codeError.code === "42P01") {
        return NextResponse.json({
          error: "Verification system not configured. Please contact support.",
        }, { status: 500 })
      }

      // Check for RLS policy violation
      if (codeError.code === "42501" || codeError.message?.includes("policy")) {
        console.error("[verify-email] RLS policy violation - attempting direct insert")
        return NextResponse.json({
          error: "Unable to create verification code. Please contact support.",
        }, { status: 500 })
      }

      return NextResponse.json({
        error: "Failed to generate verification code. Please try again.",
      }, { status: 500 })
    }

    console.log("[verify-email] ✅ Verification code created:", insertedCode?.id)

    // Log security event (don't fail if this fails)
    try {
      await admin.from("security_events").insert({
        order_id: orderId,
        event_type: "verification_sent",
        metadata: { email },
      })
    } catch (eventErr) {
      console.warn("[verify-email] Failed to log security event:", eventErr)
    }

    // Send verification email
    if (resend) {
      try {
        await resend.emails.send({
          from: "Materia Security <noreplycustomers@materiabuilder.store>", // Using verified domain
          to: email,
          subject: "Verify your device to download",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your device</h1>
              <p style="color: #666; margin-bottom: 24px;">
                We noticed you're trying to access your download for <strong>${(order as any).products?.title || "your purchase"}</strong> from a new device.
              </p>

              <div style="background: #f5f5f5; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Your verification code:</p>
                <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.1em; color: #000;">
                  ${code}
                </div>
                <p style="margin: 16px 0 0 0; color: #999; font-size: 12px;">
                  This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes
                </p>
              </div>

              <p style="color: #666; font-size: 14px;">
                If you didn't request this code, someone may have your download link. Your purchase is secure and only accessible after verification.
              </p>
            </div>
          `,
        })
        console.log("[v0] Verification code email sent to:", email)
      } catch (emailError) {
        console.error("[v0] Error sending verification email:", emailError)
        return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
      }
    } else {
      console.error("[v0] Email service not configured - RESEND_API_KEY missing")
      return NextResponse.json({
        error: "Email service not available. Please contact support.",
        details: "email_service_not_configured"
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    })
  } catch (error) {
    console.error("[v0] Error in verify-email:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
