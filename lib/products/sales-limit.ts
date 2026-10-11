/**
 * ===========================================================================
 *  LIMIT SALES, FOR A DOWNLOAD: HOW MANY COPIES CAN EVER BE SOLD
 * ===========================================================================
 * The product editor's "Limit sales" for a download, a course or anything
 * else that does not ship (a thing that ships has stock and "up to N per
 * order" instead, lib/physical/order-limit.ts). Kept on the product as
 * `products.sales_limit` (SQL part 133). The words and the arithmetic every
 * surface shares live here, with no server code, so the editor, the product
 * page and the shop's cards say the same thing. The checkout's side, which
 * holds a copy before anything is charged, is lib/checkout/sales-limit.ts.
 */

/** The highest limit a seller can type, the same as the database's check. */
export const MAX_SALES_LIMIT = 1_000_000

/** Under this many copies left, the product page says how many. */
export const FEW_LEFT = 10

/** What a buyer is told when the last copy has gone, at the checkout and on the page. */
export const SOLD_OUT = "Sold out"

/** What the checkout answers when the last copy has gone, naming the product when it can. */
export function soldOutMessage(title?: string | null): string {
  const name = typeof title === "string" ? title.trim().slice(0, 120) : ""
  return name ? `Sold out. Every copy of ${name} has been sold.` : "Sold out. Every copy has been sold."
}

/** A stored or typed limit as a whole number from 1 to 1,000,000, or null for none. */
export function readSalesLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null
  const n = typeof value === "number" ? value : Number.parseInt(String(value), 10)
  if (!Number.isFinite(n)) return null
  const whole = Math.floor(n)
  return whole >= 1 ? Math.min(MAX_SALES_LIMIT, whole) : null
}

/** What the box takes as it is typed: digits only, no leading zero, at most seven of them. */
export function typedSalesLimit(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 7)
}

/** The column is missing: part 133 has not run. */
export function missingSalesLimit(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42703" || error.code === "PGRST204" || /sales_limit/.test(error.message ?? "")
}

/** A product's standing under its limit, as the database counted it (product_sales_status). */
export interface SalesStanding {
  limit: number
  /** Copies in paid orders, refunds given back. */
  sold: number
  /** Copies held by payments in progress. */
  held: number
}

/** Copies a new buyer could still take. Never below zero. */
export function copiesLeft(s: SalesStanding): number {
  return Math.max(0, s.limit - s.sold - s.held)
}

/** Sold out: no copy left for a new buyer. */
export function salesSoldOut(s: SalesStanding | null | undefined): boolean {
  return !!s && copiesLeft(s) <= 0
}

/** "Only 3 left" while fewer than FEW_LEFT remain, else nothing. Sold out is said by SOLD_OUT. */
export function fewLeftText(s: SalesStanding | null | undefined): string | null {
  if (!s) return null
  const left = copiesLeft(s)
  return left > 0 && left < FEW_LEFT ? `Only ${left} left` : null
}

/** The editor's line under the box: "12 of 100 sold". */
export function soldOfText(sold: number, limit: number): string {
  return `${Math.max(0, Math.floor(sold)).toLocaleString("en-US")} of ${limit.toLocaleString("en-US")} sold`
}

/** A type that has a total cap rather than stock: everything that does not ship. */
export function capsSales(type: string | null | undefined): boolean {
  return type !== "physical"
}
