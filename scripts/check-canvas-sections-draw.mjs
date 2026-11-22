/**
 * ===========================================================================
 *  EVERY SECTION OF A LONG PAGE IS DRAWN WHEN IT IS SCROLLED TO
 * ===========================================================================
 * The owner: on a product page of a template theme, the sections lower down
 * did not show in the canvas. The sidebar listed them; the canvas showed
 * them only once the browser was zoomed out.
 *
 * The real editor (scripts/canvas-probe-kit.mjs) with a template theme
 * composed from theme-packages/ (lib/themes/template-packages.ts) and
 * imported by the same converter Add uses. The product page is opened from
 * the page switcher, and the canvas is scrolled a step at a time from top
 * to bottom. At each step, every top level section that crosses the frame's
 * view is read: its height, whether the browser skips drawing it
 * (checkVisibility with contentVisibilityAuto, which is true for
 * content-visibility: hidden as well), its opacity and visibility, and
 * whether anything is painted at its centre (elementFromPoint lands inside
 * it). A section that is on screen and not drawn is a failure.
 *
 * It also fails when a resting section (the canvas bridge's data-sl-far,
 * content-visibility: hidden) comes within half a screen of the view. Round
 * of this probe, before the bridge's observer had a root: 7px at 1440x900
 * and 1280x720, zoom 1. Its observer has no root, and in a frame an observer
 * with no root is measured against the top level window and its rootMargin
 * ("150%") is ignored, so a section was woken only once Chrome agreed it was
 * on screen, through every frame and zoom between. ROOTED=1 measures the fix
 * ({ root: document }) before it lands in lib/storelib-theme/compat/canvas-bridge.ts.
 *
 *   npx tsx scripts/check-canvas-sections-draw.mjs
 *   SOURCE=live: the owner's real Materia product page (scripts/materia-live-kit.mjs)
 *   SITE=<address>: the published page itself, top level, read the same way
 *   BACK=0: open the page once, not away and back
 *   TEMPLATE=samples|landing|...   SIZES=1440x900,1280x720   ZOOMS=1,0.8   PAGE=product
 *
 * ZOOM is the browser's zoom as the owner changes it: the window keeps its
 * device pixels and the page gets 1/zoom times as many CSS pixels
 * (Emulation.setDeviceMetricsOverride at width/zoom by height/zoom, which is
 * what Ctrl minus does to innerWidth and innerHeight).
 */
import { openEditor, sleep } from "./canvas-probe-kit.mjs"
import { bundle, css } from "./editor-probe-harness.mjs"
import { importTemplate } from "./theme-templates/site.ts"

const TEMPLATE = process.env.SOURCE === "live" ? "live" : process.env.TEMPLATE ?? "landing"
const PAGE = process.env.PAGE ?? "product"
const SIZES = (process.env.SIZES ?? "1440x900,1280x720").split(",").map((s) => s.split("x").map(Number))
const ZOOMS = (process.env.ZOOMS ?? "1,0.8").split(",").map(Number)
/* How long after opening the page before scrolling starts: the canvas's own idle work (the far-section rest) begins 1.5s after load. */
const WAIT_MS = Number(process.env.WAIT_MS ?? 5000)

/* SOURCE=live: the owner's real Materia store, its product page as it is drawn live (scripts/materia-live-kit.mjs), opened as the canvas's first page. */
const LIVE = process.env.SOURCE === "live"
const kit = LIVE ? await (await import("./materia-live-kit.mjs")).materiaLive() : null
const t = LIVE ? null : (await importTemplate(`materia/${TEMPLATE}`)).theme
const compat = LIVE ? await kit.theme(PAGE) : {
  settings: t.settings,
  pages: Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])),
  sources: Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib"))),
  files: Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p))),
  all: t.files,
}
if (!LIVE && !compat.pages[PAGE]) { console.error(`${TEMPLATE} has no ${PAGE} page (${Object.keys(compat.pages).join(", ")})`); process.exit(1) }

