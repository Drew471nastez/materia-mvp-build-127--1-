/**
 * ===========================================================================
 *  /app ANALYTICS, ROUND AD1: THE BUGS FOUND BY READING EVERY PATH
 * ===========================================================================
 * Each block below is one bug, written as the failing check first and kept
 * as the fix's proof. The fixture of each is counted by hand in the block.
 *
 *   npx tsx --conditions=react-server tests/analytics-ad1.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { buildReports, type ViewRow } from "../lib/analytics/reports"
import { compatTrackScript } from "../lib/storelib-theme/compat/track-script"
import { homeFromReports } from "../lib/analytics/home-figures"
import { questionOf, reportKey } from "../lib/analytics/report-cache"
import { commerceKey, commerceQuestionOf } from "../lib/analytics/commerce-cache"
import { channelOf, commerceRowCounts } from "../lib/analytics/commerce"
import { compactMoney } from "../lib/analytics/chart-scale"
import { majorValue } from "../lib/analytics/pixels"
import { purchaseTags } from "../lib/store/tracking"
import { gaItem } from "../lib/store/ga"
import { boundsOf, compareBounds, midnightOf, presetRange } from "../lib/date-range/range"
import type { OrderRow } from "../lib/orders/order-view"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`)
  }
}

const UTC = "UTC"
const DAY = 86_400_000
const MUG = "dddddddd-1111-4000-8000-000000000001"
const EBOOK = "dddddddd-1111-4000-8000-000000000002"
const W = { start: Date.parse("2026-10-01T00:00:00Z"), end: Date.parse("2026-10-08T00:00:00Z") }

function line(o: Partial<OrderRow> & { id: string; product_id: string; amount_cents: number; created_at: string }): OrderRow {
  return { status: "completed", currency: "USD", quantity: 1, ...o }
}

/* ─── 1. Home's revenue line in the store's own decimals ───────────────── */
{
  console.log("\nHome's revenue chart: minor units over the currency's own decimals")
  /* One order of 2,500 yen on 2 October; one of 12.50 dollars; one of 1.250 dinars (three decimals). */
  const reportsFor = (amount: number) =>
    buildReports({ views: [], steps: [], orders: [line({ id: "o1", product_id: EBOOK, amount_cents: amount, created_at: "2026-10-02T10:00:00Z" })], window: W, previous: null, timeZone: UTC, mainDomain: "storelib.com", productTitles: { [EBOOK]: "Ebook" } })
  const yen = homeFromReports(reportsFor(2500), "JPY")
  const dollars = homeFromReports(reportsFor(1250), "USD")
  const dinars = homeFromReports(reportsFor(1250), "KWD")
  const peak = (h: ReturnType<typeof homeFromReports>) => Math.max(...h.series.revenue.map((p) => p.value ?? 0))
  check("a yen store's 2,500 is 2,500 on the chart, not 25", peak(yen) === 2500, peak(yen))
  check("a dollar store's 1250 cents is 12.5", peak(dollars) === 12.5, peak(dollars))
  check("a dinar store's 1250 fils is 1.25", peak(dinars) === 1.25, peak(dinars))
  check("the figure itself stays in minor units (formatted by the page)", yen.periodRevenue === 2500)
}

/* ─── 2. Top products: an order is a payment, not a line ───────────────── */
{
  console.log("\nTop products: two variants of one product in one basket are one order")
  /* Basket cs_1: a red mug (30) and a blue mug (30), one payment. Order o3: a mug alone (30). Order o4: an ebook (10). */
  const orders = [
    line({ id: "o1", product_id: MUG, amount_cents: 3000, created_at: "2026-10-02T10:00:00Z", stripe_session_id: "cs_1", variant_name: "Red" }),
    line({ id: "o2", product_id: MUG, amount_cents: 3000, created_at: "2026-10-02T10:00:05Z", stripe_session_id: "cs_1", variant_name: "Blue" }),
    line({ id: "o3", product_id: MUG, amount_cents: 3000, created_at: "2026-10-03T10:00:00Z" }),
    line({ id: "o4", product_id: EBOOK, amount_cents: 1000, created_at: "2026-10-03T11:00:00Z" }),
  ]
  const r = buildReports({ views: [], steps: [], orders, window: W, previous: null, timeZone: UTC, mainDomain: "storelib.com", productTitles: { [MUG]: "Mug", [EBOOK]: "Ebook" }, productTypes: { [MUG]: "physical", [EBOOK]: "digital" } })
  const mug = r.topProducts.find((p) => p.key === MUG)
  const ebook = r.topProducts.find((p) => p.key === EBOOK)
  check("Orders is 3 payments", r.orders.value === 3, r.orders.value)
  check("the mug was in 2 orders, not 3", mug?.orders === 2, mug?.orders)
  check("its sales are both lines' money, 90", mug?.salesCents === 9000, mug?.salesCents)
  check("the ebook in 1", ebook?.orders === 1, ebook?.orders)
  check("the products' orders never add up to more than one per line of a different product", (mug?.orders ?? 0) + (ebook?.orders ?? 0) === 3)
  const physical = r.kinds.find((k) => k.key === "physical")
  check("the kinds card agrees: physical in 2 orders, 3 units", physical?.orders === 2 && physical?.units === 3, physical)
}

