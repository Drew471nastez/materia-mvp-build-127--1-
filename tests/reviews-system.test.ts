/**
 * ===========================================================================
 *  REVIEWS, END TO END
 * ===========================================================================
 * What a buyer can write and where, what a seller can do with it, and the
 * review request emails Storelib sends. Four parts:
 *
 *   RULES     a review's shape, its author's name, the rating summary
 *   EMAILS    the source rule (Storelib yes, a website built with the
 *             builder no), paid and still theirs, 7 and 14 days, never
 *             after a review, never to a suppressed or unsubscribed
 *             address, two at most per order however often the event and
 *             the worker run (lib/reviews/request-rules, lib/notify)
 *   LINKS     the review request unsubscribe link names an order, not a
 *             person, and cannot pass for the other kind
 *   ROUTES    the review routes as they ship, against an in-memory
 *             database: a guest posting from a receipt link, editing and
 *             deleting with it, the seller's one reply, a report hiding a
 *             review, and the ratings counted from published reviews only
 *
 * Run with:  npm run test:push
 */
import { register } from "node:module"
import { tamperSignature } from "./tamper"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import { checkReviewInput, guestReviewerName, reviewerOf, summarize } from "../lib/reviews/rules"
import { REVIEW_REMINDER_DAYS, REVIEW_REQUEST_DAYS, reviewRequestBlock, soldOnStorelib, type ReviewRequestFacts } from "../lib/reviews/request-rules"
import type { ReviewRequestFactsRow } from "../lib/notify/store"
import { emailChannel } from "../lib/notify/channels/email"
import { runWork, type EngineDeps } from "../lib/notify/engine"
import { handle } from "../lib/notify/orchestrator"
import { emit } from "../lib/notify/outbox"
import { REGISTRY } from "../lib/notify/registry"
import { renderEmail } from "../lib/notify/templates"
import { signReviewWith, signWith, verifyReviewWith, verifyWith } from "../lib/notify/unsubscribe"
import type { ChannelResult, DomainEvent, OutgoingEmail } from "../lib/notify/types"
import { MemoryNotifyStore } from "./notify-memory-store"
import { readCode, readSource } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`)
  }
}

/* The engine logs a JSON line per step. */
const realLog = console.log
const realWarn = console.warn
console.log = (...a: unknown[]) => (typeof a[0] === "string" && a[0].startsWith("{") ? undefined : realLog(...a))
console.warn = (...a: unknown[]) => (typeof a[0] === "string" && (a[0].startsWith("{") || a[0].startsWith("[reviews]")) ? undefined : realWarn(...a))

const DAY = 86_400_000
const ORDER = "11111111-1111-4111-8111-111111111111"
const ORDER_2 = "11111111-1111-4111-8111-111111111112"
const PRODUCT = "22222222-2222-4222-8222-222222222222"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const BUYER = "55555555-5555-4555-8555-555555555555"
const SELLER_USER = "66666666-6666-4666-8666-666666666666"
const STRANGER = "77777777-7777-4777-8777-777777777777"
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz012345"
const TOKEN_2 = "tok_abcdefghijklmnopqrstuvwxyz0123zz"
const KEY = "a-long-enough-test-secret-for-signing"

/* ── Rules ─────────────────────────────────────────────────────────────── */

function rules() {
  realLog("\nWhat a review is")
  check("five whole stars and ten characters is a review", checkReviewInput({ rating: 5, content: "  Clean files, quick setup.  " }).ok)
  check("the words are trimmed", (checkReviewInput({ rating: 5, content: "  Clean files, quick setup.  " }) as any).content === "Clean files, quick setup.")
  check(
    "half stars, six stars, no stars, nine characters and a thousand and one are not",
    [{ rating: 4.5, content: "Four and a half" }, { rating: 6, content: "Six stars here" }, { rating: 0, content: "No stars at all" }, { rating: 4, content: "Too short" }, { rating: 4, content: "x".repeat(1001) }].every((b) => !checkReviewInput(b).ok),
  )
  check("an account's review is named by the profile", reviewerOf({ buyer: { display_name: "Ghita N", avatar_url: "https://x/a.png" }, reviewer_name: "G" }).name === "Ghita N")
  check("a guest's by the first name they bought with", reviewerOf({ buyer: null, reviewer_name: "Ana" }).name === "Ana")
  check("and nobody's is a verified buyer, never an address", reviewerOf({ buyer: null, reviewer_name: null }).name === "Verified buyer" && guestReviewerName("ana@example.com") === null && guestReviewerName("  Ana  ") === "Ana")
  /*
    THE CIRCLE IS DRAWN FROM `avatarName`, NOT THE NAME. "Verified buyer" is
    the words a card writes when nobody gave a name; its initials, "VB",
    would read in a circle as a person called V. B. So the avatar is handed
    nothing and draws its person glyph instead.
  */
  check("a named reviewer's circle is drawn from that name", reviewerOf({ buyer: { display_name: "Ghita N" }, reviewer_name: null }).avatarName === "Ghita N" && reviewerOf({ buyer: null, reviewer_name: "Ana" }).named)
  check("  and a nameless one's is drawn from nothing, so it is a person and not VB", reviewerOf({ buyer: null, reviewer_name: null }).avatarName === "" && !reviewerOf({ buyer: null, reviewer_name: null }).named)
  const s = summarize([5, 5, 4, 1])
  check("the rating is the average to one decimal, with a count per star", s.count === 4 && s.average === 3.8 && s.stars[5] === 2 && s.stars[1] === 1 && s.stars[3] === 0, s)
}

/* ── The email rules ───────────────────────────────────────────────────── */

const PURCHASED = "2026-10-01T09:00:00Z"
const bought = Date.parse(PURCHASED)

function facts(order: Record<string, unknown> = {}, rest: Partial<ReviewRequestFacts> = {}): ReviewRequestFacts {
  return {
    order: {
      id: ORDER,
      status: "completed",
      amount_cents: 1200,
      refund_amount_cents: 0,
      source: "storelib",
      source_detail: { surface: "explore", from: "direct" },
      created_at: PURCHASED,
      buyer_id: null,
      buyer_email: "ana@example.com",
      receipt_token: TOKEN,
      product_id: PRODUCT,
      ...order,
    },
    product: { id: PRODUCT, title: "Notion Budget", status: "published", creator_id: CREATOR },
    sellerUserId: SELLER_USER,
    reviewed: false,
    suppressed: [],
    ...rest,
  }
}

function emailRules() {
  realLog("\nWhich orders are asked for a review")
  check("the first ask is at 7 days and the reminder at 14", REVIEW_REQUEST_DAYS === 7 && REVIEW_REMINDER_DAYS === 14)
  for (const surface of ["explore", "product", "profile", "onepage", "link"]) {
    check(`a Storelib order from ${surface} is asked`, soldOnStorelib({ source: "storelib", source_detail: { surface } }) === null)
  }
  check("an order from a website built with the builder is not", soldOnStorelib({ source: "website", source_detail: { surface: "website", site: "a.storelib.com" } }) === "website")
  check("nor one marked storelib whose page was a website", soldOnStorelib({ source: "storelib", source_detail: { surface: "website" } }) === "website")
  check("nor a test sale from the admin", soldOnStorelib({ source: "storelib", source_detail: { surface: "admin" } }) === "test_sale")
  check("nor an order whose source was never recorded", soldOnStorelib({ source: null, source_detail: null }) === "source_unknown")

  const at = (days: number) => bought + days * DAY
  check("a paid Storelib order at 7 days: asked", reviewRequestBlock(facts(), "request", at(7)) === null)
  check("at 6 days: not yet", reviewRequestBlock(facts(), "request", at(6)) === "too_early")
  check("the reminder at 14 days: asked", reviewRequestBlock(facts(), "reminder", at(14)) === null)
  check("the reminder at 10 days: not yet", reviewRequestBlock(facts(), "reminder", at(10)) === "too_early")
  check("a free claim is asked too", reviewRequestBlock(facts({ amount_cents: 0 }), "request", at(7)) === null)
  check("a full refund is not", reviewRequestBlock(facts({ status: "refunded", refund_amount_cents: 1200 }), "request", at(7)) === "not_open")
  check("a partial refund leaves the sale, so it is", reviewRequestBlock(facts({ status: "refunded", refund_amount_cents: 200 }), "request", at(7)) === null)
  check("a dispute is not", reviewRequestBlock(facts({ status: "disputed" }), "request", at(7)) === "not_open")
  check("a failed payment is not", reviewRequestBlock(facts({ status: "failed" }), "request", at(7)) === "not_open")
  check("once reviewed, never", reviewRequestBlock(facts({}, { reviewed: true }), "reminder", at(14)) === "reviewed")
  check("an address that turned review requests off, never", reviewRequestBlock(facts({}, { suppressed: ["review_requests"] }), "request", at(7)) === "unsubscribed")
  check("the seller's own copy, never", reviewRequestBlock(facts({ buyer_id: SELLER_USER }), "request", at(7)) === "own_product")
  check("a deleted product, never", reviewRequestBlock(facts({}, { product: { id: PRODUCT, status: "deleted" } }), "request", at(7)) === "no_product")
}

/* ── The engine ────────────────────────────────────────────────────────── */

class FakeProvider {
  readonly name = "fake"
  sent: OutgoingEmail[] = []
  async send(email: OutgoingEmail): Promise<ChannelResult> {
    this.sent.push(email)
    return { status: "sent", providerMessageId: `<m${this.sent.length}@mg.example.com>` }
  }
}

/* The product's stored thumbnail, as products.thumbnail_url holds one. */
const THUMB = "https://abc.supabase.co/storage/v1/object/public/products/notion-budget.png"

function world(orderFacts: ReviewRequestFacts = facts(), extra: Partial<ReviewRequestFactsRow> = {}) {
  const store = new MemoryNotifyStore()
  store.clock.now = bought
  store.creators.set(CREATOR, SELLER_USER)
  store.users.set(SELLER_USER, { email: "seller@example.com", name: "Seller" })
  store.reviewFacts.set(ORDER, { ...orderFacts, creatorName: "Maria Studio", productSlug: "notion-budget", productImage: THUMB, creatorSupportEmail: "hello@mariastudio.com", ...extra })
  const provider = new FakeProvider()
  const deps: EngineDeps = {
    store,
    providerName: provider.name,
    worker: "w1",
    now: () => store.clock.now,
    email: emailChannel({
      provider,
      render: renderEmail,
      baseUrl: () => "https://storelib.com",
      unsubscribeUrl: (u, c) => `https://storelib.com/api/notify/unsubscribe?u=${u}&c=${c}`,
      customerUnsubscribeUrl: (job) => (job.entity_id ? `https://storelib.com/api/notify/unsubscribe?token=${signReviewWith(KEY, job.entity_id)}` : null),
      preferencesUrl: () => "https://storelib.com/app/settings",
      messageDomain: "mg.example.com",
    }),
    inApp: null,
  }
  const raise = () =>
    emit(
      {
        name: "order.created",
        key: `order:${ORDER}:created`,
        creatorId: CREATOR,
        entityType: "order",
        entityId: ORDER,
        payload: { orderId: ORDER, productId: PRODUCT, productTitle: "Notion Budget", amountCents: 1200, currency: "usd", buyerEmail: "Ana@Example.com" },
        occurredAt: new Date(store.clock.now).toISOString(),
      },
      { db: store, soon: false },
    )
  const run = () => runWork(deps, 10_000)
  const at = (days: number) => (store.clock.now = bought + days * DAY + 60_000)
  const asks = () => provider.sent.filter((m) => m.tags?.some((t) => t === "REVIEW_REQUEST" || t === "REVIEW_REMINDER"))
  const job = (type: string) => store.jobs.find((j) => j.type === type)
  return { store, provider, raise, run, at, asks, job }
}

