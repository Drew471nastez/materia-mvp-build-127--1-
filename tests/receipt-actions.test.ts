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
import { withDiscount } from "@/lib/receipts/discount"

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
  check("an account's order is not offered a form the route refuses", /receipt\.buyer\.unclaimed \? \(\s*<form onSubmit=\{changeEmail\}/.test(page))
}

async function main() {
  pure()
  const resend = (await import(await bundleRoute("app/api/receipt/resend/route.ts"))) as any
  const change = (await import(await bundleRoute("app/api/receipt/update-email/route.ts"))) as any
  const download = (await import(await bundleRoute("app/api/download/[assetId]/route.ts"))) as any
  const reviews = (await import(await bundleRoute("app/api/reviews/route.ts"))) as any

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
    check("an order on an account: 403, pointing at account settings (the page says the same before asking)",
      r.status === 403 && /account settings/.test(b.error) && S.sent.length === 0, JSON.stringify(b))
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
