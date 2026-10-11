/**
 * Round 23: every integration in Settings > Integrations does what its page
 * says, or says Coming soon. Printful and Printify take paid orders and send
 * tracking back; keys are sealed on the server and never come back to the
 * browser; provider webhooks are checked (Printify's signature, every
 * address's token, the order read back with the seller's key); a busy
 * provider is retried and a refusing one is said on the order. The external
 * APIs are stubs: `fetch` is replaced, nothing real is ever called.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHmac } from "node:crypto"
import { FakeSupabase } from "./fake-supabase"
import { INTEGRATIONS, visibleIntegrations } from "@/lib/integrations/catalog"
import { PROVIDERS } from "@/lib/physical/providers"
import { TRACKERS, TRACKER_ORDER, purchaseTags, tidyId, trackingTags } from "@/lib/store/tracking"
import { openSecret, sealSecret } from "@/lib/physical/secrets"
import { loadIntegrations, saveIntegration } from "@/lib/physical/integrations-server"
import { CONNECTORS, applyProviderState, forwardToProvider, handleProviderWebhook, nextCheckDelayMs, printifySignatureOk, providerOrderFor, readWebhookToken, syncProviderTracking, webhookToken, webhookUrl, type ForwardDeps } from "@/lib/integrations/fulfilment/forward-server"
import { ProviderError, checkoutIdOf, externalIdOf, providerMessage } from "@/lib/integrations/fulfilment/http"
import { readPrintfulOrder } from "@/lib/integrations/fulfilment/printful"
import { readPrintifyOrder } from "@/lib/integrations/fulfilment/printify"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-integrations-0123456789"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── a stub of the providers' APIs ─────────────────────────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
let calls: Call[] = []
type Route = (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> } | null
let routes: Route[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const c: Call = { method: init.method ?? "GET", url, headers, body: init.body ? JSON.parse(init.body) : null }
  calls.push(c)
  if (!/^https:\/\/(api\.printify\.com|api\.printful\.com)\//.test(url)) throw new Error(`a real address was called: ${url}`)
  for (const r of routes) {
    const out = r(c)
    if (out) return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json", ...(out.headers ?? {}) } })
  }
  return new Response(JSON.stringify({ message: "not stubbed" }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}

/* ── a database ────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
function freshDb() {
  const db = new FakeSupabase()
  let n = 0
  const id = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: id(), config: {}, status: "disconnected" }) })
  db.table("inventory_locations", { unique: [(r) => `${r.creator_id}|${String(r.name).toLowerCase()}`], defaults: () => ({ id: id(), forwarding: "none", integration_id: null, active: true }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("commerce_checkouts", {}, [])
  db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR })
  return db
}

/* An order as loadOrder reads it: a shirt from the Printify location, a mug the seller ships. */
function orderFixture(locationId: string, over: Record<string, unknown> = {}): any {
  return {
    id: CHECKOUT,
    creatorId: CREATOR,
    status: "paid",
    cancelledAt: null,
    buyerEmail: "ana@example.com",
    buyerName: "Ana Lima",
    buyerPhone: "+1 555 0100",
    address: { name: "Ana Lima", line1: "1 Main St", line2: "Apt 2", city: "Austin", region: "Texas", postalCode: "73301", country: "US", phone: "+1 555 0100" },
    lines: [
      { orderId: "44444444-4444-4444-8444-444444444441", title: "Tee", variantName: "M", sku: "TEE-M", quantity: 2, fulfilled: 0, requiresShipping: true, locationId },
      { orderId: "44444444-4444-4444-8444-444444444442", title: "Mug", variantName: null, sku: "MUG", quantity: 1, fulfilled: 0, requiresShipping: true, locationId: "home-location" },
    ],
    shipments: [],
    ...over,
  }
}

function deps(order: any, shippedLog: any[] = [], events: any[] = []): ForwardDeps {
  return {
    loadOrder: (async () => order) as any,
    partnerShipped: (async (_db: any, input: any) => {
      shippedLog.push(input)
      return { ok: true, kind: "shipped", order }
    }) as any,
    addOrderEvent: (async (db: any, e: any) => {
      events.push(e)
      await db.from("commerce_order_events").insert({ checkout_id: e.checkoutId, creator_id: e.creatorId, kind: e.kind, message: e.message, detail: e.detail ?? null, idempotency_key: e.key ?? null })
    }) as any,
    now: () => Date.parse("2026-10-11T12:00:00Z"),
  }
}

