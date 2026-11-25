/**
 * ===========================================================================
 *  MATERIA'S REVEALS, PICTURES AND THE EDITOR'S CANVAS (round 27)
 * ===========================================================================
 *   npx tsx scripts/check-canvas-reveal-r27.ts [types] [canvas] [old] [preview] [images]
 *     TEMPLATE=clothing   which Materia template's home page
 *     OLD_THEME=<dir>     a theme-packages folder from an older commit, for "old"
 *                         (git archive ca23349d4 theme-packages/materia | tar -x -C <dir>)
 *
 *   types    the live site's own handler draws the home page once per
 *            "When a section scrolls into view" type; the page is scrolled
 *            down a screen at a time like a wheel, and every element that
 *            waits for its reveal is read on every frame: the lowest opacity
 *            it shows while on screen (never 0: never blank), how many frames
 *            it moved, that it ends at opacity 1 with nothing left waiting,
 *            the longest frame and the page's layout shift (CLS).
 *   canvas   the real editor (scripts/editor-probe-harness.mjs) on the same
 *            template: a section below the screen, scrolled to with the
 *            wheel inside the canvas, must move (as on the website).
 *   old      the same with the theme files an install from before round 26
 *            holds (its animation.js turned reveals off in any frame): the
 *            canvas must play them now (canvas-bridge.ts, CANVAS_DESIGN_GUARD).
 *   preview  the canvas told an Animations setting changed (theme-changed):
 *            the sections on screen play their reveal again, and end shown.
 *   images   the live page on a slow network (150ms, 1.6 Mbps): every
 *            picture that comes on screen while scrolling is read, whether it
 *            was there, faded in after it was decoded, or popped in.
 *
 * Measurements, not opinions. Exits 1 on any failure.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { extname, join, normalize } from "node:path"
import JSZip from "jszip"
import puppeteer, { type Browser, type Frame, type Page } from "puppeteer-core"
import { composeTemplateZip } from "../lib/themes/template-packages"
import { editorFor, serveLive } from "./check-builder-nav19"

const CHROME = process.env.CHROME ?? "/opt/pw-browsers/chromium"
const TEMPLATE = process.env.TEMPLATE ?? "clothing"
const parts = new Set(process.argv.slice(2))
const all = parts.size === 0
let failed = 0
const check = (label: string, ok: boolean, detail: unknown = "") => {
  if (!ok) failed++
  const d = typeof detail === "string" ? detail : JSON.stringify(detail)
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${d ? `  (${d})` : ""}`)
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const TYPES = (process.env.TYPES ?? "fade_in,fade_up,slide_in,subtle_rise,zoom_in,cinematic,blur_up,blur_in,slide_side,stagger_up,mask_reveal,split_text").split(",")

async function zipWith(settings: Record<string, unknown>, root?: string): Promise<JSZip> {
  const zip = await JSZip.loadAsync(await composeTemplateZip(`materia/${TEMPLATE}`, root))
  const data = JSON.parse(await zip.file("config/settings_data.json")!.async("string")) as { current: Record<string, unknown> }
  Object.assign(data.current, settings)
  zip.file("config/settings_data.json", JSON.stringify(data))
  return zip
}

/** Installed on the page before anything of the theme's: every frame, every element waiting for its reveal is read. */
const WATCH = `(() => {
  const w = window; w.__rv = { shifts: 0, frames: 0, longest: 0, els: new Map() };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.__rv.shifts += e.value }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
  let last = performance.now();
  const tick = () => {
    const now = performance.now(); const r = w.__rv; r.frames++; if (w.__rvScrolling) r.longest = Math.max(r.longest, now - last); last = now;
    const list = document.querySelectorAll(".scroll-trigger--armed, .scroll-trigger--armed [data-reveal-part], .scroll-trigger--armed .mt-word");
    for (const el of list) {
      if (el.classList.contains("reveal-parts") || el.getAttribute("data-reveal-part") === "words") continue;
      const b = el.getBoundingClientRect(); if (b.bottom <= 0 || b.top >= innerHeight || b.width < 1) continue;
      const o = parseFloat(getComputedStyle(el).opacity); let s = r.els.get(el);
      if (!s) r.els.set(el, s = { min: o, moving: 0, last: o, played: false, waited: false, what: (el.tagName + "." + String(el.className).slice(0, 50) + " " + (el.getAttribute("data-reveal-part") || "") + " a=" + getComputedStyle(el).animationName) });
      const playing = !el.matches(".scroll-trigger--offscreen, .scroll-trigger--offscreen *");
      if (playing) { s.played = true; s.min = Math.min(s.min, o); } else s.waited = true;
      if (playing && (Math.abs(o - s.last) > 0.004 || getComputedStyle(el).transform !== "none")) s.moving++;
      s.last = o;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})()`

