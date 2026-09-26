/**
 * ===========================================================================
 *  ONE TAP OPENS A CATEGORY, EVERY TIME
 * ===========================================================================
 * "Tapping a category to go into its subcategories does nothing, feels
 * glitchy, and only works if you tap again a few seconds later." Measured
 * here with real touches (the browser's own touch input, not a click() on
 * the element) on a 390 x 844 phone, in the two sheets that hold the
 * category list: Explore's More sheet and the header's menu sheet.
 *
 * WHY A PHONE DROPPED THE TAP AND THIS BROWSER DID NOT. On an iPhone
 * (Safari, and the app's WKWebView) WebKit watches what a page does while a
 * finger is coming down. If something that holds a control appears between
 * the press and the click (goes from hidden to visible, or is added), it
 * reads the tap as having opened a hover menu, shows that, and sends no
 * click: the second tap, with nothing new appearing, is the one that works.
 * WebKit's ContentChangeObserver does this; Chromium has no such thing, so
 * a click here arrives either way. The list used to draw a category's
 * level on the press, before the tap, and made its hidden level visible
 * with ten buttons in it: exactly what WebKit swallows the click for. So
 * each case below records every control in the sheet a person could see
 * when the finger came down, and at the click, before the page hears it,
 * counts the ones that were not there before. It must be none.
 *
 * Each case also lifts the finger and asks, frame by frame, whether the
 * tapped category's level is on screen (at least half way in, its back row
 * naming the category) within 300ms, and at rest soon after:
 *
 *   a tap while the sheet is still rising
 *   a tap the moment it has arrived
 *   a tap right after a scroll of the list, the finger lifted and put down
 *   a tap that wobbles by a couple of pixels, as a thumb does
 *   a tap on another category the moment back has been pressed
 *
 * Screenshots go to SHOTS_DIR (a temporary folder by default).
 *
 *   node scripts/check-explore-drill.mjs
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
const stubs = join(root, ".explore-drill-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-explore-drill-")), "shots")
mkdirSync(shots, { recursive: true })

const COMMON = {
  "next-link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })`,
  "next-image": `import React from "react"
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
    channel: () => chain(),
    removeChannel() {},
  }
}`,
}
const navigation = (search) => `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(${search})
export const useParams = () => ({ category: window.__category })`
for (const [k, v] of Object.entries(COMMON)) writeFileSync(join(stubs, `${k}.jsx`), v)

async function bundle(name, entry, search) {
  writeFileSync(join(stubs, `navigation-${name}.jsx`), navigation(search))
  await build({
    entryPoints: [join(root, entry)],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, `${name}.js`),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, `navigation-${name}.jsx`) }))
        b.onResolve({ filter: /^next\/(link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace("/", "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, `${name}.js`), "utf8")
  writeFileSync(join(stubs, `${name}.html`), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)
}
await bundle("explore", "scripts/render-explore-page.tsx", `window.__search || ""`)
await bundle("header", "scripts/render-header-categories.tsx", `"c=design"`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(name, hash = "") {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(PHONE)
  await p.goto(`file://${join(stubs, `${name}.html`)}${hash}`)
  await p.evaluate(() => document.fonts.ready)
  await sleep(600)
  if (errors.length) fail(`The ${name} page threw: ${errors[0]}`)
  return p
}

/** Where something in the open sheet is on screen now, or null. */
const boxOf = (p, selector) => p.evaluate((selector) => {
  const el = document.querySelector(`[data-app-sheet="open"] ${selector}`)
  if (!el) return null
  const b = el.getBoundingClientRect()
  return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, bottom: b.bottom }
}, selector)

/**
 * A finger: down, held for as long as a tap takes, lifted. `wobble` moves it
 * a pixel or two while it is down, as a thumb does.
 */
async function tap(p, x, y, { hold = 60, wobble = 0 } = {}) {
  await p.touchscreen.touchStart(x, y)
  if (wobble) {
    await sleep(hold / 2)
    await p.touchscreen.touchMove(x, y + wobble)
    await sleep(hold / 2)
  } else await sleep(hold)
  await p.touchscreen.touchEnd()
}