const printifyShops: Route = (c) => (c.method === "GET" && c.url === "https://api.printify.com/v1/shops.json" ? (c.headers.authorization === "Bearer good-printify-token" ? { status: 200, body: [{ id: 111, title: "Etsy shop", sales_channel: "etsy" }, { id: 222, title: "Ana prints", sales_channel: "disconnected" }] } : { status: 401, body: { message: "Unauthenticated" } }) : null)
const printifyHooks: Route = (c) => {
  if (c.url === "https://api.printify.com/v1/shops/222/webhooks.json" && c.method === "GET") return { status: 200, body: [] }
  if (c.url === "https://api.printify.com/v1/shops/222/webhooks.json" && c.method === "POST") return { status: 200, body: { id: `wh-${c.body.topic}` } }
  return null
}

function freshDbWith(db: FakeSupabase): FakeSupabase {
  db.tables.commerce_order_events = []
  return db
}

/* Inside a function: the project's own tsconfig (npx tsc --noEmit -p .) has no top-level await. */
async function main() {
console.log("\nEvery integration on the list is real or says Coming soon\n")
{
  const report: string[] = []
  for (const i of INTEGRATIONS) {
    const how =
      i.kind === "tracker" ? "pixel/script by ID on every page" : i.kind === "app" ? "Storelib app" : i.kind === "listed" ? "Coming soon" : i.builtIn ? "built in" : i.comingSoon ? "Coming soon" : "connects"
    report.push(`${i.name}: ${how}`)
    if (i.kind === "tracker") check(`${i.name}: its ID loads its own tag`, !!i.trackerId && trackingTags({ [i.trackerId]: TRACKERS[i.trackerId].example.replace(/\s/g, "") }).length > 0)
    if (i.kind === "commerce") {
      const p = PROVIDERS.find((x) => x.id === i.providerId)!
      if (p.availability === "connect") check(`${i.name}: connects for real (a connector sends its orders)`, !!CONNECTORS[p.id] && !i.comingSoon)
      if (p.availability === "needs_setup") check(`${i.name}: Coming soon, never a Connect button`, i.comingSoon === true && i.glance.some((g) => g.value === "Coming soon"))
      if (p.availability === "live") check(`${i.name}: built in`, i.builtIn && !i.comingSoon)
    }
    if (i.kind === "listed") check(`${i.name}: Coming soon`, i.comingSoon === true)
  }
  check("Printful and Printify are the providers that connect", PROVIDERS.filter((p) => p.availability === "connect").map((p) => p.id).sort().join(",") === "printful,printify")
  check("the physical ones leave the list while physical commerce is off", visibleIntegrations(false).every((i) => !i.physical))
  console.log(`\n    ${report.join("\n    ")}\n`)
}

console.log("\nAnalytics, pixels and onsite scripts\n")
{
  for (const id of TRACKER_ORDER) {
    const t = TRACKERS[id]
    const good = tidyId(id, t.example)
    check(`${t.name}: its example ID is taken`, typeof good === "string" && good !== "bad")
    check(`  and code is refused`, tidyId(id, `${t.example}');alert(1)//`) === "bad")
    const tags = trackingTags({ [id]: good })
    check(`  and only Storelib's copy of its snippet carries it`, tags.length > 0 && tags.every((x) => !x.inline || !x.inline.includes("alert")))
  }
  check("a stored value that is not an ID never reaches a page", trackingTags({ ga4: "G-ABC</script><script>x" }).length === 0)
  const bought = purchaseTags({ meta_pixel: "1234567890123456", ga4: "G-1A2B3C4D5E" }, { id: CHECKOUT, valueCents: 2599, currency: "usd", quantity: 2 })
  check("a paid order is one purchase, value and currency only, de-duplicated by its id", bought.length === 1 && /fbq\('track','Purchase',\{value:25\.99,currency:"USD"\},\{eventID:"3333/.test(bought[0].inline) && !/ana@example/.test(bought[0].inline))
}

console.log("\nKeys are sealed on the server and never come back\n")
{
  const sealed = sealSecret("good-printify-token")
  check("sealed with AES-GCM, the key not in it", sealed.startsWith("v1.") && !sealed.includes("good-printify-token") && openSecret(sealed) === "good-printify-token")
  const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1)
  check("a tampered secret opens to nothing", openSecret(tampered) === null)
}

console.log("\nConnecting Printify: the key is put to Printify, then kept\n")
{
  const db = freshDb()
  reset([printifyShops])
  const refused = await saveIntegration(db, CREATOR, "printify", { apiKey: "bad-printify-token" })
  check("a key Printify refuses is not saved", refused.ok === false && /did not accept/.test((refused as any).error) && db.rows("commerce_integrations").length === 0)

  reset([printifyShops, printifyHooks])
  const ok = await saveIntegration(db, CREATOR, "printify", { apiKey: "good-printify-token" })
  const row = db.rows("commerce_integrations")[0]
  check("an accepted key connects", ok.ok === true && row?.status === "connected", { ok, row })
  check("  on the shop with no sales channel of its own (an API shop)", row?.config?.shop_id === "222" && row?.account_label === "Ana prints")
  check("  the key sealed, never stored plain", typeof row?.secret_ciphertext === "string" && !row.secret_ciphertext.includes("good-printify-token") && openSecret(row.secret_ciphertext) === "good-printify-token")
  const hooks = calls.filter((c) => c.method === "POST" && c.url.endsWith("/webhooks.json"))
  check("  Printify is asked to tell Storelib about shipments, with a secret", hooks.length === 3 && hooks.every((h) => h.body.url === webhookUrl("printify", CREATOR) && /^[0-9a-f]{40}$/.test(h.body.secret)) && hooks.map((h) => h.body.topic).includes("order:shipment:created"))
  check("  that secret kept sealed for checking signatures", openSecret(row?.webhook_secret_ciphertext) === hooks[0]?.body.secret && row?.config?.webhooks === "on")
  const loc = db.rows("inventory_locations")[0]
  check("  a Printify location forwarding to it is made", loc?.name === "Printify" && loc?.kind === "print_on_demand" && loc?.forwarding === "provider" && loc?.integration_id === row?.id)

  const views = await loadIntegrations(db, CREATOR)
  const view = views.find((v) => v.provider === "printify")!
  const json = JSON.stringify(views)
  check("what the browser gets: the last four, never the key or the webhook secret", view.keyHint === "oken" && !json.includes("good-printify-token") && !json.includes(hooks[0]?.body.secret ?? "zz") && !json.includes("ciphertext"))
  check("  with where orders come from and how tracking comes back", view.location?.name === "Printify" && view.webhooks === "on" && view.autoConfirm === false)

  reset([])
  const toggled = await saveIntegration(db, CREATOR, "printify", { autoConfirm: true })
  check("Send straight to production is saved without asking for the key again", toggled.ok === true && db.rows("commerce_integrations")[0].config.auto_confirm === true && calls.length === 0)

  reset([printifyShops, printifyHooks])
  await saveIntegration(db, CREATOR, "printify", { apiKey: "good-printify-token" })
  check("connecting again keeps the one location and the seller's choice", db.rows("inventory_locations").length === 1 && db.rows("commerce_integrations")[0].config.auto_confirm === true)

  reset([
    printifyHooks,
    (c) => (c.method === "GET" && c.url === "https://api.printify.com/v1/shops/222/webhooks.json" ? { status: 200, body: [{ id: "w1", url: webhookUrl("printify", CREATOR) }, { id: "w9", url: "https://elsewhere.example/hook" }] } : null),
    (c) => (c.method === "DELETE" ? { status: 200, body: {} } : null),
  ])
  routes = [routes[1], routes[2]]
  const off = await saveIntegration(db, CREATOR, "printify", { disconnect: true })
  const deleted = calls.filter((c) => c.method === "DELETE").map((c) => c.url)
  check("disconnecting removes Storelib's webhooks and only those", off.ok === true && deleted.length === 1 && deleted[0].endsWith("/webhooks/w1.json"))
  check("  and the row with its key", db.rows("commerce_integrations").length === 0)
}

console.log("\nA Printify key saved before it took orders connects again in one press\n")
{
  const db = freshDb()
  db.tables.commerce_integrations.push({ id: "aaaaaaaa-0000-4000-8000-0000000000ff", creator_id: CREATOR, provider: "printify", category: "print_on_demand", status: "needs_setup", config: {}, secret_ciphertext: sealSecret("good-printify-token") })
  reset([printifyShops, printifyHooks])
  const r = await saveIntegration(db, CREATOR, "printify", { apiKey: "" })
  const row = db.rows("commerce_integrations")[0]
  check("with its saved key: connected to its shop, location made, nothing typed", r.ok === true && row.status === "connected" && row.config.shop_id === "222" && db.rows("inventory_locations").length === 1)
  check("its card says Connect again until then", /label: "Connect again"/.test(read("components/physical/integrations-marketplace.tsx")) && /s\?\.status === "needs_setup" && takesOrders\(i\)\) return "needs_attention"/.test(read("components/app/settings/integrations-directory.tsx")))
}

console.log("\nComing soon providers take no key\n")
{
  const db = freshDb()
  reset([])
  for (const id of ["shippo", "easypost", "shipstation", "gelato", "cj_dropshipping"]) {
    const r = await saveIntegration(db, CREATOR, id, { apiKey: "shippo_live_0123456789" })
    check(`${id}: refused with Coming soon, nothing called`, r.ok === false && /isn't connected to Storelib yet/.test((r as any).error) && calls.length === 0)
  }
  db.tables.commerce_integrations.push({ id: "old", creator_id: CREATOR, provider: "shippo", category: "shipping", status: "needs_setup", config: {}, secret_ciphertext: sealSecret("shippo_live_old") })
  const removed = await saveIntegration(db, CREATOR, "shippo", { disconnect: true })
  check("a key saved before can still be removed", removed.ok === true && db.rows("commerce_integrations").length === 0)
  const market = read("components/physical/integrations-marketplace.tsx")
  check("its card has no Connect button, only Remove saved key", /const connectable = !comingSoon &&/.test(market) && /Remove saved key/.test(market))
  const dir = read("components/app/settings/integrations-directory.tsx")
  check("its page is Tell me when it's ready", /item\.kind === "commerce" && !!item\.comingSoon/.test(dir))
  check("and it is never counted as installed (directory and sidebar)", /i\.kind !== "commerce" \|\| i\.comingSoon/.test(dir) && /!i\.builtIn && !i\.comingSoon/.test(read("app/api/store/integrations/installed/route.ts")))
}

console.log("\nA paid order goes to Printify by SKU\n")
let printifyDb: FakeSupabase
let integrationId = ""
let locationId = ""
{
  const db = (printifyDb = freshDb())
  reset([printifyShops, printifyHooks])
  await saveIntegration(db, CREATOR, "printify", { apiKey: "good-printify-token" })
  integrationId = db.rows("commerce_integrations")[0].id
  locationId = db.rows("inventory_locations")[0].id
  const order = orderFixture(locationId)
  const input = providerOrderFor(order, locationId, false) as any
  check("only this location's items still to ship, by SKU", input.lines.length === 1 && input.lines[0].sku === "TEE-M" && input.lines[0].quantity === 2)
  check("  the state as its code, the order as its 32 hex digits", input.address.region === "TX" && input.externalId === externalIdOf(CHECKOUT) && checkoutIdOf(input.externalId) === CHECKOUT)

  reset([(c) => (c.method === "POST" && c.url === "https://api.printify.com/v1/shops/222/orders.json" ? { status: 200, body: { id: "5a96f649b2439217d070f507" } } : null)])
  const events: any[] = []
  await forwardToProvider(db, { checkoutId: CHECKOUT, locationId, integrationId, creatorId: CREATOR }, deps(order, [], events))
  const sent = calls.find((c) => c.url.endsWith("/orders.json"))
  check("the order is posted to the shop", !!sent && sent.headers.authorization === "Bearer good-printify-token")
  check("  items by SKU, Printify's own buyer email off", sent?.body.line_items?.[0]?.sku === "TEE-M" && sent?.body.line_items?.[0]?.quantity === 2 && sent?.body.send_shipping_notification === false)
  check("  to the buyer's address", sent?.body.address_to?.address1 === "1 Main St" && sent?.body.address_to?.first_name === "Ana" && sent?.body.address_to?.country === "US" && sent?.body.address_to?.region === "TX")
  check("  kept on hold for the seller (no send_to_production)", !calls.some((c) => c.url.includes("send_to_production")))
  check("the order's timeline says so, with Printify's order", events.some((e) => e.kind === "fulfillment.forwarded" && e.detail?.provider_order_id === "5a96f649b2439217d070f507" && /Approve it there/.test(e.message)))
  const job = db.rows("commerce_jobs").find((j) => j.kind === "tracking_sync")
  check("a tracking check is queued for later", !!job && job.payload.providerOrderId === "5a96f649b2439217d070f507" && Date.parse(job.run_after) === Date.parse("2026-10-11T12:00:00Z") + nextCheckDelayMs(1))

  calls = []
  await forwardToProvider(db, { checkoutId: CHECKOUT, locationId, integrationId, creatorId: CREATOR }, deps(order, [], []))
  check("a second run of the same job sends nothing", calls.length === 0)
}

console.log("\nSend straight to production, errors and retries\n")
{
  const db = freshDb()
  reset([printifyShops, printifyHooks])
  await saveIntegration(db, CREATOR, "printify", { apiKey: "good-printify-token" })
  await saveIntegration(db, CREATOR, "printify", { autoConfirm: true })
  const iid = db.rows("commerce_integrations")[0].id
  const lid = db.rows("inventory_locations")[0].id
  reset([
    (c) => (c.method === "POST" && c.url.endsWith("/orders.json") ? { status: 200, body: { id: "abcdef123456" } } : null),
    (c) => (c.method === "POST" && c.url.endsWith("/orders/abcdef123456/send_to_production.json") ? { status: 200, body: { id: "abcdef123456" } } : null),
  ])
  const events: any[] = []
  await forwardToProvider(db, { checkoutId: CHECKOUT, locationId: lid, integrationId: iid, creatorId: CREATOR }, deps(orderFixture(lid), [], events))
  check("with Send straight to production on, it is sent to production", calls.some((c) => c.url.endsWith("send_to_production.json")) && events.some((e) => /for production/.test(e.message)))

  const db2 = freshDb()
  reset([printifyShops, printifyHooks])
  await saveIntegration(db2, CREATOR, "printify", { apiKey: "good-printify-token" })
  const iid2 = db2.rows("commerce_integrations")[0].id
  const lid2 = db2.rows("inventory_locations")[0].id
  reset([(c) => (c.method === "POST" ? { status: 429, body: { message: "Too many" }, headers: { "retry-after": "30" } } : null)])
  let thrown: unknown = null
  try {
    await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: lid2, integrationId: iid2, creatorId: CREATOR }, deps(orderFixture(lid2)))
  } catch (e) {
    thrown = e
  }
  check("Printify busy (429): thrown to be retried by the queue, with its Retry-After", thrown instanceof ProviderError && thrown.retry === true && thrown.retryAfterSeconds === 30)
  reset([(c) => (c.method === "POST" ? { status: 503, body: {} } : null)])
  thrown = null
  try {
    await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: lid2, integrationId: iid2, creatorId: CREATOR }, deps(orderFixture(lid2)))
  } catch (e) {
    thrown = e
  }
  check("Printify down (5xx): retried too", thrown instanceof ProviderError && thrown.retry === true)
  reset([(c) => (c.method === "POST" ? { status: 400, body: { message: "Validation failed.", errors: { reason: "SKU TEE-M not found" } } } : null)])
  const ev: any[] = []
  await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: lid2, integrationId: iid2, creatorId: CREATOR }, deps(orderFixture(lid2), [], ev))
  check("Printify refuses: not retried, the order says to send it by hand", ev.some((e) => e.kind === "fulfillment.manual_needed" && /Validation failed/.test(e.message)))
  check("  and the integration shows the problem", /Validation failed/.test(db2.rows("commerce_integrations")[0].last_error ?? ""))
  reset([])
  const ev2: any[] = []
  const noSku = orderFixture(lid2)
  noSku.lines[0].sku = null
  await forwardToProvider(freshDbWith(db2), { checkoutId: CHECKOUT, locationId: lid2, integrationId: iid2, creatorId: CREATOR }, deps(noSku, [], ev2))
  check("an item without a SKU is not guessed at: nothing sent, the order says why", calls.length === 0 && ev2.some((e) => /no SKU/.test(e.message)))
  const ev3: any[] = []
  await forwardToProvider(db2, { checkoutId: CHECKOUT, locationId: lid2, integrationId: "99999999-9999-4999-8999-999999999999", creatorId: CREATOR }, deps(orderFixture(lid2), [], ev3))
  check("a disconnected integration: nothing sent, marked to send by hand", calls.length === 0 && ev3.some((e) => /not connected/.test(e.message)))
  check("provider errors read in their own words", providerMessage({ error: { message: "Bad address" } }) === "Bad address" && providerMessage({ errors: { reason: "No SKU" } }) === "No SKU")
}

