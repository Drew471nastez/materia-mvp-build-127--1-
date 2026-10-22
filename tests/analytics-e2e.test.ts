/**
 * ===========================================================================
 *  FROM A VISITOR'S BROWSER TO THE SELLER'S REPORT, END TO END
 * ===========================================================================
 * "Tracking accurate and complete ... Verify end to end with a test that
 * drives the beacon/API into the DB fakes and reads back the reports."
 *
 * One seller, Ana, with a creator page, a OnePage, a published website (and
 * a draft one), a digital and a physical product. Visitors, on one day in
 * Bucharest:
 *
 *   the website, Storelib's own theme, three pages by Next route changes,
 *   through the real browser half (lib/analytics/page-tracker) and the real
 *   server half (lib/analytics/collect) into tests/fake-supabase
 *
 *   an imported theme's page, by the real inline script
 *   (lib/storelib-theme/compat/track-script) run in a sandbox, including a
 *   page the theme moves to with history.pushState
 *
 *   the creator page and a product page opened from Storelib Explore,
 *   a OnePage view and a link tapped on it, Buy and the checkout opened,
 *   two paid orders, a refresh, a robot, a prefetch and a preview
 *
 * Then the question the Analytics page asks, through the very code the
 * route runs (lib/analytics/report-answer: reportQuestion, then
 * countReportAnswer), for every place together and each alone, for one
 * product, for a period on either side of the seller's midnight, and with
 * and without a comparison. Every number is checked against what was done.
 */
import { runInNewContext } from "node:vm"
import { FakeSupabase, type Row } from "./fake-supabase"
import { collect, type CollectDeps, type CollectKind, type CollectOutcome } from "../lib/analytics/collect"
import { marksOwner } from "../lib/analytics/own-marker"
import { clearPropertyCache } from "../lib/analytics/property"
import { forgetSent, schedulePageView } from "../lib/analytics/page-tracker"
import { ALLOWED_EVENT_TYPES, EXPLORE_MARK_KEY, EXPLORE_SOURCE, cameFromExplore } from "../lib/analytics/events"
import { everything, serialize } from "../lib/consent/consent"
import { countReportAnswer, reportQuestion } from "../lib/analytics/report-answer"
import type { Reports } from "../lib/analytics/reports"
import { breakdownOf, commerceRowCounts, type CommerceOrderRow } from "../lib/analytics/commerce"
import { compatTrackScript } from "../lib/storelib-theme/compat/track-script"
import { boundsOf, compareBounds, resolveValue, todayIn } from "../lib/date-range/range"
import { parseProperty } from "../lib/analytics/properties"

process.env.ANALYTICS_OWN_SECRET = process.env.ANALYTICS_OWN_SECRET || "storelib-tests-own-marker-key"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const ANA_USER = "aaaaaaaa-0000-4000-8000-0000000000a1"
const SITE = "aaaaaaaa-5555-4000-8000-000000000001"
const DRAFT = "aaaaaaaa-5555-4000-8000-000000000002"
const ONEPAGE = "aaaaaaaa-7777-4000-8000-000000000001"
const EBOOK = "aaaaaaaa-1111-4000-8000-000000000001"
const PRINT = "aaaaaaaa-1111-4000-8000-000000000002"
const TZ = "Europe/Bucharest"
/* 21 October 2026, 15:00 in Bucharest (UTC+3). */
const NOW = Date.parse("2026-10-21T12:00:00Z")
const MIN = 60_000
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
const consent = { storelib_consent: serialize(everything(true, NOW)) }

