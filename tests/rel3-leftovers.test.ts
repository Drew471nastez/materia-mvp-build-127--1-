/**
 * ===========================================================================
 *  RELIABILITY WAVE 3, THE LEFTOVERS (round rel3-leftovers)
 * ===========================================================================
 *   SMOKE-APP  the signed out redirect from /app (and /sell) is never kept by
 *              a shared cache: "private, no-store", through the real proxy.
 *   SEC-11     /signup/verify carries the account id, never the email
 *              address: every redirect and the VERIFY_EMAIL email link; the
 *              page shows the address from this tab or the session, still
 *              takes an old link's `email` and takes it off the address bar.
 *   SHOP-EMPTY a shop read that failed is never held as an empty shop: the
 *              held readers throw, a cache keeps nothing, the site is served
 *              from its last good copy (or drawn without products, unheld).
 *   SITE-8     a cold server that cannot read which renderer a subdomain
 *              needs answers 503 "One moment" with Retry-After, never a guess.
 *   CSP        still report only on every host, nothing enforced, and the
 *              readiness note says where reports go and the exact switch.
 *
 * Each section names the finding it pins (docs/reliability/AUDIT.md).
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

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
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fixture.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-fixture-key"
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-fixture-key"
process.env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
process.env.NEXT_PUBLIC_SITE_URL = "https://storelib.com"

/** Nothing here may reach the network: every request answers 503 and is counted. */
const network: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  network.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  return new Response(JSON.stringify({ message: "offline fixture" }), { status: 503, headers: { "content-type": "application/json" } })
}) as typeof fetch

/* ── SMOKE-APP ───────────────────────────────────────────────────────────── */

async function signedOutRedirectsArePrivate() {
  console.log("\nSMOKE-APP. The sign in redirect from /app is the visitor's own answer, never a shared cache's")
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const ask = async (url: string) => {
    const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, accept: "text/html" } }) as never)) as Response
    return { status: res.status, location: res.headers.get("location"), cache: res.headers.get("cache-control") }
  }
  const app = await ask("https://storelib.com/app")
  check("/app signed out: a 307 to /login carrying the page", app.status === 307 && /\/login\?next=%2Fapp$/.test(app.location ?? ""), app)
  check("  marked private, no-store (Vercel's default was public, max-age=0)", app.cache === "private, no-store", app)
  const deep = await ask("https://storelib.com/app/products?tab=drafts")
  check("/app/products signed out: the same", deep.status === 307 && deep.cache === "private, no-store", deep)
  const sell = await ask("https://storelib.com/sell")
  check("/sell signed out: a 307 to sign up, private, no-store", sell.status === 307 && /\/signup\?intent=sell/.test(sell.location ?? "") && sell.cache === "private, no-store", sell)
}

/* ── SEC-11 ──────────────────────────────────────────────────────────────── */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (f === "node_modules" || f.startsWith(".")) return []
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}

