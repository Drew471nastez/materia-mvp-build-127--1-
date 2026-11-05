/**
 * Round 24, K24: Klaviyo and Omnisend receive a store's consented
 * subscribers, its customers and its order events, and send unsubscribes
 * back (lib/integrations/marketing). Every provider call goes to a stub of
 * its public API, checked against the request shape its documentation gives;
 * any other address fails the suite. Consent is the point: only a yes goes
 * on a list, an unsubscribe on either side wins, a buyer who did not ask is a
 * customer and never a subscriber.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { openSecret } from "@/lib/physical/secrets"
import { LIMITS, Pacer, ProviderError, marketingCall, marketingMessage, pacer } from "@/lib/integrations/marketing/http"
import { contactPush, pullApplies, pulledStatus } from "@/lib/integrations/marketing/consent"
import { KLAVIYO_REVISION, klaviyoPullUrl, looksLikeKlaviyoKey } from "@/lib/integrations/marketing/klaviyo"
import { OMNISEND_VERSION, omnisendPullUrl } from "@/lib/integrations/marketing/omnisend"
import { KLAVIYO_METRIC, fromDigitalOrder, fromPhysicalOrder, klaviyoEventsFor, major, omnisendEventId, omnisendEventsFor } from "@/lib/integrations/marketing/orders"
import { ORDER_EVENT_KINDS, emailHash, loadMarketing, queueMarketingEvent, runMarketingJob, saveMarketing, scheduleMarketingSyncs, type MarketingDeps } from "@/lib/integrations/marketing/sync-server"
import { addOrderEvent } from "@/lib/physical/events-server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-marketing-0123456789"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the providers, stubbed ────────────────────────────────────────────── */

type Call = { method: string; url: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: any }
let calls: Call[] = []
let realHost: string[] = []
type Route = (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> } | null
let routes: Route[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const u = new URL(url)
  const c: Call = { method: init.method ?? "GET", url, path: u.pathname, query: u.searchParams, headers, body: init.body ? JSON.parse(init.body) : null }
  if (!/^https:\/\/(a\.klaviyo\.com|api\.omnisend\.com)\//.test(url)) {
    realHost.push(url)
    throw new Error(`a real address was called: ${url}`)
  }
  calls.push(c)
  for (const r of routes) {
    const out = r(c)
    if (out) return new Response(out.body === undefined ? "" : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json", ...(out.headers ?? {}) } })
  }
  return new Response(JSON.stringify({ errors: [{ detail: "not stubbed" }] }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}

/* No waiting in a test: the pacer's clock moves by what it would have slept. */
let fakeClock = 0
const slept: number[] = []
pacer.now = () => fakeClock
pacer.sleep = async (ms) => {
  slept.push(ms)
  fakeClock += ms
}

const KEY = "pk_good0123456789abcdef0123456789ab"
const NOSCOPE = "pk_noscope0123456789abcdef01234567"
const OKEY = "omni-good-key-0123456789"
const LIST = "Y6nRLr"

const suppressions: { email: string; reason: string; timestamp: string; list_id?: string }[] = []
const klaviyo: Route = (c) => {
  if (!c.url.startsWith("https://a.klaviyo.com/")) return null
  const auth = c.headers.authorization
  if (c.path === "/api/accounts") {
    if (auth === `Klaviyo-API-Key ${KEY}`) return { status: 200, body: { data: [{ type: "account", id: "PUB123", attributes: { contact_information: { organization_name: "Ana's Shop" } } }] } }
    if (auth === `Klaviyo-API-Key ${NOSCOPE}`) return { status: 403, body: { errors: [{ status: 403, code: "permission_denied", title: "You do not have permission to perform this action.", detail: "This API key is missing required scopes: accounts:read" }] } }
    return { status: 401, body: { errors: [{ detail: "Incorrect authentication credentials." }] } }
  }
  if (auth !== `Klaviyo-API-Key ${KEY}`) return { status: 401, body: { errors: [{ detail: "Incorrect authentication credentials." }] } }
  if (c.path === "/api/lists") {
    if (c.query.get("page[cursor]") === "p2") return { status: 200, body: { data: [{ type: "list", id: "Zz9", attributes: { name: "VIP" } }], links: { next: null } } }
    return { status: 200, body: { data: [{ type: "list", id: LIST, attributes: { name: "Newsletter" } }], links: { next: "https://a.klaviyo.com/api/lists?fields%5Blist%5D=name&page%5Bcursor%5D=p2" } } }
  }
  if (c.method === "POST" && ["/api/profile-subscription-bulk-create-jobs", "/api/profile-subscription-bulk-delete-jobs", "/api/profile-bulk-import-jobs", "/api/events"].includes(c.path)) return { status: 202 }
  if (c.path === "/api/profiles") {
    const filter = c.query.get("filter") ?? ""
    const list = /list_id,"([^"]+)"/.exec(filter)?.[1] ?? null
    const since = /timestamp,([^)]+)\)/.exec(filter)?.[1] ?? "2000-01-01T00:00:00Z"
    const rows = suppressions.filter((s) => (list ? s.list_id === list : !s.list_id) && Date.parse(s.timestamp) >= Date.parse(since))
    return {
      status: 200,
      body: {
        data: rows.map((s, i) => ({
          type: "profile",
          id: `P${i}`,
          attributes: {
            email: s.email,
            subscriptions: { email: { marketing: list ? { consent: "SUBSCRIBED", list_suppressions: [{ list_id: list, reason: s.reason, timestamp: s.timestamp }] } : { consent: "UNSUBSCRIBED", suppression: [{ reason: s.reason, timestamp: s.timestamp }] } } },
          },
        })),
        links: { next: null },
      },
    }
  }
  return null
}

const omniContacts: { email: string; status: string; updatedAt: string; statusChangedAt: string }[] = []
const omnisend: Route = (c) => {
  if (!c.url.startsWith("https://api.omnisend.com/")) return null
  if (c.headers.authorization !== `Omnisend-API-Key ${OKEY}`) return { status: 401, body: { type: "https://problems.omnisend.com/unauthorized", title: "Unauthorized", status: 401, detail: "Invalid API key" } }
  if (c.path === "/api/brands/current") return { status: 200, body: { brandID: "5f1b", name: "Ana Omni", website: "https://ana.example", currency: "USD" } }
  if (c.method === "POST" && ["/api/contacts", "/api/batches", "/api/events"].includes(c.path)) return { status: c.path === "/api/events" ? 202 : 200, body: c.path === "/api/batches" ? { batchID: "b1", totalCount: c.body.items.length } : {} }
  if (c.method === "GET" && c.path === "/api/contacts") {
    const st = c.query.get("status")
    const from = c.query.get("updatedAtFrom")
    const rows = omniContacts.filter((x) => (st ? x.status === st : true) && (from ? Date.parse(x.updatedAt) >= Date.parse(from) : true))
    return { status: 200, body: { contacts: rows.map((x) => ({ email: x.email, status: x.status, updatedAt: x.updatedAt, statuses: [{ channel: "email", status: x.status, statusChangedAt: x.statusChangedAt }] })), paging: { hasMore: false, cursors: { after: null } } } }
  }
  return null
}

