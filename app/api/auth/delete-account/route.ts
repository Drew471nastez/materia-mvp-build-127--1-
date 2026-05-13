import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { generateVerificationCode, VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"

export const runtime = "nodejs"

// POST - Handle account deletion (send code or verify and delete)
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
    const { action, code } = body

    if (action === "send-code") {
      // Rate limit: Check recent verification attempts (max 3 per 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data: recentCodes } = await adminSupabase
        .from("account_delete_codes")
        .select("id")
        .eq("user_id", user.id)
        .gte("created_at", fifteenMinutesAgo)

      if (recentCodes && recentCodes.length >= 3) {
        return NextResponse.json(
          { error: "Too many attempts. Please try again in 15 minutes." },
          { status: 429 }
        )
      }

      // Generate verification code
      const verificationCode = generateVerificationCode()
      const expiresAt = new Date(Date.now() + VERIFICATION_CODE_EXPIRY_MINUTES * 60 * 1000)

      // Delete any existing pending codes for this user
      await adminSupabase
        .from("account_delete_codes")
        .delete()
        .eq("user_id", user.id)
        .eq("verified", false)

      // Store verification code
      const { error: codeError } = await adminSupabase.from("account_delete_codes").insert({
        user_id: user.id,
        code: verificationCode,
        expires_at: expiresAt.toISOString(),
        verified: false,
      })

      if (codeError) {
        console.error("Error creating delete code:", codeError)
        return NextResponse.json({ error: "Failed to generate verification code" }, { status: 500 })
      }

      // Send verification email
      if (isSmtpConfigured()) {
        try {
          const result = await sendEmail({
            from: "Storelib <noreply@storelib.com>",
            to: user.email!,
            subject: "Confirm account deletion",
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #dc2626;">Account Deletion Request</h1>
                <p style="color: #666; margin-bottom: 24px;">
                  You have requested to permanently delete your Storelib account. This action cannot be undone.
                </p>

                <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 24px; margin-bottom: 24px; text-align: center;">
                  <p style="margin: 0 0 8px 0; color: #dc2626; font-size: 14px;">Your verification code:</p>
                  <div style="font-size: 32px; font-weight: 700; letter-spacing: 0.1em; color: #dc2626;">
                    ${verificationCode}
                  </div>
                  <p style="margin: 16px 0 0 0; color: #999; font-size: 12px;">
                    This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes
                  </p>
                </div>

                <p style="color: #666; font-size: 14px;">
                  If you didn't request this, please ignore this email and secure your account immediately.
                </p>
              </div>
            `,
            text: `Account Deletion Request

You have requested to permanently delete your Storelib account. This action cannot be undone.

Your verification code: ${verificationCode}

This code expires in ${VERIFICATION_CODE_EXPIRY_MINUTES} minutes.

If you didn't request this, please ignore this email and secure your account immediately.`,
          })

          if (!result.success) {
            console.error("Error sending verification email:", result.error)
            return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
          }
        } catch (emailError) {
          console.error("Error sending verification email:", emailError)
          return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: "Email service not configured" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Verification code sent to your email",
      })
    } else if (action === "verify") {
      if (!code) {
        return NextResponse.json({ error: "Verification code is required" }, { status: 400 })
      }

      // Find matching code
      const { data: codeRecord, error: findError } = await adminSupabase
        .from("account_delete_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("code", code)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .single()

      if (findError || !codeRecord) {
        return NextResponse.json({ error: "Invalid or expired verification code" }, { status: 400 })
      }

      // Mark code as verified
      await adminSupabase
        .from("account_delete_codes")
        .update({ verified: true })
        .eq("id", codeRecord.id)

      // ── Delete all user data (in dependency order) ─────────────────────────
      try {
        // 1. Collect creator id (needed to delete products, analytics, etc.)
        const { data: creatorRow } = await adminSupabase
          .from("creators")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()
        const creatorId = creatorRow?.id ?? null

        // 2. Delete storage files ─────────────────────────────────────────────
        // avatars bucket
        await deleteStorageFolder(adminSupabase, "avatars", user.id)
        // onepage-assets bucket
        await deleteStorageFolder(adminSupabase, "onepage-assets", user.id)
        // product-images bucket
        if (creatorId) {
          await deleteStorageFolder(adminSupabase, "product-images", creatorId)
        }

        // 3. Analytics & engagement events ────────────────────────────────────
        if (creatorId) {
          // Delete all analytics events for this creator's products
          const { data: productIds } = await adminSupabase
            .from("products")
            .select("id")
            .eq("creator_id", creatorId)
          if (productIds && productIds.length > 0) {
            const ids = productIds.map((p: { id: string }) => p.id)
            await adminSupabase.from("analytics_events").delete().in("product_id", ids)
            await adminSupabase.from("analytics_daily_rollups").delete().in("product_id", ids)
          }
        }

        // 4. Orders (buyer side — purchases made by this user) ─────────────────
        await adminSupabase.from("orders").delete().eq("buyer_id", user.id)

        // 5. Library items (purchased digital products) ───────────────────────
        await adminSupabase.from("library_items").delete().eq("user_id", user.id)

        // 6. Push tokens ──────────────────────────────────────────────────────
        await adminSupabase.from("push_tokens").delete().eq("user_id", user.id)

        // 7. Onepages ─────────────────────────────────────────────────────────
        await adminSupabase.from("onepages").delete().eq("owner_id", user.id)

        // 8. Creator-specific data ────────────────────────────────────────────
        if (creatorId) {
          await adminSupabase.from("digital_assets").delete().eq("creator_id", creatorId)
          await adminSupabase.from("products").delete().eq("creator_id", creatorId)
          await adminSupabase.from("payouts").delete().eq("creator_id", creatorId)
          await adminSupabase.from("creators").delete().eq("id", creatorId)
        }

        // Also catch any digital_assets still linked by user_id
        await adminSupabase.from("digital_assets").delete().eq("user_id", user.id)

        // 9. Profiles ─────────────────────────────────────────────────────────
        await adminSupabase.from("profiles").delete().eq("id", user.id)

        // 10. Verification codes ──────────────────────────────────────────────
        await adminSupabase.from("account_delete_codes").delete().eq("user_id", user.id)
        await adminSupabase.from("email_change_codes").delete().eq("user_id", user.id)

        // 11. Finally delete the auth user ────────────────────────────────────
        const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(user.id)
        if (deleteError) {
          console.error("Error deleting auth user:", deleteError)
          return NextResponse.json({ error: "Failed to delete account" }, { status: 500 })
        }
      } catch (deleteError) {
        console.error("Error during account deletion:", deleteError)
        return NextResponse.json({ error: "Failed to delete account data" }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        message: "Account successfully deleted",
      })
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (error) {
    console.error("Delete account error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// ── Storage helper ─────────────────────────────────────────────────────────────

async function deleteStorageFolder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  bucket: string,
  prefix: string
): Promise<void> {
  try {
    const { data: files } = await adminSupabase.storage.from(bucket).list(prefix, { limit: 1000 })
    if (!files || files.length === 0) return
    const paths = files.map((f: { name: string }) => `${prefix}/${f.name}`)
    await adminSupabase.storage.from(bucket).remove(paths)
  } catch {
    // Non-fatal: storage cleanup failure should not block account deletion
    console.warn(`[delete-account] storage cleanup failed for ${bucket}/${prefix}`)
  }
}
