import "server-only"

/**
 * ===========================================================================
 *  THE INVENTORY ENGINE, FROM THE APP'S SIDE
 * ===========================================================================
 * Stock only ever changes inside Postgres functions that lock the level row
 * they change and write the movement in the same transaction:
 *
 *   physical_inventory_apply   (part 78) a change by a number: returns,
 *                              shipments cancelled, provider syncs.
 *   physical_inventory_adjust  (part 214) a seller's add, remove or set,
 *                              worked out under the lock, with who did it.
 *   physical_transfer_ship / _receive / _cancel
 *                              (part 214) a whole transfer in one
 *                              transaction: one item short and nothing moves.
 *   physical_reserve           a checkout's hold, all lines or none.
 *   physical_release           a hold given back (expired, failed, cancelled).
 *   physical_mark_sold         a paid checkout's holds become sold.
 *   physical_fulfill           shipped: on hand and committed both go down.
 *
 * Until part 214 has run, adjust and the transfers fall back to the step by
 * step way they worked before (each step still locked and keyed), so nothing
 * stops; the page says the update is waiting only where it matters.
 *
 * This file only calls them and reads the results. On hand is what is on
 * the shelf, committed is sold or held but not shipped, available is on
 * hand less committed, incoming is ordered from a supplier or on its way in
 * a transfer.
 */

import type { Db } from "./auth"
import type { InventoryLevel } from "./types"
import { lowStockAt, mergeTransferItems, movementSource, planAdjust, readUnits, reasonFor, sellsWhenOut, type AdjustField, type AdjustMode, type MovementSource } from "./inventory-rules"

export const ADJUST_REASONS = [
  "received",
  "correction",
  "count",
  "damaged",
  "theft_or_loss",
  "promotion_or_donation",
  "returned_restock",
  "other",
  "incoming_added",
  "incoming_cancelled",
] as const
export type AdjustReason = (typeof ADJUST_REASONS)[number] | "initial" | "transfer_out" | "transfer_in" | "transfer_cancelled" | "provider_sync"

export { REASON_LABEL } from "./inventory-server-labels"

/** The message for a database without part 214 yet, where it is the only way forward. */
export const NEEDS_214 = "This needs the inventory database update. Run SQL part 214 in Supabase."

/** A function or a column the database does not have yet. */
export function missingFunction(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "PGRST202" || error.code === "42883")
}
export function missingColumn(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204")
}

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
    /* The same key pressed twice at the same moment: the first one wrote it. */
    if (error.code === "23505") return { ok: true, applied: false, level: { onHand: 0, committed: 0, incoming: 0, available: 0 } }
    return { ok: false, error: missingFunction(error) ? "Physical commerce needs its database update. Run SQL part 78 in Supabase." : "Stock could not be changed." }
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

/* ── A seller's adjust ────────────────────────────────────────────────── */

export type AdjustResult =
  | { ok: true; applied: boolean; unchanged: boolean; before: number; after: number; level: { onHand: number; committed: number; incoming: number; available: number } }
  | { ok: false; error: string; status?: number }

/**
 * Add, remove or set on hand (or units on order) at one location, with a
 * reason and a note. Worked out and written under the level's lock by
 * physical_inventory_adjust; the key makes a double press one change.
 */
