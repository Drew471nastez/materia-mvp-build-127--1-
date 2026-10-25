/**
 * THE ORDERS CSV
 *
 * Written in the browser from the orders already on the page
 * (app/app/orders/export-dialog.tsx), and on the server for the phone app,
 * where a file made in the page cannot be saved (lib/platform/save-file.ts):
 * the app asks for a short lived link and the server writes the same file
 * from the same rows. One function, so the two files cannot differ.
 *
 * Two kinds of CSV, because they are read by different things:
 *   for spreadsheets   a byte order mark and CRLF line ends, which is what
 *                      makes Excel read "Zoë" as Zoë rather than ZoÃ«
 *   plain              UTF-8 and LF, for scripts and other tools
 */
import { guardFormula } from "@/lib/csv/formula-guard"
import { FULFILLMENT_LABEL, PAYMENT_LABEL, SOURCE_LABEL, type Order } from "./order-view"
import { sourceDetailText } from "./order-source"
import { orderCurrency } from "./money"
import { minorUnits } from "@/lib/markets/money"

/** Minor units as a plain number in the currency's own decimals: 1000 USD is "10.00", 2500 JPY is "2500". */
function units(minor: number, currency: string | null | undefined): string {
  const d = minorUnits(orderCurrency(currency))
  return ((Number.isFinite(minor) ? minor : 0) / 10 ** d).toFixed(d)
}

export type ExportFormat = "spreadsheet" | "plain"

function offersText(o: Order, currency: string | null | undefined): string {
  const sums = new Map<string, number>()
  for (const l of o.lines as { offers?: { title: string; savedCents: number }[] | null }[]) for (const x of l.offers ?? []) sums.set(x.title, (sums.get(x.title) ?? 0) + x.savedCents)
  return [...sums].map(([t, c]) => `${t} ${units(c, currency)}`).join("; ")
}

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === "spreadsheet" || value === "plain"
}

/** A cell a spreadsheet would read as a formula is written as text. */
export function csvCell(value: string | number): string {
  let s = String(value ?? "")
  s = guardFormula(s)
  return `"${s.replace(/"/g, '""')}"`
}

export const CSV_HEADER = [
  "Order",
  "Date",
  "Customer",
  "Email",
  "Source",
  "Source detail",
  "Items",
  "Products",
  "Total",
  "Refunded",
  "Currency",
  "Payment status",
  "Fulfillment status",
  "Delivery status",
  "Offers",
]

/** The file's text. Pure, so tests/date-range.test.ts can read it. */
export function ordersCsv(orders: Order[], timeZone: string, format: ExportFormat): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
  const lines = orders.map((o) =>
    [
      `#${o.number}`,
      date.format(new Date(o.createdAt)).replace(",", ""),
      o.customerName || "",
      o.customerEmail || "",
      o.source ? SOURCE_LABEL[o.source] : "",
      sourceDetailText(o.source, o.sourceDetail ?? null),
      o.itemCount,
      o.lines.map((l) => l.product?.title || "").join("; "),
      /* In the order's own currency and its own decimals (¥2500 is "2500", never "25.00"), named in the next column, as Shopify's export does: a sheet of lei and euro orders never reads as one currency. */
      units(o.totalCents, o.currency),
      units(o.refundedCents, o.currency),
      orderCurrency(o.currency),
      PAYMENT_LABEL[o.payment],
      FULFILLMENT_LABEL[o.fulfillment],
      o.delivery === "delivered" ? "Delivered" : o.delivery === "failed" ? "Not delivered" : "",
      /* Each offer that saved on the order, by name, with what it saved over its lines: "Buy 2 get 1 free 36.00". */
      offersText(o, o.currency),
    ]
      .map(csvCell)
      .join(","),
  )
  const eol = format === "spreadsheet" ? "\r\n" : "\n"
  const body = [CSV_HEADER.map(csvCell).join(","), ...lines].join(eol) + eol
  return format === "spreadsheet" ? `﻿${body}` : body
}

/* ─── Which orders, in few characters ─────────────────────────────────── */

/**
 * The app's link names the chosen orders by number, in the order the file
 * lists them, as runs: "1500-1001" is five hundred orders newest first, and
 * "1003,1007-1009" is four. A link that listed ids would be tens of
 * kilobytes for a year of sales; numbers are stable (an order keeps its
 * number as newer ones arrive, see groupOrders) and a run is a few bytes.
 */
export const MAX_RUN_ORDERS = 100_000

export function encodeRuns(numbers: number[]): string {
  const runs: string[] = []
  let i = 0
  while (i < numbers.length) {
    const start = numbers[i]
    let end = start
    let step = 0
    let j = i + 1
    if (j < numbers.length && Math.abs(numbers[j] - start) === 1) {
      step = numbers[j] - start
      while (j < numbers.length && numbers[j] - numbers[j - 1] === step) j++
      end = numbers[j - 1]
    }
    runs.push(start === end ? String(start) : `${start}-${end}`)
    i = j
  }
  return runs.join(",")
}

/** The numbers back, in order. Null for anything that is not a list of runs. */
export function decodeRuns(text: string): number[] | null {
  if (typeof text !== "string" || !/^\d+(-\d+)?(,\d+(-\d+)?)*$/.test(text)) return null
  const out: number[] = []
  for (const run of text.split(",")) {
    const [a, b] = run.split("-").map((n) => Number.parseInt(n, 10))
    const end = b ?? a
    const step = end >= a ? 1 : -1
    if (out.length + Math.abs(end - a) + 1 > MAX_RUN_ORDERS) return null
    for (let n = a; step > 0 ? n <= end : n >= end; n += step) out.push(n)
  }
  return out
}

/** The orders a list of numbers names, in the list's order. Unknown numbers are skipped. */
export function pickByNumber(orders: Order[], numbers: number[]): Order[] {
  const byNumber = new Map(orders.map((o) => [o.number, o]))
  const seen = new Set<number>()
  const out: Order[] = []
  for (const n of numbers) {
    const order = byNumber.get(n)
    if (order && !seen.has(n)) {
      seen.add(n)
      out.push(order)
    }
  }
  return out
}

/** A file name the server will put in a header: letters, digits, dot, dash, underscore. */
export function safeFileName(name: unknown, fallback: string): string {
  const cleaned = typeof name === "string" ? name.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80) : ""
  return cleaned && !cleaned.startsWith(".") ? cleaned : fallback
}
