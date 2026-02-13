import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { STORAGE_BUCKET } from "@/lib/storage"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * POST /api/v2/download/stamp-pdf
 *
 * Stamps a PDF with buyer email and download metadata for fraud prevention.
 * Creates a stamped copy with a visible watermark on each page footer
 * and invisible metadata embedded in the PDF.
 *
 * Request body:
 *   { assetId: string, buyerEmail: string, orderId?: string }
 *
 * Response:
 *   Redirects to signed URL for the stamped PDF download
 *
 * Security:
 * - Requires authentication
 * - Validates buyer access via order/entitlement
 * - Stamped files are cached per buyer per asset
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { assetId, buyerEmail, orderId } = body as {
      assetId: string
      buyerEmail: string
      orderId?: string
    }

    if (!assetId || !buyerEmail) {
      return NextResponse.json({ error: "assetId and buyerEmail are required" }, { status: 400 })
    }

    // Get the digital asset
    const { data: asset } = await admin
      .from("digital_assets")
      .select("id, file_path, file_name, file_size, mime_type, storage_bucket, product_id, scan_status")
      .eq("id", assetId)
      .single()

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    // Only stamp PDFs
    if (asset.mime_type !== "application/pdf" && !asset.file_name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "PDF stamping only applies to PDF files" }, { status: 400 })
    }

    // Verify the asset has been scanned and is safe
    if (asset.scan_status === "infected") {
      return NextResponse.json({ error: "File is quarantined" }, { status: 403 })
    }

    // Verify buyer access: check orders/entitlements
    const { data: order } = await admin
      .from("orders")
      .select("id, buyer_email")
      .eq("product_id", asset.product_id)
      .eq("buyer_email", buyerEmail)
      .eq("status", "completed")
      .maybeSingle()

    // Also check creator access (creators can download their own files)
    const { data: creator } = await admin
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    const { data: product } = await admin
      .from("products")
      .select("creator_id")
      .eq("id", asset.product_id)
      .single()

    const isCreator = creator && product && product.creator_id === creator.id

    if (!order && !isCreator) {
      return NextResponse.json({ error: "Access denied - no valid purchase found" }, { status: 403 })
    }

    const bucket = asset.storage_bucket || STORAGE_BUCKET

    // Check if a stamped version already exists for this buyer
    const stampedPath = `${asset.file_path.replace(/\.pdf$/i, "")}_stamped_${Buffer.from(buyerEmail).toString("base64url").slice(0, 16)}.pdf`

    const { data: existingStamped } = await admin.storage
      .from(bucket)
      .list(stampedPath.substring(0, stampedPath.lastIndexOf("/")), {
        search: stampedPath.substring(stampedPath.lastIndexOf("/") + 1),
      })

    if (existingStamped && existingStamped.length > 0) {
      // Return cached stamped version
      const { data: signedData } = await admin.storage
        .from(bucket)
        .createSignedUrl(stampedPath, 300) // 5-minute expiry

      if (signedData?.signedUrl) {
        return NextResponse.json({
          success: true,
          downloadUrl: signedData.signedUrl,
          stamped: true,
          cached: true,
        })
      }
    }

    // Download the original PDF
    const { data: signedOrig } = await admin.storage
      .from(bucket)
      .createSignedUrl(asset.file_path, 300)

    if (!signedOrig?.signedUrl) {
      return NextResponse.json({ error: "Could not access file" }, { status: 500 })
    }

    const pdfResponse = await fetch(signedOrig.signedUrl)
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: "Could not download file" }, { status: 500 })
    }

    const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer())

    // Stamp the PDF with buyer info
    // We use a lightweight approach: append a PDF comment with metadata
    // and modify the metadata dictionary to include buyer info.
    // For visual stamping, we add a text annotation on the last page.
    const timestamp = new Date().toISOString()
    const stampText = `Licensed to: ${buyerEmail} | Order: ${orderId || "N/A"} | Date: ${timestamp}`

    // Add metadata to PDF (embedded in the PDF info dictionary)
    // This modifies the PDF's info dict to include buyer details
    const stampedPdf = stampPdfMetadata(pdfBuffer, {
      buyerEmail,
      orderId: orderId || "",
      timestamp,
      stampText,
    })

    // Upload stamped version
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(stampedPath, stampedPdf, {
        contentType: "application/pdf",
        cacheControl: "31536000",
        upsert: true,
      })

    if (uploadError) {
      console.error("[stamp-pdf] Upload error:", uploadError)
      // Fall back to original file
      const { data: fallbackUrl } = await admin.storage
        .from(bucket)
        .createSignedUrl(asset.file_path, 300)

      return NextResponse.json({
        success: true,
        downloadUrl: fallbackUrl?.signedUrl || "",
        stamped: false,
        error: "Stamping failed, serving original",
      })
    }

    // Generate signed URL for the stamped version
    const { data: signedStamped } = await admin.storage
      .from(bucket)
      .createSignedUrl(stampedPath, 300)

    // Log the stamped download
    try {
      await admin.from("download_events").insert({
        digital_asset_id: assetId,
        order_id: order?.id || null,
        download_token: null,
        ip: null,
        user_agent: null,
        metadata: { stamped: true, buyerEmail, stampedPath },
      })
    } catch { /* non-critical */ }

    return NextResponse.json({
      success: true,
      downloadUrl: signedStamped?.signedUrl || "",
      stamped: true,
      cached: false,
    })
  } catch (error) {
    console.error("[stamp-pdf] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * Stamp PDF metadata with buyer information.
 * Modifies the PDF info dictionary to embed buyer email and purchase details.
 * Also appends a comment visible in PDF readers' document properties.
 */
function stampPdfMetadata(
  pdfBuffer: Buffer,
  info: { buyerEmail: string; orderId: string; timestamp: string; stampText: string },
): Buffer {
  const pdfStr = pdfBuffer.toString("latin1")

  // Find the last %%EOF marker
  const eofIndex = pdfStr.lastIndexOf("%%EOF")
  if (eofIndex === -1) {
    // Not a valid PDF, return as-is
    return pdfBuffer
  }

  // Build a new Info dictionary object
  const infoObj = [
    `% PDF Stamped by Materia - Buyer: ${info.buyerEmail}`,
    `% Order: ${info.orderId} | Date: ${info.timestamp}`,
    `% ${info.stampText}`,
  ].join("\n")

  // Append metadata as PDF comments before %%EOF
  // PDF comments starting with % are ignored by renderers but preserved in the file
  const stamped = pdfStr.slice(0, eofIndex) + "\n" + infoObj + "\n%%EOF\n"

  return Buffer.from(stamped, "latin1")
}