async function wheelDown(page: Page, frame: Frame, steps: number, dy: number) {
  await frame.evaluate(() => { (window as unknown as { __rvScrolling: boolean }).__rvScrolling = true })
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel({ deltaY: dy })
    await sleep(90)
  }
  await frame.evaluate(() => { (window as unknown as { __rvScrolling: boolean }).__rvScrolling = false })
}

async function types(browser: Browser) {
  console.log(`\nlive site, every reveal type (${TEMPLATE}, 1440x900)`)
  for (const type of TYPES) {
    const { server, base } = await serveLive(undefined, await zipWith({ scroll_animation: type, zoom_image: true }))
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1440, height: 900 })
      await page.evaluateOnNewDocument(WATCH)
      await page.goto(`${base}/`, { waitUntil: "networkidle0", timeout: 60000 })
      await sleep(600)
      await page.mouse.move(720, 450)
      const armed = await page.evaluate(() => document.querySelectorAll(".scroll-trigger--armed").length)
      await wheelDown(page, page.mainFrame(), 40, 160)
      await sleep(2600)
      const r = await page.evaluate(() => {
        const rv = (window as unknown as { __rv: { shifts: number; longest: number; els: Map<Element, { min: number; moving: number; played: boolean; waited: boolean }> } }).__rv
        const played = [...rv.els.values()].filter((s) => s.played)
        const leftEls = [...document.querySelectorAll(".scroll-trigger--armed, .scroll-trigger--offscreen, [data-reveal-part], .mt-word, [data-reveal-zoom]")]
        return {
          seen: played.length,
          minOpacity: played.length ? Math.min(...played.map((s) => s.min)) : 1,
          /* Judged on what was seen waiting and then played: one first seen in the last frames of its reveal has little left to move. */
          stillMoving: played.filter((s) => s.waited && s.moving < 4).length,
          stuckWhat: played.filter((s) => s.waited && s.moving < 4).slice(0, 4).map((s) => `${(s as unknown as { what: string }).what} m=${s.moving} o=${s.min}`),
          left: leftEls.length,
          leftWhat: leftEls.slice(0, 3).map((e) => `${e.id || e.className.slice(0, 60)} ${Math.round(e.getBoundingClientRect().top)}/${Math.round(e.getBoundingClientRect().height)}`),
          hidden: [...document.querySelectorAll(".scroll-trigger")].filter((e) => e.getBoundingClientRect().top < innerHeight && parseFloat(getComputedStyle(e).opacity) < 0.99).length,
          cls: Math.round(rv.shifts * 1000) / 1000,
          longest: Math.round(rv.longest),
          words: (window as unknown as { __rvWords?: number }).__rvWords ?? 0,
        }
      })
      check(`${type.padEnd(11)} ${armed} waiting; each one seen moved and was never blank`, r.seen > 0 && r.minOpacity >= 0.15 && r.stillMoving === 0, r)
      check(`${type.padEnd(11)} nothing left waiting or hidden, no layout shift`, r.left === 0 && r.hidden === 0 && r.cls < 0.02, { left: r.left, leftWhat: r.leftWhat, hidden: r.hidden, cls: r.cls, longestFrameMs: r.longest })
    } finally {
      await page.close()
      server.close()
    }
  }
}

