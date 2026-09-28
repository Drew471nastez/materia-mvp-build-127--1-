/**
 * ===========================================================================
 *  THE PILL ON EVERY PHONE SINCE 2015
 * ===========================================================================
 * "Reduce the overall size of the mobile bottom pill navigation by 4%. Make
 * sure it's adapted for all mobile devices, 2015 and newer, so it doesn't
 * overlap or get undersized by the different widths of phones."
 *
 * scripts/check-app-mobile-nav.mjs measures the bar at 390 and nothing else.
 * This renders the same harness (scripts/render-app-mobile-nav.tsx: the real
 * pill, the real menu page) at the widths phones actually have:
 *
 *   320  iPhone SE (1st gen), 5s
 *   360  small Android
 *   375  iPhone 6s, 7, 8, SE (2nd, 3rd gen)
 *   390  iPhone 12 to 14
 *   393  iPhone 15, 16, Pixel
 *   414  iPhone 6s Plus to 8 Plus, 11, XR
 *   430  iPhone 14 Plus to 16 Pro Max
 *
 * and reads, with the menu shut and open: the bar, the round menu button,
 * the settings circle beside it, the icons, each tab's box, the margins and
 * the gap, whether any two of them overlap, and whether anything leaves the
 * screen. Then it does the same with a 34px home indicator inset and with
 * none (iPhone 8 and SE have none), and checks the page's room under its
 * content follows the bar's height.
 *
 *   node scripts/check-app-mobile-nav-widths.mjs
 *   PROBE_CSS=source node scripts/check-app-mobile-nav-widths.mjs
 *
 * Screenshots go to SHOTS_DIR (default .nav-probe/), named nav-<width>-*.png.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)

const stubs = join(root, ".nav-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || stubs
mkdirSync(shots, { recursive: true })
const WIDTHS = (process.env.WIDTHS || "320,360,375,390,393,414,430").split(",").map(Number)
const HEIGHT = 700

/*
 * BEFORE: the pill as it measured before the 4%, from this probe run on the
 * commit before it (a fixed 63px bar with 58px slots, the same at every
 * width, 382px across with the menu open). Kept so every run prints the
 * ratio rather than asking anyone to remember it.
 */
const BEFORE = { bar: 63, slot: 58, pad: 4, barW: 240, button: 63, dot: 55, icon: 22, gap: 8, openW: 382 }
/*
 * AFTER, from 390px up: each of those times 0.96, and then on whole pixels
 * (the padding on half ones), which is what app/globals.css draws where the
 * engine can round: the icons land on a pixel of their own that way (see the
 * note on WHOLE PIXELS there). 60.48 is drawn 60, 55.68 is 56, 3.84 is 4.
 */
const snap = (n, step = 1) => Math.round((n * 0.96) / step) * step
const AFTER = {
  bar: snap(BEFORE.bar), barW: snap(BEFORE.slot) * 4 + snap(BEFORE.pad, 0.5) * 2,
  icon: snap(BEFORE.icon), gap: snap(BEFORE.gap), dot: snap(BEFORE.bar) - snap(BEFORE.pad, 0.5) * 2,
}

