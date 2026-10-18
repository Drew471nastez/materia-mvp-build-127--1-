/**
 * ===========================================================================
 *  ROUND 27, EMAILS: THE WEBSITE, NOT THE CREATOR PAGE
 * ===========================================================================
 *   store link     lib/physical/store-link orderStoreUrl: the live website
 *                  the order was placed on (primary domain once active, else
 *                  the <name>.storelib.com address), the creator's website
 *                  when the order says nothing, "" with no live website;
 *                  never storelib.com, never storelib.com/<username>
 *   transactional  the seller's new order to fulfil (sent the real way,
 *                  lib/email.tsx sendSellerNotificationEmail) and every
 *                  seller email about one order: no Unsubscribe in the body,
 *                  no List-Unsubscribe header, Notification settings in the
 *                  footer. Marketing (the checkout reminder) keeps its own.
 *   thumbnails     each item's picture, sized through the image endpoint,
 *                  with alt text, a letter tile when one has none, no
 *                  pictures column when none has one: the new order email,
 *                  the seller's return and cancel emails, every buyer email,
 *                  the supplier's order
 *   per type       every buyer email for an order that ships, one the store
 *                  delivers itself, one picked up, and one with downloads in
 *                  it, sent through the job queue: the right words and steps
 *                  for that type, Visit our store and the logo on the live
 *                  website, nothing on storelib.com/<username>; with no
 *                  website, no store link at all
 *   creator page   no floating "View this site in ...?" card there; Show
 *                  visitors their own language chooses silently
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.MAILGUN_API_KEY = "key-test"
process.env.MAILGUN_DOMAIN = "storelib.com"

/* ── The network: Mailgun answers, every message is kept ───────────────── */
type Sent = { to: string; from: string; subject: string; html: string; text: string; headers: Record<string, string> }
const outbox: Sent[] = []
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.endsWith("/messages") && init?.body instanceof FormData) {
    const f = init.body
    const headers: Record<string, string> = {}
    for (const [k, v] of f.entries()) if (k.startsWith("h:")) headers[k.slice(2)] = String(v)
    outbox.push({ to: String(f.get("to")), from: String(f.get("from")), subject: String(f.get("subject")), html: String(f.get("html")), text: String(f.get("text")), headers })
    return new Response(JSON.stringify({ id: `<m${outbox.length}@storelib.com>`, message: "Queued" }), { status: 200 })
  }
  return new Response("{}", { status: 404 })
}) as typeof fetch

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}

/* ── A database in memory: equality filters, in(), limit, one row or many ── */
type Row = Record<string, any>
class FakeDb {
  tables: Record<string, Row[]> = {}
  seq = 1
  unique: Record<string, string> = { commerce_jobs: "idempotency_key", commerce_order_events: "idempotency_key" }
  rows(t: string) {
    return (this.tables[t] ??= [])
  }
  auth = { admin: { getUserById: async () => ({ data: { user: { email: "owner@andrew.test" } } }) } }
  from(table: string) {
    return new Query(this, table)
  }
  async rpc(name: string, args: Record<string, any>) {
    if (name !== "commerce_claim_jobs") return { data: null, error: { code: "42883" } }
    const now = Date.now()
    const due = this.rows("commerce_jobs").filter((j) => ["pending", "failed"].includes(j.status) && (!j.run_after || Date.parse(j.run_after) <= now)).slice(0, args.p_limit ?? 20)
    for (const j of due) {
      j.status = "running"
      j.attempts = (j.attempts ?? 0) + 1
      j.locked_until = new Date(now + (args.p_lease_seconds ?? 120) * 1000).toISOString()
    }
    return { data: due.map((j) => ({ ...j })), error: null }
  }
}
class Query {
  filters: ((r: Row) => boolean)[] = []
  op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
  payload: any = null
  max = Infinity
  wantOne = false
  constructor(private db: FakeDb, private table: string) {}
  select() {
    return this
  }
  eq(c: string, v: unknown) {
    this.filters.push((r) => r[c] === v)
    return this
  }
  neq(c: string, v: unknown) {
    this.filters.push((r) => r[c] !== v)
    return this
  }
  in(c: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[c]))
    return this
  }
  gt(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") > v)
    return this
  }
  gte(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") >= v)
    return this
  }
  lte(c: string, v: string) {
    this.filters.push((r) => String(r[c] ?? "") <= v)
    return this
  }
  is(c: string, v: unknown) {
    this.filters.push((r) => (r[c] ?? null) === v)
    return this
  }
  not() {
    return this
  }
  like() {
    return this
  }
  ilike() {
    return this
  }
  or() {
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.max = n
    return this
  }
  range() {
    return this
  }
  insert(p: any) {
    this.op = "insert"
    this.payload = p
    return this
  }
  update(p: any) {
    this.op = "update"
    this.payload = p
    return this
  }
  upsert(p: any) {
    this.op = "upsert"
    this.payload = p
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  maybeSingle() {
    this.wantOne = true
    return this.run()
  }
  single() {
    this.wantOne = true
    return this.run()
  }
  then(res: (v: any) => any, rej?: (e: any) => any) {
    return this.run().then(res, rej)
  }
  private async run(): Promise<{ data: any; error: any }> {
    const rows = this.db.rows(this.table)
    const match = (r: Row) => this.filters.every((f) => f(r))
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({ id: r.id ?? this.db.seq++, status: "pending", attempts: 0, max_attempts: 5, created_at: new Date().toISOString(), ...r }))
      const key = this.db.unique[this.table]
      for (const r of list as Row[]) if (key && r[key] && rows.some((x) => x[key] === r[key])) return { data: null, error: { code: "23505" } }
      rows.push(...list)
      return { data: this.wantOne ? list[0] : list, error: null }
    }
    if (this.op === "update") {
      const hit = rows.filter(match)
      for (const r of hit) Object.assign(r, this.payload)
      return { data: hit.map((r) => ({ id: r.id })), error: null }
    }
    if (this.op === "upsert") {
      rows.push({ ...(this.payload as Row) })
      return { data: null, error: null }
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !match(r))
      return { data: null, error: null }
    }
    const found = rows.filter(match).slice(0, this.max)
    return { data: this.wantOne ? found[0] ?? null : found, error: null }
  }
}

