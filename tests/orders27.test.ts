/**
 * ROUND 27, THE SELLER'S ORDERS (K27): H1 TO H9
 *
 *   carriers        one shared list: ids, names, aliases, logos on disk, the tracking page per carrier,
 *                   popular carriers first for the shipping country
 *   logo            <CarrierLogo>: the carrier's tile, a neutral mark for anyone else
 *   tracking rule   a number for every carrier, none only for local delivery / no tracking, on the server too
 *   packing slip    a page per order: items, variants, quantities, address, notes; a shipment's own; prints on a computer,
 *                   opens on a phone (it used to be a window.open a phone blocks)
 *   unseen          an order nobody opened is marked (SQL part 224), opening it clears it, an older database shows nothing
 *   the list        a parcel's carrier logo beside its badge and on the timeline, not a truck
 *   the dialog      Fulfill items: quantities, the carrier picker, the number, the email preview, no X on a phone
 *   home            the announcements' dot is mustard
 *
 * Run: node scripts/run-push-tests.mjs (suite orders27)
 */
import { readFileSync, existsSync, statSync } from "node:fs"
import { join } from "node:path"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { CARRIER_LIST, CARRIER_NAMES, POPULAR_IN, carrierChoices, carrierLogo, carrierOf, carrierTrackingUrl, trackingRuleProblem } from "@/lib/physical/carriers"
import { CarrierLogo } from "@/components/physical/carrier-logo"
import { packingSlipHtml, slipLines, slipReference, type SlipOrder } from "@/lib/physical/packing-slip"
import { groupOrders, type OrderRow } from "@/lib/orders/order-view"
import { toOrderRow } from "@/lib/orders/load-rows"
import { physicalEvents } from "@/lib/orders/timeline"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    process.stdout.write(`  ok    ${label}\n`)
  } else {
    failed++
    process.stdout.write(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail.slice(0, 600) : JSON.stringify(detail).slice(0, 600)}`}\n`)
  }
}
const section = (t: string) => process.stdout.write(`\n${t}\n`)
export const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  section("Carriers: the shared list")
  {
    const wanted = ["DHL", "DHL Express", "UPS", "FedEx", "USPS", "DPD", "GLS", "TNT", "Royal Mail", "Evri", "Hermes", "PostNL", "Poste Italiane", "La Poste / Colissimo", "Correos", "InPost", "Posta Romana", "FAN Courier", "Sameday", "Cargus", "Canada Post", "Australia Post", "Amazon Logistics"]
    const missing = wanted.filter((n) => !CARRIER_LIST.some((c) => c.name === n))
    check("the popular set the owner named is all there", missing.length === 0, missing)
    check("ids are unique and file safe", new Set(CARRIER_LIST.map((c) => c.id)).size === CARRIER_LIST.length && CARRIER_LIST.every((c) => /^[a-z0-9-]+$/.test(c.id)))
    const logos = CARRIER_LIST.map((c) => ({ id: c.id, path: join(process.cwd(), "public", c.logo) }))
    const absent = logos.filter((l) => !existsSync(l.path)).map((l) => l.id)
    check("every carrier has its logo on disk, local (no hotlink)", absent.length === 0 && CARRIER_LIST.every((c) => c.logo.startsWith("/carriers/")), absent)
    const heavy = logos.filter((l) => existsSync(l.path) && statSync(l.path).size > 6000).map((l) => l.id)
    check("every logo is small (under 6 KB)", heavy.length === 0, heavy)
    check("every carrier's tracking page is https and carries the number", CARRIER_LIST.every((c) => /^https:\/\/[^\s"'<>]+$/.test(c.url("AB123456")) && c.url("AB123456").includes("AB123456")))
    check("ranks follow the list, 1 first", CARRIER_LIST.every((c, i) => c.rank === i + 1))
    check("Other is still the seller's last choice in the old list", CARRIER_NAMES[CARRIER_NAMES.length - 1] === "Other" && CARRIER_NAMES.length === CARRIER_LIST.length + 1)
  }

  section("Carriers: matched however they are written")
  {
    check("by id", carrierOf("fan-courier")?.name === "FAN Courier" && carrierOf("dhl-express")?.name === "DHL Express")
    check("by name, any case and spacing", carrierOf("fan courier")?.name === "FAN Courier" && carrierOf("ROYAL MAIL")?.name === "Royal Mail")
    check("accents taken off: Poșta Română", carrierOf("Poșta Română")?.name === "Posta Romana")
    check("aliases: Hermes UK is Evri, Colissimo is La Poste, DHL Paket is DHL", carrierOf("Hermes UK")?.name === "Evri" && carrierOf("Colissimo")?.name === "La Poste / Colissimo" && carrierOf("DHL Paket")?.name === "DHL")
    check("a name wins over another carrier's alias: DHL is DHL, not DHL Express", carrierOf("DHL")?.id === "dhl" && carrierOf("DHL Express")?.id === "dhl-express")
    check("an unknown carrier is unknown", carrierOf("Speedy Bob") === null && carrierOf("") === null && carrierOf(null) === null)
    check("the logo path follows the match", carrierLogo("fan courier") === "/carriers/fan-courier.webp" && carrierLogo("Speedy Bob") === null)
  }

  section("Carriers: tracking pages")
  {
    const want: [string, string, RegExp][] = [
      ["UPS", "1Z999AA10123456784", /^https:\/\/www\.ups\.com\/track\?tracknum=1Z999AA10123456784$/],
      ["DHL", "JJD000390012345678", /^https:\/\/www\.dhl\.com\/global-en\/home\/tracking\.html\?tracking-id=JJD000390012345678&submit=1$/],
      ["GLS", "12345678901", /^https:\/\/gls-group\.com\/GROUP\/en\/parcel-tracking\?match=12345678901$/],
      ["TNT", "123456789", /^https:\/\/www\.tnt\.com\/.*cons=123456789$/],
      ["Amazon Logistics", "TBA123456789000", /^https:\/\/track\.amazon\.com\/tracking\/TBA123456789000$/],
      ["PostNord", "00370712345678901234", /^https:\/\/portal\.postnord\.com\/tracking\/details\/00370712345678901234$/],
      ["InPost", "520000012345678901234567", /^https:\/\/inpost\.pl\//],
      ["Correos", "PQ4F6P0703673180181750T", /^https:\/\/www\.correos\.es\//],
      ["Poste Italiane", "RR123456789IT", /^https:\/\/www\.poste\.it\//],
    ]
    for (const [carrier, number, re] of want) check(`${carrier}`, re.test(carrierTrackingUrl(carrier, number) ?? ""), carrierTrackingUrl(carrier, number))
    check("DPD in Romania goes to DPD Romania's own page, elsewhere to DPD's", /^https:\/\/tracking\.dpd\.ro\/\?shipmentNumber=80012345678/.test(carrierTrackingUrl("DPD", "80012345678", "ro") ?? "") && /^https:\/\/tracking\.dpd\.de\//.test(carrierTrackingUrl("DPD", "80012345678", "DE") ?? ""))
    check("nothing made up for an unknown carrier or a bad number", carrierTrackingUrl("Speedy Bob", "ABC12345") === null && carrierTrackingUrl("UPS", "<script>") === null)
  }

  section("Carriers: popular first for the shipping country")
  {
    const ro = carrierChoices("RO")
    check("Romania: FAN Courier, Sameday, Cargus first", ro.popular.slice(0, 3).map((c) => c.id).join(",") === "fan-courier,sameday,cargus")
    check("United States: USPS, UPS, FedEx first", carrierChoices("us").popular.slice(0, 3).map((c) => c.id).join(",") === "usps,ups,fedex")
    check("United Kingdom: Royal Mail, Evri first", carrierChoices("GB").popular.slice(0, 2).map((c) => c.id).join(",") === "royal-mail,evri")
    const hu = carrierChoices("HU")
    check("a country without its own row: its carriers first, then the busiest", hu.popular[0]?.id === "gls" && hu.popular.some((c) => c.id === "sameday") && hu.popular.length <= 6)
    const none = carrierChoices(null)
    check("no country: the busiest worldwide", none.popular.map((c) => c.id).join(",") === "dhl-express,ups,fedex,dhl,dpd,gls")
    check("popular and the rest together are every carrier, once", [ro, hu, none].every((x) => x.popular.length + x.rest.length === CARRIER_LIST.length && new Set([...x.popular, ...x.rest].map((c) => c.id)).size === CARRIER_LIST.length))
    check("the rest is by name", ro.rest.map((c) => c.name).join("|") === [...ro.rest].sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.name).join("|"))
    check("every popular id names a real carrier", Object.values(POPULAR_IN).flat().every((id) => CARRIER_LIST.some((c) => c.id === id)))
  }

  section("CarrierLogo")
  {
    const known = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "fan courier", size: 28 }))
    check("a known carrier: its local tile, sized, named", /<img[^>]+src="\/carriers\/fan-courier\.webp"/.test(known) && /width="28"/.test(known) && /alt="FAN Courier"/.test(known) && /loading="lazy"/.test(known), known)
    const beside = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "UPS", decorative: true }))
    check("beside its name: not read twice", /alt=""/.test(beside))
    const other = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: "Speedy Bob", size: 24 }))
    check("an unknown carrier: a neutral tile with its letters", /data-carrier-logo="other"/.test(other) && />SB</.test(other) && /aria-label="Speedy Bob"/.test(other), other)
    const none = renderToStaticMarkup(React.createElement(CarrierLogo, { carrier: null }))
    check("no carrier: a neutral truck, hidden from screen readers", /data-carrier-logo="none"/.test(none) && /<svg/.test(none) && /aria-hidden="true"/.test(none), none)
  }

  section("Tracking number rule")
  {
    check("a carrier with no number is refused, and the seller is told why and what to do", /Add the tracking number/.test(trackingRuleProblem("FAN Courier", "") ?? "") && /Local delivery \/ no tracking/.test(trackingRuleProblem("FAN Courier", null) ?? ""))
    check("an Other carrier needs its number too", !!trackingRuleProblem("Speedy Bob", ""))
    check("a number is enough", trackingRuleProblem("UPS", "1Z999AA10123456784") === null)
    check("no carrier (local delivery, no tracking) needs no number", trackingRuleProblem(null, null) === null && trackingRuleProblem("", "") === null)
  }


  section("Packing slip")
  {
    const order: SlipOrder = {
      id: "85737c57-1111-4111-8111-111111111111",
      createdAt: "2026-10-16T09:00:00Z",
      paidAt: "2026-10-16T09:01:00Z",
      address: { name: "Jordan Blake", line1: "12 Strada Lipscani", line2: "Ap. 4", city: "Bucharest", postalCode: "030031", country: "RO", phone: "+40 712 345 678" },
      delivery: { name: "Standard" },
      deliveryMethod: "ship",
      pickup: null,
      buyerName: "Jordan Blake",
      buyerNote: "Please leave it with the neighbour <b>.",
      cartAttributes: { "Gift message": "Happy birthday" },
      lines: [
        { orderId: "l1", title: "Linen shirt", variantName: "M / Natural", sku: "LS-M", imageUrl: "/api/media/shirt.webp", quantity: 2, fulfilled: 1, requiresShipping: true, locationId: "home", properties: { Engraving: "Ana" } },
        { orderId: "l2", title: "Stoneware mug", variantName: null, sku: null, imageUrl: "javascript:alert(1)", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: "wh" },
        { orderId: "l3", title: "Preset pack", variantName: null, sku: null, imageUrl: null, quantity: 1, fulfilled: 0, requiresShipping: false, locationId: null },
      ],
      shipments: [{ id: "f1", status: "shipped", locationId: "home", carrier: "FAN Courier", trackingNumber: "2345678901234", items: [{ orderId: "l1", quantity: 1 }] }],
    }
    const left = slipLines(order)
    check("what is still to send: the shirt's last one and the mug, never the download", left.length === 2 && left[0].quantity === 1 && left[1].title === "Stoneware mug", left)
    check("from one place: only what leaves from there", slipLines(order, { locationId: "wh" }).map((l) => l.title).join() === "Stoneware mug")
    check("a shipment's own slip: what that parcel holds", JSON.stringify(slipLines(order, { shipmentId: "f1" }).map((l) => [l.title, l.quantity])) === JSON.stringify([["Linen shirt", 1]]))
    const all = { ...order, lines: order.lines.map((l) => ({ ...l, fulfilled: l.quantity })) }
    check("everything sent: the whole order, so a slip can be printed again", slipLines(all).reduce((n, l) => n + l.quantity, 0) === 3)
    const tt = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)(?:, plural[^}]*\{[^}]*\}[^}]*\{([^}]*)\}\})?\}/g, (_, k, other) => (other ? String(other).replace("#", String(v?.[k] ?? "")) : String(v?.[k] ?? "")))
    const html = packingSlipHtml(order, slipLines(order), { name: "Andrew <Rullz>", logoUrl: "https://cdn.example.com/logo.png" }, { tt, lang: "en", timeZone: "Europe/Bucharest", back: "/app/orders?order=l1" })
    check("the buyer's reference, the one their emails use", html.includes(slipReference(order.id)) && slipReference(order.id) === "#85737C57")
    check("the address, the method, the items with variant, SKU and the engraving, the quantities", /Jordan Blake<br>12 Strada Lipscani<br>Ap\. 4<br>Bucharest, 030031<br>Romania/.test(html) && html.includes("Standard") && html.includes("M / Natural · SKU LS-M") && html.includes("Engraving: Ana") && /class="qty">1</.test(html), html.slice(0, 400))
    check("the buyer's note and the cart's fields, escaped", html.includes("Please leave it with the neighbour &lt;b&gt;.") && html.includes("Gift message:") && html.includes("Andrew &lt;Rullz&gt;"))
    check("no prices on the slip", !/[$€]|lei|price/i.test(html.replace(/<style>[\s\S]*?<\/style>/, "")))
    check("a picture only from a safe address", html.includes('src="/api/media/shirt.webp"') && !html.includes("javascript:"))
    check("Back and Print on screen, never on paper", /data-slip-bar/.test(html) && /@media print\{html,body\{background:#fff\}\.bar\{display:none\}/.test(html) && /onclick="window\.print\(\)"/.test(html))
    const pickup = packingSlipHtml({ ...order, deliveryMethod: "pickup", pickup: { name: "Home studio", address: [] } }, left, { name: "S", logoUrl: null }, { tt, lang: "en", back: "/" })
    check("a pickup: who picks it up and where, no address", pickup.includes("Picked up by") && pickup.includes("At Home studio") && !pickup.includes("Ship to"))
    const route = read("app/api/physical/orders/[id]/packing-slip/route.ts")
    check("the route: the shop's own order only, a page, framed by Storelib only", /physicalCaller\("orders"\)/.test(route) && /text\/html/.test(route) && /frame-ancestors 'self'/.test(route) && /noindex/.test(route))
    const panel = read("components/physical/order-panel.tsx")
    check("no window.open for the slip any more: a frame on a computer, a link on a phone", !/window\.open\("", "_blank"/.test(panel) && /srcdoc/.test(panel) && /phone\s*\?\s*\{ label: tt\("Packing slip"\), icon: <Printer className="h-4 w-4" \/>, href \}/.test(panel))
    check("both menus use it: the Unfulfilled card's (by place) and each shipment's", /slip\(\{ loc: pickup \? null : g\.locationId \}\)/.test(panel) && /slip\(\{ f: s\.id \}\)/.test(panel))
  }

  section("Unseen orders")
  {
    const base = { product_id: "p", amount_cents: 1000, status: "completed", created_at: "2026-10-16T09:00:00Z", product: null } as unknown as OrderRow
    const rows: OrderRow[] = [
      { ...base, id: "a", seller_seen_at: null },
      { ...base, id: "b", seller_seen_at: "2026-10-16T10:00:00Z", created_at: "2026-10-15T09:00:00Z" },
      { ...base, id: "c", created_at: "2026-10-14T09:00:00Z" },
      { ...base, id: "d", seller_seen_at: null, status: "failed", created_at: "2026-10-13T09:00:00Z" },
    ]
    const byId = Object.fromEntries(groupOrders(rows).map((o) => [o.id, o.unseen]))
    check("never opened: marked; opened: not; no column (older database): not; a failed payment: not", byId.a === true && byId.b === false && byId.c === false && byId.d === false, byId)
    const withCol = toOrderRow({ id: "x", seller_seen_at: null, created_at: "t" }, undefined)
    const without = toOrderRow({ id: "y", created_at: "t" }, undefined)
    check("the row keeps null where the column is, and nothing where it is not", "seller_seen_at" in withCol && withCol.seller_seen_at === null && !("seller_seen_at" in without))
    const route = read("app/api/app/orders/seen/route.ts")
    check("opening marks it: the store's own lines, only the first time", /shopCaller\("orders"\)/.test(route) && /\.eq\("creator_id", c\.creatorId\)/.test(route) && /\.is\("seller_seen_at", null\)/.test(route))
    const client = read("app/app/orders/orders-client.tsx")
    check("the client tells the server as the order opens, and clears the dot once the list is back", /api\/app\/orders\/seen/.test(client) && /SEEN_AFTER_BACK_MS/.test(client) && /startTransition/.test(client))
    const list = read("app/app/orders/orders-list.tsx")
    check("the dot: small, in the cell's padding (the number never moves), named for a screen reader", /order\.unseen \? <span aria-hidden data-unseen=""[^>]*-ml-\[9px\] mr-\[3px\][^>]*h-1\.5 w-1\.5/.test(list) && /sr-only/.test(list))
    const sql = read("supabase/sql/run-now/224_orders_seller_seen.sql").split("\n").filter(Boolean)
    check("SQL part 224: one statement a line, the old orders seen without a rewrite, idempotent, pgrst last", sql.length === 3 && /^DO \$\$ BEGIN IF .*NOT EXISTS .*seller_seen_at.* THEN ALTER TABLE public\.orders ADD COLUMN seller_seen_at timestamptz DEFAULT now\(\); ALTER TABLE public\.orders ALTER COLUMN seller_seen_at DROP DEFAULT; END IF; END \$\$;$/.test(sql[1]) && sql[2] === "notify pgrst, 'reload schema';")
    check("its migration copy, README row and check column", read("supabase/migrations/20270131_orders_seller_seen.sql") === read("supabase/sql/run-now/224_orders_seller_seen.sql") && /`224_orders_seller_seen\.sql`/.test(read("supabase/sql/run-now/README.md")) && /as p224_orders_seller_seen;/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  section("Carrier logos instead of the truck")
  {
    const list = read("app/app/orders/orders-list.tsx")
    check("the list: the parcel's carrier logo beside its badge once it is out", /<CarrierLogo carrier=\{order\.shipping\.carrier\} size=\{18\} \/>/.test(list))
    const rows = read("lib/orders/load-rows.ts")
    check("the list reads each order's latest carrier with the parcels it already read", /select\("checkout_id, status, carrier"\)/.test(rows) && /r\.physical_carrier = carriers\.get\(c\.id\)/.test(rows))
    const base = { product_id: "p", amount_cents: 1000, status: "completed", created_at: "t", product: null, checkout_id: "co", physical_fulfillment: "fulfilled", physical_return: "none" } as unknown as OrderRow
    check("the order carries it", groupOrders([{ ...base, id: "a", physical_carrier: "DPD" }])[0].shipping?.carrier === "DPD")
    const panel = read("components/physical/order-panel.tsx")
    check("a shipment's tracking row: the carrier's logo, not the truck", /<CarrierLogo carrier=\{s\.carrier\} size=\{28\}/.test(panel) && !/<Truck className="h-3\.5 w-3\.5 shrink-0/.test(panel))
    const ev = physicalEvents({ pickup: false, shipments: [{ id: "f", status: "shipped", carrier: "Sameday", trackingNumber: "1ONB1", trackingUrl: null, shippedAt: "t", deliveredAt: null, createdAt: "t", items: [{ orderId: "a", quantity: 1 }] }] as never, events: [] })
    check("the timeline's shipped entry carries its carrier, drawn as its logo", ev[0].carrier === "Sameday" && /data-timeline-carrier/.test(read("app/app/orders/order-detail.tsx")))
  }

  section("Fulfill items")
  {
    const panel = read("components/physical/order-panel.tsx")
    check("the carrier is the picker, not a native select", /<CarrierPicker/.test(panel) && !/<option value="">\{tt\("Choose a carrier"\)\}<\/option>/.test(panel))
    check("the number is asked for unless Local delivery / no tracking, and the seller is told why", /function shipProblems/.test(panel) && /Add the tracking number: the buyer follows the parcel with it/.test(panel) && /s\.choice === NO_TRACKING\) return \{\}/.test(panel))
    check("Local delivery / no tracking sends no carrier and no number", /carrier: none \? null/.test(panel) && /trackingNumber: none \? null/.test(panel))
    check("an order the shop delivers itself starts on no tracking", /order\.delivery\?\.kind === "local" \? NO_TRACKING : ""/.test(panel))
    check("the buyer's email, previewed before it goes, with the real tracking link", /function EmailPreview/.test(panel) && /data-email-preview/.test(panel) && /Track your package/.test(panel))
    check("no X on the phone sheet for Fulfill items and Edit tracking", (panel.match(/closeButton=\{false\}/g) ?? []).length >= 2 && /closeButton \? \(/.test(read("components/physical/ui.tsx")))
    const picker = read("components/physical/carrier-picker.tsx")
    check("the picker: a sheet on a phone with no close button, a popover on a computer, search, popular first, logos", /<BottomSheet/.test(picker) && !/aria-label=\{tt\("Close"\)\}/.test(picker) && /PopoverPrimitive\.Content/.test(picker) && /carrierChoices\(country\)/.test(picker) && /Popular in \{country\}/.test(picker) && /<CarrierLogo/.test(picker) && /role="listbox"/.test(picker))
    check("Escape closes the list, not the dialog under it", /e\.key === "Escape"\) \{[\s\S]{0,120}e\.stopPropagation\(\)/.test(picker))
    const route = read("app/api/physical/orders/[id]/route.ts")
    check("the server keeps the rule for what the seller sends", /trackingRuleProblem\(/.test(route) && /body\.action === "fulfil"/.test(route))
    check("tracking links use the shipping country (DPD Romania)", /trackingUrl\(carrier, tracking, typeof order\.address\?\.country === "string"/.test(read("lib/physical/orders-server.ts")))
  }

  section("Home")
  {
    const home = read("components/app/home/attention-list.tsx")
    check("the announcements' dot is mustard, red still for what went wrong", /"bg-\[#d92d20\]" : "bg-\[#d4a017\]"/.test(home) && !/bg-\[#d1d5db\]/.test(home))
  }

  process.stdout.write(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
