/**
 * ===========================================================================
 *  WHERE THE PAGE MEETS THE BLACK BAR, READ AS PIXELS, AT EVERY WIDTH
 * ===========================================================================
 * "In the whole app where the black top bar is, on mobile devices, it needs
 * to be the rounded concave thing, across all pages, the same as it is on
 * desktop larger screens."
 *
 * The real shell (scripts/render-app-top-corners.tsx: the real AppSidebar,
 * AppStage and Home, the real Try Pro strip) at 360, 390 and 430 on a phone
 * and 1280, 1440 and 1920 on a computer, on six page shells: Home with its
 * strip, a page with the Try Pro strip, the strip and then a sticky page
 * bar, a sticky page bar alone, a plain page in its own scroller, and
 * content in the shell's scroller. On each, at the top and scrolled 320px,
 * and over a slow page's surface, the native cold start, and every frame of
 * a page's landing, it reads:
 *
 *   THE NUMBERS         --app-top-corner and --app-top-overlap, from the
 *                       stylesheet: the one place they live
 *   THE CURVE           row by row down each corner, how far the bar's colour
 *                       reaches in from the edge, against the quarter circle
 *                       of that radius: within 0.75px on every row, left and
 *                       right, phone and computer alike
 *   THE BAR BEHIND IT   the corner's outer pixel is the bar's own colour, and
 *                       the pixel just inside the curve is the page's (the
 *                       Try Pro strip's tint where there is one)
 *   NO GAP LINE         the page's scroller starts exactly at the bar's
 *                       bottom edge; the last row of the bar is the bar's
 *                       colour right across, and on a page at rest the first
 *                       row of the page is the same colour as the rows under it
 *   THEY STAY PUT       scrolled, the corners are where they were; through a
 *                       landing, every frame, the same rectangle
 *   PRESSES             the corners take none, and the bar's box ends at the
 *                       bar: a press just under it reaches the page
 *   HIDDEN WITH THE BAR a page layer that hides the header hides them too
 *   THE STRIP           the Try Pro strip is a flat tint, no gradient on it or
 *                       in it, 38px on a phone and 40px from md, and its top
 *                       corners are the bar's curve
 *
 *   node scripts/check-app-top-corners.mjs
 *   NATIVE=1 node scripts/check-app-top-corners.mjs   (html.capacitor from the first paint, and on a phone a 47px
 *                                                      status bar and 34px home indicator through Chromium's own
 *                                                      safe area override, as on an iPhone with a Dynamic Island;
 *                                                      the wide shell as an iPad held upright, 820 and 1024, 24px
 *                                                      status bar)
 *   SHOTS=<dir> node scripts/check-app-top-corners.mjs   (a picture of the top of every state)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const NATIVE = !!process.env.NATIVE
const SHOTS = process.env.SHOTS || ""
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

const dir = join(root, ".top-corners-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
let href = location.pathname
globalThis.__commit = (next) => { href = next; for (const f of [...subs]) f() }
const sub = (f) => { subs.add(f); return () => subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => href.split("?")[0], () => "/app")
export const useSearchParams = () => new URLSearchParams()
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() { history.back() } })
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children)
})
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, fill, priority, quality, placeholder, blurDataURL, unoptimized, loader, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, width, height, ...rest })
}
`)
writeFileSync(join(dir, "dynamic.jsx"), `import React from "react"
export default function dynamic(load, opts) {
  return function Dynamic() { return opts && opts.loading ? React.createElement(opts.loading, {}) : null }
}
`)
writeFileSync(join(dir, "supabase.js"), `function chain() {
  const done = { data: [], error: null, count: 0 }
  const p = new Proxy(function () {}, { get(_, k) { if (k === "then") return (res) => Promise.resolve(done).then(res); return () => p }, apply() { return p } })
  return p
}
export function createClient() {
  const channel = { on() { return channel }, subscribe() { return channel } }
  return {
    channel: () => channel, removeChannel() {}, from: () => chain(), rpc: () => chain(),
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({}) },
  }
}
export function isNativePlatform() { return false }
`)
try {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-app-top-corners.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
    "--define:process.env.NEXT_PUBLIC_SUPABASE_URL=undefined", "--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=undefined",
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:next/image=${join(dir, "image.jsx")}`, `--alias:next/dynamic=${join(dir, "dynamic.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const html = `<!doctype html><html class="app-layout${NATIVE ? " capacitor" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${await appCss(root)}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.__err=[];addEventListener("error",e=>__err.push(String(e.message)))</script>` +
  `<script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const PHONES = [
  [360, { width: 360, height: 780, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  [390, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  [430, { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
]
/* The native apps are held upright (a landscape window shows "Please rotate
   your device"), so their wide shell is an iPad held upright, from md.
   A computer is a browser. */