console.log("\nTracking comes back: Printify's shipments ship the order\n")
{
  const db = printifyDb
  const shippedLog: any[] = []
  reset([
    (c) =>
      c.method === "GET" && c.url === "https://api.printify.com/v1/shops/222/orders/5a96f649b2439217d070f507.json"
        ? { status: 200, body: { id: "5a96f649b2439217d070f507", external_id: externalIdOf(CHECKOUT), status: "fulfilled", shipments: [{ carrier: "usps", number: "9400110200828911663274", url: "http://example.com/track", delivered_at: null }] } }
        : null,
  ])
  await syncProviderTracking(db, { checkoutId: CHECKOUT, locationId, integrationId, providerOrderId: "5a96f649b2439217d070f507", creatorId: CREATOR, round: 1 }, deps(orderFixture(locationId), shippedLog))
  check("the parcel ships this location's items with its carrier (as buyers read it) and number", shippedLog.length === 1 && shippedLog[0].trackingNumber === "9400110200828911663274" && shippedLog[0].carrier === "USPS" && shippedLog[0].locationId === locationId && shippedLog[0].status === "shipped")
  check("  a link that is not https is left out (the carrier's own link is used)", shippedLog[0].trackingUrl === null)
  check("  named as Printify on the shipment", shippedLog[0].partner?.provider === "printify" && shippedLog[0].partner?.name === "Printify")
  check("not delivered yet: checked again later", db.rows("commerce_jobs").some((j) => j.kind === "tracking_sync" && j.payload.round === 2))
  const state = readPrintifyOrder({ id: "x", status: "fulfilled", shipments: [{ carrier: "usps", number: "1", url: "https://t", delivered_at: "2026-10-12 10:00:00+00:00" }] })
  check("delivered when Printify says so", state.stage === "delivered" && state.shipments[0].delivered === true)
  const delivered: any[] = []
  const r = await applyProviderState(db, { creatorId: CREATOR, checkoutId: CHECKOUT, locationId, provider: "printify", name: "Printify" }, state, deps(orderFixture(locationId), delivered))
  check("  which moves the shipment to delivered and stops checking", delivered[0]?.status === "delivered" && r.finished === true)
  const ev: any[] = []
  const cancelled = await applyProviderState(db, { creatorId: CREATOR, checkoutId: CHECKOUT, locationId, provider: "printify", name: "Printify" }, readPrintifyOrder({ id: "x", status: "canceled", shipments: [] }), deps(orderFixture(locationId), [], ev))
  check("a cancelled Printify order is said on the order", cancelled.finished && ev.some((e) => /cancelled its order/.test(e.message)))
  const ev2: any[] = []
  await applyProviderState(db, { creatorId: CREATOR, checkoutId: CHECKOUT, locationId, provider: "printify", name: "Printify" }, readPrintifyOrder({ id: "x", status: "payment-not-received", shipments: [] }), deps(orderFixture(locationId), [], ev2))
  check("an order Printify could not charge for is said too", ev2.some((e) => /could not charge/.test(e.message)))
}

