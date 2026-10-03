/**
 * ===========================================================================
 *  THE HEADER'S DRAWERS, MEASURED IN A BROWSER
 * ===========================================================================
 * The report: in the editor's DESKTOP preview, changing Header › Menu on
 * phones to "Slides in from the left" drew the phone menu across the middle
 * of the page, clipped, half over the site. A phone menu must never exist on
 * a desktop layout, and previewing it must look like the real drawer at the
 * real size.
 *
 * This mounts the real header (scripts/render-header-drawers.tsx) in the
 * editor's canvas at desktop and at phone size, and on a published page at
 * 1280 and 390 wide, and reports:
 *
 *   desktop    is a menu drawer in the page at all, through every style (must be no)
 *   phone      the drawer's rectangle for each style, inside the canvas
 *   live 390   drawer rect, z order (backdrop over header, panel over backdrop),
 *              scroll lock layout shift in px (must be 0), offset restored,
 *              focus inside while open and back on the hamburger after,
 *              sub-menu slides in with Back
 *   one open   menu then cart then search: never more than one open
 *   live 1280  no menu drawer; the cart's lock moves nothing with a scrollbar
 *
 *   node scripts/check-header-drawers.mjs
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".header-drawers-probe")
mkdirSync(dir, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)

const css = await appCss(root)
const entry = process.env.HEADER_PROBE_ENTRY || "scripts/render-header-drawers.tsx"
execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:next/image=${join(dir, "next-image.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })

/* The canvas, copied from app/website-builder/editor/[installId]/page.tsx. */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"
const filler = `<main id="content" style="padding:24px"><p id="marker" style="margin:0 0 16px;font:600 28px/1.2 system-ui">Put your experience into words</p>${"<p style='height:120px;margin:0 0 12px;background:#f1f1f1'></p>".repeat(30)}</main>`
const html = (body) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>${body}<script src="probe.js"></script></body></html>`
writeFileSync(join(dir, "live.html"), html(`<div id="mount" style="display:contents"></div>${filler}`))
writeFileSync(join(dir, "editor-desktop.html"), html(`<div style="width:1100px;height:760px;position:relative;overflow:hidden"><div id="wb-preview-root" class="${CANVAS_CLASS}"><div id="mount" style="display:contents"></div>${filler}</div></div>`))
/* The sticky pages: an announcement bar above the header, as ThemePage draws it, inside one page root. */
const bar = `<div id="bar" style="height:40px;background:#111;color:#fff;font:13px/40px system-ui;text-align:center">Free shipping this week</div>`
writeFileSync(join(dir, "sticky-live.html"), html(`<div id="root">${bar}<div id="mount" style="display:contents"></div>${filler}</div>`))
writeFileSync(join(dir, "editor-sticky.html"), html(`<div style="width:1100px;height:760px;position:relative;overflow:hidden"><div id="wb-preview-root" class="${CANVAS_CLASS}">${bar}<div id="mount" style="display:contents"></div>${filler}</div></div>`))
writeFileSync(join(dir, "editor-phone.html"),html(`<div style="width:390px;height:720px;position:relative;overflow:hidden;margin-left:300px"><div id="wb-preview-root" class="${CANVAS_CLASS}"><div id="mount" style="display:contents"></div>${filler}</div></div>`))

const HELPERS = `
  window.__wait = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  window.__shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden"
  /* What is open: a drawer that says it is a modal, or the search panel showing. */
  window.__openNow = () => {
    const out = []
    for (const d of document.querySelectorAll('[data-site-drawer]')) if (d.getAttribute("aria-modal") === "true" && window.__shown(d)) out.push(d.getAttribute("data-site-drawer"))
    const search = [...document.querySelectorAll('[data-self-nav][aria-hidden="false"]')].find((el) => !el.closest('[data-site-drawer]'))
    if (search) out.push("search")
    return out
  }
