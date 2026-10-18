/**
 * HOW AN ORDER'S PRICE WAS MADE, written beside the order (lib/money/marketplace).
 *
 * The checkout puts it in the payment's metadata (api/checkout/stripe-session):
 * which kind of place sold it (the store's own, or the marketplace), the
 * store's own price and currency, and for a marketplace dollar price the
 * source (converted, or the creator's approved dollar price) and the ECB rate
 * day and rate behind it. The order keeps its own `currency` and amounts as
 * charged; this is the record of where they came from, for the creator, the
 * reconciliation report and any refund question later.
 *
 * Like `orders.source`, the columns arrive with their own SQL part, so this
 * is a separate update that may fail without failing the order: an order
 * without the note is an order, one that failed to save is not.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

const CONTEXTS = new Set(["merchant", "marketplace"])
const SOURCES = new Set(["native", "fixed", "converted"])

/** The order's columns from the payment's metadata, each checked; null when the checkout wrote none. */
export function orderPricingFrom(md: Record<string, string | null | undefined> | null | undefined): Record<string, string | number | null> | null {
  if (!md) return null
  const context = md.pricing_context ?? ""
  if (!CONTEXTS.has(context)) return null
  const currency = /^[A-Z]{3}$/i.test(md.list_currency ?? "") ? String(md.list_currency).toLowerCase() : null
  const amount = Number(md.list_amount_cents)
  const source = SOURCES.has(md.price_source ?? "") ? String(md.price_source) : null
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(md.fx_as_of ?? "") ? String(md.fx_as_of) : null
  const rate = Number(md.fx_rate)
  return {
    pricing_context: context,
    list_currency: currency,
    list_amount_cents: Number.isInteger(amount) && amount >= 0 ? amount : null,
    price_source: source,
    fx_as_of: asOf,
    fx_rate: asOf && Number.isFinite(rate) && rate > 0 ? rate : null,
  }
}

/** Best effort and never thrown. A column the database does not have yet is expected and not logged. */
export async function tagOrderPricing(db: Db, orderId: string | null | undefined, md: Record<string, string | null | undefined> | null | undefined): Promise<void> {
  const row = orderId ? orderPricingFrom(md) : null
  if (!row) return
  try {
    const { error } = await db.from("orders").update(row).eq("id", orderId)
    if (error && !/pricing_context|list_currency|list_amount_cents|price_source|fx_as_of|fx_rate|column/i.test(String(error.message))) {
      console.warn("[orders] could not record how the price was made:", error.message)
    }
  } catch (error) {
    console.warn("[orders] could not record how the price was made:", (error as Error)?.message)
  }
}