console.log("\nPrintful: SKUs to its sync variants, drafts by default\n")
{
  const db = freshDb()
  const stores: Route = (c) => (c.url === "https://api.printful.com/stores" ? { status: 200, body: { code: 200, result: [{ id: 77, name: "Ana's Printful", type: "native" }] } } : null)
  const hook: Route = (c) => (c.url === "https://api.printful.com/webhooks" ? (c.method === "GET" ? { status: 200, body: { code: 200, result: { url: null, types: [] } } } : { status: 200, body: { code: 200, result: {} } }) : null)
  reset([stores, hook])
  const ok = await saveIntegration(db, CREATOR, "printful", { apiKey: "printful-private-token" })
  const row = db.rows("commerce_integrations")[0]
  const set = calls.find((c) => c.method === "POST" && c.url === "https://api.printful.com/webhooks")
  check("connected to its store", ok.ok && row.config.store_id === "77" && row.account_label === "Ana's Printful")
  check("  its one webhook address set to Storelib's, as the store had none", set?.body.url === webhookUrl("printful", CREATOR) && set?.body.types.includes("package_shipped") && row.config.webhooks === "on")

  const db2 = freshDb()
  reset([stores, (c) => (c.url === "https://api.printful.com/webhooks" && c.method === "GET" ? { status: 200, body: { code: 200, result: { url: "https://sellers-own.example/printful" } } } : null)])
  await saveIntegration(db2, CREATOR, "printful", { apiKey: "printful-private-token" })
  check("a store that already sends its webhooks elsewhere is left alone: tracking is read on a timer", !calls.some((c) => c.method === "POST" && c.url.endsWith("/webhooks")) && db2.rows("commerce_integrations")[0].config.webhooks === "off")

  const iid = row.id
  const lid = db.rows("inventory_locations")[0].id
  reset([
    (c) => (c.url.startsWith("https://api.printful.com/store/products?") ? { status: 200, body: { code: 200, result: [{ id: 1 }, { id: 2 }], paging: { total: 2, offset: 0, limit: 100 } } } : null),
    (c) => (c.url === "https://api.printful.com/store/products/1" ? { status: 200, body: { code: 200, result: { sync_variants: [{ id: 501, sku: "HAT" }] } } } : null),
    (c) => (c.url === "https://api.printful.com/store/products/2" ? { status: 200, body: { code: 200, result: { sync_variants: [{ id: 502, sku: "TEE-M" }] } } } : null),
    (c) => (c.method === "POST" && c.url.startsWith("https://api.printful.com/orders?") ? { status: 200, body: { code: 200, result: { id: 9001, status: "draft" } } } : null),
  ])
  const events: any[] = []
  await forwardToProvider(db, { checkoutId: CHECKOUT, locationId: lid, integrationId: iid, creatorId: CREATOR }, deps(orderFixture(lid), [], events))
  const post = calls.find((c) => c.method === "POST")
  check("the SKU is found among the store's products", post?.body.items?.[0]?.sync_variant_id === 502 && post?.body.items?.[0]?.quantity === 2)
  check("  a draft (confirm=false), updated rather than doubled on a retry", /confirm=false/.test(post?.url ?? "") && /update_existing=true/.test(post?.url ?? "") && post?.body.external_id === externalIdOf(CHECKOUT))
  check("  with the store id and the state code", post?.headers["x-pf-store-id"] === "77" && post?.body.recipient?.state_code === "TX")
  check("  said on the order", events.some((e) => e.kind === "fulfillment.forwarded" && e.detail?.provider_order_id === "9001"))

  const db3 = freshDb()
  reset([stores, hook])
  await saveIntegration(db3, CREATOR, "printful", { apiKey: "printful-private-token" })
  reset([
    (c) => (c.url.startsWith("https://api.printful.com/store/products?") ? { status: 200, body: { code: 200, result: [{ id: 1 }], paging: { total: 1 } } } : null),
    (c) => (c.url === "https://api.printful.com/store/products/1" ? { status: 200, body: { code: 200, result: { sync_variants: [{ id: 501, sku: "HAT" }] } } } : null),
  ])
  const ev: any[] = []
  await forwardToProvider(db3, { checkoutId: CHECKOUT, locationId: db3.rows("inventory_locations")[0].id, integrationId: db3.rows("commerce_integrations")[0].id, creatorId: CREATOR }, deps(orderFixture(db3.rows("inventory_locations")[0].id), [], ev))
  check("a SKU Printful does not have: no order posted, the seller told which", !calls.some((c) => c.method === "POST") && ev.some((e) => /no product with SKU TEE-M/.test(e.message)))

  const st = readPrintfulOrder({ id: 9001, external_id: externalIdOf(CHECKOUT), status: "fulfilled", shipments: [{ carrier: "FEDEX", tracking_number: 12345678, tracking_url: "https://www.fedex.com/fedextrack/?tracknumbers=12345678" }] })
  const shipped: any[] = []
  const r = await applyProviderState(db, { creatorId: CREATOR, checkoutId: CHECKOUT, locationId: lid, provider: "printful", name: "Printful" }, st, deps(orderFixture(lid), shipped))
  check("a Printful shipment ships the items with its https tracking link, and that is the end", shipped[0]?.trackingNumber === "12345678" && shipped[0]?.trackingUrl?.startsWith("https://www.fedex.com") && r.finished)
}