/** A finger drawn up the list by `dy` and lifted, the way a scroll is done. */
async function scrollList(p, x, y, dy, steps = 10) {
  await p.touchscreen.touchStart(x, y)
  for (let i = 1; i <= steps; i++) {
    await p.touchscreen.touchMove(x, y - (dy * i) / steps)
    await sleep(12)
  }
  await sleep(60)
  await p.touchscreen.touchEnd()
}

/**
 * Every frame for `ms`: where the level is (its left edge from the sheet's,
 * 0 is fully in) and what its back row says, on the page's own clock. It
 * also hears the finger: which category row it came down on, and when it
 * lifted, so the times are from the lift.
 */
const watch = (p, ms = 700) => p.evaluate((ms) => new Promise((resolve) => {
  const panel = document.querySelector('[data-app-sheet="open"] [data-sheet-panel]')
  const sub = panel?.querySelector("[data-browse-level=sub]")
  if (!sub) { resolve({ frames: [], width: 0 }); return }
  const width = panel.getBoundingClientRect().width
  const t0 = performance.now()
  const frames = []
  const finger = { pressed: null, liftedAt: null, clicks: 0, appeared: [] }
  /* The controls in the sheet a person could see: laid out, visible, not faded to nothing. */
  const CONTROLS = "button, a[href], [role=button], input"
  const shown = (el) => {
    if (!el.isConnected || !el.getClientRects().length || getComputedStyle(el).visibility !== "visible") return false
    for (let a = el; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).opacity === "0") return false
    return true
  }
  let before = null
  /* On window, capturing: before anything of the page's own hears the press or the click. */
  const down = (e) => {
    if (before) return
    before = new Set([...panel.querySelectorAll(CONTROLS)].filter(shown))
    finger.pressed = e.target.closest?.("[data-browse-group]")?.querySelector("span")?.textContent.trim() ?? null
  }
  const up = () => { finger.liftedAt = performance.now() - t0 }
  const click = (e) => {
    if (!e.target.closest?.("[data-browse-group]")) return
    finger.clicks++
    if (before) finger.appeared = [...panel.querySelectorAll(CONTROLS)].filter((el) => shown(el) && !before.has(el)).map((el) => el.textContent.trim().slice(0, 24))
  }
  window.addEventListener("pointerdown", down, true)
  window.addEventListener("touchend", up, true)
  window.addEventListener("click", click, true)
  const tick = () => {
    const b = sub.getBoundingClientRect()
    frames.push({
      t: performance.now() - t0,
      x: Math.round(b.left - panel.getBoundingClientRect().left),
      shown: getComputedStyle(sub).visibility === "visible" && !sub.inert,
      back: sub.querySelector("[data-browse-back]")?.textContent.trim() ?? null,
    })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    else {
      window.removeEventListener("pointerdown", down, true)
      window.removeEventListener("touchend", up, true)
      window.removeEventListener("click", click, true)
      resolve({ frames, width, finger })
    }
  }
  tick()
}), ms)

/**
 * What a watch says: when, after the lift, the level of the row the finger
 * came down on was half way in, and whether it came to rest there.
 */
function read(w) {
  const { pressed, liftedAt, clicks, appeared = [] } = w.finger ?? {}
  const lift = liftedAt ?? 0
  const half = w.frames.find((f) => f.t >= lift && f.shown && f.x <= w.width / 2 && f.back === pressed)
  const last = w.frames[w.frames.length - 1]
  return {
    pressed, clicks, appeared: appeared.length, appearedFirst: appeared.slice(0, 3),
    halfInBy: half && pressed ? Math.round(half.t - lift) : null,
    restsIn: !!last && !!pressed && last.shown && last.x === 0 && last.back === pressed,
    lastX: last?.x ?? null,
  }
}

/** Taps `group`, watching from before the finger comes down. */
async function drill(p, group, how = {}) {
  const at = await boxOf(p, `[data-browse-group="${group}"]`)
  if (!at) return { halfInBy: null, restsIn: false, missing: true }
  const seen = watch(p)
  await tap(p, at.x, at.y, how)
  return read(await seen)
}

