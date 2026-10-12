/**
 * ROUND 24, COURIER TRACKING: EVERY SHIPMENT WITH A TRACKING NUMBER IS
 * FOLLOWED WITH THE CARRIER, AND THE ORDER MOVES ON BY ITSELF
 *
 *   words          AfterShip's tags and 17TRACK's statuses read as one set,
 *                  each moving the shipment to the status it means
 *   AfterShip      register (POST /trackings, 4003 read back), read, detect,
 *                  the aftership-hmac-sha256 webhook signature
 *   17TRACK        register (-18019901 is fine), gettrackinfo, the `sign`
 *                  webhook signature
 *   the cron       /api/cron/physical reads only open parcels whose next look
 *                  is due, registers new ones, stops after delivered or 60
 *                  days, backs off as parcels age and when reading fails
 *   the webhook    signature, address token, then read back from the API;
 *                  the same delivery twice changes nothing
 *   emails         Out for delivery, Delivered and Delivery issue each once,
 *                  the seller told of a problem; delivered_at is the
 *                  carrier's time and the return window counts from it
 *   partners       a Printful shipment's number is followed too
 *   no key         nothing is asked of anyone; the pages say so
 *   pages          the buyer's and seller's order pages show the scans and
 *                  the estimated delivery; the seller can still set a status
 *                  and pause automatic updates
 *
 * No real network: fetch is a stub of both APIs, and a call to any other
 * host fails the suite.
 *
 * Run: pnpm run test:push (or NODE_OPTIONS="--conditions=react-server" npx tsx tests/tracking24.test.ts)
 */
import { createHash, createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"
import { checkpointId, cleanCheckpoints, from17TrackStatus, fromAfterShipTag, isFinal, nextCheckAt, problemText, shipmentStatusFor, TRACKING_LABEL } from "@/lib/physical/tracking/model"
import { aftership, parseAfterShip } from "@/lib/physical/tracking/aftership"
import { seventeentrack } from "@/lib/physical/tracking/seventeentrack"
import { platformAccount, platformTrackingState, readTrackingWebhookToken, trackingWebhookToken, type TrackingAccount } from "@/lib/physical/tracking/provider"
import { handleTrackingWebhook, runTrackingSweep } from "@/lib/physical/tracking/sync-server"
import { loadTrackingSettings, saveOwnTrackingAccount, setTrackingAuto } from "@/lib/physical/tracking/accounts-server"
import { loadOrder, updateShipment } from "@/lib/physical/orders-server"
import { returnWindow } from "@/lib/physical/status"
import { guessCarrier } from "@/lib/physical/status"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const SHOP = "7a0c0000-0000-4000-8000-000000000001"
const OTHER = "7a0c0000-0000-4000-8000-000000000002"
const CO = "7a0c0000-0000-4000-8000-0000000000c1"
const LINE = "7a0c0000-0000-4000-8000-0000000000d1"
const F = "7a0c0000-0000-4000-8000-0000000000f1"
const F2 = "7a0c0000-0000-4000-8000-0000000000f2"
const DAY = 86_400_000
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

/* ── the stub of both APIs; any other host is a failure ────────────────── */

type Call = { method: string; url: string; headers: Record<string, string>; body: any }
const calls: Call[] = []
const strayHosts: string[] = []
let aftershipTracking: any = null
let aftershipExists = false
let seventeenInfo: any = null
let seventeenRegistered = new Set<string>()

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = String(typeof input === "string" ? input : input.url)
  const host = new URL(url).host
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const body = init.body ? JSON.parse(String(init.body)) : null
  calls.push({ method: init.method ?? "GET", url, headers, body })
  if (host === "api.aftership.com") {
    if (headers["as-api-key"] !== "as_key_platform" && headers["as-api-key"] !== "as_key_own") return reply(401, { meta: { code: 401, message: "Invalid API key" } })
    const path = new URL(url).pathname.replace("/tracking/2024-10", "")
    if (path === "/trackings" && init.method === "POST") {
      if (aftershipExists) return reply(400, { meta: { code: 4003, message: "Tracking already exists." }, data: {} })
      aftershipExists = true
      return reply(201, { meta: { code: 201 }, data: aftershipTracking })
    }
    if (path === "/trackings") return reply(200, { meta: { code: 200 }, data: { trackings: aftershipTracking ? [aftershipTracking] : [] } })
    if (path.startsWith("/trackings/")) return aftershipTracking ? reply(200, { meta: { code: 200 }, data: aftershipTracking }) : reply(404, { meta: { code: 4004, message: "Tracking does not exist." } })
    if (path === "/couriers/detect") return reply(200, { meta: { code: 200 }, data: { couriers: [{ slug: "ups", name: "UPS" }] } })
    if (path === "/couriers") return reply(200, { meta: { code: 200 }, data: { couriers: [] } })
    return reply(404, { meta: { code: 404 } })
  }
  if (host === "api.17track.net") {
    if (headers["17token"] !== "st_key_platform") return reply(401, { code: 401 })
    const path = new URL(url).pathname.replace("/track/v2.2", "")
    if (path === "/register") {
      const n = body[0].number
      if (seventeenRegistered.has(n)) return reply(200, { code: 0, data: { accepted: [], rejected: [{ number: n, error: { code: -18019901, message: "The tracking number is already registered." } }] } })
      seventeenRegistered.add(n)
      return reply(200, { code: 0, data: { accepted: [{ number: n, carrier: 21051 }], rejected: [] } })
    }
    if (path === "/gettrackinfo") {
      const n = body[0].number
      if (!seventeenRegistered.has(n)) return reply(200, { code: 0, data: { accepted: [], rejected: [{ number: n, error: { code: -18019902, message: "The tracking number is not registered." } }] } })
      return reply(200, { code: 0, data: { accepted: [{ number: n, carrier: 21051, track_info: seventeenInfo }], rejected: [] } })
    }
    if (path === "/getquota") return reply(200, { code: 0, data: { quota_total: 100 } })
    return reply(404, { code: 404 })
  }
  strayHosts.push(host)
  throw new Error(`a real host was called: ${host}`)
}) as typeof fetch

