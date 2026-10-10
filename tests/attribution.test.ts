/**
 * ===========================================================================
 *  WHERE A BUYER CAME FROM, ONTO THE ORDER, AND NOTHING ELSE CHANGES
 * ===========================================================================
 * docs/analytics/attribution.md is what these hold the code to:
 *
 *   a touch is worked out from what a visit arrives with, the first is kept,
 *   the last is the latest real source and a direct visit does not replace it;
 *   what a page sends is checked field by field and dropped when it is not
 *   this creator's, and never touches a price;
 *   every path that makes an order writes the same attribution, once, even
 *   when the webhook and the buyer's browser race, on every line of a basket;
 *   every sign-up door records the property and the touches;
 *   and no money column is any different for it.
 *
 * The orders are made by the real fulfilment code (lib/checkout/fulfil-payment,
 * fulfil-cart-session) against a database in memory, with Stripe's reads
 * stood in, the way tests/checkout-receipt.test.ts does it. The browser half
 * runs against a window made here.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import {
  CARRY_PARAM,
  cleanTouch,
  decodeTouches,
  encodeTouches,
  mergeTouches,
  recordVisit,
  touchFromMetadata,
  touchFromVisit,
  touchToMetadata,
  type PropertyType,
  type Touches,
} from "../lib/attribution/touch"
import { checkoutHrefWithOrigin } from "../lib/orders/checkout-origin"
import { ORIGIN_METADATA_KEY, SOURCE_METADATA_KEY, encodeOrigin, type OrderOrigin } from "../lib/orders/order-source"
import { contactSourceFrom } from "../lib/contacts/contact-source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    const d = detail === undefined ? "" : ` (${JSON.stringify(detail)})`
    failures.push(label + d)
    console.log(`  FAIL  ${label}${d}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── A database in memory, with every update written down ──────────────── */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
interface Update { table: string; keys: string[]; hit: number }
class FakeDb {
  tables = new Map<string, Row[]>()
  unique: Record<string, string[]> = { orders: ["receipt_token"] }
  updates: Update[] = []
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table)!
  }
  from(table: string) {
    return query(this, table)
  }
  rpc() {
    return Promise.resolve({ data: null, error: null })
  }
}
function query(db: FakeDb, table: string) {
  let op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
  let values: Row | Row[] | null = null
  let sel = "*"
  let single: "single" | "maybe" | null = null
  let conflict: string | null = null
  const filters: ((r: Row) => boolean)[] = []
  const withJoins = (r: Row): Row =>
    /product:products/.test(sel) ? { ...r, product: db.rows("products").find((p) => p.id === r.product_id) ?? null } : { ...r }
  const run = () => {
    const all = db.rows(table)
    if (op === "insert" || op === "upsert") {
      const out: Row[] = []
      for (const v of Array.isArray(values) ? values : [values!]) {
        if (op === "upsert" && conflict) {
          const hit = all.find((r) => conflict!.split(",").every((k) => r[k] === v[k]))
          if (hit) {
            Object.assign(hit, v)
            out.push(hit)
            continue
          }
        }
        for (const key of db.unique[table] ?? []) {
          if (v[key] != null && all.some((r) => r[key] === v[key])) return { data: null, error: { code: "23505", message: `duplicate ${key}` } }
        }
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...v }
        all.push(row)
        out.push(row)
      }
      const data = out.map(withJoins)
      return { data: single ? data[0] ?? null : data, error: null }
    }
    const hit = all.filter((r) => filters.every((f) => f(r)))
    if (op === "update") {
      db.updates.push({ table, keys: Object.keys(values as Row), hit: hit.length })
      for (const r of hit) Object.assign(r, values)
      return { data: hit, error: null }
    }
    if (op === "delete") {
      db.tables.set(table, all.filter((r) => !hit.includes(r)))
      return { data: hit, error: null }
    }
    const data = hit.map(withJoins)
    if (single === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } }
    if (single === "maybe") return data.length > 1 ? { data: null, error: { code: "PGRST116", message: "many" } } : { data: data[0] ?? null, error: null }
    return { data, error: null, count: data.length }
  }
  const api: Row = {
    select: (s = "*") => {
      if (op === "select") sel = s
      return proxy
    },
    insert: (v: Row) => ((op = "insert"), (values = v), proxy),
    update: (v: Row) => ((op = "update"), (values = v), proxy),
    upsert: (v: Row, o?: { onConflict?: string }) => ((op = "upsert"), (values = v), (conflict = o?.onConflict ?? null), proxy),
    delete: () => ((op = "delete"), proxy),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), proxy),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), proxy),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), proxy),
    is: (k: string, v: unknown) => (filters.push((r) => (v === null ? r[k] == null : r[k] === v)), proxy),
    single: () => ((single = "single"), proxy),
    maybeSingle: () => ((single = "maybe"), proxy),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
  }
  /* order, limit, gte and the rest chain and change nothing here. */
  const proxy: Row = new Proxy(api, { get: (t, p: string) => (p in t ? t[p] : () => proxy) })
  return proxy
}

/* No email, push or anything else leaves: every outside call answers 404. */
globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch

const CREATOR = "c0ffee00-0000-4000-8000-000000000001"
const OTHER_CREATOR = "c0ffee00-0000-4000-8000-000000000002"
const USER = "a0000000-0000-4000-8000-000000000001"
const INSTALL = "d0000000-0000-4000-8000-00000000000a"
const ONEPAGE = "e0000000-0000-4000-8000-00000000000b"
const PRODUCT = "f0000000-0000-4000-8000-000000000001"
const PRODUCT_2 = "f0000000-0000-4000-8000-000000000002"
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()