export async function adjustStock(
  db: Db,
  a: { creatorId: string; userId: string | null; variantId: string; locationId: string; field: AdjustField; mode: AdjustMode; quantity: unknown; reason?: unknown; note?: string | null; key?: string | null; refType?: string | null },
): Promise<AdjustResult> {
  const quantity = readUnits(a.quantity)
  if (quantity === null) return { ok: false, error: "Enter a whole number from 0 to 1,000,000.", status: 400 }
  if (a.mode !== "set" && quantity === 0) return { ok: false, error: "Enter how many units.", status: 400 }
  const reason = reasonFor(a.mode, a.reason)
  const { data, error } = await db.rpc("physical_inventory_adjust", {
    p_creator: a.creatorId,
    p_variant: a.variantId,
    p_location: a.locationId,
    p_field: a.field,
    p_mode: a.mode,
    p_quantity: quantity,
    p_reason: reason,
    p_note: a.note ?? null,
    p_key: a.key ?? null,
    p_actor_user: a.userId,
    p_ref_type: a.refType ?? null,
  })
  if (error && missingFunction(error)) return adjustStepByStep(db, { ...a, quantity, reason })
  if (error) {
    console.error("[physical] adjust failed:", error.code)
    if (error.code === "23505") return { ok: false, error: "That change was already saved.", status: 409 }
    return { ok: false, error: "Stock could not be changed. Try again in a moment.", status: 500 }
  }
  const r = (data ?? {}) as Record<string, any>
  if (r.error === "not_found") return { ok: false, error: "That product or location is not yours.", status: 404 }
  if (r.error === "below_zero") return { ok: false, error: a.field === "incoming" ? `Only ${Math.max(0, Number(r.current ?? 0))} on order here.` : `Only ${Math.max(0, Number(r.current ?? 0))} on hand here.`, status: 400 }
  if (r.error) return { ok: false, error: "Enter a whole number from 0 to 1,000,000.", status: 400 }
  const level = { onHand: Number(r.on_hand ?? 0), committed: Number(r.committed ?? 0), incoming: Number(r.incoming ?? 0), available: Number(r.available ?? 0) }
  const before = Number(r.before ?? (a.field === "incoming" ? level.incoming : level.onHand))
  return { ok: true, applied: r.applied === true, unchanged: r.unchanged === true, before, after: Number(r.after ?? before), level }
}

/** Before part 214: read, work out, then apply the difference (each apply still locked and keyed). */
async function adjustStepByStep(
  db: Db,
  a: { creatorId: string; variantId: string; locationId: string; field: AdjustField; mode: AdjustMode; quantity: number; reason: string; note?: string | null; key?: string | null; refType?: string | null },
): Promise<AdjustResult> {
  const { data: level } = await db.from("inventory_levels").select("on_hand, committed, incoming").eq("variant_id", a.variantId).eq("location_id", a.locationId).eq("creator_id", a.creatorId).maybeSingle()
  const now = { onHand: Number(level?.on_hand ?? 0), committed: Number(level?.committed ?? 0), incoming: Number(level?.incoming ?? 0) }
  const plan = planAdjust(now, { field: a.field, mode: a.mode, quantity: a.quantity })
  if (plan.ok === false) return { ok: false, error: (plan as { error: string }).error, status: 400 }
  const p = plan as Extract<typeof plan, { ok: true }>
  if (p.unchanged) return { ok: true, applied: false, unchanged: true, before: p.before, after: p.after, level: { ...now, available: now.onHand - now.committed } }
  /* "Other" is part 214's; until then it is written as a correction, with the word kept in the note. */
  const reason = a.field === "incoming" ? (p.delta > 0 ? "incoming_added" : "incoming_cancelled") : a.reason === "other" ? "correction" : a.reason
  const note = a.reason === "other" && a.field === "on_hand" ? ["Other", a.note].filter(Boolean).join(": ") : a.note
  const done = await applyInventory(db, {
    creatorId: a.creatorId,
    variantId: a.variantId,
    locationId: a.locationId,
    onHand: a.field === "on_hand" ? p.delta : 0,
    incoming: a.field === "incoming" ? p.delta : 0,
    reason: reason as AdjustReason,
    refType: a.refType ?? null,
    actor: "creator",
    note: note ?? null,
    key: a.key ?? null,
  })
  if (done.ok === false) return { ok: false, error: (done as { error: string }).error, status: 400 }
  return { ok: true, applied: done.applied, unchanged: false, before: p.before, after: p.after, level: done.level }
}

/* ── The page's rows ──────────────────────────────────────────────────── */

export interface InventoryRow {
  variantId: string
  productId: string
  productTitle: string
  productImage: string | null
  variantName: string
  sku: string | null
  trackInventory: boolean
  /** "Keep selling when out of stock", the variant's or the product's. */
  keepSelling: boolean
  /** The product editor's own switch, for every variant: shown as it is, changed in one place. */
  productKeepsSelling: boolean
  /** Printed by a partner when it sells: never counted. */
  madeToOrder: boolean
  lowStockThreshold: number
  /** The variant's own line (part 214), else null: the product's or the shop's. */
  variantLowStock: number | null
  productLowStock: number | null
  levels: InventoryLevel[]
  onHand: number
  committed: number
  available: number
  incoming: number
}

