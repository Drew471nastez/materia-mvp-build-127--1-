/**
 * ===========================================================================
 *  ROUND 23, EMAILS: WHAT A STORE SAVES IS WHAT A BUYER GETS
 * ===========================================================================
 * The proof is the email that leaves. Each customer email is sent the real
 * way (lib/physical/jobs-server.ts runJobs, the job queue every physical
 * order email goes through) against an in-memory database holding the
 * store's saved words (store_settings.customer_emails), with the network
 * stood in for, and the message handed to Mailgun is read back: its subject,
 * its HTML, its text part and its Reply-To.
 *
 *   saved words     the subject, heading, text and button saved in Settings
 *                   are in the sent email, placeholders filled, for every
 *                   email in the list; the receipt and the checkout reminder
 *                   through their own senders
 *   content         store name, order number, date, items with variant and
 *                   quantity, prices, discount, shipping, tax, total, the
 *                   address and method, tracking, pickup place and hours,
 *                   return instructions, refund amount, the order page, the
 *                   store's contact as Reply-To, the legal line
 *   inboxes         a whole document, tables, inline styles, light only,
 *                   Outlook's fixed width, a plain text part, under Gmail's
 *                   clip; no unsubscribe on an order email, one on the
 *                   checkout reminder
 *   safe            a buyer's name, address and note and a store's words
 *                   are text, never markup; the From header holds one name
 *   once            a job queued twice and an event told twice send once;
 *                   an order's emails stop at a ceiling a day
 *   seller          a new order to fulfil (address, method, who fulfils,
 *                   Fulfil order), a pickup to prepare, a return asked for
 *                   (Review and approve), low stock, in Storelib's look, and
 *                   none while the seller has order emails off
 *   Emails area     a Customer emails tab with the same editor
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

process.env.MAILGUN_API_KEY = "key-test"
process.env.MAILGUN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ── The network: Mailgun answers, every message is kept ───────────────── */
type Sent = { to: string; from: string; subject: string; html: string; text: string; replyTo: string; headers: Record<string, string> }
const outbox: Sent[] = []
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.endsWith("/messages") && init?.body instanceof FormData) {
    const f = init.body
    const headers: Record<string, string> = {}
    for (const [k, v] of f.entries()) if (k.startsWith("h:") && k !== "h:Reply-To") headers[k.slice(2)] = String(v)
    outbox.push({ to: String(f.get("to")), from: String(f.get("from")), subject: String(f.get("subject")), html: String(f.get("html")), text: String(f.get("text")), replyTo: String(f.get("h:Reply-To")), headers })
    return new Response(JSON.stringify({ id: `<m${outbox.length}@storelib.com>`, message: "Queued" }), { status: 200 })
  }
  return new Response("{}", { status: 404 })
}) as typeof fetch

