import { NextResponse } from "next/server"
import { teamStoreIdFor } from "@/lib/team/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureProductBundle } from "@/lib/bundles"
import { rateLimit } from "@/lib/api/rate-limit"

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
    /* The owner, or (round 41) a team member with Products working in this product's store. */
    if (!creatorOwner || (creatorOwner.user_id !== user.id && creatorOwner.id !== (await teamStoreIdFor(user.id, "products")))) {
      return NextResponse.json({ error: "Not your product" }, { status: 403 })
    }

    const limited = await rateLimit({
      bucket: "bundle",
      subjects: [`user:${user.id}`],
      windows: [{ limit: 10, seconds: 60 }, { limit: 60, seconds: 3600 }],
      message: "The download bundle is already being made. Try again in a minute.",
    })
    if (limited) return limited

    // Get variant name if applicable. The variant must be one of THIS product's,
    // or its files (another creator's) would be read into this bundle.
    let variantName: string | null = null
    if (variantId) {
      const { data: variant } = await admin
        .from("product_variants")
        .select("name, product_id")
        .eq("id", variantId)
        .maybeSingle()
      if (!variant || variant.product_id !== productId) {
        return NextResponse.json({ error: "Variant not found" }, { status: 404 })
      }
      variantName = variant.name || null
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