const VARIANT_COLUMNS = "id, product_id, name, sku, image_url, track_inventory, inventory_policy, active, position"

/** Every physical variant of the shop with its stock at each location. */
export async function inventoryRows(db: Db, creatorId: string, lowStockDefault = 5): Promise<InventoryRow[]> {
  const { data: products } = await db
    .from("products")
    .select("id, title, thumbnail_url, track_inventory, continue_selling, low_stock_threshold, fulfillment_method")
    .eq("creator_id", creatorId)
    .eq("type", "physical")
    .order("created_at", { ascending: false })
    .limit(1000)
  const list = (products ?? []) as Record<string, any>[]
  if (list.length === 0) return []
  const byId = new Map(list.map((p) => [p.id, p]))
  const vs = (await variantsOf(db, list.map((p) => p.id))).filter((v) => v.active !== false && !/^Archived /.test(String(v.name ?? "")))
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
    const variantLowStock = typeof v.low_stock_threshold === "number" ? v.low_stock_threshold : null
    const productLowStock = typeof p.low_stock_threshold === "number" ? p.low_stock_threshold : null
    const madeToOrder = p.fulfillment_method === "print_on_demand"
    return {
      variantId: v.id,
      productId: v.product_id,
      productTitle: p.title,
      productImage: v.image_url ?? p.thumbnail_url ?? null,
      variantName: v.name,
      sku: v.sku ?? null,
      trackInventory: madeToOrder ? false : (v.track_inventory ?? p.track_inventory ?? true),
      keepSelling: sellsWhenOut(v.inventory_policy, p.continue_selling),
      productKeepsSelling: p.continue_selling === true,
      madeToOrder,
      lowStockThreshold: lowStockAt(variantLowStock, productLowStock, lowStockDefault),
      variantLowStock,
      productLowStock,
      levels: ls,
      onHand: sum("onHand"),
      committed: sum("committed"),
      available: sum("available"),
      incoming: sum("incoming"),
    }
  })
}

/** The variants with their own low stock line when the database has it (part 214), without it when not. */
async function variantsOf(db: Db, productIds: string[]): Promise<Record<string, any>[]> {
  /*
    In batches of 200 ids, as the levels are read in 500s: a thousand product
    ids in one `in` filter is a 37KB address, longer than many proxies in
    front of PostgREST take, and a refused read here drew an empty Inventory.
  */
  const readAll = async (cols: string): Promise<{ rows: Record<string, any>[]; error: { code?: string } | null }> => {
    const rows: Record<string, any>[] = []
    for (let i = 0; i < productIds.length; i += VARIANT_BATCH) {
      const { data, error } = await db.from("product_variants").select(cols).in("product_id", productIds.slice(i, i + VARIANT_BATCH)).order("position").limit(5000)
      if (error) return { rows: [], error }
      rows.push(...((data ?? []) as Record<string, any>[]))
    }
    return { rows, error: null }
  }
  const first = await readAll(`${VARIANT_COLUMNS}, low_stock_threshold`)
  if (!first.error) return first.rows
  if (!missingColumn(first.error)) return []
  return (await readAll(VARIANT_COLUMNS)).rows
}

/** Product ids per variants read (see variantsOf). */
export const VARIANT_BATCH = 200

/** Each variant's own low stock line, by id, where part 214 is there; an empty map where it is not. Never throws. */
export async function variantLowStockLines(db: { from: (t: string) => any }, variantIds: string[]): Promise<Map<string, number>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Map<string, number>()
  if (variantIds.length === 0) return out
  try {
    const { data, error } = await db.from("product_variants").select("id, low_stock_threshold").in("id", variantIds.slice(0, 500))
    if (error) return out
    for (const v of (data ?? []) as { id: string; low_stock_threshold: number | null }[]) if (typeof v.low_stock_threshold === "number") out.set(v.id, v.low_stock_threshold)
  } catch {
    /* Nothing of its own: the product's line. */
  }
  return out
}

