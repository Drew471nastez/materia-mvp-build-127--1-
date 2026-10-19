/**
 * ===========================================================================
 *  THE MARKETPLACE IS IN US DOLLARS (OPTION A), BEHIND A SWITCH
 * ===========================================================================
 * Two kinds of place sell a creator's product:
 *
 *   merchant      their website, their OnePage, a checkout link they shared,
 *                 Storelib's admin test sale. The store's own currency, as
 *                 the creator priced it, always.
 *   marketplace   Explore, a creator page, a product page on Storelib, a
 *                 community. One currency for every buyer in every country:
 *                 US dollars.
 *
 * A product priced in lei is shown and charged on the marketplace at its
 * dollar equivalent, from the European Central Bank's rate of the day
 * (lib/markets/fx-server), or at a dollar price the creator set and approved
 * themselves (`marketplace_usd_cents`). The rules, all here so the cards,
 * the product page, the checkout page and the charge agree:
 *
 *   - rounded to the cent, never "psychologically" (no .99, no whole dollars)
 *   - a pay-what-you-want minimum rounds UP, so the creator never gets less
 *     than they asked for
 *   - a rate older than lib/markets/money FX_FRESH_DAYS is not used: the
 *     purchase is paused instead, and a dollar checkout is NEVER switched to
 *     lei behind the buyer's back
 *   - converted once: the amounts carry the day of the rate (`fxAsOf`), and
 *     the charge uses that same day's rate, not a newer one
 *   - membership and community plans are already dollars: never converted
 *
 * The switch (MARKETPLACE_USD, read on the server only) is off until Stripe's
 * dollar charging, settlement and cross-border payouts are confirmed for the
 * platform. Off, every place charges the store's currency, as before.
 *
 * Pure, so the server, the pages and the tests use the same arithmetic.
 */
import { fxFresh, minorUnits, type FxRates } from "@/lib/markets/money"
import { isPlanPriced, type ProductKindLike } from "./product-currency"

export const MARKETPLACE_CURRENCY = "USD" as const

export type PricingContext = "merchant" | "marketplace"

/** Where an order can begin (lib/orders/order-source SURFACES, plus a community), and which kind of place it is. */
const MARKETPLACE_SURFACES = new Set(["profile", "product", "explore", "community"])

/** The pricing a surface uses. Unknown or missing: the store's own currency, the safe answer. */
export function pricingContextOf(surface: unknown): PricingContext {
  return typeof surface === "string" && MARKETPLACE_SURFACES.has(surface) ? "marketplace" : "merchant"
}

/* ─── The switch ─────────────────────────────────────────────────────── */

export type MarketplaceGate = { mode: "off" } | { mode: "all" } | { mode: "some"; creatorIds: Set<string> }

/**
 * MARKETPLACE_USD: unset, "", "off", "0" or anything unreadable is off.
 * "all" (or "on") is every store. A comma list of creator ids is those
 * stores only, for a gradual rollout.
 */
export function parseMarketplaceGate(raw: string | null | undefined): MarketplaceGate {
  const v = (raw ?? "").trim()
  if (!v || /^(off|0|false|no)$/i.test(v)) return { mode: "off" }
  if (/^(all|on|1|true|yes)$/i.test(v)) return { mode: "all" }
  const ids = v.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s))
  return ids.length ? { mode: "some", creatorIds: new Set(ids.map((s) => s.toLowerCase())) } : { mode: "off" }
}

export function gateOpenFor(gate: MarketplaceGate, creatorId: string | null | undefined): boolean {
  if (gate.mode === "off") return false
  if (gate.mode === "all") return true
  return !!creatorId && gate.creatorIds.has(creatorId.toLowerCase())
}

/**
 * GLOBAL ACTIVATION IS LOCKED UNTIL THE DATABASE SAYS IT WAS VERIFIED.
 * "all" only takes effect once platform_migrations holds the row
 * `marketplace_usd_launch`. Only the launch SQL writes it
 * (supabase/sql/runbooks/storelib-currency-launch.sql), and it refuses to
 * unless parts 244 and 245 are in and a real marketplace dollar sale,
 * refunded, is on record. Until then "all" acts as off. A list of creator ids (the gradual
 * rollout, one store first) never needs the row. Read at most once a
 * minute per server; an unreadable answer counts as "not yet".
 */
export const MARKETPLACE_LAUNCH_KEY = "marketplace_usd_launch"
const LAUNCH_TTL_MS = 60_000
let launchCache: { ok: boolean; at: number } | null = null

