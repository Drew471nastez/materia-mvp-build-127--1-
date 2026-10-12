/**
 * ===========================================================================
 *  ROUND 24 (C24): BUYERS REACH THE SHOP, AND WHAT A CART ASKED REACHES THE ORDER
 * ===========================================================================
 *   1. Contact the shop from the order page and the receipt: topics, photos
 *      through the upload checks, token scoped, rate limited, spam safe; the
 *      seller answers on the order; Ask Storelib for help after three days
 *      unanswered on a problem with the goods or a refund.
 *   2. An imported Shopify theme's cart attributes and line item properties
 *      reach checkout, the order, the seller's order page and email.
 *   3. Delivery and pickup on product pages saved before the block.
 *   4. A tracked parcel never marked delivered: the return window ends, and
 *      the shipment is closed as delivery not confirmed after 60 days.
 *
 * No network: every fetch is stubbed, and a call to any real host fails.
 *
 *   npx tsx tests/buyer24.test.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { fakeDb } from "./_fake-db"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* Every outbound call is answered here; Mailgun's is recorded, anything else fails the suite. */
const mails: { to: string; subject: string; html: string }[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("http://mailgun.test/")) {
    const form = init?.body as FormData
    mails.push({ to: String(form.get("to")), subject: String(form.get("subject")), html: String(form.get("html")) })
    return new Response(JSON.stringify({ id: `<m${mails.length}@test>` }), { status: 200 })
  }
  failed++
  console.log(`  FAIL  a real host was called: ${url}`)
  throw new Error(`no network in tests: ${url}`)
}) as typeof fetch
process.env.MAILGUN_API_KEY = "key-test"
process.env.MAILGUN_DOMAIN = "mg.test"
process.env.MAILGUN_BASE_URL = "http://mailgun.test"
process.env.RECEIPT_TOKEN_SECRET = "c24-test-secret"
process.env.NEXT_PUBLIC_APP_URL = "https://storelib.test"

/* A real 1x1 PNG, and one carrying a text chunk (stripped before it is kept). */
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"))
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0x00, ...new Array(200).fill(0)])

function fakeStorage(opts: { missing?: boolean } = {}) {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>()
  return {
    objects,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, bytes: Uint8Array, o: { contentType: string }) => {
          if (opts.missing) return { error: { message: "Bucket not found", statusCode: "404" } }
          objects.set(`${bucket}/${path}`, { bytes, type: o.contentType })
          return { error: null }
        },
        remove: async (paths: string[]) => {
          for (const p of paths) objects.delete(`${bucket}/${p}`)
          return { error: null }
        },
        createSignedUrls: async (paths: string[], seconds: number) => ({ data: paths.map((p) => ({ signedUrl: `https://files.test/${bucket}/${p}?ttl=${seconds}` })), error: null }),
      }),
    },
  }
}

const photo = (name: string, type: string, bytes: Uint8Array) => ({ name, type, size: bytes.byteLength, bytes: async () => bytes })