async function engine() {
  realLog("\nThe review request emails, through the notification engine")
  check("both are optional, customer, lifecycle email, decided at send time", ["REVIEW_REQUEST", "REVIEW_REMINDER"].every((t) => {
    const e = REGISTRY[t as "REVIEW_REQUEST"]
    return e.requirement === "optional_product" && e.recipient === "customer" && e.category === "lifecycle" && e.condition === "review_still_wanted" && e.channels.join() === "email"
  }))

  const ctx = { now: bought, userId: SELLER_USER, creatorId: CREATOR }
  const ev: DomainEvent = { name: "order.created", key: `order:${ORDER}:created`, entityType: "order", entityId: ORDER, creatorId: CREATOR, payload: { orderId: ORDER, buyerEmail: "ana@example.com" }, occurredAt: PURCHASED }
  const planned = handle(ev, ctx).jobs
  const request = planned.find((j) => j.type === "REVIEW_REQUEST")
  const reminder = planned.find((j) => j.type === "REVIEW_REMINDER")
  check("an order plans the request at 7 days", Date.parse(request?.runAt ?? "") === bought + 7 * DAY, request?.runAt)
  check("and the reminder at 14", Date.parse(reminder?.runAt ?? "") === bought + 14 * DAY, reminder?.runAt)
  check("each keyed by the address, the order and the step", request?.idempotencyKey === `REVIEW_REQUEST:e:ana@example.com:${ORDER}:review_1` && reminder?.idempotencyKey === `REVIEW_REMINDER:e:ana@example.com:${ORDER}:review_2`)
  check("the same event again plans the same keys", JSON.stringify(handle(ev, ctx).jobs.map((j) => j.idempotencyKey)) === JSON.stringify(planned.map((j) => j.idempotencyKey)))
  const late = handle(ev, { ...ctx, now: bought + 10 * DAY }).jobs
  check("handled 10 days late: the request goes now, the reminder still at 14", Date.parse(late.find((j) => j.type === "REVIEW_REQUEST")?.runAt ?? "") === bought + 10 * DAY && Date.parse(late.find((j) => j.type === "REVIEW_REMINDER")?.runAt ?? "") === bought + 14 * DAY)
  check("handled a month late: neither is planned", handle(ev, { ...ctx, now: bought + 30 * DAY }).jobs.every((j) => !j.type.startsWith("REVIEW_")))
  check("a sale line alone plans no review email (the purchase does)", handle({ ...ev, name: "sale.created", key: "sale:k" }, ctx).jobs.every((j) => !j.type.startsWith("REVIEW_")))

  {
    const w = world()
    await w.raise()
    await w.raise()
    await w.run()
    check("nothing is sent at the purchase", w.asks().length === 0)
    w.at(6)
    await w.run()
    check("nor at six days", w.asks().length === 0)
    w.at(7)
    await w.run()
    const first = w.asks()
    check("at seven days, one request", first.length === 1 && !!first[0].tags?.includes("REVIEW_REQUEST"), first.map((m) => m.tags))
    check("to the address on the order", first[0]?.to === "ana@example.com")
    check("naming the product and the seller", /Notion Budget/.test(first[0]?.subject ?? "") && /Maria Studio/.test(first[0]?.text ?? ""), first[0]?.subject)
    const html = first[0]?.html ?? ""
    check("five stars, each opening the receipt's review card with that many chosen", [1, 2, 3, 4, 5].every((n) => html.includes(`https://storelib.com/receipt/${TOKEN}?rate=${n}#review`)))
    check("and one button to write it", html.includes(`https://storelib.com/receipt/${TOKEN}#review`) && /Write a review/.test(html))
    check("every star is written out in the plain text part too", [1, 2, 3, 4, 5].every((n) => (first[0]?.text ?? "").includes(`${n} star`) && (first[0]?.text ?? "").includes(`?rate=${n}#review`)))
    check("the product card: its picture from Storelib's own address, with the title as alt text", /<img[^>]+src="https:\/\/storelib\.com\/[^"]*"[^>]*alt="Notion Budget"/.test(html) || /<img[^>]+alt="Notion Budget"[^>]*src="https:\/\/storelib\.com\//.test(html), (html.match(/<img[^>]*alt="Notion Budget"[^>]*>/) ?? [])[0])
    check("the card names the product and who made it", /Notion Budget/.test(html) && /by Maria Studio/.test(html) && (first[0]?.text ?? "").includes("by Maria Studio"))
    check("the button is Storelib's near black, and nothing in the email is purple", /bgcolor="#1a1a2e"/.test(html) && !/#(8b5cf6|7c3aed|6d28d9|4c1d95|c4b5fd|2f2f4d|a78bfa)/i.test(html), (html.match(/#(8b5cf6|7c3aed|6d28d9|4c1d95|c4b5fd|2f2f4d|a78bfa)/i) ?? [])[0])
    check("no external stylesheet, script or event handler", !/<link\b|<script\b|\son[a-z]+=|javascript:/i.test(html))
    check("the footer says the link turns review emails off, not everything", /Turn off review emails/.test(html) && (first[0]?.text ?? "").includes("Turn off review emails"))
    check("nothing about the order but the product: no address, no amount, no order number", !/ana@example\.com/.test(html) && !/\$12\.00|1200/.test(html))

    /* THE SENDER. The owner: "the email should be from the business seller, not Storelib." */
    check("the buyer sees the seller's name, sent from Storelib's own address", first[0]?.fromName === "Maria Studio via Storelib", first[0]?.fromName)
    check("a reply reaches the seller's support inbox", first[0]?.replyTo === "hello@mariastudio.com", first[0]?.replyTo)
    check("with an unsubscribe link and the one click header, both for this order", /api\/notify\/unsubscribe\?token=/.test(html) && !!first[0]?.headers?.["List-Unsubscribe"] && first[0]?.headers?.["List-Unsubscribe-Post"] === "List-Unsubscribe=One-Click")
    check("no em dash in what it says", !/—/.test(first[0]?.text ?? "") && !/—/.test(first[0]?.subject ?? ""))
    /* Recorded where the engine's email is recorded: one delivery row, by type, on the email channel. */
    const sentRows = w.store.deliveries.filter((d) => d.channel === "email" && d.status === "sent")
    check("the email is recorded once, as a REVIEW_REQUEST email delivery", sentRows.length === 1 && sentRows[0].type === "REVIEW_REQUEST", sentRows.map((d) => [d.type, d.status]))
    w.at(14)
    await w.run()
    check("at fourteen days, one reminder", w.asks().length === 2 && !!w.asks()[1].tags?.includes("REVIEW_REMINDER"))
    w.at(21)
    await w.raise()
    await w.run()
    w.at(40)
    await w.run()
    check("and never a third, however often the event and the worker run", w.asks().length === 2 && w.store.jobs.filter((j) => j.type.startsWith("REVIEW_")).length === 2)
  }
  {
    /* A seller with no published support address and no picture: Storelib's own reply-to, and the letter tile. */
    const w = world(facts(), { creatorSupportEmail: null, productImage: null })
    await w.raise()
    w.at(7)
    await w.run()
    const m = w.asks()[0]
    check("no support address: the name is still the seller's, the reply falls back to Storelib's", m?.fromName === "Maria Studio via Storelib" && !m?.replyTo, [m?.fromName, m?.replyTo])
    check("no picture: a letter tile, never a broken image", !/<img[^>]*alt="Notion Budget"/.test(m?.html ?? "") && /class="sn-tile"/.test(m?.html ?? ""))
  }
  {
    /* A seller Storelib has no name for: the email is plainly from Storelib, as every platform email is. */
    const w = world(facts(), { creatorName: null })
    await w.raise()
    w.at(7)
    await w.run()
    check("no seller name: the email comes from Storelib", !w.asks()[0]?.fromName && !w.asks()[0]?.replyTo, w.asks()[0]?.fromName)
  }
  {
    const w = world()
    await w.raise()
    await w.run()
    const f = w.store.reviewFacts.get(ORDER)!
    w.store.reviewFacts.set(ORDER, { ...f, reviewed: true })
    w.at(7)
    await w.run()
    w.at(14)
    await w.run()
    check("reviewed before day 7: neither email goes", w.asks().length === 0 && w.job("REVIEW_REQUEST")?.skip_reason === "CONDITION_NO_LONGER_TRUE" && w.job("REVIEW_REMINDER")?.skip_reason === "CONDITION_NO_LONGER_TRUE")
  }
  {
    const w = world()
    await w.raise()
    w.at(7)
    await w.run()
    const f = w.store.reviewFacts.get(ORDER)!
    w.store.reviewFacts.set(ORDER, { ...f, reviewed: true })
    w.at(14)
    await w.run()
    check("reviewed after the first: no reminder", w.asks().length === 1 && w.job("REVIEW_REMINDER")?.state === "skipped")
  }
  {
    const w = world(facts({ source: "website", source_detail: { surface: "website", site: "shop.example.com" } }))
    await w.raise()
    w.at(7)
    await w.run()
    w.at(14)
    await w.run()
    check("an order from a website built with the builder: never asked", w.asks().length === 0)
  }
  {
    const w = world(facts({ status: "refunded", refund_amount_cents: 1200 }))
    await w.raise()
    w.at(7)
    await w.run()
    check("a refunded order: never asked", w.asks().length === 0)
  }
  {
    const w = world()
    await w.store.suppress("ana@example.com", "all", "bounce", "mailgun")
    await w.raise()
    w.at(7)
    await w.run()
    check("a bounced address: never emailed", w.asks().length === 0 && w.store.deliveries.some((d) => d.skip_reason === "SUPPRESSED"))
  }
  {
    const w = world()
    await w.store.suppress("ana@example.com", "optional", "complaint", "mailgun")
    await w.raise()
    w.at(7)
    await w.run()
    check("an address that complained or unsubscribed from Storelib: never emailed", w.asks().length === 0)
  }
  {
    const w = world()
    await w.store.suppress("ana@example.com", "review_requests", "unsubscribe", "review_link")
    await w.raise()
    w.at(7)
    await w.run()
    check("an address that turned review requests off: never emailed", w.asks().length === 0 && w.job("REVIEW_REQUEST")?.skip_reason === "CONDITION_NO_LONGER_TRUE")
  }
  {
    const w = world()
    await w.raise()
    w.store.failReads = true
    w.at(7)
    await w.run()
    check("the database not answering: the email waits rather than going or being dropped", w.asks().length === 0 && w.job("REVIEW_REQUEST")?.state === "pending")
  }
}

function links() {
  realLog("\nThe review request unsubscribe link")
  const token = signReviewWith(KEY, ORDER)
  check("it names the order and nothing else", verifyReviewWith(KEY, token)?.orderId === ORDER && !Buffer.from(token.split(".")[0], "base64url").toString().includes("@"))
  check("a changed signature breaks it", verifyReviewWith(KEY, tamperSignature(token)) === null)
  check("another key does not verify it", verifyReviewWith("another-long-enough-secret-key", token) === null)
  check("a creator's unsubscribe link cannot pass for it, nor the other way round", verifyReviewWith(KEY, signWith(KEY, BUYER, "lifecycle")) === null && verifyWith(KEY, token) === null)
}

/* ── The routes ────────────────────────────────────────────────────────── */

const S: any = ((globalThis as any).__receiptStubs = { admin: null, user: null, sent: [] as any[], sendFails: false, signed: [] as any[] })
const dir = mkdtempSync(join(tmpdir(), "review-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__receiptStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__receiptStubs.user }, error: null }) } })\n`),
  "@/lib/email": stub(
    "email",
    `const S = () => globalThis.__receiptStubs
export const sendReviewNotificationEmail = async (_a, p) => { S().sent.push({ kind: "review", ...p }); return { success: true } }
export const resolveSellerEmail = async () => "seller@example.com"
`,
  ),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundleRoute(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__review-routes__", entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(process.cwd(), entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": process.cwd() },
    packages: "external",
    plugins: [
      {
        name: "stand-ins",
        setup(b) {
          const names = new Set(Object.keys(stubs))
          b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined))
        },
      },
    ],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

function db(over: { order?: Record<string, unknown>; reviews?: any[] } = {}) {
  return fakeDb(
    {
      orders: [
        { id: ORDER, product_id: PRODUCT, receipt_token: TOKEN, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: PURCHASED, ...over.order },
        { id: ORDER_2, product_id: PRODUCT, receipt_token: TOKEN_2, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: PURCHASED },
      ],
      products: [{ id: PRODUCT, title: "Notion Budget", slug: "notion-budget", creator_id: CREATOR, reviews_count: 0, reviews_average: 0 }],
      creators: [{ id: CREATOR, user_id: SELLER_USER, stripe_account_id: "acct_1", paypal_merchant_id: null, support_email: "help@seller.example", reviews_count: 0, reviews_average: 0 }],
      profiles: [{ id: BUYER, display_name: "Ghita N" }, { id: SELLER_USER, display_name: "Maria" }],
      entitlements: [],
      reviews: over.reviews ?? [],
      review_reports: [],
      seller_notifications: [],
    },
    { unique: { reviews: [["order_id"]] } },
  )
}

const req = (url: string, method: string, body?: unknown) =>
  new Request(`https://storelib.test${url}`, { method, headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (r: Response) => r.json().catch(() => ({}))
const params = (id: string) => ({ params: Promise.resolve({ id }) })
function reset(d: any, user: any = null) {
  S.admin = d
  S.user = user
  S.sent = []
}

async function routes() {
  const reviews = (await import(await bundleRoute("app/api/reviews/route.ts"))) as any
  const one = (await import(await bundleRoute("app/api/reviews/[id]/route.ts"))) as any
  const reply = (await import(await bundleRoute("app/api/reviews/[id]/reply/route.ts"))) as any
  const report = (await import(await bundleRoute("app/api/reviews/[id]/report/route.ts"))) as any
  const checkRoute = (await import(await bundleRoute("app/api/reviews/check/route.ts"))) as any

  realLog("\nA guest reviews from the receipt link")
  let reviewId = ""
  {
    const d = db()
    reset(d, null)
    const c = await json(await checkRoute.GET(new Request(`https://storelib.test/api/reviews/check?productId=${PRODUCT}&receiptToken=${TOKEN}`)))
    check("the check says a guest with the link may review, without signing in", c.canReview === true && c.isLoggedIn === false && c.viaReceipt === true, c)
    const r = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN, rating: 5, content: "Clear and easy to set up." }))
    const b = await json(r)
    const row = d.tables.reviews[0]
    check("posted: 200, on the order, with no account", r.status === 200 && row?.order_id === ORDER && row?.buyer_id === null, b)
    check("named with the first name they bought with, published", row?.reviewer_name === "Ana" && row?.status === "published")
    check("the ratings are counted again: the product and the seller", d.tables.products[0].reviews_count === 1 && d.tables.products[0].reviews_average === 5 && d.tables.creators[0].reviews_count === 1)
    check("the seller is told, and pointed at their Reviews list", d.tables.seller_notifications[0]?.action_url === `/app/reviews?review=${row?.id}` && S.sent.some((m: any) => m.kind === "review" && m.reviewId === row?.id))
    reviewId = row?.id
    const again = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN_2, rating: 1, content: "Second order, second go." }))
    check("the same address on another order of the product: 409, still one review", again.status === 409 && d.tables.reviews.length === 1)
    const c2 = await json(await checkRoute.GET(new Request(`https://storelib.test/api/reviews/check?receiptToken=${TOKEN}`)))
    check("and the check hands back their review to show", c2.hasReviewed === true && c2.existingReview?.id === reviewId && c2.existingReview?.rating === 5, c2)

    realLog("\nThey change it, and delete it, with the same link")
    const edit = await one.PATCH(req(`/api/reviews/${reviewId}`, "PATCH", { receiptToken: TOKEN, rating: 3, content: "Good, but the setup took longer." }), params(reviewId))
    check("an edit with the link: 200, the words and stars changed, marked edited", edit.status === 200 && d.tables.reviews[0].rating === 3 && !!d.tables.reviews[0].edited_at)
    check("and the rating follows", d.tables.products[0].reviews_average === 3)
    reset(d, { id: STRANGER, email: "someone@example.com" })
    const theirs = await one.PATCH(req(`/api/reviews/${reviewId}`, "PATCH", { rating: 1, content: "Not mine but changing it." }), params(reviewId))
    check("somebody else, signed in, without the link: 403", theirs.status === 403 && d.tables.reviews[0].rating === 3)
    const other = await one.PATCH(req(`/api/reviews/${reviewId}`, "PATCH", { receiptToken: "tok_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz", rating: 1, content: "A link of another order." }), params(reviewId))
    check("a link that is not theirs: refused", other.status === 403 || other.status === 401)
    reset(d, null)
    const del = await one.DELETE(req(`/api/reviews/${reviewId}?receiptToken=${TOKEN}`, "DELETE"), params(reviewId))
    check("deleted with the link: gone, and out of the rating", del.status === 200 && d.tables.reviews.length === 0 && d.tables.products[0].reviews_count === 0 && d.tables.products[0].reviews_average === 0)
  }
  {
    const d = db({ order: { status: "refunded", refund_amount_cents: 1200 } })
    reset(d, null)
    const r = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN, rating: 1, content: "Refunded and reviewing." }))
    check("a refunded order's link: 403, no row", r.status === 403 && d.tables.reviews.length === 0)
    const bad = await reviews.POST(req("/api/reviews", "POST", { receiptToken: "tok_nothere_nothere_nothere_nothere", rating: 5, content: "Who am I even." }))
    check("a link that is no order's: 404", bad.status === 404)
  }
  {
    const d = db({ order: { buyer_email: "help@seller.example" } })
    reset(d, null)
    const r = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN, rating: 5, content: "My own shop is great." }))
    check("an order bought with the seller's own address: 403", r.status === 403 && d.tables.reviews.length === 0)
  }
  {
    const d = db({ order: { buyer_id: SELLER_USER } })
    reset(d, null)
    const r = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN, rating: 5, content: "My own shop is great." }))
    check("the seller's own order, from its link: 403", r.status === 403 && d.tables.reviews.length === 0)
  }
  {
    const d = db({ order: { buyer_id: BUYER } })
    reset(d, null)
    const r = await reviews.POST(req("/api/reviews", "POST", { receiptToken: TOKEN, rating: 4, content: "Bought on my account." }))
    check("an account's order reviewed from its link: on the account, not named by the order", r.status === 200 && d.tables.reviews[0]?.buyer_id === BUYER && !d.tables.reviews[0]?.reviewer_name)
  }

  realLog("\nThe seller answers once, and reports")
  {
    const published = { id: "88888888-8888-4888-8888-888888888888", product_id: PRODUCT, creator_id: CREATOR, buyer_id: BUYER, order_id: ORDER, rating: 2, content: "Files were missing.", status: "published", created_at: PURCHASED }
    const kept = { ...published, id: "88888888-8888-4888-8888-888888888889", buyer_id: null, order_id: ORDER_2, rating: 4, content: "Worked well for me." }
    const d = db({ reviews: [published, kept] })
    reset(d, { id: SELLER_USER, email: "maria@example.com" })
    const r = await reply.PUT(req(`/api/reviews/${published.id}/reply`, "PUT", { text: "Sorry, the files are fixed now." }), params(published.id))
    check("the seller replies: 200, public on the review", r.status === 200 && d.tables.reviews[0].seller_reply === "Sorry, the files are fixed now." && !!d.tables.reviews[0].seller_reply_at)
    const again = await reply.PUT(req(`/api/reviews/${published.id}/reply`, "PUT", { text: "Updated: re-download from your receipt." }), params(published.id))
    check("and can change it: still one reply", again.status === 200 && d.tables.reviews[0].seller_reply === "Updated: re-download from your receipt.")
    reset(d, { id: STRANGER, email: "x@example.com" })
    const notSeller = await reply.PUT(req(`/api/reviews/${published.id}/reply`, "PUT", { text: "I am not the seller." }), params(published.id))
    check("anybody else: 403", notSeller.status === 403)
    reset(d, { id: BUYER, email: "ghita@example.com" })
    const buyerReplies = await reply.PUT(req(`/api/reviews/${published.id}/reply`, "PUT", { text: "Replying to myself." }), params(published.id))
    check("the buyer too: 403", buyerReplies.status === 403)
    const buyerReports = await report.POST(req(`/api/reviews/${published.id}/report`, "POST", { reason: "abusive" }), params(published.id))
    check("only the seller reports", buyerReports.status === 403 && d.tables.reviews[0].status === "published")
    reset(d, { id: SELLER_USER, email: "maria@example.com" })
    const noReason = await report.POST(req(`/api/reviews/${published.id}/report`, "POST", { reason: "i-dont-like-it" }), params(published.id))
    check("a report needs one of the reasons", noReason.status === 400)
    const rep = await report.POST(req(`/api/reviews/${published.id}/report`, "POST", { reason: "abusive", note: "Insults me by name." }), params(published.id))
    check("reported: hidden at once, a report filed for Storelib, the review kept", rep.status === 200 && d.tables.reviews.length === 2 && d.tables.reviews[0].status === "hidden" && d.tables.review_reports.length === 1 && d.tables.review_reports[0].reason === "abusive")
    check("and the rating counts only what is published", d.tables.products[0].reviews_count === 1 && d.tables.products[0].reviews_average === 4)
    const twice = await report.POST(req(`/api/reviews/${published.id}/report`, "POST", { reason: "spam" }), params(published.id))
    check("reporting a hidden review again: 409", twice.status === 409 && d.tables.review_reports.length === 1)
    const noDelete = await one.DELETE(req(`/api/reviews/${kept.id}`, "DELETE"), params(kept.id))
    check("the seller cannot delete a buyer's review", noDelete.status === 403 && d.tables.reviews.length === 2)
    const list = await json(await reviews.GET(new Request(`https://storelib.test/api/reviews?productId=${PRODUCT}`)))
    check("the public list has the published one only", list.total === 1 && list.reviews.length === 1 && list.reviews[0].id === kept.id, list)
  }
}

