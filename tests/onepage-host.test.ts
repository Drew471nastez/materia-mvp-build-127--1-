/**
 * ===========================================================================
 *  storelib.me/{name}: THE NAME RULES, THE HOST ROUTING, THE ADDRESS
 * ===========================================================================
 * "Nobody wants to put a long link in their bio." A OnePage is
 * https://storelib.me/{name} now. Pinned here, without a server:
 *
 *   THE NAME        lib/onepage/username: what may be picked (lower case,
 *                   3 to 30, letters, numbers and single hyphens, no
 *                   reserved, impersonating or offensive word) and what
 *                   still resolves (older pages keep answering).
 *   THE ADDRESS     lib/onepage/address onePageUrl, and every helper in
 *                   lib/url-helpers that hands the address out.
 *   THE ROUTING     lib/onepage/host-route onePageRoute, the function
 *                   proxy.ts obeys: storelib.me/x renders, /X is lower cased,
 *                   the old storelib.com addresses 308 here with their
 *                   query, /app, /api and the rest never answer on
 *                   storelib.me, and creator stores and connected domains
 *                   are left exactly as they were.
 *   THE PROXY       proxy.ts asks it before anything else and reads no
 *                   session for it.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  ONEPAGE_NAME_MAX,
  checkOnePageName,
  exactIlike,
  isReservedOnePageName,
  isResolvableOnePageName,
  normalizeOnePageName,
} from "@/lib/onepage/username"
import { getOnePageDomain, isOnePageHost, onePageUrl, onePageUrlDisplay } from "@/lib/onepage/address"
import { ONEPAGE_MISSING_PATH, onePageRobots, onePageRoute, type OnePageRoute } from "@/lib/onepage/host-route"
import { getLinksShareUrl, getLinksUrl, getLinksUrlDisplay, getLinksUrlWithCustomDomain, isLinksPage } from "@/lib/url-helpers"
import { checkPageSlug } from "@/lib/onepage/settings-rules"
import { describePage } from "@/lib/orders/checkout-origin"
import { isInternalReferrer } from "@/lib/analytics/sources"
import { parseSitemapName } from "@/lib/seo/sitemaps"

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
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const PLATFORM_SUBS = ["www", "app", "api", "admin", "dashboard", "localhost", "domains", "mcp"]
const route = (host: string, pathAndQuery: string, extra: { method?: string; userAgent?: string } = {}): OnePageRoute | null => {
  const q = pathAndQuery.indexOf("?")
  return onePageRoute({
    host,
    pathname: q === -1 ? pathAndQuery : pathAndQuery.slice(0, q),
    search: q === -1 ? "" : pathAndQuery.slice(q),
    method: extra.method ?? "GET",
    userAgent: extra.userAgent ?? "Mozilla/5.0",
    mainDomain: "storelib.com",
    platformSubdomains: PLATFORM_SUBS,
  })
}
const show = (r: OnePageRoute | null) => JSON.stringify(r)
const isRewrite = (r: OnePageRoute | null, path: string) => r?.kind === "rewrite" && r.path === path
const isRedirect = (r: OnePageRoute | null, location: string, status = 308) => r?.kind === "redirect" && r.location === location && r.status === status
const isMissing = (r: OnePageRoute | null, api = false) => r?.kind === "not-found" && r.api === api && r.path === ONEPAGE_MISSING_PATH

/* ─── The name ──────────────────────────────────────────────────────── */

