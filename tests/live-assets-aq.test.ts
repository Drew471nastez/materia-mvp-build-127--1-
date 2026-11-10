/**
 * ===========================================================================
 *  ROUND AQ (track 1): LIVE WEBSITES FROM THEMES, RIGHT AFTER A DEPLOY
 * ===========================================================================
 * Held here:
 *
 *   ASSETS    an imported theme's files: one read for the files asked in the
 *             same moment, an answer kept under its content address only when
 *             the bytes hash to it, the Liquid engine loaded only for a
 *             `.liquid` file, a read that fails is a 503 kept nowhere
 *   WARM      the warm after a deploy and after a Publish asks for the theme
 *             files its pages name, content addresses only, once each, with
 *             nobody's cookie
 *   FILL      a buyer's own parts are asked for from the top of the head and
 *             put in as each section is read, not at DOMContentLoaded
 *   IDS       the same picture has the same id in every draw, so a stranger's
 *             drawing and a buyer's differ only where the buyer's parts do
 *   MARKETS   a market's page is kept by the CDN too (the key is the marked
 *             address, measured live)
 *   COPIES    a stored copy naming another deployment's files is not served,
 *             and the first warm after a deploy takes it again
 *
 * Run with:  pnpm test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { BATCH_MAX, KEPT_MAX, forgetKeptAnswers, keepAnswer, keptAnswer, readAssetRows, type AssetAdmin } from "@/lib/storelib-theme/compat/asset-serve"
import { isContentVersion, plainAssetVersion } from "@/lib/storelib-theme/compat/asset-version"
import { ASSETS_PER_PAGE, themeAssetsOf, warmAfterPublish, warmPublishedSites } from "@/lib/website-builder/warm-sites"
import { personalFillTag, withPersonalFill } from "@/lib/storelib-theme/compat/personal-fill"
import { calmerScripts } from "@/lib/storelib-theme/compat/script-order"
import { imageObject } from "@/lib/storelib-theme/compat/objects"
import { copyDeployment, currentDeployment, drawableNow, servable, type PageRecord } from "@/lib/edge/public-snapshot"
import { ASSET_MAP_PATH as installMapPath, assetType as installAssetType } from "@/lib/storelib-theme/compat/install"
import { ASSET_MAP_PATH, assetType } from "@/lib/storelib-theme/compat/asset-file"
import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)})`}`)
  }
}
const section = (t: string) => console.log(`\n${t}`)
const code = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"))
const INSTALL = "afef93fd-87bc-4e65-ba59-d46f7db612c2"

/* A fake of the one query the asset route makes, counting each. */
function fakeAdmin(files: Record<string, string>, opts: { fail?: boolean; delayMs?: number } = {}) {
  const queries: string[][] = []
  const admin: AssetAdmin = {
    from: () => ({
      select: () => ({
        eq: (_c: string, install: string) => ({
          in: (_col: string, paths: string[]) => {
            queries.push(paths)
            return new Promise((resolve) =>
              setTimeout(() => {
                if (opts.fail) resolve({ data: null, error: { message: "down" } })
                else resolve({ data: paths.filter((p) => install === INSTALL && p in files).map((p) => ({ path: p, content: files[p] })), error: null })
              }, opts.delayMs ?? 1),
            )
          },
        }),
      }),
    }),
  }
  return { admin, queries }
}

