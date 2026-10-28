/**
 * ===========================================================================
 *  STORELIB REVIEWS, MANAGED IN ONE PLACE (round K5)
 * ===========================================================================
 * The integration's own page: Overview, Reviews, Requests, Widgets,
 * Analytics, Settings, and the routes under /api/app/reviews it reads.
 *
 *   TABS & FILTERS   where a review stands, counted on the server; search,
 *                    rating, product, verified, imported, one review by id;
 *                    pages of PAGE_SIZE
 *   MODERATION       one and many through one rule, the round F trust rules
 *                    kept (a verified buyer's review is hidden on the website
 *                    only and never deleted; one a report hid stays
 *                    Storelib's), a photo on its own
 *   REPLIES          posted, changed and removed from the list
 *   IMPORT           mapping, SKU / handle / title matching, a reason for
 *                    every skipped row, duplicates, preview writes nothing,
 *                    imported reviews never verified and never in a Storelib
 *                    rating, undo
 *   REQUESTS         the list, asking by hand with every cap kept, the
 *                    store's email in its words and language, open tracking
 *   NUMBERS          the overview, the tabs and the analytics agree
 *   WIRING           /app/reviews sends here, the integration page mounts it,
 *                    the review page speaks the store's language, part 215
 *
 * Run with:  NODE_OPTIONS="--conditions=react-server" npx tsx tests/reviews-manage.test.ts
 */
