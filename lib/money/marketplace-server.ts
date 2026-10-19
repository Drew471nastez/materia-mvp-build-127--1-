import "server-only"

/**
 * The marketplace's dollar prices on the server (lib/money/marketplace):
 * the switch, the rates a quote may use, and the prices a list of cards
 * draws. Read by Explore, its categories, a creator page, a product page and
 * the checkout, so a card, the page behind it and the charge say the same.
 */
import { fxFresh, type FxRates } from "@/lib/markets/money"
import { cachedRates, latestRates } from "@/lib/markets/fx-server"
import { storeCurrencies } from "@/lib/store/store-currencies"
import { createAdminClient } from "@/lib/supabase/admin"
import { MARKETPLACE_CURRENCY, gateOpenFor, marketplaceAmounts, parseMarketplaceGate, resolveMarketplaceGate, toUsdMinor, type MarketplaceGate, type MarketplaceSource } from "./marketplace"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/**
 * The switch, from the server's environment only (never NEXT_PUBLIC_): off
 * unless set, and "all" stays off until the launch row exists
 * (lib/money/marketplace resolveMarketplaceGate).
 */
export async function marketplaceGate(): Promise<MarketplaceGate & { lockedAll?: true }> {
  const raw = process.env.MARKETPLACE_USD
  const gate = parseMarketplaceGate(raw)
  /* The database is asked only for "all"; off and a list of stores never need it. */
  if (gate.mode !== "all") return gate
  return resolveMarketplaceGate(createAdminClient(), raw)
}

export async function marketplaceUsdFor(creatorId: string | null | undefined): Promise<boolean> {
  return gateOpenFor(await marketplaceGate(), creatorId)
}

/**
 * The rates a dollar price may use. With `asOf` (the day the buyer's page
 * was priced at), that day's, while it is still fresh: the quote the buyer
 * saw is the quote they pay. Otherwise, or when that day is no longer usable,
 * the newest fresh day. Null when no fresh rate exists: the purchase pauses.
 */
export async function marketplaceRates(db: Db, asOf?: unknown, opts: { cached?: boolean } = {}): Promise<FxRates | null> {
  if (typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    try {
      const { data, error } = await db.from("fx_rates").select("as_of, rates").eq("as_of", asOf).maybeSingle()
      if (!error && data) {
        const fx = { asOf: String(data.as_of).slice(0, 10), rates: (data.rates ?? {}) as Record<string, number> }
        if (fxFresh(fx)) return fx
      }
    } catch {
      /* the newest instead */
    }
  }
  let latest = opts.cached ? await cachedRates() : await latestRates(db)
  /* The hourly cache can hold an old answer (or none) after a fresh rate
     arrived: ask the table itself before pausing dollar prices. */
  if (opts.cached && !(latest && fxFresh(latest))) latest = await latestRates()
  return latest && fxFresh(latest) ? latest : null
}

export interface MarketplaceRowPatch {
  currency: string | null
  price_cents?: number
  pwyw_min_price_cents?: number | null
  compare_at_cents?: number | null
  /** The day of the rate a converted price used, sent back by the checkout to be charged at the same one. */
  fx_as_of?: string | null
  /** No fresh rate for a store the marketplace prices in dollars: shown in its own currency, not sold until rates return. */
  marketplace_paused?: true
}

/**
 * For a list of cards from many stores: each row's price as the marketplace
 * shows it. Switch off for its store: its own currency, untouched. On: in
 * dollars, converted (or the creator's approved dollar price). On with no
 * fresh rate: its own currency, marked paused, never a guessed dollar figure.
 */
export async function marketplacePricer(db: Db, creatorIds: (string | null | undefined)[], productIds: (string | null | undefined)[] = []): Promise<(row: MarketplaceSource & { id?: string | null; creator_id?: string | null }) => MarketplaceRowPatch> {
  const gate = await marketplaceGate()
  const currencies = await storeCurrencies(db, creatorIds)
  const anyOpen = gate.mode !== "off" && creatorIds.some((id) => gateOpenFor(gate, id))
  const [fx, fixed] = anyOpen ? await Promise.all([marketplaceRates(db, undefined, { cached: true }), approvedDollarPrices(db, productIds)]) : [null, new Map<string, MarketplaceSource>()]
  return (row) => {
    const store = (row.creator_id && currencies.get(row.creator_id)) || null
    const own: MarketplaceRowPatch = { currency: store }
    if (!store || !gateOpenFor(gate, row.creator_id)) return own
    /* A list that did not read the creator's own dollar price gets it here, so a card and its product page agree. */
    const withFixed = row.marketplace_usd_approved_at === undefined && row.id && fixed.has(row.id) ? { ...row, ...fixed.get(row.id) } : row
    const m = marketplaceAmounts(withFixed, store, fx)
    if (m.ok === false) return { ...own, marketplace_paused: true }
    return {
      currency: m.currency,
      price_cents: m.price_cents,
      pwyw_min_price_cents: m.pwyw_min_price_cents,
      compare_at_cents: m.compare_at_cents,
      fx_as_of: m.fxAsOf,
    }
  }
}

