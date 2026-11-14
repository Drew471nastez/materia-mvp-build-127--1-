/**
 * ===========================================================================
 *  AA3: A GUEST'S PURCHASE REMEMBERED, NO FOLLOWER COUNTS ON A STORE'S FACE,
 *  FILES NEVER BREAKS A PICTURE, ORDERS IN THEIR OWN CURRENCY
 * ===========================================================================
 *
 *   GUEST     the browser that paid keeps a signed httpOnly grant per order
 *             (lib/receipts/guest-access*), written by the checkout itself
 *             on a website (not only when the receipt is opened), carried to
 *             the website's own host after paying on storelib.com, and read
 *             by a website's product page (built and imported) as well as
 *             /p. Never by IP. A refund closes it; another shop's products
 *             are never answered.
 *   PROFILES  a seller's own account hub shows no followers / following;
 *             the creator page passes showCounts={false}; profiles keep them.
 *   FILES     a product photo, a picture in a product's description and one
 *             only a lesson shows all survive Delete; the creator is told
 *             "Removed from Files. Still used by 3 products, so the picture
 *             stays."
 *   CURRENCY  every order amount is in its own currency by the one writer
 *             (lei as "lei", yen without decimals), the CSV names it, and a
 *             sum over mixed currencies is split, never added.
 *
 * Run with:  npx tsx --conditions=react-server tests/aa3-guest-files-currency.test.ts
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import {
  GUEST_ACCESS_COOKIE,
  GUEST_HINT_COOKIE,
  guestAccessKey,
  guestAccessSetCookies,
  readGrants,
  rememberOnSiteUrl,
  samePath,
  signGrant,
  writeGrants,
} from "@/lib/receipts/guest-access"
import { guestOpenHref, guestOwns, rememberReceipt } from "@/lib/receipts/guest-access-server"
import { ownedBanner } from "@/lib/storelib-theme/compat/owned-banner"
import { removeFromFiles, keptMessage } from "@/lib/files/keep"
import { hiddenNote, manyNote, usedByPhrase } from "@/lib/files/kept-words"
import { formatOrderMoney, formatSplitMoney, splitByCurrency } from "@/lib/orders/money"
import { ordersCsv } from "@/lib/orders/export-csv"
import { formatMoney as receiptMoney } from "@/lib/receipts/rules"
import { money as notificationMoney } from "@/lib/notifications/format"
import { formatMoney as templateMoney } from "@/lib/notify/templates/catalog"
import { formatMoney as shippedEmailMoney } from "@/lib/physical/email-templates"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 500)}`}`)
  }
}
const section = (name: string) => console.log(`\n${name}`)
const read = (p: string) => readFileSync(p, "utf8")
const nb = (s: string) => s.replace(/ /g, " ")

const KEY = guestAccessKey({ GUEST_ACCESS_SECRET: "aa3-a-test-secret-that-is-long-enough" })!
const SHOP = "5a000000-0000-4000-8000-000000000001"
const OTHER_SHOP = "5b000000-0000-4000-8000-000000000002"
const EBOOK = "e0000000-0000-4000-8000-000000000001"
const COURSE = "e0000000-0000-4000-8000-000000000002"
const TEE = "e0000000-0000-4000-8000-000000000003"
const FOREIGN = "e0000000-0000-4000-8000-000000000004"
const O1 = "0a000000-0000-4000-8000-000000000001"
const O2 = "0a000000-0000-4000-8000-000000000002"
const O3 = "0a000000-0000-4000-8000-000000000003"
const O4 = "0a000000-0000-4000-8000-000000000004"
const O5 = "0a000000-0000-4000-8000-000000000005"
const T1 = "tok1_tok1_tok1_tok1_tok1_tok1_aa"
const T2 = "tok2_tok2_tok2_tok2_tok2_tok2_aa"
const T3 = "tok3_tok3_tok3_tok3_tok3_tok3_aa"
const T4 = "tok4_tok4_tok4_tok4_tok4_tok4_aa"
const T5 = "tok5_tok5_tok5_tok5_tok5_tok5_aa"

async function guest() {
  section("GUEST: the browser that paid keeps the purchase")
  const now = Date.UTC(2026, 9, 24)
  const tables = {
    orders: [
      /* One basket: an ebook and a course, same payment, same address; a line of the same session to another address. */
      { id: O1, product_id: EBOOK, variant_id: null, status: "completed", amount_cents: 900, buyer_email: "g@example.com", buyer_id: null, receipt_token: T1, stripe_session_id: "cs_1" },
      { id: O2, product_id: COURSE, variant_id: null, status: "completed", amount_cents: 1900, buyer_email: "G@example.com ", buyer_id: null, receipt_token: T2, stripe_session_id: "cs_1" },
      { id: O3, product_id: COURSE, variant_id: null, status: "completed", amount_cents: 1900, buyer_email: "someone@else.com", buyer_id: null, receipt_token: T3, stripe_session_id: "cs_1" },
      /* Refunded since. */
      { id: O4, product_id: EBOOK, variant_id: null, status: "refunded", amount_cents: 900, refund_amount_cents: 900, buyer_email: "g@example.com", buyer_id: null, receipt_token: T4, stripe_session_id: "cs_2" },
      /* Another shop's product, bought in the same browser. */
      { id: O5, product_id: FOREIGN, variant_id: null, status: "completed", amount_cents: 500, buyer_email: "g@example.com", buyer_id: null, receipt_token: T5, stripe_session_id: "cs_3" },
    ],
    products: [
      { id: EBOOK, creator_id: SHOP, type: "digital" },
      { id: COURSE, creator_id: SHOP, type: "course" },
      { id: TEE, creator_id: SHOP, type: "physical" },
      { id: FOREIGN, creator_id: OTHER_SHOP, type: "digital" },
    ],
  }
  const db = fakeDb(tables as any)

  const first = await rememberReceipt(db as any, T1, null, { key: KEY, now })
  const grants = readGrants(first?.value)
  check("a paid receipt writes a grant for each paid line of its payment and address", first?.remembered === 2 && grants.map((g) => g.orderId).sort().join() === [O1, O2].sort().join(), first)
  check("  never for a line of the same payment paid by another address", !grants.some((g) => g.orderId === O3))
  check("  the grant names an order id and a signature, never an email", !!first && !first.value.includes("@") && !first.value.includes(T1))

  const refunded = await rememberReceipt(db as any, T4, null, { key: KEY, now })
  check("a refunded order is not remembered", refunded?.remembered === 0 && refunded.value === "", refunded)
  check("a token that names no order writes nothing", (await rememberReceipt(db as any, "nope_nope_nope_nope_nope_nope_zz", null, { key: KEY, now })) === null)
  check("no key, nothing remembered", (await rememberReceipt(db as any, T1, null, { key: null, now })) === null)

  /* A cookie that already held a grant later refunded: dropped on the next write. */
  const stale = signGrant(KEY, { id: O4, receiptToken: T4 }, now)!
  const foreign = signGrant(KEY, { id: O5, receiptToken: T5 }, now)!
  const merged = await rememberReceipt(db as any, T1, writeGrants([stale, foreign]), { key: KEY, now })
  const mergedIds = readGrants(merged?.value).map((g) => g.orderId)
  check("  what the cookie held is kept, a refunded grant dropped", mergedIds.includes(O5) && !mergedIds.includes(O4) && mergedIds.includes(O1), mergedIds)

  section("GUEST: a website's product page asks it, for that shop only")
  const raw = merged!.value
  const owns = await guestOwns(db as any, raw, { creatorId: SHOP }, [EBOOK, COURSE, TEE, FOREIGN], { key: KEY, now })
  check("the shop's ebook and course are owned, whole", owns[EBOOK]?.whole === true && owns[COURSE]?.whole === true, owns)
  check("  another shop's product is never answered, whatever the cookie holds", !owns[FOREIGN])
  check("  a physical product is never 'owned'", !owns[TEE])
  check("  the way in is the order, through the cookie (no token in the page)", guestOpenHref(owns[EBOOK].orderId) === `/api/receipt/open?order=${O1}` && !JSON.stringify(owns).includes("tok"))
  const forged = writeGrants([{ ...signGrant(KEY, { id: O1, receiptToken: T1 }, now)!, orderId: O3 }])
  check("a signature moved onto another buyer's order reads nothing", Object.keys(await guestOwns(db as any, forged, { creatorId: SHOP }, [COURSE], { key: KEY, now })).length === 0)
  const later = Date.UTC(2027, 10, 1)
  check("a year on, the grant has run out", Object.keys(await guestOwns(db as any, raw, { creatorId: SHOP }, [EBOOK], { key: KEY, now: later })).length === 0)
  const refundNow = fakeDb({ ...tables, orders: tables.orders.map((o) => (o.id === O1 ? { ...o, status: "refunded", refund_amount_cents: 900 } : o)) } as any)
  check("a refund after the grant closes it at once", !(await guestOwns(refundNow as any, raw, { creatorId: SHOP }, [EBOOK], { key: KEY, now }))[EBOOK])

  section("GUEST: the cookie and the handoff")
  const [owned, hint] = guestAccessSetCookies("abc", true)
  check("the grant cookie is httpOnly, Secure, SameSite=Lax, path /, a year, host only", owned.startsWith(`${GUEST_ACCESS_COOKIE}=abc;`) && /HttpOnly/.test(owned) && /Secure/.test(owned) && /SameSite=Lax/.test(owned) && /Path=\//.test(owned) && /Max-Age=31536000/.test(owned) && !/Domain=/i.test(owned), owned)
  check("  the hint beside it says only 1, readable, and proves nothing", hint.startsWith(`${GUEST_HINT_COOKIE}=1;`) && !/HttpOnly/.test(hint) && !/Domain=/i.test(hint), hint)
  check("  an empty value clears both", guestAccessSetCookies("", false).every((c) => /Max-Age=0/.test(c)))
  check("the handoff stays on the website's own host", rememberOnSiteUrl("https://shop.example.com/products/a?checkout=paid", T1) === `https://shop.example.com/api/receipt/remember?receipt=${T1}&next=${encodeURIComponent("/products/a?checkout=paid")}`)
  check("  and goes on only to a path of that host", samePath("/products/a") === "/products/a" && samePath("//evil.com") === "/" && samePath("/\\evil.com") === "/" && samePath("https://evil.com") === "/" && samePath("/a\r\nSet-Cookie: x") === "/")
  check("the imported theme's notice links a guest to the receipt, nothing else", /href="\/api\/receipt\/open\?order=/.test(ownedBanner({ whole: true, options: [] }, null, guestOpenHref(O1))) && /href="\/account"/.test(ownedBanner({ whole: true, options: [] }, null, "javascript:alert(1)")))

  section("GUEST: every product page reads it, and the checkouts write it")
  const site = read("app/api/checkout/site/route.ts")
  // Changed on purpose (round AX): a free basket pressed again is answered with the grant too (app/api/checkout/site free, answerClaimed), so three writes.
  check("a website's paid and free checkouts write the grant on the website's host", (site.match(/await withGuestGrant\(afterPaidHeaders\(/g) ?? []).length === 3)
  const complete = read("app/api/checkout/cart/complete/route.ts")
  check("paying on storelib.com for a website's basket goes back through the handoff for a guest", /user \? paidReturnUrl\(back\) : rememberOnSiteUrl\(paidReturnUrl\(back\), result\.receiptToken\)/.test(complete))
  const ownedRoute = read("app/api/site-account/owned/route.ts")
  check("a built website's product block asks for a guest too, this site's shop only", /guestOwns\(db, raw, \{ creatorId: site\.creatorId \}, ids\)/.test(ownedRoute) && /siteOfRequest\(db, request\)/.test(ownedRoute))
  check("  and asks only when the hint says there is something", /sl_signed_in\|sl_owned_hint/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
  check("an imported theme's product page reads the grant", /guestOwns\(createAdminClient\(\), guestAccessFromCookieHeader/.test(read("app/api/site-theme/site/[username]/[[...path]]/route.ts")))
  /* Round 49: the product page is one HTML for everybody (a CDN holds it); the grant is read after load, by the purchase check and the guest row's own route, from the same cookie. */
  check("/p reads it after load, from the same signed cookie", /heldGrants\(admin, guestAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\), \{ productId \}\)/.test(read("app/api/purchases/guest-owned/route.ts")) && /heldGrants\(admin, guestAccessFromCookieHeader\(request\.headers\.get\("cookie"\)\), \{ productId \}\)/.test(read("app/api/purchases/verify/route.ts")) && !/heldGrants|cookies\(\)/.test(read("app/(storelib)/(marketing)/p/[slug]/page.tsx")))
  const helper = read("lib/receipts/guest-access-server.ts") + read("lib/receipts/guest-access.ts")
  check("no IP and no device fingerprint is ever proof", !/x-forwarded-for|x-real-ip|user-agent|materia_session/i.test(helper))
}

/* ── Files ── */
type Row = Record<string, unknown>
function filesDb(tables: Record<string, Row[]>, rpc: (args: Row) => { data: unknown; error: unknown } = () => ({ data: false, error: null })) {
  const removed: { bucket: string; paths: string[] }[] = []
  const rpcCalls: Row[] = []
  const writes: { table: string; op: string; payload?: unknown }[] = []
  const from = (table: string) => {
    const filters: [string, string, unknown][] = []
    let op = "select"
    let payload: unknown = null
    const run = async () => {
      if (op !== "select") {
        writes.push({ table, op, payload })
        return { data: null, error: null }
      }
      const out = (tables[table] ?? []).filter((r) => filters.every(([k, c, v]) => (k === "eq" ? String(r[c]) === String(v) : k === "in" ? (v as unknown[]).map(String).includes(String(r[c])) : true)))
      return { data: out, error: null }
    }
    const q: Row = {
      select: () => q,
      eq: (c: string, v: unknown) => (filters.push(["eq", c, v]), q),
      in: (c: string, v: unknown[]) => (filters.push(["in", c, v]), q),
      not: () => q,
      limit: () => q,
      upsert: (p: unknown) => ((op = "upsert"), (payload = p), q),
      delete: () => ((op = "delete"), q),
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => run().then(res, rej),
    }
    return q
  }
  const storage = { from: (bucket: string) => ({ remove: async (paths: string[]) => (removed.push({ bucket, paths }), { error: null }) }) }
  return { from, storage, rpc: async (_fn: string, args: Row) => (rpcCalls.push(args), rpc(args)), removed, rpcCalls, writes }
}

async function files() {
  section("FILES: Delete never breaks a picture that shows somewhere")
  const USER = "a0000000-0000-4000-8000-0000000000aa"
  const owner = { userId: USER, creatorId: SHOP }
  const PHOTO = `${USER}/files/1-lamp.jpg`
  const IN_TEXT = `${USER}/files/2-in-description.jpg`
  const LESSON = `${USER}/files/3-lesson.jpg`
  const FREE = `${USER}/files/4-free.jpg`
  const media = (p: string) => `https://storelib.com/media/store-builder-images/${p}`
  const tables = {
    products: [
      { id: "p1", creator_id: SHOP, title: "Lamp", thumbnail_url: media(PHOTO), gallery_urls: [] },
      { id: "p2", creator_id: SHOP, title: "Shade", thumbnail_url: null, gallery_urls: [media(PHOTO)] },
      { id: "p3", creator_id: SHOP, title: "Bulb", thumbnail_url: null, gallery_urls: [], description: `<p>Look</p><img src="${media(PHOTO)}"><img src="${media(IN_TEXT)}">` },
    ],
    file_details: [],
  }
  const db = filesDb(tables, (args) => ({ data: args.p_name === LESSON, error: null }))
  const out = await removeFromFiles(db, owner, [PHOTO, IN_TEXT, LESSON, FREE].map((path) => ({ bucket: "store-builder-images", path })))
  check("answered", out.ok === true, out)
  if (out.ok !== true) return
  const hidden = new Map(out.hidden.map((h) => [h.id.split(":")[1], h.uses]))
  check("a product photo used by three products is kept in storage and taken out of Files", hidden.get(PHOTO)?.filter((u) => u.kind === "product").length === 3 && !db.removed.some((r) => r.paths.includes(PHOTO)), out.hidden)
  check("  a picture only a product's description shows survives too", hidden.has(IN_TEXT) && hidden.get(IN_TEXT)![0].label === "Bulb")
  check("  one only a lesson shows (the catch-all) survives", hidden.get(LESSON)?.[0].kind === "other")
  check("  only the file nothing uses is removed from storage", out.deleted.length === 1 && out.deleted[0].endsWith(FREE) && db.removed.length === 1 && JSON.stringify(db.removed[0].paths) === JSON.stringify([FREE]), db.removed)
  check("  the kept ones are hidden, not deleted, in file_details", (db.writes.find((w) => w.op === "upsert")?.payload as Row[] | undefined)?.length === 3)
  check("the creator is told plainly: Removed from Files. Still used by 3 products, so the picture stays.", hiddenNote(hidden.get(PHOTO)!) === "Removed from Files. Still used by 3 products, so the picture stays.", hiddenNote(hidden.get(PHOTO)!))
  check("  one product by its name", hiddenNote(hidden.get(IN_TEXT)!) === "Removed from Files. Still used by Bulb, so the picture stays.")
  check("  somewhere unnamed", hiddenNote(hidden.get(LESSON)!, "video") === "Removed from Files. Still used by your store, so the video stays.")
  check("  places together", usedByPhrase([{ kind: "product", label: "Lamp", href: "/a" }, { kind: "website", label: "Website: Home" }, { kind: "collection", label: "Collection: Summer" }]) === "Lamp, your website and a collection")
  check("  several at once", manyNote(2, 3) === "2 files deleted. 3 removed from Files and kept, because they're still used." && manyNote(0, 1) === "1 removed from Files and kept, because it's still used.")
  check("  no em dash in any of it", ![hiddenNote([]), manyNote(1, 1), keptMessage([{ id: "x", uses: [{ kind: "product", label: "Lamp", href: "" }] }]) ?? ""].some((s) => s.includes("—")))

  const before = filesDb({ ...tables, file_details: [] }, () => ({ data: true, error: null }))
  /* Before part 280 (no hidden_at column): file_details reads fail on that column. */
  const before280 = { ...before, from: (t: string) => (t === "file_details" ? { select: () => ({ limit: async () => ({ data: null, error: { code: "42703" } }) }) } : before.from(t)) }
  const old = await removeFromFiles(before280, owner, [{ bucket: "store-builder-images", path: FREE }])
  check("before part 280 the catch-all is asked too, and its yes keeps the file", old.ok === true && old.kept.length === 1 && old.deleted.length === 0 && before.removed.length === 0 && before.rpcCalls.length === 1, old)
  check("the Files page says it with the places", /hiddenNote\(keptThere\.uses,/.test(read("components/files/files-library.tsx")) && /manyNote\(done\.size - keptThere, keptThere\)/.test(read("components/files/files-library.tsx")))
}

function profiles() {
  section("PROFILES: no followers or following on the face of a store")
  const hero = read("components/profile/profile-hero.tsx")
  check("the profile header takes showCounts and hands it to the follow row", /showCounts = true,/.test(hero) && /showCounts=\{showCounts\}/.test(hero))
  check("a seller's own account hub shows none", /showCounts=\{!identity\.creator\}/.test(read("components/account/account-hub.tsx")))
  check("the creator page shows none", /showCounts=\{false\}/.test(read("app/(storelib)/(marketing)/u/[username]/page.tsx")))
  check("a person's profile still shows them", /followers=\{profile\.followers\}/.test(read("components/profile/member-profile-page.tsx")) && !/showCounts=\{false\}/.test(read("components/profile/member-profile-page.tsx")))
}

function currency() {
  section("CURRENCY: each order in what it was charged in")
  const lei = nb(formatOrderMoney(2500, "RON"))
  check("lei read lei, as the product and the checkout write them", /^25[.,]00 lei$/.test(lei), lei)
  check("dollars stay dollars", nb(formatOrderMoney(2500, "USD")) === "$25.00")
  check("yen have no decimals", nb(formatOrderMoney(2500, "JPY")) === "¥2,500", formatOrderMoney(2500, "JPY"))
  check("the receipt writes lei the same way", /25\.00 lei/.test(nb(receiptMoney(2500, "ron", "en-US"))), receiptMoney(2500, "ron", "en-US"))
  check("the notification centre: yen without decimals, lei as lei", nb(notificationMoney(2500, "jpy")) === "¥2,500" && /lei/.test(nb(notificationMoney(2500, "RON"))), [notificationMoney(2500, "jpy"), notificationMoney(2500, "RON")])
  check("the buyer and seller email templates", /25\.00 lei/.test(nb(templateMoney(2500, "RON"))) && nb(templateMoney(500, "jpy")) === "¥500", [templateMoney(2500, "RON"), templateMoney(500, "jpy")])
  check("the shipped order emails", nb(shippedEmailMoney(2500, "JPY")) === "¥2,500" && /lei/.test(nb(shippedEmailMoney(2500, "RON"))))

  section("CURRENCY: sums over mixed currencies are split, never added")
  const split = splitByCurrency([{ cents: 10000, currency: "RON" }, { cents: 3500, currency: "usd" }, { cents: 2000, currency: "RON" }])
  check("one line per currency, the largest first", JSON.stringify(split) === JSON.stringify([{ currency: "RON", cents: 12000 }, { currency: "USD", cents: 3500 }]), split)
  check("  written with a plus", nb(formatSplitMoney([{ cents: 12000, currency: "RON" }, { cents: 3500, currency: "USD" }])) === "120.00 lei + $35.00")
  const dash = read("app/api/dashboard/route.ts")
  check("the dashboard API keeps each currency apart", /revenueByCurrency = splitByCurrency\(/.test(dash) && /select\("id, amount_cents, status, currency"\)/.test(dash))

  section("CURRENCY: the export names it")
  const order = (id: string, cents: number, cur: string) =>
    ({ id, number: 1, createdAt: "2026-10-01T10:00:00Z", lines: [{ product: { title: "X" } }], customerName: "", customerEmail: "", source: null, totalCents: cents, refundedCents: 0, itemCount: 1, payment: "paid", fulfillment: "fulfilled", delivery: null, currency: cur }) as never
  const csv = ordersCsv([order("a", 2500, "RON"), order("b", 2500, "JPY")], "UTC", "plain").split("\n")
  check("a Currency column after the amounts", /"Total","Refunded","Currency"/.test(csv[0]), csv[0])
  check("  lei in lei, yen as whole yen", /"25\.00","0\.00","RON"/.test(csv[1]) && /"2500","0","JPY"/.test(csv[2]), csv.slice(1, 3))

  section("CURRENCY: no surface writes an order's money with Intl alone any more")
  check("  lib/orders/money.ts formatOrderMoney", /return formatMinor\(Number\.isFinite\(minor\) \? minor : 0, orderCurrency\(currency\), appLocale\(\)\)/.test(read("lib/orders/money.ts")))
  for (const f of ["lib/receipts/rules.ts", "lib/notifications/format.ts", "lib/push/notifications.ts", "app/api/invoice/route.ts", "app/api/stripe/order-timeline/route.ts", "lib/emails/notices.ts", "app/(storelib)/app/customers/page.tsx"]) {
    check(`  ${f}`, !/style: "currency"/.test(read(f).replace(/new Intl\.NumberFormat\("en(?:-US)?", \{ style: "currency", currency: code \}\)(?!\.format)/g, "")), f)
  }
  check("Analytics revenue in the store's own decimals", /formatMinor\(cents, storeCurrency, appLocale\(\)\)/.test(read("app/(storelib)/app/analytics/analytics-client.tsx")))
}

async function main() {
  await guest()
  await files()
  profiles()
  currency()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
