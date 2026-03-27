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
        await deleteAllUserData(adminSupabase, user.id)
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

// ── Shared user deletion logic ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteAllUserData(adminSupabase: any, userId: string) {
  // 1. Collect creator id (needed for creator-specific tables)
  const { data: creatorRow } = await adminSupabase
    .from("creators")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle()
  const creatorId = creatorRow?.id ?? null

  // 2. Delete storage files ─────────────────────────────────────────────────
  await deleteStorageFolder(adminSupabase, "avatars", userId)
  await deleteStorageFolder(adminSupabase, "onepage-assets", userId)
  if (creatorId) {
    await deleteStorageFolder(adminSupabase, "product-images", creatorId)
  }

  // 3. Collect product IDs for child-table cleanup ──────────────────────────
  let productIds: string[] = []
  if (creatorId) {
    const { data: prods } = await adminSupabase
      .from("products")
      .select("id")
      .eq("creator_id", creatorId)
    if (prods && prods.length > 0) {
      productIds = prods.map((p: { id: string }) => p.id)
    }
  }

  // 4. Analytics (must happen before products are deleted) ──────────────────
  if (productIds.length > 0) {
    await adminSupabase.from("analytics_events").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("analytics_daily_rollups").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("product_analytics_daily").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("product_views").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("product_bundles").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("subscriber_digital_products").delete().in("product_id", productIds).catch(() => {})
  }

  // 5. Refunds (references orders and creators) ─────────────────────────────
  await adminSupabase.from("refunds").delete().eq("buyer_id", userId).catch(() => {})
  if (creatorId) {
    await adminSupabase.from("refunds").delete().eq("creator_id", creatorId).catch(() => {})
  }

  // 6. Entitlements (references buyer_id, creator_id, product_id) ──────────
  await adminSupabase.from("entitlements").delete().eq("buyer_id", userId).catch(() => {})
  if (creatorId) {
    await adminSupabase.from("entitlements").delete().eq("creator_id", creatorId).catch(() => {})
  }

  // 7. Verification codes & security events (reference orders) ──────────────
  await adminSupabase.from("security_events").delete().eq("user_id", userId).catch(() => {})
  await adminSupabase.from("verification_codes").delete().eq("user_id", userId).catch(() => {})

  // 8. Orders (buyer side — purchases made by this user) ────────────────────
  await adminSupabase.from("orders").delete().eq("buyer_id", userId).catch(() => {})

  // 9. Course progress ────────────────────────────────────────────────────
  await adminSupabase.from("course_progress").delete().eq("buyer_id", userId).catch(() => {})

  // 10. Wishlist items ──────────────────────────────────────────────────────
  await adminSupabase.from("wishlist_items").delete().eq("user_id", userId).catch(() => {})

  // 11. Community (posts & comments by this user) ──────────────────────────
  await adminSupabase.from("community_comments").delete().eq("author_id", userId).catch(() => {})
  await adminSupabase.from("community_posts").delete().eq("author_id", userId).catch(() => {})

  // 9. Library items ────────────────────────────────────────────────────────
  await adminSupabase.from("library_items").delete().eq("user_id", userId).catch(() => {})

  // 10. Push tokens ──────────────────────────────────────────────────────────
  await adminSupabase.from("push_tokens").delete().eq("user_id", userId).catch(() => {})

  // 11. OnePage views & pages ─────────────────────────────────────────────────
  await adminSupabase.from("onepage_views").delete().eq("onepage_id", userId).catch(() => {})
  await adminSupabase.from("onepages").delete().eq("owner_id", userId).catch(() => {})

  // 12. Creator-specific data ───────────────────────────────────────────────
  if (creatorId) {
    // Subscribers
    await adminSupabase.from("subscribers").delete().eq("creator_id", creatorId).catch(() => {})

    // Reviews (references creator_id and product_id)
    await adminSupabase.from("reviews").delete().eq("creator_id", creatorId).catch(() => {})

    // Email system
    await adminSupabase.from("flow_execution_log").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("scheduled_flow_emails").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("email_events").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("campaign_recipients").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("email_campaigns").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("email_segments").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("email_flows").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("email_usage").delete().eq("creator_id", creatorId).catch(() => {})

    // Seller notifications
    await adminSupabase.from("seller_notifications").delete().eq("creator_id", creatorId).catch(() => {})

    // Customers & payment events
    await adminSupabase.from("customers").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("payment_connection_events").delete().eq("creator_id", creatorId).catch(() => {})

    // Email templates
    await adminSupabase.from("email_templates").delete().eq("creator_id", creatorId).catch(() => {})

    // Community (creator's community posts)
    await adminSupabase.from("community_posts").delete().eq("creator_id", creatorId).catch(() => {})

    // OnePage billing
    await adminSupabase.from("onepage_billing").delete().eq("seller_id", creatorId).catch(() => {})

    // Subscriptions & billing
    await adminSupabase.from("invoices").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("payment_methods").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("subscriptions").delete().eq("creator_id", creatorId).catch(() => {})

    // Ledger
    await adminSupabase.from("ledger_events").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("seller_ledger").delete().eq("creator_id", creatorId).catch(() => {})

    // Domains
    await adminSupabase.from("domain_redirects").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("custom_domains").delete().eq("creator_id", creatorId).catch(() => {})

    // Coupons
    await adminSupabase.from("coupons").delete().eq("creator_id", creatorId).catch(() => {})

    // Store builder
    await adminSupabase.from("store_builder_configs").delete().eq("creator_id", creatorId).catch(() => {})

    // Website builder (theme installs cascade to settings, pages, files, publish history)
    await adminSupabase.from("theme_publish_history").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("store_theme_installs").delete().eq("creator_id", creatorId).catch(() => {})

    // Product variants & videos & slug history
    await adminSupabase.from("product_variants").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("product_videos").delete().in("product_id", productIds).catch(() => {})
    await adminSupabase.from("product_slug_history").delete().in("product_id", productIds).catch(() => {})

    // Courses
    await adminSupabase.from("courses").delete().in("product_id", productIds).catch(() => {})

    // Core creator data
    await adminSupabase.from("digital_assets").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("products").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("payouts").delete().eq("creator_id", creatorId).catch(() => {})
    await adminSupabase.from("creators").delete().eq("id", creatorId).catch(() => {})
  }

  // Also catch any digital_assets still linked by user_id
  await adminSupabase.from("digital_assets").delete().eq("user_id", userId).catch(() => {})

  // 13. Profiles ────────────────────────────────────────────────────────────
  await adminSupabase.from("profiles").delete().eq("id", userId).catch(() => {})

  // 14. Verification codes ──────────────────────────────────────────────────
  await adminSupabase.from("account_delete_codes").delete().eq("user_id", userId).catch(() => {})
  await adminSupabase.from("email_change_codes").delete().eq("user_id", userId).catch(() => {})

  // 15. Finally delete the auth user ────────────────────────────────────────
  const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId)
  if (deleteError) {
    console.error("Error deleting auth user:", deleteError)
    throw new Error(`Failed to delete auth user: ${deleteError.message}`)
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