/* ── A database in memory, with the unique keys the real one has ──────── */
type Row = Record<string, any>
class FakeDb {
  tables: Record<string, Row[]> = {}
  seq = 1
  unique: Record<string, string> = { commerce_jobs: "idempotency_key", commerce_order_events: "idempotency_key" }
  rows(t: string) {
    return (this.tables[t] ??= [])
  }
  auth = { admin: { getUserById: async () => ({ data: { user: { email: "owner@astrid.test" } } }) } }
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
      for (const r of list) if (key && r[key] && rows.some((x) => x[key] === r[key])) return { data: null, error: { code: "23505" } }
      rows.push(...list)
      return { data: this.wantOne ? list[0] : list, error: null }
    }
    if (this.op === "update") {
      for (const r of rows.filter(match)) Object.assign(r, this.payload)
      return { data: null, error: null }
    }
    if (this.op === "upsert") {
      const r = this.payload as Row
      const hit = rows.find((x) => x.creator_id === r.creator_id)
      if (hit) Object.assign(hit, r)
      else rows.push({ ...r })
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

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const CHECKOUT = "a1b2c3d4-0000-4000-8000-000000000001"
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz012345"

function seed(db: FakeDb, saved: Record<string, unknown> = {}) {
  db.tables.creators = [{ id: CREATOR, user_id: "u1", support_email: "support@astrid.test", slug: "astrid", username: "astrid", display_name: "Astrid" }]
  db.tables.profiles = [{ id: "u1", email: "owner@astrid.test", display_name: "Astrid", username: "astrid", timezone: "Europe/Bucharest" }]
  db.tables.store_settings = [{ creator_id: CREATOR, store_name: "Astrid Studio", phone: "+40 721 000 000", logo_url: "https://cdn.astrid.test/logo.png", contact_email: "hello@astrid.test", customer_emails: saved }]
  db.tables.commerce_checkouts = [
    {
      id: CHECKOUT,
      creator_id: CREATOR,
      buyer_email: "maria@example.com",
      buyer_name: "Maria <b>Popescu</b>",
      currency: "USD",
      items_subtotal_cents: 9600,
      discount_cents: 1000,
      shipping_cents: 700,
      shipping_discount_cents: 0,
      tax_cents: 1767,
      total_cents: 11067,
      refunded_cents: 0,
      shipping_address: { name: "Maria Popescu", line1: "Strada Lipscani 12 <script>x</script>", line2: "Ap. 4", city: "Bucharest", postalCode: "030031", country: "RO", phone: "+40 700 111 222" },
      shipping_rate: { name: "Standard", min_days: 3, max_days: 5, tax_included: false },
      lines: [
        { title: "Wildflower honey", variant_name: "500 g", quantity: 2, unit_cents: 1600, discount_cents: 0, type: "physical", requires_shipping: true, location_id: null, fulfillment_method: "self" },
        { title: "Linen apron", variant_name: "Sage", quantity: 1, unit_cents: 6400, discount_cents: 1000, type: "physical", requires_shipping: true, location_id: null, fulfillment_method: "print_on_demand" },
      ],
      receipt_token: TOKEN,
      buyer_note: "Leave it with the neighbour",
      delivery_method: "ship",
      cancel_reason: "Sold out",
      paid_at: "2026-10-10T09:30:00Z",
      created_at: "2026-10-10T09:00:00Z",
      origin: null,
    },
  ]
  db.tables.orders = [
    { id: "o1", checkout_id: CHECKOUT, payment_method: "card", card_brand: "visa", card_last4: "4242", product_snapshot: { title: "Wildflower honey", variant_name: "500 g" }, created_at: "2026-10-10T09:30:00Z" },
    { id: "o2", checkout_id: CHECKOUT, product_snapshot: { title: "Linen apron", variant_name: "Sage" }, created_at: "2026-10-10T09:30:01Z" },
  ]
  db.tables.fulfillments = [{ id: "f1", checkout_id: CHECKOUT, carrier: "DHL", tracking_number: "JD0146000062", tracking_url: null, notify_buyer: true, status: "shipped", fulfillment_items: [{ quantity: 3 }] }]
  db.tables.fulfillment_items = [
    { fulfillment_id: "f1", order_id: "o1", quantity: 2 },
    { fulfillment_id: "f1", order_id: "o2", quantity: 1 },
  ]
  db.tables.commerce_returns = [{ id: "r1", checkout_id: CHECKOUT, creator_id: CREATOR, status: "requested", merchant_note: "Put a note with your order number in the box.", refunded_cents: 3200, reason: "too_small", reason_label: "Too small", customer_note: "The jar <i>cracked</i>" }]
  db.tables.commerce_return_items = [{ return_id: "r1", order_id: "o1", quantity: 1 }]
  db.tables.commerce_settings = [{ creator_id: CREATOR, default_location_id: "l1", low_stock_alerts: true }]
  db.tables.inventory_locations = [{ id: "l1", creator_id: CREATOR, name: "Studio", kind: "warehouse", address_line1: "Strada Lipscani 12", city: "Bucharest", postal_code: "030031", country: "RO", active: true }]
}

const ALL_IDS = ["order_confirmation", "shipping_confirmation", "tracking_changed", "out_for_delivery", "delivered", "delivery_problem", "ready_for_pickup", "picked_up", "order_cancelled", "refund", "return_approved", "return_received", "return_completed"]

async function main() {
  const { enqueueJob, runJobs, queueOrderConfirmation, queueShipmentEmail, queueCancelledEmail, queueRefundEmail, queueReturnEmail, BUYER_EMAILS_PER_ORDER_PER_DAY, legalOf } = await import("@/lib/physical/jobs-server")
  const { addOrderEvent } = await import("@/lib/physical/events-server")
  const { CUSTOMER_EMAILS, previewCustomerEmail, SAMPLE_DATE } = await import("@/lib/emails/customer-catalog")
  const { DEFAULT_COPY, COPY_FIELDS, resolveCopy, itemsText } = await import("@/lib/emails/customer-custom")
  const { buyerReceiptEmailHtml, buyerReceiptEmailText } = await import("@/lib/receipts/email")
  const { withReceiptCopy } = await import("@/lib/email")
  const { checkoutReminderEmail } = await import("@/lib/physical/email-templates")
  const { physicalSaleFacts, withPhysicalSale, sellerCommerceEmail, lowStockEmail } = await import("@/lib/notify/seller-commerce")
  const { renderEmail } = await import("@/lib/notify/templates")
  const { buildMailgunFromHeader } = await import("@/lib/mailgun")
  const { replyAddress } = await import("@/lib/emails/customer-copy-server")

  /* Every email in the list has a word of its own for each of the four parts; the Button is never empty. */
  console.log("\nEvery email in Settings has its four parts, the Button included\n")
  check("fifteen emails are listed (Delivery problem among them), each with defaults for subject, heading, text and button", CUSTOMER_EMAILS.length === 15 && CUSTOMER_EMAILS.some((e) => e.id === "delivery_problem") && CUSTOMER_EMAILS.every((e) => COPY_FIELDS.every((f) => typeof DEFAULT_COPY[e.id]?.[f] === "string")))
  check("every button has words by default (the owner's screenshot had an empty Button)", CUSTOMER_EMAILS.every((e) => DEFAULT_COPY[e.id].button.trim().length > 0), CUSTOMER_EMAILS.filter((e) => !DEFAULT_COPY[e.id].button).map((e) => e.id))
  check("each previews with the sample order's date", CUSTOMER_EMAILS.filter((e) => e.id !== "checkout_reminder").every((e) => previewCustomerEmail(e.id, { name: "Astrid" })!.html.includes(SAMPLE_DATE)))

  /* ── The real send, every buyer email, with the store's own words saved ── */
  console.log("\nWhat is saved in Settings is what is sent\n")
  const saved: Record<string, Record<string, string>> = {}
  for (const id of ALL_IDS) saved[id] = { subject: `S-${id} {{order_number}} for {{customer_name}}`, heading: `H-${id} {{shop_name}}`, body: `B-${id} hello {{customer_name}}, {{items}}`, button: `Go ${id.slice(0, 20)}` }
  const db = new FakeDb()
  seed(db, saved)
  const number = "#A1B2C3D4"
  const takeFrom = async (d: FakeDb, queue: () => Promise<void>) => {
    const before = outbox.length
    await queue()
    await runJobs(d as any, 20)
    return outbox.slice(before)
  }
  const take = (queue: () => Promise<void>) => takeFrom(db, queue)
  const sentFor: Record<string, Sent> = {}
  sentFor.order_confirmation = (await take(() => queueOrderConfirmation(db as any, CHECKOUT, CREATOR)))[0]
  sentFor.shipping_confirmation = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "shipped")))[0]
  sentFor.tracking_changed = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "tracking")))[0]
  sentFor.out_for_delivery = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "out_for_delivery")))[0]
  sentFor.delivered = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "delivered")))[0]
  /* A delivery problem comes from the shipment's status moving to failed: the timeline entry queues it. */
  db.tables.fulfillments[0].status = "failed"
  db.tables.fulfillments[0].updated_at = "2026-10-11T08:00:00Z"
  sentFor.delivery_problem = (await take(() => addOrderEvent(db as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "fulfillment.failed", message: "Shipment failed", actor: "webhook" }))).find((m) => m.to === "maria@example.com")!
  db.tables.fulfillments[0].status = "shipped"
  sentFor.order_cancelled = (await take(() => queueCancelledEmail(db as any, CHECKOUT, CREATOR)))[0]
  sentFor.refund = (await take(() => queueRefundEmail(db as any, CHECKOUT, CREATOR, 3200, 3200)))[0]
  sentFor.return_approved = (await take(() => queueReturnEmail(db as any, CHECKOUT, CREATOR, "r1", "approved")))[0]
  sentFor.return_received = (await take(() => queueReturnEmail(db as any, CHECKOUT, CREATOR, "r1", "received")))[0]
  sentFor.return_completed = (await take(() => queueReturnEmail(db as any, CHECKOUT, CREATOR, "r1", "completed")))[0]
  /* The same order picked up instead: ready, then collected. */
  const co = db.tables.commerce_checkouts[0]
  co.delivery_method = "pickup"
  co.pickup = { name: "Studio", address: ["Strada Lipscani 12", "Bucharest"], instructions: "Ring the bell at the side door.", ready: "24h", hours: "Mon to Fri, 10:00 to 18:00" }
  sentFor.ready_for_pickup = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "shipped", "email:pickup-ready:f1")))[0]
  sentFor.picked_up = (await take(() => queueShipmentEmail(db as any, CHECKOUT, CREATOR, "f1", "delivered", "email:pickup-done:f1")))[0]
  const pickupConfirmation = (await take(() => enqueueJob(db as any, { creatorId: CREATOR, kind: "send_email", key: "email:confirmation:pickup", payload: { template: "confirmation", checkoutId: CHECKOUT } })))[0]
  co.delivery_method = "ship"
  co.pickup = null

  for (const id of ALL_IDS) {
    const m = sentFor[id]
    const ok = !!m && m.subject === `S-${id} ${number} for Maria` && m.html.includes(`H-${id} Astrid Studio`) && m.html.includes(`B-${id} hello Maria, `) && m.html.includes(`Go ${id.slice(0, 20)}`) && m.text.includes(`B-${id} hello Maria`)
    check(`${id}: the sent email has the saved subject, heading, text and button, placeholders filled`, ok, m ? { subject: m.subject } : "not sent")
  }
  check("every one went to the buyer, from the store's name, replies to its contact email", ALL_IDS.every((id) => sentFor[id]?.to === "maria@example.com" && sentFor[id].from.startsWith("Astrid Studio <") && sentFor[id].replyTo === "hello@astrid.test"), ALL_IDS.map((id) => sentFor[id]?.replyTo))

  /* The receipt (lib/email.tsx) and the checkout reminder take the same saved words. */
  {
    const rdb = new FakeDb()
    seed(rdb, { receipt: { subject: "Your {{shop_name}} receipt, {{customer_name}}", heading: "Thanks a lot", body: "Here it is: {{items}}", button: "Open it" } })
    const model: any = { firstName: "Maria", sellerName: "Astrid Studio", orderNumber: "#1001", dateText: "10 October 2026", items: [{ title: "Bread course", variantName: null, amountText: "$49.00", note: null }], subtotalText: null, tipText: null, totalText: "$49.00", refundedText: null, link: "https://storelib.com/receipt/x", buttonLabel: "View your receipt", supportEmail: "hello@astrid.test" }
    const subject = await withReceiptCopy(rdb, CREATOR, model, "Your receipt for Bread course")
    const html = buyerReceiptEmailHtml(model)
    check("receipt: the saved subject, heading, text and button are on the receipt", subject === "Your Astrid Studio receipt, Maria" && html.includes("Thanks a lot") && html.includes("Here it is: Bread course") && html.includes("Open it") && buyerReceiptEmailText(model).includes("Here it is: Bread course"), subject)
    const words = resolveCopy({ subject: "Come back to {{items}}", heading: "Still there?", body: "Your cart waits, {{customer_name}}.", button: "Back to it" }, { customer_name: "Maria", shop_name: "Astrid Studio", items: itemsText(["Mug"]) })
    const rem = checkoutReminderEmail({ shopName: "Astrid Studio", buyerFirstName: "Maria", lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: null }], checkoutUrl: "https://storelib.com/checkout?x", unsubscribeUrl: "https://storelib.com/unsubscribe/t", copy: words })
    check("checkout reminder: the saved words are in it", rem.subject === "Come back to Mug" && rem.html.includes("Still there?") && rem.html.includes("Your cart waits, Maria.") && rem.html.includes("Back to it"))
    check("checkout reminder (marketing): an unsubscribe link in the email and the List-Unsubscribe header in its sender", /Unsubscribe<\/a>/.test(rem.html) && rem.text.includes("Unsubscribe: https://storelib.com/unsubscribe/t") && /"List-Unsubscribe": `<\$\{unsubscribeUrl\}>`/.test(read("lib/automations/abandoned-reminder.ts")))
    check("checkout reminder replies to the store's contact email first", /replyTo: store\?\.email \|\| identity\.replyTo/.test(read("lib/automations/abandoned-reminder.ts")))
    check("receipt replies to the store's contact email first", /storeContactEmail\(admin, creatorId\)/.test(read("lib/email.tsx")) && /\|\| contact \|\| identity\?\.sellerEmail/.test(read("lib/email.tsx")))
  }

  /* ── Everything a buyer needs is in it ─────────────────────────────────── */
  console.log("\nEverything the order needs is in its email\n")
  {
    const plain = new FakeDb()
    seed(plain)
    const [c] = await takeFrom(plain, () => queueOrderConfirmation(plain as any, CHECKOUT, CREATOR))
    const h = c.html
    check("store name and logo", h.includes("Astrid Studio") && h.includes('src="https://cdn.astrid.test/logo.png"'))
    check("order number and the date it was placed, in the store's time zone", h.includes(`Order ${number}`) && h.includes("10 October 2026"))
    check("items with variant, quantity and price", h.includes("Wildflower honey") && h.includes("500 g") && h.includes("Qty 2") && h.includes("$32.00") && h.includes("Linen apron") && h.includes("$54.00"))
    check("subtotal, discount, shipping, tax and total", ["Subtotal", "$96.00", "-$10.00", "Shipping", "$7.00", "Tax", "$17.67", "Total", "$110.67"].every((t) => h.includes(t)))
    check("the text part has every money row too", ["Subtotal: $96.00", "Discount: -$10.00", "Shipping: $7.00", "Tax: $17.67", "Total: $110.67"].every((t) => c.text.includes(t)), c.text)
    check("shipping address and method", h.includes("Shipping address") && h.includes("Bucharest") && h.includes("Shipping method") && h.includes("Standard") && h.includes("3 to 5 business days"))
    check("the order page link and Get help", h.includes(`/checkout/physical/order/${TOKEN}`) && h.includes("#get-help"))
    check("Reply-To is the store's contact email (Store details), the one its footer shows", c.replyTo === "hello@astrid.test" && h.includes("mailto:hello@astrid.test"))
    check("the legal line names the store and why the email came", /data-legal=""[^>]*>Astrid Studio<br>You&#39;re getting this email because of your order with Astrid Studio\.|data-legal=""[^>]*>Astrid Studio<br>You're getting this email because of your order with Astrid Studio\./.test(h) || (h.includes('data-legal=""') && h.includes("because of your order with Astrid Studio")))
    check("a business name, address and tax number go on the legal line when the store has them", legalOf({ legalName: "Astrid SRL", legalAddress: ["Strada Lipscani 12", "Bucharest"], taxId: "RO123" })?.taxId === "RO123" && legalOf({ name: "x" }) === null)
    check("the payment method", h.includes("Visa ending 4242"))
    check("no unsubscribe on an order email, in the body or the headers", !/unsubscribe/i.test(h) && !Object.keys(c.headers).some((k) => /unsubscribe/i.test(k)))

    const ship = sentFor.shipping_confirmation
    check("shipping: the carrier's tracking link and number, the address and the method", ship.html.includes("JD0146000062") && /href="https:\/\/[^"]*dhl[^"]*JD0146000062/i.test(ship.html) && ship.text.includes("Shipping to:") && ship.text.includes("Shipping method: Standard"))
    check("pickup ready: the place, its opening hours and the store's instructions", sentFor.ready_for_pickup.html.includes("Strada Lipscani 12") && sentFor.ready_for_pickup.html.includes("Opening hours: Mon to Fri, 10:00 to 18:00") && sentFor.ready_for_pickup.html.includes("Ring the bell at the side door."))
    check("the pickup order confirmation says where and when to collect", pickupConfirmation.html.includes("Pick up at") && pickupConfirmation.html.includes("Opening hours: Mon to Fri, 10:00 to 18:00") && !pickupConfirmation.html.includes("Shipping address"))
    check("return approved: the store's instructions and where to send it", sentFor.return_approved.html.includes("Put a note with your order number in the box.") && sentFor.return_approved.html.includes("Send it to"))
    check("delivery problem: the buyer is told, and so is the seller, once each", sentFor.delivery_problem?.html.includes("problem") && outbox.filter((m) => m.subject.startsWith("Delivery problem with order")).length === 1)
    /* Local delivery (part 154): the store brings it itself. */
    const ldb = new FakeDb()
    seed(ldb)
    ldb.tables.commerce_checkouts[0].shipping_rate = { name: "Local delivery", kind: "local", local_note: "Thursdays after 17:00" }
    const [loc] = await takeFrom(ldb, () => queueShipmentEmail(ldb as any, CHECKOUT, CREATOR, "f1", "shipped"))
    check("local delivery: worded as the store's own delivery, with its note, and no carrier tracking", !!loc && loc.html.includes("delivering it to you ourselves") && loc.html.includes("Thursdays after 17:00") && !loc.html.includes("Track your package"), loc?.subject)
    const [lconf] = await takeFrom(ldb, () => queueOrderConfirmation(ldb as any, CHECKOUT, CREATOR))
    check("local delivery: the order confirmation carries the store's delivery note", !!lconf && lconf.html.includes("Thursdays after 17:00"))
    check("a physical refund reaches the buyer once: Stripe's sync leaves the buyer's email to the order's own", /buyerEmail: shipped \? undefined/.test(read("lib/stripe/refund-sync.ts")))
    check("return complete and refund: the amount refunded", sentFor.return_completed.html.includes("$32.00") && sentFor.refund.html.includes("$32.00") && sentFor.refund.text.includes("This refund: $32.00"))
  }

  /* ── Every inbox ───────────────────────────────────────────────────────── */
  console.log("\nGmail, Outlook and Apple Mail\n")
  {
    const all = [...ALL_IDS.map((id) => sentFor[id])]
    check("a whole document: doctype, language, charset, viewport, the subject as its title", all.every((m) => /^<!DOCTYPE html>/i.test(m.html) && /<html lang="en"/.test(m.html) && /<meta charset="utf-8">/.test(m.html) && /<meta name="viewport"/.test(m.html)))
    check("light only for Apple Mail, with every surface's colour as bgcolor too (the apps that invert, invert all of it)", all.every((m) => /<meta name="color-scheme" content="light only">/.test(m.html) && /bgcolor="#ffffff"/.test(m.html) && /bgcolor="#f8f9fa"/.test(m.html)))
    check("tables for layout, a fixed width for Outlook on Windows, buttons Outlook paints", all.every((m) => /role="presentation"/.test(m.html) && /<!--\[if mso\]><table role="presentation" width="560"/.test(m.html) && /bgcolor="#1a1a2e"/.test(m.html)))
    check("no script, no linked stylesheet, every element styled inline", all.every((m) => !/<script/i.test(m.html) && !/<link[^>]+stylesheet/i.test(m.html) && (m.html.match(/style="/g) ?? []).length > 30))
    check("a preview line for the inbox", all.every((m) => /display:none;font-size:1px/.test(m.html)))
    /* Plain text: none of the email's own markup (what a buyer typed is shown as typed, which in text is harmless). */
    const markup = /<(table|tr|td|div|p|a|span|br|img|h1)\b|&(amp|lt|gt|quot|#39);/i
    check("a plain text part for every one, words not markup", all.every((m) => m.text.length > 120 && !markup.test(m.text)), all.filter((m) => !(m.text.length > 120 && !markup.test(m.text))).map((m) => [m.subject, m.text.match(markup)?.[0]]))
    check("well under Gmail's clip (102KB)", all.every((m) => Buffer.byteLength(m.html) < 60 * 1024), Math.max(...all.map((m) => Buffer.byteLength(m.html))))
  }

  /* ── Safe ──────────────────────────────────────────────────────────────── */
  console.log("\nNothing typed by a buyer or a store becomes markup\n")
  {
    const all = ALL_IDS.map((id) => sentFor[id])
    check("a buyer's name with tags is text", all.every((m) => !m.html.includes("<b>Popescu</b>")))
    check("a buyer's address with a script is text", all.every((m) => !m.html.includes("<script>x</script>")) && sentFor.order_confirmation.html.includes("&lt;script&gt;x&lt;/script&gt;"))
    const tricky = new FakeDb()
    seed(tricky, { order_confirmation: { heading: '<img src=x onerror="alert(1)">Hi', button: 'Go"><a href="javascript:x">' } })
    const [m] = await takeFrom(tricky, () => queueOrderConfirmation(tricky as any, CHECKOUT, CREATOR))
    check("a store's words with tags are cleaned and escaped", !!m && !/<img src=x/.test(m.html) && !/href="javascript:/.test(m.html))
    check("a store name with a comma, quotes or a new line is one sender in the From header", buildMailgunFromHeader('Ana, "Studio"\r\nBcc: x@y.z') === '"Ana, Studio Bcc: x@y.z" <noreply@storelib.com>' || /^"Ana, Studio Bcc: x@y\.z" </.test(buildMailgunFromHeader('Ana, "Studio"\r\nBcc: x@y.z')), buildMailgunFromHeader('Ana, "Studio"\r\nBcc: x@y.z'))
    check("a Reply-To is a plain address or nothing (no relay, no second line)", replyAddress("hello@astrid.test") === "hello@astrid.test" && replyAddress("a@b.co\r\nBcc: x@y.z") === null && replyAddress("x+slb-1@storelib.com") === null)
  }

  /* ── Once ─────────────────────────────────────────────────────────────── */
  console.log("\nA retried webhook or a second press sends once\n")
  {
    const once = new FakeDb()
    seed(once)
    const n0 = outbox.length
    await queueOrderConfirmation(once as any, CHECKOUT, CREATOR)
    await queueOrderConfirmation(once as any, CHECKOUT, CREATOR)
    await runJobs(once as any, 20)
    await runJobs(once as any, 20)
    check("the order confirmation queued twice is one job and one email", once.rows("commerce_jobs").length === 1 && outbox.length - n0 === 1)
    const n1 = outbox.length
    await queueRefundEmail(once as any, CHECKOUT, CREATOR, 3200, 3200)
    await queueRefundEmail(once as any, CHECKOUT, CREATOR, 3200, 3200)
    await runJobs(once as any, 20)
    check("the same refund told by the button and by Stripe's webhook is one email", outbox.length - n1 === 1)
    /* The ceiling: an order already at its day's count holds the next. */
    for (let i = 0; i < BUYER_EMAILS_PER_ORDER_PER_DAY; i++) once.rows("commerce_order_events").push({ id: 1000 + i, checkout_id: CHECKOUT, kind: "email.sent", created_at: new Date().toISOString(), idempotency_key: `x${i}` })
    const n2 = outbox.length
    await queueShipmentEmail(once as any, CHECKOUT, CREATOR, "f1", "shipped")
    await runJobs(once as any, 20)
    check(`past ${BUYER_EMAILS_PER_ORDER_PER_DAY} emails in a day for one order, the next is held and the order says so`, outbox.length === n2 && once.rows("commerce_order_events").some((e) => e.kind === "email.held"))
  }

  /* ── The seller ───────────────────────────────────────────────────────── */
  console.log("\nThe seller's emails for things that ship\n")
  {
    const facts = physicalSaleFacts(db.tables.commerce_checkouts[0])
    const data = withPhysicalSale({ orderId: "o1", orderNumber: "1042", productTitle: "Wildflower honey", amountCents: 11067, currency: "usd", customerName: "Maria Popescu", customerEmail: "maria@example.com", feeCents: 300 }, facts)
    const sale = renderEmail("NEW_SALE", data, { baseUrl: "https://storelib.com" })
    check("new order to fulfil: its own heading and subject with the number", sale.html.includes("New order to fulfil") && sale.subject.startsWith("New order #1042 to fulfil"), sale.subject)
    check("  the items with variant, quantity and who fulfils each", sale.html.includes("500 g · Qty 2 · You ship it") && sale.html.includes("Sage · Qty 1 · Print on demand"))
    check("  where it goes, the phone, the method and the buyer's note", sale.html.includes("Ship to") && sale.html.includes("Strada Lipscani 12") && sale.html.includes("+40 700 111 222") && sale.html.includes("Standard, 3 to 5 business days") && sale.html.includes("Leave it with the neighbour"))
    check("  shipping and tax in the totals, and the total paid", sale.html.includes("Shipping") && sale.html.includes("$7.00") && sale.html.includes("$17.67") && sale.html.includes("$110.67"))
    check("  a Fulfil order button to the order", /Fulfil order/.test(sale.html) && sale.html.includes("https://storelib.com/app/orders?order=o1"))
    check("  the address a buyer typed with a script is text", !sale.html.includes("<script>x</script>"))
    const pick = renderEmail("NEW_SALE", withPhysicalSale({ orderId: "o1", orderNumber: "1043", productTitle: "Honey", amountCents: 3200, currency: "usd" }, physicalSaleFacts({ ...db.tables.commerce_checkouts[0], delivery_method: "pickup", pickup: { name: "Studio", address: ["Strada Lipscani 12"] } })), { baseUrl: "https://storelib.com" })
    check("pickup to prepare: its heading, where it is collected, Prepare order", pick.html.includes("Pickup order to prepare") && pick.html.includes("Collect at") && pick.html.includes("Prepare order"))
    check("a digital sale keeps its own email (no fulfil block)", !renderEmail("NEW_SALE", { orderId: "o9", productTitle: "Presets", amountCents: 900, currency: "usd" }, { baseUrl: "https://storelib.com" }).html.includes("Fulfil order"))
    const withStep = withPhysicalSale({ orderId: "o1", productTitle: "Honey", amountCents: 100, currency: "usd" }, facts, "Print Co was emailed this order with the address.")
    check("the next step is the order's own, worded by who fulfils it (sellerNextStepFor)", ((withStep.fulfil as Record<string, unknown>).nextStep as string) === "Print Co was emailed this order with the address." && /sellerNextStepFor\(admin, params\.creatorId, checkoutId\)/.test(read("lib/email.tsx")))
    check("the sale email reads the checkout behind a physical order", /physicalSaleFacts, withPhysicalSale/.test(read("lib/email.tsx")) && /from\("commerce_checkouts"\)/.test(read("lib/email.tsx")))

    /* A return asked for by the buyer: the event, the job, the email. */
    const sdb = new FakeDb()
    seed(sdb)
    const n0 = outbox.length
    await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "return.requested", message: "Buyer asked to return 1 item", actor: "buyer", key: "return:r1" })
    await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "return.requested", message: "Buyer asked to return 1 item", actor: "buyer", key: "return:r1" })
    await runJobs(sdb as any, 20)
    const ret = outbox.slice(n0)
    check("return requested: one email to the seller, told twice", ret.length === 1 && ret[0].to === "support@astrid.test", ret.map((m) => m.to))
    check("  in Storelib's look, with the item, the reason, the buyer's note as text, and Review and approve", !!ret[0] && ret[0].html.includes("A buyer asked to return items") && ret[0].html.includes("Too small") && ret[0].html.includes("The jar &lt;i&gt;cracked&lt;/i&gt;") && ret[0].html.includes("Review and approve") && ret[0].html.includes("Storelib"))
    check("  replies go to the buyer", ret[0]?.replyTo === "maria@example.com")
    await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "order.cancelled", message: "Order cancelled. Stock released.", actor: "creator", key: "cancelled:x" })
    await runJobs(sdb as any, 20)
    check("a cancellation the seller made does not email the seller", outbox.length === n0 + 1)
    await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "order.cancelled", message: "Cancelled by the buyer", actor: "buyer", key: "cancelled:buyer" })
    await addOrderEvent(sdb as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "delivery.exception", message: "Address not found", actor: "webhook", key: "exception:f1", detail: { carrier: "DHL", trackingNumber: "JD0146000062" } })
    await runJobs(sdb as any, 20)
    const more = outbox.slice(n0 + 1)
    check("a buyer's cancellation and a delivery problem each email the seller once", more.length === 2 && more.some((m) => m.subject.includes("was cancelled")) && more.some((m) => m.subject.startsWith("Delivery problem") && m.html.includes("Address not found") && m.html.includes("JD0146000062")))
    /* Order emails off in Settings › Notifications: none. */
    const off = new FakeDb()
    seed(off)
    off.tables.notification_preferences = [{ user_id: "u1", category: "sales", channel: "email", enabled: false }]
    const n3 = outbox.length
    await addOrderEvent(off as any, { checkoutId: CHECKOUT, creatorId: CREATOR, kind: "return.requested", message: "Buyer asked", actor: "buyer", key: "return:off" })
    await runJobs(off as any, 20)
    check("with sales emails off in the seller's notification settings, no seller email", outbox.length === n3)
    const ls = lowStockEmail({ shopName: "Astrid", items: [{ title: "Hoodie", variantName: "M", available: 0, threshold: 5 }], inventoryUrl: "https://storelib.com/app/inventory?filter=low" })
    check("low stock: Storelib's look, the item, Open Inventory, and how to turn it off", ls.html.includes("Stock is running out") && ls.html.includes("Hoodie") && ls.html.includes("Open Inventory") && ls.text.includes("Settings › Locations"))
    check("low stock is never sent to Storelib's own support inbox standing in for a seller", /sellerInbox\(db, creatorId\)/.test(read("lib/physical/jobs-server.ts")) && /to !== EMAIL_REPLY_TO/.test(read("lib/physical/jobs-server.ts")))
    const pf = sellerCommerceEmail("payment_failed", { orderNumber: "1042", totalCents: 11067, currency: "usd", reason: "Card declined" }, { baseUrl: "https://storelib.com" })
    check("payment failed: its own email for the seller", pf.subject === "Payment failed for order #1042" && pf.html.includes("Card declined") && pf.html.includes("$110.67"))
  }

  /* ── The Emails area and the editor ───────────────────────────────────── */
  console.log("\nThe same editor in Emails, and the editor itself\n")
  {
    const home = read("app/app/emails/emails-home.tsx")
    check("Emails has a Customer emails tab", /\{ id: "customer", label: "Customer emails" \}/.test(home) && /"customer"/.test(read("app/app/emails/emails-data.ts")) && /"customer"/.test(read("app/app/emails/page.tsx")))
    check("  showing the same list and editor as Settings", /tab === "customer" \? <CustomerEmailsPanel bare \/>/.test(home) && /CUSTOMER_EMAILS_PATH/.test(read("app/app/emails/emails-data.ts")))
    const panel = read("components/app/settings/customer-emails-panel.tsx")
    check("the preview is drawn in place, never a new srcDoc", /documentElement\.innerHTML = innerOf\(html\)/.test(panel) && !/srcDoc=/.test(panel))
    check("the phone sheet has one fixed height, and the panes slide", /height: PHONE_SHEET_HEIGHT, maxHeight: PHONE_SHEET_HEIGHT/.test(panel) && /w-\[200%\]/.test(panel) && /translate3d\(-50%,0,0\)/.test(panel))
    check("fields are 16px on a phone", /text-\[16px\] sm:text-\[14px\]/.test(panel))
    check("a placeholder goes in at the cursor, and the cursor stands after it", /setSelectionRange\(c\.at, c\.at\)/.test(panel) && /onPointerDown=\{\(e\) => e\.preventDefault\(\)\}/.test(panel))
    check("scripts/check-customer-emails.mjs drives it in Chromium", /phone-keyboard\.png/.test(read("scripts/check-customer-emails.mjs")))
  }

  /* ── Copy ─────────────────────────────────────────────────────────────── */
  {
    const files = ["lib/notify/seller-commerce.ts", "lib/physical/email-templates.ts", "components/app/settings/customer-emails-panel.tsx", "lib/emails/customer-custom.ts"].map(read).join("\n")
    const sentWords = [...ALL_IDS.map((id) => sentFor[id].text), ...Object.values(DEFAULT_COPY).flatMap((c) => Object.values(c))].join("\n")
    check("no em dash and none of the banned words in what was written", !/\u2014/.test(files) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge)\b/i.test(files) && !/\btransform/i.test(sentWords))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
