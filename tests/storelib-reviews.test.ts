/**
 * ===========================================================================
 *  STORELIB REVIEWS, END TO END
 * ===========================================================================
 * The reviews app in Settings › Integrations, on the reviews table every
 * other surface already reads:
 *
 *   SETTINGS   read back whole and in range, turned on once (enabledAt)
 *   RULES      a review's words, its author's public name, where it starts
 *   LINKS      the review request link, signed, one order line, untouchable
 *   SCHEDULE   when a buyer is asked (digital, shipped, delivered) and when
 *              not; the engine's own emails stand aside for the app
 *   CSV        an import from another app
 *   WEBSITE    the four Storelib theme sections and the card stars, drawn by
 *              the live engine; an imported Shopify theme's metafields, the
 *              Storelib Reviews section, and a Judge.me app block
 *   ROUTES     writing from a link and editing it, the website's form (JSON
 *              and plain form posts), moderation and who may do it, import
 *   SEO        AggregateRating and Review only from real reviews
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/storelib-reviews.test.ts
 */
import { register } from "node:module"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import { REVIEWS_APP_DEFAULTS, canEditUntil, checkAppReviewInput, cleanReviewText, initialStatus, isVerifiedReview, mergeReviewsApp, publicName, readReviewsApp, sellerView, shownPhotos, startingStatus, websiteStatus } from "../lib/reviews/app-settings"
import { withRatings } from "../lib/website-builder/shop-products"
import { signRequestWith, verifyRequestWith } from "../lib/reviews/request-token"
import { DAY_MS, requestBlock, requestDueAt, reminderDueAt } from "../lib/reviews/request-schedule"
import { reviewRequestBlock } from "../lib/reviews/request-rules"
import { parseCsv, planImport } from "../lib/reviews/import-csv"
import { buildStorefrontReviews, sampleStorefrontReviews } from "../lib/reviews/storefront"
import { compileSection } from "../lib/storelib-theme/storelib/compile"
import { renderSection } from "../lib/storelib-theme/render"
import { storefrontData } from "../lib/website-builder/storefront-data"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { REVIEWS_SECTION_PATH, isReviewsAppBlock, withStorelibReviewsSection } from "../lib/storelib-theme/compat/storelib-reviews"
import { productJsonLd } from "../lib/website-builder/site-seo"
import { INTEGRATIONS } from "../lib/integrations/catalog"
import { accountPageSections } from "../lib/website-builder/account-pages"
import { renderEmail } from "../lib/notify/templates"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const realLog = console.log
console.warn = () => undefined
console.error = () => undefined
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const KEY = "a-long-enough-test-secret-for-review-links"
const CREATOR = "33333333-3333-4333-8333-333333333333"
const PRODUCT = "22222222-2222-4222-8222-222222222222"
const ORDER = "11111111-1111-4111-8111-111111111111"
const REQUEST = "44444444-4444-4444-8444-444444444444"
const SELLER_USER = "66666666-6666-4666-8666-666666666666"
const STRANGER = "77777777-7777-4777-8777-777777777777"

/* ── Settings and rules ─────────────────────────────────────────────── */

function settingsAndRules() {
  realLog("\nThe app's settings")
  const d = readReviewsApp(null)
  check("nothing saved reads as the defaults: off, buyers only, emails on at seven days", !d.enabled && d.who === "verified" && d.request.enabled && d.request.digitalDays === 7 && d.request.physicalFrom === "delivered")
  const odd = readReviewsApp({ enabled: "yes", minStars: 9, who: "everyone", request: { digitalDays: -4, reminderDays: 400 }, display: { starColor: "red;background:url(x)", perPage: 1000 } })
  check("out of range or the wrong kind is brought back into range", odd.enabled === false && odd.minStars === 5 && odd.who === "verified" && odd.request.digitalDays === 0 && odd.request.reminderDays === 30 && odd.display.starColor === REVIEWS_APP_DEFAULTS.display.starColor && odd.display.perPage === 24)
  const at = new Date("2026-10-01T00:00:00Z")
  const on = mergeReviewsApp({}, { enabled: true, enabledAt: "1999-01-01T00:00:00Z", request: { physicalDays: 10 } }, at)
  check("turning it on records when, and the page cannot say when", on.enabled && on.enabledAt === at.toISOString())
  check("a change to one email setting keeps the others", on.request.physicalDays === 10 && on.request.digitalDays === 7 && on.request.reminder === true)
  const again = mergeReviewsApp(on, { display: { sort: "newest" } }, new Date("2026-11-01T00:00:00Z"))
  check("saving again while on keeps the first moment", again.enabledAt === at.toISOString() && again.display.sort === "newest")

  realLog("\nA review's words and its author")
  check("auto publish: at or over the line goes up, under it waits", initialStatus({ publish: "auto", minStars: 4 }, 4) === "published" && initialStatus({ publish: "auto", minStars: 4 }, 3) === "pending")
  check("approve each one: everything waits", initialStatus({ publish: "manual", minStars: 1 }, 5) === "pending")
  const waitV = startingStatus({ publish: "manual", minStars: 1 }, 5, true)
  const waitU = startingStatus({ publish: "manual", minStars: 1 }, 5, false)
  check("a verified buyer's review waits on the store's website only: Storelib publishes it as before", waitV.status === "published" && waitV.site_status === "pending", waitV)
  check("  an unverified one waits everywhere", waitU.status === "pending" && waitU.site_status === "shown", waitU)
  check("  over the line: shown both places", JSON.stringify(startingStatus({ publish: "auto", minStars: 3 }, 4, true)) === JSON.stringify({ status: "published", site_status: "shown" }))
  check("the website reads both; a report's hide wins", websiteStatus({ status: "published", site_status: "hidden" }) === "hidden" && websiteStatus({ status: "published", site_status: "pending" }) === "pending" && websiteStatus({ status: "hidden", site_status: "shown" }) === "hidden" && websiteStatus({ status: "published" }) === "published")
  check("a row without the column (before part 133) is a buyer's", isVerifiedReview({}) && isVerifiedReview({ verified: true }) && !isVerifiedReview({ verified: false }))
  const kept = sellerView({ status: "published", site_status: "hidden", hidden_by: null })
  const byReport = sellerView({ status: "hidden", site_status: "shown", hidden_by: null })
  check("the store's list: hidden on its website by the store, still on Storelib", kept.status === "hidden" && kept.hidden_by === "seller" && kept.on_storelib === true, kept)
  check("  hidden by a report: off Storelib, not the store's to bring back", byReport.status === "hidden" && byReport.hidden_by !== "seller" && byReport.on_storelib === false, byReport)
  check("Jane Doe shows as Jane D., one word as itself", publicName("Jane Doe") === "Jane D." && publicName("  mara  ") === "mara" && publicName("Ana Maria lópez") === "Ana L.")
  check("an address or a link is never a name", publicName("jane@example.com") === null && publicName("www.spam.example") === null && publicName("") === null)
  check("words keep their lines, lose control and direction characters", cleanReviewText("Great\r\n\r\n\r\nthing‮\u0007 ok", 100) === "Great\n\nthing ok")
  const ok = checkAppReviewInput({ rating: 5, content: " Lovely. ", title: "x".repeat(300), name: "Sam Lee", photos: [`${CREATOR}/${"a".repeat(32)}.jpg`, "someone-else/x.jpg", "../../etc.jpg"] }, { creatorId: CREATOR, photos: true })
  check("a good review: trimmed, title cut, name made public, only this store's photo paths", ok.ok === true && ok.content === "Lovely." && ok.title.length === 120 && ok.name === "Sam L." && ok.photoPaths.length === 1)
  check("half a star or no words: refused", !checkAppReviewInput({ rating: 4.5, content: "fine" }, { creatorId: CREATOR, photos: true }).ok && !checkAppReviewInput({ rating: 4, content: " " }, { creatorId: CREATOR, photos: true }).ok)
  check("a store without photos drops them", (checkAppReviewInput({ rating: 4, content: "ok then", photos: [`${CREATOR}/${"a".repeat(32)}.png`] }, { creatorId: CREATOR, photos: false }) as { photoPaths: string[] }).photoPaths.length === 0)
  check("a photo the store removed is not shown", shownPhotos([{ path: "a", url: "https://x/a.jpg", status: "approved" }, { path: "b", url: "https://x/b.jpg", status: "removed" }, { path: "c", url: "javascript:alert(1)" }]).join() === "https://x/a.jpg")
  check("edits within the window only", canEditUntil(new Date(Date.now() - 2 * DAY_MS).toISOString(), 30) && !canEditUntil(new Date(Date.now() - 40 * DAY_MS).toISOString(), 30) && !canEditUntil(new Date().toISOString(), 0))
}

