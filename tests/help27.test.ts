/**
 * ===========================================================================
 *  ROUND 27 (H27): ORDER HELP, LIVE, ON THE SHOP'S WEBSITE, FAIR TO BOTH
 * ===========================================================================
 *   1. Asking Storelib in: three days unanswered, or two weeks open with
 *      the buyer writing again; the store sees the day it has to answer by.
 *   2. A real round trip on the fake database: the buyer writes, the store
 *      answers, the buyer's page reads only what is new and sees it; the
 *      buyer answers, the store's page sees it. Every write is announced on
 *      the case's own channel, with no words in it.
 *   3. The gate: one case with Storelib per order, a few per buyer, a rate
 *      limit on the request, only the buyer's private link.
 *   4. Where the buyer's links point: the store's live website for a
 *      parcel (emails, the page's Visit the shop and its way back to the
 *      order), storelib.com without one; /order-help served on a website's
 *      host, and links already sent keep working.
 *   5. The pages: live everywhere a case is open, the photo viewer,
 *      Storelib's order facts, search and counts; Romanian complete.
 *
 * No network: every fetch is answered here, and any other call fails.
 *
 *   npx tsx tests/help27.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fakeDb } from "./_fake-db"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* Mailgun and Realtime's broadcast endpoint are answered and recorded; anything else fails the suite. */
const mails: { to: string; subject: string; html: string }[] = []
const broadcasts: { topic: string; event: string; payload: Record<string, unknown>; private: boolean }[] = []
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith("http://mailgun.test/")) {
    const form = init?.body as FormData
    mails.push({ to: String(form.get("to")), subject: String(form.get("subject")), html: String(form.get("html")) })
    return new Response(JSON.stringify({ id: `<m${mails.length}@test>` }), { status: 200 })
  }
  /* A helper that opens its own client (the website lookups) reads no rows, as with no database. */
  if (url.startsWith("http://supabase.test/rest/v1/")) return new Response("[]", { status: 200, headers: { "content-type": "application/json" } })
  if (url === "http://supabase.test/realtime/v1/api/broadcast") {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages: typeof broadcasts }
    broadcasts.push(...body.messages)
    return new Response("{}", { status: 202 })
  }
  failed++
  console.log(`  FAIL  a real host was called: ${url}`)
  throw new Error(`no network in tests: ${url}`)
}) as typeof fetch
process.env.MAILGUN_API_KEY = "key-test"
process.env.MAILGUN_DOMAIN = "mg.test"
process.env.MAILGUN_BASE_URL = "http://mailgun.test"
process.env.RECEIPT_TOKEN_SECRET = "h27-test-secret"
process.env.NEXT_PUBLIC_APP_URL = "https://storelib.com"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-test"

const day = 86_400_000
const TOKEN = "tok_h27_aaaaaaaaaaaaaaaaaaaaaaaa"
const CO = "11111111-1111-4111-8111-111111111127"
const CO2 = "11111111-1111-4111-8111-111111111128"
const CREATOR = "c0000000-0000-4000-8000-000000000027"

