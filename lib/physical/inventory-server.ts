import "server-only"

/**
 * ===========================================================================
 *  THE INVENTORY ENGINE, FROM THE APP'S SIDE
 * ===========================================================================
 * Stock only ever changes inside Postgres functions (part 78) that lock the
 * level row they change and write the movement in the same transaction:
 *
 *   physical_inventory_apply   a merchant's change: received, count,
 *                              damaged, transfer, restock. Idempotent by key.
 *   physical_reserve           a checkout's hold, all lines or none.
 *   physical_release           a hold given back (expired, failed, cancelled).
 *   physical_mark_sold         a paid checkout's holds become sold.
 *   physical_fulfill           shipped: on hand and committed both go down.
 *
 * This file only calls them and reads the results. On hand is what is on
 * the shelf, committed is sold or held but not shipped, available is on
 * hand less committed, incoming is ordered from a supplier.
 */

import type { Db } from "./auth"
import type { InventoryLevel } from "./types"

export const ADJUST_REASONS = [
  "received",
  "correction",
  "count",
  "damaged",
  "theft_or_loss",
  "promotion_or_donation",
  "returned_restock",
  "incoming_added",
  "incoming_cancelled",
] as const
export type AdjustReason = (typeof ADJUST_REASONS)[number] | "initial" | "transfer_out" | "transfer_in" | "provider_sync"

export { REASON_LABEL } from "./inventory-server-labels"

export type ApplyResult = { ok: true; applied: boolean; level: { onHand: number; committed: number; incoming: number; available: number } } | { ok: false; error: string }

export async function applyInventory(
  db: Db,
  a: {
    creatorId: string
    variantId: string
    locationId: string
    onHand?: number
    committed?: number
    incoming?: number
    reason: AdjustReason
    refType?: string | null
    refId?: string | null
    key?: string | null
    actor?: "creator" | "buyer" | "system" | "webhook" | "admin"
    note?: string | null
    /** Refuse a change that would take available below zero. */
    guard?: boolean
  },
): Promise<ApplyResult> {
  const { data, error } = await db.rpc("physical_inventory_apply", {
    p_creator: a.creatorId,
    p_variant: a.variantId,
    p_location: a.locationId,
    p_on_hand: Math.round(a.onHand ?? 0),
    p_committed: Math.round(a.committed ?? 0),
    p_incoming: Math.round(a.incoming ?? 0),
    p_reason: a.reason,
    p_ref_type: a.refType ?? null,
    p_ref_id: a.refId ?? null,
    p_key: a.key ?? null,
    p_actor: a.actor ?? "creator",
    p_note: a.note ?? null,
    p_guard: a.guard ?? false,
  })
  if (error) {
    console.error("[physical] inventory change failed:", error.code)
    return { ok: false, error: error.code === "PGRST202" || error.code === "42883" ? "Physical commerce needs its database update. Run SQL part 78 in Supabase." : "Stock could not be changed." }
  }
  const r = (data ?? {}) as Record<string, any>
  if (r.error === "not_found") return { ok: false, error: "That product or location is not yours." }
  if (r.error === "insufficient") return { ok: false, error: `Only ${Math.max(0, Number(r.available ?? 0))} available.` }
  return {
    ok: true,
    applied: r.applied === true,
    level: { onHand: Number(r.on_hand ?? 0), committed: Number(r.committed ?? 0), incoming: Number(r.incoming ?? 0), available: Number(r.available ?? 0) },
  }
}

export interface InventoryRow {
  variantId: string
  productId: string
  productTitle: string
  productImage: string | null
  variantName: string
  sku: string | null
  trackInventory: boolean
  lowStockThreshold: number
  levels: InventoryLevel[]
  onHand: number
  committed: number
  available: number
  incoming: number
}