/* ── Links ──────────────────────────────────────────────────────────── */

function links() {
  realLog("\nThe review link")
  const t = signRequestWith(KEY, REQUEST)
  check("short, and names the request it was made for", t.length < 50 && verifyRequestWith(KEY, t) === REQUEST, t)
  const [id, sig] = t.split(".")
  const flipped = `${id}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`
  check("a changed signature, another key, or another request's id: nothing", verifyRequestWith(KEY, flipped) === null && verifyRequestWith(`${KEY}-other`, t) === null && verifyRequestWith(KEY, `${signRequestWith(KEY, ORDER).split(".")[0]}.${sig}`) === null)
  check("no key, no link", (() => { try { signRequestWith("short", REQUEST); return false } catch { return true } })() && verifyRequestWith("", t) === null)
}

/* ── Schedule ───────────────────────────────────────────────────────── */

function schedule() {
  realLog("\nWhen a buyer is asked")
  const req = readReviewsApp({ request: { digitalDays: 5, physicalDays: 3, physicalFrom: "delivered" } }).request
  const bought = "2026-10-01T00:00:00Z"
  const t0 = Date.parse(bought)
  check("a download: days after the purchase", requestDueAt({ created_at: bought }, null, req) === t0 + 5 * DAY_MS)
  check("a parcel not shipped yet: not due", requestDueAt({ created_at: bought, requires_shipping: true }, null, req) === null)
  check("delivered: days after delivery", requestDueAt({ created_at: bought, requires_shipping: true }, { deliveredAt: "2026-10-06T00:00:00Z" }, req) === Date.parse("2026-10-09T00:00:00Z"))
  check("shipped and never scanned delivered: a week after shipping counts as delivery", requestDueAt({ created_at: bought, requires_shipping: true }, { shippedAt: "2026-10-02T00:00:00Z" }, req) === Date.parse("2026-10-12T00:00:00Z"))
  const fromShip = readReviewsApp({ request: { physicalDays: 3, physicalFrom: "shipped" } }).request
  check("from shipping when the store says so", requestDueAt({ created_at: bought, requires_shipping: true }, { shippedAt: "2026-10-02T00:00:00Z" }, fromShip) === Date.parse("2026-10-05T00:00:00Z"))
  check("the reminder after the first email", reminderDueAt("2026-10-10T00:00:00Z", req) === Date.parse("2026-10-17T00:00:00Z") && reminderDueAt("2026-10-10T00:00:00Z", { ...req, reminder: false }) === null)
  const facts = { order: { status: "completed", amount_cents: 100, created_at: bought, buyer_id: null, buyer_email: "b@x.com" }, productExists: true, reviewed: false, sellerUserId: SELLER_USER, sellerSupportEmail: "help@shop.com", suppressed: [] as string[] }
  const s = { enabledAt: "2026-09-01T00:00:00Z" }
  const now = t0 + 6 * DAY_MS
  check("due and nothing against it: goes", requestBlock(facts, s, t0 + 5 * DAY_MS, now) === null)
  check("bought before the app was on: never", requestBlock(facts, { enabledAt: "2026-10-02T00:00:00Z" }, t0, now) === "before_app")
  check("refunded, reviewed, unsubscribed, a test sale, the store's own address: never", requestBlock({ ...facts, order: { ...facts.order, status: "refunded", refund_amount_cents: 100 } }, s, t0, now) === "not_open" && requestBlock({ ...facts, reviewed: true }, s, t0, now) === "reviewed" && requestBlock({ ...facts, suppressed: ["review_requests"] }, s, t0, now) === "unsubscribed" && requestBlock({ ...facts, order: { ...facts.order, source_detail: { surface: "admin" } } }, s, t0, now) === "test_sale" && requestBlock({ ...facts, order: { ...facts.order, buyer_email: "Help@Shop.com" } }, s, t0, now) === "own_order")
  check("three weeks late: not worth sending", requestBlock(facts, s, t0, t0 + 30 * DAY_MS) === "too_late")
  const engineFacts = { order: { id: ORDER, status: "completed", source: "storelib", created_at: new Date(Date.now() - 8 * DAY_MS).toISOString(), receipt_token: "tok" }, product: { id: PRODUCT }, sellerUserId: SELLER_USER, reviewed: false, suppressed: [], appHandles: true }
  check("the notification engine's own ask stands aside while the store has the app on", reviewRequestBlock(engineFacts, "request", Date.now()) === "app_handles" && reviewRequestBlock({ ...engineFacts, appHandles: false }, "request", Date.now()) === null)
  const store = read("lib/notify/store.ts")
  check("  and it reads that from the store's settings", /appHandles = \(app as \{ reviews\?: \{ enabled\?: unknown \} \| null \} \| null\)\?\.reviews\?\.enabled === true/.test(store))
  const cron = read("app/api/cron/process-scheduled-emails/route.ts")
  check("the hourly email run sends the app's asks", /sweepReviewRequests\(\{ budgetMs/.test(cron))

  realLog("\nThe email")
  const mail = renderEmail("REVIEW_REQUEST", { productTitle: "Linen apron", creatorName: "Drew Studio", reviewToken: "abc_DEF-123.xyz_XYZ-789", reminderOn: true }, { baseUrl: "https://drew.storelib.com", unsubscribeUrl: "https://drew.storelib.com/api/notify/unsubscribe?token=t" })
  check("its stars and button open the review page on the website's own host", mail.html.includes("https://drew.storelib.com/review/abc_DEF-123.xyz_XYZ-789?rate=5") && mail.html.includes("https://drew.storelib.com/review/abc_DEF-123.xyz_XYZ-789\""), mail.html.match(/href="[^"]*review[^"]*"/g))
  check("sent as the store, with its unsubscribe link and no fixed number of days", mail.fromName === "Drew Studio" && mail.html.includes("/api/notify/unsubscribe?token=t") && !/a week ago/.test(mail.text))
}

/* ── CSV ────────────────────────────────────────────────────────────── */

function csv() {
  realLog("\nAn import")
  check("quoted fields, commas and doubled quotes in them, CRLF", JSON.stringify(parseCsv('a,b\r\n"x, ""y""",2\r\n')) === JSON.stringify([["a", "b"], ['x, "y"', "2"]]))
  const products = [{ id: PRODUCT, slug: "linen-apron", title: "Linen apron" }]
  const plan = planImport(`product_handle,rating,title,body,reviewer_name,review_date\nlinen-apron,5,Great,"Loved it, truly",Jane Doe,2026-05-01\nhttps://shop.example/products/linen-apron,4,,Good,Ann,\nnope,5,,x,a,\nlinen-apron,9,,x,a,\nlinen-apron,3,,,a,`, products)
  check("matched by address or a product link; named in public form; dated", plan.reviews.length === 2 && plan.reviews[0].name === "Jane D." && plan.reviews[0].createdAt?.startsWith("2026-05-01") === true && plan.reviews[1].productId === PRODUCT)
  check("and every row it could not use, with why", JSON.stringify(plan.skipped.map((x) => x.why)) === JSON.stringify(["no_product", "bad_rating", "no_words"]))
  check("a file without the needed columns says which", planImport("name,stars\nx,5", products).missingColumns.join() === "product,body")
}

/* ── The website ────────────────────────────────────────────────────── */

const PHOTO = "https://cdn.test/review-photos/c/a.jpg"
function data(enabled = true, who: "anyone" | "verified" = "anyone", onProductPage = true) {
  const settings = readReviewsApp({ enabled, who, display: { starColor: "#e8a33d" } })
  const rows = [
    { id: "r1", product_id: PRODUCT, rating: 5, title: "Exactly right", content: "Clear and <script>alert(1)</script> well made.", created_at: "2026-09-30T10:00:00Z", reviewer_name: "Maya Rivers", verified: true, featured: true, photos: [{ path: "c/a.jpg", url: PHOTO, status: "approved" }], seller_reply: "Thank you" },
    { id: "r2", product_id: PRODUCT, rating: 4, content: "Good.", created_at: "2026-09-20T10:00:00Z", reviewer_name: "Jonas", verified: false },
    { id: "r3", product_id: "p2", rating: 3, content: "Fine.", created_at: "2026-09-10T10:00:00Z", buyer: { display_name: "Priya Shah" } },
  ]
  return buildStorefrontReviews({ settings, creatorId: CREATOR, rows, products: [{ id: PRODUCT, title: "Linen apron", slug: "linen-apron" }, { id: "p2", title: "Oak board", slug: "oak-board" }], product: onProductPage ? { id: PRODUCT, title: "Linen apron", rows: rows.slice(0, 2), ratings: [5, 4] } : null })
}

function drawNative(type: string, reviews: unknown, page: Record<string, unknown> = { template: "product" }, settings: Record<string, unknown> = {}, products: unknown[] = []) {
  const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
  if (r.ok !== true) throw new Error(`${type}: ${JSON.stringify(r.errors)}`)
  return renderSection({ compiled: r.value, id: "s1", instance: { type, settings }, theme: {}, page: page as never, data: storefrontData({ dynamic: { shop: { name: "Drew Studio" } } as never, reviews: reviews as Record<string, unknown> }), products: products as never }).html
}

function website() {
  realLog("\nWhat a section is handed")
  const d = data()
  const json = JSON.stringify(d)
  check("public names only, never an address", !/@/.test(json) && d.all.items.some((r) => r.author === "Maya R.") && d.all.items.some((r) => r.author === "Priya S."))
  check("on a product page: that product's reviews and summary", d.here.scope === "product" && d.here.summary.count === 2 && d.here.summary.average === 4.5 && d.here.items.every((r) => r.product_id === PRODUCT))
  check("featured first, and the carousel's are the featured ones", d.all.items[0].id === "r1" && d.all.featured_items.map((r) => r.id).join() === "r1")
  const sample = sampleStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR, null)
  check("samples say they are samples", sample.sample === true && sample.all.items.length > 0)

  realLog("\nThe Storelib theme's sections, drawn by the live engine")
  for (const type of ["reviews_product", "reviews_badge", "reviews_carousel", "reviews_all"]) {
    const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
    check(`${type} compiles, and is in Add section under Reviews`, r.ok === true && read("themes/default/manifest.json").includes(`"${type}"`), r.ok === true ? undefined : r.errors)
  }
  const product = drawNative("reviews_product", d)
  check("Product reviews: the average, the bars, the cards, a store's reply", product.includes("4.5") && product.includes("Based on 2 reviews") && product.includes("Exactly right") && product.includes("Reply from Drew Studio") && product.includes("Maya R."))
  check("a review's words are text, never markup", !product.includes("<script>alert") && product.includes("&lt;script&gt;"))
  check("Verified buyer only on a verified review", (product.match(/Verified buyer/g) ?? []).length === 1)
  check("an approved photo, opened in a new tab", product.includes(`src="${PHOTO}"`) && product.includes('target="_blank" rel="noopener"'))
  check("anyone may write: the form, a native post to the store, with a field a person never sees", product.includes('action="/api/reviews/site"') && product.includes('data-storelib-form="native"') && product.includes('name="website"') && product.includes(`value="${PRODUCT}"`))
  check("buyers only: no form", !drawNative("reviews_product", data(true, "verified")).includes("<form"))
  check("the app off: nothing on a live page", drawNative("reviews_product", data(false)).replace(/<[^>]+>/g, "").trim() === "" && drawNative("reviews_badge", data(false)).replace(/<[^>]+>/g, "").trim() === "")
  check("no reviews handed at all (an export, a thumbnail): nothing", drawNative("reviews_all", undefined).replace(/<[^>]+>/g, "").trim() === "")
  const canvas = drawNative("reviews_product", { ...sampleStorefrontReviews(readReviewsApp({ enabled: true }), CREATOR, { id: PRODUCT, title: "Linen apron" }), enabled: true }, { template: "product", in_editor: true })
  check("in the builder with no reviews yet: samples, and it says so", canvas.includes("Sample reviews") && canvas.includes("Maya R."))
  const shop = drawNative("reviews_product", data(true, "anyone", false), { template: "index" })
  check("off a product page it shows the shop's reviews, each with its product, and no form", shop.includes("Oak board") && !shop.includes("<form") && shop.includes("Based on 3 reviews"))
  const badge = drawNative("reviews_badge", d)
  check("Star rating: stars filled to 90%, the average and the count, to #reviews", badge.includes("--rv: 90%") && badge.includes("(2 reviews)") && badge.includes('href="#reviews"'))
  const carousel = drawNative("reviews_carousel", d, { template: "index" })
  check("Reviews carousel: the featured review and a link to /reviews", carousel.includes("Exactly right") && !carousel.includes("Fine.") && carousel.includes('href="/reviews"'))
  const all = drawNative("reviews_all", d, { template: "page" })
  check("All reviews: every review, with its product", all.includes("Oak board") && all.includes("Linen apron") && all.includes("Fine."))
  const card = { id: PRODUCT, type: "product", settings: { title: "Linen apron", price: "$48.00", image: "", url: "/products/linen-apron" }, rating: { value: 4.5, count: 2, percent: 90, color: "#e8a33d" } }
  const plain = { id: "p2", type: "product", settings: { title: "Oak board", price: "$30.00", image: "", url: "/products/oak-board" } }
  const grid = drawNative("product_grid", d, { template: "index" }, { source: "shop" }, [card, plain])
  check("a product card with reviews carries its stars; one without carries none", (grid.match(/card__rating/g) ?? []).length === 1 && grid.includes("(2)") && grid.includes("width:90%"))
  check("the /reviews page is header, All reviews, footer", accountPageSections("reviews", [{ id: "h", type: "header", settings: {}, blocks: [], hidden: false }, { id: "f", type: "footer", settings: {}, blocks: [], hidden: false }] as never)?.map((s) => s.type).join() === "header,reviews_all,footer")

  realLog("\nAn imported Shopify theme")
  const withRating = { id: PRODUCT, settings: { title: "Linen apron", price: "$48.00", url: "/products/linen-apron", slug: "linen-apron" }, rating: { value: 4.5, count: 2, percent: 90, color: "#e8a33d" } }
  const mf = (productObject(withRating as never).metafields as Record<string, any>).reviews
  check("Shopify's own review metafields: rating.value.rating, scale_max, rating_count", mf.rating.value.rating === 4.5 && mf.rating.value.scale_max === 5 && mf.rating_count.value === 2)
  check("no reviews: no metafield, so a theme's `!= blank` draws no stars", Object.keys((productObject({ id: "x", settings: { title: "X" } } as never).metafields as Record<string, any>).reviews).length === 0)
  const files: Record<string, string> = {
    "layout/theme.storelib": wrapCompatTemplate(`<html><body><main>{{ content_for_layout }}</main></body></html>`),
    "sections/card.storelib": `${wrapCompatTemplate(`{% for p in collections.all.products %}<div class="c">{{ p.title }}{% if p.metafields.reviews.rating.value != blank %}<span class="rating">{{ p.metafields.reviews.rating.value }} / {{ p.metafields.reviews.rating.value.scale_max }} ({{ p.metafields.reviews.rating_count }})</span>{% endif %}</div>{% endfor %}`)}\n\n<schema>\n${JSON.stringify({ type: "card", name: "Cards", settings: [] })}\n</schema>\n`,
    "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="mp">{%- for block in section.blocks -%}{%- case block.type -%}{%- when '@app' -%}{% render block %}{%- else -%}<i>{{ block.type }}</i>{%- endcase -%}{%- endfor -%}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [], blocks: [{ type: "@app" }] } })}\n</schema>\n`,
  }
  const theme = new CompatTheme(withStorelibReviewsSection(files), {}, { assetUrl: (n) => `/a/${n}` })
  const base = { designMode: false, products: [withRating, { id: "p2", settings: { title: "Oak board", slug: "oak-board", url: "/products/oak-board" } }], collections: [], menus: {}, shop: { name: "Drew Studio", currency: "USD", moneyFormat: "${{amount}}" } }
  const cards = drawPage(theme as never, { ...base, template: "index", path: "/" } as never, [{ id: "c", type: "card" }], { scripts: false }).html
  check("a theme's card stars from the metafields", cards.includes('<span class="rating">4.5 / 5 (2)</span>') && (cards.match(/class="rating"/g) ?? []).length === 1)
  check("every imported theme has the Storelib Reviews section; a Storelib theme does not get one", REVIEWS_SECTION_PATH in withStorelibReviewsSection(files) && !(REVIEWS_SECTION_PATH in withStorelibReviewsSection({ "sections/x.storelib": "<template></template>" })))
  const section = drawPage(theme as never, { ...base, template: "product", path: "/products/linen-apron", product: withRating, reviews: data() } as never, [{ id: "rv", type: "storelib-reviews", settings: {} }], { scripts: false }).html
  check("the section draws the product's reviews in the theme", section.includes("Exactly right") && section.includes("Based on 2 reviews") && section.includes('action="/api/reviews/site"') && !section.includes("<script>alert"))
  check("a Judge.me block the theme kept on Shopify becomes Storelib Reviews (Dawn's {% render block %})", isReviewsAppBlock("shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1") && !isReviewsAppBlock("shopify://apps/klaviyo/blocks/form/1"))
  const app = drawPage(theme as never, { ...base, template: "product", path: "/products/linen-apron", product: withRating, reviews: data() } as never, [{ id: "mp", type: "main-product", blocks: [{ id: "jm", type: "shopify://apps/judge-me-reviews/blocks/review_widget/61ccd3b1", settings: {} }, { id: "t", type: "title", settings: {} }] }], { scripts: false }).html
  check("  drawn in the block's place, the theme's other blocks as they were", app.includes('class="shopify-app-block"') && app.includes("Exactly right") && app.includes("<i>title</i>"))
  const design = drawPage(theme as never, { ...base, designMode: true, template: "product", path: "/products/linen-apron", product: withRating } as never, [{ id: "rv", type: "storelib-reviews", settings: {} }], { scripts: false }).html
  check("in the builder before any reviews: samples", design.includes("Sample reviews"))
  check("the website's own /reviews in an imported theme", /path === "\/reviews" \|\| path === "\/pages\/reviews"/.test(read("lib/storelib-theme/compat/site.ts")))

  realLog("\nSearch results")
  const ld = productJsonLd({ url: "https://s.test/products/a", name: "A", images: [], priceCents: 1000, inStock: true, seller: "S", rating: { average: 4.5, count: 2, reviews: [{ author: "Maya R.", rating: 5, body: "Good", date: "2026-09-30T10:00:00Z" }] } }) as Record<string, any>
  check("AggregateRating and Review from the reviews the page shows", ld.aggregateRating.ratingValue === "4.5" && ld.aggregateRating.reviewCount === 2 && ld.review[0].author.name === "Maya R." && ld.review[0].datePublished === "2026-09-30")
  check("no reviews: no rating at all", !("aggregateRating" in (productJsonLd({ url: "u", name: "A", images: [], priceCents: 1, inStock: true, seller: "S", rating: { average: 0, count: 0 } }) as Record<string, unknown>)))
  check("  only while the app shows them on the website", /const own = reviews\?\.enabled \? reviews\.product : null/.test(read("components/website-builder/theme/render-product.tsx")))

  realLog("\nSettings › Integrations")
  const item = INTEGRATIONS.find((i) => i.id === "storelib-reviews")
  check("Storelib Reviews is in the directory, Storelib's own, first", INTEGRATIONS[0]?.id === "storelib-reviews" && item?.kind === "app" && item.category === "reviews")
  const dir = read("components/app/settings/integrations-directory.tsx")
  check("  its page's Set up card is the app's settings", /<ReviewsAppPanel onChanged=/.test(dir) && /i\.kind === "app" && status === "available" \? <Badge>Storelib<\/Badge>/.test(dir))
}

/* ── Routes ─────────────────────────────────────────────────────────── */

const S: any = ((globalThis as any).__rvStubs = { admin: null, user: null, sent: [] as any[] })
const dir = mkdtempSync(join(tmpdir(), "rv-stubs-"))
const stub = (name: string, source: string) => {
  const file = join(dir, `${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__rvStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__rvStubs.user }, error: null }) } })\n`),
  "@/lib/email": stub("email", `export const sendReviewNotificationEmail = async (_a, p) => { globalThis.__rvStubs.sent.push({ kind: "review", ...p }); return { success: true } }\nexport const resolveSellerEmail = async () => "seller@example.com"\n`),
  "@/lib/api/rate-limit": stub("rl", `export const rateLimit = async () => null\nexport const addressSubject = () => "ip:x"\nexport const emailSubject = (e) => "email:" + e\nexport const callerAddress = () => "203.0.113.9"\n`),
  "@/lib/reviews/requests-server": stub("rq", `export const askNow = async (_db, _c, orderId) => { globalThis.__rvStubs.sent.push({ kind: "ask", orderId }); return true }\nexport { requestContext } from ${JSON.stringify(pathToFileURL(join(dir, "ctx.mjs")).href)}\n`),
  "@/lib/activity/log-server": stub("act", `export const recordActivity = async () => undefined\n`),
  "@/lib/notifications/events": stub("ev", `export const noteReview = async () => undefined\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string, extraExternal: string[] = []): Promise<string> {
  /* Somewhere `next` and the other packages resolve from: the run's own folder, or under node_modules. */
  const out = join(process.env.PUSH_TEST_OUT || join(process.cwd(), "node_modules/.cache/storelib-reviews-test"), "__routes__", entry.replace(/[^\w]+/g, "_") + ".mjs")
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
    plugins: [{ name: "stand-ins", setup(b) { const names = new Set(Object.keys(stubs)); b.onResolve({ filter: /.*/ }, (a) => (names.has(a.path) ? { path: a.path, external: true } : undefined)) } }],
    external: ["next/*", "server-only", ...extraExternal],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

function db(over: { app?: Record<string, unknown>; order?: Record<string, unknown>; reviews?: any[] } = {}) {
  return fakeDb({
    orders: [{ id: ORDER, product_id: PRODUCT, creator_id: CREATOR, buyer_email: "ana@example.com", buyer_first_name: "Ana Lopez", buyer_id: null, status: "completed", amount_cents: 1200, created_at: new Date(Date.now() - 10 * DAY_MS).toISOString(), receipt_token: "tok_x", ...over.order }],
    products: [{ id: PRODUCT, title: "Linen apron", slug: "linen-apron", status: "published", creator_id: CREATOR, thumbnail_url: null, reviews_count: 0, reviews_average: 0 }],
    creators: [{ id: CREATOR, user_id: SELLER_USER, stripe_account_id: "acct_1", paypal_merchant_id: null, support_email: "help@shop.example", reviews_count: 0, reviews_average: 0, display_name: "Drew Studio", slug: "drew" }],
    store_settings: [{ creator_id: CREATOR, reviews: { enabled: true, who: "anyone", photos: true, publish: "auto", minStars: 3, editDays: 30, ...over.app } }],
    review_requests: [{ id: REQUEST, creator_id: CREATOR, order_id: ORDER, product_id: PRODUCT, email: "ana@example.com", first_name: "Ana", origin: null, status: "sent", due_at: new Date().toISOString(), sent_at: new Date().toISOString(), attempts: 1, review_id: null }],
    reviews: over.reviews ?? [],
    review_authors: [],
    review_reports: [],
    seller_notifications: [],
    profiles: [],
    entitlements: [],
    email_suppressions: [],
  })
}
const req = (url: string, method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`https://drew.storelib.com${url}`, { method, headers: { "content-type": "application/json", host: "drew.storelib.com", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (r: Response) => r.json().catch(() => ({}))
function reset(d: any, user: any = null) {
  S.admin = d
  S.user = user
  S.sent = []
}

async function routes() {
  process.env.REVIEW_LINK_SECRET = KEY
  /* requestContext is the real one, bundled on its own so the route's stub of askNow leaves it alone. */
  const ctxUrl = await bundle("lib/reviews/requests-server.ts")
  writeFileSync(join(dir, "ctx.mjs"), `export { requestContext } from ${JSON.stringify(ctxUrl)}\n`)
  const request = (await import(await bundle("app/api/reviews/request/route.ts"))) as any
  const site = (await import(await bundle("app/api/reviews/site/route.ts"))) as any
  const moderate = (await import(await bundle("app/api/app/reviews/[id]/route.ts"))) as any
  const token = signRequestWith(KEY, REQUEST)

  realLog("\nFrom the review link")
  {
    const d = db()
    reset(d)
    const bad = await request.POST(req("/api/reviews/request", "POST", { token: `${token.slice(0, -2)}xx`, rating: 5, content: "Lovely apron." }))
    check("a link that was not made here: 404, nothing written", bad.status === 404 && d.tables.reviews.length === 0)
    const r = await request.POST(req("/api/reviews/request", "POST", { token, rating: 5, title: "Lovely", content: "Lovely apron.", name: "Ana Lopez" }))
    const row = d.tables.reviews[0]
    check("written: the order's, verified, from a request, live by the store's rule, named Ana L.", r.status === 200 && row?.order_id === ORDER && row?.verified === true && row?.source === "request" && row?.status === "published" && row?.reviewer_name === "Ana L.", { status: r.status, row })
    check("the request is marked reviewed and points at it", d.tables.review_requests[0].status === "reviewed" && d.tables.review_requests[0].review_id === row?.id)
    check("the product's rating counts it, and the store is told", d.tables.products[0].reviews_count === 1 && d.tables.seller_notifications.length === 1 && S.sent.some((m: any) => m.kind === "review"))
    const again = await request.POST(req("/api/reviews/request", "POST", { token, rating: 1, content: "Changed my mind." }))
    check("a second one from the same link: 409", again.status === 409 && d.tables.reviews.length === 1)
    const edit = await request.PATCH(req("/api/reviews/request", "PATCH", { token, rating: 2, content: "Wore out fast." }))
    check("changed from the link: under the store's line it waits again on the website only, still on Storelib and in its rating", edit.status === 200 && (await json(edit)).status === "pending" && d.tables.reviews[0].status === "published" && d.tables.reviews[0].site_status === "pending" && !!d.tables.reviews[0].edited_at && d.tables.products[0].reviews_count === 1 && d.tables.products[0].reviews_average === 2, d.tables.reviews[0])
    d.tables.reviews[0].created_at = new Date(Date.now() - 40 * DAY_MS).toISOString()
    const late = await request.PATCH(req("/api/reviews/request", "PATCH", { token, rating: 5, content: "Back to great." }))
    check("after the edit window: refused", late.status === 403 && d.tables.reviews[0].rating === 2)
  }
  {
    const d = db({ app: { publish: "manual" } })
    reset(d)
    const r = await request.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "Lovely apron." }))
    const row = d.tables.reviews[0]
    check("a store that approves each one: the buyer's review is on Storelib and in its rating now, waiting on the website", r.status === 200 && (await json(r)).status === "pending" && row?.status === "published" && row?.site_status === "pending" && !!row?.published_at && d.tables.products[0].reviews_count === 1 && d.tables.creators[0].reviews_count === 1, row)
  }
  {
    const d = db({ order: { status: "refunded", refund_amount_cents: 1200 } })
    reset(d)
    const r = await request.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "Refunded and reviewing." }))
    check("a refunded order's link: 403", r.status === 403 && d.tables.reviews.length === 0)
  }
  {
    const d = db({ order: { buyer_email: "help@shop.example" } })
    reset(d)
    const r = await request.POST(req("/api/reviews/request", "POST", { token, rating: 5, content: "My own shop is great." }))
    check("an order made with the store's own address: 403", r.status === 403 && d.tables.reviews.length === 0)
  }

  realLog("\nOn the website")
  {
    const d = db()
    reset(d)
    const trap = await site.POST(req("/api/reviews/site", "POST", { productId: PRODUCT, rating: 5, content: "Buy now cheap", name: "Bot", email: "bot@spam.test", website: "http://spam" }))
    check("the field a person never sees, filled in: told it worked, nothing kept", trap.status === 200 && d.tables.reviews.length === 0)
    const r = await site.POST(req("/api/reviews/site", "POST", { productId: PRODUCT, rating: 2, content: "Seams came loose.", name: "Lee Park", email: "LEE@example.com" }))
    const row = d.tables.reviews[0]
    check("a visitor's review: not verified, no buyer or order, waiting (under three stars)", r.status === 200 && row?.verified === false && row?.buyer_id === null && row?.order_id === null && row?.source === "site" && row?.status === "pending" && row?.site_status === "shown" && row?.reviewer_name === "Lee P.", row)
    check("the address is kept apart from the public row, lower case", !("email" in row) && d.tables.review_authors[0]?.email === "lee@example.com" && d.tables.review_authors[0]?.ip_hash?.length === 32)
    const twice = await site.POST(req("/api/reviews/site", "POST", { productId: PRODUCT, rating: 5, content: "Second try.", name: "Lee", email: "lee@example.com" }))
    check("the same address again: 409", twice.status === 409 && d.tables.reviews.length === 1)
    const buyer = await site.POST(req("/api/reviews/site", "POST", { productId: PRODUCT, rating: 5, content: "I bought it.", name: "Ana", email: "ana@example.com" }))
    check("a buyer's address: nothing taken from the form; their own link is emailed instead", buyer.status === 202 && (await json(buyer)).status === "check_email" && d.tables.reviews.length === 1 && S.sent.some((m: any) => m.kind === "ask" && m.orderId === ORDER))
    const form = new FormData()
    for (const [k, v] of Object.entries({ productId: PRODUCT, rating: "5", content: "From the form.", name: "Kim Ro", email: "kim@example.com" })) form.append(k, v)
    const posted = await site.POST(new Request("https://drew.storelib.com/api/reviews/site", { method: "POST", body: form, headers: { referer: "https://drew.storelib.com/products/linen-apron?variant=1", host: "drew.storelib.com" } }))
    check("the theme's plain form post: back to the page at #review-posted", posted.status === 303 && posted.headers.get("location") === "https://drew.storelib.com/products/linen-apron?variant=1#review-posted", posted.headers.get("location"))
    const away = await site.POST(new Request("https://drew.storelib.com/api/reviews/site", { method: "POST", body: (() => { const f = new FormData(); f.append("productId", PRODUCT); return f })(), headers: { referer: "https://evil.example/x", host: "drew.storelib.com" } }))
    check("  never back to another site's address", away.status === 303 && away.headers.get("location") === "https://drew.storelib.com/#review-error")
  }
  {
    const d = db({ app: { who: "verified" } })
    reset(d)
    const r = await site.POST(req("/api/reviews/site", "POST", { productId: PRODUCT, rating: 5, content: "Let me in.", name: "Lee", email: "lee@example.com" }))
    check("a store that takes buyers only: 403 whatever the form says", r.status === 403 && d.tables.reviews.length === 0)
  }

  realLog("\nModeration")
  {
    const reviews = [
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", product_id: PRODUCT, creator_id: CREATOR, order_id: null, buyer_id: null, rating: 2, content: "Meh.", status: "pending", site_status: "shown", verified: false, source: "site", photos: [{ path: `${CREATOR}/${"b".repeat(32)}.jpg`, url: "https://x/b.jpg", status: "approved" }] },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", product_id: PRODUCT, creator_id: CREATOR, order_id: null, buyer_id: null, rating: 1, content: "Abuse.", status: "hidden", site_status: "shown", hidden_by: "report", verified: false, source: "site" },
      { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", product_id: PRODUCT, creator_id: CREATOR, order_id: ORDER, buyer_id: null, rating: 1, content: "Broke in a week.", status: "published", site_status: "shown", hidden_by: null, verified: true, source: "request" },
    ]
    const d = db({ reviews })
    const p = (id: string) => ({ params: Promise.resolve({ id }) })
    reset(d, { id: STRANGER })
    const theirs = await moderate.PATCH(req(`/api/app/reviews/${reviews[0].id}`, "PATCH", { action: "publish" }), p(reviews[0].id))
    check("somebody who is not the store: 403, nothing changed", theirs.status === 403 && d.tables.reviews[0].status === "pending")
    reset(d, null)
    check("signed out: 401", (await moderate.DELETE(req(`/api/app/reviews/${reviews[0].id}`, "DELETE"), p(reviews[0].id))).status === 401 && d.tables.reviews.length === 3)
    reset(d, { id: SELLER_USER })
    const pub = await moderate.PATCH(req(`/api/app/reviews/${reviews[0].id}`, "PATCH", { action: "publish" }), p(reviews[0].id))
    check("the store publishes a pending review: live, counted", pub.status === 200 && d.tables.reviews[0].status === "published" && !!d.tables.reviews[0].published_at && d.tables.products[0].reviews_count === 2)
    await moderate.PATCH(req(`/api/app/reviews/${reviews[0].id}`, "PATCH", { action: "feature" }), p(reviews[0].id))
    await moderate.PATCH(req(`/api/app/reviews/${reviews[0].id}`, "PATCH", { action: "remove_photo", photo: `${CREATOR}/${"b".repeat(32)}.jpg` }), p(reviews[0].id))
    check("features it and takes a photo off", d.tables.reviews[0].featured === true && d.tables.reviews[0].photos[0].status === "removed")
    const hide = await moderate.PATCH(req(`/api/app/reviews/${reviews[0].id}`, "PATCH", { action: "hide" }), p(reviews[0].id))
    check("an unverified review: hidden by the store everywhere, kept, out of the rating", hide.status === 200 && d.tables.reviews[0].status === "hidden" && d.tables.reviews[0].hidden_by === "seller" && d.tables.products[0].reviews_count === 1)
    const reported = await moderate.PATCH(req(`/api/app/reviews/${reviews[1].id}`, "PATCH", { action: "publish" }), p(reviews[1].id))
    check("a review hidden by a report stays Storelib's to bring back", reported.status === 409 && d.tables.reviews[1].status === "hidden")
    const v = () => d.tables.reviews.find((r: any) => r.id === reviews[2].id)
    const hideV = await moderate.PATCH(req(`/api/app/reviews/${reviews[2].id}`, "PATCH", { action: "hide" }), p(reviews[2].id))
    check("a verified buyer's review: the store's hide is on its website only", hideV.status === 200 && v()?.site_status === "hidden" && v()?.status === "published" && v()?.hidden_by === null, v())
    check("  still on Storelib: in the product's, the creator's and every Storelib rating", d.tables.products[0].reviews_count === 1 && d.tables.products[0].reviews_average === 1 && d.tables.creators[0].reviews_count === 1)
    const shown = await moderate.PATCH(req(`/api/app/reviews/${reviews[2].id}`, "PATCH", { action: "publish" }), p(reviews[2].id))
    check("  shown on the website again", shown.status === 200 && v()?.site_status === "shown" && v()?.status === "published")
    const delV = await moderate.DELETE(req(`/api/app/reviews/${reviews[2].id}`, "DELETE"), p(reviews[2].id))
    check("  never deleted by the store: 403, still there and counted", delV.status === 403 && /verified buyer/.test((await json(delV)).error ?? "") && !!v() && d.tables.products[0].reviews_count === 1)
    const reportedV = { ...reviews[2], id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", status: "hidden", hidden_by: null, order_id: null, buyer_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1" }
    d.tables.reviews.push(reportedV)
    const hideR = await moderate.PATCH(req(`/api/app/reviews/${reportedV.id}`, "PATCH", { action: "hide" }), p(reportedV.id))
    const pubR = await moderate.PATCH(req(`/api/app/reviews/${reportedV.id}`, "PATCH", { action: "publish" }), p(reportedV.id))
    check("  one a report hid stays Storelib's: hiding it changes nothing, publishing is refused", hideR.status === 200 && pubR.status === 409 && d.tables.reviews.find((r: any) => r.id === reportedV.id)?.status === "hidden")
    const gone = reviews[0].id
    const del = await moderate.DELETE(req(`/api/app/reviews/${gone}`, "DELETE"), p(gone))
    check("an unverified review: deleted for good", del.status === 200 && d.tables.reviews.length === 3 && !d.tables.reviews.some((r: any) => r.id === gone))
  }

  realLog("\nStars on the website's cards")
  {
    const d = fakeDb({
      store_settings: [{ creator_id: CREATOR, reviews: { enabled: true, display: { showCardRating: true } } }],
      products: [{ id: PRODUCT, status: "published", reviews_count: 3, reviews_average: 3 }],
      reviews: [
        { id: "r1", product_id: PRODUCT, rating: 5, status: "published", site_status: "shown" },
        { id: "r2", product_id: PRODUCT, rating: 1, status: "published", site_status: "hidden" },
        { id: "r3", product_id: PRODUCT, rating: 3, status: "published", site_status: "pending" },
        { id: "r4", product_id: PRODUCT, rating: 4, status: "hidden", site_status: "shown" },
      ],
    })
    const [card] = await withRatings(d as any, CREATOR, [{ id: PRODUCT } as any])
    check("counted from what the website shows, not Storelib's total (the store hid one there)", card.rating?.count === 1 && card.rating?.value === 5, card.rating)
  }
}

