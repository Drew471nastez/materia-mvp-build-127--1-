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
 *   an order opens over the list, on the      every frame from the tap: where
 *     first frame after the tap: slid in       the order's layer is and how
 *     from the right on a phone, its cards     opaque, where the list under it
 *     faded in on a computer, the list drawn   is and whether it is drawn,
 *     it until it rests, never a blank         columns covered by neither, how
 *     frame, the timeline already whole        long until it rests, timeline
 *                                              rows on the first and last frame
 *   a finger on a row, or a pointer resting   the requests the stand-in server
 *     on one, reads the order's history        saw before the tap lifted
 *   the bar spans the pane, carries the       its rect against the pane's,
 *     date, and has depth only once           its text, data-scrolled and
 *     something is under it                   its shadow at 0 and scrolled
 *   the cards sit as Shopify's do             column tops, widths, gaps; on a
 *                                              phone one column, in order
 *   back returns to exactly where it was      every frame: the list drawn, its
 *     with the order sliding or fading off     scrollTop, the order's layer; then
 *     it, and the row it came from tinted      sideways scroll, ticked rows, the
 *     for a moment                             address, no skeleton, the tint
 *   a step to the next order fades only       the layer's place and opacity,
 *     its cards                                the cards' opacity
 *   one dialog at a time                      a centred dialog on a laptop;
 *                                              on a phone the menu's sheet is
 *                                              gone before the refund's rises
 *   a link straight to an order               the page does not fade in as a
 *                                              whole
 *   Export: a panel hung from the button on   its rect against the button's, on
 *     a computer; the shared sheet on a        a phone every frame of its rise
 *     phone, anchored to the bottom, rising    and fall, its rows and button,
 *     once, filled on its first frame; the     the file written and the notice
 *     file is made and the page says so
 *
 * and writes screenshots of each state, desktop and phone, and two frames
 * held half way through a move, to look at (prefixed orders-).
 *
 *   node scripts/check-orders-page.mjs                    (built CSS, or the source's)
 *   PROBE_CSS=source node scripts/check-orders-page.mjs
 *   CSS_URL=http://localhost:3000/login node scripts/check-orders-page.mjs   (a dev server's CSS instead)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createRequire } from "node:module"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

async function stylesheet() {
  const base = process.env.CSS_URL
  /* Inter from a build when there is one, so text is measured in the face that ships. */
  if (!base) return (await appCss(root)) + "\n" + interFaces(root)
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

/* The two things an order's timeline reads, answered a little late, as a
   real network would, and logged so a prefetch can be seen to have asked. */
const served = []
const API_DELAY_MS = 150
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (req.url.startsWith("/api/")) {
    served.push({ url: req.url, at: Date.now() })
    const body = req.url.includes("/activity")
      ? { activity: [{ id: "act-1", type: "receipt_resent", at: new Date(NOW - 40 * 60_000).toISOString(), by: "creator", failed: false }] }
      : req.url.includes("order-timeline")
        ? { timeline: [{ id: "funds_available", label: "Available soon", timestamp: new Date(NOW + 3 * 86_400_000).toISOString(), status: "pending" }] }
        : {}
    return setTimeout(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }, API_DELAY_MS)
  }
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

/*
  Every frame from now until `ms` later: where the order's layer is and how
  opaque, its bar relative to it, whether the list is drawn and where, how
  far down it is, how many timeline rows the order has, and whether a row of
  the list is tinted. A frame is BLANK where some column of the stage is
  covered neither by a drawn list nor by a fully opaque order.
*/
async function recordFrames(p, ms) {
  await p.evaluate((ms) => {
    window.__frames = []
    window.__clickAt = null
    const onClick = () => { if (window.__clickAt === null) window.__clickAt = performance.now() }
    document.addEventListener("click", onClick, { capture: true, once: true })
    document.addEventListener("touchend", onClick, { capture: true, once: true })
    const t0 = performance.now()
    const opacityOf = (el) => { let o = 1; for (let n = el; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o }
    const tick = () => {
      const stage = document.querySelector(".orders-stage").getBoundingClientRect()
      const detail = document.querySelector(".orders-detail")
      const bar = detail?.querySelector("[data-orders-bar]")
      const body = detail?.querySelector(".orders-body")
      const list = document.querySelector(".orders-list")
      const lr = list.getBoundingClientRect()
      const dr = detail?.getBoundingClientRect()
      const r = bar?.getBoundingClientRect()
      const listShown = getComputedStyle(list).visibility !== "hidden"
      const dOpacity = detail ? opacityOf(detail) : 0
      const spans = []
      if (listShown) spans.push([Math.max(stage.left, lr.left), Math.min(stage.right, lr.right)])
      if (detail && dOpacity >= 0.999) spans.push([Math.max(stage.left, dr.left), Math.min(stage.right, dr.right)])
      spans.sort((a, b) => a[0] - b[0])
      let covered = 0
      let reach = stage.left
      for (const [a, b] of spans) {
        if (b <= reach) continue
        covered += b - Math.max(a, reach)
        reach = b
      }
      window.__frames.push({
        t: performance.now(),
        detail: dr ? { left: dr.left, opacity: dOpacity, leaving: detail.hasAttribute("data-leaving") } : null,
        bar: r ? { top: r.top, left: r.left, dx: r.left - dr.left, width: r.width, height: r.height, opacity: opacityOf(bar) } : null,
        body: body ? opacityOf(body) : null,
        /* What is in the list, as drawn: back on a computer settles it in (the list itself, the scroller, holds still). */
        listFade: Math.min(1, ...[...list.children].filter((c) => c.getClientRects().length).map(opacityOf)),
        listShown,
        listLeft: lr.left,
        listTop: list.scrollTop,
        blank: Math.max(0, Math.round(stage.width - covered)),
        timeline: detail ? detail.querySelectorAll("ol li").length : 0,
        picked: document.querySelector(".orders-list tr[data-picked]")?.dataset.picked ?? null,
        skeleton: document.querySelectorAll(".skeleton-late").length,
      })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
}
const readFrames = (p) => p.evaluate(() => ({ frames: window.__frames, clickAt: window.__clickAt }))

/* An order coming in: when its layer first shows, how, and how long until it rests. */
function arrival({ frames, clickAt }) {
  const after = frames.filter((f) => clickAt !== null && f.t >= clickAt)
  const first = after.find((f) => f.detail)
  const shown = after.filter((f) => f.detail)
  const rest = shown.find((f) => Math.abs(f.detail.left) < 0.5 && f.detail.opacity >= 0.999)
  const lefts = shown.map((f) => f.detail.left)
  const opacities = shown.map((f) => f.detail.opacity)
  return {
    ms: first ? Math.round(first.t - clickAt) : null,
    framesBefore: first ? after.indexOf(first) : null,
    firstLeft: first ? Math.round(first.detail.left) : null,
    firstOpacity: first ? Number(first.detail.opacity.toFixed(3)) : null,
    restMs: rest && first ? Math.round(rest.t - first.t) : null,
    frames: shown.length,
    monotonic: lefts.every((l, i) => i === 0 || l <= lefts[i - 1] + 0.5) && opacities.every((o, i) => i === 0 || o >= opacities[i - 1] - 0.001),
    barOffsets: [...new Set(after.filter((f) => f.bar).map((f) => `${f.bar.dx.toFixed(1)},${f.bar.width.toFixed(1)}x${f.bar.height.toFixed(1)}`))],
    barPlaces: [...new Set(after.filter((f) => f.bar).map((f) => `${f.bar.left.toFixed(1)},${f.bar.top.toFixed(1)}`))],
    listDuring: shown.filter((f) => rest ? f.t < rest.t : true).every((f) => f.listShown),
    listLeftMin: Math.round(Math.min(...after.map((f) => f.listLeft))),
    listAfter: after.at(-1)?.listShown,
    blank: Math.max(0, ...after.map((f) => f.blank)),
    blankFrames: after.filter((f) => f.blank > 0).length,
    layerMin: shown.length ? Math.min(...shown.map((f) => f.detail.opacity)) : null,
    bodyFirst: first?.body ?? null,
    bodyRestMs: (() => { const r = shown.find((f) => (f.body ?? 1) >= 0.999); return r && first ? Math.round(r.t - first.t) : null })(),
    bodyMonotonic: shown.every((f, i) => i === 0 || (f.body ?? 1) >= (shown[i - 1].body ?? 1) - 0.001),
    timelineFirst: first?.timeline ?? null,
    timelineLast: after.at(-1)?.timeline ?? null,
    picked: [...new Set(after.map((f) => f.picked))],
  }
}

/* An order going back to the list: every frame, the list drawn; the order off and gone. */
function departure({ frames, clickAt }) {
  const after = frames.filter((f) => clickAt !== null && f.t >= clickAt)
  const firstMove = after.find((f) => f.detail && (f.detail.left > 0.5 || f.detail.opacity < 0.999))
  const gone = after.find((f) => !f.detail)
  const lefts = after.filter((f) => f.detail).map((f) => f.detail.left)
  const opacities = after.filter((f) => f.detail).map((f) => f.detail.opacity)
  return {
    startMs: firstMove ? Math.round(firstMove.t - clickAt) : null,
    goneMs: gone ? Math.round(gone.t - clickAt) : null,
    moveMs: gone && firstMove ? Math.round(gone.t - firstMove.t) : null,
    framesWithoutList: after.filter((f) => !f.listShown).length,
    blank: Math.max(0, ...after.map((f) => f.blank)),
    monotonic: lefts.every((l, i) => i === 0 || l >= lefts[i - 1] - 0.5) && opacities.every((o, i) => i === 0 || o <= opacities[i - 1] + 0.001),
    leavingInert: after.filter((f) => f.detail && f.detail.leaving).length,
    listLeftFirst: after[0] ? Math.round(after[0].listLeft) : null,
    listLeftLast: after.at(-1) ? Math.round(after.at(-1).listLeft) : null,
    scrollTops: [...new Set(after.map((f) => f.listTop))],
    picked: [...new Set(after.map((f) => f.picked))],
    skeleton: Math.max(0, ...after.map((f) => f.skeleton)),
    /* On a computer: the order at rest on every frame it is there, and the list's settling in once it is gone. */
    layerStill: after.filter((f) => f.detail).every((f) => f.detail.opacity >= 0.999 && Math.abs(f.detail.left) < 0.5),
    listUncovered: after.filter((f) => !f.listShown && !(f.detail && f.detail.opacity >= 0.999 && Math.abs(f.detail.left) < 0.5)).length,
    ...settling(after, gone),
  }
}

/* The list on a computer after Back: once it settled in from about half; now it is whole from the first frame. */
function settling(after, gone) {
  const from = gone ? after.filter((f) => f.t >= gone.t) : []
  const fades = from.map((f) => f.listFade)
  const whole = from.find((f) => f.listFade >= 0.999)
  return {
    listFadeFirst: fades.length ? Number(fades[0].toFixed(3)) : null,
    listFadeMs: whole && gone ? Math.round(whole.t - gone.t) : null,
    listFadeMonotonic: fades.every((o, i) => i === 0 || o >= fades[i - 1] - 0.001),
    listFadeMin: fades.length ? Number(Math.min(...fades).toFixed(3)) : null,
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

/**
 * THE TIMELINE'S PANEL. "In a container: a gray background with depth,
 * rounded corners, with dots behind, and the text should look great." What
 * that is in numbers: the panel's radius, fill, dot layer and inset shade;
 * the nodes white on it; the title, detail, time and day sizes; the times
 * in tabular figures against the right edge; nothing wider than the panel.
 */
const timelineLook = (p) => p.evaluate(() => {
  const s = document.querySelector(".orders-detail [data-order-timeline]")
  const panel = s?.querySelector("[data-timeline-panel]")
  if (!panel) return null
  const cs = getComputedStyle(panel)
  const pr = panel.getBoundingClientRect()
  const events = [...panel.querySelectorAll("[data-timeline-event]")]
  const font = (el) => el ? { size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight, color: getComputedStyle(el).color, nums: getComputedStyle(el).fontVariantNumeric } : null
  const e = events[0]
  const node = e?.querySelector("span[aria-hidden].rounded-full")
  const times = events.map((ev) => ev.querySelector("button")).filter(Boolean)
  const padR = parseFloat(cs.paddingRight)
  return {
    radius: cs.borderRadius, bg: cs.backgroundColor, image: cs.backgroundImage, size: cs.backgroundSize, shadow: cs.boxShadow,
    width: Math.round(pr.width), scrollW: panel.scrollWidth, clientW: panel.clientWidth,
    events: events.length, days: panel.querySelectorAll("[data-timeline-day]").length,
    title: font(e?.querySelector("p")), detail: font(panel.querySelector("[data-timeline-event] p + p")),
    day: font(panel.querySelector("[data-timeline-day] p")), time: font(times[0]),
    node: node ? { w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height, bg: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopWidth } : null,
    timesRight: times.map((t) => Math.round(pr.right - padR - t.getBoundingClientRect().right)),
    heading: s.querySelector("h2")?.getBoundingClientRect().bottom <= pr.top,
    overflowing: [...panel.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > pr.right + 0.5).length,
  }
})
const expectTimeline = (t, where) => {
  console.log(`  ..    timeline panel ${where}: ${t?.width}px wide, radius ${t?.radius}, ${t?.bg}, ${t?.events} events under ${t?.days} days; title ${t?.title?.size}/${t?.title?.weight}, detail ${t?.detail?.size}, time ${t?.time?.size} ${t?.time?.nums}, day ${t?.day?.size}; times from the right edge ${JSON.stringify(t?.timesRight)}`)
  expect(t && t.radius === "14px" && t.bg === "rgb(243, 244, 246)", `${where}: the timeline sits in a grey panel with 14px corners`, t && { radius: t.radius, bg: t.bg })
  expect(t && /radial-gradient/.test(t.image) && t.size === "12px 12px", "  with a dot grid behind, CSS only, on 12px", t && { image: t.image, size: t.size })
  expect(t && /inset/.test(t.shadow) && (t.shadow.match(/inset/g) || []).length === 2, "  pressed in: an inset hairline and an inset shade", t?.shadow)
  expect(t && t.heading, "  its heading above it, on the page, not inside it", t?.heading)
  expect(t && t.node && t.node.w === 22 && t.node.bg === "rgb(255, 255, 255)" && t.node.border === "1px", "  each event a white 22px node with a hairline", t?.node)
  expect(t && t.title?.size === "13px" && t.title.weight === "600" && t.title.color === "rgb(26, 26, 46)", "  titles 13px semibold in the heading colour", t?.title)
  expect(t && t.detail?.size === "12px" && t.detail.color === "rgb(107, 114, 128)" && t.day?.size === "12px", "  details and day headers 12px, muted", { detail: t?.detail, day: t?.day })
  expect(t && t.time?.nums === "tabular-nums" && t.timesRight.every((r) => Math.abs(r + 4) <= 1), "  times in tabular figures, against the right edge", t && { nums: t.time?.nums, right: t.timesRight })
  expect(t && t.scrollW <= t.clientW && t.overflowing === 0, "  and nothing wider than the panel", t && { scrollW: t.scrollW, clientW: t.clientW, overflowing: t.overflowing })
}
const shootTimeline = async (p, file) => {
  const el = await p.$(".orders-detail [data-order-timeline]")
  if (el) {
    await el.evaluate((n) => n.scrollIntoView({ block: "center" }))
    await sleep(120)
    await el.screenshot({ path: join(shots, file) })
  }
}

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
  await p.screenshot({ path: join(shots, "orders-desktop-list.png") })

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
  /* The pointer rests on the row first, as a hand does before it clicks:
     the order's history is asked for then, not after it opens. */
  const servedBefore = served.length
  await p.mouse.move(spot.x, spot.y)
  await sleep(API_DELAY_MS + 250)
  const hoverAsked = served.slice(servedBefore).map((s) => s.url)
  await recordFrames(p, 700)
  await p.mouse.click(spot.x, spot.y)
  await sleep(800)
  const openFrames = await readFrames(p)
  if (process.env.DUMP) console.log(JSON.stringify(openFrames.frames.filter((f) => f.t >= openFrames.clickAt).map((f) => [Math.round(f.t - openFrames.clickAt), f.detail && Number(f.detail.opacity.toFixed(3))])))
  const opening = arrival(openFrames)
  const clsOpen = (await p.evaluate(() => window.__cls)) - clsBefore
  console.log(`  ..    click to the order's first frame: ${opening.ms}ms, ${opening.framesBefore} frames before it, at opacity ${opening.firstOpacity}; at rest ${opening.restMs}ms later over ${opening.frames} frames; list drawn under it until then: ${opening.listDuring}, after: ${opening.listAfter}; blank frames ${opening.blankFrames} (max ${opening.blank}px); timeline rows first/last ${opening.timelineFirst}/${opening.timelineLast}; bar places ${JSON.stringify(opening.barPlaces)}; layout shift ${clsOpen.toFixed(4)}`)
  expect(hoverAsked.some((u) => u.includes("/activity")) && hoverAsked.some((u) => u.includes("order-timeline")), "a pointer resting on a row asks for that order's history ahead", hoverAsked)
  expect(opening.ms !== null && opening.framesBefore === 0, "the order is on the first frame after the click", opening.ms)
  /* Since c69b54d3 ("a solid order bar") the layer is not faded on a
     computer: the bar is there, whole, on the first frame and only the
     cards (.orders-body) fade in, so the two bars are never drawn through
     each other. What fades is measured now, not the layer. */
  expect(opening.layerMin >= 0.999 && opening.bodyFirst !== null && opening.bodyFirst < 0.5 && opening.bodyRestMs !== null && opening.bodyRestMs >= 90 && opening.bodyRestMs <= 220 && opening.bodyMonotonic, "on a computer the order and its bar are whole on the first frame; only its cards fade in, quickly and only one way", { layer: opening.layerMin, cards: opening.bodyFirst, restMs: opening.bodyRestMs })
  expect(opening.barPlaces.length === 1, "its bar never moves while it does", opening.barPlaces)
  expect(opening.listAfter === false, "the list is not drawn under the settled order", { after: opening.listAfter })
  expect(opening.blankFrames === 0, "no frame shows neither the list nor the order", opening.blank)
  expect(opening.timelineFirst === opening.timelineLast && opening.timelineFirst >= 5, "the timeline is whole on the first frame, the history already read", `${opening.timelineFirst}/${opening.timelineLast}`)
  expect(opening.picked.includes("held"), "the row it came from is tinted under it", opening.picked)
  expect(clsOpen < 0.001, "opening an order shifts nothing", clsOpen)

  const opened = await p.evaluate(() => {
    const d = document.querySelector(".orders-detail")
    const bar = d.querySelector("[data-orders-bar]")
    const br = bar.getBoundingClientRect()
    return {
      title: d.querySelector("h1")?.textContent,
      url: location.search,
      transform: getComputedStyle(d).transform,
      opacity: getComputedStyle(d).opacity,
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
  expect(opened.transform === "none" && opened.opacity === "1", "at rest, nothing is left moved or faded", { transform: opened.transform, opacity: opened.opacity })
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
  await p.screenshot({ path: join(shots, "orders-desktop-order.png") })
  expectTimeline(await timelineLook(p), "at 1280")
  await shootTimeline(p, "orders-desktop-timeline.png")
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 0 })
  await sleep(100)

  /* Scrolled: the cards go under the bar, which takes its depth. */
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 260 })
  await sleep(250)
  const scrolled = await p.evaluate(() => { const b = document.querySelector(".orders-detail [data-orders-bar]"); return { scrolled: b.dataset.scrolled, shadow: getComputedStyle(b).boxShadow, top: b.getBoundingClientRect().top } })
  expect(scrolled.scrolled === "true" && /rgba\(17, 24, 39, 0\.07\)/.test(scrolled.shadow) && near(scrolled.top, opened.pane.top), "scrolled, the bar stays and takes a hairline and a soft shadow", scrolled)
  await p.screenshot({ path: join(shots, "orders-desktop-order-scrolled.png") })
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
  await p.screenshot({ path: join(shots, "orders-desktop-dialog.png") })
  await p.keyboard.press("Escape")
  await sleep(350)
  const closedDialog = await p.evaluate(() => document.querySelectorAll("[role=dialog]").length)
  expect(closedDialog === 0, "and Escape closes it", closedDialog)

  /* A step to the next order: the bar stays, only the cards fade. */
  await recordFrames(p, 300)
  await p.click("button[aria-label='Next order']")
  await sleep(400)
  const step = await readFrames(p)
  const stepFrames = step.frames.filter((f) => step.clickAt !== null && f.t >= step.clickAt && f.detail)
  const stepBody = stepFrames.map((f) => f.body ?? 1)
  console.log(`  ..    a step: the order's layer at opacity ${Math.min(...stepFrames.map((f) => f.detail.opacity)).toFixed(3)}..1 and left ${Math.max(...stepFrames.map((f) => Math.abs(f.detail.left)))}; the cards from ${Math.min(...stepBody).toFixed(3)}`)
  expect(stepFrames.every((f) => f.detail.opacity >= 0.999 && Math.abs(f.detail.left) < 0.5) && Math.min(...stepBody) < 0.9, "a step to the next order keeps the layer still and fades only the cards", Math.min(...stepBody))
  await p.click("button[aria-label='Previous order']")
  await sleep(300)

  /* Back: the order goes at once (c69b54d3); nothing is ever blank. The list
     settled in over ORDER_LIST_BACK_MS after it (cea30d1c), from half faded
     and 2px low, and that was the "bump" the owner saw on every Back: Orders
     asks order-motion for no settle now, as Emails does, and the list is
     whole from its first frame (scripts/check-lists-back.mjs reads the rise). */
  await recordFrames(p, 500)
  await p.click("button[aria-label='Back to orders']")
  await sleep(600)
  const back = departure(await readFrames(p))
  const after = await p.evaluate(() => ({
    top: document.querySelector(".orders-list").scrollTop,
    url: location.search,
    detail: !!document.querySelector(".orders-detail"),
    ticked: document.querySelectorAll(".orders-scroller tbody input:checked").length,
    picked: document.querySelector(".orders-list tr[data-picked]")?.dataset.picked ?? null,
  }))
  console.log(`  ..    back: the order is gone at ${back.goneMs}ms, still and whole until then: ${back.layerStill}; the list from opacity ${back.listFadeFirst}, lowest ${back.listFadeMin}; frames with neither drawn ${back.listUncovered}; blank ${back.blank}px; list scrollTop on every frame ${JSON.stringify(back.scrollTops)}; row tint ${JSON.stringify(back.picked)}; skeletons ${back.skeleton}`)
  expect(!after.detail && back.listUncovered === 0 && back.blank === 0, "back draws the list on every frame the order is not over it", back.listUncovered)
  /* Was "the order fades off it" and "is marked leaving while it goes":
     since c69b54d3 back on a computer takes the order away at once, so it
     is never drawn faded, moved or leaving. */
  expect(back.layerStill && back.leavingInert === 0 && back.goneMs !== null && back.goneMs <= 300, "and the order goes at once, never faded, moved or drawn leaving", { gone: back.goneMs, still: back.layerStill, leaving: back.leavingInert })
  expect(back.listFadeFirst === 1 && back.listFadeMin === 1, "and the list is there whole from its first frame: nothing in it fades in", { first: back.listFadeFirst, min: back.listFadeMin })
  expect(back.skeleton === 0, "with no skeleton", back.skeleton)
  expect(after.top === before.top && before.top > 0 && back.scrollTops.length === 1 && back.scrollTops[0] === before.top, "and the list is exactly as far down as it was, on every frame", `${after.top} vs ${before.top}`)
  expect(back.picked.includes("fading"), "the row the order came from is tinted, then fades", back.picked)
  expect(after.ticked === 1, "with the same row still ticked", after.ticked)
  expect(after.url === before.url, "and the same address", `${after.url} vs ${before.url}`)
  await sleep(1000)
  const cleared = await p.evaluate(() => document.querySelectorAll(".orders-list tr[data-picked]").length)
  expect(cleared === 0, "and the tint is gone a moment later", cleared)
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
  await p.screenshot({ path: join(shots, "orders-phone-list.png") })

  const geo = () => p.evaluate(() => {
    const s = document.querySelector(".orders-scroller")
    const row = s.querySelector("tbody tr:nth-child(4)")
    const pane = document.querySelector(".orders-pane")
    /* The shared frame around the scroller (components/app/scroll-edge.tsx). */
    const frame = s.closest("[data-scroll-edge-frame]")
    return {
      scrollLeft: s.scrollLeft,
      overflow: frame.dataset.end,
      scrolled: frame.dataset.start,
      box: row.children[0].getBoundingClientRect().left,
      order: row.children[1].getBoundingClientRect().left,
      date: row.children[2].getBoundingClientRect().left,
      paneTop: pane.scrollTop,
      edge: Number(getComputedStyle(frame, "::before").opacity),
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
  expect(g1.scrolled === "true" && g1.edge === 1, "and a shadow marks the edge", g1.edge)
  expect(!(await p.$(".orders-detail")), "a swipe is a swipe, not a tap on the row")
  await p.screenshot({ path: join(shots, "orders-phone-list-swiped.png") })

  /* Open an order from the swiped table, as a thumb does: down on the row
     for a moment, then up. It slides in from the right over the list. */
  const before = await geo()
  const link = await p.evaluate(() => { const r = document.querySelector(".orders-scroller tbody tr:nth-child(4) td:nth-child(2) a").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await recordFrames(p, 900)
  await p.touchscreen.touchStart(link.x, link.y)
  await sleep(API_DELAY_MS + 60)
  const liftedAt = Date.now()
  await p.touchscreen.touchEnd()
  await sleep(900)
  const tappedId = await p.evaluate(() => new URLSearchParams(location.search).get("order"))
  /* Asked for while the finger was down, on this tap or on the swipe across the same row before it. */
  const touchAsked = served.filter((s) => s.at <= liftedAt && s.url.includes(`/orders/${tappedId}/activity`)).map((s) => s.url)
  const phoneOpen = await readFrames(p)
  if (process.env.DUMP) console.log(JSON.stringify(phoneOpen.frames.filter((f) => f.t >= phoneOpen.clickAt).map((f) => [Math.round(f.t - phoneOpen.clickAt), f.detail && Math.round(f.detail.left), Math.round(f.listLeft)])))
  const opening = arrival(phoneOpen)
  console.log(`  ..    tap to the order's first frame: ${opening.ms}ms, ${opening.framesBefore} frames before it, its left edge at ${opening.firstLeft}px of 390; at rest ${opening.restMs}ms later over ${opening.frames} frames; the list under it moved to ${opening.listLeftMin}px and was drawn until then: ${opening.listDuring}, after: ${opening.listAfter}; blank frames ${opening.blankFrames} (max ${opening.blank}px); bar offsets in the layer ${JSON.stringify(opening.barOffsets)}; timeline rows first/last ${opening.timelineFirst}/${opening.timelineLast}`)
  expect(touchAsked.some((u) => u.includes("/activity")), "a finger on a row asks for that order's history before it lifts", touchAsked)
  expect(opening.ms !== null && opening.framesBefore === 0, "on a phone the order is on the first frame after the tap", opening.ms)
  expect(opening.firstLeft >= 300 && opening.monotonic, "it starts at the right edge, not at rest, and only moves left", { first: opening.firstLeft, monotonic: opening.monotonic })
  expect(opening.restMs !== null && opening.restMs >= 240 && opening.restMs <= 360, "and is in place in about 300ms", opening.restMs)
  expect(opening.barOffsets.length === 1, "its bar travels with it, at one size and place inside it", opening.barOffsets)
  expect(opening.listDuring && opening.listAfter === false && opening.listLeftMin <= -110 && opening.listLeftMin >= -125, "the list stays drawn underneath, moving a third of the way left, then rests hidden", { min: opening.listLeftMin, after: opening.listAfter })
  expect(opening.blankFrames === 0, "no frame shows neither the list nor the order", opening.blank)
  expect(opening.timelineFirst === opening.timelineLast, "the timeline is whole on its first frame", `${opening.timelineFirst}/${opening.timelineLast}`)
  const phoneCards = await cardsOf(p)
  const order = [...phoneCards].sort((a, b) => a.top - b.top).map((c) => c.name)
  expect(order.join(",") === "Items,Payment,Customer,Order details,Timeline", "one column: items, payment, customer, details, then the timeline", order)
  expect(phoneCards.every((c) => c.width === phoneCards[0].width && c.left === phoneCards[0].left), "all the same width", phoneCards.map((c) => c.width))
  const detailWidth = await p.evaluate(() => document.querySelector(".orders-detail").scrollWidth)
  expect(detailWidth <= 390, "the order fits the phone's width", detailWidth)
  const barH = await p.evaluate(() => document.querySelector(".orders-detail [data-orders-bar]").getBoundingClientRect().height)
  console.log(`  ..    the phone's bar is ${barH}px tall`)
  await p.screenshot({ path: join(shots, "orders-phone-order.png") })
  expectTimeline(await timelineLook(p), "at 390")
  await shootTimeline(p, "orders-phone-timeline.png")
  await p.evaluate(() => { document.querySelector(".orders-detail").scrollTop = 600 })
  await sleep(150)
  await p.screenshot({ path: join(shots, "orders-phone-order-scrolled.png") })
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
      /* By its title: the Date range sheet is built ahead and waits in the page too (f061f52c), and it came first. */
      const sheet = panels.find((el) => el !== menu && /Change customer email/.test(el.textContent || "")) ?? null
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
  const sheet = await p.evaluate(() => {
    /* The panel on screen, not the first in the page: the Date range sheet waits there, built ahead (f061f52c). */
    const shown = [...document.querySelectorAll("[data-sheet-panel]")].find((el) => getComputedStyle(el).visibility !== "hidden" && el.getBoundingClientRect().top < innerHeight - 1)
    return { title: shown?.textContent?.slice(0, 40), dialogs: document.querySelectorAll("[role=dialog][data-slot=dialog-content]").length }
  })
  expect(/^Change customer email/.test(sheet.title || "") && sheet.dialogs === 0, "on a phone it is the shared sheet, not a centred dialog", sheet)
  await p.screenshot({ path: join(shots, "orders-phone-email-sheet.png") })
  await p.evaluate(() => [...document.querySelectorAll("[data-sheet-panel]")].find((el) => /Change customer email/.test(el.textContent || "")).querySelectorAll("button").forEach((b) => { if (b.textContent === "Cancel") b.click() }))
  await sleep(600)

  const openedId = await p.evaluate(() => new URLSearchParams(location.search).get("order"))
  await recordFrames(p, 700)
  await p.tap("button[aria-label='Back to orders']")
  await sleep(750)
  const back = departure(await readFrames(p))
  console.log(`  ..    back: the order starts to slide ${back.startMs}ms after the tap and is gone at ${back.goneMs}ms (${back.moveMs}ms of slide); the list from ${back.listLeftFirst}px to ${back.listLeftLast}px, drawn on every frame: ${back.framesWithoutList === 0}; blank ${back.blank}px; list scrollTop on every frame ${JSON.stringify(back.scrollTops)}; row tint ${JSON.stringify(back.picked)}`)
  expect(back.framesWithoutList === 0 && back.blank === 0, "back: the list is drawn under the order on every frame", back.framesWithoutList)
  expect(back.monotonic && back.moveMs !== null && back.moveMs >= 220 && back.moveMs <= 360, "the order slides off to the right in about 300ms, only one way", back.moveMs)
  expect(back.listLeftFirst <= -110 && back.listLeftLast === 0, "while the list slides back from a third of the way left", { first: back.listLeftFirst, last: back.listLeftLast })
  expect(back.scrollTops.length === 1 && Math.abs(back.scrollTops[0] - before.paneTop) < 1, "and is as far down as it was on every frame", back.scrollTops)
  const tinted = await p.evaluate(() => document.querySelector(".orders-list tr[data-picked]")?.dataset.orderId ?? null)
  expect(back.picked.includes("fading") && (tinted === null || tinted === openedId), "the row of the order it came from is tinted, then fades", { picked: back.picked, tinted, openedId })
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
  await p.screenshot({ path: join(shots, "orders-phone-search.png") })
  await p.close()
}

/* ── Mid-move, to look at ─────────────────────────────────────────────────
   Every running animation is held half way and the frame is photographed. */
console.log("\nhalf way, to look at")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await p.evaluate(() => { document.querySelector(".orders-list").scrollTop = 300 })
  await sleep(150)
  const hold = (ms) => p.evaluate((ms) => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = ms } }, ms)
  const resume = () => p.evaluate(() => { for (const a of document.getAnimations()) a.play() })
  await p.tap(".orders-scroller tbody tr:nth-child(9) td:nth-child(2) a")
  await hold(90)
  await p.screenshot({ path: join(shots, "orders-phone-push-half.png") })
  await resume()
  await sleep(600)
  await p.tap("button[aria-label='Back to orders']")
  await sleep(40)
  await hold(110)
  await p.screenshot({ path: join(shots, "orders-phone-pop-half.png") })
  await resume()
  await sleep(500)
  await p.screenshot({ path: join(shots, "orders-phone-back-tint.png") })
  await p.close()
}

/* ── Export ──────────────────────────────────────────────────────────────
   A compact panel under the button on a computer; the shared sheet on a
   phone, anchored to the bottom, rising once and going down once. Either
   way the file is made and the page says so. */
console.log("\nexport, 1280 wide")
{
  const p = await open({ width: 1280, height: 860 })
  await p.click("[data-orders-export]")
  await sleep(350)
  const panel = await p.evaluate(() => {
    const el = document.querySelector("[data-export-panel]")
    const b = document.querySelector("[data-orders-export]").getBoundingClientRect()
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      left: r.left, right: r.right, top: r.top, width: r.width, height: r.height,
      button: { right: b.right, bottom: b.bottom },
      expanded: document.querySelector("[data-orders-export]").getAttribute("aria-expanded"),
      rows: [...el.querySelectorAll("[role=radio]")].map((x) => ({ text: x.textContent, h: Math.round(x.getBoundingClientRect().height), on: x.getAttribute("aria-checked") })),
      sheet: !!document.querySelector("[data-sheet-panel]"),
      centred: [...document.querySelectorAll("[role=dialog][data-slot=dialog-content]")].length,
      focused: document.activeElement?.getAttribute("role"),
    }
  })
  console.log(`  ..    panel ${panel && `${Math.round(panel.width)}x${Math.round(panel.height)} at ${Math.round(panel.left)},${Math.round(panel.top)}; the button's bottom right ${Math.round(panel.button.right)},${Math.round(panel.button.bottom)}; rows ${panel.rows.map((r) => `${r.h}px`).join(" ")}`}`)
  expect(panel && !panel.sheet && panel.centred === 0, "on a computer Export opens a panel, not a sheet or a centred dialog", panel && { sheet: panel.sheet, centred: panel.centred })
  expect(panel && near(panel.right, panel.button.right, 1) && panel.top >= panel.button.bottom + 4 && panel.top <= panel.button.bottom + 8 && near(panel.width, 340, 1), "hung from the button: right edges aligned, 6px under it, 340 wide", panel && { right: panel.right, top: panel.top })
  expect(panel && panel.expanded === "true" && panel.focused === "radio", "the button says it is open, and focus is on the chosen row", panel && { expanded: panel.expanded, focused: panel.focused })
  expect(panel && panel.rows.length >= 6 && panel.rows.find((r) => r.on === "true" && /This view/.test(r.text)), "it offers this view (chosen), this page, all orders, by date, and two kinds of file", panel && panel.rows.map((r) => r.text))
  await p.screenshot({ path: join(shots, "orders-desktop-export.png") })
  await p.click("[data-orders-export]")
  await sleep(300)
  const toggled = await p.evaluate(() => ({ panel: !!document.querySelector("[data-export-panel]"), expanded: document.querySelector("[data-orders-export]").getAttribute("aria-expanded"), focus: document.activeElement?.hasAttribute("data-orders-export") }))
  expect(!toggled.panel && toggled.expanded === "false" && toggled.focus, "the button closes it again, and keeps focus", toggled)
  await p.click("[data-orders-export]")
  await sleep(300)
  await p.evaluate(() => [...document.querySelectorAll("[data-export-panel] [role=radio]")].find((r) => /All orders/.test(r.textContent)).click())
  await sleep(100)
  const label = await p.evaluate(() => [...document.querySelectorAll("[data-export-panel] button")].at(-1).textContent)
  await p.evaluate(() => [...document.querySelectorAll("[data-export-panel] button")].at(-1).click())
  await sleep(500)
  const done = await p.evaluate(() => ({ panel: !!document.querySelector("[data-export-panel]"), notice: document.querySelector("[aria-live=polite]")?.textContent }))
  expect(/^Export \d+ orders$/.test(label) && !done.panel && done.notice === label.replace(/^Export (.*)$/, "$1 exported"), "Export writes the file, closes, and says how many", { label, notice: done.notice })
  await p.close()
}
console.log("\nexport, 390 wide")
{
  const p = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const sheetFrames = (ms) => p.evaluate((ms) => {
    window.__sheet = []
    const t0 = performance.now()
    const tick = () => {
      const panel = [...document.querySelectorAll("[data-sheet-panel]")].find((x) => x.querySelector("[data-export-sheet]"))
      window.__sheet.push({ t: Math.round(performance.now() - t0), top: panel ? Math.round(panel.getBoundingClientRect().top) : null, rows: panel ? panel.querySelectorAll("[role=radio]").length : 0 })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, ms)
  await sheetFrames(800)
  await p.tap("[data-orders-export]")
  await sleep(850)
  const rise = await p.evaluate(() => window.__sheet)
  const seen = rise.filter((f) => f.top !== null)
  const tops = seen.map((f) => f.top)
  const risen = seen.find((f, i) => i > 0 && f.top === tops.at(-1) && seen[i - 1].top === f.top)
  const sheet = await p.evaluate(() => {
    const panel = [...document.querySelectorAll("[data-sheet-panel]")].find((x) => x.querySelector("[data-export-sheet]"))
    const r = panel.getBoundingClientRect()
    const cta = [...panel.querySelectorAll("button")].at(-1).getBoundingClientRect()
    return {
      left: r.left, width: r.width, bottom: r.bottom, top: r.top,
      padBottom: getComputedStyle(panel).paddingBottom,
      grabber: !!panel.querySelector("[data-sheet-handle] .rounded-full"),
      title: panel.querySelector("[data-sheet-handle] p")?.textContent,
      close: !!panel.querySelector("[aria-label=Close], [aria-label='Close']"),
      rows: [...panel.querySelectorAll("[role=radio]")].map((x) => Math.round(x.getBoundingClientRect().height)),
      cta: { h: Math.round(cta.height), w: Math.round(cta.width), left: Math.round(cta.left) },
      popover: !!document.querySelector("[data-export-panel]"),
    }
  })
  console.log(`  ..    sheet rose from ${tops[0]}px to ${tops.at(-1)}px in ${risen ? risen.t - seen[0].t : "?"}ms over ${seen.length} frames, rows laid out on its first frame: ${seen[0]?.rows}; at rest ${Math.round(sheet.width)} wide, bottom ${Math.round(sheet.bottom)} of 844, rows ${sheet.rows.join("/")}px, button ${sheet.cta.w}x${sheet.cta.h}`)
  expect(tops[0] >= 780 && tops.every((t, i) => i === 0 || t <= tops[i - 1]), "on a phone Export rises from below the screen, one way, once", tops.slice(0, 6))
  expect(seen[0]?.rows >= 5 && seen.every((f) => f.rows === seen[0].rows), "with every row already in it on its first frame", seen.map((f) => f.rows).slice(0, 4))
  expect(near(sheet.left, 0) && near(sheet.width, 390) && near(sheet.bottom, 844, 1) && !sheet.popover, "anchored to the bottom, the full width", { left: sheet.left, width: sheet.width, bottom: sheet.bottom })
  expect(sheet.grabber && sheet.title === "Export orders" && !sheet.close, "the grabber and the title, no close button", sheet)
  expect(sheet.rows.every((h) => h >= 48) && sheet.cta.h === 48 && sheet.cta.w === 358, "rows at least 48px to tap, one full width 48px button", { rows: sheet.rows, cta: sheet.cta })
  expect(parseFloat(sheet.padBottom) >= 12, "the safe area kept at its foot", sheet.padBottom)
  await p.screenshot({ path: join(shots, "orders-phone-export.png") })

  /* By date: the month opens inside the sheet. */
  await p.evaluate(() => [...document.querySelectorAll("[data-export-sheet] [role=radio]")].find((r) => /By date/.test(r.textContent)).click())
  await sleep(400)
  const dated = await p.evaluate(() => { const panel = document.querySelector("[data-export-sheet]").closest("[data-sheet-panel]"); const r = panel.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), days: panel.querySelectorAll("[data-day]").length } })
  expect(dated.days >= 28 && near(dated.bottom, 844, 1) && dated.top >= 0, "By date shows the month in the sheet, which stays on the screen", dated)
  await p.screenshot({ path: join(shots, "orders-phone-export-dates.png") })
  await p.evaluate(() => [...document.querySelectorAll("[data-export-sheet] [role=radio]")].find((r) => /This view/.test(r.textContent)).click())
  await sleep(300)

  /* A tap outside: it goes down once. */
  await sheetFrames(700)
  await p.touchscreen.tap(195, 40)
  await sleep(750)
  const fall = (await p.evaluate(() => window.__sheet)).filter((f) => f.top !== null).map((f) => f.top)
  expect(fall.length > 3 && fall.every((t, i) => i === 0 || t >= fall[i - 1]) && !(await p.$("[data-export-sheet]")), "a tap outside takes it down, one way, and it is gone", fall.slice(-4))

  /* Export from the sheet. */
  await p.tap("[data-orders-export]")
  await sleep(700)
  const label = await p.evaluate(() => [...document.querySelector("[data-export-sheet]").closest("[data-sheet-panel]").querySelectorAll("button")].at(-1).textContent)
  await p.evaluate(() => [...document.querySelector("[data-export-sheet]").closest("[data-sheet-panel]").querySelectorAll("button")].at(-1).click())
  await sleep(700)
  const done = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-export-sheet]"), notice: document.querySelector("[aria-live=polite]")?.textContent }))
  expect(/^Export \d+ orders?$/.test(label) && !done.sheet && done.notice === label.replace(/^Export (.*)$/, "$1 exported"), "Export in the sheet writes the file, the sheet goes down, and the page says how many", { label, notice: done.notice })
  await p.close()
}

await browser.close()
server.close()
console.log(`\nscreenshots: ${shots}`)
console.log(broken === 0 ? "\nThe Orders page measured as asked.\n" : `\n${broken} measured wrong.\n`)
process.exit(broken === 0 ? 0 : 1)
