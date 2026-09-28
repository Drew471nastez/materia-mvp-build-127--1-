/**
 * ===========================================================================
 *  EXPLORE ON A COMPUTER: THE MORE POPOVER, THE HEADER'S MENU, THE SEARCH
 * ===========================================================================
 * Renders the real PlatformHeaderClient over the real Explore page
 * (scripts/render-explore-header.tsx), at 1440x900 and 1280x800, and checks
 * the three things the owner asked for as numbers:
 *
 *   MORE IS A POPOVER ANCHORED TO ITS CHIP. Under the chip when there is
 *   room, over it when there is not, and never over the black header: with
 *   the chip low in the window it flips, and its height is what is left
 *   between the header and the chip. It opens and closes by opacity and a
 *   few pixels of scale and translate, closes on a click away, on Escape and
 *   on a pick, and drills into a category in one click.
 *
 *   THE HEADER'S CATEGORIES MENU closes by fading and lifting, not by
 *   vanishing, and nothing behind it moves while it opens or closes. Its
 *   rows are Inter at 450, a real variable weight.
 *
 *   THE HEADER'S SEARCH is not there while the page's own field is on
 *   screen, and fades in once that field has gone under the header: on
 *   arrival, when arriving already scrolled, after a route change between
 *   two Explore pages, after the loading screen hands over to the page,
 *   after coming back from a product, and after a resize. The header row
 *   does not move when it appears.
 *
 * Screenshots and mid-animation frames go to SHOTS_DIR.
 *
 *   PROBE_CSS=source node scripts/check-explore-desktop.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const stubs = join(root, ".explore-desktop-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-desktop-")), "shots")
mkdirSync(shots, { recursive: true })

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(window.__search || "")
export const useParams = () => ({ category: window.__category })`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}`,
  "supabase-client": `const done = { data: null, error: null }
const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(done) : chain(), apply: () => chain() })
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: async () => ({ data: { user: null }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: () => chain(),
    rpc: () => chain(),
    channel: () => chain(),
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-explore-header.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
async function open(vp, view = "explore") {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}#${view}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(600)
  if (errors.length) fail(`The page threw: ${errors[0]}`)
  p.__errors = errors
  return p
}

/* The header's search field, as the eye sees it: there, and how visible. */
const HEADER_SEARCH = `(() => {
  const header = document.getElementById("platform-header-root")
  const input = [...header.querySelectorAll("input")].find((i) => i.offsetParent !== null || getComputedStyle(i).display !== "none")
  const slot = header.querySelector("[data-header-search]") || input?.closest(".md\\\\:flex")
  if (!input) return { present: false, shown: false, opacity: 0 }
  let o = 1, el = input
  while (el && el !== header) { o *= Number(getComputedStyle(el).opacity); if (getComputedStyle(el).visibility === "hidden") o = 0; el = el.parentElement }
  const r = input.getBoundingClientRect()
  return { present: true, shown: o > 0.5 && r.width > 0, opacity: Math.round(o * 100) / 100, x: Math.round(r.left), w: Math.round(r.width) }
})()`
/* Where the header's other things sit, to see whether any of them moves. */
const HEADER_ROW = `(() => {
  const header = document.getElementById("platform-header-root")
  const logo = header.querySelector('a[href="/explore"]')
  const cats = header.querySelector("[data-categories-dropdown] button")
  const last = [...header.querySelectorAll("a, button")].filter((e) => e.getBoundingClientRect().width > 0).pop()
  const x = (el) => el ? Math.round(el.getBoundingClientRect().left) : null
  return { logo: x(logo), cats: x(cats), last: x(last), h: Math.round(header.getBoundingClientRect().height) }
})()`
const FIELD = `(() => { const a = document.querySelector("[data-explore-search-anchor]"); if (!a) return null; const r = a.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) } })()`

const WIDE = { width: 1440, height: 900, deviceScaleFactor: 1 }
const LAPTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

/* Every frame for `ms`: what `read` says, with the time. */
const film = (p, read, ms, before = "") => p.evaluate(async (read, ms, before) => {
  const f = new Function("return " + read)
  const frames = []
  const t0 = performance.now()
  if (before) new Function(before)()
  await new Promise((done) => {
    const tick = () => {
      frames.push({ t: Math.round(performance.now() - t0), ...f() })
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else done()
    }
    /* From the first frame the browser draws, not the moment before it. */
    requestAnimationFrame(tick)
  })
  return frames
}, read, ms, before)

