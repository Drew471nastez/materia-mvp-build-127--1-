import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureProductBundle } from "@/lib/bundles"

/**
 * POST /api/storage/generate-bundle
 *
 * Triggers background ZIP bundle generation for a multi-file product.
 * Called when a product is published or files are modified.
 *
 * Body: { productId, variantId? }
 *
 * The ZIP is generated server-side and cached in product_bundles.
 * Subsequent downloads serve the cached ZIP instantly.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { productId, variantId } = body

    if (!productId) {
      return NextResponse.json({ error: "productId required" }, { status: 400 })
    }

    const admin = createAdminClient()

    // Verify ownership
    const { data: product } = await admin
      .from("products")
      .select("id, title, creator_id, creator:creators(id, user_id)")
      .eq("id", productId)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    const creatorOwner = (product as any).creator
    if (!creatorOwner || creatorOwner.user_id !== user.id) {
      return NextResponse.json({ error: "Not your product" }, { status: 403 })
    }

    // Get variant name if applicable
    let variantName: string | null = null
    if (variantId) {
      const { data: variant } = await admin
        .from("product_variants")
        .select("name")
        .eq("id", variantId)
        .single()
      variantName = variant?.name || null
    }

    // Generate bundle (this may take a while for large files)
    const result = await ensureProductBundle(
      admin,
      productId,
      product.title || "Product",
      product.creator_id,
      variantId,
      variantName,
    )

    if (!result) {
      return NextResponse.json({
        success: true,
        bundled: false,
        message: "Not enough files for bundling (threshold: 6)",
      })
    }

    return NextResponse.json({
      success: true,
      bundled: true,
      fromCache: result.fromCache,
      zipFileName: result.zipFileName,
    })
  } catch (error) {
    console.error("[generate-bundle] Error:", error)
    return NextResponse.json({ error: "Bundle generation failed" }, { status: 500 })
  }
}