/* ── Stock settings, from the adjust window ───────────────────────────── */

/**
 * The settings beside a count: Track stock and Keep selling when out of
 * stock are the product's, the same switches the product editor has (one
 * place for each, for every variant); the low stock line is the variant's
 * own (part 214), or empty for the product's.
 */
export async function saveStockSettings(
  db: Db,
  creatorId: string,
  variantId: string,
  input: { trackInventory?: unknown; continueSelling?: unknown; lowStockThreshold?: unknown },
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data: v } = await db.from("product_variants").select("id, product_id, products!inner(id, creator_id, type, fulfillment_method)").eq("id", variantId).eq("products.creator_id", creatorId).maybeSingle()
  const p = v ? (Array.isArray(v.products) ? v.products[0] : v.products) : null
  if (!v || !p || p.creator_id !== creatorId) return { ok: false, error: "That product is not yours.", status: 404 }
  if (p.type !== "physical") return { ok: false, error: "Only a product you ship has stock.", status: 400 }
  const patch: Record<string, unknown> = {}
  if (typeof input.trackInventory === "boolean") {
    if (input.trackInventory && p.fulfillment_method === "print_on_demand") return { ok: false, error: "A print partner makes this product when it sells, so its stock is not counted.", status: 400 }
    patch.track_inventory = input.trackInventory
  }
  if (typeof input.continueSelling === "boolean") patch.continue_selling = input.continueSelling
  if (Object.keys(patch).length) {
    const { error } = await db.from("products").update(patch).eq("id", p.id).eq("creator_id", creatorId)
    if (error) return { ok: false, error: "The settings could not be saved.", status: 500 }
  }
  if ("lowStockThreshold" in input) {
    const raw = input.lowStockThreshold
    const line = raw === null || raw === "" || raw === undefined ? null : readUnits(raw)
    if (raw !== null && raw !== "" && raw !== undefined && line === null) return { ok: false, error: "Low stock must be a whole number from 0.", status: 400 }
    const { error } = await db.from("product_variants").update({ low_stock_threshold: line }).eq("id", variantId).eq("product_id", p.id)
    if (error) return missingColumn(error) ? { ok: false, error: `${NEEDS_214} The other settings were saved.`, status: 409 } : { ok: false, error: "The low stock line could not be saved.", status: 500 }
  }
  return { ok: true }
}

/* ── The history ──────────────────────────────────────────────────────── */

export interface Movement {
  id: number
  variantId: string | null
  locationId: string | null
  deltaOnHand: number
  deltaCommitted: number
  deltaIncoming: number
  onHandAfter: number | null
  /** On hand before the change, worked out from what it was after. */
  onHandBefore: number | null
  incomingAfter: number | null
  reason: string
  note: string | null
  actor: string
  actorUserId: string | null
  refType: string | null
  refId: string | null
  source: MovementSource
  createdAt: string
}

const MOVEMENT_COLUMNS = "id, variant_id, location_id, delta_on_hand, delta_committed, delta_incoming, on_hand_after, incoming_after, reason, note, actor, ref_type, ref_id, created_at"

/** Newest first, a page at a time (`before`: the last id of the page before). */
export async function movements(db: Db, creatorId: string, opts: { variantId?: string; locationId?: string; before?: number; limit?: number } = {}): Promise<Movement[]> {
  const read = (cols: string) => {
    let q = db
      .from("inventory_movements")
      .select(cols)
      .eq("creator_id", creatorId)
      .order("id", { ascending: false })
      .limit(Math.max(1, Math.min(200, opts.limit ?? 50)))
    if (opts.variantId) q = q.eq("variant_id", opts.variantId)
    if (opts.locationId) q = q.eq("location_id", opts.locationId)
    if (opts.before && Number.isInteger(opts.before)) q = q.lt("id", opts.before)
    return q
  }
  let res = await read(`${MOVEMENT_COLUMNS}, actor_user_id`)
  if (res.error && missingColumn(res.error)) res = await read(MOVEMENT_COLUMNS)
  return ((res.data ?? []) as Record<string, any>[]).map((m) => ({
    id: Number(m.id),
    variantId: m.variant_id,
    locationId: m.location_id,
    deltaOnHand: m.delta_on_hand,
    deltaCommitted: m.delta_committed,
    deltaIncoming: m.delta_incoming,
    onHandAfter: m.on_hand_after,
    onHandBefore: typeof m.on_hand_after === "number" ? m.on_hand_after - Number(m.delta_on_hand ?? 0) : null,
    incomingAfter: m.incoming_after ?? null,
    reason: m.reason,
    note: m.note,
    actor: m.actor,
    actorUserId: m.actor_user_id ?? null,
    refType: m.ref_type,
    refId: m.ref_id,
    source: movementSource({ reason: m.reason, refType: m.ref_type, actor: m.actor }),
    createdAt: m.created_at,
  }))
}