async function verifyLinksCarryNoAddress() {
  console.log("\nSEC-11. The sign up code page is opened by account id, never with the email address in its URL")
  const v = await import("@/lib/account/verify-address")
  const mem = new Map<string, string>()
  const fake = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, val: string) => void mem.set(k, val) }
  v.rememberVerifyAddress("u-1", "maya@example.com", fake)
  check("the address typed on signup or login is kept in this tab for that account", v.recallVerifyAddress("u-1", fake) === "maya@example.com")
  check("  and never handed to another account id", v.recallVerifyAddress("u-2", fake) === "")
  check("  no storage (private mode): nothing, no throw", v.recallVerifyAddress("u-1", null) === "" && (v.rememberVerifyAddress("u-1", "a@b.co", null), true))
  check("an old link's email comes off the address bar, the account id, code and carry stay",
    v.addressWithoutEmail("https://storelib.com/signup/verify?userId=u-1&email=maya%40example.com&code=123456&intent=sell") === "/signup/verify?userId=u-1&code=123456&intent=sell")
  check("  a link without one is left alone", v.addressWithoutEmail("https://storelib.com/signup/verify?userId=u-1") === null)
  check("the page shows the address masked", v.maskedAddress("maya@example.com") === "ma**@example.com")
  check("signupVerifyPath is the account id only", v.signupVerifyPath("u 1") === "/signup/verify?userId=u%201")

  const { CATALOG, Data } = await import("@/lib/notify/templates/catalog")
  const mail = CATALOG.VERIFY_EMAIL(new Data({ userId: "u-1", email: "maya@example.com" }) as never, {} as never) as { action?: { path: string }; inApp?: { actionPath?: string } }
  check("the VERIFY_EMAIL email's button opens the code page by account id, even when sent an address",
    mail.action?.path === "/signup/verify?userId=u-1" && mail.inApp?.actionPath === "/signup/verify?userId=u-1", mail.action)

  /* Every place that writes the address outside lib/auth (which the auth branch owns, see the log). */
  const writers = [...walk(join(process.cwd(), "app")), ...walk(join(process.cwd(), "lib")), ...walk(join(process.cwd(), "components"))]
    .map((f) => relative(process.cwd(), f))
    .filter((f) => !f.startsWith("lib/auth/"))
    .filter((f) => /signup\/verify\?[^`"'\n]*email=/.test(read(f)))
  check("no redirect or link outside lib/auth puts email= on /signup/verify", writers.length === 0, writers)

  const page = read("app/(auth)/signup/verify/page.tsx")
  check("the page asks for a code by account id only (the server mails the account's own address)",
    (page.match(/JSON\.stringify\(\{ userId \}\)/g) ?? []).length === 2 && !/JSON\.stringify\(\{ userId, email \}\)/.test(page))
  check("  opens without an address in its URL (only the account id is required)", /if \(!userId\) \{/.test(page) && !/!userId \|\| !email/.test(page))
  check("  still reads an old link's email once, then replaces the address without it",
    /useState\(\(\) => searchParams\.get\("email"\) \?\? ""\)/.test(page) && /addressWithoutEmail\(window\.location\.href\)/.test(page) && /window\.history\.replaceState/.test(page))
  check("  shows the session's address only when the session is this account", /user\?\.id === userId && user\.email/.test(page))
  check("  logs nothing about it", !/console\.(log|warn|error|info)\([^)]*email/.test(page))
  check("signup and login remember the typed address before opening the page",
    /rememberVerifyAddress\(data\.user\.id, trimmedEmail\)/.test(read("app/(auth)/signup/page.tsx")) && /rememberVerifyAddress\(userData\.id, trimmedEmail\)/.test(read("app/(auth)/login/page.tsx")))
}

/* ── SHOP-EMPTY ─────────────────────────────────────────────────────────── */

/** A Supabase stand-in: every query chain resolves to `answer`, whatever it was asked. */
function fakeDb(answer: () => { data: unknown; error: unknown; count?: number | null }) {
  const chain: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve().then(answer).then(ok, bad)
      return () => chain
    },
    apply() {
      return chain
    },
  })
  return { from: () => chain, rpc: () => chain }
}

async function failedShopReadsAreNotHeld() {
  console.log("\nSHOP-EMPTY. A failed shop read is never held as an empty shop")
  const shop = await import("@/lib/website-builder/shop-products")
  const down = fakeDb(() => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }))
  const creator = "5b1f3c1e-8a1b-4c55-9a3e-1f2d3c4b5a69"
  check("shopProducts (a section drawn once) still answers [] when the read failed", (await shop.shopProducts(down as never, creator)).length === 0)
  const threw = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => e)
  const e1 = await threw(shop.heldShopProducts(down as never, creator))
  check("heldShopProducts throws ShopReadFailed instead (so unstable_cache keeps nothing)", e1 instanceof shop.ShopReadFailed && /57014/.test((e1 as Error).message), String(e1))
  const e2 = await threw(shop.heldShopCatalogue(down as never, creator))
  check("  and heldShopCatalogue", e2 instanceof shop.ShopReadFailed, String(e2))
  const broken = { from: () => { throw new Error("socket hang up") } }
  const e3 = await threw(shop.heldShopProducts(broken as never, creator))
  check("  a read that threw is a ShopReadFailed too", e3 instanceof shop.ShopReadFailed && /socket hang up/.test((e3 as Error).message), String(e3))
  const none = fakeDb(() => ({ data: [], error: null }))
  check("a shop that really has no products is still [] (held, as before)", (await shop.heldShopProducts(none as never, creator)).length === 0)
  check("no creator id: [] without a read, as before", (await shop.heldShopProducts(down as never, "")).length === 0)

  const site = read("lib/website-builder/published-site.ts")
  /* The reader named in the 160 characters before each cache key. */
  const readersFor = (key: string) =>
    [...site.matchAll(new RegExp(`\\["${key}"`, "g"))].map((m) => (site.slice(Math.max(0, m.index! - 160), m.index).match(/(\w*[sS]hop(?:Products|Catalogue))\(/g) ?? []).pop()?.slice(0, -1) ?? "?")
  const products = readersFor("shop-products")
  check("every cache entry named shop-products is filled by heldShopProducts", products.length >= 2 && products.every((r) => r === "heldShopProducts"), products)
  const catalogue = readersFor("shop-catalogue")
  check("  and shop-catalogue by heldShopCatalogue", catalogue.length === 1 && catalogue[0] === "heldShopCatalogue", catalogue)
  check("the site lookup turns a failed shop into SiteWithoutShop, which resolveSite answers only after the last good copies",
    /if \(e instanceof ShopReadFailed\) throw new SiteWithoutShop/.test(site)
      && site.indexOf("if (e instanceof SiteWithoutShop)") > site.indexOf("sharedCopy<ShopLookup>(SHARED_SITE")
      && site.indexOf("if (e instanceof SiteWithoutShop)") > site.indexOf("const held = lastGood.get(lower)"))
  check("  and never remembers that site as a last good copy", !/lastGood\.remember\([^)]*e\.lookup/.test(site))
  check("every caller of the held catalogue falls back to what it has",
    /siteCatalogue\(creator\.creatorId, \{ cached: !draft \}\)\.catch\(/.test(read("lib/website-builder/compat-site.ts"))
      && ["app/(site)/w/[username]/search/page.tsx", "app/(site)/w/[username]/products/shop-page.tsx", "app/(site)/w/[username]/collections/[handle]/collection-page.tsx"].every((f) => /siteCatalogue\(site\.creatorId\)[^\n]*\.catch\(\(\) => products \?\? \[\]\)/.test(read(f))))
}

/* ── SITE-8 ─────────────────────────────────────────────────────────────── */

async function coldRoutingSaysTryAgain() {
  console.log("\nSITE-8. A cold server that cannot read a subdomain's routing answers 503, never the wrong renderer")
  const { proxy } = await import("@/proxy")
  const { NextRequest } = await import("next/server")
  const ask = async (url: string, accept = "text/html") => {
    const before = network.length
    const res = (await proxy(new NextRequest(url, { headers: { host: new URL(url).host, accept, "sec-fetch-dest": "document" } }) as never)) as Response
    return { status: res.status, retry: res.headers.get("retry-after"), cache: res.headers.get("cache-control"), rewrite: res.headers.get("x-middleware-rewrite"), reads: network.length - before }
  }
  /* Every database read fails (the fixture's fetch answers 503) and this process has held nothing for this name. */
  const home = await ask("https://maya-cold.storelib.com/")
  check("the site's front page: 503, Retry-After, no-store (it was rewritten to the Storelib theme renderer)", home.status === 503 && home.retry === "5" && home.cache === "no-store" && !home.rewrite, home)
  check("  the database was asked (a real cold read, not a short cut)", home.reads > 0, home)
  const page = await ask("https://maya-cold.storelib.com/collections/all")
  check("a page under it too", page.status === 503 && !page.rewrite, page)
  const icon = await ask("https://maya-cold.storelib.com/favicon.ico", "image/*")
  check("its icon too (an AI site keeps its own)", icon.status === 503, icon)
  const api = await ask("https://maya-cold.storelib.com/api/cart", "application/json")
  check("its /api is not a page and passes as before", api.status !== 503, api)
  const own = await ask("https://storelib.com/pricing")
  check("Storelib's own pages are not site routing and are untouched", own.status !== 503, own)

  const proxySource = read("proxy.ts")
  check("an answer held from before is still used when the read fails (only nothing held is unavailable)",
    /if \(fresh\.failed\) return held \? held\.value : "unavailable"/.test(proxySource) && /if \(failed\) return hit \? hit\.value : "unavailable"/.test(proxySource))
  check("every other caller still reads it as no, as before", /return \(await rememberedAnswer\(key, ask\)\) === true/.test(proxySource) && /return \(await liveAiSiteAnswer\(slug\)\) === true/.test(proxySource) && /return \(await compatSiteAnswer\(username, fresh\)\) === true/.test(proxySource))
}

/* ── CSP ─────────────────────────────────────────────────────────────────── */

async function cspStaysReportOnly() {
  console.log("\nCSP. Report only, with a written way to enforce it later")
  const vercel = JSON.parse(read("vercel.json")) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
  const keys = vercel.headers.flatMap((h) => h.headers.map((x) => x.key))
  const { CONTENT_SECURITY_POLICY, CSP_REPORT_PATH } = await import("@/lib/security/csp")
  check("vercel.json sends the policy report only, and enforces none", keys.includes("Content-Security-Policy-Report-Only") && !keys.includes("Content-Security-Policy"))
  check("  the same policy as lib/security/csp.ts, reporting to /api/csp-report", read("vercel.json").includes(CONTENT_SECURITY_POLICY) && CONTENT_SECURITY_POLICY.endsWith(`report-uri ${CSP_REPORT_PATH}`))
  const doc = read("docs/reliability/SECURITY.md")
  const note = doc.slice(doc.indexOf("## 6. CSP readiness"))
  check("SECURITY.md has the readiness note: where reports go, how to review them, the switch",
    doc.includes("## 6. CSP readiness") && note.includes("/api/csp-report") && note.includes("[csp] would have blocked") && note.includes("CSP_REPORT_SAMPLE_RATE") && /rename the key[\s\S]*"Content-Security-Policy"/.test(note) && /\^\(www\\\\\.\)\?storelib/.test(note))
  check("  and the log line it names is the one the route writes", read("app/api/csp-report/route.ts").includes("[csp] would have blocked"))
}

async function run() {
  await signedOutRedirectsArePrivate()
  await verifyLinksCarryNoAddress()
  await failedShopReadsAreNotHeld()
  await coldRoutingSaysTryAgain()
  await cspStaysReportOnly()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
