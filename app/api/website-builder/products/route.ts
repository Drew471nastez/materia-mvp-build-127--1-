import { rowsWithOriginalCovers } from "@/lib/products/cover"
import { NextResponse } from "next/server"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { productSectionData, type ProductSectionRow } from "@/lib/products/product-section-data"
import { catalogCards, shopProducts } from "@/lib/website-builder/shop-products"
import { pageFactsFor } from "@/lib/storelib-theme/compat/product-facts-server"
import { readLadder } from "@/lib/supabase/missing-memory"

// GET - Fetch creator's products for the website builder editor
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const productId = searchParams.get("id")
    const limit = parseInt(searchParams.get("limit") ?? "100", 10)

    /* The owner, or a team member with Website working in the store (lib/team/website): the store's products, by the store's id. */
    const site = await websiteCaller({ read: true })
    if (site.error !== null) {
      if (site.status === 404) return NextResponse.json({ products: [] })
      return NextResponse.json({ error: site.error }, { status: site.status })
    }
    const supabase = site.supabase
    const creator = site.creator

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
        const admin = createAdminClient()
        /* And what the page offers with it (product.metafields.storelib.offers), the same read as the live product page's (lib/offers/offers-public.ts), never failing the facts. */
        const [facts, offers] = await Promise.all([
          pageFactsFor(admin, creator.id, productId, true, { published: false }),
          import("@/lib/offers/offers-public").then((m) => m.productOffers(admin, productId)).catch(() => null),
        ])
        return NextResponse.json({ facts, offers }, { headers: { "Cache-Control": "private, no-store" } })
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
      const [shopRead, catalogRead] = await Promise.all([shopProducts(admin, creator.id), catalogCards(admin, creator.id)])
      /* Each with its own description (round 12), so a section featuring a product shows that product's words from Products, in the canvas as on the website. */
      const { productDescriptions, withDescriptions } = await import("@/lib/website-builder/product-descriptions")
      const described = await productDescriptions(admin, creator.id, { ids: [...shopRead, ...catalogRead].map((c) => c.id) })
      /*
        Each with its size chart, read for this creator only
        (lib/size-charts/storefront.ts sizeChartsForStore): an imported
        theme's featured product and cards in the canvas carry the same
        product.metafields.storelib.size_chart as the live site's.
      */
      const { sizeChartsForStore } = await import("@/lib/size-charts/storefront")
      const charts = await sizeChartsForStore(admin, creator.id)
      const charted = <T extends { id: string; settings: Record<string, unknown> }>(cards: T[]): T[] => cards.map((c) => (charts[c.id] && c.settings.size_chart === undefined ? { ...c, settings: { ...c.settings, size_chart: charts[c.id] } } : c))
      /* And each with its own questions (round 13), so a Featured product in an imported theme shows them in the canvas as on the website. */
      const { productExtras, withExtras } = await import("@/lib/website-builder/product-extras")
      const extras = await productExtras(admin, creator.id, [...shopRead, ...catalogRead])
      const shop = charted(withExtras(withDescriptions(shopRead, described), extras))
      const catalog = charted(withExtras(withDescriptions(catalogRead, described), extras))
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
    /* Without the questions only when the column is missing, remembered ten minutes (lib/supabase/missing-memory.ts); any other error is a 500 as before. */
    const { data: products, error } = await readLadder("products:builder-list-faqs", [() => list(`${LIST_COLUMNS}, faqs`), () => list(LIST_COLUMNS)])

    if (error) {
      return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 })
    }

    /* Round AL: the builder draws each cover as uploaded, as the live website does (lib/products/cover.ts); Explore keeps its 16:9 copy. */
    const rows = (products ?? []) as unknown as { id: string; thumbnail_url?: string | null; gallery_urls?: unknown }[]
    return NextResponse.json({ products: await rowsWithOriginalCovers(supabase, rows) })
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