function world(): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = NOW
  const uuid = () => crypto.randomUUID()
  db.table("profiles", {}, [{ id: ANA_USER, username: "ana" }])
  db.table("products", {}, [
    { id: EBOOK, creator_id: ANA, title: "Ebook", type: "digital" },
    { id: PRINT, creator_id: ANA, title: "Print", type: "physical" },
  ])
  db.table("creators", { embeds: { products: (r, d) => d.rows("products").filter((p) => p.creator_id === r.id).map((p) => ({ id: p.id, title: p.title, type: p.type })) } }, [{ id: ANA, user_id: ANA_USER, slug: "ana", username: "ana" }])
  db.table("store_theme_installs", {}, [
    { id: DRAFT, creator_id: ANA, status: "draft", sort_order: 0, name: "Draft" },
    { id: SITE, creator_id: ANA, status: "published", sort_order: 1, name: "Studio", published_at: "2026-09-01T00:00:00Z" },
  ])
  db.table("onepages", {}, [{ id: ONEPAGE, seller_id: ANA, owner_id: ANA_USER, slug: "ana", published_blocks: [{ id: "b1", type: "link", title: "My shop" }] }])
  db.table("custom_domains", {}, [])
  db.table("onepage_views", {}, [])
  db.table("onepage_clicks", {}, [])
  db.table("subscribers", {}, [])
  db.table("download_events", {}, [])
  db.table("store_settings", {}, [{ creator_id: ANA, currency: "RON" }])
  db.table("orders", { defaults: () => ({ id: uuid() }) })
  db.table("analytics_events", {
    defaults: (d) => ({ id: uuid(), created_at: d.now() }),
    checks: [
      (r) => ((ALLOWED_EVENT_TYPES as readonly string[]).includes(r.event_type) ? null : "analytics_events_event_type_check"),
      (r) => (r.property_type == null || ["creator_page", "onepage", "website"].includes(r.property_type) ? null : "analytics_events_property_type_check"),
    ],
  })
  return db
}

function deps(db: FakeSupabase): CollectDeps {
  return { db, now: () => db.clock, mainDomain: "storelib.com", isOwnVisit: async () => false, marksOwner, limited: async () => false }
}

async function ask(db: FakeSupabase, body: Record<string, unknown>, opts: { kind?: CollectKind; ua?: string; ip?: string; headers?: Record<string, string> } = {}): Promise<CollectOutcome> {
  const headers = new Headers({
    host: new URL(String(body.href)).host,
    "user-agent": opts.ua ?? IPHONE,
    "x-forwarded-for": opts.ip ?? "203.0.113.7",
    "sec-fetch-site": "same-origin",
    "x-vercel-ip-country": "RO",
    ...(opts.headers ?? {}),
  })
  return collect({ kind: opts.kind ?? "view", body, headers, cookie: (n) => (consent as Record<string, string>)[n], cookieNames: Object.keys(consent) }, deps(db))
}

/* ─── A browser tab the page tracker runs in (as tests/analytics-collection.test.ts) ─── */

