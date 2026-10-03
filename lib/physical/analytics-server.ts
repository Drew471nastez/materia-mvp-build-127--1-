import "server-only"

/**
 * The physical side of a shop's numbers, for Analytics: units sold, what
 * shipping brought in, orders waiting to ship, how long they wait, returns,
 * stock running low and the value of what is on the shelf at cost. Read
 * from the same rows the order pages use, filtered by the creator.
 */

import type { Db } from "./auth"

export interface PhysicalAnalytics {
  orders: number
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
  topProducts: { title: string; units: number; revenueCents: number }[]
}

export async function physicalAnalytics(db: Db, creatorId: string, sinceIso: string, lowStockDefault = 5): Promise<PhysicalAnalytics> {
  const { data: checkouts } = await db
    .from("commerce_checkouts")
    .select("id, total_cents, shipping_cents, shipping_discount_cents, tax_cents, lines, fulfillment_status, return_status, paid_at, fulfilled_at")
    .eq("creator_id", creatorId)
    .in("status", ["paid", "partially_refunded", "refunded"])
    .gte("paid_at", sinceIso)
    .limit(10000)
  const rows = (checkouts ?? []) as Record<string, any>[]
  let units = 0
  const byProduct = new Map<string, { title: string; units: number; revenueCents: number }>()
  for (const r of rows) {
    for (const l of (r.lines ?? []) as Record<string, any>[]) {
      if (l.type !== "physical") continue
      units += l.quantity ?? 0
      const p = byProduct.get(l.product_id) ?? { title: l.title, units: 0, revenueCents: 0 }
      p.units += l.quantity ?? 0
      p.revenueCents += Math.max(0, (l.unit_cents ?? 0) * (l.quantity ?? 0) - (l.discount_cents ?? 0))
      byProduct.set(l.product_id, p)
    }
  }
  const shipped = rows.filter((r) => r.fulfilled_at && r.paid_at)
  const hours = shipped.map((r) => (Date.parse(r.fulfilled_at) - Date.parse(r.paid_at)) / 3_600_000).filter((h) => Number.isFinite(h) && h >= 0)

  const { count: returnCount } = await db.from("commerce_returns").select("id", { count: "exact", head: true }).eq("creator_id", creatorId).gte("created_at", sinceIso).not("status", "in", "(rejected,cancelled)")

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

  return {
    orders: rows.length,
    units,
    revenueCents: rows.reduce((n, r) => n + (r.total_cents ?? 0), 0),
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
    topProducts: [...byProduct.values()].sort((a, b) => b.units - a.units).slice(0, 5),
  }
}
