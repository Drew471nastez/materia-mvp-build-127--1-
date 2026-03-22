import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET - Fetch creator's products for the website builder editor
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("id")
    const limit = parseInt(searchParams.get("limit") ?? "100", 10)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: creator } = await supabase
      .from("creators")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!creator) {
      return NextResponse.json({ products: [] })
    }

    // Single product with full details (for product page preview)
    if (productId) {
      const { data: product, error } = await supabase
        .from("products")
        .select("id, title, slug, description, price_cents, compare_at_cents, thumbnail_url, gallery_urls, whats_included, status, type")
        .eq("id", productId)
        .eq("creator_id", creator.id)
        .single()

      if (error || !product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 })
      }

      // Fetch digital assets for file info
      const { data: assets } = await supabase
        .from("digital_assets")
        .select("id, file_name, file_size, mime_type")
        .eq("product_id", productId)
        .eq("upload_status", "completed")
        .order("created_at", { ascending: true })

      return NextResponse.json({
        product: { ...product, files: assets ?? [] },
      })
    }

    // List all published products
    const { data: products, error } = await supabase
      .from("products")
      .select("id, title, slug, thumbnail_url, price_cents, compare_at_cents, description, whats_included, gallery_urls, status, type")
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    }

    return NextResponse.json({ products: products ?? [] })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