async function assets() {
  section("ASSETS: the files of one page in one read, the same bytes never read twice")
  const files: Record<string, string> = {}
  for (let i = 0; i < 42; i++) files[`shopify/assets/f${i}.js`] = `console.log(${i})`
  const { admin, queries } = fakeAdmin(files)
  const asked = Array.from({ length: 42 }, (_, i) => readAssetRows(admin, INSTALL, "path, content", [`shopify/assets/f${i}.js`, `shopify/assets/f${i}.js.liquid`]))
  const rows = await Promise.all(asked)
  check("42 files asked for together are one query", queries.length === 1, queries.length)
  check("  and each request gets only its own file", rows.every((r, i) => r.length === 1 && r[0].path === `shopify/assets/f${i}.js`), rows.map((r) => r.length))
  const many = await Promise.all(Array.from({ length: BATCH_MAX }, (_, i) => readAssetRows(admin, INSTALL, "path, content", [`shopify/assets/f${i % 42}.js`, `shopify/assets/x${i}.js`])))
  check(`no query is asked for more than ${BATCH_MAX} paths`, queries.slice(1).every((q) => q.length <= BATCH_MAX) && queries.length > 2, queries.slice(1).map((q) => q.length))
  check("  and every request still answered", many.every((r) => r.length === 1))
  const draft = fakeAdmin(files)
  await Promise.all([readAssetRows(draft.admin, INSTALL, "path, content", ["shopify/assets/f1.js"]), readAssetRows(draft.admin, INSTALL, "path, content, draft_content", ["shopify/assets/f2.js"])])
  check("a draft's read is never in the same query as the live ones", draft.queries.length === 2)
  const down = fakeAdmin(files, { fail: true })
  const outcome = await readAssetRows(down.admin, INSTALL, "path, content", ["shopify/assets/f1.js"]).then(() => "answered", () => "failed")
  check("a read that fails fails, never 'no such file'", outcome === "failed")

  forgetKeptAnswers()
  const text = "console.log('a')"
  const v = plainAssetVersion(text)
  check("an answer is kept under its own content address", keepAnswer(INSTALL, v, "a.js", v, { body: text, type: "text/javascript", cache: "immutable" }, isContentVersion) && keptAnswer(INSTALL, v, "a.js")?.body === text)
  const other = plainAssetVersion("console.log('b')")
  check("never under an address that is not its bytes' hash (a page drawn a moment before a save)", !keepAnswer(INSTALL, other, "b.js", v, { body: text, type: "t", cache: "c" }, isContentVersion) && keptAnswer(INSTALL, other, "b.js") === null)
  check("never under a published_at address", !keepAnswer(INSTALL, "20261101120000", "c.js", null, { body: text, type: "t", cache: "c" }, isContentVersion))
  check("never for a draft", !keepAnswer(INSTALL, "draft-123", "d.js", "draft-123", { body: text, type: "t", cache: "c" }, isContentVersion))
  const big = "x".repeat(Math.floor(KEPT_MAX / 10))
  for (let i = 0; i < 12; i++) keepAnswer(INSTALL, plainAssetVersion(`${i}${big}`), `big${i}.js`, plainAssetVersion(`${i}${big}`), { body: `${i}${big}`, type: "t", cache: "c" }, isContentVersion)
  check("kept answers are bounded: the oldest go first", keptAnswer(INSTALL, plainAssetVersion(`0${big}`), "big0.js") === null && keptAnswer(INSTALL, plainAssetVersion(`11${big}`), "big11.js") !== null)
  forgetKeptAnswers()

  const route = code("app/api/site-theme/assets/[installId]/[version]/[...name]/route.ts")
  check("the route imports no Liquid engine, theme reader or SCSS compiler up front", !/^import .*(compat-site|compat\/site"|compat\/scss|compat\/install")/m.test(route), route.match(/^import .*$/gm))
  check("  they are loaded for a .liquid file only", /import\("@\/lib\/website-builder\/compat-site"\)/.test(route) && /import\("@\/lib\/storelib-theme\/compat\/scss"\)/.test(route) && route.indexOf("await liquidParts()") > route.indexOf('if (!rows.some((r) => r.path.endsWith(".liquid")))'))
  check("a kept answer is never a draft's", /const hit = asked\.draft \? null : keptAnswer\(installId, version, name\)/.test(route) && (route.match(/if \(!asked\.draft(?: && typeof out\.body === "string")?\) keepAnswer\(/g) ?? []).length === 2)
  check("a failed read is a 503 kept nowhere, not a 404", /status: 503, headers: \{ \.\.\.cors, "Cache-Control": "no-store"/.test(route))
  check("the file's type and bytes come from asset-file.ts, the same as install.ts says", ASSET_MAP_PATH === installMapPath && assetType("a.css") === installAssetType("a.css") && assetType("a.woff2") === "font/woff2")
}

async function warm() {
  section("WARM: the theme files a page names, after a deploy and after a Publish")
  const site = "https://shop.storelib.com"
  const a = (h: string, n: string) => `/api/site-theme/assets/${INSTALL}/h-${h}/${n}`
  const html = `<html><head><link rel="stylesheet" href="${a("0123456789abcdef", "base.css")}"><script src="${a("1123456789abcdef", "theme.js")}" defer></script><script src="/api/site-theme/assets/${INSTALL}/draft-123/x.js"></script><script src="/api/site-theme/assets/${INSTALL}/20261101/old.js"></script><script src="${a("1123456789abcdef", "theme.js")}" defer></script></head><body><img src="${a("2123456789abcdef", "hero%20(1).png")}"></body></html>`
  const named = themeAssetsOf(html, `${site}/fr/about`)
  check("content addresses only, on the page's own host, each once", named.length === 3 && named.every((u) => u.startsWith(`${site}/api/site-theme/assets/${INSTALL}/h-`)) && new Set(named).size === 3, named)
  check("  never a draft's or an old published_at address", !named.some((u) => /draft|20261101/.test(u)))
  const many = Array.from({ length: 200 }, (_, i) => `<script src="${a(i.toString(16).padStart(16, "0"), `f${i}.js`)}"></script>`).join("")
  check(`at most ${ASSETS_PER_PAGE} a page`, themeAssetsOf(many, site).length === ASSETS_PER_PAGE)

  const asked: { url: string; cookie: string | null; dest: string | null }[] = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers)
    asked.push({ url, cookie: h.get("cookie"), dest: h.get("sec-fetch-dest") })
    if (url.includes("/api/site-theme/assets/")) return new Response("x", { headers: { "x-vercel-cache": url.includes("base.css") ? "HIT" : "MISS" } })
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-vercel-cache": "MISS" } })
  }) as unknown as typeof fetch
  const done = await warmAfterPublish("creator-1", { fetcher, addresses: async () => [`${site}/`, `${site}/about`], countries: ["RO"] })
  const files = asked.filter((x) => x.url.includes("/api/site-theme/assets/"))
  check("after a Publish: each file the pages name asked for once, whatever the pages and countries", files.length === 3 && new Set(files.map((f) => f.url)).size === 3, files.map((f) => f.url))
  check("  with nobody's cookie, as a script asks (not as a page)", files.every((f) => f.cookie === null && f.dest === null))
  check("  counted apart from the pages (the front page, the shop and About, for two countries)", done.assets.held === 1 && done.assets.drawn === 2 && done.drawn === 6, done)

  const before = process.env.VERCEL_DEPLOYMENT_ID
  process.env.VERCEL_DEPLOYMENT_ID = "dpl_aq"
  asked.length = 0
  const admin = {
    from() {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
      }
    },
  }
  const origins = [site, "https://other.storelib.com"]
  const r = await warmPublishedSites({ budgetMs: 5_000, fetcher, admin: admin as never, origins: async (from: number) => (from === 0 ? { origins, read: origins.length } : { origins: [], read: 0 }) })
  const deployFiles = asked.filter((x) => x.url.includes("/api/site-theme/assets/"))
  check("after a deploy: the front page's files too, each once per host", deployFiles.length === 6 && r.assets.drawn + r.assets.held === 6, { n: deployFiles.length, assets: r.assets })
  check("  each file after the page that names it", asked.findIndex((x) => x.url.includes("/api/site-theme/assets/")) > asked.findIndex((x) => x.url === `${site}/`))
  if (before === undefined) delete process.env.VERCEL_DEPLOYMENT_ID
  else process.env.VERCEL_DEPLOYMENT_ID = before
}