const asTracking = (tag: string, checkpoints: { time: string; tag: string; message: string; city?: string; subtag?: string }[], extra: Record<string, unknown> = {}) => ({
  id: "as_trk_1",
  tracking_number: "1Z999AA10123456784",
  slug: "ups",
  tag,
  subtag: `${tag}_001`,
  courier_estimated_delivery_date: { estimated_delivery_date: new Date(Date.now() + 2 * DAY).toISOString().slice(0, 10), estimated_delivery_date_min: null, estimated_delivery_date_max: null },
  checkpoints: checkpoints.map((c) => ({ checkpoint_time: c.time, tag: c.tag, subtag: c.subtag ?? `${c.tag}_001`, message: c.message, city: c.city ?? "Louisville", state: "KY", country_region_name: "USA", location: null })),
  ...extra,
})

function orderTables(extra: { fulfillments?: any[] } = {}) {
  return {
    commerce_checkouts: [{ id: CO, creator_id: SHOP, status: "paid", fulfillment_status: "fulfilled", return_status: "none", currency: "USD", buyer_email: "b@example.com", buyer_name: "Ana Pop", items_subtotal_cents: 5000, discount_cents: 0, shipping_cents: 0, shipping_discount_cents: 0, tax_cents: 0, total_cents: 5000, refunded_cents: 0, receipt_token: "tok_trackingtrackingtracking", delivery_method: "ship", shipping_rate: { name: "Standard" }, lines: [{ title: "Hoodie", type: "physical" }], paid_at: ago(5), created_at: ago(5) }],
    orders: [{ id: LINE, checkout_id: CO, quantity: 1, amount_cents: 5000, refund_amount_cents: 0, requires_shipping: true, product_snapshot: { title: "Hoodie", type: "physical" }, created_at: ago(5) }],
    fulfillments: extra.fulfillments ?? [{ id: F, checkout_id: CO, creator_id: SHOP, status: "shipped", provider: "manual", carrier: "UPS", tracking_number: "1Z999AA10123456784", tracking_url: null, shipped_at: ago(1), created_at: ago(1), notify_buyer: true, tracking_auto: true, tracking_failures: 0 }],
    fulfillment_items: [{ fulfillment_id: F, order_id: LINE, quantity: 1 }],
    fulfillment_events: [] as any[],
    commerce_returns: [],
    commerce_return_items: [],
    commerce_order_events: [] as any[],
    commerce_jobs: [] as any[],
    commerce_tracking_accounts: [] as any[],
  }
}
const uniqueJobs = { unique: { commerce_jobs: [["idempotency_key"]] } }
const jobKeys = (db: { tables: Record<string, any[]> }) => db.tables.commerce_jobs.map((j) => j.idempotency_key as string)

function setEnv(vars: Record<string, string | undefined>) {
  for (const k of ["TRACKING_PROVIDER", "AFTERSHIP_API_KEY", "AFTERSHIP_WEBHOOK_SECRET", "SEVENTEENTRACK_API_KEY"]) delete process.env[k]
  for (const [k, v] of Object.entries(vars)) if (v !== undefined) process.env[k] = v
}
process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-commerce-secrets-key-for-tracking24"

