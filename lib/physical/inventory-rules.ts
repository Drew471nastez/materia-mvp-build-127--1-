/**
 * ===========================================================================
 *  INVENTORY RULES, PURE: WHAT A CHANGE DOES BEFORE IT IS SENT
 * ===========================================================================
 * The Inventory page, the adjust window, the stock routes and the tests all
 * read these, so the number a seller sees in the preview is the number the
 * database writes (part 214, physical_inventory_adjust, does the same sums
 * under the level's lock), and the storefront, checkout and the low stock
 * email agree on whether a variant can still sell.
 *
 *   planAdjust        add, remove or set on hand (or units on order): the
 *                     change, what it was, what it will be, or why not
 *   movementSource    where a line in the history came from
 *   sellsWhenOut      "Keep selling when out of stock": the variant's own,
 *                     or the product's for all its variants
 *   lowStockAt        the low stock line: the variant's, else the product's,
 *                     else the shop's
 *   transferActions   what a transfer can do next, from its status
 *   receivePlan       a partial receive, clamped to what is still on its way
 *   inventoryCsv /    the export, and an import of the same columns
 *   parseInventoryCsv
 */

import { guardFormula } from "@/lib/csv/formula-guard"

/** The reasons a seller can choose. "count" is a stock count; "other" fits nothing else. */
export const MANUAL_REASONS = ["received", "returned_restock", "count", "correction", "damaged", "theft_or_loss", "promotion_or_donation", "other"] as const
export type ManualReason = (typeof MANUAL_REASONS)[number]

export type AdjustMode = "add" | "remove" | "set"
export type AdjustField = "on_hand" | "incoming"

/** Which reasons make sense for each way of changing stock, the usual one first. */
export const REASONS_FOR: Record<AdjustMode, readonly ManualReason[]> = {
  add: ["received", "returned_restock", "correction", "other"],
  remove: ["damaged", "theft_or_loss", "promotion_or_donation", "correction", "other"],
  set: ["count", "correction", "received", "other"],
}

export function isManualReason(v: unknown): v is ManualReason {
  return typeof v === "string" && (MANUAL_REASONS as readonly string[]).includes(v)
}

/** The reason kept for a mode: the one chosen when it fits, else the mode's usual one. */
export function reasonFor(mode: AdjustMode, chosen: unknown): ManualReason {
  return isManualReason(chosen) && REASONS_FOR[mode].includes(chosen) ? chosen : REASONS_FOR[mode][0]
}

export const MAX_UNITS = 1_000_000

/** A whole number of units typed by a person: digits only, 0 to a million. */
export function readUnits(typed: unknown): number | null {
  if (typeof typed === "number") return Number.isInteger(typed) && typed >= 0 && typed <= MAX_UNITS ? typed : null
  if (typeof typed !== "string") return null
  const t = typed.trim()
  if (!/^\d{1,7}$/.test(t)) return null
  const n = Number(t)
  return n <= MAX_UNITS ? n : null
}

export interface LevelNow {
  onHand: number
  committed: number
  incoming: number
}

export type AdjustPlan =
  | { ok: true; delta: number; before: number; after: number; availableBefore: number; availableAfter: number; unchanged: boolean }
  | { ok: false; error: string }

/**
 * What a change will do, worked out the way the database does it. Removing
 * more than is on hand is refused; a set can be anything from 0. A change
 * that leaves available under zero (more sold than will be on the shelf) is
 * allowed, as it is true, and the preview says so (`availableAfter`).
 */
export function planAdjust(now: LevelNow, a: { field: AdjustField; mode: AdjustMode; quantity: unknown }): AdjustPlan {
  const q = readUnits(a.quantity)
  if (q === null) return { ok: false, error: "Enter a whole number from 0 to 1,000,000." }
  if (a.mode !== "set" && q === 0) return { ok: false, error: "Enter how many units." }
  const before = a.field === "incoming" ? now.incoming : now.onHand
  const delta = a.mode === "add" ? q : a.mode === "remove" ? -q : q - before
  if (delta < 0 && before + delta < 0) {
    return { ok: false, error: a.field === "incoming" ? `Only ${Math.max(0, before)} on order here.` : `Only ${Math.max(0, before)} on hand here.` }
  }
  const after = before + delta
  const availableBefore = now.onHand - now.committed
  const availableAfter = a.field === "on_hand" ? after - now.committed : availableBefore
  return { ok: true, delta, before, after, availableBefore, availableAfter, unchanged: delta === 0 }
}

/* ── Where a change came from ────────────────────────────────────────── */

export type MovementSource = "manual" | "order" | "return" | "transfer" | "import" | "api" | "app" | "product"