function fill() {
  section("FILL: asked for from the top of the head, put in as each section is read")
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>T</title><script src="/blocking.js"></script></head><body><div id="shopify-section-header">0</div><script>var x=1</script></body></html>`
  const out = withPersonalFill(page, { sections: ["header"], layout: true })
  check("right after the charset, before anything else in the head", out.startsWith(`<!doctype html><html><head><meta charset="utf-8"><script data-storelib-personal>`), out.slice(0, 120))
  check("  once, and not at the end of the body", (out.match(/data-storelib-personal/g) ?? []).length === 1 && !/data-storelib-personal[\s\S]*<\/body>/.test(out.slice(out.indexOf("<body"))))
  check("a page without a charset first: right after <head>", withPersonalFill(`<html><head><title>x</title></head><body></body></html>`, { sections: [], layout: false }).startsWith(`<html><head><script data-storelib-personal>`))
  check("a <header> element is not a head", withPersonalFill(`<header>x</header></body>`, { sections: [], layout: false }) === `<header>x</header>${personalFillTag({ sections: [], layout: false })}</body>`)
  const calm = calmerScripts(out)
  check("the theme's blocking script after it does not drag it into the deferred queue", calm.html.includes(`<script data-storelib-personal>(function(P)`) && calm.html.indexOf("data-storelib-personal") < calm.html.indexOf("blocking.js"))
  const tag = personalFillTag({ sections: ["header"], layout: true })
  check("no longer waits for DOMContentLoaded (which waits for every deferred theme script)", !tag.includes("DOMContentLoaded"))
  check("  a section is put right once the browser has read past its end", tag.includes("function past(n){for(;n;n=n.parentNode)if(n.nextSibling)return 1}") && tag.includes("new MutationObserver(function(){each()})"))
  check("  the layout, the page's end and the event once the page is read", tag.includes('document.addEventListener("readystatechange",end,{once:true})') && /function end\(\)\{if\(mo\)mo\.disconnect\(\);each\(1\);if\(d\.layout\)/.test(tag))
  check("  still asks nothing without a hint", /if\(!cart&&!signed&&!owned\)return/.test(tag))
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("the route puts it there on the shared page", /if \(shared\) \{\s*html = withPersonalFill\(html, out\.personal \?\? \{ sections: \[\], layout: false \}\)\s*\}/.test(route))
}

function ids() {
  section("IDS: the same picture, the same id, in every draw")
  const one = imageObject("https://storelib.com/media/a.png", "", { position: 1 })
  const again = imageObject("https://storelib.com/media/a.png", "", { position: 1 })
  const other = imageObject("https://storelib.com/media/b.png", "", { position: 1 })
  const second = imageObject("https://storelib.com/media/a.png", "", { position: 2 })
  check("drawn twice, the same id (a stranger's drawing and a buyer's no longer differ by it)", one?.id === again?.id && typeof one?.id === "number" && (one?.id as number) > 0)
  check("another picture, or the same one at another position, another id", one?.id !== other?.id && one?.id !== second?.id)
  check("an id the caller gives is kept", imageObject("x.png", "", { id: 77 })?.id === 77)
}

function markets() {
  section("MARKETS: a market's page is kept by the CDN as well")
  const route = code("app/api/site-theme/site/[username]/[[...path]]/route.ts")
  check("a shared page opened as a page gets the CDN header whatever its market", /if \(openedAsDocument\(req\.headers\)\) \{\s*const id = found\.site\.creatorId\s*headers\.set\("Vercel-CDN-Cache-Control", SHARED_PAGE_CDN\)/.test(route) && !/stranger\?\.market === null/.test(route))
  check("  still never a page drawn without a part, nor a HEAD's", /if \(leftOut\.size\) for \(const h of \["Vercel-CDN-Cache-Control", "Vercel-Cache-Tag", SHAREABLE_HEADER\]\) headers\.delete\(h\)/.test(route) && /headers\.delete\("Vercel-CDN-Cache-Control"\)/.test(route))
  check("  the marker it is kept under must match what the proxy said, market included", /told\(SITE_MARKET_HEADER\) !== stranger\.market/.test(route))
}

function copies() {
  section("COPIES: a stored copy whose files a deploy took away is not served")
  const now = Date.parse("2026-11-09T12:00:00Z")
  const next = `<html><head><link rel="stylesheet" href="/_next/static/chunks/6ec9653bd08f93f4.css?dpl=dpl_8BE8wcGEusNjiXsPuYahXvYqG6mr"></head><body>x</body></html>`
  const rec = (html: string, kind: PageRecord["kind"] = "site"): PageRecord => ({ v: 1, host: "a.storelib.com", path: "/", kind, html, contentType: "text/html", capturedAt: "2026-11-04T13:41:17.662Z" })
  check("the deployment a copy's files belong to is read from Next's own addresses", copyDeployment(next) === "dpl_8BE8wcGEusNjiXsPuYahXvYqG6mr" && copyDeployment("<html><script src=\"/api/site-theme/assets/x/h-0123456789abcdef/a.js\"></script></html>") === null)
  check("a copy of another deployment is not served (Nov 4's copy on Nov 9, measured)", !servable(rec(next), now, "dpl_CDRD4AGk8fP9VN1LSuB5MNrkV4m7"))
  check("  this deployment's is", servable(rec(next), now, "dpl_8BE8wcGEusNjiXsPuYahXvYqG6mr"))
  check("  an imported theme's copy names none and is served as before", servable(rec("<html><body>theme</body></html>"), now, "dpl_CDRD4AGk8fP9VN1LSuB5MNrkV4m7"))
  check("  not knowing the running deployment changes nothing", servable(rec(next), now, null) && drawableNow(next, null))
  check("the running deployment, as the platform says", currentDeployment({ VERCEL_DEPLOYMENT_ID: "dpl_a" }) === "dpl_a" && currentDeployment({ NEXT_DEPLOYMENT_ID: "dpl_b" }) === "dpl_b" && currentDeployment({}) === null)
  const capture = code("lib/edge/snapshot-capture.ts")
  check("the first warm after a deploy takes a site's copies again when its front page's names another deployment", /if \(had !== null\) \{\s*const deployment = currentDeployment\(\)[\s\S]{0,300}drawableNow\(copy\.html, deployment\)\) return false/.test(capture))
}

async function main() {
  await assets()
  await warm()
  fill()
  ids()
  markets()
  copies()
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
