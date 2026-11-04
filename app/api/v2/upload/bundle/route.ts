import { type NextRequest, NextResponse } from "next/server"
import { productCreator } from "@/lib/team/uploads"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ensureProductBundle, BUNDLE_THRESHOLD } from "@/lib/bundles"
import { rateLimit } from "@/lib/api/rate-limit"
import { authUnavailableResponse, routeUser } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * POST /api/v2/upload/bundle
 *
 * Generates (or returns cached) a ZIP bundle for a product or variant with ≥6 files.
 *
 * Body: { productId: string, variantId?: string }
 *
 * - If a valid cached bundle already exists (files_hash unchanged), returns it instantly.
 * - Otherwise generates a new ZIP, stores it, and updates product_bundles.
 *
 * Called automatically from the product save/publish flow when file_count ≥ 6.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const admin = createAdminClient()

    // Auth
    const who = await routeUser()
    if (who.kind === "unavailable") return authUnavailableResponse()
    const user = who.kind === "user" ? who.user : null
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get creator
    /* Round 41: the store a team member with Products works in, or the owner's own (lib/team/uploads productCreator). */
    const creator = (await productCreator(admin, user.id, "id")) as { id: string } | null

    if (!creator) {
      return NextResponse.json({ error: "Creator account required" }, { status: 403 })
    }

    const body = await request.json()
    const { productId, variantId } = body as { productId: string; variantId?: string }

    if (!productId) {
      return NextResponse.json({ error: "productId is required" }, { status: 400 })
    }

    // Verify product ownership
    const { data: product } = await admin
      .from("products")
      .select("id, title, slug, creator_id")
      .eq("id", productId)
      .eq("creator_id", creator.id)
      .single()

    if (!product) {
      return NextResponse.json({ error: "Product not found or access denied" }, { status: 403 })
    }

    // Building a ZIP reads every file into memory: not something to repeat on a loop.
    const limited = await rateLimit({
      bucket: "bundle",
      subjects: [`user:${user.id}`],
      windows: [{ limit: 10, seconds: 60 }, { limit: 60, seconds: 3600 }],
      message: "The download bundle is already being made. Try again in a minute.",
    })
    if (limited) return limited

    // Fetch variant name if needed. The variant must be one of THIS product's.
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
      variantName = variant.name ?? null
    }

    // Ensure bundle exists (uses cache when nothing changed)
    const result = await ensureProductBundle(
      admin,
      productId,
      product.title,
      creator.id,
      variantId ?? null,
      variantName,
    )

    if (!result) {
      // Count files to give a helpful error
      const countQuery = variantId
        ? admin
            .from("product_variant_files")
            .select("digital_asset_id", { count: "exact", head: true })
            .eq("variant_id", variantId)
        : admin
            .from("digital_assets")
            .select("id", { count: "exact", head: true })
            .eq("product_id", productId)
            .eq("upload_status", "completed")

      const { count } = await countQuery
      if ((count ?? 0) < BUNDLE_THRESHOLD) {
        return NextResponse.json(
          {
            error: `Only ${count ?? 0} file(s) — bundle is only created when there are ${BUNDLE_THRESHOLD} or more files.`,
          },
          { status: 400 },
        )
      }

      return NextResponse.json({ error: "Failed to generate ZIP bundle" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      fromCache: result.fromCache,
      zipPath: result.zipPath,
      zipFileName: result.zipFileName,
    })
  } catch (error) {
    console.error("[bundle] Error:", error)
    const message = error instanceof Error ? error.message : "Internal server error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
