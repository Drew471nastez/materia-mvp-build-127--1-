import "server-only"

/**
 * ===========================================================================
 *  WHAT A LINE IN THE CART COULD BE INSTEAD: ITS PRODUCT'S OTHER OPTIONS
 * ===========================================================================
 * A buyer who chose the wrong size, edition or licence changes it in the
 * checkout, never by going back to the product. For every product in the
 * order with more than one option on sale, the quote carries:
 *
 *   options    what a thing that ships is chosen by (Size, Colour), with
 *              their values in the editor's order; empty for a download,
 *              whose options are a plain list of names
 *   variants   each live option: its id, name, values, price, and whether
 *              it can be bought now (sold out by the same rule as the
 *              product page, lib/physical/storefront-stock)
 *
 * Only for showing the choice. Changing it changes the cart's variant id,
 * and the quote prices the order again from the database: stock, the per
 * order limit, offers, the code, shipping and tax.
 *
 * Left out: a product with one option (nothing to change), and a pay what
 * you want option as a target (it needs an amount the buyer never named).
 */

import { liveVariant, physicalStock, type StockProduct, type StockVariant } from "@/lib/physical/storefront-stock"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

import type { ChoicesByProduct } from "./variant-choices"
export type { ChoicesByProduct, VariantChoice, VariantChoices } from "./variant-choices"

/** Never throws: a read that fails is a checkout with nothing to change, as before. */
export async function variantChoices(db: Db, productIds: string[]): Promise<ChoicesByProduct> {
  const ids = [...new Set(productIds.filter((id) => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 50)
  if (!ids.length) return {}
  try {
    const [{ data: products }, { data: variants }, { data: options }] = await Promise.all([
      db.from("products").select("id, creator_id, type, status, track_inventory, continue_selling, low_stock_threshold").in("id", ids).eq("status", "published"),
      db.from("product_variants").select("id, product_id, name, price_cents, option1, option2, option3, position, active, track_inventory, inventory_policy, pay_what_you_want").in("product_id", ids),
      db.from("product_options").select("product_id, position, name, values").in("product_id", ids),
    ])
    const out: ChoicesByProduct = {}
    await Promise.all(
      ((products ?? []) as (StockProduct & { id: string; type: string })[]).map(async (p) => {
        const own = ((variants ?? []) as Record<string, any>[]) // eslint-disable-line @typescript-eslint/no-explicit-any
          .filter((v) => v.product_id === p.id && liveVariant(v as StockVariant) && v.pay_what_you_want !== true)
          .sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
        if (own.length < 2) return
        const physical = p.type === "physical"
        const opts = physical
          ? ((options ?? []) as { product_id: string; position: number; name: string; values: unknown }[])
              .filter((o) => o.product_id === p.id && typeof o.name === "string" && Array.isArray(o.values))
              .sort((a, b) => a.position - b.position)
              .slice(0, 3)
              .map((o) => ({ name: o.name, values: (o.values as unknown[]).filter((x): x is string => typeof x === "string") }))
          : []
        const stock = physical ? await physicalStock(db, p, own as StockVariant[]) : null
        out[p.id] = {
          options: opts,
          variants: own.map((v) => ({
            id: String(v.id),
            name: String(v.name ?? ""),
            values: opts.map((_, i) => String(v[`option${i + 1}`] ?? "")),
            priceCents: Math.max(0, Math.round(Number(v.price_cents ?? 0))),
            available: stock ? !(stock.get(String(v.id))?.soldOut ?? false) : true,
          })),
        }
      }),
    )
    return out
  } catch {
    return {}
  }
}