/** From what the movement was about (its ref_type) and why. Pure, so the history and the export say the same. */
export function movementSource(m: { reason: string; refType?: string | null; actor?: string | null }): MovementSource {
  const ref = m.refType ?? null
  if (ref === "transfer" || m.reason === "transfer_in" || m.reason === "transfer_out" || m.reason === "transfer_cancelled") return "transfer"
  if (ref === "return") return "return"
  if (ref === "checkout" || ref === "fulfillment" || ref === "order") return "order"
  if (["sale_fulfilled", "order_reserved", "reservation_released", "order_cancelled"].includes(m.reason)) return "order"
  if (ref === "import") return "import"
  if (ref === "api") return "api"
  if (ref === "provider" || m.reason === "provider_sync") return "app"
  if (ref === "product" || m.reason === "initial") return "product"
  return "manual"
}

/* ── Selling, and the low stock line ─────────────────────────────────── */

/**
 * "Keep selling when out of stock": the variant's own setting, or the
 * product's, which is for all its variants (the product editor's toggle).
 * The storefront, the cart, checkout and readiness all read this one rule.
 */
export function sellsWhenOut(variantPolicy: string | null | undefined, productContinues: boolean | null | undefined): boolean {
  return variantPolicy === "continue" || productContinues === true
}

/** Whether this many can be sold: untracked and keep selling always can; otherwise only what is available. */
export function canSell(o: { tracked: boolean; keepSelling: boolean; available: number; quantity: number }): boolean {
  if (!o.tracked || o.keepSelling) return true
  return o.quantity > 0 && o.available >= o.quantity
}

/** The low stock line: the variant's own, else the product's, else the shop's (5 when nothing is set). */
export function lowStockAt(variantLine: number | null | undefined, productLine: number | null | undefined, shopDefault: number | null | undefined): number {
  for (const n of [variantLine, productLine, shopDefault]) if (typeof n === "number" && Number.isFinite(n) && n >= 0) return Math.floor(n)
  return 5
}

export type StockState = "untracked" | "oversold" | "out" | "low" | "ok"

/** What a row shows: oversold (more sold than on the shelf), out, low (at or under its line), or fine. */
export function stockState(available: number, line: number, tracked: boolean): StockState {
  if (!tracked) return "untracked"
  if (available < 0) return "oversold"
  if (available === 0) return "out"
  if (available <= line) return "low"
  return "ok"
}

/** Whether the low stock email names this variant: tracked, and at or under its line. */
export function lowForAlert(available: number, line: number, tracked: boolean): boolean {
  return tracked && available <= line
}

export type InventoryView = "all" | "low" | "out" | "incoming"

/**
 * Which Inventory view a row is in (round 41). Low is at or under its line,
 * out of stock included: the low stock email lists items at 0 and links to
 * ?filter=low, which left them out. So Low and the email are one rule
 * (lowForAlert). Out of stock stays its own view: zero or less, oversold too.
 */
export function inInventoryView(row: { trackInventory: boolean; lowStockThreshold: number }, level: { available: number; incoming: number }, view: InventoryView): boolean {
  if (view === "low") return lowForAlert(level.available, row.lowStockThreshold, row.trackInventory)
  if (view === "out") return row.trackInventory && level.available <= 0
  if (view === "incoming") return level.incoming > 0
  return true
}

/* ── Transfers ───────────────────────────────────────────────────────── */

export type TransferStatus = "draft" | "in_transit" | "partially_received" | "received" | "cancelled"
export type TransferAction = "send" | "receive" | "cancel"

/** What a transfer can do next. A draft is sent or cancelled; one on its way is received or cancelled; a closed one does nothing. */
export function transferActions(status: string): TransferAction[] {
  if (status === "draft") return ["send", "cancel"]
  if (status === "in_transit" || status === "partially_received") return ["receive", "cancel"]
  return []
}

/**
 * A receive: for each item, how many are taken now (what was asked, never
 * more than is still on its way, never under zero) and the status after.
 */
export function receivePlan(items: { id: string; quantity: number; received: number }[], asked: Record<string, unknown>): { take: Record<string, number>; status: TransferStatus; total: number } {
  const take: Record<string, number> = {}
  let total = 0
  for (const i of items) {
    const want = readUnits(asked[i.id] ?? 0) ?? 0
    const n = Math.max(0, Math.min(want, i.quantity - i.received))
    if (n > 0) {
      take[i.id] = n
      total += n
    }
  }
  const after = items.map((i) => ({ ...i, received: i.received + (take[i.id] ?? 0) }))
  const status: TransferStatus = after.length && after.every((i) => i.received >= i.quantity) ? "received" : after.some((i) => i.received > 0) ? "partially_received" : "in_transit"
  return { take, status, total }
}

