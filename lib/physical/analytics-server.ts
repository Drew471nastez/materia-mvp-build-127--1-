import "server-only"

/**
 * The physical side of a shop's numbers, for Analytics: units sold, what
 * shipping brought in, orders waiting to ship, how long they wait, returns,
 * stock running low and the value of what is on the shelf at cost. Read
 * from the same rows the order pages use, filtered by the creator.
 */

import type { Db } from "./auth"

export interface PhysicalAnalytics {
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
    .select("id, total_cents, refunded_cents, shipping_cents, shipping_discount_cents, tax_cents, lines, fulfillment_status, return_status, paid_at, fulfilled_at, delivered_at, shipping_address")
    .eq("creator_id", creatorId)
    .in("status", ["paid", "partially_refunded", "refunded"])
    .gte("paid_at", sinceIso)
  /* The period's end, when the page names one (Analytics' own range). */
  if (untilIso) paid = paid.lt("paid_at", untilIso)
  const { data: checkouts } = await paid.limit(10000)
  const rows = (checkouts ?? []) as Record<string, any>[]
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
    orders: rows.length,
    netCents,
    averageOrderCents: rows.length ? Math.round(netCents / rows.length) : null,
    refundedCents,
    refunds: rows.filter((r) => (r.refunded_cents ?? 0) > 0).length,
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