import { register } from "node:module"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { build } from "esbuild"
import { fakeDb } from "./_fake-db"
import {
  PAGE_SIZE,
  applyFilters,
  applyTab,
  changePercent,
  cleanSearch,
  funnelFrom,
  listQueryString,
  pageRange,
  periodTotals,
  planModeration,
  readBulkIds,
  readListQuery,
  requestShown,
  reviewSeries,
  summaryFromCounts,
} from "../lib/reviews/manage"
import { guessMapping, planImport, readMapping, reviewFingerprint } from "../lib/reviews/import-csv"
import { reviewRequestEmail } from "../lib/reviews/request-email"
import { inEmailLanguage } from "../lib/emails/words"
import { reviewRequestEvent } from "../lib/reviews/request-tracking"
import { readCopy } from "../lib/emails/customer-custom"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 700)}`}`)
  }
}
const realLog = console.log
console.warn = () => undefined
console.error = () => undefined
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const CREATOR = "33333333-3333-4333-8333-333333333333"
const OTHER = "88888888-8888-4888-8888-888888888888"
const P1 = "22222222-2222-4222-8222-222222222222"
const P2 = "22222222-2222-4222-8222-222222222223"
const ORDER = "11111111-1111-4111-8111-111111111111"
const ORDER2 = "11111111-1111-4111-8111-111111111112"
const SELLER_USER = "66666666-6666-4666-8666-666666666666"
const R = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`
const DAY = 86_400_000

/* ── Pure rules ────────────────────────────────────────────────────── */

function pure() {
  realLog("\nThe list's query")
  const q = readListQuery(new URLSearchParams("tab=pending&q=  great,(x)* stuff %&rating=9&product=nope&verified=yes&media=1&from=2026-10-01&to=2026-13-40&sort=lowest&page=-3"))
  check("each value checked: a tab it knows, stars out of range dropped, a product that is not an id dropped, a bad date dropped", q.tab === "pending" && q.rating === 0 && q.product === "" && q.verified === "yes" && q.media && q.from === "2026-10-01" && q.to === "" && q.sort === "lowest" && q.page === 1, q)
  check("a search loses what would break a PostgREST filter (commas, brackets, wildcards)", q.q === "great x stuff" && cleanSearch("a\\b'c\"d:e;f") === "a b c d e f" && cleanSearch("x".repeat(200)).length === 80, q.q)
  const back = readListQuery(new URLSearchParams(listQueryString({ ...q, page: 3, q: "nice" })))
  check("written back to an address and read again, the same", back.tab === "pending" && back.page === 3 && back.q === "nice" && back.media && back.sort === "lowest")
  check("pages of 25 from the server", PAGE_SIZE === 25 && JSON.stringify(pageRange(1)) === "[0,24]" && JSON.stringify(pageRange(3)) === "[50,74]")
  const seen: unknown[] = []
  const rec: any = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => (seen.push([k, ...a]), rec) })
  applyFilters(rec, { ...readListQuery(new URLSearchParams("")), media: true, source: "import", q: "apron" }, [P1])
  check("with photos is photos <> [], imported is source = import, a search also finds products by title", JSON.stringify(seen).includes('["neq","photos","[]"]') && JSON.stringify(seen).includes('["eq","source","import"]') && JSON.stringify(seen).includes(`product_id.in.(${P1})`), seen)
  seen.length = 0
  applyTab(rec, "reported")
  check("Reported is hidden by anybody but the store, a null hider included (Postgres' <> skips nulls)", JSON.stringify(seen) === JSON.stringify([["eq", "status", "hidden"], ["or", "hidden_by.is.null,hidden_by.neq.seller"]]), seen)

  realLog("\nOne rule for one review and for many (round F's trust rules)")
  const now = "2026-10-16T10:00:00.000Z"
  const v = planModeration({ id: R(1), status: "published", site_status: "shown", verified: true }, "hide", undefined, now)
  check("a verified buyer's review hidden: on the website only (site_status), Storelib's status untouched", v.kind === "change" && JSON.stringify(v.change) === JSON.stringify({ site_status: "hidden" }), v)
  const u = planModeration({ id: R(2), status: "published", site_status: "shown", verified: false }, "hide", undefined, now)
  check("an unverified one hidden: off everywhere, by the store", u.kind === "change" && u.change.status === "hidden" && u.change.hidden_by === "seller", u)
  const rep = planModeration({ id: R(3), status: "hidden", hidden_by: "report", verified: true }, "publish")
  check("one a report hid cannot be published by the store", rep.kind === "refused" && rep.status === 409, rep)
  const repHide = planModeration({ id: R(3), status: "hidden", hidden_by: "report", verified: true }, "hide")
  check("  and hiding it changes nothing", repHide.kind === "same", repHide)
  const pend = planModeration({ id: R(4), status: "pending", site_status: "shown", verified: false }, "publish", undefined, now)
  check("an unverified pending one published: live, published now", pend.kind === "change" && pend.change.status === "published" && pend.change.published_at === now)
  const ph = planModeration({ id: R(5), photos: [{ path: "c/a.jpg", url: "https://x/a.jpg", status: "approved" }, { path: "c/b.jpg", url: "https://x/b.jpg", status: "approved" }] }, "remove_photo", "c/b.jpg")
  check("one photo off, the other kept", ph.kind === "change" && JSON.stringify((ph.change.photos as any[]).map((p) => p.status)) === '["approved","removed"]')
  check("a photo not on the review: 404", planModeration({ id: R(5), photos: [] }, "remove_photo", "c/z.jpg").kind === "refused")
  check("bulk ids: unique uuids, at most 100, none is nothing", readBulkIds([R(1), R(1).toUpperCase(), "x", R(2)])?.length === 2 && readBulkIds([]) === null && readBulkIds(Array.from({ length: 101 }, (_, i) => R(i))) === null)

  realLog("\nThe numbers")
  const sum = summaryFromCounts({ total: 10, published: 4, pending: 1, hidden: 1, reported: 0, unanswered: 3, verifiedPublished: 3, stars: { 5: 2, 4: 1, 1: 1 } })
  check("the average from the five star counts, exact without reading a row", sum.average === 3.8 && sum.distribution[0].count === 2 && sum.distribution[4].count === 1, sum)
  check("response rate: reviewed over sent, never over 100%", funnelFrom({ sent: 8, delivered: null, opened: 3, clicked: null, submitted: 2, scheduled: 0 }).responseRate === 25 && funnelFrom({ sent: 0, delivered: 0, opened: 0, clicked: 0, submitted: 0, scheduled: 0 }).responseRate === 0)
  const t0 = Date.parse("2026-10-01T00:00:00Z")
  const rows = [
    { rating: 5, status: "published", site_status: "shown", verified: true, created_at: "2026-10-01T09:00:00Z" },
    { rating: 3, status: "published", site_status: "shown", verified: false, created_at: "2026-10-03T09:00:00Z" },
    { rating: 1, status: "pending", site_status: "shown", verified: false, created_at: "2026-10-03T10:00:00Z" },
    { rating: 4, status: "published", site_status: "hidden", verified: true, created_at: "2026-10-05T09:00:00Z" },
  ]
  const totals = periodTotals(rows)
  const series = reviewSeries(rows, t0, t0 + 7 * DAY, "day")
  check("received counts every review; the average and stars only what the website shows", totals.received === 4 && totals.published === 2 && totals.average === 4 && totals.verifiedShare === 50, totals)
  check("the series adds up to the totals, every day there (empty ones zero)", series.length === 7 && series.reduce((a, p) => a + p.received, 0) === totals.received && series[1].received === 0 && series[2].received === 2 && series[2].average === 3, series)
  check("a change in percent, none when there was nothing before", changePercent(12, 8) === 50 && changePercent(3, 0) === null)
  check("a request: submitted wins, opened while waiting, skipped as skipped", requestShown({ status: "reminded", review_id: R(1) }) === "submitted" && requestShown({ status: "sent", opened_at: "x" }) === "opened" && requestShown({ status: "skipped" }) === "skipped" && requestShown({ status: "scheduled" }) === "scheduled")

  realLog("\nThe import, before anything is written")
  const products = [
    { id: P1, slug: "linen-apron", title: "Linen apron", skus: ["APR-1", "APR-2"] },
    { id: P2, slug: "oak-board", title: "Oak board", skus: [] },
  ]
  const csv = [
    "Handle,Stars,Comment,Headline,Author,When",
    "linen-apron,5,Loved it,Great,Jane Doe,2026-05-01",
    "APR-2,4,Good apron,,Ann,not a date",
    "Oak board,3,Fine board,,Lee,",
    "nope,5,x,,a,",
    "linen-apron,4.5,x,,a,",
    "linen-apron,3,,,a,",
    "linen-apron,5,Loved it,,Jane Doe,",
    "oak-board,2,Already here,,Kim,",
  ].join("\n")
  const header = csv.split("\n")[0].split(",")
  const guessed = guessMapping(header)
  check("columns found by name are guessed; ones it does not know are left for the store", guessed.product === 0 && guessed.rating === 1 && guessed.body === undefined && guessed.title === undefined, guessed)
  const mapping = readMapping({ product: 0, rating: 1, body: "2", title: 3, name: 4, date: 5, extra: 9 }, header.length)!
  check("a mapping is checked: numbers as text taken, a column used twice or out of range refused", mapping.body === 2 && Object.keys(mapping).length === 6 && Object.keys(readMapping({ product: 0, rating: 0, body: 99 }, 6) ?? {}).join() === "product")
  const existing = new Set([reviewFingerprint({ productId: P2, rating: 2, content: "Already here", name: "Kim" })])
  const plan = planImport(csv, products, mapping, existing)
  const by = (row: number) => plan.rows.find((r) => r.row === row)!
  check("matched by handle, by a variant's SKU and by title", by(2).matchedBy === "handle" && by(3).matchedBy === "sku" && by(3).productId === P1 && by(4).matchedBy === "title" && by(4).productId === P2, plan.rows.slice(0, 3))
  check("each skipped row says why, in a sentence a store can act on", by(5).why === "no_product" && /No product matches "nope"/.test(by(5).message!) && by(6).why === "bad_rating" && /isn't a whole number/.test(by(6).message!) && by(7).why === "no_words" && by(8).why === "duplicate" && by(8).message === "Same review as row 2." && by(9).why === "duplicate" && /already on your store/.test(by(9).message!), plan.rows.filter((r) => !r.ok))
  check("a date that cannot be read is kept as today's, and said", by(3).ok && by(3).notes?.join() === "bad_date" && by(3).createdAt === null)
  check("three ready, five skipped, names made public", plan.reviews.length === 3 && plan.skipped.length === 5 && plan.reviews[0].name === "Jane D.")
  check("without the needed columns it says which", planImport("x,y\n1,2", products).missingColumns.join() === "product,rating,body")
}

/* ── The routes, against an in-memory database ─────────────────────── */

const S: any = ((globalThis as any).__rmStubs = { admin: null, user: null, caller: null, sent: [] as any[] })
const outDir = join(process.env.PUSH_TEST_OUT || join(process.cwd(), "node_modules/.cache/reviews-manage-test"), "__k5__")
mkdirSync(outDir, { recursive: true })
const stub = (name: string, source: string) => {
  const file = join(outDir, `stub-${name}.mjs`)
  writeFileSync(file, source)
  return pathToFileURL(file).href
}
const stubs: Record<string, string> = {
  "@/lib/supabase/admin": stub("admin", `export const createAdminClient = () => globalThis.__rmStubs.admin\n`),
  "@/lib/supabase/server": stub("server", `export const createClient = async () => ({ auth: { getUser: async () => ({ data: { user: globalThis.__rmStubs.user }, error: null }) } })\n`),
  "@/lib/physical/auth": stub(
    "auth",
    `import { NextResponse } from "next/server"