function seed(): FakeDb {
  const db = new FakeDb()
  db.rows("creators").push(
    { id: CREATOR, user_id: USER, slug: "luca", display_name: "Luca" },
    { id: OTHER_CREATOR, user_id: "a0000000-0000-4000-8000-000000000002", slug: "mara", display_name: "Mara" },
  )
  db.rows("profiles").push({ id: USER, username: "luca", display_name: "Luca", email: "luca@luca.test" })
  db.rows("products").push({ id: PRODUCT, title: "Guide", creator_id: CREATOR }, { id: PRODUCT_2, title: "Presets", creator_id: CREATOR })
  db.rows("store_theme_installs").push(
    { id: INSTALL, creator_id: CREATOR, status: "published", sort_order: 0 },
    { id: "d0000000-0000-4000-8000-0000000000ff", creator_id: CREATOR, status: "draft", sort_order: 1 },
  )
  db.rows("onepages").push({ id: ONEPAGE, seller_id: CREATOR, status: "published" })
  db.rows("custom_domains").push({ domain: "lucashop.com", status: "active", creator_id: CREATOR }, { domain: "mara.shop", status: "active", creator_id: OTHER_CREATOR })
  return db
}

/* A browser's visits, as the pure half records them. */
function visit(kept: Touches | null, v: { href: string; referrer?: string; property: PropertyType; at: number; ua?: string }): Touches | null {
  const t = touchFromVisit({ href: v.href, referrer: v.referrer ?? "", userAgent: v.ua ?? "Mozilla/5.0", mainDomain: "storelib.com", property: v.property, now: v.at })
  return t ? recordVisit(kept, t, v.at) : kept
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url")
const MONEY = ["amount_cents", "tip_cents", "fee_cents", "application_fee_cents", "transfer_id", "currency", "provider", "status", "payment_method", "card_brand", "card_last4", "variant_price_cents", "stripe_payment_intent_id"]
const ATTRIBUTION_COLUMNS = new Set(["first_touch", "last_touch", "property_type", "property_id", "attributed_at"])

async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder"
  process.env.RECEIPT_TOKEN_SECRET = "test-secret"
  const { stripe } = await import("../lib/stripe")
  const { fulfilPaymentIntent } = await import("../lib/checkout/fulfil-payment")
  const { fulfilCartSession, fulfilFreeCart } = await import("../lib/checkout/fulfil-cart-session")
  const { packItems } = await import("../lib/checkout/cart-items")
  const server = await import("../lib/attribution/server")
  const { attributionForCheckout, attributionToMetadata, attributionFromMetadata, recordOrderAttribution, recordSignupAttribution, recordCheckoutStartAttribution } = server

  const intents = new Map<string, unknown>()
  ;(stripe.paymentIntents as any).retrieve = async (id: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const pi = intents.get(id)
    if (!pi) throw Object.assign(new Error("No such payment_intent"), { statusCode: 404, type: "StripeInvalidRequestError" })
    return pi
  }
  let n = 0
  /** A paid PaymentIntent as stripe-session makes it, with the metadata given. */
  const intent = (meta: Record<string, string>, amount = 4610) => {
    const id = `pi_attr${++n}`
    const pi = {
      id,
      object: "payment_intent",
      status: "succeeded",
      amount,
      amount_received: amount,
      created: Math.floor(NOW / 1000),
      client_secret: `${id}_secret_abc`,
      receipt_email: null,
      metadata: {
        product_id: PRODUCT,
        creator_id: CREATOR,
        receipt_token: `tok_${id}_0123456789abcdef`,
        buyer_email: `buyer${n}@example.test`,
        buyer_first_name: "Sam",
        buyer_last_name: "Lee",
        product_title: "Guide",
        base_price_cents: String(amount),
        discount_cents: "0",
        tip_cents: "0",
        session_fingerprint: "fp",
        email_opt_in: "true",
        ...meta,
      },
      latest_charge: { id: "ch_1", application_fee_amount: 300, transfer: null, payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } } },
    }
    intents.set(id, pi)
    return pi
  }
  /** What stripe-session puts on the payment: the order's source and detail, then the checked attribution, last. */
  const checkoutMetadata = async (db: FakeDb, source: "website" | "storelib", origin: OrderOrigin, touches: string | null) => {
    const base: Record<string, string> = { [SOURCE_METADATA_KEY]: source, [ORIGIN_METADATA_KEY]: encodeOrigin(origin) }
    const a = await attributionForCheckout(db, { creatorId: CREATOR, source, origin, sent: touches === null ? origin : { ...origin, touches } })
    return { ...base, ...attributionToMetadata(a, Object.keys(base).length + 25) }
  }

  console.log("\nA touch is worked out from what a visit arrives with")
  {
    const t = touchFromVisit({ href: "https://luca.storelib.com/?utm_source=ig&utm_medium=social&utm_campaign=spring", referrer: "https://l.instagram.com/", userAgent: "x", mainDomain: "storelib.com", property: "website", now: NOW })
    check("Instagram with tags: social_instagram, the tags, the landing page and host", t?.source === "social_instagram" && t.utm_campaign === "spring" && t.landing_path === "/" && t.landing_host === "luca.storelib.com" && t.property_type === "website", t)
    check("no referrer, no tags, no in-app browser: direct", touchFromVisit({ href: "https://luca.storelib.com/about", referrer: "", userAgent: "Mozilla/5.0", mainDomain: "storelib.com", now: NOW })?.source === "direct")
    check("the Instagram app with no referrer is Instagram, not direct",
      touchFromVisit({ href: "https://luca.storelib.com/", referrer: "", userAgent: "Mozilla/5.0 Instagram 300.0", mainDomain: "storelib.com", now: NOW })?.source === "social_instagram")
    check("a page opened from another page of the visit is not an arrival", touchFromVisit({ href: "https://luca.storelib.com/about", referrer: "https://luca.storelib.com/", userAgent: "x", mainDomain: "storelib.com", now: NOW }) === null)
    check("nor is coming back from Stripe or from storelib.com",
      touchFromVisit({ href: "https://luca.storelib.com/", referrer: "https://checkout.stripe.com/pay", userAgent: "x", mainDomain: "storelib.com", now: NOW }) === null &&
      touchFromVisit({ href: "https://luca.storelib.com/", referrer: "https://storelib.com/checkout", userAgent: "x", mainDomain: "storelib.com", now: NOW }) === null)
    check("the landing path keeps no query", touchFromVisit({ href: "https://storelib.com/luca?email=a@b.c&utm_source=google", referrer: "", userAgent: "x", mainDomain: "storelib.com", now: NOW })?.landing_path === "/luca")
  }

  console.log("\nInstagram to a website, a direct visit later, then a purchase")
  {
    let kept: Touches | null = null
    kept = visit(kept, { href: "https://luca.storelib.com/", referrer: "https://l.instagram.com/", property: "website", at: NOW - 3 * DAY })
    kept = visit(kept, { href: "https://luca.storelib.com/", referrer: "", property: "website", at: NOW - 1 * DAY })
    check("first touch Instagram", kept?.first?.source === "social_instagram", kept?.first)
    check("last touch still Instagram: the direct visit does not replace it", kept?.last?.source === "social_instagram", kept?.last)

    const db = seed()
    const origin: OrderOrigin = { surface: "website", site: "luca.storelib.com", from: "instagram" }
    const pi = intent(await checkoutMetadata(db, "website", origin, encodeTouches(kept)))
    const done = await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com", clientSecret: pi.client_secret })
    const order = db.rows("orders")[0]
    check("the order is made", done.ok && db.rows("orders").length === 1)
    check("  first_touch instagram, last_touch instagram", order?.first_touch?.source === "social_instagram" && order?.last_touch?.source === "social_instagram", [order?.first_touch, order?.last_touch])
    check("  property website, and the id is the published install the renderer draws", order?.property_type === "website" && order?.property_id === INSTALL, [order?.property_type, order?.property_id])
    check("  and the Source column agrees: website", order?.source === "website")
    check("  the touch says where it landed and when, to the second", order?.first_touch?.landing_host === "luca.storelib.com" && order?.first_touch?.at === new Date(Math.floor(kept!.first!.at / 1000) * 1000).toISOString(), order?.first_touch)
    const sub = db.rows("subscribers").find((s) => s.email === pi.metadata.buyer_email)
    check("the buyer who ticked the box is a contact with the same attribution", sub?.property_type === "website" && sub?.first_touch?.source === "social_instagram" && !!sub?.attributed_at, sub)
  }

  console.log("\nGoogle, then an email campaign, then a purchase on the creator page")
  {
    let kept: Touches | null = null
    kept = visit(kept, { href: "https://storelib.com/luca", referrer: "https://www.google.com/", property: "creator_page", at: NOW - 10 * DAY })
    kept = visit(kept, { href: "https://storelib.com/luca?utm_source=newsletter&utm_medium=email&utm_campaign=october", referrer: "", property: "creator_page", at: NOW - 2 * DAY })
    check("first google (organic search)", kept?.first?.source === "organic_search" && kept.first.referrer_host === "google.com", kept?.first)
    check("last email", kept?.last?.source === "email" && kept.last.utm_campaign === "october", kept?.last)
    const db = seed()
    const pi = intent(await checkoutMetadata(db, "storelib", { surface: "profile", from: "google" }, encodeTouches(kept)))
    await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" })
    const order = db.rows("orders")[0]
    check("the order: first organic_search, last email", order?.first_touch?.source === "organic_search" && order?.last_touch?.source === "email")
    check("  property creator_page with the creator's id, Source storelib", order?.property_type === "creator_page" && order?.property_id === CREATOR && order?.source === "storelib")
  }

  console.log("\nA buyer who lands straight on checkout")
  {
    const db = seed()
    const pi = intent(await checkoutMetadata(db, "storelib", { surface: "link", from: "direct" }, null))
    const md = pi.metadata as Record<string, string>
    check("the payment carries only the property", !md.attr_first && !md.attr_last && md.attr_property === `creator_page:${CREATOR}`, pi.metadata)
    const done = await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" })
    const order = db.rows("orders")[0]
    check("the order is made, with no touches and nothing failing", done.ok && order.first_touch === null && order.last_touch === null && order.property_type === "creator_page" && !!order.attributed_at, order)
  }

  console.log("\nWhat a page sends is checked, and forged or broken input is ignored")
  {
    const db = seed()
    const origin: OrderOrigin = { surface: "website", site: "luca.storelib.com" }
    const good = encodeTouches(visit(null, { href: "https://luca.storelib.com/", referrer: "https://www.tiktok.com/", property: "website", at: NOW - DAY }))
    const t0 = Math.floor((NOW - DAY) / 1000)
    const forged: Array<[string, unknown]> = [
      ["nothing", undefined],
      ["an empty string", ""],
      ["not base64url", "!!!<script>"],
      ["far too long", "a".repeat(5000)],
      ["base64 of text that is not JSON", b64("hello")],
      ["base64 of a JSON array", b64("[1,2,3]")],
      ["a touch with no time", b64(JSON.stringify({ f: { r: "instagram.com" } }))],
      ["a touch from 200 days ago", b64(JSON.stringify({ f: { r: "instagram.com", lh: "luca.storelib.com", t: Math.floor((NOW - 200 * DAY) / 1000) } }))],
      ["a touch ten days in the future", b64(JSON.stringify({ f: { r: "instagram.com", lh: "luca.storelib.com", t: Math.floor((NOW + 10 * DAY) / 1000) } }))],
      ["a touch that landed on another creator's domain", b64(JSON.stringify({ f: { r: "instagram.com", lh: "mara.shop", p: "w", t: t0 } }))],
      ["a touch that landed on a host nobody owns", b64(JSON.stringify({ f: { r: "instagram.com", lh: "evil.example", t: t0 } }))],
      ["a touch that names no host at all", b64(JSON.stringify({ f: { r: "instagram.com", t: t0 } }))],
      ["an object instead of a string", { f: { r: "instagram.com", lh: "luca.storelib.com", t: t0 } }],
    ]
    for (const [label, touches] of forged) {
      const a = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin, sent: { ...origin, touches } })
      check(`${label}: no touches, the property still the server's`, a.first === null && a.last === null && a.property_type === "website" && a.property_id === INSTALL, a)
    }
    /* Written as text: "__proto__" as a real key, the way a forger would send it. */
    const polluted = b64(`{"f":{"r":"<b>x</b>","us":"a@b.com","uc":"spring","lp":"/p?x=1","lh":"luca.storelib.com","p":"x","a":"myspace","s":"paid","t":${t0},"__proto__":{"admin":true}}}`)
    const a = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin, sent: { touches: polluted } })
    const f = a.first as unknown as Record<string, unknown> | null
    check("a touch keeps only fields it knows, each within its rules", !!f && f.referrer_host === undefined && f.utm_source === undefined && f.utm_campaign === "spring" && f.landing_path === "/p" && f.property_type === undefined && f.client_app === undefined && !("admin" in (f as object)), f)
    check("  and its source is worked out again, not taken: 'paid' was claimed, a campaign alone is direct", f?.source === "direct", f?.source)
    check("  and nothing polluted an object's prototype", ({} as Record<string, unknown>).admin === undefined)
    const onMain = await attributionForCheckout(db, { creatorId: CREATOR, source: "storelib", origin: { surface: "profile" }, sent: { touches: b64(JSON.stringify({ f: { r: "google.com", lh: "storelib.com", p: "w", t: t0 } })) } })
    check("a touch on storelib.com that claims to be a website keeps its source and loses the claim", onMain.first?.source === "organic_search" && onMain.first?.property_type === undefined, onMain.first)
    const ok = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin, sent: { touches: good } })
    check("the real one passes", ok.first?.source === "social_tiktok", ok.first)
    const own = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin, sent: { touches: b64(JSON.stringify({ f: { r: "instagram.com", lh: "lucashop.com", p: "w", t: t0 } })) } })
    check("a touch on the creator's own verified domain passes", own.first?.landing_host === "lucashop.com" && own.first?.source === "social_instagram", own.first)
    /* Every OnePage is at storelib.me/<name> now: a touch that landed there is Storelib's own, like storelib.com. */
    const onMe = await attributionForCheckout(db, { creatorId: CREATOR, source: "storelib", origin: { surface: "onepage" }, sent: { touches: b64(JSON.stringify({ f: { r: "instagram.com", lh: "storelib.me", lp: "/luca", p: "o", t: t0 } })) } })
    check("a touch that landed on the OnePage at storelib.me passes", onMe.first?.landing_host === "storelib.me" && onMe.first?.source === "social_instagram" && onMe.property_type === "onepage", onMe)

    /* A payment whose attribution metadata is nonsense still makes its order, at its price. */
    const db2 = seed()
    const pi = intent({ [SOURCE_METADATA_KEY]: "storelib", attr_first: "{not json", attr_last: "x".repeat(600), attr_property: "website:not-a-uuid" }, 1999)
    const done = await fulfilPaymentIntent(db2, pi.id, { baseUrl: "https://storelib.com" })
    const order = db2.rows("orders")[0]
    check("an order with broken attribution metadata is made", done.ok && !!order)
    check("  at the price that was paid, with the fee Stripe took", order?.amount_cents === 1999 && order?.fee_cents === 300 && order?.application_fee_cents === 300, [order?.amount_cents, order?.fee_cents])
    check("  with no touches, and a property that agrees with its Source (storelib, so not the website it claimed)", order?.first_touch === null && order?.property_type === "creator_page" && order?.property_id === null && order?.source === "storelib", [order?.property_type, order?.source])
  }

  console.log("\nThe webhook and the buyer's browser at once: written once")
  {
    const db = seed()
    const kept = visit(null, { href: "https://luca.storelib.com/", referrer: "https://www.youtube.com/", property: "website", at: NOW - DAY })
    const pi = intent(await checkoutMetadata(db, "website", { surface: "website", site: "luca.storelib.com" }, encodeTouches(kept)))
    const [page, hook] = await Promise.all([
      fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com", clientSecret: pi.client_secret }),
      fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" }),
    ])
    const writes = db.updates.filter((u) => u.table === "orders" && u.keys.includes("attributed_at"))
    check("one order", page.ok && hook.ok && db.rows("orders").length === 1)
    check("one attribution write, onto one row", writes.length === 1 && writes[0].hit === 1, writes)
    const again = await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" })
    const first = { ...db.rows("orders")[0] }
    await recordOrderAttribution(db, first.id, { property_type: "creator_page", property_id: CREATOR, first: null, last: null })
    const after = db.rows("orders")[0]
    check("a webhook retry writes nothing, and a second write finds no row to change", again.ok && !again.created && db.updates.filter((u) => u.table === "orders" && u.keys.includes("attributed_at")).at(-1)?.hit === 0 && after.property_type === "website" && after.first_touch?.source === "social_youtube")
  }

  console.log("\nA basket: every line gets the same")
  {
    const db = seed()
    const kept = visit(null, { href: "https://luca.storelib.com/?utm_source=pinterest", referrer: "https://www.pinterest.com/", property: "website", at: NOW - DAY })
    const a = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin: { surface: "website", site: "luca.storelib.com" }, sent: { touches: encodeTouches(kept) } })
    const items = [
      { productId: PRODUCT, variantId: null, quantity: 1, priceCents: 4900, discountCents: 0 },
      { productId: PRODUCT_2, variantId: null, quantity: 2, priceCents: 1500, discountCents: 0 },
    ]
    const baseMeta = { cart: "1", creator_id: CREATOR, buyer_id: "", platform_fee_cents: "500", [ORIGIN_METADATA_KEY]: encodeOrigin({ surface: "website", site: "luca.storelib.com" }), ...packItems(items) }
    const session = {
      id: "cs_test_attr1",
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      amount_total: 7900,
      metadata: { ...baseMeta, ...attributionToMetadata(a, Object.keys(baseMeta).length) },
      customer_details: { email: "ana@example.test", name: "Ana Pop" },
      payment_intent: { id: "pi_basket_attr", latest_charge: { payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } } } },
    }
    ;(stripe.checkout.sessions as any).retrieve = async () => session // eslint-disable-line @typescript-eslint/no-explicit-any
    const [back, hook] = await Promise.all([
      fulfilCartSession(db, session.id, { baseUrl: "https://storelib.com" }),
      fulfilCartSession(db, session.id, { baseUrl: "https://storelib.com" }),
    ])
    const rows = db.rows("orders")
    check("two lines, written once between the return and the webhook", back.ok && hook.ok && rows.length === 2, rows.length)
    check("every line: first and last Pinterest, property the website", rows.every((r) => r.first_touch?.source === "social_pinterest" && r.last_touch?.source === "social_pinterest" && r.property_type === "website" && r.property_id === INSTALL), rows.map((r) => [r.first_touch?.source, r.property_type]))
    check("  and the same touch on both, to the millisecond", rows[0].first_touch?.at === rows[1].first_touch?.at)

    const free = seed()
    const written = await fulfilFreeCart(free, {
      creatorId: CREATOR, items, buyerId: null, buyerEmail: "free@example.test", buyerFirstName: "Free", buyerLastName: null,
      origin: { surface: "website", site: "luca.storelib.com" }, attribution: a, couponId: "coupon-1", couponHolder: null, baseUrl: "https://storelib.com",
    })
    const freeRows = free.rows("orders")
    check("a basket a code made free: every line gets it too", written.ok && freeRows.length === 2 && freeRows.every((r) => r.first_touch?.source === "social_pinterest" && r.property_type === "website"))
  }

  console.log("\nNothing about money changes")
  {
    /* The same payment fulfilled twice, on two databases: once with the most
       attribution a payment can carry, once with none (what every order was
       before this). Every money column must match. */
    const heavy = visit(null, { href: `https://luca.storelib.com/${"a".repeat(100)}?utm_source=${"é".repeat(80)}&utm_medium=${"m".repeat(80)}&utm_campaign=${"c".repeat(80)}&utm_term=${"t".repeat(80)}&utm_content=${"n".repeat(80)}`, referrer: `https://${"x".repeat(60)}.example.com/`, property: "website", at: NOW - DAY })
    const withDb = seed()
    const withMeta = await checkoutMetadata(withDb, "website", { surface: "website", site: "luca.storelib.com" }, encodeTouches(heavy))
    check("every metadata value stays inside Stripe's 500 characters", Object.values(withMeta).every((v) => v.length <= 500), Object.entries(withMeta).map(([k, v]) => [k, v.length]))
    const piWith = intent(withMeta, 12345)
    const piWithout = intent({ [SOURCE_METADATA_KEY]: "website", [ORIGIN_METADATA_KEY]: withMeta[ORIGIN_METADATA_KEY] }, 12345)
    const withoutDb = seed()
    await fulfilPaymentIntent(withDb, piWith.id, { baseUrl: "https://storelib.com" })
    await fulfilPaymentIntent(withoutDb, piWithout.id, { baseUrl: "https://storelib.com" })
    const a = withDb.rows("orders")[0]
    const b = withoutDb.rows("orders")[0]
    const differs = MONEY.filter((k) => a[k] !== b[k] && k !== "stripe_payment_intent_id")
    check("every money column identical with and without attribution", differs.length === 0, differs.map((k) => [k, a[k], b[k]]))
    check("  amount, fee and tip as Stripe says", a.amount_cents === 12345 && a.fee_cents === 300 && a.tip_cents === 0)
    const attributionWrites = [withDb, withoutDb].flatMap((d) => d.updates).filter((u) => u.keys.includes("attributed_at") || u.keys.includes("first_touch") || u.keys.includes("property_type"))
    check("an attribution write names only the attribution columns", attributionWrites.length > 0 && attributionWrites.every((u) => u.keys.every((k) => ATTRIBUTION_COLUMNS.has(k))), attributionWrites.map((u) => u.keys))
    check("the order without attribution metadata still gets its property (from its Source), no touches", b.property_type === "website" && b.first_touch === null)
  }

  console.log("\nThrough Stripe and back")
  {
    const t = cleanTouch({ referrer_host: "instagram.com", utm_campaign: "é".repeat(80), landing_host: "luca.storelib.com", at: NOW })!
    const meta = touchToMetadata(t)
    check("a touch fits a metadata value and comes back", meta.length <= 500 && touchFromMetadata(meta)?.source === "social_instagram", meta.length)
    const full = attributionToMetadata({ property_type: "website", property_id: INSTALL, first: t, last: t }, 10)
    check("first and last the same: one key, the last read from the first", !!full.attr_first && !full.attr_last && attributionFromMetadata(full, { source: "website", origin: null }).last?.source === "social_instagram")
    check("never past Stripe's 50 keys: with 48 already, nothing is added", Object.keys(attributionToMetadata({ property_type: "website", property_id: INSTALL, first: t, last: { ...t, at: t.at + 1, referrer_host: "google.com", source: "organic_search" } }, 48)).length === 0)
    check("the property always follows the order's Source",
      attributionFromMetadata({ attr_property: `website:${INSTALL}` }, { source: "storelib", origin: { surface: "profile" } }).property_type === "creator_page" &&
      attributionFromMetadata({ attr_property: `onepage:${ONEPAGE}` }, { source: "website", origin: { surface: "website" } }).property_type === "website" &&
      attributionFromMetadata({ attr_property: `onepage:${ONEPAGE}` }, { source: "storelib", origin: { surface: "onepage" } }).property_id === ONEPAGE)
    check("two stores of one buyer merge: earliest first, latest real source last",
      (() => {
        const site = visit(null, { href: "https://luca.storelib.com/", referrer: "https://l.instagram.com/", property: "website", at: NOW - 5 * DAY })
        const page = visit(null, { href: "https://storelib.com/luca", referrer: "", property: "creator_page", at: NOW - 1 * DAY })
        const m = mergeTouches(site, page)
        return m?.first?.source === "social_instagram" && m?.last?.source === "social_instagram"
      })())
    check("a first touch past 90 days gives way", (() => {
      const old = visit(null, { href: "https://storelib.com/luca", referrer: "https://www.google.com/", property: "creator_page", at: NOW - 100 * DAY })
      const now = visit(old, { href: "https://storelib.com/luca", referrer: "https://www.bing.com/", property: "creator_page", at: NOW })
      return now?.first?.referrer_host === "bing.com"
    })())
    check("encoded touches decode to the same thing", (() => {
      const k = visit(null, { href: "https://luca.storelib.com/?utm_source=x", referrer: "https://t.co/", property: "website", at: NOW - DAY })
      const back = decodeTouches(encodeTouches(k), NOW)
      return back?.first?.source === k?.first?.source && back?.first?.at === Math.floor(k!.first!.at / 1000) * 1000
    })())
  }

  console.log("\nEvery sign-up door records the property and the touches")
  {
    const touches = encodeTouches(visit(null, { href: "https://luca.storelib.com/", referrer: "https://www.facebook.com/", property: "website", at: NOW - DAY }))
    const mainTouches = encodeTouches(visit(null, { href: "https://storelib.com/luca", referrer: "https://www.facebook.com/", property: "creator_page", at: NOW - DAY }))
    const req = (url: string, referer: string) => new Request(url, { method: "POST", headers: { referer } })
    const doors: Array<[string, ReturnType<typeof contactSourceFrom>, string, PropertyType, string]> = [
      ["a website's newsletter section", contactSourceFrom({ request: req("https://luca.storelib.com/api/website-builder/subscribe", "https://luca.storelib.com/"), surface: "website", form: "newsletter" }), touches, "website", INSTALL],
      ["a website's contact form", contactSourceFrom({ request: req("https://luca.storelib.com/api/website-builder/contact", "https://luca.storelib.com/contact"), surface: "website", form: "contact", page: "contact" }), touches, "website", INSTALL],
      ["the creator page's subscribe bar", contactSourceFrom({ request: req("https://storelib.com/api/subscribers", "https://storelib.com/luca"), surface: "profile", form: "bar" }), mainTouches, "creator_page", CREATOR],
      ["a product page's bar", contactSourceFrom({ request: req("https://storelib.com/api/subscribers", "https://storelib.com/p/guide"), surface: "profile", form: "bar" }), mainTouches, "creator_page", CREATOR],
      ["the OnePage's subscribe button", contactSourceFrom({ request: req("https://storelib.com/api/subscribe", "https://storelib.com/luca/links"), surface: "onepage", form: "popup" }), mainTouches, "onepage", ONEPAGE],
      ["the OnePage's lead form", contactSourceFrom({ request: req("https://storelib.com/api/onepage/leads", "https://storelib.com/luca/links"), surface: "onepage", form: "lead_magnet" }), mainTouches, "onepage", ONEPAGE],
    ]
    for (const [label, source, sent, property, id] of doors) {
      const db = seed()
      const email = `${label.length}@example.test`
      db.rows("subscribers").push({ id: randomUUID(), creator_id: CREATOR, email, status: "subscribed" })
      await recordSignupAttribution(db, { creatorId: CREATOR, email, source, sent: { touches: sent } })
      const row = db.rows("subscribers")[0]
      check(`${label}: ${property}, its id, and the touches`, row.property_type === property && row.property_id === id && row.first_touch?.source === "social_facebook" && !!row.attributed_at, [row.property_type, row.property_id, row.first_touch?.source])
    }
    {
      const db = seed()
      db.rows("subscribers").push({ id: randomUUID(), creator_id: CREATOR, email: "twice@example.test", status: "subscribed" })
      const source = contactSourceFrom({ request: req("https://storelib.com/api/subscribers", "https://storelib.com/luca"), surface: "profile", form: "bar" })
      await recordSignupAttribution(db, { creatorId: CREATOR, email: "twice@example.test", source, sent: { touches: mainTouches } })
      await recordSignupAttribution(db, { creatorId: CREATOR, email: "twice@example.test", source: contactSourceFrom({ surface: "onepage" }), sent: null })
      check("the first door wins: a second sign-up changes nothing", db.rows("subscribers")[0].property_type === "creator_page" && db.rows("subscribers")[0].first_touch?.source === "social_facebook")
      db.rows("subscribers").push({ id: randomUUID(), creator_id: CREATOR, email: "import@example.test", status: "subscribed" })
      await recordSignupAttribution(db, { creatorId: CREATOR, email: "import@example.test", source: { surface: "import" }, sent: { touches: mainTouches } })
      check("an import is on no property and gets nothing", db.rows("subscribers")[1].property_type === undefined)
      db.rows("subscribers").push({ id: randomUUID(), creator_id: CREATOR, email: "plain@example.test", status: "subscribed" })
      await recordSignupAttribution(db, { creatorId: CREATOR, email: "plain@example.test", source, sent: undefined })
      check("a sign-up with no touches still records its property", db.rows("subscribers")[2].property_type === "creator_page" && db.rows("subscribers")[2].first_touch === null)
    }
    /* Each route calls it where it records source_detail, with what its page sent. */
    const routes: Array<[string, RegExp]> = [
      ["app/api/website-builder/subscribe/route.ts", /recordSignupAttribution\(db, \{ creatorId, email, source, sent: body\.origin \}\)/],
      ["app/api/website-builder/contact/route.ts", /recordSignupAttribution\(db, \{ creatorId, email, source: detail as never, sent \}\)/],
      ["app/api/subscribers/route.ts", /recordSignupAttribution\(adminSupabase, \{ creatorId: creator\.id, email: address, source, sent: origin \}\)/],
      ["app/api/subscribe/route.ts", /recordSignupAttribution\(adminSupabase, \{ creatorId: resolvedCreatorId, email: normalizedEmail, source: origin, sent: body\.origin \}\)/],
      ["app/api/onepage/leads/route.ts", /recordSignupAttribution\(adminSupabase, \{ creatorId, email: subscriberEmail, source: leadSource, sent: body\.origin \}\)/],
      ["app/api/onepage/email-capture/route.ts", /recordSignupAttribution\(adminSupabase, \{ creatorId: onepage\.seller_id, email: normalizedEmail, source: leadSource, sent: body\.origin \}\)/],
    ]
    for (const [file, re] of routes) {
      const src = read(file)
      const sources = (src.match(/await recordContactSource\(/g) ?? []).length
      const attributions = (src.match(/recordSignupAttribution\(/g) ?? []).length
      check(`${file}: beside every source it records`, re.test(src) && sources === attributions, [sources, attributions])
    }
    check("the OnePage's lead form sends its origin", /origin: pageOrigin\(\),\n\s+\}\),\n\s+\}\)\n\s+const result = await response\.json\(\)/.test(read("components/onepage/public-onepage.tsx")))
    const checkoutContacts: Array<[string, RegExp]> = [
      ["lib/checkout/fulfil-payment.ts", /recordContactAttribution\(admin, creatorId, buyerEmail, attribution\)/],
      ["lib/checkout/fulfil-cart-item.ts", /recordContactAttribution\(ctx\.admin, ctx\.creatorId, email, ctx\.attribution\)/],
      ["app/api/checkout/process/route.ts", /recordContactAttribution\(admin, creator\.id, email, attribution\)/],
      ["app/api/checkout/quick-free/route.ts", /recordContactAttribution\(admin, product\.creator\.id, normalizedEmail, attribution\)/],
      ["app/api/checkout/stripe-session/route.ts", /recordContactAttribution\(admin, creator\.id, email, attribution\)/],
      ["app/api/stripe/webhook/route.ts", /recordContactAttribution\(supabaseAdmin, creatorId, buyerEmail, attribution\)/],
    ]
    for (const [file, re] of checkoutContacts) check(`checkout's "Email me news" contact carries the order's attribution: ${file}`, re.test(read(file)))
  }

  console.log("\nA started checkout says where it came from")
  {
    const db = seed()
    db.rows("checkout_starts").push({ id: randomUUID(), creator_id: CREATOR, payment_intent_id: "pi_started", email: "left@example.test" })
    const kept = visit(null, { href: "https://luca.storelib.com/", referrer: "https://www.reddit.com/", property: "website", at: NOW - DAY })
    const a = await attributionForCheckout(db, { creatorId: CREATOR, source: "website", origin: { surface: "website" }, sent: { touches: encodeTouches(kept) } })
    await recordCheckoutStartAttribution(db, "pi_started", a)
    const row = db.rows("checkout_starts")[0]
    check("the reminder's row has the property and the touches", row.property_type === "website" && row.property_id === INSTALL && row.last_touch?.source === "social_reddit", row)
    const session = read("app/api/checkout/stripe-session/route.ts")
    check("stripe-session writes it where it records the start", /await recordCheckoutStart\(admin, \{[\s\S]*?\}\)\n\s+await recordCheckoutStartAttribution\(admin, started, attribution\)/.test(session))
  }

  console.log("\nEvery order path writes it, and a price never reads it")
  {
    const session = read("app/api/checkout/stripe-session/route.ts")
    check("stripe-session checks it after the price is decided and puts it on the payment last",
      session.indexOf("priceOrder(") < session.indexOf("attributionForCheckout(") && /Object\.assign\(metadata, attributionToMetadata\(attribution, Object\.keys\(metadata\)\.length\)\)/.test(session))
    const code = session.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^import .*$/gm, "")
    const uses = code.match(/(?<![\w/])attribution(?![\w/])/g) ?? []
    /* Five: declared, on the metadata, onto the start, and onto the contact on each provider's branch (Stripe, and Storelib Payments on Airwallex). */
    check("  and uses it for nothing else: declared, put on the metadata, written onto the start and the contact", /amount: chargeCents,/.test(session) && uses.length === 4, uses.length)
    const cart = read("app/api/checkout/cart/route.ts")
    check("the basket route: the same, after pricing", cart.indexOf("priceCart(") < cart.indexOf("attributionForCheckout(") && /Object\.assign\(params\.metadata!, attributionToMetadata\(attribution/.test(cart) && /attribution: c\.attribution/.test(cart))
    for (const [file, re] of [
      ["lib/checkout/fulfil-payment.ts", /await tagOrderSource\(admin, order\.id, source, origin\)[\s\S]{0,300}attributionFromMetadata\(m, \{ source, origin \}\)\n\s+await recordOrderAttribution\(admin, order\.id, attribution\)/],
      ["lib/checkout/fulfil-cart-item.ts", /await tagOrderSource\(ctx\.admin, order\.id, "website", ctx\.origin\)\n\s+await recordOrderAttribution\(ctx\.admin, order\.id, ctx\.attribution\)/],
      ["lib/checkout/fulfil-cart-session.ts", /attribution: attributionFromMetadata\(metadata, \{ source: "website", origin: orderOriginFrom\(metadata\) \}\)/],
      ["app/api/checkout/process/route.ts", /await tagOrderSource\(admin, order\.id, channel, origin\)[\s\S]{0,200}attributionForCheckout\(admin, \{ creatorId: creator\.id, source: channel, origin, sent: body\.origin \}\)\n\s+await recordOrderAttribution\(admin, order\.id, attribution\)/],
      ["app/api/checkout/quick-free/route.ts", /await tagOrderSource\(admin, order\.id, channel, origin\)[\s\S]{0,200}attributionForCheckout\(admin, \{ creatorId: product\.creator\.id, source: channel, origin, sent: body\.origin \}\)\n\s+await recordOrderAttribution\(admin, order\.id, attribution\)/],
      ["app/api/stripe/webhook/route.ts", /attributionFromMetadata\(metadata, \{ source: orderSourceFrom\(metadata\), origin: orderOriginFrom\(metadata\) \}\)\n\s+await recordOrderAttribution\(supabaseAdmin, order\.id, attribution\)/],
    ] as Array<[string, RegExp]>) check(`${file} writes it with the order's own Source`, re.test(read(file)))
    const server = read("lib/attribution/server.ts")
    check("nothing in attribution reads or writes an amount", !/amount|price|_cents|fee/i.test(server.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  }

  console.log("\nIn the browser: kept per address, carried to checkout, taken off the address")
  {
    const store = new Map<string, string>()
    const localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size },
    }
    const win = new EventTarget() as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const doc: any = { cookie: "", referrer: "" } // eslint-disable-line @typescript-eslint/no-explicit-any
    const cookies = new Map<string, string>()
    Object.defineProperty(doc, "cookie", {
      get: () => [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      set: (v: string) => {
        const [pair, ...attrs] = v.split(/;\s*/)
        const [k, val] = [pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)]
        if (attrs.some((a) => /^max-age=0$/i.test(a))) cookies.delete(k)
        else cookies.set(k, val)
      },
    })
    const go = (href: string, referrer = "") => {
      win.location = new URL(href)
      doc.referrer = referrer
    }
    win.localStorage = localStorage
    win.history = { state: null, replaceState: (_s: unknown, _t: string, url: string) => { win.location = new URL(url, win.location.href) } }
    win.self = win
    win.top = win
    go("https://luca.storelib.com/")
    for (const [name, value] of Object.entries({ window: win, document: doc, localStorage, navigator: { userAgent: "Mozilla/5.0" } })) {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
    }
    Object.defineProperty(globalThis, "location", { get: () => win.location, configurable: true })
    const browser = await import("../lib/attribution/browser")
    const consent = await import("../lib/consent/client")
    const { everything } = await import("../lib/consent/consent")

    consent.writeConsent(everything(true, NOW))
    /* 1. From Instagram to the website. */
    go("https://luca.storelib.com/?utm_source=ig&utm_campaign=spring", "https://l.instagram.com/")
    browser.noteVisit(browser.scopeFor(null)!, "website")
    check("with consent, the touch is kept under the website's address", /"h:luca\.storelib\.com"/.test(store.get(browser.STORE_KEY) ?? ""), store.get(browser.STORE_KEY))
    /* 2. A new tab days later, typed in. */
    browser.resetTouchMemory()
    go("https://luca.storelib.com/about", "")
    browser.noteVisit(browser.scopeFor(null)!, "website")
    const kept = browser.touchesFor("h:luca.storelib.com")
    check("first and last are Instagram after the direct visit", kept?.first?.source === "social_instagram" && kept?.last?.source === "social_instagram", kept)
    /* 3. Buy on the website: the link carries them, as CheckoutLinkOrigin makes it. */
    const href = checkoutHrefWithOrigin(`/checkout?productId=${PRODUCT}&src=website`, { surface: "website", site: "luca.storelib.com", touches: browser.currentTouches() }, win.location.href)
    const carried = new URL(href, "https://luca.storelib.com").searchParams.get(CARRY_PARAM)
    check("the checkout link carries sl_at", !!carried && decodeTouches(carried, NOW)?.first?.source === "social_instagram", href)
    check("a buy button on another host carries them as well", new URL(browser.carryTouches(`/checkout?productId=${PRODUCT}`), "https://x.test").searchParams.has(CARRY_PARAM))
    /* 4. Checkout, on storelib.com, in a new document. */
    browser.resetTouchMemory()
    go(`https://storelib.com${new URL(href, "https://luca.storelib.com").pathname}${new URL(href, "https://luca.storelib.com").search}`, "https://luca.storelib.com/about")
    check("on storelib.com a buy button adds nothing (checkout reads its own storage)", browser.carryTouches(`/checkout?productId=${PRODUCT}`) === `/checkout?productId=${PRODUCT}`)
    const sent = browser.checkoutTouches(CREATOR)
    check("checkout reads them once and takes sl_at off its address", !win.location.search.includes(CARRY_PARAM) && win.location.search.includes(`productId=${PRODUCT}`), win.location.href)
    check("  and sends them with the order", decodeTouches(sent, NOW)?.first?.source === "social_instagram" && decodeTouches(sent, NOW)?.last?.source === "social_instagram")

    /* One creator's visit is not another's sale on storelib.com. */
    browser.resetTouchMemory()
    go("https://storelib.com/mara", "https://www.tiktok.com/")
    browser.noteVisit(browser.scopeFor(OTHER_CREATOR)!, "creator_page")
    check("storelib.com keeps touches per creator", browser.touchesFor(`c:${OTHER_CREATOR}`)?.first?.source === "social_tiktok" && browser.touchesFor(`c:${CREATOR}`) === null)

    /* storelib.me is every creator's OnePage host: per creator there too, and carried to checkout on storelib.com. */
    browser.resetTouchMemory()
    const ONEPAGE_CREATOR = "c0ffee00-0000-4000-8000-000000000004"
    go("https://storelib.me/nora", "https://www.youtube.com/")
    check("storelib.me keeps touches per creator, not per host", browser.scopeFor(ONEPAGE_CREATOR) === `c:${ONEPAGE_CREATOR}` && browser.scopeFor(null) === null, browser.scopeFor(ONEPAGE_CREATOR))
    browser.noteVisit(browser.scopeFor(ONEPAGE_CREATOR)!, "onepage")
    browser.setPageScope(browser.scopeFor(ONEPAGE_CREATOR))
    check("  so one creator's OnePage visit is not another creator's source", browser.touchesFor(`c:${ONEPAGE_CREATOR}`)?.first?.source === "social_youtube" && browser.touchesFor(`c:${CREATOR}`) === null && browser.touchesFor("h:storelib.me") === null)
    const fromMe = new URL(browser.carryTouches(`https://storelib.com/checkout?productId=${PRODUCT}`)).searchParams.get(CARRY_PARAM)
    check("  and a buy link from storelib.me carries them to checkout on storelib.com", !!fromMe && decodeTouches(fromMe, NOW)?.first?.landing_host === "storelib.me" && decodeTouches(fromMe, NOW)?.first?.source === "social_youtube", fromMe)
    browser.clearPageScope(browser.scopeFor(ONEPAGE_CREATOR))

    /* A client navigation keeps the first page's referrer: it is not an arrival. */
    browser.resetTouchMemory()
    const THIRD = "c0ffee00-0000-4000-8000-000000000003"
    go("https://storelib.com/luca", "https://www.tiktok.com/")
    browser.noteVisit(browser.scopeFor(CREATOR)!, "creator_page")
    win.location = new URL("https://storelib.com/explore/third")
    browser.noteVisit(browser.scopeFor(THIRD)!, "creator_page")
    check("a client navigation to another creator's page is not an arrival from the first page's referrer", browser.touchesFor(`c:${THIRD}`) === null, browser.touchesFor(`c:${THIRD}`))
    win.location = new URL("https://storelib.com/third?utm_source=newsletter&utm_medium=email")
    browser.noteVisit(browser.scopeFor(THIRD)!, "creator_page")
    const third = browser.touchesFor(`c:${THIRD}`)
    check("  a link inside the visit with new tags is a campaign touch, with no stale referrer", third?.last?.source === "email" && !third?.last?.referrer_host, third?.last)

    /* Without consent: nothing stored, this document only. */
    consent.writeConsent(everything(false, NOW))
    check("saying no removes the stored touches", !store.has(browser.STORE_KEY))
    browser.resetTouchMemory()
    go("https://luca.storelib.com/", "https://www.youtube.com/")
    browser.noteVisit(browser.scopeFor(null)!, "website")
    check("without consent nothing is written to the device", !store.has(browser.STORE_KEY))
    check("  and the visit is still known to this document, for its order", decodeTouches(browser.currentTouches(), Date.now())?.first?.source === "social_youtube")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
