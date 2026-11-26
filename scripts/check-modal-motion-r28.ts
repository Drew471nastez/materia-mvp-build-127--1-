/**
 * ===========================================================================
 *  QUICK VIEW, WISHLIST AND PANEL MOTION, MEASURED (round 28)
 * ===========================================================================
 *   npx tsx scripts/check-modal-motion-r28.ts [quickview] [drawers] [wishlist] [preview]
 *     TEMPLATES=clothing,rail   which Materia templates (default: every one)
 *     PREVIEW_ROOT=<url>        a server for public/ (default: this script serves it)
 *
 *   quickview  every template's /collections/all at 1440: the first card's
 *              quick view is warmed by the pointer, then opened. The click's
 *              long task (PerformanceObserver), every frame of the opening
 *              and closing, and the open dialog: Add to cart and Buy it now
 *              carry the theme's button corners (--btn-radius), the option
 *              pills the field corners (--input-border-radius), the heart a
 *              visible border, and the dialog wrote no class on <html>.
 *   drawers    cart, search and filters at 1440, menu and filters at 390:
 *              the panel's and the backdrop's transitions (getAnimations)
 *              last 200 to 300ms, nothing inside starts late on close, and
 *              the longest frame while it moves.
 *   wishlist   a live render (the engine's shim on): a card's heart, the
 *              quick view's heart; the header count follows and the list is
 *              still there on the next page.
 *   preview    the template's static preview opened as the marketplace
 *              frames it (CSP sandbox, no storage): a heart on the collection
 *              page is still saved, and counted, on the home page and on
 *              the Wishlist page.
 *
 * Measurements, not opinions. Exits 1 on any failure.
 */
