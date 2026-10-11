/**
 * ===========================================================================
 *  A REAL SHOPIFY THEME, IMPORTED AND USED IN A BROWSER
 * ===========================================================================
 *   npx tsx scripts/check-shopify-theme.ts <theme.zip> [<theme.zip> …]
 *
 * Each ZIP (Horizon and Dawn are the two this was built against; neither is
 * in the repository, their license is Shopify's) goes through the import's
 * own converter, and the result is served by the live site's own handler
 * (lib/storelib-theme/compat/site.ts) on a local port, with a made up shop of
 * eight products. Then headless Chromium, at 1440 and at 390 wide:
 *
 *   every page type draws, with no script error and no sideways scroll
 *   Add to cart on a product page puts the product in the cart (/cart.js)
 *   and the header's count says so
 *   choosing another option changes the price on the page
 *   the cart page lists the line, and its quantity can be changed
 *   Buy it now sends that item alone to checkout and leaves the cart as it was
 *   the search box finds a product (/search/suggest, section rendering)
 *   the drawer's own Check out (its terms box ticked) reaches checkout
 *   in the builder's canvas (a sandboxed frame, its requests answered by
 *   canvas-cart.ts): Add to cart fills the builder's cart with no request
 *   to the network, and Buy it now says checkout is on the live site
 *   nothing is requested from Shopify's servers
 *   every icon draws: no empty <svg>, no <use> without its symbol, no
 *   broken SVG asset (home, a collection, a product)
 *   no button label wears a box of its own, at rest or on hover (the
 *   product form, the drawer's buttons)
 *   the product page holds still as it loads: layout shift under 0.1
 *   the header's cart opens the drawer or the cart page, never both, on
 *   the website and in the canvas
 *   in the canvas, /account, /account/login and /account/register draw in
 *   the theme, and sending a sign in form says it works on the live site
 *
 * And, on a page of their own (CHECKS=header,cards,recent,overlay,loading
 * runs any of these alone; `core` adds the checks above):
 *
 *   header     every link of the header pressed as a visitor presses it
 *              (a menu, a mega menu or a drawer opened first), on the
 *              website (the page opens) and in the canvas (the builder is
 *              told to open it); after scrolling, a sticky header's too;
 *              on a phone, the Overlay group's tab bar links
 *   cards      every product card has its name, a price and its pictures
 *              loaded (home, collections, search, a product's related
 *              products), no Liquid error; a card's picture opens it
 *   recent     three products looked at show in every recently viewed
 *              section, on the website and in the canvas
 *   overlay    each Overlay group section drawn once, in order, none
 *              switched off; a word changed in one shows in the canvas
 *   loading    home and a collection hold still (layout shift), no first
 *              screen picture left waiting, every section a script asks
 *              for (section rendering) answered
 *
 * SERVE=1 serves the site and the canvas alone, to look at by hand.
 *
 * Measurements, not opinions: each line prints what it measured. Exits 1 on
 * any failure. Screenshots go to $OUT (default /tmp/shopify-theme-check).
 */
import { createServer } from "node:http"
import { mkdirSync, readFileSync } from "node:fs"
import { basename } from "node:path"
import { readBasketParams } from "../lib/checkout/basket-link"
import JSZip from "jszip"
import puppeteer, { type Frame, type Page } from "puppeteer-core"
import sharp from "sharp"
import { convertShopifyTheme, conversionSummary } from "../lib/storelib-theme/shopify/convert"
import { shopifyGlobalAsset } from "../lib/storelib-theme/compat/shopify-global-assets"
import { formFields } from "../lib/storelib-theme/compat/form-fields"
import { drawSection, pageContextFor, sectionIndexIn, themeOfInstall, type StoredSection } from "../lib/storelib-theme/compat/page"
import { splitCompatFile } from "../lib/storelib-theme/compat/theme"
import { compileScss } from "../lib/storelib-theme/compat/scss"
import { answer, canvasAccountPage, themeAsset, readCartCookie, writeCartCookie, CART_COOKIE, type SiteData } from "../lib/storelib-theme/compat/site"
import { CANVAS_BRIDGE, CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"
import { answerInCanvas, canvasPages, type CanvasCart } from "../lib/storelib-theme/compat/canvas-cart"
import { liveNavigationEnd, liveNavigationMarkup } from "../lib/website-builder/live-navigation"

const OUT = process.env.OUT ?? "/tmp/shopify-theme-check"
/** What the page last sent to the basket checkout. */
let lastCheckout: { items?: unknown[] } | null = null
/* The builder's cart, for the canvas check, and any request the canvas frame sent to the network instead. */
let canvasCart: CanvasCart = { cart: [], note: "" }
const canvasLeaks: string[] = []
mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

/* One colour per picture, so a screenshot shows which picture is where. */
const COLOURS = ["#c9b8a6", "#8fa3b0", "#b5c4a1", "#d4a5a5", "#a7a2c9", "#e0c68a"]
const PNGS: Buffer[] = []

function shop() {
  const products = Array.from({ length: 8 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i}`,
    settings: {
      title: `Linen shirt ${i + 1}`,
      price: `$${(40 + i * 5).toFixed(2)}`,
      compare_price: i % 3 === 0 ? `$${(60 + i * 5).toFixed(2)}` : "",
      image: `https://img.test/p${i}.png`,
      images: [`https://img.test/p${i}.png`, `https://img.test/p${i}b.png`],
      url: `/products/linen-shirt-${i + 1}`,
      slug: `linen-shirt-${i + 1}`,
      kind: "physical",
      available: true,
      category: "Shirts",
      description: "Washed linen, cut loose.",
      variants: [
        { id: `v-${i}-s`, name: "Small", price: "", compare_price: "", available: true },
        { id: `v-${i}-l`, name: "Large", price: `$${(55 + i * 5).toFixed(2)}`, compare_price: "", available: true },
      ],
      options: [{ name: "Size", values: ["Small", "Large"] }],
    },
  }))
  const collections = [
    { id: "c-summer", title: "Summer", handle: "summer", description: "Light things", image: "https://img.test/c1.png", url: "/collections/summer", products: products.slice(0, 4), products_count: 4 },
    { id: "c-winter", title: "Winter", handle: "winter", description: "", image: "", url: "/collections/winter", products: products.slice(4), products_count: 4 },
  ]
  const menus = {
    "main-menu": { title: "Main menu", links: [{ title: "Home", url: "/" }, { title: "Shop", url: "/collections/all", links: [{ title: "Summer", url: "/collections/summer" }, { title: "Winter", url: "/collections/winter" }] }, { title: "Contact", url: "/pages/contact" }] },
    footer: { title: "Footer", links: [{ title: "Search", url: "/search" }] },
  }
  return { products, collections, menus }
}

