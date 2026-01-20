import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

// Create admin client that bypasses RLS
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    console.error("[verify-email] Missing Supabase configuration", {
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
    const orderIdRaw = body?.orderId
    const emailRaw = body?.email

    const orderId = typeof orderIdRaw === "string" ? orderIdRaw.trim() : ""
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : ""

    console.log("[verify-email] Starting verification for order:", orderId, "email:", email ? "provided" : "missing")

    if (!orderId || !email) {
      return NextResponse.json({ error: "Order ID and email are required" }, { status: 400 })
    }

    // Validate orderId is a valid UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(orderId)) {
      console.error("[verify-email] Invalid order ID format:", orderId)
      return NextResponse.json({ error: "Invalid order ID format" }, { status: 400 })
    }

    let admin
    try {
      admin = getAdminClient()
    } catch (err) {
      console.error("[verify-email] Failed to create admin client:", err)
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

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

    console.log("[verify-email] Order verified, checking rate limit...")

    // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()

    let recentCodesCount = 0
    try {
      const { data: recentCodes, error: recentError } = await admin
        .from("verification_codes")
        .select("id")
        .eq("order_id", orderId)
        .gte("created_at", fifteenMinutesAgo)

      if (recentError) {
        console.warn("[verify-email] Rate limit check error:", recentError.message)
        // Continue without rate limiting if table doesn't exist yet
      } else if (recentCodes) {
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

    console.log("[verify-email] Generated code, attempting to insert for order:", orderId)

    // Try to insert the verification code using direct insert (no select to simplify)
    let insertSuccess = false
    let insertError: any = null

    // First attempt: standard insert
    try {
      const { error: codeError } = await admin
        .from("verification_codes")
        .insert({
          order_id: orderId,
          code,
          email,
          expires_at: expiresAt.toISOString(),
        })

      if (codeError) {
        insertError = codeError
        console.error("[verify-email] Insert error:", {
          message: codeError.message,
          code: codeError.code,
          details: codeError.details,
          hint: codeError.hint,
        })
      } else {
        insertSuccess = true
        console.log("[verify-email] ✅ Verification code inserted successfully")
      }
    } catch (err: any) {
      insertError = err
      console.error("[verify-email] Exception during insert:", err?.message || err)
    }

    // If first attempt failed, try with upsert approach
    if (!insertSuccess && insertError) {
      console.log("[verify-email] First insert failed, trying alternative approach...")

      try {
        // Try using RPC or direct query if available
        const { error: retryError } = await admin
          .from("verification_codes")
          .upsert({
            order_id: orderId,
            code,
            email,
            expires_at: expiresAt.toISOString(),
            created_at: new Date().toISOString(),
          }, {
            onConflict: "id",
            ignoreDuplicates: false,
          })

        if (!retryError) {
          insertSuccess = true
          console.log("[verify-email] ✅ Verification code inserted via upsert")
        } else {
          console.error("[verify-email] Upsert also failed:", retryError.message)
        }
      } catch (retryErr: any) {
        console.error("[verify-email] Retry exception:", retryErr?.message || retryErr)
      }
    }

    if (!insertSuccess) {
      const errMsg = insertError?.message || "Unknown error"
      const errCode = insertError?.code || ""

      // Check if it's a table not found error
      if (errMsg.includes("relation") || errCode === "42P01" || errMsg.includes("does not exist")) {
        console.error("[verify-email] Table verification_codes does not exist")
        return NextResponse.json({
          error: "Verification system not configured. Please contact support.",
        }, { status: 500 })
      }

      // Check for RLS policy violation
      if (errCode === "42501" || errMsg.includes("policy") || errMsg.includes("permission denied")) {
        console.error("[verify-email] RLS policy violation")
        return NextResponse.json({
          error: "Verification system access denied. Please contact support.",
        }, { status: 500 })
      }

      // Check for foreign key violation (order doesn't exist)
      if (errCode === "23503" || errMsg.includes("foreign key")) {
        console.error("[verify-email] Foreign key violation - order may not exist")
        return NextResponse.json({
          error: "Order not found. Please try again.",
        }, { status: 404 })
      }

      console.error("[verify-email] Failed to insert verification code:", errMsg)
      return NextResponse.json({
        error: "Failed to generate verification code. Please try again.",
      }, { status: 500 })
    }

    console.log("[verify-email] ✅ Verification code created successfully")

    // Log security event (don't fail if this fails)
    try {
      await admin.from("security_events").insert({
        order_id: orderId,
        event_type: "verification_sent",
        metadata: { email },
      })
      console.log("[verify-email] Security event logged")
    } catch (eventErr: any) {
      console.warn("[verify-email] Failed to log security event:", eventErr?.message || eventErr)
    }

    // Send verification email
    if (!isSmtpConfigured()) {
      console.error("[verify-email] Email service not configured - SMTP credentials missing")
      return NextResponse.json({
        error: "Email service not available. Please contact support.",
        details: "email_service_not_configured"
      }, { status: 500 })
    }

    const productTitle = (order as any).products?.title || "your purchase"

    try {
      console.log("[verify-email] Sending verification email to:", email)

      const result = await sendEmail({
        from: "Storelib Security <noreply@storelib.com>",
        to: email,
        subject: "Verify your device to download",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your device</h1>
            <p style="color: #666; margin-bottom: 24px;">
              We noticed you're trying to access your download for <strong>${productTitle}</strong> from a new device.
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
        text: `Verify your device

We noticed you're trying to access your download for "${productTitle}" from a new device.

Your verification code: ${code}

This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.

If you didn't request this code, someone may have your download link. Your purchase is secure and only accessible after verification.`,
      })

      if (!result.success) {
        console.error("[verify-email] Error sending verification email:", result.error)
        return NextResponse.json({
          error: "Failed to send verification email. Please try again."
        }, { status: 500 })
      }

      console.log("[verify-email] ✅ Verification code email sent successfully to:", email)
    } catch (emailError: any) {
      console.error("[verify-email] Error sending verification email:", {
        message: emailError?.message || emailError,
      })
      return NextResponse.json({
        error: "Failed to send verification email. Please try again."
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
    })
  } catch (error: any) {
    console.error("[verify-email] Unhandled error:", {
      message: error?.message || error,
      stack: error?.stack,
    })
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