/* ── Transfers between locations ──────────────────────────────────────── */

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
  /* The same product picked twice is one line (one row per variant in a transfer). */
  const items = mergeTransferItems(t.items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0 && i.quantity <= 1_000_000))
  if (items.length === 0) return { ok: false, error: "Add at least one item to transfer." }
  if (items.length > 200) return { ok: false, error: "A transfer can move up to 200 products at once." }
  const { data: owned } = await db.from("product_variants").select("id, products!inner(creator_id)").in("id", items.map((i) => i.variantId)).eq("products.creator_id", creatorId)
  if ((owned ?? []).length !== items.length) return { ok: false, error: "Only your own products can be transferred." }
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
    await db.from("inventory_transfers").delete().eq("id", transfer.id).eq("creator_id", creatorId)
    return { ok: false, error: "The transfer could not be created." }
  }
  return { ok: true, id: transfer.id }
}

/** The name of a variant for a message: "Mug, Blue". */
async function variantLabel(db: Db, variantId: string): Promise<string> {
  const { data } = await db.from("product_variants").select("name, products(title)").eq("id", variantId).maybeSingle()
  const p = data ? (Array.isArray(data.products) ? data.products[0] : data.products) : null
  if (!p) return "An item"
  return data.name && data.name !== "Default" ? `${p.title}, ${data.name}` : p.title
}

const TRANSFER_STATUS_ERROR: Record<string, string> = {
  not_found: "Transfer not found.",
  empty: "This transfer has no items.",
  no_location: "One of its locations was deleted.",
  bad_input: "Choose what arrived.",
}

/** A transfer function's answer as the page reads it. */
async function transferAnswer(db: Db, data: unknown, error: { code?: string; message?: string } | null, wrongStatus: string): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  if (error) {
    const short = /transfer_short:([0-9a-f-]{36}):(\d+)/.exec(error.message ?? "")
    if (short) return { ok: false, error: `Only ${short[2]} of ${await variantLabel(db, short[1])} available to send. Nothing was sent.` }
    console.error("[physical] transfer failed:", error.code)
    return { ok: false, error: "The transfer could not be updated. Try again in a moment." }
  }
  const r = (data ?? {}) as Record<string, any>
  if (r.error === "wrong_status") return { ok: false, error: wrongStatus }
  if (r.error) return { ok: false, error: TRANSFER_STATUS_ERROR[r.error] ?? "The transfer could not be updated." }
  return { ok: true, status: String(r.status ?? "") }
}

