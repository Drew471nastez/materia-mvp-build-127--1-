/**
 * ===========================================================================
 *  ONE PIPELINE: WHAT A VISIT RECORDS, AND WHAT IT DOES NOT
 * ===========================================================================
 * The collection side of Analytics (docs/analytics/events.md), run for real:
 * the browser half (lib/analytics/page-tracker) in a fake window whose
 * address changes the way a full load and a Next route change change it, and
 * whatever it sends handed to the server half (lib/analytics/collect) with
 * an in-memory database that keeps Postgres's rules (tests/fake-supabase).
 *
 * The bug this pins: a website rendered one tracker keyed by the creator, so
 * a visit to three pages was one view with no path, and nothing said which
 * website it was.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { FakeSupabase, type Row } from "./fake-supabase"
import { collect, type CollectDeps, type CollectKind, type CollectOutcome } from "../lib/analytics/collect"
import { OWN_MARKER_COOKIE, OWN_MARKER_DOMAIN_COOKIE, marksOwner, ownLink, ownReturnPath, readOwnToken, signOwnHandoff, signOwnMarker } from "../lib/analytics/own-marker"
import { clearPropertyCache } from "../lib/analytics/property"
import { forgetSent, pageKeyOf, schedulePageView, skipReason, watchInternalLinks, watchOutboundLinks } from "../lib/analytics/page-tracker"
import { ALLOWED_EVENT_TYPES, EVENT, normalizeLinkUrl, normalizePath, splitDays, sumDailyRows } from "../lib/analytics/events"
import { everything, serialize } from "../lib/consent/consent"

/*
  The marker is signed with ANALYTICS_OWN_SECRET, or the service role key
  where that is unset (lib/analytics/own-marker). A test run has neither, and
  an unsigned marker would make every check below pass for the wrong reason,
  so the run gets a key of its own. It is read when a token is signed, not
  when the module loads, so setting it here is in time.
*/
process.env.ANALYTICS_OWN_SECRET = process.env.ANALYTICS_OWN_SECRET || "storelib-tests-own-marker-key"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail)})` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* ─── The world: two creators, their properties, their hosts ───────────── */

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const ANA_USER = "aaaaaaaa-0000-4000-8000-0000000000a1"
const ANA_SITE = "aaaaaaaa-5555-4000-8000-000000000001"
const ANA_DRAFT_SITE = "aaaaaaaa-5555-4000-8000-000000000002"
const ANA_ONEPAGE = "aaaaaaaa-7777-4000-8000-000000000001"
const ANA_EBOOK = "aaaaaaaa-1111-4000-8000-000000000001"
const BEE = "bbbbbbbb-0000-4000-8000-000000000002"
const BEE_USER = "bbbbbbbb-0000-4000-8000-0000000000b1"
const BEE_SITE = "bbbbbbbb-5555-4000-8000-000000000001"
const BEE_PRODUCT = "bbbbbbbb-1111-4000-8000-000000000001"

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
const START = Date.parse("2026-09-24T10:00:00Z")
const MIN = 60_000

function world(opts: { beforePart53?: boolean } = {}): FakeSupabase {
  const db = new FakeSupabase()
  db.clock = START
  db.table("profiles", {}, [{ id: ANA_USER, username: "ana" }, { id: BEE_USER, username: "bee" }])
  /* Where a hand-off is written down as used (lib/analytics/own-marker consumeOwnHandoff). */
  db.table("rate_limit_hits", {}, [])
  db.table("creators", {}, [{ id: ANA, user_id: ANA_USER, slug: "ana" }, { id: BEE, user_id: BEE_USER, slug: "bee" }])
  db.table("products", {}, [{ id: ANA_EBOOK, creator_id: ANA }, { id: BEE_PRODUCT, creator_id: BEE }])
  db.table("store_theme_installs", {}, [
    { id: ANA_DRAFT_SITE, creator_id: ANA, status: "draft", sort_order: 0 },
    { id: ANA_SITE, creator_id: ANA, status: "published", sort_order: 1 },
    { id: BEE_SITE, creator_id: BEE, status: "published", sort_order: 0 },
  ])
  db.table("onepages", {}, [{ id: ANA_ONEPAGE, seller_id: ANA, owner_id: ANA_USER, slug: "ana" }])
  db.table("custom_domains", {}, [
    { creator_id: BEE, domain: "bee.com", status: "active", purpose: "website" },
    { creator_id: ANA, domain: "anapage.com", status: "active", purpose: "creator_page" },
  ])
  db.table("onepage_views", {}, [])
  db.table("onepage_clicks", {}, [])
  const NEW_COLUMNS = ["property_type", "property_id", "path", "link_id", "link_url"]
  db.table("analytics_events", {
    defaults: (d) => ({ id: crypto.randomUUID(), created_at: d.now() }),
    checks: [
      /* part 61's checks; before it, part 04's event types and no new columns at all */
      (r) => ((opts.beforePart53 ? ALLOWED_EVENT_TYPES.filter((t) => t !== "link_click") : ALLOWED_EVENT_TYPES) as readonly string[]).includes(r.event_type) ? null : "analytics_events_event_type_check",
      (r) => (r.property_type == null || ["creator_page", "onepage", "website"].includes(r.property_type) ? null : "analytics_events_property_type_check"),
      (r) => (r.path == null || (r.path.length <= 300 && r.path.startsWith("/")) ? null : "analytics_events_path_check"),
      (r) => (["desktop", "mobile", "tablet", null, undefined].includes(r.device_type) ? null : "analytics_events_device_type_check"),
    ],
  })
  if (opts.beforePart53) {
    /* A database that has not run part 61: writing or filtering a column it lacks is PGRST204 / 42703. */
    const from = db.from.bind(db)
    db.from = (name: string) => {
      const q = from(name) as unknown as Record<string, (...a: unknown[]) => unknown>
      if (name !== "analytics_events") return q as never
      const missing = { data: null, error: { code: "PGRST204", message: "Could not find the 'property_type' column of 'analytics_events' in the schema cache" } }
      let broken = false
      const wrap: Record<string, unknown> = new Proxy(q, {
        get(target, prop): unknown {
          if (prop === "then") return broken ? (ok: (v: unknown) => unknown) => Promise.resolve(missing).then(ok) : (target.then as (...a: unknown[]) => unknown).bind(target)
          if (prop === "insert") return (rows: Row | Row[]) => { if ((Array.isArray(rows) ? rows : [rows]).some((r) => NEW_COLUMNS.some((c) => c in r))) broken = true; (target.insert as (r: unknown) => unknown)(rows); return wrap }
          if (prop === "eq" || prop === "is") return (col: string, v: unknown) => { if (NEW_COLUMNS.includes(col)) broken = true; (target[prop as string] as (c: string, v: unknown) => unknown)(col, v); return wrap }
          const v = target[prop as string]
          return typeof v === "function" ? (...a: unknown[]) => { v.apply(target, a); return wrap } : v
        },
      })
      return wrap as never
    }
  }
  return db
}

interface Ask {
  kind?: CollectKind
  body: Record<string, unknown>
  host?: string
  ua?: string
  ip?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
}

function deps(db: FakeSupabase, extra: Partial<CollectDeps> = {}): CollectDeps {
  return {
    db,
    now: () => db.clock,
    mainDomain: "storelib.com",
    /* Signed in as the owner: an sb- auth cookie whose user is the creator's. */
    isOwnVisit: async (names, ownerUserId) => names.includes("sb-test-auth-token") && ownerUserId === ANA_USER,
    /* The real one: the marker this host carries, signed by this server (lib/analytics/own-marker). */
    marksOwner,
    limited: async () => false,
    ...extra,
  }
}

async function ask(db: FakeSupabase, a: Ask, extra: Partial<CollectDeps> = {}): Promise<CollectOutcome> {
  const headers = new Headers({
    host: a.host ?? new URL(String(a.body.href ?? "https://storelib.com/")).host,
    "user-agent": a.ua ?? IPHONE,
    "x-forwarded-for": a.ip ?? "203.0.113.7",
    "sec-fetch-site": "same-origin",
    "x-vercel-ip-country": "RO",
    ...(a.headers ?? {}),
  })
  const cookies = a.cookies ?? {}
  return collect(
    { kind: a.kind ?? "view", body: a.body, headers, cookie: (n) => cookies[n], cookieNames: Object.keys(cookies) },
    deps(db, extra),
  )
}

const views = (db: FakeSupabase) => db.rows("analytics_events").filter((r) => r.event_type === "view")
const consent = { storelib_consent: serialize(everything(true, START)) }

/* ─── A window the tracker can run in ──────────────────────────────────── */

interface Sent { path: string; body: Record<string, unknown>; beacon: boolean }

function fakeWindow(href: string, opts: { webdriver?: boolean; framed?: boolean; prerendering?: boolean; hidden?: boolean; loading?: boolean } = {}) {
  const listeners = new Map<string, Set<(e: unknown) => void>>()
  const docListeners = new Map<string, Set<(e: unknown) => void>>()
  const on = (m: Map<string, Set<(e: unknown) => void>>) => (t: string, f: (e: unknown) => void) => { if (!m.has(t)) m.set(t, new Set()); m.get(t)!.add(f) }
  const off = (m: Map<string, Set<(e: unknown) => void>>) => (t: string, f: (e: unknown) => void) => m.get(t)?.delete(f)
  const idle = new Map<number, () => void>()
  let nextIdle = 0
  const sent: Sent[] = []
  const store = new Map<string, string>()
  const doc = {
    prerendering: !!opts.prerendering,
    visibilityState: opts.hidden ? "hidden" : "visible",
    readyState: opts.loading ? "loading" : "complete",
    addEventListener: on(docListeners),
    removeEventListener: off(docListeners),
    fire(type: string, e: unknown = {}) { for (const f of [...(docListeners.get(type) ?? [])]) f(e) },
  }
  const win: Record<string, unknown> = {
    location: { href },
    document: doc,
    navigator: {
      webdriver: !!opts.webdriver,
      sendBeacon: (path: string, blob: Blob) => { void blob.text().then((t) => sent.push({ path, body: JSON.parse(t), beacon: true })); return true },
    },
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    requestIdleCallback: (cb: () => void) => { idle.set(++nextIdle, cb); return nextIdle },
    cancelIdleCallback: (id: number) => void idle.delete(id),
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    fetch: async (path: string, init: { body: string }) => { sent.push({ path, body: JSON.parse(init.body), beacon: false }); return { ok: true } },
    addEventListener: on(listeners),
    removeEventListener: off(listeners),
  }
  win.self = win
  win.top = opts.framed ? {} : win
  return {
    win: win as unknown as Window & typeof globalThis,
    sent,
    doc,
    /** The browser becomes idle: every waiting idle callback runs. */
    idle: () => { const run = [...idle.values()]; idle.clear(); for (const f of run) f() },
    waiting: () => idle.size,
    /** The page finishes loading: its pictures are in. */
    load: () => { doc.readyState = "complete"; for (const f of [...(listeners.get("load") ?? [])]) f({}) },
    leave: () => { for (const f of [...(listeners.get("pagehide") ?? [])]) f({}) },
    go: (to: string) => { (win.location as { href: string }).href = to },
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))

/** The page's payload, as components/analytics/track-view builds it, for a visitor with analytics consent. */
const pagePayload = (creatorId: string, productId?: string) => () => ({
  creatorId,
  productId,
  sessionId: "s_tab1",
  visitorId: "v_tab1",
  referrerDomain: "l.instagram.com",
  referrer: "https://l.instagram.com/",
  pageUrl: "https://ana.storelib.com/?utm_source=ig",
  utm_source: "ig",
  deviceType: "mobile",
})

async function main() {
  console.log("\nA website: every page one view, with its path and the website's id")
  {
    clearPropertyCache()
    const db = world()
    const pages: Array<[string, string?]> = [["https://ana.storelib.com/"], ["https://ana.storelib.com/about"], ["https://ana.storelib.com/products/ebook", ANA_EBOOK]]
    for (const [href, productId] of pages) {
      const out = await ask(db, { body: { creatorId: ANA, productId, href, sessionId: "s1", visitorId: "v1" }, cookies: consent })
      check(`${new URL(href).pathname} is recorded`, out.recorded, out)
      db.clock += MIN
    }
    const rows = views(db)
    check("three pages, three views (it was one)", rows.length === 3, rows.length)
    check("  each with its own path", rows.map((r) => r.path).join(" ") === "/ /about /products/ebook", rows.map((r) => r.path))
    check("  on the published website, by its install id, never the draft's", rows.every((r) => r.property_type === "website" && r.property_id === ANA_SITE), rows.map((r) => r.property_id))
    check("  the product page is also a product view", rows[2].product_id === ANA_EBOOK && rows[0].product_id === null)
    check("  one visitor, one visit", new Set(rows.map((r) => r.session_id)).size === 1 && rows.every((r) => r.visitor_id === "v1"))
    check("  and the source fields a view always had", rows[0].source_category === "social_instagram" || rows[0].source_category === "direct", rows[0].source_category)

    const refresh = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("a refresh of /about inside 30 minutes is not a new view", !refresh.recorded && refresh.reason === "duplicate" && views(db).length === 3, refresh.reason)
    const trailing = await ask(db, { body: { creatorId: ANA, href: "https://ANA.storelib.com/About/?utm_source=x#top", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("  nor is the same page with a query, a hash, capitals or a trailing slash", trailing.reason === "duplicate", trailing.reason)
    db.clock += 31 * MIN
    const later = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("back on /about more than 30 minutes after its last view: a new view", later.recorded && views(db).length === 4)

    const custom = await ask(db, { body: { creatorId: BEE, href: "https://www.bee.com/shop", sessionId: "s9", visitorId: "v9" }, cookies: consent })
    check("a website on its own connected domain is that website", custom.recorded && custom.row?.property_type === "website" && custom.row?.property_id === BEE_SITE && custom.row?.path === "/shop", custom.row)
  }

  console.log("\nThe browser: a full load and a client side route change are one view each")
  {
    forgetSent()
    clearPropertyCache()
    const db = world()
    const tab = fakeWindow("https://ana.storelib.com/")
    let cancel = schedulePageView(tab.win, { creatorId: ANA, payload: pagePayload(ANA) })
    check("nothing is sent before the browser is idle", tab.sent.length === 0 && tab.waiting() === 1)
    tab.idle()
    await settle()
    check("  then the first page is sent, once", tab.sent.length === 1 && tab.sent[0].path === "/api/track-view" && tab.sent[0].body.href === "https://ana.storelib.com/")

    /* A Next <Link> to /about: the address changes, the tracker's path key changes, the effect runs again. */
    tab.go("https://ana.storelib.com/about")
    cancel()
    cancel = schedulePageView(tab.win, { creatorId: ANA, payload: pagePayload(ANA) })
    tab.idle()
    await settle()
    check("a route change to /about sends one view for /about", tab.sent.length === 2 && tab.sent[1].body.href === "https://ana.storelib.com/about")

    /* And one left before the browser was idle is still sent, as the page goes. */
    tab.go("https://ana.storelib.com/contact")
    cancel()
    cancel = schedulePageView(tab.win, { creatorId: ANA, payload: pagePayload(ANA) })
    tab.go("https://ana.storelib.com/faq")
    cancel()
    await settle()
    check("a page left before idle sends its view as it goes, by beacon", tab.sent.length === 3 && tab.sent[2].body.href === "https://ana.storelib.com/contact" && tab.sent[2].beacon)

    /* Back to the first page: this tab sent it minutes ago. */
    tab.go("https://ana.storelib.com/")
    cancel = schedulePageView(tab.win, { creatorId: ANA, payload: pagePayload(ANA) })
    tab.idle()
    await settle()
    check("back to a page this tab sent in the last 30 minutes sends nothing", tab.sent.length === 3 && tab.waiting() === 0)
    cancel()

    for (const s of tab.sent) await ask(db, { body: s.body, cookies: consent })
    const rows = views(db)
    check("what the browser sent is three views on the server, one per page", rows.length === 3 && rows.map((r) => r.path).join(" ") === "/ /about /contact", rows.map((r) => r.path))
    check("  each placed on the website", rows.every((r) => r.property_type === "website" && r.property_id === ANA_SITE))
    check("the key a view is remembered by is the host and the path", pageKeyOf(ANA, "https://ana.storelib.com/About/?x=1") === `${ANA}|ana.storelib.com/about`)

    forgetSent()
    const loading = fakeWindow("https://storelib.com/ana", { loading: true })
    schedulePageView(loading.win, { creatorId: ANA, payload: pagePayload(ANA) })
    loading.idle()
    check("a page still loading its pictures sends nothing, idle or not", loading.sent.length === 0 && loading.waiting() === 0)
    loading.load()
    loading.idle()
    await settle()
    check("  and its one view once it has loaded and the browser is idle", loading.sent.length === 1 && !loading.sent[0].beacon)
    forgetSent()
    const leaver = fakeWindow("https://storelib.com/ana/ebook", { loading: true })
    schedulePageView(leaver.win, { creatorId: ANA, payload: pagePayload(ANA, ANA_EBOOK) })
    leaver.leave()
    await settle()
    check("a page left while still loading, but shown, sends its view by beacon as it goes", leaver.sent.length === 1 && leaver.sent[0].beacon)
  }

  console.log("\nNot a visit: the builder, the owner, robots, prefetches")
  {
    forgetSent()
    clearPropertyCache()
    const db = world()
    for (const href of ["https://ana.storelib.com/preview/tok123", "https://ana.storelib.com/?preview=tok123", "https://storelib.com/w/ana/preview/tok123/about", "https://storelib.com/ana?embedded=1"]) {
      const out = await ask(db, { body: { creatorId: ANA, href } })
      check(`a builder preview records nothing: ${new URL(href).pathname}${new URL(href).search}`, !out.recorded && out.reason === "no_property" && out.detail === "preview", out)
    }
    const framed = fakeWindow("https://storelib.com/ana", { framed: true })
    check("a page inside a frame (the builder canvas, the creator page workspace) sends nothing", skipReason(framed.win) === "framed" && (schedulePageView(framed.win, { creatorId: ANA, payload: pagePayload(ANA) }), framed.waiting() === 0))
    check("  nor does a preview address", skipReason(fakeWindow("https://ana.storelib.com/preview/x").win) === "preview")
    check("  and the preview routes draw no tracker at all", /previewToken \? null : <TrackView type="product"/.test(read("components/website-builder/theme/render-product.tsx")) && !/TrackView/.test(read("app/(site)/w/[username]/preview/[token]/page.tsx")))

    const own = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, cookies: { "sb-test-auth-token": "x" } })
    check("the creator on their own page records nothing", !own.recorded && own.reason === "own", own.reason)


    const bot = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, ua: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })
    const headless = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120.0 Safari/537.36" })
    const empty = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, ua: "" })
    check("a robot, a headless browser and no signature record nothing", bot.reason === "bot" && headless.reason === "bot" && empty.reason === "bot")
    const driven = fakeWindow("https://storelib.com/ana", { webdriver: true })
    schedulePageView(driven.win, { creatorId: ANA, payload: pagePayload(ANA) })
    driven.idle()
    check("  and a browser driven by a script sends nothing", driven.sent.length === 0 && skipReason(driven.win) === "automated")

    for (const [name, value] of [["next-router-prefetch", "1"], ["sec-purpose", "prefetch"], ["purpose", "prefetch"], ["sec-purpose", "prefetch;prerender"]]) {
      const out = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, headers: { [name]: value } })
      check(`a prefetch (${name}: ${value}) records nothing`, out.reason === "prefetch", out.reason)
    }
    const pre = fakeWindow("https://storelib.com/ana", { prerendering: true })
    schedulePageView(pre.win, { creatorId: ANA, payload: pagePayload(ANA) })
    pre.idle()
    check("a prerendered page sends nothing while it is not shown", pre.sent.length === 0 && pre.waiting() === 0)
    pre.doc.prerendering = false
    pre.doc.fire("prerenderingchange")
    pre.idle()
    await settle()
    check("  and its one view once it is", pre.sent.length === 1)
    const hidden = fakeWindow("https://storelib.com/bee", { hidden: true })
    schedulePageView(hidden.win, { creatorId: BEE, payload: pagePayload(BEE) })
    check("a tab opened in the background waits until it is looked at", hidden.waiting() === 0 && hidden.sent.length === 0)

    const other = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, headers: { "sec-fetch-site": "cross-site" } })
    const origin = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, headers: { origin: "https://evil.example" } })
    check("a request from another site records nothing", other.reason === "cross_site" && origin.reason === "cross_site")
    const flood = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" } }, { limited: async (s) => s.startsWith("track:") && !s.includes("203.0.113.7") })
    check("one address past the limit records nothing, counted by a hash of the address, never the address", flood.reason === "rate_limited", flood.reason)
    check("none of it wrote a row", db.rows("analytics_events").length === 0, db.rows("analytics_events").length)
  }

  console.log("\nThe creator is not a visitor on a host that carries no session")
  {
    const db = world()
    /*
      ON THEIR WEBSITE THERE IS NO SESSION TO READ. The session cookie is
      host-only (proxy.ts says why), so a browser sends nothing of it to
      ana.storelib.com, storelib.me or a connected domain. This test used to
      hand the sb- cookie to the website host as though a browser would, and
      passed while production counted the creator as one of their own
      visitors on every property but the creator page. What the host carries
      instead is the marker left by /api/analytics/own (lib/analytics/
      own-marker), and that is what is checked here.
    */
    const unmarked = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-s0", visitorId: "own-v0" } })
    check("  a browser carries no session to the website host, so without a marker it is a visit", unmarked.recorded, unmarked.reason)

    const marker = signOwnMarker(ANA, db.clock)
    const marked = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-s1", visitorId: "own-v1" },
      cookies: { [OWN_MARKER_COOKIE]: String(marker) },
    })
    check("  with the marker this host carries, the creator is not counted on their website", !marked.recorded && marked.reason === "own", marked.reason)

    const onePageMarked = await ask(db, {
      body: { creatorId: ANA, href: "https://storelib.me/ana", sessionId: "own-s2", visitorId: "own-v2" },
      host: "storelib.me",
      cookies: { [OWN_MARKER_COOKIE]: String(marker) },
    })
    check("  and not on their OnePage", !onePageMarked.recorded && onePageMarked.reason === "own", onePageMarked.reason)

    const otherMarker = signOwnMarker(BEE, db.clock)
    const otherMarked = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-s3", visitorId: "own-v3" }, ip: "203.0.113.23",
      cookies: { [OWN_MARKER_COOKIE]: String(otherMarker) },
    })
    check("  another creator's marker is somebody else's, and their visit is counted", otherMarked.recorded, otherMarked.reason)

    /* The owner: "when I go to the address it first shows me /api/analytics/own?t=..., then the actual address." Sites on Storelib's own domain are marked from the app, so they open plain. */
    const domainMarked = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-d1", visitorId: "own-vd1" }, ip: "203.0.113.31",
      cookies: { [OWN_MARKER_DOMAIN_COOKIE]: String(signOwnMarker(ANA, db.clock)) },
    })
    check("the mark the app sets for every storelib.com site leaves the creator out too", !domainMarked.recorded && domainMarked.reason === "own", domainMarked.reason)
    const domainOther = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-d2", visitorId: "own-vd2" }, ip: "203.0.113.32",
      cookies: { [OWN_MARKER_DOMAIN_COOKIE]: String(signOwnMarker(BEE, db.clock)) },
    })
    check("  and another creator's is no mark for this one", domainOther.recorded, domainOther.reason)
    const tokenRoute = read("app/api/analytics/own/token/route.ts")
    check("  set by the token route on storelib.com only, for the whole domain, unreadable by a page", /OWN_MARKER_DOMAIN_COOKIE\}=\$\{encodeURIComponent\(mark!\)\}`, `Domain=\$\{main\}`/.test(tokenRoute) && /"HttpOnly"/.test(tokenRoute) && /host === main \|\| host === `www\.\$\{main\}`/.test(tokenRoute) && /!main\.includes\("localhost"\)/.test(tokenRoute))
    /* Changed on purpose (round AD1): the app still opens every site at once, never through the marker route's hop, and carries the hand-off in the fragment instead (tests/analytics-ad1.test.ts). */
    const ownSite = read("lib/analytics/own-site.ts")
    check("  and the app opens every site at once, never through the marker route's hop", !/\/api\/analytics\/own\?/.test(ownSite.replace(/\/\*[\s\S]*?\*\//g, "")) && /url\.hash = `\$\{OWN_HASH_PARAM\}=\$\{encodeURIComponent\(token\)\}`/.test(ownSite))

    /* Round AD1: the hand-off in the fragment, sent by the page with its view. */
    const handedOff = await ask(db, { body: { creatorId: ANA, href: "https://ana-shop.example/about", sessionId: "own-h1", visitorId: "own-vh1", own: String(signOwnHandoff(ANA, db.clock)) }, ip: "203.0.113.41" })
    check("a view carrying the app's hand-off is the creator's own, not a visitor", !handedOff.recorded && handedOff.reason === "own", handedOff.reason)
    check("  and its answer marks this browser on this host for the creator", marksOwner(handedOff.ownMarker, ANA, db.clock), handedOff.ownMarker)
    /* Round AE4: a hand-off is taken once on a host, so a copied link with #sl_own= on it marks nobody else's browser. */
    const copied = String(signOwnHandoff(ANA, db.clock))
    await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/", sessionId: "own-c1", visitorId: "own-vc1", own: copied }, ip: "203.0.113.45" })
    const copiedAgain = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-c2", visitorId: "own-vc2", own: copied }, ip: "203.0.113.46" })
    check("  the same hand-off opened again on that host, by another browser, is a visit and marks nothing", copiedAgain.recorded && !copiedAgain.ownMarker, copiedAgain.reason)
    const handedOther = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-h2", visitorId: "own-vh2", own: String(signOwnHandoff(BEE, db.clock)) }, ip: "203.0.113.42" })
    check("  another creator's hand-off is no mark for this one", handedOther.recorded && !handedOther.ownMarker, handedOther.reason)
    const handedStale = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-h3", visitorId: "own-vh3", own: String(signOwnHandoff(ANA, db.clock - 31 * 60_000)) }, ip: "203.0.113.43" })
    check("  a hand-off past its half hour is counted as a visit", handedStale.recorded, handedStale.reason)
    const handedMarker = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-h4", visitorId: "own-vh4", own: String(signOwnMarker(ANA, db.clock)) }, ip: "203.0.113.44" })
    check("  a marker is not a hand-off", handedMarker.recorded, handedMarker.reason)

    const stale = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-s4", visitorId: "own-v4" }, ip: "203.0.113.24",
      cookies: { [OWN_MARKER_COOKIE]: String(signOwnMarker(ANA, db.clock - 200 * 24 * 60 * 60 * 1000)) },
    })
    check("  a marker past its half year is counted again", stale.recorded, stale.reason)

    const forged = String(signOwnMarker(ANA, db.clock)).replace(/.$/, (c) => (c === "a" ? "b" : "a"))
    const tampered = await ask(db, {
      body: { creatorId: ANA, href: "https://ana.storelib.com/about", sessionId: "own-s5", visitorId: "own-v5" }, ip: "203.0.113.25",
      cookies: { [OWN_MARKER_COOKIE]: forged },
    })
    check("  a marker this server did not sign is no marker", tampered.recorded, tampered.reason)

    /* The hand-off itself: the app's link, and what the route on the site's host reads from it. */
    const hand = signOwnHandoff(ANA, db.clock)
    check("a hand-off token names the creator it was minted for", readOwnToken(hand, "hand", db.clock) === ANA)
    check("  and is not a marker, nor a marker a hand-off", readOwnToken(hand, "mark", db.clock) === null && readOwnToken(marker, "hand", db.clock) === null)
    check("  it goes stale within the hour", readOwnToken(hand, "hand", db.clock + 31 * 60_000) === null)
    check("marksOwner answers for the creator the marker names and no other", marksOwner(marker, ANA, db.clock) && !marksOwner(marker, BEE, db.clock) && !marksOwner(null, ANA, db.clock))

    const link = ownLink("https://ana.storelib.com/about?ref=x", ANA, db.clock)
    const linkUrl = new URL(String(link))
    check("the app's link goes to the marker route on the site's own host, carrying the page it is for",
      linkUrl.host === "ana.storelib.com" && linkUrl.pathname === "/api/analytics/own"
        && linkUrl.searchParams.get("to") === "/about?ref=x" && readOwnToken(linkUrl.searchParams.get("t"), "hand", db.clock) === ANA,
      link)
    check("  and nothing but https is linked", ownLink("http://ana.storelib.com/", ANA, db.clock) === null && ownLink("javascript:alert(1)", ANA, db.clock) === null)
    check("the route only ever returns to a path on its own host",
      ["/about", "/a?b=c"].every((p) => ownReturnPath(p) === p)
        && ["//evil.example", "https://evil.example", "/\\evil.example", "evil", null, undefined].every((p) => ownReturnPath(p as string) === "/"))

    /*
      THE HAND-OFF IS WIRED, AND THE TOKEN IS NEVER WHAT A CREATOR SHARES.
      A screen that can open the creator's own site asks for the token as it
      mounts, and only the address it OPENS carries it: an address a Copy
      button copies, or the screen draws, stays plain.
    */
    /* The route in the middle is not read here, it is run: tests/own-marker.test.ts. */
    check("the token is minted only for the session's own creator", /\.eq\("user_id", user\.id\)/.test(read("app/api/analytics/own/token/route.ts")))
    check("the OnePage host lets the marker route through, and only a GET", /\{ path: \/\^\\\/api\\\/analytics\\\/own\\\/\?\$\/, methods: \["GET"\] \}/.test(read("lib/onepage/host-route.ts")))

    const wired: Array<[string, string]> = [
      /* Round AC3: through liveSiteLink, so the phone app opens the phone's browser. */ ["app/app/website-builder/website-builder-client.tsx", "liveSiteLink(ownOpen(siteUrl))"],
      ["app/website-builder/editor/[installId]/page.tsx", "liveSiteLink(ownOpen(websiteUrl))"],
      ["components/website-builder/publish-panel.tsx", "liveSiteLink(ownOpen(websiteUrl))"],
      ["components/store-builder/editor-topbar.tsx", "openExternal(ownOpen(getLiveStoreUrl()))"],
      ["components/onepage/onepage-editor.tsx", "openExternal(ownOpen(pageUrl))"],
      ["components/app/settings/addresses.tsx", "openExternal(ownOpen(url))"],
      ["components/app/share/share-storelib.tsx", "openExternal(ownOpen(url))"],
    ]
    for (const [file, opens] of wired) check(`  ${file} opens the site through the marker`, read(file).includes(opens), opens)
    check("  and every screen that opens one asks for the token as it mounts",
      wired.filter(([f]) => !f.includes("publish-panel")).every(([f]) => /useOwnMarker\(\)/.test(read(f))))
    check("what is copied stays the plain address",
      /navigator\.clipboard\.writeText\(pageUrl\)/.test(read("components/onepage/onepage-editor.tsx"))
        && /await navigator\.clipboard\.writeText\(url\)/.test(read("app/app/website-builder/website-builder-client.tsx")))
  }

  console.log("\nForged or foreign: dropped")
  {
    clearPropertyCache()
    const db = world()
    const forged = await ask(db, { body: { creatorId: BEE, href: "https://ana.storelib.com/about" } })
    check("another creator's id on Ana's website is dropped", !forged.recorded && forged.detail === "foreign_host", forged)
    const theirDomain = await ask(db, { body: { creatorId: ANA, href: "https://www.bee.com/" } })
    check("Ana's id on Bee's domain is dropped", theirDomain.detail === "foreign_host", theirDomain)
    const lying = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/", propertyId: BEE_SITE, propertyType: "onepage" } })
    check("a property id the page sends is never read: the server places it", lying.recorded && lying.row?.property_id === ANA_SITE && lying.row?.property_type === "website")
    const mismatch = await ask(db, { body: { creatorId: ANA, href: "https://ana.storelib.com/" }, host: "storelib.com" })
    check("a page address on another host than the request's is dropped", mismatch.detail === "host_mismatch", mismatch)
    const notTheirs = await ask(db, { body: { creatorId: ANA, productId: BEE_PRODUCT, href: "https://storelib.com/ana/x" } })
    check("another creator's product is dropped", notTheirs.reason === "unknown_product")
    const nobody = await ask(db, { body: { creatorId: "cccccccc-0000-4000-8000-000000000003", href: "https://storelib.com/cee" } })
    check("a creator that does not exist is dropped", nobody.reason === "unknown_creator")
    const junk = await ask(db, { body: { creatorId: "not-a-uuid", href: "https://storelib.com/ana" } })
    check("a payload that is not a real page's is dropped", junk.reason === "invalid")
    const app = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/app/analytics" } })
    check("a Storelib page that is not a creator's (/app) is not a property", app.detail === "not_a_property_page", app)
    check("only the one honest view was written", views(db).length === 1)
  }

  console.log("\nThe creator page and its products")
  {
    clearPropertyCache()
    const db = world()
    const page = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" } })
    const product = await ask(db, { body: { creatorId: ANA, productId: ANA_EBOOK, href: "https://storelib.com/ana/ebook" } })
    const legacy = await ask(db, { body: { creatorId: ANA, productId: ANA_EBOOK, href: "https://storelib.com/p/ebook" } })
    const domain = await ask(db, { body: { creatorId: ANA, href: "https://www.anapage.com/" } })
    check("storelib.com/ana is the creator page, with no id", page.row?.property_type === "creator_page" && page.row?.property_id === null && page.row?.path === "/ana", page.row)
    check("storelib.com/ana/ebook is the creator page, and a product view", product.row?.property_type === "creator_page" && product.row?.product_id === ANA_EBOOK && product.row?.path === "/ana/ebook")
    check("  so is /p/ebook", legacy.row?.property_type === "creator_page" && legacy.row?.path === "/p/ebook")
    check("a domain connected for the creator page is the creator page", domain.row?.property_type === "creator_page" && domain.row?.path === "/", domain)
    const noConsent = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana/about-me", sessionId: "s_from_page", visitorId: "v_from_page" }, ip: "198.51.100.4" })
    check("without consent the ids are the daily hash and its visit, not what the page sent", String(noConsent.row?.visitor_id).startsWith("anon_") && noConsent.row?.session_id !== "s_from_page" && noConsent.row?.city === null)
    check("  and the hash never goes back to the page", noConsent.visitorCookie === null)
    const withConsent = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana/other", visitorId: "v_page" }, cookies: consent })
    check("with consent the visitor cookie is set", !!withConsent.visitorCookie && "set" in withConsent.visitorCookie && withConsent.visitorCookie.set === "v_page")
  }

  console.log("\nThe OnePage: in analytics_events once, its own stats untouched")
  {
    clearPropertyCache()
    const db = world()
    const view = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana/links", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    const view2 = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/l/ana", sessionId: "s2", visitorId: "v2" }, cookies: consent })
    const onDomain = await ask(db, { body: { creatorId: ANA, href: "https://www.anapage.com/links", sessionId: "s3", visitorId: "v3" }, cookies: consent })
    check("a OnePage view is a view on the OnePage, by its id", view.row?.property_type === "onepage" && view.row?.property_id === ANA_ONEPAGE && view.row?.path === "/ana/links", view.row)
    check("  at /l/<slug> and at /links on a connected domain too", view2.row?.property_id === ANA_ONEPAGE && onDomain.row?.property_id === ANA_ONEPAGE)
    const again = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana/links", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("  and a refresh of it is not another", again.reason === "duplicate")
    /* storelib.me/<name> is where every OnePage lives now (lib/onepage/address). Its tracker posts to storelib.me itself. */
    const onMe = await ask(db, { body: { creatorId: ANA, href: "https://storelib.me/ana?utm_source=ig", sessionId: "s4", visitorId: "v4" }, cookies: consent })
    check("a view at storelib.me/<name> is the OnePage's, by its id", onMe.recorded && onMe.row?.property_type === "onepage" && onMe.row?.property_id === ANA_ONEPAGE && onMe.row?.path === "/ana", onMe)
    const meElsewhere = await ask(db, { body: { creatorId: ANA, href: "https://storelib.me/ana/links", sessionId: "s5", visitorId: "v5" }, cookies: consent })
    const meReserved = await ask(db, { body: { creatorId: ANA, href: "https://storelib.me/app", sessionId: "s6", visitorId: "v6" }, cookies: consent })
    check("  anything else on storelib.me (a redirect or a 404 there) is not a page", !meElsewhere.recorded && !meReserved.recorded && meElsewhere.detail === "not_a_property_page", [meElsewhere, meReserved])
    const meClick = await ask(db, { kind: "link_click", body: { creatorId: ANA, href: "https://storelib.me/ana", linkUrl: "https://open.spotify.com/x", linkId: "block_9", sessionId: "s4", visitorId: "v4" }, cookies: consent })
    check("  and a link clicked there is the OnePage's link click", meClick.recorded && meClick.row?.property_type === "onepage" && meClick.row?.link_id === "block_9", meClick)
    const hostRoute = read("lib/onepage/host-route.ts")
    check("  storelib.me answers the tracker's two calls instead of a 404", hostRoute.includes('{ path: /^\\/api\\/track-view\\/?$/, methods: ["POST"] }') && hostRoute.includes('{ path: /^\\/api\\/track-event\\/?$/, methods: ["POST"] }'))
    for (const r of db.rows("analytics_events").filter((x) => x.event_type === EVENT.linkClick)) db.rows("analytics_events").splice(db.rows("analytics_events").indexOf(r), 1)

    const click = { creatorId: ANA, href: "https://storelib.com/ana/links", linkUrl: "https://www.youtube.com/watch?v=abc&token=secret#t=10", linkId: "block_1", sessionId: "s1", visitorId: "v1" }
    const c1 = await ask(db, { kind: "link_click", body: click, cookies: consent })
    const c2 = await ask(db, { kind: "link_click", body: click, cookies: consent })
    const clicks = db.rows("analytics_events").filter((r) => r.event_type === EVENT.linkClick)
    check("a OnePage link click lands once, with its block and destination", c1.recorded && c2.reason === "duplicate" && clicks.length === 1 && clicks[0].link_id === "block_1" && clicks[0].property_type === "onepage", clicks)
    check("  the destination without its query or hash", clicks[0].link_url === "https://www.youtube.com/watch", clicks[0].link_url)
    check("  a mailto link keeps no address", normalizeLinkUrl("mailto:ana@example.com?subject=x") === "mailto:")
    check("the pipeline never writes the OnePage's own tables", db.rows("onepage_views").length === 0 && db.rows("onepage_clicks").length === 0 && db.writes.every((w) => w === "insert analytics_events"), db.writes)

    const route = read("app/api/onepage/track/route.ts")
    /* Changed on purpose (round 40, tests/onepage-analytics-seo-r40.test.ts): the analytics copy goes first, and
       onepage_clicks is written only when its answer says a person pressed it (lib/onepage/visit-gate), so the
       older table no longer counts robots, prefetches, the owner or a flood that Analytics refuses. Its own
       rule, one per visitor, block and UTC day, is unchanged. */
    check("the OnePage editor's click count keeps its rule, and is written after the analytics copy says a person pressed it",
      /\.from\("onepage_clicks"\)\s*\.select\("id"\)\s*\.eq\("onepage_id", onepage_id\)\s*\.eq\("block_id", block_id\)\s*\.eq\("visitor_id", visitorId\)\s*\.gte\("created_at", todayStr\)/.test(route) &&
        route.indexOf("await recordLinkClick(request, body)") < route.indexOf('await supabase.from("onepage_clicks").insert(') &&
        /legacyClickAllowed\(outcome\)/.test(route))
    check("  whose OnePage it is comes from the row, never the page", /from\("onepages"\)\.select\("id, seller_id, creator_id, owner_id"\)\.eq\("id", body\.onepage_id\)/.test(route))
    const onePageRoute = read("app/(marketing)/l/[slug]/page.tsx")
    /* Changed on purpose (rel-public): the render no longer writes onepage_views. That table is read only before a
       OnePage's first view event (the check below), and the tracker records that event for every visit. */
    check("the OnePage's render writes no view row of its own",
      !/onepage_views/.test(onePageRoute.replace(/\/\*[\s\S]*?\*\//g, "")))
    check("  and the page carries the analytics tracker, with its links left to the blocks", /<TrackView creatorId=\{resolvedCreatorId\} links=\{false\} \/>/.test(onePageRoute))
    /* Changed on purpose (round 40): the editor's link stats are Analytics' own figures now, read through
       lib/onepage/link-stats-server from analytics_events with the older tables folded in before the first event. */
    check("  the OnePage stats route reads what Analytics reads",
      /readBlockStats|readPageClicks/.test(read("app/api/onepage/stats/route.ts")) && /countVisits\(admin, q\)/.test(read("lib/onepage/link-stats-server.ts")) && /\.from\("analytics_events"\)/.test(read("lib/onepage/link-stats-server.ts")))
    const sql = read("supabase/sql/run-now/61_analytics_one_pipeline.sql")
    /* Changed on purpose: the reports are one set now (analytics_report). A OnePage view is counted once, as the
       OnePage property, from the events; its old table is read only for the time before the OnePage's first event.
       The older tally still leaves OnePage views out, as before, for anything that calls it. */
    const reads = read("lib/analytics/report-read.ts")
    check("OnePage views are counted once: from the events, and from onepage_views only before the first of them",
      (sql.match(/e\.event_type = 'view' AND \(p_product_id IS NULL OR e\.product_id = p_product_id\) AND e\.property_type IS DISTINCT FROM 'onepage'/g) ?? []).length === 3 &&
        /end: since === null \? s\.end : Math\.min\(s\.end, since\)/.test(reads) && /\.eq\("property_type", "onepage"\)/.test(reads) &&
        !/analytics_visit_tally/.test(read("app/api/analytics/reports/route.ts") + reads))
  }

  console.log("\nLinks out and the steps towards a sale")
  {
    forgetSent()
    clearPropertyCache()
    const db = world()
    const tab = fakeWindow("https://ana.storelib.com/about")
    const doc = tab.doc as unknown as { fire: (t: string, e: unknown) => void }
    watchOutboundLinks(tab.win, { creatorId: ANA, mainDomain: "storelib.com", ids: () => ({ sessionId: "s1", visitorId: "v1" }) })
    const anchor = (href: string) => ({ tagName: "A", href, getAttribute: () => href })
    const click = (href: string) => doc.fire("click", { button: 0, composedPath: () => [anchor(href)] })
    click("https://instagram.com/ana")
    click("https://instagram.com/ana")
    click("https://ana.storelib.com/contact")
    click("https://storelib.com/checkout?productId=x")
    await settle()
    check("a link to another site is one link_click; the same link twice is one; the site's own and Storelib's are navigation", tab.sent.length === 1 && tab.sent[0].path === "/api/track-event" && tab.sent[0].beacon, tab.sent.map((s) => s.body.linkUrl))
    const out = await ask(db, { kind: "link_click", body: tab.sent[0].body, cookies: consent })
    check("  recorded on the website, with the page it was on", out.row?.property_type === "website" && out.row?.path === "/about" && out.row?.link_url === "https://instagram.com/ana", out.row)

    await ask(db, { body: { creatorId: ANA, productId: ANA_EBOOK, href: "https://ana.storelib.com/products/ebook", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    const buy = await ask(db, { kind: "buy_click", body: { eventType: "buy_click", creatorId: ANA, productId: ANA_EBOOK, href: "https://ana.storelib.com/products/ebook", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("Buy on a website's product page is on that website", buy.row?.property_type === "website" && buy.row?.property_id === ANA_SITE)
    const checkout = await ask(db, { kind: "checkout_start", body: { eventType: "checkout_start", creatorId: ANA, productId: ANA_EBOOK, href: "https://storelib.com/checkout?productId=x", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("the checkout, on storelib.com, belongs to the property the visit was on", checkout.row?.property_type === "website" && checkout.row?.property_id === ANA_SITE && checkout.row?.path === "/checkout", checkout.row)
    const again = await ask(db, { kind: "checkout_start", body: { eventType: "checkout_start", creatorId: ANA, productId: ANA_EBOOK, href: "https://storelib.com/checkout", sessionId: "s1", visitorId: "v1" }, cookies: consent })
    check("  once per visit and product", again.reason === "duplicate")
    const cold = await ask(db, { kind: "checkout_start", body: { eventType: "checkout_start", creatorId: ANA, productId: ANA_EBOOK, href: "https://storelib.com/checkout", sessionId: "s_new", visitorId: "v_new" }, cookies: consent })
    check("  and with no visit to place it by, it is still counted, with no property", cold.recorded && cold.row?.property_type === null)
    const purchases = db.rows("analytics_events").filter((r) => r.event_type === "purchase")
    check("no purchase and no money is written by collection: orders are the source of truth", purchases.length === 0 && !/amount|revenue|cents/i.test(JSON.stringify(db.rows("analytics_events"))))
  }

  console.log("\nClicks between pages of the same site (nav_click, part 331)")
  {
    forgetSent()
    clearPropertyCache()
    const db = world()
    const tab = fakeWindow("https://ana.storelib.com/")
    const doc = tab.doc as unknown as { fire: (t: string, e: unknown) => void }
    watchInternalLinks(tab.win, { creatorId: ANA, ids: () => ({ sessionId: "s1", visitorId: "v1" }) })
    const anchor = (href: string, words: string, attrs: Record<string, string> = {}) => ({
      tagName: "A",
      href,
      innerText: words,
      textContent: words,
      getAttribute: (n: string) => (n === "href" ? href : attrs[n] ?? null),
      hasAttribute: (n: string) => n in attrs,
      querySelector: () => null,
    })
    const click = (a: ReturnType<typeof anchor>) => doc.fire("click", { button: 0, composedPath: () => [a] })
    click(anchor("https://ana.storelib.com/shop?sort=new#top", "  Shop\n now "))
    click(anchor("https://ana.storelib.com/shop", "Shop now"))
    click(anchor("https://ana.storelib.com/#reviews", "Reviews"))
    click(anchor("https://instagram.com/ana", "Instagram"))
    click(anchor("https://ana.storelib.com/files/guide.pdf", "Guide", { download: "" }))
    click(anchor("https://ana.storelib.com/about", "About", { "aria-label": "About Ana" }))
    await settle()
    const sent = tab.sent.filter((x) => x.body.eventType === "nav_click")
    check("a link to another page of the site is one nav_click with its target and words; the same one twice, the same page, another site and a download are not", sent.length === 2 && sent[0].beacon && sent[0].body.targetHref === "https://ana.storelib.com/shop" && sent[0].body.label === "Shop now" && sent[1].body.label === "About Ana", sent.map((x) => [x.body.targetHref, x.body.label]))
    const out = await ask(db, { kind: "nav_click", body: sent[0].body, cookies: consent })
    check("  recorded on the website: the page it was on, the page it led to, the words", out.recorded && out.row?.event_type === "nav_click" && out.row?.property_type === "website" && out.row?.property_id === ANA_SITE && out.row?.path === "/" && out.row?.link_url === "/shop" && out.row?.link_label === "Shop now", out.row)
    const twice = await ask(db, { kind: "nav_click", body: sent[0].body, cookies: consent })
    check("  once per visit, page, target and words", twice.reason === "duplicate")
    const other = await ask(db, { kind: "nav_click", body: { ...sent[0].body, targetHref: "https://bee.storelib.com/shop" }, cookies: consent })
    check("  a target on another site is not recorded", !other.recorded && other.reason === "invalid", other)
    const robot = await ask(db, { kind: "nav_click", body: { ...sent[1].body }, ua: "Googlebot/2.1 (+http://www.google.com/bot.html)", cookies: consent })
    check("  a robot is not recorded", !robot.recorded && robot.reason === "bot")
    const anon = await ask(db, { kind: "nav_click", body: { ...sent[1].body } })
    check("  without consent: no ids from the browser, the day's hash instead", anon.recorded && anon.row?.session_id !== "s1" && anon.row?.visitor_id !== "v1" && String(anon.row?.visitor_id ?? "").startsWith("anon"), anon.row)
    const own = await ask(db, { kind: "nav_click", body: { ...sent[1].body }, cookies: { ...consent, "sb-test-auth-token": "x" } })
    check("  the creator on their own site is not a visitor", own.reason === "own")
    const personal = await ask(db, { kind: "nav_click", body: { ...sent[1].body, label: "jane@example.com", targetHref: "https://ana.storelib.com/account" }, cookies: consent })
    check("  words that look like a visitor's details are not kept", personal.recorded && personal.row?.link_label === undefined && personal.row?.link_url === "/account", personal.row)
    check("the route takes nav_click", /const EVENTS = \[[^\]]*"nav_click"/.test(read("app/api/track-event/route.ts")))
    const compat = read("lib/storelib-theme/compat/track-script.ts")
    check("an imported theme's tracker sends nav_click too, with its target and words, once per page and target", /eventType:'nav_click',creatorId:K\.c,href:location\.href,targetHref:th,label:lb\|\|undefined/.test(compat) && /if\(nv\[k\]\)return;nv\[k\]=1/.test(compat))
  }

  console.log("\nA database that has not run part 61")
  {
    clearPropertyCache()
    const db = world({ beforePart53: true })
    const page = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana" }, cookies: consent })
    check("a creator page view is still recorded, the way it was before", page.recorded && views(db).length === 1 && !("property_type" in views(db)[0]), views(db)[0])
    const onepage = await ask(db, { body: { creatorId: ANA, href: "https://storelib.com/ana/links" }, cookies: consent })
    check("a OnePage view waits for the part rather than counting as the creator page", onepage.reason === "not_ready" && views(db).length === 1)
    const click = await ask(db, { kind: "link_click", body: { creatorId: ANA, href: "https://ana.storelib.com/", linkUrl: "https://x.com/ana" }, cookies: consent })
    check("  and so does a link click", click.reason === "not_ready")
  }

  console.log("\nPaths, rollups and the today rule")
  {
    check("a path: no host, query or hash, lower case, no trailing slash", normalizePath("https://Ana.Storelib.com/About//Team/?x=1#y") === "/about/team" && normalizePath("https://a.com") === "/" && normalizePath("/") === "/")
    check("  and at most 300 characters", normalizePath("/" + "a".repeat(400))!.length === 300)
    const sum = sumDailyRows([
      { day: "2026-09-24", visitors: 3, sessions: 4, page_views: 9, sources: { direct: 3, social_instagram: 1 }, paths: { "/": 5, "/about": 4 } },
      { day: "2026-09-25", visitors: 2, sessions: 2, page_views: 3, sources: { direct: 2 }, paths: { "/": 3 } },
    ])
    check("rollup days add up, maps key by key", sum.page_views === 12 && sum.sessions === 6 && sum.sources.direct === 5 && sum.paths["/"] === 8 && sum.days === 2, sum)
    const split = splitDays("2026-09-22", "2026-09-27", new Set(["2026-09-22", "2026-09-23", "2026-09-26"]), Date.parse("2026-09-26T09:00:00Z"))
    check("a rolled up past day is read from the rollup; a day never rolled up, and today, from the raw rows",
      split.rollup.join() === "2026-09-22,2026-09-23" && split.raw.join() === "2026-09-24,2026-09-25,2026-09-26", split)
    const cron = read("app/api/cron/rollup-daily/route.ts")
    check("the daily cron refreshes the property rollup too", /admin\.rpc\(ROLLUP\.refresh, \{ p_day: date \}\)/.test(cron) && /analytics_refresh_property_day/.test(read("lib/analytics/events.ts")))
    const sql = read("supabase/sql/run-now/61_analytics_one_pipeline.sql")
    check("the refresh deletes the day and counts it again, so a second run changes nothing",
      /DELETE FROM public\.analytics_property_daily WHERE day = p_day AND \(p_creator_id IS NULL OR creator_id = p_creator_id\)/.test(sql) && /pg_advisory_xact_lock/.test(sql))
    check("  tests/analytics-rollup-sql.test.ts runs it against Postgres, and against the raw rows",
      /analytics_refresh_property_day\('2026-09-24'\)/.test(read("tests/fixtures/analytics-sql/rollup_check.sql")) && /rollup_check\.sql/.test(read("tests/analytics-rollup-sql.test.ts")))
  }

  console.log("\nThe trackers on every page")
  {
    const site = read("app/(site)/w/[username]/render-site.tsx")
    check("every website page mounts the tracker (home and every [page])", /<TrackView type="store" creatorId=\{site\.creatorId\} \/>/.test(site))
    check("  and the shop, search, cart and wishlist, which drew none",
      ["products/shop-page.tsx", "search/page.tsx", "cart/page.tsx"].every((f) => /<TrackView creatorId=\{site\.creatorId\} \/>/.test(read(`app/(site)/w/[username]/${f}`))) &&
        /key === "contact" \|\| key === "wishlist"/.test(read("app/(site)/w/[username]/render-account.tsx")))
    const tracker = read("components/analytics/track-view.tsx")
    check("the tracker is keyed by the path, so a route change is a new view", /const pathname = usePathname\(\)/.test(tracker) && /\}, \[creatorId, productId, pathname\]\)/.test(tracker))
    check("  and no longer by the creator alone", !/getPageKey\(|materia_tracked_/.test(tracker + read("lib/analytics-utils.ts")))
    check("a funnel step says which page it happened on", /href: window\.location\.href/.test(read("lib/analytics-utils.ts")))
    const routes = read("lib/analytics/collect-route.ts")
    check("every answer is 204, and nothing in it names the visitor", /new NextResponse\(null, \{ status: 204 \}\)/.test(routes) && !/NextResponse\.json/.test(routes))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