function tab(href: string) {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const docListeners = new Map<string, Set<(e: unknown) => void>>()
  const on = (m: typeof listeners) => (t: string, f: (e: unknown) => void) => { if (!m.has(t)) m.set(t, new Set()); m.get(t)!.add(f) }
  const off = (m: typeof listeners) => (t: string, f: (e: unknown) => void) => m.get(t)?.delete(f)
  const idle: Array<() => void> = []
  const sent: Array<{ path: string; body: Record<string, unknown> }> = []
  const store = new Map<string, string>()
  const doc = { prerendering: false, visibilityState: "visible", readyState: "complete", addEventListener: on(docListeners), removeEventListener: off(docListeners) }
  const win: Record<string, unknown> = {
    location: { href },
    document: doc,
    navigator: { webdriver: false, sendBeacon: () => false },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    requestIdleCallback: (cb: () => void) => { idle.push(cb); return idle.length },
    cancelIdleCallback: () => {},
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    fetch: async (path: string, init: { body: string }) => { sent.push({ path, body: JSON.parse(init.body) }); return { ok: true } },
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
  }
  win.self = win
  win.top = win
  return {
    win: win as unknown as Window & typeof globalThis,
    sent,
    store,
    idle: () => { const run = idle.splice(0); for (const f of run) f() },
    go: (to: string) => { (win.location as { href: string }).href = to },
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

/* ─── An imported theme's page, its inline tracker run in a sandbox ─── */

function themePage(href: string, productId: string | null) {
  const url = new URL(href)
  const sent: Array<{ path: string; body: Record<string, unknown> }> = []
  const idle: Array<() => void> = []
  const listeners = new Map<string, Array<(e: unknown) => void>>()
  const store = new Map<string, string>()
  const location = { href: url.href, host: url.host, hostname: url.hostname, pathname: url.pathname, search: url.search }
  const setUrl = (to: string) => { const u = new URL(to, location.href); Object.assign(location, { href: u.href, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search }) }
  const history = { pushState: (_s: unknown, _t: string, to: string) => setUrl(to), replaceState: (_s: unknown, _t: string, to: string) => setUrl(to) }
  /* A cookie jar, as a browser's document.cookie is: each write sets one cookie, a read lists them all. */
  const jar = new Map<string, string>([["storelib_consent", encodeURIComponent(consent.storelib_consent)], ["sl_asid", "s_theme"], ["materia_visitor", "v_theme"]])
  const document = {
    get cookie() { return [...jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    set cookie(line: string) { const [pair] = line.split(";"); const i = pair.indexOf("="); jar.set(pair.slice(0, i).trim(), pair.slice(i + 1)) },
    referrer: "https://www.google.com/", title: "Ana's shop", readyState: "complete", visibilityState: "visible", prerendering: false, addEventListener: () => {},
  }
  const win: Record<string, unknown> = {
    location, history, document,
    navigator: { webdriver: false, language: "ro-RO", sendBeacon: () => false },
    screen: { width: 390, height: 844 },
    innerWidth: 390,
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    requestIdleCallback: (cb: () => void) => { idle.push(cb); return idle.length },
    setTimeout: (f: () => void) => { idle.push(f); return idle.length },
    clearTimeout: () => {},
    addEventListener: (t: string, f: (e: unknown) => void) => { listeners.set(t, [...(listeners.get(t) ?? []), f]) },
    fetch: (path: string, init: { body: string }) => { sent.push({ path, body: JSON.parse(init.body) }); return Promise.resolve({ ok: true }) },
    URLSearchParams, URL, JSON, Date, Math, Blob, String, Number, Object, Array, RegExp, encodeURIComponent, decodeURIComponent,
  }
  win.window = win
  win.self = win
  win.top = win
  const script = compatTrackScript({ creatorId: ANA, productId, mainDomain: "storelib.com" }).replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "")
  runInNewContext(script, win)
  return { sent, idle: () => { const run = idle.splice(0); for (const f of run) f() }, history: win.history as typeof history, title: (t: string) => { document.title = t } }
}

/* ─── The question the page asks, answered as the route answers it ─── */

async function report(db: FakeSupabase, q: { period: { start: number; end: number }; compare: { start: number; end: number } | null; property?: string; product?: string; tz?: string }): Promise<Reports> {
  clearPropertyCache()
  const p = new URLSearchParams({ start: new Date(q.period.start).toISOString(), end: new Date(q.period.end).toISOString(), tz: q.tz ?? TZ, product: q.product ?? "all", property: q.property ?? "all" })
  if (q.compare) {
    p.set("cstart", new Date(q.compare.start).toISOString())
    p.set("cend", new Date(q.compare.end).toISOString())
  } else p.set("compare", "none")
  const asked = await reportQuestion(db as never, ANA_USER, new URL(`https://storelib.com/api/analytics/reports?${p}`), "storelib.com")
  if ("error" in asked) throw new Error(asked.error)
  const answer = await countReportAnswer(db as never, asked.q, asked.productTitles, asked.productTypes, ANA_USER)
  return answer.reports as Reports
}

const sourceOf = (r: Reports, key: string) => r.breakdowns.source.find((b) => b.key === key)?.value ?? 0
const step = (r: Reports, key: string) => r.funnel.find((s) => s.key === key)?.value ?? -1

async function main() {
  const db = world()
  forgetSent()
  clearPropertyCache()

  console.log("\nThe website, Storelib's theme: a full load and two Next route changes")
  {
    const t = tab("https://ana.storelib.com/")
    const payload = (productId?: string) => () => ({ creatorId: ANA, productId, sessionId: "s_web", visitorId: "v_web", referrerDomain: "l.instagram.com", referrer: "https://l.instagram.com/", pageUrl: "https://ana.storelib.com/", deviceType: "mobile", pageTitle: "Studio" })
    /* components/analytics/track-view: one effect per path; a route change cleans up the last and schedules the next. */
    let stop = schedulePageView(t.win, { creatorId: ANA, payload: payload() })
    t.idle()
    for (const [href, product] of [["https://ana.storelib.com/about", undefined], ["https://ana.storelib.com/products/print", PRINT]] as Array<[string, string | undefined]>) {
      stop()
      t.go(href)
      stop = schedulePageView(t.win, { creatorId: ANA, payload: payload(product) })
      t.idle()
    }
    stop()
    await settle()
    check("the tracker sends one view per page, three in all", t.sent.length === 3 && t.sent.every((s) => s.path === "/api/track-view"), t.sent.map((s) => s.body.href))
    for (const s of t.sent) {
      const out = await ask(db, s.body)
      check(`  ${new URL(String(s.body.href)).pathname} is recorded on the published website`, out.recorded && out.row?.property_type === "website" && out.row?.property_id === SITE, out.reason)
      db.clock += 2 * MIN
    }
    /* Buy on the product page, then the checkout on storelib.com, placed by the visit's last view. */
    const buy = await ask(db, { creatorId: ANA, productId: PRINT, href: "https://ana.storelib.com/products/print", sessionId: "s_web", visitorId: "v_web" }, { kind: "buy_click" })
    db.clock += MIN
    const checkout = await ask(db, { creatorId: ANA, productId: PRINT, href: "https://storelib.com/checkout?productId=" + PRINT, sessionId: "s_web", visitorId: "v_web" }, { kind: "checkout_start" })
    check("Buy and the checkout opening are recorded, on the website", buy.recorded && checkout.recorded && checkout.row?.property_type === "website", [buy.reason, checkout.reason, checkout.row?.property_type])
    /* The purchase: the order the checkout writes. */
    db.rows("orders").push({ id: "o-print", creator_id: ANA, product_id: PRINT, amount_cents: 12000, status: "completed", created_at: new Date(db.clock + 5 * MIN).toISOString(), source: "website", property_type: "website", property_id: SITE, buyer_email: "web@x.test", currency: "RON", stripe_session_id: "cs_1", buyer_country_code: "RO" })
    db.clock += 10 * MIN
  }

  console.log("\nAn imported theme: its inline tracker, a full load and a pushState page")
  {
    const page = themePage("https://ana.storelib.com/collections/all", null)
    page.idle()
    check("the theme's page view is sent", page.sent.length === 1 && page.sent[0].path === "/api/track-view", page.sent.map((s) => s.path))
    page.history.pushState(null, "", "/pages/faq?ref=menu")
    page.title("FAQ")
    page.idle()
    check("a page the theme moves to with pushState is a view of its own", page.sent.length === 2 && String(page.sent[1].body.href).endsWith("/pages/faq?ref=menu"), page.sent.map((s) => s.body.href))
    page.history.replaceState(null, "", "/pages/faq?variant=2")
    page.idle()
    check("  a change of query alone is the same page", page.sent.length === 2, page.sent.length)
    for (const s of page.sent) {
      const out = await ask(db, s.body, { ua: IPHONE, ip: "198.51.100.20" })
      check(`  ${new URL(String(s.body.href)).pathname} is recorded on the website`, out.recorded && out.row?.property_type === "website" && out.row?.path === new URL(String(s.body.href)).pathname, out.reason)
      db.clock += MIN
    }
  }

  console.log("\nThe creator page and a product, opened from Storelib Explore")
  {
    const t = tab("https://storelib.com/ana")
    /* Explore's layout leaves its mark in the tab (components/analytics/explore-mark). */
    t.store.set(EXPLORE_MARK_KEY, String(Date.now()))
    check("the tab knows it came from Explore", cameFromExplore(t.win.sessionStorage))
    for (const [href, product] of [["https://storelib.com/ana", undefined], ["https://storelib.com/ana/ebook", EBOOK]] as Array<[string, string | undefined]>) {
      const out = await ask(db, { creatorId: ANA, productId: product, href, sessionId: "s_exp", visitorId: "v_exp", referrerDomain: "www.google.com", pageUrl: "https://storelib.com/explore", via: cameFromExplore(t.win.sessionStorage) ? "explore" : undefined }, { ua: MAC, ip: "198.51.100.30" })
      check(`  ${new URL(href).pathname}: recorded on the creator page, from Storelib Explore`, out.recorded && out.row?.property_type === "creator_page" && out.row?.source_category === EXPLORE_SOURCE, [out.reason, out.row?.source_category])
      db.clock += MIN
    }
    const tagged = await ask(db, { creatorId: ANA, href: "https://storelib.com/ana?utm_source=newsletter", sessionId: "s_tag", visitorId: "v_tag", utm_source: "newsletter", utm_medium: "email", via: "explore" }, { ip: "198.51.100.31" })
    check("  a tagged link names its own source, Explore or not", tagged.recorded && tagged.row?.source_category === "email", tagged.row?.source_category)
    db.rows("orders").push({ id: "o-ebook", creator_id: ANA, product_id: EBOOK, amount_cents: 4900, status: "completed", created_at: new Date(db.clock + MIN).toISOString(), source: "storelib", property_type: "creator_page", property_id: null, buyer_email: "exp@x.test", currency: "RON", stripe_session_id: "cs_2", buyer_country_code: "DE" })
    db.clock += 5 * MIN
  }

  console.log("\nThe OnePage: a view and a link tapped")
  {
    const view = await ask(db, { creatorId: ANA, href: "https://storelib.com/ana/links", sessionId: "s_op", visitorId: "v_op", referrerDomain: "l.instagram.com" }, { ip: "198.51.100.40" })
    const tap = await ask(db, { creatorId: ANA, href: "https://storelib.com/ana/links", sessionId: "s_op", visitorId: "v_op", linkId: "b1" }, { kind: "link_click", ip: "198.51.100.40" })
    check("the view is the OnePage's, the tap its link's", view.recorded && view.row?.property_type === "onepage" && view.row?.property_id === ONEPAGE && tap.recorded && tap.row?.link_id === "b1", [view.reason, tap.reason])
    db.clock += 5 * MIN
  }

  console.log("\nWhat is not counted")
  {
    const before = db.rows("analytics_events").length
    const refresh = await ask(db, { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "s_web", visitorId: "v_web" })
    const robot = await ask(db, { creatorId: ANA, href: "https://storelib.com/ana", sessionId: "s_bot", visitorId: "v_bot" }, { ua: GOOGLEBOT, ip: "66.249.66.1" })
    const prefetch = await ask(db, { creatorId: ANA, href: "https://storelib.com/ana", sessionId: "s_pf", visitorId: "v_pf" }, { headers: { "sec-purpose": "prefetch" }, ip: "198.51.100.50" })
    const preview = await ask(db, { creatorId: ANA, href: "https://ana.storelib.com/?preview=1", sessionId: "s_pv", visitorId: "v_pv" }, { ip: "198.51.100.51" })
    check("a refresh of a page seen in the last half hour", !refresh.recorded && refresh.reason === "duplicate", refresh.reason)
    check("a robot", !robot.recorded && robot.reason === "bot", robot.reason)
    check("a prefetch", !prefetch.recorded && prefetch.reason === "prefetch", prefetch.reason)
    check("a builder preview", !preview.recorded && preview.reason === "no_property", preview.reason)
    check("  and none of them wrote a row", db.rows("analytics_events").length === before, db.rows("analytics_events").length - before)
  }

  /* Yesterday afternoon in Bucharest: one creator page visit, for the comparison. And one at 01:30 today, which is yesterday in UTC. */
  {
    const keep = db.clock
    db.clock = Date.parse("2026-10-20T09:00:00Z")
    await ask(db, { creatorId: ANA, href: "https://storelib.com/ana", sessionId: "s_y", visitorId: "v_y" }, { ip: "198.51.100.60" })
    db.clock = Date.parse("2026-10-20T22:30:00Z")
    await ask(db, { creatorId: ANA, href: "https://storelib.com/ana", sessionId: "s_night", visitorId: "v_night" }, { ip: "198.51.100.61" })
    db.clock = keep
  }

  console.log("\nThe report: today in Bucharest, against yesterday until the same hour")
  const today = resolveValue({ preset: "today" }, todayIn(TZ, NOW), "today")
  const span = boundsOf(today, TZ, db.clock + MIN)
  const against = compareBounds(today, { mode: "previous_period" }, TZ, db.clock + MIN)
  const all = await report(db, { period: span, compare: against })
  /* Visitors: v_web, v_theme, v_exp, v_tag, v_op, v_night (01:30 today in Bucharest). */
  check("visitors: everyone who opened a page today, robots and repeats left out", all.visitors.value === 6, all.visitors.value)
  check("page views: 3 website + 2 theme + 2 creator page + 1 tagged + 1 OnePage + 1 at 01:30", all.views.value === 10, all.views.value)
  check("yesterday until the same hour: the one afternoon visit", all.visitors.previous === 1 && all.compared, [all.visitors.previous, all.compared])
  check("Top pages lists the website's pages by path, the theme's pushState page among them", ["/", "/about", "/products/print", "/collections/all", "/pages/faq"].every((p) => all.topPages.some((r) => r.label.endsWith(p))), all.topPages.map((r) => r.label))
  check("Traffic sources: Storelib Explore is a source of its own", sourceOf(all, "explore") === 1, all.breakdowns.source.map((b) => `${b.key}:${b.value}`))
  check("orders and revenue are the two paid orders, as the Orders page counts them", all.orders.value === 2 && all.sales.value === 16900, [all.orders.value, all.sales.value])
  check("the funnel: visitors, product viewers, Buy, checkout, orders", step(all, "visitors") === 6 && step(all, "product") === 2 && step(all, "cart") === 1 && step(all, "checkout") === 1 && step(all, "orders") === 2, all.funnel.map((s) => `${s.key}:${s.value}`))
  check("OnePage link taps are counted", all.linkClicks.value === 1, all.linkClicks.value)

  /* The sales reports read the same orders: their total is the chart's revenue. */
  const lines = db.rows("orders") as unknown as CommerceOrderRow[]
  const inside = lines.filter((r) => Date.parse(r.created_at) >= span.start && Date.parse(r.created_at) < span.end)
  check("the sales breakdown's total is the chart's revenue, and its orders the chart's orders", breakdownOf(inside).total === all.sales.value && breakdownOf(inside).orders === all.orders.value, [breakdownOf(inside).total, all.sales.value])

  console.log("\nEach place alone, and one product")
  {
    const site = await report(db, { period: span, compare: against, property: `website:${SITE}` })
    check("the website: its own five pages' visitors and views, its one order", site.views.value === 5 && site.visitors.value === 2 && site.orders.value === 1 && site.sales.value === 12000, [site.views.value, site.visitors.value, site.orders.value])
    const creator = await report(db, { period: span, compare: against, property: "creator_page" })
    check("the creator page: Explore's visit, the tagged one and the one at 01:30, and the ebook's order", creator.visitors.value === 3 && creator.orders.value === 1 && creator.sales.value === 4900, [creator.visitors.value, creator.orders.value])
    const onepage = await report(db, { period: span, compare: against, property: "onepage" })
    check("the OnePage: its visit and its link", onepage.visitors.value === 1 && onepage.topLinks.length === 1 && onepage.topLinks[0].clicks === 1, [onepage.visitors.value, onepage.topLinks])
    check("All is the sum of its places, for visitors and orders", site.visitors.value + creator.visitors.value + onepage.visitors.value === all.visitors.value && site.orders.value + creator.orders.value + onepage.orders.value === all.orders.value)
    const print = await report(db, { period: span, compare: against, product: PRINT })
    check("one product: its page's views and its order only", print.views.value === 1 && print.orders.value === 1 && print.sales.value === 12000, [print.views.value, print.orders.value])
    const draft = await reportQuestion(db as never, ANA_USER, new URL(`https://storelib.com/api/analytics/reports?start=${new Date(span.start).toISOString()}&end=${new Date(span.end).toISOString()}&tz=${TZ}&property=website:${DRAFT}`), "storelib.com")
    check("a draft website is no place: asking for it is refused", "error" in draft && draft.status === 404, draft)
    check("  and a sales line follows the same product and place", commerceRowCounts(lines[0], { productId: PRINT, property: parseProperty(`website:${SITE}`), defaultWebsite: SITE }) && !commerceRowCounts(lines[1], { productId: null, property: parseProperty(`website:${SITE}`), defaultWebsite: SITE }))
  }

  console.log("\nThe seller's midnight, and no comparison")
  {
    const utcToday = boundsOf(resolveValue({ preset: "today" }, todayIn("UTC", NOW), "today"), "UTC", db.clock + MIN)
    const inUtc = await report(db, { period: utcToday, compare: null, tz: "UTC" })
    check("today in UTC leaves out the 01:30 Bucharest visit (22:30 UTC yesterday)", inUtc.visitors.value === 5 && !inUtc.compared, [inUtc.visitors.value, inUtc.compared])
    const none = await report(db, { period: span, compare: null })
    check("no comparison: the same figures, and nothing before", none.visitors.value === all.visitors.value && none.visitors.previous === 0 && none.visitors.change === null && none.views.series.previous.length === 0, none.visitors)
    check("the chart's buckets are Bucharest's hours, from its midnight", all.grain === "hour" && all.visitors.series.labels.length === 16, [all.grain, all.visitors.series.labels.length])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
type _Unused = Row
