/**
 * ===========================================================================
 *  MANY PARCELS, MANY ORDERS: THE PURE PARTS
 * ===========================================================================
 * Read by the order route (several parcels in one Fulfill), the bulk route
 * (Mark as fulfilled on the Orders list, a tracking CSV) and their tests.
 * Nothing here reads the database: ./bulk-fulfil-server.ts does.
 *
 * A tracking CSV is read cell by cell and nothing in it is trusted: a cell a
 * spreadsheet would run as a formula (= + - @ first) is refused with its row
 * rather than cleaned up, so what is saved is always what the merchant can
 * see in the preview.
 */
import { startsLikeFormula } from "@/lib/csv/formula-guard"
import type { ParcelInput } from "./orders-server"

/** The largest tracking CSV read, and its rows. Far above a day's parcels. */
export const IMPORT_MAX_BYTES = 512 * 1024
export const IMPORT_MAX_ROWS = 2000
/** Orders in one bulk Mark as fulfilled (the Orders list shows 50 a page). */
export const BULK_MAX_ORDERS = 100

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The parcels of a request, as far as their shape goes; orders-server checks every item against the order. */
export function parcelsOf(raw: unknown): ParcelInput[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 21).map((p) => {
    const o = p && typeof p === "object" ? (p as Record<string, unknown>) : {}
    const items = Array.isArray(o.items)
      ? (o.items as unknown[])
          .map((i) => (i && typeof i === "object" ? (i as Record<string, unknown>) : {}))
          .filter((i) => typeof i.orderId === "string" && UUID.test(i.orderId))
          .map((i) => ({ orderId: i.orderId as string, quantity: Math.floor(Number(i.quantity) || 0) }))
          .filter((i) => i.quantity > 0)
      : []
    return { items, carrier: o.carrier, trackingNumber: o.trackingNumber, trackingUrl: o.trackingUrl, locationId: o.locationId }
  })
}

/** A cell a spreadsheet would run (lib/csv/formula-guard.ts): = + - @ first, after spaces, breaks or their full width forms too. */
export function looksLikeFormula(cell: string): boolean {
  return startsLikeFormula(cell)
}

/** RFC 4180 rows: quoted cells, "" inside quotes, commas, semicolons or tabs between cells (whichever the header uses). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "")
  const firstLine = src.slice(0, src.search(/\r?\n|$/))
  const sep = [",", ";", "\t"].map((s) => [s, firstLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === "") quoted = true
    else if (ch === sep) {
      row.push(cell)
      cell = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else cell += ch
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""))
}

export interface ImportRow {
  /** The row's line in the file, the header being line 1. */
  line: number
  order: string
  carrier: string
  tracking: string
  trackingUrl: string
  sku: string
  /** Null when the row gives none: all that is left of the item, or of the order. */
  quantity: number | null
  /** Why the row can't be read at all; the server adds what it finds against the order. */
  error: string | null
}

type Column = "order" | "carrier" | "tracking" | "trackingUrl" | "sku" | "quantity"

function columnOf(header: string): Column | null {
  const h = header.trim().toLowerCase().replace(/[^a-z0-9#]+/g, " ").trim()
  if (/^(order|order number|order no|order #|order id|order name|name)$/.test(h)) return "order"
  if (/^(carrier|courier|carrier name|shipping carrier|shipping company)$/.test(h)) return "carrier"
  if (/^(tracking|tracking number|tracking no|tracking #|tracking code|tracking id)$/.test(h)) return "tracking"
  if (/^(tracking link|tracking url|link|url)$/.test(h)) return "trackingUrl"
  if (/^(sku|item sku|variant sku|product sku)$/.test(h)) return "sku"
  if (/^(quantity|qty|units|quantity shipped)$/.test(h)) return "quantity"
  return null
}

/** Without a header row the columns are taken in this order. */
const POSITIONAL: Column[] = ["order", "carrier", "tracking", "sku", "quantity"]

/**
 * The rows of a tracking CSV, each with its own error when it can't be read.
 * `error` on the result is for the file as a whole (too big, no order column).
 */
export function readTrackingCsv(text: string): { rows: ImportRow[]; error: string | null } {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) return { rows: [], error: "That file is larger than 512 KB. Split it and import each part." }
  const all = parseCsv(text)
  if (all.length === 0) return { rows: [], error: "That file has no rows." }
  const mapped = all[0].map(columnOf)
  const hasHeader = mapped.includes("order") || mapped.includes("tracking")
  const columns: (Column | null)[] = hasHeader ? mapped : POSITIONAL
  if (hasHeader && !columns.includes("order")) return { rows: [], error: "The file needs an Order column." }
  const body = hasHeader ? all.slice(1) : all
  if (body.length > IMPORT_MAX_ROWS) return { rows: [], error: `That file has more than ${IMPORT_MAX_ROWS} rows. Split it and import each part.` }
  const rows = body.map((cells, i): ImportRow => {
    const get = (c: Column) => {
      const at = columns.indexOf(c)
      return at >= 0 ? (cells[at] ?? "").trim() : ""
    }
    const r: ImportRow = { line: i + (hasHeader ? 2 : 1), order: get("order"), carrier: get("carrier"), tracking: get("tracking"), trackingUrl: get("trackingUrl"), sku: get("sku"), quantity: null, error: null }
    const raw = cells.map((c) => c.trim())
    if (raw.some(looksLikeFormula)) {
      /* Refused, not cleaned: what is saved is only ever what the preview showed. */
      r.error = "A cell starts with =, +, - or @, which a spreadsheet runs as a formula. Nothing from this row is used."
      return r
    }
    const q = get("quantity")
    if (q) {
      if (!/^\d{1,5}$/.test(q) || Number(q) < 1) r.error = "The quantity must be a whole number of 1 or more."
      else r.quantity = Number(q)
    }
    if (!r.error && !r.order) r.error = "The order number is missing."
    if (!r.error && r.tracking && !/^[A-Za-z0-9 -]{4,60}$/.test(r.tracking)) r.error = "Check the tracking number."
    if (!r.error && r.trackingUrl && !/^https:\/\/[^\s"'<>]+$/.test(r.trackingUrl)) r.error = "The tracking link must start with https://."
    if (!r.error && r.carrier.length > 40) r.error = "The carrier name is longer than 40 characters."
    return r
  })
  return { rows, error: null }
}

/** "#1004" and "1004" are the Orders page's number; "#AB12CD34" the buyer's reference. */
export function orderRefOf(raw: string): { kind: "number"; value: number } | { kind: "reference"; value: string } | null {
  const v = raw.trim().replace(/^#/, "")
  if (/^\d{1,7}$/.test(v)) return { kind: "number", value: Number(v) }
  if (/^[0-9a-f]{8}$/i.test(v)) return { kind: "reference", value: v.toLowerCase() }
  return null
}
