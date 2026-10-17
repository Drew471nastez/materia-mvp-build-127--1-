/**
 * ShippyPro (lib/integrations/shipping/shippypro.ts), held to what can be
 * cited and nothing more.
 *
 *   recorded    answers captured from the live server on 2026-10-17 with no
 *               key and with a made up key: a refused key is HTTP 200 with
 *               {"Error":"Authentication Failed"}, whether it was sent as
 *               Bearer or as Basic; no key at all is a 401 with the same body
 *   documented  answers shaped as ShippyPro's own API document gives them
 *               (https://api.shippypro.com/docs/v1.json, the file its
 *               console loads), the examples copied where it has them
 *   unexpected  anything else fails loudly, naming the method; no test here
 *               asserts that a shape nobody has seen is right
 *   product     Coming soon: no Connect, no Buy a label, no key taken, and
 *               the card says so in every connection state
 *
 * `fetch` is replaced; any address that is not api.shippypro.com fails the
 * suite, and nothing real is ever called.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { PROVIDERS, providerInfo } from "@/lib/physical/providers"
import { INTEGRATIONS, integrationById } from "@/lib/integrations/catalog"
import { openSecret, sealSecret, secretHint } from "@/lib/physical/secrets"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { verifyProviderKey } from "@/lib/physical/provider-verify"
import { isShippingApp, SHIPPING_APPS } from "@/lib/integrations/shipping/connect-server"
import { labelApiFor, LABEL_APIS } from "@/lib/integrations/shipping/labels-server"
import { fromMinor } from "@/lib/integrations/shipping/money"
import { ProviderError } from "@/lib/integrations/fulfilment/http"
import { shippypro } from "@/lib/integrations/shipping/shippypro"
import type { LabelAddress, Parcel } from "@/lib/integrations/shipping/types"
import { statusOf, type IntegrationState } from "@/components/physical/integrations-marketplace"
import { untt } from "./i18n-source"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-shippypro-0123456789"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

/* ── the API, stubbed ──────────────────────────────────────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
let calls: Call[] = []
type Route = (c: Call) => { status: number; body: unknown } | null
let routes: Route[] = []
let stray: string | null = null
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const c: Call = { method: init.method ?? "GET", url, headers, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!/^https:\/\/api\.shippypro\.com\//.test(url)) {
    stray = url
    throw new Error(`a real address was called: ${url}`)
  }
  for (const r of routes) {
    const out = r(c)
    if (out) return new Response(JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json" } })
  }
  return new Response(JSON.stringify({ Error: "no stub" }), { status: 500 })
}) as typeof fetch

function reset(r: Route[]) {
  calls = []
  routes = r
}
const KEY = "sp_live_0123456789abcdef"
const method = (c: Call) => c.url.replace("https://api.shippypro.com/v1/", "")
const bearer = (c: Call) => c.headers.authorization === `Bearer ${KEY}`
const basic = (c: Call) => c.headers.authorization === `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`
/** Answer one method, for whichever scheme `when` accepts. */
const answer = (m: string, body: unknown, when: (c: Call) => boolean = bearer, status = 200): Route => (c) => (method(c) === m && when(c) ? { status, body } : null)

/* Recorded from the live server, 2026-10-17 (see the file header). */
const REFUSED_200 = { Error: "Authentication Failed" }
const refusedEverywhere: Route = () => ({ status: 200, body: REFUSED_200 })

async function threw(p: Promise<unknown>): Promise<ProviderError | null> {
  try {
    await p
    return null
  } catch (e) {
    return e instanceof ProviderError ? e : null
  }
}
const surprised = (e: ProviderError | null, m: string) => !!e && e.message.startsWith(`ShippyPro answered in a shape Storelib did not expect: ${m} returned`) && e.retry === false

const ROME: LabelAddress = { name: "Negozio Uno", company: "Negozio Uno", line1: "Via del Corso 12", line2: null, city: "Roma", region: "RM", postalCode: "00186", country: "IT", phone: "+390612345678", email: "shop@example.com" }
const CLUJ: LabelAddress = { name: "Ana Pop", line1: "Strada Memorandumului 28", line2: "Ap. 4", city: "Cluj-Napoca", region: "CJ", postalCode: "400114", country: "RO", phone: "+40740123456", email: "ana@example.com" }
const BOX: Parcel = { lengthCm: 30, widthCm: 20, heightCm: 10, grams: 1250 }

