/**
 * ===========================================================================
 *  THE PACKING SLIP: WHAT GOES IN THE BOX, AND WHERE IT GOES
 * ===========================================================================
 * One order's slip, as a whole printable page (app/api/physical/orders/[id]/
 * packing-slip): the store's name and logo, the order's reference (the one
 * the buyer's emails and order page use, so the slip in the box matches
 * them), the date, where it ships (or who picks it up), how it ships, each
 * item with its picture, variant, SKU and what the buyer asked for on it (an
 * engraving), how many, and the buyer's note and the cart's own fields (a
 * gift message). No prices: the slip travels with the parcel.
 *
 * Which items:
 *   a shipment (f)     what that parcel holds
 *   a place (loc)      what is still to send from there
 *   neither            what is still to send; everything, once it all has
 *
 * Paper and prices (the bar's controls, never printed):
 *   paper              A4 or Letter, chosen on the bar: @page is sized to it.
 *                      Not chosen, the printer's own paper is used (the
 *                      print dialog keeps its paper choice), and the bar
 *                      shows the one the browser's language region uses:
 *                      Letter for the US, Canada, Mexico and the other
 *                      Letter countries, A4 everywhere else.
 *   prices             off by default, as the slip travels with the parcel.
 *                      On, each item has its price and the whole order's
 *                      slip its totals: an order summary to print or save
 *                      as a PDF from the print dialog. The invoice PDF
 *                      stays on the order's own menu (app/api/invoice).
 *
 * Pure: the route reads the order and the store, the suite renders it.
 */

import { addressLines } from "./address"
import { formatMinor } from "@/lib/markets/money"
import { propertyText } from "@/lib/cart-uploads/rules"

export type SlipPaper = "a4" | "letter"

/* Where paper comes in Letter (ANSI) size; everywhere else uses A4. */
const LETTER_REGIONS = new Set(["US", "CA", "MX", "PH", "CL", "CO", "VE", "GT", "CR", "PA", "DO", "SV", "NI", "HN", "PR", "BZ", "BO"])

/** The paper the seller chose on the bar, or null for the printer's own. */
export function paperAsked(asked: unknown): SlipPaper | null {
  return asked === "a4" || asked === "letter" ? asked : null
}

/** The paper asked for, else the one the reader's language region uses ("en-US" Letter, "de-DE" A4). */
export function slipPaper(asked: unknown, acceptLanguage: string | null | undefined): SlipPaper {
  const chosen = paperAsked(asked)
  if (chosen) return chosen
  const first = String(acceptLanguage ?? "").split(",")[0]?.trim() ?? ""
  const region = first.split(/[-_]/)[1]?.toUpperCase() ?? ""
  return LETTER_REGIONS.has(region) ? "letter" : "a4"
}

/** The order's totals, for a slip printed with prices. */
export interface SlipTotals {
  currency: string
  itemsSubtotalCents: number
  discountCents: number
  shippingCents: number
  shippingDiscountCents: number
  taxCents: number
  taxIncluded: boolean
  taxLabel: string
  totalCents: number
  refundedCents: number
}

type Tt = (source: string, vars?: Record<string, string | number>) => string

/** What the slip reads of an order (lib/physical/orders-server PhysicalOrder). */
export interface SlipOrder {
  id: string
  createdAt: string
  paidAt?: string | null
  address: Record<string, unknown> | null
  delivery: { name: string; kind?: "ship" | "local" } | null
  deliveryMethod: string
  pickup: { name: string; address: string[] } | null
  buyerName: string | null
  buyerNote: string | null
  cartAttributes?: Record<string, string> | null
  lines: { orderId: string; title: string; variantName: string | null; sku: string | null; imageUrl: string | null; quantity: number; fulfilled: number; requiresShipping: boolean; locationId: string | null; properties?: Record<string, string> | null; unitCents?: number | null }[]
  shipments: { id: string; status: string; locationId: string | null; carrier: string | null; trackingNumber: string | null; items: { orderId: string; quantity: number }[] }[]
}

export interface SlipLine {
  title: string
  variant: string | null
  sku: string | null
  imageUrl: string | null
  quantity: number
  properties: [string, string][]
  /** One unit's price as sold, shown only on a slip printed with prices. */
  unitCents: number | null
}