/*
  The same film with every CSS animation and transition slowed to `rate`,
  its times scaled back to real ones. A headless browser on a busy machine
  draws a frame every 30 to 60ms, which is three frames of a 160ms fade:
  slowed, every step of the curve lands on a frame, and the times still
  read as the real ones.
*/
async function filmSlow(p, read, ms, before = "", rate = 0.25) {
  const cdp = await slowMo(p, rate)
  const frames = await film(p, read, ms / rate, before)
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await cdp.detach()
  return frames.map((f) => ({ ...f, t: Math.round(f.t * rate) }))
}

/* Slows every CSS animation and transition on the page, for a picture of the middle of one. */
async function slowMo(p, rate) {
  const cdp = await p.createCDPSession()
  await cdp.send("Animation.enable")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: rate })
  return cdp
}

const PANEL_READ = `(() => {
  const el = document.querySelector("[data-category-panel]")
  if (!el) return { panel: false }
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el)
  const m = new DOMMatrixReadOnly(cs.transform)
  return { panel: true, o: Math.round(Number(cs.opacity) * 1000) / 1000, s: Math.round(m.a * 1000) / 1000, y: Math.round(m.m42 * 10) / 10, top: Math.round(b.top), state: el.dataset.state, side: el.dataset.side }
})()`
const PLACE = `(() => {
  const el = document.querySelector("[data-category-panel]")
  const pill = document.querySelector("[data-more-pill]").getBoundingClientRect()
  const hb = document.getElementById("platform-header-root").getBoundingClientRect().bottom
  if (!el) return { panel: false, pill: { top: Math.round(pill.top), bottom: Math.round(pill.bottom), left: Math.round(pill.left) }, header: Math.round(hb) }
  const b = el.getBoundingClientRect(), cs = getComputedStyle(el)
  const pane = el.querySelector("[data-browse-level=root]")
  return {
    panel: true, side: el.dataset.side,
    top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), h: Math.round(b.height), w: Math.round(b.width),
    pill: { top: Math.round(pill.top), bottom: Math.round(pill.bottom), left: Math.round(pill.left) },
    header: Math.round(hb), vh: innerHeight, vw: innerWidth,
    radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, shadow: (cs.boxShadow.match(/rgba?\\(/g) || []).length, shadowCss: cs.boxShadow,
    scrolls: pane.scrollHeight > pane.clientHeight + 1, scrollbar: getComputedStyle(pane).scrollbarWidth,
  }
})()`

/* Puts the More pill `at` pixels from the top of the window. */
async function pillAt(p, at) {
  await p.evaluate((at) => {
    const pill = document.querySelector("[data-more-pill]")
    scrollTo(0, scrollY + pill.getBoundingClientRect().top - at)
  }, at)
  await sleep(250)
}

function placedWell(s, label) {
  const under = s.side === "bottom"
  expect(s.panel && s.top >= s.header + 8 - 1 && s.top >= 0, `${label}: it never reaches the header or the top of the window`, { top: s.top, header: s.header })
  expect(s.panel && s.bottom <= s.vh - 16 + 1, `${label}: nor the bottom`, { bottom: s.bottom, vh: s.vh })
  expect(s.panel && (under ? Math.abs(s.top - (s.pill.bottom + 8)) <= 1 : Math.abs(s.bottom - (s.pill.top - 8)) <= 1), `${label}: 8px ${under ? "under" : "over"} the pill`, { side: s.side, top: s.top, bottom: s.bottom, pill: s.pill })
  expect(s.panel && (Math.abs(s.left - s.pill.left) <= 1 || s.right <= s.vw - 16 + 1), `${label}: its left edge on the pill's, unless the window's edge is in the way`, { left: s.left, pill: s.pill.left, right: s.right })
}