async function canvasScroll(browser: Browser, label: string, zip: JSZip) {
  const ed = await editorFor(browser, 1440, 900, false, undefined, zip)
  try {
    await ed.frame()
    await ed.page.waitForSelector("[data-canvas-placeholder='gone']", { timeout: 30000 }).catch(() => {})
    await sleep(2500)
    const frame = await ed.frame()
    const state = await frame.evaluate(() => ({ html: document.documentElement.className, waiting: document.querySelectorAll(".scroll-trigger--armed").length }))
    await frame.evaluate(WATCH)
    const fb = (await (await ed.page.$("[data-compat-frame='front']"))!.boundingBox())!
    await ed.page.mouse.move(fb.x + fb.width / 2, fb.y + 300)
    await wheelDown(ed.page, frame, 24, 160)
    await sleep(2400)
    const r = await frame.evaluate(() => {
      const rv = (window as unknown as { __rv: { els: Map<Element, { moving: number; played: boolean }> } }).__rv
      const played = [...rv.els.values()].filter((s) => s.played)
      return { played: played.length, moved: played.filter((s) => s.moving >= 4).length, hidden: [...document.querySelectorAll(".scroll-trigger")].filter((e) => e.getBoundingClientRect().top < innerHeight && parseFloat(getComputedStyle(e).opacity) < 0.99).length }
    })
    check(`${label}: sections below the screen reveal as the canvas is scrolled`, state.waiting > 0 && r.played > 0 && r.moved >= Math.max(1, r.played - 1), { ...state, html: state.html.includes("shopify-design-mode") ? "design-mode" : "website", ...r })
    check(`${label}: nothing left hidden`, r.hidden === 0, r)
  } finally {
    await ed.page.close()
    ed.close()
  }
}

async function preview(browser: Browser) {
  console.log("\ncanvas: an Animations setting changed")
  const ed = await editorFor(browser, 1440, 900, false, undefined, await zipWith({ scroll_animation: "fade_up" }))
  try {
    await ed.frame()
    await ed.page.waitForSelector("[data-canvas-placeholder='gone']", { timeout: 30000 }).catch(() => {})
    await sleep(2500)
    const frame = await ed.frame()
    await frame.evaluate(() => window.scrollTo({ top: innerHeight * 1.6, behavior: "instant" as ScrollBehavior }))
    await sleep(2500)
    await frame.evaluate(WATCH)
    /* As the editor says it (compat-canvas.tsx noteThemeChange): to the front frame, once it rests. */
    await ed.page.evaluate(() => { document.querySelector<HTMLIFrameElement>("[data-compat-frame='front']")!.contentWindow!.postMessage({ storelib: 1, type: "theme-changed", settings: { scroll_animation: "fade_up" } }, "*") })
    await sleep(2600)
    const r = await frame.evaluate(() => {
      const rv = (window as unknown as { __rv: { els: Map<Element, { moving: number; played: boolean; min: number }> } }).__rv
      const played = [...rv.els.values()].filter((s) => s.played)
      return { played: played.length, moved: played.filter((s) => s.moving >= 4).length, min: played.length ? Math.min(...played.map((s) => s.min)) : 1, hidden: [...document.querySelectorAll(".scroll-trigger")].filter((e) => e.getBoundingClientRect().top < innerHeight && parseFloat(getComputedStyle(e).opacity) < 0.99).length, left: [...document.querySelectorAll(".scroll-trigger--armed")].filter((e) => e.getBoundingClientRect().top < innerHeight).length }
    })
    check("the sections on screen play their reveal again, never from blank", r.played > 0 && r.moved === r.played && r.min >= 0.15, r)
    check("and end shown, nothing waiting", r.hidden === 0 && r.left === 0, r)
  } finally {
    await ed.page.close()
    ed.close()
  }
}

/** public/ served as the site serves it: the template previews are the templates' own pages with their sample shop's pictures. */
async function servePublic(): Promise<{ server: Server; base: string }> {
  const root = join(process.cwd(), "public")
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".json": "application/json" }
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname)
    if (path.endsWith("/")) path += "index.html"
    const file = normalize(join(root, path))
    if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return }
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" })
    res.end(readFileSync(file))
  })
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok))
  return { server, base: `http://127.0.0.1:${(server.address() as { port: number }).port}` }
}

