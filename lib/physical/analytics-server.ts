import "server-only"

/**
 * The physical side of a shop's numbers, for Analytics: units sold, what
 * shipping brought in, orders waiting to ship, how long they wait, returns,
 * stock running low and the value of what is on the shelf at cost. Read
 * from the same rows the order pages use, filtered by the creator.
 */

import type { Db } from "./auth"
import { inStoreCurrency } from "@/lib/money/report-currency-server"
import { readStoreCurrency } from "@/lib/store/selling-currency-read"

/* One unit of each checkout's currency, converted: its day's factor into the store's (see inStoreFactors). */
const UNIT = 1_000_000

/**
 * Each paid checkout's factor into the store's currency, from its own day's
 * ECB rate (lib/money/report-currency-server): 1 for one already in it, null
 * for one no rate converts. A store that changed from euros to lei has euro
 * checkouts beside lei ones, and their cents were added up as one number.
 */
export async function inStoreFactors(db: Db, creatorId: string, rows: { id: string; currency?: string | null; paid_at?: string | null; created_at?: string | null }[], storeCurrency: string): Promise<Map<string, number | null>> {
  const probes = rows.map((r) => ({ id: r.id, created_at: r.paid_at || r.created_at || new Date().toISOString(), currency: r.currency ?? null, amount_cents: UNIT }))
  const factors = new Map<string, number | null>(rows.map((r) => [r.id, null]))
  try {
    const done = await inStoreCurrency(db, creatorId, probes, storeCurrency)
    for (const r of done.rows) factors.set(r.id, (r.amount_cents ?? 0) / UNIT)
  } catch {
    /* No rates: only the checkouts in the store's currency count. */
    for (const r of rows) if (!r.currency || r.currency.toUpperCase() === storeCurrency.toUpperCase()) factors.set(r.id, 1)
  }
  return factors
}

export interface PhysicalAnalytics {
  /** The store's currency, which every amount here is in. */
  currency: string
  /** Paid checkouts in the period. */
  orders: number
  /** What was charged less what was refunded. */
  netCents: number
  /** Net over orders; null with no orders. */
  averageOrderCents: number | null
  refundedCents: number
  /** Checkouts refunded in whole or part. */
  refunds: number
  /** Checkouts opened in the period (paid or not), and the share of them that were paid. */
  startedCheckouts: number
  checkoutConversion: number | null
  /** Page views of the shop's physical products and Add to cart presses on them (analytics_events). */
  productViews: number
  addsToCart: number
  addToCartRate: number | null
  /** Hours from paid to delivered, on average, where delivery was recorded. */
  averageHoursToDeliver: number | null
  countries: { code: string; orders: number; revenueCents: number }[]
  units: number
  revenueCents: number
  shippingCents: number
  taxCents: number
  unfulfilled: number
  partiallyFulfilled: number
  averageHoursToShip: number | null
  returns: number
  returnRate: number | null
  lowStock: { title: string; variantName: string; available: number }[]
  outOfStock: number
  stockValueCents: number
  topProducts: { id: string; title: string; units: number; revenueCents: number; orders: number }[]
}