/** Every physical variant of the shop with its stock at each location. */
export async function inventoryRows(db: Db, creatorId: string, lowStockDefault = 5): Promise<InventoryRow[]> {
  const { data: products } = await db
    .from("products")
    .select("id, title, thumbnail_url, track_inventory, low_stock_threshold")
    .eq("creator_id", creatorId)
    .eq("type", "physical")
    .order("created_at", { ascending: false })
    .limit(1000)
  const list = (products ?? []) as Record<string, any>[]
  if (list.length === 0) return []
  const byId = new Map(list.map((p) => [p.id, p]))
  const { data: variants } = await db
    .from("product_variants")
    .select("id, product_id, name, sku, track_inventory, active, position")
    .in("product_id", list.map((p) => p.id))
    .order("position")
    .limit(5000)
  const vs = ((variants ?? []) as Record<string, any>[]).filter((v) => v.active !== false)
  const ids = vs.map((v) => v.id)
  const levels: Record<string, any>[] = []
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("inventory_levels").select("variant_id, location_id, on_hand, committed, incoming, available").eq("creator_id", creatorId).in("variant_id", ids.slice(i, i + 500))
    levels.push(...((data ?? []) as Record<string, any>[]))
  }
  const levelsOf = new Map<string, InventoryLevel[]>()
  for (const l of levels) {
    const arr = levelsOf.get(l.variant_id) ?? []
    arr.push({ variantId: l.variant_id, locationId: l.location_id, onHand: l.on_hand, committed: l.committed, incoming: l.incoming, available: l.available })
    levelsOf.set(l.variant_id, arr)
  }
  return vs.map((v) => {
    const p = byId.get(v.product_id)!
    const ls = levelsOf.get(v.id) ?? []
    const sum = (k: keyof InventoryLevel) => ls.reduce((n, l) => n + Number(l[k] ?? 0), 0)
    return {
      variantId: v.id,
      productId: v.product_id,
      productTitle: p.title,
      productImage: p.thumbnail_url ?? null,
      variantName: v.name,
      sku: v.sku ?? null,
      trackInventory: v.track_inventory ?? p.track_inventory ?? true,
      lowStockThreshold: p.low_stock_threshold ?? lowStockDefault,
      levels: ls,
      onHand: sum("onHand"),
      committed: sum("committed"),
      available: sum("available"),
      incoming: sum("incoming"),
    }
  })
}

export interface Movement {
  id: number
  variantId: string | null
  locationId: string | null
  deltaOnHand: number
  deltaCommitted: number
  deltaIncoming: number
  onHandAfter: number | null
  reason: string
  note: string | null
  actor: string
  refType: string | null
  refId: string | null
  createdAt: string
}

export async function movements(db: Db, creatorId: string, opts: { variantId?: string; limit?: number } = {}): Promise<Movement[]> {
  let q = db
    .from("inventory_movements")
    .select("id, variant_id, location_id, delta_on_hand, delta_committed, delta_incoming, on_hand_after, reason, note, actor, ref_type, ref_id, created_at")
    .eq("creator_id", creatorId)
    .order("created_at", { ascending: false })
    .limit(Math.min(500, opts.limit ?? 100))
  if (opts.variantId) q = q.eq("variant_id", opts.variantId)
  const { data } = await q
  return ((data ?? []) as Record<string, any>[]).map((m) => ({
    id: m.id,
    variantId: m.variant_id,
    locationId: m.location_id,
    deltaOnHand: m.delta_on_hand,
    deltaCommitted: m.delta_committed,
    deltaIncoming: m.delta_incoming,
    onHandAfter: m.on_hand_after,
    reason: m.reason,
    note: m.note,
    actor: m.actor,
    refType: m.ref_type,
    refId: m.ref_id,
    createdAt: m.created_at,
  }))
}

/* ── transfers between locations ──────────────────────────────────────── */

export interface TransferItemInput {
  variantId: string
  quantity: number
}

export async function createTransfer(
  db: Db,
  creatorId: string,
  t: { originId: string; destinationId: string; items: TransferItemInput[]; reference?: string | null; note?: string | null; expectedAt?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (t.originId === t.destinationId) return { ok: false, error: "Choose two different locations." }
  const { data: locs } = await db.from("inventory_locations").select("id").eq("creator_id", creatorId).in("id", [t.originId, t.destinationId])
  if ((locs ?? []).length !== 2) return { ok: false, error: "Choose two of your own locations." }
  const items = t.items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 1_000_000)
  if (items.length === 0) return { ok: false, error: "Add at least one item to transfer." }
  const { data: owned } = await db.from("product_variants").select("id, products!inner(creator_id)").in("id", items.map((i) => i.variantId)).eq("products.creator_id", creatorId)
  if ((owned ?? []).length !== new Set(items.map((i) => i.variantId)).size) return { ok: false, error: "Only your own products can be transferred." }
  const { data: transfer, error } = await db
    .from("inventory_transfers")
    .insert({
      creator_id: creatorId,
      origin_location_id: t.originId,
      destination_location_id: t.destinationId,
      reference: t.reference?.slice(0, 120) || null,
      note: t.note?.slice(0, 1000) || null,
      expected_at: t.expectedAt && /^\d{4}-\d{2}-\d{2}$/.test(t.expectedAt) ? t.expectedAt : null,
    })
    .select("id")
    .single()
  if (error || !transfer) return { ok: false, error: "The transfer could not be created." }
  const { error: itemsError } = await db.from("inventory_transfer_items").insert(items.map((i) => ({ transfer_id: transfer.id, variant_id: i.variantId, quantity: i.quantity })))
  if (itemsError) {
    await db.from("inventory_transfers").delete().eq("id", transfer.id)
    return { ok: false, error: "The transfer could not be created." }
  }
  return { ok: true, id: transfer.id }
}