export const physicalJson = (body, status = 200) => NextResponse.json(body, { status })
export const readBody = async (r) => { try { const b = await r.json(); return b && typeof b === "object" && !Array.isArray(b) ? b : null } catch { return null } }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v) => typeof v === "string" && UUID.test(v)
export const shopCaller = async () => globalThis.__rmStubs.caller ?? NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
`,
  ),
  "@/lib/api/rate-limit": stub("rl", `export const rateLimit = async () => null\n`),
  "@/lib/activity/log-server": stub("act", `export const recordActivity = async () => undefined\n`),
  "@/lib/notify/providers/mailgun": stub("mail", `export const emailProvider = () => ({ send: async (m) => { globalThis.__rmStubs.sent.push(m); return { status: "sent" } } })\nexport const mailgunDomain = () => "mg.test"\n`),
}
register(pathToFileURL(join(process.cwd(), "scripts/push-test-stubs.mjs")).href, { parentURL: import.meta.url, data: { stubs } })

async function bundle(entry: string): Promise<string> {
  const out = join(outDir, entry.replace(/[^\w]+/g, "_") + ".mjs")
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
    external: ["next/*", "server-only"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  })
  return pathToFileURL(out).href
}

function fakeStorage() {
  return {
    from: (b: string) => ({
      move: async () => ({ error: null }),
      remove: async () => ({ error: null }),
      createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.test/signed/${path}?t=1` } }),
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${b}/${path}` } }),
    }),
  }
}

function seed() {
  const at = (d: number) => new Date(Date.parse("2026-10-10T10:00:00Z") - d * DAY).toISOString()
  const photo = (n: string) => ({ path: `${CREATOR}/${n.repeat(32)}.jpg`, url: `https://cdn.test/review-photos/${CREATOR}/${n.repeat(32)}.jpg`, status: "approved" })
  const base = { creator_id: CREATOR, buyer_id: null, order_id: null, title: null, featured: false, photos: [], seller_reply: null, seller_reply_at: null, hidden_by: null, reviewer_name: null, edited_at: null }
  const d: any = fakeDb({
    creators: [{ id: CREATOR, user_id: SELLER_USER, display_name: "Drew Studio", slug: "drew", support_email: "help@drew.example", reviews_count: 0, reviews_average: 0 }],
    products: [
      { id: P1, creator_id: CREATOR, title: "Linen apron", slug: "linen-apron", status: "published", thumbnail_url: null, reviews_count: 0, reviews_average: 0 },
      { id: P2, creator_id: CREATOR, title: "Oak board", slug: "oak-board", status: "published", thumbnail_url: null, reviews_count: 0, reviews_average: 0 },
    ],
    product_variants: [{ id: "v1", product_id: P1, sku: "APR-1" }],
    orders: [
      { id: ORDER, creator_id: CREATOR, product_id: P1, buyer_email: "ana@example.com", buyer_first_name: "Ana", buyer_id: null, status: "completed", amount_cents: 1200, created_at: at(12), source: "storelib", source_detail: null },
      { id: ORDER2, creator_id: CREATOR, product_id: P2, buyer_email: "bo@example.com", buyer_first_name: "Bo", buyer_id: null, status: "completed", amount_cents: 900, created_at: at(3), source: "storelib", source_detail: null },
    ],
    store_settings: [{ creator_id: CREATOR, reviews: { enabled: true, request: { enabled: false } }, customer_emails: {} }],
    reviews: [
      { ...base, id: R(1), product_id: P1, order_id: ORDER, rating: 5, content: "Lovely linen.", status: "published", site_status: "shown", verified: true, source: "request", photos: [photo("a")], created_at: at(1) },
      { ...base, id: R(2), product_id: P1, rating: 4, content: "Nice.", status: "published", site_status: "pending", verified: true, source: "storelib", created_at: at(2) },
      { ...base, id: R(3), product_id: P2, rating: 2, content: "Warped.", status: "published", site_status: "hidden", verified: true, source: "storelib", created_at: at(3) },
      { ...base, id: R(4), product_id: P2, rating: 3, content: "Okay board.", status: "pending", site_status: "shown", verified: false, source: "site", photos: [photo("b")], created_at: at(4) },
      { ...base, id: R(5), product_id: P2, rating: 1, content: "Spam spam.", status: "hidden", hidden_by: "seller", site_status: "shown", verified: false, source: "import", created_at: at(5) },
      { ...base, id: R(6), product_id: P1, rating: 1, content: "Abuse.", status: "hidden", hidden_by: "report", site_status: "shown", verified: true, source: "storelib", created_at: at(6) },
      { ...base, id: R(7), product_id: P1, rating: 4, content: "The apron is great.", status: "published", site_status: "shown", verified: false, source: "import", seller_reply: "Thanks!", seller_reply_at: at(6), created_at: at(7) },
      { ...base, id: R(8), creator_id: OTHER, product_id: "p-other", rating: 5, content: "Another store's.", status: "published", site_status: "shown", verified: true, source: "storelib", created_at: at(1) },
    ],
    review_requests: [
      { id: "rq1", creator_id: CREATOR, order_id: ORDER, product_id: P1, email: "ana@example.com", first_name: "Ana", status: "reviewed", due_at: at(9), sent_at: at(9), review_id: R(1), opened_at: at(8), delivered_at: at(9), clicked_at: null, manual: false, created_at: at(9) },
    ],
    review_authors: [],
    email_suppressions: [],
    review_imports: [],
  })
  d.storage = fakeStorage()
  return d
}

