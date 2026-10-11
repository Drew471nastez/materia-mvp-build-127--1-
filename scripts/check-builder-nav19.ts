/**
 * ===========================================================================
 *  AN IMPORTED THEME'S LINKS, LIVE AND IN THE BUILDER, AND THE PHONE SELECTOR
 * ===========================================================================
 *   npx tsx scripts/check-builder-nav19.ts [live] [canvas] [select]
 *
 * The theme is tests/fixtures/shopify-posture: a small Shopify theme built
 * the way Posturex is (a sticky header with a menu and a phone drawer, a
 * slideshow that slides by translateX, sections that rise into place as they
 * are scrolled to, a footer of the theme's own links, a phone tab bar fixed
 * to the foot of the screen, an app's script loaded in the body). It goes
 * through the import's own converter, and then:
 *
 *   live    the live site's own handler (lib/storelib-theme/compat/site.ts)
 *           serves it on a local port, as proxy.ts sends a site there, with
 *           the live page's head and foot (lib/website-builder/live-navigation).
 *           Every link of the header, its drawer, the footer and the tab bar
 *           is followed: where it lands and with what status. A header link
 *           is clicked and the time until the next page is on screen measured.
 *   canvas  the real editor (scripts/render-editor-probe.tsx) on the same
 *           theme. Each header link is pressed in the canvas and what the
 *           builder did is read: the page it opened, or nothing.
 *   select  the editor at 390x844 with touch: a tap on the hero's slide, the
 *           outlines drawn in the frame measured against the element's own
 *           box once the theme's animations are done, a second tap, and a
 *           mouse that is not there.
 *
 * Measurements, not opinions. Exits 1 on any failure. Screenshots go to $OUT
 * (default /tmp/builder-nav19).
 */
import { createServer, type Server } from "node:http"
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, themeAsset, type SiteData } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { liveNavigationEnd, liveNavigationMarkup } from "../lib/website-builder/live-navigation"

const OUT = process.env.OUT ?? "/tmp/builder-nav19"
const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
/* An app's script in the body answers this late, as a third party's does on a phone network. */
const VENDOR_MS = Number(process.env.VENDOR_MS ?? 400)
mkdirSync(OUT, { recursive: true })
const parts = new Set(process.argv.slice(2))
const all = parts.size === 0
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/* A frame the canvas has just replaced never answers: asked with a time limit, so the probe moves on. */
const within = <T,>(p: Promise<T>, ms = 1500): Promise<T> => Promise.race([p, new Promise<T>((_, no) => setTimeout(() => no(new Error("no answer")), ms))])

export async function fixtureZip(): Promise<JSZip> {
  const dir = join(__dirname, "..", "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  return zip
}

/** The shop the site is drawn with: two products, one collection, and menus as a creator writes them. */
export function shop() {
  const products = ["Posture corrector", "Lumbar belt"].map((title, i) => {
    const slug = title.toLowerCase().replace(/\W+/g, "-")
    return {
      id: `00000000-0000-4000-8000-00000000000${i + 1}`,
      settings: { title, slug, url: `/products/${slug}`, price: `$${39 + i * 10}.00`, image: "", images: [], kind: "physical", available: true, description: "", variants: [], options: [] },
    }
  })
  const collections = [{ id: "c-summer", title: "Summer", handle: "summer", description: "", image: "", url: "/collections/summer", products, products_count: 2 }]
  const menus = {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Home", url: "/" },
        { title: "Shop", url: "/products" },
        { title: "Correctors", url: "/collections/posture-correctors" },
        { title: "Best seller", url: "/products/posturex-pro" },
        { title: "Summer", url: "/collections/summer" },
        { title: "Corrector", url: "/products/posture-corrector" },
        { title: "About", url: "/about" },
        { title: "Contact", url: "/contact" },
        { title: "FAQ", url: "/pages/faq" },
        { title: "Journal", url: "/blogs/news" },
        { title: "Refunds", url: "/policies/refund-policy" },
        { title: "Sale", url: "https://posturex.myshopify.com/collections/sale" },
      ],
    },
    footer: {
      title: "Footer",
      links: [
        { title: "Search", url: "/search" },
        { title: "Wishlist", url: "/wishlist" },
        { title: "Account", url: "/account" },
        { title: "Collections", url: "/collections" },
        { title: "Shipping", url: "/policies/shipping-policy" },
        { title: "Corrector", url: "/collections/summer/products/posture-corrector" },
      ],
    },
  }
  return { products, collections, menus }
}