/** The items on the slip, by the rules above. */
export function slipLines(order: SlipOrder, pick: { shipmentId?: string | null; locationId?: string | null } = {}): SlipLine[] {
  const asLine = (l: SlipOrder["lines"][number], quantity: number): SlipLine => ({
    title: l.title,
    variant: l.variantName,
    sku: l.sku,
    imageUrl: l.imageUrl,
    quantity,
    /* A picture the buyer sent, by its file name (lib/cart-uploads): the picture itself is on the order page. */
    properties: Object.entries(l.properties ?? {}).filter(([k, v]) => k.trim() && String(v).trim()).map(([k, v]): [string, string] => [k, propertyText(String(v))]),
    unitCents: typeof l.unitCents === "number" && Number.isFinite(l.unitCents) ? l.unitCents : null,
  })
  const shipment = pick.shipmentId ? order.shipments.find((s) => s.id === pick.shipmentId) : null
  if (shipment) {
    return shipment.items
      .map((i) => {
        const l = order.lines.find((x) => x.orderId === i.orderId)
        return l && i.quantity > 0 ? asLine(l, i.quantity) : null
      })
      .filter((x): x is SlipLine => !!x)
  }
  const ships = order.lines.filter((l) => l.requiresShipping)
  const here = pick.locationId && order.deliveryMethod !== "pickup" ? ships.filter((l) => l.locationId === pick.locationId) : ships
  const left = here.filter((l) => l.quantity - l.fulfilled > 0).map((l) => asLine(l, l.quantity - l.fulfilled))
  return left.length ? left : here.map((l) => asLine(l, l.quantity))
}

/** The order's reference as the buyer reads it (lib/physical/status orderNumber), so what is in the box matches their emails. */
export const slipReference = (checkoutId: string) => `#${checkoutId.replace(/-/g, "").slice(0, 8).toUpperCase()}`

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