console.log("\nWebhooks: the address, the signature, the order read back\n")
{
  const token = webhookToken("printify", CREATOR)
  check("the address token opens to its store", readWebhookToken("printify", token) === CREATOR)
  check("  not for another provider", readWebhookToken("printful", token) === null)
  check("  not with one character changed", readWebhookToken("printify", token.slice(0, -1) + (token.endsWith("a") ? "b" : "a")) === null)
  check("  not for another store with the same signature", readWebhookToken("printify", `${OTHER}.${token.split(".")[1]}`) === null)

  const db = printifyDb
  const row = db.rows("commerce_integrations")[0]
  const secret = openSecret(row.webhook_secret_ciphertext)!
  const raw = JSON.stringify({ id: "evt1", type: "order:shipment:created", resource: { id: "5a96f649b2439217d070f507", type: "order", data: { shop_id: 222, carrier: { code: "USPS", tracking_number: "FAKE-FROM-BODY" } } } })
  const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`
  check("Printify's signature is checked over the raw body", printifySignatureOk(secret, sig, raw) && !printifySignatureOk(secret, sig, raw + " ") && !printifySignatureOk("other", sig, raw))

  reset([])
  const shipped: any[] = []
  const bad = await handleProviderWebhook(db, { provider: "printify", creatorId: CREATOR, raw, signature: "sha256=" + "0".repeat(64) }, deps(orderFixture(locationId), shipped))
  check("a wrong signature: 401, Printify not even asked", bad.status === 401 && calls.length === 0 && shipped.length === 0)

  reset([
    (c) =>
      c.url === "https://api.printify.com/v1/shops/222/orders/5a96f649b2439217d070f507.json"
        ? { status: 200, body: { id: "5a96f649b2439217d070f507", external_id: externalIdOf(CHECKOUT), status: "fulfilled", shipments: [{ carrier: "usps", number: "9400110200828911663274", url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400110200828911663274", delivered_at: null }] } }
        : null,
  ])
  const good = await handleProviderWebhook(db, { provider: "printify", creatorId: CREATOR, raw, signature: sig }, deps(orderFixture(locationId), shipped))
  check("a signed one: the order is read back from Printify with the seller's key", good.status === 200 && calls.length === 1 && calls[0].headers.authorization === "Bearer good-printify-token")
  check("  and what Printify says ships it, never the body's own number", shipped.length === 1 && shipped[0].trackingNumber === "9400110200828911663274")

  reset([(c) => (c.url.includes("/orders/") ? { status: 200, body: { id: "5a96f649b2439217d070f507", external_id: "ffffffffffffffffffffffffffffffff", status: "fulfilled", shipments: [{ carrier: "usps", number: "1Z", url: null }] } } : null)])
  const notOurs: any[] = []
  const stray = await handleProviderWebhook(db, { provider: "printify", creatorId: CREATOR, raw, signature: sig }, deps(orderFixture(locationId), notOurs))
  check("an order that is not this store's is ignored (200, so it is not retried)", stray.status === 200 && notOurs.length === 0)

  reset([(c) => (c.url.includes("/orders/") ? { status: 502, body: {} } : null)])
  const busy = await handleProviderWebhook(db, { provider: "printify", creatorId: CREATOR, raw, signature: sig }, deps(orderFixture(locationId), []))
  check("Printify down while reading back: 503, so Printify delivers it again", busy.status === 503)

  const route = read("app/api/integrations/webhooks/[provider]/[token]/route.ts")
  check("the route is rate limited, gated with physical commerce, and checks the token first", /rateLimit\(/.test(route) && /physicalApiGate\(\)/.test(route) && /readWebhookToken\(provider, token\)/.test(route) && /x-pfy-signature/.test(route))
}

console.log("\nThe job queue sends orders to connected providers\n")
{
  const jobs = read("lib/physical/jobs-server.ts")
  check("a location forwarding to a connected Printful or Printify queues forward_fulfillment", /loc\.forwarding === "provider" && loc\.integration_id && \(await providerTakesOrders\(db, creatorId, loc\.integration_id\)\)/.test(jobs) && /kind: "forward_fulfillment", key: `provider:\$\{checkoutId\}:\$\{loc\.id\}`/.test(jobs))
  check("  otherwise the order is still marked to send by hand", /is set to forward through a provider that is not connected/.test(jobs))
  check("the queue runs both jobs, with backoff and a dead letter said on the order", /case "forward_fulfillment":\s*return forwardToProvider/.test(jobs) && /case "tracking_sync":\s*return syncProviderTracking/.test(jobs) && /could not be sent to your print partner/.test(jobs))
  check("tracking is checked for about three weeks, then left to the seller", nextCheckDelayMs(1) === 2 * 3600_000 && nextCheckDelayMs(10) === 6 * 3600_000)
}

console.log("\nYour own system (webhook): signed, retried, its failures shown, a test to send\n")
{
  const jobs = read("lib/physical/jobs-server.ts")
  check("each order is signed v1=HMAC-SHA256 of timestamp.body with the seller's secret", /createHmac\("sha256", secret\)\.update\(`\$\{timestamp\}\.\$\{payload\}`\)/.test(jobs) && /"x-storelib-signature": `v1=\$\{signature\}`/.test(jobs))
  check("to a public https address only, the socket refusing private addresses", /lookup: publicLookup/.test(jobs) && /publicUrlProblem\(url\)/.test(jobs))
  check("a failed delivery is kept on the integration, so its card says so", /last_error: `Your webhook answered \$\{status\}\. Storelib tries again\.`/.test(jobs) && /Your webhook could not be reached/.test(jobs))
  check("Send a test: a signed ping, what the address answered said back", /export async function sendTestWebhook/.test(jobs) && /event: "ping"/.test(jobs) && /data-integration-test=""/.test(read("components/physical/integrations-marketplace.tsx")))
  const test = read("app/api/physical/integrations/[provider]/test/route.ts")
  check("  the owner only, a few a minute, custom_webhook only", /physicalCaller\(\)/.test(test) && /rateLimit\(/.test(test) && /provider !== "custom_webhook"/.test(test))
  check("saving a key is rate limited, as it asks the provider", /bucket: "integration-save"/.test(read("app/api/physical/integrations/[provider]/route.ts")))
}

console.log("\nEntering and leaving an integration's page\n")
{
  const dir = read("components/app/settings/integrations-directory.tsx")
  check("no sideways slide: a 120ms fade only", /const SWAP_MS = 120/.test(dir) && !/translate3d\(\$\{dx\}px/.test(dir) && !/PAGE_SHIFT/.test(dir))
  check("opening is a history entry, so the phone's Back returns to the list", /writeIntegrationParam\(id, "push"\)/.test(dir) && /window\.history\.pushState\(null, "", url\.toString\(\)\)/.test(dir))
  check("its own Back goes back through that entry, never piling them up", /if \(pushed\.current\) \{[\s\S]{0,200}window\.history\.back\(\)/.test(dir))
  check("the list comes back where it was: its scroll, and the card focused", /box\.scrollTop = at\.scroll/.test(dir) && /focus\(\{ preventScroll: true \}\)/.test(dir))
  check("a link to a page opens on it, without a frame of the list first", /useState<string \| null>\(wanted\)/.test(dir))
}

globalThis.fetch = realFetch
console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
