import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { sendEmail, isSmtpConfigured } from "@/lib/mail"
import { VERIFICATION_CODE_EXPIRY_MINUTES } from "@/lib/security"
import { MAX_CODE_ATTEMPTS, codeMatches, newCode, wrongCodeMessage } from "@/lib/account/codes"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { ownerAddress } from "@/lib/businesses/email-alias"
import { businessGroup, sessionFor } from "@/lib/businesses/server"

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
      const verificationCode = newCode()
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
            to: ownerAddress(user.email) || user.email!,
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

      /* The pending code, whatever was typed, so a wrong guess can be counted
         against it. After five it is thrown away (lib/account/codes.ts). */
      const { data: codeRecord } = await adminSupabase
        .from("account_delete_codes")
        .select("*")
        .eq("user_id", user.id)
        .eq("verified", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!codeRecord) {
        return NextResponse.json({ error: "That code has expired. Ask for a new one." }, { status: 400 })
      }
      const attempts = typeof codeRecord.attempts === "number" ? codeRecord.attempts : 0
      if (attempts >= MAX_CODE_ATTEMPTS || !codeMatches(codeRecord.code, String(code))) {
        const next = attempts + 1
        if (next >= MAX_CODE_ATTEMPTS) await adminSupabase.from("account_delete_codes").delete().eq("id", codeRecord.id)
        else await adminSupabase.from("account_delete_codes").update({ attempts: next }).eq("id", codeRecord.id)
        return NextResponse.json({ error: wrongCodeMessage(next) }, { status: 400 })
      }

      // Mark code as verified
      await adminSupabase
        .from("account_delete_codes")
        .update({ verified: true })
        .eq("id", codeRecord.id)

      /*
        MORE THAN ONE BUSINESS ON ONE LOGIN (lib/businesses). A login that
        owns other businesses takes every one of them with it: they have no
        password of their own and could never be reached again. Deleting one
        of those businesses on its own leaves the rest alone, and the person
        is signed back into the first.
      */
      const group = await businessGroup(user.id)
      if (group?.ownerId === user.id) {
        for (const memberId of group.memberIds) {
          try {
            await deleteAllUserData(adminSupabase, memberId)
          } catch (deleteError: any) {
            console.error("Error deleting a business of this login:", deleteError?.message || deleteError)
          }
          const { error: memberDeleteError } = await adminSupabase.auth.admin.deleteUser(memberId)
          if (memberDeleteError) {
            console.error("Business auth deletion failed:", memberDeleteError.message)
            return NextResponse.json({ error: "Failed to delete account. Please contact support." }, { status: 500 })
          }
        }
      }

      // ── Delete all user data (in dependency order) ─────────────────────────
      try {
        await deleteAllUserData(adminSupabase, user.id)
      } catch (deleteError: any) {
        console.error("Error during account deletion:", deleteError?.message || deleteError)
      }

      // Always try to delete the auth user, even if data cleanup had issues
      const { error: authDeleteError } = await adminSupabase.auth.admin.deleteUser(user.id)
      if (authDeleteError) {
        console.error("Auth user deletion failed:", authDeleteError.message)
        // Try once more after a short delay
        await new Promise(r => setTimeout(r, 500))
        const { error: retryError } = await adminSupabase.auth.admin.deleteUser(user.id)
        if (retryError) {
          console.error("Auth user deletion retry failed:", retryError.message)
          return NextResponse.json({ error: "Failed to delete account. Please contact support." }, { status: 500 })
        }
      }

      /* One of the login's businesses is gone; its owner is still here, so they land back in their first business signed in. */
      const firstBusiness = group && group.ownerId !== user.id ? await sessionFor(group.ownerId) : null
      return NextResponse.json({
        success: true,
        message: "Account successfully deleted",
        ...(firstBusiness ? { firstBusiness: { session: firstBusiness } } : {}),
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
  // Every public bucket a person uploads to, under both of their ids: uploads
  // are filed under the user id or the creator id (see the storage policies in
  // supabase/migrations/20260929_upload_safety.sql). Their photos go with them.
  const ownerFolders = [userId, creatorId].filter((id): id is string => typeof id === "string" && id.length > 0)
  for (const bucket of ["avatars", "covers", "onepage-assets", "product-images", "store-builder-images", "product-videos", "lead-form-files-v2", "email-images", "digital-products"]) {
    for (const owner of ownerFolders) await deleteStorageFolder(adminSupabase, bucket, owner)
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

  // Helper: safe batch delete (skip if empty array)
  const deleteIn = async (table: string, column: string, ids: string[]) => {
    if (ids.length === 0) return
    await ignoreError(adminSupabase.from(table).delete().in(column, ids))
  }

  // 4. Analytics (must happen before products are deleted) ──────────────────
  if (productIds.length > 0) {
    await deleteIn("analytics_events", "product_id", productIds)
    await deleteIn("analytics_daily_rollups", "product_id", productIds)
    await deleteIn("product_analytics_daily", "product_id", productIds)
    await deleteIn("product_views", "product_id", productIds)
    await deleteIn("product_bundles", "product_id", productIds)
    await deleteIn("subscriber_digital_products", "product_id", productIds)
  }

  // 5. Refunds (references orders and creators) ─────────────────────────────
  await ignoreError(adminSupabase.from("refunds").delete().eq("buyer_id", userId))
  if (creatorId) {
    await ignoreError(adminSupabase.from("refunds").delete().eq("creator_id", creatorId))
  }

  // 6. Entitlements (references buyer_id, creator_id, product_id) ──────────
  await ignoreError(adminSupabase.from("entitlements").delete().eq("buyer_id", userId))
  if (creatorId) {
    await ignoreError(adminSupabase.from("entitlements").delete().eq("creator_id", creatorId))
  }

  // 7. Verification codes & security events (reference orders) ──────────────
  await ignoreError(adminSupabase.from("security_events").delete().eq("user_id", userId))
  await ignoreError(adminSupabase.from("verification_codes").delete().eq("user_id", userId))

  // 8. Orders (buyer side — purchases made by this user) ────────────────────
  await ignoreError(adminSupabase.from("orders").delete().eq("buyer_id", userId))

  // 9. Course progress ────────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("course_progress").delete().eq("buyer_id", userId))

  // 10. Wishlist items ──────────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("wishlist_items").delete().eq("user_id", userId))

  // 11. Community (posts & comments by this user) ──────────────────────────
  await ignoreError(adminSupabase.from("community_comments").delete().eq("author_id", userId))
  await ignoreError(adminSupabase.from("community_posts").delete().eq("author_id", userId))

  // 9. Library items ────────────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("library_items").delete().eq("user_id", userId))

  // 10. Push tokens ──────────────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("push_tokens").delete().eq("user_id", userId))

  // 11. OnePage views & pages ─────────────────────────────────────────────────
  // Get onepage IDs first, then delete views by those IDs
  const { data: onepages } = (await ignoreError(
    adminSupabase.from("onepages").select("id").eq("owner_id", userId),
  )) ?? { data: null }
  if (onepages && onepages.length > 0) {
    const onepageIds = onepages.map((p: { id: string }) => p.id)
    await deleteIn("onepage_views", "onepage_id", onepageIds)
  }
  await ignoreError(adminSupabase.from("onepages").delete().eq("owner_id", userId))

  // 12. Creator-specific data ───────────────────────────────────────────────
  if (creatorId) {
    // Subscribers
    await ignoreError(adminSupabase.from("subscribers").delete().eq("creator_id", creatorId))

    // Reviews (references creator_id and product_id)
    await ignoreError(adminSupabase.from("reviews").delete().eq("creator_id", creatorId))

    // Email system
    await ignoreError(adminSupabase.from("flow_execution_log").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("scheduled_flow_emails").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("email_events").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("campaign_recipients").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("email_campaigns").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("email_segments").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("email_flows").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("email_usage").delete().eq("creator_id", creatorId))

    // Seller notifications
    await ignoreError(adminSupabase.from("seller_notifications").delete().eq("creator_id", creatorId))

    // Customers & payment events
    await ignoreError(adminSupabase.from("customers").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("payment_connection_events").delete().eq("creator_id", creatorId))

    // Email templates
    await ignoreError(adminSupabase.from("email_templates").delete().eq("creator_id", creatorId))

    // Community (creator's community posts)
    await ignoreError(adminSupabase.from("community_posts").delete().eq("creator_id", creatorId))

    // OnePage billing
    await ignoreError(adminSupabase.from("onepage_billing").delete().eq("seller_id", creatorId))

    // Subscriptions & billing
    await ignoreError(adminSupabase.from("invoices").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("payment_methods").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("subscriptions").delete().eq("creator_id", creatorId))

    // Ledger
    await ignoreError(adminSupabase.from("ledger_events").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("seller_ledger").delete().eq("creator_id", creatorId))

    // Domains
    await ignoreError(adminSupabase.from("domain_redirects").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("custom_domains").delete().eq("creator_id", creatorId))

    // Coupons
    await ignoreError(adminSupabase.from("coupons").delete().eq("creator_id", creatorId))

    // Store builder
    await ignoreError(adminSupabase.from("store_builder_configs").delete().eq("creator_id", creatorId))

    // Website builder (theme installs cascade to settings, pages, files, publish history)
    await ignoreError(adminSupabase.from("theme_publish_history").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("store_theme_installs").delete().eq("creator_id", creatorId))

    // Product variants & videos & slug history
    await deleteIn("product_variants", "product_id", productIds)
    await deleteIn("product_videos", "product_id", productIds)
    await deleteIn("product_slug_history", "product_id", productIds)

    // Courses
    await deleteIn("courses", "product_id", productIds)

    // Core creator data
    await ignoreError(adminSupabase.from("digital_assets").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("products").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("payouts").delete().eq("creator_id", creatorId))
    await ignoreError(adminSupabase.from("creators").delete().eq("id", creatorId))
  }

  // Also catch any digital_assets still linked by user_id
  await ignoreError(adminSupabase.from("digital_assets").delete().eq("user_id", userId))

  // 13. Profiles ────────────────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("profiles").delete().eq("id", userId))

  // 14. Verification codes ──────────────────────────────────────────────────
  await ignoreError(adminSupabase.from("account_delete_codes").delete().eq("user_id", userId))
  await ignoreError(adminSupabase.from("email_change_codes").delete().eq("user_id", userId))
  await ignoreError(adminSupabase.from("password_reset_requests").delete().eq("user_id", userId))
  await ignoreError(adminSupabase.from("auth_recovery_requests").delete().eq("user_id", userId))

  // Auth user deletion is handled by the caller (POST handler)
}

// ── Storage helper ─────────────────────────────────────────────────────────────

async function deleteStorageFolder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminSupabase: any,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<void> {
  // The folder and the folders inside it: list() is one level, and uploads
  // live in subfolders (`<id>/avatars/…`, `<id>/<product>/gallery/…`), which
  // the old one level listing left behind. Bounded in depth and pages.
  if (depth > 4) return
  try {
    // Always the first page: what was removed is no longer listed.
    for (let round = 0; round < 20; round++) {
      const { data: entries } = await adminSupabase.storage.from(bucket).list(prefix, { limit: 1000 })
      if (!entries || entries.length === 0) return
      const files: string[] = []
      for (const e of entries as { name: string; id: string | null }[]) {
        if (e.id === null) await deleteStorageFolder(adminSupabase, bucket, `${prefix}/${e.name}`, depth + 1)
        else files.push(`${prefix}/${e.name}`)
      }
      if (files.length > 0) await adminSupabase.storage.from(bucket).remove(files)
      if (files.length === 0 || entries.length < 1000) return
    }
  } catch {
    // Non-fatal: storage cleanup failure should not block account deletion
    console.warn(`[delete-account] storage cleanup failed for ${bucket}/${prefix}`)
  }
}
