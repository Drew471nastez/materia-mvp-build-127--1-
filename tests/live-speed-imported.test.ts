/**
 * ===========================================================================
 *  AN IMPORTED THEME'S LIVE SITE, HELD FOR EVERY VISITOR IT CAN BE (OCT 21)
 * ===========================================================================
 * The owner: andrewrullz.storelib.com (an imported Shopify theme) takes about
 * six seconds to open, and moving between its pages is slow. What this holds:
 *
 *   COOKIES     a page is somebody's only for a cookie Storelib's server
 *               draws it from. Storelib's own tracker set two cookies on a
 *               visitor's first page (sl_asid, materia_visitor), the consent
 *               choice is a cookie, and a theme and its apps set their own:
 *               each made every later page private, drawn whole for that
 *               visitor alone, never from the CDN or the held copy
 *   PROXY       the questions a page asks before it is routed start
 *               together, and the name's creator, install, languages,
 *               markets and domain come back in one round trip (SQL part
 *               257, site_route_facts): one round trip in a row on a cold
 *               server for an imported theme's subdomain page (six before)
 *   DRAW        what needs only the creator is read beside the install, the
 *               languages and the store's tags beside the site: a cold page
 *               14 round trips in a row (20 before), a cold product page 16
 *               (24); a held page costs no round trip, and neither does a
 *               returning visitor's next page
 *   HEADERS     a stranger's page: public, a minute on the CDN, never by
 *               cookie; a page with a cart stays private
 *
 * Over the fake PostgREST of scripts/speed18 and Next's cache as Next keeps
 * it, with the posture fixture theme stored as Maya's published install.
 * scripts/measure-speed18.mjs prints the same visits before and after
 * (ONLY="site visit: first page"…), and scripts/check-live-speed.mjs asks a
 * live site the same questions over the network.
 *
 * Run with:  pnpm test:push
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { fakeFetch, setRtt, useFixture } from "../scripts/speed18/fake-postgrest"
import { visit, type Trip } from "../scripts/speed18/context"
import { buildFixture, SITE } from "../scripts/speed18/fixture"
import * as nextCache from "../scripts/speed18/shims/next-cache"
import * as nextHeaders from "../scripts/speed18/shims/next-misc"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* Code without its comments, so a sentence about a thing is never taken for the thing. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"
;(globalThis as { fetch: typeof fetch }).fetch = fakeFetch as typeof fetch
;(globalThis as { __PUSH_TEST_NEXT_CACHE__?: unknown }).__PUSH_TEST_NEXT_CACHE__ = nextCache
;(globalThis as { __PUSH_TEST_NEXT_HEADERS__?: unknown }).__PUSH_TEST_NEXT_HEADERS__ = nextHeaders
/* Every clock moves with the cache's, so the proxy's half minute answers run out when the test says so. */
Date.now = nextCache.clock.now

/** Each round trip takes this long here, so trips that wait on each other start at least this far apart. */
const RTT = 30
const settle = () => Promise.allSettled(nextCache.pending.splice(0))

/**
 * Round trips in a row: the visitor's trips by when each started, a new one
 * counted whenever a trip starts at least half a round trip after the one
 * before (it waited on something). Trips asked together start together.
 */
function inARow(trips: Trip[]): number {
  const at = trips.filter((t) => !t.background).map((t) => t.at).sort((a, b) => a - b)
  let waves = 0
  let last = -Infinity
  for (const t of at) {
    if (t - last >= RTT / 2) waves++
    last = t
  }
  return waves
}

/* ── The posture fixture theme as Maya's published install, on her subdomain alone ── */

async function postureTheme() {
  const { convertShopifyTheme } = await import("@/lib/storelib-theme/shopify/convert")
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error((r as { error: string }).error)
  return r.theme
}

