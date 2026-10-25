import { NextResponse } from "next/server"
import { sellerOrderNumbers } from "@/lib/orders/order-number-server"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { countryName } from "@/lib/checkout/countries"
import { orderNumber } from "@/lib/physical/status"
import { guardFormula } from "@/lib/csv/formula-guard"
import { lineProperties } from "@/lib/physical/cart-link"
import { propertyText } from "@/lib/cart-uploads/rules"
import { offersOfSnapshot } from "@/lib/physical/orders-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Orders read per request, the database's own cap, and the most one file holds. */
const EXPORT_PAGE = 1000
const MAX_EXPORT = 50_000

function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value)
  /* A spreadsheet runs a cell starting with = + - @ as a formula, even after spaces or breaks (lib/csv/formula-guard.ts); a quote first stops that. */
  const safe = guardFormula(s)
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** A line's properties in one cell, every one (the store's own `_` notes too): "Engraving: Ana; _sl_offer_id: …". A buyer's picture by its file name; the picture is on the order page. */
function propertiesText(raw: unknown): string {
  return Object.entries(lineProperties(raw) ?? {}).map(([k, v]) => `${k}: ${propertyText(v)}`).join("; ")
}

/** The offers that saved on a line, by the name the checkout showed: "Buy 2 get 1 free". */
function offersText(raw: unknown): string {
  return (offersOfSnapshot(raw) ?? []).map((o) => o.title).join("; ")
}

/** Orders still to ship (or all, with ?all=1; only some, with ?ids=), one row per item, for a warehouse or a spreadsheet. */
export async function GET(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const params = new URL(request.url).searchParams
  const all = params.get("all") === "1"
  /* Only these orders (the Orders list's Export, Selected): checkout ids, or line ids the list opens orders by. */
  const asked = (params.get("ids") ?? "").split(",").filter(isUuid).slice(0, 500)
  let only: string[] | null = null
  if (asked.length) {
    const { data: rows } = await c.db.from("orders").select("id, checkout_id, products!inner(creator_id)").in("id", asked).eq("products.creator_id", c.creatorId)
    only = [...new Set([...asked, ...((rows ?? []) as { checkout_id: string | null }[]).map((r) => r.checkout_id).filter((x): x is string => !!x)])]
  }
  /*
    A PAGE AT A TIME. One read answers at most the database's row cap (1,000 on Supabase), so `limit(5000)` returned
    the oldest thousand orders and the file left out every newer one without a word: a busy shop's "orders to ship"
    missed the ones it had to ship next. Read in pages of 1,000, oldest first, up to MAX_EXPORT.
  */
  const query = () => {
    let q = c.db
      .from("commerce_checkouts")
      .select("id, paid_at, buyer_name, buyer_email, buyer_phone, shipping_address, shipping_rate, lines, fulfillment_status, buyer_note")
      .eq("creator_id", c.creatorId)
      .in("status", ["paid", "partially_refunded"])
      .order("paid_at", { ascending: true })
      .order("id", { ascending: true })
    if (!all) q = q.in("fulfillment_status", ["unfulfilled", "processing", "partially_fulfilled"])
    if (only) q = q.in("id", only)
    return q
  }
  const data: Record<string, any>[] = []
  for (let from = 0; from < MAX_EXPORT; from += EXPORT_PAGE) {
    const { data: page, error } = await query().range(from, from + EXPORT_PAGE - 1)
    if (error) return NextResponse.json({ error: "The orders could not be read. Try again." }, { status: 500 })
    data.push(...((page ?? []) as Record<string, any>[]))
    if (!page || page.length < EXPORT_PAGE) break
  }
  /* Properties and Offers last, so a sheet reading columns by place still reads the ones before. */
  const header = ["Order", "Paid at", "Fulfillment", "Name", "Email", "Phone", "Address 1", "Address 2", "City", "Region", "Postal code", "Country", "Delivery", "Product", "Variant", "SKU", "Quantity", "Note", "Buyer reference", "Properties", "Offers"]
  const rows: string[] = [header.join(",")]
  /* Order: the Orders page's number; Buyer reference: what the buyer's emails and packing slip say (lib/orders/order-number-server.ts). */
  const numbers = await sellerOrderNumbers(c.db, c.creatorId)
  for (const o of (data ?? []) as Record<string, any>[]) {
    const a = o.shipping_address ?? {}
    for (const l of (o.lines ?? []) as Record<string, any>[]) {
      if (!l.requires_shipping) continue
      rows.push(
        [numbers?.byCheckout.get(o.id) ? `#${numbers.byCheckout.get(o.id)}` : orderNumber(o.id), o.paid_at, o.fulfillment_status, a.name ?? o.buyer_name, o.buyer_email, a.phone ?? o.buyer_phone, a.line1, a.line2, a.city, a.region, a.postalCode, a.country ? countryName(a.country) : "", o.shipping_rate?.name, l.title, l.variant_name, l.sku, l.quantity, o.buyer_note, orderNumber(o.id).replace(/^#/, ""), propertiesText(l.properties), offersText(l.offers)]
          .map(cell)
          .join(","),
      )
    }
  }
  return new NextResponse(rows.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="orders-to-ship-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
  })
}
