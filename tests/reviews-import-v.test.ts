/**
 * ===========================================================================
 *  REVIEWS, ROUND V: IMPORTS FROM EVERY APP, AND THE REVIEWS ON A WEBSITE
 * ===========================================================================
 * The owner: "make sure that importing reviews works from across multiple
 * third-party platforms, adapted for multiple imports [...] Make sure the
 * reviews app works and showing reviews actually works on a website and is
 * dynamic, good and clean, and people can write reviews, based on the
 * settings of the integration."
 *
 *   DETECTION     each app's export (tests/fixtures/reviews) read as that app
 *   MAPPING       each Storelib field found under the app's own column names
 *   RATINGS       5, "4.0 out of 5 stars", 8/10, 80%, stars, FIVE
 *   PRODUCTS      by handle, link, SKU, id or title; unmatched rows grouped,
 *                 assigned or skipped
 *   PLAN          every fixture, end to end, with replies, photos, status
 *   SANITISED     an export's HTML is plain text; the server reads every row
 *                 again and trusts nothing
 *   ROUTES        start, rows, finish, a second import adds nothing, the same
 *                 review from another app is found, undo deletes that
 *                 import's reviews only, photos copied and removed, emails
 *                 kept apart, one store never reaches another's products or
 *                 imports, the one-step CSV post
 *   WRITING       the website form by the store's settings: buyers only,
 *                 the hidden field, a visitor's review waiting for approval,
 *                 approved, the store told
 *   WEBSITE       the product's reviews with the filter by stars, the sort,
 *                 Show more by the app's number, photos in a lightbox,
 *                 verified purchase from an import, structured data
 *   SQL           part 232 on part 215's import table, RLS, as a migration
 *                 and a run-now part
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/reviews-import-v.test.ts
 */
import { register } from "node:module"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import {
  autoMapping,
  checkImportRow,
  contentHash,
  detectPlatform,
  emptyMapping,
  handleFromUrl,
  headerKey,
  mediaUrls,
  normalizeBool,
  normalizeDate,
  normalizeRating,
  normalizeStatus,
  planReviews,
  plainText,
  productMatcher,
  ratingScale,
  readImportFile,
  NO_PRODUCT_KEY,
  PLATFORMS,
  ROW_ERRORS,
  type CatalogProduct,
} from "../lib/reviews/import"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { buildStorefrontReviews, sampleStorefrontReviews } from "../lib/reviews/storefront"
import { compileSection, renderSection } from "../lib/storelib-theme"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { storefrontData } from "../lib/website-builder/storefront-data"
import { productJsonLd } from "../lib/website-builder/site-seo"
import { UI_WORDS } from "../lib/markets/ui-words"

