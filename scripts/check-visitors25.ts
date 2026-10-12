/**
 * ===========================================================================
 *  ROUND 25 (G25): THE STORE'S GOOGLE ANALYTICS AND THE VISITOR'S LANGUAGE,
 *  IN A REAL BROWSER
 * ===========================================================================
 *   npx tsx scripts/check-visitors25.ts
 *
 * Every page type a store has, each at 1440x900 and at 390x844 with touch
 * and the CPU slowed 4x. Google is never contacted: googletagmanager.com's
 * gtag.js is answered with a small stand in that does what gtag does with
 * the data layer (consent defaults by region and updates, config's page
 * view, events, ga-disable, and optionally Google's own "page changes"
 * listener), and sends each hit to region1.google-analytics.com/g/collect,
 * which is caught here by request interception and recorded, never sent.
 *
 *   imported theme   tests/fixtures/shopify-posture through the import's own
 *                    converter, drawn by the live handler (compat answer),
 *                    with exactly what the route puts before </body>
 *                    (lib/store/compat-page-tags.ts): page_view, view_item
 *                    with the product's name and price, add_to_cart,
 *                    begin_checkout, the "receiving data" beacon, and the
 *                    language offer card (French)
 *   Storelib theme   the default theme's home through ThemePage with the
 *                    store's tags as trackingTags writes them, GaRoute,
 *                    TrackView, the language switch and its offer (German),
 *                    the cookie banner: from France (EEA) the first hits are
 *                    cookieless until Accept, from the US they are full
 *   creator page     GaRoute and the language row on a stand-in page: a
 *                    page_view per page opened without a full load, one per
 *                    page whether or not Google's own history listener is
 *                    on, none to the store once the visitor is on Explore
 *   OnePage, checkout (begin_checkout, then purchase when paid, never the
 *   receipt's reference), thank you page (purchase once, not on reload)
 *   Settings › Integrations › Google Analytics: a UA- ID named, Google's
 *   snippet pasted and connected, the live check's storelib_connected hit,
 *   Connected and Receiving data; Website settings' small status mark;
 *   Markets and languages' switch.
 *
 * Exits 1 on any failure. Screenshots go to $OUT (default
 * /tmp/visitors25): look at them.
 */