/* In the theme's document: every top level section crossing the view, and how it is drawn. */
const READ = () => {
  const vh = innerHeight
  return [...document.querySelectorAll(".shopify-section")].filter((s) => !s.parentElement.closest(".shopify-section")).map((s) => {
    const r = s.getBoundingClientRect()
    const cs = getComputedStyle(s)
    const onScreen = r.bottom > 0 && r.top < vh && r.height > 0
    let painted = null
    if (onScreen) {
      const y = Math.max(1, Math.min(vh - 2, (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2))
      const hit = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(y))
      const pinned = (n) => { for (; n && n !== document.body; n = n.parentElement) { const p = getComputedStyle(n).position; if (p === "fixed" || p === "sticky") return true } return false }
      /* A pinned header that slides away on the way down, or a bar pinned over the page, is not judged by what is under its centre. */
      const selfPinned = pinned(s) || (s.firstElementChild && pinned(s.firstElementChild)) || [...s.querySelectorAll("*")].slice(0, 6).some((n) => /fixed|sticky/.test(getComputedStyle(n).position))
      painted = selfPinned ? null : !hit ? false : s === hit || s.contains(hit) ? true : pinned(hit) ? null : false
      if (!painted) var hitWas = hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(" ")[0]}${hit.closest(".shopify-section") ? " in " + hit.closest(".shopify-section").id.replace(/^shopify-section-/, "") : ""}` : "nothing"
    }
    /* What is inside: the text and pictures in the view, and how many of them cannot be seen (opacity 0 up the chain, hidden, or skipped). */
    let parts = 0, unseen = 0
    if (onScreen) {
      for (const el of s.querySelectorAll("h1,h2,h3,h4,p,li,img,picture,video,a,button,summary,blockquote")) {
        const er = el.getBoundingClientRect()
        if (er.width < 2 || er.height < 2 || er.bottom < 0 || er.top > vh) continue
        if (el.closest("[aria-hidden=true],dialog:not([open]),details:not([open]) > :not(summary)")) continue
        parts++
        let a = 1
        for (let n = el; n && n !== s.parentElement; n = n.parentElement) a *= Number(getComputedStyle(n).opacity)
        const seen = a > 0.05 && (el.checkVisibility ? el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }) : true)
        if (!seen) unseen++
      }
    }
    const skipped = s.checkVisibility ? !s.checkVisibility({ contentVisibilityAuto: true }) : false
    return {
      id: s.id.replace(/^shopify-section-/, ""), top: Math.round(r.top + scrollY), h: Math.round(r.height), onScreen,
      cv: cs.contentVisibility, far: s.hasAttribute("data-sl-far"), skipped, opacity: cs.opacity, visibility: cs.visibility, painted, hitWas: typeof hitWas === "string" ? hitWas : "", parts, unseen,
    }
  })
}

/*
  ROOTED=1: the canvas bridge's far-section observer measured against the theme's own document
  ({ root: document }) instead of the implicit root, put in by wrapping IntersectionObserver in
  every frame before the page's scripts run. It is how the fix proposed for
  lib/storelib-theme/compat/canvas-bridge.ts (farStart) is measured here before it lands there.
*/
const ROOTED = process.env.ROOTED === "1"
const ROOTED_INIT = String.raw`(function () {
  var IO = window.IntersectionObserver; if (typeof IO !== "function") return; window.__rooted = 1
  window.IntersectionObserver = class extends IO { constructor(cb, o) { if (o && !o.root && o.rootMargin === "150% 0px 150% 0px") o = Object.assign({}, o, { root: document }); super(cb, o) } }
})()`
const isDrawn = (s) => !s.skipped && !(s.far && s.cv === "hidden") && s.opacity !== "0" && s.visibility !== "hidden" && s.painted !== false && !(s.parts && s.unseen / s.parts > 0.5)
async function scrollAndRead(f, page, label, w, h) {
  const total = await f.evaluate(() => document.scrollingElement.scrollHeight)
  const vh = await f.evaluate(() => innerHeight)
  /* How close to the view a resting section comes: the nearest edge of any data-sl-far section, in px from the view (0: touching or in it). */
  let nearestFar = Infinity, late = 0
  const seen = new Map()
  const bad = []
  for (let y = 0; y <= total; y += Math.round(vh * 0.6)) {
    if (process.env.WHEEL) { await page.mouse.move(Math.round(w * 0.6), Math.round(h * 0.5)); const at = await f.evaluate(() => scrollY); await page.mouse.wheel({ deltaY: y - at }) } else await f.evaluate((y) => scrollTo(0, y), y)
    await sleep(Number(process.env.STEP_MS ?? 400))
    let rows = await f.evaluate(READ)
    /*
      AN ENTRANCE IS NOT A MISSING SECTION. A theme's scroll reveal (Materia's revealRise, its blur up) keeps a
      section faint for a moment after it arrives, on the website as in the canvas. One not drawn at the first
      look is looked at again once its entrance has had time to end; only one still not drawn then counts.
    */
    const first = rows.filter((r) => r.onScreen && !isDrawn(r)).map((r) => r.id)
    if (first.length) { late += first.length; await sleep(2500); rows = await f.evaluate(READ) }
    nearestFar = Math.min(nearestFar, await f.evaluate(() => { let d = Infinity; for (const e of document.querySelectorAll("[data-sl-far]")) { const r = e.getBoundingClientRect(); if (!r.height) continue; d = Math.min(d, r.bottom <= 0 ? -r.bottom : r.top >= innerHeight ? r.top - innerHeight : 0) } return d }))
    if (process.env.DEBUG_REST) console.log(`  scroll ${y}: ${await f.evaluate(() => `rest ${document.querySelectorAll("[data-sl-rest]").length} far ${[...document.querySelectorAll("[data-sl-far]")].map((e) => e.id.replace("shopify-section-", "")).join(",")}`)}`)
    for (const s of rows) {
      if (!seen.has(s.id)) seen.set(s.id, { h: s.h, drawn: false })
      const k = seen.get(s.id)
      k.h = s.h
      if (!s.onScreen) continue
      const drawn = isDrawn(s)
      if (drawn) k.drawn = true
      else bad.push(`${s.id} at scroll ${y} (its top ${s.top - y} in the view): h ${s.h} cv ${s.cv}${s.far ? " far" : ""}${s.skipped ? " skipped" : ""} opacity ${s.opacity} ${s.visibility} painted ${s.painted}${s.hitWas ? " (" + s.hitWas + ")" : ""} unseen ${s.unseen}/${s.parts}`)
    }
  }
  const listed = [...seen.entries()]
  const never = listed.filter(([, k]) => !k.drawn && k.h > 0)
  const zero = listed.filter(([, k]) => k.h === 0)
  console.log(`\n${label}: page ${total}px, frame ${vh}px, ${listed.length} sections, nearest resting section ${nearestFar === Infinity ? "none" : Math.round(nearestFar) + "px"} from the view`)
  for (const [id, k] of listed) console.log(`  ${k.drawn ? "drawn " : k.h ? "NOT   " : "empty "} ${String(k.h).padStart(5)}px  ${id}`)
  if (bad.length) console.log(`  on screen and not drawn (${bad.length}):\n    ${bad.slice(0, 12).join("\n    ")}`)
  if (late) console.log(`  ${late} look(s) found a section on screen still arriving (looked at again 2.5s later)`)
  if (zero.length) console.log(`  ${zero.length} with no height: ${zero.map(([id]) => id).join(", ")}`)
  /*
    A RESTING SECTION STAYS WELL AWAY FROM THE VIEW. The canvas bridge rests a section once it is a screen and a
    half away (lib/storelib-theme/compat/canvas-bridge.ts, farStart), so it is drawn again before it is scrolled
    to. One resting at the edge of the view is woken only once it is already on screen, and then only when the
    browser's own idea of what part of the frame is visible agrees: an observer with no root, in a frame, is
    measured against the top level window, and its rootMargin is ignored there.
  */
  const close = nearestFar < vh * 0.5
  if (close) console.log(`  a resting section came within ${Math.round(nearestFar)}px of the view (less than half a screen): it is woken only once it is on screen`)
  return !(never.length || bad.length || close)
}

let failures = 0
/*
  SITE=<address>: the published page itself, as a visitor's browser opens it, read the same way (a website is the
  top level document, so nothing of the canvas is in it; this is for a cause the two might share).
*/
if (process.env.SITE) {
  const puppeteer = (await import("puppeteer-core")).default
  for (const [w, h] of SIZES) for (const zoom of ZOOMS) {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
    try {
      const page = await browser.newPage()
      await page.setViewport({ width: Math.round(w / zoom), height: Math.round(h / zoom), deviceScaleFactor: zoom })
      await page.goto(process.env.SITE, { waitUntil: "load", timeout: 60_000 })
      await sleep(WAIT_MS)
      if (!(await scrollAndRead(page.mainFrame(), page, `site ${process.env.SITE} ${w}x${h} zoom ${zoom}`, w, h))) failures++
    } finally {
      await browser.close()
    }
  }
  console.log(failures ? `\nFAIL: ${failures} run(s) had a section on screen and not drawn` : "\nPASS: every section was drawn when scrolled to")
  process.exit(failures ? 1 : 0)
}
for (const [w, h] of SIZES) {
  for (const zoom of ZOOMS) {
    const ed = await openEditor({ init: ROOTED ? ROOTED_INIT : "", kind: "imported", bundle, css, compat, serve: kit ? kit.serve : null, width: w, height: h, settle: 1500 })
    try {
      if (zoom !== 1) {
        const cdp = await ed.page.createCDPSession()
        await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.round(w / zoom), height: Math.round(h / zoom), deviceScaleFactor: zoom, mobile: false })
        await sleep(1500)
      }
      const go = async (key) => {
        await ed.js(() => document.querySelector("[data-page-switcher]")?.click())
        await sleep(500)
        const picked = await ed.js((key) => { const r = document.querySelector(`[data-page-row="${key}"]`); if (!r) return false; r.click(); return true }, key)
        if (!picked) throw new Error(`no ${key} row in the page switcher`)
      }
      /*
        AWAY AND BACK (the default): the page opened, left for another, and opened again a few seconds later, so the second
        time it is a kept frame (out of sight, visibility hidden) brought to the front. BACK=0 opens it once.
      */
      if (!LIVE && PAGE !== "home") {
        await go(PAGE)
        if (process.env.BACK !== "0") { await sleep(3000); await go("home"); await sleep(WAIT_MS); await go(PAGE) }
      }
      /* The front frame showing the page asked for. */
      let f = null
      for (let i = 0; i < 80; i++) {
        await sleep(250)
        f = await ed.front()
        const ok = f && (await f.evaluate(() => document.querySelectorAll(".shopify-section").length > 0).catch(() => false))
        if (ok) break
      }
      await sleep(WAIT_MS)
      f = await ed.front()
      if (ROOTED && !(await f.evaluate(() => window.__rooted))) throw new Error("ROOTED=1 but the shim did not reach the theme's frame")
      if (!(await scrollAndRead(f, ed.page, `${TEMPLATE} ${PAGE} ${w}x${h} zoom ${zoom}`, w, h))) failures++
      if (ed.errors.length) console.log(`  page errors: ${ed.errors.slice(0, 3).join(" | ")}`)
    } finally {
      await ed.close()
    }
  }
}
console.log(failures ? `\nFAIL: ${failures} run(s) had a section on screen and not drawn` : "\nPASS: every section was drawn when scrolled to")
process.exit(failures ? 1 : 0)
