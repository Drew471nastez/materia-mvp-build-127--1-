import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { productSectionData, type ProductSectionRow } from "@/lib/products/product-section-data"
import { catalogCards, shopProducts } from "@/lib/website-builder/shop-products"
import { pageFactsFor } from "@/lib/storelib-theme/compat/product-facts-server"

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

      /* `facts=1`: what an imported theme's product page is drawn with, read as the live site reads it (lib/storelib-theme/compat/product-facts-server.ts), for the builder's canvas. */
      if (searchParams.get("facts") === "1") {
        const facts = await pageFactsFor(createAdminClient(), creator.id, productId, true, { published: false })
        return NextResponse.json({ facts }, { headers: { "Cache-Control": "private, no-store" } })
      }

      /* What the product section draws, read the way the live product page
         reads it (lib/products/product-section-data.ts), so the canvas shows
         the variants, the pictures and the stock a visitor will see. Stock
         and options sit in tables only the server reads, and this product
         has just been shown to be this creator's. */
      const data = await productSectionData(createAdminClient(), product as ProductSectionRow, { files: true })
      return NextResponse.json({ product: { ...data, status: (product as { status?: string }).status ?? null } })
    }

    /*
      THE CARDS THE LIVE PAGE DRAWS, for the canvas. `shop` is the list a
      section reads as `products` (lib/website-builder/shop-products.ts,
      shopProducts: the newest published, without a product that sells a
      community tier), `catalog` every published product a picker, a product
      list or a collection may name. Made by the same functions the published
      site calls, so the builder cannot draw a card the site would not: the
      same pictures, kind, options and buy link. Read with the server's
      client once this creator is known, as the single product above is,
      because a product's options sit in tables only the server reads.
    */
    if (searchParams.get("cards") === "1") {
      const admin = createAdminClient() as never
      const [shop, catalog] = await Promise.all([shopProducts(admin, creator.id), catalogCards(admin, creator.id)])
      return NextResponse.json({ shop, catalog }, { headers: { "Cache-Control": "private, no-store" } })
    }

    // List all published products, with their own questions for the canvas's `product.faqs` (lib/products/product-faqs.ts); without them on a database that lacks the column.
    const list = (cols: string) => supabase
      .from("products")
      .select(cols)
      .eq("creator_id", creator.id)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit)
    const LIST_COLUMNS = "id, title, slug, thumbnail_url, price_cents, compare_at_cents, description, whats_included, gallery_urls, status, type"
    let { data: products, error } = await list(`${LIST_COLUMNS}, faqs`)
    if (error) ({ data: products, error } = await list(LIST_COLUMNS))

    if (error) {
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    }

    return NextResponse.json({ products: products ?? [] })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