async function morePopover(vp, tag) {
  console.log(`\n1. More, ${vp.width}x${vp.height}`)
  const p = await open(vp)
  const shot = (n) => p.screenshot({ path: join(shots, `more-${tag}-${n}.png`) })

  /* where the page puts it: the top of the page */
  await p.click("[data-more-pill]")
  await sleep(300)
  const a = await p.evaluate(PLACE)
  await shot("top")
  placedWell(a, "at the top of the page")
  expect(a.radius === "12px" && a.bg === "rgb(255, 255, 255)" && a.shadow >= 3, "a white card, 12px corners, a layered shadow", { radius: a.radius, bg: a.bg, layers: a.shadow, css: a.shadowCss })
  expect(a.w === 320 && a.h >= 280 && a.h <= 440, "320 wide and between 280 and 440 tall", { w: a.w, h: a.h })
  expect(a.scrollbar === "thin", "its list scrolls with a thin scrollbar and no track", a.scrollbar)
  await p.keyboard.press("Escape")
  await sleep(250)
  expect(await p.evaluate(() => !document.querySelector("[data-category-panel]") && document.activeElement?.hasAttribute("data-more-pill")), "Escape closes it and gives focus back to the pill")

  /* the pill low in the window (a short window, as in the owner's picture): over it, never over the header */
  await p.evaluate(() => scrollTo(0, 0))
  const pillBottom = await p.evaluate(() => document.querySelector("[data-more-pill]").getBoundingClientRect().bottom)
  await p.setViewport({ ...vp, height: Math.round(pillBottom + 150) })
  await sleep(300)
  await p.click("[data-more-pill]")
  await sleep(300)
  const b = await p.evaluate(PLACE)
  await shot("low")
  expect(b.side === "top", "with the pill low in the window it opens over the pill", b.side)
  placedWell(b, "pill low")
  await p.mouse.click(16, Math.round(b.header + 30))
  await sleep(250)
  expect(await p.evaluate(() => !document.querySelector("[data-category-panel]")), "a click away closes it")
  await p.setViewport(vp)
  await sleep(300)

  /* the pill just under the header: under it */
  const hb = await p.evaluate(() => document.getElementById("platform-header-root").getBoundingClientRect().bottom)
  await pillAt(p, hb + 24)
  await p.click("[data-more-pill]")
  await sleep(300)
  const c = await p.evaluate(PLACE)
  await shot("high")
  expect(c.side === "bottom", "with the pill high in the window it opens under it", c.side)
  placedWell(c, "pill high")

  /* the window changes size while it is open */
  await p.setViewport({ ...vp, height: 560 })
  await sleep(350)
  const d = await p.evaluate(PLACE)
  await shot("resized")
  placedWell(d, "window made shorter while open")
  await p.setViewport(vp)
  await sleep(300)
  await p.keyboard.press("Escape")
  await sleep(250)

  /* how it opens and closes: opacity, a few px, a hair of scale; nothing else */
  await pillAt(p, 300)
  await p.evaluate(() => document.querySelector("[data-more-pill]").focus())
  const opening = await filmSlow(p, PANEL_READ, 320, `document.querySelector("[data-more-pill]").click()`)
  const shown = opening.filter((f) => f.panel)
  const mid = shown.filter((f) => f.o > 0.02 && f.o < 0.98)
  const opensMs = shown.length ? (shown.find((f) => f.o >= 0.999)?.t ?? 999) - shown[0].t : 999
  expect(mid.length >= 3 && opensMs >= 120 && opensMs <= 260, "it fades in over about 160ms, not in one frame", { frames: mid.length, ms: opensMs })
  expect(shown.every((f, i) => i === 0 || f.o >= shown[i - 1].o - 0.001), "and only ever gets more opaque", shown.map((f) => f.o))
  expect(mid.length && mid[0].s >= 0.975 && mid[0].s < 1 && Math.abs(mid[0].y) <= 4.01 && Math.abs(mid[0].y) > 0, "from 4px and 98%, toward the pill", mid[0] && { s: mid[0].s, y: mid[0].y })
  const settled = shown[shown.length - 1]
  expect(settled && settled.s === 1 && settled.y === 0 && settled.o === 1, "and comes to rest square", settled)
  const closing = await filmSlow(p, PANEL_READ, 300, `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`)
  const leaving = closing.filter((f) => f.panel && f.state === "closed")
  const gone = closing.find((f) => !f.panel)
  expect(leaving.length >= 3 && gone && gone.t <= 320, "it leaves the same way, quicker, and is gone", { frames: leaving.length, goneAt: gone?.t, o: leaving.map((f) => f.o) })

  /* a picture of the middle of each */
  const cdp = await slowMo(p, 0.08)
  await p.click("[data-more-pill]")
  await sleep(700)
  await shot("opening-mid")
  await p.keyboard.press("Escape")
  await sleep(600)
  await shot("closing-mid")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await sleep(2600)

  /* one click into a category, and it slides */
  await p.click("[data-more-pill]")
  await sleep(300)
  const inFrames = await film(p, `(() => { const s = document.querySelector("[data-category-panel] [data-browse-level=sub]"); const r = document.querySelector("[data-category-panel] [data-browse-level=root]"); return { sub: Math.round(new DOMMatrixReadOnly(getComputedStyle(s).transform).m41), root: Math.round(new DOMMatrixReadOnly(getComputedStyle(r).transform).m41), top: Math.round(document.querySelector("[data-category-panel]").getBoundingClientRect().top) } })()`, 500, "")
  void inFrames
  await p.click('[data-category-panel] [data-browse-group="design"]')
  await sleep(450)
  const sub = await p.evaluate(() => ({
    back: document.querySelector("[data-category-panel] [data-browse-back]")?.textContent.trim(),
    x: Math.round(document.querySelector("[data-category-panel] [data-browse-level=sub]").getBoundingClientRect().left - document.querySelector("[data-category-panel]").getBoundingClientRect().left),
  }))
  await shot("design")
  expect(sub.back === "Design" && sub.x === 0, "one click on Design opens its subcategories", sub)
  await p.click("[data-category-panel] [data-browse-back]")
  await sleep(450)
  /* the push, filmed in the popover */
  const push = await film(p, `(() => { const host = document.querySelector("[data-category-panel]"); const s = host.querySelector("[data-browse-level=sub]"); return { x: Math.round(new DOMMatrixReadOnly(getComputedStyle(s).transform).m41), top: Math.round(host.getBoundingClientRect().top), h: Math.round(host.getBoundingClientRect().height) } })()`, 480,
    `document.querySelector('[data-category-panel] [data-browse-group="business"]').click()`)
  const moving = push.filter((f) => f.x > 0 && f.x < 318)
  expect(moving.length >= 8 && push.every((f, i) => i === 0 || f.x <= push[i - 1].x), "the level slides in over several frames, one way", { frames: moving.length })
  expect(new Set(push.map((f) => f.top)).size === 1 && new Set(push.map((f) => f.h)).size === 1, "and the popover itself does not move or resize", { tops: [...new Set(push.map((f) => f.top))], hs: [...new Set(push.map((f) => f.h))] })
  await p.click("[data-category-panel] [data-browse-back]")
  await sleep(450)

  /* the keyboard: down into the rows, right into a category, a pick closes */
  await p.evaluate(() => document.querySelector("[data-browse-search]").focus())
  await p.keyboard.press("ArrowDown")
  await p.keyboard.press("ArrowDown")
  const focused = await p.evaluate(() => document.activeElement?.textContent.trim())
  await p.keyboard.press("ArrowRight")
  await sleep(450)
  const kb = await p.evaluate(() => ({ back: document.activeElement?.hasAttribute("data-browse-back"), text: document.activeElement?.textContent.trim() }))
  expect(kb.back, "arrows move through the rows and ArrowRight opens one, focus on its back row", { focused, ...kb })
  await p.keyboard.press("ArrowDown")
  await p.keyboard.press("ArrowDown")
  await p.keyboard.press("Enter")
  /* Gone once its 120ms exit has played; a busy machine gets a little longer. */
  const picked = await p.waitForFunction(() => !document.querySelector("[data-category-panel]"), { timeout: 1000 }).then(() => true, () => false)
  expect(picked, "a pick closes it")
  await p.close()
}