async function serve(zipPath: string) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const t0 = Date.now()
  const r = await convertShopifyTheme(zip, { fallbackName: basename(zipPath, ".zip") })
  if (!r.ok) throw new Error(r.error)
  console.log(`\n${r.theme.name}: ${conversionSummary(r.report)} ${Date.now() - t0} ms, ${r.report.notes.length} notes`)
  const files = r.theme.files
  /* SETTINGS='{"cart_type":"drawer"}' runs the same checks with the theme's own settings changed, as a store owner would. */
  if (process.env.SETTINGS) {
    const values = (r.theme.settings as { shopify?: Record<string, unknown> }).shopify
    if (values) Object.assign(values, JSON.parse(process.env.SETTINGS))
  }
  const theme = themeOfInstall(files, r.theme.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const { products, collections, menus } = shop()
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const site: SiteData = { creatorId: "c", theme, pages, products, collections, menus, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund Policy", body: "<p>Returns are accepted within 30 days of delivery.</p>" }] }, host: "127.0.0.1", extraHead: liveNavigationMarkup(), extraBodyEnd: liveNavigationEnd() }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    /* Shopify's helper scripts, as app/api/site-theme/shopify/[name] serves them. */
    if (url.pathname.startsWith("/api/site-theme/shopify/")) {
      const js = shopifyGlobalAsset(decodeURIComponent(url.pathname.split("/").pop() ?? ""))
      res.writeHead(js ? 200 : 404, { "content-type": "application/javascript" })
      return res.end(js ?? "")
    }
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }), { scss: compileScss })
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type, "Access-Control-Allow-Origin": "*" })
      res.end(a.body)
      return
    }
    if (url.pathname.startsWith("/api/checkout/cart")) {
      const sent: Buffer[] = []
      for await (const c of req) sent.push(c as Buffer)
      try { lastCheckout = JSON.parse(Buffer.concat(sent).toString("utf8")) } catch { lastCheckout = null }
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ url: "http://127.0.0.1/__checkout_opened" }))
      return
    }
    /* The builder's canvas, as compat-canvas.tsx draws it: the page in a sandboxed frame, what its scripts ask answered by the parent. */
    if (url.pathname === "/__canvas") {
      const path = url.searchParams.get("path") ?? "/"
      /* An account page, as the builder's canvas draws it (compat-canvas.tsx, site.ts canvasAccountPage). */
      const account = /^\/account/.test(path) ? canvasAccountPage({ ...site, designMode: true, extraHead: undefined }, path, { extraBodyEnd: `<script>window.__slSite="https://linen.example";${CANVAS_BRIDGE}</script>` }) : null
      const drawn = account ? { body: account.html } : await answer({ ...site, designMode: true, extraHead: undefined, extraBodyEnd: `<script>window.__slSite="https://linen.example";${CANVAS_BRIDGE}</script>` }, { method: "GET", path: path.split("?")[0], query: new URLSearchParams(path.split("?")[1] ?? ""), body: null, cart: [] })
      /* What the website's visit left in the browser's storage, handed to the frame as the builder hands its own (compat-canvas.tsx canvasStorage). */
      const seed = (() => { try { return JSON.parse(url.searchParams.get("seed") ?? "{}") } catch { return {} } })()
      const doc = String(drawn.body).replace(/<head\b[^>]*>/i, (m) => `${m}<script>window.__slPath=${JSON.stringify(path)};window.__slSeed=${JSON.stringify(seed).replace(/</g, "\\u003c")};</script>${CANVAS_HEAD}`)
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><style>html,body,iframe{margin:0;border:0;width:100%;height:100%;display:block}</style><iframe id="f" sandbox="allow-scripts allow-forms allow-popups"></iframe><script>window.__events=[];var f=document.getElementById("f");f.srcdoc=${JSON.stringify(doc).replace(/</g, "\\u003c")};addEventListener("message",function(e){var m=e.data;if(!m||m.storelib!==1)return;if(m.type==="live-only")__events.push(m.what);if(m.type==="navigate")(window.__nav=window.__nav||[]).push(m.href);if(m.type!=="request")return;fetch("/__canvas-answer",{method:"POST",body:JSON.stringify({m:m,path:${JSON.stringify(path)}})}).then(function(r){return r.json()}).then(function(a){a.storelib=1;a.type="response";a.id=m.id;e.source.postMessage(a,"*")})});</script>`)
      return
    }
    /*
      A section of the home page drawn again with one of its words changed,
      as the builder draws it when a value changes in the sidebar
      (compat-canvas.tsx syncSlot): the first text setting whose value the
      section shows.
    */
    if (url.pathname === "/__redraw") {
      const list = (pages.home ?? []) as StoredSection[]
      const s = list.find((x) => x.id === url.searchParams.get("id"))
      if (!s) { res.writeHead(404); res.end(); return }
      const page = { template: "index", path: "/", designMode: true, products, collections, menus, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" } }
      const ctx = pageContextFor(theme, page as never, list)
      const group = s.group === "header" || s.group === "footer" ? s.group : undefined
      const before = drawSection(theme, ctx, s, sectionIndexIn(list, s), group).html
      const schema = splitCompatFile(theme.files[`sections/${theme.typeOf(s.type)}.storelib`] ?? "").schema as { settings?: { id?: string; type?: string; default?: unknown }[] } | null
      let changed: string | null = null
      let next = s
      for (const f of schema?.settings ?? []) {
        if (!f.id || !/^(text|inline_richtext|textarea)$/.test(f.type ?? "")) continue
        const value = String((s.settings ?? {})[f.id] ?? f.default ?? "").replace(/<[^>]+>/g, "").trim()
        if (value.length < 3 || !before.includes(value)) continue
        changed = f.id
        next = { ...s, settings: { ...(s.settings ?? {}), [f.id]: "W5 changed this" } }
        break
      }
      const html = changed ? drawSection(theme, pageContextFor(theme, page as never, list.map((x) => (x === s ? next : x))), next, sectionIndexIn(list, s), group).html : before
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ html, changed }))
      return
    }
    if (url.pathname === "/__canvas-answer") {
      const sent: Buffer[] = []
      for await (const c of req) sent.push(c as Buffer)
      const { m, path } = JSON.parse(Buffer.concat(sent).toString("utf8"))
      const own = pages.product ?? []
      const chrome = (pages.home ?? []).filter((x) => x.group === "header" || x.group === "footer" || x.group === "overlay")
      const sections = [...chrome.filter((x) => x.group === "header"), ...own.filter((x) => !x.group), ...chrome.filter((x) => x.group !== "header")]
      const r = await answerInCanvas({ ...site, designMode: true, pages: canvasPages(theme, "product", sections as never) }, canvasCart, { method: m.method, url: m.url, body: m.body, ajax: m.ajax === true }, path)
      canvasCart = r.state
      const { type: contentType, ...rest } = r.answer
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ contentType, ...rest }))
      return
    }
    /* A request from the canvas frame (no origin of its own) that reached the network: in the builder, it would have failed. */
    if (req.headers.origin === "null") {
      canvasLeaks.push(`${req.method} ${url.pathname}`)
      res.writeHead(404)
      res.end()
      return
    }
    /* The wishlist page itself, as Storelib draws it inside the theme's shell (the proxy sends the framed request there). */
    if (url.searchParams.has("sl_embed")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(`<!doctype html><html><head></head><body style="margin:0"><main style="padding:40px;height:420px">Sign in to your account</main></body></html>`)
      return
    }
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString("utf8")
    let body: Record<string, unknown> | null = null
    const type = String(req.headers["content-type"] ?? "")
    if (raw && type.includes("json")) body = JSON.parse(raw)
    else if (raw && type.includes("urlencoded")) body = formFields(new URLSearchParams(raw).entries())
    else if (raw && type.includes("multipart")) {
      const parts: [string, string][] = []
      for (const part of raw.split(/--[-\w]+/)) {
        const m = part.match(/name="([^"]+)"\r\n\r\n([\s\S]*?)\r\n$/)
        if (m) parts.push([m[1], m[2]])
      }
      body = formFields(parts)
    }
    const cookie = String(req.headers.cookie ?? "").match(new RegExp(`${CART_COOKIE}=([^;]*)`))?.[1]
    const { cart, note } = readCartCookie(cookie)
    const ajax = req.headers["x-requested-with"] === "XMLHttpRequest" || type.includes("json") || String(req.headers.accept ?? "").includes("application/json")
    /* The page a script's request came from, as the site route reads it (app/api/site-theme/site route.ts refererPath). */
    const referer = (() => { try { const u = new URL(String(req.headers.referer ?? "")); return `${u.pathname}${u.search}` } catch { return undefined } })()
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body, cart, note, ajax, referer })
    const headers: Record<string, string> = { ...(out.headers ?? {}), "Content-Type": out.type }
    if (out.cart) headers["Set-Cookie"] = `${CART_COOKIE}=${writeCartCookie(out.cart, out.note ?? "")}; Path=/; SameSite=Lax`
    res.writeHead(out.status, headers)
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const port = (server.address() as { port: number }).port
  /* The Overlay group as the home page holds it: what every page should draw once, in this order. */
  const overlay = (pages.home ?? []).filter((x) => x.group === "overlay").map((x) => ({ id: x.id, hidden: (x as { hidden?: boolean }).hidden === true }))
  /* What the theme draws at all, so a check for something it never had (Timber has no Buy it now) is skipped, not failed. */
  const source = Object.entries(files).filter(([k]) => /\.(liquid|js)$/.test(k)).map(([, v]) => v).join("\n")
  const uses = { svgIcons: Object.entries(files).some(([k, v]) => /\/(layout|sections|snippets|templates|blocks)\//.test(k) && /<svg/.test(v)), paymentButton: /payment_button/.test(source), filters: /\.filters\b/.test(source), predictive: /predictive|search\/suggest/i.test(source) }
  return { server, base: `http://127.0.0.1:${port}`, name: r.theme.name.toLowerCase().replace(/\W+/g, "-"), overlay, uses }
}

/*
  ═══════════════════════════════════════════════════════════════════════
   W5 CHECKS: the header's links, product cards, recently viewed, the
   Overlay group and the page holding still as it loads.
   CHECKS=header,cards,recent,overlay,loading runs these alone (any of
   them, comma separated); unset, they run before the others.
  ═══════════════════════════════════════════════════════════════════════
*/
const ONLY = (process.env.CHECKS ?? "").split(",").map((s) => s.trim()).filter(Boolean)
/* A page opened and settled. On a busy machine "settled" can take long; a page still busy after 90s is looked at as it is, and says so. */
/* Where a page ends up after a press: polled until the path is the one wanted (or 8s), since a theme may write the history first. */
const loads = new WeakMap<Page, { n: number }>()
/* How many times the page's main frame has gone somewhere (a new page, or the same one written into the history). */
const loadCount = (page: Page) => {
  let c = loads.get(page)
  if (!c) { const counter = { n: 0 }; c = counter; loads.set(page, counter); page.on("framenavigated", (f) => { if (f === page.mainFrame()) counter.n++ }) }
  return c.n
}
/*
  A link the theme opens in a new tab (target=_blank: Posturex's mega menu
  items, its "Open link in new tab" on by default) opens there, not here:
  the tab it opened is read, then closed.
*/
const newTabs = (page: Page) => {
  const opened: Page[] = []
  const on = (p: Page | null) => { if (p) opened.push(p) }
  page.on("popup", on)
  return {
    any: () => opened.length > 0,
    take: async () => {
      page.off("popup", on)
      const p = opened[0]
      if (!p) return null
      for (let t = 0; t < 30 && /^about:/.test(p.url()); t++) await new Promise((r) => setTimeout(r, 200))
      let path = ""
      try { const u = new URL(p.url()); path = `${u.pathname}${u.search}` } catch {}
      for (const x of opened) await x.close().catch(() => {})
      return path
    },
  }
}
const settledPath = async (page: Page, want: RegExp, withSearch = false, since = -1, stop: () => boolean = () => false) => {
  let got = ""
  for (let t = 0; t < 40; t++) {
    try { const u = new URL(page.url()); got = withSearch ? `${u.pathname}${u.search}` : u.pathname } catch { got = "" }
    if ((want.test(got) && (since < 0 || loadCount(page) > since)) || stop()) break
    await new Promise((r) => setTimeout(r, 200))
  }
  await page.waitForNetworkIdle({ idleTime: 300, timeout: 8000 }).catch(() => {})
  return got
}
const inFlight = new WeakMap<Page, Map<unknown, string>>()
const go = async (page: Page, url: string) => {
  if (!inFlight.has(page)) {
    const open = new Map<unknown, string>()
    inFlight.set(page, open)
    page.on("request", (r) => open.set(r, `${r.resourceType()} ${r.url().slice(0, 90)}`))
    for (const ev of ["requestfinished", "requestfailed"] as const) page.on(ev, (r) => open.delete(r))
  }
  await page.goto(url, { waitUntil: "networkidle0", timeout: 90_000 }).catch(async (e) => {
    /* What it was still waiting for, and whether the page itself still answers. */
    const answers = await Promise.race([page.evaluate(() => document.readyState).catch((x) => `no: ${String(x).slice(0, 40)}`), new Promise((r) => setTimeout(() => r("no answer in 5s"), 5000))])
    console.log(`        (${url.replace(/^https?:\/\/[^/]+/, "").slice(0, 60)}: ${String(e).slice(0, 60)}; page: ${answers}; waiting for: ${[...(inFlight.get(page)?.values() ?? [])].slice(0, 4).join(" | ") || "nothing"})`)
  })
}
const wants = (what: string) => !ONLY.length || ONLY.includes(what)
/* A group of checks that stopped part way (the browser stopped answering on a busy machine) is one failure, and the rest still run. */
/*
  A PAGE OF THEIR OWN for these checks, as the visitor's browser has it:
  the made up shop's pictures, Shopify's CDN pictures answered (as live),
  nothing else from outside. A group that stopped part way (a browser that
  stopped answering, on a busy machine) is one failure; the next group gets
  a new page, so one stuck tab does not fail the rest.
*/
async function w5Page(browser: import("puppeteer-core").Browser, base: string, label: string): Promise<Page> {
  const p = await browser.newPage()
  await p.setViewport({ width: label === "phone" ? 390 : 1440, height: label === "phone" ? 844 : 900, isMobile: label === "phone", hasTouch: label === "phone" })
  await p.evaluateOnNewDocument("window.__name = (f) => f")
  /* Layout shift and the largest picture, from the first byte of every page (read by loadingChecks). */
  await p.evaluateOnNewDocument(() => { const W = window as unknown as { __w5cls: number; __w5lcp: string }; W.__w5cls = 0; W.__w5lcp = ""; try { new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) W.__w5cls += e.value }).observe({ type: "layout-shift", buffered: true }); new PerformanceObserver((l) => { const e = l.getEntries().pop() as unknown as { element?: Element; url?: string } | undefined; if (e) W.__w5lcp = `${e.element?.tagName.toLowerCase() ?? ""} ${(e.url ?? "").split("/").pop()?.slice(0, 40) ?? ""}` }).observe({ type: "largest-contentful-paint", buffered: true }) } catch {} })
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith("https://img.test/")) return r.respond({ status: 200, contentType: "image/png", body: PNGS[(Number(u.match(/p(\d)/)?.[1] ?? 0)) % PNGS.length] })
    if (/shopify(cdn|cloud)?\.com/.test(u)) { if (r.resourceType() !== "image") return r.abort(); return /\.svg(\?|$)/i.test(u) ? r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#ccc"/></svg>' }) : r.respond({ status: 200, contentType: "image/png", body: PNGS[0] }) }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.respond({ status: 200, contentType: "text/css", body: "" })
    if (u.startsWith(base) || u.startsWith("data:")) return r.continue()
    return r.abort()
  })
  return p
}
const guard = async (what: string, label: string, run: () => Promise<void>): Promise<boolean> => {
  try { await run(); return true } catch (e) { check(`${label}: the ${what} checks ran to the end`, false, String(e).slice(0, 160)); return false }
}

