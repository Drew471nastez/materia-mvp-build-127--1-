/**
 * ===========================================================================
 *  ROUND 49, EDGE: PUBLIC PAGES THAT KEEP SERVING WHILE THE DATABASE IS AWAY
 * ===========================================================================
 * docs/reliability/EDGE_FAILOVER.md says the design. What this suite pins:
 *
 *   1. WHAT A STORED COPY MAY BE. Only a 200 page of HTML, asked for with no
 *      cookie, that set no cookie and is not itself a copy.
 *      Never a cart, checkout, account, search, password, preview, receipt or
 *      API address, and never a file.
 *   2. TAKING AND DELETING COPIES. A page that answers is kept; a 404 or
 *      410 deletes its copy; anything else (a 503 during an outage) keeps
 *      the copy it had. A front page that is gone wipes every copy under its
 *      host and the host's records.
 *   3. READING THEM. Held per server; when the store does not answer, the
 *      copy already held is still served. A OnePage's or community's copy
 *      nobody refreshed for a week is not served; a site's is.
 *   4. THE ANSWER MADE FROM ONE: `private, no-store`, X-Storelib-Snapshot.
 *   5. THE DATABASE'S STATE AS ONE SERVER SEES IT (lib/edge/db-health.ts).
 *   6. WHERE THEY ARE USED: the proxy in front of the routing while the
 *      database is down, and at every SITE-8 503; the imported theme's 503;
 *      a Storelib theme site's page from its host record only when it was
 *      open and native when kept.
 *   7. PURGE ON PUBLISH: Publish, Unpublish, a take down, a product save, a
 *      password change and a OnePage change each ask the copies again.
 *   8. THE HEADERS PER PAGE TYPE, as they are: nothing personal is ever
 *      given a shared lifetime here.
 *   9. SQL part 356: a private bucket.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { capturable, hostKey, indexKey, pageKey, pageRecord, readHostRecord, readSnapshot, resetHostHold, resetSnapshotHold, servable, snapshotHost, snapshotPath, snapshotRequest, snapshotResponse, SNAPSHOT_CACHE, SNAPSHOT_HEADER, PAGE_COPY_MAX_AGE_MS, HOLD_MS, type PageRecord } from "@/lib/edge/public-snapshot"
import { memorySnapshotStore, safeKey, storeConfig } from "@/lib/edge/snapshot-store"
import { backfillSiteCopies, capturePages, dueForCopy, sitePagePaths, KEEP_EVERY_MS, type Fetched } from "@/lib/edge/snapshot-capture"
import { answeredOk, dbState, noteDb, probeIfStale, resetDbHealth, DOWN_HOLD_MS, PROBE_EVERY_MS } from "@/lib/edge/db-health"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
  }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const code = (p: string) => stripComments(read(p))

const html = (status: number, headers: Record<string, string> = {}, text = "<html>page</html>"): Fetched => ({
  status,
  headers: new Headers({ "content-type": "text/html; charset=utf-8", ...headers }),
  text,
  withCookie: false,
})

async function main() {
  console.log("\n1. What a stored copy may be")
  for (const p of ["/cart", "/cart/add", "/checkout", "/checkout/x", "/account", "/account/orders", "/api/x", "/search", "/password", "/preview/abc", "/receipt/1", "/order-help/1", "/review/1", "/wishlist", "/_next/static/a.js", "/media/x.png", "/products/a.json", "/cart.js", "/sitemap.xml", "/w/~anon~x/", "/app", "/login"]) {
    check(`never kept: ${p}`, snapshotPath(p) === null)
  }
  for (const [p, want] of [["/", "/"], ["/about", "/about"], ["/about/", "/about"], ["/products/loop-pack-1", "/products/loop-pack-1"], ["/community/club", "/community/club"], ["/lena", "/lena"]] as const) {
    check(`kept as ${want}: ${p}`, snapshotPath(p) === want)
  }
  check("a page asked for as a page may be answered from a copy", snapshotRequest({ method: "GET", pathname: "/about", accept: "text/html,application/xhtml+xml", fetchDest: "document" }))
  check("  HEAD too", snapshotRequest({ method: "HEAD", pathname: "/", accept: null }))
  check("  never a POST", !snapshotRequest({ method: "POST", pathname: "/", accept: "text/html" }))
  check("  never a script's JSON request", !snapshotRequest({ method: "GET", pathname: "/", accept: "application/json" }) && !snapshotRequest({ method: "GET", pathname: "/", accept: "text/html", requestedWith: "XMLHttpRequest" }))
  check("  never a picture or script asking", !snapshotRequest({ method: "GET", pathname: "/", accept: "*/*", fetchDest: "image" }) && !snapshotRequest({ method: "GET", pathname: "/", accept: "*/*", fetchDest: "script" }))
  check("hosts: lower case, no port; nothing else", snapshotHost("Lena.Storelib.com:443") === "lena.storelib.com" && snapshotHost("evil/../x") === null && snapshotHost("localhost") === null)
  check("store keys never climb out of the bucket", safeKey("v1/p/a.com/x.json") === "v1/p/a.com/x.json" && safeKey("../x") === null && safeKey("v1//x") === null && safeKey("/x") === null)
  check("index scopes are names only", indexKey("site-lena") === "v1/i/site-lena.json" && indexKey("site-../x") === null && indexKey("other-x") === null)
  const k1 = await pageKey("lena.storelib.com", "/about")
  const k2 = await pageKey("LENA.storelib.com:443", "/about/")
  check("one page, one key, however the host and slash were written", !!k1 && k1 === k2 && /^v1\/p\/lena\.storelib\.com\/[0-9a-f]{32}\.json$/.test(k1 ?? ""))
  check("a host's record key", hostKey("www.lenashop.test") === "v1/h/www.lenashop.test.json")

  check("kept: a 200 page, public ISR header", capturable(html(200, { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" }), false))
  check("kept: an imported theme's stranger page (private, no-cache)", capturable(html(200, { "cache-control": "private, no-cache" }), false))
  check("NOT kept: asked with a cookie", !capturable(html(200), true))
  check("NOT kept: it set a cookie", !capturable(html(200, { "set-cookie": "sl_theme_cart=1" }), false))
  check("kept: a page Next draws per request (private, no-cache, no-store), asked with no cookie", capturable(html(200, { "cache-control": "private, no-cache, no-store, max-age=0, must-revalidate" }), false))
  check("NOT kept: not a 200", !capturable(html(503), false) && !capturable(html(404), false) && !capturable(html(302), false))
  check("NOT kept: not HTML", !capturable({ status: 200, headers: new Headers({ "content-type": "application/json" }) }, false))
  check("NOT kept: a copy of a copy", !capturable(html(200, { [SNAPSHOT_HEADER]: "2026-11-02T00:00:00Z" }), false))
  check("NOT kept: a page past the size limit", pageRecord("a.storelib.com", "/", "site", "x".repeat(1_500_001), "text/html") === null)

  console.log("\n2. Taking and deleting copies")
  {
    const store = memorySnapshotStore()
    const answers = new Map<string, Fetched | null>([
      ["lena.storelib.com/", html(200, {}, "<html>home</html>")],
      ["lena.storelib.com/about", html(200, {}, "<html>about</html>")],
      ["lena.storelib.com/cart", html(200)],
    ])
    const asked: string[] = []
    const fetcher = async (host: string, path: string) => {
      asked.push(`${host}${path}`)
      const k = `${host}${path}`
      return answers.has(k) ? (answers.get(k) ?? null) : html(404)
    }
    const host = { v: 1 as const, host: "www.lenashop.test", name: "lena", purpose: "website" as const, kind: "native" as const, open: true, capturedAt: "x" }
    const r = await capturePages("site-lena", [{ host: "lena.storelib.com", path: "/", kind: "site" }, { host: "lena.storelib.com", path: "/about", kind: "site" }, { host: "lena.storelib.com", path: "/cart", kind: "site" }], { store, fetcher, hosts: [host] })
    check("the pages that answered are kept, the cart is never asked", r.kept === 2 && !asked.includes("lena.storelib.com/cart"), { r, asked })
    check("  with an index naming them", (JSON.parse(store.objects.get("v1/i/site-lena.json") ?? "{}").pages ?? []).length === 2)
    check("  and the connected domain's record", store.objects.has("v1/h/www.lenashop.test.json"))
    resetSnapshotHold()
    const got = await readSnapshot(store, "lena.storelib.com", "/about")
    check("a copy reads back for its host and path", got?.html === "<html>about</html>" && got.kind === "site")

    /* An outage: the pages answer 503. Nothing is deleted. */
    answers.set("lena.storelib.com/", html(503))
    answers.set("lena.storelib.com/about", null)
    const r2 = await capturePages("site-lena", [{ host: "lena.storelib.com", path: "/", kind: "site" }], { store, fetcher, hosts: [host] })
    check("an outage (503, no answer) deletes nothing", r2.gone === 0 && store.objects.has((await pageKey("lena.storelib.com", "/about")) as string) && store.objects.has((await pageKey("lena.storelib.com", "/")) as string), r2)

    /* /about dropped from the site: 404. Asked again because the index names it. */
    answers.set("lena.storelib.com/", html(200, {}, "<html>home 2</html>"))
    answers.set("lena.storelib.com/about", html(404))
    const r3 = await capturePages("site-lena", [{ host: "lena.storelib.com", path: "/", kind: "site" }], { store, fetcher, hosts: [host] })
    check("a page dropped from the site (404) loses its copy, found through the index", r3.gone === 1 && !store.objects.has((await pageKey("lena.storelib.com", "/about")) as string), r3)

    /* Taken down: the front page is a 404. Every copy under the host goes, an orphan the index never named included, and the host records. */
    const orphan = (await pageKey("lena.storelib.com", "/faq")) as string
    store.objects.set(orphan, JSON.stringify(pageRecord("lena.storelib.com", "/faq", "site", "<html>faq</html>", "text/html")))
    answers.set("lena.storelib.com/", html(404))
    await capturePages("site-lena", [{ host: "lena.storelib.com", path: "/", kind: "site" }], { store, fetcher, hosts: [host] })
    check("a site taken down loses every copy under its host", ![...store.objects.keys()].some((k) => k.startsWith("v1/p/lena.storelib.com/")), [...store.objects.keys()])
    check("  its index and its domain's record", !store.objects.has("v1/i/site-lena.json") && !store.objects.has("v1/h/www.lenashop.test.json"))
    resetSnapshotHold()
    check("  and nothing is served for it", (await readSnapshot(store, "lena.storelib.com", "/")) === null)
  }
  check("a site's pages: from its sitemap, never a cart or a file, capped", JSON.stringify(sitePagePaths(["https://a.storelib.com/", "https://a.storelib.com/about", "https://a.storelib.com/cart", "https://a.storelib.com/x.json", "nonsense"])) === JSON.stringify(["/", "/about"]))
  check("a page drawn for a stranger asks for a copy at most hourly per server", dueForCopy("h.test", "/x", 1_000) && !dueForCopy("h.test", "/x", 1_000 + KEEP_EVERY_MS - 1) && dueForCopy("h.test", "/x", 1_000 + KEEP_EVERY_MS))
  {
    const store = memorySnapshotStore()
    const fetcher = async () => html(200)
    const took = await backfillSiteCopies("https://lena.storelib.com", ["https://lena.storelib.com/", "https://lena.storelib.com/products"], Date.now() + 10_000, { store, fetcher, mainDomain: "storelib.com" })
    check("the warm run takes a site's copies when it has none", took && store.objects.has("v1/i/site-lena.json"))
    const again = await backfillSiteCopies("https://lena.storelib.com", ["https://lena.storelib.com/"], Date.now() + 10_000, { store, fetcher: async () => { throw new Error("asked twice") }, mainDomain: "storelib.com" })
    check("  and never again once it has an index", again === false)
    await backfillSiteCopies("https://www.lenashop.test", ["https://www.lenashop.test/"], Date.now() + 10_000, { store, fetcher, mainDomain: "storelib.com" })
    check("  a connected domain's index is named by the domain", store.objects.has("v1/i/site-d-www_lenashop_test.json"))
  }

  console.log("\n3. Reading them")
  {
    resetSnapshotHold()
    const store = memorySnapshotStore()
    const rec = pageRecord("lena.storelib.com", "/", "site", "<html>v1</html>", "text/html", new Date(0)) as PageRecord
    store.objects.set((await pageKey("lena.storelib.com", "/")) as string, JSON.stringify(rec))
    const t = 10_000_000
    check("read once", (await readSnapshot(store, "lena.storelib.com", "/", t))?.html === "<html>v1</html>")
    store.objects.clear()
    check("held for a minute per server", (await readSnapshot(store, "lena.storelib.com", "/", t + HOLD_MS - 1))?.html === "<html>v1</html>")
    store.objects.set((await pageKey("lena.storelib.com", "/")) as string, JSON.stringify(rec))
    store.down = true
    check("the store away too: the copy this server holds is still served", (await readSnapshot(store, "lena.storelib.com", "/", t + HOLD_MS * 5))?.html === "<html>v1</html>")
    store.down = false
    const wrong = { ...rec, host: "other.storelib.com" }
    store.objects.set((await pageKey("x.storelib.com", "/")) as string, JSON.stringify(wrong))
    check("a record for another host is never served at this one", (await readSnapshot(store, "x.storelib.com", "/", t)) === null)
    const now = Date.now()
    check("a site's copy never ages out", servable({ ...rec, kind: "site", capturedAt: new Date(0).toISOString() }, now))
    check("a OnePage's copy nobody refreshed for a week is not served", !servable({ ...rec, kind: "onepage", capturedAt: new Date(now - PAGE_COPY_MAX_AGE_MS - 1).toISOString() }, now) && servable({ ...rec, kind: "community", capturedAt: new Date(now - 60_000).toISOString() }, now))
    resetHostHold()
    store.objects.set("v1/h/www.lenashop.test.json", JSON.stringify({ v: 1, host: "www.lenashop.test", name: "lena", purpose: "website", kind: "native", open: true, capturedAt: "x" }))
    check("a connected domain's site, with no database", (await readHostRecord(store, "WWW.lenashop.test:443"))?.name === "lena")
    store.objects.set("v1/h/lena.storelib.com.json", JSON.stringify({ v: 1, host: "lena.storelib.com", name: "lena", purpose: "website", canonical: "evil/x", capturedAt: "x" }))
    check("  a record whose canonical is not a host is refused", (await readHostRecord(store, "lena.storelib.com")) === null)
        store.objects.set("v1/h/bad.test.json", JSON.stringify({ v: 1, host: "bad.test", name: "../x", purpose: "website" }))
    check("  never a name that is not one", (await readHostRecord(store, "bad.test")) === null)
  }

  console.log("\n4. The answer made from a copy")
  {
    const rec = pageRecord("lena.storelib.com", "/", "site", "<html>v1</html>", "text/html; charset=utf-8", new Date("2026-11-02T10:00:00Z")) as PageRecord
    const r = snapshotResponse(rec)
    check("200, the page's own type", r.status === 200 && r.headers.get("content-type") === "text/html; charset=utf-8" && (await r.text()) === "<html>v1</html>")
    check("never held by a shared cache past the outage", r.headers.get("cache-control") === SNAPSHOT_CACHE && SNAPSHOT_CACHE === "private, no-store")
    check("says when it was taken", r.headers.get(SNAPSHOT_HEADER) === "2026-11-02T10:00:00.000Z")
    check("HEAD has no body", (await snapshotResponse(rec, "HEAD").text()) === "")
  }

  console.log("\n5. The database's state, as one server sees it")
  {
    resetDbHealth()
    check("unknown before any read", dbState(1_000) === "unknown")
    noteDb(true, 1_000)
    check("up after an answer", dbState(1_001) === "up")
    noteDb(false, 2_000)
    check("down after a failure", dbState(2_001) === "down")
    check("  for DOWN_HOLD_MS with nothing since", dbState(2_000 + DOWN_HOLD_MS - 1) === "down" && dbState(2_000 + DOWN_HOLD_MS) === "up")
    noteDb(true, 2_500)
    check("one answer ends it at once", dbState(2_501) === "up")
    check("an answer is any status below 500 (a 404 is the database answering)", answeredOk(200) && answeredOk(404) && answeredOk(406) && !answeredOk(500) && !answeredOk(503) && !answeredOk(0))
    resetDbHealth()
    let probes = 0
    probeIfStale(async () => {
      probes++
      return 0
    })
    probeIfStale(async () => {
      probes++
      return 0
    })
    await new Promise((r) => setTimeout(r, 10))
    check("one probe at a time, and a failed probe is down", probes === 1 && dbState() === "down")
    probeIfStale(async () => {
      probes++
      return 200
    })
    check("  no second probe while the last word is fresh", probes === 1 && PROBE_EVERY_MS >= 10_000)
  }

  console.log("\n6. Where they are used")
  {
    const proxy = code("proxy.ts")
    check("every proxy read reports to the database's state", /deadlineFetch\(input, \{ \.\.\.init, signal \}\)\.then\(\s*\(r\) => \{\s*noteDb\(answeredOk\(r\.status\)\)/.test(proxy) && /noteDb\(false\)\s*throw e/.test(proxy))
    const at = proxy.indexOf("const whileDown = await snapshotWhileDown(request, bareHost)")
    check("in front of the routing (before the OnePage and site rules) while the database is down", at > 0 && at < proxy.indexOf("const onePage = onePageRoute(") && at < proxy.indexOf("if (bareHost.endsWith(`.${SITES_DOMAIN}`)) {"))
    check("  only while down, after starting a probe when the last word is old", /probeIfStale\(dbProbe\)\s*if \(dbState\(\) !== "down"\) return null\s*return snapshotFor\(request\)/.test(proxy))
    check("  only for a website, a OnePage on storelib.me and a community's public page on storelib.com", /if \(host === "storelib\.me"\) return/.test(proxy) && /return \/\^\\\/community\\\/\[a-z0-9-\]\{1,80\}\(\?:\\\/about\)\?\\\/\?\$\/\.test\(pathname\)/.test(proxy))
    check("every SITE-8 503 for a site tries its copy first", /if \(ai === "unavailable"\) return \(await snapshotFor\(request\)\) \?\? siteUnavailable\(\)/.test(proxy) && /if \(aiKnown === "unavailable" \|\| compatKnown === "unavailable"\) return \(await snapshotFor\(request\)\) \?\? \(await nativeFromRecord\(request, subdomain\)\) \?\? siteUnavailable\(\)/.test(proxy) && /const copy = \(await snapshotFor\(request\)\) \?\? \(await nativeFromRecord\(request, null\)\)/.test(proxy))
    check("a host record routes only a Storelib theme site that was open when kept", /if \(!record \|\| record\.kind !== "native" \|\| record\.open !== true \|\| \(name && record\.name !== name\)\) return null/.test(proxy))
    check("a subdomain whose site is at its domain is sent there from its record, never cached", /if \(!record\) return siteDomainFromRecord\(request\)/.test(proxy) && /NextResponse\.redirect\(`https:\/\/\$\{record\.canonical\}\$\{pathname\}\$\{search\}`, \{ status: 302 \}\)\s*to\.headers\.set\("Cache-Control", "no-store"\)/.test(proxy))
        check("a copy is served under the request's own host, never another's", /readSnapshot\(snapshotStore, request\.headers\.get\("host"\) \|\| "", pathname\)/.test(proxy))
    const compat = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("the imported theme's 503 serves its copy, never for a preview or a script", /if \(!token && pageAsked\) \{\s*const copy = await readSnapshot\(supabaseSnapshotStore\(\), host, publicPath\(req, segments\)\)/.test(compat))
    check("  and keeps a stranger's shareable page fresh", /if \(page\.share && page\.status === 200\) keepPageFresh\(/.test(compat))
    const cap = code("lib/edge/snapshot-capture.ts")
    const asking = cap.slice(cap.indexOf("export const strangerFetch"), cap.indexOf("export interface PageAsk"))
    check("a copy is asked for with no cookie", !/(?<![A-Za-z])["']?cookie["']?\s*:/i.test(asking) && !/credentials/.test(asking) && (asking.match(/withCookie: false/g) ?? []).length === 2)
    check("  and the rule is checked on what came back, not assumed", /capturable\(r, r\.withCookie\)/.test(cap))
    const community = code("app/(marketing)/community/[slug]/page.tsx")
    check("a community's copy only from a stranger's draw of the plain address", /if \(!user && Object\.keys\(query\)\.length === 0\) keepPageFresh\(/.test(community))
    check("  and its About page only from a stranger's", /if \(!user\) keepPageFresh\(/.test(code("app/(marketing)/community/[slug]/about/page.tsx")))
    check("a OnePage's copy is of storelib.me/<name>, asked for as a stranger", /keepPageFresh\(`onepage-\$\{\(onepage\.slug \|\| slug\)\.toLowerCase\(\)\}`, "storelib\.me", `\/\$\{onepage\.slug \|\| slug\}`, "onepage"\)/.test(code("app/(marketing)/l/[slug]/page.tsx")))
  }

  console.log("\n7. Purge on publish")
  {
    const site = code("lib/website-builder/published-site.ts")
    const pub = site.slice(site.indexOf("export async function revalidatePublishedSite"), site.indexOf("export async function revalidatePublishedPages"))
    check("Publish, Unpublish and a take down (revalidatePublishedSite) ask the copies again", /revalidateTag\(creatorSiteTag\(creatorId\), \{ expire: 0 \}\)/.test(pub) && /refreshSiteSoon\(creatorId\)/.test(pub))
    const pages = site.slice(site.indexOf("export async function revalidatePublishedPages"), site.indexOf("export async function revalidatePublishedProduct"))
    check("a product save does too (copies show prices)", /refreshSiteSoon\(creatorId\)/.test(pages))
    check("a password change does too", /refreshSiteSoon\(who\.creatorId\)/.test(code("app/api/website-builder/site-password/route.ts")))
    check("a OnePage change does too", /refreshOnePageSnapshot\(names\)/.test(code("lib/onepage/public-cache.ts")))
    check("a refresh always asks the front page, which is how a site taken down is found", /if \(!paths\.includes\("\/"\)\) paths\.unshift\("\/"\)/.test(code("lib/edge/snapshot-capture.ts")))
    check("refreshes for one creator run one at a time, coalesced", /if \(running\) \{\s*running\.again = true\s*return\s*\}/.test(code("lib/edge/snapshot-capture.ts")))
    check("the warm run after a deploy takes copies for sites without them", /await backfillSiteCopies\(o, list, until\)/.test(code("lib/website-builder/warm-sites.ts")))
  }

  console.log("\n8. Headers per page type (as served; docs/reliability/EDGE_FAILOVER.md lists the measured ones)")
  {
    const proxy = code("proxy.ts")
    const cfg = read("next.config.mjs")
    check("Storelib theme site front page: the route's minute at the CDN", /rewritten\.headers\.set\("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300"\)/.test(proxy))
    check("  a market's own currency copy is private", /if \(inLanguage\?\.kind === "page" && \/~m-\/\.test\(inLanguage\.path\)\) rewritten\.headers\.set\("Cache-Control", "private, no-cache"\)/.test(proxy))
    check("  a page let in with a password pass is no-store", /if \(guarded\) rewritten\.headers\.set\("Cache-Control", "private, no-store"\)/.test(proxy))
    check("Storelib theme site pages are ISR, a minute", /export const revalidate = 60/.test(read("app/(site)/w/[username]/page.tsx")))
    check("imported theme pages stay private at the CDN (Vercel keys a rewritten copy on the browser's address: round 48)", /export const PUBLIC_PAGE_CACHE = "private, no-cache"/.test(read("lib/storelib-theme/compat/anonymous-cache.ts")))
    check("OnePages stay private at the CDN (scheduled links, round 40)", /source: '\/l\/:slug\*',\s*headers: \[\s*\{ key: 'Cache-Control', value: 'private, no-cache, must-revalidate' \}/.test(cfg))
    check("the only header this round adds is the copy's own, no-store", !/s-maxage/.test(code("lib/edge/public-snapshot.ts")) && !/s-maxage/.test(code("lib/edge/snapshot-capture.ts")))
  }

  console.log("\n9. SQL part 356")
  {
    const sql = read("supabase/sql/run-now/356_public_snapshots.sql")
    check("a private bucket, JSON only, 4 MB", /VALUES \('public-snapshots', 'public-snapshots', false, 4194304, ARRAY\['application\/json'\]\)/.test(sql) && /ON CONFLICT \(id\) DO UPDATE SET public = false/.test(sql))
    check("  byte for byte as the migration", sql === read("supabase/migrations/20271110_public_snapshots.sql"))
    check("  and checked after", /exists \(select 1 from storage\.buckets where id = 'public-snapshots' and public = false\) as p356_public_snapshots;/.test(read("supabase/sql/run-now/99_check_after.sql")))
    check("no store configured (placeholders): nothing is written or read", storeConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "x" }) === null && storeConfig({}) === null)
    check("SNAPSHOT_STORAGE_URL points it elsewhere", storeConfig({ SNAPSHOT_STORAGE_URL: "http://127.0.0.1:54340/storage/v1/", SUPABASE_SERVICE_ROLE_KEY: "k" })?.base === "http://127.0.0.1:54340/storage/v1")
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
