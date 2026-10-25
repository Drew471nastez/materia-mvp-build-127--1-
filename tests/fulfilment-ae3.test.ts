/**
 * ROUND AE3: FULFILMENT PARTS, EACH AGAINST WHAT IT STANDS FOR
 *
 *   cancel      Printful, Printify, Gelato and CJ each cancel by their own
 *               documented call (stubs of their APIs, recorded answers,
 *               nothing real reached): done, refused with the provider's
 *               words, or thrown to be tried again when the provider is busy
 *   costs       what each provider charges, read from its answer
 *   hold        the newest hold or release decides, ties by id; the jobs a
 *               hold keeps back, and the ones it never does
 *   partner     the Printful card's state by its location: sent with its
 *               cost, held, sending again, not sent and why
 *   slip        A4 or Letter, the printer's own when none was chosen, prices
 *               and totals only when asked, the bar never printed
 *   label       the rate the buyer paid for picked first in Buy a label
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { printful, printfulCost } from "@/lib/integrations/fulfilment/printful"
import { printify } from "@/lib/integrations/fulfilment/printify"
import { gelato, gelatoCost } from "@/lib/integrations/fulfilment/gelato"
import { cjDropshipping, setCjSpacing } from "@/lib/integrations/fulfilment/cj"
import { ProviderError } from "@/lib/integrations/fulfilment/http"
import { sealSecret } from "@/lib/physical/secrets"
import { HELD_BACK, HOLD, HOLD_RELEASED, RESENT, heldBackJob, holdOf, partnerSendState } from "@/lib/physical/fulfilment-state"
import { packingSlipHtml, paperAsked, slipLines, slipPaper, type SlipOrder } from "@/lib/physical/packing-slip"
import { rateForPaid } from "@/lib/integrations/shipping/types"
import { canShip } from "@/lib/integrations/shipping/labels-server"
import { csvCell } from "@/lib/physical/inventory-rules"
import { looksLikeFormula } from "@/lib/physical/bulk-fulfil"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-ae3-0123456789abcdef"
setCjSpacing(0)

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── stubs of the providers' APIs ─────────────────────────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
let calls: Call[] = []
let answer: (c: Call) => { status: number; body?: unknown } = () => ({ status: 404 })
const HOSTS = /^https:\/\/(api\.printful\.com|api\.printify\.com|order\.gelatoapis\.com|developers\.cjdropshipping\.com)\//
const stray: string[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const c: Call = { method: init.method ?? "GET", url, headers, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!HOSTS.test(url)) stray.push(url)
  const a = answer(c)
  return new Response(a.body === undefined ? "" : JSON.stringify(a.body), { status: a.status, headers: { "content-type": "application/json" } })
}) as typeof fetch
const reset = (f: typeof answer) => {
  calls = []
  answer = f
}

async function main() {
  section("Cancel, by each provider's own call")
  {
    const pf = { key: "pf-token", config: { store_id: "4321" } }
    reset((c) => (c.method === "DELETE" && c.url === "https://api.printful.com/orders/9001" ? { status: 200, body: { code: 200, result: { id: 9001, status: "canceled" } } } : { status: 404 }))
    const ok = await printful.cancel(pf, "9001")
    check("Printful: DELETE /orders/{id}, with the token and the store", ok.cancelled === true && calls.length === 1 && calls[0].headers.authorization === "Bearer pf-token" && calls[0].headers["x-pf-store-id"] === "4321", { ok, calls })
    reset(() => ({ status: 400, body: { code: 400, result: "Order can not be canceled", error: { reason: "BadRequest", message: "Order is already being fulfilled and can't be canceled" } } }))
    const no = await printful.cancel(pf, "9001")
    check("  refused: not cancelled, Printful's own words kept", no.cancelled === false && /already being fulfilled/.test(no.note ?? ""), no)
    reset(() => ({ status: 503 }))
    let thrown: unknown = null
    await printful.cancel(pf, "9001").catch((e) => (thrown = e))
    check("  down: thrown to be tried again, never read as refused", thrown instanceof ProviderError && (thrown as ProviderError).retry === true)
    calls = []
    const bad = await printful.cancel(pf, "../stores")
    check("  a number that isn't Printful's: nothing called", bad.cancelled === false && calls.length === 0)

    const pfy = { key: "pfy-token", config: { shop_id: "123456" } }
    reset((c) => (c.method === "POST" && c.url === "https://api.printify.com/v1/shops/123456/orders/5a96f649b2439217d070f507/cancel.json" ? { status: 200, body: { id: "5a96f649b2439217d070f507", status: "canceled" } } : { status: 404 }))
    const y = await printify.cancel(pfy, "5a96f649b2439217d070f507")
    check("Printify: POST /v1/shops/{shop}/orders/{id}/cancel.json", y.cancelled === true && calls.length === 1 && calls[0].headers.authorization === "Bearer pfy-token", calls)
    reset(() => ({ status: 400, body: { message: "Order can not be canceled in its current state" } }))
    const yNo = await printify.cancel(pfy, "5a96f649b2439217d070f507")
    check("  refused: Printify's words", yNo.cancelled === false && /current state/.test(yNo.note ?? ""), yNo)

    const g = { key: "gelato-key", config: {} }
    reset((c) => (c.method === "POST" && c.url === "https://order.gelatoapis.com/v4/orders/a6b8c0d2-0000-4000-8000-000000000001:cancel" ? { status: 200 } : { status: 404 }))
    const gOk = await gelato.cancel(g, "a6b8c0d2-0000-4000-8000-000000000001")
    check("Gelato: POST /v4/orders/{id}:cancel with X-API-KEY", gOk.cancelled === true && calls[0]?.headers["x-api-key"] === "gelato-key", calls)
    reset(() => ({ status: 409, body: { message: "Order cannot be canceled as it is already in production" } }))
    const gNo = await gelato.cancel(g, "a6b8c0d2-0000-4000-8000-000000000001")
    check("  refused once in production", gNo.cancelled === false && /in production/.test(gNo.note ?? ""), gNo)

    const cj = { key: "cj-key", config: { cj: { at: sealSecret("cj-at"), at_exp: new Date(Date.now() + 5 * 86400_000).toISOString(), rt: null, rt_exp: null } } }
    reset((c) => (c.method === "DELETE" && c.url === "https://developers.cjdropshipping.com/api2.0/v1/shopping/order/deleteOrder?orderId=210823100016290555" ? { status: 200, body: { code: 200, result: true, message: "Success", data: "210823100016290555" } } : { status: 404 }))
    const cOk = await cjDropshipping.cancel(cj, "210823100016290555")
    check("CJ: DELETE /shopping/order/deleteOrder?orderId=, with the access token", cOk.cancelled === true && calls[0]?.headers["cj-access-token"] === "cj-at", calls)
    reset(() => ({ status: 200, body: { code: 1600300, result: false, message: "The order has been paid and cannot be deleted" } }))
    const cNo = await cjDropshipping.cancel(cj, "210823100016290555")
    check("  a paid CJ order: refused in CJ's words (HTTP 200, its own code)", cNo.cancelled === false && /has been paid/.test(cNo.note ?? ""), cNo)
  }

  section("Costs, read from each answer")
  check("Printful: costs.total in its currency", JSON.stringify(printfulCost({ currency: "EUR", total: "13.25" })) === JSON.stringify({ cents: 1325, currency: "EUR" }))
  check("  none yet, or zero: no cost", printfulCost(null) === null && printfulCost({ currency: "USD", total: "0.00" }) === null)
  check("Gelato: the receipt's total with VAT, a refund receipt never", JSON.stringify(gelatoCost([{ transactionType: "refund", totalInclVat: 3, currency: "EUR" }, { transactionType: "purchase_order", totalInclVat: 18.4, currency: "EUR" }])) === JSON.stringify({ cents: 1840, currency: "EUR" }) && gelatoCost(undefined) === null)
  check("  yen has no minor unit", JSON.stringify(gelatoCost([{ totalInclVat: "1200", currency: "JPY" }])) === JSON.stringify({ cents: 1200, currency: "JPY" }))
  {
    const cj = { key: "cj-key", config: { cj: { at: sealSecret("cj-at"), at_exp: new Date(Date.now() + 5 * 86400_000).toISOString(), rt: null, rt_exp: null }, logistic: "CJPacket Ordinary", from_country: "CN" } }
    reset((c) => (c.url.endsWith("/shopping/order/createOrderV2") ? { status: 200, body: { code: 200, result: true, data: { orderId: "210823100016290555", orderStatus: "CREATED", orderAmount: 12.71, productAmount: 9.32, postageAmount: 3.39 } } } : { status: 404 }))
    const sent = await cjDropshipping.submit(cj, { externalId: "a".repeat(32), label: "#AAAAAAAA", address: { name: "Bea", line1: "Gartenweg 2", line2: null, city: "Berlin", region: null, postalCode: "10117", country: "DE", phone: null, email: null }, lines: [{ sku: "", quantity: 1, title: "Tee", lineId: "b".repeat(32), link: { providerVariantId: "1424608152007086080", fileUrl: null } }], autoConfirm: false })
    check("CJ: the order amount, in US dollars", JSON.stringify(sent.cost) === JSON.stringify({ cents: 1271, currency: "USD" }) && sent.stage === "draft", sent)
  }

  section("Hold, by the timeline")
  {
    const t = (id: number, kind: string, at: string, detail: Record<string, unknown> | null = null) => ({ id, kind, createdAt: at, detail })
    check("no entries: no hold", holdOf([]) === null)
    const held = holdOf([t(1, HOLD, "2026-10-20T10:00:00Z", { reason: "fraud", note: "  Two cards tried  " })])
    check("a hold: its reason, label and note", held?.reason === "fraud" && held?.label === "Possible fraud" && held?.note === "Two cards tried", held)
    check("released after: none", holdOf([t(1, HOLD, "2026-10-20T10:00:00Z"), t(2, HOLD_RELEASED, "2026-10-20T11:00:00Z")]) === null)
    check("held again after a release: held", holdOf([t(1, HOLD, "2026-10-20T10:00:00Z"), t(2, HOLD_RELEASED, "2026-10-20T11:00:00Z"), t(3, HOLD, "2026-10-20T12:00:00Z", { reason: "buyer" })])?.reason === "buyer")
    check("the same millisecond: the later entry wins", holdOf([t(5, HOLD_RELEASED, "2026-10-20T10:00:00Z"), t(4, HOLD, "2026-10-20T10:00:00Z")]) === null)
    check("a reason not on the list reads as Other", holdOf([t(1, HOLD, "2026-10-20T10:00:00Z", { reason: "<script>" })])?.label === "Other")
    check("held back: sends to a partner, a supplier, a webhook's order.paid, ShipStation's paid push", heldBackJob("forward_fulfillment", {}) && heldBackJob("supplier_email", {}) && heldBackJob("webhook_delivery", { event: "order.paid" }) && heldBackJob("shipstation_push", { reason: "paid" }))
    check("never held back: a cancel passed on, the buyer's emails, tracking reads", !heldBackJob("forward_fulfillment", { op: "cancel" }) && !heldBackJob("webhook_delivery", { event: "order.cancelled" }) && !heldBackJob("shipstation_push", { reason: "cancelled" }) && !heldBackJob("send_email", {}) && !heldBackJob("tracking_sync", {}))
  }

  section("A partner location's card")
  {
    const LOC = "11111111-1111-4111-8111-111111111111"
    const e = (id: number, kind: string, at: string, detail: Record<string, unknown>, message = "") => ({ id, kind, createdAt: at, message, detail })
    check("nothing about it yet: the card keeps its own words", partnerSendState([], LOC) === null && partnerSendState([e(1, "fulfillment.forwarded", "2026-10-20T10:00:00Z", { location_id: "other" })], LOC) === null)
    const failedState = partnerSendState([e(1, "fulfillment.manual_needed", "2026-10-20T10:00:00Z", { location_id: LOC }, "Printful has no product with SKU TEE-M.")], LOC)
    check("not sent: why, in the partner's words", failedState?.state === "failed" && /SKU TEE-M/.test((failedState as { message: string }).message))
    check("Send again pressed after: sending", partnerSendState([e(1, "fulfillment.manual_needed", "2026-10-20T10:00:00Z", { location_id: LOC }), e(2, RESENT, "2026-10-20T10:05:00Z", { location_id: LOC })], LOC)?.state === "resending")
    const sent = partnerSendState([e(1, "fulfillment.manual_needed", "2026-10-20T10:00:00Z", { location_id: LOC }), e(2, RESENT, "2026-10-20T10:05:00Z", { location_id: LOC }), e(3, "fulfillment.forwarded", "2026-10-20T10:06:00Z", { location_id: LOC, cost_cents: 1564, cost_currency: "USD" }, "Order sent to Printful.")], LOC)
    check("sent, with its cost", sent?.state === "sent" && (sent as { cost: { cents: number } | null }).cost?.cents === 1564)
    check("held back: waiting", partnerSendState([e(1, HELD_BACK, "2026-10-20T10:00:00Z", { location_id: LOC })], LOC)?.state === "held")
    check("a job that died: not sent", partnerSendState([e(1, "job.failed", "2026-10-20T10:00:00Z", { location_id: LOC, job: "supplier_email" }, "The order could not be emailed to the supplier.")], LOC)?.state === "failed")
  }

  section("Packing slip: paper and prices")
  {
    const order: SlipOrder = {
      id: "85737c57-0000-4000-8000-000000000001",
      createdAt: "2026-10-20T10:00:00Z",
      paidAt: "2026-10-20T10:01:00Z",
      address: { name: "Jordan Blake", line1: "12 Strada Lipscani", city: "Bucharest", postalCode: "030031", country: "RO" },
      delivery: { name: "Standard" },
      deliveryMethod: "ship",
      pickup: null,
      buyerName: "Jordan Blake",
      buyerNote: null,
      cartAttributes: { "Gift message": "Happy birthday" },
      lines: [{ orderId: "l1", title: "Linen shirt", variantName: "M", sku: "LS-M", imageUrl: null, quantity: 2, fulfilled: 0, requiresShipping: true, locationId: null, unitCents: 4500 }],
      shipments: [],
    }
    const tt = (s: string, v?: Record<string, string | number>) => s.replace(/\{(\w+)(?:, plural[^}]*\{[^}]*\}[^}]*\{([^}]*)\}\})?\}/g, (_, k, other) => (other ? String(other).replace("#", String(v?.[k] ?? "")) : String(v?.[k] ?? "")))
    check("the language region picks the paper: Letter in the US and Canada, A4 in Germany and with none", slipPaper(null, "en-US,en;q=0.9") === "letter" && slipPaper(null, "fr-CA") === "letter" && slipPaper(null, "de-DE") === "a4" && slipPaper(null, "") === "a4" && slipPaper("a4", "en-US") === "a4")
    check("only a4 or letter is ever taken from the address", paperAsked("letter") === "letter" && paperAsked("legal") === null && paperAsked("a4;}body{display:none") === null)
    const plain = packingSlipHtml(order, slipLines(order), { name: "Shop", logoUrl: null }, { tt, lang: "en", back: "/app/orders" })
    check("none chosen: the printer's own paper (no @page size)", /@page\{margin:14mm\}/.test(plain) && !/@page\{size/.test(plain) && /data-slip-paper="printer"/.test(plain))
    const letter = packingSlipHtml(order, slipLines(order), { name: "Shop", logoUrl: null }, { tt, lang: "en", back: "/app/orders", paper: "letter", controls: { a4: "/s?paper=a4", letter: "/s?paper=letter", prices: "/s?paper=letter&prices=1" } })
    check("Letter chosen: @page sized to it, half inch margins", /@page\{size:letter;margin:0\.5in\}/.test(letter))
    check("  the bar's controls, A4 and Letter with the chosen one on, and Show prices", /<a href="\/s\?paper=letter" aria-current="true" data-slip-paper="letter">Letter<\/a>/.test(letter) && /data-slip-prices="off">Show prices</.test(letter))
    const paperOnly = letter.replace(/<style>[\s\S]*?<\/style>/, "").replace(/<div class="bar"[\s\S]*?<\/div>\n/, "")
    check("  no prices on the paper itself", !/\$|€|price|45\.00/i.test(paperOnly), paperOnly.slice(0, 300))
    check("  the gift message from the cart is on it", /Gift message:<\/span> Happy birthday/.test(letter))
    const totals = { currency: "EUR", itemsSubtotalCents: 9000, discountCents: 1000, shippingCents: 500, shippingDiscountCents: 0, taxCents: 1615, taxIncluded: true, taxLabel: "VAT 19%", totalCents: 8500, refundedCents: 0 }
    const priced = packingSlipHtml(order, slipLines(order), { name: "Shop", logoUrl: null }, { tt, lang: "en", back: "/app/orders", prices: { currency: "EUR", totals } })
    check("prices on: each item's price and amount", /<td class="amt">€45\.00<\/td><td class="qty">2<\/td><td class="amt">€90\.00<\/td>/.test(priced), priced.match(/<tbody>[\s\S]*?<\/tbody>/)?.[0])
    check("  the order's totals: subtotal, discount, shipping, VAT included, total", /Subtotal<\/span><span>€90\.00/.test(priced) && /Discount<\/span><span>−€10\.00/.test(priced) && /Shipping<\/span><span>€5\.00/.test(priced) && /VAT 19% included<\/span><span>€16\.15/.test(priced) && /class="sum strong"><span>Total<\/span><span>€85\.00/.test(priced))
    check("  titled Order summary", /<title>Order summary #85737C57<\/title>/.test(priced) && /<div class="k">Order summary<\/div>/.test(priced))
    const stack = read("app/api/physical/orders/packing-slips/route.ts")
    const one = read("app/api/physical/orders/[id]/packing-slip/route.ts")
    check("both routes read paper and prices from the address, the region from the browser", /paperAsked\(url\.searchParams\.get\("paper"\)\)/.test(stack) && /paperAsked\(url\.searchParams\.get\("paper"\)\)/.test(one) && /accept-language/.test(stack) && /accept-language/.test(one))
    check("  the whole order's slip carries the totals, a parcel's slip only its items' prices", /totals: whole \? order : null/.test(one) && /const whole = !shipmentId && !isUuid\(loc\)/.test(one))
  }

  section("Buy a label: the rate the buyer paid for, first")
  {
    const rates = [
      { id: "r1", cents: 1290, service: "Priority Mail Express", serviceCode: "usps_priority_express" },
      { id: "r2", cents: 790, service: "Priority Mail", serviceCode: "usps_priority" },
      { id: "r3", cents: 610, service: "Ground Advantage", serviceCode: "usps_ground_advantage" },
    ]
    check("the service the zone rate named", rateForPaid({ provider: "shippo", serviceCode: "usps_priority" }, "shippo", rates) === "r2")
    check("  matched by the service's name too, any case", rateForPaid({ provider: "easypost", serviceCode: "priority mail" }, "easypost", rates) === "r2")
    check("  none named: the cheapest, as checkout priced it", rateForPaid({ provider: "shippo", serviceCode: null }, "shippo", rates) === "r3")
    check("  the seller's own rate (flat), or another app's quote: no pick", rateForPaid({ provider: null, serviceCode: null }, "shippo", rates) === null && rateForPaid({ provider: "easypost", serviceCode: "usps_priority" }, "shippo", rates) === null && rateForPaid(null, "shippo", rates) === null)
    const held = { id: "x", status: "paid", cancelledAt: null, deliveryMethod: "ship", buyerName: null, buyerEmail: null, buyerPhone: null, address: null, lines: [], shipments: [], events: [{ id: 1, kind: HOLD, createdAt: "2026-10-20T10:00:00Z", detail: { reason: "address" } }] }
    check("no label is bought for a held order", /on hold \(Address to check\)/.test(canShip(held) ?? ""), canShip(held))
    check("  nor refused once released", canShip({ ...held, events: [...held.events, { id: 2, kind: HOLD_RELEASED, createdAt: "2026-10-20T11:00:00Z", detail: null }] }) === null)
    const dialog = read("components/physical/buy-label.tsx")
    check("the dialog starts on the buyer's app, picks their rate, shows what they paid", /paidApp \?\? r\.data\.apps\[0\]/.test(dialog) && /rateForPaid\(options\?\.paid, r\.data\.provider, r\.data\.rates\)/.test(dialog) && /data-label-paid/.test(dialog) && /the buyer's choice/.test(dialog))
  }

  section("Where the order panel uses them")
  {
    const panel = read("components/physical/order-panel.tsx")
    check("Hold fulfillment in the Unfulfilled card's menu, Release hold on the hold's card", /label: tt\("Hold fulfillment"\)/.test(panel) && /action: "release_hold"/.test(panel) && /data-order-hold/.test(panel))
    check("  Fulfill is off while it holds", /disabled=\{busy \|\| !canFulfil \|\| !!hold\}/.test(panel))
    check("Send again only on a partner's card that was not sent", /sendState\?\.state === "failed" && canFulfil && !hold && g\.locationId/.test(panel) && /action: "resend", locationId: g\.locationId/.test(panel))
    const route = read("app/api/physical/orders/[id]/route.ts")
    check("the order route takes hold, release_hold and resend, each logged", /case "hold":/.test(route) && /case "release_hold":/.test(route) && /case "resend":/.test(route) && /resend: "order\.partner_resent"/.test(route))
    const events = read("lib/physical/events-server.ts")
    check("a cancel is passed to every partner that has the order", /e\.kind === "order\.cancelled"[\s\S]{0,200}queuePartnerCancels/.test(events))
  }

  section("Physical CSVs: the shared formula guard")
  {
    const sneaky = [" =HYPERLINK(\"x\")", "\t=1+1", "\r\n@SUM(A1)", " =1", "　+1", "＝cmd()", "＠a", "-2+3"]
    check("the stock export writes every one as text", sneaky.every((s) => csvCell(s).replace(/^"/, "").startsWith("'")), sneaky.map((s) => csvCell(s)))
    check("  a plain number, negative too, stays a number", csvCell("-3") === "-3" && csvCell(12) === "12" && csvCell("Linen shirt") === "Linen shirt")
    check("the tracking CSV import refuses each one", sneaky.every((s) => looksLikeFormula(s)) && !looksLikeFormula("1Z999AA10123456784") && !looksLikeFormula("DHL"))
    const exportRoute = read("app/api/physical/orders/export/route.ts")
    check("the orders to ship export uses the shared guard, no first character check of its own", /guardFormula\(s\)/.test(exportRoute) && !/\[=\+\\-@\\t\\r\]/.test(exportRoute))
  }

  check("every address the suite called was one of the four providers' documented hosts", stray.length === 0, stray)
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
