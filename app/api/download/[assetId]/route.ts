import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { headers, cookies } from "next/headers"
import { SIGNED_URL_EXPIRY_SECONDS } from "@/lib/security"

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { assetId } = await params
    const { searchParams } = new URL(request.url)
    const receiptToken = searchParams.get("receipt")
    const orderId = searchParams.get("order")
    const accessToken = searchParams.get("token")

    const supabase = await createClient()
    const admin = createAdminClient()
    const headersList = await headers()
    const cookieStore = await cookies()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Fetch asset
    const { data: asset, error: assetError } = await admin
      .from("digital_assets")
      .select("*, product:products(id, creator_id, title)")
      .eq("id", assetId)
      .single()

    if (assetError || !asset) {
      console.error("[download] Asset not found:", assetId, assetError?.message)
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    if (!asset.file_path) {
      console.error("[download] Asset has no file_path:", assetId)
      return NextResponse.json({ error: "Asset file not available" }, { status: 404 })
    }

    let hasAccess = false
    let entitlementId: string | null = null
    let orderIdForLog: string | null = null

    // Check access via receipt token
    if (receiptToken) {
      try {
        const { data: order } = await admin
          .from("orders")
          .select("id, product_id, buyer_id, allowed_fingerprints, session_fingerprint, variant_id")
          .eq("receipt_token", receiptToken)
          .single()

        if (order && order.product_id === asset.product_id) {
          orderIdForLog = order.id

          // VARIANT ACCESS CHECK: If order has a variant, verify the asset is assigned to that variant
          // Fail-open: if the variant check query fails, allow access rather than denying
          let variantAccessOk = true
          if (order.variant_id) {
            try {
              const { data: variantFile, error: variantError } = await admin
                .from("product_variant_files")
                .select("id")
                .eq("variant_id", order.variant_id)
                .eq("digital_asset_id", assetId)
                .maybeSingle()

              if (!variantError && !variantFile) {
                // Query succeeded but no matching file - this variant doesn't include this asset
                variantAccessOk = false
                console.log("[download] Asset not assigned to purchased variant:", assetId, order.variant_id)
              }
              // If variantError, fail-open (allow access)
            } catch {
              // Fail-open on any exception
              console.warn("[download] Variant check failed, allowing access")
            }
          }

          if (variantAccessOk) {
            // A valid receipt token matching the order+product is sufficient proof of purchase.
            // No additional fingerprint/session check needed — the receipt token IS the credential.
            hasAccess = true
          }
        }
      } catch (err) {
        console.error("[download] Receipt token lookup failed:", err)
      }
    }

    // Check access via order ID + token (legacy)
    if (!hasAccess && orderId && accessToken) {
      try {
        const { data: order } = await admin
          .from("orders")
          .select("id, access_token, product_id, allowed_fingerprints, session_fingerprint, variant_id")
          .eq("id", orderId)
          .single()

        if (order && order.access_token === accessToken && order.product_id === asset.product_id) {
          orderIdForLog = order.id

          // VARIANT ACCESS CHECK (fail-open)
          let variantAccessOk = true
          if (order.variant_id) {
            try {
              const { data: variantFile, error: variantError } = await admin
                .from("product_variant_files")
                .select("id")
                .eq("variant_id", order.variant_id)
                .eq("digital_asset_id", assetId)
                .maybeSingle()

              if (!variantError && !variantFile) {
                variantAccessOk = false
                console.log("[download] Asset not assigned to purchased variant (legacy):", assetId, order.variant_id)
              }
            } catch {
              console.warn("[download] Variant check failed (legacy), allowing access")
            }
          }

          if (variantAccessOk) {
            const sessionCookie = cookieStore.get("materia_session")
            const allowedFingerprints = order.allowed_fingerprints || []

            if (sessionCookie && allowedFingerprints.includes(sessionCookie.value)) {
              hasAccess = true
            } else if (order.session_fingerprint && sessionCookie?.value === order.session_fingerprint) {
              hasAccess = true
            }
          }
        }
      } catch (err) {
        console.error("[download] Legacy token lookup failed:", err)
      }
    }

    // Check user access via entitlement
    if (user && !hasAccess) {
      try {
        const { data: entitlement } = await admin
          .from("entitlements")
          .select("id")
          .eq("buyer_id", user.id)
          .eq("product_id", asset.product_id)
          .maybeSingle()

        if (entitlement) {
          hasAccess = true
          entitlementId = entitlement.id
        }
      } catch {
        // Non-fatal — continue to order check
      }

      // Check user access via completed order (fallback when no entitlement record)
      if (!hasAccess) {
        try {
          const { data: userOrder } = await admin
            .from("orders")
            .select("id, variant_id")
            .eq("buyer_id", user.id)
            .eq("product_id", asset.product_id)
            .eq("status", "completed")
            .limit(1)
            .maybeSingle()

          if (userOrder) {
            orderIdForLog = userOrder.id

            // Variant access check (fail-open)
            let variantAccessOk = true
            if (userOrder.variant_id) {
              try {
                const { data: variantFile, error: variantError } = await admin
                  .from("product_variant_files")
                  .select("id")
                  .eq("variant_id", userOrder.variant_id)
                  .eq("digital_asset_id", assetId)
                  .maybeSingle()

                if (!variantError && !variantFile) {
                  variantAccessOk = false
                }
              } catch {
                // Fail-open
              }
            }

            if (variantAccessOk) {
              hasAccess = true
            }
          }
        } catch {
          // Non-fatal — continue to creator check
        }
      }

      // Allow creator access
      if (!hasAccess && asset.product?.creator_id) {
        try {
          const { data: creator } = await admin
            .from("creators")
            .select("id")
            .eq("user_id", user.id)
            .eq("id", asset.product.creator_id)
            .maybeSingle()

          if (creator) {
            hasAccess = true
          }
        } catch {
          // Non-fatal
        }
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Generate signed URL using multi-bucket resolver
    const { generateSignedDownloadUrl, logDownloadEvent } = await import("@/lib/storage")
    const signed = await generateSignedDownloadUrl(admin, asset.file_path, SIGNED_URL_EXPIRY_SECONDS, asset.storage_bucket || undefined)

    if (!signed) {
      console.error("[download] Failed to generate signed URL for:", asset.file_path, "bucket:", asset.storage_bucket)
      return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
    }

    // Record download event (fire-and-forget, never block the download)
    const userAgent = headersList.get("user-agent") || null
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || null

    // Don't await logging — let it run in the background
    logDownloadEvent(admin, {
      assetId,
      orderId: orderIdForLog || undefined,
      entitlementId: entitlementId || undefined,
      ip,
      userAgent,
    }).catch(() => {})

    // Log security event (fire-and-forget)
    if (orderIdForLog) {
      admin.from("security_events").insert({
        order_id: orderIdForLog,
        event_type: "download_issued",
        ip: ip,
        user_agent: userAgent,
      }).then(() => {}, () => {})
    }

    return NextResponse.json({
      success: true,
      downloadUrl: signed.url,
      fileName: asset.file_name,
    })
  } catch (error) {
    console.error("[download] Unhandled error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
