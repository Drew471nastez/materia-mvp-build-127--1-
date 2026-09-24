/**
 * ===========================================================================
 *  THE ORDERS PAGE, MEASURED
 * ===========================================================================
 * Renders the real Orders client on the server (react-dom/server), sends that
 * HTML to Chromium with the app's own CSS, hydrates it there, and then
 * checks what was asked for with numbers rather than a look:
 *
 *   nothing moves while it hydrates           layout-shift total
 *   the first two columns stay put            under a horizontal scroll
 *   a finger swipes the table sideways        a real touch gesture
 *     and not the page
 *   an order opens over the list              the list is covered, not gone
 *   its bar is there on the first frame       ms from the click to the frame
 *     after the click, at one size             that draws it, its size on
 *                                              every frame, layout shift
 *   the bar spans the pane, carries the       its rect against the pane's,
 *     date, and has depth only once           its text, data-scrolled and
 *     something is under it                   its shadow at 0 and scrolled
 *   the cards sit as Shopify's do             column tops, widths, gaps; on a
 *                                              phone one column, in order
 *   back returns to exactly where it was      the next frame, vertical and
 *                                              sideways scroll, ticked rows,
 *                                              the address, no skeleton
 *   one dialog at a time                      a centred dialog on a laptop;
 *                                              on a phone the menu's sheet is
 *                                              gone before the refund's rises
 *   a link straight to an order               the page does not fade in as a
 *                                              whole
 *
 * and writes screenshots of each state, desktop and phone, to look at.
 *
 *   pnpm build && node scripts/check-orders-page.mjs
 *   CSS_URL=http://localhost:3000/login node scripts/check-orders-page.mjs   (a dev server's CSS instead)
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

async function stylesheet() {
  const cssDir = join(root, ".next/static/chunks")
  if (existsSync(cssDir) && !process.env.CSS_URL) {
    return readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
  }
  const base = process.env.CSS_URL
  if (!base) fail("No production build found. Run `pnpm build` first, or set CSS_URL to a running dev server's page.")
  const html = await (await fetch(base)).text()
  const hrefs = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => new URL(m[1], base).toString())
  return (await Promise.all(hrefs.map(async (h) => (await fetch(h)).text()))).join("\n")
}
const css = await stylesheet()

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
const { ssr } = createRequire(import.meta.url)(join(out, "server.cjs"))
globalThis.__probeSearch = ""
const markup = ssr("app")
globalThis.__probeSearch = "?order=ord-0005"
/* A link straight to an order: the server renders it open, as Next does
   with the request's own search params. */
const orderMarkup = ssr("app")
globalThis.__probeSearch = ""
const bundle = readFileSync(join(out, "probe.js"))