let passed = 0
let failed = 0
const realLog = console.log.bind(console)
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    realLog(`  ok    ${name}`)
  } else {
    failed++
    realLog(`  FAIL  ${name}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 900)}` : ""}`)
  }
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const fixture = (name: string) => read(`tests/fixtures/reviews/${name}`)

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const OTHER = "c0000000-0000-4000-8000-000000000002"
const PRODUCT = "a0000000-0000-4000-8000-000000000001"
const SECOND = "a0000000-0000-4000-8000-000000000003"
const OTHER_PRODUCT = "a0000000-0000-4000-8000-000000000002"
const SELLER_USER = "u0000000-0000-4000-8000-000000000001"
const OTHER_USER = "u0000000-0000-4000-8000-000000000002"
const ORDER = "o0000000-0000-4000-8000-000000000001"

const CATALOG: CatalogProduct[] = [
  { id: PRODUCT, title: "Linen Apron", slug: "linen-apron-natural", skus: ["LA-01"] },
  { id: SECOND, title: "Oak Board", slug: "oak-board", skus: ["OB-01"] },
]

function planOf(file: string, assign: Record<string, string> = { [NO_PRODUCT_KEY]: PRODUCT }) {
  const table = readImportFile(fixture(file), file)!
  const platform = detectPlatform(table.headers).platform
  const mapping = autoMapping(table.headers, platform)
  return { table, platform, mapping, plan: planReviews(table, mapping, { platform, products: CATALOG, assign }) }
}

/* ── detection ───────────────────────────────────────────────────────── */

function detection() {
  realLog("\nWhich app wrote the file")
  const expected: Record<string, string> = {
    "judgeme.csv": "judgeme",
    "yotpo.csv": "yotpo",
    "loox.csv": "loox",
    "stamped.csv": "stamped",
    "okendo.csv": "okendo",
    "shopify.csv": "shopify",
    "reviewsio.csv": "reviewsio",
    "trustpilot-service.csv": "trustpilot",
    "trustpilot-product.csv": "trustpilot_product",
    "google.json": "google",
    "google-outscraper.csv": "google",
    "etsy.csv": "etsy",
    "amazon.csv": "amazon",
    "amazon-asin.csv": "amazon",
    "woocommerce.csv": "woocommerce",
    "woocommerce.xml": "woocommerce",
    "fera.csv": "fera",
    "alireviews.csv": "alireviews",
    "rivyo.csv": "rivyo",
    "other.csv": "other",
  }
  const files = readdirSync(join(root, "tests/fixtures/reviews"))
  check("a fixture for every app's header shape", Object.keys(expected).every((f) => files.includes(f)) && files.length === Object.keys(expected).length, files)
  for (const [file, platform] of Object.entries(expected)) {
    const table = readImportFile(fixture(file), file)
    const found = table ? detectPlatform(table.headers).platform : null
    check(`${file} reads as ${platform}`, found === platform, { found, headers: table?.headers })
  }
  check("every app in the list but Other has a header set to be known by", PLATFORMS.filter((p) => p.id !== "other").every((p) => p.signatures.length > 0) && PLATFORMS.length === 17)
  check("header names compare however they are written", headerKey("Review Score") === "review_score" && headerKey("reviewScore") === "review_score" && headerKey(" REVIEW-SCORE ") === "review_score" && headerKey("Review Created (UTC)") === "review_created_utc")
  const semi = readImportFile(fixture("other.csv"), "other.csv")!
  check("a semicolon file (Excel in Europe) is split on semicolons", semi.headers.length === 5 && semi.rows[0][1] === "8/10")
  const xml = readImportFile(fixture("woocommerce.xml"), "woocommerce.xml")!
  check("a WordPress export: the product's comments only, never a page's", xml.format === "xml" && xml.rows.length === 2 && xml.rows.every((r) => r[2] === "Linen Apron"))
  const json = readImportFile(fixture("google.json"), "google.json")!
  check("a JSON export: nested names become columns", json.headers.includes("reviewer.displayName") && json.headers.includes("reviewReply.comment"))
  check("an empty file or one that is not reviews: nothing", readImportFile("", "x.csv") === null && readImportFile("{\"not\": 1}", "x.json") === null)
}

/* ── mapping ─────────────────────────────────────────────────────────── */

function mapping() {
  realLog("\nWhich column is what")
  const yotpo = planOf("yotpo.csv")
  const h = (p: ReturnType<typeof planOf>, f: keyof typeof p.mapping) => p.table.headers[p.mapping[f]]
  check("Yotpo: the review is Review Content, and Comment Content is the store's reply", h(yotpo, "body") === "Review Content" && h(yotpo, "reply") === "Comment Content" && h(yotpo, "verified") === "User Type" && h(yotpo, "videos") === "Published Video URLs")
  const woo = planOf("woocommerce.csv")
  check("WooCommerce: comment_content is the review, comment_parent the reply link", h(woo, "body") === "comment_content" && h(woo, "parent_id") === "comment_parent" && woo.mapping.reply === -1)
  const judge = planOf("judgeme.csv")
  check("Judge.me: curated is the status, picture_urls the photos", h(judge, "status") === "curated" && h(judge, "photos") === "picture_urls")
  const tp = planOf("trustpilot-service.csv")
  check("Trustpilot: the shop's address is not a product link", tp.mapping.product_url === -1 && h(tp, "rating") === "Review Stars")
  const google = planOf("google.json")
  check("Google: the reviewer's display name, the stars in words", h(google, "author") === "reviewer.displayName" && h(google, "rating") === "starRating")
  const used = Object.values(yotpo.mapping).filter((i) => i >= 0)
  check("no column is read as two fields", new Set(used).size === used.length)
  const other = planOf("other.csv")
  check("Other: nothing guessed, rating and review asked for", other.platform === "other" && other.mapping.rating === -1 && other.plan.rows.length === 0)
  const manual = { ...emptyMapping(), product_title: 0, rating: 1, body: 2, author: 3, date: 4 }
  const byHand = planReviews(other.table, manual, { platform: "other", products: CATALOG })
  check("mapped by hand: 8/10 is four stars, a day first date, an unknown product waits", byHand.rows.length === 1 && byHand.rows[0].rating === 4 && byHand.rows[0].date?.startsWith("2024-03-14") === true && byHand.unmatched.length === 1 && byHand.unmatched[0].label === "Unknown Thing", byHand)
}

/* ── ratings and cells ───────────────────────────────────────────────── */

function cells() {
  realLog("\nEach cell as Storelib keeps it")
  const cases: [unknown, number | null][] = [["5", 5], ["4.0 out of 5 stars", 4], ["8/10", 4], ["80%", 4], ["★★★☆☆", 3], ["FIVE", 5], ["two", 2], ["4,5", 5], ["0", null], ["", null], ["STAR_RATING_UNSPECIFIED", null], ["great", null], ["9", null]]
  const got = cases.map(([v]) => normalizeRating(v))
  check("ratings on any scale become whole stars from one to five", cases.every(([, want], i) => got[i] === want), got)
  check("a column of tens is on a scale of ten; one stray 9 among fives is not", ratingScale(["8", "10", "6", "9"]) === 10 && normalizeRating("8", 10) === 4 && ratingScale(["5", "4", "9", "3", "5"]) === 5 && ratingScale(["80", "100", "60"]) === 100 && normalizeRating("60", 100) === 3)
  check("dates: ISO with a zone, a day first column, words, Amazon's sentence, unix seconds", normalizeDate("2023-12-01 10:00:00 -0500") === "2023-12-01T15:00:00.000Z" && normalizeDate("14.03.2024", { dayFirst: true })?.startsWith("2024-03-14") === true && normalizeDate("03/04/2024")?.startsWith("2024-03-04") === true && normalizeDate("Reviewed in the United States on March 3, 2024")?.startsWith("2024-03-0") === true && normalizeDate("1709460000") === "2024-03-03T10:00:00.000Z")
  check("a date in the future reads as now; nonsense is no date", normalizeDate("2999-01-01", { now: Date.parse("2026-01-01T00:00:00Z") }) === "2026-01-01T00:00:00.000Z" && normalizeDate("soon") === null && normalizeDate("1970-01-01") === null)
  check("verified: yes, 1, Verified Purchase, verified_buyer; anonymous is not", ["yes", "1", "true", "Verified Purchase", "verified_buyer"].every(normalizeBool) && !["no", "0", "", "anonymous_user"].some(normalizeBool))
  check("status: off is hidden, waiting is pending, the rest published", normalizeStatus("spam") === "hidden" && normalizeStatus("false") === "hidden" && normalizeStatus("not-yet") === "pending" && normalizeStatus("approved") === "published" && normalizeStatus("") === "published" && normalizeStatus("0", { "0": "pending" }) === "pending")
  check("media: every address once, whatever separates them, never one with a password", JSON.stringify(mediaUrls('["https://a.test/1.jpg","https://a.test/2.jpg"] | https://a.test/1.jpg; http://b.test/3.png https://u:p@c.test/x.jpg', 4)) === JSON.stringify(["https://a.test/1.jpg", "https://a.test/2.jpg", "http://b.test/3.png"]))
  check("the handle in a product link", handleFromUrl("https://shop.example/products/linen-apron?variant=1") === "linen-apron" && handleFromUrl("/p/oak-board") === "oak-board" && handleFromUrl("https://x.test/en/collections/all/products/caf%C3%A9-mug") === "café-mug")
}

/* ── products ────────────────────────────────────────────────────────── */

function products() {
  realLog("\nThe store's own products")
  const match = productMatcher(CATALOG)
  check("by the handle Shopify made from the title, by a link, by SKU, by id, by title", match({ handle: "linen-apron" }) === PRODUCT && match({ url: "https://old.example/products/oak-board" }) === SECOND && match({ sku: "la-01" }) === PRODUCT && match({ id: SECOND }) === SECOND && match({ title: "oak board" }) === SECOND && match({ handle: "https://shop.example/products/linen-apron" }) === PRODUCT)
  check("nothing that names no product of the store's", match({ handle: "silk-scarf", id: "7712345", title: "Silk Scarf" }) === null && match({}) === null)
  const asin = planOf("amazon-asin.csv", {})
  check("an Amazon ASIN the store does not have: one group, waiting", asin.plan.rows.length === 0 && asin.plan.unmatched.length === 1 && asin.plan.unmatched[0].count === 1 && asin.plan.unmatched[0].key === "product_id:b00test123")
  const assigned = planOf("amazon-asin.csv", { "product_id:b00test123": SECOND })
  check("  assigned to a product, it imports there", assigned.plan.rows.length === 1 && assigned.plan.rows[0].productId === SECOND)
  const skipped = planOf("amazon-asin.csv", { "product_id:b00test123": "skip" })
  check("  skipped, it is counted as skipped", skipped.plan.rows.length === 0 && skipped.plan.skipped === 1 && skipped.plan.unmatched.length === 0)
  const foreign = planOf("amazon-asin.csv", { "product_id:b00test123": OTHER_PRODUCT })
  check("  assigned to a product that is not the store's: still waiting", foreign.plan.rows.length === 0 && foreign.plan.unmatched.length === 1)
  const service = planOf("trustpilot-service.csv", {})
  check("Trustpilot service reviews name no product: one group for the creator to place", service.plan.unmatched.length === 1 && service.plan.unmatched[0].key === NO_PRODUCT_KEY)
}

/* ── every fixture, planned ──────────────────────────────────────────── */

function plans() {
  realLog("\nEvery app's export, as reviews")
  const judge = planOf("judgeme.csv").plan
  const [jane, bob, cara] = judge.rows
  check("Judge.me: three reviews, the store's reply and its day, two photos, the email kept", judge.rows.length === 3 && jane.rating === 5 && jane.reply === "Thanks Jane!" && jane.replyDate === "2024-03-04T09:00:00.000Z" && jane.photos.length === 2 && jane.email === "jane@example.com" && jane.date === "2024-03-03T10:00:00.000Z")
  check("  curated spam is hidden, not yet is pending", bob.status === "hidden" && cara.status === "pending")
  const yotpo = planOf("yotpo.csv").plan
  check("Yotpo: verified buyer, a video, unpublished is hidden", yotpo.rows[0].verified === true && yotpo.rows[0].videos[0] === "https://video.yotpo.com/1.mp4" && yotpo.rows[0].reply === "Thank you!" && yotpo.rows[1].status === "hidden" && yotpo.rows[1].verified === false)
  const loox = planOf("loox.csv").plan.rows[0]
  check("Loox: the nickname, the photo, verified purchase", loox?.author === "Kim" && loox.photos[0] === "https://images.loox.io/1.jpg" && loox.verified === true && loox.externalId === "lx-1")
  check("Stamped.io: matched by its handle", planOf("stamped.csv").plan.rows[0]?.productId === PRODUCT)
  const okendo = planOf("okendo.csv").plan.rows
  check("Okendo: approved published, rejected hidden, verified kept", okendo.length === 2 && okendo[0].status === "published" && okendo[0].verified === true && okendo[1].status === "hidden")
  const shopify = planOf("shopify.csv").plan.rows
  check("Shopify Product Reviews: unpublished hidden, the reply, a time zone", shopify.length === 2 && shopify[1].status === "hidden" && shopify[0].reply === "Thanks Mia" && shopify[0].date === "2023-12-01T15:00:00.000Z")
  check("Reviews.io: matched by SKU", planOf("reviewsio.csv").plan.rows[0]?.productId === PRODUCT && planOf("reviewsio.csv").plan.rows[0]?.verified === true)
  check("Trustpilot product reviews: matched by SKU", planOf("trustpilot-product.csv").plan.rows[0]?.productId === PRODUCT)
  const tp = planOf("trustpilot-service.csv").plan.rows[0]
  check("Trustpilot service reviews: placed on the product chosen, with the company's reply", tp?.productId === PRODUCT && tp.reply === "Thanks for shopping!" && tp.title === "Fast shipping")
  const google = planOf("google.json").plan
  check("Google: FOUR is four stars, the owner's reply; one with no rating is an error by row", google.rows.length === 1 && google.rows[0].rating === 4 && google.rows[0].reply === "Thanks Chris" && google.errors.length === 1 && google.errors[0].line === 3 && google.errors[0].error === ROW_ERRORS.rating)
  check("Google reviews from a CSV tool: month first dates, the owner's answer", planOf("google-outscraper.csv").plan.rows[0]?.reply === "Thank you Robin" && planOf("google-outscraper.csv").plan.rows[0]?.date === "2024-07-04T10:00:00.000Z")
  const etsy = planOf("etsy.csv").plan.rows
  check("Etsy: every review is a buyer's, dated month first", etsy.length === 2 && etsy.every((r) => r.verified) && etsy[0].date?.startsWith("2024-03-14") === true)
  const amazon = planOf("amazon.csv").plan.rows
  check("Amazon (from a tool): 5.0 out of 5 stars, the sentence date, Verified", amazon.length === 2 && amazon[0].rating === 5 && amazon[1].rating === 3 && amazon[0].date?.startsWith("2024-03-03") === true && amazon[0].verified === true && amazon[1].verified === false)
  const woo = planOf("woocommerce.csv").plan
  check("WooCommerce: the store's answer row becomes the review's reply, spam is hidden", woo.rows.length === 2 && woo.rows[0].reply === "Thank you Nora!" && woo.rows[0].verified === true && woo.rows[1].status === "hidden" && woo.replies === 1)
  const wxr = planOf("woocommerce.xml").plan.rows
  check("WordPress XML: the review, its HTML as text, its reply", wxr.length === 1 && wxr[0].body === "Lovely & soft" && wxr[0].reply === "Thanks Olga" && wxr[0].verified === true)
  check("Fera: the heading is the title", planOf("fera.csv").plan.rows[0]?.title === "Superb")
  check("Ali Reviews: stars and two photos", planOf("alireviews.csv").plan.rows[0]?.photos.length === 2)
  check("Rivyo: the description is the review", planOf("rivyo.csv").plan.rows[0]?.body === "Very comfy apron")
  const twice = readImportFile(fixture("shopify.csv") + fixture("shopify.csv").split("\n").slice(1).join("\n"), "x.csv")!
  const dup = planReviews(twice, autoMapping(twice.headers, "shopify"), { platform: "shopify", products: CATALOG })
  check("the same row twice in one file: once", dup.rows.length === 2 && dup.duplicates === 2)
}

/* ── sanitised ───────────────────────────────────────────────────────── */

function sanitised() {
  realLog("\nPlain text, read again on the server")
  const bob = planOf("judgeme.csv").plan.rows[1]
  check("a script and an image with a handler are gone, with what was inside the script", bob.body === "Too short", bob.body)
  check("entities decoded, and a tag they make is gone too", plainText("&lt;b&gt;bold&lt;/b&gt; &amp; fine", 100) === "bold & fine" && plainText("<p>One</p><p>Two</p>", 100) === "One\nTwo" && plainText("I <3 it", 100) === "I <3 it")
  const ids = new Set([PRODUCT])
  const good = checkImportRow({ line: 7, productId: PRODUCT, rating: 5, title: "<i>Hi</i>", body: "<script>x()</script>Nice", author: "Jane Doe", email: "JANE@x.com", date: "2024-01-01T00:00:00Z", verified: true, photos: ["https://a.test/1.jpg", "javascript:alert(1)"], videos: ["http://v.test/1.mp4", "https://v.test/2.mp4"], reply: "<b>Thanks</b>", status: "published", externalId: "j-1" }, { platform: "judgeme", productIds: ids })
  const row = good.ok === true ? (good as { row: any }).row : null
  check("the server's read: plain words, a lower case email, only web addresses, https videos", !!row && row.title === "Hi" && row.body === "Nice" && row.reply === "Thanks" && row.email === "jane@x.com" && row.photos.length === 1 && row.videos.length === 1 && row.videos[0] === "https://v.test/2.mp4", row)
  check("  the keys are the server's: the app's id with the import's app, and the content", good.ok === true && (good as { key: string }).key === "judgeme:j-1" && (good as { hash: string }).hash === contentHash(row))
  const notMine = checkImportRow({ line: 3, productId: OTHER_PRODUCT, rating: 5, body: "x" }, { platform: "other", productIds: ids })
  check("a row for a product that is not the store's is refused", notMine.ok === false && (notMine as { error: string }).error === ROW_ERRORS.product && (notMine as { line: number }).line === 3)
  const badStars = checkImportRow({ line: 4, productId: PRODUCT, rating: 6, body: "x" }, { platform: "other", productIds: ids })
  const noWords = checkImportRow({ line: 5, productId: PRODUCT, rating: 3, body: "<p> </p>" }, { platform: "other", productIds: ids })
  check("six stars and no words are refused, by row", badStars.ok === false && (badStars as { error: string }).error === ROW_ERRORS.rating && noWords.ok === false && (noWords as { error: string }).error === ROW_ERRORS.words)
  const status = checkImportRow({ line: 6, productId: PRODUCT, rating: 3, body: "ok", status: "featured", verified: "yes" }, { platform: "other", productIds: ids })
  check("an unknown status is published and only true is verified", status.ok === true && (status as { row: any }).row.status === "published" && (status as { row: any }).row.verified === false)
  check("the same review from two apps makes the same fingerprint", contentHash({ productId: PRODUCT, rating: 5, body: "Soft  linen", author: "Mia Chen", date: "2023-12-01T15:00:00.000Z" }) === contentHash({ productId: PRODUCT, rating: 5, body: "soft linen", author: "Mia C.", date: "2023-12-01T23:00:00.000Z" }))
}

/* ── routes ──────────────────────────────────────────────────────────── */

const S: any = ((globalThis as any).__rvImportStubs = { admin: null, caller: null, sent: [] as any[], later: [] as Promise<unknown>[], user: null, fetched: [] as string[] })
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const outDir = join(process.env.PUSH_TEST_OUT || join(root, "node_modules/.cache/reviews-import-v-test"), "__rv_import__")
mkdirSync(outDir, { recursive: true })
const stub = (name: string, source: string) => {
  const file = join(outDir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/physical/auth": stub(
    "auth",
    `import { NextResponse } from "next/server"
export const physicalJson = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
export const shopCaller = async () => { const c = globalThis.__rvImportStubs.caller; return c ? { ...c, db: globalThis.__rvImportStubs.admin } : physicalJson({ error: "Sign in to continue." }, 401) }
export const readBody = async (r) => { try { const b = await r.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null } catch { return null } }
export const isUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
`,
  ),
  "@/lib/api/rate-limit": stub("rl", `export const rateLimit = async () => null\nexport const addressSubject = () => "ip:x"\nexport const emailSubject = (e) => "email:" + e\nexport const callerAddress = () => "203.0.113.9"\n`),
  "@/lib/api/public-fetch": stub("fetch", `export const fetchPublic = async (url) => { globalThis.__rvImportStubs.fetched.push(url); if (url.includes("broken")) throw new Error("Refused"); return new Response(Buffer.from(${JSON.stringify(PNG)}, "base64"), { status: 200 }) }\n`),
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__rvImportStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__rvImportStubs.user }, error: null }) } })\n`),
  "@/lib/email": stub("email", `export const sendReviewNotificationEmail = async (_a, p) => { globalThis.__rvImportStubs.sent.push({ kind: "review", ...p }); return { success: true } }\nexport const resolveSellerEmail = async () => "seller@example.com"\n`),
  "@/lib/reviews/requests-server": stub("rq", `export const askNow = async (_db, _c, orderId) => { globalThis.__rvImportStubs.sent.push({ kind: "ask", orderId }); return true }\nexport const requestContext = async () => null\n`),
  "@/lib/activity/log-server": stub("act", `export const recordActivity = async () => undefined\n`),
  "@/lib/notifications/events": stub("ev", `export const noteReview = async () => undefined\n`),
  "@/lib/reviews/later": stub("later", `export const later = (task) => { globalThis.__rvImportStubs.later.push(task()) }\n`),
  "@/lib/notify/providers/mailgun": stub("mail", `export const emailProvider = () => ({ send: async (m) => { globalThis.__rvImportStubs.sent.push({ kind: "mail", to: m.to, subject: m.subject, text: m.text }); return { status: "sent" } } })\nexport const mailgunDomain = () => "mg.test"\n`),
}
register(pathToFileURL(join(root, "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(outDir, entry.replace(/[^\w]+/g, "_") + ".mjs")
  await build({
    entryPoints: [join(root, entry)],
    outfile: out,
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    jsx: "automatic",
    logLevel: "error",
    alias: { "@": root },
    packages: "external",
    plugins: [{ name: "stand-ins", setup(b) { const names = new Set(Object.keys(stubs)); b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

function fakeStorage() {
  const buckets: Record<string, Set<string>> = { "review-photos": new Set(), "review-uploads": new Set() }
  return {
    buckets,
    from: (b: string) => ({
      upload: async (path: string) => (buckets[b].add(path), { error: null }),
      remove: async (paths: string[]) => (paths.forEach((x) => buckets[b].delete(x)), { error: null }),
      move: async (from: string, to: string, o?: { destinationBucket?: string }) => {
        if (!buckets[b].has(from)) return { error: { message: "Object not found" } }
        buckets[b].delete(from)
        buckets[o?.destinationBucket ?? b].add(to)
        return { error: null }
      },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${b}/${path}` } }),
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.test/signed/${path}?t=1` } }),
    }),
  }
}

function db(over: { importsTable?: boolean; app?: Record<string, unknown> } = {}) {
  const tables: Record<string, any[]> = {
    products: [
      { id: PRODUCT, title: "Linen Apron", slug: "linen-apron-natural", status: "published", creator_id: CREATOR, reviews_count: 1, reviews_average: 4 },
      { id: SECOND, title: "Oak Board", slug: "oak-board", status: "published", creator_id: CREATOR, reviews_count: 0, reviews_average: 0 },
      { id: OTHER_PRODUCT, title: "Linen Apron", slug: "linen-apron", status: "published", creator_id: OTHER, reviews_count: 0, reviews_average: 0 },
    ],
    product_variants: [{ product_id: PRODUCT, sku: "LA-01" }],
    creators: [
      { id: CREATOR, user_id: SELLER_USER, reviews_count: 1, reviews_average: 4, display_name: "Drew Studio", slug: "drew", support_email: "help@shop.example", stripe_account_id: "acct_1", paypal_merchant_id: null },
      { id: OTHER, user_id: OTHER_USER, reviews_count: 0, reviews_average: 0, display_name: "Other", slug: "other" },
    ],
    /* A buyer's own review, from before any import: an import never touches it. */
    reviews: [{ id: "r-native", product_id: PRODUCT, creator_id: CREATOR, buyer_id: "b1", order_id: null, rating: 4, content: "Bought it, like it", status: "published", site_status: "shown", verified: true, source: "storelib", created_at: "2024-01-01T00:00:00Z" }],
    review_authors: [],
    store_settings: [{ creator_id: CREATOR, reviews: { enabled: true, who: "anyone", publish: "manual", photos: true, ...over.app } }],
    orders: [{ id: ORDER, product_id: PRODUCT, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(), receipt_token: "tok" }],
    review_requests: [],
    review_drafts: [],
    review_uploads: [],
    review_reports: [],
    seller_notifications: [],
    profiles: [],
    entitlements: [],
    email_suppressions: [],
  }
  if (over.importsTable !== false) tables.review_imports = []
  const d: any = fakeDb(tables, over.importsTable === false ? { failWith: { review_imports: { code: "42P01", message: "relation does not exist" } } } : {})
  d.storage = fakeStorage()
  return d
}

const post = (body: unknown) => new Request("https://storelib.com/api/app/reviews/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
const json = async (r: Response) => r.json().catch(() => ({}))
const asCreator = (d: any, creatorId = CREATOR, userId = SELLER_USER) => {
  S.admin = d
  S.caller = { creatorId, userId }
}

/** The import screen's steps, as the browser takes them. */
async function runImport(route: any, file: string, opts: { assign?: Record<string, string>; copyPhotos?: boolean; chunk?: number } = {}) {
  const table = readImportFile(fixture(file), file)!
  const platform = detectPlatform(table.headers).platform
  const plan = planReviews(table, autoMapping(table.headers, platform), { platform, products: CATALOG, assign: opts.assign ?? { [NO_PRODUCT_KEY]: PRODUCT } })
  const start = await json(await route.POST(post({ action: "start", platform, fileName: file, totalRows: table.rows.length })))
  const totals = { imported: 0, duplicates: 0, errors: [] as any[] }
  const size = opts.chunk ?? 200
  for (let i = 0; i < Math.max(1, plan.rows.length); i += size) {
    const r = await json(await route.POST(post({ action: "rows", importId: start.importId, rows: plan.rows.slice(i, i + size), copyPhotos: opts.copyPhotos === true, ...(i === 0 ? { skipped: plan.skipped, duplicates: plan.duplicates, planErrors: plan.errors, planErrorCount: plan.errors.length } : {}) })))
    totals.imported += r.imported ?? 0
    totals.duplicates += r.duplicates ?? 0
    totals.errors.push(...(r.errors ?? []))
  }
  const done = await json(await route.POST(post({ action: "finish", importId: start.importId, productIds: [...new Set(plan.rows.map((r) => r.productId))] })))
  return { start, totals, done, plan }
}

async function routes() {
  const route = (await import(await bundle("app/api/app/reviews/import/route.ts"))) as any
  /* Undo is Reviews' own: DELETE /api/app/reviews/import?id= (lib/reviews/manage-server undoImport). */
  const undo = { DELETE: (_r: Request, ctx: { params: Promise<{ id: string }> }) => ctx.params.then((p) => route.DELETE(new Request(`https://storelib.com/api/app/reviews/import?id=${p.id}`, { method: "DELETE" }))) }
  const imported = (d: any) => d.tables.reviews.filter((r: any) => r.source === "import")

  realLog("\nImporting, through the route")
  {
    const d = db()
    S.admin = d
    S.caller = null
    check("signed out: 401, nothing read", (await route.GET()).status === 401 && (await route.POST(post({ action: "start" }))).status === 401)
    asCreator(d)
    const g = await json(await route.GET())
    check("the store's own products, with their SKUs, and no other store's", g.products.length === 2 && g.products.every((p: any) => p.id !== OTHER_PRODUCT) && g.products.find((p: any) => p.id === PRODUCT)?.skus?.[0] === "LA-01" && g.ready === true)

    const first = await runImport(route, "judgeme.csv")
    const rows = imported(d)
    const jane = rows.find((r: any) => r.content.startsWith("Loved it"))
    check("Judge.me imported: three reviews, its history row says so", first.totals.imported === 3 && rows.length === 3 && d.tables.review_imports[0]?.imported === 3 && !!d.tables.review_imports[0]?.finished_at && d.tables.review_imports[0]?.platform === "judgeme" && d.tables.review_imports[0]?.file_name === "judgeme.csv", d.tables.review_imports[0])
    check("  each one the store's, never verified, marked imported, with its import and keys", rows.every((r: any) => r.creator_id === CREATOR && r.verified === false && r.source === "import" && r.import_id === first.start.importId && typeof r.content_hash === "string" && r.import_platform === "judgeme"))
    check("  named in public form, dated as the file says, the reply kept", jane?.reviewer_name === "Jane D." && jane?.created_at === "2024-03-03T10:00:00.000Z" && jane?.seller_reply === "Thanks Jane!" && jane?.status === "published")
    check("  spam hidden by the store, not yet waiting for approval", rows.some((r: any) => r.status === "hidden" && r.hidden_by === "seller") && rows.some((r: any) => r.status === "pending" && r.published_at === null))
    check("  the emails are kept apart, never on the review", rows.every((r: any) => !("email" in r) && !JSON.stringify(r).includes("@example.com")) && d.tables.review_authors.length === 3 && d.tables.review_authors.some((a: any) => a.email === "jane@example.com" && a.review_id === jane.id))
    check("  photos kept as links when not copied", jane?.photos?.length === 2 && jane.photos.every((p: any) => p.path.startsWith("link:") && p.url.startsWith("https://cdn.judge.me/")))
    check("  the product's numbers counted again (buyers' reviews only, so 1 at 4.0)", d.tables.products[0].reviews_count === 1 && d.tables.products[0].reviews_average === 4)

    const second = await runImport(route, "judgeme.csv")
    check("the same file again: nothing new, three already here", second.totals.imported === 0 && second.totals.duplicates === 3 && imported(d).length === 3 && d.tables.review_imports.length === 2 && d.tables.review_imports.find((i: any) => i.id === second.start.importId)?.duplicates === 3)

    const shopify = await runImport(route, "shopify.csv")
    const before = imported(d).length
    const sameMia = await runImport(route, "shopify.csv")
    check("another app's export: imported, then found again", shopify.totals.imported === 2 && sameMia.totals.duplicates === 2 && imported(d).length === before)

    /* The same review, written by another app with its own id: found by its content. */
    const yotpoLike = { line: 2, productId: PRODUCT, rating: 5, title: "", body: "Soft linen", author: "Mia Chen", email: null, date: "2023-12-01T20:00:00.000Z", verified: true, photos: [], videos: [], reply: "", replyDate: null, status: "published", externalId: "yp-99" }
    const yStart = await json(await route.POST(post({ action: "start", platform: "yotpo", fileName: "y.csv", totalRows: 1 })))
    const y = await json(await route.POST(post({ action: "rows", importId: yStart.importId, rows: [yotpoLike] })))
    check("the same review exported by Yotpo with its own id: a duplicate", y.imported === 0 && y.duplicates === 1)

    realLog("\nUndo")
    const all = d.tables.reviews.length
    const u = await undo.DELETE(new Request("https://storelib.com/x", { method: "DELETE" }), { params: Promise.resolve({ id: shopify.start.importId }) })
    const ub = await json(u)
    check("undo deletes that import's two reviews and nothing else", u.status === 200 && ub.removed === 2 && d.tables.reviews.length === all - 2 && d.tables.reviews.some((r: any) => r.id === "r-native") && imported(d).length === 3 && imported(d).every((r: any) => r.import_id === first.start.importId))
    check("  the import stays in the history, marked undone, with the number", d.tables.review_imports.find((i: any) => i.id === shopify.start.importId)?.undone_at && d.tables.review_imports.find((i: any) => i.id === shopify.start.importId)?.undone_count === 2)
    const again = await undo.DELETE(new Request("https://storelib.com/x", { method: "DELETE" }), { params: Promise.resolve({ id: shopify.start.importId }) })
    check("  undone twice: refused (409), nothing more", again.status === 409 && d.tables.reviews.length === all - 2)
    const back = await runImport(route, "shopify.csv")
    check("  imported again after undo: it comes back", back.totals.imported === 2)
    const late = await json(await route.POST(post({ action: "rows", importId: first.start.importId, rows: [yotpoLike] })))
    check("rows for an import already finished are refused", !!late.error && late.imported === undefined)

    realLog("\nOne store, never another's")
    asCreator(d, OTHER, OTHER_USER)
    const theirs = await json(await route.GET())
    check("the other store sees none of these imports", theirs.imports.length === 0 && theirs.products.length === 1 && theirs.products[0].id === OTHER_PRODUCT)
    const steal = await undo.DELETE(new Request("https://storelib.com/x", { method: "DELETE" }), { params: Promise.resolve({ id: first.start.importId }) })
    check("  it cannot undo this store's import: 404, nothing deleted", steal.status === 404 && imported(d).filter((r: any) => r.import_id === first.start.importId).length === 3)
    const intoMine = await json(await route.POST(post({ action: "rows", importId: first.start.importId, rows: [yotpoLike] })))
    check("  it cannot add rows to this store's import", !!intoMine.error)
    const oStart = await json(await route.POST(post({ action: "start", platform: "other", fileName: "o.csv", totalRows: 1 })))
    const cross = await json(await route.POST(post({ action: "rows", importId: oStart.importId, rows: [{ ...yotpoLike, productId: PRODUCT, externalId: "x-1", body: "Planted review" }] })))
    check("  rows aimed at this store's product are refused by row, nothing written", cross.imported === 0 && cross.errors?.[0]?.error === ROW_ERRORS.product && !d.tables.reviews.some((r: any) => r.content === "Planted review"))
    const mine = await json(await route.POST(post({ action: "rows", importId: oStart.importId, rows: [{ ...yotpoLike, productId: OTHER_PRODUCT, externalId: "x-2", body: "Its own review" }] })))
    check("  and its own product takes them, under its own store", mine.imported === 1 && d.tables.reviews.find((r: any) => r.content === "Its own review")?.creator_id === OTHER)
    asCreator(d)
    const g2 = await json(await route.GET())
    check("  this store's history shows its own imports only", g2.imports.length >= 4 && g2.imports.every((i: any) => d.tables.review_imports.find((x: any) => x.id === i.id)?.creator_id === CREATOR))
  }

  realLog("\nPhotos copied into Storelib")
  {
    const d = db()
    asCreator(d)
    S.fetched = []
    const rowsWithPhotos = [
      { line: 2, productId: PRODUCT, rating: 5, body: "With a photo", photos: ["https://cdn.judge.me/a.jpg", "https://broken.example/b.jpg"], status: "published", externalId: "p-1" },
      { line: 3, productId: PRODUCT, rating: 5, body: "Hidden, with a photo", photos: ["https://cdn.judge.me/c.jpg"], status: "hidden", externalId: "p-2" },
    ]
    const st = await json(await route.POST(post({ action: "start", platform: "judgeme", fileName: "p.csv", totalRows: 2 })))
    const r = await json(await route.POST(post({ action: "rows", importId: st.importId, rows: rowsWithPhotos, copyPhotos: true })))
    const shown = d.tables.reviews.find((x: any) => x.content === "With a photo")
    const hidden = d.tables.reviews.find((x: any) => x.content === "Hidden, with a photo")
    check("a picture that answers is copied under the store's folder; one that does not stays a link", r.imported === 2 && shown.photos.length === 2 && shown.photos[0].path.startsWith(`${CREATOR}/`) && d.storage.buckets["review-photos"].has(shown.photos[0].path) && shown.photos[1].path.startsWith("link:") && S.fetched.length === 3, shown.photos)
    check("  a hidden review's copy waits in the private bucket", d.storage.buckets["review-uploads"].has(hidden.photos[0].path) && !d.storage.buckets["review-photos"].has(hidden.photos[0].path))
    await undo.DELETE(new Request("https://storelib.com/x", { method: "DELETE" }), { params: Promise.resolve({ id: st.importId }) })
    check("  undo removes the copies too", d.storage.buckets["review-photos"].size === 0 && d.storage.buckets["review-uploads"].size === 0)
  }

  realLog("\nBefore SQL part 215")
  {
    const d = db({ importsTable: false })
    asCreator(d)
    const g = await json(await route.GET())
    check("the import screen is told there is no history yet", g.ready === false && g.imports.length === 0 && g.products.length === 2)
    const first = await runImport(route, "shopify.csv")
    check("  it still imports, with no import id", first.start.importId === null && first.totals.imported === 2 && d.tables.reviews.filter((r: any) => r.source === "import").every((r: any) => !("import_id" in r)))
    const second = await runImport(route, "shopify.csv")
    check("  and still finds what it imported before", second.totals.imported === 0 && second.totals.duplicates === 2)
  }
  {
    const d = db()
    asCreator(d)
    const sneaky = await json(await route.POST(post({ action: "rows", importId: null, rows: [{ line: 2, productId: PRODUCT, rating: 5, body: "No history" }] })))
    check("with part 215, rows with no import are refused: every import has its Undo", !!sneaky.error && !d.tables.reviews.some((r: any) => r.content === "No history"))
  }

  realLog("\nThe one-step CSV post")
  {
    const d = db()
    asCreator(d)
    const r = await json(await route.POST(post({ csv: fixture("judgeme.csv"), fileName: "judgeme.csv" })))
    check("a CSV in one go: imported, in the history", r.imported === 3 && d.tables.review_imports.length === 1 && d.tables.review_imports[0].imported === 3, { r, imports: d.tables.review_imports })
    const again = await json(await route.POST(post({ csv: fixture("judgeme.csv") })))
    check("  and the second time, every row is already on the store", again.imported === 0 && again.skippedCount === 3)
    const bad = await route.POST(post({ csv: "name,stars\nx,5" }))
    check("  a file without the columns says which", bad.status === 400 && (await json(bad)).missingColumns?.join() === "product,body")
  }
}

/* ── writing a review, by the store's settings ───────────────────────── */

async function writing() {
  realLog("\nWriting a review on the website, by the app's settings")
  process.env.REVIEW_LINK_SECRET = "k".repeat(48)
  const site = (await import(await bundle("app/api/reviews/site/route.ts"))) as any
  const confirm = (await import(await bundle("app/api/reviews/confirm/route.ts"))) as any
  const moderate = (await import(await bundle("app/api/app/reviews/[id]/route.ts"))) as any
  const { signDraftWith } = await import("../lib/reviews/request-token")
  const req = (body: unknown) => new Request("https://drew.storelib.com/api/reviews/site", { method: "POST", headers: { "content-type": "application/json", host: "drew.storelib.com" }, body: JSON.stringify(body) })
  const settled = async () => {
    while (S.later.length) await S.later.shift()
  }
  {
    const d = db({ app: { who: "verified" } })
    S.admin = d
    S.sent = []
    const r = await site.POST(req({ productId: PRODUCT, rating: 5, content: "Lovely apron.", name: "Lee Park", email: "lee@example.com" }))
    await settled()
    check("buyers only: a visitor cannot write one on the website", r.status === 403 && d.tables.review_drafts.length === 0 && d.tables.reviews.length === 1)
  }
  {
    const d = db({ app: { who: "anyone", publish: "manual" } })
    S.admin = d
    S.sent = []
    const trap = await site.POST(req({ productId: PRODUCT, rating: 5, content: "Cheap pills", name: "Bot", email: "bot@spam.test", website: "http://spam.test" }))
    await settled()
    check("the hidden field filled in: the usual answer, nothing kept", trap.status === 202 && d.tables.review_drafts.length === 0)
    const bad = await site.POST(req({ productId: PRODUCT, rating: 9, content: "x", name: "Lee", email: "lee@example.com" }))
    check("six or more stars, or no words: refused with a plain reason", bad.status === 400 && typeof (await json(bad)).error === "string")
    const r = await site.POST(req({ productId: PRODUCT, rating: 5, content: "Seams are neat.", name: "Lee Park", email: "lee@example.com" }))
    await settled()
    const draft = d.tables.review_drafts[0]
    check("a visitor's review waits for its address to be confirmed", r.status === 202 && draft?.status === "waiting" && S.sent.some((m: any) => m.kind === "mail" && m.to === "lee@example.com"))
    S.sent = []
    const buyer = await site.POST(req({ productId: PRODUCT, rating: 5, content: "I bought it.", name: "Ana", email: "ana@example.com" }))
    await settled()
    check("  a buyer's address is sent their own verified link instead", buyer.status === 202 && S.sent.some((m: any) => m.kind === "ask" && m.orderId === ORDER))
    const f = new FormData()
    f.append("token", signDraftWith(process.env.REVIEW_LINK_SECRET!, draft.id))
    await confirm.POST(new Request("https://storelib.com/api/reviews/confirm", { method: "POST", body: f }))
    const row = d.tables.reviews.find((x: any) => x.source === "site")
    check("  confirmed: the store approves each one, so it waits in Pending, unverified", row?.status === "pending" && row?.verified === false && row?.reviewer_name === "Lee P.")
    check("  the store is told in the bell", d.tables.seller_notifications.length === 1)
    S.user = { id: SELLER_USER }
    const ok = await moderate.PATCH(new Request(`https://storelib.com/api/app/reviews/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) }), { params: Promise.resolve({ id: row.id }) })
    check("  approved from Reviews: published", ok.status === 200 && row.status === "published")
    S.user = { id: OTHER_USER }
    const theirs = await moderate.PATCH(new Request(`https://storelib.com/api/app/reviews/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "hide" }) }), { params: Promise.resolve({ id: row.id }) })
    check("  another store cannot hide it", theirs.status === 403 || theirs.status === 404)
    S.user = null
  }
}

/* ── on the website ──────────────────────────────────────────────────── */

function drawProduct(reviews: unknown, settings: Record<string, unknown> = {}, page: Record<string, unknown> = { template: "product" }) {
  const r = compileSection(DEFAULT_THEME_SOURCES["sections/reviews_product.storelib"], { file: "sections/reviews_product.storelib" })
  if (r.ok !== true) throw new Error(JSON.stringify(r.errors))
  return renderSection({ compiled: r.value, id: "s1", instance: { type: "reviews_product", settings }, theme: {}, page: page as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: reviews as Record<string, unknown> }), products: [] as never })
}

function website() {
  realLog("\nThe product's reviews on the website")
  const settings = readReviewsApp({ enabled: true, who: "anyone", display: { perPage: 4, sort: "newest" } })
  const rows = Array.from({ length: 9 }, (_, i) => ({
    id: `r${i}`,
    product_id: PRODUCT,
    rating: [5, 4, 5, 3, 1, 5, 4, 2, 5][i],
    title: `Title ${i}`,
    content: `Words ${i}`,
    created_at: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
    reviewer_name: "Maya Rivers",
    verified: false,
    import_verified: i === 0,
    photos: i === 2 ? [{ path: "c/a.jpg", url: "https://cdn.test/review-photos/c/a.jpg", status: "approved" }] : [],
    videos: i === 3 ? ["https://video.test/1.mp4", "javascript:alert(1)"] : [],
    seller_reply: i === 1 ? "Thank you" : null,
  }))
  const data = buildStorefrontReviews({ settings, creatorId: CREATOR, rows, products: [{ id: PRODUCT, title: "Linen Apron", slug: "linen-apron" }], product: { id: PRODUCT, title: "Linen Apron", rows, ratings: [...rows.map((r) => r.rating), 5, 5] }, limit: 100 })
  const items = data.here.items
  check("sent in the store's order (newest), each with its place in every other order", items[0].id === "r8" && items.find((r) => r.id === "r4")!.rank_lowest === 0 && items.find((r) => r.id === "r2")!.rank_photos === 0 && items.every((r) => typeof r.rank_highest === "number"))
  check("an import is never Verified on the website, whatever its app said", items.find((r) => r.id === "r0")!.verified === false && items.find((r) => r.id === "r1")!.verified === false)
  check("a video only when it is a web address", JSON.stringify(items.find((r) => r.id === "r3")!.videos) === JSON.stringify(["https://video.test/1.mp4"]))
  const html = drawProduct(data).html
  check("the filter by stars: All and one chip per rating there is", html.includes('class="rv-f rv-f--0"') && ["5", "4", "3", "2", "1"].every((n) => html.includes(`id="rv-f${n}-s1"`)))
  check("the sort, starting on the store's order", /<option value="newest" selected>Newest<\/option>/.test(html) && html.includes('value="lowest"') && html.includes("With photos"))
  check("Show more after the app's number (four), with every review in one list", (html.match(/rv-card--more/g) ?? []).length === 5 && (html.match(/<article class="rv-card/g) ?? []).length === 9 && html.includes('class="rv-more-t sr"'))
  check("  a section's own number wins over the app's", (drawProduct(data, { per_page: 6 }).html.match(/rv-card--more/g) ?? []).length === 3)
  check("a photo opens larger in a popover, and full size in a new tab", html.includes('popovertarget="rv-lb-s1-r2-1"') && html.includes('id="rv-lb-s1-r2-1" popover') && html.includes('popovertargetaction="hide"') && html.includes('target="_blank" rel="noopener"'))
  check("each card says its rating for the filter, and its places for the sort", html.includes('data-rating="1"') && /--o-lowest: 0;/.test(html))
  check("the summary counts every review, and says when only some are on the page", html.includes("Based on 11 reviews") && html.includes("Showing 9 of 11 reviews"))
  check("the store's reply and the video link", html.includes("Reply from Drew Studio") && html.includes('href="https://video.test/1.mp4"') && html.includes("Watch video"))
  const css = drawProduct(data).css ?? ""
  check("filter, sort and Show more are CSS over the inputs, no script", /:has\(\.rv-f--5:checked\) \.rv-card:not\(\[data-rating="5"\]\)/.test(css) && /option\[value="lowest"\]:checked\) \.rv-card \{\s*order: var\(--o-lowest\)/.test(css) && /\.rv-more-t:checked/.test(css), css.slice(0, 200))
  check("colours per element: the stars, the bars, the verified label", drawProduct(data, { star_color: "#111111", bar_color: "#222222", verified_color: "#333333" }).html.includes("--rv-star: #111111; --rv-bar: #222222; --rv-ver: #333333;"))
  check("the words are the shop's words, translatable", ["filter_all", "sort_reviews", "sort_highest", "sort_lowest", "sort_with_photos", "no_reviews_with_rating", "open_full_size", "close", "watch_video", "showing", "of"].every((w) => w in UI_WORDS))
  const one = buildStorefrontReviews({ settings, creatorId: CREATOR, rows: rows.slice(0, 1), products: [], product: { id: PRODUCT, title: "Linen Apron", rows: rows.slice(0, 1), ratings: [5] } })
  check("one review: no filter or sort to offer", !drawProduct(one).html.includes("rv__tools"))
  const canvas = drawProduct({ ...sampleStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR, { id: PRODUCT, title: "Linen Apron" }), enabled: true }, {}, { template: "product", in_editor: true }).html
  check("in the builder with none yet: sample reviews, marked as samples", canvas.includes("Sample reviews") && canvas.includes("rv-chip"))
  check("the app off: nothing on a live page", drawProduct(buildStorefrontReviews({ settings: readReviewsApp({ enabled: false }), creatorId: CREATOR, rows, products: [], product: { id: PRODUCT, title: "x", rows, ratings: [5] } })).html.replace(/<[^>]+>/g, "").trim() === "")

  realLog("\nStructured data")
  const s = data.product!.summary
  const ld = productJsonLd({ url: "https://drew.test/products/linen-apron", name: "Linen Apron", images: [], priceCents: 4800, inStock: true, seller: "Drew Studio", rating: { average: s.average, count: s.count, reviews: data.product!.items.map((r) => ({ author: r.author, rating: r.rating, body: r.body, title: r.title, date: r.iso })) } }) as any
  check("AggregateRating from the published reviews, and Review entries named as the page names them", ld.aggregateRating?.["@type"] === "AggregateRating" && ld.aggregateRating.reviewCount === 11 && ld.review?.[0]?.["@type"] === "Review" && ld.review[0].author.name === "Maya R." && !JSON.stringify(ld).includes("@example"))
}

/* ── the database part ───────────────────────────────────────────────── */

function sql() {
  realLog("\nSQL part 232")
  const part = read("supabase/sql/run-now/232_review_imports_from_apps.sql")
  check("the run-now part and the migration are the same file", part === read("supabase/migrations/20270201_v9_review_imports_from_apps.sql"))
  check("on part 215's table, never a second one; idempotent", !/CREATE TABLE/.test(part) && /to_regclass\('public\.review_imports'\) IS NULL THEN RAISE NOTICE/.test(part) && (part.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length === 12 && /DROP CONSTRAINT IF EXISTS reviews_import_values_check/.test(part) && /DROP CONSTRAINT IF EXISTS review_imports_apps_check/.test(part))
  check("one statement a line, and a comment line is only a comment", part.split("\n").filter((l) => l.trim()).every((l) => (l.startsWith("/*") ? l.trimEnd().endsWith("*/") : /;\s*$/.test(l))))
  check("RLS on, server only like part 215: no grant and no policy for a signed in person", /ALTER TABLE public\.review_imports ENABLE ROW LEVEL SECURITY/.test(part) && /REVOKE ALL ON public\.review_imports FROM PUBLIC, anon, authenticated/.test(part) && !/CREATE POLICY/.test(part) && !/GRANT [^;]*TO (anon|authenticated)/.test(part))
  check("one id per store, so a second import adds nothing; the public cannot read the keys", /CREATE UNIQUE INDEX IF NOT EXISTS reviews_import_key_once ON public\.reviews \(creator_id, import_key\) WHERE import_key IS NOT NULL/.test(part) && /REVOKE SELECT \(import_key, content_hash, import_platform, import_verified, videos\) ON public\.reviews FROM anon, authenticated/.test(part))
  check("undo is by part 215's import_id, whose import going leaves the reviews (SET NULL)", /import_id uuid REFERENCES public\.review_imports\(id\) ON DELETE SET NULL/.test(read("supabase/sql/run-now/215_reviews_manage.sql")) && !/ON DELETE CASCADE/.test(part))
  check("listed in the run-now README and in the after check", read("supabase/sql/run-now/README.md").includes("`232_review_imports_from_apps.sql`") && /as p232_review_imports_from_apps;\s*$/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const routeSrc = read("app/api/app/reviews/import/route.ts")
  check("every import call is the signed in store's (shopCaller), rate limited", (routeSrc.match(/await shopCaller\(\)/g) ?? []).length === 3 && (routeSrc.match(/rateLimit\(/g) ?? []).length >= 3)
  const server = read("lib/reviews/import-server.ts")
  check("every write and delete is filtered by the creator", /\.delete\(\)\.eq\("creator_id", creatorId\)\.eq\("import_id", importId\)/.test(read("lib/reviews/manage-server.ts")) && /\.from\("products"\)\.select\("id"\)\.eq\("creator_id", a\.creatorId\)/.test(server) && !/NEXT_PUBLIC_/.test(server))
  const dialog = read("components/reviews/manage/import-dialog.tsx")
  check("one import screen: Reviews' own dialog is the multi-app one", /export function ImportDialog\(/.test(dialog) && /readImportFile\(/.test(dialog) && /detectPlatform\(/.test(dialog) && /import\?id=/.test(dialog) && /import \{ ImportDialog \} from "\.\/import-dialog"/.test(read("components/reviews/manage/reviews-view.tsx")))
}

async function main() {
  detection()
  mapping()
  cells()
  products()
  plans()
  sanitised()
  await routes()
  await writing()
  website()
  sql()
  realLog(`\n  ${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  realLog(e)
  process.exit(1)
})