`

/* Real scrollbars, so the lock's scrollbar compensation is measured rather
   than assumed: puppeteer hides them by default. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)
const report = {}

async function open(file, width, height, settings = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.evaluateOnNewDocument(HELPERS)
  await page.goto(`file://${join(dir, file)}?scenario=${file.replace(".html", "")}&settings=${encodeURIComponent(JSON.stringify(settings))}`)
  await page.waitForFunction(() => window.__ready === true, { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 300))
  return page
}

try {
  /* ── 1. The editor, desktop preview: the report ─────────────────────── */
  console.log("\nEditor, desktop preview, 1100px canvas")
  {
    const page = await open("editor-desktop.html", 1280, 800)
    const seen = []
    for (const style of ["left", "right", "full", "left", "right"]) {
      const r = await page.evaluate(async (style) => {
        window.__set({ mobile_menu_style: style })
        const samples = []
        for (let i = 0; i < 12; i++) {
          await window.__wait(50)
          const d = document.querySelectorAll('[data-site-drawer="menu"]')
          samples.push(d.length)
        }
        const visibleDialogs = [...document.querySelectorAll('[role="dialog"]')].filter((d) => window.__shown(d)).map((d) => d.getAttribute("aria-label"))
        return { style, maxMenuDrawers: Math.max(...samples), visibleDialogs }
      }, style)
      seen.push(r)
    }
    report.editorDesktop = seen
    console.log(`  ${JSON.stringify(seen)}`)
    const present = seen.some((r) => r.maxMenuDrawers > 0 || r.visibleDialogs.length > 0)
    console.log(`  drawer present on desktop: ${present}`)
    present ? fail("a menu drawer exists on the desktop canvas") : ok("no menu drawer on the desktop canvas through left, right, full, left, right")
    await page.close()
  }

  /* ── 2. The editor, phone preview ───────────────────────────────────── */
  console.log("\nEditor, phone preview, 390px canvas")
  {
    const page = await open("editor-phone.html", 1280, 800)
    const rows = []
    for (const style of ["right", "full", "left"]) {
      const r = await page.evaluate(async (style) => {
        window.__set({ mobile_menu_style: style })
        await window.__wait(700)
        const canvas = window.__rect(document.getElementById("wb-preview-root"))
        const d = document.querySelector('[data-site-drawer="menu"]')
        const res = { style, opened: !!d && d.getAttribute("aria-modal") === "true", rect: window.__rect(d), canvas }
        res.inside = !!res.rect && res.rect.x >= canvas.x - 1 && res.rect.x + res.rect.w <= canvas.x + canvas.w + 1 && res.rect.y >= canvas.y - 1 && res.rect.y + res.rect.h <= canvas.y + canvas.h + 1
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
        await window.__wait(600)
        res.goneAfterClose = document.querySelectorAll('[data-site-drawer="menu"]').length === 0
        return res
      }, style)
      rows.push(r)
      console.log(`  ${JSON.stringify(r)}`)
      if (!r.opened) fail(`${style}: changing the setting in the phone preview did not show the drawer`)
      if (!r.inside) fail(`${style}: the drawer is not inside the phone canvas`)
      if (!r.goneAfterClose) fail(`${style}: the drawer is still in the page after closing`)
    }
    report.editorPhone = rows
    if (rows.every((r) => r.opened && r.inside && r.goneAfterClose)) ok("each style previews as the real drawer inside the phone canvas, and leaves the page on close")
    await page.close()
  }

  /* ── 3. Published, 390 wide ──────────────────────────────────────────── */
  /*
    The menu opens UNDER the header (Dawn's way): the header keeps its place
    and its opacity, the hamburger is the close, and the panel and backdrop
    start at the header's bottom edge. The opening is filmed a frame at a
    time: how long the slide takes, how many frames it is drawn in, the
    longest gap between two frames, and whether it only ever moves one way.
  */
  for (const style of ["left", "right", "full"]) {
    console.log(`\nPublished, 390px, menu ${style}`)
    const page = await open("live.html", 390, 760, { mobile_menu_style: style })
    await page.evaluate(async () => {
      window.scrollTo(0, 600)
      await window.__wait(100)
      window.__before = { marker: window.__rect(document.getElementById("marker")) }
      window.__burger = [...document.querySelectorAll('button[aria-label="Open menu"]')].find(window.__shown)
      window.__burger.focus()
    })
    const r = await page.evaluate(async () => {
      const res = {}
      res.drawerBeforeOpen = document.querySelectorAll('[data-site-drawer="menu"]').length
      const burger = window.__burger
      const header = burger.closest("[data-section]")
      const headerRect = window.__rect(header)
      /* The film. */
      const film = []
      let last = performance.now()
      const t0 = last
      let watching = true
      const tick = (now) => {
        const d = document.querySelector('[data-site-drawer="menu"]')
        const b = document.querySelector("[data-site-drawer-backdrop]")
        if (d) {
          const m = new DOMMatrixReadOnly(getComputedStyle(d).transform)
          film.push({ t: Math.round(now - t0), gap: Math.round(now - last), x: Math.round(m.m41), y: Math.round(m.m42), fade: b ? Number(getComputedStyle(b).opacity) : 0, header: Number(getComputedStyle(header).opacity) })
        }
        last = now
        if (watching) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      burger.click()
      await window.__wait(700)
      watching = false
      const moving = film.filter((f) => f.x !== 0 || f.y !== 0)
      const settledAt = film.find((f, i) => i > 0 && f.x === 0 && f.y === 0 && film[i - 1] && (film[i - 1].x !== 0 || film[i - 1].y !== 0))
      const travel = film.map((f) => Math.abs(f.x) + Math.abs(f.y))
      res.motion = {
        slideMs: settledAt ? settledAt.t - (moving[0]?.t ?? 0) : null,
        framesDrawn: moving.length,
        longestFrameGapMs: Math.max(...film.map((f) => f.gap)),
        oneWay: travel.every((v, i) => i === 0 || v <= travel[i - 1] + 1),
        backdropEnd: film.at(-1)?.fade,
        headerOpacityMin: Math.min(...film.map((f) => f.header)),
      }
      const d = document.querySelector('[data-site-drawer="menu"]')
      const backdrop = document.querySelector("[data-site-drawer-backdrop]")
      res.rect = window.__rect(d)
      res.headerBottom = headerRect.y + headerRect.h
      res.backdropTop = window.__rect(backdrop).y
      res.z = { backdrop: getComputedStyle(backdrop).zIndex, panel: getComputedStyle(d).zIndex, header: getComputedStyle(header).zIndex }
      const pr = d.getBoundingClientRect()
      const inPanel = document.elementFromPoint(pr.left + pr.width / 2, pr.top + 60)
      res.topOfPanelIsPanel = !!inPanel && d.contains(inPanel)
      const onHeader = document.elementFromPoint(burger.getBoundingClientRect().left + 10, burger.getBoundingClientRect().top + 10)
      res.hamburgerReachable = !!onHeader && burger.contains(onHeader)
      res.hamburgerSays = burger.getAttribute("aria-label")
      res.layoutShiftPx = Math.max(Math.abs(window.__rect(document.getElementById("marker")).x - window.__before.marker.x), Math.abs(window.__rect(document.getElementById("marker")).y - window.__before.marker.y))
      res.focused = document.activeElement?.getAttribute("aria-label") || document.activeElement?.textContent?.trim()
      return res
    })
    /* Tab with the real keyboard, twice round: focus stays in the menu or on the hamburger. */
    let escaped = 0
    const ring = new Set()
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press("Tab")
      const where = await page.evaluate(() => {
        const a = document.activeElement
        const d = document.querySelector('[data-site-drawer="menu"]')
        return { inMenu: !!d && d.contains(a), onBurger: a === window.__burger, name: a?.getAttribute("aria-label") || a?.textContent?.trim().slice(0, 20) }
      })
      if (!where.inMenu && !where.onBurger) escaped++
      ring.add(where.name)
    }
    r.tabEscapes = escaped
    r.tabRing = [...ring]
    const rest = await page.evaluate(async () => {
      const res = {}
      const d = document.querySelector('[data-site-drawer="menu"]')
      const row = [...d.querySelectorAll("[data-submenu-trigger]")][0]
      row.focus()
      row.click()
      await window.__wait(450)
      const back = d.querySelector('button[aria-label="Back to main menu"]')
      const sub = [...d.querySelectorAll("nav a")].filter((a) => a.getClientRects().length && !a.closest("[inert]")).map((a) => a.textContent.trim())
      res.submenu = { links: sub, backFocused: document.activeElement === back, backReads: back?.textContent?.trim() }
      back.click()
      await window.__wait(450)
      res.submenu.returnedTo = document.activeElement?.textContent?.trim()
      /* The hamburger closes it, and the page is let go where it was. */
      window.__burger.click()
      await window.__wait(600)
      res.afterClose = {
        drawers: document.querySelectorAll('[data-site-drawer="menu"]').length,
        scrollY: Math.round(scrollY),
        bodyPosition: document.body.style.position || "static",
        focusBackOnHamburger: document.activeElement === window.__burger,
        markerShiftPx: Math.abs(window.__rect(document.getElementById("marker")).y - window.__before.marker.y),
      }
      return res
    })
    Object.assign(r, rest)
    report[`live390_${style}`] = r
    console.log(`  ${JSON.stringify(r)}`)
    const before = broken
    if (r.drawerBeforeOpen !== 0) fail("a closed menu drawer is in the page")
    if (Math.abs(r.rect.y - r.headerBottom) > 1 || Math.abs(r.backdropTop - r.headerBottom) > 1) fail(`the menu does not start under the header (panel ${r.rect.y}, backdrop ${r.backdropTop}, header bottom ${r.headerBottom})`)
    if (r.motion.headerOpacityMin < 1) fail(`the header faded to ${r.motion.headerOpacityMin} while the menu opened`)
    if (!r.hamburgerReachable || r.hamburgerSays !== "Close menu") fail("the hamburger is not the close while the menu is open")
    if (!(r.motion.slideMs >= 240 && r.motion.slideMs <= 360)) fail(`the slide took ${r.motion.slideMs}ms`)
    if (!r.motion.oneWay) fail("the slide went back on itself")
    if (r.motion.longestFrameGapMs > 50) fail(`a ${r.motion.longestFrameGapMs}ms gap between frames while opening`)
    if (!(Number(r.z.panel) > Number(r.z.backdrop))) fail(`z order wrong: ${JSON.stringify(r.z)}`)
    if (!r.topOfPanelIsPanel) fail("the panel is not the topmost thing inside its own rectangle")
    if (r.layoutShiftPx !== 0) fail(`opening moved the page ${r.layoutShiftPx}px`)
    if (r.tabEscapes > 0) fail(`focus left the menu on ${r.tabEscapes} of 18 Tabs`)
    if (!r.submenu.backFocused || r.submenu.links.join() !== "LinkedIn posts,Newsletters") fail(`sub-menu: ${JSON.stringify(r.submenu)}`)
    if (r.afterClose.drawers !== 0 || r.afterClose.scrollY !== 600 || r.afterClose.bodyPosition !== "static" || !r.afterClose.focusBackOnHamburger) fail(`after close: ${JSON.stringify(r.afterClose)}`)
    if (broken === before) ok(`menu ${style}: under the header at ${r.rect.y}px, slide ${r.motion.slideMs}ms in ${r.motion.framesDrawn} frames (longest gap ${r.motion.longestFrameGapMs}ms), header opacity ${r.motion.headerOpacityMin}, shift ${r.layoutShiftPx}px`)
    await page.close()
  }

  /* ── 4. One open at a time ───────────────────────────────────────────── */
  console.log("\nOne open at a time, published, 390px")
  {
    const page = await open("live.html", 390, 760)
    const r = await page.evaluate(async () => {
      const res = { maxOpenAtOnce: 0, timeline: [] }
      const sample = async (label, ms) => {
        const end = performance.now() + ms
        while (performance.now() < end) {
          const now = window.__openNow()
          res.maxOpenAtOnce = Math.max(res.maxOpenAtOnce, now.length)
          await window.__wait(25)
        }
        res.timeline.push(`${label}: ${window.__openNow().join("+") || "none"}`)
      }
      const burger = [...document.querySelectorAll('button[aria-label="Open menu"]')].find(window.__shown)
      burger.click()
      await sample("menu", 600)
      window.__openCart()
      await sample("add to cart while the menu is open", 700)
      const lockHolders = document.body.style.position
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await sample("escape", 600)
      res.bodyAfterCartClose = document.body.style.position || "static"
      res.bodyWhileHandover = lockHolders
      const searchBtn = [...document.querySelectorAll('button[aria-label="Search"]')].find(window.__shown)
      searchBtn.click()
      await sample("search", 400)
      window.__openCart()
      await sample("add to cart while search is open", 700)
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await sample("escape", 600)
      /* The menu's own Search row: the menu closes, then search opens. */
      burger.click()
      await sample("menu again", 600)
      const row = [...document.querySelectorAll('[data-site-drawer="menu"] a[href="/search"]')][0]
      row?.click()
      await sample("Search row in the menu", 900)
      return res
    })
    report.oneOpen = r
    console.log(`  ${JSON.stringify(r)}`)
    if (r.maxOpenAtOnce > 1) fail(`${r.maxOpenAtOnce} open at once`)
    else ok(`never more than ${r.maxOpenAtOnce} open: ${r.timeline.join(" | ")}`)
    if (r.bodyWhileHandover !== "fixed") fail("the page was let go during the menu to cart handover")
    if (r.bodyAfterCartClose !== "static") fail("the page stayed locked after the last drawer closed")
    await page.close()
  }

  /* ── 5. Published, 1280 wide ─────────────────────────────────────────── */
  console.log("\nPublished, 1280px")
  {
    const page = await open("live.html", 1280, 800)
    const r = await page.evaluate(async () => {
      const res = {}
      res.hamburgerShown = [...document.querySelectorAll('button[aria-label="Open menu"]')].some(window.__shown)
      res.menuDrawers = []
      for (const style of ["left", "right", "full"]) {
        window.__set({ mobile_menu_style: style })
        await window.__wait(400)
        res.menuDrawers.push(document.querySelectorAll('[data-site-drawer="menu"]').length)
      }
      window.scrollTo(0, 500)
      await window.__wait(100)
      const marker = document.getElementById("marker")
      const nav = [...document.querySelectorAll('header a, [data-chrome] nav a')].find(window.__shown)
      const before = { marker: window.__rect(marker), nav: window.__rect(nav), bar: innerWidth - document.documentElement.clientWidth }
      window.__openCart()
      await window.__wait(650)
      const cart = document.querySelector('[data-site-drawer="cart"]')
      res.cartRect = window.__rect(cart)
      res.cartZ = getComputedStyle(cart).zIndex
      res.scrollbar = { before: before.bar, open: innerWidth - document.documentElement.clientWidth }
      res.layoutShiftPx = Math.max(
        Math.abs(window.__rect(marker).x - before.marker.x), Math.abs(window.__rect(marker).y - before.marker.y),
        Math.abs(window.__rect(nav).x - before.nav.x), Math.abs(window.__rect(nav).y - before.nav.y),
      )
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))
      await window.__wait(650)
      res.cartGone = document.querySelectorAll('[data-site-drawer="cart"]').length === 0
      res.scrollYAfter = Math.round(scrollY)
      return res
    })
    report.live1280 = r
    console.log(`  ${JSON.stringify(r)}`)
    console.log(`  drawer present on desktop: ${r.menuDrawers.some((n) => n > 0)}`)
    if (r.hamburgerShown) fail("the hamburger shows at 1280")
    if (r.menuDrawers.some((n) => n > 0)) fail("a menu drawer is in the page at 1280")
    if (r.layoutShiftPx !== 0) fail(`the cart's lock moved the page ${r.layoutShiftPx}px (scrollbar ${JSON.stringify(r.scrollbar)})`)
    if (!r.cartGone || r.scrollYAfter !== 500) fail(`after the cart: ${JSON.stringify(r)}`)
    if (!r.hamburgerShown && !r.menuDrawers.some((n) => n > 0) && r.layoutShiftPx === 0) ok(`no phone menu at 1280; cart lock shift ${r.layoutShiftPx}px with a ${r.scrollbar.before}px scrollbar`)
    await page.close()
  }

  /* ── 7. Sticky, not sticky, and sticky on scroll up ─────────────────── */
  /*
    Each mode is scrolled down past the bar and the header, then back up,
    one step at a time with the reveal given time to finish. At every step:
    where the header's top is on screen, and where the first line of content
    sits on the PAGE (its screen top plus the offset). The second must never
    change: a header that becomes sticky, hides or comes back moves nothing.
  */
  const MODES = {
    "not sticky": { header_sticky_enabled: false, header_sticky_on_scroll_up: false },
    sticky: { header_sticky_enabled: true, header_sticky_on_scroll_up: false },
    "sticky on scroll up": { header_sticky_enabled: false, header_sticky_on_scroll_up: true },
    "transparent + sticky": { header_sticky_enabled: true, header_sticky_on_scroll_up: false, header_transparent: true },
  }
  const STEPS = [0, 20, 60, 200, 600, 900, 860, 700, 300, 30, 0]
  for (const [surface, file] of [["published", "sticky-live.html"], ["editor canvas", "editor-sticky.html"]]) {
    console.log(`\nSticky modes, ${surface}, 1280px, announcement bar 40px above`)
    for (const [mode, settings] of Object.entries(MODES)) {
      const page = await open(file, 1280, 800, settings)
      const r = await page.evaluate(async (steps) => {
        const scroller = document.getElementById("wb-preview-root")
        const scrollTo = (y) => { if (scroller) scroller.scrollTop = y; else window.scrollTo(0, y) }
        const origin = scroller ? scroller.getBoundingClientRect().top : 0
        const header = document.querySelector("[data-chrome]")
        const marker = document.getElementById("marker")
        const rows = []
        let t = ""
        for (const y of steps) {
          scrollTo(y)
          await window.__wait(480)
          const h = header.getBoundingClientRect()
          const now = scroller ? scroller.scrollTop : scrollY
          rows.push({
            y,
            top: Math.round(h.top - origin),
            shown: Math.round(Math.min(h.bottom - origin, h.height) > 0 ? Math.min(h.bottom - origin, h.height) : 0),
            contentAt: Math.round(marker.getBoundingClientRect().top - origin + now),
            bg: getComputedStyle(header.firstElementChild).backgroundColor,
          })
          if (y === 700) t = getComputedStyle(header).transitionProperty
        }
        /*
          AND FILMED, A FRAME AT A TIME: 12px per frame down to 900 and back.
          At every frame the header may be where the page puts it (under the
          bar, or pinned at 0) or, in scroll up mode, hidden or on its way;
          it may never sit LOWER than where the page puts it, which is the
          band under the bar and the jump.
        */
        const film = []
        const h0 = header.getBoundingClientRect().height
        const frame = () => new Promise((res) => requestAnimationFrame(() => res()))
        const sticks = getComputedStyle(header).position === "sticky"
        const natural = (y) => (sticks ? Math.max(0, 40 - y) : 40 - y)
        for (const dir of [1, -1]) {
          for (let i = 0; i <= 75; i++) {
            const y = dir === 1 ? i * 12 : 900 - i * 12
            scrollTo(y)
            await frame()
            const top = header.getBoundingClientRect().top - origin
            film.push({ y, top: Math.round(top), low: top - natural(y) > 1, high: natural(y) - top > 1 })
          }
          await window.__wait(500)
        }
        const lowFrames = film.filter((f) => f.low).length
        const travel = film.filter((f) => f.high && f.top > -h0 + 1 && f.top < 0).length
        return { height: Math.round(h0), rows, transition: t, lowFrames, travel, frames: film.length }
      }, STEPS)
      const shift = Math.max(...r.rows.map((x) => x.contentAt)) - Math.min(...r.rows.map((x) => x.contentAt))
      const tops = r.rows.map((x) => `${x.y}:${x.top}`).join(" ")
      console.log(`  ${mode}: header ${r.height}px, layout shift ${shift}px, top by offset ${tops}`)
      console.log(`    filmed ${r.frames} frames: ${r.lowFrames} with the header below its place, ${r.travel} mid-travel (reveal), transition "${r.transition}"`)
      report[`sticky ${surface} ${mode}`] = { ...r, shift }
      if (shift !== 0) fail(`${surface} ${mode}: content moved ${shift}px while scrolling`)
      if (r.lowFrames > 0) fail(`${surface} ${mode}: ${r.lowFrames} frames with the header below where the page puts it`)
      if (mode === "sticky on scroll up" && !/transform/.test(r.transition)) fail(`${surface} scroll up: the reveal is not a transform transition`)
      const at = (y, i) => r.rows.find((x, j) => x.y === y && (i === undefined || j === i))
      const downDeep = r.rows[5]
      const upAgain = r.rows[7]
      const atTop = r.rows[r.rows.length - 1]
      if (atTop.top !== 40) fail(`${surface} ${mode}: back at the top the header is at ${atTop.top}, not under the 40px bar`)
      if (mode === "not sticky" && downDeep.top > -r.height) fail(`${surface} not sticky: the header followed the page down (top ${downDeep.top})`)
      if ((mode === "sticky" || mode === "transparent + sticky") && (downDeep.top !== 0 || upAgain.top !== 0 || at(20).top !== 20)) fail(`${surface} ${mode}: not pinned at 0 (${tops})`)
      if (mode === "sticky on scroll up") {
        if (downDeep.top > -r.height + 1) fail(`${surface} scroll up: still showing while scrolling down (top ${downDeep.top})`)
        if (upAgain.top !== 0) fail(`${surface} scroll up: not back on scrolling up (top ${upAgain.top})`)
      }
      if (mode === "transparent + sticky") {
        const clear = r.rows[0].bg
        const solid = downDeep.bg
        console.log(`    background at the top ${clear}, pinned over content ${solid}`)
        if (!/rgba\(0, 0, 0, 0\)|transparent/.test(clear)) fail(`${surface} transparent: not see-through at the top (${clear})`)
        if (/rgba\(0, 0, 0, 0\)|transparent/.test(solid)) fail(`${surface} transparent + sticky: still see-through over the content`)
      }
      await page.close()
    }
  }

  /* ── 6. Widening past the phone layout with the menu open ───────────── */
  console.log("\nPublished, menu open at 390, window widened to 1280")
  {
    const page = await open("live.html", 390, 760)
    await page.evaluate(async () => {
      ;[...document.querySelectorAll('button[aria-label="Open menu"]')].find(window.__shown).click()
      await window.__wait(600)
    })
    await page.setViewport({ width: 1280, height: 800 })
    const r = await page.evaluate(async () => {
      await window.__wait(700)
      return {
        menuDrawers: document.querySelectorAll('[data-site-drawer="menu"]').length,
        bodyPosition: document.body.style.position || "static",
        rootOverflow: document.documentElement.style.overflow || "visible",
      }
    })
    report.widened = r
    console.log(`  ${JSON.stringify(r)}`)
    if (r.menuDrawers !== 0 || r.bodyPosition !== "static") fail("the menu stayed open, or the page stayed locked, at 1280")
    else ok("the menu closed and let go of the page")
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