/* ========================================================================= */
const MENU_READ = `(() => {
  const el = document.querySelector("[data-header-categories]")
  if (!el) return { panel: false }
  const cs = getComputedStyle(el)
  const m = new DOMMatrixReadOnly(cs.transform)
  return { panel: true, o: Math.round(Number(cs.opacity) * 1000) / 1000, scale: cs.scale, translate: cs.translate, state: el.dataset.state }
})()`
const BEHIND = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(",") }
  return { h1: r(document.querySelector("main section p")), field: r(document.querySelector("[data-explore-search-anchor]")), pills: r(document.querySelector("[data-category-pills-row]")), header: r(document.getElementById("platform-header-root")), doc: document.documentElement.scrollHeight, y: scrollY }
})()`

async function headerMenu(vp, tag) {
  console.log(`\n2. The header's Categories menu, ${vp.width}x${vp.height}`)
  const p = await open(vp)
  const shot = (n) => p.screenshot({ path: join(shots, `menu-${tag}-${n}.png`) })
  const trigger = "[data-categories-dropdown] > button"
  const before = await p.evaluate(BEHIND)

  const opening = await filmSlow(p, MENU_READ, 320, `document.querySelector("${trigger}").click()`)
  const mid = opening.filter((f) => f.panel && f.o > 0.02 && f.o < 0.98)
  const first = opening.find((f) => f.panel)
  expect(first && first.o < 0.5 && mid.length >= 3, "it opens by fading in over several frames, from nothing", { first: first?.o, frames: mid.length })
  await sleep(200)
  await shot("open")
  const during = await p.evaluate(BEHIND)
  expect(JSON.stringify(during) === JSON.stringify(before), "nothing behind it moves when it opens", { before, during })

  /* the rows' weight, and that the weight is real */
  const weight = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-header-categories] [data-browse-row]")]
    const label = rows[0].querySelector("span")
    const widths = {}
    for (const w of [400, 450, 500]) {
      const s = document.createElement("span")
      s.textContent = "Social Media Photography"
      s.style.cssText = `position:fixed;left:-999px;top:0;font:${w} 14px ${getComputedStyle(label).fontFamily};white-space:nowrap`
      document.body.append(s)
      widths[w] = s.getBoundingClientRect().width
      s.remove()
    }
    return { rows: [...new Set(rows.map((r) => getComputedStyle(r.querySelector("span")).fontWeight))], back: null, family: getComputedStyle(label).fontFamily.split(",")[0], widths, inter: document.fonts.check("450 14px Inter") }
  })
  expect(weight.rows.length === 1 && weight.rows[0] === "600", "the category rows are 600 (a subcategory is 500): heavier, as asked", weight.rows)
  const faces = /Inter/.test(weight.family) && weight.widths[400] < weight.widths[450] && weight.widths[450] < weight.widths[500]
  if (process.env.PROBE_FONT === "fallback" || !interFaces(root)) console.log("        (no Inter build to measure the face with; the weight is measured on the fallback)")
  else expect(faces, "and 450 draws between 400 and 500: Inter is loaded as a variable font", weight.widths)

  /* hovering from row to row moves nothing */
  const rects = () => p.evaluate(() => [...document.querySelectorAll("[data-header-categories] [data-browse-level=root] [data-browse-row]")].map((r) => { const b = r.getBoundingClientRect(); const s = r.querySelector("span").getBoundingClientRect(); return [b.top, b.height, s.width, getComputedStyle(r.querySelector("span")).fontWeight].join(",") }))
  const still = await rects()
  const boxes = await p.evaluate(() => [...document.querySelectorAll("[data-header-categories] [data-browse-level=root] [data-browse-row]")].slice(0, 6).map((r) => { const b = r.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2] }))
  let moved = 0
  for (const [x, y] of boxes) {
    await p.mouse.move(x, y, { steps: 4 })
    await sleep(60)
    if (JSON.stringify(await rects()) !== JSON.stringify(still)) moved++
  }
  await shot("hover")
  expect(moved === 0, "hovering down the rows moves nothing, and no label changes weight", moved)

  /* click away: a fade and a lift, then gone; nothing behind it moves */
  const away = `document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 16, clientY: 300 }))`
  const closing = await film(p, MENU_READ, 520, away)
  const gone = closing.find((f) => !f.panel)
  expect(closing[0]?.panel && gone && gone.t >= 90 && gone.t <= 500, "a click away takes it off over a few frames, not in one", { goneAt: gone?.t, o: closing.map((f) => f.o) })
  /* the same at a quarter speed, so every step of it is on a frame */
  await p.click(trigger)
  await sleep(350)
  const cdp = await slowMo(p, 0.25)
  const slowed = await film(p, MENU_READ, 700, away)
  const out = slowed.filter((f) => f.panel && f.state === "closed")
  const lifts = out.filter((f) => f.o > 0.02 && f.o < 0.98)
  expect(lifts.length >= 3, "(at a quarter speed) it fades out through several steps instead of snapping", { frames: lifts.length, o: out.map((f) => f.o) })
  expect(out.every((f, i) => i === 0 || f.o <= out[i - 1].o + 0.001), "only ever less opaque on the way out", out.map((f) => f.o))
  const lastOut = lifts[lifts.length - 1]
  expect(lastOut && /-/.test(lastOut.translate) && lastOut.scale !== "none" && lastOut.scale !== "1", "lifting a few px and settling back a hair as it goes", lastOut && { translate: lastOut.translate, scale: lastOut.scale })
  /* and a picture of the middle of it */
  await sleep(300)
  await p.click(trigger)
  await sleep(1000)
  await p.evaluate((away) => new Function(away)(), away)
  await sleep(150)
  await shot("closing-mid")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await sleep(800)
  expect(await p.evaluate(() => !document.querySelector("[data-header-categories]")), "and it does go")
  const after = await p.evaluate(BEHIND)
  expect(JSON.stringify(after) === JSON.stringify(before), "nothing behind it moved when it closed", { before, after })

  /* Escape from anywhere */
  await p.click(trigger)
  await sleep(300)
  await p.keyboard.press("Escape")
  await sleep(300)
  expect(await p.evaluate(() => !document.querySelector("[data-header-categories]")), "Escape closes it")
  /* opened again while it is leaving: it turns round rather than restarting */
  await p.click(trigger)
  await sleep(300)
  const turn = await filmSlow(p, MENU_READ, 360, `document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: 16, clientY: 300 })); setTimeout(() => document.querySelector("${trigger}").click(), 240)`)
  const dip = turn.filter((f) => f.panel)
  const low = Math.min(...dip.map((f) => f.o))
  expect(dip.length === turn.length && low > 0.2 && dip[dip.length - 1].o === 1, "reopened while it leaves, it turns round from where it was", { lowest: low, end: dip[dip.length - 1]?.o, o: dip.map((f) => f.o) })
  await p.close()
}

