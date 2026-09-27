/**
 * ===========================================================================
 *  THE RECEIPT'S BUTTONS, RUN AGAINST THEIR REAL ROUTES
 * ===========================================================================
 * Resend, Wrong address, Download and Post review each call a route. These
 * run those route handlers as they ship, with three things swapped out
 * (scripts/push-test-stubs.mjs): the email sender, which records what it was
 * asked to send and can be told to fail; the Supabase clients, which are an
 * in-memory database (tests/_fake-db.ts) and a session that is whoever the
 * case says; and the storage signer and virus gate behind a download.
 * Everything else is real, the rate limiter included: it counts rows in the
 * fake database the way it counts them in the real one.
 *
 * What each case pins is what the page relies on:
 *
 *   RESEND        goes to the address on the order (never one in the
 *                 request), needs the order id AND its token, is limited
 *                 per order in five minutes and five a day, and says so;
 *                 a sender that fails is a 502 with words the page shows.
 *   WRONG ADDRESS moves a guest order (every line of the basket) and sends
 *                 there; refuses an account's order, an old order, a second
 *                 change, and an address that is not one.
 *   ACCOUNT EMAIL Resend with to: "account" goes to the signed-in owner's
 *                 account email and nobody else's; "Send a copy" goes to the
 *                 typed address once, changes neither the order nor its
 *                 delivery status, needs the account the order is on, and
 *                 counts towards the five a day.
 *   CONTACT       a message from the receipt reaches the seller's own inbox
 *                 (their support address, else their login's address as it
 *                 is now, the owner's for a second business), with Reply-To
 *                 the order's address (never one in the request), is
 *                 limited, is a seller_message row in email_logs, and says
 *                 so in words; a seller with no address is told, never sent
 *                 to Storelib's support inbox instead.
 *   DOWNLOAD      a paid receipt gets a signed link for its own file; a
 *                 refunded one gets the reason, and no link is signed.
 *   REVIEW        only a buyer who still has the product, once, with a
 *                 whole number of stars and ten characters; a second is a
 *                 409 and never a second row, even two presses at once.
 */