/** Shipped: the stock leaves the origin (on hand down) and shows as incoming at the destination. */
export async function shipTransfer(db: Db, creatorId: string, transferId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: t } = await db.from("inventory_transfers").select("id, status, origin_location_id, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status !== "draft") return { ok: false, error: "This transfer has already been sent." }
  const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity").eq("transfer_id", transferId)
  for (const i of (items ?? []) as { id: string; variant_id: string; quantity: number }[]) {
    const out = await applyInventory(db, {
      creatorId,
      variantId: i.variant_id,
      locationId: t.origin_location_id,
      onHand: -i.quantity,
      reason: "transfer_out",
      refType: "transfer",
      refId: transferId,
      key: `transfer_out:${i.id}`,
      guard: true,
    })
    if (!out.ok) return { ok: false, error: out.error }
    await applyInventory(db, {
      creatorId,
      variantId: i.variant_id,
      locationId: t.destination_location_id,
      incoming: i.quantity,
      reason: "incoming_added",
      refType: "transfer",
      refId: transferId,
      key: `transfer_incoming:${i.id}`,
    })
  }
  await db.from("inventory_transfers").update({ status: "in_transit", shipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transferId).eq("creator_id", creatorId)
  return { ok: true }
}

/** Received, all or part: incoming becomes on hand at the destination. */
export async function receiveTransfer(
  db: Db,
  creatorId: string,
  transferId: string,
  received: { itemId: string; quantity: number }[],
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const { data: t } = await db.from("inventory_transfers").select("id, status, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status !== "in_transit" && t.status !== "partially_received") return { ok: false, error: "Only a transfer on its way can be received." }
  const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity, received_quantity").eq("transfer_id", transferId)
  const rows = (items ?? []) as { id: string; variant_id: string; quantity: number; received_quantity: number }[]
  for (const r of received) {
    const item = rows.find((i) => i.id === r.itemId)
    if (!item) continue
    const qty = Math.min(Math.max(0, Math.floor(r.quantity)), item.quantity - item.received_quantity)
    if (qty <= 0) continue
    const after = item.received_quantity + qty
    const done = await applyInventory(db, {
      creatorId,
      variantId: item.variant_id,
      locationId: t.destination_location_id,
      onHand: qty,
      incoming: -qty,
      reason: "transfer_in",
      refType: "transfer",
      refId: transferId,
      key: `transfer_in:${item.id}:${after}`,
    })
    if (!done.ok) return { ok: false, error: done.error }
    if (done.applied) {
      await db.from("inventory_transfer_items").update({ received_quantity: after }).eq("id", item.id)
      item.received_quantity = after
    }
  }
  const all = rows.every((i) => i.received_quantity >= i.quantity)
  const status = all ? "received" : rows.some((i) => i.received_quantity > 0) ? "partially_received" : t.status
  await db
    .from("inventory_transfers")
    .update({ status, received_at: all ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", transferId)
    .eq("creator_id", creatorId)
  return { ok: true, status }
}

/** A draft is deleted; one on its way gives its stock back to the origin. */
export async function cancelTransfer(db: Db, creatorId: string, transferId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: t } = await db.from("inventory_transfers").select("id, status, origin_location_id, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status === "received" || t.status === "cancelled") return { ok: false, error: "This transfer is closed." }
  if (t.status !== "draft") {
    const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity, received_quantity").eq("transfer_id", transferId)
    for (const i of (items ?? []) as { id: string; variant_id: string; quantity: number; received_quantity: number }[]) {
      const open = i.quantity - i.received_quantity
      if (open <= 0) continue
      await applyInventory(db, { creatorId, variantId: i.variant_id, locationId: t.origin_location_id, onHand: open, reason: "correction", refType: "transfer", refId: transferId, key: `transfer_cancel_out:${i.id}`, note: "Transfer cancelled" })
      await applyInventory(db, { creatorId, variantId: i.variant_id, locationId: t.destination_location_id, incoming: -open, reason: "incoming_cancelled", refType: "transfer", refId: transferId, key: `transfer_cancel_in:${i.id}` })
    }
  }
  await db.from("inventory_transfers").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", transferId).eq("creator_id", creatorId)
  return { ok: true }
}