const CREATOR = "c0000000-0000-4000-8000-000000000027"

/** A creator "andrewrullz" with a published website and, on request, domains. */
function siteDb(opts: { published?: boolean; domains?: Row[]; banned?: boolean; handle?: string } = {}): FakeDb {
  const db = new FakeDb()
  db.tables.creators = [{ id: CREATOR, user_id: "u27", slug: "andrewrullz", username: "andrewrullz", banned_at: opts.banned ? "2026-10-01T00:00:00Z" : null }]
  db.tables.profiles = [{ id: "u27", username: "andrewrullz" }]
  db.tables.store_theme_installs = opts.published === false ? [] : [{ id: "i27", creator_id: CREATOR, status: "published" }]
  db.tables.custom_domains = (opts.domains ?? []).map((d) => ({ creator_id: CREATOR, created_at: "2026-09-01T00:00:00Z", ...d }))
  db.tables.website_addresses = opts.handle ? [{ creator_id: CREATOR, handle: opts.handle }] : []
  db.tables.website_address_history = []
  db.tables.site_deployments = []
  return db
}

async function storeLink() {
  const { orderStoreUrl, storeHostCandidates, storeLinkOf, isPlatformHost } = await import("@/lib/physical/store-link")
  console.log("\nStore link: the live website the order was placed on\n")

  /* The pure half. */
  const c = storeHostCandidates({ primary: "www.andrew.ro", placed: "andrewrullz.storelib.com", hosts: ["andrewrullz.storelib.com", "andrew.ro", "www.andrew.ro", "storelib.com"], mainDomain: "storelib.com" })
  check("candidates: primary domain first, then other domains, then the subdomain the order was placed on; each once", JSON.stringify(c) === JSON.stringify(["www.andrew.ro", "andrew.ro", "andrewrullz.storelib.com"]), c)
  const placedCustom = storeHostCandidates({ primary: null, placed: "shop.andrew.ro", hosts: ["andrewrullz.storelib.com", "andrew.ro"], mainDomain: "storelib.com" })
  check("candidates: a custom domain the order was placed on comes before the creator's other addresses", placedCustom[0] === "shop.andrew.ro" && placedCustom.at(-1) === "andrewrullz.storelib.com", placedCustom)
  check("candidates: storelib.com and www.storelib.com are never one (only the creator page answers there)", storeHostCandidates({ placed: "storelib.com", hosts: ["www.storelib.com"], mainDomain: "storelib.com" }).length === 0)
  check("candidates: junk is dropped", storeHostCandidates({ placed: "javascript:alert(1)", hosts: ["", "a b.com", "x"], mainDomain: "storelib.com" }).length === 0)
  check("isPlatformHost: storelib.com yes, andrewrullz.storelib.com no", isPlatformHost("storelib.com", "storelib.com") && isPlatformHost("WWW.storelib.com:443", "storelib.com") && !isPlatformHost("andrewrullz.storelib.com", "storelib.com"))
  check("link: the origin alone for the home page", storeLinkOf("https://andrewrullz.storelib.com", null, "storelib.com") === "https://andrewrullz.storelib.com")
  check("link: a path is joined", storeLinkOf("https://www.andrew.ro", "/products/mug", "storelib.com") === "https://www.andrew.ro/products/mug")
  check("link: a protocol relative or full URL as path is not followed", storeLinkOf("https://www.andrew.ro", "//evil.com", "storelib.com") === "https://www.andrew.ro" && storeLinkOf("https://www.andrew.ro", "https://evil.com", "storelib.com") === "https://www.andrew.ro")
  check("link: storelib.com (the creator page's host) is never a store link", storeLinkOf("https://storelib.com", "/andrewrullz", "storelib.com") === "")
  check("link: not http(s) is nothing", storeLinkOf("javascript:alert(1)", null, "storelib.com") === "" && storeLinkOf(null, null, "storelib.com") === "")

  /* The database half. */
  const sub = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb() })
  check("placed on andrewrullz.storelib.com, no domain: https://andrewrullz.storelib.com", sub === "https://andrewrullz.storelib.com", sub)
  const none = await orderStoreUrl({ creator_id: CREATOR, origin: null }, { db: siteDb() })
  check("an order that does not say where (storelib.com checkout): the creator's website all the same", none === "https://andrewrullz.storelib.com", none)
  const own = await orderStoreUrl({ creatorId: CREATOR }, { db: siteDb({ handle: "andrew-shop" }) })
  check("a website with a name of its own answers at that name, not the username", own === "https://andrew-shop.storelib.com", own)
  const c2 = storeHostCandidates({ placed: "andrewrullz.storelib.com", handle: "andrew-shop", hosts: ["andrewrullz.storelib.com", "andrew-shop.storelib.com"], mainDomain: "storelib.com" })
  check("candidates: the subdomain the order was placed on, then the website's own name, then the rest", JSON.stringify(c2) === JSON.stringify(["andrewrullz.storelib.com", "andrew-shop.storelib.com"]), c2)
  const primary = await orderStoreUrl(
    { creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } },
    { db: siteDb({ domains: [{ domain: "andrew.ro", status: "active", purpose: "website", is_primary: true }] }) },
  )
  check("with an active primary website domain: the domain at the host it is served at (www for an apex)", primary === "https://www.andrew.ro", primary)
  const verifying = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb({ domains: [{ domain: "andrew.ro", status: "verifying", purpose: "website", is_primary: true }] }) })
  check("a domain still being verified is not used: the subdomain", verifying === "https://andrewrullz.storelib.com", verifying)
  const pageDomain = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb({ domains: [{ domain: "andrew.page", status: "active", purpose: "creator_page", is_primary: true }] }) })
  check("a creator page domain is not the website: the subdomain", pageDomain === "https://andrewrullz.storelib.com", pageDomain)
  const path = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb(), path: "/products/mug" })
  check("a path on the website", path === "https://andrewrullz.storelib.com/products/mug", path)
  const unpublished = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "andrewrullz.storelib.com" } }, { db: siteDb({ published: false }) })
  check("no published website: empty (the link is left out), never the creator page", unpublished === "", unpublished)
  const banned = await orderStoreUrl({ creator_id: CREATOR }, { db: siteDb({ banned: true }) })
  check("a banned store: empty", banned === "", banned)
  const foreign = await orderStoreUrl({ creator_id: CREATOR, origin: { surface: "website", site: "someone-else.com" } }, { db: siteDb() })
  check("an origin naming a host that is not this creator's is not followed", foreign === "https://andrewrullz.storelib.com", foreign)
  check("no creator: empty", (await orderStoreUrl({}, { db: siteDb() })) === "")
  const broken = { from: () => { throw new Error("down") } }
  check("a database that throws: empty, no throw", (await orderStoreUrl({ creator_id: CREATOR }, { db: broken })) === "")
}