/* ========================================================================= */
async function headerSearch(vp, tag) {
  console.log(`\n3. The header's search, ${vp.width}x${vp.height}`)
  const p = await open(vp)
  const state = () => p.evaluate(`({ s: ${HEADER_SEARCH}, f: ${FIELD}, h: document.getElementById("platform-header-root").getBoundingClientRect().bottom, y: scrollY })`)
  const shot = (n) => p.screenshot({ path: join(shots, `search-${tag}-${n}.png`) })
  const rowTop = await p.evaluate(HEADER_ROW)

  let s = await state()
  await shot("top")
  expect(!s.s.shown && s.s.opacity === 0, "at the top the header has no search", s.s)
  const hb = Math.round(s.h)

  /* just before the field goes under the header, and just after */
  const fieldDoc = await p.evaluate(() => document.querySelector("[data-explore-search-anchor]").getBoundingClientRect().bottom + scrollY)
  await p.evaluate((y) => scrollTo(0, y), Math.round(fieldDoc - hb - 20))
  await sleep(300)
  s = await state()
  expect(!s.s.shown, "with the page's field still showing under the header, none", { fieldBottom: s.f.bottom, header: hb, header_search: s.s.opacity })
  const appear = await filmSlow(p, `${HEADER_SEARCH}`, 400, `scrollTo(0, ${Math.round(fieldDoc - hb + 20)})`)
  const midA = appear.filter((f) => f.opacity > 0.02 && f.opacity < 0.98)
  const endA = appear[appear.length - 1]
  expect(endA.shown && midA.length >= 3, "once it has gone under the header the header's fades in, over several frames", { frames: midA.length, end: endA.opacity })
  const rowShown = await p.evaluate(HEADER_ROW)
  expect(JSON.stringify(rowShown) === JSON.stringify(rowTop), "nothing else in the header moves when it appears", { before: rowTop, after: rowShown })
  await shot("shown")
  const leave = await filmSlow(p, `${HEADER_SEARCH}`, 400, `scrollTo(0, ${Math.round(fieldDoc - hb - 20)})`)
  const midL = leave.filter((f) => f.opacity > 0.02 && f.opacity < 0.98)
  expect(!leave[leave.length - 1].shown && midL.length >= 2, "scrolled back to the page's field, it fades away again", { frames: midL.length, end: leave[leave.length - 1].opacity })
  const cdp = await slowMo(p, 0.1)
  await p.evaluate((y) => scrollTo(0, y), Math.round(fieldDoc - hb + 20))
  await sleep(700)
  await shot("appearing-mid")
  await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await sleep(2200)

  /* route changes that used to leave it behind */
  await p.evaluate(() => scrollTo(0, 1400))
  await sleep(300)
  await p.evaluate(() => window.__go("category", { scroll: 0 }))
  await sleep(50)
  s = await state()
  expect(!s.s.shown, "scrolled past it on Explore, then on to a category: none at the top of the category", s.s)
  await p.evaluate(() => window.__go("explore", { scroll: 0 }))
  await sleep(50)
  s = await state()
  expect(!s.s.shown, "and back on Explore at the top: none", s.s)
  await p.evaluate(() => scrollTo(0, 1400))
  await sleep(400)
  s = await state()
  expect(s.s.shown, "and it still hands over after the page under it was replaced", s.s)

  /* a product, and back to where you were: on the first frame, no fade */
  await p.evaluate(() => window.__go("product", { scroll: 0 }))
  await sleep(100)
  s = await state()
  expect(s.s.shown, "a page with no search of its own keeps the header's", s.s)
  const back = await film(p, `${HEADER_SEARCH}`, 200, `window.__go("explore", { scroll: 1400 })`)
  expect(back.every((f) => f.shown && f.opacity === 1), "back to Explore scrolled down: there on every frame, no fade", back.map((f) => f.opacity))
  const backTop = await film(p, `${HEADER_SEARCH}`, 200, `window.__go("product", { scroll: 0 }); window.__go("explore", { scroll: 0 })`)
  expect(backTop.slice(1).every((f) => !f.shown && f.opacity === 0), "back to Explore at the top: gone on the first frame, no fade", backTop.map((f) => f.opacity))

  /* the loading screen hands over to the page */
  await p.evaluate(() => window.__go("loading", { scroll: 0 }))
  await sleep(100)
  await p.evaluate(() => { window.__nav.view = "explore"; window.__nav.subs.forEach((f) => f()) })
  await sleep(100)
  s = await state()
  expect(!s.s.shown, "after the loading screen, at the top: none", s.s)
  await p.evaluate(() => scrollTo(0, 1400))
  await sleep(400)
  s = await state()
  expect(s.s.shown, "and scrolled past, it comes (it never did)", s.s)

  /* resize: the rule is the same at the new size */
  await p.evaluate((y) => scrollTo(0, y), Math.round(fieldDoc - hb - 10))
  await sleep(300)
  await p.setViewport({ width: vp.width === 1440 ? 1280 : 1440, height: vp.height })
  await sleep(500)
  s = await state()
  expect(s.s.shown === (s.f.bottom <= s.h), "after a resize it follows the field again", { shown: s.s.shown, fieldBottom: s.f.bottom, header: s.h })
  await p.setViewport(vp)
  await sleep(300)

  /* reload while scrolled */
  await p.evaluate(() => { history.scrollRestoration = "auto"; scrollTo(0, 1400) })
  await sleep(300)
  await p.reload()
  await sleep(900)
  s = await state()
  expect(s.y < 300 ? !s.s.shown : s.s.shown, "reloaded where it was: right for where the page is", { y: s.y, shown: s.s.shown })
  await p.close()
}