const page = (html) =>
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body>` +
  `<div id="app">${html}</div>` +
  `<script>window.process={env:{NODE_ENV:"production"}};window.__probeNow=${NOW};window.__probeTz=${JSON.stringify(TZ)};` +
  `localStorage.setItem("storelib_timezone",${JSON.stringify(TZ)});` +
  `window.__cls=0;window.__shifts=[];new PerformanceObserver(l=>{for(const e of l.getEntries()){if(!e.hadRecentInput){window.__cls+=e.value;window.__shifts.push({t:e.startTime,v:e.value})}}}).observe({type:"layout-shift",buffered:true});</script>` +
  `<script src="/probe.js"></script></body></html>`
const html = page(markup)
const orderHtml = page(orderMarkup)

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(req.url.includes("order=ord-0005") ? orderHtml : html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
})

async function open(viewport, path = "/app/orders") {
  const p = await browser.newPage()
  await p.emulateTimezone(TZ)
  await p.setViewport(viewport)
  await p.goto(`${origin}${path}`, { waitUntil: "load" })
  if (path.startsWith("/app/orders")) await p.waitForSelector(".orders-scroller table tbody tr")
  await sleep(500)
  return p
}

/* Every frame from now until `ms` later: the order's bar, where it is and
   how opaque everything above it makes it, and whether the list shows. */
async function recordFrames(p, ms) {
  await p.evaluate((ms) => {
    window.__frames = []
    window.__clickAt = null
    const onClick = (e) => { if (window.__clickAt === null) window.__clickAt = performance.now() }
    document.addEventListener("click", onClick, { capture: true, once: true })
    document.addEventListener("touchend", onClick, { capture: true, once: true })
    const t0 = performance.now()
    const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o }
    const tick = () => {
      const bar = document.querySelector(".orders-detail [data-orders-bar]")
      const body = document.querySelector(".orders-detail .orders-body")
      const list = document.querySelector(".orders-pane")
      const r = bar?.getBoundingClientRect()
      window.__frames.push({
        t: performance.now(),
        bar: r ? { top: r.top, left: r.left, width: r.width, height: r.height, opacity: opacityOf(bar) } : null,
        body: body ? opacityOf(body) : null,
        listShown: list ? getComputedStyle(list).visibility !== "hidden" : false,
        skeleton: document.querySelectorAll(".skeleton-late").length,
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
}
const readFrames = (p) => p.evaluate(() => ({ frames: window.__frames, clickAt: window.__clickAt }))

function barOnFirstFrame({ frames, clickAt }) {
  const after = frames.filter((f) => clickAt !== null && f.t >= clickAt)
  const first = after.find((f) => f.bar)
  const sizes = new Set(after.filter((f) => f.bar).map((f) => `${f.bar.left.toFixed(1)},${f.bar.top.toFixed(1)},${f.bar.width.toFixed(1)}x${f.bar.height.toFixed(1)}`))
  return {
    ms: first ? Math.round(first.t - clickAt) : null,
    framesBefore: first ? after.indexOf(first) : null,
    opacity: first ? Number(first.bar.opacity.toFixed(3)) : null,
    bodyFirst: first ? Number((first.body ?? 0).toFixed(3)) : null,
    sizes: [...sizes],
    bodyFullAt: (() => { const f = after.find((x) => x.body !== null && x.body >= 0.999); return f ? Math.round(f.t - clickAt) : null })(),
    fadeMs: (() => { const f = after.find((x) => x.body !== null && x.body >= 0.999); return f && first ? Math.round(f.t - first.t) : null })(),
  }
}

/* The cards of the open order, by what they are. */
const cardsOf = (p) => p.evaluate(() => {
  const d = document.querySelector(".orders-detail")
  const sections = [...d.querySelectorAll(".orders-body section")]
  const name = (s) => {
    const h = s.querySelector("h2")?.textContent
    if (h) return h
    return s.textContent.includes("Subtotal") ? "Payment" : "Items"
  }
  return sections.map((s) => { const r = s.getBoundingClientRect(); return { name: name(s), left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), bottom: Math.round(r.bottom) } })
})

/* ── Desktop ─────────────────────────────────────────────────────────── */
console.log("\ndesktop, 1280 wide")
{
  const p = await open({ width: 1280, height: 860 })
  const r = await p.evaluate(() => ({
    errors: window.__errors,
    cls: window.__cls,
    rows: document.querySelectorAll(".orders-scroller tbody tr").length,
    footer: [...document.querySelectorAll("section[aria-label='Orders'] span")].map((s) => s.textContent).find((t) => /of/.test(t || "")),
    metrics: [...document.querySelectorAll("section[aria-label='Order metrics'] > div > div")].length,
    heads: [...document.querySelectorAll(".orders-scroller thead th")].map((t) => t.textContent.trim()).filter(Boolean),
    sources: [...new Set([...document.querySelectorAll(".orders-scroller tbody td:nth-child(5)")].map((t) => t.textContent.trim()))],
    listBar: (() => { const b = document.querySelector("[data-orders-bar]").getBoundingClientRect(); const pane = document.querySelector(".orders-pane").getBoundingClientRect(); return { bar: [b.left, b.width], pane: [pane.left, document.querySelector(".orders-pane").clientWidth] } })(),
  }))
  expect(r.errors.length === 0, "hydrates with no error and no mismatch", r.errors.slice(0, 2).join(" | "))
  expect(r.cls < 0.001, "nothing shifted while it hydrated", r.cls)
  expect(r.rows === 50, "fifty orders on the first page", r.rows)
  expect(r.footer && /^1–50 of \d+$/.test(r.footer), "the footer counts them", r.footer)
  expect(r.heads.join("|") === "Order|Date|Customer|Source|Total|Payment status|Fulfillment status|Items|Delivery status|Delivery method", "every column the request named", r.heads.join("|"))
  expect(r.sources.some((s) => /^Website · (Instagram|TikTok)$/.test(s)) && r.sources.some((s) => /^Storelib · (Google|Direct)$/.test(s)), "the Source column says the channel and where the visit came from", r.sources)
  expect(near(r.listBar.bar[0], r.listBar.pane[0]) && near(r.listBar.bar[1], r.listBar.pane[1], 1), "the list's bar spans the pane", r.listBar)
  expect(r.metrics === 5, "five figures: sales, orders, average order, customers, refunds", r.metrics)
  await p.screenshot({ path: join(shots, "desktop-list.png") })

  /* Scroll the list down, tick a row, filter, then open an order and come back. */
  await p.click(".orders-scroller tbody tr:nth-child(3) label")
  await sleep(100)
  await p.evaluate(() => { document.querySelector(".orders-pane").scrollTop = 420 })
  await sleep(150)
  const before = await p.evaluate(() => ({ top: document.querySelector(".orders-pane").scrollTop, url: location.search, depth: document.querySelector("[data-orders-bar]").dataset.scrolled }))
  expect(before.depth === "true", "the list's bar takes its depth once the list scrolls under it", before.depth)
  const spot = await p.evaluate(() => {
    const r = document.querySelector(".orders-scroller tbody tr:nth-child(12) td:nth-child(3)").getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  const wanted = await p.evaluate(() => document.querySelector(".orders-scroller tbody tr:nth-child(12) td:nth-child(2) a").textContent)
  const clsBefore = await p.evaluate(() => window.__cls)
  await recordFrames(p, 700)
  await p.mouse.click(spot.x, spot.y)
  await sleep(800)
  const opening = barOnFirstFrame(await readFrames(p))
  const clsOpen = (await p.evaluate(() => window.__cls)) - clsBefore
  console.log(`  ..    click to bar drawn: ${opening.ms}ms, ${opening.framesBefore} frames before it; bar opacity on that frame ${opening.opacity}; cards fully in at ${opening.bodyFullAt}ms; bar sizes seen ${JSON.stringify(opening.sizes)}; layout shift ${clsOpen.toFixed(4)}`)
  expect(opening.ms !== null && opening.framesBefore === 0 && opening.opacity === 1, "the order's bar is drawn, whole, on the first frame after the click", opening)
  expect(opening.sizes.length === 1, "and at one size and place on every frame", opening.sizes)
  expect(opening.fadeMs !== null && opening.fadeMs <= 160, "the cards under it are in after a very short fade", opening.fadeMs)
  expect(clsOpen < 0.001, "opening an order shifts nothing", clsOpen)

  const opened = await p.evaluate(() => {
    const d = document.querySelector(".orders-detail")
    const bar = d.querySelector("[data-orders-bar]")
    const br = bar.getBoundingClientRect()
    return {
      title: d.querySelector("h1")?.textContent,
      url: location.search,
      transform: getComputedStyle(d).transform,
      listHidden: getComputedStyle(document.querySelector(".orders-pane")).visibility,
      listInert: document.querySelector(".orders-pane").inert,
      listStillThere: document.querySelectorAll(".orders-scroller tbody tr").length,
      timeline: d.querySelectorAll("ol li").length,
      barText: bar.textContent,
      bar: { left: br.left, top: br.top, width: br.width, bottom: br.bottom, bg: getComputedStyle(bar).backgroundColor, shadow: getComputedStyle(bar).boxShadow, scrolled: bar.dataset.scrolled },
      pane: { left: d.getBoundingClientRect().left, top: d.getBoundingClientRect().top, width: d.clientWidth },
      source: [...d.querySelectorAll("dt")].find((t) => t.textContent === "Source")?.nextElementSibling?.textContent,
    }
  })
  expect(opened.title === wanted, "the clicked order opens", `${opened.title} vs ${wanted}`)
  expect(/[?&]order=/.test(opened.url), "its address is in the URL", opened.url)
  expect(opened.transform === "none", "nothing slides", opened.transform)
  expect(opened.listHidden === "hidden" && opened.listInert === true && opened.listStillThere === 50, "the list is covered, still mounted, and out of the tab order", { hidden: opened.listHidden, inert: opened.listInert, rows: opened.listStillThere })
  expect(near(opened.bar.left, opened.pane.left) && near(opened.bar.width, opened.pane.width, 1) && near(opened.bar.top, opened.pane.top), "the bar spans the pane, edge to edge, at its top", { bar: opened.bar, pane: opened.pane })
  expect(/ at \d{1,2}:\d\d (am|pm) from (Website|Storelib)$/.test(opened.barText), "the date is a line of the bar itself", opened.barText)
  expect(opened.bar.bg === "rgb(248, 249, 250)", "with the page's own background, covering what scrolls under it", opened.bar.bg)
  expect(opened.bar.scrolled === "false" && /rgba\(17, 24, 39, 0\)/.test(opened.bar.shadow), "flat while nothing is under it", opened.bar.shadow)
  expect(/^(Website|Storelib) · /.test(opened.source || ""), "Order details names the source and where it began", opened.source)
  expect(opened.timeline >= 4, "a timeline with the order's events", opened.timeline)

  const cards = await cardsOf(p)
  const by = Object.fromEntries(cards.map((c) => [c.name, c]))
  const main = [by.Items, by.Payment, by.Timeline]
  const side = [by.Customer, by["Order details"]]
  const mainW = main[0].width
  const sideW = side[0].width
  console.log(`  ..    cards: ${cards.map((c) => `${c.name} ${c.left},${c.top} ${c.width}w`).join(" | ")}`)
  expect(main.every((c) => c.left === main[0].left && c.width === mainW) && side.every((c) => c.left === side[0].left && c.width === sideW) && side[0].left > main[0].left, "two columns: items, payment and timeline; customer and details beside them", { mainW, sideW })
  expect(Math.abs(mainW / (mainW + sideW) - 2 / 3) < 0.02, "the main column is two thirds", (mainW / (mainW + sideW)).toFixed(3))
  expect(main[0].top === side[0].top && main[0].top >= Math.round(opened.bar.bottom), "both columns start together, under the bar", { main: main[0].top, side: side[0].top, bar: opened.bar.bottom })
  const gaps = [main[1].top - main[0].bottom, main[2].top - main[1].bottom, side[1].top - side[0].bottom]
  expect(gaps.every((g) => g === 16), "one under the other with equal gaps", gaps)
  await p.screenshot({ path: join(shots, "desktop-order.png") })

  /* Scrolled: the cards go under the bar, which takes its depth. */
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 260 })
  await sleep(250)
  const scrolled = await p.evaluate(() => { const b = document.querySelector(".orders-detail [data-orders-bar]"); return { scrolled: b.dataset.scrolled, shadow: getComputedStyle(b).boxShadow, top: b.getBoundingClientRect().top } })
  expect(scrolled.scrolled === "true" && /rgba\(17, 24, 39, 0\.07\)/.test(scrolled.shadow) && near(scrolled.top, opened.pane.top), "scrolled, the bar stays and takes a hairline and a soft shadow", scrolled)
  await p.screenshot({ path: join(shots, "desktop-order-scrolled.png") })
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 0 })
  await sleep(100)

  /* The dialogs from More actions: one at a time, in the middle. */
  await p.click("button[aria-label='More actions']")
  await sleep(250)
  const menuItems = await p.$$eval("[role=menuitem]", (els) => els.map((e) => e.textContent.trim()))
  expect(menuItems.includes("Change customer email"), "More actions lists the order's actions", menuItems)
  await p.evaluate(() => [...document.querySelectorAll("[role=menuitem]")].find((e) => /Change customer email/.test(e.textContent)).click())
  await sleep(450)
  const dialog = await p.evaluate(() => {
    const shown = [...document.querySelectorAll("[role=dialog]")].filter((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && getComputedStyle(d).visibility !== "hidden" })
    const r = shown[0]?.getBoundingClientRect()
    return { count: shown.length, menus: document.querySelectorAll("[role=menu]").length, cx: r ? r.left + r.width / 2 : null, cy: r ? r.top + r.height / 2 : null, title: shown[0]?.querySelector("h2")?.textContent }
  })
  expect(dialog.count === 1 && dialog.menus === 0 && dialog.title === "Change customer email", "one dialog, the menu gone", dialog)
  expect(near(dialog.cx, 640, 1) && near(dialog.cy, 430, 2), "in the middle of the window", { cx: dialog.cx, cy: dialog.cy })
  await p.screenshot({ path: join(shots, "desktop-dialog.png") })
  await p.keyboard.press("Escape")
  await sleep(350)
  const closedDialog = await p.evaluate(() => document.querySelectorAll("[role=dialog]").length)
  expect(closedDialog === 0, "and Escape closes it", closedDialog)

  /* Back: the next frame is the list, where it was. */
  await recordFrames(p, 400)
  await p.click("button[aria-label='Back to orders']")
  await sleep(500)
  const back = await readFrames(p)
  const shownAt = back.frames.find((f) => back.clickAt !== null && f.t >= back.clickAt && f.listShown)
  const after = await p.evaluate(() => ({
    top: document.querySelector(".orders-pane").scrollTop,
    url: location.search,
    detail: !!document.querySelector(".orders-detail"),
    ticked: document.querySelectorAll(".orders-scroller tbody input:checked").length,
  }))
  const backMs = shownAt ? Math.round(shownAt.t - back.clickAt) : null
  console.log(`  ..    back to the list drawn: ${backMs}ms after the click, ${back.frames.filter((f) => f.t >= back.clickAt && !f.listShown).length} frames without it; skeletons seen ${Math.max(0, ...back.frames.map((f) => f.skeleton))}`)
  expect(!after.detail && shownAt && back.frames.filter((f) => f.t >= back.clickAt && !f.listShown).length === 0, "back shows the list on the next frame", backMs)
  expect(Math.max(0, ...back.frames.map((f) => f.skeleton)) === 0, "with no skeleton", back.frames.length)
  expect(after.top === before.top && before.top > 0, "and the list is exactly as far down as it was", `${after.top} vs ${before.top}`)
  expect(after.ticked === 1, "with the same row still ticked", after.ticked)
  expect(after.url === before.url, "and the same address", `${after.url} vs ${before.url}`)
  await p.close()
}

/* ── A link straight to an order ─────────────────────────────────────────
   There is no outline of an order any more: a slow one waits on the shell's
   spinner (components/app/app-stage.tsx, scripts/check-app-stage.mjs). */
console.log("\na link straight to an order")
for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]) {
  const p = await open(viewport, `/app/orders?order=ord-0005`)
  await sleep(200)
  const real = await p.evaluate(() => ({ stage: document.querySelector(".orders-stage").className }))
  await p.close()
  expect(!/app-page-enter/.test(real.stage), `${viewport.width} wide: an order opened by its link does not fade in as a whole`, real.stage)
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
     the screen towards the left. Touch events, not a synthesized gesture: in
     headless Chromium a synthesized touch gesture scrolls nothing at all. */
  const rect = await p.evaluate(() => {
    const r = document.querySelector(".orders-scroller tbody tr:nth-child(4)").getBoundingClientRect()
    return { x: 330, y: r.top + r.height / 2 }
  })
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

  /* Open an order from the swiped table: its bar on the first frame. */
  const before = await geo()
  await recordFrames(p, 700)
  await p.tap(".orders-scroller tbody tr:nth-child(4) td:nth-child(2) a")
  await sleep(800)
  const opening = barOnFirstFrame(await readFrames(p))
  console.log(`  ..    tap to bar drawn: ${opening.ms}ms, ${opening.framesBefore} frames before it; bar opacity on that frame ${opening.opacity}; cards fully in at ${opening.bodyFullAt}ms; bar sizes seen ${JSON.stringify(opening.sizes)}`)
  expect(opening.ms !== null && opening.framesBefore === 0 && opening.opacity === 1 && opening.sizes.length === 1, "on a phone too the bar is there, whole and still, on the first frame", opening)
  const phoneCards = await cardsOf(p)
  const order = [...phoneCards].sort((a, b) => a.top - b.top).map((c) => c.name)
  expect(order.join(",") === "Items,Payment,Customer,Order details,Timeline", "one column: items, payment, customer, details, then the timeline", order)
  expect(phoneCards.every((c) => c.width === phoneCards[0].width && c.left === phoneCards[0].left), "all the same width", phoneCards.map((c) => c.width))
  const detailWidth = await p.evaluate(() => document.querySelector(".orders-detail").scrollWidth)
  expect(detailWidth <= 390, "the order fits the phone's width", detailWidth)
  const barH = await p.evaluate(() => document.querySelector(".orders-detail [data-orders-bar]").getBoundingClientRect().height)
  console.log(`  ..    the phone's bar is ${barH}px tall`)
  await p.screenshot({ path: join(shots, "phone-order.png") })
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 600 })
  await sleep(150)
  await p.screenshot({ path: join(shots, "phone-order-scrolled.png") })
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 0 })
  await sleep(100)

  /* More actions, then Change customer email: the menu's sheet leaves
     before the email's sheet rises. Every frame, where each sheet's top is. */
  await p.tap("button[aria-label='More actions']")
  await sleep(700)
  await p.evaluate(() => {
    window.__sheets = []
    const t0 = performance.now()
    const tick = () => {
      /* Both are the shared sheet now: the menu is the one holding the action list. */
      const panels = [...document.querySelectorAll("[data-sheet-panel]")]
      const menu = panels.find((el) => el.querySelector("[data-action-sheet]")) ?? null
      const sheet = panels.find((el) => el !== menu) ?? null
      const vis = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return getComputedStyle(el).visibility === "hidden" ? null : Math.round(r.top) }
      window.__sheets.push({ t: Math.round(performance.now() - t0), menu: vis(menu), sheet: vis(sheet) })
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await p.evaluate(() => [...document.querySelectorAll("[data-action-sheet] button")].find((b) => /Change customer email/.test(b.textContent)).click())
  await sleep(1500)
  const frames = await p.evaluate(() => window.__sheets)
  const H = 844
  const both = frames.filter((f) => f.menu !== null && f.menu < H - 1 && f.sheet !== null && f.sheet < H - 1)
  const rose = frames.find((f) => f.sheet !== null && f.sheet < H - 1)
  const menuGone = frames.find((f, i) => i > 0 && frames[i - 1].menu !== null && frames[i - 1].menu < H - 1 && (f.menu === null || f.menu >= H - 1))
  const settled = frames.at(-1)
  console.log(`  ..    after the tap on the row: the menu's sheet is off screen at ${menuGone?.t}ms, the email sheet starts rising at ${rose?.t}ms; frames with both sheets on screen: ${both.length}`)
  expect(both.length === 0 && rose && settled.sheet !== null && settled.sheet < H / 2 + 200, "one sheet at a time: the menu's leaves, then the email's rises and stays", { both: both.slice(0, 3), rose, settled })
  const sheet = await p.evaluate(() => ({ title: document.querySelector("[data-sheet-panel]")?.textContent?.slice(0, 40), dialogs: document.querySelectorAll("[role=dialog][data-slot=dialog-content]").length }))
  expect(/^Change customer email/.test(sheet.title || "") && sheet.dialogs === 0, "on a phone it is the shared sheet, not a centred dialog", sheet)
  await p.screenshot({ path: join(shots, "phone-email-sheet.png") })
  await p.evaluate(() => [...document.querySelectorAll("[data-sheet-panel] button")].find((b) => b.textContent === "Cancel").click())
  await sleep(600)

  await p.tap("button[aria-label='Back to orders']")
  await sleep(300)
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