/* ── An order in each fulfilment type ─────────────────────────────────── */
const CHECKOUT = "a1b2c3d4-0000-4000-8000-000000000027"
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz0123456"
const PIC = "https://abcdefgh.supabase.co/storage/v1/object/public/products/mug.jpg"
type Kind = "ship" | "local" | "pickup" | "mixed"

function lineOf(over: Row = {}): Row {
  return { title: "Ceramic mug", variant_name: "Sage", quantity: 2, unit_cents: 1800, discount_cents: 0, type: "physical", requires_shipping: true, location_id: null, fulfillment_method: "self", image_url: PIC, product_id: "p1", ...over }
}

/** The store of siteDb, with one paid order of this kind, its shipment, a return, and a supplier. */
function orderDb(kind: Kind, site: { published?: boolean } = {}): FakeDb {
  const db = siteDb(site)
  db.tables.store_settings = [{ creator_id: CREATOR, store_name: "Andrew Rullz", phone: "+40 721 000 000", logo_url: "https://cdn.andrew.test/logo.png", contact_email: "hello@andrew.test", customer_emails: {} }]
  const lines = [lineOf(), lineOf({ title: "Linen apron", variant_name: null, quantity: 1, unit_cents: 4200, image_url: null, product_id: "p2" })]
  if (kind === "mixed") lines.push(lineOf({ title: "Glaze guide (PDF)", variant_name: null, quantity: 1, unit_cents: 900, type: "digital", requires_shipping: false, image_url: PIC, product_id: "p3" }))
  const rate =
    kind === "local"
      ? { kind: "local", name: "Local delivery", local_note: "We deliver on Fridays", tax_included: false }
      : kind === "pickup"
        ? null
        : { name: "Standard", min_days: 3, max_days: 5, tax_included: false }
  const subtotal = lines.reduce((n, l) => n + l.unit_cents * l.quantity, 0)
  db.tables.commerce_checkouts = [
    {
      id: CHECKOUT,
      creator_id: CREATOR,
      status: "paid",
      buyer_email: "maria@example.com",
      buyer_name: "Maria Popescu",
      currency: "EUR",
      items_subtotal_cents: subtotal,
      discount_cents: 0,
      shipping_cents: kind === "pickup" ? 0 : 500,
      shipping_discount_cents: 0,
      tax_cents: 0,
      total_cents: subtotal + (kind === "pickup" ? 0 : 500),
      refunded_cents: 0,
      shipping_address: kind === "pickup" ? null : { name: "Maria Popescu", line1: "Strada Lipscani 12", city: "Bucharest", postalCode: "030031", country: "RO", phone: "+40 700 111 222" },
      shipping_rate: rate,
      delivery_method: kind === "pickup" ? "pickup" : "ship",
      pickup: kind === "pickup" ? { name: "Studio", address: ["Strada Lipscani 12", "Bucharest"], ready: "same_day", instructions: "Ring twice.", hours: "Mon to Fri 10:00 to 18:00" } : null,
      lines,
      receipt_token: TOKEN,
      buyer_note: null,
      cancel_reason: "Out of stock",
      paid_at: "2026-10-10T09:30:00Z",
      created_at: "2026-10-10T09:00:00Z",
      origin: { surface: "website", site: "andrewrullz.storelib.com" },
    },
  ]
  db.tables.orders = lines.map((l, i) => ({ id: `o${i + 1}`, checkout_id: CHECKOUT, product_id: l.product_id, payment_method: "card", card_brand: "visa", card_last4: "4242", product_snapshot: { title: l.title, variant_name: l.variant_name, image_url: l.image_url }, created_at: `2026-10-10T09:30:0${i}Z` }))
  db.tables.fulfillments = [{ id: "f1", checkout_id: CHECKOUT, carrier: kind === "local" ? null : "DHL", tracking_number: kind === "local" ? null : "JD0146000062", tracking_url: null, notify_buyer: true, status: "shipped", fulfillment_items: [{ quantity: 3 }] }]
  db.tables.fulfillment_items = [
    { fulfillment_id: "f1", order_id: "o1", quantity: 2 },
    { fulfillment_id: "f1", order_id: "o2", quantity: 1 },
  ]
  db.tables.commerce_returns = [{ id: "r1", checkout_id: CHECKOUT, creator_id: CREATOR, status: "requested", merchant_note: null, refunded_cents: 3600, reason: "damaged", reason_label: "Arrived damaged", customer_note: "The handle broke", created_at: "2026-10-12T00:00:00Z" }]
  db.tables.commerce_return_items = [{ return_id: "r1", order_id: "o1", quantity: 1 }]
  db.tables.commerce_settings = [{ creator_id: CREATOR, default_location_id: "l1", low_stock_alerts: true }]
  db.tables.inventory_locations = [{ id: "l1", creator_id: CREATOR, name: "Studio", kind: "warehouse", address_line1: "Strada Lipscani 12", city: "Bucharest", postal_code: "030031", country: "RO", active: true }]
  return db
}