/* ── a store ───────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const NOW = Date.parse("2026-10-12T10:00:00Z")
let n = 0
const uid = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`

function freshDb() {
  const db = new FakeSupabase()
  db.clock = NOW
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: uid(), config: {}, status: "disconnected", last_error: null, last_sync_at: null, account_label: null }) })
  db.table("marketing_sync_items", {
    unique: [["creator_id", "provider", "item_key"]],
    defaults: () => ({ id: ++n }),
    checks: [(r) => (["subscribed", "unsubscribed", "customer", "sent", "line", "pulled"].includes(r.state) ? null : "marketing_sync_items_state_check"), (r) => (["klaviyo", "omnisend"].includes(r.provider) ? null : "provider")],
  })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("commerce_order_events", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n }) })
  db.table("subscribers", { unique: [["creator_id", "email"]], defaults: () => ({ id: uid(), is_active: true }) })
  db.table("commerce_checkouts", {})
  db.table("orders", {})
  db.table("products", {})
  return db
}

const sub = (email: string, status: string | null, updatedAt: string, over: Record<string, unknown> = {}) => ({ id: uid(), creator_id: CREATOR, email, name: "Ana Lima", status, is_active: status === "unsubscribed" ? false : true, subscribed_at: "2026-09-01T00:00:00.000Z", consent_timestamp: status === "subscribed" ? "2026-09-01T00:00:00.000Z" : null, updated_at: updatedAt, ...over })

function physicalOrder(over: Record<string, unknown> = {}): any {
  return {
    id: CHECKOUT,
    creatorId: CREATOR,
    status: "paid",
    fulfillmentStatus: "unfulfilled",
    currency: "usd",
    buyerEmail: "Buyer@Example.com",
    buyerName: "Bea Buyer",
    buyerPhone: "+1 555 0100",
    itemsSubtotalCents: 5000,
    discountCents: 500,
    shippingCents: 700,
    shippingDiscountCents: 0,
    taxCents: 300,
    totalCents: 5500,
    refundedCents: 0,
    couponCode: "SUMMER10",
    address: { name: "Bea Buyer", line1: "1 Main St", line2: null, city: "Austin", region: "TX", postalCode: "73301", country: "US", phone: "+15550100" },
    delivery: { name: "Standard" },
    deliveryMethod: "ship",
    receiptToken: "rt_1",
    paidAt: "2026-10-12T09:00:00.000Z",
    createdAt: "2026-10-12T08:55:00.000Z",
    cancelledAt: null,
    lines: [
      { orderId: "44444444-4444-4444-8444-444444444441", productId: "p-tee", variantId: "v-m", title: "Tee", variantName: "M", sku: "TEE-M", imageUrl: "https://cdn.example/tee.png", type: "physical", quantity: 2, unitCents: 2000, discountCents: 0 },
      { orderId: "44444444-4444-4444-8444-444444444442", productId: "p-ebook", variantId: null, title: "Guide", variantName: null, sku: null, imageUrl: null, type: "digital", quantity: 1, unitCents: 1000, discountCents: 0 },
    ],
    shipments: [],
    ...over,
  }
}

function deps(order: any): MarketingDeps {
  return { loadOrder: (async () => order) as any, orderUrl: async () => "https://shop.example/o/rt_1", now: () => NOW }
}

async function connected(db: FakeSupabase, provider: "klaviyo" | "omnisend", backfill: boolean) {
  reset([klaviyo, omnisend])
  const r = await saveMarketing(db, CREATOR, provider, provider === "klaviyo" ? { step: "connect", apiKey: KEY, listId: LIST, backfill } : { step: "connect", apiKey: OKEY, backfill }, NOW)
  if (!r.ok) throw new Error(`connect failed: ${(r as any).error}`)
}
const job = (db: FakeSupabase, provider: string, op: string, extra: Record<string, unknown> = {}, d: MarketingDeps = deps(physicalOrder())) => runMarketingJob(db, { op, provider, creatorId: CREATOR, ...extra }, d)
const posted = (path: string) => calls.filter((c) => c.method === "POST" && c.path === path)

async function main() {
  console.log("\nConnecting: the key is checked with the provider before it is kept, sealed, last four shown\n")
  {
    const db = freshDb()
    reset([klaviyo, omnisend])
    const checked = await saveMarketing(db, CREATOR, "klaviyo", { step: "check", apiKey: KEY }, NOW)
    check("Check key: Klaviyo's account and every list come back (both pages)", checked.ok && (checked as any).account === "Ana's Shop" && (checked as any).lists.map((l: any) => l.name).join() === "Newsletter,VIP", checked)
    check("  nothing is saved by a check", db.rows("commerce_integrations").length === 0)
    const acc = calls.find((c) => c.path === "/api/accounts")!
    check("  GET https://a.klaviyo.com/api/accounts with Authorization: Klaviyo-API-Key <key> and the revision header", acc.method === "GET" && acc.headers.authorization === `Klaviyo-API-Key ${KEY}` && acc.headers.revision === KLAVIYO_REVISION && KLAVIYO_REVISION === "2026-07-15", acc.headers)
    check("  GET /api/lists?fields[list]=name, then its links.next", calls.filter((c) => c.path === "/api/lists").length === 2 && calls.find((c) => c.path === "/api/lists")!.query.get("fields[list]") === "name")

    reset([klaviyo, omnisend])
    const bad = await saveMarketing(db, CREATOR, "klaviyo", { step: "connect", apiKey: "pk_wrong0123456789abcdef0123456789", listId: LIST }, NOW)
    check("a key Klaviyo refuses is not saved, and says so", !bad.ok && /did not accept that key/.test((bad as any).error) && db.rows("commerce_integrations").length === 0, bad)
    const scope = await saveMarketing(db, CREATOR, "klaviyo", { step: "connect", apiKey: NOSCOPE, listId: LIST }, NOW)
    check("a key missing a scope says which scopes to give it", !scope.ok && /missing a permission/.test((scope as any).error) && /events:write/.test((scope as any).error) && /subscriptions:write/.test((scope as any).error), scope)
    const pub = await saveMarketing(db, CREATOR, "klaviyo", { step: "connect", apiKey: "AbC123xyz9", listId: LIST }, NOW)
    check("the six character public key is refused before any call, with what to use instead", !pub.ok && /starts with pk_/.test((pub as any).error) && looksLikeKlaviyoKey(KEY) && !looksLikeKlaviyoKey("AbC123"))
    const noList = await saveMarketing(db, CREATOR, "klaviyo", { step: "connect", apiKey: KEY, listId: "nope" }, NOW)
    check("Klaviyo needs a list chosen from the account's own", !noList.ok && /Choose the list/.test((noList as any).error))

    reset([klaviyo, omnisend])
    const ok = await saveMarketing(db, CREATOR, "klaviyo", { step: "connect", apiKey: KEY, listId: "Zz9", backfill: false }, NOW)
    const row = db.rows("commerce_integrations")[0]
    check("connected: provider klaviyo, category marketing, the account and the list kept", ok.ok && row.provider === "klaviyo" && row.category === "marketing" && row.status === "connected" && row.account_label === "Ana's Shop" && row.config.list_id === "Zz9" && row.config.list_name === "VIP", row)
    check("  the key is sealed (AES-GCM), never stored as typed, and opens back to it on the server", row.secret_ciphertext.startsWith("v1.") && !row.secret_ciphertext.includes(KEY) && openSecret(row.secret_ciphertext) === KEY)
    check("  the first sync is queued at once", db.rows("commerce_jobs").some((j) => j.kind === "marketing_sync" && j.payload.op === "sync" && j.payload.provider === "klaviyo"))
    const views = await loadMarketing(db, CREATOR)
    const k = views.find((v) => v.provider === "klaviyo")!
    check("the card's view: connected, last four of the key only, never the key", k.connected && k.keyHint === KEY.slice(-4) && !JSON.stringify(views).includes(KEY) && !JSON.stringify(views).includes(row.secret_ciphertext), k)
    check("  the scopes the key needs are named on it", k.scopes.join() === "accounts:read,lists:read,lists:write,profiles:read,profiles:write,subscriptions:write,events:write")
    reset([klaviyo, omnisend])
    const moved = await saveMarketing(db, CREATOR, "klaviyo", { listId: LIST }, NOW)
    check("changing the list later re-reads the lists with the saved key", moved.ok && db.rows("commerce_integrations")[0].config.list_id === LIST && calls.some((c) => c.path === "/api/lists"))

    reset([klaviyo, omnisend])
    const om = await saveMarketing(db, CREATOR, "omnisend", { step: "connect", apiKey: OKEY, backfill: false }, NOW)
    const brand = calls.find((c) => c.path === "/api/brands/current")!
    check("Omnisend: GET https://api.omnisend.com/api/brands/current with Authorization: Omnisend-API-Key <key> and Omnisend-Version", om.ok && brand.headers.authorization === `Omnisend-API-Key ${OKEY}` && brand.headers["omnisend-version"] === OMNISEND_VERSION && OMNISEND_VERSION === "2026-03-15", brand?.headers)
    check("  its brand is the account shown", db.rows("commerce_integrations").find((r) => r.provider === "omnisend")!.account_label === "Ana Omni")
    reset([klaviyo, omnisend])
    const omBad = await saveMarketing(db, CREATOR, "omnisend", { step: "connect", apiKey: "omni-wrong-key-000000" }, NOW)
    check("  a key Omnisend refuses is not saved", !omBad.ok && /did not accept/.test((omBad as any).error))
  }

  console.log("\nConsent: only a yes goes on a list\n")
  {
    check("subscribed (ticked box, sign up form, Emails contact with consent) is subscribed", contactPush({ id: "1", email: "a@x.co", status: "subscribed", is_active: true }) === "subscribed")
    check("a buyer who did not ask is a customer: a profile, never a list", contactPush({ id: "1", email: "a@x.co", status: "customer" }) === "customer")
    check("unsubscribed, bounced, complained, cleaned, or switched off: unsubscribed there too", ["unsubscribed", "bounced", "complained", "cleaned"].every((s) => contactPush({ id: "1", email: "a@x.co", status: s }) === "unsubscribed") && contactPush({ id: "1", email: "a@x.co", status: "subscribed", is_active: false }) === "unsubscribed")
    check("a contact form message, no status, or a bad address: not sent at all", contactPush({ id: "1", email: "a@x.co", status: "wrote" }) === "skip" && contactPush({ id: "1", email: "a@x.co", status: null }) === "skip" && contactPush({ id: "1", email: "nope", status: "subscribed" }) === "skip")
    check("a provider's reasons: spam complaint, bounce, unsubscribe", pulledStatus("SPAM_COMPLAINT") === "complained" && pulledStatus("HARD_BOUNCE") === "bounced" && pulledStatus("INVALID_EMAIL") === "bounced" && pulledStatus("UNSUBSCRIBE") === "unsubscribed" && pulledStatus("USER_SUPPRESSED") === "unsubscribed")
    check("an unsubscribe there wins over an older yes, never over a newer one", pullApplies({ id: "1", email: "a@x.co", status: "subscribed", subscribed_at: "2026-01-01T00:00:00Z" }, "2026-02-01T00:00:00Z") && !pullApplies({ id: "1", email: "a@x.co", status: "subscribed", consent_timestamp: "2026-03-01T00:00:00Z" }, "2026-02-01T00:00:00Z") && !pullApplies({ id: "1", email: "a@x.co", status: "customer" }, null))
  }

  console.log("\nKlaviyo sync: subscribers to the list, customers as profiles, unsubscribes both ways\n")
  {
    const db = freshDb()
    suppressions.length = 0
    /* Someone who unsubscribed in Klaviyo in August, while still subscribed on Storelib since September 1st... */
    suppressions.push({ email: "left@x.co", reason: "UNSUBSCRIBE", timestamp: "2026-09-15T00:00:00Z" })
    /* ...and one whose Klaviyo unsubscribe is older than their new yes on Storelib. */
    suppressions.push({ email: "back@x.co", reason: "UNSUBSCRIBE", timestamp: "2026-08-01T00:00:00Z" })
    db.tables.subscribers.push(
      sub("ann@x.co", "subscribed", "2026-09-02T00:00:00.000Z"),
      sub("cus@x.co", "customer", "2026-09-03T00:00:00.000Z"),
      sub("gone@x.co", "unsubscribed", "2026-09-04T00:00:00.000Z", { unsubscribed_at: "2026-09-04T00:00:00.000Z" }),
      sub("wrote@x.co", "wrote", "2026-09-05T00:00:00.000Z"),
      sub("left@x.co", "subscribed", "2026-09-06T00:00:00.000Z"),
      sub("back@x.co", "subscribed", "2026-09-07T00:00:00.000Z", { subscribed_at: "2026-09-07T00:00:00.000Z", consent_timestamp: "2026-09-07T00:00:00.000Z" }),
      { ...sub("other@x.co", "subscribed", "2026-09-08T00:00:00.000Z"), creator_id: "99999999-9999-4999-8999-999999999999" },
    )
    await connected(db, "klaviyo", true)
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "sync")
    const pulls = calls.filter((c) => c.path === "/api/profiles")
    check("unsubscribes are read first: GET /api/profiles with the subscriptions field, by suppression time, and the list's own", pulls.length === 2 && pulls[0].query.get("additional-fields[profile]") === "subscriptions" && /^greater-or-equal\(subscriptions\.email\.marketing\.suppression\.timestamp,/.test(pulls[0].query.get("filter")!) && /list_suppressions\.list_id,"Y6nRLr"/.test(pulls[1].query.get("filter")!), pulls.map((p) => p.query.get("filter")))
    const left = db.rows("subscribers").find((s) => s.email === "left@x.co")!
    const back = db.rows("subscribers").find((s) => s.email === "back@x.co")!
    check("someone who unsubscribed in Klaviyo is unsubscribed on Storelib, so Storelib stops emailing them", left.status === "unsubscribed" && left.is_active === false && !!left.unsubscribed_at, left)
    check("  someone who said yes again on Storelib after leaving stays subscribed", back.status === "subscribed")
    const subJobs = posted("/api/profile-subscription-bulk-create-jobs")
    const subscribed = subJobs.flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email))
    check("only the yes go on the list: ann and back, never the customer, the contact form, the unsubscribed or another store's", subscribed.sort().join() === "ann@x.co,back@x.co", subscribed)
    const body = subJobs[0].body
    check(
      "  POST /api/profile-subscription-bulk-create-jobs as Klaviyo documents it: type, custom_source, profiles.data[].attributes.subscriptions.email.marketing.consent SUBSCRIBED, relationships.list",
      body.data.type === "profile-subscription-bulk-create-job" && body.data.attributes.custom_source === "Storelib" && body.data.attributes.profiles.data[0].type === "profile" && body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consent === "SUBSCRIBED" && body.data.relationships.list.data.type === "list" && body.data.relationships.list.data.id === LIST,
      body,
    )
    check("  existing subscribers go as a historical import with the time they said yes (no double opt-in, no welcome flow)", body.data.attributes.historical_import === true && body.data.attributes.profiles.data.every((p: any) => typeof p.attributes.subscriptions.email.marketing.consented_at === "string" && Date.parse(p.attributes.subscriptions.email.marketing.consented_at) < NOW))
    check("  headers: Klaviyo-API-Key, revision, JSON:API content type", subJobs[0].headers.authorization === `Klaviyo-API-Key ${KEY}` && subJobs[0].headers.revision === "2026-07-15" && subJobs[0].headers["content-type"] === "application/vnd.api+json")
    const unsub = posted("/api/profile-subscription-bulk-delete-jobs")
    const unsubEmails = unsub.flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email))
    check("the unsubscribed on Storelib are unsubscribed in Klaviyo: POST /api/profile-subscription-bulk-delete-jobs, consent UNSUBSCRIBED", unsubEmails.sort().join() === "gone@x.co" && unsub[0].body.data.type === "profile-subscription-bulk-delete-job" && unsub[0].body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consent === "UNSUBSCRIBED", unsubEmails)
    check("  (the one who left in Klaviyo is not sent back: it is recorded as already unsubscribed there)", !unsubEmails.includes("left@x.co"))
    const imp = posted("/api/profile-bulk-import-jobs")
    const impEmails = imp.flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email))
    check("customers are profiles with no consent: POST /api/profile-bulk-import-jobs, no subscriptions in it", impEmails.join() === "cus@x.co" && imp[0].body.data.type === "profile-bulk-import-job" && !JSON.stringify(imp[0].body).includes("subscriptions") && imp[0].body.data.attributes.profiles.data[0].attributes.first_name === "Ana")
    check("no address is ever logged in the record: hashes only", db.rows("marketing_sync_items").every((r) => !String(r.item_key).includes("@")) && db.rows("marketing_sync_items").some((r) => r.item_key === `c:${emailHash("ann@x.co")}`))

    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "sync")
    check("a second sync sends no subscriber again (idempotent)", posted("/api/profile-subscription-bulk-create-jobs").length === 0 && posted("/api/profile-subscription-bulk-delete-jobs").length === 0 && posted("/api/profile-bulk-import-jobs").length === 0)

    /* Ann unsubscribes on Storelib (the Emails page, an email's unsubscribe link). */
    const ann = db.rows("subscribers").find((s) => s.email === "ann@x.co")!
    Object.assign(ann, { status: "unsubscribed", is_active: false, updated_at: "2026-10-12T09:59:00.000Z" })
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "sync")
    check("an unsubscribe on Storelib reaches Klaviyo on the next sync", posted("/api/profile-subscription-bulk-delete-jobs").flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email)).join() === "ann@x.co")
    const view = (await loadMarketing(db, CREATOR)).find((v) => v.provider === "klaviyo")!
    check("the card counts what flowed: subscribed, unsubscribed, customers, pulled back", view.counts.subscribed === 1 && view.counts.unsubscribed === 3 && view.counts.customers === 1 && view.counts.pulled === 1 && !!view.lastSyncAt && view.lastError === null, view.counts)
  }

  console.log("\nWithout a backfill, only what happens from now is sent\n")
  {
    const db = freshDb()
    suppressions.length = 0
    db.tables.subscribers.push(sub("old@x.co", "subscribed", "2026-09-02T00:00:00.000Z"))
    await connected(db, "klaviyo", false)
    db.tables.subscribers.push(sub("new@x.co", "subscribed", "2026-10-12T10:00:05.000Z", { subscribed_at: "2026-10-12T10:00:05.000Z", consent_timestamp: "2026-10-12T10:00:05.000Z" }))
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "sync")
    const subJobs = posted("/api/profile-subscription-bulk-create-jobs")
    const emails = subJobs.flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email))
    check("the new subscriber goes, the existing one does not", emails.join() === "new@x.co", emails)
    check("  a new subscriber is a live subscribe, not a historical import", subJobs[0].body.data.attributes.historical_import === undefined && subJobs[0].body.data.attributes.profiles.data[0].attributes.subscriptions.email.marketing.consented_at === undefined)
  }

  console.log("\nOrder events to Klaviyo, as its ecommerce guide spells them\n")
  {
    const db = freshDb()
    db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR, receipt_token: "rt_1", cancel_reason: null, email_opt_in: false, buyer_email: "buyer@example.com", status: "paid" })
    await connected(db, "klaviyo", false)
    const order = physicalOrder()
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "placed" }, deps(order))
    const ev = posted("/api/events")
    const placed = ev[0]?.body?.data?.attributes
    check("a paid order: one Placed Order and an Ordered Product per line (3 POST /api/events)", ev.length === 3 && placed.metric.data.attributes.name === "Placed Order" && ev.slice(1).every((c) => c.body.data.attributes.metric.data.attributes.name === "Ordered Product"), ev.map((c) => c.body.data.attributes.metric.data.attributes.name))
    check(
      "  Placed Order: data.type event, value 55, value_currency USD, unique_id the order, time the payment, profile by email",
      ev[0].body.data.type === "event" && placed.value === 55 && placed.value_currency === "USD" && placed.unique_id === CHECKOUT && placed.time === "2026-10-12T09:00:00.000Z" && placed.profile.data.type === "profile" && placed.profile.data.attributes.email === "buyer@example.com" && placed.profile.data.attributes.first_name === "Bea" && placed.metric.data.type === "metric",
      placed,
    )
    const p = placed.properties
    check(
      "  its properties: OrderId, ItemNames, DiscountCode, DiscountValue, Items[] with ProductID, SKU, ProductName, Quantity, ItemPrice, RowTotal, ProductURL, ImageURL",
      p.OrderId === CHECKOUT && p.ItemNames.join() === "Tee,Guide" && p.DiscountCode === "SUMMER10" && p.DiscountValue === 5 && p.Items[0].ProductID === "p-tee" && p.Items[0].SKU === "TEE-M" && p.Items[0].ProductName === "Tee (M)" && p.Items[0].Quantity === 2 && p.Items[0].ItemPrice === 20 && p.Items[0].RowTotal === 40 && p.Items[0].ImageURL === "https://cdn.example/tee.png" && "ProductURL" in p.Items[0] && p.ShippingAddress.Address1 === "1 Main St" && p.ShippingAddress.CountryCode === "US",
      p,
    )
    const line = ev[1].body.data.attributes
    check("  Ordered Product: its own unique_id per line, value the line's total", line.unique_id === `${CHECKOUT}:44444444-4444-4444-8444-444444444441` && line.value === 40 && line.properties.OrderId === CHECKOUT && line.properties.SKU === "TEE-M")
    check("  a live order is not a backfill (it may start a flow)", placed.backfill === undefined)
    check("  phone sent only as E.164", placed.profile.data.attributes.phone_number === undefined || /^\+\d+$/.test(placed.profile.data.attributes.phone_number))

    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "placed" }, deps(order))
    check("the same event again sends nothing (written down as it went)", posted("/api/events").length === 0)

    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "fulfilled" }, deps(physicalOrder({ fulfillmentStatus: "partially_fulfilled" })))
    check("a first parcel of two is not Fulfilled Order", posted("/api/events").length === 0)
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "fulfilled" }, deps(physicalOrder({ fulfillmentStatus: "fulfilled", shipments: [{ status: "shipped", carrier: "USPS", trackingNumber: "9400", trackingUrl: "https://tools.usps.com/x" }] })))
    const f = posted("/api/events")[0]?.body?.data?.attributes
    check("  all of it shipped: Fulfilled Order, with the tracking", f?.metric.data.attributes.name === "Fulfilled Order" && f.unique_id === CHECKOUT && f.properties.Tracking.TrackingNumber === "9400", f)

    reset([klaviyo, omnisend])
    db.tables.commerce_checkouts[0].cancel_reason = "Out of stock"
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "cancelled" }, deps(physicalOrder({ status: "refunded", cancelledAt: "2026-10-12T09:30:00.000Z", refundedCents: 5500 })))
    const cx = posted("/api/events")[0]?.body?.data?.attributes
    check(`cancelled: ${KLAVIYO_METRIC.cancelled} (Klaviyo's spelling) with Reason, unique_id the order so CLV takes it off`, cx?.metric.data.attributes.name === "Canceled Order" && cx.properties.Reason === "Out of stock" && cx.unique_id === CHECKOUT, cx)
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "refunded" }, deps(physicalOrder({ status: "partially_refunded", refundedCents: 1000 })))
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "refunded" }, deps(physicalOrder({ status: "refunded", refundedCents: 5500 })))
    const rf = posted("/api/events").map((c) => c.body.data.attributes)
    check("refunds: a part refund is its own Refunded Order (value 10), the full one carries the order's unique_id", rf.length === 2 && rf[0].metric.data.attributes.name === "Refunded Order" && rf[0].value === 10 && rf[0].unique_id === `${CHECKOUT}:refund:1000` && rf[1].value === 55 && rf[1].unique_id === CHECKOUT, rf.map((r) => [r.value, r.unique_id]))

    /* Started Checkout: only with the news box ticked. */
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "started" }, deps(physicalOrder({ status: "pending", paidAt: null })))
    check("Started Checkout is never sent for a checkout whose news box was not ticked", posted("/api/events").length === 0)
    db.tables.commerce_checkouts[0].email_opt_in = true
    db.tables.subscribers.push(sub("buyer@example.com", "unsubscribed", "2026-10-01T00:00:00.000Z"))
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "started" }, deps(physicalOrder({ status: "pending", paidAt: null })))
    check("  nor for someone who unsubscribed from the store", posted("/api/events").length === 0)
    db.tables.subscribers.pop()
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "started" }, deps(physicalOrder({ status: "pending", paidAt: null })))
    const st = posted("/api/events")[0]?.body?.data?.attributes
    check("  ticked: Started Checkout with its items and value, unique per checkout", st?.metric.data.attributes.name === "Started Checkout" && st.unique_id === `${CHECKOUT}:started` && st.value === 55 && st.properties.ItemNames.join() === "Tee,Guide", st)
  }

  console.log("\nA busy provider is tried again, without sending anything twice\n")
  {
    const db = freshDb()
    db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR, receipt_token: "rt_1", email_opt_in: false, status: "paid" })
    await connected(db, "klaviyo", false)
    let eventsSeen = 0
    const busy: Route = (c) => (c.path === "/api/events" && ++eventsSeen === 2 ? { status: 429, body: { errors: [{ detail: "Request was throttled." }] }, headers: { "Retry-After": "7" } } : null)
    reset([busy, klaviyo, omnisend])
    let thrown: unknown = null
    try {
      await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "placed" })
    } catch (e) {
      thrown = e
    }
    check("a 429 is thrown as worth retrying, with Klaviyo's Retry-After", thrown instanceof ProviderError && thrown.retry && thrown.status === 429 && thrown.retryAfterSeconds === 7, thrown)
    check("  the card says it, in words", /slow down/.test(db.rows("commerce_integrations")[0].last_error ?? ""))
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "placed" })
    const again = posted("/api/events").map((c) => c.body.data.attributes.unique_id)
    check("the retry sends only what had not gone (the Placed Order went before the 429)", again.length === 2 && !again.includes(CHECKOUT), again)
    reset([(c) => (c.path === "/api/events" ? { status: 503 } : null), klaviyo])
    let down: any = null
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "fulfilled" }, deps(physicalOrder({ fulfillmentStatus: "fulfilled" }))).catch((e) => (down = e))
    check("Klaviyo down (5xx): retried by the queue's backoff", down instanceof ProviderError && down.retry)
    reset([(c) => (c.path === "/api/events" ? { status: 400, body: { errors: [{ detail: "Invalid input." }] } } : null), klaviyo])
    let refused: any = null
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "cancelled" }, deps(physicalOrder({ cancelledAt: "2026-10-12T09:30:00.000Z" }))).catch((e) => (refused = e))
    check("a refusal is not retried (nothing would change) and is on the card", refused === null && /Invalid input/.test(db.rows("commerce_integrations")[0].last_error ?? ""))
    const jobsSrc = read("lib/physical/jobs-server.ts")
    check("the queue retries with backoff and a lease (runJobs, commerce_claim_jobs)", /backoffSeconds\(job\.attempts\)/.test(jobsSrc) && /commerce_claim_jobs/.test(jobsSrc))
  }

  console.log("\nRate limits: each provider's published limit, kept under\n")
  {
    check("Klaviyo: events under 3500/m, bulk subscribe under 750/m, bulk import under 150/m, accounts under 15/m; Omnisend under 400/m", LIMITS["klaviyo:events"] < 3500 && LIMITS["klaviyo:subscriptions"] < 750 && LIMITS["klaviyo:import"] < 150 && LIMITS["klaviyo:accounts"] < 15 && LIMITS.omnisend < 400)
    let t = 0
    const waits: number[] = []
    const p = new Pacer(
      () => t,
      async (ms) => {
        waits.push(ms)
        t += ms
      },
    )
    for (let i = 0; i < 5; i++) await p.wait("omnisend:store", LIMITS.omnisend)
    check("calls are spaced one every 60s / limit (Omnisend: 167ms apart), so no burst ever happens", waits.join() === "167,167,167,167" && t === 668, waits)
    await p.wait("omnisend:other-store", LIMITS.omnisend)
    check("  per store: another store's calls do not wait on this one's", waits.length === 4)
    const before = calls.length
    slept.length = 0
    reset([klaviyo])
    for (let i = 0; i < 3; i++) await marketingCall("Klaviyo", "https://a.klaviyo.com/api/lists", { headers: { Authorization: `Klaviyo-API-Key ${KEY}` }, limit: { key: "s1", name: "klaviyo:accounts" } })
    check("  every provider call goes through the pacer (Get Accounts: 4.6s apart)", slept.length >= 2 && slept.every((ms) => ms >= 4600), slept)
    check("an error body is read the way each provider writes it", marketingMessage({ errors: [{ detail: "Bad list" }] }) === "Bad list" && marketingMessage({ title: "Validation failed", detail: "email is invalid" }) === "email is invalid" && before >= 0)
  }

  console.log("\nOmnisend: contacts and the five order events, per its API\n")
  {
    const db = freshDb()
    db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR, receipt_token: "rt_1", email_opt_in: true, status: "paid" })
    omniContacts.length = 0
    omniContacts.push({ email: "left@x.co", status: "unsubscribed", updatedAt: "2026-09-20T00:00:00Z", statusChangedAt: "2026-09-20T00:00:00Z" })
    db.tables.subscribers.push(sub("ann@x.co", "subscribed", "2026-09-02T00:00:00.000Z"), sub("left@x.co", "subscribed", "2026-09-03T00:00:00.000Z"), sub("cus@x.co", "customer", "2026-09-04T00:00:00.000Z"), sub("gone@x.co", "bounced", "2026-09-05T00:00:00.000Z"))
    await connected(db, "omnisend", true)
    reset([omnisend])
    await job(db, "omnisend", "sync")
    const firstPull = calls.find((c) => c.method === "GET" && c.path === "/api/contacts")!
    check("the first look reads every unsubscribed contact: GET /api/contacts?status=unsubscribed&limit=250", firstPull.query.get("status") === "unsubscribed" && firstPull.query.get("limit") === "250" && !firstPull.query.get("updatedAtFrom"))
    check("  and unsubscribes them on Storelib", db.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "unsubscribed")
    const batches = posted("/api/batches")
    const contacts = posted("/api/contacts")
    const items = [...batches.flatMap((b) => b.body.items), ...contacts.map((c) => c.body)]
    const byEmail = (e: string) => items.find((i: any) => i.identifiers[0].id === e)
    check("contacts go as POST /api/contacts or POST /api/batches {method: POST, endpoint: contacts, items}", batches.every((b) => b.body.method === "POST" && b.body.endpoint === "contacts" && b.body.items.length <= 100) && items.length === 3, items)
    check("  the subscriber: identifiers [{type email, id, channels.email.status subscribed, statusDate}]", byEmail("ann@x.co")?.identifiers[0].type === "email" && byEmail("ann@x.co")?.identifiers[0].channels.email.status === "subscribed" && typeof byEmail("ann@x.co")?.identifiers[0].channels.email.statusDate === "string")
    check("  the customer: no channel status at all (never made a subscriber), tagged", byEmail("cus@x.co") && !byEmail("cus@x.co").identifiers[0].channels && byEmail("cus@x.co").tags.includes("storelib customer"))
    check("  the bounced: unsubscribed there", byEmail("gone@x.co")?.identifiers[0].channels.email.status === "unsubscribed")
    check("  the one who left in Omnisend is not sent back as subscribed", !byEmail("left@x.co") || byEmail("left@x.co").identifiers[0].channels?.email?.status !== "subscribed")
    reset([omnisend])
    await job(db, "omnisend", "sync")
    const later = calls.find((c) => c.method === "GET" && c.path === "/api/contacts")!
    check("after that, only what changed: updatedAtFrom, oldest first", !!later.query.get("updatedAtFrom") && later.query.get("sort") === "updatedAt" && later.query.get("direction") === "asc" && !later.query.get("status"))

    reset([omnisend])
    await job(db, "omnisend", "event", { orderRef: CHECKOUT, event: "placed" })
    const ev = posted("/api/events").map((c) => c.body)
    check("a paid order: placed order and paid for order, eventVersion v2, origin api", ev.length === 2 && ev[0].eventName === "placed order" && ev[1].eventName === "paid for order" && ev.every((e) => e.eventVersion === "v2" && e.origin === "api"), ev.map((e) => e.eventName))
    const pr = ev[0].properties
    check(
      "  properties: orderID, orderNumber, currency, totalPrice, subTotalPrice, totalDiscount, totalTax, shippingPrice, paymentStatus, fulfillmentStatus, lineItems[productID, productTitle, productPrice, productQuantity, productSKU]",
      pr.orderID === CHECKOUT && pr.orderNumber === "#33333333" && pr.currency === "USD" && pr.totalPrice === 55 && pr.subTotalPrice === 50 && pr.totalDiscount === 5 && pr.totalTax === 3 && pr.shippingPrice === 7 && pr.paymentStatus === "paid" && pr.fulfillmentStatus === "unfulfilled" && pr.lineItems[0].productID === "p-tee" && pr.lineItems[0].productTitle === "Tee" && pr.lineItems[0].productPrice === 20 && pr.lineItems[0].productQuantity === 2 && pr.lineItems[0].productSKU === "TEE-M" && pr.discounts[0].code === "SUMMER10" && pr.shippingAddress.address1 === "1 Main St",
      pr,
    )
    check("  contact by email, eventID a stable UUID (Omnisend counts a past event once by it)", ev[0].contact.email === "buyer@example.com" && /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(ev[0].eventID) && ev[0].eventID === omnisendEventId(`omnisend:${CREATOR}:placed:${CHECKOUT}`))
    const hdr = posted("/api/events")[0].headers
    check("  POST https://api.omnisend.com/api/events with Omnisend-API-Key and Omnisend-Version", hdr.authorization === `Omnisend-API-Key ${OKEY}` && hdr["omnisend-version"] === "2026-03-15" && hdr["content-type"] === "application/json")
    reset([omnisend])
    await job(db, "omnisend", "event", { orderRef: CHECKOUT, event: "fulfilled" }, deps(physicalOrder({ fulfillmentStatus: "fulfilled", shipments: [{ status: "shipped", carrier: "UPS", trackingNumber: "1Z9", trackingUrl: "https://ups.example/1Z9" }] })))
    await job(db, "omnisend", "event", { orderRef: CHECKOUT, event: "cancelled" }, deps(physicalOrder({ cancelledAt: "2026-10-12T09:30:00.000Z", status: "refunded", refundedCents: 5500 })))
    await job(db, "omnisend", "event", { orderRef: CHECKOUT, event: "refunded" }, deps(physicalOrder({ status: "refunded", refundedCents: 5500 })))
    await job(db, "omnisend", "event", { orderRef: CHECKOUT, event: "started" })
    const more = posted("/api/events").map((c) => c.body)
    check("order fulfilled (with tracking.code), order canceled (cancelReason), order refunded (totalRefundedAmount, refundedLineItems); no Omnisend event for a started checkout", more.map((e) => e.eventName).join() === "order fulfilled,order canceled,order refunded" && more[0].properties.tracking.code === "1Z9" && "cancelReason" in more[1].properties && more[2].properties.totalRefundedAmount === 55 && more[2].properties.refundedLineItems.length === 2, more.map((e) => e.eventName))
    check("  payment and fulfilment statuses in Omnisend's words", more[1].properties.paymentStatus === "refunded" && more[0].properties.fulfillmentStatus === "fulfilled")
  }

  console.log("\nDigital purchases: order events for every buyer, a list only for the consented\n")
  {
    const db = freshDb()
    db.tables.products.push({ id: "prod-1", title: "Lightroom presets", thumbnail_url: "https://cdn.example/p.png" })
    db.tables.orders.push(
      { id: "dddddddd-0000-4000-8000-000000000001", creator_id: CREATOR, checkout_id: null, product_id: "prod-1", buyer_email: "dig@x.co", buyer_first_name: "Dee", buyer_last_name: "Gee", amount_cents: 1500, currency: "eur", status: "completed", created_at: "2026-09-20T00:00:00.000Z" },
      { id: "dddddddd-0000-4000-8000-000000000002", creator_id: CREATOR, checkout_id: null, product_id: "prod-1", buyer_email: "old@x.co", amount_cents: 900, currency: "eur", status: "completed", created_at: "2026-05-01T00:00:00.000Z" },
      { id: "dddddddd-0000-4000-8000-000000000003", creator_id: CREATOR, checkout_id: CHECKOUT, product_id: "prod-1", buyer_email: "phys@x.co", amount_cents: 900, currency: "eur", status: "completed", created_at: "2026-09-21T00:00:00.000Z" },
      { id: "dddddddd-0000-4000-8000-000000000004", creator_id: "99999999-9999-4999-8999-999999999999", checkout_id: null, product_id: "prod-1", buyer_email: "else@x.co", amount_cents: 900, currency: "eur", status: "completed", created_at: "2026-09-22T00:00:00.000Z" },
    )
    /* The buyer did not tick anything: a customer. */
    db.tables.subscribers.push(sub("dig@x.co", "customer", "2026-09-20T00:00:00.000Z"))
    await connected(db, "klaviyo", true)
    reset([klaviyo])
    await job(db, "klaviyo", "sync")
    const ev = posted("/api/events").map((c) => c.body.data.attributes)
    const placed = ev.filter((e) => e.metric.data.attributes.name === "Placed Order")
    check("a download bought in the last 90 days is a Placed Order (and Ordered Product), as past data (backfill: no flow fires)", placed.length === 1 && placed[0].profile.data.attributes.email === "dig@x.co" && placed[0].value === 15 && placed[0].value_currency === "EUR" && placed[0].backfill === true && placed[0].properties.Items[0].ProductName === "Lightroom presets", placed)
    check("  older than 90 days, part of a physical checkout, or another store's: not sent by this scan", !ev.some((e) => ["old@x.co", "phys@x.co", "else@x.co"].includes(e.profile.data.attributes.email)))
    const subscribed = posted("/api/profile-subscription-bulk-create-jobs").flatMap((c) => c.body.data.attributes.profiles.data.map((p: any) => p.attributes.email))
    check("  the buyer is a customer profile, never subscribed to the list", !subscribed.includes("dig@x.co") && posted("/api/profile-bulk-import-jobs").some((c) => JSON.stringify(c.body).includes("dig@x.co")))
    db.tables.orders.push({ id: "dddddddd-0000-4000-8000-000000000005", creator_id: CREATOR, checkout_id: null, product_id: "prod-1", buyer_email: "late@x.co", amount_cents: 2000, currency: "usd", status: "completed", created_at: "2026-10-12T10:05:00.000Z" })
    reset([klaviyo])
    await job(db, "klaviyo", "sync")
    const live = posted("/api/events").map((c) => c.body.data.attributes).filter((e) => e.metric.data.attributes.name === "Placed Order")
    check("a download sold after connecting goes on the next sync, as a live event", live.length === 1 && live[0].profile.data.attributes.email === "late@x.co" && live[0].backfill === undefined, live)
    const d = fromDigitalOrder({ id: "x1", buyer_email: "A@B.co", amount_cents: 1200, currency: "jpy", status: "completed", created_at: "2026-10-01T00:00:00Z" }, { title: "T" }, { productUrl: null })!
    check("amounts in the currency's major unit (1200 JPY is 1200, 1234 USD cents is 12.34)", major(1200, "JPY") === 1200 && major(1234, "usd") === 12.34 && d.totalCents === 1200 && d.email === "a@b.co")
  }

  console.log("\nA backfill sends the last 90 days of physical orders once, with what already happened to them\n")
  {
    const db = freshDb()
    const PAST = "55555555-5555-4555-8555-555555555555"
    db.tables.commerce_checkouts.push({ id: PAST, creator_id: CREATOR, receipt_token: "rt_p", status: "refunded", paid_at: "2026-09-10T00:00:00.000Z", cancel_reason: "Changed mind" }, { id: "66666666-6666-4666-8666-666666666666", creator_id: CREATOR, status: "paid", paid_at: "2026-06-01T00:00:00.000Z" })
    await connected(db, "klaviyo", true)
    const pastOrder = physicalOrder({ id: PAST, status: "refunded", refundedCents: 5500, cancelledAt: "2026-09-11T00:00:00.000Z", paidAt: "2026-09-10T00:00:00.000Z", createdAt: "2026-09-10T00:00:00.000Z" })
    reset([klaviyo])
    await job(db, "klaviyo", "sync", {}, deps(pastOrder))
    const names = posted("/api/events").map((c) => c.body.data.attributes.metric.data.attributes.name)
    check("the order in the window: Placed Order, Ordered Product per line, Canceled Order and Refunded Order, every one a backfill", names.join() === "Placed Order,Ordered Product,Ordered Product,Canceled Order,Refunded Order" && posted("/api/events").every((c) => c.body.data.attributes.backfill === true), names)
    check("  the one from June (over 90 days) is not sent", !posted("/api/events").some((c) => JSON.stringify(c.body).includes("66666666")))
    check("the backfill says it is done on the card", (await loadMarketing(db, CREATOR)).find((v) => v.provider === "klaviyo")!.backfillState === "done")
    reset([klaviyo])
    await job(db, "klaviyo", "event", { orderRef: PAST, event: "refunded" }, deps(pastOrder))
    check("a live refund event for the same order afterwards sends nothing twice", posted("/api/events").length === 0)
  }

  console.log("\nOrder events are queued from the order timeline, through the commerce job queue\n")
  {
    const db = freshDb()
    await connected(db, "klaviyo", false)
    await connected(db, "omnisend", false)
    db.tables.commerce_jobs.length = 0
    await addOrderEvent(db, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "payment.paid", message: "Paid", key: `paid:${CHECKOUT}` })
    const q = db.rows("commerce_jobs").filter((j) => j.kind === "marketing_sync")
    check("payment.paid on the timeline queues one marketing_sync job per connected provider", q.length === 2 && q.every((j) => j.payload.op === "event" && j.payload.event === "placed" && j.payload.orderRef === CHECKOUT) && q.map((j) => j.payload.provider).sort().join() === "klaviyo,omnisend", q)
    check("  the job's payload carries no checkoutId field, so a dead job never writes a wrong line on the order", q.every((j) => !("checkoutId" in j.payload)))
    await addOrderEvent(db, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "payment.paid", message: "Paid", key: `paid:${CHECKOUT}` })
    check("  the same timeline entry again queues nothing", db.rows("commerce_jobs").filter((j) => j.kind === "marketing_sync").length === 2)
    await addOrderEvent(db, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "order.note", message: "A note", key: "note1" })
    check("  a note is not a marketing event", db.rows("commerce_jobs").filter((j) => j.kind === "marketing_sync").length === 2)
    check("the kinds heard: paid, shipped, delivered, cancelled, refunded, a checkout started", Object.keys(ORDER_EVENT_KINDS).sort().join() === "checkout.started,fulfillment.created,fulfillment.delivered,order.cancelled,payment.paid,payment.refunded")
    const other = freshDb()
    await queueMarketingEvent(other, { creatorId: CREATOR, checkoutId: CHECKOUT, kind: "payment.paid" })
    check("  a store with nothing connected queues nothing", other.rows("commerce_jobs").length === 0)
    const s1 = await scheduleMarketingSyncs(db, NOW)
    const s2 = await scheduleMarketingSyncs(db, NOW + 60_000)
    const s3 = await scheduleMarketingSyncs(db, NOW + 16 * 60_000)
    check("the cron queues a sync per connected store and provider each quarter hour, once", s1 === 2 && s2 === 0 && s3 === 2)
  }

  console.log("\nDisconnect stops everything\n")
  {
    const db = freshDb()
    db.tables.subscribers.push(sub("ann@x.co", "subscribed", "2026-10-12T10:00:05.000Z"))
    await connected(db, "klaviyo", false)
    await queueMarketingEvent(db, { creatorId: CREATOR, checkoutId: CHECKOUT, kind: "payment.paid", key: "k" })
    const r = await saveMarketing(db, CREATOR, "klaviyo", { disconnect: true }, NOW)
    check("the key is gone", r.ok && db.rows("commerce_integrations").length === 0)
    check("  every job not yet run is closed", db.rows("commerce_jobs").filter((j) => j.kind === "marketing_sync").every((j) => j.status === "done" && j.last_error === "Disconnected"))
    reset([klaviyo, omnisend])
    await job(db, "klaviyo", "sync")
    await job(db, "klaviyo", "event", { orderRef: CHECKOUT, event: "placed" })
    check("  and a job that runs anyway sends nothing", calls.length === 0)
    const v = (await loadMarketing(db, CREATOR)).find((x) => x.provider === "klaviyo")!
    check("  the card reads Not connected", !v.connected && v.keyHint === null)
  }

  console.log("\nWiring, copy and SQL\n")
  {
    const jobs = read("lib/physical/jobs-server.ts")
    check("the job queue runs marketing_sync with the real order engine", /"marketing_sync"/.test(jobs) && /case "marketing_sync":\s*\n\s*return runMarketingJob\(db, job\.payload, realMarketingDeps\)/.test(jobs))
    check("the timeline hook is there, after a new entry only", /MARKETING_KINDS\.has\(e\.kind\)/.test(read("lib/physical/events-server.ts")) && /!error && e\.creatorId && MARKETING_KINDS/.test(read("lib/physical/events-server.ts")))
    check("the cron schedules the syncs", /scheduleMarketingSyncs\(db\)/.test(read("app/api/cron/physical/route.ts")))
    const route = read("app/api/store/integrations/marketing/route.ts")
    check("the settings route: the owner's store only, rate limited, paused from /admin refuses a connect", /shopCaller\((\"store\", \{ strict: true \})?\)/.test(route) /* Changed on purpose (r52): a provider key saved asks Supabase Auth itself */ && /rateLimit\(/.test(route) && /cachedCatalogOverrides/.test(route))
    const sql = read("supabase/sql/run-now/166_marketing_sync.sql")
    const lines = sql.trim().split("\n")
    check("SQL 161: one statement per line, the DO blocks on one line each, notify last", lines.length === 10 && lines.slice(1).every((l) => l.trim().endsWith(";")) && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && lines.filter((l) => l.startsWith("DO $do$")).length === 3)
    check("  rebuilds the three checks from what they already allow, so other parts keep their values", lines.filter((l) => l.includes("pg_get_constraintdef")).length === 3 && sql.includes("'marketing_sync'") && sql.includes("'klaviyo', 'omnisend'") && sql.includes("'marketing'"))
    check("  a check that is already a pattern (part 163's jobs check) is left as it is, never turned back into a list", lines.filter((l) => l.includes("LIKE '%~%') THEN RAISE NOTICE")).length === 3)
    check("  the check after counts the pattern as done", read("supabase/sql/run-now/99_check_after.sql").includes("like '%marketing_sync%' or pg_get_constraintdef(oid) like '%~%'"))
    check("  marketing_sync_items: unique per store, provider and item, server only", /UNIQUE \(creator_id, provider, item_key\)/.test(sql) && /REVOKE ALL ON public\.marketing_sync_items FROM anon, authenticated/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql))
    check("  the migration copy, the README row and the check after", existsSync(join(process.cwd(), "supabase/migrations/20270112_marketing_sync.sql")) && read("supabase/sql/run-now/README.md").includes("`166_marketing_sync.sql`") && read("supabase/sql/run-now/99_check_after.sql").includes("as p166_marketing_sync"))
    const kl = INTEGRATIONS.find((i) => i.id === "klaviyo")!
    const om = INTEGRATIONS.find((i) => i.id === "omnisend")!
    check("Klaviyo's and Omnisend's pages no longer say their subscribers and orders are not sent", ![...kl.about, ...om.about].some((p) => /Not connected yet/.test(p)) && kl.about.some((p) => /Placed Order/.test(p)) && om.about.some((p) => /placed order/i.test(p)))
    check("  their data ownership says exactly what flows in and out", kl.data.some((d) => /said yes/.test(d) && /only they are subscribed/.test(d)) && kl.data.some((d) => /unsubscribe/i.test(d)) && om.data.some((d) => /last four/.test(d)))
    const files = ["lib/integrations/marketing/http.ts", "lib/integrations/marketing/orders.ts", "lib/integrations/marketing/consent.ts", "lib/integrations/marketing/klaviyo.ts", "lib/integrations/marketing/omnisend.ts", "lib/integrations/marketing/sync-server.ts", "components/app/settings/marketing-sync-panel.tsx", "app/api/store/integrations/marketing/route.ts", "supabase/sql/run-now/166_marketing_sync.sql"]
    const banned = /—|\bunlock|\belevate|\bseamless|\bpowerful|\beffortless|\bsupercharge|\btransform/i
    const hits = files.filter((f) => existsSync(join(process.cwd(), f)) && banned.test(read(f).replace(/transformations?|transform\(|transform:|translate3d|transform-/g, "")))
    check("no em dash and none of the banned words in the new files", hits.length === 0, hits)
    check("no real address was ever called", realHost.length === 0, realHost)
    check("Klaviyo's pull URL keeps to its documented filters", klaviyoPullUrl("2026-01-01T00:00:00Z", null).startsWith("https://a.klaviyo.com/api/profiles?") && omnisendPullUrl({ since: null, after: null }).includes("status=unsubscribed"))
    const o = fromPhysicalOrder(physicalOrder(), { orderUrl: null, cancelReason: null })!
    check("one shape for both: Klaviyo and Omnisend read the same order", klaviyoEventsFor(o, "placed", { backfill: false, now: "2026-10-12T10:00:00Z" }).length === 3 && omnisendEventsFor(o, "placed", { creatorId: CREATOR, now: "2026-10-12T10:00:00Z" }).length === 2)
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