import { createServer, type IncomingMessage, type Server } from "node:http"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Browser, type HTTPRequest, type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { CART_COOKIE, answer, readCartCookie, themeAsset, writeCartCookie, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { formFields } from "../lib/storelib-theme/compat/form-fields"
import { compatPageTags } from "../lib/store/compat-page-tags"
import { purchaseTags, trackingTags } from "../lib/store/tracking"
import { gaCheckHtml, gaItem } from "../lib/store/ga"

const OUT = process.env.OUT ?? "/tmp/visitors25"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
mkdirSync(OUT, { recursive: true })
const root = process.cwd()
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${!ok && d ? `  (${d.slice(0, 500)})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, touch: false },
  { label: "phone", width: 390, height: 844, touch: true },
] as const
type VP = (typeof VIEWPORTS)[number]
const GA = "G-C2SD9ZCTXK"
/* What the servers below were sent at /api/store/ga-seen, with its body (a beacon's Blob body is not visible to request interception). */
const seenBodies: string[] = []
const SHOP = "c0000000-0000-4000-8000-000000000001"
const PID = "00000000-0000-4000-8000-000000000001"

/* ── Google, stood in for ───────────────────────────────────────────── */

const FAKE_GTAG = `(function(){var w=window,src=(document.currentScript&&document.currentScript.src)||'',id=(src.match(/[?&]id=([^&]+)/)||[])[1];w.google_tag_manager=w.google_tag_manager||{};if(id)w.google_tag_manager[decodeURIComponent(id)]={};if(w.__fakeGtag)return;w.__fakeGtag=true;
var country=w.__COUNTRY||'US',EM=w.__EM===true,dg={},dr={},up={},configs={};
function st(k){return k in up?up[k]:k in dr?dr[k]:k in dg?dg[k]:'granted'}
function gcs(){return 'G1'+(st('ad_storage')==='granted'?1:0)+(st('analytics_storage')==='granted'?1:0)}
var skip=['page_location','page_title','send_to','event_callback','event_timeout','transport_type'];
function hit(t,en,p){if(w['ga-disable-'+t])return;p=p||{};var q=new URLSearchParams({v:'2',tid:t,en:en,dl:p.page_location||location.href,dt:p.page_title||document.title,gcs:gcs()});for(var k in p)if(skip.indexOf(k)<0)q.set('ep.'+k,typeof p[k]==='object'?JSON.stringify(p[k]):String(p[k]));navigator.sendBeacon('https://region1.google-analytics.com/g/collect?'+q.toString(),'')}
function ga(){return Object.keys(configs).filter(function(x){return /^G-/.test(x)})}
function run(a){var c=a[0];if(c==='consent'&&a[1]==='default'){var p=a[2]||{},t=p.region?(p.region.indexOf(country)>=0?dr:null):dg;if(t)for(var k in p)if(k!=='region'&&k!=='wait_for_update')t[k]=p[k]}
else if(c==='consent'&&a[1]==='update'){var u=a[2]||{};for(var k2 in u)up[k2]=u[k2]}
else if(c==='config'){configs[a[1]]=a[2]||{};if(!(a[2]&&a[2].send_page_view===false)&&/^G-/.test(a[1]))hit(a[1],'page_view',{})}
else if(c==='event'){var ps=a[2]||{},to=ps.send_to?[ps.send_to]:ga();to.forEach(function(t){if(/^G-/.test(t))hit(t,a[1],ps)});if(typeof ps.event_callback==='function')setTimeout(ps.event_callback,0)}}
var dl=w.dataLayer=w.dataLayer||[];function cmd(x){return x&&typeof x==='object'&&typeof x.length==='number'}
dl.forEach(function(x){if(cmd(x))run(Array.prototype.slice.call(x))});var push=dl.push;dl.push=function(x){var r=push.apply(dl,arguments);if(cmd(x))run(Array.prototype.slice.call(x));return r};
if(EM){var ps0=history.pushState;history.pushState=function(){var r=ps0.apply(history,arguments);setTimeout(function(){dl.push({event:'gtm.historyChange-v2','gtm.newUrl':location.href});ga().forEach(function(t){hit(t,'page_view',{})})},0);return r}}})();`

interface Hit { tid: string; en: string; dl: string; gcs: string; ep: Record<string, string> }
const parseHit = (url: string): Hit => {
  const u = new URL(url)
  const ep: Record<string, string> = {}
  u.searchParams.forEach((v, k) => {
    if (k.startsWith("ep.")) ep[k.slice(3)] = v
  })
  return { tid: u.searchParams.get("tid") ?? "", en: u.searchParams.get("en") ?? "", dl: u.searchParams.get("dl") ?? "", gcs: u.searchParams.get("gcs") ?? "", ep }
}

async function pageFor(browser: Browser, vp: VP, opts: { country?: string; em?: boolean } = {}) {
  const context = await browser.createBrowserContext()
  const page = await context.newPage()
  await page.setViewport({ width: vp.width, height: vp.height, isMobile: vp.touch, hasTouch: vp.touch, deviceScaleFactor: vp.touch ? 2 : 1 })
  if (vp.touch) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.evaluateOnNewDocument(`window.__name=(f)=>f;window.__COUNTRY=${JSON.stringify(opts.country ?? "US")};window.__EM=${opts.em ? "true" : "false"};try{Object.defineProperty(Navigator.prototype,'webdriver',{get:function(){return false}})}catch(e){}`)
  const hits: Hit[] = []
  const google: string[] = []
  const beacons: { url: string; body: string }[] = []
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await page.setRequestInterception(true)
  page.on("request", (req: HTTPRequest) => {
    const url = req.url()
    const host = new URL(url).hostname
    if (host === "region1.google-analytics.com" || host.endsWith(".google-analytics.com")) {
      if (url.includes("/g/collect")) hits.push(parseHit(url))
      void req.respond({ status: 204, body: "" })
      return
    }
    if (host === "www.googletagmanager.com") {
      void req.respond({ status: 200, contentType: "text/javascript", body: FAKE_GTAG })
      return
    }
    if (/googletagmanager|google-analytics|analytics\.google|doubleclick/.test(host) || host === "www.google.com") {
      google.push(url)
      void req.abort()
      return
    }
    if (host === "shop.test" || host === "posturex.test") {
      if (url.includes("/api/store/ga-seen") || url.includes("/api/track")) beacons.push({ url: new URL(url).pathname, body: req.postData() ?? "" })
      void req.continue()
      return
    }
    void req.abort()
  })
  return { page, hits, google, beacons, errors, close: () => context.close() }
}
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const press = (page: Page, vp: VP, sel: string) => (vp.touch ? page.tap(sel) : page.click(sel))
const cookies = async (page: Page) => Object.fromEntries((await page.cookies()).map((c) => [c.name, c.value]))
const settle = async (page: Page, ms = 1500) => {
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 15000 }).catch(() => {})
  await sleep(ms)
}

/* ── The imported theme, drawn by the live handler ─────────────────────── */

const PRODUCT_SECTION = readFileSync(join(root, "tests/storefront23.test.ts"), "utf8").match(/const PRODUCT_SECTION = `([\s\S]*?)`\n/)![1]
const CART_SECTION = readFileSync(join(root, "tests/storefront23.test.ts"), "utf8").match(/const CART_SECTION = `([\s\S]*?)`\n/)![1]

async function compatSite(): Promise<{ site: SiteData; theme: SiteData["theme"] }> {
  const dir = join(root, "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  zip.file("sections/main-product-info.liquid", PRODUCT_SECTION)
  zip.file("sections/main-cart.liquid", CART_SECTION)
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error("the fixture theme did not convert")
  const t = r.theme
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/assets/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const SMALL = "10000000-0000-4000-8000-000000000001"
  const variants = [{ id: SMALL, name: "Small", price: "$49.00", compare_price: "$69.00", available: true, left: null, max: 9 }]
  const card = { id: PID, settings: { title: "Posture shirt", slug: "posture-shirt", url: "/products/posture-shirt", price: "$49.00", compare_price: "$69.00", image: "", images: [], kind: "physical", available: true, description: "", variants, options: [{ name: "Size", values: ["Small"] }] } }
  const site: SiteData = {
    creatorId: SHOP,
    theme,
    pages,
    products: [card] as never,
    collections: [] as never,
    menus: compatMenus({ "main-menu": { title: "Main", links: [{ title: "Shirt", url: "/products/posture-shirt" }] } } as never, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}", policies: [] },
    host: "posturex.test",
    product: async (h) => (h === "posture-shirt" ? (card as never) : null),
    stock: async () => ({ variants: { [SMALL]: 9 }, perOrder: 9 }),
    i18n: { locale: "en", defaultLanguage: "en", languages: ["en", "fr"] },
  }
  return { site, theme }
}
const bodyText = (req: IncomingMessage) => new Promise<string>((ok) => { let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s)) })

async function serveCompat(): Promise<{ server: Server; port: number }> {
  const { site, theme } = await compatSite()
  const named = { item: gaItem({ id: PID, title: "Posture shirt", priceCents: 4900, kind: "physical" })!, currency: "USD" }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://posturex.test")
    if (url.pathname === "/api/store/ga-seen") { seenBodies.push(await bodyText(req)); res.writeHead(204); res.end(); return }
    if (url.pathname.startsWith("/api/")) { res.writeHead(204); res.end(); return }
    if (url.pathname.startsWith("/assets/")) {
      const a = themeAsset(theme, decodeURIComponent(url.pathname.slice(8)), () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type })
      res.end(a.body)
      return
    }
    if (url.pathname === "/checkout") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<!doctype html><title>Checkout</title><p id=checkout>checkout</p>"); return }
    const cookie = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${CART_COOKIE}=`))?.slice(CART_COOKIE.length + 1)
    const held = readCartCookie(cookie)
    const raw = req.method === "POST" ? await bodyText(req) : ""
    const type = req.headers["content-type"] ?? ""
    const body = req.method !== "POST" ? null : type.includes("json") ? JSON.parse(raw || "{}") : formFields(new URLSearchParams(raw).entries())
    const ajax = req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("application/json") || String(req.headers.accept ?? "").includes("application/json")
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart: held.cart, note: held.note, ajax, referer: undefined })
    const headers: Record<string, string> = { ...(out.headers ?? {}), "Content-Type": out.type, "Cache-Control": "no-store" }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; SameSite=Lax`
    let html = typeof out.body === "string" ? out.body : null
    /* Exactly what app/api/site-theme/site's route puts before </body> on a live page. */
    if (html && out.status === 200 && /text\/html/.test(out.type) && /<\/body>/i.test(html)) {
      const product = url.pathname === "/products/posture-shirt"
      const tags = compatPageTags({ stored: { ga4: GA }, creatorId: SHOP, productId: product ? PID : null, named: product ? named : null, i18n: site.i18n, mainDomain: "storelib.com" })
      const at = html.search(/<\/body>(?![\s\S]*<\/body>)/i)
      html = `${html.slice(0, at)}${tags}${html.slice(at)}`
    }
    res.writeHead(out.status, headers)
    res.end(html ?? out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, port: (server.address() as { port: number }).port }
}

async function compat(browser: Browser) {
  console.log("\nimported theme")
  const { server, port } = await serveCompat()
  const base = `http://posturex.test:${port}`
  try {
    for (const vp of VIEWPORTS) {
      const p = await pageFor(browser, vp, { country: "FR" })
      seenBodies.length = 0
      await p.page.goto(`${base}/`, { waitUntil: "load" })
      await settle(p.page)
      const home = p.hits.filter((h) => h.en === "page_view")
      check(`${vp.label}: home: one page_view to ${GA}, counted in full (an imported theme shows no Storelib banner)`, home.length === 1 && home[0].tid === GA && home[0].gcs === "G111", p.hits)
      check(`${vp.label}: Storelib is told Google took a hit (once, the creator and the ID only)`, p.beacons.filter((b) => b.url === "/api/store/ga-seen").length === 1 && seenBodies.length === 1 && seenBodies[0] === JSON.stringify({ creatorId: SHOP, id: GA }), [p.beacons, seenBodies])
      p.hits.length = 0
      await p.page.goto(`${base}/products/posture-shirt`, { waitUntil: "load" })
      await settle(p.page)
      const vi = p.hits.find((h) => h.en === "view_item")
      check(`${vp.label}: the product page: page_view and view_item with the product's name, price and currency`, p.hits.some((h) => h.en === "page_view") && !!vi && /Posture shirt/.test(vi.ep.items ?? "") && vi.ep.value === "49" && vi.ep.currency === "USD", p.hits)
      await p.page.screenshot({ path: `${OUT}/compat-product-${vp.label}.png` })
      await Promise.all([p.page.waitForNavigation({ waitUntil: "load" }).catch(() => {}), press(p.page, vp, ".product-form button[name='add']")])
      await settle(p.page, 800)
      const add = p.hits.find((h) => h.en === "add_to_cart")
      check(`${vp.label}: Add to cart: add_to_cart with the product's name and price`, !!add && /Posture shirt/.test(add.ep.items ?? "") && add.ep.value === "49", p.hits.map((h) => h.en))
      const onCart = await p.page.$(".cart__checkout")
      if (onCart) {
        await Promise.all([p.page.waitForNavigation({ waitUntil: "load" }).catch(() => {}), press(p.page, vp, ".cart__checkout")])
        await sleep(400)
      }
      check(`${vp.label}: Check out: begin_checkout`, p.hits.some((h) => h.en === "begin_checkout"), p.hits.map((h) => h.en))
      check(`${vp.label}: nothing went to Google but the tag and its hits`, p.google.length === 0, p.google)
      check(`${vp.label}: no script errors`, p.errors.length === 0, p.errors)
      await p.close()

      /* The visitor's language, offered: the proxy named French for this visit. */
      const l = await pageFor(browser, vp)
      await l.page.setCookie({ name: "sl_suggest", value: "fr", url: base })
      await l.page.goto(`${base}/`, { waitUntil: "load" })
      await l.page.waitForSelector("[data-language-suggest]", { timeout: 8000 }).catch(() => {})
      await sleep(400)
      const card = await l.page.evaluate(() => {
        const el = document.querySelector("[data-language-suggest]") as HTMLElement | null
        if (!el) return null
        const r = el.getBoundingClientRect()
        const a = el.querySelector("[data-language-suggest-go]") as HTMLAnchorElement
        return { text: el.querySelector("span")?.textContent, lang: el.getAttribute("lang"), go: a.textContent, href: a.getAttribute("href"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), opacity: getComputedStyle(el).opacity }
      })
      await l.page.screenshot({ path: `${OUT}/compat-language-offer-${vp.label}.png` })
      check(`${vp.label}: the offer card: in French, to /fr, small, at the top on a phone and the bottom right corner on a computer`, !!card && card.text === "Voir ce site en français\u00a0?" && card.lang === "fr" && card.go === "Français" && card.href === "/fr" && card.left >= 16 && card.right <= vp.width - 16 && (vp.touch ? card.top >= 8 && card.top <= 20 : card.bottom === vp.height - 24 && card.right === vp.width - 24) && card.h <= (vp.touch ? 72 : 60) && card.opacity === "1", card)
      check(`${vp.label}: nothing scrolls sideways with it`, (await sideways(l.page)) <= 0)
      await press(l.page, vp, "[data-language-suggest-close]")
      await sleep(400)
      const gone = await l.page.$("[data-language-suggest]")
      check(`${vp.label}: × closes it and keeps the page's language as the visitor's choice (sl_lang)`, !gone && (await cookies(l.page)).sl_lang === "en")
      await l.page.reload({ waitUntil: "load" })
      await sleep(600)
      check(`${vp.label}: and it is not offered again`, !(await l.page.$("[data-language-suggest]")))
      await l.close()
    }
  } finally {
    server.close()
  }
}