/** Tests only: forget the cached answer. */
export function resetMarketplaceLaunchCache(): void {
  launchCache = null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function marketplaceLaunchConfirmed(db: any): Promise<boolean> {
  if (launchCache && Date.now() - launchCache.at < LAUNCH_TTL_MS) return launchCache.ok
  let ok = false
  try {
    const { data, error } = await db.from("platform_migrations").select("key").eq("key", MARKETPLACE_LAUNCH_KEY).maybeSingle()
    ok = !error && !!data
  } catch {
    ok = false
  }
  launchCache = { ok, at: Date.now() }
  return ok
}

/** The switch as it really applies: "all" without the launch row is off. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveMarketplaceGate(db: any, raw: string | null | undefined = process.env.MARKETPLACE_USD): Promise<MarketplaceGate & { lockedAll?: true }> {
  const gate = parseMarketplaceGate(raw)
  if (gate.mode !== "all") return gate
  return (await marketplaceLaunchConfirmed(db)) ? gate : { mode: "off", lockedAll: true }
}

/* ─── The arithmetic ─────────────────────────────────────────────────── */

function perEuro(fx: FxRates, currency: string): number | null {
  if (currency === "EUR") return 1
  const r = fx.rates[currency]
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null
}

/**
 * `amount` (minor units of `from`) in US cents at `fx`, rounded to the cent
 * ("nearest") or up ("up", for a minimum). Null when the rate is missing or
 * not fresh: the caller pauses rather than guess.
 */
export function toUsdMinor(amount: number, from: string, fx: FxRates | null | undefined, opts: { round?: "nearest" | "up"; now?: number } = {}): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null
  const cur = from.toUpperCase()
  if (cur === MARKETPLACE_CURRENCY) return Math.round(amount)
  if (amount === 0) return 0
  if (!fx || !fxFresh(fx, opts.now)) return null
  const a = perEuro(fx, cur)
  const b = perEuro(fx, MARKETPLACE_CURRENCY)
  if (a === null || b === null) return null
  const cents = (amount / 10 ** minorUnits(cur)) * (b / a) * 100
  /* A float a hair over a whole cent (12.000000001) is that cent, not the next. */
  const steady = Math.round(cents * 1e6) / 1e6
  return opts.round === "up" ? Math.ceil(steady) : Math.round(steady)
}

/** The fields of a product (or option) the marketplace price is made from. */
export interface MarketplaceSource extends ProductKindLike {
  price_cents?: number | null
  pwyw_min_price_cents?: number | null
  compare_at_cents?: number | null
  /** A dollar price the creator set for the marketplace, used only once they approved it. */
  marketplace_usd_cents?: number | null
  marketplace_usd_approved_at?: string | null
}

export type PriceSource = "native" | "fixed" | "converted"

export type MarketplaceAmounts =
  | {
      ok: true
      currency: typeof MARKETPLACE_CURRENCY
      price_cents: number
      pwyw_min_price_cents: number | null
      compare_at_cents: number | null
      source: PriceSource
      /** The day of the rate used, or null when nothing was converted. */
      fxAsOf: string | null
    }
  | { ok: false; reason: "no_rate" }

/** A dollar price the creator approved, when there is one. */
export function approvedUsdPrice(p: MarketplaceSource): number | null {
  const cents = Number(p.marketplace_usd_cents)
  return p.marketplace_usd_approved_at && Number.isInteger(cents) && cents >= 0 ? cents : null
}

/**
 * A product's marketplace amounts in US dollars, from its store's currency.
 * Plans and dollar stores are as they are; an approved dollar price is used
 * as set; anything else is converted at `fx`, or refused (no_rate).
 */
export function marketplaceAmounts(p: MarketplaceSource, storeCurrency: string, fx: FxRates | null | undefined, now?: number): MarketplaceAmounts {
  const from = (isPlanPriced(p) ? MARKETPLACE_CURRENCY : storeCurrency || "").toUpperCase()
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null)
  const price = num(p.price_cents) ?? 0
  const min = num(p.pwyw_min_price_cents)
  const compare = num(p.compare_at_cents)
  if (from === MARKETPLACE_CURRENCY) {
    return { ok: true, currency: MARKETPLACE_CURRENCY, price_cents: price, pwyw_min_price_cents: min, compare_at_cents: compare, source: "native", fxAsOf: null }
  }
  const fixed = approvedUsdPrice(p)
  const conv = (v: number, round: "nearest" | "up" = "nearest") => toUsdMinor(v, from, fx, { round, now })
  const cPrice = fixed ?? conv(price)
  const cMin = min === null ? null : conv(min, "up")
  if (cPrice === null || (min !== null && cMin === null)) return { ok: false, reason: "no_rate" }
  /* The struck-through price: converted the same way, shown only when it still reads higher. */
  const cCompare = compare === null ? null : conv(compare)
  return {
    ok: true,
    currency: MARKETPLACE_CURRENCY,
    price_cents: cPrice,
    pwyw_min_price_cents: cMin,
    compare_at_cents: cCompare !== null && cCompare > cPrice ? cCompare : null,
    source: fixed !== null ? "fixed" : "converted",
    fxAsOf: fx?.asOf ?? null,
  }
}

/** A code's fixed amount (in the store's major units, as coupons store it) in dollars at the same rate. */
export function couponValueInUsd(valueMajor: number, from: string, fx: FxRates | null | undefined, now?: number): number | null {
  const minor = Math.round(valueMajor * 10 ** minorUnits(from.toUpperCase()))
  const usd = toUsdMinor(minor, from, fx, { now })
  return usd === null ? null : usd / 100
}

/** The message a paused marketplace purchase answers with. Plain, and true. */
export const RATES_PAUSED_MESSAGE = "Prices on Storelib are being updated. Try again in a few minutes."