async function main() {
  const cases = await import("../lib/support/cases")
  const server = await import("../lib/support/cases-server")
  const photos = await import("../lib/support/case-photos-server")
  const { returnWindow, DELIVERY_GRACE_DAYS, ASSUMED_TRANSIT_DAYS } = await import("../lib/physical/status")
  const { cartAttributes, readSiteCheckoutParams, siteCheckoutHref, visibleAttributes } = await import("../lib/checkout/site-checkout")
  const { decodeItems, encodeItems, lineProperties } = await import("../lib/physical/cart-link")
  const { withDeliveryBlock, withProductBlocks, mainProductSection, DELIVERY_ADDED, AUTO_DELIVERY_ID } = await import("../lib/website-builder/product-page")
  const { closeUnconfirmedDeliveries, isUnconfirmed, UNCONFIRMED_EVENT } = await import("../lib/physical/unconfirmed-delivery-server")
  const { physicalSaleFacts, withPhysicalSale, sellerKindForEvent, sellerCommerceEmail } = await import("../lib/notify/seller-commerce")
  const { sellerEmailFor } = await import("../lib/physical/events-server")

  /* ───────────────────────────── 1. topics, the rule, spam ───────────────── */
  section("Contact the shop: what a buyer can write about")
  const phys = cases.reasonsFor("physical")
  check("a parcel: question, change address, cancel, return, refund, damaged, missing, other", ["question", "change_address", "cancel", "return", "refund", "damaged", "missing_item", "other"].every((r) => phys.includes(r as never)), phys)
  check("a download: question, can't open it, refund, other; nothing about an address", cases.reasonsFor("digital").join() === "question,access,refund,other")
  check("every topic has its words", cases.CASE_REASONS.every((r) => cases.CASE_REASON_LABELS[r]?.length > 3))
  check("the new topics are the ones part 164 adds", [...cases.REASONS_SINCE_164].sort().join() === "cancel,change_address,question")
  const sql = read("supabase/sql/run-now/164_buyer_contact_and_cart_attributes.sql")
  check("  and part 164's check takes every topic there is", cases.CASE_REASONS.every((r) => sql.includes(`'${r}'`)))
  check("a filled hidden field is refused like any other bad message", cases.readNewCase({ reason: "question", message: "Where is my parcel, please?", website: "http://spam" }, "physical").ok === false)
  check("a wall of links is refused", cases.readNewCase({ reason: "question", message: "http://a.x http://b.x http://c.x http://d.x buy now" }, "physical").ok === false)
  check("a buyer's real question is taken", cases.readNewCase({ reason: "change_address", message: "Please send it to Strada Lipscani 12, Bucharest." }, "physical").ok === true)
  check("change address is not a download's topic", cases.readNewCase({ reason: "change_address", message: "Please send it somewhere else." }, "digital").ok === false)

  section("Ask Storelib for help: three days unanswered, on the goods or a refund")
  const day = 86_400_000
  const now = Date.parse("2026-10-12T12:00:00Z")
  const at = (n: number) => new Date(now - n * day).toISOString()
  const esc = (reason: string, msgs: [string, number][], extra: Partial<{ status: string; escalated: boolean }> = {}) =>
    cases.buyerEscalation({ reason: reason as never, status: (extra.status ?? "store") as never, escalated: extra.escalated ?? false }, msgs.map(([author, ago]) => ({ author: author as never, createdAt: at(ago) })), now)
  check("damaged, written 4 days ago, no answer: the buyer can ask", esc("damaged", [["buyer", 4]]).can)
  check("damaged, written 2 days ago: not yet, and the day it opens is known", (() => { const e = esc("damaged", [["buyer", 2]]); return !e.can && e.from === new Date(now + day).toISOString() })())
  check("counted from the first message the store hasn't answered", esc("refund", [["buyer", 10], ["store", 9], ["buyer", 1]]).can === false && esc("refund", [["buyer", 10], ["store", 9], ["buyer", 4]]).can === true)
  check("the store answered last: nothing to escalate", esc("missing_item", [["buyer", 10], ["store", 5]]).from === null)
  check("a question, an address change, a cancellation or a return stay with the shop", ["question", "change_address", "cancel", "return", "other"].every((r) => esc(r, [["buyer", 30]]).can === false))
  check("resolved, or Storelib already in: no button", !esc("damaged", [["buyer", 9]], { status: "resolved" }).can && !esc("damaged", [["buyer", 9]], { escalated: true }).can)

  /* ───────────────────────────── 1. photos ───────────────────────────────── */
  section("Photos go through the upload checks, into a private bucket")
  {
    const st = fakeStorage()
    const kept = await photos.keepCasePhotos(st, "case-1", [photo("box.png", "image/png", PNG)])
    check("a real picture is kept, under the case", kept.ok && kept.refs.length === 1 && kept.refs[0].path.startsWith("case-1/") && st.objects.size === 1, kept)
    check("  in the private order-case-photos bucket", [...st.objects.keys()][0]?.startsWith("order-case-photos/case-1/"))
    const exe = await photos.keepCasePhotos(st, "case-1", [photo("box.png", "image/png", EXE)])
    check("a program named .png is refused, with the file's name", exe.ok === false && /box\.png/.test(exe.ok === false ? exe.error : ""), exe)
    const pdf = await photos.keepCasePhotos(st, "case-1", [photo("x.pdf", "application/pdf", PNG)])
    check("a file that isn't a photo type is refused", !pdf.ok)
    const five = await photos.keepCasePhotos(st, "case-1", Array.from({ length: 5 }, (_, i) => photo(`p${i}.png`, "image/png", PNG)))
    check("five photos are refused; four is the most", five.ok === false && /4 photos/.test(five.ok === false ? five.error : ""))
    const big = await photos.keepCasePhotos(st, "case-1", [{ name: "big.png", type: "image/png", size: 9 * 1024 * 1024, bytes: async () => PNG }])
    check("a photo over 8 MB is refused", !big.ok)
    const none = await photos.keepCasePhotos(fakeStorage({ missing: true }), "case-1", [photo("box.png", "image/png", PNG)])
    check("before part 164 (no bucket): nothing kept, and it says so", none.ok && none.refs.length === 0 && none.notKept)
    const signed = await photos.signCasePhotos(st, kept.ok ? kept.refs : [])
    check("each read gets a link that lasts an hour", signed.length === 1 && /ttl=3600/.test(signed[0].url))
    check("a stored path outside the case is never signed", photos.refsOf([{ path: "other-case/x.png", type: "image/png", size: 1, name: "x" }, { path: "case-1/../x", type: "image/png", size: 1, name: "y" }], "case-1").length === 0)
    const cps = read("lib/support/case-photos-server.ts")
    check("the location is stripped before it is kept", /stripImageMetadata\(raw\)/.test(cps) && /context: "public_image"/.test(cps))
  }

  /* ───────────────────────────── 1. the server ───────────────────────────── */
  section("A case on the order: opened with the order's own token, never another's")
  const TOKEN = "tok_c24_aaaaaaaaaaaaaaaaaaaaaaaa"
  const CO = "11111111-1111-4111-8111-111111111111"
  const CREATOR = "22222222-2222-4222-8222-222222222222"
  const mkDb = (opts: { oldCheck?: boolean; noPhotosColumn?: boolean } = {}) => {
    const db = fakeDb({
      commerce_checkouts: [{ id: CO, creator_id: CREATOR, buyer_email: "Ana@Example.com", buyer_name: "Ana", status: "paid", receipt_token: TOKEN }],
      creators: [{ id: CREATOR, display_name: "Bread Studio", support_email: "shop@bread.test", user_id: "u1" }],
      store_settings: [{ creator_id: CREATOR, store_name: "Bread Studio", phone: "+40 712 345 678", contact_email: "shop@bread.test" }],
      order_cases: [],
      order_case_messages: [],
      /* An earlier order of the store's, then this one: the Orders page calls this one #1002. */
      orders: [
        { id: "0e000000-0000-4000-8000-000000000001", creator_id: CREATOR, stripe_session_id: "cs_old", checkout_id: null, created_at: "2026-09-01T10:00:00Z" },
        { id: "0e000000-0000-4000-8000-000000000002", creator_id: CREATOR, stripe_session_id: "pi_this", checkout_id: CO, created_at: "2026-10-01T10:00:00Z" },
      ],
    })
    const st = fakeStorage()
    const base = db.from.bind(db)
    /* The database's own checks, as far as these paths reach: part 117's topic list, and part 164's photos column. */
    ;(db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b = base(t) as Record<string, (...a: any[]) => unknown>
      if (t === "order_cases" && opts.oldCheck) {
        const insert = b.insert
        b.insert = (payload: Record<string, unknown>) => (cases.REASONS_SINCE_164.has(payload.reason as never) ? { select: () => ({ single: async () => ({ data: null, error: { code: "23514", message: "violates check constraint" } }) }) } : insert(payload))
      }
      if (t === "order_case_messages" && opts.noPhotosColumn) {
        const insert = b.insert
        const select = b.select
        b.insert = (payload: Record<string, unknown>) => ("photos" in payload ? Promise.resolve({ data: null, error: { code: "PGRST204", message: "no photos column" } }) : insert(payload))
        b.select = (cols: string, o?: unknown) => (/photos/.test(cols ?? "") ? { eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: null, error: { code: "42703", message: "column photos does not exist" } }) }) }), order: () => ({ limit: async () => ({ data: null, error: { code: "42703", message: "column photos does not exist" } }) }) }) } : select(cols, o))
      }
      return b
    }
    return Object.assign(db, { storage: st.storage, objects: st.objects })
  }
  {
    check("a token that isn't one opens nothing", (await server.orderForToken(mkDb(), "physical", "short")) === null)
    const db = mkDb()
    const order = await server.orderForToken(db, "physical", TOKEN)
    check("the order's own token finds it, with the buyer's email from the order", order?.checkoutId === CO && order?.buyerEmail === "ana@example.com", order)
    mails.length = 0
    const opened = await server.openCase(db, order!, { reason: "damaged", message: "The jar arrived broken, photo attached.", photos: [photo("jar.png", "image/png", PNG)] }, "https://storelib.test")
    check("the case opens, with its private link", opened.ok && /\/order-help\/[0-9a-f-]{36}\?k=/.test(opened.ok ? opened.link : ""), opened)
    const msg = db.tables.order_case_messages[0]
    check("the first message keeps its photo's path, never an address", Array.isArray(msg?.photos) && msg.photos.length === 1 && !/https?:/.test(JSON.stringify(msg.photos)))
    check("the seller is emailed, told there is a photo, with the button to answer", mails.some((m) => m.to === "shop@bread.test" && /A buyer needs help/.test(m.subject) && /1 photo/.test(m.html) && /Answer the buyer/.test(m.html)), mails.map((m) => m.subject))
    check("  naming the order by the Orders page's number, the buyer's reference beside it", mails.some((m) => m.to === "shop@bread.test" && /order #1002$/.test(m.subject) && /Buyer&#39;s reference 11111111|Buyer's reference 11111111/.test(m.html)), mails.map((m) => m.subject))
    check("  while the buyer's email keeps the buyer's reference only", mails.filter((m) => m.to === "ana@example.com").every((m) => !/#1002/.test(m.subject + m.html) && /11111111/.test(m.html)))
    check("the buyer is emailed the link back to the conversation", mails.some((m) => m.to === "ana@example.com" && /order-help\//.test(m.html)))
    const id = opened.ok ? opened.id : ""
    const k = new URL(opened.ok ? opened.link : "https://x").searchParams.get("k") ?? ""
    const view = await server.getCaseForBuyer(db, id, k, now)
    check("the buyer reads it with the link, the photo as an hour's link", view.ok && view.messages[0]?.photos?.[0]?.url.includes("ttl=3600") === true, view)
    check("a wrong key reads nothing", !(await server.getCaseForBuyer(db, id, "nope", now)).ok)

    /* Three days: the buyer may not ask Storelib in yet. */
    const early = await server.buyerAct(db, id, k, { kind: "escalate", body: null }, "https://storelib.test", Date.now() + 1 * day)
    check("asking Storelib on day one is refused, with the date it opens", early.ok === false && /from /.test(early.ok === false ? early.error : ""), early)
    mails.length = 0
    const later = await server.buyerAct(db, id, k, { kind: "escalate", body: "Still nothing from the shop." }, "https://storelib.test", Date.now() + 4 * day)
    const row = db.tables.order_cases[0]
    check("on day four it goes to Storelib", later.ok && row.escalated === true && row.status === "storelib", { later, row })
    check("  Storelib's inbox is emailed, and the seller is told", mails.some((m) => /\[Case\]/.test(m.subject)) && mails.some((m) => m.to === "shop@bread.test"), mails.map((m) => `${m.to}: ${m.subject}`))
    check("  it is in /admin's Resolution center queue", (await server.adminListCases(db, { view: "storelib" })).ok)

    mails.length = 0
    const reply = await server.storeAct(db, CREATOR, id, { kind: "reply", body: "Sorry! A new jar goes out today." }, "https://storelib.test")
    check("the store answers from the order; the buyer gets it by email with the link back", reply.ok && mails.some((m) => m.to === "ana@example.com" && /replied/.test(m.subject) && /order-help\//.test(m.html)))
    const forOrder = await server.listCasesForStore(db, CREATOR, { checkoutId: CO })
    check("Support and the order page show the Orders page's number on the case", forOrder.ok && forOrder.cases[0]?.sellerNumber === "#1002")
    check("the order page lists this order's cases only", forOrder.ok && forOrder.cases.length === 1 && (await server.listCasesForStore(db, CREATOR, { checkoutId: "33333333-3333-4333-8333-333333333333" })).ok)
    const again = await server.buyerAct(db, id, k, { kind: "reply", body: "Thank you!" }, "https://storelib.test")
    const twice = await server.buyerAct(db, id, k, { kind: "reply", body: "Thank you!" }, "https://storelib.test")
    check("the same words twice inside ten minutes are kept once", again.ok && twice.ok && db.tables.order_case_messages.filter((m) => m.body === "Thank you!").length === 1)
  }
  {
    const db = mkDb({ oldCheck: true, noPhotosColumn: true })
    const order = await server.orderForToken(db, "physical", TOKEN)
    const opened = await server.openCase(db, order!, { reason: "change_address", message: "Please send it to Strada Lipscani 12.", photos: [photo("door.png", "image/png", PNG)] }, "https://storelib.test")
    const row = db.tables.order_cases[0]
    check("before part 164: a new topic is filed under Something else, the topic in its first line", opened.ok && row?.reason === "other" && /^Change the address:\n/.test(db.tables.order_case_messages[0]?.body ?? ""), { row, m: db.tables.order_case_messages[0] })
    check("  the words go, the photo is given back, and the buyer is told", opened.ok && opened.photosNotKept === true && db.objects.size === 0)
    const k = new URL(opened.ok ? opened.link : "https://x").searchParams.get("k") ?? ""
    check("  and the thread still reads without the column", (await server.getCaseForBuyer(db, opened.ok ? opened.id : "", k)).ok)
  }
  {
    const route = read("app/api/order-help/route.ts")
    check("opening is rate limited by address and by the order's email", /bucket: "order-help"/.test(route) && /emailSubject\(order\.buyerEmail\)/.test(route))
    check("replies are rate limited per case", /bucket: "order-help-reply"/.test(read("app/api/order-help/[id]/route.ts")))
    check("both take a form with photos or JSON", /readCaseRequest\(request\)/.test(route) && /readCaseRequest\(request\)/.test(read("app/api/order-help/[id]/route.ts")))
    check("the store's list route reads one order's cases", /checkout: isUuid|q\.get\("checkout"\)/.test(read("app/api/store/cases/route.ts")))
  }

  section("The buyer's page: one panel with every way to reach the shop")
  {
    const view = read("app/checkout/physical/order/[token]/order-status-view.tsx")
    const help = read("components/support/order-help.tsx")
    check("Contact the shop, the topics and photos", /Contact the shop/.test(help) && /reasonsFor\(kind\)/.test(help) && /<CasePhotoPicker/.test(help) && /name="website"/.test(help))
    check("Cancel order and Return items are offered in the same panel", /cancel=\{cancel === "can_request" \? \{ kind: "cancel", label: "Cancel order"/.test(view) && /returns=\{canReturn \? \{ kind: "return", label: "Return items"/.test(view))
    check("  choosing Cancel or Return as the topic points to that flow", /reason === "cancel" \? cancel : reason === "return" \? returns/.test(help))
    check("the shop's email and phone are in it", /contact=\{\{ email: shop\.email, phone: shop\.phone \?\? null \}\}/.test(view) && /mailto:\$\{contact\.email\}/.test(help) && /tel:\$\{contact\.phone/.test(help))
    check("the receipt (downloads) has it too, with the shop's email", /<OrderHelp kind="digital"[^>]*contact=\{\{ email: receipt\.seller\.supportEmail/.test(read("app/receipt/[token]/receipt-view.tsx")))
    const caseView = read("app/order-help/[id]/case-view.tsx")
    check("the conversation page: photos, and Ask Storelib for help only when the rule allows", /CasePhotoStrip/.test(caseView) && /escalation\.can \?/.test(caseView) && /Ask Storelib for help/.test(caseView))
    check("the seller sees the messages on the order, with the reply box", /<OrderMessagesCard checkoutId=\{parcel\?\.id \?\? null\}/.test(read("app/app/orders/order-detail.tsx")) && /<BuyerCaseThread key=\{openId\} id=\{openId\} embedded/.test(read("components/support/order-messages-card.tsx")))
    check("Storelib sees the photos in Resolution center", /<CasePhotoStrip photos=\{m\.photos\} dark \/>/.test(read("app/admin/resolution/buyer-cases.tsx")))
    check("no inbound email parsing exists, so replies thread by links (said in the seller's email)", !/inbound/i.test(read("lib/mailgun.ts")) && /A reply to this email reaches the buyer but is not kept on the case/.test(read("lib/support/cases-server.ts")))
  }

  /* ───────────────────────────── 2. cart attributes ──────────────────────── */
  section("Cart attributes and line item properties, from the theme to the order")
  {
    check("attributes: plain, small, at most 20", (() => { const a = cartAttributes({ "Gift message": "  Happy birthday\u0007 ", Empty: "", ["x".repeat(150)]: "y", n: 5 }); return a?.["Gift message"] === "Happy birthday" && !("Empty" in a) && a.n === "5" && Object.keys(a).some((k) => k.length === 100) })())
    check("  a JSON string is read, junk is nothing", cartAttributes('{"Date":"Friday"}')?.Date === "Friday" && cartAttributes("not json") === null && cartAttributes([1, 2]) === null)
    check("  the theme's own (a leading _) is kept for the seller, not shown to the buyer", visibleAttributes({ _tracking: "x", Gift: "yes" }).length === 1)
    const href = siteCheckoutHref({ items: [{ productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 2, properties: { Engraving: "Ana" } }], note: "Leave at the door", attributes: { "Gift message": "Love you" } })
    const params = readSiteCheckoutParams(new URL(`https://x.test${href}`).searchParams)
    check("the checkout link carries the attributes and each line's properties", params.attributes?.["Gift message"] === "Love you" && params.items[0]?.properties?.Engraving === "Ana" && params.note === "Leave at the door", params)
    const both = decodeItems(encodeItems([{ productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 1, customPriceCents: 700, properties: { Size: "XL" } }]))
    check("  a named price and properties travel together", both[0]?.customPriceCents === 700 && both[0]?.properties?.Size === "XL")
    check("  old links (no properties) read as before", decodeItems(encodeItems([{ productId: "00000000-0000-4000-8000-000000000001", variantId: null, quantity: 3 }]))[0]?.properties === undefined)
    check("  properties are held to ten plain names", Object.keys(lineProperties(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`k${i}`, "v"]))) ?? {}).length === 10)

    const { answer, readCartCookie, writeCartCookie, attributesAfter } = await import("../lib/storelib-theme/compat/site")
    const site = await compatSite()
    const st = { cart: [] as never[], note: "", attributes: {} as Record<string, string> }
    const ask = async (method: string, path: string, body: Record<string, unknown> | null, ajax = true) => {
      const [p, q] = path.split("?")
      const r = await answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body, cart: st.cart, note: st.note, attributes: st.attributes, ajax })
      if (r.cart) st.cart = r.cart as never[]
      if (typeof r.note === "string") st.note = r.note
      if (r.attributes) st.attributes = r.attributes
      return r
    }
    await ask("POST", "/cart/add.js", { id: SMALL, quantity: 1, properties: { Engraving: "Ana" } })
    const upd = await ask("POST", "/cart/update.js", { attributes: { "Gift message": "Happy birthday", "Delivery date": "2026-10-20" } })
    const cart = JSON.parse(String(upd.body)) as { attributes: Record<string, string>; items: { properties: Record<string, string> }[] }
    check("/cart/update.js sets attributes, and cart.js answers them", cart.attributes["Gift message"] === "Happy birthday" && cart.attributes["Delivery date"] === "2026-10-20", cart.attributes)
    check("  the line keeps its properties", cart.items[0]?.properties?.Engraving === "Ana")
    await ask("POST", "/cart/update.js", { "attributes[Delivery date]": "" })
    check("a form's attributes[Name]= with nothing takes it off; the others stay", !("Delivery date" in st.attributes) && st.attributes["Gift message"] === "Happy birthday", st.attributes)
    check("Shopify's updateCartAttributes form fields read the same", attributesAfter({}, { "attributes[Wrap]": "yes" }).Wrap === "yes")
    const page = await ask("GET", "/cart", null, false)
    check("Liquid's cart.attributes and cart.note draw on the cart page", /data-gift="Happy birthday"/.test(String(page.body)), String(page.body).match(/data-gift="[^"]*"/)?.[0])
    const js = await ask("GET", "/cart.js", null)
    check("GET /cart.js answers the attributes", (JSON.parse(String(js.body)) as { attributes: Record<string, string> }).attributes["Gift message"] === "Happy birthday")
    const out = await ask("POST", "/cart", { checkout: "" }, false)
    const loc = new URL(`https://x.test${out.headers?.Location ?? ""}`)
    const handed = readSiteCheckoutParams(loc.searchParams)
    check("Check out hands the attributes and the line's properties to the checkout", handed.attributes?.["Gift message"] === "Happy birthday" && handed.items[0]?.properties?.Engraving === "Ana", loc.search)
    const cookie = writeCartCookie(st.cart, st.note, st.attributes)
    check("the cart cookie keeps them", readCartCookie(cookie).attributes["Gift message"] === "Happy birthday")
    const huge = writeCartCookie(st.cart, "", Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, "v".repeat(400)])))
    check("  and never grows past what a browser keeps: attributes give way, the cart stays", huge.length <= 3800 && readCartCookie(huge).cart.length === 1, huge.length)

    const cs = read("lib/physical/checkout-server.ts")
    check("checkout keeps them on the order: attributes on the checkout, properties on its lines", /cart_attributes: attributes/.test(cs) && /snapshotLine\(l, propertiesFor\(input\.items, l\)\)/.test(cs) && /properties: l\.properties/.test(cs))
    check("  a database without part 164 loses only the attributes, never the checkout", /cart attributes not kept/.test(cs))
    check("  the website's checkout sends them, and shows them under the note", /cartAttributes,\n\s+wholeCart/.test(read("app/checkout/site/site-checkout.tsx")) && /data-cart-attributes/.test(read("app/checkout/site/site-checkout.tsx")) && (read("app/api/checkout/site/route.ts").match(/cartAttributes: body\.cartAttributes/g) ?? []).length === 2)
    check("the seller's order shows them in Notes", /data-order-attributes/.test(read("components/physical/order-panel.tsx")) && /data-order-line-properties/.test(read("components/physical/order-panel.tsx")) && /cartAttributes: cartAttributes\(co\.cart_attributes\)/.test(read("lib/physical/orders-server.ts")))
    const facts = physicalSaleFacts({ delivery_method: "ship", shipping_rate: { name: "Standard" }, lines: [{ title: "Mug", type: "physical", requires_shipping: true, quantity: 1, unit_cents: 1000, properties: { Engraving: "Ana" } }], cart_attributes: { "Gift message": "Love you" }, total_cents: 1000, items_subtotal_cents: 1000 })
    check("the seller's new order email carries them, one row each", facts?.details.join("|") === "Gift message: Love you|Mug: Engraving: Ana" && (withPhysicalSale({}, facts).fulfil as { details: string[] }).details.length === 2, facts?.details)
    check("  the template draws the rows, and the read falls back where part 164 hasn't run", /f\.texts\("details", 420, 12\)/.test(read("lib/notify/templates/catalog.ts")) && /cart_attributes`\)/.test(read("lib/email.tsx")) && /coError\.code === "42703"/.test(read("lib/email.tsx")))
  }

  /* ───────────────────────────── 3. delivery block ───────────────────────── */
  section("Delivery and pickup on product pages saved before the block")
  {
    const b = (type: string, id = type) => ({ id, type, settings: {} })
    const old = { id: "p", type: "product", name: "Product", settings: { image_width: "50%" }, blocks: [b("title"), b("price"), b("buy_buttons"), b("low_stock"), b("description")] }
    const drawn = withDeliveryBlock(old as never)
    const types = drawn.blocks!.map((x) => x.type)
    check("drawn right after the low stock line", types.join() === "title,price,buy_buttons,low_stock,delivery,description", types)
    check("  with its default settings and a fixed id, so the canvas and the sidebar agree", drawn.blocks![4].id === AUTO_DELIVERY_ID && (drawn.blocks![4].settings as Record<string, unknown>).show_pickup === true)
    check("  and the section remembers it was given", drawn.settings![DELIVERY_ADDED] === true)
    const removed = { ...drawn, blocks: drawn.blocks!.filter((x) => x.type !== "delivery") }
    check("removed by the creator (saved with the mark, without the block): stays removed", withDeliveryBlock(removed as never).blocks!.every((x) => x.type !== "delivery"))
    const moved = { ...drawn, blocks: [drawn.blocks![4], ...drawn.blocks!.filter((x) => x.type !== "delivery")] }
    check("moved by the creator: left where they put it", withDeliveryBlock(moved as never).blocks![0].type === "delivery")
    const preset = mainProductSection()
    check("a section from the preset (it has the block) only gets the mark, so a later removal sticks", withDeliveryBlock(preset).blocks!.filter((x) => x.type === "delivery").length === 1 && withDeliveryBlock(preset).settings![DELIVERY_ADDED] === true)
    check("no low stock line: after the buy buttons", withDeliveryBlock({ ...old, blocks: [b("title"), b("buy_buttons"), b("description")] } as never).blocks!.map((x) => x.type).join() === "title,buy_buttons,delivery,description")
    check("a section with every block deleted stays empty", withDeliveryBlock({ ...old, blocks: [] } as never).blocks!.length === 0)
    check("a legacy section gets it with its blocks", withDeliveryBlock(withProductBlocks({ id: "m", type: "product", name: "P", settings: { show_wishlist: true }, blocks: [] } as never)).blocks!.some((x) => x.type === "delivery"))
    check("not a product section: untouched", withDeliveryBlock({ id: "h", type: "hero", settings: {}, blocks: [b("text")] } as never).blocks!.length === 1)
    check("the live page, the canvas and the builder's sidebar all call it", /withDeliveryBlock\(withProductBlocks\(s\)\)/.test(read("components/website-builder/theme/render-product.tsx")) && /withDeliveryBlock\(withProductBlocks\(raw\)\)/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")) && /loaded = loaded\.map\(\(s\) => withDeliveryBlock\(s\)\)/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  }

  /* ───────────────────────────── 4. never delivered ──────────────────────── */
  section("A tracked parcel never marked delivered")
  {
    const lines = [{ requiresShipping: true }]
    const w = (shipments: { status: string; trackingNumber: string | null; shippedAt: string | null; deliveredAt: string | null; estimatedDeliveryAt?: string | null }[], maxDays: number | null = 5) => returnWindow({ lines, shipments, paidAt: at(100), delivery: { maxDays } }, 30, now)
    const a = w([{ status: "in_transit", trackingNumber: "1Z", shippedAt: at(80), deliveredAt: null }])
    check("shipped 80 days ago, zone promised 5 days: counted from day 5 + 14, so it closed", !a.open && a.assumed && a.endsAt === new Date(now - (80 - 5 - DELIVERY_GRACE_DAYS - 30) * day).toISOString(), a)
    const b2 = w([{ status: "in_transit", trackingNumber: "1Z", shippedAt: at(3), deliveredAt: null }])
    check("shipped 3 days ago: open, not started, and the buyer is told the last day", b2.open && !b2.started && b2.endsAt === new Date(now + (5 + DELIVERY_GRACE_DAYS - 3 + 30) * day).toISOString())
    const c = w([{ status: "in_transit", trackingNumber: "1Z", shippedAt: at(30), deliveredAt: null, estimatedDeliveryAt: at(27) }])
    check("the carrier's estimate counts when it comes first", c.endsAt === new Date(now - 27 * day + 30 * day).toISOString())
    check("no promise from the zone: assumed transit days", w([{ status: "shipped", trackingNumber: "1Z", shippedAt: at(0), deliveredAt: null }], null).endsAt === new Date(now + (ASSUMED_TRANSIT_DAYS + DELIVERY_GRACE_DAYS + 30) * day).toISOString())
    check("delivered: from delivery, as before", w([{ status: "delivered", trackingNumber: "1Z", shippedAt: at(15), deliveredAt: at(10) }]).assumed === false)
    check("the order page says the date when it hasn't arrived", /data-return-assumed/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /started: window\.started, assumed: window\.assumed/.test(read("app/checkout/physical/order/[token]/page.tsx")))

    check("60 days, tracked, still in transit: to close", isUnconfirmed({ status: "in_transit", tracking_number: "1Z", shipped_at: at(61), delivered_at: null }, now))
    check("  not before 60 days, not delivered, not untracked, not already closed", !isUnconfirmed({ status: "in_transit", tracking_number: "1Z", shipped_at: at(59), delivered_at: null }, now) && !isUnconfirmed({ status: "delivered", tracking_number: "1Z", shipped_at: at(90), delivered_at: at(80) }, now) && !isUnconfirmed({ status: "shipped", tracking_number: null, shipped_at: at(90), delivered_at: null }, now) && !isUnconfirmed({ status: "shipped", tracking_number: "1Z", shipped_at: at(90), delivered_at: null, delivery_unconfirmed_at: at(1) }, now))
    const F = "44444444-4444-4444-8444-444444444444"
    const db = fakeDb(
      { fulfillments: [{ id: F, checkout_id: CO, creator_id: CREATOR, status: "in_transit", carrier: "DPD", tracking_number: "1Z9", shipped_at: at(61), delivered_at: null, delivery_unconfirmed_at: null }, { id: "f-new", checkout_id: CO, creator_id: CREATOR, status: "shipped", carrier: "DPD", tracking_number: "2", shipped_at: at(5), delivered_at: null, delivery_unconfirmed_at: null }], commerce_order_events: [], commerce_jobs: [] },
      { unique: { commerce_order_events: [["idempotency_key"]], commerce_jobs: [["idempotency_key"]] } },
    )
    const r1 = await closeUnconfirmedDeliveries(db as never, now)
    const r2 = await closeUnconfirmedDeliveries(db as never, now)
    check("the pass closes it once: marked, one timeline entry, one seller email", r1.closed === 1 && r2.closed === 0 && !!db.tables.fulfillments[0].delivery_unconfirmed_at && db.tables.commerce_order_events.filter((e) => e.kind === UNCONFIRMED_EVENT).length === 1 && db.tables.commerce_jobs.filter((j) => (j.payload as { event?: string }).event === UNCONFIRMED_EVENT).length === 1, { r1, r2, ev: db.tables.commerce_order_events, jobs: db.tables.commerce_jobs })
    check("  a parcel shipped 5 days ago is left alone", !db.tables.fulfillments[1].delivery_unconfirmed_at)
    check("the seller's email says what to do", sellerEmailFor(UNCONFIRMED_EVENT, "system") && sellerKindForEvent(UNCONFIRMED_EVENT) === "delivery_unconfirmed" && /never marked delivered/.test(sellerCommerceEmail("delivery_unconfirmed", { orderNumber: "#AB12", carrier: "DPD", trackingNumber: "1Z9" }, { baseUrl: "https://storelib.test" }).html))
    check("the seller's order shows Delivery not confirmed, and the physical cron runs the pass", /Delivery not confirmed/.test(read("components/physical/order-panel.tsx")) && /closeUnconfirmedDeliveries\(db\)/.test(read("app/api/cron/physical/route.ts")))
  }

  section("One order number for the seller, one for the buyer")
  {
    const { numbersOf } = await import("../lib/orders/order-number-server")
    const n = numbersOf([
      { id: "b", stripe_session_id: "s2", created_at: "2026-10-02T00:00:00Z", checkout_id: "co2" },
      { id: "a", stripe_session_id: "s1", created_at: "2026-10-01T00:00:00Z", checkout_id: "co1" },
      { id: "a2", stripe_session_id: "s1", created_at: "2026-10-01T00:00:01Z", checkout_id: "co1" },
      { id: "c", stripe_session_id: null, created_at: "2026-10-03T00:00:00Z" },
    ])
    check("counted as the Orders page counts: oldest first, a basket once, from #1001", n.byCheckout.get("co1") === 1001 && n.byOrder.get("a2") === 1001 && n.byCheckout.get("co2") === 1002 && n.byOrder.get("c") === 1003)
    const mail = sellerCommerceEmail("cancel_requested", { orderNumber: "#1003", buyerReference: "#85737C57", buyerEmail: "ana@example.com" }, { baseUrl: "https://storelib.test" })
    check("a seller email: the Orders number in the subject, the buyer's reference beside it, the reply to the buyer in their reference", /order #1003/.test(mail.subject) && /85737C57/.test(mail.html) && /Your%20order%20%2385737C57|Your order #85737C57/.test(mail.html), mail.subject)
    check("the order emails, activity, messages and export all ask for the seller's number", /sellerOrderNumber\(db, co\.creator_id, \{ checkoutId: co\.id \}\)/.test(read("lib/physical/jobs-server.ts")) && /sellerNumberAndRef/.test(read("app/api/receipt/contact/route.ts")) && /sellerNumberAndRef/.test(read("app/api/courses/contact/route.ts")) && /sellerNumberAndRef/.test(read("app/api/memberships/[id]/contact/route.ts")) && /sellerOrderNumber/.test(read("app/api/physical/order-status/[token]/cancel/route.ts")) && /sellerOrderNumbers/.test(read("app/api/physical/orders/export/route.ts")))
    check("the buyer's own pages and emails keep the reference", /Order \{orderNumber\(order\.id\)\}/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /const number = orderNumber\(co\.id\)/.test(read("lib/physical/jobs-server.ts")))
    check("the scheme is in the admin guide", /id: "order-numbers"/.test(read("lib/admin/commerce-docs.ts")))
  }

  section("With courier tracking (part 160)")
  {
    check("the carrier's estimated delivery reaches the return window", /estimatedDeliveryAt: f\.estimated_delivery_at \?\? null/.test(read("lib/physical/orders-server.ts")))
    const base = { status: "in_transit", tracking_number: "1Z", shipped_at: at(70), delivered_at: null }
    check("a parcel tracking says was delivered or sent back is never closed here", !isUnconfirmed({ ...base, tracking_status: "delivered" }, now) && !isUnconfirmed({ ...base, tracking_status: "returned" }, now))
    check("  nor one the carrier scanned in the last 14 days", !isUnconfirmed({ ...base, tracking_status: "in_transit", tracking_last_event_at: at(3) }, now) && isUnconfirmed({ ...base, tracking_status: "in_transit", tracking_last_event_at: at(30) }, now))
    check("  and the pass never writes tracking's own columns", !/tracking_stopped_at|tracking_next_check_at/.test(read("lib/physical/unconfirmed-delivery-server.ts").replace(/\/\*[\s\S]*?\*\//g, "")))
  }

  section("SQL part 164")
  {
    const lines = sql.trim().split("\n")
    check("one statement per line, idempotent, reload last", lines.every((l) => l.startsWith("/*") || /;$/.test(l)) && lines[lines.length - 1] === "notify pgrst, 'reload schema';" && !/CREATE TABLE (?!IF NOT EXISTS)/.test(sql) && /ADD COLUMN IF NOT EXISTS photos/.test(sql) && /cart_attributes/.test(sql) && /delivery_unconfirmed_at/.test(sql))
    check("the private photo bucket", /'order-case-photos', 'order-case-photos', false/.test(sql))
    check("listed in the README, with a column in the check after, and a migration copy", read("supabase/sql/run-now/README.md").includes("`164_buyer_contact_and_cart_attributes.sql`") && /p164_buyer_contact_and_cart_attributes/.test(read("supabase/sql/run-now/99_check_after.sql")) && read("supabase/migrations/20270112_buyer_contact_and_cart_attributes.sql") === sql)
  }

  section("Words")
  {
    const files = ["components/support/order-help.tsx", "components/support/case-photos.tsx", "components/support/order-messages-card.tsx", "app/order-help/[id]/case-view.tsx", "lib/support/cases.ts", "lib/support/case-photos-server.ts", "lib/physical/unconfirmed-delivery-server.ts", "supabase/sql/run-now/164_buyer_contact_and_cart_attributes.sql"]
    const all = files.map(read).join("\n")
    check("no em dashes or filler words", !/—|\bunlock|\belevate|seamless|effortless|supercharge|\btransform|\bpowerful/i.test(all))
  }

  globalThis.fetch = realFetch
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

/* ── An imported theme with a cart that reads its attributes ─────────────── */
const SMALL = "10000000-0000-4000-8000-000000000001"
const PID = "00000000-0000-4000-8000-000000000001"
const CART_SECTION = `<div class="main-cart">
  {%- for item in cart.items -%}<div class="cart-item">{{ item.product.title }}{%- for p in item.properties -%}<span class="prop">{{ p.first }}: {{ p.last }}</span>{%- endfor -%}</div>{%- endfor -%}
  <p class="gift" data-gift="{{ cart.attributes['Gift message'] }}">{{ cart.note }}</p>
  <form action="/cart" method="post"><button type="submit" name="checkout">Check out</button></form>
</div>
{% schema %}
{ "name": "Main cart", "settings": [] }
{% endschema %}`

async function compatSite() {
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert")
  const { themeOfInstall } = await import("../lib/storelib-theme/compat/page")
  const { compatMenus } = await import("../lib/storelib-theme/compat/menus")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  zip.file("sections/main-cart.liquid", CART_SECTION)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  const t = r.theme
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const variants = [{ id: SMALL, name: "Small", price: "$49.00", available: true }]
  const products = [{ id: PID, settings: { title: "Posture shirt", slug: "posture-shirt", url: "/products/posture-shirt", price: "$49.00", image: "", images: [], kind: "physical", available: true, description: "", variants, options: [{ name: "Size", values: ["Small"] }] } }]
  return {
    creatorId: "c",
    theme,
    pages,
    products,
    collections: [],
    menus: compatMenus({ "main-menu": { title: "Main", links: [] } } as never, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}" },
    host: "posturex.storelib.com",
  } as never
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
