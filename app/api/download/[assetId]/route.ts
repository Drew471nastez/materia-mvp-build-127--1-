import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { headers, cookies } from "next/headers"
import { SIGNED_URL_EXPIRY_SECONDS } from "@/lib/security"

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
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
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }

  let hasAccess = false
  let entitlementId: string | null = null
  let orderIdForLog: string | null = null

  // Check access via receipt token
  if (receiptToken) {
    const { data: order } = await admin
      .from("orders")
      .select("id, product_id, buyer_id, allowed_fingerprints, session_fingerprint, variant_id")
      .eq("receipt_token", receiptToken)
      .single()

    if (order && order.product_id === asset.product_id) {
      orderIdForLog = order.id

      // VARIANT ACCESS CHECK: If order has a variant, verify the asset is assigned to that variant
      let variantAccessOk = true
      if (order.variant_id) {
        const { data: variantFile } = await admin
          .from("product_variant_files")
          .select("id")
          .eq("variant_id", order.variant_id)
          .eq("digital_asset_id", assetId)
          .maybeSingle()

        if (!variantFile) {
          // Asset is not assigned to this variant - deny access
          variantAccessOk = false
          console.log("[download] Asset not assigned to purchased variant:", assetId, order.variant_id)
        }
      }

      if (variantAccessOk) {
        // A valid receipt token matching the order+product is sufficient proof of purchase.
        // No additional fingerprint/session check needed — the receipt token IS the credential.
        hasAccess = true
      }
    }
  }

  // Check access via order ID + token (legacy)
  if (!hasAccess && orderId && accessToken) {
    const { data: order } = await admin
      .from("orders")
      .select("id, access_token, product_id, allowed_fingerprints, session_fingerprint, variant_id")
      .eq("id", orderId)
      .single()

    if (order && order.access_token === accessToken && order.product_id === asset.product_id) {
      orderIdForLog = order.id

      // VARIANT ACCESS CHECK: If order has a variant, verify the asset is assigned to that variant
      let variantAccessOk = true
      if (order.variant_id) {
        const { data: variantFile } = await admin
          .from("product_variant_files")
          .select("id")
          .eq("variant_id", order.variant_id)
          .eq("digital_asset_id", assetId)
          .maybeSingle()

        if (!variantFile) {
          variantAccessOk = false
          console.log("[download] Asset not assigned to purchased variant (legacy):", assetId, order.variant_id)
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
  }

  // Check user access via entitlement
  if (user && !hasAccess) {
    const { data: entitlement } = await admin
      .from("entitlements")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", asset.product_id)
      .single()

    if (entitlement) {
      hasAccess = true
      entitlementId = entitlement.id
    }

    // Allow creator access
    if (!hasAccess && asset.product?.creator_id) {
      const { data: creator } = await admin
        .from("creators")
        .select("id")
        .eq("user_id", user.id)
        .eq("id", asset.product.creator_id)
        .single()

      if (creator) {
        hasAccess = true
      }
    }
  }

  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  }

  // Generate signed URL using multi-bucket resolver
  try {
    const { generateSignedDownloadUrl, logDownloadEvent } = await import("@/lib/storage")
    const signed = await generateSignedDownloadUrl(admin, asset.file_path, SIGNED_URL_EXPIRY_SECONDS, asset.storage_bucket || undefined)

    if (!signed) {
      return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
    }

    // Record download event
    const userAgent = headersList.get("user-agent") || null
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || null

    await logDownloadEvent(admin, {
      assetId,
      orderId: orderIdForLog || undefined,
      entitlementId: entitlementId || undefined,
      ip,
      userAgent,
    })

    // Log security event (non-fatal)
    if (orderIdForLog) {
      try {
        await admin.from("security_events").insert({
          order_id: orderIdForLog,
          event_type: "download_issued",
          ip: ip,
          user_agent: userAgent,
        })
      } catch {
        // non-fatal — don't block download if logging fails
      }
    }

    return NextResponse.json({
      success: true,
      downloadUrl: signed.url,
      fileName: asset.file_name,
    })
  } catch (error) {
    console.error("[download] Error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