/** Where every sent email's HTML goes for the screenshot probe (scripts/check-emails27.mjs), when asked. */
const DUMP = process.env.EMAILS27_DUMP || ""
async function dump(name: string, html: string) {
  if (!DUMP) return
  const { mkdirSync, writeFileSync } = await import("node:fs")
  mkdirSync(DUMP, { recursive: true })
  writeFileSync(join(DUMP, `${name}.html`), html)
}

/** Every href in an email. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"))
/** A link to a creator page: storelib.com/<name>, the platform's root, or www. */
const creatorPageLink = (h: string) => /^https?:\/\/(www\.)?storelib\.com(\/(?!checkout\/|api\/|app\/|order-help\/|receipt|review\/)[^?#]*)?([?#].*)?$/.test(h)

async function transactional() {
  const { sendSellerNotificationEmail } = await import("@/lib/email")
  const { runJobs } = await import("@/lib/physical/jobs-server")
  const { addOrderEvent } = await import("@/lib/physical/events-server")
  const { renderEmail } = await import("@/lib/notify/templates")
  const { checkoutReminderEmail } = await import("@/lib/physical/email-templates")
  console.log("\nTransactional email has no Unsubscribe; marketing keeps it\n")

  /* The new order to fulfil, sent the real way. */
  const db = orderDb("ship")
  db.tables.profiles[0].email = "andrew@andrew.test"
  db.tables.products = [
    { id: "p1", title: "Ceramic mug", thumbnail_url: PIC, creator_id: CREATOR },
    { id: "p2", title: "Linen apron", thumbnail_url: null, creator_id: CREATOR },
  ]
  /* Changed on purpose (currency round AN): the orders say the currency they were paid in, as every real order does; one without it now holds its sale email. */
  db.tables.orders = db.tables.orders.map((o: Row, i: number) => ({ ...o, creator_id: CREATOR, amount_cents: i === 0 ? 4100 : 4200, buyer_email: "maria@example.com", buyer_first_name: "Maria", buyer_last_name: "Popescu", stripe_session_id: "cs_27", status: "paid", fee_cents: 100, currency: "usd" }))
  const n0 = outbox.length
  const res = await sendSellerNotificationEmail(db as any, { orderId: "o1", creatorId: CREATOR, sellerEmail: "andrew@andrew.test", productTitle: "Ceramic mug", buyerFirstName: "Maria", buyerLastName: "Popescu", buyerEmail: "maria@example.com", amountCents: 8300, feeCents: 200, baseUrl: "https://storelib.com" })
  const sale = outbox[n0]
  check("the new order to fulfil was sent", res.success === true && !!sale && /New order .*to fulfil/.test(sale.subject), { res, subject: sale?.subject })
  if (sale) {
    await dump("seller-new-order", sale.html)
    check("  no Unsubscribe in it, nor a List-Unsubscribe header", !/unsubscribe/i.test(sale.html) && !/unsubscribe/i.test(sale.text) && !Object.keys(sale.headers).some((k) => /unsubscribe/i.test(k)), Object.keys(sale.headers))
    check("  Notification settings in the footer, where order emails are turned off", /Notification settings/.test(sale.html) && sale.text.includes("Notification settings: https://storelib.com/app/settings"))
    const thumbs = [...sale.html.matchAll(/<img class="e-thumb" src="([^"]+)" alt="([^"]*)" width="56" height="56"/g)]
    check("  the mug's picture beside its line, sized through the image endpoint at 3x, with its name as alt", thumbs.length === 1 && thumbs[0][1].startsWith("https://storelib.com/api/email/img?u=") && thumbs[0][1].includes("&amp;w=192") && thumbs[0][2] === "Ceramic mug", thumbs.map((t) => t.slice(1)))
    check("  the picture goes by Storelib's own address, never the storage host", !/supabase\.co/.test(sale.html) && sale.html.includes("u=https%3A%2F%2Fstorelib.com%2Fmedia%2Fproducts%2Fmug.jpg"))
    check("  the apron, with no picture, gets a letter tile, never a broken image", /Linen apron/.test(sale.html) && (sale.html.match(/<img\b/g) ?? []).length === 2)
  }

  /* The same email for each fulfilment type: its heading, its to-do and its button. */
  for (const kind of ["local", "pickup", "mixed"] as Kind[]) {
    const kdb = orderDb(kind)
    kdb.tables.products = db.tables.products.concat([{ id: "p3", title: "Glaze guide (PDF)", thumbnail_url: PIC, creator_id: CREATOR }])
    kdb.tables.orders = kdb.tables.orders.map((o: Row, i: number) => ({ ...o, creator_id: CREATOR, amount_cents: 1000, currency: "eur", buyer_email: "maria@example.com", buyer_first_name: "Maria", buyer_last_name: "Popescu", stripe_session_id: `cs_${kind}`, status: "paid", fee_cents: 50 }))
    const k0 = outbox.length
    await sendSellerNotificationEmail(kdb as any, { orderId: "o1", creatorId: CREATOR, sellerEmail: "andrew@andrew.test", productTitle: "Ceramic mug", buyerFirstName: "Maria", buyerLastName: "Popescu", buyerEmail: "maria@example.com", amountCents: 1000, feeCents: 50, baseUrl: "https://storelib.com" })
    const mail = outbox[k0]
    if (mail) await dump(`seller-new-order-${kind}`, mail.html)
    const ok =
      !!mail &&
      !/unsubscribe/i.test(mail.html) &&
      (kind === "pickup"
        ? /Pickup order to prepare/.test(mail.html) && /Collect at/.test(mail.html) && /Prepare order/.test(mail.html) && !/Ship to|Shipping/.test(mail.html)
        : kind === "local"
          ? /New order to fulfil/.test(mail.html) && /You deliver it \(local delivery\)/.test(mail.html) && /We deliver on Fridays/.test(mail.html) && /Fulfil order/.test(mail.html)
          : /New order to fulfil/.test(mail.html) && /Glaze guide/.test(mail.html) && /Download/.test(mail.html) && /You ship it/.test(mail.html))
    check(`the seller's new order email for ${kind}: its own heading, to-do and button, no Unsubscribe`, ok, mail?.subject)
  }

  /* A digital sale without pictures: no pictures column. */
  const plain = renderEmail("NEW_SALE", { orderId: "o9", productTitle: "Presets", amountCents: 900, currency: "usd", lines: [{ title: "Presets", amountCents: 900 }] }, { baseUrl: "https://storelib.com", preferencesUrl: "https://storelib.com/app/settings?tab=notifications" })
  check("a sale with no pictures draws no pictures column", !/<img class="e-thumb"/.test(plain.html) && (plain.html.match(/<img\b/g) ?? []).length === 1)
  const hostile = renderEmail("NEW_SALE", { orderId: "o9", productTitle: "Presets", amountCents: 900, currency: "usd", lines: [{ title: "Presets", amountCents: 900, imageUrl: "javascript:alert(1)" }, { title: "B", amountCents: 0, imageUrl: "http://plain.test/a.jpg" }] }, { baseUrl: "https://storelib.com" })
  check("a picture that is not https is never drawn", !/javascript:|http:\/\/plain\.test/.test(hostile.html))

  /* The seller's emails about one order, through the job queue. */
  const sdb = orderDb("ship")
  const n1 = outbox.length
  await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "return.requested", message: "Buyer asked to return 1 item", actor: "buyer", key: "return:r1" })
  await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "order.cancel_requested", message: "Buyer asked to cancel", actor: "buyer", key: "cancelreq:1", detail: { reason: "Ordered twice" } })
  await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "delivery.exception", message: "Address not found", actor: "webhook", key: "exception:f1", detail: { carrier: "DHL", trackingNumber: "JD0146000062" } })
  await runJobs(sdb as any, 20)
  const seller = outbox.slice(n1).filter((m) => m.to === "hello@andrew.test" || m.from.includes("Storelib"))
  check("return asked, cancel asked and a delivery problem each email the seller", seller.length === 3, seller.map((m) => m.subject))
  for (const m of seller) {
    const name = m.subject.startsWith("Return") ? "seller-return-requested" : m.subject.startsWith("Cancel") ? "seller-cancel-requested" : "seller-delivery-problem"
    await dump(name, m.html)
    check(`  ${name}: no Unsubscribe, no List-Unsubscribe; Notification settings in the footer`, !/unsubscribe/i.test(m.html + m.text) && !Object.keys(m.headers).some((k) => /unsubscribe/i.test(k)) && /Notification settings/.test(m.html))
    check(`  ${name}: the items with their pictures (a tile without one)`, /<img class="e-thumb" src="https:\/\/storelib\.com\/api\/email\/img\?u=/.test(m.html) && /Qty 1|Qty 2/.test(m.html), m.subject)
  }
  const ret = seller.find((m) => m.subject.startsWith("Return"))
  check("  the return lists only what is coming back, with its reason and the buyer's note", !!ret && /Items to return/.test(ret.html) && /Ceramic mug/.test(ret.html) && !/Linen apron/.test(ret.html) && /Arrived damaged/.test(ret.html) && /The handle broke/.test(ret.html))

  /* Marketing keeps its way out. */
  const rem = checkoutReminderEmail({ shopName: "Andrew Rullz", buyerFirstName: "Maria", lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: PIC }], checkoutUrl: "https://andrewrullz.storelib.com/checkout?x", unsubscribeUrl: "https://storelib.com/unsubscribe/t" })
  check("the checkout reminder (marketing) keeps its Unsubscribe link and header", /Unsubscribe<\/a>/.test(rem.html) && /"List-Unsubscribe": `<\$\{unsubscribeUrl\}>`/.test(read("lib/automations/abandoned-reminder.ts")))
  const nudge = renderEmail("FIRST_PRODUCT_REMINDER", {}, { baseUrl: "https://storelib.com", unsubscribeUrl: "https://storelib.com/api/notify/unsubscribe?t=a", preferencesUrl: "https://storelib.com/app/settings?tab=notifications" })
  check("a lifecycle nudge keeps Unsubscribe beside Notification settings", nudge.text.includes("Unsubscribe: https://storelib.com/api/notify/unsubscribe?t=a") && nudge.text.includes("Notification settings:"))
  const security = renderEmail("PASSWORD_CHANGED", {}, { baseUrl: "https://storelib.com", unsubscribeUrl: "https://storelib.com/u", preferencesUrl: "https://storelib.com/app/settings" })
  check("a security email still has neither link", !/Unsubscribe|Notification settings/.test(security.html))
  /* Required service mail (a welcome, a code) gets neither: the channel passes the settings link only with an optional email's Unsubscribe. */
  const { emailChannel } = await import("@/lib/notify/channels/email")
  const { entryFor } = await import("@/lib/notify/registry")
  const got: { html: string; headers?: Record<string, string> }[] = []
  const send = emailChannel({ provider: { send: async (m: any) => (got.push(m), { status: "sent" as const }) } as any, render: renderEmail, baseUrl: () => "https://storelib.com", unsubscribeUrl: () => "https://storelib.com/api/notify/unsubscribe?t=a", preferencesUrl: () => "https://storelib.com/app/settings?tab=notifications" })
  await send({ job: { id: "j1", data: {}, recipient_user_id: "u27" } as any, entry: entryFor("WELCOME_TO_STORELIB"), to: "a@b.co", recipientName: "Ana", deliveryId: "d1" })
  await send({ job: { id: "j2", data: {}, recipient_user_id: "u27" } as any, entry: entryFor("FIRST_PRODUCT_REMINDER"), to: "a@b.co", recipientName: "Ana", deliveryId: "d2" })
  check("  a required welcome email has neither link; an optional nudge both, with its header", got.length === 2 && !/Unsubscribe|Notification settings/.test(got[0].html) && /Unsubscribe/.test(got[1].html) && /Notification settings/.test(got[1].html) && !!got[1].headers?.["List-Unsubscribe"])
  check("the senders no longer ask for an unsubscribe link for an order", !/unsubscribeUrl\(userId, "sales"\)/.test(read("lib/email.tsx")) && !/unsubscribeUrl\(userId, "sales"\)/.test(read("lib/physical/jobs-server.ts")))
}