/* ========================================================================= */
async function phone() {
  console.log("\n4. The phone, 390x844")
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const p = await open(PHONE)
  await p.screenshot({ path: join(shots, "phone-top.png") })
  const strip = () => p.evaluate(() => !!document.querySelector(".fixed.inset-x-0.z-\\[35\\]"))
  expect(!(await strip()), "at the top, no strip")
  await p.evaluate(() => scrollTo(0, 1400))
  await sleep(400)
  expect(await strip(), "scrolled past the hero, the strip")
  await p.screenshot({ path: join(shots, "phone-scrolled.png") })
  await p.evaluate(() => scrollTo(0, 0))
  await sleep(300)
  await p.tap("[data-more-pill]")
  await sleep(700)
  const s = await p.evaluate(() => ({ sheet: !!document.querySelector("[data-app-sheet] [data-sheet-panel]"), panel: !!document.querySelector("[data-category-panel]") }))
  await p.screenshot({ path: join(shots, "phone-more.png") })
  expect(s.sheet && !s.panel, "More is still the bottom sheet", s)
  await p.close()
}

const only = process.env.ONLY || "more,menu,search,phone"
try {
  for (const [vp, tag] of [[WIDE, "1440"], [LAPTOP, "1280"]]) {
    if (only.includes("more")) await morePopover(vp, tag)
    if (only.includes("menu")) await headerMenu(vp, tag)
    if (only.includes("search")) await headerSearch(vp, tag)
  }
  if (only.includes("phone")) await phone()
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(`\nShots: ${shots}`)
if (broken) { console.log(`\n${broken} check(s) failed.`); process.exit(1) }