/** A shop ("andrewrullz") with a parcel order placed on its website, and, unless `website: false`, that website published. */
function shopDb(opts: { website?: boolean } = {}) {
  return withIdentity(fakeDb({
    commerce_checkouts: [
      { id: CO, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_name: "Ana", status: "paid", receipt_token: TOKEN, origin: { surface: "website", site: "andrewrullz.storelib.com", lang: "ro" }, total_cents: 12900, refunded_cents: 0, currency: "RON", fulfillment_status: "fulfilled", return_status: "none", lines: [{ title: "Cană", variant_name: "Albastră", quantity: 2, unit_cents: 4500 }], paid_at: "2026-10-01T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
      { id: CO2, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_name: "Ana", status: "paid", receipt_token: "tok_h27_bbbbbbbbbbbbbbbbbbbbbbbb", origin: null },
    ],
    creators: [{ id: CREATOR, user_id: "u27", slug: "andrewrullz", username: "andrewrullz", display_name: "AndrewRullz", support_email: "shop@andrew.test", banned_at: null }],
    profiles: [{ id: "u27", username: "andrewrullz" }],
    store_settings: [{ creator_id: CREATOR, store_name: "AndrewRullz", contact_email: "shop@andrew.test" }],
    store_theme_installs: opts.website === false ? [] : [{ id: "i27", creator_id: CREATOR, status: "published" }],
    custom_domains: [],
    website_addresses: [],
    website_address_history: [],
    site_deployments: [],
    fulfillments: [{ checkout_id: CO, status: "delivered", carrier: "Sameday", tracking_number: "1ONB27", tracking_url: "https://sameday.ro/track/1ONB27", shipped_at: "2026-10-02T10:00:00Z", delivered_at: "2026-10-04T10:00:00Z", created_at: "2026-10-02T10:00:00Z" }],
    orders: [{ id: "0e000000-0000-4000-8000-000000000027", creator_id: CREATOR, stripe_session_id: "pi_h27", checkout_id: CO, created_at: "2026-10-01T10:00:00Z" }],
    order_cases: [],
    order_case_messages: [],
  }))
}

/* order_case_messages.id is a bigint identity in Postgres (part 117): numbered here the same way, so `after` reads as it does there. */
function withIdentity<T extends { from: (t: string) => unknown }>(db: T): T {
  let n = 0
  const base = db.from.bind(db)
  ;(db as { from: (t: string) => unknown }).from = (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = base(t) as Record<string, any>
    if (t === "order_case_messages") {
      const insert = b.insert
      b.insert = (p: Record<string, unknown> | Record<string, unknown>[]) => insert(Array.isArray(p) ? p.map((r) => ({ id: ++n, ...r })) : { id: ++n, ...p })
    }
    return b
  }
  return db
}

async function main() {
  const cases = await import("../lib/support/cases")
  const server = await import("../lib/support/cases-server")
  const live = await import("../lib/support/case-live-server")
  const hook = await import("../lib/support/use-case-live")

  /* ─────────────────────────── 1. the rule ─────────────────────────────── */
  section("Asking Storelib in: fair to the buyer and to the store")
  {
    const now = Date.parse("2026-10-17T12:00:00Z")
    const at = (n: number) => new Date(now - n * day).toISOString()
    const esc = (reason: string, msgs: [string, number][], extra: { status?: string; escalated?: boolean } = {}) =>
      cases.buyerEscalation({ reason: reason as never, status: (extra.status ?? "store") as never, escalated: extra.escalated ?? false }, msgs.map(([author, ago]) => ({ author: author as never, createdAt: at(ago) })), now)
    check("three days unanswered on a problem with the goods: the buyer can ask", esc("damaged", [["buyer", 4]]).can)
    check("the store answered last a week in: nothing yet", esc("not_arrived", [["buyer", 7], ["store", 6]]).from === null)
    check("a store that answers every couple of days without sorting it: two weeks after the buyer first wrote, and they wrote again, Storelib can be asked", esc("not_arrived", [["buyer", 15], ["store", 13], ["buyer", 12], ["store", 1]]).can === true)
    check("  but not before two weeks", esc("not_arrived", [["buyer", 10], ["store", 9], ["buyer", 8], ["store", 1]]).can === false && esc("not_arrived", [["buyer", 10], ["store", 9], ["buyer", 8], ["store", 1]]).from === new Date(now + 4 * day).toISOString())
    check("  and one message alone answered by the store never opens it", esc("refund", [["buyer", 30], ["store", 29]]).from === null)
    check("a question or a return stays with the shop however long", ["question", "return", "change_address", "cancel", "other"].every((r) => !esc(r, [["buyer", 30], ["buyer", 20]]).can))
    check("the store sees the day it has to answer by", cases.storeAnswerBy({ reason: "damaged", status: "store", escalated: false }, [{ author: "buyer", createdAt: at(1) }], now) === new Date(now + 2 * day).toISOString())
    check("  nothing when it is the buyer's turn or Storelib is in", cases.storeAnswerBy({ reason: "damaged", status: "buyer", escalated: false }, [{ author: "buyer", createdAt: at(1) }], now) === null && cases.storeAnswerBy({ reason: "damaged", status: "store", escalated: true }, [{ author: "buyer", createdAt: at(1) }], now) === null)
    check("the limits are the ones documented", cases.ESCALATE_AFTER_DAYS === 3 && cases.ESCALATE_STALE_DAYS === 14 && cases.ESCALATIONS_PER_BUYER === 3 && cases.ESCALATION_WINDOW_DAYS === 30)
  }

  section("Live: a secret channel per case, polling with backoff under it")
  {
    const a = "17fad1e1-c6e7-4b99-9f15-7b910f41ab52"
    const t = live.caseTopic(a)
    check("the channel name is an HMAC of the case id, not the id", !!t && t.startsWith("order-case:") && !t.includes(a) && t === live.caseTopic(a.toUpperCase()), t)
    check("  and differs per case", t !== live.caseTopic("17fad1e1-c6e7-4b99-9f15-7b910f41ab53"))
    check("  none without the server key or for a non-id", live.caseTopic("x") === null)
    check("polling: back to 4 s after news, slower after each quiet read, 30 s at most", hook.nextLiveDelay(30_000, true, false) === 4_000 && hook.nextLiveDelay(4_000, false, false) > 4_000 && hook.nextLiveDelay(29_000, false, false) === 30_000)
    check("  with the channel joined, a 45 s safety net", hook.nextLiveDelay(45_000, false, true) === 45_000 && hook.nextLiveDelay(4_000, true, true) === 30_000)
    const have = [{ id: 1 }, { id: 2 }]
    check("new messages join by id, once each, in order", hook.mergeMessages(have, [{ id: 2 }, { id: 4 }, { id: 3 }]).map((m) => m.id).join() === "1,2,3,4" && hook.mergeMessages(have, [{ id: 2 }]) === have)
    check("the next read asks after the newest shown", hook.lastMessageId([{ id: 3 }, { id: 9 }, { id: 5 }]) === 9 && hook.lastMessageId([]) === 0)
    check("`after` reads only a whole positive number", server.readAfter("12") === 12 && server.readAfter("-1") === 0 && server.readAfter("1e3x") === 0 && server.readAfter(null) === 0)
  }

  /* ─────────────────────────── 2. the round trip ───────────────────────── */
  section("A real round trip: seller to buyer and buyer to seller, live")
  const db = shopDb()
  mails.length = 0
  broadcasts.length = 0
  const order = await server.orderForToken(db, "physical", TOKEN)
  const opened = await server.openCase(db, order!, { reason: "damaged", message: "Cana a ajuns spartă, vă rog o înlocuire." }, "https://storelib.com")
  check("the buyer opens a case", opened.ok, opened)
  const id = opened.ok ? opened.id : ""
  const k = new URL(opened.ok ? opened.link : "https://x").searchParams.get("k") ?? ""
  const topic = live.caseTopic(id)
  check("  the case's channel hears it, with no words in it", broadcasts.length === 1 && broadcasts[0].topic === topic && broadcasts[0].event === "case" && broadcasts[0].private === false && !JSON.stringify(broadcasts[0].payload).includes("Cana"), broadcasts)

  const page = await server.getCaseForBuyer(db, id, k)
  check("the buyer's page reads the case with its live channel", page.ok && page.live === topic && page.messages.length === 1, page.ok ? { live: page.live, n: page.messages.length } : page)
  const shownAfter = page.ok ? page.messages[page.messages.length - 1].id : 0

  const storeView = await server.getCaseForStore(db, CREATOR, id)
  check("the store reads it, with the day to answer by and the channel", storeView.ok && storeView.live === topic && typeof storeView.answerBy === "string" && storeView.case.sellerNumber === "#1001", storeView.ok ? { answerBy: storeView.answerBy, n: storeView.case.sellerNumber } : storeView)

  broadcasts.length = 0
  const answered = await server.storeAct(db, CREATOR, id, { kind: "reply", body: "Ne pare rău! Trimitem azi o cană nouă." }, "https://storelib.com")
  check("the store answers", answered.ok, answered)
  check("  the buyer's open page is told at once", broadcasts.length === 1 && broadcasts[0].topic === topic)
  const buyerNews = await server.getCaseUpdatesForBuyer(db, id, k, shownAfter)
  check("  and its next read brings exactly the store's answer", buyerNews.ok && buyerNews.messages.length === 1 && buyerNews.messages[0].author === "store" && /cană nouă/.test(buyerNews.messages[0].body), buyerNews)
  check("  with whose turn it is now", buyerNews.ok && buyerNews.case.status === "buyer")
  const nothingNew = await server.getCaseUpdatesForBuyer(db, id, k, buyerNews.ok ? buyerNews.messages[0].id : 0)
  check("  a read with nothing new is empty", nothingNew.ok && nothingNew.messages.length === 0)
  check("  the wrong key reads nothing", !(await server.getCaseUpdatesForBuyer(db, id, "nope", 0)).ok)

  broadcasts.length = 0
  const lastStore = buyerNews.ok ? buyerNews.messages[0].id : 0
  const back = await server.buyerAct(db, id, k, { kind: "reply", body: "Mulțumesc, aștept coletul." }, "https://storelib.com")
  check("the buyer answers back; the store's open page is told", back.ok && broadcasts.length === 1 && broadcasts[0].topic === topic)
  const storeNews = await server.getCaseForStore(db, CREATOR, id, { after: lastStore })
  check("  and the store's next read brings exactly the buyer's message", storeNews.ok && storeNews.messages.length === 1 && storeNews.messages[0].author === "buyer" && /aștept/.test(storeNews.messages[0].body), storeNews)
  check("  without counting the order's number again (the page keeps it)", storeNews.ok && storeNews.case.sellerNumber === undefined)

  broadcasts.length = 0
  await server.adminCaseReply(db, id, { body: "Storelib aici: magazinul a trimis înlocuirea.", internal: false }, "https://storelib.com")
  const adminNote = await server.adminCaseReply(db, id, { body: "Verificat AWB.", internal: true }, "https://storelib.com")
  check("Storelib's reply and note are announced too", adminNote.ok && broadcasts.length === 2)
  const buyerAll = await server.getCaseUpdatesForBuyer(db, id, k, 0)
  check("  the buyer sees Storelib's reply, never the internal note", buyerAll.ok && buyerAll.messages.some((m) => m.author === "storelib") && !buyerAll.messages.some((m) => /AWB/.test(m.body)))
  const adminRead = await server.adminGetCase(db, id)
  check("Storelib reads the whole thread, the order and the channel", adminRead.ok && adminRead.messages.some((m) => m.internal) && adminRead.live === topic && adminRead.order?.totalCents === 12900 && adminRead.order?.lines[0]?.title === "Cană" && adminRead.order?.shipments[0]?.trackingUrl === "https://sameday.ro/track/1ONB27", adminRead.ok ? adminRead.order : adminRead)
  const adminNews = await server.adminGetCase(db, id, { after: adminRead.ok ? adminRead.messages[adminRead.messages.length - 1].id : 0 })
  check("  and with `after`, only the case: no store or order read again", adminNews.ok && adminNews.messages.length === 0 && adminNews.store === undefined && adminNews.order === undefined)

  /* ─────────────────────────── 3. where links point ───────────────────── */
  section("The buyer stays on the shop's website")
  {
    const toBuyer = mails.filter((m) => m.to === "ana@example.com")
    check("every link in the buyer's emails is the website's /order-help", toBuyer.length >= 2 && toBuyer.every((m) => /https:\/\/andrewrullz\.storelib\.com\/order-help\//.test(m.html) && !/https:\/\/storelib\.com\/order-help\//.test(m.html)), toBuyer.map((m) => m.subject))
    check("  and never the creator page", toBuyer.every((m) => !/storelib\.com\/andrewrullz/.test(m.html)))
    check("the case link opened from the order is on the website too", opened.ok && opened.link.startsWith("https://andrewrullz.storelib.com/order-help/"), opened.ok ? opened.link : opened)
    check("Storelib's own reply comes from Storelib, not dressed as the shop", mails.some((m) => m.to === "ana@example.com" && /^Storelib replied/.test(m.subject)))
    const p = page.ok ? page.order : null
    check("the page: back to the order as a path on this host, Visit the shop to the website, in the language the order was placed in", p?.path === `/checkout/physical/order/${TOKEN}` && p?.storeUrl === "https://andrewrullz.storelib.com" && p?.lang === "ro", p)

    mails.length = 0
    const plain = shopDb({ website: false })
    const o2 = await server.orderForToken(plain, "physical", TOKEN)
    const c2 = await server.openCase(plain, o2!, { reason: "question", message: "When will my parcel ship, please?" }, "https://storelib.com")
    check("no live website: the link stays on storelib.com", c2.ok && c2.link.startsWith("https://storelib.com/order-help/"), c2)
    const k2 = new URL(c2.ok ? c2.link : "https://x").searchParams.get("k") ?? ""
    const v2 = await server.getCaseForBuyer(plain, c2.ok ? c2.id : "", k2)
    check("  and Visit the shop is left out rather than pointing at the creator page", v2.ok && v2.order.storeUrl === null, v2.ok ? v2.order : v2)

    const proxy = read("proxy.ts")
    const sub = proxy.indexOf('if (pathname.startsWith("/order-help/")) return NextResponse.next()')
    check("the website's host serves /order-help (before its pages and an imported theme get the path)", sub > 0 && sub < proxy.indexOf("compatAnswers(pathname, request) && (await compatSiteFor(subdomain, asksFresh(request)))"))
    check("  an imported theme never answers it", /if \(pathname\.startsWith\("\/order-help\/"\)\) return false/.test(proxy))
    check("  a connected domain lets it through as a platform path", /"\/order-help",/.test(proxy))
    check("links already sent on storelib.com keep working: the page is the same route", /export default async function OrderHelpPage/.test(read("app/order-help/[id]/page.tsx")))
    check("the order page's help panel opens the case on the host it is on", /samePage\(sent\?\.link \|\| openCase\?\.link \|\| null\)/.test(read("components/support/order-help.tsx")))
  }

  /* ─────────────────────────── 4. the gate ─────────────────────────────── */
  section("Ask Storelib: findable, never a flood")
  {
    const g = shopDb()
    const o = await server.orderForToken(g, "physical", TOKEN)
    const c = await server.openCase(g, o!, { reason: "not_arrived", message: "Coletul nu a ajuns după două săptămâni." }, "https://storelib.com")
    const cid = c.ok ? c.id : ""
    const ck = new URL(c.ok ? c.link : "https://x").searchParams.get("k") ?? ""
    const later = Date.now() + 4 * day
    const early = await server.buyerAct(g, cid, ck, { kind: "escalate", body: null }, "https://storelib.com")
    check("day one: refused, with the day it opens", early.ok === false && early.status === 409)
    /* Another case on the same order already with Storelib. */
    g.tables.order_cases.push({ id: "99999999-9999-4999-8999-999999999999", creator_id: CREATOR, checkout_id: CO, order_ref: "X", buyer_email: "ana@example.com", reason: "damaged", status: "storelib", escalated: true, escalated_by: "buyer", escalated_at: new Date().toISOString(), access_hash: "0".repeat(64), store_unread: false, buyer_unread: false, created_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    const held = await server.getCaseUpdatesForBuyer(g, cid, ck, 0, later)
    check("one at a time per order: the button is not offered", held.ok && held.escalation.can === false && held.escalation.held === "order", held.ok ? held.escalation : held)
    const refused = await server.buyerAct(g, cid, ck, { kind: "escalate", body: null }, "https://storelib.com", later)
    check("  and the request is refused, saying why", refused.ok === false && /already looking at another conversation/.test(refused.ok === false ? refused.error : ""))
    g.tables.order_cases.pop()
    /* Three asked in by this buyer this month, on other orders and stores. */
    for (let i = 0; i < 3; i++) g.tables.order_cases.push({ id: `88888888-8888-4888-8888-88888888888${i}`, creator_id: "other", checkout_id: null, order_id: `0e000000-0000-4000-8000-00000000009${i}`, buyer_email: "ana@example.com", reason: "refund", status: "resolved", escalated: true, escalated_by: "buyer", escalated_at: new Date(Date.now() - (i + 1) * day).toISOString(), access_hash: "0".repeat(64), created_at: new Date().toISOString(), last_message_at: new Date().toISOString() })
    const limit = await server.getCaseUpdatesForBuyer(g, cid, ck, 0, later)
    check("a few per buyer in 30 days, over every store", limit.ok && limit.escalation.held === "limit", limit.ok ? limit.escalation : limit)
    const tooMany = await server.buyerAct(g, cid, ck, { kind: "escalate", body: null }, "https://storelib.com", later)
    check("  refused with a way to reach Storelib", tooMany.ok === false && tooMany.status === 429 && /support@storelib\.com/.test(tooMany.ok === false ? tooMany.error : ""))
    g.tables.order_cases.splice(-3, 3)
    broadcasts.length = 0
    mails.length = 0
    const ok = await server.buyerAct(g, cid, ck, { kind: "escalate", body: "Nimic de la magazin." }, "https://storelib.com", later)
    check("with nothing holding it back, day four goes to Storelib", ok.ok && g.tables.order_cases.find((r) => r.id === cid)?.status === "storelib")
    check("  the open pages are told, Storelib's inbox and the store are emailed", broadcasts.length >= 1 && mails.some((m) => /\[Case\]/.test(m.subject)) && mails.some((m) => m.to === "shop@andrew.test" && /asked Storelib/.test(m.subject)), mails.map((m) => `${m.to}: ${m.subject}`))
    const route = read("app/api/order-help/[id]/route.ts")
    check("the request itself is rate limited by address", /bucket: "order-help-escalate"/.test(route) && /limit: 3, seconds: 3600/.test(route))
    check("only the buyer's private link can ask (the same read as every buyer action)", /const found = await caseForBuyer\(db, id, secret\)\n  if \(found\.ok === false\) return found\n  if \(action\.kind === "escalate"/.test(read("lib/support/cases-server.ts")))

    /* The store asking Storelib in tells the buyer so, in its own words. */
    const s = shopDb()
    const so = await server.orderForToken(s, "physical", TOKEN)
    const sc = await server.openCase(s, so!, { reason: "wrong_item", message: "I received a different mug." }, "https://storelib.com")
    mails.length = 0
    await server.storeAct(s, CREATOR, sc.ok ? sc.id : "", { kind: "escalate", body: null }, "https://storelib.com")
    check("the store asking Storelib in reads as that to the buyer, not as a reply", mails.some((m) => m.to === "ana@example.com" && /asked Storelib to help with order/.test(m.subject)) && !mails.some((m) => m.to === "ana@example.com" && /replied/.test(m.subject)), mails.map((m) => m.subject))
  }

  /* ─────────────────────────── 5. the pages ────────────────────────────── */
  section("The pages")
  {
    const view = read("app/order-help/[id]/case-view.tsx")
    check("the buyer's page is live (channel and polling) and reads only what is new", /useCaseLive\(\{ topic: live \?\? null, refresh \}\)/.test(view) && /&after=\$\{after\}/.test(view))
    check("  a way back to the order tracking page, at the top and beside the order", /data-case-back=""/.test(view) && /data-case-order-link=""/.test(view))
    check("  a reading width on a large screen, a side column from 1024 px, one column on a phone", /max-w-\[1120px\]/.test(view) && /lg:grid-cols-\[minmax\(0,1fr\)_320px\]/.test(view))
    check("  Ask Storelib is a quiet link beside the order, only when the rule allows", /escalation\.can \?/.test(view) && /data-case-ask-storelib=""/.test(view) && /<aside/.test(view))
    check("  in the buyer's language, through the checkout's words", /useCt\(\)/.test(view) && /<CheckoutWords lang=\{language\.lang\}/.test(read("app/order-help/[id]/page.tsx")))
    check("  messages grouped by day, photos in a viewer", /dayLabel\(m\.createdAt\)/.test(view) && /<CasePhotoStrip photos=\{m\.photos\} dark=\{mine\} ct=\{ct\} \/>/.test(view))
    const photos = read("components/support/case-photos.tsx")
    check("the photo viewer: over the page, Escape and arrows, the original a link away", /role="dialog"/.test(photos) && /e\.key === "Escape"/.test(photos) && /ArrowRight/.test(photos) && /createPortal/.test(photos))
    const store = read("app/app/support/buyer-cases.tsx")
    check("the store's thread is live, with the day to answer by", /useCaseLive\(\{ topic: live, refresh, enabled: c !== null \}\)/.test(store) && /data-case-answer-by=/.test(store))
    check("the support list reads itself again while it is in view", /useVisibleInterval\(loadCases, 60_000/.test(read("app/app/support/support-client.tsx")))
    const admin = read("app/admin/resolution/buyer-cases.tsx")
    check("Storelib: live thread, the order beside it, search, a list that keeps up", /useCaseLive\(\{ topic: live, refresh/.test(admin) && /data-admin-case-order=""/.test(admin) && /<SearchField/.test(admin) && /useVisibleInterval\(/.test(admin))
    check("  the waiting count shows on the tab before it is opened", /How many buyer cases wait on Storelib/.test(read("app/admin/resolution/resolution-center.tsx")))
    for (const [route, fn] of [["app/api/order-help/[id]/route.ts", "getCaseUpdatesForBuyer"], ["app/api/store/cases/[id]/route.ts", "readAfter"], ["app/api/admin/cases/[id]/route.ts", "readAfter"]] as const) check(`${route} takes ?after=`, read(route).includes(fn))
  }

  section("Words: Romanian complete, the dashboard in six languages, the copy rules")
  {
    const ro = (await import("../lib/checkout-text/dict/ro")).default as Record<string, string>
    const { CHECKOUT_SENTENCES } = await import("../lib/markets/checkout-words.generated")
    const fromPage = ["Waiting on the shop", "Back to order {orderRef}", "Visit the shop", "Ask Storelib for help", "If this isn't sorted by {date}, you can ask Storelib to look at this case here.", "Previous photo", "Storelib is already looking at another conversation about this order."]
    check("the case page's sentences are listed for translation", fromPage.every((s) => CHECKOUT_SENTENCES.includes(s)), fromPage.filter((s) => !CHECKOUT_SENTENCES.includes(s)))
    check("  and every one has Romanian", CHECKOUT_SENTENCES.every((s) => !!ro[s]), CHECKOUT_SENTENCES.filter((s) => !ro[s]).slice(0, 6))
    check("  with its placeholders kept", fromPage.every((s) => (s.match(/\{\w+\}/g) ?? []).every((p) => ro[s]?.includes(p))))
    for (const code of ["de", "es", "fr", "it", "pl", "pt-BR"]) {
      const cat = (await import(`../lib/i18n/catalog/${code}`)).default as Record<string, string>
      check(`dashboard words in ${code}`, ["Sent. The buyer sees it now and by email.", "Answer by {date}. After that the buyer can ask Storelib to step in.", "The buyer can now ask Storelib to step in. Answer here to keep it between you.", "Previous photo", "Next photo", "Open the original"].every((s) => !!cat[s] && (!s.includes("{date}") || cat[s].includes("{date}"))))
    }
    const files = ["app/order-help/[id]/case-view.tsx", "app/order-help/[id]/page.tsx", "lib/support/cases.ts", "lib/support/cases-server.ts", "lib/support/case-live-server.ts", "lib/support/use-case-live.ts", "app/app/support/buyer-cases.tsx", "app/admin/resolution/buyer-cases.tsx", "components/support/case-photos.tsx", "tests/help27.test.ts"]
    const banned = new RegExp(`${String.fromCharCode(0x2014)}|\\b(${["un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge", "trans" + "form"].join("|")})`, "i")
    check("no em dash and none of the banned words", files.every((f) => !banned.test(read(f))), files.filter((f) => banned.test(read(f))))
    check("no gradient on these pages", files.every((f) => f.startsWith("tests/") || !/linear-gradient|bg-gradient/.test(read(f))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
