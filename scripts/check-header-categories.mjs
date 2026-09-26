/**
 * ===========================================================================
 *  THE HEADER'S CATEGORY MENU, ON A COMPUTER AND IN THE PHONE SHEET
 * ===========================================================================
 * Renders the real PlatformHeaderClient on /explore?c=design (Supabase and
 * the router stubbed, nobody signed in) and checks:
 *
 *   on a computer, Categories opens a panel of plain rows (no icon set, no
 *   Hot badge), Design is marked as the one you are on, and opening it
 *   slides its subcategories in as a level with a back row
 *
 *   on a phone, the menu sheet is the same list at a fixed height: opening a
 *   category slides the level in without moving the sheet's top edge, the
 *   sheet follows a pull and closes, and a pick navigates where the old link
 *   went (?category=…&sub=…&scroll=recommended)
 *
 * Screenshots go to SHOTS_DIR.
 *
 *   node scripts/check-header-categories.mjs
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
const stubs = join(root, ".header-categories-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-header-cats-")), "shots")
mkdirSync(shots, { recursive: true })

const STUBS = {
  "next/navigation": `const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => log("push", h), replace: (h) => log("replace", h), prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => "/explore"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("c=design")`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }`,
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
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

await build({
  entryPoints: [join(root, "scripts/render-header-categories.tsx")],
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
const js = readFileSync(join(stubs, "app.js"), "utf8")
writeFileSync(join(stubs, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
async function open(vp) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  await p.setViewport(vp)
  await p.goto(`file://${join(stubs, "index.html")}`)
  await sleep(700)
  if (errors.length) fail(`The header threw: ${errors[0]}`)
  return p
}

console.log("\n  desktop 1280")
{
  const p = await open({ width: 1280, height: 900 })
  const clicked = await p.evaluate(() => {
    const b = [...document.querySelectorAll("[data-categories-dropdown] button")].find((x) => x.textContent.includes("Categories"))
    b?.click()
    return !!b
  })
  await sleep(300)
  const panel = await p.evaluate(() => {
    const el = document.querySelector("[data-header-categories]")
    if (!el) return null
    const b = el.getBoundingClientRect()
    const rows = [...el.querySelectorAll("[data-browse-level=root] [data-browse-row]")]
    return {
      w: Math.round(b.width), h: Math.round(b.height), rows: rows.length,
      lucide: el.querySelectorAll("svg.lucide").length, hot: /Hot/.test(el.textContent),
      design: el.querySelector('[data-browse-group="design"]')?.textContent.trim(),
      overflows: el.querySelector("[data-browse-level=root]").scrollHeight > el.querySelector("[data-browse-level=root]").clientHeight + 1,
    }
  })
  await p.screenshot({ path: join(shots, "header-1280-open.png") })
  expect(clicked && panel, "Categories opens a panel", panel)
  expect(panel && panel.lucide === 0 && !panel.hot, "plain rows: no icon set, no Hot badge", panel && { lucide: panel.lucide, hot: panel.hot })
  expect(panel && /^Design/.test(panel.design) && /All$/.test(panel.design), "Design, where Explore is, says so", panel?.design)
  expect(panel && !panel.overflows, "the whole list fits without scrolling", panel?.overflows)
  await p.click('[data-header-categories] [data-browse-group="design"]')
  await sleep(450)
  const sub = await p.evaluate(() => ({
    back: document.querySelector("[data-header-categories] [data-browse-back]")?.textContent.trim(),
    x: Math.round(document.querySelector("[data-header-categories] [data-browse-level=sub]").getBoundingClientRect().left - document.querySelector("[data-header-categories]").getBoundingClientRect().left),
  }))
  await p.screenshot({ path: join(shots, "header-1280-design.png") })
  expect(sub.back === "Design" && sub.x === 0, "Design's subcategories slide in with a back row", sub)
  await p.click('[data-header-categories] [data-browse-option="design/fonts"]')
  await sleep(200)
  const nav = await p.evaluate(() => ({ router: window.__router, open: !!document.querySelector("[data-header-categories]") }))
  expect(nav.router?.some(([k, h]) => k === "push" && h === "/explore?category=design&sub=fonts&scroll=recommended") && !nav.open, "a pick goes where the old link went, and closes", nav)
  await p.close()
}

console.log("\n  phone 390")
{
  const p = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.querySelector("span.w-\\[23px\\]") && b.offsetParent)?.click())
  await sleep(700)
  const s = await p.evaluate(() => {
    const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    if (!panel) return null
    const b = panel.getBoundingClientRect()
    const rows = [...panel.querySelectorAll("[data-browse-level=root] [data-browse-row]")]
    return { top: Math.round(b.top), h: Math.round(b.height), rows: rows.length, rowH: Math.round(rows[1]?.getBoundingClientRect().height ?? 0), lucide: panel.querySelectorAll("[data-browse-level] [data-browse-row] svg.lucide").length, signIn: /Sign in/.test(panel.textContent), library: /My Library/.test(panel.textContent), libraryUnderButtons: (() => { const lib = [...panel.querySelectorAll("a")].find((a) => a.textContent.trim() === "My Library"); const disc = [...panel.querySelectorAll("a")].find((a) => a.textContent.trim() === "Discover"); const first = panel.querySelector("[data-browse-group]"); return !!lib && !!disc && !!first && lib.getBoundingClientRect().top > disc.getBoundingClientRect().bottom && lib.getBoundingClientRect().bottom <= first.getBoundingClientRect().top + 1 })() }
  })
  await p.screenshot({ path: join(shots, "header-390-open.png") })
  expect(s && s.rows === 12, "the menu sheet lists the categories", s)
  expect(s && s.rowH >= 47 && s.rowH <= 50 && s.lucide <= 1, "48px plain rows", s && { rowH: s.rowH, lucide: s.lucide })
  expect(s && s.signIn && s.library, "sign in and My Library are still in it", s && { signIn: s.signIn, library: s.library })
  expect(s && s.libraryUnderButtons, "My Library sits under Sign in and Discover, above the categories", s?.libraryUnderButtons)
  /* "A bit more space between the drag pill and the buttons", and their labels at 550, not 500. */
  const top = await p.evaluate(() => {
    const pill = document.querySelector("[data-app-sheet] [data-sheet-handle] > div").getBoundingClientRect()
    const signIn = document.querySelector("[data-app-sheet] [data-menu-sign-in]")
    const discover = document.querySelector("[data-app-sheet] [data-menu-discover]")
    return { gap: Math.round(signIn.getBoundingClientRect().top - pill.bottom), signIn: getComputedStyle(signIn).fontWeight, discover: getComputedStyle(discover).fontWeight }
  })
  expect(top.gap >= 14 && top.gap <= 20, "16px or so between the drag pill and Sign in", top.gap)
  expect(top.signIn === "550" && top.discover === "550", "Sign in and Discover are labelled at 550", top)
  await p.evaluate(() => {
    window.__slide = []
    const sub = document.querySelector("[data-app-sheet] [data-browse-level=sub]")
    const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    const t0 = performance.now()
    const tick = () => {
      window.__slide.push({ x: new DOMMatrixReadOnly(getComputedStyle(sub).transform).m41, top: Math.round(panel.getBoundingClientRect().top) })
      if (performance.now() - t0 < 700) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector('[data-app-sheet] [data-browse-group="marketing"]').click()
  })
  await sleep(800)
  const slide = await p.evaluate(() => window.__slide)
  const xs = slide.map((f) => f.x)
  const width = await p.evaluate(() => Math.round(document.querySelector("[data-app-sheet] [data-sheet-panel]").getBoundingClientRect().width))
  /*
    Changed on purpose, and late: this asked for the old settle, a level
    that came in from 30px to the right as it faded up. The push that
    replaced it (d213e388, "more standard, smooth and clean") comes in from
    the sheet's right edge over the list, and this probe was not moved with
    it, so it failed on main. It asks for the push now, as
    scripts/check-explore-browse.mjs does for the More sheet.
  */
  expect(xs.every((x, i) => i === 0 || x <= xs[i - 1] + 0.5) && xs.at(-1) < 1 && Math.max(...xs) >= width - 2 && xs.filter((x) => x > 1 && x < width - 2).length >= 6,
    "Marketing's level is pushed in from the sheet's right edge over several frames", { width, xs: xs.filter((_, i) => i % 3 === 0).map(Math.round) })
  expect(new Set(slide.map((f) => f.top)).size === 1, "and the sheet's top does not move", [...new Set(slide.map((f) => f.top))])
  await p.screenshot({ path: join(shots, "header-390-marketing.png") })
  await p.tap("[data-app-sheet] [data-browse-back]")
  await sleep(500)
  const backAt = await p.evaluate(() => {
    const sub = document.querySelector("[data-app-sheet] [data-browse-level=sub]")
    return { x: Math.round(new DOMMatrixReadOnly(getComputedStyle(sub).transform).m41), visibility: getComputedStyle(sub).visibility }
  })
  /* The same change: back slides the level out past the right edge, where it is no longer drawn, rather than fading it. */
  expect(backAt.x >= width - 1 && backAt.visibility === "hidden", "back slides it out past the right edge, and it is no longer drawn", { ...backAt, width })
  /*
    THE PAGE BEHIND DOES NOT TAKE THE FINGER. The first few pixels of a touch
    used to be left to the browser, which chained them to the page when the
    list under the finger could not scroll that way. A 3px move is sent on
    the list at its top, both ways: down the list it can scroll, so it is
    left alone; up the list it cannot, so the sheet holds it.
  */
  const bleed = await p.evaluate(() => {
    const level = document.querySelector("[data-app-sheet] [data-browse-level=root]")
    const row = level.querySelector("[data-browse-row]")
    level.scrollTop = 0
    const b = row.getBoundingClientRect()
    const x = b.left + 40, y0 = b.top + 20
    const touch = (yy) => new Touch({ identifier: 2, target: row, clientX: x, clientY: yy })
    const send = (dy) => {
      row.dispatchEvent(new TouchEvent("touchstart", { touches: [touch(y0)], changedTouches: [touch(y0)], bubbles: true, cancelable: true }))
      const move = new TouchEvent("touchmove", { touches: [touch(y0 + dy)], changedTouches: [touch(y0 + dy)], bubbles: true, cancelable: true })
      row.dispatchEvent(move)
      row.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [touch(y0 + dy)], bubbles: true, cancelable: true }))
      return move.defaultPrevented
    }
    return { scrolls: level.scrollHeight > level.clientHeight + 1, downTheList: send(-3), upTheList: send(3) }
  })
  expect(bleed.scrolls && !bleed.downTheList && bleed.upTheList, "the list keeps the moves it can scroll, and the sheet holds the ones it cannot", bleed)
  const drag = await p.evaluate(async () => {
    const panel = document.querySelector("[data-sheet-panel]")
    const handle = panel.querySelector("[data-sheet-handle]")
    const b = handle.getBoundingClientRect()
    const y0 = Math.round(b.top + 8)
    const touch = (yy) => new Touch({ identifier: 1, target: handle, clientX: 195, clientY: yy })
    const fire = (type, yy) => handle.dispatchEvent(new TouchEvent(type, { touches: type === "touchend" ? [] : [touch(yy)], changedTouches: [touch(yy)], bubbles: true, cancelable: true }))
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()))
    fire("touchstart", y0)
    const seen = []
    for (const d of [10, 50, 120]) {
      fire("touchmove", y0 + d)
      await frame(); await frame()
      seen.push([d, Math.round(new DOMMatrixReadOnly(getComputedStyle(panel).transform).m42)])
      await new Promise((r) => setTimeout(r, 60))
    }
    fire("touchend", y0 + 120)
    await new Promise((r) => setTimeout(r, 600))
    return { seen, gone: !document.querySelector("[data-app-sheet]") }
  })
  expect(drag.seen.every(([d, y]) => Math.abs(y - d) <= 12) && drag.gone, "the sheet follows a pull and closes", drag)
  await p.close()
}

await browser.close()
if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
console.log(`\nScreenshots: ${shots}`)
if (broken) fail(`${broken} check(s) failed.`)
console.log("\nThe header's category menu is the same list, on a computer and in the phone sheet.")