/* ── The face on a review ──────────────────────────────────────────────── */

/* readCode for every "it is not there": a comment naming the old bug must not satisfy it (tests/_source). */
const source = readSource
const code = readCode

/**
 * "The user that left the review may be signed out, another account, so he
 * doesn't have an account image at all, but it still needs to display
 * something." Every surface that draws a reviewer draws the photo, else the
 * initials, else a plain person. Measured at
 * scripts/check-reviews.mjs (`view=reviewers`, both themes); pinned here so
 * a "?" cannot come back through the source.
 */
function faces() {
  realLog("\nThe face on a review")
  const avatar = source("components/app/app-avatar.tsx")
  check("no name means no letters, and the avatar draws a person instead of a \"?\"",
    /if \(!words\.length\) return ""/.test(avatar) && /export function AvatarMark/.test(avatar) && /<svg aria-hidden="true" viewBox="0 0 24 24"/.test(avatar) && !/return "\?"/.test(code("components/app/app-avatar.tsx")))
  check("  the review surfaces keep the mark under a photo that has not arrived, so no circle is ever blank",
    /markWhileLoading\?: boolean/.test(avatar) && /\{!photo \|\| \(markWhileLoading && !loaded\) \? <AvatarMark name=\{name\} size=\{size\} \/> : null\}/.test(avatar))
  check("  and a page with its own theme gets a circle mixed from its own text colour",
    /theme: "bg-foreground\/\[0\.10\] text-foreground"/.test(avatar))

  const panel = source("components/storefront/reviews-panel.tsx")
  check("the creator page's review drew `(buyerName || \"?\")[0]`: it is the shared avatar now",
    !/\|\| "\?"/.test(code("components/storefront/reviews-panel.tsx")) && /<AppAvatar/.test(panel) && /tone="theme"/.test(panel) && /markWhileLoading/.test(panel) && /UNNAMED_REVIEWER/.test(panel))
  const creatorPage = source("app/(marketing)/u/[username]/page.tsx")
  check("  and it asks for the guest's name, which is why those reviews had none to draw",
    /\.select\("id, rating, content, created_at, reviewer_name, product:products/.test(creatorPage) && /missingColumn\(res\.error\)/.test(creatorPage) && /const author = reviewerOf\(review\)/.test(creatorPage))

  const card = source("components/reviews/review-card.tsx")
  check("the product page's review card draws the page's own colours in the circle",
    /name=\{avatarName\}/.test(card) && /markWhileLoading/.test(card) && /backgroundColor: `\$\{textColor\}1f`, color: textColor/.test(card))
  const form = source("components/reviews/review-form.tsx")
  check("Leave a review is handed the name it has, empty when there is none, never a \"?\"",
    /name=\{\(name \?\? ""\)\.trim\(\)\} alt="" size=\{48\} markWhileLoading/.test(form) && !/\|\| "\?"/.test(code("components/reviews/review-form.tsx")))
  const seller = source("app/app/reviews/reviews-client.tsx")
  check("the seller's Reviews list draws the same face", /name=\{avatarName\} alt="" size=\{36\} markWhileLoading/.test(seller))

  /* On a dark product page the bars were darker than the track they run in. */
  const breakdown = source("components/reviews/reviews-rating-breakdown.tsx")
  check("the rating bars follow the page's text colour rather than Storelib's near black",
    /const bar = starColor \|\| accentColor \|\| textColor \|\| "#1a1a2e"/.test(breakdown))
}

async function main() {
  process.env.NOTIFY_UNSUBSCRIBE_SECRET = KEY
  rules()
  faces()
  emailRules()
  await engine()
  links()
  await routes()
  realLog(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    realLog(`  failing:\n    ${failures.join("\n    ")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