/** Every buyer email an order of this kind sends, through the job queue. */
async function buyerEmails(kind: Kind, site: { published?: boolean } = {}): Promise<Sent[]> {
  const { runJobs, queueOrderConfirmation, queueShipmentEmail, queueCancelledEmail, queueRefundEmail, queueReturnEmail } = await import("@/lib/physical/jobs-server")
  const db = orderDb(kind, site)
  const n0 = outbox.length
  await queueOrderConfirmation(db as any, CHECKOUT, CREATOR)
  for (const step of ["shipped", "out_for_delivery", "delivered"] as const) await queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", step)
  await queueReturnEmail(db as any, CHECKOUT, CREATOR, "r1", "approved")
  await queueRefundEmail(db as any, CHECKOUT, CREATOR, 3600, 3600)
  await queueCancelledEmail(db as any, CHECKOUT, CREATOR)
  await runJobs(db as any, 40)
  return outbox.slice(n0).filter((m) => m.to === "maria@example.com")
}

async function perType() {
  const { supplierOrderEmail } = await import("@/lib/physical/email-templates")
  console.log("\nEvery buyer email, per fulfilment type: words, steps and links\n")
  for (const kind of ["ship", "local", "pickup", "mixed"] as Kind[]) {
    const mails = await buyerEmails(kind)
    const by = (re: RegExp) => mails.find((m) => re.test(m.subject))
    for (const m of mails) await dump(`buyer-${kind}-${m.subject.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50)}`, m.html)
    const conf = by(/confirmed/)
    check(`${kind}: the confirmation, and Visit our store goes to the live website`, !!conf && hrefs(conf.html).includes("https://andrewrullz.storelib.com") && /Visit our store/.test(conf.html), conf ? hrefs(conf.html) : mails.map((m) => m.subject))
    check(`${kind}: no email links storelib.com/<name> (the creator page) or the platform's root`, mails.length > 0 && mails.every((m) => !hrefs(m.html).some(creatorPageLink)), mails.flatMap((m) => hrefs(m.html).filter(creatorPageLink)))
    check(`${kind}: the order page is on the website the order was placed on`, mails.every((m) => hrefs(m.html).some((h) => h.startsWith(`https://andrewrullz.storelib.com/checkout/physical/order/${TOKEN}`))))
    check(`${kind}: the store's logo links its website, and the footer names it`, mails.filter((m) => m !== conf).every((m) => m.html.includes('href="https://andrewrullz.storelib.com"') && m.html.includes(">andrewrullz.storelib.com</a>")))
    check(`${kind}: every item picture is sized through the image endpoint, never the upload itself`, mails.every((m) => !m.html.includes(`src="${PIC}"`)) && mails.some((m) => /<img class="e-thumb" src="https:\/\/storelib\.com\/api\/email\/img\?u=/.test(m.html)))
    check(`${kind}: no email shows the storage host (pictures go by Storelib's own address)`, mails.every((m) => !/supabase\.co/.test(m.html)))
    check(`${kind}: no Unsubscribe on any order email`, mails.every((m) => !/unsubscribe/i.test(m.html + m.text) && !Object.keys(m.headers).some((k) => /unsubscribe/i.test(k))))
    if (kind === "ship" || kind === "mixed") {
      const shipped = by(/on the way/)
      check(`${kind}: confirmation says it will be shipped, with the address and the method`, !!conf && /ready to be shipped/.test(conf.html) && /Shipping address/.test(conf.html) && /Standard/.test(conf.html))
      check(`${kind}: shipped has the steps, the carrier and number, Track your package`, !!shipped && /On its way/.test(shipped.html) && /JD0146000062/.test(shipped.html) && /Track your package/.test(shipped.html))
      check(`${kind}: out for delivery and delivered are sent`, !!by(/out for delivery/) && !!by(/was delivered/))
    }
    if (kind === "mixed") check("mixed: the confirmation says the downloads are on the order page", !!conf && /Your downloads are on your order page/.test(conf.html))
    if (kind !== "mixed") check(`${kind}: no download wording without a download`, mails.every((m) => !/download/i.test(m.text)))
    if (kind === "local") {
      const shipped = by(/on the way/)
      check("local: the confirmation names the delivery and the store's note, no carrier estimate", !!conf && /Local delivery/.test(conf.html) && /We deliver on Fridays/.test(conf.html) && !/business days/.test(conf.html))
      check("local: the confirmation's totals name the fee Delivery, never Shipping", !!conf && !/Shipping/.test(conf.text) && /Delivery: €5\.00/.test(conf.text), conf?.text.match(/.*€5\.00.*/g))
      check("local: on its way says the store delivers it, with no tracking box or Track button", !!shipped && /delivering it to you ourselves/.test(shipped.html) && !/Track your package|JD0146000062/.test(shipped.html))
      check("local: delivered says handed over", !!by(/was delivered/) && /handed over/.test(by(/was delivered/)!.html))
    }
    if (kind === "pickup") {
      check("pickup: the confirmation says ready to pick up, where, the hours; no shipping address or method", !!conf && /ready to pick up/.test(conf.html) && /Pick up at/.test(conf.html) && /Mon to Fri 10:00 to 18:00/.test(conf.html) && !/Shipping address|Shipping method/.test(conf.html))
      const ready = by(/ready to pick up/)
      check("pickup: ready to pick up, with directions and the place; picked up after", !!ready && /Get directions/.test(ready.html) && /Studio/.test(ready.html) && !!by(/picked up/))
      check("pickup: no carrier wording (out for delivery, tracking) is sent", !by(/out for delivery/) && mails.every((m) => !/Track your package|tracking number/i.test(m.html)))
    }
    check(`${kind}: the return, the refund and the cancellation are sent`, !!by(/return was approved/i) && !!by(/Refund for order/) && !!by(/was cancelled/), mails.map((m) => m.subject))
  }

  /* No live website: no store link at all, never the creator page in its place. */
  const none = await buyerEmails("ship", { published: false })
  const conf = none.find((m) => /confirmed/.test(m.subject))
  check("no published website: no Visit our store, no store address in the footer", !!conf && !/Visit our store/.test(conf.html) && none.every((m) => !/storelib\.com\/andrewrullz|>storelib\.com</.test(m.html)))
  check("  and nothing links the creator page", none.every((m) => !hrefs(m.html).some(creatorPageLink)), none.flatMap((m) => hrefs(m.html).filter(creatorPageLink)))
  check("  the order page is then on storelib.com, its checkout path", none.every((m) => hrefs(m.html).some((h) => h.startsWith(`https://storelib.com/checkout/physical/order/${TOKEN}`))))

  /* The supplier's order, with pictures. */
  const sup = supplierOrderEmail({ shopName: "Andrew Rullz", orderNumber: "#A1B2C3D4", locationName: "Print Co", lines: [{ title: "Ceramic mug", variantName: "Sage", quantity: 2, cents: 0, imageUrl: PIC, sku: "MUG-S" }, { title: "Apron", variantName: null, quantity: 1, cents: 0, imageUrl: null }], address: { name: "Maria", line1: "Strada Lipscani 12", city: "Bucharest", country: "RO" }, buyerEmail: null, deliveryName: "Standard", note: null })
  await dump("supplier-order", sup.html)
  check("the supplier's order shows each product's picture (a tile without one), sized", /<img class="e-thumb" src="https:\/\/storelib\.com\/api\/email\/img\?u=[^"]+" alt="Ceramic mug \(Sage\)"/.test(sup.html))

  /* The senders and previews read the one helper. */
  check("every physical email sender reads lib/physical/store-link", ["lib/physical/jobs-server.ts", "lib/automations/abandoned-reminder.ts", "lib/reviews/requests-server.ts", "app/api/store/emails/route.ts", "app/api/store/emails/test/route.ts", "app/api/store/emails/preview/route.ts"].every((f) => /orderStoreUrl\(/.test(read(f))))
  check("no physical email takes the store identity's creator page fallback any more", !/storeUrl: store\.websiteUrl|websiteUrl: store\.websiteUrl/.test(read("lib/physical/jobs-server.ts")) && !/store\?\.websiteUrl/.test(read("lib/automations/abandoned-reminder.ts")))
}

async function creatorPage() {
  const { visitorLanguageFor } = await import("@/lib/markets/visitor-language")
  console.log("\nThe creator page: no floating language card, the setting still works\n")
  const comp = read("components/storefront/creator-language.tsx")
  check("the creator page's language row draws no offer card", !/LanguageSuggest|__slLangSuggest|suggest/.test(comp.replace(/\/\*\*[\s\S]*?\*\//, "")))
  const page = read("app/(marketing)/u/[username]/page.tsx")
  check("  and the page passes it none", !/suggest=\{/.test(page) && /<CreatorLanguage code=\{pageLanguage\.code\}/.test(page))
  const cpl = read("lib/markets/creator-page-language.ts")
  check("with the setting on, the browser's language is chosen silently (exact, else near), never the country", /visitorLanguageFor\(\{ acceptLanguage: h\.get\("accept-language"\), country: null, languages: all \}\)/.test(cpl) && /code = pick\.exact \?\? pick\.closest/.test(cpl) && !/x-vercel-ip-country/.test(cpl))
  check("  still only with the setting on, never for a crawler or after a choice", /!code && !crawler && !jar\.get\("sl_lang"\)\?\.value && \(await visitorLanguageOn\(creatorId\)\)/.test(cpl))
  const langs = ["en", "pt-BR", "fr"]
  const browserOnly = (a: string) => { const p = visitorLanguageFor({ acceptLanguage: a, country: null, languages: langs }); return p.exact ?? p.closest }
  check("  a French browser gets French, a Portuguese one Brazilian Portuguese, a Japanese one the store's own", browserOnly("fr-FR,fr;q=0.9") === "fr" && browserOnly("pt-PT") === "pt-BR" && browserOnly("ja-JP") === null)
  check("the websites keep their card (only the creator page loses it)", /<LanguageSuggest conf=/.test(read("components/website-builder/theme/language-switch.tsx")))
}

async function main() {
  await storeLink()
  await transactional()
  await perType()
  await creatorPage()
  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