async function images(browser: Browser) {
  const slug = process.env.PREVIEW ?? "clothing"
  console.log(`\ntemplate preview, pictures on a slow network (${slug}, 390x844 phone)`)
  const { server, base } = await servePublic()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
    const cdp = await page.createCDPSession()
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 200_000, uploadThroughput: 100_000 })
    await page.evaluateOnNewDocument(`(() => {
      const w = window; w.__img = new Map(); w.__fades = 0;
      const orig = Element.prototype.animate; Element.prototype.animate = function (k, o) { if (this.tagName === "IMG") w.__fades++; return orig.call(this, k, o) };
      const tick = () => {
        for (const img of document.images) {
          const b = img.getBoundingClientRect(); if (b.width < 40 || b.bottom <= 0 || b.top >= innerHeight || b.right <= 0 || b.left >= innerWidth) continue;
          const cs = getComputedStyle(img); if (cs.visibility === "hidden" || cs.display === "none" || img.closest(".secondary-image, [aria-hidden=true]")) continue;
          let s = w.__img.get(img); if (!s) w.__img.set(img, s = { emptyFrames: 0, poppedAt: 0 });
          if (!(img.complete && img.naturalWidth > 0)) s.emptyFrames++;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`)
    await page.goto(`${base}/theme-previews/${slug}/index.html`, { waitUntil: "load", timeout: 180000 })
    await sleep(2500)
    /* A thumb's flick at a time (STEP px every WAIT ms): 260/250 reads at a steady pace, 700/150 skims. */
    const step = Number(process.env.STEP ?? 260), wait = Number(process.env.WAIT ?? 250)
    for (let y = 0; y < 4700; y += step) {
      await page.evaluate((d) => window.scrollBy({ top: d, behavior: "instant" as ScrollBehavior }), step)
      await sleep(wait)
    }
    await sleep(2000)
    const r = await page.evaluate(() => {
      const w = window as unknown as { __img: Map<HTMLImageElement, { emptyFrames: number }>; __fades: number }
      const list = [...w.__img.values()]
      const box = [...document.images].filter((i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 40)
      const noRatio = box.filter((i) => !(i.getAttribute("width") && i.getAttribute("height")) && getComputedStyle(i).aspectRatio === "auto" && !getComputedStyle(i).position.includes("absolute")).length
      return { images: document.images.length, y: Math.round(scrollY), height: document.documentElement.scrollHeight, seen: list.length, readyWhenSeen: list.filter((s) => s.emptyFrames === 0).length, waitedLong: list.filter((s) => s.emptyFrames > 30).length, fades: w.__fades, noRatio, held: document.querySelectorAll("img.media-fade-hold").length }
    })
    check("pictures that scroll in are mostly there already (loaded ahead)", r.seen > 0 && r.readyWhenSeen / r.seen >= 0.6, r)
    check("none left held, none waits more than half a second on screen", r.held === 0 && r.waitedLong <= Math.ceil(r.seen * 0.1), r)
    const cls = await page.evaluate(() => new Promise<number>((done) => { let v = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) if (!e.hadRecentInput) v += e.value }).observe({ type: "layout-shift", buffered: true }) } catch (e) {} setTimeout(() => done(Math.round(v * 1000) / 1000), 200) }))
    check("no layout shift as pictures arrive", cls < 0.05, { cls })
  } finally {
    await page.close()
    server.close()
  }
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, args: ["--no-sandbox", "--disable-dev-shm-usage"], timeout: 120000, protocolTimeout: 240000 })
  try {
    if (all || parts.has("types")) await types(browser)
    if (all || parts.has("canvas")) { console.log("\ncanvas, this theme"); await canvasScroll(browser, "current theme", await zipWith({ scroll_animation: "fade_up" })) }
    if ((all || parts.has("old")) && process.env.OLD_THEME) {
      console.log("\ncanvas, an install's older theme files")
      void readdirSync(process.env.OLD_THEME)
      await canvasScroll(browser, "older install", await zipWith({}, process.env.OLD_THEME))
    }
    if (all || parts.has("preview")) await preview(browser)
    if (all || parts.has("images")) await images(browser)
  } finally {
    await browser.close()
  }
  console.log(failed ? `\n${failed} failed` : "\nall ok")
  process.exit(failed ? 1 : 0)
}
void main()