/** Only a picture we can load: an https address or one of the site's own paths. */
const safeSrc = (u: string | null | undefined) => (u && (/^https:\/\/[^\s"'<>]+$/.test(u) || /^\/[^\s"'<>]*$/.test(u)) ? u : null)

export interface SlipStore {
  name: string
  logoUrl: string | null
}

/**
 * The whole page. `back` is where the page's Back goes (the order on the Orders page); the bar with
 * Print and Back is never printed.
 */
export function packingSlipHtml(
  order: SlipOrder,
  lines: SlipLine[],
  store: SlipStore,
  o: {
    tt: Tt
    lang: string
    timeZone?: string | null
    back: string
    shipmentLabel?: string | null
    /** The paper chosen on the bar, which sizes @page; null or absent prints on the printer's own. */
    paper?: SlipPaper | null
    /** The paper the bar shows as on when none was chosen. */
    paperShown?: SlipPaper
    /** Each item's price, and with `totals` (the whole order's slip) the order's totals. */
    prices?: { currency: string; totals: SlipTotals | null } | null
    /** The bar's links to this slip on the other paper, and with prices turned the other way. Absent: no controls. */
    controls?: { a4: string; letter: string; prices: string } | null
  },
): string {
  const { tt } = o
  const ref = slipReference(order.id)
  const paper = o.paper ?? o.paperShown ?? "a4"
  const pageSize = o.paper ? `size:${o.paper === "letter" ? "letter" : "A4"};margin:${o.paper === "letter" ? "0.5in" : "14mm"}` : "margin:14mm"
  const priced = o.prices ?? null
  const price = (cents: number) => esc(formatMinor(cents, priced?.currency ?? "USD", o.lang))
  const when = (() => {
    try {
      return new Intl.DateTimeFormat(o.lang, { dateStyle: "long", timeZone: o.timeZone || "UTC" }).format(new Date(order.paidAt || order.createdAt))
    } catch {
      return new Date(order.paidAt || order.createdAt).toISOString().slice(0, 10)
    }
  })()
  const pickup = order.deliveryMethod === "pickup"
  const address = pickup ? [] : addressLines(order.address as never)
  const count = lines.reduce((n, l) => n + l.quantity, 0)
  const attributes = Object.entries(order.cartAttributes ?? {}).filter(([k, v]) => k.trim() && String(v).trim())
  const logo = safeSrc(store.logoUrl)
  const to = pickup
    ? `<h2>${esc(tt("Picked up by"))}</h2><p>${esc(order.buyerName || tt("The buyer"))}</p>${order.pickup ? `<p class="muted">${esc(tt("At {place}", { place: order.pickup.name }))}</p>` : ""}`
    : `<h2>${esc(tt("Ship to"))}</h2>${address.length ? `<p>${address.map(esc).join("<br>")}</p>` : `<p class="muted">${esc(tt("No address"))}</p>`}`
  const how = pickup ? tt("Local pickup") : order.delivery?.name || null
  const rows = lines
    .map((l) => {
      const img = safeSrc(l.imageUrl)
      const sub = [l.variant, l.sku ? tt("SKU {sku}", { sku: l.sku }) : null].filter(Boolean).map(esc).join(" · ")
      const props = l.properties.map(([k, v]) => `<div class="prop">${esc(k)}: ${esc(v)}</div>`).join("")
      const cells = priced ? `<td class="amt">${l.unitCents != null ? price(l.unitCents) : ""}</td><td class="qty">${l.quantity}</td><td class="amt">${l.unitCents != null ? price(l.unitCents * l.quantity) : ""}</td>` : `<td class="qty">${l.quantity}</td>`
      return `<tr><td class="pic">${img ? `<img src="${esc(img)}" alt="" width="44" height="44">` : `<span class="ph"></span>`}</td><td><div class="title">${esc(l.title)}</div>${sub ? `<div class="muted">${sub}</div>` : ""}${props}</td>${cells}</tr>`
    })
    .join("")
  const cols = priced ? 5 : 3
  const head = priced ? `<th colspan="2">${esc(tt("Items"))}</th><th class="amt">${esc(tt("Each"))}</th><th class="qty">${esc(tt("Qty"))}</th><th class="amt">${esc(tt("Amount"))}</th>` : `<th colspan="2">${esc(tt("Items"))}</th><th class="qty">${esc(tt("Qty"))}</th>`
  const t = priced?.totals ?? null
  const sums = t
    ? [
        [tt("Subtotal"), price(t.itemsSubtotalCents)],
        ...(t.discountCents > 0 ? [[tt("Discount"), `−${price(t.discountCents)}`]] : []),
        [tt("Shipping"), price(Math.max(0, t.shippingCents - t.shippingDiscountCents))],
        ...(t.taxCents > 0 ? [[t.taxIncluded ? tt("{label} included", { label: t.taxLabel }) : t.taxLabel, price(t.taxCents)]] : []),
        [tt("Total"), price(t.totalCents)],
        ...(t.refundedCents > 0 ? [[tt("Refunded"), `−${price(t.refundedCents)}`]] : []),
      ]
        .map(([k, v]) => `<div class="sum${k === tt("Total") ? " strong" : ""}"><span>${esc(k)}</span><span>${v}</span></div>`)
        .join("")
    : ""
  const controls = o.controls
    ? `<span class="ctl" role="group" aria-label="${esc(tt("Paper"))}"><a href="${esc(o.controls.a4)}"${paper === "a4" ? ' aria-current="true"' : ""} data-slip-paper="a4">A4</a><a href="${esc(o.controls.letter)}"${paper === "letter" ? ' aria-current="true"' : ""} data-slip-paper="letter">${esc(tt("Letter"))}</a></span><a class="tog" href="${esc(o.controls.prices)}" data-slip-prices="${priced ? "on" : "off"}">${esc(priced ? tt("Hide prices") : tt("Show prices"))}</a>`
    : ""
  const notes = [
    order.buyerNote?.trim() ? `<section class="note"><h2>${esc(tt("Note from the buyer"))}</h2><p>${esc(order.buyerNote.trim()).replace(/\n/g, "<br>")}</p></section>` : "",
    attributes.length ? `<section class="note"><h2>${esc(tt("From the cart"))}</h2>${attributes.map(([k, v]) => `<p><span class="muted">${esc(k)}:</span> ${esc(v)}</p>`).join("")}</section>` : "",
  ].join("")
  const title = `${priced ? tt("Order summary") : tt("Packing slip")} ${ref}`
  return `<!doctype html>
<html lang="${esc(o.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}html{background:#f3f4f6;-webkit-text-size-adjust:100%}
body{margin:0;font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#1a1a2e;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.bar{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 16px;padding-top:calc(env(safe-area-inset-top,0px) + 10px);background:rgba(243,244,246,.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.bar a,.bar button{display:inline-flex;align-items:center;height:40px;padding:0 14px;border-radius:8px;font:500 14px/1 inherit;font-family:inherit;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.bar a{color:#1a1a2e;background:#fff;border:1px solid #e5e7eb}.bar button{color:#fff;background:#1a1a2e;border:0}
.paper{max-width:760px;margin:8px auto 32px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.05),0 12px 32px -16px rgba(17,24,39,.18);padding:32px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:20px;border-bottom:1px solid #e5e7eb}
.store{display:flex;align-items:center;gap:12px;min-width:0}.store img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none}.store b{font-size:17px;font-weight:600;overflow-wrap:anywhere}
.doc{text-align:right;flex:none}.doc .k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}.doc .ref{font-size:20px;font-weight:700;margin-top:2px}.doc .muted{margin-top:2px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;padding:20px 0;border-bottom:1px solid #e5e7eb}
h2{margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b7280}p{margin:0}
.muted{color:#6b7280;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:12px}th{font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;text-align:left;padding:8px 0;border-bottom:1px solid #e5e7eb}
td{padding:12px 0;border-bottom:1px solid #f0f1f3;vertical-align:top}.pic{width:58px}.pic img,.ph{display:block;width:44px;height:44px;border-radius:8px;object-fit:cover;background:#f4f5f7;border:1px solid #eceef1}
.title{font-weight:600}.prop{font-size:13px;margin-top:2px}.qty{width:64px;text-align:right;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}th.qty{font-size:12px;font-weight:600}
.total{display:flex;justify-content:flex-end;padding:12px 0 4px;font-weight:600}
.amt{width:96px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}th.amt{font-size:12px}td.amt{padding-left:8px}
.sums{margin:8px 0 0 auto;max-width:300px}.sum{display:flex;justify-content:space-between;gap:16px;padding:3px 0;font-variant-numeric:tabular-nums}.sum.strong{font-weight:700;border-top:1px solid #e5e7eb;margin-top:4px;padding-top:8px}
.mid{display:flex;align-items:center;gap:6px;min-width:0}
.bar .ctl{display:inline-flex;padding:2px;border-radius:9px;background:#e5e7eb}.bar .ctl a{height:36px;padding:0 10px;border:0;background:transparent;color:#4b5563}.bar .ctl a[aria-current]{background:#fff;color:#1a1a2e;box-shadow:0 1px 2px rgba(16,24,40,.08)}
.bar a.tog{padding:0 12px}
.note{margin-top:20px;padding:12px 14px;border:1px solid #e5e7eb;border-radius:10px}.note p+p{margin-top:2px}
footer{margin-top:28px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px}
@media (max-width:560px){.paper{margin:0 0 24px;border-radius:0;box-shadow:none;padding:20px 16px}header{flex-direction:column;gap:12px}.doc{text-align:left}.cols{grid-template-columns:1fr;gap:16px}.bar{padding-left:12px;padding-right:12px;gap:6px}.bar a,.bar button{padding:0 10px}.bar .ctl a{padding:0 8px}.amt{width:72px}}
@media print{html,body{background:#fff}.bar{display:none}.paper{max-width:none;margin:0;padding:0;border-radius:0;box-shadow:none}@page{${pageSize}}tr{break-inside:avoid}}
</style></head><body data-slip-paper="${o.paper ?? "printer"}">
<div class="bar" data-slip-bar><a href="${esc(o.back)}">${esc(tt("Back"))}</a>${controls ? `<div class="mid">${controls}</div>` : ""}<button type="button" onclick="window.print()">${esc(tt("Print"))}</button></div>
<main class="paper" data-packing-slip>
<header><div class="store">${logo ? `<img src="${esc(logo)}" alt="">` : ""}<b>${esc(store.name)}</b></div><div class="doc"><div class="k">${esc(priced ? tt("Order summary") : tt("Packing slip"))}</div><div class="ref">${esc(tt("Order {number}", { number: ref }))}</div><div class="muted">${esc(when)}</div>${o.shipmentLabel ? `<div class="muted">${esc(o.shipmentLabel)}</div>` : ""}</div></header>
<div class="cols"><section>${to}</section><section>${how ? `<h2>${esc(pickup ? tt("Delivery") : tt("Shipping method"))}</h2><p>${esc(how)}</p>` : ""}</section></div>
<table><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="${cols}" class="muted">${esc(tt("Nothing to pack."))}</td></tr>`}</tbody></table>
<div class="total">${esc(tt("{n, plural, one {# item} other {# items}}", { n: count }))}</div>
${sums ? `<div class="sums" data-slip-totals>${sums}</div>` : ""}
${notes}
<footer>${esc(tt("Thank you for your order. {store}", { store: store.name }))}</footer>
</main></body></html>`
}