/* Where the header is, and where the Overlay group's bars (a phone tab bar) are. */
const HEADER_SCOPE = ".shopify-section-group-header-group, #shopify-section-header, [id^='shopify-section-'][id$='__header'], header"
const OVERLAY_SCOPE = ".shopify-section-group-overlay-group"
const linksOf = (scope: string) => scope.split(",").map((x) => `${x.trim()} a[href]`).join(", ")

/* What a header link is, read in the page: its address, and a mark to find it again. */
type HeaderLink = { href: string; text: string; shown: boolean }

/** Every link of the header group's that goes somewhere on this site (the cart aside: the theme's drawer has its own check). */
const headerLinksIn = (frame: Frame, scope = HEADER_SCOPE) => frame.evaluate((scope: string) => {
  const groups = [...document.querySelectorAll(scope)]
  const seen = new Map<string, { href: string; text: string; shown: boolean }>()
  /* In the canvas the page is a srcdoc frame, with no address of its own: its links are read against the site's. */
  const here = location.protocol === "about:" ? "http://canvas.invalid/" : location.href
  for (const g of groups) {
    for (const a of g.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      if (a.closest("template, noscript")) continue
      const raw = a.getAttribute("href") ?? ""
      let u: URL
      try { u = new URL(raw, here) } catch { continue }
      if (u.origin !== new URL(here).origin || /^#|^javascript:|^mailto:|^tel:/i.test(raw)) continue
      if (u.pathname === location.pathname && u.hash && !u.search) continue
      /* The cart's own check is elsewhere; the account has its own pages. */
      if (/^\/cart(\/|$)/.test(u.pathname)) continue
      const href = `${u.pathname}${u.search}`
      const r = a.getBoundingClientRect()
      const shown = r.width > 1 && r.height > 1 && r.top < innerHeight && r.bottom > 0 && a.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      const had = seen.get(href)
      if (!had) seen.set(href, { href, shown, text: (a.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30) || (a.getAttribute("aria-label") ?? "") })
      else if (shown) had.shown = true
    }
  }
  return [...seen.values()]
}, scope)

/*
  REACHING A LINK AS A VISITOR DOES. Visible and on top: pressed. Otherwise
  whatever opens the menu it is in, found from the link itself: the summary
  of a closed <details> around it, a button or link that says it controls
  something around it (aria-controls, data-target, href="#id", a label for
  the checkbox that shows it), the item it hangs from (hovered, on a
  computer), and last any menu button in the header. Each press is a real
  one, at the middle of what is pressed, so a popup or a bar over the header
  that eats the press fails the same way it would for a visitor.
*/
async function pressHeaderLink(page: Page, frame: Frame, href: string, phone: boolean, scope = HEADER_SCOPE): Promise<{ pressed: boolean; trail: string[] }> {
  const linkSel = linksOf(scope)
  const trail: string[] = []
  const tried = new Set<string>()
  for (let round = 0; round < 6; round++) {
    const step = await frame.evaluate((want: string, phone: boolean, tried: string[], linkSel: string, scope: string) => {
      const W = window as unknown as { __probeId?: number }
      const shown = (el: Element) => {
        const r = el.getBoundingClientRect()
        if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.right <= 0 || r.top >= innerHeight || r.left >= innerWidth) return false
        /* Its own visibility (a child may be visible inside a hidden parent), and no parent undrawn or see-through. */
        return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      }
      const onTop = (el: Element) => {
        const r = el.getBoundingClientRect()
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 20))), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2))
        const hit = document.elementFromPoint(x, y)
        return !!hit && (el === hit || el.contains(hit) || hit.contains(el))
      }
      const mark = (el: Element) => { if (!el.hasAttribute("data-probe-id")) el.setAttribute("data-probe-id", String((W.__probeId = (W.__probeId ?? 0) + 1))); return el.getAttribute("data-probe-id")! }
      const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : ""}`
      const here = location.protocol === "about:" ? "http://canvas.invalid/" : location.href
      const links = [...document.querySelectorAll<HTMLAnchorElement>(linkSel)].filter((a) => { try { const u = new URL(a.getAttribute("href") ?? "", here); return `${u.pathname}${u.search}` === want } catch { return false } })
      const ready = links.find((a) => shown(a) && onTop(a))
      if (ready) return { kind: "press", id: mark(ready), what: name(ready) }
      /* What would open one of the links. */
      const openers: { el: Element; how: "click" | "hover" }[] = []
      for (const a of links) {
        const chain: Element[] = []
        for (let e: Element | null = a.parentElement; e && e !== document.body; e = e.parentElement) chain.push(e)
        for (const e of chain.reverse()) {
          if (e instanceof HTMLDetailsElement && !e.open) { const s = e.querySelector(":scope > summary"); if (s) openers.push({ el: s, how: "click" }) }
          if (e.id) for (const o of document.querySelectorAll(`[aria-controls~="${CSS.escape(e.id)}"], [data-target="#${CSS.escape(e.id)}"], [data-drawer="${CSS.escape(e.id)}"], a[href="#${CSS.escape(e.id)}"], label[for="${CSS.escape(e.id)}"]`)) openers.push({ el: o, how: "click" })
          const box = e.querySelector(":scope > input[type=checkbox]") as HTMLInputElement | null
          if (box?.id && !box.checked) for (const l of document.querySelectorAll(`label[for="${CSS.escape(box.id)}"]`)) openers.push({ el: l, how: "click" })
        }
        if (!phone) {
          /* The item it hangs from, on a computer: the nearest shown one around it. */
          for (let e: Element | null = a.parentElement; e && e !== document.body; e = e.parentElement) if (shown(e)) { const top = e.querySelector(":scope > a, :scope > summary, :scope > button, :scope > div > a, :scope > menu-item > a") ?? e; openers.push({ el: top, how: "hover" }); break }
        }
      }
      for (const g of document.querySelectorAll(scope)) for (const t of g.querySelectorAll("summary, button[aria-expanded], [aria-controls], [class*='hamburger' i], [class*='menu-toggle' i], [class*='menu-drawer' i] summary, [class*='mobile-menu' i] button, [class*='nav-toggle' i], [data-action*='menu' i], [aria-label*='menu' i]")) openers.push({ el: t, how: "click" })
      for (const o of openers) {
        if (!shown(o.el) || !onTop(o.el)) continue
        const id = mark(o.el)
        if (tried.includes(`${o.how}:${id}`)) continue
        return { kind: o.how, id, what: name(o.el) }
      }
      /* Nothing left to open: one on screen under something else is a link a visitor cannot press. */
      const covered = links.find((a) => shown(a))
      if (covered) {
        const r = covered.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2)
        if (hit && !hit.closest(scope)) return { kind: "covered", id: "", what: `${name(covered)} under ${hit ? name(hit) : "nothing"}` }
      }
      return { kind: "none", id: "", what: links.length ? `${links.length} links, none shown` : "no such link" }
    }, href, phone, [...tried], linkSel, scope)
    if (step.kind === "none" || step.kind === "covered") { trail.push(`${step.kind}: ${step.what}`); return { pressed: false, trail } }
    tried.add(`${step.kind}:${step.id}`)
    trail.push(`${step.kind} ${step.what}`)
    const handle = await frame.$(`[data-probe-id="${step.id}"]`)
    const box = await handle?.boundingBox()
    if (!box) return { pressed: false, trail }
    const x = box.x + Math.min(box.width / 2, 20), y = box.y + box.height / 2
    if (step.kind === "hover") { await page.mouse.move(x, y, { steps: 4 }); await new Promise((r) => setTimeout(r, 500)); continue }
    if (step.kind === "press") {
      await page.mouse.move(x, y, { steps: 2 })
      if (phone) await page.touchscreen.tap(x, y)
      else await page.mouse.click(x, y)
      return { pressed: true, trail }
    }
    if (phone) await page.touchscreen.tap(x, y)
    else await page.mouse.click(x, y)
    /* A drawer slides in: up to 1.6s for the link to come into view. */
    for (let t = 0; t < 8; t++) {
      await new Promise((r) => setTimeout(r, 200))
      const there = await frame.evaluate((want: string, linkSel: string) => {
        const here = location.protocol === "about:" ? "http://canvas.invalid/" : location.href
        return [...document.querySelectorAll<HTMLAnchorElement>(linkSel)].some((a) => {
          try { const u = new URL(a.getAttribute("href") ?? "", here); if (`${u.pathname}${u.search}` !== want) return false } catch { return false }
          const r = a.getBoundingClientRect()
          if (r.width < 2 || r.height < 2 || r.top >= innerHeight || r.left >= innerWidth || r.right <= 0 || r.bottom <= 0) return false
          const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2)
          return !!hit && (a === hit || a.contains(hit))
        })
      }, href, linkSel).catch(() => false)
      if (there) break
    }
  }
  return { pressed: false, trail }
}

/*
  THE HEADER'S LINKS, EVERY ONE, AS A VISITOR PRESSES THEM. On the website:
  the page the link names opens. In the builder's canvas: the builder is
  told to open it. A link the menu hides is reached by opening the menu.
*/
async function headerChecks(page: Page, base: string, phone: boolean, label: string, name: string) {
  let shot = 0
  const env = [["the website", (p: string) => `${base}${p}`], ["the canvas", (p: string) => `${base}/__canvas?path=${encodeURIComponent(p)}`]] as const
  for (const [where, at] of env) {
    for (const from of ["/", "/products/linen-shirt-2"]) {
      await go(page, at(from))
      await new Promise((r) => setTimeout(r, 500))
      const frameOf = () => (where === "the canvas" ? page.frames().find((f) => f !== page.mainFrame())! : page.mainFrame())
      /* The shop's menus (shop() above) and whatever the header shows as the page opens must work; another link the header holds hidden (a product in a mega menu kept for a wider screen) is tried and said, not counted. */
      const MENU = ["/", "/collections/all", "/collections/summer", "/collections/winter", "/pages/contact"]
      const links = (await headerLinksIn(frameOf())).sort((a, b) => Number(MENU.includes(b.href) || b.shown) - Number(MENU.includes(a.href) || a.shown)).slice(0, 14)
      const required = (l: HeaderLink) => MENU.includes(l.href) || l.shown
      const failed: string[] = []
      const optional: string[] = []
      let ok = 0
      for (const l of links) {
        await go(page, at(from))
        await new Promise((r) => setTimeout(r, 400))
        await page.evaluate(() => { (window as unknown as { __nav: string[] }).__nav = [] })
        const before = loadCount(page)
        const tabs = newTabs(page)
        const r = await pressHeaderLink(page, frameOf(), l.href, phone)
        const miss = required(l) ? failed : optional
        if (!r.pressed) { if (required(l)) await page.screenshot({ path: `${OUT}/${name}-${label}-header-${++shot}.png` }); miss.push(`${l.text || l.href} ${l.href} unreachable [${r.trail.join(" > ")}]`); continue }
        if (where === "the website") {
          const want = l.href.split("?")[0]
          const here = await settledPath(page, new RegExp(`^${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\?|$)|^/account|^/collections/all`), true, before, tabs.any)
          const tab = await tabs.take()
          const got = tab ?? here
          if (got === l.href || (l.href === "/products" && got.startsWith("/collections/all")) || (/^\/account/.test(l.href) && /^\/account/.test(got))) ok++
          else miss.push(`${l.text} ${l.href} opened ${got}${tab !== null ? " in a new tab" : ""} [${r.trail.join(" > ")}]`)
        } else {
          await tabs.take()
          await new Promise((r) => setTimeout(r, 700))
          const navs = await page.evaluate(() => (window as unknown as { __nav?: string[] }).__nav ?? [])
          if (navs.some((h) => { try { const u = new URL(h, "http://x"); return `${u.pathname}${u.search}` === l.href } catch { return false } })) ok++
          else miss.push(`${l.text} ${l.href} told the builder ${navs.join(" ") || "nothing"} [${r.trail.join(" > ")}]`)
        }
      }
      check(`${where}, ${label}, from ${from}: every header link opens its page`, links.length > 0 && failed.length === 0, `${ok} of ${links.length}${failed.length ? `; ${failed.slice(0, 4).join(" | ")}` : ""}${optional.length ? `; not reached, kept hidden at this width: ${optional.slice(0, 3).join(" | ")}` : ""}`)
      /* The Overlay group's bars (a phone tab bar, a back to top): each link shown on the page opens its page too. */
      if (from === "/") {
        await go(page, at(from))
        const bar = (await headerLinksIn(frameOf(), OVERLAY_SCOPE)).filter((l) => l.shown)
        const barFailed: string[] = []
        for (const l of bar) {
          await go(page, at(from))
          await page.evaluate(() => { (window as unknown as { __nav: string[] }).__nav = [] })
          const before = loadCount(page)
          const tabs = newTabs(page)
          const r = await pressHeaderLink(page, frameOf(), l.href, phone, OVERLAY_SCOPE)
          const want = l.href.split("?")[0]
          const here = !r.pressed ? "" : where === "the website" ? await settledPath(page, new RegExp(`^${want.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$|^/account|^/collections/all|^/wishlist`), false, before, tabs.any) : (await new Promise((res) => setTimeout(res, 900)), (await page.evaluate(() => (window as unknown as { __nav?: string[] }).__nav ?? [])).join(" "))
          const got = (await tabs.take()) ?? here
          const ok = r.pressed && (got.split(/\s/).some((g) => g.split("?")[0] === want) || (/^\/account/.test(want) && /\/account/.test(got)) || (/wishlist/.test(want) && /wishlist/.test(got)) || (want === "/products" && /\/collections\/all|\/products/.test(got)))
          if (!ok) barFailed.push(`${l.text || l.href} ${l.href}: ${got || "nothing"} [${r.trail.join(" > ")}]`)
        }
        if (bar.length) check(`${where}, ${label}: the Overlay group's bar links open their pages`, barFailed.length === 0, `${bar.length - barFailed.length} of ${bar.length}${barFailed.length ? `; ${barFailed.slice(0, 3).join(" | ")}` : ""}`)
      }
      /* Scrolled down the page and a little back up, as a visitor reaches for the menu: a header that stays (sticky, or shown again on the way up) still opens its links. */
      if (from === "/") {
        await go(page, at("/products/linen-shirt-2"))
        const f = frameOf()
        await f.evaluate(async () => { scrollTo(0, Math.min(1600, document.documentElement.scrollHeight - innerHeight)); await new Promise((r) => setTimeout(r, 400)); scrollBy(0, -120); await new Promise((r) => setTimeout(r, 700)) })
        const target = await f.evaluate((menu: string[]) => {
          const here = location.protocol === "about:" ? "http://canvas.invalid/" : location.href
          const a = [...document.querySelectorAll<HTMLAnchorElement>("header a[href], .shopify-section-group-header-group a[href]")].find((x) => { try { const u = new URL(x.getAttribute("href") ?? "", here); const r = x.getBoundingClientRect(); return menu.includes(u.pathname) && u.pathname !== "/" && r.top >= 0 && r.bottom <= innerHeight && r.width > 1 && x.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && (() => { const h = document.elementFromPoint(r.left + Math.min(r.width / 2, 20), r.top + r.height / 2); return !!h && (h === x || x.contains(h)) })() } catch { return false } })
          return a ? new URL(a.getAttribute("href") ?? "", here).pathname : null
        }, MENU)
        if (!target) console.log(`  --    ${where}, ${label}: the header is not on screen once the page is scrolled (not sticky)`)
        else {
          await page.evaluate(() => { (window as unknown as { __nav: string[] }).__nav = [] })
          const before = loadCount(page)
          const tabs = newTabs(page)
          const r = await pressHeaderLink(page, f, target, phone)
          const got = where === "the website" ? ((await settledPath(page, new RegExp(`^${target}$`), false, before, tabs.any)) && ((await tabs.take()) ?? new URL(page.url()).pathname)) : (await new Promise((res) => setTimeout(res, 900)), (await page.evaluate(() => (window as unknown as { __nav?: string[] }).__nav ?? [])).join(" "))
          check(`${where}, ${label}: scrolled down the page, the sticky header's ${target} still opens`, r.pressed && got.split(/[?\s]/).includes(target), `${got || "nothing"} [${r.trail.join(" > ")}]`)
        }
      }
    }
  }
}