const VIEWPORTS = NATIVE
  ? [...PHONES,
    [820, { width: 820, height: 1180, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    [1024, { width: 1024, height: 1366, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]
  : [...PHONES,
    [1280, { width: 1280, height: 800, deviceScaleFactor: 1 }],
    [1440, { width: 1440, height: 900, deviceScaleFactor: 2 }],
    [1920, { width: 1920, height: 1080, deviceScaleFactor: 1 }]]
const ROUTES = [
  ["home", "/app", true],
  ["try-pro", "/app/analytics", true],
  ["try-pro+bar", "/app/payouts", true],
  ["page-bar", "/app/orders", false],
  ["plain", "/app/products", false],
  ["shell-scroll", "/app/settings", false],
]

const problems = []
const report = []
let checks = 0
const expect = (ok, what) => { checks++; if (!ok) problems.push(what) }

/* Everything but the pixels, read in the page. */
function geometry(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const r = parseFloat(cs.getPropertyValue("--app-top-corner"))
    const overlap = parseFloat(cs.getPropertyValue("--app-top-overlap"))
    const all = [...document.querySelectorAll("[data-app-top-corners]")]
    const corners = all.find((c) => c.getBoundingClientRect().width > 0)
    if (!corners) return { r, overlap, missing: true, count: all.length }
    const bar = corners.parentElement
    const barRect = bar.getBoundingClientRect()
    const box = corners.getBoundingClientRect()
    const left = corners.querySelector('[data-corner="left"]').getBoundingClientRect()
    const right = corners.querySelector('[data-corner="right"]').getBoundingClientRect()
    const scroller = document.querySelector(".app-content-scroll") || document.querySelector("[data-app-cold-start] > div:nth-child(2)")
    const top = scroller ? scroller.getBoundingClientRect().top : null
    const hit = (x, y) => { const el = document.elementFromPoint(x, y); return el ? { inBar: bar.contains(el), inCorners: corners.contains(el), inMain: !!el.closest("main, [data-app-cold-start]") } : null }
    return {
      r, overlap,
      count: all.length,
      visibility: getComputedStyle(corners).visibility,
      colour: getComputedStyle(corners).color,
      barBottom: barRect.bottom,
      barHeight: barRect.height,
      contentTop: top,
      box: { top: box.top, height: box.height, left: box.left, right: box.right },
      left: { left: left.left, width: left.width, top: left.top, height: left.height },
      right: { right: right.right, width: right.width },
      pressUnder: hit(innerWidth / 2, barRect.bottom + 4),
      pressCorner: hit(2, barRect.bottom + 2),
      inset: parseFloat(getComputedStyle(Object.assign(document.body.appendChild(document.createElement("div")), { style: "position:fixed;height:env(safe-area-inset-top,0px)" })).height),
      errors: window.__err || [],
    }
  })
}

/* The top of the screen from just above the bar's bottom edge, as device pixels, read back in the page. */
async function pixels(page, g, width, dpr) {
  const y0 = Math.floor(g.barBottom) - 3
  const h = Math.ceil(g.r) + 8
  const png = await page.screenshot({ clip: { x: 0, y: y0, width, height: h }, encoding: "base64", captureBeyondViewport: false })
  return page.evaluate(async (b64, y0, dpr, r, barBottom) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(img, 0, 0)
    const data = g.getImageData(0, 0, c.width, c.height).data
    const at = (x, y) => { const i = (y * c.width + x) * 4; return [data[i], data[i + 1], data[i + 2]] }
    const dist = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
    const T = Math.round((barBottom - y0) * dpr) /* the first device row of the page */
    const R = Math.round(r * dpr)
    const bar = at(Math.round(c.width / 2), T - 1)
    /* How far in from the edge the bar reaches on each device row of the corner, against the circle. */
    const profile = (side) => {
      const rows = []
      for (let j = 0; j < R; j++) {
        const y = T + j
        const edgeX = (k) => (side === "left" ? k : c.width - 1 - k)
        const page = at(edgeX(R + 3 * dpr), y)
        const span = dist(page, bar)
        let run = 0
        for (let k = 0; k < R + 2; k++) {
          const p = at(edgeX(k), y)
          /* A pixel is the bar's while it is nearer the bar than the page. */
          if (span > 24 ? dist(p, bar) < span / 2 : dist(p, bar) <= 6) run++
          else break
        }
        const yc = (j + 0.5) / dpr
        const expected = (r - Math.sqrt(Math.max(0, r * r - (r - yc) * (r - yc)))) * dpr
        rows.push({ run, expected: Math.round(expected * 100) / 100, page, contrast: span })
      }
      return rows
    }
    const lastBarRow = []
    for (let x = 0; x < c.width; x++) lastBarRow.push(dist(at(x, T - 1), bar))
    const mid = Math.round(c.width / 2)
    return {
      bar,
      left: profile("left"),
      right: profile("right"),
      outerLeft: at(0, T),
      outerRight: at(c.width - 1, T),
      insideLeft: at(R, T + 1),
      insideRight: at(c.width - 1 - R, T + 1),
      belowLeft: at(0, T + R + 2 * dpr),
      lastBarRowWorst: Math.max(...lastBarRow),
      seam: [0, 1, 2, 3].map((k) => at(mid, T + k)),
      seamRef: at(mid, T + 2 * dpr + 1),
    }
  }, png, y0, dpr, g.r, g.barBottom)
}

function judge(label, g, px, { atRest, strip, dpr, phone }) {
  expect(!g.missing, `${label}: no corners on the screen (${g.count} in the page)`)
  if (g.missing) return
  expect(g.r === 16 && g.overlap === 1, `${label}: the stylesheet's numbers are ${g.r}px and ${g.overlap}px, not 16 and 1`)
  expect(g.visibility === "visible", `${label}: the corners are ${g.visibility}`)
  expect(Math.abs(g.box.top - (g.barBottom - g.overlap)) < 0.01 && Math.abs(g.box.height - (g.r + g.overlap)) < 0.01, `${label}: the corners hang ${JSON.stringify(g.box)} from a bar ending at ${g.barBottom}, not ${g.overlap}px inside it and ${g.r}px below`)
  expect(g.left.left === 0 && Math.abs(g.left.width - g.r) < 0.01 && Math.abs(g.right.right - g.viewport) < 0.01 && Math.abs(g.right.width - g.r) < 0.01, `${label}: the corners are not ${g.r}px wide at the two edges: ${JSON.stringify([g.left, g.right])}`)
  expect(g.contentTop != null && Math.abs(g.contentTop - g.barBottom) < 0.01, `${label}: the page starts at ${g.contentTop}, the bar ends at ${g.barBottom}: a gap between them`)
  const expectBar = phone ? 68 : 58
  expect(Math.abs(g.barHeight - expectBar - g.inset) < 0.01, `${label}: the bar's box is ${g.barHeight}px tall, not ${expectBar} + ${g.inset}: something under it takes presses`)
  if (g.pressUnder) expect(!g.pressUnder.inBar && g.pressUnder.inMain, `${label}: a press 4px under the bar lands on ${JSON.stringify(g.pressUnder)}, not the page`)
  if (g.pressCorner) expect(!g.pressCorner.inCorners && !g.pressCorner.inBar, `${label}: a press on a corner is taken by it`)
  const barRgb = phone ? [17, 17, 17] : [19, 19, 22]
  const near = (a, b, t = 3) => a.every((v, k) => Math.abs(v - b[k]) <= t)
  expect(near(px.bar, barRgb), `${label}: the bar is ${px.bar}, not ${barRgb}`)
  expect(near(px.outerLeft, px.bar) && near(px.outerRight, px.bar), `${label}: the outer pixel of a corner is ${[px.outerLeft, px.outerRight]}, not the bar behind the curve`)
  expect(!near(px.insideLeft, px.bar, 24) && !near(px.insideRight, px.bar, 24), `${label}: the pixel just inside the curve is the bar's colour ${[px.insideLeft, px.insideRight]}: no page there`)
  expect(!near(px.belowLeft, px.bar, 24), `${label}: the bar's colour runs on down the edge below the corner ${px.belowLeft}`)
  expect(px.lastBarRowWorst <= 6, `${label}: the bar's last row is not the bar's colour right across (worst ${px.lastBarRowWorst}): a line where it meets the page`)
  let worst = 0
  for (const side of ["left", "right"]) {
    for (const row of px[side]) {
      if (row.contrast <= 24) continue /* the page is as dark as the bar here: nothing to read */
      worst = Math.max(worst, Math.abs(row.run - row.expected) / dpr)
    }
  }
  expect(worst <= 0.75, `${label}: the curve is off a ${g.r}px quarter circle by ${worst.toFixed(2)}px on some row`)
  if (atRest) {
    const ref = px.seamRef
    const seamWorst = Math.max(...px.seam.map((p) => Math.max(...p.map((v, k) => Math.abs(v - ref[k])))))
    expect(seamWorst <= 6, `${label}: the page's first rows under the bar ${JSON.stringify(px.seam)} are not the colour of the rows under them ${ref}: a gap line`)
  }
  if (strip) {
    /* From md the left corner is over the rail, and the strip starts beside it. */
    const tint = [245, 243, 255]
    expect((!phone || near(px.insideLeft, tint, 4)) && near(px.insideRight, tint, 4), `${label}: inside the curve is ${[px.insideLeft, px.insideRight]}, not the Try Pro strip's tint: the strip is not under the rounded top`)
  }
  return worst
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
for (const [width, viewport] of VIEWPORTS) {
  const phone = width < 768
  const dpr = viewport.deviceScaleFactor
  const page = await browser.newPage()
  await page.setViewport(viewport)
  await page.evaluateOnNewDocument(() => { try { localStorage.clear() } catch {} })
  const cdp = await page.createCDPSession()
  if (NATIVE) await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: phone ? { top: 47, bottom: 34, left: 0, right: 0 } : { top: 24, bottom: 20, left: 0, right: 0 } })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app`)
  await page.waitForFunction(() => window.__ran && document.querySelector("[data-app-top-corners]"), { timeout: 15000 }).catch(() => fail(`${width}: the shell did not render ${errors[0] ?? ""}`))
  await wait(700)
  const row = { width, states: {} }
  const shoot = async (name, g) => {
    if (!SHOTS) return
    await page.screenshot({ path: join(SHOTS, `${width}${NATIVE ? "-native" : ""}-${name}.png`), clip: { x: 0, y: 0, width, height: Math.min(viewport.height, Math.ceil(g.barBottom) + 140) } })
  }
  const measure = async (name, opts) => {
    const g = await geometry(page)
    g.viewport = width
    if (g.missing) { judge(`${width} ${name}`, g, null, opts); return }
    const px = await pixels(page, g, width, dpr)
    const worst = judge(`${width} ${name}`, g, px, { ...opts, dpr, phone })
    row.states[name] = { worstCurvePx: Math.round(worst * 100) / 100, barBottom: g.barBottom, inset: g.inset, underCurve: px.insideLeft, bar: px.bar }
    await shoot(name, g)
    return g
  }

  for (const [name, path, strip] of ROUTES) {
    await page.evaluate((p) => window.__go(p), path)
    await wait(name === "home" ? 900 : 450)
    await measure(name, { atRest: true, strip })
    /* Scrolled: whichever box scrolls this page. */
    const scrolled = await page.evaluate(() => {
      const s = document.querySelector(".app-content-scroll")
      const own = s.querySelector(":scope > .page-scroll, :scope > .dashboard-scroll-container, :scope > .orders-stage > .orders-pane") || s
      own.scrollTop = 320
      return own.scrollTop
    })
    await wait(120)
    expect(scrolled > 100, `${width} ${name}: the page did not scroll (${scrolled}px)`)
    await measure(`${name} scrolled`, { atRest: false, strip: false })
    if (name === "home" || name === "try-pro") {
      const strips = await page.evaluate(() => [...document.querySelectorAll("[data-page-strip]")].map((s) => {
        const all = [s, ...s.querySelectorAll("*")]
        return {
          bg: getComputedStyle(s).backgroundColor,
          height: s.getBoundingClientRect().height,
          gradients: all.filter((e) => /gradient/.test(getComputedStyle(e).backgroundImage)).length,
          svgIcons: s.querySelectorAll("svg").length,
        }
      }))
      expect(strips.length === 1, `${width} ${name}: ${strips.length} strips on the page`)
      for (const s of strips) {
        expect(s.bg === "rgb(245, 243, 255)", `${width} ${name}: the strip is ${s.bg}, not the calm tint`)
        expect(s.gradients === 0 && s.svgIcons === 0, `${width} ${name}: the strip has ${s.gradients} gradients and ${s.svgIcons} icons in it`)
        expect(name === "home" ? s.height === (phone ? 40 : 42) : s.height === (phone ? 38 : 40), `${width} ${name}: the strip is ${s.height}px tall`)
      }
      row.states[name].strip = strips[0]
    }
    await page.evaluate(() => {
      const s = document.querySelector(".app-content-scroll")
      for (const el of [s, ...s.querySelectorAll(".page-scroll, .dashboard-scroll-container, .orders-pane")]) el.scrollTop = 0
    })
  }

  /* A landing: every frame, the corners' rectangle, as the page rises under them. */
  const landing = await page.evaluate(async () => {
    const read = () => { const c = [...document.querySelectorAll("[data-app-top-corners]")].find((e) => e.getBoundingClientRect().width > 0); const r = c.getBoundingClientRect(); return `${r.top},${r.left},${r.width},${r.height},${getComputedStyle(c).visibility}` }
    const first = read()
    const seen = new Set()
    let frames = 0
    let moved = 0
    window.__go("/app/analytics")
    const t0 = performance.now()
    await new Promise((done) => {
      const tick = () => {
        frames++
        /* The landing is a `translate` animation on what is in the page's scroller (app-stage.tsx playEntrance). */
        if (document.querySelector(".app-content-scroll").getAnimations({ subtree: true }).some((a) => a.playState === "running")) moved++
        seen.add(read())
        if (performance.now() - t0 < 400) requestAnimationFrame(tick)
        else done()
      }
      requestAnimationFrame(tick)
    })
    return { first, distinct: [...seen], frames, moved }
  })
  expect(landing.distinct.length === 1 && landing.distinct[0] === landing.first, `${width}: through a landing the corners were at ${JSON.stringify(landing.distinct)}`)
  expect(landing.frames > 10, `${width}: only ${landing.frames} frames of a landing were read`)
  row.landing = { frames: landing.frames, framesWithPageMoving: landing.moved, cornerRects: landing.distinct.length }
  await wait(300)

  /* A slow page: its surface under the corners. */
  await page.evaluate(() => window.__startNav("/app/hang"))
  await wait(phone ? 900 : 1400)
  const slowUp = await page.evaluate(() => !!document.querySelector("[data-app-slow-surface]"))
  expect(slowUp, `${width}: the slow page's surface did not come up`)
  if (slowUp) {
    const surfaceRadius = await page.evaluate(() => getComputedStyle(document.querySelector("[data-app-slow-surface]")).borderTopLeftRadius)
    expect(surfaceRadius === (phone ? "16px" : "0px"), `${width}: the slow surface's radius is ${surfaceRadius}`)
    await measure("slow", { atRest: true, strip: false })
  }
  await page.evaluate(() => window.__go("/app/products"))
  await wait(500)

  /* A page drawn as a layer over the shell hides the bar, and the corners with it. */
  const hidden = await page.evaluate(async () => {
    document.documentElement.classList.add("has-page-layer")
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const v = [...document.querySelectorAll("[data-app-top-corners]")].map((c) => getComputedStyle(c).visibility)
    document.documentElement.classList.remove("has-page-layer")
    return v
  })
  expect(hidden.every((v) => v === "hidden"), `${width}: under a page layer the corners are ${hidden}`)

  expect(errors.length === 0, `${width}: page errors ${errors.slice(0, 2)}`)
  await page.close()

  /* The native cold start: the shell's frame, the same corners. */
  const cold = await browser.newPage()
  await cold.setViewport(viewport)
  const cdp2 = await cold.createCDPSession()
  if (NATIVE) await cdp2.send("Emulation.setSafeAreaInsetsOverride", { insets: phone ? { top: 47, bottom: 34, left: 0, right: 0 } : { top: 24, bottom: 20, left: 0, right: 0 } })
  await cold.goto(`${base}/app?cold=1`)
  await cold.waitForSelector("[data-app-cold-start]", { timeout: 8000 })
  await wait(200)
  {
    const g = await geometry(cold)
    g.viewport = width
    const px = g.missing ? null : await pixels(cold, g, width, dpr)
    /* The cold start's frame is not a header element: its box is the header's height. */
    const worst = judge(`${width} cold start`, g, px, { atRest: true, strip: false, dpr, phone })
    row.states.cold = { worstCurvePx: Math.round((worst ?? 99) * 100) / 100 }
    if (SHOTS && !g.missing) await cold.screenshot({ path: join(SHOTS, `${width}${NATIVE ? "-native" : ""}-cold.png`), clip: { x: 0, y: 0, width, height: Math.ceil(g.barBottom) + 80 } })
  }
  await cold.close()
  report.push(row)
}
await browser.close()
server.close()

for (const row of report) {
  console.log(`\n${row.width}${NATIVE ? " native" : ""}  landing: ${row.landing.frames} frames, page moving in ${row.landing.framesWithPageMoving}, corner rectangles seen ${row.landing.cornerRects}`)
  for (const [name, s] of Object.entries(row.states)) {
    console.log(`  ${name.padEnd(22)} curve off by ${String(s.worstCurvePx).padEnd(5)} px   bar ends ${s.barBottom ?? ""}${s.inset ? ` (inset ${s.inset})` : ""}   under the curve ${s.underCurve ?? ""}${s.strip ? `   strip ${s.strip.bg} ${s.strip.height}px` : ""}`)
  }
}
if (problems.length) fail(`${problems.length} of ${checks} checks failed:\n${problems.join("\n")}`)
console.log(`\nok: ${checks} checks. At every width the page meets the black bar with the same ${16}px rounded corners, the bar's colour behind the curve, no gap line, on every page shell, scrolled or not, over a slow page, a cold start and through a landing${NATIVE ? ", in the native shell under a 47px status bar on a phone and 24px on an iPad" : ""}`)