export async function converted() {
  const r = await convertShopifyTheme(await fixtureZip())
  if (!r.ok) throw new Error("the fixture theme did not convert")
  return r.theme
}

/* ── live ─────────────────────────────────────────────────────────────────── */

async function serveLive(): Promise<{ server: Server; base: string }> {
  const t = await converted()
  const files = t.files
  const theme = themeOfInstall(files, t.settings, {
    assetUrl: (n) => `/api/site-theme/assets/x/1/${encodeURIComponent(n)}`,
    assetText: (n) => files[`shopify/assets/${n}`] ?? null,
  })
  const { products, collections, menus } = shop()
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const site: SiteData = {
    creatorId: "c",
    theme,
    pages,
    products: products as never,
    collections: collections as never,
    menus: compatMenus(menus, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund policy", body: "<p>Thirty days.</p>" }] },
    host: "127.0.0.1",
    extraHead: process.env.NO_NAV ? undefined : liveNavigationMarkup(),
    extraBodyEnd: process.env.NO_NAV ? undefined : liveNavigationEnd(),
  }
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname.startsWith("/api/site-theme/assets/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "")
      if (name === "vendor.js") await sleep(VENDOR_MS)
      const a = themeAsset(theme, name, () => theme.pageContext({ template: "index", path: "/", designMode: false, products: [], collections: [], menus: {}, shop: { name: "" } }))
      if (!a) { res.writeHead(404); res.end(); return }
      res.writeHead(200, { "Content-Type": a.type })
      res.end(a.body)
      return
    }
    const out = await answer(site, { method: req.method ?? "GET", path: url.pathname, query: url.searchParams, body: null, cart: [] })
    res.writeHead(out.status, { ...(out.headers ?? {}), "Content-Type": out.type, "Cache-Control": "private, no-store" })
    res.end(out.body)
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}

/** The moment the page arrived starts to show: its cross-fade begins moving (not held paused), or its first frame when there is none. */
const SHOWN_MARK = `addEventListener("pagereveal",function(e){var t=e.viewTransition;var m=function(){window.__shownAt=performance.timeOrigin+performance.now()};var moving=function(){if(document.documentElement.hasAttribute("data-sl-arriving"))requestAnimationFrame(moving);else m()};if(t)t.ready.then(moving,m);else requestAnimationFrame(m)});`

async function live(browser: Browser) {
  console.log("\nlive site")
  const { server, base } = await serveLive()
  try {
    for (const [width, height, label] of [[1440, 900, "desktop"], [390, 844, "phone"]] as const) {
      const page = await browser.newPage()
      await page.setViewport({ width, height, isMobile: label === "phone", hasTouch: label === "phone" })
      await page.evaluateOnNewDocument("window.__name = (f) => f")
      await page.evaluateOnNewDocument(SHOWN_MARK)
      const errors: string[] = []
      page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)))
      await page.goto(`${base}/`, { waitUntil: "networkidle0" })
      if (label === "desktop") {
        /* Every link a visitor can press in the site's chrome, followed as a browser would. */
        const links = await page.evaluate(() => {
          const pick = (sel: string) => [...document.querySelectorAll<HTMLAnchorElement>(sel)].map((a) => ({ where: sel.split(" ")[0], text: (a.textContent ?? "").trim(), href: a.getAttribute("href") ?? "" }))
          return [...pick(".site-header__nav a"), ...pick(".drawer a"), ...pick(".site-footer a"), ...pick(".mobile-nav a"), ...pick("main a")]
        })
        const results = await page.evaluate(async (list) => Promise.all(list.map(async (l) => {
          let u: URL
          try { u = new URL(l.href, location.href) } catch { return { ...l, status: 0, to: "bad" } }
          if (u.origin !== location.origin) return { ...l, status: -1, to: u.href }
          const r = await fetch(u.href, { redirect: "follow" })
          return { ...l, status: r.status, to: new URL(r.url).pathname }
        })), links)
        const dead = results.filter((r) => r.status >= 400 || r.status === 0 || (r.status === -1 && /myshopify\.com/.test(r.to)))
        for (const r of results) console.log(`        ${r.status === -1 ? "out" : r.status}  ${r.where.padEnd(18)} ${r.text.padEnd(14)} ${r.href} -> ${r.to}`)
        check("every link of the header, the drawer, the footer, the tab bar and the page lands on a page", dead.length === 0, `${results.length} links, ${dead.length} dead${dead.length ? `: ${dead.map((d) => `${d.text} ${d.href} (${d.status})`).join(", ")}` : ""}`)
      }
      /* A header link (the phone: the tab bar's Shop), clicked: the time until the next page is on screen. */
      const times: number[] = []
      for (let i = 0; i < 3; i++) {
        await page.goto(`${base}/`, { waitUntil: "networkidle0" })
        await sleep(300)
        const sel = label === "desktop" ? ".site-header__nav a[href='/collections/summer']" : ".mobile-nav a:nth-child(3)"
        const at = Date.now()
        if (label === "phone") await page.tap(sel)
        else await page.click(sel)
        await page.waitForFunction(() => location.pathname !== "/" && typeof (window as unknown as { __shownAt?: number }).__shownAt === "number", { timeout: 15000 })
        const shown = await page.evaluate(() => (window as unknown as { __shownAt: number }).__shownAt)
        times.push(Math.round(shown - at))
      }
      await page.screenshot({ path: `${OUT}/live-${label}.png` })
      const median = [...times].sort((a, b) => a - b)[1]
      check(`${label}: a header link's page is on screen within 450ms of the click (app script ${VENDOR_MS}ms)`, median <= 450, `${times.join(", ")} ms`)
      check(`${label}: no script errors`, errors.length === 0, errors[0] ?? "")
      await page.close()
    }
  } finally {
    server.close()
  }
}

