/**
 * ===========================================================================
 *  EVERY PAID ORDER GETS ITS PDF, ONCE, WITH ONE NUMBER
 * ===========================================================================
 * The receipt, or the invoice when the buyer bought for a company, run end
 * to end through the code that makes orders, with the database, Stripe and
 * Mailgun stood in for (none of them is reachable from a test):
 *
 *   a product    the buyer's page and Stripe's webhook finishing the same
 *                payment at the same moment: one order, one email, the PDF
 *                attached, the company kept on the order, and the PDF drawn
 *                again from the receipt later carrying the same number
 *   a basket     Stripe's hosted page with "purchasing as a business": one
 *                email for the basket with the invoice, each line with its
 *                quantity and unit price, the company on every row
 *   the words    what the document says, for a company and for a person,
 *                read from the text drawn into the PDF
 *   the page     the checkout sends the company only while the box is
 *                ticked, and the checkout opens at its top
 */
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

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
/** RECEIPT_PDF_DIR=<dir> keeps the PDFs the emails carried, to look at. */
const keep = (file: { name: string; bytes: Buffer } | undefined) => {
  if (file && process.env.RECEIPT_PDF_DIR) writeFileSync(join(process.env.RECEIPT_PDF_DIR, file.name), file.bytes)
}

/* ── A database in memory: enough of supabase-js's query builder ─────────── */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
class FakeDb {
  tables = new Map<string, Row[]>()
  unique: Record<string, string[]> = { orders: ["receipt_token"] }
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
      for (const r of hit) Object.assign(r, values)
      return { data: hit, error: null }
    }
    if (op === "delete") {
      db.tables.set(table, all.filter((r) => !hit.includes(r)))
      return { data: hit, error: null }
    }
    const data = hit.map(withJoins)
    if (single === "single") return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } }
    if (single === "maybe") return { data: data[0] ?? null, error: null }
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
  /* Anything else supabase-js has (order, limit, gte, ...) chains and changes nothing here. */
  const proxy: Row = new Proxy(api, { get: (t, p: string) => (p in t ? t[p] : () => proxy) })
  return proxy
}

/* ── Mailgun, stood in: every message posted is kept ─────────────────────── */
interface Sent {
  to: string
  subject: string
  html: string
  text: string
  files: { name: string; type: string; bytes: Buffer }[]
}
const sent: Sent[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.includes("mailgun") && url.endsWith("/messages") && init?.body instanceof FormData) {
    const form = init.body
    const files: Sent["files"] = []
    for (const f of form.getAll("attachment")) {
      const blob = f as File
      files.push({ name: blob.name, type: blob.type, bytes: Buffer.from(await blob.arrayBuffer()) })
    }
    sent.push({ to: String(form.get("to")), subject: String(form.get("subject")), html: String(form.get("html")), text: String(form.get("text")), files })
    return new Response(JSON.stringify({ id: `<${randomUUID()}@mailgun>`, message: "Queued" }), { status: 200 })
  }
  /* Suppression lists, push, anything else: nothing there. */
  return new Response("{}", { status: 404 })
}) as typeof fetch