const req = (url: string, method = "GET", body?: unknown) => new Request(`https://storelib.test${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
const json = async (r: Response) => r.json().catch(() => ({}))

async function routes() {
  process.env.REVIEW_LINK_SECRET = "a-long-enough-test-secret-for-review-links"
  const list = (await import(await bundle("app/api/app/reviews/route.ts"))) as any
  const bulk = (await import(await bundle("app/api/app/reviews/bulk/route.ts"))) as any
  const one = (await import(await bundle("app/api/app/reviews/[id]/route.ts"))) as any
  const imp = (await import(await bundle("app/api/app/reviews/import/route.ts"))) as any
  const overview = (await import(await bundle("app/api/app/reviews/overview/route.ts"))) as any
  const analytics = (await import(await bundle("app/api/app/reviews/analytics/route.ts"))) as any
  const requests = (await import(await bundle("app/api/app/reviews/requests/route.ts"))) as any
  const email = (await import(await bundle("app/api/app/reviews/request-email/route.ts"))) as any
  const reply = (await import(await bundle("app/api/reviews/[id]/reply/route.ts"))) as any
  const tracking = (await import(await bundle("lib/reviews/request-tracking.ts"))) as any

  realLog("\nWho may read")
  {
    S.admin = seed()
    S.caller = null
    check("signed out: 401 on the list, the overview and the import", (await list.GET(req("/api/app/reviews"))).status === 401 && (await overview.GET()).status === 401 && (await imp.POST(req("/api/app/reviews/import", "POST", { csv: "a" }))).status === 401)
  }

  realLog("\nThe Reviews tab, counted and filtered on the server")
  const d = seed()
  S.admin = d
  S.caller = { creatorId: CREATOR, userId: SELLER_USER, db: d }
  {
    const a = await json(await list.GET(req("/api/app/reviews")))
    check("every tab counted, the store's own reviews only", JSON.stringify(a.counts) === JSON.stringify({ all: 7, published: 2, pending: 2, hidden: 2, reported: 1, unanswered: 4 }) && a.rows.length === 7 && !a.rows.some((r: any) => r.id === R(8)), a.counts)
    const r1 = a.rows.find((r: any) => r.id === R(1))
    const r4 = a.rows.find((r: any) => r.id === R(4))
    check("customer and product with each review: the order's address for the store's eyes, the product's title", r1.customer?.email === "ana@example.com" && r1.product?.title === "Linen apron" && r1.verified === true)
    check("a live review's photo is its public address; a pending one's is a short signed one (private until shown)", r1.photos[0].url.startsWith("https://cdn.test/review-photos/") && r4.photos[0].url.startsWith("https://cdn.test/signed/"), [r1.photos, r4.photos])
    const pend = await json(await list.GET(req("/api/app/reviews?tab=pending")))
    check("Pending: the verified one waiting on the website and the visitor's", pend.rows.map((r: any) => r.id).sort().join() === [R(2), R(4)].join() && pend.total === 2)
    const hid = await json(await list.GET(req("/api/app/reviews?tab=hidden")))
    check("Hidden: the store's own hides only, a report's apart", hid.rows.map((r: any) => r.id).sort().join() === [R(3), R(5)].join())
    const s1 = await json(await list.GET(req("/api/app/reviews?q=apron")))
    check("search finds the words and the product's title", s1.rows.length === 4 && s1.counts.all === 4, s1.rows.map((r: any) => r.content))
    const imported = await json(await list.GET(req("/api/app/reviews?source=import&rating=4")))
    check("imported, four stars", imported.rows.length === 1 && imported.rows[0].id === R(7))
    const byId = await json(await list.GET(req(`/api/app/reviews?id=${R(3)}`)))
    check("one review by its id (the bell's link)", byId.rows.length === 1 && byId.rows[0].id === R(3))
    const products = await json(await list.GET(req("/api/app/reviews?only=products")))
    check("the product filter's list", products.products.map((p: any) => p.title).sort().join() === "Linen apron,Oak board")
  }

  realLog("\nBulk moderation")
  {
    const r = await bulk.POST(req("/api/app/reviews/bulk", "POST", { action: "hide", ids: [R(1), R(4), R(6), R(8)] }))
    const a = await json(r)
    const row = (id: string) => d.tables.reviews.find((x: any) => x.id === id)
    check("hidden in one go: the verified buyer's on the website only, the visitor's everywhere", r.status === 200 && row(R(1)).status === "published" && row(R(1)).site_status === "hidden" && row(R(4)).status === "hidden" && row(R(4)).hidden_by === "seller", a)
    check("  the reported one left as Storelib put it, another store's not found", a.done.length === 3 && a.skipped.length === 1 && a.skipped[0].id === R(8) && row(R(6)).hidden_by === "report" && row(R(8)).status === "published", a)
    check("  Storelib's ratings still count the verified buyer's review (only verified, published ones count)", d.tables.products.find((p: any) => p.id === P1).reviews_count === 2, d.tables.products)
    const pub = await json(await bulk.POST(req("/api/app/reviews/bulk", "POST", { action: "publish", ids: [R(1), R(4), R(6)] })))
    check("published in one go; the reported one refused with Storelib's reason", pub.done.length === 2 && pub.skipped[0]?.id === R(6) && /report/.test(pub.skipped[0].error) && row(R(1)).site_status === "shown" && row(R(4)).status === "published")
    check("too many or none: 400", (await bulk.POST(req("/api/app/reviews/bulk", "POST", { action: "hide", ids: [] }))).status === 400 && (await bulk.POST(req("/api/app/reviews/bulk", "POST", { action: "delete", ids: [R(1)] }))).status === 400)
    S.user = { id: SELLER_USER }
    const del = await one.DELETE(req(`/api/app/reviews/${R(1)}`, "DELETE"), { params: Promise.resolve({ id: R(1) }) })
    check("a verified buyer's review is never deleted by the store", del.status === 403 && !!row(R(1)))
    const photo = row(R(4)).photos[0].path
    const ph = await one.PATCH(req(`/api/app/reviews/${R(4)}`, "PATCH", { action: "remove_photo", photo }), { params: Promise.resolve({ id: R(4) }) })
    check("one photo hidden on its own", ph.status === 200 && row(R(4)).photos[0].status === "removed" && row(R(4)).status === "published")
  }

  realLog("\nReplies from the list")
  {
    const put = await reply.PUT(req(`/api/reviews/${R(2)}/reply`, "PUT", { text: "Thank you, glad it fits." }), { params: Promise.resolve({ id: R(2) }) })
    const row = d.tables.reviews.find((x: any) => x.id === R(2))
    check("posted, public under the review", put.status === 200 && row.seller_reply === "Thank you, glad it fits." && !!row.seller_reply_at)
    await reply.PUT(req(`/api/reviews/${R(2)}/reply`, "PUT", { text: "Edited reply." }), { params: Promise.resolve({ id: R(2) }) })
    check("  changed", row.seller_reply === "Edited reply.")
    const del = await reply.DELETE(req(`/api/reviews/${R(2)}/reply`, "DELETE"), { params: Promise.resolve({ id: R(2) }) })
    check("  removed", del.status === 200 && row.seller_reply === null)
    S.user = { id: "77777777-7777-4777-8777-777777777777" }
    check("  somebody else: 403", (await reply.PUT(req(`/api/reviews/${R(2)}/reply`, "PUT", { text: "Hi there" }), { params: Promise.resolve({ id: R(2) }) })).status === 403)
  }

  realLog("\nThe overview and the analytics agree with the tabs")
  {
    const tabs = await json(await list.GET(req("/api/app/reviews")))
    const o = await json(await overview.GET())
    check("published, pending, hidden, reported: the same numbers as the tabs", o.summary.published === tabs.counts.published && o.summary.pending === tabs.counts.pending && o.summary.hidden === tabs.counts.hidden && o.summary.reported === tabs.counts.reported && o.summary.total === tabs.counts.all, { o: o.summary, t: tabs.counts })
    const live = d.tables.reviews.filter((r: any) => r.creator_id === CREATOR && r.status === "published" && r.site_status === "shown")
    const avg = Math.round((live.reduce((a: number, r: any) => a + r.rating, 0) / live.length) * 10) / 10
    check("the average is what the website shows", o.summary.average === avg, { got: o.summary.average, avg })
    check("requests sent and how many became a review", o.funnel.sent === 1 && o.funnel.submitted === 1 && o.funnel.responseRate === 100 && o.funnel.opened === 1)
    const an = await json(await analytics.GET(req("/api/app/reviews/analytics?from=2026-09-01&to=2026-10-16")))
    check("analytics for a period holding every review: the same published count and average", an.current.received === 7 && an.current.published === o.summary.published && an.current.average === o.summary.average, an.current)
    check("  the series adds up to what was received; the period before is there to compare", an.series.reduce((a: number, p: any) => a + p.received, 0) === an.current.received && an.previous.received === 0 && an.bucket === "day")
    check("  a start after the end: 400", (await analytics.GET(req("/api/app/reviews/analytics?from=2026-10-10&to=2026-10-01"))).status === 400)
  }

  realLog("\nImport: preview writes nothing, the import writes what it said")
  {
    const before = d.tables.reviews.length
    const csv = "product,rating,body,name\nlinen-apron,5,Soft and strong,Mara Lee\nAPR-1,4,Good,Tom\nnope,3,x,y\nlinen-apron,4,Good,Tom\nLinen apron,5,Soft and strong,Mara Lee\noak-board,5,Sturdy,Kim"
    const p = await json(await imp.POST(req("/api/app/reviews/import", "POST", { csv, preview: true })))
    check("preview: every row's outcome, nothing written", p.counts?.ok === 3 && p.counts?.skipped === 3 && d.tables.reviews.length === before && d.tables.review_imports.length === 0, p.counts)
    const r = await json(await imp.POST(req("/api/app/reviews/import", "POST", { csv, fileName: "judgeme.csv" })))
    const added = d.tables.reviews.filter((x: any) => x.import_id && x.import_id === r.importId)
    check("imported: the rows it said, unverified, imported, published, tied to its import", r.imported === 3 && added.length === 3 && added.every((x: any) => x.verified === false && x.source === "import" && x.status === "published" && x.creator_id === CREATOR), r)
    check("  the skipped rows say why", r.rows.filter((x: any) => !x.ok).map((x: any) => x.why).join() === "no_product,duplicate,duplicate", r.rows)
    check("  never in a Storelib rating", d.tables.products.find((x: any) => x.id === P1).reviews_count === 2)
    check("  the import is listed", d.tables.review_imports.length === 1 && d.tables.review_imports[0].imported === 3 && d.tables.review_imports[0].file_name === "judgeme.csv")
    const again = await json(await imp.POST(req("/api/app/reviews/import", "POST", { csv, preview: true })))
    check("the same file again: every row already on the store is skipped", again.counts.ok === 0 && again.rows.filter((x: any) => x.why === "duplicate").length === 5, again.counts)
    const mapped = await json(await imp.POST(req("/api/app/reviews/import", "POST", { csv: "Item,Score,Words\nOak board,5,Sturdy", mapping: { product: 0, rating: 1, body: 2 }, preview: true })))
    check("the store's own mapping is used for columns with other names", mapped.counts?.ok === 1, mapped)
    const missing = await imp.POST(req("/api/app/reviews/import", "POST", { csv: "Item,Score\nx,5", preview: true }))
    check("a column not picked: 400 naming it", missing.status === 400 && /review text/.test((await json(missing)).error))
    const undo = await imp.DELETE(req(`/api/app/reviews/import?id=${r.importId}`, "DELETE"))
    check("undone: exactly its rows gone, the import marked", undo.status === 200 && (await json(undo)).removed === 3 && d.tables.reviews.length === before && !!d.tables.review_imports[0].undone_at)
    check("  and not twice", (await imp.DELETE(req(`/api/app/reviews/import?id=${r.importId}`, "DELETE"))).status === 409)
  }

  realLog("\nRequests: the list, and asking by hand with every cap kept")
  {
    const l = await json(await requests.GET(req("/api/app/reviews/requests")))
    check("the list, with what happened", l.rows.length === 1 && l.rows[0].shown === "submitted" && l.rows[0].product.title === "Linen apron" && l.tracked === true)
    const orders = await json(await requests.GET(req("/api/app/reviews/requests?orders=1")))
    check("recent orders to ask, with what already happened", orders.orders.length === 2 && orders.orders.find((o: any) => o.id === ORDER).request === "reviewed")
    S.sent = []
    const first = await requests.POST(req("/api/app/reviews/requests", "POST", { orderId: ORDER2 }))
    const row = d.tables.review_requests.find((x: any) => x.order_id === ORDER2)
    check("sent by hand while the automatic emails are off: marked sent and as the store's own", first.status === 200 && row?.status === "sent" && row?.manual === true && S.sent.length === 1, { status: first.status, row, body: await json(first.clone?.() ?? first) })
    const mail = S.sent[0]
    check("  the store's own email: its name on top and as the sender, its stars to the review page", /Drew Studio/.test(mail?.html ?? "") && /\/review\/[^"?]+\?rate=5/.test(mail?.html ?? "") && /^Drew Studio via Storelib$/.test(mail?.fromName ?? "") && mail?.variables?.review_request_id === row?.id, mail?.fromName)
    const again = await requests.POST(req("/api/app/reviews/requests", "POST", { orderId: ORDER2 }))
    check("  asked again the same week: refused, nothing sent", again.status === 409 && (await json(again)).reason === "asked_recently" && S.sent.length === 1)
    const reviewed = await requests.POST(req("/api/app/reviews/requests", "POST", { orderId: ORDER }))
    check("  an order already reviewed: refused", reviewed.status === 409 && (await json(reviewed)).reason === "reviewed")
    check("  an order of another store: refused", (await requests.POST(req("/api/app/reviews/requests", "POST", { orderId: "11111111-1111-4111-8111-999999999999" }))).status === 409)
    d.tables.store_settings[0].reviews.enabled = false
    const off = await requests.POST(req("/api/app/reviews/requests", "POST", { orderId: ORDER2 }))
    check("  the app off: refused", off.status === 409 && (await json(off)).reason === "app_off")
    d.tables.store_settings[0].reviews.enabled = true

    const delivered = { event: "delivered", timestamp: 1760000000, "user-variables": { review_request_id: row.id } }
    await tracking.recordReviewRequestEvent(d, delivered)
    await tracking.recordReviewRequestEvent(d, { event: "opened", timestamp: 1760000100, "user-variables": { review_request_id: row.id } })
    await tracking.recordReviewRequestEvent(d, { event: "opened", timestamp: 1760009999, "user-variables": { review_request_id: row.id } })
    check("the provider's delivered and opened land on the request, the first open kept", !!row.delivered_at && row.opened_at === new Date(1760000100 * 1000).toISOString())
    check("  an event with no request id, or a made up one, is ignored", reviewRequestEvent({ event: "opened", "user-variables": {} }) === null && reviewRequestEvent({ event: "opened", "user-variables": { review_request_id: "x' or 1=1" } }) === null && reviewRequestEvent({ event: "failed", "user-variables": { review_request_id: R(1) } }) === null)
    const opened = await json(await requests.GET(req("/api/app/reviews/requests?filter=opened")))
    check("  and the list says Opened", opened.rows.length === 1 && opened.rows[0].shown === "opened")
  }

  realLog("\nThe request email")
  {
    const saved = await email.PUT(req("/api/app/reviews/request-email", "PUT", { kind: "request", copy: { subject: "Hey {{customer_name}}, how's {{items}}?", heading: "Tell us <b>straight</b>", body: "Two lines.\n\nFrom {{shop_name}}.", button: "Rate it" } }))
    /* The in-memory upsert keeps the row it meets (tests/_fake-db), so what was saved is read off the answer. */
    check("the store's words saved, checked by the customer email rules (tags out)", saved.status === 200 && (await json(saved)).copy?.button === "Rate it" && (await json(await email.PUT(req("/api/app/reviews/request-email", "PUT", { kind: "reminder", copy: { heading: "Tell us <b>now</b>" } })))).copy?.heading === "Tell us now")
    const bad = await email.PUT(req("/api/app/reviews/request-email", "PUT", { kind: "request", copy: { subject: "Hi {{first}}" } }))
    check("  an unknown placeholder refused", bad.status === 400 && /isn't a placeholder/.test((await json(bad)).error))
    const preview = await json(await email.POST(req("/api/app/reviews/request-email", "POST", { kind: "request", copy: { subject: "Hi {{customer_name}}", button: "Rate & go <b>now</b>" } })))
    check("  a preview drawn by the sender itself, the store's words in it, tags out and the rest escaped", /Hi Ana/.test(preview.subject) && /Rate &amp; go now/.test(preview.html) && !/<b>now/.test(preview.html), preview.subject)
    const reset = await email.PUT(req("/api/app/reviews/request-email", "PUT", { kind: "request", copy: null }))
    check("  the standard words back", reset.status === 200 && (await json(reset)).copy === null)
  }
}

/* ── The email itself, in the store's look and language ───────────── */

function emailBuild() {
  realLog("\nThe request email, built")
  const base = { reminder: false, shopName: "Drew Studio", logoUrl: "https://cdn.test/logo.png", accent: "#0a7d55", productTitle: "Linen apron", firstName: "Ana", pageUrl: "https://drew.example/review/tok", unsubscribeUrl: "https://drew.example/api/notify/unsubscribe?t=1", reminderOn: true }
  const m = reviewRequestEmail(base)
  check("in the store's layout: its logo and name on top, its colour on the button", m.html.includes("https://cdn.test/logo.png") && m.html.includes("Drew Studio") && m.html.includes("#0a7d55") && !m.html.includes(">Storelib</td>"))
  check("five stars, each opening the review page with that many chosen", [1, 2, 3, 4, 5].every((n) => m.html.includes(`https://drew.example/review/tok?rate=${n}`)) && m.subject === "How is Linen apron?")
  check("the way out of review emails, in the footer and the text part", m.html.includes("Turn off review emails") && m.text.includes("https://drew.example/api/notify/unsubscribe?t=1"))
  const copy = readCopy("review_request", { subject: "Hi {{customer_name}}, how is {{items}}?", body: "<script>x</script>Thanks from {{shop_name}}", button: "Rate it" })
  const own = reviewRequestEmail({ ...base, copy: copy.ok ? copy.copy : null })
  check("the store's words, placeholders filled, never markup", own.subject === "Hi Ana, how is Linen apron?" && own.html.includes("Thanks from Drew Studio") && !own.html.includes("<script>") && own.html.includes("Rate it"), own.subject)
  const fr = inEmailLanguage("fr", { "How is {product}?": "Comment trouvez-vous {product} ?", "Write a review": "Écrire un avis" }, () => reviewRequestEmail(base))
  check("in the order's language: the standard sentences translated, the page in that language", fr.subject === "Comment trouvez-vous Linen apron ?" && fr.html.includes("Écrire un avis") && /<html lang="fr"/.test(fr.html))
  const rem = reviewRequestEmail({ ...base, reminder: true })
  check("the reminder says it is the last one", rem.text.includes("last email") && rem.subject === "A quick review of Linen apron?")
  const gen = read("lib/markets/checkout-words.generated.ts")
  check("its sentences are listed for Translate with the buyer emails'", gen.includes('"Would you review {product}?"') && gen.includes('"Tap a star to start"'))
}

