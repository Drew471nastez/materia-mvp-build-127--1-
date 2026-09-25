/**
 * ===========================================================================
 *  THE CREATOR'S ACTUAL PRODUCTS, FOR A SECTION TO DRAW
 * ===========================================================================
 * A "Product Grid" on a Storelib site was, until this existed, a row of
 * hand-typed text. The block held a title somebody typed, a price somebody
 * typed, a photo somebody uploaded again, and a product picker for the link
 * and nothing else. So a price changed in the shop still read the old number
 * on the website, a product added to the catalogue never appeared, and one
 * that sold out kept selling.
 *
 * This is where the real ones come from.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  BLOCK-SHAPED ON PURPOSE
 * ═══════════════════════════════════════════════════════════════════════════
 * A product comes back as `{ id, type, settings }` — the same shape a block
 * has — so a template loops over `products` with exactly the body it already
 * uses for `blocks`, and a section that offers both is two loops rather than
 * two card designs. The language has no `assign` and no partials, and this
 * is the cheapest honest way round that without changing the language.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  WHAT IS IN IT
 * ═══════════════════════════════════════════════════════════════════════════
 * Published products only, belonging to one creator, and only the fields a
 * card draws. Not the description, not the cost, not who bought it. A
 * template can print anything it is given, and a section somebody wrote
 * themselves is given exactly this.
 *
 * Money is formatted here rather than in a template. `price_cents` is an
 * integer of USD cents, the language has no arithmetic, and a template that
 * printed the raw column would say "4800".
 */
import type { SectionInstanceData } from "@/lib/storelib-theme/types"

/** One product, in the shape a block has. */
export type ProductBlock = NonNullable<SectionInstanceData["blocks"]>[string] & { id?: string }

export interface ProductCard {
  id: string
  type: "product"
  settings: {
    title: string
    /** Formatted, e.g. "$48.00". Templates do not do money. */
    price: string
    /** "" when there is nothing to compare against. */
    compare_price: string
    image: string
    /** Where the card goes. */
    url: string
    /** "Sold out" or "", from the product's own state, never free text. */
    tag: string
  }
}

/** `price_cents` is USD cents. One place, so every section agrees. */
export function formatPrice(cents: number | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return ""
  return `$${(cents / 100).toFixed(2)}`
}

/** Never more than this, whatever a section asks for. */
export const MAX_SHOP_PRODUCTS = 24

interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  price_cents: number | null
  compare_at_cents: number | null
  thumbnail_url: string | null
  status: string | null
  inventory_count?: number | null
}

/**
 * Whether a product has sold out: its stock is counted and none is left. A
 * product whose stock is not counted (no such column, or null) never sells
 * out. One rule for the card's tag and for the availability a search result
 * is told, on the website's product page and storelib.com's alike.
 */
export function soldOut(row: { inventory_count?: number | null }): boolean {
  return typeof row.inventory_count === "number" && row.inventory_count <= 0
}

/** A row to the card a section draws. Exported so a test can drive it. */
export function toCard(row: ProductRow): ProductCard {
  const price = formatPrice(row.price_cents)
  const was = formatPrice(row.compare_at_cents)
  return {
    id: row.id,
    type: "product",
    settings: {
      title: row.title ?? "",
      price,
      // Only when it is actually more than the price. A "was" that is lower
      // than the "now" is a mistake somewhere, and printing it is worse than
      // leaving it out.
      compare_price: was && (row.compare_at_cents ?? 0) > (row.price_cents ?? 0) ? was : "",
      image: row.thumbnail_url ?? "",
      url: row.slug ? `/products/${row.slug}` : "",
      tag: soldOut(row) ? "Sold out" : "",
    },
  }
}

/**
 * Two `eq`s, and the type says so. The first version of this filtered on
 * `status` alone, which would have put every creator's catalogue on every
 * creator's website. A shape that only allows one filter is a shape that
 * cannot express the query this has to make.
 */
interface Filter {
  eq: (col: string, val: string) => Filter
  order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => PromiseLike<{ data: unknown[] | null }> }
}
type Db = { from: (table: string) => { select: (cols: string) => Filter } }

/**
 * ONE CREATOR'S published products, newest first.
 *
 * `creator_id` is not optional and not a convenience: it is the whole of
 * what keeps one person's catalogue off another person's site. An empty
 * creator id returns nothing rather than everything, because a filter that
 * matches nobody is the safe reading of a missing filter.
 *
 * Never throws. A section that cannot reach the catalogue draws no products,
 * which is the same rule as a section whose file will not compile.
 */
export async function shopProducts(db: Db, creatorId: string, limit = MAX_SHOP_PRODUCTS): Promise<ProductCard[]> {
  if (!creatorId) return []
  const n = Math.max(1, Math.min(MAX_SHOP_PRODUCTS, Math.floor(limit) || MAX_SHOP_PRODUCTS))
  try {
    const { data } = await db
      .from("products")
      .select("id, title, slug, price_cents, compare_at_cents, thumbnail_url, status")
      .eq("creator_id", creatorId)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(n)
    return (data ?? []).map((r) => toCard(r as ProductRow))
  } catch {
    return []
  }
}