async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder"
  process.env.MAILGUN_API_KEY = "key-test"
  process.env.MAILGUN_DOMAIN = "mg.storelib.test"
  process.env.RECEIPT_TOKEN_SECRET = "test-secret"
  const { stripe } = await import("../lib/stripe")
  const { fulfilPaymentIntent } = await import("../lib/checkout/fulfil-payment")
  const { fulfilCartSession } = await import("../lib/checkout/fulfil-cart-session")
  const { invoiceForReceipt, renderInvoicePdf, invoiceNumber } = await import("../lib/checkout/invoice")
  const { packItems } = await import("../lib/checkout/cart-items")
  const { businessToMetadata } = await import("../lib/checkout/business")

  const CREATOR = "c0000000-0000-4000-8000-000000000001"
  const PRODUCT = "p0000000-0000-4000-8000-000000000001"
  const PRODUCT_2 = "p0000000-0000-4000-8000-000000000002"
  const seed = () => {
    const db = new FakeDb()
    db.rows("creators").push({ id: CREATOR, user_id: "u1", display_name: "Luca Dragoste", support_email: "hello@luca.test", username: "luca", stripe_account_id: null })
    db.rows("profiles").push({ id: "u1", email: "luca@luca.test", display_name: "Luca Dragoste", username: "luca" })
    db.rows("products").push({ id: PRODUCT, title: "Brand Content Guide", creator_id: CREATOR }, { id: PRODUCT_2, title: "Lightroom Presets", creator_id: CREATOR })
    return db
  }

  const acme = { company: "Acme Ltd", taxId: "GB123456789", country: "GB", line1: "221B Baker Street", line2: "Apt 4", city: "London", postalCode: "NW1 6XE", region: "" }
  const intent = (id: string, meta: Record<string, string>) =>
    ({
      id,
      object: "payment_intent",
      status: "succeeded",
      amount: 4610,
      amount_received: 4610,
      /* Changed on purpose (currency round AN): Stripe always names the currency it charged. An order without one now holds its receipt (lib/money/held-email) rather than guessing. */
      currency: "usd",
      created: Math.floor(Date.now() / 1000),
      client_secret: `${id}_secret_abc`,
      receipt_email: null,
      metadata: {
        product_id: PRODUCT,
        creator_id: CREATOR,
        receipt_token: `tok_${id}_0123456789abcdef`,
        buyer_email: "jane@acme.test",
        buyer_first_name: "Jane",
        buyer_last_name: "Smith",
        product_title: "Brand Content Guide",
        base_price_cents: "4900",
        discount_cents: "490",
        coupon_code: "SAVE10",
        tip_cents: "200",
        session_fingerprint: "fp",
        ...meta,
      },
      latest_charge: { id: "ch_1", application_fee_amount: 300, transfer: null, payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } } },
    }) as any // eslint-disable-line @typescript-eslint/no-explicit-any
  const intents = new Map<string, unknown>()
  ;(stripe.paymentIntents as any).retrieve = async (id: string) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const pi = intents.get(id)
    if (!pi) throw Object.assign(new Error("No such payment_intent"), { statusCode: 404, type: "StripeInvalidRequestError" })
    return pi
  }

  console.log("\nA product bought for a company, finished by the page and the webhook at once")
  {
    const db = seed()
    const pi = intent("pi_business1", businessToMetadata(acme))
    intents.set(pi.id, pi)
    sent.length = 0
    const [page, hook] = await Promise.all([
      fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com", clientSecret: pi.client_secret }),
      fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" }),
    ])
    const orders = db.rows("orders")
    check("one order for the payment", orders.length === 1, orders.length)
    check("  both callers are answered with it, one of them as its maker", page.ok && hook.ok && [page, hook].filter((r) => r.ok && r.created).length === 1)
    const toBuyer = sent.filter((m) => m.to === "jane@acme.test")
    check("the buyer is emailed once", toBuyer.length === 1, toBuyer.length)
    const pdf = toBuyer[0]?.files[0]
    keep(pdf)
    check("  with the invoice attached as a PDF", !!pdf && pdf.type === "application/pdf" && pdf.bytes.subarray(0, 5).toString() === "%PDF-" && /^Invoice-SL-\d{8}-[0-9A-F]{8}\.pdf$/.test(pdf.name), pdf?.name)
    check("  and the email says so, with a link to download it again", /Your invoice is attached as a PDF/.test(toBuyer[0]?.html ?? "") && /\/api\/checkout\/invoice\?token=/.test(toBuyer[0]?.html ?? "") && /Download it again: https:\/\/storelib\.com\/api\/checkout\/invoice\?token=/.test(toBuyer[0]?.text ?? ""))
    check("the company is kept on the order", orders[0]?.business_details?.company === "Acme Ltd" && orders[0]?.business_details?.taxId === "GB123456789")

    /* A retry of the webhook a minute later. */
    const again = await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com" })
    check("a webhook retry makes nothing and sends nothing", again.ok && !again.created && db.rows("orders").length === 1 && sent.filter((m) => m.to === "jane@acme.test").length === 1)

    /* The same PDF from the receipt, twice, a day apart. */
    const first = await invoiceForReceipt(db, orders[0].receipt_token)
    const second = await invoiceForReceipt(db, orders[0].receipt_token)
    const expected = invoiceNumber(orders[0].id, orders[0].created_at)
    check("the number is the same on every draw", !!first && first.number === second?.number && first.number === expected, [first?.number, second?.number])
    check("  and is the one on the emailed PDF", pdf?.name === `Invoice-${expected}.pdf`, pdf?.name)

    const trace: string[] = []
    const bytes = await renderInvoicePdf(first!, trace)
    const says = trace.join("\n")
    check("the PDF is a whole PDF", bytes.subarray(0, 5).toString() === "%PDF-" && bytes.subarray(-6).toString().includes("%%EOF"))
    for (const [what, re] of [
      ["called an Invoice", /^Invoice$/m],
      ["its number", new RegExp(`^${expected}$`, "m")],
      ["the date of issue and the order date", /^Date of issue$[\s\S]*^Order date$/m],
      ["the seller and Storelib as the platform", /^Luca Dragoste$[\s\S]*^Sold through Storelib$/m],
      ["the seller's contact", /^hello@luca\.test$/m],
      ["the company, billed", /^Billed to$\n^Acme Ltd$/m],
      ["its VAT number", /^VAT number GB123456789$/m],
      ["its address, as the UK writes it", /^221B Baker Street$\n^Apt 4$\n^London$\n^NW1 6XE$\n^United Kingdom$/m],
      ["who at it paid", /^Attn: Jane Smith$\n^jane@acme\.test$/m],
      ["the card", /^Visa ending 4242$/m],
      ["the line, its quantity and unit price", /^Brand Content Guide$\n^1$\n^\$49\.00$\n^\$49\.00$/m],
      ["the code's discount", /^Discount \(SAVE10\)$\n^−\$4\.90$/m],
      ["the tip", /^Tip$\n^\$2\.00$/m],
      ["the subtotal, total and amount paid in dollars", /^Subtotal$\n^\$49\.00$[\s\S]*^Total$\n^\$46\.10$\n^Amount paid$\n^\$46\.10 USD$/m],
      ["the payment's reference", new RegExp(`^${pi.id}$`, "m")],
      ["a plain footer", /^Invoice for a completed payment\. Sold by Luca Dragoste through Storelib \(storelib\.com\)\. Amounts are in US dollars\./m],
    ] as [string, RegExp][]) {
      check(`  says ${what}`, re.test(says))
    }
    check("  and invents no tax: no VAT line, no reverse charge", !/reverse charge|VAT \d|Tax \(|Sales tax/i.test(says))
  }

  console.log("\nA product bought by a person")
  {
    const db = seed()
    const pi = intent("pi_person1", { buyer_email: "sam@example.test", buyer_first_name: "Sam", buyer_last_name: "", discount_cents: "0", coupon_code: "", tip_cents: "0", base_price_cents: "4610" })
    intents.set(pi.id, pi)
    sent.length = 0
    const done = await fulfilPaymentIntent(db, pi.id, { baseUrl: "https://storelib.com", clientSecret: pi.client_secret })
    const toBuyer = sent.filter((m) => m.to === "sam@example.test")
    check("one email, with a receipt PDF", done.ok && toBuyer.length === 1 && /^Receipt-SL-/.test(toBuyer[0].files[0]?.name ?? ""), toBuyer[0]?.files[0]?.name)
    check("  and nothing kept as a company", db.rows("orders")[0].business_details === undefined)
    const inv = await invoiceForReceipt(db, db.rows("orders")[0].receipt_token)
    const trace: string[] = []
    await renderInvoicePdf(inv!, trace)
    const says = trace.join("\n")
    check("the document is a Receipt, paid by the person", /^Receipt$/m.test(says) && /^Paid by$\n^Sam$\n^sam@example\.test$/m.test(says) && !/Billed to|Attn:/.test(says))
    check("  with the total and no discount or tip lines", /^Total$\n^\$46\.10$/m.test(says) && !/Discount|^Tip$/m.test(says))
  }

  console.log("\nA basket on Stripe's hosted page, for a company")
  {
    const db = seed()
    const items = [
      { productId: PRODUCT, variantId: null, quantity: 1, priceCents: 4900, discountCents: 0 },
      { productId: PRODUCT_2, variantId: null, quantity: 2, priceCents: 1500, discountCents: 300 },
    ]
    const session = {
      id: "cs_test_basket1",
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      amount_total: 7600,
      metadata: { cart: "1", creator_id: CREATOR, buyer_id: "", platform_fee_cents: "500", coupon_code: "TEAM10", ...packItems(items) },
      customer_details: {
        email: "ap@globex.test",
        name: "Ana Pop",
        business_name: "Globex GmbH",
        tax_ids: [{ type: "eu_vat", value: "DE123456789" }],
        address: { line1: "Friedrichstraße 43", line2: null, city: "Berlin", postal_code: "10117", state: null, country: "DE" },
      },
      payment_intent: { id: "pi_basket1", latest_charge: { payment_method_details: { type: "card", card: { brand: "mastercard", last4: "4444" } } } },
    }
    ;(stripe.checkout.sessions as any).retrieve = async () => session // eslint-disable-line @typescript-eslint/no-explicit-any
    sent.length = 0
    const [back, hook] = await Promise.all([
      fulfilCartSession(db, session.id, { baseUrl: "https://storelib.com" }),
      fulfilCartSession(db, session.id, { baseUrl: "https://storelib.com" }),
    ])
    const rows = db.rows("orders")
    check("two lines written once between the return and the webhook", back.ok && hook.ok && rows.length === 2, rows.length)
    const toBuyer = sent.filter((m) => m.to === "ap@globex.test")
    keep(toBuyer[0]?.files[0])
    check("one email for the basket, with the invoice", toBuyer.length === 1 && /^Invoice-SL-/.test(toBuyer[0]?.files[0]?.name ?? ""), toBuyer.map((m) => m.files[0]?.name))
    check("the company on every line", rows.every((r) => r.business_details?.company === "Globex GmbH" && r.business_details?.taxId === "DE123456789"))
    const inv = await invoiceForReceipt(db, rows[1].receipt_token)
    const trace: string[] = []
    await renderInvoicePdf(inv!, trace)
    const says = trace.join("\n")
    const firstRow = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))[0]
    check("opened from either line, the number is the basket's first line's", inv?.number === invoiceNumber(firstRow.id, firstRow.created_at) && toBuyer[0]?.files[0]?.name === `Invoice-${inv?.number}.pdf`, inv?.number)
    check("  each line with its quantity and unit price", /^Lightroom Presets$\n^2$\n^\$15\.00$\n^\$30\.00$/m.test(says))
    check("  the code's share taken off once", /^Discount \(TEAM10\)$\n^−\$3\.00$/m.test(says) && /^Total$\n^\$76\.00$/m.test(says))
    check("  the company, as Germany writes an address", /^Globex GmbH$\n^VAT number DE123456789$\n^Friedrichstraße 43$\n^10117 Berlin$\n^Germany$/m.test(says))
  }

  console.log("\nThe page")
  {
    const client = read("app/checkout/checkout-client.tsx")
    /* Changed on purpose: the box is the store's choice now (Settings › Checkout › Company invoices, off by default), so it is sent only while ticked on a checkout that offers it. */
    check("the company is sent only while the box is ticked, on a checkout that offers it", /business: businessOn && checkoutConfig\.businessInvoice \? business : null/.test(client))
    check("  and a free order sends none", /delete body\.business/.test(client))
    check("the server checks it with the same rules", /checkBusiness\(body\.business\)/.test(read("app/api/checkout/stripe-session/route.ts")))
    check("the checkout's history entry is not scrolled back part way down", /history\.scrollRestoration = "manual"/.test(client) && /window\.scrollTo\(0, 0\)/.test(client) && /history\.scrollRestoration = "auto"/.test(client))
    const fields = read("app/checkout/parts/business-fields.tsx")
    /* Asked for since: ticking it opens the fields and nothing more. Focusing Company name raised a phone's keyboard and scrolled the page mid-opening. */
    check("ticking the box opens the fields and takes no focus", /const toggle = \(next: boolean\) => onToggle\(next\)/.test(fields) && !/\.focus\(/.test(fields) && !/flushSync/.test(fields))
    check("every box has a placeholder", (fields.match(/placeholder=\{/g) ?? []).length === 7 && /Select a country/.test(fields))
    const fulfil = read("lib/checkout/fulfil-payment.ts")
    check("the emailed PDF is dated from the order row, not the clock", /created_at: order\.created_at \?\?/.test(fulfil) && !/created_at: new Date\(\)\.toISOString\(\)/.test(fulfil))
    /* Changed on purpose: only where the store offers company invoices (businessInvoice). */
    check("the basket's hosted page offers the business box where the store offers invoices, and opens without it if refused", /\.\.\.\(config\?\.businessInvoice \? \{ tax_id_collection: \{ enabled: true \} \} : \{\}\)/.test(read("app/api/checkout/cart/route.ts")) && /delete params\.tax_id_collection/.test(read("app/api/checkout/cart/route.ts")))
    check("the creator's copy carries the buyer's number and company", /invoiceNumber\(first\.id, first\.created_at\)/.test(read("app/api/invoice/route.ts")) && /companyOf\(lines\)/.test(read("app/api/invoice/route.ts")))
    check("part 35 adds the column the company is kept in", /ADD COLUMN IF NOT EXISTS business_details jsonb/.test(read("supabase/sql/run-now/36_order_business_details.sql")))
  }

  globalThis.fetch = realFetch
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