/* ── The harness for the React pages ──────────────────────────────────── */

async function bundleHarness(): Promise<string> {
  const out = mkdtempSync(join(tmpdir(), "visitors25-"))
  /* Inside the checkout (under .next, which git ignores), so the stand ins resolve react from its node_modules. */
  const stubs = join(root, ".next", "visitors25-stubs")
  mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const sub = (f) => { window.addEventListener("popstate", f); window.addEventListener("sl:nav", f); return () => { window.removeEventListener("popstate", f); window.removeEventListener("sl:nav", f) } }
export const usePathname = () => useSyncExternalStore(sub, () => location.pathname, () => location.pathname)
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams(location.search)
export const redirect = () => {}
export const notFound = () => {}
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
  writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, placeholder, blurDataURL, quality, unoptimized, ...rest }) { return React.createElement("img", { src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" } : undefined, ...rest }) }
`)
  writeFileSync(join(stubs, "analytics.js"), `export function Analytics() { return null }\n`)
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-visitors25.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
    `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@vercel/analytics/next=${join(stubs, "analytics.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl", "--jsx=automatic", "--platform=browser",
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    "--log-level=error",
  ], { cwd: root, stdio: ["ignore", "inherit", "inherit"] })
  return join(out, "probe.js")
}

async function serveHarness(bundle: string): Promise<{ server: Server; port: number }> {
  const { appCss, interFaces } = (await import("./probe-css.mjs" as string)) as { appCss: (r: string) => Promise<string>; interFaces: (r: string) => string }
  const css = (await appCss(root)) + "\n" + interFaces(root)
  const js = readFileSync(bundle)
  const item = gaItem({ id: "11111111-1111-4111-8111-111111111111", title: "Tech house drum kit", priceCents: 2499, quantity: 1, kind: "digital" })!
  const tagsFor = (view: string) => {
    const base = trackingTags({ ga4: GA }, { creatorId: SHOP, asks: true })
    if (view === "thanks") return [...base, ...purchaseTags({ ga4: GA }, { id: "0f3a9c2e-1111-4222-8333-444455556666", valueCents: 2499, currency: "USD", quantity: 1, items: [item] })]
    if (view === "settings" || view === "commerce" || view === "markets") return []
    return base
  }
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://shop.test")
    if (url.pathname === "/probe.js") { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(js); return }
    if (url.pathname === "/api/store/ga-check") {
      /* The real check page (lib/store/ga.ts gaCheckHtml), as the route answers the owner. */
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(gaCheckHtml((url.searchParams.get("id") ?? "").toUpperCase(), "https://andrew.storelib.com/"))
      return
    }
    if (url.pathname.startsWith("/api/")) { res.writeHead(204); res.end(); return }
    const view = url.searchParams.get("view") ?? "site"
    const ga = url.searchParams.get("ga")
    const seeded = ga === "receiving" ? { id: GA, seenAt: new Date(Date.now() - 2 * 60_000).toISOString(), checkedAt: new Date(Date.now() - 3600_000).toISOString(), ready: true } : ga === "connected" ? { id: GA, seenAt: null, checkedAt: new Date(Date.now() - 60_000).toISOString(), ready: true } : null
    const html = `<!doctype html><html class="light" lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Probe</title><style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="root"></div><script>window.process={env:{NODE_ENV:"production"}};window.__tags=${JSON.stringify(tagsFor(view)).replace(/</g, "\\u003c")};window.__ga=${JSON.stringify(seeded)}</script><script src="/probe.js"></script></body></html>`
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end(html)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, port: (server.address() as { port: number }).port }
}

async function storelibTheme(browser: Browser, base: string) {
  console.log("\nStorelib theme")
  for (const vp of VIEWPORTS) {
    /* From the US: counted in full at once. */
    const us = await pageFor(browser, vp, { country: "US" })
    await us.page.goto(`${base}/?view=site&page=product`, { waitUntil: "load" })
    await settle(us.page)
    const pv = us.hits.filter((h) => h.en === "page_view")
    const vi = us.hits.find((h) => h.en === "view_item")
    check(`${vp.label}: US visitor: one page_view, full (G111), and view_item with name, price and currency`, pv.length === 1 && pv[0].gcs === "G111" && !!vi && /Speckled mug/.test(vi.ep.items ?? "") && vi.ep.currency === "USD" && vi.ep.value === "32", us.hits)
    check(`${vp.label}: nothing went to Google but the tag and its hits; no script errors`, us.google.length === 0 && us.errors.length === 0, [us.google, us.errors])
    await us.close()

    /* From France: cookieless until Accept, then full on the same page. */
    const fr = await pageFor(browser, vp, { country: "FR" })
    await fr.page.goto(`${base}/?view=site`, { waitUntil: "load" })
    await settle(fr.page)
    const first = fr.hits.filter((h) => h.en === "page_view")
    check(`${vp.label}: EEA visitor before choosing: the page view still reaches Google, cookieless (G100), never nothing`, first.length === 1 && first[0].gcs === "G100", fr.hits)
    await fr.page.screenshot({ path: `${OUT}/site-banner-${vp.label}.png` })
    const accept = await fr.page.$$eval("[data-cookie-banner] button", (bs) => bs.findIndex((b) => /accept/i.test(b.textContent ?? "")))
    const buttons = await fr.page.$$("[data-cookie-banner] button")
    if (accept >= 0) await (vp.touch ? buttons[accept].tap() : buttons[accept].click())
    await sleep(500)
    await fr.page.evaluate(() => (window as unknown as { gtag: (...a: unknown[]) => void }).gtag("event", "scroll", { percent_scrolled: 90 }))
    await sleep(500)
    const after = fr.hits.find((h) => h.en === "scroll")
    check(`${vp.label}: Accept all: the next hit is counted in full (G111)`, accept >= 0 && after?.gcs === "G111", fr.hits)
    await fr.close()

    /* The offer: German, written in German, with the language switch still under the footer. */
    const de = await pageFor(browser, vp)
    await de.page.setCookie({ name: "sl_suggest", value: "de", url: base })
    await de.page.goto(`${base}/?view=site`, { waitUntil: "load" })
    await de.page.waitForSelector("[data-language-suggest]", { timeout: 8000 }).catch(() => {})
    await sleep(500)
    const card = await de.page.evaluate(() => {
      const el = document.querySelector("[data-language-suggest]") as HTMLElement | null
      if (!el) return null
      const r = el.getBoundingClientRect()
      const a = el.querySelector("[data-language-suggest-go]") as HTMLAnchorElement
      return { text: el.querySelector("span")?.textContent, go: a.textContent, href: a.getAttribute("href"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), switcher: !!document.querySelector("[data-language-switch] select") }
    })
    await de.page.screenshot({ path: `${OUT}/site-language-offer-${vp.label}.png` })
    check(`${vp.label}: the offer card in German to /de (the address kept), inside the screen, the language switch still there`, !!card && card.text === "Diese Seite auf Deutsch ansehen?" && card.go === "Deutsch" && card.href === "/de?view=site" && card.left >= 16 && card.right <= vp.width - 16 && card.switcher, card)
    await Promise.all([de.page.waitForNavigation({ waitUntil: "load" }).catch(() => {}), press(de.page, vp, "[data-language-suggest-go]")])
    check(`${vp.label}: pressing it opens /de and remembers German (sl_lang)`, new URL(de.page.url()).pathname === "/de" && (await cookies(de.page)).sl_lang === "de", de.page.url())
    await de.close()
  }
}

async function creatorPage(browser: Browser, base: string) {
  console.log("\ncreator page (its client parts on a stand-in page)")
  for (const vp of VIEWPORTS) {
    for (const em of [false, true]) {
      const c = await pageFor(browser, vp, { em })
      await c.page.goto(`${base}/andrew?view=creator`, { waitUntil: "load" })
      await settle(c.page, 1200)
      const views = () => c.hits.filter((h) => h.en === "page_view").map((h) => new URL(h.dl).pathname)
      check(`${vp.label}${em ? " (Google's page changes on)" : ""}: the first page is one page_view`, JSON.stringify(views()) === JSON.stringify(["/andrew"]), views())
      await press(c.page, vp, "[data-go='kit']")
      await sleep(1600)
      await press(c.page, vp, "[data-go='sleeve']")
      await sleep(1600)
      check(`${vp.label}${em ? " (Google's page changes on)" : ""}: each page opened without a full load is one page_view, never two`, JSON.stringify(views()) === JSON.stringify(["/andrew", "/andrew/tech-house-drum-kit", "/andrew/black-sleeve"]), views())
      await press(c.page, vp, "[data-go='explore']")
      await sleep(1600)
      check(`${vp.label}${em ? " (Google's page changes on)" : ""}: Explore is not the store's: nothing reaches its property`, !views().includes("/explore"), views())
      await press(c.page, vp, "[data-go='home']")
      await sleep(1600)
      check(`${vp.label}${em ? " (Google's page changes on)" : ""}: back on the store's page, counted again`, views()[views().length - 1] === "/andrew" && views().length === 4, views())
      check(`${vp.label}: no script errors`, c.errors.length === 0, c.errors)
      await c.close()
    }
    /* The language row and its offer: German, by ?lang= on the one address the creator page has. */
    const l = await pageFor(browser, vp)
    await l.page.goto(`${base}/andrew?view=creator&suggest=de`, { waitUntil: "load" })
    await l.page.waitForSelector("[data-language-suggest]", { timeout: 8000 }).catch(() => {})
    await sleep(400)
    const card = await l.page.evaluate(() => ({ text: document.querySelector("[data-language-suggest] span")?.textContent, href: document.querySelector("[data-language-suggest-go]")?.getAttribute("href"), row: !!document.querySelector("[data-creator-language] select") }))
    await l.page.screenshot({ path: `${OUT}/creator-language-${vp.label}.png`, fullPage: true })
    check(`${vp.label}: the creator page offers German at ?lang=de, and keeps its language row`, card.text === "Diese Seite auf Deutsch ansehen?" && /[?&]lang=de/.test(card.href ?? "") && card.row, card)
    check(`${vp.label}: nothing scrolls sideways`, (await sideways(l.page)) <= 0)
    await l.close()
  }
}

async function onePageCheckoutThanks(browser: Browser, base: string) {
  console.log("\nOnePage, checkout, thank you page")
  for (const vp of VIEWPORTS) {
    const o = await pageFor(browser, vp)
    await o.page.goto(`${base}/l/andrew?view=onepage`, { waitUntil: "load" })
    await settle(o.page)
    check(`${vp.label}: the OnePage: one page_view`, o.hits.filter((h) => h.en === "page_view").length === 1, o.hits)
    await o.close()

    const c = await pageFor(browser, vp)
    await c.page.goto(`${base}/checkout?view=checkout`, { waitUntil: "load" })
    await settle(c.page)
    const bc = c.hits.find((h) => h.en === "begin_checkout")
    check(`${vp.label}: checkout: page_view and begin_checkout with the cart's value and items`, c.hits.some((h) => h.en === "page_view") && !!bc && bc.ep.value === "24.99" && bc.ep.currency === "USD" && /Tech house drum kit/.test(bc.ep.items ?? ""), c.hits)
    await press(c.page, vp, "[data-pay]")
    await sleep(1200)
    const paid = c.hits.find((h) => h.en === "purchase")
    check(`${vp.label}: paid: purchase with value, items and a fingerprint id, never the receipt's reference`, !!paid && paid.ep.value === "24.99" && /^sl-[0-9a-f]{16}$/.test(paid.ep.transaction_id ?? "") && !c.hits.some((h) => JSON.stringify(h).includes("rcpt_")), paid)
    await press(c.page, vp, "[data-pay]")
    await sleep(800)
    check(`${vp.label}:   a second paid signal for the same order is not a second purchase`, c.hits.filter((h) => h.en === "purchase").length === 1)
    await c.close()

    const t = await pageFor(browser, vp)
    await t.page.goto(`${base}/checkout/thanks/x?view=thanks`, { waitUntil: "load" })
    await settle(t.page)
    const pur = t.hits.filter((h) => h.en === "purchase")
    check(`${vp.label}: thank you page: one purchase with the order's id, value and items`, pur.length === 1 && pur[0].ep.transaction_id === "0f3a9c2e-1111-4222-8333-444455556666" && pur[0].ep.value === "24.99" && /Tech house drum kit/.test(pur[0].ep.items ?? ""), t.hits)
    t.hits.length = 0
    await t.page.reload({ waitUntil: "load" })
    await settle(t.page)
    check(`${vp.label}:   opened again: a page_view, no second purchase`, t.hits.some((h) => h.en === "page_view") && !t.hits.some((h) => h.en === "purchase"), t.hits)
    await t.close()
  }
}

async function settings(browser: Browser, base: string) {
  console.log("\nSettings › Integrations › Google Analytics, Website settings, Markets and languages")
  for (const vp of VIEWPORTS) {
    const s = await pageFor(browser, vp)
    await s.page.goto(`${base}/app/settings?view=settings&state=empty`, { waitUntil: "load" })
    await s.page.waitForSelector("#tracker-ga4")
    await s.page.screenshot({ path: `${OUT}/ga-empty-${vp.label}.png` })
    await s.page.type("#tracker-ga4", "UA-12345678-1")
    await press(s.page, vp, "[data-ga-save]")
    await sleep(300)
    const ua = await s.page.evaluate(() => document.body.innerText)
    const putEarly = await s.page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.filter((c) => c.startsWith("PUT")).length)
    check(`${vp.label}: a UA- ID is named as switched off, not saved`, /Universal Analytics/.test(ua) && putEarly === 0, ua.slice(0, 200))
    /* Clear the field the way a person does (select all, delete), so React's own value is emptied too. */
    await s.page.focus("#tracker-ga4")
    await s.page.keyboard.down("Control")
    await s.page.keyboard.press("KeyA")
    await s.page.keyboard.up("Control")
    await s.page.keyboard.press("Backspace")
    await s.page.type("#tracker-ga4", `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>`)
    await press(s.page, vp, "[data-ga-save]")
    await s.page.waitForSelector('[data-ga-status="checking"]', { timeout: 4000 }).catch(() => {})
    await s.page.screenshot({ path: `${OUT}/ga-checking-${vp.label}.png` })
    await s.page.waitForSelector('[data-ga-status="connected"]', { timeout: 20000 }).catch(() => {})
    const state = await s.page.evaluate(() => ({ status: document.querySelector("[data-ga-status]")?.getAttribute("data-ga-status"), line: document.querySelector("[data-ga-line]")?.textContent, value: (document.querySelector("#tracker-ga4") as HTMLInputElement).value, calls: (window as unknown as { __calls: string[] }).__calls }))
    await s.page.screenshot({ path: `${OUT}/ga-connected-${vp.label}.png` })
    const test = s.hits.find((h) => h.en === "storelib_connected")
    check(`${vp.label}: Google's snippet pasted: the G- ID kept, Connect saved it and ran the check`, state.value === GA && state.calls.some((c) => c.startsWith("PUT /api/store/integrations") && c.includes(GA)) && state.calls.some((c) => c.startsWith("POST /api/store/ga-check")), state)
    check(`${vp.label}: the check's one event reached Google's collect address with this ID`, !!test && test.tid === GA && test.gcs === "G101", s.hits)
    check(`${vp.label}: Connected, with what to expect next`, state.status === "connected" && /Google took Storelib's test event/.test(state.line ?? ""), state)
    check(`${vp.label}: nothing scrolls sideways`, (await sideways(s.page)) <= 0)
    await s.close()

    const r = await pageFor(browser, vp)
    await r.page.goto(`${base}/app/settings?view=settings&ga=receiving`, { waitUntil: "load" })
    await r.page.waitForSelector('[data-ga-status="receiving-data"]', { timeout: 8000 }).catch(() => {})
    const rec = await r.page.evaluate(() => ({ title: document.querySelector("[data-ga-status] p")?.textContent, line: document.querySelector("[data-ga-line]")?.textContent, notes: document.querySelector("[data-ga-notes]")?.textContent }))
    await r.page.screenshot({ path: `${OUT}/ga-receiving-${vp.label}.png`, fullPage: true })
    check(`${vp.label}: Connected, receiving data, the last event's time, and the 48 hours note`, rec.title === "Connected, receiving data" && rec.line === "Last event 2 min ago, from a visit to your website." && /48 hours/.test(rec.notes ?? "") && /within a minute/.test(rec.notes ?? ""), rec)
    await r.close()

    const w = await pageFor(browser, vp)
    await w.page.goto(`${base}/app/website?view=commerce&ga=receiving`, { waitUntil: "load" })
    await w.page.waitForSelector("[data-ga-badge]", { timeout: 8000 }).catch(() => {})
    const badge = await w.page.evaluate(() => {
      const b = document.querySelector("[data-ga-badge]") as HTMLElement | null
      if (!b) return null
      b.scrollIntoView({ block: "center" })
      const r = b.getBoundingClientRect()
      return { text: b.textContent, h: Math.round(r.height), right: Math.round(r.right) }
    })
    await sleep(200)
    await w.page.screenshot({ path: `${OUT}/website-settings-badge-${vp.label}.png` })
    check(`${vp.label}: Website settings › Commerce › Integrations: a small Google Analytics mark`, !!badge && badge.text === "Google Analytics · Receiving data" && badge.h <= 22 && badge.right <= vp.width, badge)
    check(`${vp.label}: nothing scrolls sideways`, (await sideways(w.page)) <= 0)
    await w.close()

    const m = await pageFor(browser, vp)
    await m.page.goto(`${base}/app/settings?view=markets`, { waitUntil: "load" })
    await m.page.waitForSelector("[data-visitor-language]", { timeout: 8000 }).catch(() => {})
    const sw = await m.page.evaluate(() => {
      const el = document.querySelector("[data-visitor-language]") as HTMLElement | null
      el?.scrollIntoView({ block: "center" })
      return el ? { text: el.textContent, on: el.querySelector("[role=switch]")?.getAttribute("aria-checked") } : null
    })
    await sleep(200)
    await m.page.screenshot({ path: `${OUT}/markets-switch-${vp.label}.png` })
    check(`${vp.label}: Markets and languages: Show visitors their own language, off until turned on`, !!sw && /Show visitors their own language/.test(sw.text ?? "") && sw.on === "false", sw)
    /* Markets and languages saves as it is changed: the switch is the save. */
    await press(m.page, vp, "[data-visitor-language] [role=switch]")
    await sleep(800)
    const put = await m.page.evaluate(() => (window as unknown as { __calls: string[] }).__calls.find((c) => c.startsWith("PUT /api/store/markets")))
    check(`${vp.label}:   turned on, saved at once like the rest of the page`, !!put && /"visitorLanguage":true/.test(put), put)
    check(`${vp.label}: nothing scrolls sideways`, (await sideways(m.page)) <= 0)
    await m.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 240_000, args: ["--no-sandbox", "--host-resolver-rules=MAP shop.test 127.0.0.1, MAP posturex.test 127.0.0.1"] })
  try {
    const only = new Set(process.argv.slice(2))
    const all = only.size === 0
    if (all || only.has("compat")) await compat(browser)
    if (all || [...only].some((x) => x !== "compat")) {
      const bundle = await bundleHarness()
      const { server, port } = await serveHarness(bundle)
      const base = `http://shop.test:${port}`
      try {
        if (all || only.has("site")) await storelibTheme(browser, base)
        if (all || only.has("creator")) await creatorPage(browser, base)
        if (all || only.has("pages")) await onePageCheckoutThanks(browser, base)
        if (all || only.has("settings")) await settings(browser, base)
      } finally {
        server.close()
      }
    }
  } finally {
    await browser.close()
  }
  console.log(`\n${failed ? `${failed} failed` : "all passed"}; screenshots in ${OUT}`)
  process.exit(failed ? 1 : 0)
}
void main()
