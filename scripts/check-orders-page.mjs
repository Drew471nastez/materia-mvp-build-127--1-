/**
 * ===========================================================================
 *  THE ORDERS PAGE, MEASURED
 * ===========================================================================
 * Renders the real Orders client on the server (react-dom/server), sends that
 * HTML to Chromium with the build's own CSS, hydrates it there, and then
 * checks what the request asked for with numbers rather than a look:
 *
 *   nothing moves while it hydrates           layout-shift total
 *   the first two columns stay put            under a horizontal scroll
 *   a finger swipes the table sideways        a real touch gesture
 *     and not the page
 *   an order opens over the list               the list is covered, not gone
 *   back returns to exactly where it was      vertical and sideways scroll,
 *                                              ticked rows, the address
 *   the slide is a slide                      the order is part way across
 *                                              mid-animation
 *
 * and writes screenshots of each state, desktop and phone, to look at.
 *
 *   pnpm build && node scripts/check-orders-page.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-orders-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".orders-probe")
mkdirSync(stubs, { recursive: true })

/* next/navigation as the app router behaves for this page: the search params
   follow pushState, replaceState and popstate without a server round trip. */
writeFileSync(join(stubs, "navigation.js"), `import React from "react"
const listeners = new Set()
if (typeof window !== "undefined") {
  for (const m of ["pushState", "replaceState"]) {
    const orig = history[m].bind(history)
    history[m] = (...a) => { orig(...a); listeners.forEach((l) => l()) }
  }
  window.addEventListener("popstate", () => listeners.forEach((l) => l()))
}
const sub = (l) => { listeners.add(l); return () => listeners.delete(l) }
export function useSearchParams() {
  const s = React.useSyncExternalStore(sub, () => location.search, () => globalThis.__probeSearch || "")
  return React.useMemo(() => new URLSearchParams(s), [s])
}
export const usePathname = () => "/app/orders"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import React from "react"
import { hydrateRoot } from "react-dom/client"
import { App } from "${join(root, "scripts/render-orders-probe.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
hydrateRoot(document.getElementById("app"), React.createElement(App), {
  onRecoverableError: (e) => window.__errors.push("recoverable: " + (e && e.message)),
})
`)
writeFileSync(join(stubs, "server.tsx"), `import React from "react"
import { renderToString } from "react-dom/server"
import { App } from "${join(root, "scripts/render-orders-probe.tsx")}"
export function ssr() { return renderToString(React.createElement(App)) }
`)
const common = [
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
]
execFileSync("npx", ["esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`, ...common], { cwd: root, stdio: "inherit" })
execFileSync("npx", ["esbuild", join(stubs, "server.tsx"), "--bundle", "--format=cjs", "--platform=node", `--outfile=${join(out, "server.cjs")}`, ...common], { cwd: root, stdio: "inherit" })

const NOW = Date.now()
const TZ = "Europe/Bucharest"
globalThis.__probeNow = NOW
globalThis.__probeTz = TZ
globalThis.__probeSearch = ""
const { ssr } = createRequire(import.meta.url)(join(out, "server.cjs"))
const markup = ssr()
const bundle = readFileSync(join(out, "probe.js"))

const page = (html) =>
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body>` +
  `<div id="app">${html}</div>` +
  `<script>window.process={env:{NODE_ENV:"production"}};window.__probeNow=${NOW};window.__probeTz=${JSON.stringify(TZ)};` +
  `localStorage.setItem("storelib_timezone",${JSON.stringify(TZ)});` +
  `window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput)window.__cls+=e.value}}).observe({type:"layout-shift",buffered:true});</script>` +
  `<script src="/probe.js"></script></body></html>`
const html = page(markup)

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
})

async function open(viewport) {
  const p = await browser.newPage()
  await p.emulateTimezone(TZ)
  await p.setViewport(viewport)
  await p.goto(`${origin}/app/orders`, { waitUntil: "load" })
  await p.waitForSelector(".orders-scroller table tbody tr")
  await sleep(500)
  return p
}

/* ── Desktop ─────────────────────────────────────────────────────────── */
console.log("\ndesktop, 1280 wide")
{
  const p = await open({ width: 1280, height: 860 })
  const r = await p.evaluate(() => ({
    errors: window.__errors,
    cls: window.__cls,
    rows: document.querySelectorAll(".orders-scroller tbody tr").length,
    first: document.querySelector(".orders-scroller tbody tr td:nth-child(2)")?.textContent,
    footer: [...document.querySelectorAll("section[aria-label='Orders'] span")].map((s) => s.textContent).find((t) => /of/.test(t || "")),
    metrics: [...document.querySelectorAll("section[aria-label='Order metrics'] > div > div")].length,
    heads: [...document.querySelectorAll(".orders-scroller thead th")].map((t) => t.textContent.trim()).filter(Boolean),
    sources: [...new Set([...document.querySelectorAll(".orders-scroller tbody td:nth-child(5)")].map((t) => t.textContent.trim()))],
  }))
  expect(r.errors.length === 0, "hydrates with no error and no mismatch", r.errors.slice(0, 2).join(" | "))
  expect(r.cls < 0.001, "nothing shifted while it hydrated", r.cls)
  expect(r.rows === 50, "fifty orders on the first page", r.rows)
  expect(r.footer && /^1–50 of \d+$/.test(r.footer), "the footer counts them", r.footer)
  expect(r.heads.join("|") === "Order|Date|Customer|Source|Total|Payment status|Fulfillment status|Items|Delivery status|Delivery method", "every column the request named", r.heads.join("|"))
  expect(r.sources.includes("Website") && r.sources.includes("Storelib"), "the Source column says Storelib or Website", r.sources)
  expect(r.metrics === 6, "the period button and five metrics", r.metrics)
  await p.screenshot({ path: join(shots, "desktop-list.png") })

  await p.click("button[aria-label^='Period']")
  await sleep(300)
  await p.screenshot({ path: join(shots, "desktop-period.png") })
  const options = await p.$$eval("[role=menu][aria-label=Period] [role=menuitemradio]", (els) => els.map((e) => e.textContent))
  expect(options.length === 3 && /Today.*yesterday/.test(options[0]) && /Last 7 days.*previous 7/.test(options[1]), "Today, Last 7 days, Last 30 days, each with its comparison", options)
  await p.keyboard.press("Escape")
  await sleep(200)

  /* Scroll the list down, tick a row, then open an order and come back. */
  /* Tick first (puppeteer scrolls a target into view to click it), then
     scroll, then click by coordinates so nothing moves the list but us. */
  await p.click(".orders-scroller tbody tr:nth-child(3) label")
  await sleep(100)
  await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 420 })
  await sleep(100)
  const before = await p.evaluate(() => ({ top: document.querySelector(".orders-pane").scrollTop, url: location.search }))
  const spot = await p.evaluate(() => {
    const r = document.querySelector(".orders-scroller tbody tr:nth-child(12) td:nth-child(3)").getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const wanted = await p.evaluate(() => document.querySelector(".orders-scroller tbody tr:nth-child(12) td:nth-child(2) a").textContent)
  await p.mouse.click(spot.x, spot.y)
  await sleep(120)
  const mid = await p.evaluate(() => {
    const d = document.querySelector(".orders-detail")
    return d ? { stage: d.dataset.stage, x: new DOMMatrix(getComputedStyle(d).transform).m41, opacity: Number(getComputedStyle(d).opacity) } : null
  })
  await sleep(500)
  const opened = await p.evaluate(() => ({
    title: document.querySelector(".orders-detail h1")?.textContent,
    stage: document.querySelector(".orders-detail")?.dataset.stage,
    url: location.search,
    listHidden: getComputedStyle(document.querySelector(".orders-pane")).visibility,
    listInert: document.querySelector(".orders-pane").inert,
    listStillThere: document.querySelectorAll(".orders-scroller tbody tr").length,
    cards: [...document.querySelectorAll(".orders-detail section")].map((s) => s.querySelector("h2")?.textContent || s.querySelector("span")?.textContent),
    timeline: document.querySelectorAll(".orders-detail ol ol li").length,
    sub: document.querySelector(".orders-detail h1")?.closest("div.sticky")?.nextElementSibling?.textContent,
  }))
  expect(mid && mid.stage === "entering" && mid.x > 0 && mid.x < 24 && mid.opacity > 0 && mid.opacity < 1, "the order is part way in 120ms after the click", mid)
  expect(opened.title === wanted, "the clicked order opens", `${opened.title} vs ${wanted}`)
  expect(/[?&]order=/.test(opened.url), "its address is in the URL", opened.url)
  expect(opened.listHidden === "hidden" && opened.listInert === true && opened.listStillThere === 50, "the list is covered, still mounted, and out of the tab order", opened)
  expect(opened.cards.length >= 5, "fulfillment, payment, timeline, customer and details", opened.cards)
  expect(opened.timeline >= 4, "a timeline with the order's events, under a day heading", opened.timeline)
  expect(/ at \d{1,2}:\d\d (am|pm) from (Website|Storelib)$/.test(opened.sub || ""), "“Date at time from Source” under the title", opened.sub)
  await p.screenshot({ path: join(shots, "desktop-order.png") })

  await p.goBack()
  await sleep(500)
  const after = await p.evaluate(() => ({
    top: document.querySelector(".orders-pane").scrollTop,
    url: location.search,
    detail: !!document.querySelector(".orders-detail"),
    ticked: document.querySelectorAll(".orders-scroller tbody input:checked").length,
  }))
  expect(!after.detail, "back closes it", after)
  expect(after.top === before.top && before.top > 0, "and the list is exactly as far down as it was", `${after.top} vs ${before.top}`)
  expect(after.ticked === 1, "with the same row still ticked", after.ticked)
  expect(after.url === before.url, "and the same address", `${after.url} vs ${before.url}`)
  await p.close()
}

/* ── Phone ───────────────────────────────────────────────────────────── */
console.log("\nphone, 390 wide, touch")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const r = await p.evaluate(() => ({ errors: window.__errors, cls: window.__cls, pageWidth: document.documentElement.scrollWidth }))
  expect(r.errors.length === 0, "hydrates with no error", r.errors.slice(0, 2).join(" | "))
  expect(r.cls < 0.001, "nothing shifted while it hydrated", r.cls)
  expect(r.pageWidth <= 390, "the page itself never scrolls sideways", r.pageWidth)
  await p.screenshot({ path: join(shots, "phone-list.png") })

  const geo = () => p.evaluate(() => {
    const s = document.querySelector(".orders-scroller")
    const row = s.querySelector("tbody tr:nth-child(4)")
    const pane = document.querySelector(".orders-pane")
    return {
      scrollLeft: s.scrollLeft,
      overflow: s.dataset.overflow,
      scrolled: s.dataset.scrolled,
      box: row.children[0].getBoundingClientRect().left,
      order: row.children[1].getBoundingClientRect().left,
      date: row.children[2].getBoundingClientRect().left,
      paneTop: pane.scrollTop,
      edge: getComputedStyle(row.children[1]).boxShadow,
    }
  })
  await p.evaluate(() => document.querySelector(".orders-scroller tbody tr:nth-child(4)").scrollIntoView({ block: "center" }))
  await sleep(150)
  const g0 = await geo()
  expect(g0.overflow === "true", "the table is wider than the phone", g0)

  /* A real finger: a horizontal swipe across a row, from the right side of
     the screen towards the left. */
  const rect = await p.evaluate(() => {
    const r = document.querySelector(".orders-scroller tbody tr:nth-child(4)").getBoundingClientRect()
    return { x: 330, y: r.top + r.height / 2 }
  })
  /* Touch events, not a synthesized gesture: in headless Chromium a
     synthesized touch gesture scrolls nothing at all, not even the page
     vertically, which would measure the harness rather than the table. */
  await p.touchscreen.touchStart(rect.x, rect.y)
  for (let i = 1; i <= 12; i++) {
    await p.touchscreen.touchMove(rect.x - i * 20, rect.y)
    await sleep(16)
  }
  await p.touchscreen.touchEnd()
  await sleep(900)
  const g1 = await geo()
  expect(g1.scrollLeft > 150, "a swipe scrolls the table sideways", g1.scrollLeft)
  expect(Math.abs(g1.paneTop - g0.paneTop) < 2, "and not the page up or down", `${g0.paneTop} -> ${g1.paneTop}`)
  expect(Math.abs(g1.box - g0.box) < 0.5 && Math.abs(g1.order - g0.order) < 0.5, "the checkbox and Order columns stay where they were", { before: [g0.box, g0.order], after: [g1.box, g1.order] })
  expect(g0.date - g1.date > 150, "while the rest moves under them", `${g0.date} -> ${g1.date}`)
  expect(g1.scrolled === "true" && /rgba/.test(g1.edge), "and a shadow marks the edge", g1.edge)
  expect(!(await p.$(".orders-detail")), "a swipe is a swipe, not a tap on the row")
  await p.screenshot({ path: join(shots, "phone-list-swiped.png") })

  /* Open an order from the swiped table, come back, find it still swiped. */
  const before = await geo()
  /* Every frame of the slide, read where the frame is drawn. */
  await p.evaluate(() => {
    window.__slide = []
    const t0 = performance.now()
    const tick = () => {
      const d = document.querySelector(".orders-detail")
      if (d) window.__slide.push(Math.round(new DOMMatrix(getComputedStyle(d).transform).m41))
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.tap(".orders-scroller tbody tr:nth-child(4) td:nth-child(2) a")
  await sleep(900)
  const slide = await p.evaluate(() => window.__slide)
  const moving = slide.filter((x) => x > 0 && x < 390)
  const descending = moving.every((x, i) => i === 0 || x <= moving[i - 1])
  expect(moving.length >= 4 && descending && slide.at(-1) === 0, "on a phone the order slides in from the right, frame by frame, and lands", slide.slice(0, 14))
  await p.screenshot({ path: join(shots, "phone-order.png") })
  const detailWidth = await p.evaluate(() => document.querySelector(".orders-detail").scrollWidth)
  expect(detailWidth <= 390, "the order fits the phone's width", detailWidth)
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 600 })
  await sleep(100)
  await p.screenshot({ path: join(shots, "phone-order-scrolled.png") })
  await p.tap("button[aria-label='Back to orders']")
  await sleep(500)
  const after = await geo()
  expect(Math.abs(after.scrollLeft - before.scrollLeft) < 1 && Math.abs(after.paneTop - before.paneTop) < 1,
    "the back arrow returns to the list scrolled exactly as it was, both ways",
    { before: [before.scrollLeft, before.paneTop], after: [after.scrollLeft, after.paneTop] })
  const url = await p.evaluate(() => location.search)
  expect(url === "", "and the address is the list's again", url)

  /* Search. */
  await p.tap("button[aria-label='Search and filter']")
  await sleep(150)
  await p.type("input[type=search]", "mihai")
  await sleep(400)
  const found = await p.evaluate(() => ({
    rows: [...document.querySelectorAll(".orders-scroller tbody tr td:nth-child(4)")].map((t) => t.textContent),
    url: location.search,
  }))
  expect(found.rows.length > 0 && found.rows.every((t) => /Mihai/.test(t)), "search narrows the list to the customer", found.rows.length)
  expect(/q=mihai/.test(found.url), "and keeps the search in the address", found.url)
  await p.screenshot({ path: join(shots, "phone-search.png") })
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken === 0 ? "\nThe Orders page measured as asked.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