/* Down the page and back, slowly, as a visitor reads it: what loads as it is reached has loaded. */
async function readDown(page: Page, frame: Frame) {
  const h = await frame.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < h; y += 500) { await frame.evaluate((y) => window.scrollTo(0, y), y); await new Promise((r) => setTimeout(r, 120)) }
  await new Promise((r) => setTimeout(r, 800))
  await frame.evaluate(() => window.scrollTo(0, 0))
  void page
}

/*
  EVERY PRODUCT CARD DRAWS: for each product the page links to, the card
  around the link (the largest box holding links to that product alone) has
  its name, a price, and a picture that loaded. A card the engine could not
  draw is missing, or empty, or prints a Liquid error.
*/
const cardsIn = (frame: Frame) => frame.evaluate(async () => {
  const main = document.querySelector("main, #MainContent, [role=main]") ?? document.body
  const handleOf = (a: Element) => (a.getAttribute("href") ?? "").match(/\/products\/([^/?#]+)/)?.[1] ?? null
  const byHandle = new Map<string, Element>()
  for (const a of main.querySelectorAll("a[href*='/products/']")) {
    if (a.closest("template, noscript, .shopify-section-group-header-group, .shopify-section-group-footer-group, .shopify-section-group-overlay-group")) continue
    const h = handleOf(a)
    if (!h || !/^linen-shirt-\d$/.test(h)) continue
    let card: Element = a
    while (card.parentElement && card.parentElement !== main) {
      const p = card.parentElement
      const others = [...p.querySelectorAll("a[href*='/products/']")].some((x) => handleOf(x) !== h)
      if (others) break
      card = p
    }
    const had = byHandle.get(h)
    if (!had || had.contains(card) === false && card.contains(had)) byHandle.set(h, card)
  }
  const out: { handle: string; title: boolean; price: boolean; pictures: number; loaded: number; shown: boolean; text: string }[] = []
  /* Each card brought into view, as a visitor scrolls to it: the pictures it shows there (not a slide waiting off to its side, not a picture shown on hover) have loaded. */
  for (const [handle, card] of byHandle) {
    const r0 = card.getBoundingClientRect()
    if (!(card as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }) || r0.width < 20) continue
    card.scrollIntoView({ block: "center" })
    await new Promise((r) => setTimeout(r, 250))
    const n = Number(handle.split("-").pop())
    const text = (card as HTMLElement).innerText.replace(/\s+/g, " ").trim()
    const onScreen = (i: HTMLImageElement) => {
      const b = i.getBoundingClientRect()
      if (b.width <= 20 || b.height <= 20 || !i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
      const x = Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, b.top + b.height / 2))
      return document.elementsFromPoint(x, y).includes(i)
    }
    const imgs = [...card.querySelectorAll("img")].filter(onScreen)
    for (let t = 0; t < 10 && imgs.some((i) => !(i.complete && i.naturalWidth > 0)); t++) await new Promise((r) => setTimeout(r, 150))
    out.push({ handle, shown: true, title: new RegExp(`Linen shirt ${n}\\b`, "i").test(text + " " + [...card.querySelectorAll("img")].map((i) => i.alt).join(" ")), price: /\$\s?\d/.test(text), pictures: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, text: text.slice(0, 60) })
  }
  scrollTo(0, 0)
  const errors = (document.body.innerText.match(/Liquid (syntax )?error[^\n]{0,80}/gi) ?? []).slice(0, 3)
  return { cards: out, errors }
})

async function cardChecks(page: Page, base: string, label: string) {
  for (const [where, at] of [["the website", (p: string) => `${base}${p}`], ["the canvas", (p: string) => `${base}/__canvas?path=${encodeURIComponent(p)}`]] as const) {
    for (const path of ["/", "/collections/all", "/collections/summer", "/search?q=linen", "/products/linen-shirt-2"]) {
      await go(page, at(path))
      const frame = where === "the canvas" ? page.frames().find((f) => f !== page.mainFrame())! : page.mainFrame()
      await readDown(page, frame)
      const { cards, errors } = await cardsIn(frame)
      const bad = cards.filter((c) => !c.title || !c.price || c.pictures === 0 || c.loaded < c.pictures)
      const want = path === "/collections/all" ? 8 : path === "/collections/summer" ? 4 : 0
      if (!cards.length && !want) { console.log(`  --    ${where}, ${label}, ${path}: no product cards`); continue }
      check(`${where}, ${label}, ${path}: every product card has its name, price and picture${want ? ` (${want} cards)` : ""}`, bad.length === 0 && cards.length >= want && errors.length === 0, `${cards.length} cards${bad.length ? `; ${bad.slice(0, 3).map((c) => `${c.handle}: title ${c.title}, price ${c.price}, pictures ${c.loaded}/${c.pictures} "${c.text}"`).join(" | ")}` : ""}${errors.length ? `; ${errors.join(" | ")}` : ""}`)
    }
    /* A card's picture pressed, as a visitor presses it: the product opens (in the canvas, the builder is told to open it). */
    await go(page, at("/collections/all"))
    const frame = where === "the canvas" ? page.frames().find((f) => f !== page.mainFrame())! : page.mainFrame()
    await page.evaluate(() => { (window as unknown as { __nav: string[] }).__nav = [] })
    const spot = await frame.evaluate(() => {
      const main = document.querySelector("main, #MainContent") ?? document.body
      const img = [...main.querySelectorAll<HTMLImageElement>("img")].find((i) => { const b = i.getBoundingClientRect(); return b.width > 60 && b.height > 60 && i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && (() => { for (let e: Element | null = i.parentElement, n = 0; e && n < 8; e = e.parentElement, n++) if (e.querySelector("a[href*='/products/linen-shirt-']")) return true; return false })() })
      if (!img) return null
      img.scrollIntoView({ block: "center" })
      const b = img.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    if (!spot) { console.log(`  --    ${where}, ${label}: no card picture on /collections/all`); continue }
    if (label === "phone") await page.touchscreen.tap(spot.x, spot.y)
    else await page.mouse.click(spot.x, spot.y)
    let opened = ""
    /* The address the page ends at: a theme may first write its own into the history (Horizon keeps the card to come back to), then leave. */
    if (where === "the website") opened = await settledPath(page, /^\/products\//)
    else { await new Promise((r) => setTimeout(r, 1500)); opened = (await page.evaluate(() => (window as unknown as { __nav?: string[] }).__nav ?? [])).join(" ") }
    check(`${where}, ${label}: a product card's picture, pressed, opens the product`, /\/products\/linen-shirt-\d/.test(opened), opened || "nothing opened")
  }
}

/*
  RECENTLY VIEWED: three products looked at, then a fourth and the home
  page. Every section of the theme's that says it is about recently viewed
  products (by its type or its id) shows the ones looked at, each with its
  picture loaded; in the canvas too, with what the website's visit left in
  the browser's storage handed to the frame (as the builder does).
*/
const recentIn = (frame: Frame) => frame.evaluate(() => {
  const handleOf = (a: Element) => (a.getAttribute("href") ?? "").match(/\/products\/([^/?#]+)/)?.[1] ?? null
  const out: { id: string; handles: string[]; pictures: number; loaded: number }[] = []
  for (const s of document.querySelectorAll<HTMLElement>(".shopify-section")) {
    const name = `${s.id} ${s.getAttribute("data-section-type") ?? ""}`
    if (!/recent/i.test(name) || s.closest(".shopify-section-group-header-group, .shopify-section-group-footer-group")) continue
    const handles = [...new Set([...s.querySelectorAll("a[href*='/products/']")].map(handleOf).filter((h): h is string => !!h))]
    const imgs = [...s.querySelectorAll("img")].filter((i) => { const b = i.getBoundingClientRect(); return b.width > 20 && b.height > 20 })
    out.push({ id: s.id.replace(/^shopify-section-/, ""), handles, pictures: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length })
  }
  return out
})

async function recentChecks(page: Page, base: string, label: string) {
  const seen = ["linen-shirt-1", "linen-shirt-2", "linen-shirt-3"]
  for (const h of seen) { await go(page, `${base}/products/${h}`); await new Promise((r) => setTimeout(r, 300)) }
  const storage = await page.evaluate(() => { const o: Record<string, string> = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; o[k] = localStorage.getItem(k) ?? "" } return o })
  for (const [where, at] of [["the website", (p: string) => `${base}${p}`], ["the canvas", (p: string) => `${base}/__canvas?path=${encodeURIComponent(p)}&seed=${encodeURIComponent(JSON.stringify({ localStorage: storage }))}`]] as const) {
    for (const path of ["/products/linen-shirt-4", "/"]) {
      await go(page, at(path))
      const frame = where === "the canvas" ? page.frames().find((f) => f !== page.mainFrame())! : page.mainFrame()
      await readDown(page, frame)
      await new Promise((r) => setTimeout(r, 600))
      const found = await recentIn(frame)
      if (!found.length) { console.log(`  --    ${where}, ${label}, ${path}: no recently viewed section`); continue }
      const bad = found.filter((f) => !seen.every((h) => f.handles.includes(h)) || f.loaded < f.pictures || f.pictures === 0)
      check(`${where}, ${label}, ${path}: every recently viewed section shows the three products looked at, pictures loaded`, bad.length === 0, `${found.length} sections${bad.length ? `; ${bad.map((b) => `${b.id}: [${b.handles.join(" ")}] pictures ${b.loaded}/${b.pictures}`).join(" | ")}` : ""}`)
    }
  }
  await page.evaluate(() => { try { localStorage.clear() } catch {} })
}

/*
  THE OVERLAY GROUP: every section of it the page should draw is drawn,
  once, in the group's order, and none that was switched off; no section
  anywhere is drawn twice. In the canvas, each one drawn is a section the
  builder can select (it carries its id), and a value changed in the
  sidebar shows on the page.
*/
async function overlayChecks(page: Page, base: string, label: string, overlay: { id: string; hidden: boolean }[]) {
  if (!overlay.length) { console.log(`  --    ${label}: the theme has no Overlay group`); return }
  for (const [where, at] of [["the website", (p: string) => `${base}${p}`], ["the canvas", (p: string) => `${base}/__canvas?path=${encodeURIComponent(p)}`]] as const) {
    for (const path of ["/", "/products/linen-shirt-2", "/collections/all"]) {
      await go(page, at(path))
      const frame = where === "the canvas" ? page.frames().find((f) => f !== page.mainFrame())! : page.mainFrame()
      const r = await frame.evaluate((want: { id: string; hidden: boolean }[]) => {
        const all = [...document.querySelectorAll("[id^='shopify-section-']")].filter((e) => e.classList.contains("shopify-section")).map((e) => e.id)
        const twice = [...new Set(all.filter((id, i) => all.indexOf(id) !== i))]
        const count = (id: string) => document.querySelectorAll(`[id="shopify-section-${CSS.escape(id)}"]`).length
        const missing = want.filter((w) => !w.hidden && count(w.id) !== 1).map((w) => `${w.id}×${count(w.id)}`)
        const shownOff = want.filter((w) => w.hidden && count(w.id) > 0).map((w) => w.id)
        const order = want.filter((w) => !w.hidden && count(w.id) === 1).map((w) => all.indexOf(`shopify-section-${w.id}`))
        const inOrder = order.every((v, i) => i === 0 || v > order[i - 1])
        const unpickable = want.filter((w) => !w.hidden).map((w) => document.getElementById(`shopify-section-${w.id}`)).filter((e) => e && e.getAttribute("data-section-id") === null && !/^shopify-section-/.test(e.id)).length
        return { twice, missing, shownOff, inOrder, unpickable }
      }, overlay)
      check(`${where}, ${label}, ${path}: the Overlay group's ${overlay.filter((o) => !o.hidden).length} sections each drawn once, in order, none switched off drawn, no section twice`, !r.twice.length && !r.missing.length && !r.shownOff.length && r.inOrder && !r.unpickable, JSON.stringify(r))
    }
  }
  /* A word changed in the sidebar shows in the canvas at once, in that section alone, and the page keeps working. */
  const errors: string[] = []
  const onError = (e: unknown) => { errors.push(String(e).slice(0, 160)) }
  page.on("pageerror", onError)
  const changedOk: string[] = []
  const changedBad: string[] = []
  for (const o of overlay.filter((x) => !x.hidden)) {
    const r = await (await fetch(`${base}/__redraw?id=${encodeURIComponent(o.id)}`)).json() as { html: string; changed: string | null }
    if (!r.changed) continue
    await go(page, `${base}/__canvas?path=%2F`)
    const frame = page.frames().find((f) => f !== page.mainFrame())!
    errors.length = 0
    await page.evaluate((id: string, html: string) => { const f = document.querySelector("iframe") as HTMLIFrameElement; f.contentWindow!.postMessage({ storelib: 1, type: "section", id, html }, "*") }, o.id, r.html)
    await new Promise((res) => setTimeout(res, 1200))
    const after = await frame.evaluate((id: string) => ({ copies: document.querySelectorAll(`[id="shopify-section-${CSS.escape(id)}"]`).length, shows: (document.getElementById(`shopify-section-${id}`)?.innerHTML ?? "").includes("W5 changed this") }), o.id)
    if (after.copies === 1 && after.shows && errors.length === 0) changedOk.push(o.id)
    else changedBad.push(`${o.id} (${r.changed}): ${after.copies} copies, shows ${after.shows}${errors[0] ? `, ${errors[0]}` : ""}`)
  }
  page.off("pageerror", onError)
  if (changedOk.length + changedBad.length) check(`the canvas, ${label}: a word changed in an Overlay section shows at once, in that section alone, with no script error`, changedBad.length === 0, `${changedOk.length} changed${changedBad.length ? `; ${changedBad.slice(0, 3).join(" | ")}` : ""}`)
  else console.log(`  --    the canvas, ${label}: no Overlay section shows a word of its settings`)
}

/*
  THE PAGE HOLDS STILL AS IT LOADS: home and a collection, layout shift
  under 0.1, and no picture on the first screen waits to be lazy loaded (the
  largest one is asked for first, as Shopify's own themes do).
*/
async function loadingChecks(page: Page, base: string, label: string) {
  /* Every section a page's scripts ask for after it loads (Horizon's header fills its menus so), answered. */
  const refused: string[] = []
  const heard = (r: import("puppeteer-core").HTTPResponse) => { const u = r.url(); if (u.startsWith(base) && /[?&](section_id|sections)=/.test(u) && r.status() >= 400) refused.push(`${r.status()} ${u.slice(base.length, base.length + 90)}`) }
  page.on("response", heard)
  for (const path of ["/", "/collections/all", "/products/linen-shirt-2"]) {
    await go(page, `${base}${path}`)
    await new Promise((r) => setTimeout(r, 1200))
  }
  page.off("response", heard)
  check(`${label}: every section a page's scripts ask for is answered`, refused.length === 0, refused.slice(0, 3).join(" | ") || "none refused")
  for (const path of ["/", "/collections/all"]) {
    await go(page, `${base}${path}`)
    await new Promise((r) => setTimeout(r, 1500))
    const r = await page.evaluate(() => {
      const W = window as unknown as { __w5cls?: number; __w5lcp?: string }
      const first = [...document.images].filter((i) => { const b = i.getBoundingClientRect(); return b.width > 100 && b.height > 60 && b.top < innerHeight && b.bottom > 0 && i.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !i.closest("[class*='popup' i], [class*='modal' i], dialog") && document.elementsFromPoint(Math.min(innerWidth - 1, Math.max(0, b.left + b.width / 2)), Math.min(innerHeight - 1, Math.max(0, b.top + Math.min(b.height / 2, (innerHeight - b.top) / 2)))).includes(i) })
      const lazyFirst = first.filter((i) => i.loading === "lazy" && !(i.complete && i.naturalWidth)).map((i) => (i.currentSrc || i.src).split("/").pop()?.slice(0, 40))
      const unsized = [...document.images].filter((i) => { const b = i.getBoundingClientRect(); return b.width > 40 && !i.getAttribute("width") && !i.getAttribute("height") && getComputedStyle(i).aspectRatio === "auto" && getComputedStyle(i).position !== "absolute" && !/(%|vw|vh)/.test(i.style.height) }).length
      return { cls: W.__w5cls ?? -1, lcp: W.__w5lcp ?? "", lazyFirst, unsized }
    })
    check(`${label}, ${path}: holds still as it loads (layout shift under 0.1)`, r.cls >= 0 && r.cls < 0.1, `${r.cls.toFixed(4)}; largest paint: ${r.lcp || "none"}; pictures with no size of their own: ${r.unsized}`)
    check(`${label}, ${path}: no picture on the first screen is still waiting to be lazy loaded`, r.lazyFirst.length === 0, r.lazyFirst.join(" ") || "none")
  }
}

async function run(zipPath: string) {
  const { server, base, name, overlay, uses } = await serve(zipPath)
  const themeUsesSvgIcons = uses.svgIcons, themeUsesPaymentButton = uses.paymentButton, themeUsesFilters = uses.filters, themeUsesPredictive = uses.predictive
  /* SERVE=1: the site alone, for a person (or a script) to look at it. */
  if (process.env.SERVE) { console.log(`serving ${name} at ${base}  (the canvas: ${base}/__canvas?path=/)`); await new Promise(() => {}) }
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 180_000, timeout: 120_000 })
  try {
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
      console.log(` ${label}`)
      const page = await browser.newPage()
      await page.setViewport({ width, height, isMobile: label === "phone", hasTouch: label === "phone" })
      /* tsx names the functions it compiles with a helper the page does not have. */
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      const errors: string[] = []
      const shopifyHits: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
      if (process.env.DEBUG) page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("    console:", m.text().slice(0, 200)) })
      await page.setRequestInterception(true)
      let checkoutHits = 0
      /* While the header's cart is pressed: a page load it starts is held and counted, so whether the drawer ALSO opened can be seen. */
      let holdNavigation = false
      const heldNavigations: string[] = []
      page.on("request", (r) => {
        const u = r.url()
        if (holdNavigation && r.isNavigationRequest() && r.frame() === page.mainFrame()) { heldNavigations.push(u.slice(base.length)); return r.abort() }
        /* Anything on its way to checkout: /checkout, the basket checkout, or the cart posted with \`checkout\`. */
        if (u.startsWith(base) && (/^\/(checkout|cart\/checkout|api\/checkout)/.test(u.slice(base.length)) || (r.method() === "POST" && /^\/cart/.test(u.slice(base.length)) && /(^|&|name="|\b)checkout/.test(r.postData() ?? "")))) checkoutHits++
        /* A theme's own demo pictures and videos on Shopify's CDN load as they do on Shopify; a script or stylesheet from there never may. */
        /* A picture there is answered with one of the made up shop's, so the page loads as it does live (where Shopify's CDN answers it). */
        if (/shopify(cdn|cloud)?\.com/.test(u)) { if (!["image", "media"].includes(r.resourceType())) shopifyHits.push(u); if (r.resourceType() !== "image") return r.abort(); return /\.svg(\?|$)/i.test(u) ? r.respond({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#ccc"/></svg>' }) : r.respond({ status: 200, contentType: "image/png", body: PNGS[0] }) }
        if (u.startsWith("https://img.test/")) return r.respond({ status: 200, contentType: "image/png", body: PNGS[(Number(u.match(/p(\d)/)?.[1] ?? 0)) % PNGS.length] })
        if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return r.respond({ status: 200, contentType: "text/css", body: "" })
        /* A public script library from a public CDN (jQuery from Google's, as older themes load it) loads in a visitor's browser; here it is served from a local copy (JQUERY_FILE), or left out. */
        if (/\/jquery(\.min)?\.js$|\/jquery\/[\d.]+\/jquery(\.min)?\.js$/.test(u) && process.env.JQUERY_FILE) return r.respond({ status: 200, contentType: "application/javascript", body: readFileSync(process.env.JQUERY_FILE, "utf8") })
        if (process.env.DEBUG && u.startsWith(base) && !/assets/.test(u)) console.log("    >", r.method(), u.slice(base.length, base.length + 140), (r.postData() ?? "").slice(0, 200))
        if (u.startsWith(base) || u.startsWith("data:")) return r.continue()
        return r.abort()
      })
      const visit = async (path: string) => {
        errors.length = 0
        await page.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 60_000 })
        await new Promise((r) => setTimeout(r, 400))
        return page.evaluate(() => ({
          sections: document.querySelectorAll(".shopify-section").length,
          /* A theme from before sections (Timber, Debut's ancestors) draws its pages straight from templates. */
          classic: !!document.querySelector("main, #MainContent, [role=main], .main-content") && (document.querySelector("main, #MainContent, [role=main], .main-content")?.textContent ?? "").trim().length > 20,
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          title: document.title,
        }))
      }

      /*
        ICONS: every <svg> has something to draw, every <use> points at a
        symbol the page has, and every icon from the theme's own SVG assets
        loads. An icon that came through as an empty box is how an unknown
        filter, a sprite file the frame cannot fetch or a missing snippet
        shows.
      */
      const icons = () => page.evaluate(() => {
        const live = (el: Element) => !el.closest("template, noscript, [hidden]")
        const svgs = [...document.querySelectorAll("svg")].filter(live)
        const empty = svgs.filter((s) => !s.closest("symbol, defs") && !s.querySelector("path, circle, rect, line, polyline, polygon, ellipse, use, text, image, g, foreignObject")).map((s) => `${s.getAttribute("class") ?? "svg"} in ${(s.parentElement?.className?.toString?.() ?? "").slice(0, 40)}`)
        const missing = [...document.querySelectorAll("use")].filter(live).map((u) => u.getAttribute("href") ?? u.getAttribute("xlink:href") ?? "").filter((h) => !h.startsWith("#") || !document.getElementById(h.slice(1)))
        const broken = [...document.images].filter((i) => /\/api\/site-theme\/assets\/[^?#]+\.svg/i.test(i.currentSrc || i.src) && i.complete && i.naturalWidth === 0).map((i) => i.src.split("/").pop())
        return { svgs: svgs.length, empty, missing: [...new Set(missing)], broken }
      })
      /*
        A BUTTON'S LABEL NEVER WEARS A BOX OF ITS OWN: no text inside a button
        paints a background other than the button's, at rest or with the
        pointer on it (Posturex's drawer Check out did, on hover).
      */
      const labelBoxes = async (selector: string) => {
        const read = () => page.evaluate((sel) => {
          const out: string[] = []
          for (const b of document.querySelectorAll<HTMLElement>(sel)) {
            const r = b.getBoundingClientRect()
            if (!r.width || !r.height) continue
            const bg = getComputedStyle(b).backgroundColor
            if (bg === "rgba(0, 0, 0, 0)") continue
            for (const d of b.querySelectorAll<HTMLElement>("span, strong, em, b, small")) {
              const c = getComputedStyle(d)
              if (!/^inline/.test(c.display) || !(d.textContent ?? "").trim() || c.backgroundColor === "rgba(0, 0, 0, 0)" || c.backgroundColor === bg) continue
              out.push(`"${(d.textContent ?? "").trim().slice(0, 16)}" ${c.backgroundColor} on ${bg}`)
            }
          }
          return out
        }, selector)
        const atRest = await read()
        const target = await page.$$(selector)
        let hovered: string[] = []
        for (const h of target.slice(0, 4)) {
          const box = await h.boundingBox().catch(() => null)
          if (!box || box.width === 0) continue
          await h.hover().catch(() => {})
          await new Promise((r) => setTimeout(r, 450))
          hovered = hovered.concat(await read())
        }
        await page.mouse.move(1, 1)
        return [...new Set([...atRest, ...hovered])]
      }

      {
        let wp = await w5Page(browser, base, label)
        const groups: [string, (p: Page) => Promise<void>][] = [
          ["loading", (p) => loadingChecks(p, base, label)],
          ["overlay", (p) => overlayChecks(p, base, label, overlay)],
          ["cards", (p) => cardChecks(p, base, label)],
          ["recent", (p) => recentChecks(p, base, label)],
          ["header", (p) => headerChecks(p, base, label === "phone", label, name)],
        ]
        for (const [what, fn] of groups) {
          if (!wants(what)) continue
          if (!(await guard(what, label, () => fn(wp)))) { await wp.close().catch(() => {}); wp = await w5Page(browser, base, label) }
        }
        await wp.close().catch(() => {})
      }
      if (ONLY.length && !ONLY.includes("core")) { await page.deleteCookie({ name: CART_COOKIE, url: base }); await page.close(); continue }
      for (const path of ["/", "/collections/all", "/collections/summer?sort_by=price-descending", "/search?q=linen", "/pages/contact", "/no-such-page"]) {
        const m = await visit(path)
        check(`${path} draws`, (m.sections > 0 || m.classic) && errors.length === 0, `${m.sections || (m.classic ? "classic" : 0)} sections, ${errors.length} script errors${errors[0] ? `: ${errors[0]}` : ""}`)
        check(`${path} no sideways scroll`, m.overflow <= 1, `${m.overflow}px`)
        if (path === "/" || path === "/collections/all") {
          const ic = await icons()
          /* A classic theme draws its icons from an icon font (Timber), so it may have no svg at all: then there is nothing to break. */
          check(`${path} every icon draws`, (ic.svgs > 0 || !themeUsesSvgIcons) && ic.empty.length === 0 && ic.missing.length === 0 && ic.broken.length === 0, `${ic.svgs} svgs; empty: ${ic.empty.slice(0, 3).join(" | ") || "none"}; missing: ${ic.missing.slice(0, 3).join(" ") || "none"}; broken: ${ic.broken.join(" ") || "none"}`)
        }
      }
      await page.screenshot({ path: `${OUT}/${name}-${label}-home.png` })

      /* The collection's filters: drawn by the theme, applied by the site. Four of the eight shirts cost $60 or more. */
      const shirtsOn = async (path: string) => {
        await visit(path)
        return page.evaluate(() => {
          const main = document.querySelector("main, #MainContent") ?? document.body
          return { shirts: new Set([...main.querySelectorAll<HTMLAnchorElement>("a[href*='/products/linen-shirt-']")].map((a) => new URL(a.href).pathname)).size, drawn: /Availability/i.test(main.textContent ?? "") && /Price/i.test(main.textContent ?? "") }
        })
      }
      /* Policies and the account pages, in the theme's own header and footer. */
      for (const at of ["/policies/refund-policy", "/refund-policy"]) {
        await visit(at)
        const p = await page.evaluate(() => ({ header: !!document.querySelector(".shopify-section-group-header-group, body > .site-header, header.site-header, header[role=banner]"), footer: !!document.querySelector(".shopify-section-group-footer-group, footer.site-footer, footer[role=contentinfo], .site-footer"), words: /Returns are accepted within 30 days/.test(document.body.textContent ?? "") }))
        check(`${at} draws the policy in the theme's header and footer`, p.header && p.footer && p.words, JSON.stringify(p))
      }
      /* The account: drawn by the theme on this host (no frame, which X-Frame-Options: DENY refuses live); a guest is sent to sign in. */
      await visit("/account")
      const acc = await page.evaluate(() => {
        const form = document.querySelector<HTMLFormElement>('form[action="/account/login"], form[action="/api/site-account/code"]')
        const email = form?.querySelector<HTMLInputElement>('input[type=email], input[name="customer[email]"], input[name=email]')
        return { path: location.pathname, header: !!document.querySelector(".shopify-section-group-header-group, body > .site-header, header.site-header, header[role=banner]"), footer: !!document.querySelector(".shopify-section-group-footer-group, footer.site-footer, footer[role=contentinfo], .site-footer"), frame: !!document.querySelector("iframe#sl-account-frame"), email: !!email && email.getBoundingClientRect().width > 40, password: !!document.querySelector("input[type=password]") }
      })
      check("/account sends a guest to sign in: a visible email form in the theme's header and footer, no frame, no password", acc.path === "/account/login" && acc.header && acc.footer && !acc.frame && acc.email && !acc.password, JSON.stringify(acc))
      const all = await shirtsOn("/collections/all")
      const dear = await shirtsOn("/collections/all?filter.v.price.gte=60")
      if (all.drawn || themeUsesFilters) check("the collection draws its filters", all.drawn, `${all.shirts} shirts`)
      else console.log("  --    this theme draws no collection filters (it never reads collection.filters)")
      check("a price filter leaves the four shirts at $60 or more", all.shirts === 8 && dear.shirts === 4, `${all.shirts} then ${dear.shirts}`)
      await page.screenshot({ path: `${OUT}/${name}-${label}-filtered.png` })

      /* A product, its options and the cart. */
      /* The product page holds still as it loads: layout shift (CLS) under 0.1, Google's line for "good". */
      await page.evaluateOnNewDocument(() => { (window as unknown as { __cls: number }).__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value }).observe({ type: "layout-shift", buffered: true }) } catch {} })
      await visit("/products/linen-shirt-2")
      await new Promise((r) => setTimeout(r, 1200))
      const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
      check("the product page holds still as it loads (layout shift under 0.1)", cls < 0.1, cls.toFixed(4))
      await page.screenshot({ path: `${OUT}/${name}-${label}-product.png` })
      check("product page has no script errors", errors.length === 0, errors[0] ?? "")
      const productIcons = await icons()
      check("product page: every icon draws", productIcons.empty.length === 0 && productIcons.missing.length === 0 && productIcons.broken.length === 0, `${productIcons.svgs} svgs; empty: ${productIcons.empty.slice(0, 3).join(" | ") || "none"}; missing: ${productIcons.missing.slice(0, 3).join(" ") || "none"}`)
      const addBoxes = await labelBoxes("form[action='/cart/add'] button[type='submit'], form[action='/cart/add'] button[name='add'], .product-form__submit, [data-storelib-buy-now]")
      check("product page: no button label wears a box of its own, at rest or on hover", addBoxes.length === 0, addBoxes.slice(0, 3).join(" | ") || "none")
      const pictures = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll<HTMLImageElement>("[data-section-type=\"product-information\"] img, [data-section-type=\"main-product\"] img, #ProductPhoto img, .product-single__photos img")].filter((i) => { const r = i.getBoundingClientRect(); return r.width > 40 && r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0 && getComputedStyle(i).visibility !== "hidden" && !!i.offsetParent })
        return { shown: imgs.length, loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, missing: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => `${i.className} ${i.currentSrc || i.src}`.slice(0, 120)) }
      })
      check("product pictures load", pictures.shown > 0 && pictures.loaded === pictures.shown, `${pictures.loaded} of ${pictures.shown}${pictures.missing[0] ? `; not loaded: ${pictures.missing.join(" | ")}` : ""}`)
      const priceBefore = await page.evaluate(() => ((document.querySelector("main, #MainContent") ?? document).querySelector("product-price, .price, [ref='priceContainer'], #ProductPrice")?.textContent ?? "").replace(/\s+/g, " ").trim())
      const picked = await page.evaluate(() => {
        const inputs = [...document.querySelectorAll<HTMLInputElement>("variant-picker input[type=radio], variant-selects input[type=radio], variant-picker select, variant-selects select")]
        const radio = inputs.find((i) => i instanceof HTMLInputElement && i.value === "Large" && !i.checked) as HTMLInputElement | undefined
        if (radio) { (radio.labels?.[0] ?? radio).click(); return "radio" }
        const select = document.querySelector<HTMLSelectElement>("variant-picker select, variant-selects select, select.single-option-selector")
        if (select) { select.value = [...select.options].find((o) => o.text.includes("Large"))?.value ?? select.value; select.dispatchEvent(new Event("change", { bubbles: true })); return "select" }
        return ""
      })
      await new Promise((r) => setTimeout(r, 1200))
      const priceAfter = await page.evaluate(() => ((document.querySelector("main, #MainContent") ?? document).querySelector("product-price, .price, [ref='priceContainer'], #ProductPrice")?.textContent ?? "").replace(/\s+/g, " ").trim())
      /* A product template with no picker (a bundle selector instead, as Posturex's demo) has nothing to choose. */
      if (picked) check("choosing Large changes the price", priceBefore !== priceAfter && /60\.00/.test(priceAfter), `${picked}: "${priceBefore.slice(0, 40)}" to "${priceAfter.slice(0, 40)}"`)
      else console.log("  --    this product template has no variant picker")

      if (process.env.DEBUG_CART) page.on("response", async (r) => { if (/\/cart\/add/.test(r.url())) { const b = await r.text().catch(() => ""); console.log("ADD", r.status(), (r.request().postData() ?? "").replace(/\s+/g, " ").slice(0, 400), "=>", b.slice(0, 200), "sections:", Object.entries(JSON.parse(b).sections ?? {}).map(([k, v]) => `${k}:${String(v).length}:${/Linen shirt/.test(String(v))}`).join(" ")) } })
      const clicked = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("form[data-type='add-to-cart-form'] button[type='submit'], form[action='/cart/add'] button[name='add'], form[action='/cart/add'] button[type='submit']")
        if (!b) return false
        b.click()
        return true
      })
      await new Promise((r) => setTimeout(r, 2000))
      const cart = await page.evaluate(async () => (await fetch("/cart.js")).json())
      /* A bundle preselected by the theme adds its products together: at least the one, and it is in the cart. */
      const added = cart.item_count ?? 0
      check("Add to cart puts it in the cart", clicked && added >= 1 && (cart.items ?? []).some((i: { title?: string }) => /Linen shirt 2/.test(i.title ?? "")), `clicked ${clicked}, item_count ${added}, ${cart.items?.[0]?.title ?? ""}`)
      const bubble = await page.evaluate(() => {
        const el = document.querySelector(".cart-count-bubble, cart-icon .cart-bubble__text-count, .cart-bubble__text-count, [ref='cartBubbleCount'], header .cart-count, #CartCount")
        /* Dawn writes the number twice: once to see, once for a screen reader ("1 item"). The one to see. */
        const shown = el?.querySelector("[aria-hidden='true']") ?? el
        return (shown?.textContent ?? "").trim()
      })
      check("the header's cart count says what the cart holds", bubble === String(added), `"${bubble}" for ${added}`)
      /*
        What the theme opens after an add, as on Shopify: its cart drawer, or
        its notification, on screen with the product in it. A theme set not
        to open anything on an add (Horizon's "Open the cart drawer" is off
        by default) opens its drawer from the header's cart instead.
      */
      const findOpen = () => page.evaluate(() => {
        const shown = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 40 && r.height > 40 && r.right > 0 && r.left < innerWidth && cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.5 }
        const panels = [...document.querySelectorAll("cart-drawer, cart-notification, cart-drawer-component dialog, #CartDrawer, .cart-drawer, .cart-notification, dialog[open], #minicart-form, .minicart__wrapper")]
        const open = panels.find((el) => shown(el) && /Linen shirt/i.test((el as HTMLElement).innerText))
        return { ok: !!open, what: open ? open.tagName.toLowerCase() + (open.id ? `#${open.id}` : "") : panels.map((el) => `${el.tagName.toLowerCase()}:${shown(el) ? `shown "${(el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 90)}"` : "hidden"}`).join(",") || "none" }
      })
      let opened = await findOpen()
      let how = "on the add"
      if (!opened.ok) {
        await page.evaluate(() => {
          const icon = [...document.querySelectorAll<HTMLElement>("header cart-icon, header .header__icon--cart, header [ref='cartIcon'], header a[href='/cart'], header button[aria-controls*='cart' i], .header-actions__cart-icon, header [data-testid*='cart' i]")].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
          ;(icon?.closest("button, a") as HTMLElement | null ?? icon)?.click()
        })
        await new Promise((r) => setTimeout(r, 1200))
        opened = await findOpen()
        how = "from the header's cart"
      }
      check(`the theme's cart drawer or notification opens with the product in it (${how})`, opened.ok, opened.what)
      await page.screenshot({ path: `${OUT}/${name}-${label}-added.png` })
      if (opened.ok) {
        /* Its buttons with any terms box ticked, as a buyer sees them. */
        await page.evaluate(() => { for (const box of document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) if ((box.required || /terms|agree/i.test(box.name + box.id)) && !box.checked && box.getBoundingClientRect().width > 0) box.click() })
        await new Promise((r) => setTimeout(r, 300))
        const drawerBoxes = await labelBoxes("cart-drawer [name='checkout'], cart-notification [name='checkout'], cart-drawer-component [name='checkout'], #CartDrawer [name='checkout'], .cart-drawer [name='checkout'], dialog[open] [name='checkout'], [form='minicart'][name='checkout'], cart-drawer .button, cart-notification .button, dialog[open] .button, .minicart__wrapper .btn-outline, .minicart__wrapper .btn-primary")
        check("the drawer: no button label wears a box of its own, at rest or on hover", drawerBoxes.length === 0, drawerBoxes.slice(0, 3).join(" | ") || "none")
      }
      /* Its own Check out, as a visitor presses it: any terms box in it ticked first (Posturex draws one). */
      if (opened.ok) {
        checkoutHits = 0
        const pressed = await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }
          const panel = [...document.querySelectorAll("cart-drawer, cart-notification, cart-drawer-component, #CartDrawer, .cart-drawer, .cart-notification, dialog[open], #minicart-form")].find((el) => shown(el) && /Linen shirt/i.test((el as HTMLElement).innerText))
          if (!panel) return "no panel"
          for (const box of panel.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) if ((box.required || /terms|agree/i.test(box.name + box.id)) && !box.checked) box.click()
          return new Promise<string>((done) => setTimeout(() => {
            const formIds = [...panel.querySelectorAll("form[id]")].map((f) => f.id)
            const co = [...document.querySelectorAll<HTMLElement>("[name='checkout'], a[href*='/checkout']")].find((b) => shown(b) && (panel.contains(b) || formIds.includes(b.getAttribute("form") ?? "")))
            if (!co) return done("no checkout button")
            if ((co as HTMLButtonElement).disabled) return done("disabled")
            co.click()
            done("pressed")
          }, 100))
        })
        for (let t = 0; t < 30 && !checkoutHits; t++) await new Promise((r) => setTimeout(r, 200))
        check("the drawer's own Check out reaches checkout", pressed === "pressed" && checkoutHits > 0, `${pressed}, ${checkoutHits} checkout requests`)
      }

      /*
        THE HEADER'S CART: the theme's drawer, or the cart page, never both.
        A drawer that slides in while the page leaves for /cart is the bug a
        click handler of Storelib's that ignores the theme's preventDefault
        makes. Pressed with something in the cart; a page load it starts is
        held, so the drawer can still be looked at.
      */
      await visit("/products/linen-shirt-3")
      const cartIcon = await page.evaluate(() => {
        const icon = [...document.querySelectorAll<HTMLElement>("header cart-icon, header .header__icon--cart, header [ref='cartIcon'], header a[href='/cart'], #cart-icon-bubble, header button[aria-controls*='cart' i], .header-actions__cart-icon")].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
        const target = (icon?.closest("button, a") as HTMLElement | null) ?? icon ?? null
        target?.setAttribute("data-probe-cart", "")
        return !!target
      })
      let liveCartOpensDrawer: boolean | null = null
      if (cartIcon) {
        /* A theme that keeps its drawer open from page to page (Horizon, after its Check out was pressed) has it closed first: the press is to open it. */
        if ((await findOpen()).ok) { await page.keyboard.press("Escape"); await new Promise((r) => setTimeout(r, 700)) }
        heldNavigations.length = 0
        holdNavigation = true
        await page.click("[data-probe-cart]").catch(() => {})
        await new Promise((r) => setTimeout(r, 1500))
        holdNavigation = false
        const drawer = await findOpen()
        const went = heldNavigations.filter((u) => /^\/cart(\?|$)/.test(u))
        liveCartOpensDrawer = drawer.ok
        check("the header's cart opens the drawer or the cart page, never both", drawer.ok !== went.length > 0, `drawer ${drawer.ok ? "open" : "closed"}, page loads: ${went.join(" ") || "none"}`)
      }

      await visit("/cart")
      await page.screenshot({ path: `${OUT}/${name}-${label}-cart.png` })
      const lines = await page.evaluate(() => document.body.innerText.includes("Linen shirt 2"))
      check("the cart page lists the line", lines && errors.length === 0, errors[0] ?? "")
      const plus = await page.evaluate(() => {
        /* The one on screen: a closed drawer can hold its own. */
        const b = [...document.querySelectorAll<HTMLButtonElement>("button[name='plus'], .quantity__button[name='plus'], quantity-selector-component button[name='plus'], .js-qty__adjust--plus")].find((el) => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== "hidden")
        if (!b) return false
        b.click()
        return true
      })
      await new Promise((r) => setTimeout(r, 2000))
      const after = await page.evaluate(async () => (await fetch("/cart.js")).json())
      /* A classic cart page's + only changes the number; Update cart sends it, as on Shopify. */
      if (plus && after.item_count === added) {
        const update = await page.$("button[name='update'], input[name='update']")
        if (update) {
          await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20_000 }).catch(() => null), update.click()])
          Object.assign(after, await page.evaluate(async () => (await fetch("/cart.js")).json()))
        }
      }
      check("+ adds one", plus && after.item_count === added + 1, `clicked ${plus}, item_count ${added} to ${after.item_count}`)

      /* Buy it now: that item alone, straight to checkout; the cart is left as it was. */
      await visit("/products/linen-shirt-3")
      lastCheckout = null
      /* Buy it now lands on the site's own checkout (lib/checkout/site-checkout siteCheckoutHref): its lines ride in the address. */
      const onBasket = (r: { url(): string }) => {
        try {
          const u = new URL(r.url())
          /* The first one: the probe has no proxy, so its own /checkout answers again with the whole cart, where the live site rewrites it to the checkout page (proxy.ts). */
          if (!lastCheckout && (u.pathname === "/checkout" || u.pathname === "/checkout/cart") && u.searchParams.get("items")) lastCheckout = { items: readBasketParams(u.searchParams).items }
        } catch {}
      }
      page.on("request", onBasket)
      const buyNow = await page.evaluate(() => {
        const b = document.querySelector<HTMLButtonElement>("[data-storelib-buy-now]")
        if (!b) return false
        b.click()
        return true
      })
      for (let t = 0; t < 40 && !lastCheckout; t++) await new Promise((r) => setTimeout(r, 200))
      page.off("request", onBasket)
      await visit("/cart")
      const kept = await page.evaluate(async () => (await fetch("/cart.js")).json())
      const sentItems = (lastCheckout as { items?: { quantity?: number }[] } | null)?.items ?? []
      /* A theme that never asks for Shopify's payment button (Timber predates it) has no Buy it now on Shopify either. */
      if (!buyNow && !themeUsesPaymentButton) console.log("  --    this theme has no Buy it now (it never draws Shopify's payment button)")
      else check("Buy it now goes straight to checkout with that item alone", buyNow && sentItems.length === 1 && sentItems[0]?.quantity === 1, `button ${buyNow}, sent ${JSON.stringify(sentItems).slice(0, 120)}`)
      if (buyNow || themeUsesPaymentButton) check("  and the cart is left as it was", kept.item_count === after.item_count, `item_count ${after.item_count} then ${kept.item_count}`)

      /* The search box. */
      await visit("/")
      const typed = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>("input[type='search'], predictive-search input, input[name='q']")
        return !!input
      })
      if (typed) {
        /* The header's search: its first visible opener, then its first visible box. */
        await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }
          const opener = [...document.querySelectorAll<HTMLElement>("[on\\:click*='search' i], .search-modal__button, button[aria-label*='Search' i], summary[aria-label*='Search' i], details-modal summary")].find(shown)
          /* No search to see at all: a classic theme keeps it in the phone's menu drawer, so open that. */
          const anyBox = [...document.querySelectorAll("input[type='search'], input[name='q']")].some(shown)
          const menu = !opener && !anyBox ? [...document.querySelectorAll<HTMLElement>(".js-drawer-open-left, [aria-controls='NavDrawer'], .site-nav--mobile button, button[aria-label*='menu' i]")].find(shown) : undefined
          ;(opener ?? menu)?.click()
        })
        await new Promise((r) => setTimeout(r, 600))
        await page.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
          const input = [...document.querySelectorAll<HTMLInputElement>("predictive-search input[type='search'], predictive-search-component input, input[type='search'], input[name='q']")].find(shown)
          input?.setAttribute("data-probe-search", "")
        })
        const input = await page.$("[data-probe-search]")
        await input?.focus()
        await page.keyboard.type("shirt 3", { delay: 30 })
        await new Promise((r) => setTimeout(r, 2000))
        let found = await page.evaluate(() => [...document.querySelectorAll("predictive-search, predictive-search-component, .predictive-search")].some((el) => /Linen shirt 3/.test(el.textContent ?? "")))
        /* A theme with no predictive search sends the box's words to /search, as on Shopify. */
        if (!found && !themeUsesPredictive) {
          await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20_000 }).catch(() => null), page.keyboard.press("Enter")])
          found = await page.evaluate(() => location.pathname === "/search" && /Linen shirt 3/.test(document.body.innerText))
        }
        check("the search box finds Linen shirt 3", found)
        await page.screenshot({ path: `${OUT}/${name}-${label}-search.png` })
      } else check("the theme has a search box", false)

      /* The builder's canvas: Add to cart answered by the builder, Buy it now kept for the live site. */
      canvasCart = { cart: [], note: "" }
      canvasLeaks.length = 0
      errors.length = 0
      await page.goto(`${base}/__canvas?path=${encodeURIComponent("/products/linen-shirt-2")}`, { waitUntil: "networkidle0", timeout: 60_000 })
      await new Promise((r) => setTimeout(r, 800))
      const frame = page.frames().find((f) => f !== page.mainFrame())
      const pressIn = (sel: string) => frame!.evaluate((s) => { const b = [...document.querySelectorAll<HTMLElement>(s)].find((el) => el.getBoundingClientRect().width > 0); if (!b) return false; b.click(); return true }, sel)
      const buyInCanvas = themeUsesPaymentButton ? await pressIn("[data-storelib-buy-now]") : null
      await new Promise((r) => setTimeout(r, 600))
      const liveOnly = await page.evaluate(() => (window as unknown as { __events: string[] }).__events.join())
      if (buyInCanvas !== null) check("in the canvas, Buy it now says checkout is on the live site and adds nothing", buyInCanvas && liveOnly === "checkout" && canvasCart.cart.length === 0, `pressed ${buyInCanvas}, "${liveOnly}", ${canvasCart.cart.length} lines`)
      /* From the press on: a theme's own broken markup on load (Posturex's empty preload, " 800w") is not the cart's. */
      canvasLeaks.length = 0
      const addInCanvas = await pressIn("form[data-type='add-to-cart-form'] button[type='submit'], form[action='/cart/add'] button[name='add'], form[action='/cart/add'] button[type='submit']:not([name='checkout'])")
      await new Promise((r) => setTimeout(r, 2500))
      check("in the canvas, Add to cart fills the builder's cart, with nothing sent to the network", addInCanvas && canvasCart.cart.length >= 1 && canvasLeaks.length === 0 && errors.length === 0, `pressed ${addInCanvas}, ${canvasCart.cart.length} lines, leaks: ${canvasLeaks.join(" ") || "none"}${errors[0] ? `, ${errors[0]}` : ""}`)
      /* The header's cart in the canvas does what it does on the website: the drawer the theme opens, and no cart page under it; the cart page where the theme's cart is a plain link. */
      if (liveCartOpensDrawer !== null) {
        await page.evaluate(() => { (window as unknown as { __nav: string[] }).__nav = [] })
        const pressedCart = await frame!.evaluate(() => {
          const icon = [...document.querySelectorAll<HTMLElement>("header cart-icon, header .header__icon--cart, header [ref='cartIcon'], header a[href='/cart'], #cart-icon-bubble, header button[aria-controls*='cart' i], .header-actions__cart-icon")].find((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
          const target = (icon?.closest("button, a") as HTMLElement | null) ?? icon ?? null
          if (!target) return false
          target.click()
          return true
        })
        await new Promise((r) => setTimeout(r, 1200))
        const nav = await page.evaluate(() => ((window as unknown as { __nav?: string[] }).__nav ?? []).join(" "))
        const toCart = /(^|\s)\/cart(\?|\s|$)/.test(nav)
        check(`in the canvas, the header's cart ${liveCartOpensDrawer ? "opens the drawer and not the cart page" : "opens the cart page"}, as on the website`, pressedCart && (liveCartOpensDrawer ? !toCart : toCart), `pressed ${pressedCart}, navigations: ${nav || "none"}`)
      }
      await page.screenshot({ path: `${OUT}/${name}-${label}-canvas.png` })

      /* The account pages in the canvas: drawn by the theme, so they can be seen and styled; sending one says sign in works on the live site, and nothing leaves. */
      for (const at of ["/account/login", "/account/register", "/account"]) {
        canvasLeaks.length = 0
        errors.length = 0
        await page.goto(`${base}/__canvas?path=${encodeURIComponent(at)}`, { waitUntil: "networkidle0", timeout: 60_000 })
        await new Promise((r) => setTimeout(r, 600))
        const accFrame = page.frames().find((f) => f !== page.mainFrame())!
        const drawn = await accFrame.evaluate(() => {
          const shown = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" }
          const form = [...document.querySelectorAll<HTMLFormElement>("form")].find((f) => shown(f) && !!f.querySelector("input[type=email], input[name='customer[email]'], input[name=email]"))
          const email = form?.querySelector<HTMLInputElement>("input[type=email], input[name='customer[email]'], input[name=email]")
          return { header: !!document.querySelector(".shopify-section-group-header-group, body > .site-header, header.site-header, header[role=banner]"), footer: !!document.querySelector(".shopify-section-group-footer-group, footer.site-footer, footer[role=contentinfo], .site-footer"), form: !!form, account: /Sample customer|Account/i.test(document.body.innerText), mark: (form?.setAttribute("data-probe-account", ""), !!email) }
        })
        if (at === "/account") {
          check("in the canvas, /account draws the theme's account page, about a sample customer", drawn.header && drawn.footer && drawn.account && errors.length === 0, JSON.stringify(drawn))
          continue
        }
        const sent = await accFrame.evaluate(() => {
          const form = document.querySelector<HTMLFormElement>("[data-probe-account]")
          if (!form) return false
          const email = form.querySelector<HTMLInputElement>("input[type=email], input[name='customer[email]'], input[name=email]")!
          email.value = "visitor@example.com"
          form.querySelectorAll<HTMLInputElement>("input[required]").forEach((i) => { if (!i.value) i.value = i.type === "password" ? "x" : "x" })
          const button = form.querySelector<HTMLElement>("button[type=submit], input[type=submit], button:not([type])")
          if (button) button.click()
          else form.requestSubmit()
          return true
        })
        await new Promise((r) => setTimeout(r, 800))
        const said = await page.evaluate(() => (window as unknown as { __events: string[] }).__events.join())
        check(`in the canvas, ${at} draws in the theme, and sending it says sign in works on the live site, with nothing sent`, drawn.header && drawn.footer && drawn.form && sent && /account/.test(said) && canvasLeaks.length === 0, `${JSON.stringify(drawn)}, said "${said}", leaks: ${canvasLeaks.join(" ") || "none"}`)
      }

      check("nothing was asked of Shopify's servers", shopifyHits.length === 0, shopifyHits[0] ?? "")
      await page.deleteCookie({ name: CART_COOKIE, url: base })
      await page.close()
    }
  } finally {
    await browser.close()
    server.close()
  }
}

async function main() {
  for (const c of COLOURS) PNGS.push(await sharp({ create: { width: 800, height: 800, channels: 3, background: c } }).png().toBuffer())
  const zips = process.argv.slice(2)
  if (!zips.length) {
    console.log("usage: npx tsx scripts/check-shopify-theme.ts <theme.zip> [...]")
    process.exit(2)
  }
  for (const z of zips) await run(z)
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main()