function names() {
  console.log("\nWhat may be picked")
  check("lower cased, a leading @ and a pasted storelib.me/ taken off", normalizeOnePageName("  @Mara-Lind ") === "mara-lind" && normalizeOnePageName("https://storelib.me/Mara/") === "mara")
  const ok = checkOnePageName("Mara-Lind")
  check("a good name comes back lower case", ok.ok && ok.value === "mara-lind", show(ok as never))
  check("three characters is enough, two is not", checkOnePageName("abc").ok && !checkOnePageName("ab").ok)
  check(`${ONEPAGE_NAME_MAX} characters is enough, one more is not`, checkOnePageName("a".repeat(30)).ok && !checkOnePageName("a".repeat(31)).ok)
  const refused: Array<[string, string]> = [
    ["", "empty"],
    ["ma ra", "characters"],
    ["mara_lind", "characters"],
    ["mara.lind", "characters"],
    ["märа", "characters"],
    ["-mara", "edges"],
    ["mara-", "edges"],
    ["ma--ra", "double"],
    ["app", "reserved"],
    ["admin", "reserved"],
    ["api", "reserved"],
    ["www", "reserved"],
    ["help", "reserved"],
    ["support", "reserved"],
    ["login", "reserved"],
    ["signup", "reserved"],
    ["storelib", "reserved"],
    ["settings", "reserved"],
    ["static", "reserved"],
    ["assets", "reserved"],
    ["links", "reserved"],
    ["onepage", "reserved"],
    ["storelib-support", "reserved"],
    ["official-help", "reserved"],
    ["checkout", "reserved"],
    ["sitemap", "reserved"],
  ]
  for (const [name, problem] of refused) {
    const v = checkOnePageName(name)
    check(`"${name}" is refused (${problem})`, !v.ok && v.problem === problem, show(v as never))
  }
  check("an innocent word that contains a refused one is not refused", checkOnePageName("supportive").ok && checkOnePageName("classic-shop").ok && checkOnePageName("administrate").ok)
  check("every refusal is a sentence saying what to do", refused.every(([n]) => { const v = checkOnePageName(n); return !v.ok && /^[A-Z][^.]*$/.test(v.error) && !/username/i.test(v.error) }))
  check("reserved and link farm names read the same, so the reason is not handed out", (checkOnePageName("app") as any).error === "That name is not available")
  check("the reserved list includes the host's own files", isReservedOnePageName("robots-txt") && isReservedOnePageName("links"))
  check("the editor's page address check is this check", checkPageSlug("Satori-Prints").ok && (checkPageSlug("Satori-Prints") as any).value === "satori-prints" && (checkPageSlug("ab") as any).error === "Use at least 3 characters")

  console.log("\nWhat still resolves")
  check("a name that meets today's rules resolves", isResolvableOnePageName("mara-lind"))
  check("so does an older page's address with an underscore, a dot or two letters", isResolvableOnePageName("mara_lind") && isResolvableOnePageName("mara.lind") && isResolvableOnePageName("ml") && isResolvableOnePageName("a1b2c3d4"))
  check("upper case resolves (and is sent to lower case first)", isResolvableOnePageName("LucaDragoste"))
  const never = ["", ".", "..", "../app", "a/b", "a..b", ".env", "-x", "x-", "_x", "a b", "a%2fb", "x".repeat(65), "<script>", "a\\b", "ä"]
  check("nothing that could be a path, a file trick or markup resolves", never.every((n) => !isResolvableOnePageName(n)), never.filter(isResolvableOnePageName).join(", "))
  check("a lookup in any case keeps _ and % literal", exactIlike("a_b%c") === "a\\_b\\%c")
}

/* ─── The address ───────────────────────────────────────────────────── */

function address() {
  console.log("\nThe address handed out")
  check("the host is storelib.me", getOnePageDomain() === "storelib.me")
  check("onePageUrl is https://storelib.me/{name}, lower case", onePageUrl("LucaDragoste") === "https://storelib.me/lucadragoste" && onePageUrl("@mara") === "https://storelib.me/mara")
  check("shown without the scheme", onePageUrlDisplay("Mara") === "storelib.me/mara")
  check("no name is the host alone", onePageUrl("") === "https://storelib.me")
  check("the share, copy and QR address is it", getLinksShareUrl("Mara") === "https://storelib.me/mara")
  check("the link the web app opens is it", getLinksUrl("mara") === "https://storelib.me/mara")
  check("the line a creator reads is storelib.me/mara", getLinksUrlDisplay("Mara") === "storelib.me/mara" && !getLinksUrlDisplay("mara").includes("https://"))
  check("no share address carries /links or storelib.com any more", ![getLinksShareUrl("mara"), getLinksUrl("mara"), getLinksUrlDisplay("mara")].some((u) => u.includes("/links") || u.includes("storelib.com")))
  check("a creator page on its own domain keeps its OnePage at /links there", getLinksShareUrl("mara", "maralind.com") === "https://www.maralind.com/links" && getLinksUrlWithCustomDomain("mara", "links.maralind.com") === "https://links.maralind.com/links")
  check("storelib.me is the host, exactly: no look-alike", isOnePageHost("storelib.me") && isOnePageHost("STORELIB.ME:443") && !isOnePageHost("www.storelib.me") && !isOnePageHost("evilstorelib.me") && !isOnePageHost("storelib.me.evil.com") && !isOnePageHost("storelib.com"))
  check("on storelib.me one segment is a OnePage", isLinksPage("/mara", "storelib.me") && !isLinksPage("/mara/x", "storelib.me"))
}

/* ─── The routing ───────────────────────────────────────────────────── */