/* ── the editor ───────────────────────────────────────────────────────────── */

export async function editorFor(browser: Browser, width: number, height: number, touch: boolean): Promise<{ page: Page; frame: () => Promise<Frame>; close: () => void }> {
  const { bundle, css } = (await import("./editor-probe-harness.mjs")) as { bundle: string; css: string }
  const t = await converted()
  const sources = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, v]) => p.startsWith("shopify/") && !v.startsWith("base64:")))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  const compat = { settings: t.settings, pages, sources, files }
  const { products, menus } = shop()
  const probeProducts = products.map((p) => ({ id: p.id, title: p.settings.title, slug: p.settings.slug, status: "published", price: 39, type: "physical" }))
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    if (url.pathname === "/") {
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_COMPAT=${JSON.stringify(compat).replace(/</g, "\\u003c")};window.PROBE_PRODUCTS=${JSON.stringify(probeProducts)};window.PROBE_STORE_MENUS=${JSON.stringify({ available: true, stored: true, menus })}</script><script src="/editor-probe.js"></script></body></html>`)
      return
    }
    if (url.pathname === "/editor-probe.js") {
      res.writeHead(200, { "Content-Type": "text/javascript" })
      res.end(readFileSync(bundle))
      return
    }
    const asset = url.pathname.match(/^\/api\/site-theme\/assets\/[^/]+\/[^/]+\/(.+)$/)
    if (asset) {
      const name = decodeURIComponent(asset[1])
      const text = t.files[`shopify/assets/${name}`]
      if (text === undefined) { res.writeHead(404, { "Access-Control-Allow-Origin": "*" }); res.end(); return }
      res.writeHead(200, { "Content-Type": name.endsWith(".css") ? "text/css" : "text/javascript", "Access-Control-Allow-Origin": "*" })
      res.end(text)
      return
    }
    res.writeHead(404)
    res.end()
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const page = await browser.newPage()
  await page.setViewport({ width, height, isMobile: touch, hasTouch: touch })
  await page.evaluateOnNewDocument("window.__name = (f) => f")
  page.on("pageerror", (e) => console.log("    editor error:", String(e).slice(0, 200)))
  if (process.env.DEBUG) page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn") console.log("    console:", m.text().slice(0, 300)) })
  await page.goto(base, { waitUntil: "domcontentloaded" })
  const frame = async () => {
    for (let i = 0; i < 160; i++) {
      const h = await within(page.$("[data-compat-frame='front']")).catch(() => null)
      const f = h ? await within(h.contentFrame()).catch(() => null) : null
      if (f && (await within(f.evaluate(() => document.readyState !== "loading" && !!document.querySelector(".shopify-section"))).catch(() => false))) return f
      await sleep(100)
    }
    await page.screenshot({ path: `${OUT}/no-frame.png` })
    throw new Error("the canvas never drew the theme")
  }
  return { page, frame, close: () => server.close() }
}

/** Which page the builder has open, read from the frame it draws: the page template's own section. */
async function pageInCanvas(frame: Frame): Promise<string> {
  return within(frame.evaluate(() => {
    const main = document.querySelector("main .shopify-section [class*='main-'], main .shopify-section .slideshow")
    if (!main) return "?"
    if (main.classList.contains("slideshow")) return "home"
    const m = [...main.classList].find((c) => c.startsWith("main-"))
    return m ? m.slice(5) : "?"
  }))
}

async function canvas(browser: Browser) {
  console.log("\nbuilder canvas, 1440x900")
  const ed = await editorFor(browser, 1440, 900, false)
  try {
    let frame = await ed.frame()
    await sleep(800)
    const links = await frame.evaluate(() => [...document.querySelectorAll<HTMLAnchorElement>(".site-header__nav > ul > li > a")].map((a) => ({ text: (a.textContent ?? "").trim(), href: a.getAttribute("href") ?? "" })))
    const dead: string[] = []
    const times: number[] = []
    for (const l of links) {
      if (process.env.DEBUG) console.log("      next:", l.text)
      const ready = await ed.frame().catch(() => null)
      if (!ready) {
        dead.push(`the canvas was left without a page before ${l.text}`)
        break
      }
      frame = ready
      const before = await pageInCanvas(frame)
      const handle = await ed.page.$("[data-compat-frame='front']")
      const fb = await handle!.boundingBox()
      const at = await within(frame.evaluate((href) => {
        const a = [...document.querySelectorAll<HTMLAnchorElement>(".site-header__nav > ul > li > a")].find((x) => x.getAttribute("href") === href)!
        /* Its first line: a link that wraps has a gap in the middle of its box. */
        const r = a.getClientRects()[0] ?? a.getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      }, l.href))
      const t0 = Date.now()
      await ed.page.mouse.click(fb!.x + at.x, fb!.y + at.y)
      /* What the builder did: another page in the frame, a message, or nothing. */
      let after = before
      let said = ""
      for (let i = 0; i < 40; i++) {
        await sleep(100)
        said = await within(ed.page.evaluate(() => [...document.querySelectorAll("[data-sonner-toast]")].map((x) => (x.textContent ?? "").replace(/\s+/g, " ").trim()).join(" | ").slice(0, 120))).catch(() => "")
        const f = await ed.frame().catch(() => null)
        if (f) after = await pageInCanvas(f).catch(() => before)
        if (after !== before || said) break
      }
      const ms = Date.now() - t0
      const moved = after !== before
      if (moved) times.push(ms)
      console.log(`        ${l.text.padEnd(14)} ${l.href.padEnd(48)} ${before} -> ${after}${said ? `  said: ${said}` : ""}  ${ms}ms`)
      if (!moved && !said && !(l.href === "/" && before === "home")) dead.push(`${l.text} ${l.href}`)
      /* Back home for the next link, through the logo. */
      if (after !== "home") {
        frame = await ed.frame()
        const logo = await within(frame.evaluate(() => { const r = document.querySelector(".site-header__logo")!.getBoundingClientRect(); return { x: r.left + 10, y: r.top + r.height / 2 } }))
        const hb = await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox()
        await ed.page.mouse.click(hb!.x + logo.x, hb!.y + logo.y)
        for (let i = 0; i < 40; i++) { await sleep(100); const f = await ed.frame().catch(() => null); if (f && (await pageInCanvas(f).catch(() => "?")) === "home") break }
      }
      await ed.page.evaluate(() => document.querySelectorAll("[data-sonner-toast]").forEach((x) => x.remove()))
      await ed.page.keyboard.press("Escape")
      await sleep(250)
    }
    check("every header link in the canvas opens a page or says why not", dead.length === 0, dead.length ? `did nothing: ${dead.join(", ")}` : `${links.length} links`)
    const sorted = [...times].sort((a, b) => a - b)
    check("a page opened from the header is drawn within 900ms (median)", sorted.length > 0 && sorted[Math.floor(sorted.length / 2)] <= 900, `${times.join(", ")} ms`)
    await ed.page.screenshot({ path: `${OUT}/canvas-desktop.png` })
  } finally {
    ed.close()
  }
}

/* ── the selector on a phone ──────────────────────────────────────────────── */

type Boxes = { kind: string; left: number; top: number; width: number; height: number }[]
const boxesIn = (frame: Frame): Promise<Boxes> =>
  frame.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-sl-box]")].filter((b) => getComputedStyle(b).display !== "none" && getComputedStyle(b).opacity !== "0").map((b) => { const r = b.getBoundingClientRect(); return { kind: b.getAttribute("data-sl-box") ?? "", left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } }))

async function select(browser: Browser) {
  for (const [width, height, touch, label] of [[390, 844, true, "phone"], [1440, 900, false, "desktop"]] as const) {
    console.log(`\nbuilder selector, ${width}x${height}${touch ? " touch" : ""}`)
    const ed = await editorFor(browser, width, height, touch)
    try {
      const frame = await ed.frame()
      await sleep(1200)
      const fh = await ed.page.$("[data-compat-frame='front']")
      const fb = (await fh!.boundingBox())!
      const point = async (sel: string) => frame.evaluate((s) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 120) } }, sel)
      const press = async (p: { x: number; y: number }) => (touch ? ed.page.touchscreen.tap(fb.x + p.x, fb.y + p.y) : ed.page.mouse.click(fb.x + p.x, fb.y + p.y))
      /* The hero's first slide, by its heading: the innermost block there. */
      await press(await point(".slideshow__slide h2"))
      /* The theme's own motion after a selection (the slider moving to the slide, the section rising in) is over in a second. */
      await sleep(1400)
      const sel = await frame.evaluate(() => {
        const b = document.querySelector<HTMLElement>("[data-sl-selected-block]")
        const s = document.querySelector<HTMLElement>("[data-sl-selected]")
        const r = (b ?? s)?.getBoundingClientRect()
        return { block: b?.getAttribute("data-block-id") ?? null, section: s?.id ?? null, rect: r ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) } : null, inner: innerHeight, bar: (() => { const n = document.querySelector<HTMLElement>(".mobile-nav"); const q = n?.getBoundingClientRect(); return q && q.height > 0 && getComputedStyle(n!).display !== "none" ? Math.round(q.top) : null })() }
      })
      const boxes = await boxesIn(frame)
      await ed.page.screenshot({ path: `${OUT}/select-${label}-1.png` })
      const shownBoxes = boxes.filter((b) => b.kind !== "hover")
      check(`${label}: a tap selects the slide it landed on`, !!sel.block, sel)
      check(`${label}: one selection outline, not two`, shownBoxes.length === 1, boxes)
      const box = shownBoxes[0]
      if (box && sel.rect) {
        const visibleBottom = Math.min(sel.rect.bottom, sel.bar ?? sel.inner)
        const L = Math.max(sel.rect.left - 2, 0), R = Math.min(sel.rect.left + sel.rect.width + 2, width)
        const off = Math.max(Math.abs(box.left - L), Math.abs(box.left + box.width - R), Math.abs(box.top - Math.max(sel.rect.top - 2, 0)), Math.abs(box.top + box.height - (visibleBottom + (visibleBottom === sel.rect.bottom ? 2 : 0))))
        check(`${label}: the outline sits on the element's own box after its motion (within 3px)`, off <= 3, { off, box, el: sel.rect, bar: sel.bar })
      }
      /*
        A SECTION STILL RISING INTO PLACE: scrolled to and picked at once, as
        a thumb does, while the theme's reveal moves it up 48px. Measured once
        it has stopped.
      */
      await frame.evaluate(() => { const el = document.querySelector(".collection-list")!; scrollTo(0, scrollY + el.getBoundingClientRect().top - 140) })
      await sleep(60)
      await press(await frame.evaluate(() => { const r = document.querySelector(".collection-card")!.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }))
      await sleep(1600)
      const risen = await frame.evaluate(() => { const b = document.querySelector<HTMLElement>("[data-sl-selected-block]"); const r = b?.getBoundingClientRect(); return r ? { block: b!.getAttribute("data-block-id"), left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null })
      const risenBoxes = (await boxesIn(frame)).filter((b) => b.kind !== "hover")
      const rb = risenBoxes[0]
      const roff = rb && risen ? Math.max(Math.abs(rb.left - Math.max(risen.left - 2, 0)), Math.abs(rb.top - (risen.top - 2)), Math.abs(rb.height - (risen.height + 4))) : 99
      await ed.page.screenshot({ path: `${OUT}/select-${label}-risen.png` })
      check(`${label}: a card picked while its section rises is outlined where it stops (within 3px)`, risenBoxes.length === 1 && roff <= 3, { off: roff, box: rb, el: risen, boxes: risenBoxes.length })
      await frame.evaluate(() => scrollTo(0, 0))
      await sleep(400)
      await press(await point(".slideshow__slide h2"))
      await sleep(700)
      if (touch) {
        check(`${label}: no hover outline after a tap`, !boxes.some((b) => b.kind === "hover"), boxes)
        /* A second tap on the same spot goes up a level: the slide, then the section. */
        await press(await point(".slideshow__slide h2"))
        await sleep(700)
        const second = await frame.evaluate(() => ({ block: document.querySelector("[data-sl-selected-block]")?.getAttribute("data-block-id") ?? null, section: document.querySelector("[data-sl-selected]")?.id ?? null }))
        check(`${label}: a second tap on the same block selects the level above it`, second.block !== sel.block, { first: sel.block, second })
        await ed.page.screenshot({ path: `${OUT}/select-${label}-2.png` })
        /* The header and its logo in the canvas: drawn whole, the mark beside the word. */
        const logo = await frame.evaluate(() => { const a = document.querySelector(".site-header__logo")!.getBoundingClientRect(); const h = document.querySelector(".site-header")!.getBoundingClientRect(); return { left: Math.round(a.left), right: Math.round(a.right), hl: Math.round(h.left), hr: Math.round(h.right), top: Math.round(a.top), htop: Math.round(h.top) } })
        check(`${label}: the header's logo is inside the header`, logo.left >= logo.hl && logo.right <= logo.hr && logo.top >= logo.htop, logo)
      } else {
        const other = await frame.evaluate(() => { const r = document.querySelector(".rich-text, .collection-list")!.getBoundingClientRect(); return { x: r.left + 20, y: Math.min(r.top + 20, innerHeight - 20) } })
        await ed.page.mouse.move(fb.x + other.x, fb.y + other.y)
        await sleep(300)
        const hov = await boxesIn(frame)
        check(`${label}: a mouse over another section outlines it`, hov.some((b) => b.kind === "hover"), hov)
      }
    } finally {
      ed.close()
    }
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--hide-scrollbars"] })
  try {
    if (all || parts.has("live")) await live(browser)
    if (all || parts.has("canvas")) await canvas(browser)
    if (all || parts.has("select")) await select(browser)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}

if (require.main === module) void main()
