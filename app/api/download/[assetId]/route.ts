import { NextResponse } from "next/server"
import { fullyRefunded } from "@/lib/orders/refund-state"
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

    /*
      WHICH FILES A PURCHASE COVERS. An order or entitlement with a variant
      covers that variant's files; one without covers the product's. The
      check fails CLOSED: it used to allow the download whenever its own
      query errored. And a refunded order covers nothing.
    */
    /* Orders are read whole ("*"): the refund amount's column is not in
       every database, and naming a missing column fails the read. */
    const variantCovers = async (variantId: string | null): Promise<boolean> => {
      if (!variantId) return true
      const { data, error } = await admin
        .from("product_variant_files")
        .select("id")
        .eq("variant_id", variantId)
        .eq("digital_asset_id", assetId)
        .maybeSingle()
      if (error) {
        console.error("[download] variant check failed, refusing:", error.message)
        return false
      }
      return Boolean(data)
    }

    // Check access via receipt token
    if (receiptToken) {
      try {
        const { data: order } = await admin
          .from("orders")
          .select("*")
          .eq("receipt_token", receiptToken)
          .maybeSingle()

        if (order && order.product_id === asset.product_id && !fullyRefunded(order)) {
          orderIdForLog = order.id
          // A valid receipt token matching the order and product is the credential.
          hasAccess = await variantCovers(order.variant_id)
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
          .select("*")
          .eq("id", orderId)
          .maybeSingle()

        if (order && order.access_token === accessToken && order.product_id === asset.product_id && !fullyRefunded(order)) {
          orderIdForLog = order.id
          const sessionCookie = cookieStore.get("materia_session")
          const allowedFingerprints: string[] = order.allowed_fingerprints || []
          const recognised =
            !!sessionCookie &&
            (allowedFingerprints.includes(sessionCookie.value) || (!!order.session_fingerprint && sessionCookie.value === order.session_fingerprint))
          if (recognised) hasAccess = await variantCovers(order.variant_id)
        }
      } catch (err) {
        console.error("[download] Legacy token lookup failed:", err)
      }
    }

    // Check user access via entitlement, then via a completed order
    if (user && !hasAccess) {
      try {
        /* Every entitlement to the product, not one: a buyer with two
           variants has two rows, and `.maybeSingle()` answered that with an
           error. Each is checked against the file's variant. */
        const { data: entitlements } = await admin
          .from("entitlements")
          .select("id, variant_id")
          .eq("buyer_id", user.id)
          .eq("product_id", asset.product_id)
        for (const e of entitlements ?? []) {
          if (await variantCovers(e.variant_id)) {
            hasAccess = true
            entitlementId = e.id
            break
          }
        }
      } catch {
        // Non-fatal — continue to order check
      }

      if (!hasAccess) {
        try {
          const { data: userOrders } = await admin
            .from("orders")
            .select("id, variant_id")
            .eq("buyer_id", user.id)
            .eq("product_id", asset.product_id)
            .eq("status", "completed")
            .limit(20)
          for (const o of userOrders ?? []) {
            if (await variantCovers(o.variant_id)) {
              hasAccess = true
              orderIdForLog = o.id
              break
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
