/**
 * ===========================================================================
 *  THE SITE MENU ON A PHONE: THE PAGE BEHIND IT STAYS WHERE IT IS
 * ===========================================================================
 * "When I try to click in the container or scroll in that sidebar navigation
 * mobile container, it scrolls back in the website. And it's opening the
 * mobile navigation sidebar, but it keeps the header open."
 *
 * Measured here with real touches (CDP Input.dispatchTouchEvent, which
 * Chromium turns into real scroll gestures) on:
 *
 *   live     a published page: the real ThemePage and header, with the
 *            guard the root layout mounts on every page
 *   canvas   the real website builder editor, on a phone and on a desktop
 *            showing the phone frame
 *
 * and, each time, with the menu open:
 *
 *   the page (or the canvas) does not move for a drag that starts inside the
 *   drawer, at the top of its list, in the middle and at the bottom, in both
 *   directions, nor for a drag on the backdrop
 *   the list itself scrolls when it is longer than the drawer
 *   the lock is still on after the guard's settle time (400ms) and after a
 *   touch, which is what took it away before
 *   the header is not drawn over the drawer: what is at the header's
 *   position is the drawer or the backdrop, and the header is faded out
 *   a tap on the submenu row opens it and moves nothing
 *   closing puts the page back exactly where it was, every frame of it, and
 *   the header comes back as it was (revealed stays revealed)
 *
 *   node scripts/check-storefront-mobile-drawer.mjs
 *   SHOTS=<dir> keeps a picture of each open menu.
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { CHROMIUM, root, fail, bundle as editorBundle, css, out } from "./editor-probe-harness.mjs"

const SHOTS = process.env.SHOTS ?? ""
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stubs = join(root, ".wb-probe")

/* The published page, bundled with the same stubs the editor probe uses. */
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-storefront-mobile-drawer.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "live.js")}`,
  `--inject:${join(stubs, "buffer-shim.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
  `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
  `--alias:next/cache=${join(stubs, "cache.js")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
  `--alias:node:crypto=${join(stubs, "node-crypto.js")}`, `--alias:crypto=${join(stubs, "node-crypto.js")}`,
  `--alias:node:fs=${join(stubs, "node-empty.js")}`, `--alias:fs=${join(stubs, "node-empty.js")}`, `--alias:node:path=${join(stubs, "node-empty.js")}`, `--alias:path=${join(stubs, "node-empty.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

const HEAD = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head>`
writeFileSync(join(out, "live.html"), `${HEAD}<body><div id="app"></div><script src="live.js"></script></body></html>`)
writeFileSync(join(out, "editor-probe.js"), readFileSync(editorBundle))

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"], headless: true })
const failures = []
const lines = []
const check = (ok, what) => { lines.push(`  ${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failures.push(what) }

/* ------------------------------------------------------------------------ */
/*  In-page helpers, installed once per page                                */
/* ------------------------------------------------------------------------ */
const HELPERS = `
window.__drawer = () => document.querySelector('[role="dialog"][aria-label="Menu"]')
window.__backdrop = () => document.querySelector('[data-site-drawer-backdrop]') || (window.__drawer() && window.__drawer().previousElementSibling)
/* The site header's own menu button: it says Open menu or Close menu, and it is the one with aria-expanded.
   Inside the canvas when there is one, because the editor has an "Open menu" of its own. */
window.__menuBtn = () => Array.from((document.getElementById("wb-preview-root") || document).querySelectorAll('button[aria-expanded][aria-label$=" menu"]')).find((b) => !b.closest('[role="dialog"]')) || null
window.__pane = () => { const d = window.__drawer(); return d ? d.querySelector('nav > div > div') : null }
/* Long tasks on the main thread, for the open and the close. */
window.__long = []
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: true }) } catch {}
window.__rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) } }
`

async function openPage(url, viewport, globals = "") {
  const page = await browser.newPage()
  await page.setViewport({ ...viewport, deviceScaleFactor: 1, isMobile: viewport.width < 768, hasTouch: true })
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  if (globals) await page.evaluateOnNewDocument(globals)
  await page.evaluateOnNewDocument(HELPERS)
  await page.goto(url)
  const cdp = await page.createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x: Math.round(x), y: Math.round(y), radiusX: 6, radiusY: 6, force: 1, id: 1 }] })
  const tap = async (x, y) => { await touch("touchStart", x, y); await sleep(40); await touch("touchEnd"); await sleep(60) }
  const drag = async (x, y, dy, steps = 12) => {
    await touch("touchStart", x, y)
    for (let i = 1; i <= steps; i++) { await touch("touchMove", x, y + (dy * i) / steps); await sleep(16) }
    await touch("touchEnd")
    await sleep(450)
  }
  const wheel = (x, y, dy) => cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: dy })
  return { page, cdp, touch, tap, drag, wheel, errors }
}

/* Where something is, in the page, by the centre of its rect. */
const centre = (r) => ({ x: r.left + r.w / 2, y: r.top + r.h / 2 })

/*
  EVERY FRAME, NOT BEFORE AND AFTER. A page that jumps to the top and comes
  back reads as still if it is only asked twice. `pageTop` is how the probe
  reads the page's position for the surface in question.
*/
async function sampleWhile(page, pageTop, action, ms) {
  await page.evaluate((src) => {
    const read = new Function(`return (${src})()`)
    window.__samples = []
    window.__sampling = true
    const tick = () => {
      if (!window.__sampling) return
      const h = window.__menuBtn()
      const hdr = h && h.closest("[data-chrome]")
      window.__samples.push({ page: read(), hdrTop: hdr ? Math.round(hdr.getBoundingClientRect().top) : null, t: performance.now() })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, pageTop)
  await action()
  await sleep(ms)
  return page.evaluate(() => { window.__sampling = false; return window.__samples })
}

/* ------------------------------------------------------------------------ */
/*  One open menu, measured the same way on every surface                   */
/* ------------------------------------------------------------------------ */
async function measureOpenMenu(p, { label, pageTop, long, width }) {
  const { page, drag, tap } = p
  const readPage = () => page.evaluate((src) => new Function(`return (${src})()`)(), pageTop)
  const headerOf = () => page.evaluate(() => {
    const btn = window.__menuBtn()
    const hdr = btn && btn.closest("[data-chrome]")
    if (!hdr) return null
    const cs = getComputedStyle(hdr)
    return { rect: window.__rect(hdr), btn: window.__rect(btn), opacity: Number(cs.opacity), transform: hdr.style.transform || "", visibility: cs.visibility }
  })

  const before = await readPage()
  const hdrBefore = await headerOf()
  if (!hdrBefore) { check(false, `${label}: no header with a menu button`); return }

  /*
    Open it with a finger. HEADLESS CHROMIUM ONLY: on a plain sticky header
    (no transform) scrolled down the page, the press lands on the menu button
    and from then on the header is neither painted nor hit: the section under
    it wins both, with no style or DOM change in between (checked by
    elementsFromPoint before and after the press; a header with show on scroll
    up, which carries a transform, is unaffected). The click after that tap
    is synthesised on the section. When that is what happened the button is
    clicked directly and the report says so; everything after the opening is
    still driven by touch.
  */
  await page.evaluate(() => { window.__long = [] })
  let openSamples = await sampleWhile(page, pageTop, () => tap(centre(hdrBefore.btn).x, centre(hdrBefore.btn).y), 900)
  const openedByTap = await page.evaluate(() => { const d = window.__drawer(); return !!d && d.getAttribute("aria-hidden") !== "true" })
  if (!openedByTap) {
    openSamples = await sampleWhile(page, pageTop, () => page.evaluate(() => window.__menuBtn().click()), 900)
    lines.push(`  note ${label}: opened with click(), the headless sticky header quirk above`)
  }
  const state = await page.evaluate(() => {
    const d = window.__drawer()
    return {
      open: !!d && d.getAttribute("aria-hidden") !== "true",
      modal: d ? d.getAttribute("aria-modal") : null,
      bodyPosition: document.body.style.position,
      rootOverflow: document.documentElement.style.overflow,
      drawer: window.__rect(d),
    }
  })
  check(state.open, `${label}: a tap on the menu button opens the drawer`)
  if (!state.open) return
  const gap = (ss) => Math.round(Math.max(0, ...ss.slice(1).map((s, i) => s.t - ss[i].t)))
  const openLong = await page.evaluate(() => window.__long.splice(0))
  lines.push(`  time ${label}: opening, ${openSamples.length} frames in 900ms, slowest ${gap(openSamples)}ms, long tasks ${openLong.length ? openLong.join("/") + "ms" : "none"}`)
  /* In the editor the same tap selects the header and opens its settings,
     which is the editor's own work and is reported rather than judged here. */
  if (!pageTop.includes("wb-preview-root")) check(openLong.every((d) => d < 50), `${label}: no long task while the menu opens`)
  check(state.modal === "true", `${label}: the open drawer says aria-modal="true" (so the root layout's lock guard leaves its lock alone), got ${state.modal}`)
  const moved = openSamples.filter((s) => s.page !== before)
  check(moved.length === 0, `${label}: the page does not move while the menu opens (${openSamples.length} frames, ${moved.length} moved${moved.length ? ", to " + [...new Set(moved.map((s) => s.page))].slice(0, 4).join("/") : ""})`)

  /* The header is under the drawer and the backdrop, and faded out. */
  const cover = await page.evaluate((h) => {
    const y = Math.round(h.rect.top + h.rect.h / 2)
    /* The button, the header's far end (where the bag is) and its middle. */
    const points = [[Math.round(h.btn.left + h.btn.w / 2), y], [h.rect.right - 12, y], [Math.round(h.rect.left + h.rect.w / 2), y]]
    return points.map(([x, yy]) => {
      const el = document.elementFromPoint(x, yy)
      const d = window.__drawer()
      const b = window.__backdrop()
      const what = !el ? "nothing" : d && d.contains(el) ? "drawer" : b && (el === b || b.contains(el)) ? "backdrop" : (el.closest("[data-chrome]") ? "HEADER" : el.tagName.toLowerCase())
      return `${x},${yy}=${what}`
    })
  }, hdrBefore)
  const hdrOpen = await headerOf()
  check(cover.every((c) => /=(drawer|backdrop)$/.test(c)), `${label}: nothing of the header is on top at its own row: ${cover.join("  ")}`)
  check(hdrOpen.opacity < 0.05, `${label}: the header is faded out while the menu is open (opacity ${hdrOpen.opacity})`)
  check((hdrOpen.transform || "") === (hdrBefore.transform || ""), `${label}: the header's own slide is untouched while open (${hdrBefore.transform || "none"} then ${hdrOpen.transform || "none"})`)

  if (SHOTS) await page.screenshot({ path: join(SHOTS, `drawer-${label.replace(/[^a-z0-9]+/gi, "-")}.png`) })

  /* The lock outlives the guard's settle time, and a touch. */
  const pane = await page.evaluate(() => { const p = window.__pane(); return p ? { rect: window.__rect(p), sh: p.scrollHeight, ch: p.clientHeight } : null })
  const drawerRect = state.drawer
  const firstRow = await page.evaluate(() => window.__rect(window.__pane()?.firstElementChild))
  const lastInDrawer = await page.evaluate(() => { const d = window.__drawer(); const kids = d ? d.children : []; return window.__rect(kids[kids.length - 1]) })
  const scrollable = pane && pane.sh > pane.ch + 1
  if (long) check(scrollable, `${label}: the long menu is longer than the drawer (${pane?.sh} in ${pane?.ch})`)

  const points = [
    ["top of the list", firstRow ? centre(firstRow) : null],
    ["middle of the list", pane ? centre(pane.rect) : null],
    ["bottom of the drawer", lastInDrawer ? centre(lastInDrawer) : null],
    ["the drawer's own top row", drawerRect ? { x: drawerRect.left + drawerRect.w / 2, y: drawerRect.top + 30 } : null],
  ]
  const results = []
  for (const [where, at] of points) {
    if (!at) { results.push(`${where}: not found`); continue }
    for (const dy of [-260, 260]) {
      const paneBefore = await page.evaluate(() => window.__pane()?.scrollTop ?? 0)
      const samples = await sampleWhile(page, pageTop, () => drag(at.x, at.y, dy), 200)
      const paneAfter = await page.evaluate(() => window.__pane()?.scrollTop ?? 0)
      const stray = samples.filter((s) => s.page !== before)
      const still = await page.evaluate(() => { const d = window.__drawer(); return !!d && d.getAttribute("aria-hidden") !== "true" })
      results.push({ where, dy, stray: stray.length, frames: samples.length, pane: paneAfter - paneBefore, still })
    }
  }
  for (const r of results) {
    if (typeof r === "string") { check(false, `${label}: ${r}`); continue }
    check(r.stray === 0 && r.still, `${label}: drag ${r.dy < 0 ? "up" : "down"} from the ${r.where}: page moved in ${r.stray} of ${r.frames} frames, list moved ${r.pane}px, menu ${r.still ? "still open" : "CLOSED"}`)
  }
  if (long && scrollable) {
    const listMoved = results.some((r) => typeof r !== "string" && r.where === "middle of the list" && r.pane !== 0)
    check(listMoved, `${label}: the list scrolls under a finger when it is longer than the drawer`)
  }

  const lock = await page.evaluate(() => ({ bodyPosition: document.body.style.position, canvas: document.getElementById("wb-preview-root")?.style.overflow ?? null }))
  check(lock.bodyPosition === state.bodyPosition, `${label}: the lock is still on after every drag (body position "${state.bodyPosition}" then "${lock.bodyPosition}")`)

  /* A tap on a row that opens a submenu: it opens, nothing else moves. */
  const services = await page.evaluate(() => {
    const b = Array.from(window.__drawer().querySelectorAll("button[aria-haspopup]"))[0]
    return b ? window.__rect(b) : null
  })
  if (services) {
    const samples = await sampleWhile(page, pageTop, () => tap(centre(services).x, centre(services).y), 500)
    const inSub = await page.evaluate(() => window.__drawer().querySelector("nav > div").style.transform)
    check(/-50%/.test(inSub) && samples.every((s) => s.page === before), `${label}: a tap on "Services" opens its submenu (${inSub}) and the page stays (${samples.filter((s) => s.page !== before).length} frames moved)`)
    const back = await page.evaluate(() => window.__rect(window.__drawer().querySelector('button[aria-label="Back to main menu"]')))
    if (back) await tap(centre(back).x, centre(back).y)
    await sleep(400)
  }

  /* A drag on the backdrop: closes, and the page still does not move. */
  const bd = await page.evaluate(() => window.__rect(window.__backdrop()))
  if (bd && bd.right - (drawerRect?.right ?? 0) > 30) {
    const x = Math.round((drawerRect.right + bd.right) / 2)
    const samples = await sampleWhile(page, pageTop, () => drag(x, bd.top + bd.h / 2, -300), 500)
    const stray = samples.filter((s) => s.page !== before)
    const closed = await page.evaluate(() => { const d = window.__drawer(); return !d || d.getAttribute("aria-hidden") === "true" })
    check(stray.length === 0, `${label}: a drag on the backdrop moves nothing (${stray.length} of ${samples.length} frames moved${stray.length ? ", to " + [...new Set(stray.map((s) => s.page))].slice(0, 4).join("/") : ""})`)
    check(closed, `${label}: and it closes the menu`)
    if (closed) {
      await sleep(300)
      await tap(centre(hdrBefore.btn).x, centre(hdrBefore.btn).y)
      await sleep(900)
      const again = await page.evaluate(() => { const d = window.__drawer(); return !!d && d.getAttribute("aria-hidden") !== "true" })
      if (!again) { await page.evaluate(() => window.__menuBtn().click()); await sleep(900) }
    }
  }

  /* Close with the X: the page is where it was on every frame. */
  const x = await page.evaluate(() => window.__rect(window.__drawer().querySelector('button[aria-label="Close menu"]')))
  await page.evaluate(() => { window.__long = [] })
  const closeSamples = await sampleWhile(page, pageTop, () => tap(centre(x).x, centre(x).y), 900)
  const closeLong = await page.evaluate(() => window.__long.splice(0))
  lines.push(`  time ${label}: closing, ${closeSamples.length} frames in 900ms, slowest ${gap(closeSamples)}ms, long tasks ${closeLong.length ? closeLong.join("/") + "ms" : "none"}`)
  if (!pageTop.includes("wb-preview-root")) check(closeLong.every((d) => d < 50), `${label}: no long task while the menu closes`)
  const after = await readPage()
  const hdrAfter = await headerOf()
  const jumped = closeSamples.filter((s) => s.page !== before)
  check(after === before && jumped.length === 0, `${label}: closing leaves the page at ${before}, on every frame (now ${after}, ${jumped.length} of ${closeSamples.length} frames elsewhere)`)
  check(hdrAfter.opacity > 0.99 && (hdrAfter.transform || "") === (hdrBefore.transform || "") && Math.abs(hdrAfter.rect.top - hdrBefore.rect.top) <= 1, `${label}: the header is back as it was (opacity ${hdrAfter.opacity}, top ${hdrBefore.rect.top} then ${hdrAfter.rect.top}, transform "${hdrBefore.transform}" then "${hdrAfter.transform}")`)
  const unlocked = await page.evaluate(() => ({ body: document.body.style.position, attr: document.documentElement.hasAttribute("data-drawer-open"), canvas: document.getElementById("wb-preview-root")?.style.overflow ?? null }))
  check(unlocked.body === "" && !unlocked.attr && (unlocked.canvas === null || unlocked.canvas === ""), `${label}: and every lock is off (body "${unlocked.body}", html[data-drawer-open] ${unlocked.attr}, canvas overflow "${unlocked.canvas}")`)
}

