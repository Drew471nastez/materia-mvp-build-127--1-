/**
 * Connected email platforms: Brevo, MailerLite and Kit on the same sync as
 * Klaviyo and Omnisend (lib/integrations/marketing/platforms.ts and
 * sync-server.ts), and the store's own sending domain with Mailgun
 * (lib/emails/sending-domain*.ts). Every provider call goes to a stub of its
 * public API, checked against the request shape its documentation gives;
 * any other address fails the suite. Nothing real is called: the real APIs
 * need real keys, which this suite never has.
 *
 *   For each platform: the key checked (a good one, a refused one), a
 *   subscriber pushed, an unsubscribe sent, an unsubscribe read back, the
 *   webhook received, an order event, a 429 retried without sending twice.
 *
 *   node scripts/run-push-tests.mjs   (this suite is in SUITES)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { FakeSupabase } from "./fake-supabase"
import { openSecret } from "@/lib/physical/secrets"
import { ProviderError, pacer } from "@/lib/integrations/marketing/http"
import { BREVO_API, KIT_API, MAILERLITE_API, PLATFORMS, mailerliteSignatureOk, mlDate } from "@/lib/integrations/marketing/platforms"
import { loadMarketing, marketingWebhookUrl, receiveMarketingWebhook, runMarketingJob, saveMarketing, type MarketingDeps } from "@/lib/integrations/marketing/sync-server"
import { domainProblem, fromLocalProblem, isRootDomain, ownFrom, recordsFromMailgun } from "@/lib/emails/sending-domain"
import { addSendingDomain, forgetSender, loadSendingDomain, removeSendingDomain, verifiedSender, verifySendingDomain } from "@/lib/emails/sending-domain-server"
import { INTEGRATIONS } from "@/lib/integrations/catalog"
import { createHmac } from "node:crypto"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-marketing-0123456789"
process.env.MAILGUN_API_KEY = "key-test-mailgun"
process.env.MAILGUN_BASE_URL = "https://api.eu.mailgun.net"
process.env.MAILGUN_DOMAIN = "mg.storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── the providers, stubbed ────────────────────────────────────────────── */

type Call = { method: string; url: string; path: string; query: URLSearchParams; headers: Record<string, string>; body: any; form: URLSearchParams | null }
let calls: Call[] = []
const realHost: string[] = []
type Route = (c: Call) => { status: number; body?: unknown; headers?: Record<string, string> } | null
let routes: Route[] = []
globalThis.fetch = (async (input: any, init: any = {}) => {
  const url = typeof input === "string" ? input : input.url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(init.headers ?? {})) headers[k.toLowerCase()] = String(v)
  const u = new URL(url)
  let body: any = null
  let form: URLSearchParams | null = null
  if (typeof init.body === "string") body = JSON.parse(init.body)
  else if (init.body instanceof URLSearchParams) form = init.body
  else if (init.body && typeof init.body.get === "function") body = init.body
  const c: Call = { method: init.method ?? "GET", url, path: u.pathname, query: u.searchParams, headers, body, form }
  if (!/^https:\/\/(api\.brevo\.com|connect\.mailerlite\.com|api\.kit\.com|api\.eu\.mailgun\.net)\//.test(url)) {
    realHost.push(url)
    throw new Error(`a real address was called: ${url}`)
  }
  calls.push(c)
  for (const r of routes) {
    const out = r(c)
    if (out) return new Response(out.status === 204 || out.body === undefined ? null : JSON.stringify(out.body), { status: out.status, headers: { "content-type": "application/json", ...(out.headers ?? {}) } })
  }
  return new Response(JSON.stringify({ message: "not stubbed" }), { status: 404 })
}) as typeof fetch
const reset = (r: Route[]) => {
  calls = []
  routes = r
}
let fakeClock = 0
pacer.now = () => fakeClock
pacer.sleep = async (ms) => {
  fakeClock += ms
}

const BREVO_KEY = "xkeysib-0123456789abcdef0123456789abcdef-AbCdEf"
const ML_KEY = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiI0IiwianRpIjoiMTIzIn0.sig0123456789"
const KIT_KEY = "kit_0123456789abcdefABCDEF01"

/* Brevo */
const brevoBlocked: { email: string; modifiedAt: string }[] = []
const brevo: Route = (c) => {
  if (!c.url.startsWith(BREVO_API)) return null
  if (c.headers["api-key"] !== BREVO_KEY) return { status: 401, body: { code: "unauthorized", message: "Key not found" } }
  const p = c.path.replace("/v3", "")
  if (p === "/account") return { status: 200, body: { email: "ana@shop.example", companyName: "Ana Studio", organization_id: "org_77" } }
  if (p === "/contacts/lists") return { status: 200, body: { lists: [{ id: 2, name: "Newsletter" }, { id: 7, name: "VIP" }], count: 2 } }
  if (c.method === "POST" && p === "/contacts") return { status: 201, body: { id: 1 } }
  if (c.method === "POST" && p === "/contacts/import") return { status: 202, body: { processId: 9 } }
  if (c.method === "PUT" && p.startsWith("/contacts/")) return decodeURIComponent(p.slice(10)) === "nobody@x.co" ? { status: 404, body: { code: "document_not_found", message: "Contact does not exist" } } : { status: 204 }
  if (c.method === "POST" && p === "/events") return { status: 204 }
  if (c.method === "GET" && p === "/contacts") {
    const since = Date.parse(c.query.get("modifiedSince") ?? "2000-01-01")
    return { status: 200, body: { contacts: brevoBlocked.filter((x) => Date.parse(x.modifiedAt) >= since).map((x) => ({ email: x.email, emailBlacklisted: true, modifiedAt: x.modifiedAt })), count: brevoBlocked.length } }
  }
  if (c.method === "POST" && p === "/webhooks") return { status: 201, body: { id: 501 } }
  if (c.method === "DELETE" && p.startsWith("/webhooks/")) return { status: 204 }
  return null
}