function routing() {
  console.log("\nstorelib.me")
  check("/mara renders the OnePage from its route", isRewrite(route("storelib.me", "/mara"), "/mara/links"), show(route("storelib.me", "/mara")))
  check("with the query kept for the page", isRewrite(route("storelib.me", "/mara?utm_source=ig&ref=bio"), "/mara/links?utm_source=ig&ref=bio"))
  check("an older address with an underscore or a dot still renders", isRewrite(route("storelib.me", "/mara_lind"), "/mara_lind/links") && isRewrite(route("storelib.me", "/mara.lind"), "/mara.lind/links"))
  check("/LucaDragoste is sent to /lucadragoste, 308", isRedirect(route("storelib.me", "/LucaDragoste"), "https://storelib.me/lucadragoste"))
  check("with its query", isRedirect(route("storelib.me", "/Mara?utm_campaign=x"), "https://storelib.me/mara?utm_campaign=x"))
  check("a trailing slash is sent to the bare name", isRedirect(route("storelib.me", "/mara/"), "https://storelib.me/mara"))
  check("/mara/links and /l/mara on storelib.me are sent to /mara", isRedirect(route("storelib.me", "/mara/links"), "https://storelib.me/mara") && isRedirect(route("storelib.me", "/l/Mara"), "https://storelib.me/mara"))
  check("/mara.links on storelib.me is sent to /mara", isRedirect(route("storelib.me", "/mara.links"), "https://storelib.me/mara"))
  check("the root goes to storelib.com, temporarily", isRedirect(route("storelib.me", "/"), "https://storelib.com/", 307))
  const platform = ["/app", "/app/onepage", "/admin", "/admin/users", "/login", "/signup", "/checkout?productId=1", "/dashboard", "/settings", "/library", "/p/some-product", "/u/mara", "/auth/callback", "/wishlist", "/help"]
  for (const p of platform) {
    const r = route("storelib.me", p)
    check(`${p} is not served on storelib.me: 308 to storelib.com${p}`, isRedirect(r, `https://storelib.com${p}`), show(r))
  }
  check("an address that cannot be a name is a 404 page", isMissing(route("storelib.me", "/a%20b")) && isMissing(route("storelib.me", "/..%2fapp")) && isMissing(route("storelib.me", "/-x")))
  check("a deeper path that is not a OnePage is a 404 page", isMissing(route("storelib.me", "/mara/some/thing")) && isMissing(route("storelib.me", "/mara/prints")))
  check("robots.txt is the host's own and names the host's own sitemap", route("storelib.me", "/robots.txt")?.kind === "robots" && /Sitemap: https:\/\/storelib\.me\/sitemap\.xml/.test(onePageRobots()) && /Disallow: \/api\//.test(onePageRobots()))
  check("sitemap.xml is the OnePage index", isRewrite(route("storelib.me", "/sitemap.xml"), "/sitemap/onepages.xml"))
  check("its files are served as they are; storelib.com's own are sent home", route("storelib.me", "/sitemap/onepages-0.xml")?.kind === "next" && isRedirect(route("storelib.me", "/sitemap/products-0.xml"), "https://storelib.com/sitemap/products-0.xml"))
  check("the sitemap route knows both names", (parseSitemapName("onepages.xml") as any)?.kind === "onepages-index" && (parseSitemapName("onepages-3.xml") as any)?.chunk === 3)
  check("Next's own files are served", route("storelib.me", "/_next/static/chunks/app.js")?.kind === "next" && route("storelib.me", "/_next/data/x.json")?.kind === "next")
  check("fonts and media are served", route("storelib.me", "/fonts/inter.woff2")?.kind === "next" && route("storelib.me", "/favicon.ico")?.kind === "next")
  check("other files are not: no llms.txt, no manifest of the platform", isMissing(route("storelib.me", "/llms.txt")) || route("storelib.me", "/llms.txt")?.kind === "redirect")

  console.log("\nstorelib.me/api: only what a OnePage calls")
  const allowed: Array<[string, string]> = [
    ["POST", "/api/onepage/track"],
    ["POST", "/api/onepage/leads"],
    ["POST", "/api/subscribe"],
    ["POST", "/api/checkout/quick-free"],
    ["GET", "/api/download/2b5c0f0e-6a1d-4e4b-9d1e-0c4c1f7c2a11"],
  ]
  for (const [method, p] of allowed) check(`${method} ${p} answers`, route("storelib.me", p, { method })?.kind === "next")
  const refused: Array<[string, string]> = [
    ["GET", "/api/onepage/leads"],
    ["GET", "/api/onepage"],
    ["PUT", "/api/onepage"],
    ["GET", "/api/onepage/address?name=x"],
    ["GET", "/api/auth/callback"],
    ["POST", "/api/checkout/create-payment-intent"],
    ["GET", "/api/admin/users"],
    ["GET", "/api/cron/notify"],
    ["POST", "/api/stripe/webhook"],
    ["GET", "/api/download/../../admin"],
    ["GET", "/api"],
  ]
  for (const [method, p] of refused) {
    const r = route("storelib.me", p.split("?")[0], { method })
    check(`${method} ${p} is a 404 on storelib.me`, isMissing(r, true), show(r))
  }

  console.log("\nwww.storelib.me, should it ever be attached")
  check("is sent to storelib.me, path and query kept", isRedirect(route("www.storelib.me", "/mara?utm_source=x"), "https://storelib.me/mara?utm_source=x"))

  console.log("\nThe old addresses on storelib.com")
  check("/mara/links is sent to storelib.me/mara, 308", isRedirect(route("storelib.com", "/mara/links"), "https://storelib.me/mara"))
  check("with utm and ref kept", isRedirect(route("storelib.com", "/mara/links?utm_source=instagram&utm_campaign=bio&ref=x"), "https://storelib.me/mara?utm_source=instagram&utm_campaign=bio&ref=x"))
  check("/Mara/links/ is sent to storelib.me/mara", isRedirect(route("storelib.com", "/Mara/links/"), "https://storelib.me/mara"))
  check("/mara.links is sent to storelib.me/mara", isRedirect(route("storelib.com", "/mara.links?x=1"), "https://storelib.me/mara?x=1"))
  check("/l/mara is sent to storelib.me/mara", isRedirect(route("storelib.com", "/l/mara"), "https://storelib.me/mara"))
  check("/l/Mara/anything is sent to storelib.me/mara", isRedirect(route("storelib.com", "/l/Mara/extra"), "https://storelib.me/mara"))
  check("mara.storelib.com/links is sent to storelib.me/mara", isRedirect(route("mara.storelib.com", "/links?utm_source=tt"), "https://storelib.me/mara?utm_source=tt"))
  check("www.storelib.com/links and app.storelib.com/links are not anybody's", route("www.storelib.com", "/links") === null && route("app.storelib.com", "/links") === null)
  check("a name that cannot be one is never redirected: no open redirect", route("storelib.com", "/l/%2F%2Fevil.com") === null && route("storelib.com", "/l/..") === null && route("storelib.com", "/evil.com%2F/links") === null)
  check("every redirect off storelib.com lands on storelib.me", ["/mara/links", "/l/x", "/y.links"].every((p) => { const r = route("storelib.com", p); return r?.kind === "redirect" && r.location.startsWith("https://storelib.me/") }))
  check("/l/ with a platform word is left to its route, not bounced between hosts", route("storelib.com", "/l/app") === null && route("storelib.com", "/l/checkout") === null)
  check("a platform route's own /links is left alone", route("storelib.com", "/app/links") === null && route("storelib.com", "/help/links") === null && route("storelib.com", "/p/links") === null)
  check("the native app keeps being served on storelib.com", route("storelib.com", "/mara/links", { userAgent: "Mozilla/5.0 Capacitor StorelibApp" }) === null)
  check("and its old spellings go to the route, not off to another origin", isRedirect(route("storelib.com", "/l/mara", { userAgent: "Capacitor" }), "https://storelib.com/mara/links"))

  console.log("\nEverything else is exactly as it was")
  const untouched: Array<[string, string]> = [
    ["storelib.com", "/"],
    ["storelib.com", "/mara"],
    ["storelib.com", "/mara/prints"],
    ["storelib.com", "/app/onepage"],
    ["storelib.com", "/api/onepage/track"],
    ["storelib.com", "/l"],
    ["storelib.com", "/u/mara"],
    ["mara.storelib.com", "/"],
    ["mara.storelib.com", "/about"],
    ["mara.storelib.com", "/p/prints"],
    ["mara.storelib.com", "/api/website-builder/subscribe"],
    ["www.maralind.com", "/"],
    ["www.maralind.com", "/links"],
    ["maralind.com", "/links"],
    ["links.maralind.com", "/links"],
    ["v0-materia.vercel.app", "/api/cron/notify"],
    ["localhost:3000", "/mara/links"],
    ["storelib.me.evil.com", "/mara"],
    ["evilstorelib.me", "/app"],
  ]
  for (const [host, p] of untouched) check(`${host}${p} is not the OnePage host's business`, route(host, p) === null, show(route(host, p)))
}

/* ─── The proxy, the page and the rest ───────────────────────────────── */

function wiring() {
  console.log("\nThe proxy obeys it first and reads no session for storelib.me")
  const proxy = code("proxy.ts")
  const at = proxy.indexOf("const onePage = onePageRoute(")
  check("proxy.ts asks onePageRoute", at > 0)
  check("before the custom domain rule that sent storelib.me to www", at < proxy.indexOf("Canonical redirect: apex custom-domain.com"))
  check("before any Supabase client is made", at < proxy.indexOf("createServerClient(supabaseUrl"))
  check("before the published site branch", at < proxy.indexOf("bareHost.endsWith(`.${SITES_DOMAIN}`)"))
  const block = proxy.slice(at, proxy.indexOf("AN API CALL IS NOT A PAGE VIEW"))
  check("every answer returns from the block, none sets a cookie", (block.match(/return /g) ?? []).length >= 6 && !/cookies\.set|Set-Cookie/.test(block))
  check("a 404 page is marked noindex", /X-Robots-Tag", "noindex"/.test(block))
  check("the old /l/ and subdomain /links rules are gone from the proxy, not doubled", !/to\.pathname = `\/\$\{slug\.replace/.test(proxy) && !/to\.pathname = `\/\$\{subdomain\}\/links`/.test(proxy))

  console.log("\nThe page")
  const page = code("app/(marketing)/l/[slug]/page.tsx")
  check("a name that cannot be one is a 404 before the database", /if \(!isResolvableOnePageName\(slug\)\) notFound\(\)/.test(page))
  check("its metadata says not found and noindex", /MISSING: Metadata = \{ title: "Page not found", robots: \{ index: false, follow: false \} \}/.test(page))
  const nf = code("app/(marketing)/l/[slug]/not-found.tsx")
  check("the not found page is small and on brand, with no relative link", /bg-\[#f8f9fa\]/.test(nf) && /text-\[#1a1a2e\]/.test(nf) && !/href="\//.test(nf) && !/\u2014/.test(nf))
  check("storelib.me's route has the same not found", /export \{ default \} from "..\/..\/l\/\[slug\]\/not-found"/.test(code("app/(marketing)/[sellername]/links/not-found.tsx")))
  const seo = code("lib/onepage/seo.ts")
  check("the metadata carries the page's own origin as its base", /metadataBase: new URL\(originOf\(seo\.url\)/.test(seo))
  /*
    The lookups moved from lib/onepage/published-page.ts to
    lib/onepage/address-lookup.ts on purpose: the proxy resolves an old
    address with the same ones now (tests/onepage-old-links.test.ts), so the
    pin reads them where they are. Same check, same two columns.
  */
  const found = code("lib/onepage/address-lookup.ts")
  check("a page is found in any case, with _ and % literal", /ilike\("slug", exactIlike\(name\)\)/.test(found) && /ilike\("username", exactIlike\(name\)\)/.test(found))

  console.log("\nSitemaps")
  const maps = code("lib/seo/sitemaps.ts")
  check("storelib.com's creator files no longer list a OnePage", !/getLinksShareUrl/.test(maps) && /return \(await creatorChunk\(chunk\)\)\.creators/.test(maps))
  check("storelib.me's files list them at storelib.me/{handle}", /pages\.push\(\{ url: onePageUrl\(profile\.username\)/.test(maps))

  console.log("\nAnalytics and origins keep counting a OnePage as a OnePage")
  const origin = describePage({ href: "https://storelib.me/mara?utm_source=instagram", referrer: "https://l.instagram.com/", trail: [], landingSearch: "?utm_source=instagram", userAgent: "Mozilla/5.0", mainDomain: "storelib.com" })
  check("a free claim on storelib.me is from the OnePage, with its utm", origin?.surface === "onepage" && origin?.utm_source === "instagram" && !origin?.site, JSON.stringify(origin))
  check("storelib.me as a referrer is Storelib, not a stranger's site", isInternalReferrer("storelib.me", "storelib.com"))

  console.log("\nThe editor")
  const tab = code("components/onepage/tabs/settings-tab.tsx")
  check("the address field reads storelib.me/ and nothing after", /\{onePageDomain\}\//.test(tab) && !/>\/links</.test(tab))
  check("it asks the live check while typing", /\/api\/onepage\/address\?name=/.test(tab))
  check("and cannot save a name that is taken", /\|\| slugTaken\}/.test(tab))
  const put = code("app/api/onepage/route.ts")
  check("the save runs the same availability check", /onePageNameTaken\(nextSlug/.test(put))
  const live = code("app/api/onepage/address/route.ts")
  check("the live check is signed in, rate limited and never cached", /Sign in again/.test(live) && /rateLimit\(/.test(live) && /no-store/.test(live))
}

names()
address()
routing()
wiring()

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailures:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
