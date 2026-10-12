import { NextResponse } from "next/server"
import { sellerOrderNumbers } from "@/lib/orders/order-number-server"
import { physicalCaller } from "@/lib/physical/auth"
import { countryName } from "@/lib/checkout/countries"
import { orderNumber } from "@/lib/physical/status"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  /* A spreadsheet runs a cell starting with = + - @ as a formula; a quote first stops that. */
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Orders still to ship (or all, with ?all=1), one row per item, for a warehouse or a spreadsheet. */
export async function GET(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const all = new URL(request.url).searchParams.get("all") === "1"
  let q = c.db
    .from("commerce_checkouts")
    .select("id, paid_at, buyer_name, buyer_email, buyer_phone, shipping_address, shipping_rate, lines, fulfillment_status, buyer_note")
    .eq("creator_id", c.creatorId)
    .in("status", ["paid", "partially_refunded"])
    .order("paid_at", { ascending: true })
    .limit(5000)
  if (!all) q = q.in("fulfillment_status", ["unfulfilled", "processing", "partially_fulfilled"])
  const { data } = await q
  const header = ["Order", "Paid at", "Fulfillment", "Name", "Email", "Phone", "Address 1", "Address 2", "City", "Region", "Postal code", "Country", "Delivery", "Product", "Variant", "SKU", "Quantity", "Note", "Buyer reference"]
  const rows: string[] = [header.join(",")]
  /* Order: the Orders page's number; Buyer reference: what the buyer's emails and packing slip say (lib/orders/order-number-server.ts). */
  const numbers = await sellerOrderNumbers(c.db, c.creatorId)
  for (const o of (data ?? []) as Record<string, any>[]) {
    const a = o.shipping_address ?? {}
    for (const l of (o.lines ?? []) as Record<string, any>[]) {
      if (!l.requires_shipping) continue
      rows.push(
        [numbers?.byCheckout.get(o.id) ? `#${numbers.byCheckout.get(o.id)}` : orderNumber(o.id), o.paid_at, o.fulfillment_status, a.name ?? o.buyer_name, o.buyer_email, a.phone ?? o.buyer_phone, a.line1, a.line2, a.city, a.region, a.postalCode, a.country ? countryName(a.country) : "", o.shipping_rate?.name, l.title, l.variant_name, l.sku, l.quantity, o.buyer_note, orderNumber(o.id).replace(/^#/, "")]
          .map(cell)
          .join(","),
      )
    }
  }
  return new NextResponse(rows.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-to-ship-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  })
}