/* MailerLite */
const mlUnsubscribed: { email: string; unsubscribed_at: string }[] = []
const mlGroups = [{ id: "111", name: "Newsletter" }]
const mailerlite: Route = (c) => {
  if (!c.url.startsWith(MAILERLITE_API)) return null
  if (c.headers.authorization !== `Bearer ${ML_KEY}`) return { status: 401, body: { message: "Unauthenticated." } }
  const p = c.path.replace("/api", "")
  if (c.method === "GET" && p === "/groups") {
    const name = c.query.get("filter[name]")
    return { status: 200, body: { data: name ? mlGroups.filter((g) => g.name === name) : mlGroups } }
  }
  if (c.method === "POST" && p === "/groups") {
    const g = { id: String(200 + mlGroups.length), name: c.body.name }
    mlGroups.push(g)
    return { status: 201, body: { data: g } }
  }
  if (c.method === "POST" && (p === "/subscribers" || p === "/batch")) return { status: 200, body: p === "/batch" ? { total: c.body.requests.length, successful: c.body.requests.length, failed: 0, responses: [] } : { data: { id: "s1", email: c.body.email } } }
  if (c.method === "GET" && p === "/subscribers") return { status: 200, body: { data: mlUnsubscribed.map((x) => ({ email: x.email, status: "unsubscribed", unsubscribed_at: x.unsubscribed_at })), meta: { next_cursor: null } } }
  if (c.method === "POST" && p === "/webhooks") return { status: 201, body: { data: { id: "wh_9", secret: "ml-webhook-secret" } } }
  if (c.method === "DELETE" && p.startsWith("/webhooks/")) return { status: 204 }
  return null
}

/* Kit */
const kitPeople = new Map<string, { id: number; state: string }>()
const kitTags = [{ id: 31, name: "Newsletter" }]
const kit: Route = (c) => {
  if (!c.url.startsWith(KIT_API)) return null
  if (c.headers["x-kit-api-key"] !== KIT_KEY) return { status: 401, body: { errors: ["The access token is invalid"] } }
  const p = c.path.replace("/v4", "")
  if (p === "/account") return { status: 200, body: { user: { email: "ana@shop.example" }, account: { id: 4242, name: "Ana Kit", primary_email_address: "ana@shop.example" } } }
  if (c.method === "GET" && p === "/tags") return { status: 200, body: { tags: kitTags, pagination: { has_next_page: false, end_cursor: null } } }
  if (c.method === "POST" && p === "/tags") {
    const had = kitTags.find((t) => t.name === c.body.name)
    if (had) return { status: 200, body: { tag: had } }
    const t = { id: 40 + kitTags.length, name: c.body.name }
    kitTags.push(t)
    return { status: 201, body: { tag: t } }
  }
  if (c.method === "POST" && p === "/subscribers") {
    if (!kitPeople.has(c.body.email_address)) kitPeople.set(c.body.email_address, { id: 900 + kitPeople.size, state: "active" })
    return { status: 201, body: { subscriber: { id: kitPeople.get(c.body.email_address)!.id, email_address: c.body.email_address, state: "active" } } }
  }
  if (c.method === "POST" && /^\/tags\/\d+\/subscribers$/.test(p)) return kitPeople.has(c.body.email_address) ? { status: 201, body: { subscriber: {} } } : { status: 404, body: { errors: ["Not Found"] } }
  if (c.method === "GET" && p === "/subscribers") {
    const email = c.query.get("email_address")
    if (email) return { status: 200, body: { subscribers: kitPeople.has(email) ? [{ id: kitPeople.get(email)!.id, email_address: email }] : [], pagination: { has_next_page: false } } }
    return { status: 200, body: { subscribers: [...kitPeople].filter(([, v]) => v.state !== "active").map(([e, v]) => ({ id: v.id, email_address: e, state: v.state })), pagination: { has_next_page: false, end_cursor: null } } }
  }
  if (c.method === "POST" && /^\/subscribers\/\d+\/unsubscribe$/.test(p)) return { status: 200, body: {} }
  if (c.method === "POST" && p === "/webhooks") return { status: 201, body: { webhook: { id: 700 + calls.filter((x) => x.path === "/v4/webhooks").length } } }
  if (c.method === "DELETE" && p.startsWith("/webhooks/")) return { status: 204 }
  return null
}

/* Mailgun's Domains API */
const mgDomains = new Map<string, { state: string; spf: string; dkim: string }>()
const mailgun: Route = (c) => {
  if (!c.url.startsWith("https://api.eu.mailgun.net/")) return null
  if (c.headers.authorization !== `Basic ${Buffer.from("api:key-test-mailgun").toString("base64")}`) return { status: 401, body: { message: "Invalid private key" } }
  const shape = (name: string) => {
    const d = mgDomains.get(name)!
    return {
      domain: { name, state: d.state },
      sending_dns_records: [
        { record_type: "TXT", valid: d.spf, name, value: "v=spf1 include:mailgun.org ~all" },
        { record_type: "TXT", valid: d.dkim, name: `pic._domainkey.${name}`, value: "k=rsa; p=MIIBIjANBgkq" },
        { record_type: "CNAME", valid: "unknown", name: `email.${name}`, value: "eu.mailgun.org" },
      ],
      receiving_dns_records: [{ record_type: "MX", valid: "unknown", priority: "10", value: "mxa.eu.mailgun.org" }],
    }
  }
  if (c.method === "POST" && c.path === "/v4/domains") {
    const name = c.form?.get("name") ?? ""
    if (mgDomains.has(name)) return { status: 400, body: { message: "This domain name is already taken" } }
    mgDomains.set(name, { state: "unverified", spf: "unknown", dkim: "unknown" })
    return { status: 200, body: { message: "Domain DNS records have been created", ...shape(name) } }
  }
  const verify = /^\/v4\/domains\/([^/]+)\/verify$/.exec(c.path)
  if (c.method === "PUT" && verify) return mgDomains.has(verify[1]) ? { status: 200, body: shape(verify[1]) } : { status: 404, body: { message: "Domain not found" } }
  const del = /^\/v3\/domains\/([^/]+)$/.exec(c.path)
  if (c.method === "DELETE" && del) {
    mgDomains.delete(del[1])
    return { status: 200, body: { message: "Domain has been deleted" } }
  }
  if (c.method === "POST" && /^\/v3\/[^/]+\/messages$/.test(c.path)) return { status: 200, body: { id: "<m1@x>", message: "Queued. Thank you." } }
  return null
}

