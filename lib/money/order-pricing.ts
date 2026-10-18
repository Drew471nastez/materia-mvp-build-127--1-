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

const SOURCES = new Set(["native", "fixed", "converted"])

/**
 * The one payment metadata key it travels in, and its shape:
 * "marketplace|ron|4900|converted|2026-10-16|0.21730382". Only a
 * marketplace price is written (a store's own price is the order itself).
 */
export const PRICING_METADATA_KEY = "pricing"

export interface PricingRecord {
  context: "merchant" | "marketplace"
  listCurrency: string
  listAmountCents: number
  source: "native" | "fixed" | "converted"
  fxAsOf: string | null
  fxRate: number | null
}

export function encodePricing(p: PricingRecord): string {
  return [p.context, p.listCurrency.toLowerCase(), String(p.listAmountCents), p.source, p.fxAsOf ?? "", p.fxRate === null ? "" : String(p.fxRate)].join("|").slice(0, 480)
}

/** The order's columns from the payment's metadata, each checked; null when the checkout wrote none. */
export function orderPricingFrom(md: Record<string, string | null | undefined> | null | undefined): Record<string, string | number | null> | null {
  const raw = md?.[PRICING_METADATA_KEY]
  if (typeof raw !== "string" || !raw) return null
  const [context, currency, amount, source, asOf, rate] = raw.split("|")
  if (context !== "marketplace" && context !== "merchant") return null
  const cents = Number(amount)
  const day = /^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "") ? asOf : null
  const r = Number(rate)
  return {
    pricing_context: context,
    list_currency: /^[a-z]{3}$/i.test(currency ?? "") ? currency.toLowerCase() : null,
    list_amount_cents: Number.isInteger(cents) && cents >= 0 ? cents : null,
    price_source: SOURCES.has(source ?? "") ? source : null,
    fx_as_of: day,
    fx_rate: day && rate && Number.isFinite(r) && r > 0 ? r : null,
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