function compatFixture(theme: Awaited<ReturnType<typeof postureTheme>>) {
  const f = buildFixture()
  const st = f.tables.store_theme_settings.find((r) => r.install_id === SITE.installId)!
  st.settings = { ...theme.settings }
  st.draft_settings = { ...theme.settings }
  f.tables.store_theme_custom_files = Object.entries(theme.files).map(([path, content], i) => ({ id: `f${i}`, install_id: SITE.installId, path, content, draft_content: null }))
  f.tables.store_theme_pages = [
    ...f.tables.store_theme_pages.filter((r) => r.install_id !== SITE.installId),
    ...theme.pages.map((p, i) => ({ id: `p${i}`, install_id: SITE.installId, page_key: p.page_key, sections: p.sections, draft_sections: null })),
  ]
  /* andrewrullz's shape: a storelib.com subdomain, no domain of its own. */
  f.tables.custom_domains = f.tables.custom_domains.filter((r) => r.creator_id !== SITE.creatorId)
  return f
}

const RETURNING = "_ga=GA1.1.5; materia_visitor=v_abc; sl_asid=s_def; storelib_consent=2.p0.a1.x; __kla_id=eyJ; recently_viewed=a,b"

/** What the proxy did with a request: where it rewrote it to, and the headers it sent on. */
async function throughProxy(url: string, cookie?: string) {
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const headers: Record<string, string> = { host: new URL(url).host, "user-agent": "Mozilla/5.0 (iPhone)", accept: "text/html", "sec-fetch-dest": "document", ...(cookie ? { cookie } : {}) }
  const res = (await proxy(new NextRequest(url, { headers }) as never)) as Response
  const to = res.headers.get("x-middleware-rewrite")
  const sent = new Headers(headers)
  for (const name of (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((n) => n.trim()).filter(Boolean)) {
    const v = res.headers.get(`x-middleware-request-${name}`)
    if (v === null) sent.delete(name)
    else sent.set(name, v)
  }
  return { res, to, sent }
}

/** A whole page as Vercel runs it: the proxy, then the route it rewrote to with the headers it set. */
async function siteVisit(url: string, cookie?: string) {
  const { to, sent, res } = await throughProxy(url, cookie)
  if (!to) return { status: res.status, cache: res.headers.get("cache-control"), held: null as string | null, marked: false, body: "" }
  const at = new URL(to)
  const m = at.pathname.match(/^\/api\/site-theme\/site\/([^/]+)\/?(.*)$/)
  if (!m) return { status: -1, cache: null, held: null, marked: false, body: at.pathname }
  const route = await import("@/app/api/site-theme/site/[username]/[[...path]]/route")
  const { NextRequest } = await import("next/server")
  const path = m[2] ? m[2].split("/").map(decodeURIComponent) : []
  const answer = (await route.GET(new NextRequest(at, { headers: sent }) as never, { params: Promise.resolve({ username: m[1], path }) })) as Response
  return { status: answer.status, cache: answer.headers.get("cache-control"), vary: answer.headers.get("vary"), held: answer.headers.get("x-storelib-held"), marked: !!path[0]?.startsWith("~anon~"), body: await answer.text() }
}

/* ── 1. Which cookies make a page somebody's ────────────────────────────── */

async function cookies() {
  section("Which cookies make an imported theme's page somebody's (lib/storelib-theme/compat/anonymous-cache.ts)")
  const { pageCookie, strangerCookies, strangerPage } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  for (const name of ["sl_asid", "materia_visitor", "storelib_consent", "materia_session", "sl_lang", "sl_suggest"]) check(`Storelib's ${name} draws nothing`, !pageCookie(name))
  for (const name of ["_ga", "_ga_ABC123", "_fbp", "__kla_id", "recently_viewed", "_shopify_y", "cart_currency", "visitor_id", "cookieyes-consent", "__cf_bm"]) check(`  nor does ${name}, which no Storelib server code reads`, !pageCookie(name))
  for (const name of ["sl_theme_cart", "sl_country", "sl_wishlist", "sl_signed_in", "__Host-sl_site_session", "__Host-sl_site_pending", "__Host-sl_site_pass", "sl_checkout_country", "storelib_code_hold", "sb-abcdefgh-auth-token", "sl_brand_new", "storelib_language", "materia_guest_id"])
    check(`${name} keeps a page private`, pageCookie(name))
  check("a returning visitor with Storelib's ids, the consent choice and a theme app's cookies is a stranger", strangerCookies(RETURNING))
  check("  with a cart too, they are not", !strangerCookies(`${RETURNING}; sl_theme_cart=abc`))
  const base = { method: "GET", path: "/products/hat", query: new URLSearchParams(), cookie: RETURNING, accept: "text/html", contentType: null, requestedWith: null, protectedSite: false, offersLanguage: false }
  check("so the proxy may send their page to the held address", strangerPage(base))
  check("  never their cart, account or search", !strangerPage({ ...base, path: "/cart" }) && !strangerPage({ ...base, path: "/account" }) && !strangerPage({ ...base, path: "/search" }))
}

/* ── 2. The headers a page is sent with ─────────────────────────────────── */

async function headers() {
  section("What a page says about how it may be kept")
  const { PUBLIC_PAGE_CACHE } = await import("@/lib/storelib-theme/compat/anonymous-cache")
  /* Changed on purpose: main moved a stranger's page from the CDN to the server's hold, which Publish expires at once (anonymous-cache.ts, "No longer the CDN's"). The cookie rule above still decides who reaches that hold. */
  /* Changed on purpose (r53): and by the CDN, under the same tags (tests/site-speed-r53.test.ts). */
  check("a stranger's page: held on the server under the site's tag; the browser told private", PUBLIC_PAGE_CACHE === "private, no-cache")
}

/* ── 3. Round trips, and where each page went ────────────────────────────── */

async function roundTrips() {
  section("A page of an imported theme's subdomain: round trips and where it was answered")
  const theme = await postureTheme()
  nextCache.resetCache()
  useFixture(compatFixture(theme))
  setRtt(RTT)

  const routed = await visit(() => throughProxy("https://maya.storelib.com/products/maya-product-3"))
  await settle()
  check("the proxy routes a stranger's page to the held address", !!routed.value?.to && /\/api\/site-theme\/site\/maya\/~anon~maya\.storelib\.com~/.test(routed.value.to), routed.value?.to)
  check(`  on a cold server, one round trip in a row before it is routed (it was 6): site_route_facts (SQL part 257) beside the AI site question`, inARow(routed.trips) <= 1, { inARow: inARow(routed.trips), tables: routed.trips.map((t) => t.table) })
  check("  and at most 3 in all", routed.foreground <= 3, routed.trips.map((t) => t.table))

  /* A database where part 257 has not run: the rows, as before, still asked together. */
  const { forgetSiteFacts } = await import("@/lib/website-builder/route-facts")
  forgetSiteFacts()
  nextCache.clock.advance(120_000)
  const without = compatFixture(theme)
  delete without.rpc!.site_route_facts
  useFixture(without)
  const rows = await visit(() => throughProxy("https://maya.storelib.com/collections/maya-best"))
  await settle()
  check("without part 257 it routes the same way", !!rows.value?.to && /~anon~maya\.storelib\.com~/.test(rows.value.to), rows.value?.to)
  check("  in at most 5 round trips in a row: the one that finds no function, then the rows (6 before, with no function to ask)", inARow(rows.trips) <= 5, { inARow: inARow(rows.trips), tables: rows.trips.map((t) => t.table) })
  forgetSiteFacts()
  useFixture(compatFixture(theme))

  const first = await visit(() => siteVisit("https://maya.storelib.com/collections/maya-best"))
  await settle()
  /* Changed on purpose: main keeps a stranger's page in the server's hold, not the CDN (anonymous-cache.ts), so it is sent private. */
  check("the first stranger's page is drawn: 200, marked for the hold, sent private", first.value?.status === 200 && first.value.cache === "private, no-cache" && first.value.marked, first.value && { status: first.value.status, cache: first.value.cache, marked: first.value.marked })
  /* Changed on purpose (creator blogs, P3): +5, the blog's reads (lib/site-blog/public-read.ts blogData), all at once beside the install and held five minutes under the blog's tag, "no blog" included; none of them in a row. */
  check("  within 65 round trips on a cold server", first.foreground <= 65, first.foreground)
  check("  at most 16 of them in a row (it was 20)", inARow(first.trips) <= 16, { inARow: inARow(first.trips), tables: first.trips.map((t) => t.table) })
  console.log(`        measured: ${first.foreground} round trips, ${inARow(first.trips)} in a row, for a cold first page`)

  const again = await visit(() => siteVisit("https://maya.storelib.com/collections/maya-best"))
  await settle()
  check("the next stranger's copy is the held one and costs no round trip", again.value?.held === "hit" && again.foreground === 0, { held: again.value?.held, trips: again.trips.map((t) => t.table) })

  const returning = await visit(() => siteVisit("https://maya.storelib.com/collections/maya-best", RETURNING))
  await settle()
  check("a returning visitor's next page is the same held copy: no round trip", returning.value?.marked === true && returning.value.held === "hit" && returning.foreground === 0 && returning.value.cache === "private, no-cache", { marked: returning.value?.marked, held: returning.value?.held, trips: returning.trips.map((t) => t.table), cache: returning.value?.cache })
  check("  and the same page a stranger gets", returning.value?.body === again.value?.body)

  const cart = await visit(() => siteVisit("https://maya.storelib.com/collections/maya-best", `${RETURNING}; sl_theme_cart=`))
  await settle()
  check("a visitor with a cart is drawn for them, and it stays private", cart.value?.marked === false && cart.value.held === null && /^private/.test(cart.value.cache ?? ""), cart.value && { marked: cart.value.marked, cache: cart.value.cache })

  /* A product page on a cold cache: its description and its variants' facts are read together now. */
  nextCache.resetCache()
  const product = await visit(() => siteVisit("https://maya.storelib.com/products/maya-product-3", `${RETURNING}; sl_theme_cart=`))
  await settle()
  check("a cold product page drawn for a visitor with a cart answers", product.value?.status === 200, product.value?.status)
  check(`  at most 18 round trips in a row on a cold cache (it was 24)`, inARow(product.trips) <= 18, { inARow: inARow(product.trips), tables: product.trips.map((t) => t.table) })
  console.log(`        measured: ${product.foreground} round trips, ${inARow(product.trips)} in a row, for a cold product page`)
  setRtt(0)
}

/* ── 4. The reads that start together ───────────────────────────────────── */

function together() {
  section("What a draw needs that depends only on the creator is asked at once")
  const site = code("lib/website-builder/compat-site.ts")
  check("the release, physical goods, the currency and the website's address start beside the install", /const releaseAsked = live \? quiet\(liveRelease\(/.test(site) && /const physicalAsked = quiet\(isPhysicalCommerceEnabled\(\)/.test(site) && /const currencyAsked = quiet\(cachedStoreCurrency\(/.test(site) && /const originAsked = live \? quiet\(siteOrigin\(/.test(site))
  check("  and the install is read after they have started", site.indexOf("const releaseAsked") < site.indexOf("readInstall(admin, creator.creatorId)"))
  /* Changed on purpose (round BC): Settings › Taxes' prices-include-tax is read in the same Promise.all. */
  check("the returns line and the free shipping facts are read together", /const \[returnFacts, facts(, taxesIncluded)?\] = await Promise\.all\(\[/.test(site))
  check("a product's description and its variants' facts are read together", /* Changed on purpose (round AF): the product's offers are read beside them too. */ /const \[found, pageFacts, offers\] = await Promise\.all\(\[/.test(site))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the route asks the languages and the store's tags beside the site", /const languagesAsked = creatorAsked \?/.test(route) && /const trackingAsked = creatorAsked && pageAsked \?/.test(route) && route.indexOf("const languagesAsked") < route.indexOf("await compatSiteByName("))
  check("  each used only for the site that was found", /forSite\(languagesAsked, found\.site\.creatorId\)/.test(route) && /forSite\(trackingAsked, found\.site\.creatorId\)/.test(route))
  const proxy = code("proxy.ts")
  const sub = proxy.indexOf("const gateAsked = startSiteQuestions(request, subdomain")
  check("the proxy starts a subdomain page's questions before it asks about the website's domain", sub > 0 && sub < proxy.indexOf("const domain = await websiteDomainOf(subdomain)"))
  check("  the languages and markets among them, one read shared with the rewrite", /void siteLocalizationFor\(name\)/.test(proxy) && /const localizationAsked = new Map/.test(proxy))
}

async function main() {
  await cookies()
  await headers()
  await roundTrips()
  together()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
