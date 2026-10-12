/**
 * ===========================================================================
 *  THE SELLER'S "YOU HAVE A NEW ORDER" EMAIL
 * ===========================================================================
 * lib/email.tsx sendSellerNotificationEmail, drawn by lib/notify/templates
 * (NEW_SALE, and FIRST_SALE for the creator's first paid order). What this
 * pins:
 *
 *   the subject names what sold and for how much, at most 60 characters, no
 *   emoji, no exclamation, no "Cha-Ching"; the preview names the buyer's
 *   first name and what reaches the balance
 *   the body is the order: number, time, each line with its option and
 *   quantity, subtotal, discount and code, total, the Storelib fee and what
 *   the seller receives, and the customer's name, email, country and payment
 *   missing data leaves rows out and never prints undefined, NaN or null
 *   a hostile product or customer name is escaped; only a plain address
 *   becomes a mailto
 *   saleEmailData reads a basket as one order, numbers it as the Orders page
 *   does and knows a first paid sale
 *   the sender keeps its once-per-order check, the preference gate, the
 *   owner's inbox for a second business, the email log and the order status,
 *   sends a plain text part, a new_sale tag, from Storelib, and one email
 *   for a basket
 */
import { readFileSync } from "node:fs"
import { renderEmail } from "../lib/notify/templates"
import { mailtoUrl } from "../lib/notify/templates/escape"
import { REGISTRY } from "../lib/notify/registry"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const BASE = "https://storelib.com"
const ctx = { baseUrl: BASE, when: "Thursday, October 1, 2026 at 9:40 AM GMT+3", preferencesUrl: `${BASE}/app/settings?tab=notifications`, unsubscribeUrl: `${BASE}/api/notify/unsubscribe?token=t` }
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const BAD = /undefined|NaN|\bnull\b|\[object/

const SINGLE = {
  orderId: "ord-1", orderNumber: "1042", productTitle: "Lightroom Presets Vol 2", variantName: "Mobile",
  amountCents: 2900, currency: "usd", lines: [{ title: "Lightroom Presets Vol 2", variantName: "Mobile", quantity: null, amountCents: 2900 }],
  subtotalCents: 2900, feeCents: 145, customerName: "Sam Rivera", customerEmail: "sam@example.com", customerCountry: "PT",
  paymentMethod: "card", cardBrand: "visa", cardLast4: "4242",
}
const BASKET = {
  orderId: "ord-2", orderNumber: "1043", productTitle: "Brand Workbook", amountCents: 7650, currency: "usd",
  lines: [
    { title: "Brand Workbook", amountCents: 3900 },
    { title: "Social Templates", variantName: "Canva", quantity: 2, amountCents: 3000 },
    { title: "Review Call", variantName: "45 minutes", amountCents: 1600 },
  ],
  subtotalCents: 8500, discountCents: 850, couponCode: "AUTUMN10", feeCents: 383,
  customerName: "Jordan Lee", customerEmail: "jordan@example.com",
}

function visible(html: string): string {
  return html.replace(/<(style|title)[^>]*>[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ")
}

async function main() {
  console.log("sale email: subject and preview")
  {
    const e = renderEmail("NEW_SALE", SINGLE, ctx)
    check("single: 'You sold <product> for <amount>'", e.subject === "You sold Lightroom Presets Vol 2 for $29.00", e.subject)
    check("preview: first name, product, what reaches the balance", e.preview === "Sam bought Lightroom Presets Vol 2. $27.55 goes to your balance.", e.preview)
    const b = renderEmail("NEW_SALE", BASKET, ctx)
    check("basket: the first product and how many more", b.subject === "You sold Brand Workbook and 2 more for $76.50", b.subject)
    const f = renderEmail("FIRST_SALE", SINGLE, ctx)
    check("first sale: its own subject and heading", f.subject === "Your first sale: Lightroom Presets Vol 2 for $29.00" && f.text.startsWith("You made your first sale"), f.subject)
    /* Changed on purpose: the owner asked for "You've made a sale" even when the product is free, so a free
       claim gets the same subject and heading as a paid one, and only the money reads differently. */
    const free = renderEmail("NEW_SALE", { ...SINGLE, amountCents: 0, feeCents: 0, lines: [{ title: "Free Guide", amountCents: 0 }] }, ctx)
    check("a free claim is a sale too: the same subject, no fee and no earnings", free.subject === "You sold Free Guide" && !free.text.includes("You receive") && !free.text.includes("Storelib fee"), free.subject)
    check("a free claim's heading says a sale was made", free.text.startsWith("You made a sale") && free.html.includes("You made a sale"), free.text.slice(0, 40))
    check("a free claim's amount reads Free, never $0.00", free.text.includes("Total: Free") && !/\$0\.00/.test(free.text + free.html), free.text.match(/Total[^\n]*/)?.[0])
    check("a free claim's one line reads Free", free.text.includes("Free Guide: Free"), free.text.match(/Free Guide[^\n]*/)?.[0])
    check("a free claim's preview names the buyer and says it was free", free.preview === "Sam got Free Guide for free.", free.preview)
    const freeFirst = renderEmail("FIRST_SALE", { ...SINGLE, amountCents: 0, feeCents: 0, lines: [{ title: "Free Guide", amountCents: 0 }] }, ctx)
    check("the first sale drawn free keeps its heading and prints no $0.00", freeFirst.text.startsWith("You made your first sale") && !/\$0\.00/.test(freeFirst.text + freeFirst.html), freeFirst.subject)
    const long = renderEmail("NEW_SALE", { ...SINGLE, lines: [{ title: "The Complete Wedding Photography Business Masterclass Bundle 2026 Edition", amountCents: 129900 }], amountCents: 129900 }, ctx)
    check("a long title is cut so the subject fits in 60 characters", long.subject.length <= 60 && long.subject.startsWith("You sold The Complete") && long.subject.endsWith("for $1,299.00"), long.subject)
    for (const [label, m] of [["single", e], ["basket", b], ["first", f], ["free", free], ["long", long]] as const) {
      check(`${label}: no emoji, no exclamation, no Cha-Ching, at most 60`, !EMOJI.test(m.subject + m.preview) && !m.subject.includes("!") && !/cha-ching/i.test(m.subject + m.html + m.text) && m.subject.length <= 60)
      check(`${label}: no em dash, en dash or " - "`, !/[—–]/.test(m.html + m.text) && !/ - /.test(visible(m.html) + m.text))
    }
  }

  console.log("\nsale email: the order in it")
  {
    const e = renderEmail("NEW_SALE", SINGLE, ctx)
    /* Changed on purpose with the free wording above: one heading for every sale, paid or free. */
    check("heading and one line", e.text.startsWith("You made a sale\n\nSam Rivera bought Lightroom Presets Vol 2 from your store."))
    check("order number and the creator's time", e.text.includes("Order #1042\nThursday, October 1, 2026 at 9:40 AM GMT+3"))
    check("the line with its option", e.text.includes("Lightroom Presets Vol 2 (Mobile): $29.00"))
    check("total, fee and what the seller receives", e.text.includes("Total paid: $29.00\nStorelib fee: −$1.45\nYou receive: $27.55"))
    check("customer name, email, country by name, payment", e.text.includes("Name: Sam Rivera\nEmail: sam@example.com\nCountry: Portugal\nPayment: Visa ending in 4242"))
    check("no subtotal row for one line with nothing taken off", !e.text.includes("Subtotal"))
    check("a View order button to the order", e.html.includes(`href="${BASE}/app/orders?order=ord-1"`) && /class="e-btn[^"]*"[\s\S]*?View order/.test(e.html) && e.text.includes(`View order:\n${BASE}/app/orders?order=ord-1`))
    check("a quiet Reply to the customer mailto", e.html.includes('href="mailto:sam@example.com?subject=Your%20order%20%231042"') && e.text.includes("Reply to the customer: sam@example.com"))
    check("no greeting: an order notice opens with its heading", !/Hi (there|\w+),/.test(e.text))
    check("the footer carries the settings and unsubscribe links", e.text.includes("Notification settings: ") && e.text.includes("Unsubscribe: "))
    check("text only, no image carries content", (e.html.match(/<img\b/g) ?? []).length === 1 && e.html.includes('alt=""'))

    const b = renderEmail("NEW_SALE", BASKET, ctx)
    check("basket: every line, with option and quantity", b.text.includes("Brand Workbook: $39.00\nSocial Templates (Canva · Qty 2): $30.00\nReview Call (45 minutes): $16.00"))
    check("basket: subtotal, discount with its code, total", b.text.includes("Subtotal: $85.00\nDiscount (AUTUMN10): −$8.50\nTotal paid: $76.50"))
    check("basket: the fee and earnings", b.text.includes("Storelib fee: −$3.83\nYou receive: $72.67"))
    check("basket: the sentence counts the items", b.text.includes("Jordan Lee bought Brand Workbook and 2 more items from your store."))
    const eur = renderEmail("NEW_SALE", { ...SINGLE, currency: "eur" }, ctx)
    check("money in the order's currency", eur.subject.endsWith("for €29.00") && eur.text.includes("You receive: €27.55"), eur.subject)
  }

  console.log("\nsale email: missing data")
  {
    for (const [label, data] of [["empty", {}], ["amount only", { amountCents: 500 }], ["no fee", { ...SINGLE, feeCents: null }], ["junk", { amountCents: "abc", lines: "x", feeCents: NaN, customerEmail: 7, cardLast4: "12" }]] as const) {
      for (const type of ["NEW_SALE", "FIRST_SALE"] as const) {
        const e = renderEmail(type, data as Record<string, unknown>, ctx)
        const all = [e.subject, e.preview, e.html, e.text].join("\n")
        check(`${type} ${label}: no undefined, NaN, null or [object`, !BAD.test(all), all.match(BAD)?.[0])
        check(`${type} ${label}: still a subject and a way to the orders`, e.subject.length > 0 && e.subject.length <= 60 && e.html.includes(`${BASE}/app/orders`))
      }
    }
    const noFee = renderEmail("NEW_SALE", { ...SINGLE, feeCents: null }, ctx)
    check("fee unknown: no fee and no earnings are guessed", !noFee.text.includes("Storelib fee") && !noFee.text.includes("You receive"))
    check("fee unknown: the preview says the total reaches the balance", noFee.preview === "Sam bought Lightroom Presets Vol 2. $29.00 goes to your balance.", noFee.preview)
    const none = renderEmail("NEW_SALE", { amountCents: 500 }, ctx)
    /* Changed on purpose: the fallback subject says a sale was made, as the rest of the email now does. */
    check("nothing but an amount: a plain subject and no customer section", none.subject === "You made a sale for $5.00" && !none.text.includes("Customer") && !none.html.includes("mailto:"), none.subject)
  }

  console.log("\nsale email: hostile input")
  {
    const evil = {
      ...SINGLE,
      productTitle: `<img src=x onerror=alert(1)>`,
      lines: [{ title: `<script>alert(1)</script>`, variantName: `"><b>x</b>`, amountCents: 100 }],
      customerName: `"><svg onload=alert(1)>`,
      customerEmail: `sam@example.com?bcc=victim@example.com`,
      couponCode: `<i>X</i>`,
      discountCents: 10,
      customerCountry: `<u>c</u>`,
    }
    const e = renderEmail("NEW_SALE", evil, ctx)
    check("markup in names prints as text", !/<script|<svg|<img src=x|<b>x|<i>X|<u>c/.test(e.html) && e.html.includes("&lt;script&gt;"))
    check("an address with extras never becomes a mailto", !e.html.includes("mailto:") && !e.text.includes("Reply to the customer"))
    check("mailtoUrl takes only a plain address", mailtoUrl("a.b+c@ex-ample.co.uk") === "mailto:a.b+c@ex-ample.co.uk" && !mailtoUrl("a@b.com\nbcc:x@y.z") && !mailtoUrl("javascript:alert(1)//@x.com") && !mailtoUrl("a@b") && !mailtoUrl(null))
    const hrefs = [...e.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1])
    check("every other link is Storelib's", hrefs.every((h) => h.startsWith(`${BASE}/`)), hrefs)
    const long = renderEmail("NEW_SALE", { ...SINGLE, customerName: "x".repeat(5000), lines: [{ title: "y".repeat(5000), amountCents: 100 }] }, ctx)
    check("very long values are cut", long.subject.length <= 60 && long.html.length < 40_000)
  }

  console.log("\nsaleEmailData: a basket read as one order")
  {
    process.env.MAILGUN_API_KEY = "key-test"
    process.env.MAILGUN_DOMAIN = "mg.storelib.com"
    process.env.SITE_URL = BASE
    const { saleEmailData, sendSellerNotificationEmail } = await import("../lib/email")

    const t0 = "2026-10-01T06:40:00.000Z"
    const later = "2026-10-01T06:40:01.000Z"
    const db = fakeDb({
      products: [{ id: "p1", title: "Brand Workbook", creator_id: "c1" }, { id: "p2", title: "Social Templates", creator_id: "c1" }, { id: "p9", title: "Old", creator_id: "c1" }],
      orders: [
        { id: "old-1", product_id: "p9", amount_cents: 1000, status: "completed", created_at: "2026-09-01T00:00:00.000Z", stripe_session_id: null },
        { id: "old-2", product_id: "p9", amount_cents: 1000, status: "completed", created_at: "2026-09-02T00:00:00.000Z", stripe_session_id: "cs_old" },
        { id: "old-3", product_id: "p9", amount_cents: 1000, status: "completed", created_at: "2026-09-02T00:00:00.500Z", stripe_session_id: "cs_old" },
        row("b-1", "p1", 3510, 180, t0),
        row("b-2", "p2", 2700, 135, later),
      ],
      creators: [{ id: "c1", user_id: "u1", support_email: "ana@example.com", headline: "Ana", slug: "ana" }],
      profiles: [{ id: "u1", email: "ana@example.com", display_name: "Ana Lopez", timezone: "Europe/Lisbon" }],
    })
    const params = {
      orderId: "b-1", creatorId: "c1", sellerEmail: "ana@example.com", productTitle: "Brand Workbook", buyerFirstName: "Jordan", buyerLastName: "Lee",
      buyerEmail: "jordan@example.com", amountCents: 3510, feeCents: 0,
      sale: { couponCode: "AUTUMN10", lines: [{ orderId: "b-1", quantity: 1, discountCents: 390 }, { orderId: "b-2", quantity: 2, discountCents: 300 }] },
    }
    const sale = await saleEmailData(db, params)
    const d = sale.data as Record<string, any>
    check("both lines of the session, in order", sale.orderIds.join() === "b-1,b-2" && d.lines.map((l: any) => l.title).join() === "Brand Workbook,Social Templates")
    check("each line before the code, with its quantity", d.lines[0].amountCents === 3900 && d.lines[1].amountCents === 3000 && d.lines[1].quantity === 2)
    check("subtotal, discount and total add up", d.subtotalCents === 6900 && d.discountCents === 690 && d.amountCents === 6210 && d.couponCode === "AUTUMN10")
    check("the fee is the lines' fees", d.feeCents === 315)
    check("numbered as the Orders page numbers it (a basket counted once)", d.orderNumber === "1003", d.orderNumber)
    check("not a first sale when paid orders came before", sale.first === false)
    check("customer from the row", d.customerName === "Jordan Lee" && d.customerEmail === "jordan@example.com" && d.customerCountry === "Portugal" && d.cardBrand === "visa")

    const fresh = fakeDb({ products: [{ id: "p1", title: "Guide", creator_id: "c2" }], orders: [row("n-1", "p1", 1900, 95, t0, null)], creators: [], profiles: [] })
    const firstSale = await saleEmailData(fresh, { ...params, orderId: "n-1", creatorId: "c2", sale: undefined })
    check("the creator's first paid order is a first sale, numbered #1001", firstSale.first === true && (firstSale.data as any).orderNumber === "1001")
    const freeDb = fakeDb({ products: [{ id: "p1", title: "Guide", creator_id: "c2" }], orders: [row("f-1", "p1", 0, 0, t0, null)], creators: [], profiles: [] })
    check("a free claim is never a first sale", (await saleEmailData(freeDb, { ...params, orderId: "f-1", creatorId: "c2", amountCents: 0, sale: undefined })).first === false)

    const unreadable = await saleEmailData(fakeDb({}, true), { ...params, orderId: "x-1", amountCents: 1500, feeCents: 0, sale: { discountCents: 500, couponCode: "HALF" } })
    const u = unreadable.data as Record<string, any>
    check("an unreadable order keeps the caller's figures and guesses no fee", u.amountCents === 1500 && u.subtotalCents === 2000 && u.discountCents === 500 && u.feeCents === null && u.orderNumber === "")
    const ur = renderEmail("NEW_SALE", u, ctx)
    check("and still renders cleanly", !BAD.test(ur.html + ur.text) && ur.subject === "You sold Brand Workbook for $15.00", ur.subject)

    console.log("\nthe sender")
    const sent: FormData[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: { method?: string; body?: FormData }) => {
      if (init?.method === "POST") {
        sent.push(init.body as FormData)
        return new Response(JSON.stringify({ id: "<m@x>", message: "Queued" }), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    }) as typeof fetch
    try {
      const r1 = await sendSellerNotificationEmail(db, params)
      check("sent once for the basket", r1.success === true && sent.length === 1, { r1, n: sent.length })
      const form = sent[0]
      check("from Storelib, reply to support, to the creator", /^Storelib <.+@.+>$/.test(String(form.get("from"))) && form.get("h:Reply-To") === "support@storelib.com" && form.get("to") === "ana@example.com", [form.get("from"), form.get("h:Reply-To"), form.get("to")])
      check("subject, plain text part and the new_sale tag", form.get("subject") === "You sold Brand Workbook and 1 more for $62.10" && String(form.get("text")).includes("Order #1003") && form.getAll("o:tag").includes("new_sale"), form.get("subject"))
      check("the HTML is the Storelib layout", String(form.get("html")).includes("You made a sale") && String(form.get("html")).includes("max-width:560px"))
      check("the log says sent and both lines are marked told", db.tables.email_logs.filter((l: any) => l.status === "sent").map((l: any) => l.order_id).sort().join() === "b-1,b-2" && db.tables.orders.filter((o: any) => o.seller_notified_at).length === 2)
      const r2 = await sendSellerNotificationEmail(db, { ...params, orderId: "b-2" })
      check("the second line's call sends nothing: the basket was one email", r2.success && sent.length === 1)
      const r3 = await sendSellerNotificationEmail(db, params)
      check("and the first again sends nothing", r3.success && sent.length === 1)

      const off = fakeDb({ products: [{ id: "p1", title: "Guide", creator_id: "c3" }], orders: [row("o-1", "p1", 1900, 95, t0, null)], creators: [{ id: "c3", user_id: "u3" }], profiles: [], notification_preferences: [{ user_id: "u3", category: "sales", channel: "email", enabled: false }] })
      const r4 = await sendSellerNotificationEmail(off, { ...params, orderId: "o-1", creatorId: "c3", sale: undefined })
      check("sales emails turned off: skipped, nothing sent", r4.skipped === true && sent.length === 1)

      /* A free claim (checkout/quick-free passes amountCents 0) still mails the seller, and still says a sale. */
      const freeStore = fakeDb({ products: [{ id: "p1", title: "Starter Pack", creator_id: "c5" }], orders: [row("free-1", "p1", 0, 0, t0, null)], creators: [{ id: "c5", user_id: "u5" }], profiles: [] })
      const rFree = await sendSellerNotificationEmail(freeStore, { ...params, orderId: "free-1", creatorId: "c5", productTitle: "Starter Pack", amountCents: 0, feeCents: 0, sale: undefined })
      const fFree = sent[sent.length - 1]
      check("a free claim still sends the seller's email", rFree.success === true && rFree.skipped !== true && String(fFree.get("subject")) === "You sold Starter Pack", [rFree, fFree.get("subject")])
      check("and it says a sale was made, with Free in place of $0.00", String(fFree.get("text")).includes("You made a sale") && String(fFree.get("text")).includes("Total: Free") && !String(fFree.get("text")).includes("$0.00"))
      check("a free claim is logged as one seller notification", freeStore.tables.email_logs.filter((l: any) => l.order_id === "free-1" && l.email_type === "seller_notification" && l.status === "sent").length === 1)

      const business = fakeDb({ products: [{ id: "p1", title: "Guide", creator_id: "c4" }], orders: [row("o-2", "p1", 1900, 95, t0, null)], creators: [{ id: "c4", user_id: "u4" }], profiles: [] })
      await sendSellerNotificationEmail(business, { ...params, orderId: "o-2", creatorId: "c4", sellerEmail: "owner+slb-1a2b3c4d@example.com", sale: undefined })
      const f2 = sent[sent.length - 1]
      check("a second business's tagged address is mailed to the owner's own inbox", f2.get("to") === "owner@example.com", f2.get("to"))
      check("a first paid sale is drawn as FIRST_SALE, with both tags", String(f2.get("subject")).startsWith("Your first sale: Guide") && f2.getAll("o:tag").includes("first_sale") && f2.getAll("o:tag").includes("new_sale"), f2.get("subject"))
    } finally {
      globalThis.fetch = realFetch
    }
  }

  console.log("\nthe sender's source")
  {
    const src = readFileSync("lib/email.tsx", "utf8")
    const sender = src.slice(src.indexOf("export async function sendSellerNotificationEmail"), src.indexOf("export async function sendOrderEmails"))
    check("once per order first, then the preference", sender.indexOf('wasEmailAlreadySent(admin, orderId, "seller_notification")') < sender.indexOf("await sellerWantsSaleEmail(admin, creatorId)") && sender.indexOf("await sellerWantsSaleEmail") > 0)
    check("the preference is the engine's NEW_SALE email setting", /allowed\(admin, creator\.user_id, entryFor\("NEW_SALE"\), "email"\)/.test(src))
    check("a second business's address goes to the owner", /ownerAddress\(finalSellerEmail\)/.test(sender) && /ownerAddress\(sellerEmail\)/.test(src))
    check("retries, the email log and the order status stay", /withRetry\(/.test(sender) && /updateEmailLog\(admin, logId, "sent"\)/.test(sender) && /updateOrderEmailStatus\(admin, orderId, "seller", true\)/.test(sender) && /updateOrderEmailStatus\(admin, orderId, "seller", false, errorMessage\)/.test(sender))
    check("drawn by the notification templates, with a text part and a tag", /renderEmail\(first \? "FIRST_SALE" : "NEW_SALE"/.test(sender) && /text: rendered\.text/.test(sender) && /name: "new_sale"/.test(sender))
    check("no old markup or Cha-Ching left", !/Cha-Ching|sellerEmailHtml|sellerEmailText|💰/.test(src))
    check("no footer says Storelib is only digital products", !/Helping creators sell digital products|digital products are making an impact/.test(src))
    check("the engine sends neither sale email itself, so a first sale is one email", REGISTRY.NEW_SALE.emailSentElsewhere === true && REGISTRY.FIRST_SALE.emailSentElsewhere === true)
    const cart = readFileSync("lib/checkout/fulfil-cart-session.ts", "utf8")
    check("a basket passes its quantities and code", /sale: \{ couponCode: s\.couponCode, lines: saleLines \}/.test(cart))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
  process.exit(0)
}

function row(id: string, product: string, amount: number, fee: number, at: string, session: string | null = "cs_basket") {
  return {
    id, product_id: product, amount_cents: amount, tip_cents: 0, fee_cents: fee, currency: "usd", status: "completed", created_at: at,
    stripe_session_id: session, buyer_email: "jordan@example.com", buyer_first_name: "Jordan", buyer_last_name: "Lee", buyer_country: "Portugal",
    payment_method: "card", card_brand: "visa", card_last4: "4242", variant_name: null, seller_notified_at: null,
  }
}

/* A small in-memory Supabase: the filters the sender uses, nothing more. */
function fakeDb(seed: Record<string, any[]>, broken = false) {
  const tables: Record<string, any[]> = { email_logs: [], ...Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))])) }
  let ids = 0
  function query(table: string) {
    const filters: Array<(r: any) => boolean> = []
    let head = false
    let wantCount = false
    let sort: { col: string; asc: boolean } | null = null
    let from = 0
    let to = Infinity
    let op: "select" | "insert" | "update" = "select"
    let payload: any = null
    const rows = () => (tables[table] ??= [])
    const run = () => {
      if (broken) return { data: null, error: { message: "down" }, count: null }
      if (op === "insert") {
        const r = { id: `log-${++ids}`, ...payload }
        rows().push(r)
        return { data: r, error: null }
      }
      let out = rows().filter((r) => filters.every((f) => f(r)))
      if (op === "update") {
        for (const r of out) Object.assign(r, payload)
        return { data: null, error: null }
      }
      if (sort) out = [...out].sort((a, b) => (String(a[sort!.col]) < String(b[sort!.col]) ? -1 : 1) * (sort!.asc ? 1 : -1))
      out = out.slice(from, to === Infinity ? undefined : to + 1)
      return { data: head ? null : out, error: null, count: wantCount ? out.length : null }
    }
    const q: any = {
      select: (_cols?: string, opts?: { count?: string; head?: boolean }) => { if (opts?.head) head = true; if (opts?.count) wantCount = true; return q },
      insert: (p: any) => { op = "insert"; payload = p; return q },
      update: (p: any) => { op = "update"; payload = p; return q },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q },
      in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q },
      lte: (c: string, v: string) => { filters.push((r) => String(r[c]) <= v); return q },
      gt: (c: string, v: number) => { filters.push((r) => Number(r[c]) > v); return q },
      not: (c: string, _op: string, list: string) => { const out = list.replace(/[()]/g, "").split(","); filters.push((r) => !out.includes(r[c])); return q },
      order: (col: string, o?: { ascending?: boolean }) => { sort = { col, asc: o?.ascending !== false }; return q },
      range: (a: number, b: number) => { from = a; to = b; return q },
      limit: (n: number) => { to = from + n - 1; return q },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
      single: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: r.error } },
      then: (res: (v: any) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
    }
    return q
  }
  return {
    tables,
    from: (t: string) => query(t),
    auth: { admin: { getUserById: async () => ({ data: { user: null } }) } },
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