export async function physicalAnalytics(db: Db, creatorId: string, sinceIso: string, lowStockDefault = 5, untilIso?: string): Promise<PhysicalAnalytics> {
  let paid = db
    .from("commerce_checkouts")
    .select("id, currency, total_cents, refunded_cents, shipping_cents, shipping_discount_cents, tax_cents, lines, fulfillment_status, return_status, paid_at, fulfilled_at, delivered_at, shipping_address")
    .eq("creator_id", creatorId)
    .in("status", ["paid", "partially_refunded", "refunded"])
    .gte("paid_at", sinceIso)
  /* The period's end, when the page names one (Analytics' own range). */
  if (untilIso) paid = paid.lt("paid_at", untilIso)
  const { data: checkouts } = await paid.limit(10000)
  const charged = (checkouts ?? []) as Record<string, any>[]
  /*
    EVERY AMOUNT IN THE STORE'S CURRENCY. Each checkout's money is converted
    at its own day's rate; one no rate converts still counts as an order and
    its units, but its money is left out rather than added in its own cents.
  */
  const currency = (await readStoreCurrency(db, creatorId)).currency
  const factors = await inStoreFactors(db, creatorId, charged as { id: string; currency?: string | null; paid_at?: string | null }[], currency)
  const scale = (v: unknown, f: number) => Math.round((typeof v === "number" && Number.isFinite(v) ? v : 0) * f)
  const rows = charged.map((r) => {
    const f = factors.get(r.id) ?? 0
    if (f === 1) return r
    return {
      ...r,
      total_cents: scale(r.total_cents, f),
      refunded_cents: scale(r.refunded_cents, f),
      shipping_cents: scale(r.shipping_cents, f),
      shipping_discount_cents: scale(r.shipping_discount_cents, f),
      tax_cents: scale(r.tax_cents, f),
      lines: Array.isArray(r.lines) ? (r.lines as Record<string, any>[]).map((l) => ({ ...l, unit_cents: scale(l.unit_cents, f), discount_cents: scale(l.discount_cents, f) })) : r.lines,
      unconverted: f === 0,
    }
  })
  const priced = rows.filter((r) => !r.unconverted)
  let units = 0
  const byProduct = new Map<string, { id: string; title: string; units: number; revenueCents: number; orders: number }>()
  const byCountry = new Map<string, { code: string; orders: number; revenueCents: number }>()
  for (const r of rows) {
    const net = Math.max(0, (r.total_cents ?? 0) - (r.refunded_cents ?? 0))
    const code = typeof r.shipping_address?.country === "string" && /^[A-Za-z]{2}$/.test(r.shipping_address.country) ? r.shipping_address.country.toUpperCase() : null
    if (code) {
      const c = byCountry.get(code) ?? { code, orders: 0, revenueCents: 0 }
      c.orders++
      c.revenueCents += net
      byCountry.set(code, c)
    }
    const seen = new Set<string>()
    for (const l of (r.lines ?? []) as Record<string, any>[]) {
      if (l.type !== "physical") continue
      units += l.quantity ?? 0
      const p = byProduct.get(l.product_id) ?? { id: String(l.product_id), title: l.title, units: 0, revenueCents: 0, orders: 0 }
      p.units += l.quantity ?? 0
      p.revenueCents += Math.max(0, (l.unit_cents ?? 0) * (l.quantity ?? 0) - (l.discount_cents ?? 0))
      if (!seen.has(p.id)) p.orders++
      seen.add(p.id)
      byProduct.set(l.product_id, p)
    }
  }
  const delivered = rows.filter((r) => r.delivered_at && r.paid_at)
  const deliverHours = delivered.map((r) => (Date.parse(r.delivered_at) - Date.parse(r.paid_at)) / 3_600_000).filter((h) => Number.isFinite(h) && h >= 0)

  /* Checkouts opened in the period, paid or not: how many of them became an order. */
  let started = db.from("commerce_checkouts").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).gte("created_at", sinceIso)
  if (untilIso) started = started.lt("created_at", untilIso)
  /*
    Views of the physical products and Add to cart presses on them, counted
    by the database (analytics_events by product, event type and time, part
    25's index). Every product of the creator that ships, sold or not.
  */
  const { data: physicalProducts } = await db.from("products").select("id").eq("creator_id", creatorId).eq("type", "physical").limit(2000)
  const physicalIds = ((physicalProducts ?? []) as { id: string }[]).map((p) => p.id)
  const eventCount = async (type: string): Promise<number> => {
    if (physicalIds.length === 0) return 0
    let total = 0
    for (let i = 0; i < physicalIds.length; i += 200) {
      let q = db.from("analytics_events").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).eq("event_type", type).in("product_id", physicalIds.slice(i, i + 200)).gte("created_at", sinceIso)
      if (untilIso) q = q.lt("created_at", untilIso)
      const { count } = await q
      total += count ?? 0
    }
    return total
  }
  const [{ count: startedCount }, productViews, addsToCart] = await Promise.all([started, eventCount("view"), eventCount("buy_click")])
  const shipped = rows.filter((r) => r.fulfilled_at && r.paid_at)
  const hours = shipped.map((r) => (Date.parse(r.fulfilled_at) - Date.parse(r.paid_at)) / 3_600_000).filter((h) => Number.isFinite(h) && h >= 0)

  let returns = db.from("commerce_returns").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).gte("created_at", sinceIso).not("status", "in", "(rejected,cancelled)")
  if (untilIso) returns = returns.lt("created_at", untilIso)
  const { count: returnCount } = await returns

  /* Stock: low, out, and its value at cost. */
  const { data: levels } = await db.from("inventory_levels").select("variant_id, on_hand, available").eq("creator_id", creatorId).limit(20000)
  const perVariant = new Map<string, { onHand: number; available: number }>()
  for (const l of (levels ?? []) as { variant_id: string; on_hand: number; available: number }[]) {
    const v = perVariant.get(l.variant_id) ?? { onHand: 0, available: 0 }
    v.onHand += l.on_hand
    v.available += l.available
    perVariant.set(l.variant_id, v)
  }
  const ids = [...perVariant.keys()]
  const costs = new Map<string, number>()
  const names = new Map<string, { title: string; variantName: string; threshold: number }>()
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500)
    const [{ data: c }, { data: v }] = await Promise.all([
      db.from("product_variant_costs").select("variant_id, cost_cents").eq("creator_id", creatorId).in("variant_id", slice),
      db.from("product_variants").select("id, name, track_inventory, products!inner(title, creator_id, low_stock_threshold, track_inventory)").in("id", slice).eq("products.creator_id", creatorId),
    ])
    for (const x of (c ?? []) as { variant_id: string; cost_cents: number }[]) costs.set(x.variant_id, x.cost_cents)
    for (const x of (v ?? []) as Record<string, any>[]) {
      if ((x.track_inventory ?? x.products?.track_inventory) === false) continue
      names.set(x.id, { title: x.products?.title ?? "Product", variantName: x.name, threshold: x.products?.low_stock_threshold ?? lowStockDefault })
    }
  }
  let stockValueCents = 0
  let outOfStock = 0
  const lowStock: PhysicalAnalytics["lowStock"] = []
  for (const [id, lv] of perVariant) {
    stockValueCents += Math.max(0, lv.onHand) * (costs.get(id) ?? 0)
    const n = names.get(id)
    if (!n) continue
    if (lv.available <= 0) outOfStock++
    else if (lv.available <= n.threshold) lowStock.push({ title: n.title, variantName: n.variantName, available: lv.available })
  }
  lowStock.sort((a, b) => a.available - b.available)

  const revenueCents = rows.reduce((n, r) => n + (r.total_cents ?? 0), 0)
  const refundedCents = rows.reduce((n, r) => n + Math.max(0, r.refunded_cents ?? 0), 0)
  const netCents = Math.max(0, revenueCents - refundedCents)
  const startedCheckouts = Math.max(startedCount ?? 0, rows.length)
  return {
    currency,
    orders: rows.length,
    netCents,
    averageOrderCents: priced.length ? Math.round(netCents / priced.length) : null,
    refundedCents,
    refunds: charged.filter((r) => (r.refunded_cents ?? 0) > 0).length,
    startedCheckouts,
    checkoutConversion: startedCheckouts ? rows.length / startedCheckouts : null,
    productViews,
    addsToCart,
    addToCartRate: productViews ? Math.min(1, addsToCart / productViews) : null,
    averageHoursToDeliver: deliverHours.length ? Math.round((deliverHours.reduce((n, h) => n + h, 0) / deliverHours.length) * 10) / 10 : null,
    countries: [...byCountry.values()].sort((a, b) => b.orders - a.orders || b.revenueCents - a.revenueCents).slice(0, 25),
    units,
    revenueCents,
    shippingCents: rows.reduce((n, r) => n + Math.max(0, (r.shipping_cents ?? 0) - (r.shipping_discount_cents ?? 0)), 0),
    taxCents: rows.reduce((n, r) => n + (r.tax_cents ?? 0), 0),
    unfulfilled: rows.filter((r) => r.fulfillment_status === "unfulfilled" || r.fulfillment_status === "processing").length,
    partiallyFulfilled: rows.filter((r) => r.fulfillment_status === "partially_fulfilled").length,
    averageHoursToShip: hours.length ? Math.round((hours.reduce((n, h) => n + h, 0) / hours.length) * 10) / 10 : null,
    returns: returnCount ?? 0,
    returnRate: rows.length ? Math.round(((returnCount ?? 0) / rows.length) * 1000) / 10 : null,
    lowStock: lowStock.slice(0, 10),
    outOfStock,
    stockValueCents,
    /* By what they brought in, then by units. */
    topProducts: [...byProduct.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units).slice(0, 25),
  }
}