/* ── a store ───────────────────────────────────────────────────────────── */

const CREATOR = "11111111-1111-4111-8111-111111111111"
const CHECKOUT = "33333333-3333-4333-8333-333333333333"
const NOW = Date.parse("2026-10-29T10:00:00Z")
let n = 0
const uid = () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, "0")}`

function freshDb() {
  const db = new FakeSupabase()
  db.clock = NOW
  db.table("commerce_integrations", { unique: [["creator_id", "provider"]], defaults: () => ({ id: uid(), config: {}, status: "disconnected", last_error: null, last_sync_at: null, account_label: null }) })
  db.table("marketing_sync_items", {
    unique: [["creator_id", "provider", "item_key"]],
    defaults: () => ({ id: ++n }),
    checks: [(r) => (["subscribed", "unsubscribed", "customer", "sent", "line", "pulled"].includes(r.state) ? null : "marketing_sync_items_state_check"), (r) => (["klaviyo", "omnisend", "brevo", "mailerlite", "kit"].includes(r.provider) ? null : "provider")],
  })
  db.table("commerce_jobs", { unique: [["idempotency_key"]], defaults: () => ({ id: ++n, status: "queued", attempts: 0 }) })
  db.table("subscribers", { unique: [["creator_id", "email"]], defaults: () => ({ id: uid(), is_active: true }) })
  db.table("commerce_checkouts", {})
  db.table("orders", {})
  db.table("products", {})
  db.table("email_sending_domains", { unique: [["creator_id"], ["domain"]], defaults: () => ({ id: uid(), status: "pending", records: [], last_checked_at: null, verified_at: null, last_error: null }) })
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
    buyerEmail: "ann@x.co",
    buyerName: "Ann Buyer",
    buyerPhone: null,
    itemsSubtotalCents: 5000,
    discountCents: 0,
    shippingCents: 500,
    shippingDiscountCents: 0,
    taxCents: 0,
    totalCents: 5500,
    refundedCents: 0,
    couponCode: null,
    address: null,
    delivery: { name: "Standard" },
    deliveryMethod: "ship",
    receiptToken: "rt_1",
    paidAt: "2026-10-29T09:00:00.000Z",
    createdAt: "2026-10-29T08:55:00.000Z",
    cancelledAt: null,
    lines: [{ orderId: "44444444-4444-4444-8444-444444444441", productId: "p-tee", variantId: null, title: "Tee", variantName: null, sku: "TEE", imageUrl: null, type: "physical", quantity: 1, unitCents: 5000, discountCents: 0 }],
    shipments: [],
    ...over,
  }
}
const deps = (order: any = physicalOrder()): MarketingDeps => ({ loadOrder: (async () => order) as any, orderUrl: async () => "https://shop.example/o/rt_1", now: () => NOW })
const job = (db: FakeSupabase, provider: string, op: string, extra: Record<string, unknown> = {}, d: MarketingDeps = deps()) => runMarketingJob(db, { op, provider, creatorId: CREATOR, ...extra }, d)
const ALL = () => [brevo, mailerlite, kit, mailgun]

async function seed(db: FakeSupabase) {
  db.tables.subscribers.push(
    sub("ann@x.co", "subscribed", "2026-10-29T09:59:00.000Z", { subscribed_at: "2026-10-29T09:59:00.000Z", consent_timestamp: "2026-10-29T09:59:00.000Z" }),
    sub("cus@x.co", "customer", "2026-10-29T09:59:10.000Z"),
    sub("gone@x.co", "unsubscribed", "2026-10-29T09:59:20.000Z", { unsubscribed_at: "2026-10-29T09:59:20.000Z" }),
    sub("left@x.co", "subscribed", "2026-10-29T09:59:30.000Z"),
  )
  db.tables.commerce_checkouts.push({ id: CHECKOUT, creator_id: CREATOR, receipt_token: "rt_1", cancel_reason: null, email_opt_in: true, buyer_email: "ann@x.co", status: "paid" })
}

const CONNECT: Record<string, Record<string, unknown>> = {
  brevo: { step: "connect", apiKey: BREVO_KEY, listId: "7", backfill: true },
  mailerlite: { step: "connect", apiKey: ML_KEY, listId: "111", backfill: true },
  kit: { step: "connect", apiKey: KIT_KEY, listId: "new", backfill: true },
}

async function main() {
  console.log("\n1. The key is checked with the platform before anything is kept\n")
  {
    const db = freshDb()
    reset(ALL())
    const b = await saveMarketing(db, CREATOR, "brevo", { step: "check", apiKey: BREVO_KEY }, NOW)
    const acc = calls.find((c) => c.path === "/v3/account")
    check("Brevo: GET /v3/account with the api-key header, then its lists; nothing saved", b.ok && (b as any).account === "Ana Studio" && (b as any).lists.map((l: any) => l.id).join() === "2,7" && acc?.headers["api-key"] === BREVO_KEY && db.rows("commerce_integrations").length === 0, b)
    const bBad = await saveMarketing(db, CREATOR, "brevo", { step: "check", apiKey: "xkeysib-wrong0123456789abcdef0123456789" }, NOW)
    check("  a key Brevo refuses: not accepted, said in words", !bBad.ok && /did not accept that key/.test((bBad as any).error), bBad)
    const smtp = await saveMarketing(db, CREATOR, "brevo", { step: "check", apiKey: "xsmtpsib-0123456789abcdef0123456789" }, NOW)
    check("  an SMTP key is named for what it is, before any call", !smtp.ok && /SMTP key/.test((smtp as any).error))

    reset(ALL())
    const m = await saveMarketing(db, CREATOR, "mailerlite", { step: "check", apiKey: ML_KEY }, NOW)
    check("MailerLite: GET /api/groups with Bearer token; its groups come back", m.ok && (m as any).lists[0].name === "Newsletter" && calls[0].headers.authorization === `Bearer ${ML_KEY}`, m)
    const classic = await saveMarketing(db, CREATOR, "mailerlite", { step: "check", apiKey: "0123456789abcdef0123456789abcdef" }, NOW)
    check("  a MailerLite Classic key is refused with what to use", !classic.ok && /Classic/.test((classic as any).error))
    const mBad = await saveMarketing(db, CREATOR, "mailerlite", { step: "check", apiKey: "eyJbad.eyJbad0123456789012345678901234567890.sig" }, NOW)
    check("  a token MailerLite refuses is not accepted", !mBad.ok && /did not accept/.test((mBad as any).error), mBad)

    reset(ALL())
    const k = await saveMarketing(db, CREATOR, "kit", { step: "check", apiKey: KIT_KEY }, NOW)
    check("Kit: GET /v4/account with X-Kit-Api-Key, then its tags", k.ok && (k as any).account === "Ana Kit" && (k as any).lists[0].name === "Newsletter" && calls[0].headers["x-kit-api-key"] === KIT_KEY, k)
    const kBad = await saveMarketing(db, CREATOR, "kit", { step: "check", apiKey: "kit_wrong0123456789abcdefABC" }, NOW)
    check("  a key Kit refuses is not accepted (Kit's errors are an array of words)", !kBad.ok && /did not accept/.test((kBad as any).error), kBad)
  }

  console.log("\n2. Connect: sealed, a list chosen, groups or tags made, a webhook registered\n")
  {
    process.env.NEXT_PUBLIC_APP_URL = "https://storelib.com"
    const db = freshDb()
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      reset(ALL())
      const r = await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      const row = db.rows("commerce_integrations").find((x) => x.provider === p)!
      check(`${p}: connected, key sealed and never stored as typed`, r.ok && row?.status === "connected" && row.category === "marketing" && !row.secret_ciphertext.includes(String(CONNECT[p].apiKey)) && openSecret(row.secret_ciphertext) === CONNECT[p].apiKey, r)
      check(`  ${p}: a webhook registered with Storelib's address and a per store token (only its hash kept)`, Array.isArray(row.config.webhook?.ids) && row.config.webhook.ids.length > 0 && typeof row.config.webhook.token_hash === "string" && row.config.webhook.token_hash.length === 64, row.config.webhook)
      check(`  ${p}: the first sync is queued`, db.rows("commerce_jobs").some((j) => j.payload.provider === p && j.payload.op === "sync"))
    }
    const brevoHook = calls.length ? null : null
    void brevoHook
    const ml = db.rows("commerce_integrations").find((x) => x.provider === "mailerlite")!
    check("MailerLite: Storelib buyers and Storelib refunded groups made for order events", !!ml.config.setup?.buyer_id && !!ml.config.setup?.refunded_id && mlGroups.some((g) => g.name === "Storelib buyers"), ml.config.setup)
    check("  its webhook's signing secret is sealed, never kept as typed", typeof ml.config.webhook.secret_ciphertext === "string" && !ml.config.webhook.secret_ciphertext.includes("ml-webhook-secret") && openSecret(ml.config.webhook.secret_ciphertext) === "ml-webhook-secret")
    const k = db.rows("commerce_integrations").find((x) => x.provider === "kit")!
    check("Kit: \"A new one\" makes a Storelib subscribers tag, and buyer and refunded tags", k.config.list_name === "Storelib subscribers" && kitTags.some((t) => t.name === "Storelib buyer") && !!k.config.setup?.refunded_id, k.config)
    check("  Kit registers one hook per event, each address saying which", k.config.webhook.ids.length === 3)
    const views = await loadMarketing(db, CREATOR)
    check("the card's view: last four only, never a key, instant unsubscribes, MailerLite and Kit take no customers", views.length === 5 && !JSON.stringify(views).includes(BREVO_KEY) && !JSON.stringify(views).includes(KIT_KEY) && views.find((v) => v.provider === "kit")!.instantUnsubscribes && views.find((v) => v.provider === "mailerlite")!.takesCustomers === false && views.find((v) => v.provider === "brevo")!.takesCustomers === true, views.map((v) => [v.provider, v.keyHint, v.instantUnsubscribes]))
    const brevoNoList = await saveMarketing(freshDb(), CREATOR, "brevo", { step: "connect", apiKey: BREVO_KEY, listId: "999" }, NOW)
    check("Brevo needs one of the account's own lists", !brevoNoList.ok && /Choose the list/.test((brevoNoList as any).error))
  }

  console.log("\n3. Sync: consented subscribers pushed, customers only where they can be, unsubscribes sent\n")
  {
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      const db = freshDb()
      await seed(db)
      reset(ALL())
      await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      reset(ALL())
      await job(db, p, "sync")
      const sentText = JSON.stringify(calls.filter((c) => c.method !== "GET").map((c) => c.body))
      if (p === "brevo") {
        const one = calls.filter((c) => c.method === "POST" && (c.path === "/v3/contacts" || c.path === "/v3/contacts/import"))
        const onList = one.filter((c) => (c.body.listIds ?? []).includes(7)).flatMap((c) => (c.body.jsonBody ? c.body.jsonBody.map((x: any) => x.email) : [c.body.email]))
        check("Brevo: the yes go onto list 7 (POST /v3/contacts/import with jsonBody, or /contacts with updateEnabled)", onList.sort().join() === "ann@x.co,left@x.co", one.map((c) => c.body))
        const customer = one.find((c) => c.body.email === "cus@x.co")
        check("  the buyer who did not ask is a contact on no list", !!customer && !customer.body.listIds && customer.body.updateEnabled === true, customer?.body)
        const put = calls.find((c) => c.method === "PUT")
        check("  the unsubscribed: PUT /v3/contacts/{email}?identifierType=email_id with emailBlacklisted true", !!put && decodeURIComponent(put.path) === "/v3/contacts/gone@x.co" && put.query.get("identifierType") === "email_id" && put.body.emailBlacklisted === true, put)
      } else if (p === "mailerlite") {
        const bodies = calls.filter((c) => c.method === "POST" && (c.path === "/api/subscribers" || c.path === "/api/batch")).flatMap((c) => (c.path === "/api/batch" ? c.body.requests.map((r: any) => r.body) : [c.body]))
        const joined = bodies.filter((b) => b.groups?.includes("111")).map((b) => b.email)
        check("MailerLite: the yes join group 111 (POST /api/batch of /api/subscribers)", joined.sort().join() === "ann@x.co,left@x.co", bodies)
        check("  the past ones keep when they said yes (subscribed_at), no status sent so someone who left stays left", bodies.filter((b) => b.groups).every((b) => typeof b.subscribed_at === "string" && !b.status))
        check("  the unsubscribed: status unsubscribed", bodies.some((b) => b.email === "gone@x.co" && b.status === "unsubscribed"))
        check("  the buyer who did not ask is never sent (everyone in MailerLite can be mailed)", !sentText.includes("cus@x.co"))
      } else {
        const made = calls.filter((c) => c.method === "POST" && c.path === "/v4/subscribers").map((c) => c.body.email_address)
        const tagged = calls.filter((c) => /^\/v4\/tags\/\d+\/subscribers$/.test(c.path)).map((c) => c.body.email_address)
        check("Kit: each yes upserted (POST /v4/subscribers) and tagged by email", made.sort().join() === "ann@x.co,left@x.co" && tagged.sort().join() === "ann@x.co,left@x.co", { made, tagged })
        check("  the buyer who did not ask is never sent", !sentText.includes("cus@x.co"))
        const unsub = calls.filter((c) => /unsubscribe$/.test(c.path))
        check("  an unsubscribe for someone Kit never had is nothing to do (looked up, not created)", unsub.length === 0 && calls.some((c) => c.method === "GET" && c.query.get("email_address") === "gone@x.co"))
      }
      reset(ALL())
      await job(db, p, "sync")
      const again = calls.filter((c) => c.method !== "GET")
      check(`  ${p}: a second sync sends nobody again (idempotent by email)`, again.length === 0, again.map((c) => `${c.method} ${c.path}`))
      check(`  ${p}: the record holds hashes, never an address`, db.rows("marketing_sync_items").every((r) => !String(r.item_key).includes("@")))
    }
  }

  console.log("\n4. Unsubscribes: Storelib to the platform, and back from it\n")
  {
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      const db = freshDb()
      await seed(db)
      reset(ALL())
      await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      reset(ALL())
      await job(db, p, "sync")
      /* Ann unsubscribes on Storelib. */
      Object.assign(db.rows("subscribers").find((s) => s.email === "ann@x.co")!, { status: "unsubscribed", is_active: false, updated_at: "2026-10-29T10:00:01.000Z" })
      reset(ALL())
      await job(db, p, "sync")
      const ok =
        p === "brevo"
          ? calls.some((c) => c.method === "PUT" && decodeURIComponent(c.path) === "/v3/contacts/ann@x.co" && c.body.emailBlacklisted === true)
          : p === "mailerlite"
            ? calls.some((c) => c.method === "POST" && c.path.startsWith("/api/") && JSON.stringify(c.body).includes('"email":"ann@x.co","status":"unsubscribed"'))
            : calls.some((c) => c.method === "POST" && /^\/v4\/subscribers\/\d+\/unsubscribe$/.test(c.path))
      check(`${p}: an unsubscribe on Storelib reaches it on the next sync`, ok, calls.map((c) => `${c.method} ${c.path}`))
    }

    /* Back: read on a sync. */
    const db = freshDb()
    await seed(db)
    brevoBlocked.push({ email: "left@x.co", modifiedAt: "2026-10-29T09:59:50.000Z" })
    reset(ALL())
    await saveMarketing(db, CREATOR, "brevo", CONNECT.brevo, NOW)
    reset(ALL())
    await job(db, "brevo", "sync")
    const pull = calls.find((c) => c.method === "GET" && c.path === "/v3/contacts")
    check("Brevo: GET /v3/contacts?modifiedSince, the blocklisted ones read back", !!pull && pull.query.has("modifiedSince") && pull.query.get("limit") === "1000")
    check("  someone blocklisted in Brevo is unsubscribed on Storelib, and not pushed back onto the list", db.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "unsubscribed" && !calls.some((c) => c.method === "POST" && JSON.stringify(c.body ?? "").includes("left@x.co")))
    brevoBlocked.length = 0

    const db2 = freshDb()
    await seed(db2)
    mlUnsubscribed.push({ email: "left@x.co", unsubscribed_at: "2026-10-29 09:59:50" })
    reset(ALL())
    await saveMarketing(db2, CREATOR, "mailerlite", CONNECT.mailerlite, NOW)
    reset(ALL())
    await job(db2, "mailerlite", "sync")
    check("MailerLite: GET /api/subscribers?filter[status]=unsubscribed, the unsubscribed read back", calls.some((c) => c.query.get("filter[status]") === "unsubscribed") && db2.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "unsubscribed")
    check("  its times read as UTC", mlDate("2026-10-29 09:59:50") === "2026-10-29T09:59:50.000Z" && mlDate("") === null)
    mlUnsubscribed.length = 0

    const db3 = freshDb()
    await seed(db3)
    kitPeople.clear()
    kitPeople.set("left@x.co", { id: 77, state: "cancelled" })
    reset(ALL())
    await saveMarketing(db3, CREATOR, "kit", CONNECT.kit, NOW)
    reset(ALL())
    await job(db3, "kit", "sync")
    const kpull = calls.find((c) => c.method === "GET" && c.path === "/v4/subscribers" && c.query.get("status") === "all")
    check("Kit: GET /v4/subscribers?status=all&updated_after, a cancelled one is unsubscribed on Storelib", !!kpull && kpull.query.has("updated_after") && db3.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "unsubscribed")
  }

  console.log("\n5. The webhook: an unsubscribe there reaches Storelib at once\n")
  {
    const db = freshDb()
    await seed(db)
    /* The token is only in the address Storelib gave the platform: read it back from the registration call. */
    const tokens: Record<string, string> = {}
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      reset(ALL())
      await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      const reg = calls.find((c) => c.method === "POST" && /\/webhooks$/.test(c.path))!
      const url = new URL(reg.body.url ?? reg.body.target_url)
      tokens[p] = url.searchParams.get("token") ?? ""
      check(`${p}: the hook's address is Storelib's webhook route for this store`, url.origin === "https://storelib.com" && url.pathname === `/api/webhooks/marketing/${p}` && url.searchParams.get("store") === CREATOR && tokens[p].length >= 30, reg.body)
    }
    check("the address is built the same way it is read", marketingWebhookUrl("kit", CREATOR, "tok", "https://storelib.com") === `https://storelib.com/api/webhooks/marketing/kit?store=${CREATOR}&token=tok`)

    const wrong = await receiveMarketingWebhook(db, { provider: "brevo", creatorId: CREATOR, token: "guess", raw: JSON.stringify({ event: "unsubscribe", email: "ann@x.co" }), signature: null }, NOW)
    check("a wrong token is a 404 and changes nothing", wrong.status === 404 && db.rows("subscribers").find((s) => s.email === "ann@x.co")!.status === "subscribed")
    const b = await receiveMarketingWebhook(db, { provider: "brevo", creatorId: CREATOR, token: tokens.brevo, raw: JSON.stringify({ event: "unsubscribe", email: "Ann@X.co", date_event: "2026-10-29 10:00:00" }), signature: null }, NOW)
    check("Brevo: { event: unsubscribe, email } unsubscribes them on Storelib", b.status === 200 && db.rows("subscribers").find((s) => s.email === "ann@x.co")!.status === "unsubscribed", b)

    const mlBody = JSON.stringify({ events: [{ type: "subscriber.spam_reported", data: { email: "left@x.co", status: "junk" } }] })
    const unsigned = await receiveMarketingWebhook(db, { provider: "mailerlite", creatorId: CREATOR, token: tokens.mailerlite, raw: mlBody, signature: "nope" }, NOW)
    check("MailerLite: a delivery without its signature is refused", unsigned.status === 401 && db.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "subscribed")
    const sig = createHmac("sha256", "ml-webhook-secret").update(mlBody).digest("hex")
    const signed = await receiveMarketingWebhook(db, { provider: "mailerlite", creatorId: CREATOR, token: tokens.mailerlite, raw: mlBody, signature: sig }, NOW)
    check("  signed with its secret: a spam report marks them complained", signed.status === 200 && db.rows("subscribers").find((s) => s.email === "left@x.co")!.status === "complained" && mailerliteSignatureOk("ml-webhook-secret", mlBody, sig))

    db.tables.subscribers.push(sub("kat@x.co", "subscribed", "2026-10-29T09:59:40.000Z"))
    const k = await receiveMarketingWebhook(db, { provider: "kit", creatorId: CREATOR, token: tokens.kit, raw: JSON.stringify({ subscriber: { id: 1, email_address: "kat@x.co" } }), signature: null, kind: "unsubscribe" }, NOW)
    check("Kit: { subscriber } on the unsubscribe hook unsubscribes them", k.status === 200 && db.rows("subscribers").find((s) => s.email === "kat@x.co")!.status === "unsubscribed")
    check("  written down as pulled, so the next sync does not send them back", db.rows("marketing_sync_items").some((r) => r.provider === "kit" && r.state === "pulled"))
    const src = read("app/api/webhooks/marketing/[provider]/route.ts")
    check("the route caps the body, is rate limited and never logs it", /MAX_BYTES/.test(src) && /rateLimit\(/.test(src) && !/console\.(log|info)\(/.test(src))
  }

  console.log("\n6. Order events: Brevo events, MailerLite groups, Kit tags\n")
  {
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      const db = freshDb()
      await seed(db)
      kitPeople.clear()
      reset(ALL())
      await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      reset(ALL())
      /* The order's event before the sync has sent Ann (she ticked the news box at checkout). */
      await job(db, p, "event", { orderRef: CHECKOUT, event: "placed" })
      if (p === "brevo") {
        const ev = calls.find((c) => c.path === "/v3/events")
        check("Brevo: POST /v3/events order_placed with identifiers.email_id and the order's facts", !!ev && ev.body.event_name === "order_placed" && ev.body.identifiers.email_id === "ann@x.co" && ev.body.event_properties.total === 55 && ev.body.event_properties.currency === "USD" && ev.body.event_properties.items[0].name === "Tee", ev?.body)
      } else if (p === "mailerlite") {
        const setup = db.rows("commerce_integrations").find((x) => x.provider === p)!.config.setup
        check("MailerLite: a subscriber who buys joins Storelib buyers (sent first, as she said yes at checkout)", calls.some((c) => c.path === "/api/subscribers" && c.body.email === "ann@x.co" && c.body.groups?.includes(setup.buyer_id)), calls.map((c) => c.body))
      } else {
        const setup = db.rows("commerce_integrations").find((x) => x.provider === p)!.config.setup
        check("Kit: a subscriber who buys gets the Storelib buyer tag", calls.some((c) => c.path === `/v4/tags/${setup.buyer_id}/subscribers` && c.body.email_address === "ann@x.co"))
      }
      reset(ALL())
      await job(db, p, "event", { orderRef: CHECKOUT, event: "placed" })
      check(`  ${p}: the same event again sends nothing`, calls.filter((c) => c.method === "POST").length === 0)
      reset(ALL())
      await job(db, p, "event", { orderRef: CHECKOUT, event: "refunded" }, deps(physicalOrder({ status: "refunded", refundedCents: 5500 })))
      const refundOk = p === "brevo" ? calls.some((c) => c.body?.event_name === "order_refunded" && c.body.event_properties.refunded === 55) : calls.some((c) => c.method === "POST")
      check(`  ${p}: a refund is sent (${p === "brevo" ? "order_refunded" : p === "mailerlite" ? "Storelib refunded group" : "Storelib refunded tag"})`, refundOk)
    }
    /* A buyer who did not ask: MailerLite and Kit get nothing. */
    const db = freshDb()
    await seed(db)
    db.tables.commerce_checkouts[0].email_opt_in = false
    reset(ALL())
    await saveMarketing(db, CREATOR, "kit", CONNECT.kit, NOW)
    reset(ALL())
    await job(db, "kit", "event", { orderRef: CHECKOUT, event: "placed" }, deps(physicalOrder({ buyerEmail: "cus@x.co" })))
    check("Kit: a buyer who never said yes is not made a subscriber by an order", calls.filter((c) => c.method === "POST").length === 0)
  }

  console.log("\n7. Busy or down: retried by the queue, nothing sent twice\n")
  {
    for (const p of ["brevo", "mailerlite", "kit"] as const) {
      const db = freshDb()
      await seed(db)
      kitPeople.clear()
      reset(ALL())
      await saveMarketing(db, CREATOR, p, CONNECT[p], NOW)
      let posts = 0
      const busy: Route = (c) => (c.method === "POST" && !/webhooks|tags$|groups$/.test(c.path) && ++posts === 2 ? { status: 429, body: { message: "Too many requests" }, headers: { "Retry-After": "9" } } : null)
      reset([busy, ...ALL()])
      let thrown: unknown = null
      await job(db, p, "sync").catch((e) => (thrown = e))
      check(`${p}: a 429 is thrown as worth retrying, with Retry-After`, thrown instanceof ProviderError && thrown.retry && thrown.status === 429 && thrown.retryAfterSeconds === 9, thrown)
      check(`  ${p}: the card says it is busy, in words`, /slow down/.test(db.rows("commerce_integrations").find((x) => x.provider === p)!.last_error ?? ""))
      reset(ALL())
      await job(db, p, "sync")
      /* Per endpoint: Kit's upsert and its tag are two calls for one person. */
      const byPath = new Map<string, string[]>()
      for (const c of calls.filter((x) => x.method === "POST")) byPath.set(c.path, [...(byPath.get(c.path) ?? []), ...(JSON.stringify(c.body).match(/[a-z]+@x\.co/g) ?? [])])
      check(`  ${p}: the retry sends what had not gone, and nobody twice`, [...byPath.values()].every((e) => e.length === new Set(e).size), [...byPath])
      reset([(c) => (c.method !== "GET" && !/webhooks/.test(c.path) ? { status: 503 } : null), ...ALL()])
      let down: unknown = null
      Object.assign(db.rows("subscribers").find((s) => s.email === "ann@x.co")!, { status: "unsubscribed", is_active: false, updated_at: "2026-10-29T10:00:02.000Z" })
      await job(db, p, "sync").catch((e) => (down = e))
      check(`  ${p}: down (5xx): retried`, down instanceof ProviderError && down.retry)
    }
    const jobsSrc = read("lib/physical/jobs-server.ts")
    check("the queue retries marketing_sync with backoff (lib/physical/jobs-server.ts)", /marketing_sync/.test(jobsSrc) && /backoffSeconds\(job\.attempts\)/.test(jobsSrc))
  }

  console.log("\n8. Disconnect: the key, the webhook and the record go\n")
  {
    const db = freshDb()
    reset(ALL())
    await saveMarketing(db, CREATOR, "brevo", CONNECT.brevo, NOW)
    reset(ALL())
    const r = await saveMarketing(db, CREATOR, "brevo", { disconnect: true }, NOW)
    check("disconnected: the webhook removed from Brevo, the row and its record gone", r.ok && calls.some((c) => c.method === "DELETE" && c.path === "/v3/webhooks/501") && db.rows("commerce_integrations").length === 0 && db.rows("marketing_sync_items").length === 0)
  }

  console.log("\n9. Every source reaches the platforms within the minute\n")
  {
    check("checkout, community joins and free claims: recordCheckoutContact syncs the platforms", /syncPlatformsSoon\(db, input\.creatorId\)/.test(read("lib/contacts/checkout-contact.ts")))
    for (const f of ["app/api/subscribe/route.ts", "app/api/subscribers/route.ts", "app/api/website-builder/subscribe/route.ts", "app/api/website-builder/contact/route.ts", "app/api/email/unsubscribe/route.ts"]) check(`  ${f}`, /await syncPlatformsSoon\(/.test(read(f)))
    check("  a OnePage signup already does (lib/onepage/integrations/deliver-server.ts)", /queueMarketingSignup/.test(read("lib/onepage/integrations/deliver-server.ts")))
  }

  console.log("\n10. The store's own sending domain, with Mailgun\n")
  {
    check("a domain is cleaned and checked: no inbox providers, no Storelib domains", (domainProblem("https://www.Mail.Shop.com/") as any).domain === "mail.shop.com" && "error" in domainProblem("gmail.com") && "error" in domainProblem("news.storelib.com") && "error" in domainProblem("not a domain"))
    check("the address before the @ is checked", (fromLocalProblem("Hello") as any).local === "hello" && "error" in fromLocalProblem("a b") && (fromLocalProblem("") as any).local === "hello")
    check("a root domain is told apart from a subdomain", isRootDomain("shop.com") && isRootDomain("shop.co.uk") && !isRootDomain("mail.shop.com"))
    check("From quotes a store name with a comma", ownFrom("Ana, Studio", "hello@mail.shop.com") === '"Ana, Studio" <hello@mail.shop.com>' && ownFrom("Ana", "a@b.co") === "Ana <a@b.co>")

    const db = freshDb()
    const dns: Record<string, string[][]> = {}
    const txt = async (name: string) => {
      if (dns[name]) return dns[name]
      throw Object.assign(new Error("not found"), { code: "ENOTFOUND" })
    }
    reset(ALL())
    const added = await addSendingDomain(db, CREATOR, { domain: "mail.shop.com", fromLocal: "hello" }, { txt, now: NOW })
    const post = calls.find((c) => c.path === "/v4/domains")
    check("Add: POST https://api.eu.mailgun.net/v4/domains with Storelib's own key (Basic api:<key>), name in the form", added.ok && post?.form?.get("name") === "mail.shop.com" && post.headers.authorization === `Basic ${Buffer.from("api:key-test-mailgun").toString("base64")}`, added)
    const view = (added as any).view.domain
    check("  the records to add: SPF, DKIM, tracking CNAME from Mailgun, and DMARC; no MX", view.records.map((r: any) => r.kind).join() === "spf,dkim,tracking,dmarc" && view.records[1].name === "pic._domainkey.mail.shop.com" && view.records[3].name === "_dmarc.mail.shop.com" && view.records[3].valid === false, view.records)
    check("  pending until verified; emails still go as Storelib's", view.status === "pending" && (await verifiedSender(db, CREATOR, NOW)) === null)
    const second = await addSendingDomain(freshDb(), "22222222-2222-4222-8222-222222222222", { domain: "mail.shop.com" }, { txt, now: NOW })
    check("another store asking for a domain already on Storelib's account is refused", !second.ok, second)

    reset(ALL())
    const notYet = await verifySendingDomain(db, CREATOR, { txt, now: NOW })
    check("Check DNS: PUT /v4/domains/{name}/verify; records not there yet say which", notYet.ok && calls.some((c) => c.method === "PUT" && c.path === "/v4/domains/mail.shop.com/verify") && /SPF, DKIM/.test((notYet as any).view.domain.lastError ?? ""), (notYet as any).view?.domain)

    mgDomains.set("mail.shop.com", { state: "active", spf: "valid", dkim: "valid" })
    dns["_dmarc.mail.shop.com"] = [["v=DMARC1; p=none;"]]
    forgetSender(CREATOR)
    reset(ALL())
    const ok = await verifySendingDomain(db, CREATOR, { txt, now: NOW })
    const v = (ok as any).view.domain
    check("  once Mailgun says active: verified, SPF and DKIM found, DMARC read from DNS", ok.ok && v.status === "verified" && v.records.filter((r: any) => r.kind !== "tracking").every((r: any) => r.valid === true) && !!v.verifiedAt, v)
    const own = await verifiedSender(db, CREATOR, NOW + 1)
    check("verifiedSender: the store's own address and domain", own?.address === "hello@mail.shop.com" && own.domain === "mail.shop.com")

    /* A message through it: sent to the domain's own messages endpoint, From on it. */
    const { sendMailgunOnce, sendingDomainOf } = await import("@/lib/mailgun")
    reset(ALL())
    const sent = await sendMailgunOnce({ to: "reader@example.com", subject: "Hi", html: "<p>Hi</p>", from: ownFrom("Ana", own!.address), sendingDomain: own!.domain })
    const msg = calls.find((c) => /\/messages$/.test(c.path))
    check("a send with the verified domain goes to /v3/mail.shop.com/messages, From hello@mail.shop.com", sent.success && msg?.path === "/v3/mail.shop.com/messages" && String(msg.body.get("from")) === "Ana <hello@mail.shop.com>", { path: msg?.path })
    check("  without one, Storelib's own domain, as before; junk is never a path", sendingDomainOf(undefined) === "mg.storelib.com" && sendingDomainOf("../x") === "mg.storelib.com")

    for (const [f, re] of [
      ["lib/email-campaigns/queue.ts", /verifiedSender\(db, creatorId\)[\s\S]*sendingDomain: own\?\.domain/],
      ["lib/automations/run.ts", /verifiedSender\(db, pending\.creatorId\)/],
      ["lib/notify/worker.ts", /ownSender: \(creatorId\) => verifiedSender\(db, creatorId\)/],
      ["lib/email.tsx", /ownSendingFor\(admin, creatorId, fromName\)/],
      ["app/api/email/send-test/route.ts", /sendingDomain: sender\.sendingDomain/],
    ] as const)
      check(`  used as From by ${f}`, re.test(read(f)))

    reset(ALL())
    const gone = await removeSendingDomain(db, CREATOR)
    check("Remove: off Storelib's Mailgun account (DELETE /v3/domains/{name}) and back to Storelib's address", gone.ok && calls.some((c) => c.method === "DELETE" && c.path === "/v3/domains/mail.shop.com") && (await loadSendingDomain(db, CREATOR)).domain === null && (await verifiedSender(db, CREATOR, NOW + 2)) === null)
    check("records parse from Mailgun's answer shape", recordsFromMailgun({ sending_dns_records: [{ record_type: "TXT", name: "a.co", value: "v=spf1 include:mailgun.org ~all", valid: "valid" }] })[0].valid === true)
  }

  console.log("\n11. The pages\n")
  {
    check("Integrations lists Brevo, MailerLite and Kit as connectable, never Coming soon", ["brevo", "mailerlite", "kit"].every((id) => { const i = INTEGRATIONS.find((x) => x.id === id); return !!i && i.appId === "marketing_sync" && i.marketingProvider === id && !i.comingSoon }))
    const tab = read("app/(storelib)/app/emails/emails-home.tsx")
    /* Changed on purpose (round 51): the platforms are Emails › Settings › Delivery; ?tab=platforms redirects there. */
    check("Emails › Settings draws the connected platforms", /\{ id: "platforms"/.test(tab) && /<ConnectedPlatforms /.test(tab) && /tab === "platforms"/.test(read("app/(storelib)/app/emails/emails-route.ts")))
    const ui = read("components/email/connected-platforms.tsx")
    check("  the panel shows no key, only what the server answers", !/apiKey|secret_ciphertext/.test(ui))
    check("SQL 341: the provider checks and email_sending_domains", /mailerlite/.test(read("supabase/sql/run-now/341_connected_email_platforms.sql")) && /email_sending_domains/.test(read("supabase/sql/run-now/341_connected_email_platforms.sql")) && /p341_connected_email_platforms/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  check("no real address was ever called", realHost.length === 0, realHost)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