writeFileSync(join(stubs, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
if (!globalThis.__path) globalThis.__path = "/app"
globalThis.__goto = (p) => { globalThis.__path = p; for (const f of [...subs]) f() }
const read = () => globalThis.__path || "/app"
export const usePathname = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, read, read)
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest }, children) })
`)
writeFileSync(join(stubs, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)
const out = mkdtempSync(join(tmpdir(), "storelib-navwidths-"))
execFileSync("npx", [
  "esbuild", join(root, "scripts/render-app-mobile-nav.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@/lib/native-bridge=${join(stubs, "native-bridge.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })
writeFileSync(join(out, "index.html"),
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* Everything is read in one pass in the page: boxes to two decimals. */
const READ = `(() => {
  const r2 = (n) => Math.round(n * 100) / 100
  const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: r2(b.left), r: r2(b.right), t: r2(b.top), b: r2(b.bottom), w: r2(b.width), h: r2(b.height) } }
  const vw = window.innerWidth, vh = window.innerHeight
  const nav = document.querySelector('nav[aria-label="Main"]')
  const menu = document.querySelector('[data-app-nav-pill] button[aria-label="Menu"], [data-app-nav-pill] button[aria-label="Close menu"]')
  const settings = document.querySelector('[data-app-nav-pill] button[aria-label="Settings"]')
  const settingsShown = Number(getComputedStyle(settings).opacity) > 0.5
  const tabs = [...nav.querySelectorAll("a[aria-label]")].map((a) => ({ label: a.getAttribute("aria-label"), ...box(a) }))
  /*
    EVERY glyph, not the first one. This read the first tab's outline, which
    is Home — one of the hand-drawn icons, whose size is an svg ATTRIBUTE
    that a style beats, so it was the only glyph in the pill that was
    already the size of the box it was given. The four Solar ones were drawn
    at their own size prop instead (22px in a 21px box) and hung the extra
    pixel off their right and their bottom. The gear beside the bar is one of
    those, and it is measured here too.
  */
  const glyphs = [...document.querySelectorAll('[data-app-nav-pill] [data-part="outline"]')]
    /* The settings circle is drawn at 0.6 with the menu shut, so its glyph is
       a size nobody sees; it is measured in the state it is shown in. */
    .filter((el) => settingsShown || !el.closest('button[aria-label="Settings"]'))
    .map((el) => ({ label: el.closest("[aria-label]")?.getAttribute("aria-label") ?? "?", ...box(el) }))
  const icon = glyphs[0]
  const lens = box(nav.querySelector("[data-app-nav-lens]"))
  const menuGlyph = box(menu.querySelector("span"))
  const parts = [["bar", box(nav)], ["menu", box(menu)]]
  if (settingsShown) parts.push(["settings", box(settings)])
  let overlap = 0
  for (let i = 0; i < parts.length; i++) for (let j = i + 1; j < parts.length; j++) {
    const a = parts[i][1], b = parts[j][1]
    const x = Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l))
    const y = Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
    overlap += x * y
  }
  const offscreen = parts.filter(([, b]) => b.l < -0.01 || b.r > vw + 0.01 || b.t < 0 || b.b > vh + 0.01).map(([n]) => n)
  const left = Math.min(...parts.map(([, b]) => b.l))
  const right = Math.max(...parts.map(([, b]) => b.r))
  const scroller = document.querySelector(".app-content-scroll")
  const menuScroll = document.querySelector("[data-mobile-menu] .overflow-y-auto")
  return {
    vw, bar: box(nav), menu: box(menu), settings: settingsShown ? box(settings) : null, tabs, icon, glyphs, lens, menuGlyph,
    gap: r2(box(menu).l - box(nav).r),
    marginL: r2(left), marginR: r2(vw - right), sum: r2(left + (right - left) + (vw - right)),
    overlap: r2(overlap), offscreen,
    bottomGap: r2(vh - box(nav).b),
    docW: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    pagePad: scroller ? getComputedStyle(scroller).paddingBottom : null,
    menuPad: menuScroll ? getComputedStyle(menuScroll).paddingBottom : null,
    lastCardClear: (() => {
      scroller.scrollTop = scroller.scrollHeight
      const cards = document.querySelectorAll("[data-card]")
      const last = cards[cards.length - 1].getBoundingClientRect()
      const clear = Math.round(nav.getBoundingClientRect().top - last.bottom)
      scroller.scrollTop = 0
      return clear
    })(),
  }
})()`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const problems = []
const must = (ok, what) => { if (!ok) problems.push(what) }
const rows = []
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/* A safe area inset, where this Chromium can emulate one. */
async function inset(page, bottom) {
  const cdp = await page.createCDPSession()
  try {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: bottom ? 47 : 20, bottom, left: 0, right: 0 } })
    return true
  } catch {
    return false
  }
}

try {
  for (const w of WIDTHS) {
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.setViewport({ width: w, height: HEIGHT, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    await page.goto(`file://${join(out, "index.html")}`)
    await page.waitForSelector('nav[aria-label="Main"]')
    await wait(500)
    if (errors.length) fail(`${w}px: the page threw: ${errors[0]}`)

    const shut = await page.evaluate(READ)
    await page.screenshot({ path: join(shots, `nav-${w}-closed.png`), clip: { x: 0, y: HEIGHT - 150, width: w, height: 150 } })
    await page.evaluate("window.__menu.open()")
    await wait(700)
    const open = await page.evaluate(READ)
    await page.screenshot({ path: join(shots, `nav-${w}-open.png`), clip: { x: 0, y: HEIGHT - 150, width: w, height: 150 } })
    await page.evaluate("window.__menu.close()")
    await wait(600)

    /* The same width on a phone with a home indicator, and on one without. */
    const insets = {}
    if (await inset(page, 34)) {
      await wait(300)
      insets.home = await page.evaluate(READ)
      await page.screenshot({ path: join(shots, `nav-${w}-inset34.png`), clip: { x: 0, y: HEIGHT - 150, width: w, height: 150 } })
      await inset(page, 0)
      await wait(300)
      insets.none = await page.evaluate(READ)
    }
    await page.close()
    rows.push({ w, shut, open, insets })

    const tag = `${w}px`
    for (const [state, m] of [["shut", shut], ["open", open]]) {
      must(m.overlap === 0, `${tag} ${state}: the bar, the menu button and the settings circle overlap by ${m.overlap}px²`)
      must(m.offscreen.length === 0, `${tag} ${state}: ${m.offscreen.join(", ")} leaves the screen`)
      must(m.docW <= w, `${tag} ${state}: the page is ${m.docW}px wide, a sideways scroll`)
      must(m.marginL >= 7.5 && m.marginR >= 7.5, `${tag} ${state}: ${m.marginL}px / ${m.marginR}px from the edges`)
      must(Math.abs(m.marginL - m.marginR) <= 1, `${tag} ${state}: off centre, ${m.marginL}px left and ${m.marginR}px right`)
      must(Math.abs(m.sum - w) < 0.05, `${tag} ${state}: margins and group add up to ${m.sum}, not ${w}`)
      must(m.tabs.every((t) => t.w >= 44 && t.h >= 44), `${tag} ${state}: a tab is under 44px: ${m.tabs.map((t) => `${t.w}x${t.h}`).join(", ")}`)
      must(m.menu.w >= 44 && Math.abs(m.menu.w - m.menu.h) < 0.05, `${tag} ${state}: the menu button is ${m.menu.w}x${m.menu.h}`)
      must(Math.abs(m.menu.h - m.bar.h) < 0.05, `${tag} ${state}: the menu button (${m.menu.h}) and the bar (${m.bar.h}) differ in height`)
      must(Math.abs(m.lens.w - m.lens.h) < 0.05, `${tag} ${state}: the lens is ${m.lens.w}x${m.lens.h}, not a circle`)
      must(m.glyphs.every((g) => g.w >= 18), `${tag} ${state}: the icons are ${m.glyphs.map((g) => g.w).join(", ")}px`)
      /* EVERY glyph the box it was given, the gear included, and square. A
         glyph drawn larger than its box does not sit in the middle of the
         circle around it — see the centring section of
         scripts/check-app-mobile-nav.mjs. */
      must(m.glyphs.every((g) => Math.abs(g.w - m.glyphs[0].w) < 0.05 && Math.abs(g.h - g.w) < 0.05),
        `${tag} ${state}: the glyphs are not one square size: ${m.glyphs.map((g) => `${g.label} ${g.w}x${g.h}`).join(", ")}`)
    }
    must(open.settings && Math.abs(open.settings.w - open.settings.h) < 0.05 && Math.abs(open.settings.w - open.menu.w) < 0.05,
      `${tag}: the settings circle is ${open.settings?.w}x${open.settings?.h} beside a ${open.menu.w}px menu button`)
    must(Math.abs(open.bar.w - shut.bar.w) < 0.05 && Math.abs(open.bar.h - shut.bar.h) < 0.05, `${tag}: the bar changes size when the menu opens`)
    must(shut.bottomGap >= 4, `${tag}: the pill is ${shut.bottomGap}px off the bottom edge`)
    must(shut.lastCardClear > 0, `${tag}: the last card ends ${-shut.lastCardClear}px under the pill`)
    /* At or above 390 the pill is at its full size: 4% under BEFORE, on whole pixels. */
    if (w >= 390) {
      for (const [what, got, want] of [["bar's height", shut.bar.h, AFTER.bar], ["bar's width", shut.bar.w, AFTER.barW], ["menu button", shut.menu.w, AFTER.bar],
        ["lens", shut.lens.w, AFTER.dot], ["icons", Math.max(...shut.glyphs.map((g) => g.w)), AFTER.icon], ["gap", shut.gap, AFTER.gap]]) {
        must(Math.abs(got - want) < 0.05, `${tag}: the ${what} is ${got}px, not ${want}`)
      }
    }
    /* Narrower, it is smaller than that and never larger. */
    must(shut.bar.h <= AFTER.bar + 0.05 && shut.bar.w <= AFTER.barW + 0.05, `${tag}: the bar is ${shut.bar.w}x${shut.bar.h}, over its full size`)
    /* With a home indicator the pill sits on it; without one, 4px off the edge. */
    if (insets.home) {
      must(Math.abs(insets.home.bottomGap - 34) < 0.5, `${tag}: with a 34px inset the pill is ${insets.home.bottomGap}px off the bottom`)
      must(Math.abs(insets.none.bottomGap - 4) < 0.5, `${tag}: with no inset the pill is ${insets.none.bottomGap}px off the bottom`)
      must(insets.home.lastCardClear > 0, `${tag}: with a 34px inset the last card ends under the pill`)
    }
  }

  /*
   * EVERY WIDTH BETWEEN, a pixel at a time, shut and open. Each length is
   * rounded to a whole pixel on its own, so the group's width is not a smooth
   * function of the screen's, and a width nobody listed could be the one
   * where the rounding adds up against it. Transitions off: this is geometry.
   */
  const page = await browser.newPage()
  await page.setViewport({ width: 320, height: HEIGHT, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await page.goto(`file://${join(out, "index.html")}`)
  await page.waitForSelector('nav[aria-label="Main"]')
  await page.addStyleTag({ content: "*,*::before,*::after{transition:none!important}" })
  let worst = null
  for (let w = 320; w <= 430; w++) {
    await page.setViewport({ width: w, height: HEIGHT, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    for (const state of ["shut", "open"]) {
      await page.evaluate(state === "open" ? "window.__menu.open()" : "window.__menu.close()")
      await wait(60)
      const m = await page.evaluate(READ)
      const margin = Math.min(m.marginL, m.marginR)
      if (!worst || margin < worst.margin) worst = { w, state, margin }
      if (m.overlap || m.offscreen.length || m.docW > w || margin < 6 || m.tabs.some((t) => t.w < 44 || t.h < 44) || Math.abs(m.marginL - m.marginR) > 1) {
        problems.push(`${w}px ${state}: overlap ${m.overlap}, off screen [${m.offscreen.join(", ")}], margins ${m.marginL}/${m.marginR}, tabs ${m.tabs[0].w}x${m.tabs[0].h}`)
      }
    }
  }
  await page.close()
  console.log(`\n  every width from 320 to 430, shut and open: the closest the group comes to an edge is ${worst.margin}px (${worst.w}px, ${worst.state})`)
} finally {
  await browser.close()
}

/* ── the report ─────────────────────────────────────────────────────────── */
const f = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
console.log("\nThe pill at each width, menu shut (open in brackets where it differs)\n")
console.log("  width   bar w x h        button  lens   icon   tab boxes      gap    margins L/R           open group  overlap  off  page pad   last card")
for (const { w, shut, open } of rows) {
  const tab = shut.tabs[0]
  console.log(
    `  ${String(w).padEnd(6)}  ${`${f(shut.bar.w)} x ${f(shut.bar.h)}`.padEnd(15)}  ${f(shut.menu.w).padEnd(6)}  ${f(shut.lens.w).padEnd(5)}  ${f(shut.icon.w).padEnd(5)}  ${`${f(tab.w)} x ${f(tab.h)}`.padEnd(13)}  ${f(shut.gap).padEnd(5)}  ${`${f(shut.marginL)}/${f(shut.marginR)} (${f(open.marginL)}/${f(open.marginR)})`.padEnd(21)} ${f(open.menu.r - (open.settings?.l ?? open.bar.l)).padEnd(10)}  ${f(shut.overlap + open.overlap).padEnd(7)}  ${String(shut.offscreen.length + open.offscreen.length).padEnd(3)}  ${String(shut.pagePad).padEnd(9)}  ${shut.lastCardClear}px`,
  )
}
const full = rows.find((r) => r.w >= 390)
if (full) {
  console.log(`\n  before: a ${BEFORE.bar}px bar, ${BEFORE.barW}px wide, ${BEFORE.button}px button, ${BEFORE.icon}px icons, ${BEFORE.gap}px gap, at every width (${BEFORE.openW}px with the menu open)`)
  console.log(`  after, from 390: ${f(full.shut.bar.h)}px bar (${((full.shut.bar.h / BEFORE.bar) * 100).toFixed(2)}%), ${f(full.shut.bar.w)}px wide (${((full.shut.bar.w / BEFORE.barW) * 100).toFixed(2)}%), ${f(full.shut.menu.w)}px button, ${f(full.shut.lens.w)}px lens, ${f(full.shut.icon.w)}px icons, ${f(full.shut.gap)}px gap`)
  const groupBefore = (BEFORE.barW + BEFORE.gap + BEFORE.button) * BEFORE.bar
  const groupAfter = (full.shut.bar.w + full.shut.gap + full.shut.menu.w) * full.shut.bar.h
  console.log(`  the group shut: ${BEFORE.barW + BEFORE.gap + BEFORE.button} x ${BEFORE.bar} before, ${f(full.shut.bar.w + full.shut.gap + full.shut.menu.w)} x ${f(full.shut.bar.h)} after: ${((groupAfter / groupBefore) * 100).toFixed(2)}% of the area (4% smaller each way is 92.16%)`)
}
const withInsets = rows.filter((r) => r.insets.home)
if (withInsets.length) {
  console.log("\n  safe area: pill bottom off the screen edge, and the last card's clearance")
  for (const { w, insets } of withInsets) {
    console.log(`  ${String(w).padEnd(6)}  34px inset: ${f(insets.home.bottomGap)}px, page pad ${insets.home.pagePad}, last card ${insets.home.lastCardClear}px   no inset: ${f(insets.none.bottomGap)}px`)
  }
} else {
  console.log("\n  (this Chromium cannot emulate a safe area inset; only the 0px case was measured)")
}
console.log(`\n  screenshots: ${shots}/nav-<width>-closed.png, -open.png${withInsets.length ? ", -inset34.png" : ""}`)
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`)
  process.exit(1)
}
console.log("\nEvery width: nothing overlaps, nothing leaves the screen, every tab is at least 44px.")