/* ─── 3. The kept answer of one period is not another's ────────────────── */
{
  console.log("\nKept answers: a finished period keeps its end in the question")
  const tz = "Europe/Bucharest"
  const now = Date.parse("2026-10-24T13:00:00Z")
  const week = boundsOf({ start: "2026-10-01", end: "2026-10-07" }, tz, now)
  const fortnight = boundsOf({ start: "2026-10-01", end: "2026-10-14" }, tz, now)
  const ask = (s: { start: number; end: number }, compare: { start: number; end: number } | null = null) =>
    reportKey({ start: s.start, end: s.end, compare, product: "all", property: "all", timeZone: tz })
  check("1 to 7 October and 1 to 14 October are two questions", questionOf(ask(week)) !== questionOf(ask(fortnight)), [questionOf(ask(week)), questionOf(ask(fortnight))])
  /* A period running to now: its end moves every ten seconds, and is still the same question. */
  const today = presetRange("last_7_days", "2026-10-24")
  const a = boundsOf(today, tz, Date.parse("2026-10-24T13:00:10Z"))
  const b = boundsOf(today, tz, Date.parse("2026-10-24T13:05:20Z"))
  const ca = compareBounds({ ...today }, { mode: "previous_period" }, tz, Date.parse("2026-10-24T13:00:10Z"))
  const cb = compareBounds({ ...today }, { mode: "previous_period" }, tz, Date.parse("2026-10-24T13:05:20Z"))
  check("the last 7 days at 15:00 and at 15:05 are one question", questionOf(ask(a, ca)) === questionOf(ask(b, cb)), [questionOf(ask(a, ca)), questionOf(ask(b, cb))])
  check("its end is left out, its start kept", !/(^|&)end=/.test(questionOf(ask(a, ca))) && /(^|&)start=/.test(questionOf(ask(a, ca))))
  check("a finished week's end is kept", /(^|&)end=/.test(questionOf(ask(week))))
  /* Compared with two different finished stretches that start on the same day. */
  const c1 = { start: midnightOf("2026-09-01", tz), end: midnightOf("2026-09-08", tz) }
  const c2 = { start: midnightOf("2026-09-01", tz), end: midnightOf("2026-09-15", tz) }
  check("two comparisons from the same day are two questions", questionOf(ask(week, c1)) !== questionOf(ask(week, c2)))

  const sales = (s: { start: number; end: number }, compare: { start: number; end: number } | null = null) => commerceKey({ start: s.start, end: s.end, compare, product: "all", property: "all", timeZone: tz })
  check("the sales cards: 1 to 7 and 1 to 14 October are two questions", commerceQuestionOf(sales(week)) !== commerceQuestionOf(sales(fortnight)))
  check("the sales cards: a running period is one question as it runs", commerceQuestionOf(sales(a, ca)) === commerceQuestionOf(sales(b, cb)))
  check("UTC: a whole day keeps its end", /(^|&)end=/.test(questionOf(reportKey({ start: Date.parse("2026-10-01T00:00:00Z"), end: Date.parse("2026-10-02T00:00:00Z"), compare: null, product: "all", property: "all", timeZone: UTC }))))
  void DAY
}

/* ─── 4. Where an order was placed, from the jsonb the column holds ────── */
{
  console.log("\nThe sales reports read orders.source_detail as the jsonb it is")
  /* orders.source_detail is jsonb (lib/orders/order-source tagOrderSource writes an object); decodeOrigin only read Stripe's short string. */
  const onOnePage = { id: "x1", created_at: "2026-10-02T10:00:00Z", product_id: EBOOK, source: "storelib", source_detail: { surface: "onepage" } as unknown as string }
  check("an order tagged on the OnePage counts under the OnePage", commerceRowCounts(onOnePage, { productId: null, property: { type: "onepage" }, defaultWebsite: null }))
  check("and not under the creator page", !commerceRowCounts(onOnePage, { productId: null, property: { type: "creator_page" }, defaultWebsite: null }))
  check("its channel is the OnePage", channelOf(onOnePage) === "onepage", channelOf(onOnePage))
  check("a checkout link's order is Checkout links", channelOf({ ...onOnePage, source_detail: { surface: "link" } as unknown as string }) === "link")
  check("Stripe's short form still reads", channelOf({ ...onOnePage, source_detail: "s=onepage" }) === "onepage")
}