/* ── Wiring the review pages, SQL and security read from the source ── */

function wiring() {
  realLog("\nThe pieces around it")
  const sql = read("supabase/sql/run-now/133_storelib_reviews.sql")
  check("part 133: one statement a line, safe to run again, server only tables", sql.split("\n").filter((l) => l.trim()).every((l) => /;\s*$/.test(l) || l.startsWith("/*")) && /REVOKE ALL ON public.review_requests FROM anon, authenticated/.test(sql) && /REVOKE ALL ON public.review_authors FROM anon, authenticated/.test(sql) && /CHECK \(status IN \('pending', 'published', 'hidden'\)\) NOT VALID/.test(sql))
  check("  the public still reads published reviews only (part 52's policy is untouched)", !/CREATE POLICY/.test(sql) && /status = 'published' OR buyer_id = \(select auth\.uid\(\)\)/.test(read("supabase/sql/run-now/52_reviews_replies_reports_guests.sql")))
  check("  in the README, the check after, and migrations", read("supabase/sql/run-now/README.md").includes("`133_storelib_reviews.sql`") && /p133_storelib_reviews/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const proxy = read("proxy.ts")
  check("/review/<token> is Storelib's page on every host, a website's own included", /"\/review",/.test(proxy) && /if \(pathname\.startsWith\("\/review\/"\)\) return NextResponse\.next\(\)/.test(proxy) && /if \(pathname\.startsWith\("\/review\/"\)\) return false/.test(proxy))
  check("  never indexed, no referer", /robots: \{ index: false, follow: false \}/.test(read("app/review/[token]/page.tsx")) && /referrer: "no-referrer"/.test(read("app/review/[token]/page.tsx")))
  const photo = read("lib/reviews/photos-server.ts")
  check("a photo: a picture by its bytes, the picture reader, the malware scan", /preparePublicImage\(/.test(photo) && /judgePicture\(/.test(photo) && /screenInBackground\(/.test(photo))
  check("the website's card ratings never import server code (the browser loads shop-products)", !/server-only|app-server/.test(read("lib/website-builder/shop-products.ts")))
  check("part 133: the website's own say (site_status), and a check that a verified review is never pending or hidden by the store", /ADD COLUMN IF NOT EXISTS site_status text NOT NULL DEFAULT 'shown'/.test(sql) && /CHECK \(NOT verified OR \(status <> 'pending' AND hidden_by IS DISTINCT FROM 'seller'\)\) NOT VALID/.test(sql) && /column_name = 'site_status'/.test(read("supabase/sql/run-now/99_check_after.sql")))
  const shopRead = read("lib/reviews/storefront-server.ts")
  check("the website's review sections and its JSON-LD read only what the store shows there", (shopRead.match(/q\.eq\("site_status", "shown"\)/g) ?? []).length === 2)
  const marketRead = read("lib/reviews/store.ts")
  check("  Explore, the product page and the ratings never read it", !/site_status/.test(marketRead) && !/site_status/.test(read("supabase/sql/run-now/52_reviews_replies_reports_guests.sql")))
  const ui = read("app/app/reviews/reviews-client.tsx")
  check("the store's list says it plainly, and offers no delete for a verified buyer's review", ui.includes("Hidden on your website. Still shown on Storelib because it&apos;s from a verified buyer.") && /moderation && !reported && !review\.verified \? \[\{ label: "Delete"/.test(ui))
}

async function main() {
  settingsAndRules()
  links()
  schedule()
  csv()
  website()
  wiring()
  await routes()
  realLog(`\n  ${passed} passed, ${failed} failed`)
  if (failed) {
    realLog(`  failing:\n    ${failures.join("\n    ")}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  realLog(e)
  process.exit(1)
})