async function main() {
  /* ── transport ──────────────────────────────────────────────────────── */
  console.log("\nThe call, as ShippyPro's document gives it\n")
  {
    reset([answer("Ping", { Result: true })])
    const r = await shippypro.verify(KEY)
    const c = calls[0]
    check("one POST to /v1/Ping", calls.length === 1 && c.method === "POST" && c.url === "https://api.shippypro.com/v1/Ping")
    check("  the body repeats the method: {Method, Params}", c.body?.Method === "Ping" && JSON.stringify(c.body?.Params) === "{}")
    check("  the key as a Bearer token, as the document says", bearer(c))
    check("  with the partner name in Referer, as the document asks", c.headers.referer === "storelib")
    check("  Result true is a good key", r.ok === true)
  }

  /* ── the real failures ──────────────────────────────────────────────── */
  console.log("\nA refused key, as the live server really answers it\n")
  {
    reset([refusedEverywhere])
    const e = await threw(shippypro.verify(KEY))
    check("HTTP 200 with {Error: Authentication Failed} is a refused key, not a success", !!e && e.status === 401 && /did not accept that API key/.test(e.message))
    check("  Bearer first, then the help centre's Basic (key, empty password), then it stops", calls.length === 2 && bearer(calls[0]) && basic(calls[1]))

    reset([answer("Ping", { Result: true }, basic), answer("Ping", REFUSED_200, bearer)])
    check("a key ShippyPro takes only as Basic still verifies", (await shippypro.verify(KEY)).ok === true && calls.length === 2)

    /* No Authorization header gets a real 401 with the same body; a real 401 for Bearer must still try Basic. */
    reset([answer("Ping", REFUSED_200, bearer, 401), answer("Ping", { Result: true }, basic)])
    check("a real 401 for Bearer still tries Basic", (await shippypro.verify(KEY)).ok === true && calls.length === 2)

    reset([answer("GetRates", { Error: "Invalid Input Data" })])
    const bad = await threw(shippypro.rates(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "storelib:x", contents: "Shoes", currency: "EUR" }))
    check("an error that is not about the key is said as ShippyPro said it, and not retried", !!bad && bad.message === "ShippyPro: Invalid Input Data" && bad.status === 422 && calls.length === 1)

    reset([() => ({ status: 429, body: { Error: "Too Many Requests" } })])
    const busy = await threw(shippypro.verify(KEY))
    check("429 (20 calls every 10 seconds) is busy, to try again", !!busy && busy.status === 429 && busy.retry === true)
  }

  /* ── shapes the document does not describe ──────────────────────────── */
  console.log("\nAn answer in a shape nobody documented fails loudly\n")
  {
    reset([answer("Ping", { Result: "yes" })])
    check("Ping without Result true", surprised(await threw(shippypro.verify(KEY)), "Ping"))
    reset([answer("Ping", ["not", "an", "object"])])
    check("a list where an object was expected", surprised(await threw(shippypro.verify(KEY)), "Ping"))
    reset([answer("GetCarriers", { Couriers: [] })])
    const e = await threw(shippypro.carriers(KEY))
    check("GetCarriers without Carriers, naming what came instead", surprised(e, "GetCarriers") && /Couriers/.test(e!.message))
    reset([answer("GetRates", { rates: [] })])
    check("GetRates with neither Rates nor RatesErrors", surprised(await threw(shippypro.rates(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "r", contents: "c", currency: "EUR" })), "GetRates"))
    reset([answer("GetTracking", {})])
    check("GetTracking with no carrier, status or events", surprised(await threw(shippypro.tracking(KEY, "1Z")), "GetTracking"))
    reset([answer("VoidShipments", { Result: "PENDING" })])
    check("VoidShipments with anything but Result OK is never reported voided", surprised(await threw(shippypro.voidShipments(KEY, { orderIds: ["1"], carrierName: "SDA" })), "VoidShipments"))
    reset([answer("CheckAddress", { Accuracy: 95 })])
    check("CheckAddress without Result", surprised(await threw(shippypro.checkAddress(KEY, { address: CLUJ, from: ROME, carrierName: "Generic", carrierId: 6 })), "CheckAddress"))
    reset([answer("Ship", { Result: "OK", Status: "1", LabelURL: [] })])
    check("Ship that says OK with no label and no order id", surprised(await threw(shippypro.ship(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "r", contents: "c", currency: "EUR", rate: { carrier: "Generic", carrierId: 6, service: "Standard", rateId: "1", orderId: null } })), "Ship"))
    reset([answer("GetCarriers", { Carriers: {}, Note: { buyer: "Ana Pop, Strada Memorandumului 28" } }), answer("Ping", { Result: false, Echo: "Ana Pop" })])
    const leak = await threw(shippypro.verify(KEY))
    check("the message names keys, never values (no buyer's details in an error)", !!leak && !/Ana Pop/.test(leak.message) && /Result, Echo/.test(leak.message))
  }

  /* ── the merchant's own carriers, EU and Romanian ones included ─────── */
  console.log("\nCarriers come from the merchant's own ShippyPro account\n")
  {
    /* Shaped as GetCarriers documents: { Carriers: { <name>: [ { CarrierID, CarrierService, ServicesList, Label } ] } }. The names are the merchant's data, made up here. */
    reset([answer("GetCarriers", { Carriers: { Sameday: [{ CarrierID: "41", CarrierService: "Standard", ServicesList: ["Standard", "Locker"], Label: "Sameday RO" }], FANCourier: [{ CarrierID: "42", CarrierService: "Standard", ServicesList: ["Standard"], Label: "FAN Courier" }], BRT: [{ CarrierID: "7", CarrierService: "Express", ServicesList: ["Express"], Label: "BRT Italia" }, { CarrierID: "8", CarrierService: "Standard", ServicesList: [], Label: "BRT resi" }] } })])
    const list = await shippypro.carriers(KEY)
    check("every connection is read, two from one carrier included", list.length === 4)
    check("  a Romanian carrier arrives like any other, by its name and id", list.some((c) => c.name === "Sameday" && c.carrierId === 41 && c.label === "Sameday RO" && c.services.join() === "Standard,Locker"))
    check("  active carriers only, as the document's Active: 1", calls[0].body.Params.Active === 1)
    reset([answer("GetCarriers", { Carriers: {} })])
    check("no carriers connected yet is an empty list, not an error", (await shippypro.carriers(KEY)).length === 0)
    const adapter = read("lib/integrations/shipping/shippypro.ts")
    check("nothing in the adapter lists carriers by name", !/Sameday|FAN ?Courier|Cargus|GLS|BRT|Poste|DPD/.test(adapter.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")))
  }

  /* ── rates ──────────────────────────────────────────────────────────── */
  console.log("\nRates, sent and read as documented\n")
  {
    /* A rate with every field GetRates documents, the document's own example values. */
    const documented = { carrier: "Generic", carrier_id: "6", carrier_label: "Generic Test", rate: "7.60", rate_id: "orderRate", order_id: "orderID", delivery_days: 2, service: "Standard", zone_name: "Italy", weight_range: "0-500", detailed_pricing: { type: "tariff", price: 7.6, desc: "Tariff" } }
    const ranged = { ...documented, carrier: "Sameday", carrier_id: "41", rate: "21.00", rate_id: "r2", delivery_days: "2-5", currency: "RON" }
    reset([answer("GetRates", { Rates: [documented, ranged, { carrier: "x" }], RatesErrors: [{ carrier: "UPS", carrier_id: "52", carrier_label: "UPS Test", error_message: "Service not available", error_level: 0 }] })])
    const r = await shippypro.rates(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "storelib:abc", contents: "Shoes", currency: "EUR", declaredCents: 5025 })
    const p = calls[0].body.Params
    check("addresses and parcels are lower case, the rest CamelCase (document, Ruby gem and PHP client agree)", !!p.to_address && !!p.from_address && Array.isArray(p.parcels) && "ContentDescription" in p && "ShippingService" in p && "TransactionID" in p && !("to" in p))
    check("  an address's fields as documented", p.to_address.street1 === CLUJ.line1 && p.to_address.street2 === "Ap. 4" && p.to_address.zip === "400114" && p.to_address.state === "CJ" && p.to_address.country === "RO")
    check("  the parcel in CM and KG, said outright rather than left to the defaults", p.parcels[0].length === 30 && p.parcels[0].weight === 1.25 && p.parcels[0].dimension_unit === "CM" && p.parcels[0].weight_unit === "KG")
    check("  the declared value as ShippyPro parses it", p.TotalValue === "50.25 EUR")
    check("  the order goes as TransactionID", p.TransactionID === "storelib:abc")
    check("the two readable rates are read, the one without a price is left out", r.rates.length === 2)
    const g = r.rates[0]
    check("  carrier, id, service, and the three Ship takes back", g.carrier === "Generic" && g.carrierId === 6 && g.service === "Standard" && g.rateId === "orderRate" && g.orderId === "orderID")
    check("  7.60 is 760 minor units", g.cents === 760 && g.days === 2)
    check("  no currency in the answer (the document has none): the fallback, and it says so", g.currency === "EUR" && g.currencyAssumed === true)
    check("  a currency in the answer is used and not called assumed", r.rates[1].currency === "RON" && r.rates[1].currencyAssumed === false && r.rates[1].cents === 2100)
    check("  \"2-5\" days reads as 2", r.rates[1].days === 2)
    check("a carrier's error comes back in its own words", r.messages.join() === "UPS Test: Service not available")
    reset([answer("GetRates", { Rates: [], RatesErrors: [] })])
    const none = await shippypro.rates(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "r", contents: "c", currency: "EUR" })
    check("{Rates: [], RatesErrors: []}, the help centre's no rates answer, is no rates", none.rates.length === 0 && none.messages.length === 0)
    check("a yen value has no decimals", fromMinor(1200, "JPY") === "1200" && fromMinor(5025, "EUR") === "50.25")
  }

  /* ── a label ────────────────────────────────────────────────────────── */
  console.log("\nShip: a label, or ShippyPro's reason\n")
  {
    const rate = { carrier: "Sameday", carrierId: 41, service: "Standard", rateId: "r2", orderId: "o2" }
    reset([answer("Ship", { Result: "OK", NewOrderID: "1234567", LabelURL: ["https://cdn.shippypro.com/labels/first_label.zpl"], PDF: ["https://cdn.shippypro.com/labels/first_label.pdf"], ZPL: [], TrackingCarrier: "Sameday", TrackingNumber: "UD26123123456", TrackingExternalLink: "https://example.ro/t/UD26123123456", Status: "1" })])
    const l = await shippypro.ship(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "storelib:abc", contents: "Shoes \\ boots", currency: "EUR", rate })
    const p = calls[0].body.Params
    check("Ship gets the shipment again plus the chosen rate's carrier, as required", p.CarrierName === "Sameday" && p.CarrierID === 41 && p.CarrierService === "Standard" && p.RateID === "r2" && p.OrderID === "o2" && p.TransactionID === "storelib:abc" && !!p.to_address)
    check("  a PDF, synchronously, with no backslash in the contents (documented to break it)", p.LabelType === "PDF" && p.Async === false && !p.ContentDescription.includes("\\"))
    check("the PDF label is taken over a ZPL one", l.labelUrl === "https://cdn.shippypro.com/labels/first_label.pdf")
    check("  ShippyPro's order id, for voiding, and the tracking", l.orderId === "1234567" && l.trackingNumber === "UD26123123456" && l.carrier === "Sameday" && l.trackingUrl === "https://example.ro/t/UD26123123456")
    reset([answer("Ship", { Result: "OK", NewOrderID: "9", LabelURL: "https://cdn.shippypro.com/labels/one.pdf", Status: "1" })])
    check("LabelURL as a single string, as documented", (await shippypro.ship(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "r", contents: "c", currency: "EUR", rate })).labelUrl === "https://cdn.shippypro.com/labels/one.pdf")
    reset([answer("Ship", { Status: "2", ErrorMessage: "Error123", ErrorType: { code: "ADDRESS_INVALID", name: "Invalid address" }, ErrorSuggestion: { solution: "Shorten the street field and generate the label again." }, LabelURL: [] })])
    const e = await threw(shippypro.ship(KEY, { from: ROME, to: CLUJ, parcel: BOX, reference: "r", contents: "c", currency: "EUR", rate }))
    check("Status \"2\" is a refusal, with ShippyPro's message and its suggested fix", !!e && e.status === 422 && e.message === "ShippyPro: Error123 Shorten the street field and generate the label again.")
    reset([answer("Ping", { Result: true })])
    await shippypro.verify(KEY)
    check("checking a key never calls Ship (Ship makes a real, billed label)", calls.every((c) => method(c) !== "Ship"))
  }

  /* ── tracking, void, address ────────────────────────────────────────── */
  console.log("\nTracking, void and address check\n")
  {
    /* The document's own GetTracking example, verbatim. */
    reset([answer("GetTracking", { Carrier: "UPS", CarrierLogo: "https://www.shippypro.com/x.png", Completed: true, EstimatedDeliveryDate: "1489659960", StatusCode: 6, ExtendedStatusCode: 6000, FirstStatusDate: "1489419660", Late: false, ExternalLink: "https://mailingtechnology.com/tracking/?tn=UD26123123456", AdditionalTrackingNumbers: [], Details: [{ date: "1489659960", message: "DELIVERED", city: "MOTRIL", StatusCode: 6 }, { date: "1489625040", message: "OUT FOR DELIVERY", city: "GUARROMAN", StatusCode: 3 }] })])
    const t = await shippypro.tracking(KEY, "1ZA103756899507566")
    check("GetTracking sends the number as Code", calls[0].body.Params.Code === "1ZA103756899507566")
    check("  status 6 is delivered, in ShippyPro's word for it", t.delivered && t.statusCode === 6 && t.status === "Delivered" && t.carrier === "UPS")
    check("  Unix seconds strings become dates", t.estimatedDelivery === new Date(1489659960 * 1000).toISOString() && t.events[0].at === t.estimatedDelivery)
    check("  every event, newest first, as sent", t.events.length === 2 && t.events[1].message === "OUT FOR DELIVERY" && t.events[1].city === "GUARROMAN")

    reset([answer("VoidShipments", { Result: "OK" })])
    check("VoidShipments with ShippyPro's order ids and the carrier, Result OK is voided", (await shippypro.voidShipments(KEY, { orderIds: ["1234567"], carrierName: "SDA" })) === "voided" && calls[0].body.Params.OrderIDS.join() === "1234567" && calls[0].body.Params.CarrierName === "SDA")

    /* The document's two CheckAddress examples, verbatim. */
    reset([answer("CheckAddress", { Result: "OK", Message: [], Suggestions: [], Accuracy: 95, Verified: true })])
    const good = await shippypro.checkAddress(KEY, { address: CLUJ, from: ROME, carrierName: "Generic", carrierId: 6 })
    check("CheckAddress names a carrier (it has to) and a good address is ok", good.ok && good.accuracy === 95 && calls[0].body.Params.CarrierName === "Generic" && calls[0].body.Params.Address.city === "Cluj-Napoca" && !!calls[0].body.Params.FromAddress)
    reset([answer("CheckAddress", { Result: "OK", Message: ["Wrong city", "Wrong zip"], Suggestions: [], NewAddress: { street1: "Calle Ancha 12", city: "MOTRIL" }, Accuracy: 60, Verified: true })])
    const bad = await shippypro.checkAddress(KEY, { address: CLUJ, from: ROME, carrierName: "Generic", carrierId: 6 })
    check("  Result OK with messages is not deliverable as written, in ShippyPro's words", !bad.ok && bad.messages.join() === "Wrong city,Wrong zip")
  }

  /* ── what the product offers ────────────────────────────────────────── */
  console.log("\nComing soon, and nothing pretends otherwise\n")
  {
    const p = providerInfo("shippypro")!
    check("ShippyPro is in the list, as Coming soon", !!p && p.availability === "needs_setup" && p.category === "shipping")
    check("  and says why in its description", /Not connected to Storelib yet/.test(p.description) && /has not been run against a real ShippyPro account/.test(p.description))
    check("  no 'key is checked' claim on a card that takes no key", p.verifies !== true)
    check("not a shipping app: no Connect path", !isShippingApp("shippypro") && !(SHIPPING_APPS as readonly string[]).includes("shippypro"))
    check("not a label app: Buy a label never offers it", labelApiFor("shippypro") === null && !("shippypro" in LABEL_APIS))
    check("provider-verify does not claim to check it (ShippyPro is POST only and that file reads only)", (await verifyProviderKey("shippypro", KEY)).state === "unchecked")
    const i = integrationById("shippypro")!
    check("its page is Coming soon with no 'You add'", i.comingSoon === true && i.glance.some((g) => g.value === "Coming soon") && !i.glance.some((g) => g.label === "You add"))
    check("  and says nothing is sent", i.data.join(" ").startsWith("Nothing is sent to ShippyPro"))
    const n = integrationById("nshift")!
    check("nShift is listed as Coming soon, never installable", !!n && n.kind === "listed" && n.comingSoon === true && n.category === "shipping" && n.physical)
    check("  its page says the API is contract only", /only to nShift customers under contract/.test(n.about[0]))
    check("ShippyPro and nShift are each in the list once", INTEGRATIONS.filter((x) => x.id === "shippypro" || x.id === "nshift").length === 2)
  }

  console.log("\nThe connect flow refuses a key, and nothing reaches ShippyPro\n")
  {
    const db = new FakeSupabase()
    const CREATOR = "11111111-1111-4111-8111-111111111111"
    reset([answer("Ping", { Result: true })])
    const r = await saveIntegration(db as any, CREATOR, "shippypro", { apiKey: KEY })
    check("a key, even one ShippyPro would take, is refused with Coming soon", r.ok === false && /isn't connected to Storelib yet/.test((r as any).error))
    check("  ShippyPro was never called", calls.length === 0 && stray === null)
    check("  nothing is stored, sealed or not", (db.rows("commerce_integrations") ?? []).length === 0)
  }

  console.log("\nSealed secrets\n")
  {
    const sealed = sealSecret(KEY)
    check("a ShippyPro key seals to AES-GCM text with no part of the key in it", sealed.startsWith("v1.") && !sealed.includes(KEY) && !sealed.includes(KEY.slice(-8)))
    check("  opens back to the key, and only its last four would be shown", openSecret(sealed) === KEY && secretHint(KEY) === "cdef")
    check("  a tampered seal opens to nothing", openSecret(sealed.slice(0, -2) + (sealed.endsWith("A") ? "BB" : "AA")) === null)
    const db = new FakeSupabase()
    const CREATOR = "22222222-2222-4222-8222-222222222222"
    db.tables.commerce_integrations = [{ id: "sp", creator_id: CREATOR, provider: "shippypro", category: "shipping", status: "needs_setup", config: {}, secret_ciphertext: sealed }]
    const view = (await loadIntegrations(db as any, CREATOR)).find((v) => v.provider === "shippypro")!
    check("a key saved some other way is shown by its last four only", view.keyHint === "cdef" && !JSON.stringify(view).includes(KEY))
    const removed = await saveIntegration(db as any, CREATOR, "shippypro", { disconnect: true })
    check("  and can still be removed", removed.ok === true && db.rows("commerce_integrations").length === 0)
  }

  console.log("\nThe card in each connection state\n")
  {
    const p = providerInfo("shippypro")!
    const state = (status: IntegrationState["status"], extra: Partial<IntegrationState> = {}) => ({ provider: "shippypro", status, keyHint: "cdef", ...extra }) as IntegrationState
    const said = (s: IntegrationState | null) => statusOf(p, s)
    check("nothing saved: Coming soon, gray", said(null).label === "Coming soon" && said(null).tone === "gray")
    check("disconnected: Coming soon", said(state("disconnected")).label === "Coming soon")
    check("a key kept from before: Coming soon, key saved, amber", said(state("needs_setup")).label === "Coming soon · key saved" && said(state("needs_setup")).tone === "amber")
    check("even a row marked connected is not shown connected", said(state("connected", { verifiedAt: "2026-10-17T00:00:00Z" })).label === "Coming soon · key saved")
    check("an error row: still Coming soon, never Problem or Connected", said(state("error")).label === "Coming soon · key saved")
    const market = read("components/physical/integrations-marketplace.tsx")
    check("its card has no Connect button: connectable is false for Coming soon", /const connectable = !comingSoon &&/.test(market))
  }

  console.log("\nCopy\n")
  {
    const words = [read("lib/integrations/shipping/shippypro.ts"), providerInfo("shippypro")!.description, integrationById("shippypro")!.summary, integrationById("nshift")!.about.join(" ")].join("\n")
    check("no em dashes", !/—/.test(words))
    check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge|transform)\b/i.test(words))
  }

  check("no address other than api.shippypro.com was ever called", stray === null, stray)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