/* ─── 5. Money on the chart's axis, in the currency's decimals ─────────── */
{
  console.log("\nThe Analytics chart's money axis")
  check("2,500 yen is written as 2.5k yen, not 25", /2\.5k/.test(compactMoney(2500, 500, "JPY")) && !/(^|[^.\d])25($|[^\d.k])/.test(compactMoney(2500, 500, "JPY")), compactMoney(2500, 500, "JPY"))
  check("900 yen is 900", /900/.test(compactMoney(900, 100, "JPY")), compactMoney(900, 100, "JPY"))
  check("dollars are as they were", compactMoney(300000) === "$3k" && compactMoney(95000) === "$950" && compactMoney(250, 50) === "$2.50")
}

/* ─── 6. The store's Google Analytics and pixels are told the real value ── */
{
  console.log("\nThe value told to the store's own Google Analytics and pixels")
  check("2500 yen is 2500", majorValue(2500, "JPY") === 2500)
  check("1250 cents is 12.5", majorValue(1250, "usd") === 12.5)
  check("1250 fils is 1.25", majorValue(1250, "KWD") === 1.25)
  const yen = purchaseTags({ ga4: "G-ABCDEF1234", meta_pixel: "123456789012345" }, { id: "order-1", valueCents: 2500, currency: "JPY", quantity: 1 })
  const js = yen.map((t) => t.inline).join("")
  check("a yen purchase reaches GA4 as 2500", /gtag\('event','purchase',\{transaction_id:"order-1",value:2500,currency:"JPY"/.test(js), js.slice(0, 300))
  check("and Meta as 2500", /fbq\('track','Purchase',\{value:2500,currency:"JPY"\}/.test(js))
  const usd = purchaseTags({ ga4: "G-ABCDEF1234" }, { id: "order-2", valueCents: 1250, currency: "USD", quantity: 1 }).map((t) => t.inline).join("")
  check("a dollar purchase is 12.5 as before", /value:12\.5,currency:"USD"/.test(usd))
  check("a yen product's price is 2500", gaItem({ id: MUG, priceCents: 2500, currency: "JPY" })?.price === 2500)
  check("a product with no currency named is read as cents, as before", gaItem({ id: MUG, priceCents: 1250 })?.price === 12.5)
}

/* ─── 7. The creator opening their own connected domain from the app ───── */
async function handoff() {
  console.log("\nThe app's hand-off rides in the fragment, and the page takes it off")
  /* The app's half: a token from the token route, then the address to open. */
  const realFetch = globalThis.fetch
  const g = globalThis as unknown as { window?: unknown; fetch: typeof fetch }
  g.window = globalThis
  g.fetch = (async () => new Response(JSON.stringify({ token: "tok.en", sitesMarked: true, sitesDomain: "storelib.com" }), { status: 200 })) as typeof fetch
  const site = await import("../lib/analytics/own-site")
  site.forgetOwnMarker()
  check("before the token, the address is the plain one", site.ownOpen("https://ana-shop.example/about") === "https://ana-shop.example/about")
  site.primeOwnMarker()
  await new Promise((r) => setTimeout(r, 20))
  check("a connected domain opens with the hand-off in its fragment", site.ownOpen("https://ana-shop.example/about") === "https://ana-shop.example/about#sl_own=tok.en", site.ownOpen("https://ana-shop.example/about"))
  check("  never through the marker route", !site.ownOpen("https://ana-shop.example/").includes("/api/analytics/own"))
  check("a site under storelib.com, already marked by the token route, opens plain", site.ownOpen("https://ana.storelib.com/") === "https://ana.storelib.com/")
  check("an address with a fragment of its own is left as it is", site.ownOpen("https://ana-shop.example/#faq") === "https://ana-shop.example/#faq")
  check("nothing but https", site.ownOpen("http://ana-shop.example/") === "http://ana-shop.example/")
  site.forgetOwnMarker()
  g.fetch = realFetch
  delete g.window

  /* The page's half: off the address at once, kept for the tab, sent with the view. */
  const { takeOwnHandoff } = await import("../lib/analytics/page-tracker")
  const store = new Map<string, string>()
  let replaced: string | null = null
  const fake = (hash: string) =>
    ({
      location: { hash, pathname: "/about", search: "?ref=x" },
      history: { state: { k: 1 }, replaceState: (_s: unknown, _t: string, url: string) => { replaced = url } },
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    }) as unknown as Window & typeof globalThis
  const got = takeOwnHandoff(fake("#sl_own=tok.en"))
  check("the tracker reads the token", got === "tok.en", got)
  check("  and takes it off the address, keeping the path and the query", replaced === "/about?ref=x", replaced)
  replaced = null
  const kept = takeOwnHandoff(fake("#faq&sl_own=tok.en"))
  check("  a fragment of the page's own stays", kept === "tok.en" && replaced === "/about?ref=x#faq", replaced)
  replaced = null
  check("  the next page of the tab still has it, with nothing to take off", takeOwnHandoff(fake("")) === "tok.en" && replaced === null)
  const trackView = readFileSync(join(process.cwd(), "components/analytics/track-view.tsx"), "utf8")
  check("  the view carries it to the server", /const own = takeOwnHandoff\(window\)/.test(trackView) && /own: own \|\| undefined/.test(trackView))
  const compat = compatTrackScript({ creatorId: MUG, mainDomain: "storelib.com" })
  const body = compat.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
  let parses = true
  try {
    new Function(body)
  } catch {
    parses = false
  }
  check("an imported theme's tracker still parses", parses)
  check("an imported theme's tracker takes it off and sends it too", /sl_own=\[\^&\]\*/.test(compat) && /own:OW\|\|undefined/.test(compat) && /sessionStorage\.setItem\('sl_own_t',ot\)/.test(compat))

  /* The server's half: the answer sets the marker on this host. */
  const { trackResponse } = await import("../lib/analytics/collect-route")
  const res = trackResponse({ recorded: false, reason: "own", ownMarker: "mark.value" })
  const set = res.headers.get("set-cookie") || ""
  check("the 204 marks this browser: sl_own, host-only, HttpOnly, half a year", /sl_own=mark\.value/.test(set) && /HttpOnly/i.test(set) && /Max-Age=15552000/i.test(set) && !/Domain=/i.test(set), set)
  check("  and a plain view sets no marker", !/sl_own=/.test(trackResponse({ recorded: true, reason: "recorded" }).headers.get("set-cookie") || ""))
}

/* ─── 8. The store's own team is not its traffic ───────────────────────── */
async function team() {
  console.log("\nA signed in member of the store's team is not a visitor")
  const { isTeamMember } = await import("../lib/analytics/own-visit")
  const { FakeSupabase } = await import("./fake-supabase")
  const STORE = "dddddddd-0000-4000-8000-000000000001"
  const OTHER = "dddddddd-0000-4000-8000-000000000002"
  const db = new FakeSupabase()
  db.table("store_team_members", {}, [
    { id: "m1", creator_id: STORE, user_id: "u-manager", status: "active", role: "manager" },
    { id: "m2", creator_id: STORE, user_id: "u-invited", status: "invited", role: "staff" },
  ])
  check("an active manager of the store is the store's own", await isTeamMember(db, "u-manager", STORE))
  check("  an invitation not yet taken is not", !(await isTeamMember(db, "u-invited", STORE)))
  check("  a member of another store is a visitor here", !(await isTeamMember(db, "u-manager", OTHER)))
  check("  a database without the team table answers no", !(await isTeamMember(new FakeSupabase(), "u-manager", STORE)))

  /* The pipeline asks with the store, not only its owner. */
  const { collect } = await import("../lib/analytics/collect")
  const { marksOwner } = await import("../lib/analytics/own-marker")
  const world = new FakeSupabase()
  world.clock = Date.parse("2026-10-24T10:00:00Z")
  world.table("creators", {}, [{ id: STORE, user_id: "u-owner", slug: "mara" }])
  let asked: unknown[] = []
  const out = await collect(
    { kind: "view", body: { creatorId: STORE, href: "https://storelib.com/mara" }, headers: new Headers({ host: "storelib.com", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", "x-forwarded-for": "203.0.113.9", "sec-fetch-site": "same-origin" }), cookie: () => undefined, cookieNames: ["sb-x-auth-token"] },
    { db: world as never, now: () => world.clock, mainDomain: "storelib.com", marksOwner, limited: async () => false, isOwnVisit: async (...args) => { asked = args; return args[2] === STORE } },
  )
  check("collect hands the store to the own-visit check", asked[2] === STORE, asked)
  check("  and a team member's view is not recorded", !out.recorded && out.reason === "own", out.reason)
}

const _unused: ViewRow[] = []
void _unused

void (async () => {
  try {
    await handoff()
    await team()
  } catch (error) {
    check("the hand-off checks ran", false, (error as Error).message)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
})()