import { createServer } from "node:http"
import { existsSync, readFileSync, statSync } from "node:fs"
import { extname, join } from "node:path"
import puppeteer, { type Browser, type Page } from "puppeteer-core"
import { CODE_TEMPLATES } from "../lib/themes/marketplace-shared"
import { importTemplate, serve } from "./theme-templates/site"
import { auditSite } from "./theme-templates/fixtures"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const args = new Set(process.argv.slice(2))
const all = args.size === 0
const ONLY = process.env.TEMPLATES?.split(",").filter(Boolean)
const templates = CODE_TEMPLATES.filter((t) => !ONLY || ONLY.includes(t.template) || ONLY.includes(t.slug))
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${!ok && detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`)
}

const FRAMES = `window.__f=[];(function(){var last=performance.now();var tick=function(t){window.__f.push(t-last);last=t;if(window.__f.length<40)requestAnimationFrame(tick)};requestAnimationFrame(tick)})();window.__lt=[];try{new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__lt.push(Math.round(e.duration))})}).observe({type:"longtask"})}catch(e){}`

async function site(template: string) {
  const imported = await importTemplate(`materia/${template}`)
  const built = auditSite(imported, template, false, { own: true })
  return serve(built, join("scripts", "theme-templates", "products", template))
}

async function quickview(browser: Browser) {
  console.log("\nQUICK VIEW")
  for (const t of templates) {
    const { base, server } = await site(t.template)
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1440, height: 900 })
      await page.goto(`${base}/collections/all`, { waitUntil: "networkidle0" })
      await sleep(600)
      const qb = await page.$("button-quickview, select-option")
      if (!qb) { console.log(`  --    ${t.template}: no quick view on its cards`); continue }
      await page.evaluate((el) => { el.scrollIntoView({ block: "center" }); el.dispatchEvent(new PointerEvent("pointerenter")) }, qb)
      await sleep(800)
      const htmlClass = await page.evaluate(() => document.documentElement.className)
      await page.evaluate(FRAMES)
      await page.evaluate((b) => (b as HTMLElement).click(), qb)
      await sleep(900)
      const m = await page.evaluate(() => {
        const cs = (s: string) => { const e = document.querySelector<HTMLElement>(s); return e ? getComputedStyle(e) : null }
        const r = getComputedStyle(document.documentElement)
        const wish = cs(".qv .qv__wish")
        return {
          open: !!document.querySelector(".tingle-modal.quickview.tingle-modal--visible .qv"),
          f: (window as unknown as { __f: number[] }).__f.slice(1).map(Math.round), lt: (window as unknown as { __lt: number[] }).__lt,
          htmlClass: document.documentElement.className,
          btn: r.getPropertyValue("--btn-radius").trim(), input: r.getPropertyValue("--input-border-radius").trim(),
          atc: cs(".qv .qv__atc")?.borderTopLeftRadius, buy: cs(".qv .qv__buy-now")?.borderTopLeftRadius ?? "none", pill: cs(".qv .qv__value:not(.qv__swatch)")?.borderTopLeftRadius ?? "none",
          wish: wish ? parseFloat(wish.borderTopWidth) : -1,
        }
      })
      const near = (a?: string, b?: string) => !a || !b || Math.abs(parseFloat(a) - parseFloat(b)) < 1 || (parseFloat(b) > 200 && parseFloat(a) > 20)
      check(`${t.template}: opens (longest frame ${Math.max(...m.f)}ms, click task ${m.lt.length ? Math.max(...m.lt) : 0}ms)`, m.open && Math.max(...m.f) <= 120 && (!m.lt.length || Math.max(...m.lt) < 120), m)
      check(`${t.template}:   nothing written on <html>`, m.htmlClass === htmlClass, { before: htmlClass, after: m.htmlClass })
      check(`${t.template}:   buttons take the theme's corners (${m.btn}), pills the fields' (${m.input}), the heart has a border`, near(m.atc, m.btn) && (m.buy === "none" || near(m.buy, m.btn)) && (m.pill === "none" || near(m.pill, m.input)) && m.wish >= 1, m)
      await page.evaluate(FRAMES)
      await page.keyboard.press("Escape")
      await sleep(600)
      const c = await page.evaluate(() => ({ f: (window as unknown as { __f: number[] }).__f.slice(1).map(Math.round), gone: !document.querySelector(".tingle-modal.quickview") }))
      check(`${t.template}:   closes (longest frame ${Math.max(...c.f)}ms)`, c.gone && Math.max(...c.f) <= 120, c)
    } finally { await page.close(); server.close() }
  }
}

const CASES: [string, number, string, string][] = [
  ["cart", 1440, "/collections/all", ".minicart__action"],
  ["search", 1440, "/collections/all", "button.top-search-toggle"],
  ["filters", 1440, "/collections/all", "[data-facets-open]"],
  ["menu", 390, "/", ".nav-toggle"],
  ["filters (phone)", 390, "/collections/all", "[data-facets-open]"],
]
/** The frames of a panel's move: the first (the click's own frame: its latency) apart, then those of the next 320ms. */
function motion(f: number[]) {
  const frames = f.slice(1)
  const first = frames[0] ?? 0
  let at = 0
  const moving: number[] = []
  for (const d of frames.slice(1)) { at += d; if (at > 320) break; moving.push(d) }
  return { first, moving: moving.length ? Math.max(...moving) : 0 }
}
const PANEL = /minicart__wrapper|search-overlay|facets-panel|navigation|nav\.|overlay::after|overlay_search|overlayminicart|::backdrop/
async function drawers(browser: Browser) {
  console.log("\nDRAWERS")
  for (const t of templates) {
    const { base, server } = await site(t.template)
    try {
      for (const [name, w, path, sel] of CASES) {
        const page = await browser.newPage()
        try {
          await page.setViewport({ width: w, height: w < 768 ? 844 : 900, isMobile: w < 768, hasTouch: w < 768 })
          await page.goto(base + path, { waitUntil: "networkidle0" })
          await sleep(900)
          const el = await page.$(sel)
          if (!el || !(await el.boundingBox())) continue
          const read = async () => page.evaluate(() => {
            const out: { el: string; prop: string; dur: number; delay: number }[] = []
            for (const a of document.getAnimations()) {
              const e = a.effect as KeyframeEffect | null
              if (!e || !e.target || a.constructor.name !== "CSSTransition") continue
              const tg = e.target as Element
              const desc = `${tg.tagName.toLowerCase()}${tg.id ? "#" + tg.id : ""}.${(tg.getAttribute("class") || "").split(/\s+/).slice(0, 3).join(".")}${e.pseudoElement ?? ""}`
              const t = e.getTiming()
              out.push({ el: desc, prop: (a as CSSTransition).transitionProperty, dur: Math.round(Number(t.duration)), delay: Math.round(Number(t.delay)) })
            }
            return out
          })
          await page.evaluate((e, f) => { new Function(f)(); (e as HTMLElement).click() }, el, FRAMES)
          await sleep(60)
          const opening = (await read()).filter((a) => PANEL.test(a.el) && /transform|translate|opacity/.test(a.prop))
          await sleep(800)
          const of = motion(await page.evaluate(() => (window as unknown as { __f: number[] }).__f.map(Math.round)))
          await page.evaluate((f) => { new Function(f)(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); (document.activeElement as HTMLElement | null)?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })) }, FRAMES)
          await sleep(60)
          const closing = (await read()).filter((a) => PANEL.test(a.el) && /transform|translate|opacity/.test(a.prop))
          await sleep(700)
          const cf = motion(await page.evaluate(() => (window as unknown as { __f: number[] }).__f.map(Math.round)))
          const inRange = (l: typeof opening) => l.length > 0 && l.every((a) => a.dur >= 180 && a.dur <= 320)
          check(`${t.template} ${name}: opens in ${[...new Set(opening.map((a) => a.dur))].join("/")}ms (first frame ${of.first}ms, longest while it moves ${of.moving}ms)`, inRange(opening) && of.moving <= 70, { opening, of })
          check(`${t.template} ${name}: closes in ${[...new Set(closing.map((a) => a.dur))].join("/")}ms, nothing inside starts late (first frame ${cf.first}ms, longest while it moves ${cf.moving}ms)`, inRange(closing) && closing.every((a) => a.delay === 0) && cf.moving <= 70, { closing, cf })
          if (of.first > 120 || cf.first > 120) console.log(`        note: a ${Math.max(of.first, cf.first)}ms first frame (the page restyled for its scroll lock) before it starts to move`)
        } finally { await page.close() }
      }
    } finally { server.close() }
  }
}

async function counts(page: Page) {
  return page.evaluate(() => [...document.querySelectorAll(".wishlist-count")].map((n) => n.textContent!.trim()))
}
async function wishlist(browser: Browser) {
  console.log("\nWISHLIST, LIVE RENDER")
  for (const t of templates) {
    const { base, server } = await site(t.template)
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1440, height: 900 })
      await page.goto(`${base}/collections/all`, { waitUntil: "networkidle0" })
      const heart = await page.$("button-wishlist:not([hidden])")
      if (!heart) { console.log(`  --    ${t.template}: no hearts on its cards`); continue }
      await page.evaluate((h) => (h as HTMLElement).click(), heart)
      await sleep(300)
      const one = await page.evaluate(() => ({ saved: JSON.parse(localStorage.getItem("materia__wishlist-items") || "[]"), site: Object.keys(localStorage).filter((k) => k.startsWith("storelib:wishlist:")).map((k) => localStorage.getItem(k)) }))
      const c1 = await counts(page)
      check(`${t.template}: a card's heart saves (theme ${one.saved.length}, website ${one.site.join()}) and the count says 1`, one.saved.length === 1 && one.site.length === 1 && c1.length > 0 && c1.every((c) => c === "1"), { one, c1 })
      const qb = await page.$("button-quickview, select-option")
      if (qb) {
        await page.evaluate((b) => (b as HTMLElement).click(), qb)
        await page.waitForSelector(".qv .qv__wish", { timeout: 5000 }).catch(() => null)
        const qh = await page.$(".qv .qv__wish")
        if (qh) {
          const was = await page.evaluate((h) => h.classList.contains("active"), qh)
          await page.evaluate((h) => (h as HTMLElement).click(), qh)
          await sleep(300)
          const n = (await page.evaluate(() => JSON.parse(localStorage.getItem("materia__wishlist-items") || "[]").length)) as number
          check(`${t.template}: the quick view's heart ${was ? "takes it out" : "saves"} and the count follows`, (await counts(page)).every((c) => c === String(n)) && n === (was ? 0 : 2), { was, n, counts: await counts(page) })
          await page.keyboard.press("Escape")
          await sleep(400)
        }
      }
      const n = (await page.evaluate(() => JSON.parse(localStorage.getItem("materia__wishlist-items") || "[]").length)) as number
      await page.goto(`${base}/`, { waitUntil: "networkidle0" })
      check(`${t.template}: still ${n} on the next page`, (await counts(page)).every((c) => c === String(n)), await counts(page))
    } finally { await page.close(); server.close() }
  }
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".avif": "image/avif" }
async function preview(browser: Browser) {
  console.log("\nWISHLIST, STATIC PREVIEW (sandboxed, no storage)")
  /* As next.config.mjs serves /theme-previews: CORS for the null origin, and the sandbox as a header. */
  const server = createServer((req, res) => {
    let f = join(process.cwd(), "public", decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname))
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
    if (!existsSync(f)) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "Content-Type": MIME[extname(f)] ?? "application/octet-stream", "Access-Control-Allow-Origin": "*", "Content-Security-Policy": "sandbox allow-scripts" })
    res.end(readFileSync(f))
  })
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
  const base = process.env.PREVIEW_ROOT ?? `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    for (const t of templates) {
      const root = `/theme-previews/${t.slug}`
      if (!existsSync(join("public", root, "collections", "all.html"))) continue
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: 1440, height: 900 })
        await page.goto(`${base}${root}/collections/all.html`, { waitUntil: "networkidle0" })
        const heart = await page.$("button-wishlist:not([hidden])")
        if (!heart) { console.log(`  --    ${t.slug}: no hearts`); continue }
        await page.evaluate((h) => (h as HTMLElement).click(), heart)
        await sleep(300)
        const here = await counts(page)
        /* Followed as a visitor follows a link: the same frame, so its window.name. */
        await page.evaluate((u) => { location.href = u }, `${root}/index.html`)
        await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null)
        const there = await counts(page)
        check(`${t.slug}: a heart pressed in the preview is still counted on the next page`, here.every((c) => c === "1") && there.length > 0 && there.every((c) => c === "1"), { here, there })
        if (existsSync(join("public", root, "pages", "wishlist.html"))) {
          await page.evaluate((u) => { location.href = u }, `${root}/pages/wishlist.html`)
          await page.waitForNavigation({ waitUntil: "networkidle0" }).catch(() => null)
          await sleep(500)
          const cards = await page.evaluate(() => document.querySelectorAll("[data-wishlist-card]:not([data-wishlist-sample])").length)
          check(`${t.slug}:   and on its Wishlist page (${cards} card)`, cards === 1, cards)
        }
      } finally { await page.close() }
    }
  } finally { server.close() }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] })
  try {
    if (all || args.has("quickview")) await quickview(browser)
    if (all || args.has("drawers")) await drawers(browser)
    if (all || args.has("wishlist")) await wishlist(browser)
    if (all || args.has("preview")) await preview(browser)
  } finally { await browser.close() }
  console.log(failed ? `\n${failed} failed` : "\nall passed")
  process.exit(failed ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(1) })