/**
 * The creators' own approved dollar prices for these products, read apart
 * from a list's own query (which names its columns). Before SQL part 244 the
 * columns are not there: no fixed prices, every card converted.
 */
async function approvedDollarPrices(db: Db, productIds: (string | null | undefined)[]): Promise<Map<string, MarketplaceSource>> {
  const ids = [...new Set(productIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
  const out = new Map<string, MarketplaceSource>()
  if (!ids.length) return out
  try {
    for (let i = 0; i < ids.length; i += 300) {
      const { data, error } = await db.from("products").select("id, marketplace_usd_cents, marketplace_usd_approved_at").in("id", ids.slice(i, i + 300)).not("marketplace_usd_approved_at", "is", null)
      if (error) return out
      for (const r of (data ?? []) as Array<{ id: string; marketplace_usd_cents: number | null; marketplace_usd_approved_at: string | null }>) out.set(r.id, { marketplace_usd_cents: r.marketplace_usd_cents, marketplace_usd_approved_at: r.marketplace_usd_approved_at })
    }
  } catch {
    /* converted, as before */
  }
  return out
}

/** Rows with their creator's approved dollar price beside them, for a list that did not read it (a product page's More from). */
export async function withApprovedDollarPrices<R extends { id?: string | null }>(db: Db, rows: R[]): Promise<R[]> {
  const fixed = await approvedDollarPrices(db, rows.map((r) => r.id))
  return fixed.size ? rows.map((r) => (r.id && fixed.has(r.id) ? { ...r, ...fixed.get(r.id) } : r)) : rows
}

/** The money fields of a product or option row the marketplace shows in dollars. */
type PricedRow = MarketplaceSource & {
  pwyw_suggested_price_cents?: number | null
  compare_at_price_cents?: number | null
}

export interface ProductPageQuote {
  /** The currency the page's prices are in after the quote: dollars, or the product's own. */
  currency: string
  /** The marketplace is in dollars for this store and the rate was fresh: the page is in dollars. */
  marketplace: boolean
  /** The switch is on for this store but no fresh rate exists: the page shows its own currency and buying waits. */
  paused: boolean
  /** The rate day the dollar prices used, sent with the Buy link (?fx=). */
  fxAsOf: string | null
  /** A row (the product, an option) with its money in the page's currency. */
  convert<R extends PricedRow>(row: R): R
}

/**
 * A product page on Storelib (the marketplace): the product and each option
 * in dollars while the switch is on for its store, every amount converted at
 * one rate day, so the page, its Buy link and the checkout agree. A row that
 * cannot be converted makes the whole page wait (paused) rather than mix
 * dollar and lei prices on one page.
 */
export async function productPageQuote(product: (PricedRow & { creator_id?: string | null }) | null | undefined, listCurrency: string, rows: PricedRow[] = []): Promise<ProductPageQuote> {
  const same: ProductPageQuote = { currency: listCurrency, marketplace: false, paused: false, fxAsOf: null, convert: (r) => r }
  if (!product || listCurrency.toUpperCase() === MARKETPLACE_CURRENCY || !(await marketplaceUsdFor(product.creator_id))) return same
  const fx = await marketplaceRates(null, undefined, { cached: true })
  const from = listCurrency.toUpperCase()
  const convert = <R extends PricedRow>(row: R): R | null => {
    const m = marketplaceAmounts({ ...row, type: row.type ?? product.type }, from, fx)
    if (m.ok === false) return null
    const out: R = { ...row, price_cents: m.price_cents, pwyw_min_price_cents: m.pwyw_min_price_cents }
    if ("compare_at_cents" in row) out.compare_at_cents = m.compare_at_cents
    for (const key of ["pwyw_suggested_price_cents", "compare_at_price_cents"] as const) {
      const v = row[key]
      if (typeof v !== "number") continue
      const c = toUsdMinor(v, from, fx)
      if (c === null) return null
      ;(out as PricedRow)[key] = c
    }
    return out
  }
  if (!fx || [product, ...rows].some((r) => convert(r) === null)) return { ...same, paused: true }
  return { currency: MARKETPLACE_CURRENCY, marketplace: true, paused: false, fxAsOf: fx.asOf, convert: (r) => convert(r) ?? r }
}