/* ------------------------------------------------------------------------ */
/*  The published page                                                      */
/* ------------------------------------------------------------------------ */
const LIVE_TOP = `() => Math.round(document.getElementById("page-marker").getBoundingClientRect().top)`
const liveCases = [
  { q: "links=4&sticky=1", name: "sticky, 4 links (the recording)" },
  { q: "links=16&sticky=1", name: "sticky, 16 links", long: true },
  { q: "links=16&reveal=1", name: "shows on scroll up, revealed", long: true, reveal: true },
  { q: "links=6&sticky=1&transparent=1", name: "transparent" },
  /* A header that scrolls away is only in reach at the top of the page. */
  { q: "links=6", name: "not sticky, at the top", y: 0 },
  { q: "links=16&sticky=1&style=right", name: "from the right", long: true },
]
/* ONLY=live or ONLY=canvas runs one half. */
const ONLY = process.env.ONLY ?? ""
for (const width of ONLY === "canvas" ? [] : [360, 390, 430]) {
  for (const c of width === 390 ? liveCases : liveCases.slice(0, 3)) {
    const label = `live ${width} ${c.name}`
    const p = await openPage(`file://${join(out, "live.html")}?${c.q}`, { width, height: 780 })
    await p.page.waitForSelector('button[aria-expanded][aria-label="Open menu"]', { timeout: 15000 }).catch(() => {})
    await sleep(600)
    /* Down the page, and for the reveal header back up a little so it shows. */
    await p.page.evaluate((y) => window.scrollTo(0, y), c.y ?? 1400)
    await sleep(300)
    if (c.reveal) { await p.page.evaluate(() => window.scrollTo(0, 1300)); await sleep(500) }
    lines.push(`\n${label}`)
    await measureOpenMenu(p, { label, pageTop: LIVE_TOP, long: c.long, width })
    if (p.errors.length) check(false, `${label}: page errors: ${p.errors.slice(0, 3).join(" | ")}`)
    await p.page.close()
  }
}

