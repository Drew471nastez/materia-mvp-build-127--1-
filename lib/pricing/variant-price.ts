/** Public price facts. A known variant price (including zero) always wins
 * over the base. Unknown reads never masquerade as an empty variant list. */
export interface PriceVariant {
  id?: string
  product_id?: string
  name?: string | null
  price_cents?: number | null
  compare_at_price_cents?: number | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  active?: boolean | null
  available?: boolean
  sold_out?: boolean
}
export interface VariantPriceFacts {
  variant_count?: number
  variant_min_price_cents?: number | null
  variant_max_price_cents?: number | null
  single_variant_id?: string | null
  variant_prices_known?: boolean
}
const cents = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : 0
export function variantPriceFacts(
  variants: readonly PriceVariant[],
): VariantPriceFacts {
  const live = variants.filter(
    (v) =>
      v.active !== false &&
      v.available !== false &&
      v.sold_out !== true &&
      !/^Archived /.test(v.name ?? ""),
  )
  const prices = live.map((v) =>
    cents(
      v.pay_what_you_want
        ? (v.pwyw_min_price_cents ?? v.price_cents)
        : v.price_cents,
    ),
  )
  return {
    variant_count: live.length,
    variant_min_price_cents: prices.length ? Math.min(...prices) : null,
    variant_max_price_cents: prices.length ? Math.max(...prices) : null,
    single_variant_id: live.length === 1 ? (live[0].id ?? null) : null,
    variant_prices_known: true,
  }
}
export function withKnownVariantPrices<
  T extends {
    price_cents?: number | null
    compare_at_cents?: number | null
    pay_what_you_want?: boolean | null
    pwyw_min_price_cents?: number | null
  },
>(product: T, variants: readonly PriceVariant[]): T & VariantPriceFacts {
  const facts = variantPriceFacts(variants)
  if (!variants.length) return { ...product, ...facts }
  if (!facts.variant_count) return { ...product, ...facts, sold_out: true }
  const live = variants.filter(
    (v) =>
      v.active !== false &&
      v.available !== false &&
      v.sold_out !== true &&
      !/^Archived /.test(v.name ?? ""),
  )
  const cheapest = live.find(
    (v) =>
      cents(
        v.pay_what_you_want
          ? (v.pwyw_min_price_cents ?? v.price_cents)
          : v.price_cents,
      ) === facts.variant_min_price_cents,
  )!
  return {
    ...product,
    ...facts,
    price_cents: facts.variant_min_price_cents,
    // A product-level dollar override cannot override an option’s own price.
    marketplace_usd_cents: null,
    marketplace_usd_approved_at: null,
    compare_at_cents: cheapest.compare_at_price_cents ?? null,
    pay_what_you_want: live.every((v) => v.pay_what_you_want === true),
    pwyw_min_price_cents: facts.variant_min_price_cents,
  }
}
/** Batches a catalogue's variants in one read. No N+1 price requests. */
export async function withVariantPrices<
  T extends { id: string; price_cents?: number | null },
>(
  database: unknown,
  products: readonly T[],
): Promise<(T & VariantPriceFacts)[]> {
  const db = database as {
    from: (table: string) => any
    rpc?: (fn: string, args: Record<string, unknown>) => any
  }
  if (!products.length) return []
  const ids = [
    ...new Set(
      products.map((p) => p.id).filter((id) => /^[\da-f-]{36}$/i.test(id)),
    ),
  ].slice(0, 500)
  if (!ids.length) return [...products]
  const columns = [
    "id,product_id,name,price_cents,compare_at_price_cents,pay_what_you_want,pwyw_min_price_cents,active",
    "id,product_id,name,price_cents,compare_at_price_cents,pay_what_you_want,pwyw_min_price_cents",
    "id,product_id,name,price_cents",
  ]
  try {
    let result: any
    if (typeof db.rpc === "function") {
      const rpc = await db.rpc("variant_catalog_prices", { p_products: ids })
      if (!rpc.error && Array.isArray(rpc.data)) result = rpc
    }
    for (const selected of result ? [] : columns) {
      result = await db
        .from("product_variants")
        .select(selected)
        .in("product_id", ids)
      if (!result.error || !["42703", "PGRST204"].includes(result.error.code))
        break
    }
    if (!result || result.error || !Array.isArray(result.data))
      return [...products]
    const byId = new Map<string, PriceVariant[]>()
    for (const row of result.data as PriceVariant[]) {
      if (!row.product_id) continue
      const list = byId.get(row.product_id) || []
      list.push(row)
      byId.set(row.product_id, list)
    }
    return products.map((p) => withKnownVariantPrices(p, byId.get(p.id) || []))
  } catch {
    return [...products]
  }
}
