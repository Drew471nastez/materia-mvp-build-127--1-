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
      .select("id, product_id, buyer_id, allowed_fingerprints, session_fingerprint")
      .eq("receipt_token", receiptToken)
      .single()

    if (order && order.product_id === asset.product_id) {
      orderIdForLog = order.id

      // If user owns the order, grant access
      if (user && order.buyer_id === user.id) {
        hasAccess = true
      } else {
        // Check fingerprint
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

  // Check access via order ID + token (legacy)
  if (!hasAccess && orderId && accessToken) {
    const { data: order } = await admin
      .from("orders")
      .select("id, access_token, product_id, allowed_fingerprints, session_fingerprint")
      .eq("id", orderId)
      .single()

    if (order && order.access_token === accessToken && order.product_id === asset.product_id) {
      orderIdForLog = order.id
      const sessionCookie = cookieStore.get("materia_session")
      const allowedFingerprints = order.allowed_fingerprints || []

      if (sessionCookie && allowedFingerprints.includes(sessionCookie.value)) {
        hasAccess = true
      } else if (order.session_fingerprint && sessionCookie?.value === order.session_fingerprint) {
        hasAccess = true
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

  // Generate signed URL
  try {
    let storagePath = asset.file_path

    if (storagePath.includes("/storage/v1/object/")) {
      const match = storagePath.match(/\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+?)(?:\?|$)/)
      if (match) {
        storagePath = decodeURIComponent(match[1])
      }
    }

    let signedUrlResult = await admin.storage
      .from("product-files")
      .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS, {
        download: true,
      })

    if (signedUrlResult.error) {
      signedUrlResult = await admin.storage
        .from("digital-assets")
        .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS, {
          download: true,
        })
    }

    if (signedUrlResult.error || !signedUrlResult.data) {
      return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 })
    }

    // Record download event
    const userAgent = headersList.get("user-agent") || null
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor?.split(",")[0]?.trim() || null

    await admin.from("download_events").insert({
      entitlement_id: entitlementId,
      order_id: orderIdForLog,
      user_agent: userAgent,
      ip: ip,
    })

    // Log security event
    if (orderIdForLog) {
      await admin.from("security_events").insert({
        order_id: orderIdForLog,
        event_type: "download_issued",
        ip: ip,
        user_agent: userAgent,
      })
    }

    return NextResponse.json({
      success: true,
      downloadUrl: signedUrlResult.data.signedUrl,
      fileName: asset.file_name,
    })
  } catch (error) {
    console.error("[v0] Download error:", error)
    return NextResponse.json({ error: "Download failed" }, { status: 500 })
  }
}