import { register } from "node:module"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { fileKindOf, refundPolicyOf, splitFileName } from "@/lib/receipts/rules"
import { withDiscount, withinTime } from "@/lib/receipts/discount"
import { cleanMessage, sellerMessageEmail } from "@/lib/receipts/contact"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ""}`)
  }
}

/* ─── The stand-ins ─────────────────────────────────────────────────────── */

const S: any = ((globalThis as any).__receiptStubs = {
  admin: null,
  user: null,
  sent: [] as any[],
  sendFails: false,
  signed: [] as any[],
})

const dir = mkdtempSync(join(tmpdir(), "receipt-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__receiptStubs.admin\n`),
  "@/lib/supabase/server": stub(
    "server",
    `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__receiptStubs.user }, error: null }) } })\n`,
  ),
  "@/lib/email": stub(
    "email",
    `const S = () => globalThis.__receiptStubs
const send = (kind) => async (_admin, params) => {
  S().sent.push({ kind, ...params })
  return S().sendFails ? { success: false, error: "provider said no" } : { success: true }
}
export const sendBuyerDownloadEmail = send("buyer")
export const sendSellerNotificationEmail = send("seller")
export const sendReviewNotificationEmail = send("review")
export const sendReceiptCopyEmail = send("copy")
export const sendSellerMessageEmail = send("contact")
export const resolveSellerEmail = async () => "seller@example.com"
`,
  ),
  "@/lib/storage": stub(
    "storage",
    `export const generateSignedDownloadUrl = async (_admin, path, seconds, bucket, name) => {
  globalThis.__receiptStubs.signed.push({ path, seconds, bucket, name })
  return { url: "https://files.example/signed/" + encodeURIComponent(path) + "?t=1" }
}
export const logDownloadEvent = async () => {}
`,
  ),
  "@/lib/storage/scan-gate": stub("scan-gate", `export const gateDownload = async () => ({ ok: true })\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

/*
 * The routes are bundled here with esbuild rather than compiled by the
 * suite's tsc: that compiler runs without strictNullChecks, where the
 * download route's `if (!decision.ok)` does not narrow and the whole push
 * would fail on a type error that is not one. esbuild strips types and
 * bundles the route with this repo's modules, leaving out exactly the
 * stand-ins above and the packages, which resolve as they always do. The
 * bundle is written into the compile output, which has node_modules linked.
 */
async function bundleRoute(entry: string): Promise<string> {
  const out = join(process.env.PUSH_TEST_OUT || dir, "__receipt-routes__", entry.replace(/[^\w]+/g, "_") + ".mjs")
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
    /* Named here rather than in `external`: esbuild applies the `@` alias
       before `external`, so an aliased stand-in would be bundled for real. */
    plugins: [
      {
        name: "stand-ins",
        setup(build) {
          const names = new Set(Object.keys(stubs))
          build.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined))
        },
      },
    ],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

/* ─── The data ──────────────────────────────────────────────────────────── */

const ORDER = "11111111-1111-4111-8111-111111111111"
const ORDER_2 = "11111111-1111-4111-8111-111111111112"
const PRODUCT = "22222222-2222-4222-8222-222222222222"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const ASSET = "44444444-4444-4444-8444-444444444444"
const BUYER = "55555555-5555-4555-8555-555555555555"
const SELLER_USER = "66666666-6666-4666-8666-666666666666"
const TOKEN = "tok_abcdefghijklmnopqrstuvwxyz012345"
const TOKEN_2 = "tok_abcdefghijklmnopqrstuvwxyz0123zz"

function world(over: { order?: Record<string, unknown>; extra?: Record<string, any[]>; unique?: boolean; failInsert?: any } = {}) {
  const tables: Record<string, any[]> = {
    orders: [
      {
        id: ORDER,
        product_id: PRODUCT,
        receipt_token: TOKEN,
        buyer_email: "ghita@example.com",
        buyer_first_name: "Ghita",
        buyer_id: null,
        status: "completed",
        amount_cents: 0,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        stripe_session_id: "cs_test_1",
        ...over.order,
      },
      {
        id: ORDER_2,
        product_id: PRODUCT,
        receipt_token: TOKEN_2,
        buyer_email: "ghita@example.com",
        buyer_id: null,
        status: "completed",
        amount_cents: 500,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        stripe_session_id: "cs_test_1",
      },
    ],
    products: [{ id: PRODUCT, title: "Drewwww", slug: "drewwww", creator_id: CREATOR }],
    creators: [{ id: CREATOR, user_id: SELLER_USER, stripe_account_id: "acct_seller", paypal_merchant_id: null, support_email: "help@seller.example" }],
    profiles: [
      { id: BUYER, display_name: "Ghita N", username: "ghita", avatar_url: null },
      { id: SELLER_USER, display_name: "Andrew", username: "andrew" },
    ],
    digital_assets: [{ id: ASSET, product_id: PRODUCT, file_name: "6e6ba82c (4).pdf", file_path: "creator/file.pdf", storage_bucket: "digital-products", scan_status: "clean" }],
    security_events: [],
    email_logs: [{ id: "log1", order_id: ORDER, email_type: "buyer_download" }],
    rate_limit_hits: [],
    entitlements: [],
    reviews: [],
    seller_notifications: [],
    ...over.extra,
  }
  return fakeDb(tables, {
    unique: over.unique ? { reviews: [["buyer_id", "product_id"]] } : undefined,
    failInsert: over.failInsert,
  })
}

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://storelib.test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })

async function json(res: Response) {
  try {
    return await res.json()
  } catch {
    return {}
  }
}

function reset(db: any, user: any = null) {
  S.admin = db
  S.user = user
  S.sent = []
  S.sendFails = false
  S.signed = []
}

function pure() {
  console.log("\nWhat the page draws from")
  const uuid = splitFileName("6e6ba82c-3022-42a6-818b-41109a0910b4 (4).pdf")
  check("a long name is cut before its last characters and keeps its extension",
    uuid.head + uuid.tail === "6e6ba82c-3022-42a6-818b-41109a0910b4 (4).pdf" && uuid.tail === "b4 (4).pdf", JSON.stringify(uuid))
  check("a short name is left whole", splitFileName("Guide.pdf").tail === "" && splitFileName("Guide.pdf").head === "Guide.pdf")
  check("the type is read from the extension", fileKindOf("Brand Kit.zip") === "ZIP" && fileKindOf("README") === "")
  check("a refund policy in the product page's words", refundPolicyOf({ refund_policy_enabled: true, refund_policy_type: "30_day" })?.label === "30-day money back guarantee")
  check("none when it is switched off or unknown",
    refundPolicyOf({ refund_policy_enabled: false, refund_policy_type: "30_day" }) === null && refundPolicyOf({ refund_policy_enabled: true, refund_policy_type: "forever" }) === null)

  const view: any = { items: [{ subtotalCents: 2400 }], subtotalCents: 2400, tipCents: 300, totalCents: 2700 }
  const d = withDiscount(view, { discountCents: 600, discountCode: "AUTUMN20", lines: [{ amountCents: 3000 }] })
  check("a code that adds up is shown with its list price", d.discountCents === 600 && d.discountCode === "AUTUMN20" && d.items[0].listCents === 3000)
  check("one that does not add up is left out",
    withDiscount(view, { discountCents: 600, discountCode: "X", lines: [{ amountCents: 2000 }] }).discountCents === undefined)
  check("no invoice, no change", withDiscount(view, null) === view)

  const page = readFileSync("app/receipt/[token]/receipt-view.tsx", "utf8") + readFileSync("components/reviews/review-form.tsx", "utf8")
  check("no violet on the receipt or its review card", !/#(8b5cf6|7c3aed|6d28d9|5b21b6|a78bfa|ede9fe|f5f3ff|ddd6fe)|violet-|purple-/i.test(page))
  check("the review card shows the buyer, not the seller", /reviewerAvatarUrl/.test(page) && !/creatorAvatarUrl|MessageSquare/.test(page))
  /* Was: the change form sat behind `receipt.buyer.unclaimed ?` alone. An
     account's own buyer now gets a copy form in the same place, so the pin
     reads both halves: the change form only for a guest order, the copy
     form only for the signed-in owner of an order on an account. */
  check("an account's order is not offered a form the route refuses",
    /receipt\.buyer\.unclaimed \|\| accountEmail \? \([\s\S]{0,200}<form onSubmit=\{accountEmail \? sendCopy : changeEmail\}/.test(page) &&
      /const accountEmail = !receipt\.buyer\.unclaimed && viewer\.isBuyer && viewer\.email/.test(page))
  check("the creator's name links to their page with a soft hover pill", /data-seller-link=""[\s\S]{0,400}hover:bg-\[#eaecf0\][\s\S]{0,200}focus-visible:ring-2/.test(page))

  const mail = sellerMessageEmail({
    buyerName: "Ghita\r\nBcc: x@evil.example",
    buyerEmail: "ghita@example.com",
    orderNumber: "1BE1AC18",
    items: ["<b>Brand Kit</b>"],
    message: "Hi <script>alert(1)</script>\nthe zip will not open",
    orderLink: "https://storelib.com/app/orders/1",
  })
  check("a message's subject is one line, whatever the name held", !/[\r\n]/.test(mail.subject) && /^Order 1BE1AC18: a message from Ghita Bcc/.test(mail.subject), mail.subject)
  check("and so is the From name", !/[\r\n<>"]/.test(mail.fromName) && /via Storelib$/.test(mail.fromName), mail.fromName)
  check("what the buyer typed arrives as text, not markup",
    !/<script>|<b>Brand/.test(mail.html) && /&lt;script&gt;/.test(mail.html) && /&lt;b&gt;Brand Kit&lt;\/b&gt;/.test(mail.html))
  check("the email says Reply reaches the buyer and links the order",
    /Reply to this email and it goes to ghita@example\.com/.test(mail.html) && /href="https:\/\/storelib\.com\/app\/orders\/1"/.test(mail.html) && /Open the order: https/.test(mail.text))
  check("a message is tidied: no control characters, no runs of blank lines",
    cleanMessage("  a\u0000b\r\n\n\n\n\nc  ") === "ab\n\nc" && cleanMessage(42) === "")
}

async function waits() {
  console.log("\nThe wait for the payment's figures")
  const t0 = Date.now()
  check("a slow lookup gives up at the limit with nothing", (await withinTime(() => new Promise((r) => setTimeout(() => r("late"), 400)), 60)) === null && Date.now() - t0 < 300)
  check("a failed lookup gives nothing, not an error", (await withinTime(() => Promise.reject(new Error("stripe down")), 200)) === null)
  check("a lookup that throws before it starts gives nothing", (await withinTime(() => { throw new Error("no key") }, 200)) === null)
  check("a quick answer is used", (await withinTime(() => Promise.resolve({ discountCents: 1 }), 200))?.discountCents === 1)
}

async function main() {
  pure()
  await waits()
  const resend = (await import(await bundleRoute("app/api/receipt/resend/route.ts"))) as any
  const change = (await import(await bundleRoute("app/api/receipt/update-email/route.ts"))) as any
  const download = (await import(await bundleRoute("app/api/download/[assetId]/route.ts"))) as any
  const reviews = (await import(await bundleRoute("app/api/reviews/route.ts"))) as any
  const copyRoute = (await import(await bundleRoute("app/api/receipt/send-copy/route.ts"))) as any
  const contact = (await import(await bundleRoute("app/api/receipt/contact/route.ts"))) as any

  /* ── Resend ─────────────────────────────────────────────────────────── */
  console.log("\nResend")
  {
    const db = world()
    reset(db)
    const res = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, resendType: "buyer", email: "attacker@example.com" }))
    const body = await json(res)
    check("a matching id and token sends: 200, success", res.status === 200 && body.success === true, JSON.stringify(body))
    check("one email, to the address on the order and not one in the request",
      S.sent.length === 1 && S.sent[0].kind === "buyer" && S.sent[0].buyerEmail === "ghita@example.com", JSON.stringify(S.sent))
    check("with the receipt token, so the link in it opens this receipt", S.sent[0]?.receiptToken === TOKEN)
    check("the old 'already sent' record is cleared first, so the sender does not skip it",
      !db.tables.email_logs.some((l: any) => l.order_id === ORDER && l.email_type === "buyer_download"))
    check("and the send is recorded for the daily count, without the token",
      db.tables.security_events.length === 1 && db.tables.security_events[0].event_type === "receipt_resent" && !JSON.stringify(db.tables.security_events).includes(TOKEN))
    check("the rate limiter counted it", db.tables.rate_limit_hits.some((h: any) => h.bucket === "receipt-resend"))
  }
  {
    const db = world()
    reset(db)
    const res = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN_2, resendType: "buyer" }))
    check("another line's token with this id: 404, nothing sent", res.status === 404 && S.sent.length === 0)
    const bad = await resend.POST(post("/api/receipt/resend", { orderId: "not-a-uuid", receiptToken: TOKEN }))
    check("a malformed id: 404", bad.status === 404 && S.sent.length === 0)
    const junk = await resend.POST(post("/api/receipt/resend", "{not json"))
    check("a body that is not JSON: 400", junk.status === 400)
  }
  {
    const db = world()
    reset(db)
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN }))
      statuses.push(r.status)
      if (i === 3) {
        const b = await json(r)
        check("a held button: the fourth in five minutes is refused in words", r.status === 429 && typeof b.error === "string" && b.error.length > 10, JSON.stringify(b))
      }
    }
    check("three go out, the fourth does not", statuses.join() === "200,200,200,429" && S.sent.length === 3, statuses.join())
  }
  {
    const since = new Date(Date.now() - 60 * 1000).toISOString()
    const db = world({ extra: { security_events: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, order_id: ORDER, event_type: "receipt_resent", created_at: since })) } })
    reset(db)
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN }, { "x-forwarded-for": "198.51.100.1" }))
    const b = await json(r)
    check("five today already: 429 with the daily limit in words, nothing sent", r.status === 429 && /5 times today/.test(b.error) && b.limitReached === true && S.sent.length === 0, JSON.stringify(b))
  }
  {
    const db = world()
    reset(db)
    S.sendFails = true
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN }))
    const b = await json(r)
    check("the sender fails: 502, success false, words the page can show", r.status === 502 && b.success === false && /did not go out/.test(b.error), JSON.stringify(b))
  }
  {
    const db = world()
    reset(db)
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, resendType: "seller" }))
    check("the seller's sale notice from a buyer's token: 403, nothing sent", r.status === 403 && S.sent.length === 0)
  }

  /* ── Wrong address ──────────────────────────────────────────────────── */
  console.log("\nWrong address")
  {
    const db = world()
    reset(db)
    const r = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: " Ghita.N@Example.com " }))
    const b = await json(r)
    check("a guest order this week: 200", r.status === 200 && b.success === true, JSON.stringify(b))
    check("every line of the basket moves to the new address",
      db.tables.orders.every((o: any) => o.buyer_email === "ghita.n@example.com"), JSON.stringify(db.tables.orders.map((o: any) => o.buyer_email)))
    check("and the receipt goes there", S.sent.length === 1 && S.sent[0].buyerEmail === "ghita.n@example.com")
    check("the change is recorded once per line", db.tables.security_events.filter((e: any) => e.event_type === "email_updated").length === 2)
    const again = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "third@example.com" }))
    const ab = await json(again)
    check("a second change is refused in words", again.status === 403 && /already changed once/.test(ab.error), JSON.stringify(ab))
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db)
    const r = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "new@example.com" }))
    const b = await json(r)
    /* Was /account settings/: that page could not change where Resend sent
       (Resend used the order's address). An account's receipt now goes to
       the account email, or a copy elsewhere, both signed in. */
    check("an order on an account: 403, asking to sign in to that account (the page says the same before asking)",
      r.status === 403 && /Sign in to that account/.test(b.error) && S.sent.length === 0 && db.tables.orders[0].buyer_email === "ghita@example.com", JSON.stringify(b))
  }
  {
    const db = world({ order: { created_at: new Date(Date.now() - 8 * 86400 * 1000).toISOString() } })
    reset(db)
    const r = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "new@example.com" }))
    const b = await json(r)
    check("after the first week: 403, and how to reach the seller instead", r.status === 403 && /first week/.test(b.error), JSON.stringify(b))
  }
  {
    const db = world()
    reset(db)
    const r = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "not an address" }))
    check("an address that is not one: 400, nothing changed", r.status === 400 && db.tables.orders[0].buyer_email === "ghita@example.com")
    const same = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "ghita@example.com" }))
    const sb = await json(same)
    check("the same address again: fine, unchanged, nothing sent", same.status === 200 && sb.unchanged === true && S.sent.length === 0)
  }
  {
    const db = world()
    reset(db)
    S.sendFails = true
    const r = await change.POST(post("/api/receipt/update-email", { orderId: ORDER, receiptToken: TOKEN, newEmail: "new@example.com" }))
    const b = await json(r)
    check("moved but the sender failed: 502 that says to use Resend", r.status === 502 && /Resend/.test(b.error), JSON.stringify(b))
  }

  /* ── Account email ──────────────────────────────────────────────────── */
  console.log("\nAccount email")
  const owner = { id: BUYER, email: "Ghita.New@Example.com" }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, owner)
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, resendType: "buyer", to: "account", email: "attacker@example.com" }))
    const b = await json(r)
    check("Resend to the account: 200", r.status === 200 && b.success === true, JSON.stringify(b))
    check("one email, to the signed-in account's own address", S.sent.length === 1 && S.sent[0].buyerEmail === "ghita.new@example.com", JSON.stringify(S.sent))
    check("the order keeps its address", db.tables.orders[0].buyer_email === "ghita@example.com")
    check("recorded as a resend to the account, without an address",
      db.tables.security_events.some((e: any) => e.event_type === "receipt_resent" && e.metadata?.to === "account") && !JSON.stringify(db.tables.security_events).includes("ghita.new"))
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, null)
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, to: "account" }))
    check("to the account, signed out: 401, nothing sent", r.status === 401 && S.sent.length === 0, String(r.status))
    reset(db, { id: SELLER_USER, email: "someone@example.com" })
    const other = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, to: "account" }, { "x-forwarded-for": "203.0.113.30" }))
    check("to the account, as somebody else: 403, nothing sent", other.status === 403 && S.sent.length === 0, String(other.status))
  }
  {
    const db = world()
    reset(db, owner)
    const r = await resend.POST(post("/api/receipt/resend", { orderId: ORDER, receiptToken: TOKEN, to: "account" }))
    check("a guest order cannot be sent to whoever is signed in: 403", r.status === 403 && S.sent.length === 0, String(r.status))
  }

  const copy = (body: unknown, headers: Record<string, string> = {}) => copyRoute.POST(post("/api/receipt/send-copy", body, headers))
  {
    const db = world({ order: { buyer_id: BUYER, buyer_notified_at: "2026-09-27T10:00:00Z", buyer_email_last_error: null } })
    reset(db, owner)
    const logsBefore = JSON.stringify(db.tables.email_logs)
    const r = await copy({ orderId: ORDER, receiptToken: TOKEN, email: " Work@Studio.example " })
    const b = await json(r)
    check("a copy from the account the order is on: 200", r.status === 200 && b.success === true, JSON.stringify(b))
    check("one copy, to the typed address, with this receipt's token",
      S.sent.length === 1 && S.sent[0].kind === "copy" && S.sent[0].buyerEmail === "work@studio.example" && S.sent[0].receiptToken === TOKEN, JSON.stringify(S.sent))
    check("the order's address and delivery record are untouched",
      db.tables.orders[0].buyer_email === "ghita@example.com" && db.tables.orders[0].buyer_notified_at === "2026-09-27T10:00:00Z" && JSON.stringify(db.tables.email_logs) === logsBefore)
    check("counted with the resends, without the token or the address",
      db.tables.security_events.length === 1 && db.tables.security_events[0].event_type === "receipt_resent" && db.tables.security_events[0].metadata?.to === "copy" &&
        !JSON.stringify(db.tables.security_events).includes(TOKEN) && !JSON.stringify(db.tables.security_events).includes("studio"))
    check("and the limiter counted it", db.tables.rate_limit_hits.some((h: any) => h.bucket === "receipt-copy"))
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, null)
    const r = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "work@studio.example" })
    check("a copy signed out: 401, nothing sent", r.status === 401 && S.sent.length === 0)
    reset(db, { id: SELLER_USER, email: "seller@example.com" })
    const other = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "work@studio.example" }, { "x-forwarded-for": "203.0.113.31" })
    check("a copy as another account: 403, nothing sent", other.status === 403 && S.sent.length === 0)
  }
  {
    const db = world()
    reset(db, owner)
    const r = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "work@studio.example" })
    check("a copy of a guest order: 403 (a forwarded link cannot mail it anywhere)", r.status === 403 && S.sent.length === 0)
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, owner)
    const bad = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "not an address" })
    check("a copy to something that is not an address: 400", bad.status === 400 && S.sent.length === 0)
    const wrong = await copy({ orderId: ORDER, receiptToken: TOKEN_2, email: "work@studio.example" })
    check("another line's token with this id: 404", wrong.status === 404 && S.sent.length === 0)
    const junk = await copyRoute.POST(post("/api/receipt/send-copy", "{nope"))
    check("a body that is not JSON: 400", junk.status === 400)
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, owner)
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await copy({ orderId: ORDER, receiptToken: TOKEN, email: `work${i}@studio.example` }, { "x-forwarded-for": `198.51.100.${10 + i}` })).status)
    check("the fourth copy in five minutes for one order is refused", statuses.join() === "200,200,200,429" && S.sent.length === 3, statuses.join())
  }
  {
    const since = new Date(Date.now() - 60 * 1000).toISOString()
    const db = world({ order: { buyer_id: BUYER }, extra: { security_events: Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, order_id: ORDER, event_type: "receipt_resent", created_at: since })) } })
    reset(db, owner)
    const r = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "work@studio.example" })
    const b = await json(r)
    check("five sends today already: a copy is refused in words", r.status === 429 && /5 times today/.test(b.error) && S.sent.length === 0, JSON.stringify(b))
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, owner)
    S.sendFails = true
    const r = await copy({ orderId: ORDER, receiptToken: TOKEN, email: "work@studio.example" })
    const b = await json(r)
    check("the sender fails: 502 with words the page shows", r.status === 502 && /did not go out/.test(b.error), JSON.stringify(b))
  }

  /* ── Contact seller ─────────────────────────────────────────────────── */
  console.log("\nContact seller")
  const write = (body: unknown, headers: Record<string, string> = {}) => contact.POST(post("/api/receipt/contact", body, headers))
  {
    const db = world()
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "  Hi, the zip will not open on my Mac.\u0000  ", buyerEmail: "attacker@example.com" })
    const b = await json(r)
    check("a guest holding the token can write: 200", r.status === 200 && b.success === true, JSON.stringify(b))
    const m = S.sent[0]
    /* Changed on purpose: the route resolves the inbox itself now (lib/seller-inbox), the support address the seller set first. */
    check("one message, to the support address the seller set", S.sent.length === 1 && m.kind === "contact" && m.to === "help@seller.example", JSON.stringify(S.sent))
    const logged = db.tables.email_logs.filter((l: any) => l.email_type === "seller_message")
    check("recorded in email_logs as seller_message, sent, with no message text", logged.length === 1 && logged[0].status === "sent" && logged[0].order_id === ORDER && logged[0].recipient_email === "help@seller.example" && !JSON.stringify(logged).includes("zip"), JSON.stringify(logged))
    check("Reply-To is the order's address, not one in the request", m?.message?.buyerEmail === "ghita@example.com", JSON.stringify(m?.message))
    check("with the order number, the buyer's name, every line and a link to the order",
      m?.message?.orderNumber === "11111111" && m?.message?.buyerName === "Ghita" && m?.message?.items?.length === 2 && /\/app\/orders\/11111111-1111-4111-8111-111111111111$/.test(m?.message?.orderLink), JSON.stringify(m?.message))
    check("the message tidied", m?.message?.message === "Hi, the zip will not open on my Mac.")
    check("recorded without the message", db.tables.security_events.length === 1 && db.tables.security_events[0].event_type === "seller_contacted" && !JSON.stringify(db.tables.security_events).includes("zip"))
    check("and the limiter counted it", db.tables.rate_limit_hits.some((h: any) => h.bucket === "receipt-contact"))
  }
  {
    /* No support address: the login's address as it is now, read from auth, not the profile's older copy. */
    const db = world()
    db.tables.creators[0].support_email = null
    db.tables.profiles.find((p: any) => p.id === SELLER_USER).email = "andrew.old@example.com"
    db.auth = { admin: { getUserById: async (id: string) => ({ data: { user: id === SELLER_USER ? { email: "Andrew.Now@Example.com" } : null } }) } }
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Where is the file?" })
    check("no support address: the login's current address", r.status === 200 && S.sent[0]?.to === "andrew.now@example.com", JSON.stringify(S.sent))
  }
  {
    /* A second business: its account's address is the owner's with a tag, from before the owner changed it. The owner's login today wins. */
    const OWNER = "99999999-9999-4999-8999-999999999999"
    const db = world({ extra: { business_links: [{ member_id: SELLER_USER, owner_id: OWNER }] } })
    db.tables.creators[0].support_email = null
    db.tables.profiles.find((p: any) => p.id === SELLER_USER).email = "andrew+slb-1a2b3c4d@old.example"
    db.auth = { admin: { getUserById: async (id: string) => ({ data: { user: id === OWNER ? { email: "andrew@new.example" } : id === SELLER_USER ? { email: "andrew+slb-1a2b3c4d@old.example" } : null } }) } }
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Where is the file?" })
    check("a second business: the owner's login address as it is now, no tag", r.status === 200 && S.sent[0]?.to === "andrew@new.example", JSON.stringify(S.sent))
  }
  {
    /* Auth cannot be read: the profile's address, untagged. */
    const db = world()
    db.tables.creators[0].support_email = null
    db.tables.profiles.find((p: any) => p.id === SELLER_USER).email = "andrew+slb-1a2b3c4d@example.com"
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Where is the file?" })
    check("auth unreadable: the profile's address with the business tag taken off", r.status === 200 && S.sent[0]?.to === "andrew@example.com", JSON.stringify(S.sent))
  }
  {
    /* Nobody to write to: said in words, nothing sent, and never Storelib's support inbox in the seller's place. */
    const db = world()
    db.tables.creators[0].support_email = null
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Where is the file?" })
    const b = await json(r)
    check("a seller with no address: refused in words, nothing sent", r.status === 409 && b.success === false && /no email address/.test(b.error) && S.sent.length === 0, JSON.stringify(b))
  }
  {
    const db = world()
    reset(db, null)
    const empty = await write({ orderId: ORDER, receiptToken: TOKEN, message: "   " })
    check("an empty message: 400 in words", empty.status === 400 && /Write a message/.test((await json(empty)).error))
    const long = await write({ orderId: ORDER, receiptToken: TOKEN, message: "x".repeat(2001) })
    check("over 2,000 characters: 400", long.status === 400)
    const wrong = await write({ orderId: ORDER, receiptToken: TOKEN_2, message: "Hello there" })
    check("another line's token with this id: 404", wrong.status === 404)
    const junk = await contact.POST(post("/api/receipt/contact", "{nope"))
    check("a body that is not JSON: 400", junk.status === 400)
    check("none of them sent anything", S.sent.length === 0)
  }
  {
    const db = world()
    reset(db, null)
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await write({ orderId: ORDER, receiptToken: TOKEN, message: `Question ${i}` })).status)
    check("the fourth message in five minutes is refused", statuses.join() === "200,200,200,429" && S.sent.length === 3, statuses.join())
  }
  {
    const since = new Date(Date.now() - 60 * 1000).toISOString()
    const db = world({ extra: { security_events: Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, order_id: ORDER, event_type: "seller_contacted", created_at: since })) } })
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "One more question" }, { "x-forwarded-for": "198.51.100.40" })
    const b = await json(r)
    check("five today already: 429 in words", r.status === 429 && /5 times today/.test(b.error) && S.sent.length === 0, JSON.stringify(b))
  }
  {
    const db = world()
    reset(db, null)
    S.sendFails = true
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Hello there" })
    const b = await json(r)
    check("the sender fails: 502 with words the page shows", r.status === 502 && /did not go out/.test(b.error), JSON.stringify(b))
    const logged = db.tables.email_logs.filter((l: any) => l.email_type === "seller_message")
    check("and email_logs says it failed", logged.length === 1 && logged[0].status === "failed" && /provider said no/.test(logged[0].error_message), JSON.stringify(logged))
  }
  {
    /* Before the SQL part: email_logs refuses the new type. The message still goes and the buyer is told it went. */
    const db = world({ failInsert: { email_logs: { code: "23514", message: 'new row for relation "email_logs" violates check constraint "email_logs_email_type_check"' } } })
    reset(db, null)
    const r = await write({ orderId: ORDER, receiptToken: TOKEN, message: "Hello there" })
    check("before the email_logs SQL: sent and 200 all the same", r.status === 200 && S.sent.length === 1)
  }

  /* ── Download ───────────────────────────────────────────────────────── */
  console.log("\nDownload")
  const get = (token: string | null) =>
    download.GET(new Request(`https://storelib.test/api/download/${ASSET}${token ? `?receipt=${token}` : ""}`, { headers: { "x-forwarded-for": "203.0.113.20" } }), {
      params: Promise.resolve({ assetId: ASSET }),
    })
  {
    const db = world()
    reset(db)
    const r = await get(TOKEN)
    const b = await json(r)
    check("a paid receipt's own file: 200 with a signed link and the file's name",
      r.status === 200 && b.success === true && /^https:\/\/files\.example\/signed\//.test(b.downloadUrl) && b.fileName === "6e6ba82c (4).pdf", JSON.stringify(b))
    check("signed for this one file, short lived, in its bucket",
      S.signed.length === 1 && S.signed[0].path === "creator/file.pdf" && S.signed[0].seconds <= 600 && S.signed[0].bucket === "digital-products", JSON.stringify(S.signed))
    check("never cached", r.headers.get("cache-control") === "no-store")
    check("the response carries no storage path", !JSON.stringify(b).includes("creator/file.pdf"))
  }
  {
    const db = world({ order: { status: "refunded", refund_amount_cents: 0 } })
    reset(db)
    const r = await get(TOKEN)
    const b = await json(r)
    check("a refunded receipt: 403 with the reason in words, nothing signed", r.status === 403 && b.reason === "refunded" && typeof b.error === "string" && S.signed.length === 0, JSON.stringify(b))
    const none = await get(null)
    check("no token and no session: refused", none.status === 403 || none.status === 404)
  }

  /* ── Review ─────────────────────────────────────────────────────────── */
  console.log("\nReview")
  const buyer = { id: BUYER, email: "ghita@example.com" }
  const owned = (extra: Record<string, any[]> = {}) => ({
    entitlements: [{ id: "ent1", buyer_id: BUYER, product_id: PRODUCT }],
    ...extra,
  })
  const review = (body: unknown) => reviews.POST(post("/api/reviews", body))
  {
    const db = world({ order: { buyer_id: BUYER }, extra: owned() })
    reset(db, null)
    const r = await review({ productId: PRODUCT, rating: 5, content: "Clean files and quick to set up." })
    check("signed out: 401", r.status === 401 && db.tables.reviews.length === 0)
  }
  {
    const db = world({ order: { buyer_id: BUYER }, extra: owned() })
    reset(db, buyer)
    const r = await review({ productId: PRODUCT, rating: 5, content: "  Clean files and quick to set up.  ", orderId: ORDER })
    const b = await json(r)
    check("a buyer: 200 with the review", r.status === 200 && b.review?.rating === 5, JSON.stringify(b))
    const row = db.tables.reviews[0]
    check("one row, text trimmed, on the buyer, the product and its seller",
      db.tables.reviews.length === 1 && row.content === "Clean files and quick to set up." && row.buyer_id === BUYER && row.creator_id === CREATOR)
    check("linked to the buyer's own order", row.order_id === ORDER)
    check("the seller hears about it", S.sent.some((m: any) => m.kind === "review") && db.tables.seller_notifications.length === 1)
    const second = await review({ productId: PRODUCT, rating: 3, content: "Changed my mind about it." })
    const sb = await json(second)
    check("a second review: 409 in plain words, and still one row", second.status === 409 && /already reviewed/.test(sb.error) && db.tables.reviews.length === 1, JSON.stringify(sb))
  }
  {
    /* Bought twice: two entitlements. `.single()` read that as none. */
    const db = world({ order: { buyer_id: BUYER }, extra: owned({ entitlements: [{ id: "a", buyer_id: BUYER, product_id: PRODUCT }, { id: "b", buyer_id: BUYER, product_id: PRODUCT }] }) })
    reset(db, buyer)
    const r = await review({ productId: PRODUCT, rating: 4, content: "Bought it twice, still good." })
    check("a buyer who bought it twice can review", r.status === 200, String(r.status))
  }
  {
    const db = world({ order: { buyer_id: BUYER } })
    reset(db, buyer)
    const r = await review({ productId: PRODUCT, rating: 4, content: "Never bought this one here." })
    check("no purchase: 403, no row", r.status === 403 && db.tables.reviews.length === 0)
  }
  {
    const db = world({ order: { buyer_id: BUYER, status: "refunded" }, extra: owned() })
    db.tables.orders[1].buyer_id = null
    reset(db, buyer)
    const r = await review({ productId: PRODUCT, rating: 1, content: "Refunded and reviewing anyway." })
    const b = await json(r)
    check("every order for it refunded: 403 in words", r.status === 403 && /completed purchase/.test(b.error) && db.tables.reviews.length === 0, JSON.stringify(b))
  }
  {
    const db = world({ order: { buyer_id: SELLER_USER }, extra: { entitlements: [{ id: "own", buyer_id: SELLER_USER, product_id: PRODUCT }] } })
    reset(db, { id: SELLER_USER, email: "seller@example.com" })
    const r = await review({ productId: PRODUCT, rating: 5, content: "My own product is great." })
    check("the seller on their own product: 403", r.status === 403 && db.tables.reviews.length === 0)
  }
  {
    const db = world({ order: { buyer_id: BUYER }, extra: owned() })
    reset(db, buyer)
    const cases: Array<[string, unknown]> = [
      ["six stars", { productId: PRODUCT, rating: 6, content: "Six stars is not a thing." }],
      ["half a star", { productId: PRODUCT, rating: 4.5, content: "Four and a half stars." }],
      ["no stars", { productId: PRODUCT, rating: 0, content: "No stars at all here." }],
      ["nine characters", { productId: PRODUCT, rating: 4, content: "Too short" }],
      ["text that is not text", { productId: PRODUCT, rating: 4, content: { a: 1 } }],
      ["a product id that is not one", { productId: "p1", rating: 4, content: "Looks fine to me here." }],
      ["over a thousand characters", { productId: PRODUCT, rating: 4, content: "x".repeat(1001) }],
    ]
    for (const [what, body] of cases) {
      const r = await review(body)
      check(`${what}: 400`, r.status === 400, String(r.status))
    }
    const junk = await reviews.POST(post("/api/reviews", "{oops"))
    check("a body that is not JSON: 400, not a crash", junk.status === 400)
    check("and none of them wrote a row", db.tables.reviews.length === 0)
  }
  {
    /* Two presses at once: both pass the check, the unique index lets one in. */
    const db = world({ order: { buyer_id: BUYER }, extra: owned(), failInsert: { reviews: { code: "23505", message: "duplicate key" } } })
    reset(db, buyer)
    const r = await review({ productId: PRODUCT, rating: 5, content: "Pressed twice at once." })
    const b = await json(r)
    check("the loser of two presses at once: 409, not a 500", r.status === 409 && /already reviewed/.test(b.error), JSON.stringify(b))
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