/* ── Wiring read from the source ───────────────────────────────────── */

function wiring() {
  realLog("\nWiring")
  const page = read("app/app/reviews/page.tsx")
  /* Changed on purpose (round 27, the owner: Products › Reviews is /app/reviews, not the Integrations page): /app/reviews draws the integration's page itself, and the page reads ?review and ?status as it did. */
  check("/app/reviews is Storelib Reviews' page, alone, and still opens the review and the tab a link named", /<IntegrationsDirectory page only="storelib-reviews" \/>/.test(read("app/app/reviews/reviews-client.tsx")) && /<ReviewsClient \/>/.test(page) && !/redirect\(`/.test(page) && /review: p\.get\("review"\)/.test(read("components/reviews/manage/reviews-manage.tsx")) && /\(REVIEW_TABS as readonly string\[\]\)\.includes\(s \?\? ""\)/.test(read("components/reviews/manage/reviews-manage.tsx")))
  const apps = read("components/app/settings/integration-apps.tsx")
  check("the integration page draws Storelib Reviews' own tabs and body through the built in apps' plug-in API", /const reviewsView: IntegrationAppView = reviewsIntegrationView/.test(apps) && /"storelib-reviews": reviewsView/.test(apps) && /dynamic\(\(\) => import\("\.\/reviews-manage"\)/.test(read("components/reviews/manage/integration-view.tsx")))
  const shell = read("components/reviews/manage/reviews-manage.tsx")
  check("one page: Overview, Reviews, Requests, Widgets, Analytics, Settings", /MANAGE_VIEWS = \["overview", "reviews", "requests", "widgets", "analytics", "settings"\]/.test(read("components/reviews/manage/views.ts")) && /<ReviewsWidgetsTab \/>/.test(shell))
  const panel = read("components/app/settings/reviews-app-panel.tsx")
  check("each setting in one place: Settings draws general and display, Requests the schedule; no jump to /app/reviews", /sections=\{\["general", "display"\]\}/.test(read("components/reviews/manage/settings-view.tsx")) && /sections=\{\["requests"\]\}/.test(read("components/reviews/manage/requests-view.tsx")) && !/href="\/app\/reviews"/.test(panel))
  const list = read("components/reviews/manage/reviews-view.tsx")
  check("a change shows at once and is put back when the server says no", /patchRow\(review\.id, predicted\(review, action, photo\)\)/.test(list) && /restore\(\[review\]\)/.test(list))
  check("the trust rules are said where they apply", /never get the Verified purchase label and never count in your Storelib rating/.test(read("components/reviews/manage/import-dialog.tsx")) && /Only verified buyers count toward your Storelib rating/.test(read("components/reviews/manage/overview-view.tsx")))
  const rp = read("app/review/[token]/page.tsx")
  const form = read("app/review/[token]/review-form.tsx")
  /* Changed on purpose (the buyer language rule, lib/markets/buyer-language.ts): the order's checkout language while the store still publishes it, else the store's default, English when bought on Storelib; never the sl_lang cookie. */
  check("the review page in the store's language: the order's, through the checkout's words", /buyerPageLanguage\(ctx\.request\.creator_id, \{ channel, order: origin\?\.lang \}\)/.test(rp) && /const origin = cleanOrigin\(ctx\.order\?\.source_detail\)/.test(rp) && !/sl_lang/.test(rp) && /<CheckoutWords lang=\{language\.lang\} words=\{language\.words\}>/.test(rp) && /const ct = useCt\(\)/.test(form) && !/>Post review</.test(form))
  check("  its sentences listed for Translate", /"app\/review"/.test(read("scripts/i18n/checkout-sentences.mjs")) && read("lib/markets/checkout-words.generated.ts").includes('"Verified purchase"'))
  const sql = read("supabase/sql/run-now/215_reviews_manage.sql")
  check("part 215: one statement a line, safe again, the import table server only, no public policy", sql.split("\n").filter((l) => l.trim()).every((l) => /;\s*$/.test(l) || l.startsWith("/*")) && /REVOKE ALL ON public.review_imports FROM PUBLIC, anon, authenticated/.test(sql) && /ENABLE ROW LEVEL SECURITY/.test(sql) && !/CREATE POLICY/.test(sql) && /IF NOT EXISTS/.test(sql))
  check("  in the README, the check after, migrations and the generated parts", read("supabase/sql/run-now/README.md").includes("`215_reviews_manage.sql`") && /p215_reviews_manage/.test(read("supabase/sql/run-now/99_check_after.sql")) && read("supabase/migrations/20270129_reviews_manage.sql") === sql && /215_reviews_manage\.sql/.test(read("lib/admin/sql-parts.generated.ts")))
  check("the mail webhook writes delivered and opened on the request", /await recordReviewRequestEvent\(supabaseAdmin, eventData\)/.test(read("app/api/webhooks/mailgun/route.ts")))
  const copy = [read("components/reviews/manage/overview-view.tsx"), list, read("components/reviews/manage/requests-view.tsx"), read("components/reviews/manage/analytics-view.tsx"), read("components/reviews/manage/import-dialog.tsx"), form].join("\n")
  check("no em dash, no banned words, no Shopify or Liquid in what a store or a buyer reads", !/—/.test(copy) && !/\b(unlock|elevate|seamless|powerful|effortless(ly)?|supercharge)\b/i.test(copy) && !/tt\("[^"]*(Shopify|Liquid)/.test(copy))
}

async function main() {
  pure()
  emailBuild()
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
