import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { productSectionData, type ProductSectionRow } from "@/lib/products/product-section-data"

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
      /* The creator's own product, read as THEM: the creator filter and their
         row level security both say whose it is. Only then is the rest read. */
      const { data: product, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", productId)
        .eq("creator_id", creator.id)
        .single()

      if (error || !product) {
        return NextResponse.json({ error: "Product not found" }, { status: 404 })
      }

      /* What the product section draws, read the way the live product page
         reads it (lib/products/product-section-data.ts), so the canvas shows
         the variants, the pictures and the stock a visitor will see. Stock
         and options sit in tables only the server reads, and this product
         has just been shown to be this creator's. */
      const data = await productSectionData(createAdminClient(), product as ProductSectionRow, { files: true })
      return NextResponse.json({ product: { ...data, status: (product as { status?: string }).status ?? null } })
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
