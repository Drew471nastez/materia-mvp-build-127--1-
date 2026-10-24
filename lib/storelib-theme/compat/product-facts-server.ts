/**
 * ===========================================================================
 *  WHAT IS TRUE NOW ABOUT A PRODUCT PAGE'S VARIANTS, READ ON THE SERVER
 * ===========================================================================
 * For an imported theme's product page (./product-facts.ts merges it into
 * the card): the live site (lib/website-builder/compat-site.ts) and the
 * builder's canvas (app/api/website-builder/products ?facts=1) read the same
 * thing here, so the canvas shows what a visitor will.
 */
import "server-only"
import { productSectionData, type ProductSectionRow } from "@/lib/products/product-section-data"
import { readOrderLimit } from "@/lib/physical/order-limit"
import type { PageFacts } from "./product-facts"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * What is true now about each variant of one published product, for its
 * page (lib/storelib-theme/compat/product-facts.ts): read by
 * productSectionData, the same read Storelib's own product section draws
 * from, with the SKU and Continue selling beside it. Null when it cannot be
 * read: the page draws from the shop's list copy, and the cart and checkout
 * count stock again before anything is sold.
 */
export async function pageFactsFor(admin: Db, creatorId: string, productId: string, showLeft: boolean, opts: { published?: boolean } = {}): Promise<PageFacts | null> {
  try {
    let row: Record<string, unknown> | null = null
    for (const cols of [
      "id, creator_id, type, price_cents, inventory_count, track_inventory, continue_selling, low_stock_threshold, max_per_order",
      "id, creator_id, type, price_cents, inventory_count, track_inventory, continue_selling, low_stock_threshold",
      "id, creator_id, type, price_cents, inventory_count",
    ]) {
      let q = admin.from("products").select(cols).eq("id", productId).eq("creator_id", creatorId)
      if (opts.published !== false) q = q.eq("status", "published")
      const { data, error } = await q.maybeSingle()
      if (error) continue
      row = (data as Record<string, unknown> | null) ?? null
      break
    }
    if (!row) return null
    const [data, own] = await Promise.all([
      productSectionData(admin, row as unknown as ProductSectionRow),
      Promise.resolve(admin.from("product_variants").select("id, sku, inventory_policy").eq("product_id", productId)).then((r: { data?: unknown; error?: unknown }) => (r.error ? [] : ((r.data ?? []) as { id: string; sku?: string | null; inventory_policy?: string | null }[])), () => [] as { id: string; sku?: string | null; inventory_policy?: string | null }[]),
    ])
    const byId = new Map(own.map((v) => [v.id, v]))
    const pickup = data.delivery?.pickup ?? {}
    return {
      variants: (data.variants ?? []).map((v) => ({
        id: v.id,
        options: v.options,
        soldOut: !v.available,
        left: v.left,
        maxQuantity: v.max_quantity,
        keepsSelling: byId.get(v.id)?.inventory_policy === "continue" || row!.continue_selling === true,
        sku: byId.get(v.id)?.sku ?? null,
        pickup: (pickup as Record<string, unknown[]>)[v.id] ?? [],
      })),
      perOrder: readOrderLimit(row.max_per_order),
      lowAt: data.low_stock_at ?? null,
      showLeft,
      productLeft: data.inventory_left ?? null,
      sizeChart: data.size_chart ?? null,
    }
  } catch {
    return null
  }
}