/** Shipped: the stock leaves the origin (on hand down) and shows as incoming at the destination. All items or none. */
export async function shipTransfer(db: Db, creatorId: string, transferId: string, userId: string | null = null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.rpc("physical_transfer_ship", { p_creator: creatorId, p_transfer: transferId, p_actor_user: userId })
  if (!missingFunction(error)) {
    const r = await transferAnswer(db, data, error, "This transfer has already been sent.")
    return r.ok ? { ok: true } : r
  }
  /* Before part 214: every item checked first, so a short one stops the send before anything moves. */
  const { data: t } = await db.from("inventory_transfers").select("id, status, origin_location_id, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status !== "draft") return { ok: false, error: "This transfer has already been sent." }
  const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity").eq("transfer_id", transferId)
  const rows = ((items ?? []) as { id: string; variant_id: string | null; quantity: number }[]).filter((i) => i.variant_id)
  if (rows.length === 0) return { ok: false, error: "This transfer has no items." }
  const { data: levels } = await db.from("inventory_levels").select("variant_id, available").eq("creator_id", creatorId).eq("location_id", t.origin_location_id).in("variant_id", rows.map((i) => i.variant_id))
  const have = new Map(((levels ?? []) as { variant_id: string; available: number }[]).map((l) => [l.variant_id, Number(l.available ?? 0)]))
  for (const i of rows) {
    const n = have.get(i.variant_id as string) ?? 0
    if (n < i.quantity) return { ok: false, error: `Only ${Math.max(0, n)} of ${await variantLabel(db, i.variant_id as string)} available to send. Nothing was sent.` }
  }
  for (const i of rows) {
    const out = await applyInventory(db, { creatorId, variantId: i.variant_id as string, locationId: t.origin_location_id, onHand: -i.quantity, reason: "transfer_out", refType: "transfer", refId: transferId, key: `transfer_out:${i.id}`, guard: true })
    if (out.ok === false) return { ok: false, error: (out as { error: string }).error }
    await applyInventory(db, { creatorId, variantId: i.variant_id as string, locationId: t.destination_location_id, incoming: i.quantity, reason: "incoming_added", refType: "transfer", refId: transferId, key: `transfer_incoming:${i.id}` })
  }
  await db.from("inventory_transfers").update({ status: "in_transit", shipped_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", transferId).eq("creator_id", creatorId).eq("status", "draft")
  return { ok: true }
}

/** Received, all or part: incoming becomes on hand at the destination. */
export async function receiveTransfer(
  db: Db,
  creatorId: string,
  transferId: string,
  received: { itemId: string; quantity: number }[],
  userId: string | null = null,
): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  const asked = received.map((r) => ({ item_id: r.itemId, quantity: readUnits(Math.floor(Number(r.quantity) || 0)) ?? 0 }))
  if (!asked.some((a) => a.quantity > 0)) return { ok: false, error: "Enter how many arrived." }
  const { data, error } = await db.rpc("physical_transfer_receive", { p_creator: creatorId, p_transfer: transferId, p_items: asked, p_actor_user: userId })
  if (!missingFunction(error)) return transferAnswer(db, data, error, "Only a transfer on its way can be received.")
  const { data: t } = await db.from("inventory_transfers").select("id, status, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status !== "in_transit" && t.status !== "partially_received") return { ok: false, error: "Only a transfer on its way can be received." }
  const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity, received_quantity").eq("transfer_id", transferId)
  const rows = (items ?? []) as { id: string; variant_id: string; quantity: number; received_quantity: number }[]
  for (const r of asked) {
    const item = rows.find((i) => i.id === r.item_id)
    if (!item) continue
    const qty = Math.min(Math.max(0, r.quantity), item.quantity - item.received_quantity)
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
    if (done.ok === false) return { ok: false, error: (done as { error: string }).error }
    if (done.applied) {
      await db.from("inventory_transfer_items").update({ received_quantity: after }).eq("id", item.id).eq("transfer_id", transferId)
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

/** A draft is closed; one on its way gives back what has not arrived to the origin. */
export async function cancelTransfer(db: Db, creatorId: string, transferId: string, userId: string | null = null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await db.rpc("physical_transfer_cancel", { p_creator: creatorId, p_transfer: transferId, p_actor_user: userId })
  if (!missingFunction(error)) {
    const r = await transferAnswer(db, data, error, "This transfer is closed.")
    return r.ok ? { ok: true } : r
  }
  const { data: t } = await db.from("inventory_transfers").select("id, status, origin_location_id, destination_location_id").eq("id", transferId).eq("creator_id", creatorId).maybeSingle()
  if (!t) return { ok: false, error: "Transfer not found." }
  if (t.status === "received" || t.status === "cancelled") return { ok: false, error: "This transfer is closed." }
  if (t.status !== "draft") {
    const { data: items } = await db.from("inventory_transfer_items").select("id, variant_id, quantity, received_quantity").eq("transfer_id", transferId)
    for (const i of (items ?? []) as { id: string; variant_id: string; quantity: number; received_quantity: number }[]) {
      const open = i.quantity - i.received_quantity
      if (open <= 0 || !i.variant_id) continue
      await applyInventory(db, { creatorId, variantId: i.variant_id, locationId: t.origin_location_id, onHand: open, reason: "correction", refType: "transfer", refId: transferId, key: `transfer_cancel_out:${i.id}`, note: "Transfer cancelled" })
      await applyInventory(db, { creatorId, variantId: i.variant_id, locationId: t.destination_location_id, incoming: -open, reason: "incoming_cancelled", refType: "transfer", refId: transferId, key: `transfer_cancel_in:${i.id}` })
    }
  }
  await db.from("inventory_transfers").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", transferId).eq("creator_id", creatorId)
  return { ok: true }
}

/* ── Import ───────────────────────────────────────────────────────────── */

export interface ImportOutcome {
  changed: number
  unchanged: number
  skipped: string[]
}

/**
 * Lines from parseInventoryCsv: each sets on hand at a location as a stock
 * count, from source "import". Matched by Variant ID, else SKU (one of the
 * shop's own variants only), and by Location ID, else the location's name,
 * else the shop's only location. The key is the file's and the line's, so
 * the same file sent twice changes nothing the second time.
 */
export async function importStock(
  db: Db,
  a: { creatorId: string; userId: string | null; fileKey: string; lines: { line: number; variantId: string | null; sku: string | null; locationId: string | null; locationName: string | null; onHand: number }[] },
): Promise<ImportOutcome> {
  const out: ImportOutcome = { changed: 0, unchanged: 0, skipped: [] }
  const rows = await inventoryRows(db, a.creatorId)
  const { data: locs } = await db.from("inventory_locations").select("id, name").eq("creator_id", a.creatorId).limit(100)
  const locations = (locs ?? []) as { id: string; name: string }[]
  const byId = new Map(rows.map((r) => [r.variantId, r]))
  const bySku = new Map<string, InventoryRow[]>()
  for (const r of rows) if (r.sku) bySku.set(r.sku.toLowerCase(), [...(bySku.get(r.sku.toLowerCase()) ?? []), r])
  for (const l of a.lines) {
    const bySkuFound = l.sku ? (bySku.get(l.sku.toLowerCase()) ?? []) : []
    const row = (l.variantId ? byId.get(l.variantId) : undefined) ?? (bySkuFound.length === 1 ? bySkuFound[0] : undefined)
    if (!row) {
      out.skipped.push(bySkuFound.length > 1 ? `Line ${l.line}: SKU ${l.sku} is on more than one variant. Use Variant ID.` : `Line ${l.line}: no product of yours with that ${l.variantId ? "Variant ID" : "SKU"}.`)
      continue
    }
    const loc = (l.locationId ? locations.find((x) => x.id === l.locationId) : undefined) ?? (l.locationName ? locations.find((x) => x.name.toLowerCase() === l.locationName!.toLowerCase()) : undefined) ?? (locations.length === 1 && !l.locationId && !l.locationName ? locations[0] : undefined)
    if (!loc) {
      out.skipped.push(`Line ${l.line}: no location of yours called ${l.locationName ?? l.locationId ?? "that"}.`)
      continue
    }
    if (!row.trackInventory) {
      out.skipped.push(`Line ${l.line}: ${row.productTitle} does not track stock.`)
      continue
    }
    const done = await adjustStock(db, { creatorId: a.creatorId, userId: a.userId, variantId: row.variantId, locationId: loc.id, field: "on_hand", mode: "set", quantity: l.onHand, reason: "count", note: "Imported from a file", key: `import:${a.creatorId}:${a.fileKey}:${l.line}`, refType: "import" })
    if (done.ok === false) out.skipped.push(`Line ${l.line}: ${(done as { error: string }).error}`)
    else if ((done as { unchanged: boolean }).unchanged || !(done as { applied: boolean }).applied) out.unchanged++
    else out.changed++
  }
  return out
}