async function main() {
  section("1. One set of words for both aggregators")
  {
    check("AfterShip tags: InTransit, OutForDelivery, AvailableForPickup, AttemptFail, Delivered", fromAfterShipTag("InTransit") === "in_transit" && fromAfterShipTag("OutForDelivery") === "out_for_delivery" && fromAfterShipTag("AvailableForPickup") === "available_for_pickup" && fromAfterShipTag("AttemptFail") === "attempt_failed" && fromAfterShipTag("Delivered") === "delivered" && fromAfterShipTag("InfoReceived") === "info_received")
    check("  an exception that is a return to sender reads as returned (subtag or words)", fromAfterShipTag("Exception", "Exception_011") === "returned" && fromAfterShipTag("Exception", "Exception_004", "Package returned to sender") === "returned" && fromAfterShipTag("Exception", "Exception_004") === "exception")
    check("17TRACK statuses: NotFound, InTransit, OutForDelivery, DeliveryFailure, Delivered, Expired", from17TrackStatus("NotFound") === "not_found" && from17TrackStatus("InTransit") === "in_transit" && from17TrackStatus("OutForDelivery") === "out_for_delivery" && from17TrackStatus("DeliveryFailure") === "attempt_failed" && from17TrackStatus("Delivered") === "delivered" && from17TrackStatus("Expired") === "expired")
    check("  Exception_Returned and Exception_Returning read as returned", from17TrackStatus("Exception", "Exception_Returned") === "returned" && from17TrackStatus("Exception", "Exception_Returning") === "returned" && from17TrackStatus("Exception", "Exception_Damage") === "exception")
    check(
      "each state moves the shipment to what it means; a label made moves nothing",
      shipmentStatusFor("in_transit") === "in_transit" && shipmentStatusFor("out_for_delivery") === "out_for_delivery" && shipmentStatusFor("available_for_pickup") === "out_for_delivery" && shipmentStatusFor("delivered") === "delivered" && shipmentStatusFor("attempt_failed") === "failed" && shipmentStatusFor("exception") === "failed" && shipmentStatusFor("returned") === "failed" && shipmentStatusFor("info_received") === null && shipmentStatusFor("pending") === null,
    )
    check("delivered, returned and expired are the end; nothing more is asked", isFinal("delivered") && isFinal("returned") && isFinal("expired") && !isFinal("exception") && !isFinal("in_transit"))
    check("the buyer reads a problem in plain words, with the carrier's own", problemText("attempt_failed", "Receiver not home") === "The carrier tried to deliver it: Receiver not home" && /going back to the shop/.test(problemText("returned", null) ?? "") && problemText("in_transit", "x") === null)
    check("every state has a label for both pages", Object.values(TRACKING_LABEL).every((l) => l.label.length > 0) && TRACKING_LABEL.returned.label === "Returned to sender")
    const a = { at: "2026-10-10T08:15:30Z", status: "in_transit" as const, message: "Departed facility", location: "Louisville, KY" }
    check("the same scan makes the same id, whatever the seconds or the case; a different one differs", checkpointId(a) === checkpointId({ ...a, at: "2026-10-10T08:15:59Z", message: "DEPARTED FACILITY " }) && checkpointId(a) !== checkpointId({ ...a, location: "Memphis, TN" }))
    const cleaned = cleanCheckpoints([a, { ...a }, { at: "nonsense", status: "in_transit", message: "x", location: null }, { at: "2026-10-11T08:00:00Z", status: "out_for_delivery", message: "<b>Out</b>", location: null }])
    check("scans kept once, newest first, markup taken out, an unreadable time dropped", cleaned.length === 2 && cleaned[0].status === "out_for_delivery" && !/[<>]/.test(cleaned[0].message), cleaned)
  }

  section("2. When to look again: cheap, by age, and never after the end")
  {
    const now = Date.parse("2026-10-12T12:00:00Z")
    const wait = (shippedDaysAgo: number, status: any, extra: Record<string, unknown> = {}) => {
      const at = nextCheckAt({ shippedAt: new Date(now - shippedDaysAgo * DAY).toISOString(), status, now, ...extra })
      return at === null ? null : (Date.parse(at) - now) / 3_600_000
    }
    check("new: every 3 hours; a week old: 6; three weeks: 12; over 30 days: a day", wait(1, "in_transit") === 3 && wait(7, "in_transit") === 6 && wait(20, "in_transit") === 12 && wait(40, "in_transit") === 24)
    check("out for delivery: every hour", wait(5, "out_for_delivery") === 1)
    check("with webhooks the poll is only a check: twice as far apart", wait(1, "in_transit", { webhooks: true }) === 6)
    check("stopped: delivered, returned, expired, or 60 days after shipping", wait(2, "delivered") === null && wait(2, "returned") === null && wait(2, "expired") === null && wait(61, "in_transit") === null)
    check("reading failed: further apart each time, up to a day", wait(1, "in_transit", { failures: 1 }) === 3 && wait(1, "in_transit", { failures: 6 }) === 8 && wait(1, "in_transit", { failures: 12 }) === 24)
  }

  section("3. AfterShip Tracking API, stubbed")
  {
    setEnv({ AFTERSHIP_API_KEY: "as_key_platform", AFTERSHIP_WEBHOOK_SECRET: "whsec_aftership_test" })
    const acc = platformAccount()!
    check("Storelib's own account comes from the environment", acc?.provider === "aftership" && acc.scope === "platform" && platformTrackingState().configured && platformTrackingState().webhooks)
    aftershipTracking = asTracking("InTransit", [{ time: "2026-10-10T08:00:00Z", tag: "InTransit", message: "Departed facility" }])
    aftershipExists = false
    calls.length = 0
    const snap = await aftership.register(acc, { number: "1Z999AA10123456784", carrierCode: "ups", orderRef: CO })
    const post = calls[0]
    check("register: POST /trackings on the 2024-10 API with as-api-key, the number and the slug", post?.method === "POST" && post.url === "https://api.aftership.com/tracking/2024-10/trackings" && post.headers["as-api-key"] === "as_key_platform" && post.body.tracking_number === "1Z999AA10123456784" && post.body.slug === "ups", post)
    check("  read as in transit with its scan, place and the estimated delivery", snap.status === "in_transit" && snap.ref === "as_trk_1" && snap.checkpoints[0]?.location === "Louisville, KY, USA" && !!snap.estimatedDelivery, snap)
    calls.length = 0
    const again = await aftership.register(acc, { number: "1Z999AA10123456784", carrierCode: null })
    check("already there (4003): read back by number, never a second one", again.ref === "as_trk_1" && calls.length === 2 && /tracking_numbers=1Z999AA10123456784/.test(calls[1].url))
    const detected = await aftership.detect(acc, "1Z999AA10123456784")
    check("detect: AfterShip's carriers for a number", detected[0]?.code === "ups")
    check("Storelib's own guess still fills the carrier as the number is typed", guessCarrier("1Z999AA10123456784") === "UPS" && guessCarrier("9400100000000000000000") === "USPS")
    const v1 = parseAfterShip({ tracking_number: "X1", tag: "Delivered", checkpoints: [], expected_delivery: "2026-10-14" })
    check("an older API version's expected_delivery is read too", v1.status === "delivered" && v1.estimatedDelivery?.startsWith("2026-10-14") === true)
    const raw = JSON.stringify({ event: "tracking_update", msg: aftershipTracking, ts: 1 })
    const sig = createHmac("sha256", "whsec_aftership_test").update(raw, "utf8").digest("base64")
    const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null })
    check("webhook: a body signed with the secret is AfterShip's", aftership.verifyWebhook(acc, raw, h({ "aftership-hmac-sha256": sig })))
    check("  a changed body, a wrong secret or no signature is refused", !aftership.verifyWebhook(acc, raw + " ", h({ "aftership-hmac-sha256": sig })) && !aftership.verifyWebhook(acc, raw, h({ "aftership-hmac-sha256": createHmac("sha256", "other").update(raw).digest("base64") })) && !aftership.verifyWebhook(acc, raw, h({})))
    check("  the body only says which parcel", JSON.stringify(aftership.readWebhook(raw)) === JSON.stringify({ ref: "as_trk_1", number: "1Z999AA10123456784", carrierCode: "ups" }))
  }

  section("4. 17TRACK API v2.2, stubbed")
  {
    setEnv({ TRACKING_PROVIDER: "17track", SEVENTEENTRACK_API_KEY: "st_key_platform", AFTERSHIP_API_KEY: "as_key_platform" })
    const acc = platformAccount()!
    check("TRACKING_PROVIDER picks 17TRACK even with an AfterShip key there", acc.provider === "17track")
    seventeenRegistered = new Set()
    seventeenInfo = {
      latest_status: { status: "InTransit", sub_status: "InTransit_Other" },
      time_metrics: { estimated_delivery_date: { source: "Official", from: "2026-10-13T00:00:00Z", to: "2026-10-15T00:00:00Z" } },
      tracking: { providers: [{ provider: { name: "USPS" }, events: [{ time_iso: "2026-10-10T09:00:00-05:00", description: "Arrived at USPS Regional Facility", location: "CHICAGO IL", sub_status: "InTransit_Arrival" }] }] },
    }
    calls.length = 0
    const snap = await seventeentrack.register(acc, { number: "9400100000000000000000", carrierCode: null })
    check("register: POST /register with 17token and the number, then gettrackinfo", calls[0]?.url === "https://api.17track.net/track/v2.2/register" && calls[0].headers["17token"] === "st_key_platform" && calls[0].body[0].number === "9400100000000000000000" && calls[1]?.url.endsWith("/gettrackinfo"))
    check("  read: in transit, USPS, the carrier's code kept, estimated delivery the latest day given", snap.status === "in_transit" && snap.carrierName === "USPS" && snap.carrierCode === "21051" && snap.estimatedDelivery?.startsWith("2026-10-15") === true && snap.checkpoints[0]?.location === "CHICAGO IL", snap)
    calls.length = 0
    await seventeentrack.register(acc, { number: "9400100000000000000000", carrierCode: "21051" })
    check("already registered (-18019901) is fine: read as it is", calls.length === 2 && calls[0].body[0].carrier === 21051)
    let notRegistered = ""
    try {
      await seventeentrack.get(acc, { ref: null, number: "LX000000000CN", carrierCode: null })
    } catch (e: any) {
      notRegistered = e.code
    }
    check("a number 17TRACK is not following (-18019902) says so, to be registered again", notRegistered === "not_registered")
    const raw = JSON.stringify({ event: "TRACKING_UPDATED", data: { number: "9400100000000000000000", carrier: 21051, track_info: seventeenInfo } })
    const sign = createHash("sha256").update(`${raw}/st_key_platform`).digest("hex")
    const h = (v: Record<string, string>) => ({ get: (n: string) => v[n.toLowerCase()] ?? null })
    check("webhook: sign = SHA-256 of the body, a slash and the key", seventeentrack.verifyWebhook(acc, raw, h({ sign })) && !seventeentrack.verifyWebhook(acc, raw, h({ sign: createHash("sha256").update(`${raw}/other`).digest("hex") })) && !seventeentrack.verifyWebhook(acc, `${raw} `, h({ sign })))
  }

  section("5. The cron: registered, read, moved on, emailed once")
  {
    setEnv({ AFTERSHIP_API_KEY: "as_key_platform", AFTERSHIP_WEBHOOK_SECRET: "whsec_aftership_test" })
    aftershipExists = false
    aftershipTracking = asTracking("InTransit", [
      { time: ago(0.9), tag: "InfoReceived", message: "Shipper created a label" },
      { time: ago(0.5), tag: "InTransit", message: "Departed facility" },
    ])
    const db = fakeDb(orderTables(), uniqueJobs)
    calls.length = 0
    const first = await runTrackingSweep(db as never)
    const f = db.tables.fulfillments[0]
    check("a shipment with a number is registered with the carrier's slug from the seller's pick", first.checked === 1 && calls.some((c) => c.method === "POST" && c.body?.slug === "ups"), first)
    check("  moved to in transit by itself, scans kept, the next look set, no email for in transit", f.status === "in_transit" && db.tables.fulfillment_events.filter((e) => String(e.external_id).startsWith("trk:")).length === 2 && !!f.tracking_next_check_at && f.tracking_ref === "as_trk_1" && f.tracking_ref_number === f.tracking_number && !jobKeys(db).some((k) => /email:/.test(k)), { f, jobs: jobKeys(db) })
    check("  the move is on the timeline as the carrier's", db.tables.commerce_order_events.some((e) => e.kind === "fulfillment.in_transit" && e.actor === "webhook"))
    calls.length = 0
    const second = await runTrackingSweep(db as never)
    check("not due yet: nothing is asked", second.checked === 0 && calls.length === 0)
    f.tracking_next_check_at = ago(0.01)
    aftershipTracking = asTracking("OutForDelivery", [
      { time: ago(0.9), tag: "InfoReceived", message: "Shipper created a label" },
      { time: ago(0.5), tag: "InTransit", message: "Departed facility" },
      { time: ago(0.1), tag: "OutForDelivery", message: "Out for delivery" },
    ])
    calls.length = 0
    await runTrackingSweep(db as never)
    check("due: read by its id (GET /trackings/<id>), not registered again", calls.length === 1 && calls[0].method === "GET" && calls[0].url.endsWith("/trackings/as_trk_1"))
    check("  out for delivery: moved, the scan added once, the Out for delivery email queued", f.status === "out_for_delivery" && db.tables.fulfillment_events.filter((e) => String(e.external_id).startsWith("trk:")).length === 3 && jobKeys(db).includes(`email:out_for_delivery:${F}`))
    f.tracking_next_check_at = ago(0.01)
    await runTrackingSweep(db as never)
    check("  read again with nothing new: no second email, no second scan", jobKeys(db).filter((k) => k === `email:out_for_delivery:${F}`).length === 1 && db.tables.fulfillment_events.filter((e) => String(e.external_id).startsWith("trk:")).length === 3)

    const order = await loadOrder(db as never, { creatorId: SHOP, checkoutId: CO })
    const s = order!.shipments[0]
    check("the order reads the carrier's scans apart from its status changes, with the estimated delivery", s.checkpoints?.length === 3 && s.events.every((e) => !/Departed/.test(e.message ?? "")) && s.tracking?.mode === "auto" && s.tracking?.status === "out_for_delivery" && !!s.tracking?.estimatedDelivery, s)
  }

  section("6. The webhook: signed, read back, applied once")
  {
    setEnv({ AFTERSHIP_API_KEY: "as_key_platform", AFTERSHIP_WEBHOOK_SECRET: "whsec_aftership_test" })
    const deliveredAt = ago(0.05)
    aftershipExists = true
    aftershipTracking = asTracking("InTransit", [{ time: ago(0.5), tag: "InTransit", message: "Departed facility" }])
    const db = fakeDb(orderTables(), uniqueJobs)
    await runTrackingSweep(db as never)
    const f = db.tables.fulfillments[0]
    const token = trackingWebhookToken("aftership", "platform")
    check("the address token is Storelib's and names whose account", readTrackingWebhookToken("aftership", token) === "platform" && readTrackingWebhookToken("aftership", token.replace(/.$/, (c) => (c === "A" ? "B" : "A"))) === null && readTrackingWebhookToken("17track", token) === null && readTrackingWebhookToken("aftership", `${SHOP}.${token.split(".")[1]}`) === null)
    const lying = { ...aftershipTracking, tag: "Delivered" }
    const raw = JSON.stringify({ event: "tracking_update", msg: lying })
    const h = (sig: string | null) => ({ get: (n: string) => (n.toLowerCase() === "aftership-hmac-sha256" ? sig : null) })
    const bad = await handleTrackingWebhook(db as never, { provider: "aftership", owner: "platform", raw, headers: h("bm90IGl0") })
    check("a wrong signature: 401, nothing changes", bad.status === 401 && f.status === "in_transit")
    calls.length = 0
    const sig = createHmac("sha256", "whsec_aftership_test").update(raw, "utf8").digest("base64")
    const believed = await handleTrackingWebhook(db as never, { provider: "aftership", owner: "platform", raw, headers: h(sig) })
    check("a signed body that says delivered is not believed: the parcel is read back, and the API says in transit", believed.status === 200 && calls.length === 1 && calls[0].url.endsWith("/trackings/as_trk_1") && f.status === "in_transit")
    aftershipTracking = asTracking("Delivered", [
      { time: ago(0.5), tag: "InTransit", message: "Departed facility" },
      { time: deliveredAt, tag: "Delivered", message: "Delivered, front door" },
    ])
    const raw2 = JSON.stringify({ event: "tracking_update", msg: aftershipTracking })
    const sig2 = createHmac("sha256", "whsec_aftership_test").update(raw2, "utf8").digest("base64")
    const r1 = await handleTrackingWebhook(db as never, { provider: "aftership", owner: "platform", raw: raw2, headers: h(sig2) })
    check("delivered: moved, the Delivered email queued, following stopped", r1.status === 200 && f.status === "delivered" && jobKeys(db).includes(`email:delivered:${F}`) && !!f.tracking_stopped_at && f.tracking_next_check_at === null, { r1, f })
    check("  delivered_at is the carrier's time, on the shipment and the order", f.delivered_at === new Date(Date.parse(deliveredAt)).toISOString() && db.tables.commerce_checkouts[0].delivered_at === f.delivered_at, { f: f.delivered_at, co: db.tables.commerce_checkouts[0].delivered_at, deliveredAt })
    const before = { events: db.tables.fulfillment_events.length, jobs: db.tables.commerce_jobs.length, timeline: db.tables.commerce_order_events.length }
    const r2 = await handleTrackingWebhook(db as never, { provider: "aftership", owner: "platform", raw: raw2, headers: h(sig2) })
    check("the same delivery again: nothing changes (no scan, no email, no timeline entry)", r2.status === 200 && db.tables.fulfillment_events.length === before.events && db.tables.commerce_jobs.length === before.jobs && db.tables.commerce_order_events.length === before.timeline, { before, after: { events: db.tables.fulfillment_events.length, jobs: db.tables.commerce_jobs.length } })
    const order = await loadOrder(db as never, { creatorId: SHOP, checkoutId: CO })
    const w = returnWindow({ ...order!, pickup: false }, 30)
    check("the return window counts from the day the carrier delivered it", w.started && w.endsAt === new Date(Date.parse(deliveredAt) + 30 * DAY).toISOString(), w)
    const strangers = await handleTrackingWebhook(db as never, { provider: "aftership", owner: "platform", raw: JSON.stringify({ msg: { ...aftershipTracking, tracking_number: "NOT-OURS-1" } }), headers: h(createHmac("sha256", "whsec_aftership_test").update(JSON.stringify({ msg: { ...aftershipTracking, tracking_number: "NOT-OURS-1" } })).digest("base64")) })
    check("a number no shipment has: answered 200 and ignored", strangers.status === 200 && strangers.body.ignored === true)
    const route = read("app/api/tracking/webhooks/[provider]/[token]/route.ts")
    check("the route checks the token, rate limits, caps the body and hands the raw body and headers on", /readTrackingWebhookToken/.test(route) && /rateLimit/.test(route) && /256_000/.test(route) && /headers: request\.headers/.test(route) && /physicalApiGate/.test(route))
  }

  section("7. A delivery problem, a return to sender (17TRACK): the buyer and the seller told")
  {
    setEnv({ SEVENTEENTRACK_API_KEY: "st_key_platform" })
    seventeenRegistered = new Set()
    const N = "9400100000000000000001"
    const db = fakeDb(orderTables({ fulfillments: [{ id: F, checkout_id: CO, creator_id: SHOP, status: "in_transit", provider: "manual", carrier: "USPS", tracking_number: N, shipped_at: ago(3), created_at: ago(3), notify_buyer: true, tracking_auto: true }] }), uniqueJobs)
    seventeenInfo = { latest_status: { status: "DeliveryFailure", sub_status: "DeliveryFailure_NoBody" }, tracking: { providers: [{ provider: { name: "USPS" }, events: [{ time_iso: ago(0.2), description: "Notice left (no authorized recipient available)", location: "AUSTIN TX", sub_status: "DeliveryFailure_NoBody" }] }] } }
    await runTrackingSweep(db as never)
    const f = db.tables.fulfillments[0]
    const issue = db.tables.commerce_jobs.find((j) => String(j.idempotency_key).startsWith(`email:issue:${F}`))
    check("a failed attempt: a delivery problem, the buyer's Delivery issue email with the carrier's words", f.status === "failed" && !!issue && /The carrier tried to deliver it: Notice left/.test(issue.payload.problem ?? ""), { f, jobs: jobKeys(db) })
    check("  the seller is emailed about it", jobKeys(db).some((k) => k.startsWith("email:seller:delivery.exception:")))
    check("  the timeline says what happened", db.tables.commerce_order_events.some((e) => e.kind === "fulfillment.failed" && /Delivery problem: The carrier tried/.test(e.message)))
    f.tracking_next_check_at = ago(0.01)
    seventeenInfo = { latest_status: { status: "Exception", sub_status: "Exception_Returned" }, tracking: { providers: [{ provider: { name: "USPS" }, events: [{ time_iso: ago(0.1), description: "Returned to sender", location: "AUSTIN TX", sub_status: "Exception_Returned" }] }] } }
    const jobsBefore = db.tables.commerce_jobs.length
    await runTrackingSweep(db as never)
    check("then returned to sender: said on the order, the seller told once more, following stopped", f.tracking_status === "returned" && !!f.tracking_stopped_at && db.tables.commerce_order_events.some((e) => e.kind === "fulfillment.exception" && /Returned to sender/.test(e.message)) && db.tables.commerce_jobs.length === jobsBefore + 1, jobKeys(db))
    const order = await loadOrder(db as never, { creatorId: SHOP, checkoutId: CO })
    check("  the order reads Returned to sender for both pages", order!.shipments[0].tracking?.status === "returned")
  }

  section("8. Partners, manual statuses, pausing, failures and old parcels")
  {
    setEnv({ AFTERSHIP_API_KEY: "as_key_platform" })
    aftershipExists = false
    aftershipTracking = asTracking("InTransit", [{ time: ago(0.5), tag: "InTransit", message: "Departed facility" }], { tracking_number: "PF123456789" })
    const db = fakeDb(
      orderTables({
        fulfillments: [
          { id: F, checkout_id: CO, creator_id: SHOP, status: "shipped", provider: "printful", carrier: null, tracking_number: "PF123456789", tracking_url: null, shipped_at: ago(2), notify_buyer: true, tracking_auto: true },
          { id: F2, checkout_id: CO, creator_id: SHOP, status: "shipped", provider: "manual", carrier: "UPS", tracking_number: "1ZOLD000000000000", shipped_at: ago(61), notify_buyer: true, tracking_auto: true },
        ],
      }),
      uniqueJobs,
    )
    calls.length = 0
    const r = await runTrackingSweep(db as never)
    const pf = db.tables.fulfillments[0]
    check("a Printful shipment's number is followed like any other; a parcel shipped 61 days ago is not asked about", r.checked === 1 && pf.status === "in_transit" && calls.every((c) => !c.url.includes("1ZOLD")), { r, calls: calls.map((c) => c.url) })
    check("  with no carrier saved, the carrier the aggregator found is filled in with its link", pf.carrier === "UPS" && /ups\.com/.test(pf.tracking_url ?? ""), pf)
    const manual = await updateShipment(db as never, SHOP, F, { status: "delivered" })
    check("the seller can still set a status by hand", manual.ok && pf.status === "delivered")
    pf.tracking_next_check_at = null
    calls.length = 0
    const after = await runTrackingSweep(db as never)
    check("  a shipment the seller marked delivered is not asked about again", after.checked === 0 && calls.length === 0)
    pf.status = "in_transit"
    const paused = await setTrackingAuto(db as never, SHOP, F, false)
    const pausedRun = await runTrackingSweep(db as never)
    check("pause on one shipment: it is not read, and the order says paused", paused.ok && pausedRun.checked === 0 && (await loadOrder(db as never, { creatorId: SHOP, checkoutId: CO }))!.shipments[0].tracking?.mode === "paused")
    await setTrackingAuto(db as never, SHOP, F, true)
    const changed = await updateShipment(db as never, SHOP, F, { trackingNumber: "1Z999AA10123456784", carrier: "UPS" })
    check("a changed number is followed again from the start", changed.ok && pf.tracking_next_check_at === null && pf.tracking_stopped_at === null)
    setEnv({ AFTERSHIP_API_KEY: "as_key_wrong" })
    aftershipTracking = asTracking("InTransit", [])
    const broken = await runTrackingSweep(db as never)
    check("a key the aggregator refuses: the reason kept, looked at again later, nothing moved", broken.failed === 1 && /did not accept/.test(pf.tracking_error ?? "") && pf.tracking_failures === 1 && Date.parse(pf.tracking_next_check_at) > Date.now() && pf.status === "in_transit", pf)
    const noColumns = fakeDb(orderTables(), { failWith: { fulfillments: { code: "42703", message: 'column fulfillments.tracking_stopped_at does not exist' } } })
    setEnv({ AFTERSHIP_API_KEY: "as_key_platform" })
    const before160 = await runTrackingSweep(noColumns as never)
    check("before part 160: the cron says tracking is not available yet, and asks nobody", before160.available === false && before160.checked === 0)
  }

  section("9. No key anywhere: nothing is asked, the pages say so")
  {
    setEnv({})
    const db = fakeDb(orderTables(), uniqueJobs)
    calls.length = 0
    const r = await runTrackingSweep(db as never)
    check("the cron does nothing and calls nobody", r.configured === false && r.checked === 0 && calls.length === 0)
    const order = await loadOrder(db as never, { creatorId: SHOP, checkoutId: CO })
    check("the order says automatic updates are off, the carrier's link stays", order!.shipments[0].tracking?.mode === "off" && /ups\.com/.test(order!.shipments[0].trackingUrl ?? ""))
    const settings = await loadTrackingSettings(db as never, SHOP)
    check("Settings: Storelib's tracking reads as not set up", settings.platform.on === false && settings.own === null)
  }

  section("10. A store's own key: checked, sealed, never sent back, used for its parcels only")
  {
    setEnv({})
    const db = fakeDb({ ...orderTables(), commerce_tracking_accounts: [] }, uniqueJobs)
    const refused = await saveOwnTrackingAccount(db as never, SHOP, { provider: "aftership", apiKey: "as_key_bad_1234" })
    check("a key AfterShip refuses is not saved", refused.ok === false && db.tables.commerce_tracking_accounts.length === 0, refused)
    const saved = await saveOwnTrackingAccount(db as never, SHOP, { provider: "aftership", apiKey: "as_key_own", webhookSecret: "own_webhook_secret" })
    const row = db.tables.commerce_tracking_accounts[0]
    check("a good key is saved sealed (not the key itself)", saved.ok && !!row && row.secret_ciphertext.startsWith("v1.") && !JSON.stringify(row).includes("as_key_own"), row)
    const view = await loadTrackingSettings(db as never, SHOP)
    check("  Settings shows its last four and its own webhook address, never the key", view.own?.keyHint === "_own" && !JSON.stringify(view).includes("as_key_own") && /\/api\/tracking\/webhooks\/aftership\/7a0c/.test(view.own?.webhookUrl ?? ""), view.own)
    aftershipExists = false
    aftershipTracking = asTracking("InTransit", [{ time: ago(0.5), tag: "InTransit", message: "Departed facility" }])
    calls.length = 0
    const r = await runTrackingSweep(db as never)
    check("with no platform key, the store's own account follows its parcels", r.checked === 1 && calls[0]?.headers["as-api-key"] === "as_key_own" && db.tables.fulfillments[0].tracking_account === "own")
    const ownToken = trackingWebhookToken("aftership", SHOP)
    check("  its webhook address names the store", readTrackingWebhookToken("aftership", ownToken) === SHOP)
    const raw = JSON.stringify({ msg: aftershipTracking })
    const other = await handleTrackingWebhook(db as never, { provider: "aftership", owner: OTHER, raw, headers: { get: () => createHmac("sha256", "own_webhook_secret").update(raw).digest("base64") } })
    check("  another store's address is not set up: refused", other.status === 410)
    const removed = await saveOwnTrackingAccount(db as never, SHOP, { remove: true })
    check("removed: back to Storelib's own", removed.ok && db.tables.commerce_tracking_accounts.length === 0)
  }

  section("11. Wired where it shows")
  {
    const cron = read("app/api/cron/physical/route.ts")
    check("/api/cron/physical runs the tracking sweep inside its time", /runTrackingSweep\(db/.test(cron) && /budgetMs/.test(cron))
    const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
    check("the buyer's page shows the scans with place and time, and the estimated delivery", /data-tracking-checkpoints/.test(view) && /Estimated delivery/.test(view) && /checkpoints/.test(read("app/checkout/physical/order/[token]/page.tsx")))
    const panel = read("components/physical/order-panel.tsx")
    check("the seller's order page shows the scans, Updated automatically, and Pause automatic updates", /data-tracking-checkpoints/.test(panel) && /Updated automatically/.test(panel) && /Pause automatic updates/.test(panel) && /Mark as delivered/.test(panel))
    check("  and says when tracking is not set up yet", /Automatic updates turn on when Storelib's tracking is set up/.test(panel))
    const status = read("lib/admin/commerce-status.ts")
    check("/admin/physical-commerce reads the tracking status from real data", /platformTrackingState/.test(status) && /tracking_checked_at/.test(status) && /Automatic updates turn on when Storelib's tracking is set up/.test(read("app/admin/physical-commerce/commerce-docs-admin.tsx")))
    check("part 160 is in run-now with its check column", /p160_courier_tracking/.test(read("supabase/sql/run-now/99_check_after.sql")) && /commerce_tracking_accounts/.test(read("supabase/sql/run-now/160_courier_tracking.sql")))
    check("no network host other than the two stubs was called", strayHosts.length === 0, strayHosts)
  }

  globalThis.fetch = realFetch
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
