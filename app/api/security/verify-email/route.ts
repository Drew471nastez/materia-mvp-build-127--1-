import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Resend } from "resend"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

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

    const admin = createAdminClient()

    // Verify order exists and email matches
    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, buyer_email, product:products(title)")
      .eq("id", orderId)
      .maybeSingle()

    if (orderError) {
      console.error("[v0] Error fetching order:", orderError)
      return NextResponse.json({ error: "Internal server error" }, { status: 500 })
    }

    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 })
    }

    const buyerEmail = (order.buyer_email || "").toString().trim().toLowerCase()

    if (!buyerEmail || buyerEmail !== email) {
      return NextResponse.json({ error: "Email does not match order" }, { status: 403 })
    }

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { data: recentCodes, error: recentError } = await admin
      .from("verification_codes")
      .select("id")
      .eq("order_id", orderId)
      .gte("created_at", fifteenMinutesAgo)

    if (!recentError && recentCodes && recentCodes.length >= 3) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please try again in 15 minutes." },
        { status: 429 },
      )
    }

    // Generate verification code
    const code = generateVerificationCode()
    const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

    const { error: codeError } = await admin.from("verification_codes").insert({
      order_id: orderId,
      code,
      email,
      expires_at: expiresAt.toISOString(),
    })

    if (codeError) {
      console.error("[v0] Error creating verification code:", codeError)
      // Check if it's a table not found error
      if (codeError.message?.includes("relation") || codeError.code === "42P01") {
        return NextResponse.json({
          error: "Verification system not configured. Please contact support.",
          details: "verification_codes table missing"
        }, { status: 500 })
      }
      return NextResponse.json({
        error: "Failed to generate verification code. Please try again.",
        details: process.env.NODE_ENV === "development" ? codeError.message : undefined
      }, { status: 500 })
    }

    // Log security event
    await admin.from("security_events").insert({
      order_id: orderId,
      event_type: "verification_sent",
      metadata: { email },
    })

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
                We noticed you're trying to access your download for <strong>${order.product?.title || "your purchase"}</strong> from a new device.
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