/* ------------------------------------------------------------------------ */
/*  The builder canvas: the real editor, on phones and on a desktop         */
/* ------------------------------------------------------------------------ */
writeFileSync(join(out, "editor.html"), `${HEAD}<body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_HEADER=JSON.parse(decodeURIComponent(location.hash.slice(1)||"%7B%7D"))</script><script src="editor-probe.js"></script></body></html>`)
const CANVAS_TOP = `() => document.getElementById("wb-preview-root").scrollTop`
const canvasCases = [
  { header: { links: 4, settings: { header_sticky_enabled: true } }, name: "sticky, 4 links" },
  { header: { links: 16, settings: { header_sticky_enabled: true } }, name: "sticky, 16 links", long: true },
  { header: { links: 16, settings: { header_sticky_on_scroll_up: true } }, name: "shows on scroll up", long: true },
]
const views = [
  { width: 390, height: 844, name: "phone 390" },
  { width: 360, height: 780, name: "phone 360", only: 1 },
  { width: 430, height: 932, name: "phone 430", only: 1 },
  { width: 1280, height: 900, name: "desktop 1280, phone frame", desktop: true },
]
for (const v of ONLY === "live" ? [] : views) {
  for (const c of v.only ? canvasCases.slice(0, v.only + 1) : canvasCases) {
    const label = `canvas ${v.name} ${c.name}`
    const p = await openPage(`file://${join(out, "editor.html")}#${encodeURIComponent(JSON.stringify(c.header))}`, { width: v.width, height: v.height })
    const drawn = () => p.page.waitForFunction(() => (document.getElementById("wb-preview-root")?.querySelectorAll("[id^=wb-section-]").length ?? 0) >= 3, { timeout: 30000 }).then(() => true, () => false)
    let ready = await drawn()
    await sleep(1200)
    if (ready && v.desktop) {
      const pressed = await p.page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => (x.getAttribute("aria-label") || "") === "Switch to phone preview"); b?.click(); return !!b })
      await sleep(1500)
      ready = pressed && (await drawn())
    }
    ready = ready && (await p.page.evaluate(() => { const b = window.__menuBtn(); return !!b && b.getBoundingClientRect().width > 0 }))
    lines.push(`\n${label}`)
    if (!ready) { check(false, `${label}: the editor never drew the canvas with a menu button in reach`); await p.page.close(); continue }
    await p.page.evaluate(() => { document.getElementById("wb-preview-root").scrollTop = 900 })
    await sleep(400)
    if (c.header.settings.header_sticky_on_scroll_up) { await p.page.evaluate(() => { document.getElementById("wb-preview-root").scrollTop = 800 }); await sleep(500) }
    await measureOpenMenu(p, { label, pageTop: CANVAS_TOP, long: c.long, width: v.width })

    /* A wheel over the menu, the desktop's way of scrolling the phone frame. */
    if (v.desktop && c.long) {
      await p.page.evaluate(() => window.__menuBtn().click())
      await sleep(900)
      const at = await p.page.evaluate(() => window.__rect(window.__pane()))
      const before = await p.page.evaluate(() => [document.getElementById("wb-preview-root").scrollTop, window.__pane().scrollTop])
      for (let i = 0; i < 6; i++) { await p.wheel(Math.round(at.left + at.w / 2), Math.round(at.top + at.h / 2), 120); await sleep(60) }
      for (let i = 0; i < 20; i++) { await p.wheel(Math.round(at.left + at.w / 2), Math.round(at.top + at.h / 2), 120); await sleep(30) }
      await sleep(500)
      const after = await p.page.evaluate(() => [document.getElementById("wb-preview-root").scrollTop, window.__pane().scrollTop])
      check(after[0] === before[0] && after[1] > before[1], `${label}: a mouse wheel over the menu scrolls the menu (${before[1]} to ${after[1]}) and not the canvas (${before[0]} to ${after[0]}), past the list's end too`)
    }
    if (p.errors.length) check(false, `${label}: page errors: ${p.errors.slice(0, 3).join(" | ")}`)
    await p.page.close()
  }
}

console.log(lines.join("\n"))
await browser.close()
if (failures.length) fail(`${failures.length} check(s) failed.`)
console.log("\n  The page and the canvas stay still behind an open menu, and come back exactly where they were.\n")