async function back(p) {
  const at = await boxOf(p, "[data-browse-back]")
  if (at) await tap(p, at.x, at.y)
}

const SOON = 300
/* Whether the sheet is up with its list in it, asked every frame for a little while. */
const sheetUp = (p) => p.waitForFunction(() => !!document.querySelector('[data-app-sheet="open"] [data-browse-level=root]'), { polling: "raf", timeout: 400 }).then(() => true, () => false)

async function cases(title, name, hash, opener, first, second) {
  console.log(`\n${title}`)
  const report = {}
  const check = (key, what, r) => {
    report[key] = r
    expect(r.appeared === 0 && r.clicks === 1 && r.halfInBy !== null && r.halfInBy <= SOON && r.restsIn, what, r)
  }

  /* Still rising: the finger lands on the row as the sheet comes up under it. */
  {
    const p = await open(name, hash)
    await opener(p)
    await sleep(120)
    check("rising", "one tap while the sheet is still rising opens the category", await drill(p, first))
    await p.screenshot({ path: join(shots, `${name}-rising.png`) })
    await p.close()
  }
  /* Just arrived. */
  {
    const p = await open(name, hash)
    await opener(p)
    await sleep(460)
    check("arrived", "one tap the moment it has arrived opens the category", await drill(p, first))
    await p.screenshot({ path: join(shots, `${name}-arrived.png`) })
    /* Back, and straight into another. */
    await back(p)
    await sleep(40)
    check("afterBack", "one tap on another category right after back opens that one", await drill(p, second))
    await p.close()
  }
  /* A thumb that wobbles. */
  {
    const p = await open(name, hash)
    await opener(p)
    await sleep(600)
    check("wobble", "a tap that moves 2px while down still opens it", await drill(p, first, { wobble: 2 }))
    await p.close()
  }
  /* After a scroll: the finger scrolls the list, lifts, and taps at once. */
  {
    const p = await open(name, hash)
    await opener(p)
    await sleep(600)
    const list = await boxOf(p, "[data-browse-level=root]")
    await scrollList(p, 195, Math.round(list.bottom - 80), 220)
    await sleep(40)
    const scrolled = await p.evaluate(() => Math.round(document.querySelector('[data-app-sheet="open"] [data-browse-level=root]').scrollTop))
    const r = await drill(p, second)
    check("afterScroll", `one tap right after a scroll opens the category (the list had scrolled ${scrolled}px)`, { ...r, scrolled })
    await p.screenshot({ path: join(shots, `${name}-after-scroll.png`) })
    await p.close()
  }
  return report
}

const results = {}
results.more = await cases(
  "1. Explore's More sheet",
  "explore",
  "#page",
  async (p) => {
    /* The pill is at the end of a row that scrolls sideways: brought into view first, as a thumb would. */
    const at = await p.evaluate(() => {
      const pill = document.querySelector("[data-more-pill]")
      pill.scrollIntoView({ block: "center", inline: "center" })
      const b = pill.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    await sleep(100)
    await tap(p, at.x, at.y)
    if (!(await sheetUp(p))) fail("More did not open its sheet.")
  },
  "design",
  "photography",
)
results.header = await cases(
  "2. The header's menu sheet",
  "header",
  "",
  async (p) => {
    const at = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.querySelector("span.w-\\[23px\\]") && x.offsetParent)?.getBoundingClientRect()
      return b ? { x: b.left + b.width / 2, y: b.top + b.height / 2 } : null
    })
    if (!at) fail("No hamburger in the header.")
    await tap(p, at.x, at.y)
    if (!(await sheetUp(p))) fail("The hamburger did not open the menu sheet.")
  },
  "design",
  "marketing",
)
writeFileSync(join(shots, "drill.json"), JSON.stringify(results, null, 1))

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nOne tap opens a category in both sheets: while rising, on arrival, after a scroll, after back, and with a wobble.")