/** One line per variant: the same product picked twice is one line with both counts. */
export function mergeTransferItems(items: { variantId: string; quantity: number }[]): { variantId: string; quantity: number }[] {
  const by = new Map<string, number>()
  for (const i of items) if (Number.isInteger(i.quantity) && i.quantity > 0) by.set(i.variantId, Math.min(MAX_UNITS, (by.get(i.variantId) ?? 0) + i.quantity))
  return [...by].map(([variantId, quantity]) => ({ variantId, quantity }))
}

/* ── CSV ─────────────────────────────────────────────────────────────── */

export const INVENTORY_CSV_HEADER = ["Product", "Variant", "SKU", "Location", "On hand", "Committed", "Available", "Incoming", "Tracked", "Keep selling when out", "Low stock at", "Variant ID", "Location ID"] as const

/** A cell as a spreadsheet reads it: quoted when it has a comma, quote or line break, and never a formula. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v)
  /* A cell that starts like a formula is read as text, so a product called "=HYPERLINK(...)" cannot run in Excel. */
  if (!/^-?\d+$/.test(s)) s = guardFormula(s)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export interface CsvRow {
  productTitle: string
  variantName: string
  sku: string | null
  locationName: string
  locationId: string
  variantId: string
  onHand: number
  committed: number
  available: number
  incoming: number
  tracked: boolean
  keepSelling: boolean
  lowStockAt: number
}

export function inventoryCsv(rows: CsvRow[]): string {
  const lines = [INVENTORY_CSV_HEADER.join(",")]
  for (const r of rows) {
    lines.push(
      [r.productTitle, r.variantName === "Default" ? "" : r.variantName, r.sku ?? "", r.locationName, r.onHand, r.committed, r.available, r.incoming, r.tracked ? "Yes" : "No", r.keepSelling ? "Yes" : "No", r.lowStockAt, r.variantId, r.locationId]
        .map(csvCell)
        .join(","),
    )
  }
  return lines.join("\r\n") + "\r\n"
}

/** RFC 4180 rows: quoted cells, doubled quotes, line breaks inside quotes. */
export function csvRows(text: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  const s = text.replace(/^﻿/, "")
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
      continue
    }
    if (c === '"') quoted = true
    else if (c === ",") {
      row.push(cell)
      cell = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++
      row.push(cell)
      out.push(row)
      row = []
      cell = ""
    } else cell += c
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    out.push(row)
  }
  return out.filter((r) => r.some((c) => c.trim() !== ""))
}

export const MAX_IMPORT_ROWS = 2000

export interface ImportLine {
  line: number
  variantId: string | null
  sku: string | null
  locationId: string | null
  locationName: string | null
  onHand: number
}

/**
 * An import: the export's own columns (or any file with SKU or Variant ID,
 * Location and On hand). Each line sets on hand at one location, as a stock
 * count. A line without a number in On hand is skipped, not a zero.
 */
export function parseInventoryCsv(text: string): { lines: ImportLine[]; errors: string[] } {
  const rows = csvRows(text)
  const errors: string[] = []
  if (rows.length < 2) return { lines: [], errors: ["The file has no rows under its header."] }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const iVariant = col("variant id")
  const iSku = col("sku")
  const iLocId = col("location id")
  const iLoc = col("location")
  const iOnHand = col("on hand", "quantity", "available")
  if (iOnHand < 0) return { lines: [], errors: ["Add an On hand column."] }
  if (iVariant < 0 && iSku < 0) return { lines: [], errors: ["Add a SKU or Variant ID column."] }
  if (rows.length - 1 > MAX_IMPORT_ROWS) errors.push(`Only the first ${MAX_IMPORT_ROWS.toLocaleString("en-US")} rows were read.`)
  const lines: ImportLine[] = []
  rows.slice(1, MAX_IMPORT_ROWS + 1).forEach((r, k) => {
    const line = k + 2
    const typed = (r[iOnHand] ?? "").trim()
    if (typed === "") return
    const n = readUnits(typed)
    if (n === null) return void errors.push(`Line ${line}: On hand must be a whole number from 0.`)
    const variantId = iVariant >= 0 ? (r[iVariant] ?? "").trim() || null : null
    const sku = iSku >= 0 ? (r[iSku] ?? "").trim().replace(/^'/, "") || null : null
    if (!variantId && !sku) return void errors.push(`Line ${line}: no SKU or Variant ID.`)
    lines.push({ line, variantId, sku, locationId: iLocId >= 0 ? (r[iLocId] ?? "").trim() || null : null, locationName: iLoc >= 0 ? (r[iLoc] ?? "").trim() || null : null, onHand: n })
  })
  return { lines, errors }
}
