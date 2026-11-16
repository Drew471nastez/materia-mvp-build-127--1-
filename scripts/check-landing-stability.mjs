/**
 * ===========================================================================
 *  NOTHING ABOVE THE SCREEN CHANGES SIZE WHILE THE HOME PAGE IS SCROLLED
 *  (landing round 11, stability)
 * ===========================================================================
 * The owner, on a real iPhone: headings and pictures jump and stutter while
 * scrolling up and down. Safari has no scroll anchoring (overflow-anchor is
 * not in WebKit), so a section above the screen that grows or shrinks by
 * 12px moves everything on screen by 12px, in one frame. Chromium anchors the
 * scroll and hides the same change, which is why it was never seen there.
 *
 * Against a running dev server, iPhone 13 emulation, in WebKit and Chromium:
 *
 *   scroll   1.5s after load, window.scrollTo steps of 40% of a screen with a
 *            short wait, to the foot of the page and back to the top. Every
 *            lazy box, every sheet and every section is measured at every
 *            step (top in the page, height), as the frame is painted (see
 *            snap). Reported: each height change, where it happened (above
 *            the screen, on it, below it), what the box was doing (mounted,
 *            skipped, its contain-intrinsic-size), and how far anything on
 *            screen moved against the scroll: every edge of a box or sheet on
 *            screen, every heading, and whatever sits at three points down
 *            the middle of the screen, by their place in the page with
 *            transforms left out (an entrance animation is not a jump). Each
 *            must move up the screen by the scroll and nothing else.
 *   fling    a quarter of a screen every frame (about 10000px/s), no pause:
 *            boxes reached before they were drawn ahead.
 *   urlbar   the steady scroll, with the screen's height switching 664 <-> 750
 *            every third step (Safari's toolbar coming and going).
 *   slow     the steady scroll with every picture, film and font held back 4s
 *            (a weak network): what changes size when they land.
 *   restore  the page put three quarters down at load (Safari does that on a
 *            reload or a return), then read upwards to the top and down again:
 *            every box above was never drawn.
 *
 * Passes when nothing on screen moved by more than 1px against the scroll, in
 * any engine or mode, and no height change above the screen moved it. A box
 * above the screen may still change height where the page moves the scroll
 * with it in the same frame (lazy-section.tsx, holdAbove): it is listed as
 * "not seen". In urlbar mode a change in the frame the screen was resized is
 * listed apart (in this emulation svh and vh follow the resize; on an iPhone
 * they do not).
 *
 *   node scripts/check-landing-stability.mjs [url] [engines] [modes]
 *   defaults: http://localhost:3000/  webkit,chromium  scroll,fling,urlbar,slow,restore
 * Prints a table and writes out-landing-stability.json in the current directory.
 */
import fs from "node:fs"
import { createRequire } from "node:module"

/* Playwright from the project, else from NODE_PATH (an ES module import does not read NODE_PATH). */
const require = createRequire(import.meta.url)
const { chromium, webkit, devices } = require("playwright")

const URL = process.argv[2] || "http://localhost:3000/"
const engines = (process.argv[3] || "webkit,chromium").split(",")
const modes = (process.argv[4] || "scroll,fling,urlbar,slow,restore").split(",")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/*
 * Read what the reader is shown: in a frame, after the page's own
 * ResizeObservers (which run after layout and before paint, and may correct
 * a size in the same frame) and before paint. A probe of our own, created
 * after the page's, is resized in the frame's rAF, so its observer is called
 * after theirs. A read in the middle of a task would also catch a size the
 * page set and corrects before anything is painted, which nobody sees.
 */
const PROBE = `(() => {
  const d = document.createElement("div")
  d.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;visibility:hidden;pointer-events:none"
  document.body.appendChild(d)
  new ResizeObserver(() => {
    const f = window.__probeDone
    window.__probeDone = null
    if (f) f()
  }).observe(d)
  return d
})()`
const snap = (page) =>
  page.evaluate(`new Promise((done) => {
    const probe = (window.__probe ??= ${PROBE})
    requestAnimationFrame(() => {
      window.__probeDone = () => done((${read})())
      probe.style.width = probe.style.width === "2px" ? "1px" : "2px"
    })
  })`)
/*
 * The page's own window.scrollBy calls (lazy-section.tsx scrolls by as much as
 * a box above the screen changed, so nothing on screen moves), summed between
 * two reads. The reader's steps here use scrollTo, so they are not counted.
 */
const SELF = `(() => {
  const by = window.scrollBy.bind(window)
  window.__self = 0
  window.scrollBy = (...a) => {
    const y = window.scrollY
    by(...a)
    window.__self += window.scrollY - y
  }
})()`

/* Runs in the page: where every box is in the page, and where the headings are. */
const read = () => {
  const docTop = (el) => {
    let y = 0
    for (let e = el; e; e = e.offsetParent) y += e.offsetTop
    return y
  }
  const sy = window.scrollY
  const ih = window.innerHeight
  const els = []
  const seen = new Set()
  const add = (key, el) => {
    if (seen.has(el)) return
    seen.add(el)
    const r = el.getBoundingClientRect()
    els.push({
      key,
      top: r.top + sy,
      h: r.height,
      cv: el.style.contentVisibility || getComputedStyle(el).contentVisibility || "",
      cis: el.style.containIntrinsicSize || "",
      mounted: el.hasAttribute("data-lazy-mounted"),
    })
  }
  document.querySelectorAll("[data-sheet],[data-sheet-backdrop]").forEach((el, i) => add(`sheet${i}:${el.getAttribute("data-sheet") || "dark"}`, el))
  document.querySelectorAll("[data-lazy-section]").forEach((el, i) => add(`lazy:${el.getAttribute("data-lazy-section") || i}`, el))
  /* A section inside a box the browser is skipping has no layout of its own to read: left out until its box is drawn. */
  document.querySelectorAll("main section, [data-lazy-section] > section").forEach((el, i) => {
    const box = el.closest("[data-lazy-section]")
    if (box && getComputedStyle(box).contentVisibility === "auto") return
    add(`section:${el.id || i}`, el)
  })
  /* A heading or a block held by a sticky or fixed one is meant to stay put on screen. */
  const held = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const pos = getComputedStyle(e).position
      if (pos === "sticky" || pos === "fixed") return true
    }
    return false
  }
  const heads = []
  document.querySelectorAll("h2").forEach((el, i) => {
    const r = el.getBoundingClientRect()
    if (r.height === 0 || held(el)) return
    heads.push({ key: `h2#${i}:${(el.textContent || "").trim().slice(0, 28)}`, layoutTop: docTop(el), rectTop: r.top })
  })
  /* And whatever is on screen at three points down the middle (a picture, a line of text), followed while it stays there: a heading is not always in view. */
  const pts = (window.__pts ??= [])
  window.__ptId ??= new WeakMap()
  for (const y of [0.2, 0.5, 0.8]) {
    const el = document.elementFromPoint(window.innerWidth / 2, ih * y)
    if (!(el instanceof HTMLElement) || el === document.body || el === document.documentElement || pts.includes(el) || held(el)) continue
    window.__ptId.set(el, (window.__ptN = (window.__ptN || 0) + 1))
    pts.push(el)
    if (pts.length > 12) pts.shift()
  }
  for (const el of pts) {
    if (!el.isConnected) continue
    const r = el.getBoundingClientRect()
    if (r.height > 0) heads.push({ key: `on screen #${window.__ptId.get(el)}:${el.tagName.toLowerCase()}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 20)}`, layoutTop: docTop(el), rectTop: r.top })
  }
  const self = window.__self || 0
  window.__self = 0
  return { sy, ih, self, maxY: document.documentElement.scrollHeight - ih, els, heads }
}

async function run(engineName, mode) {
  const engine = engineName === "webkit" ? webkit : chromium
  const browser = await engine.launch()
  const ctx = await browser.newContext({ ...devices["iPhone 13"] })
  await ctx.addInitScript(SELF)
  const page = await ctx.newPage()
  /* slow: every picture, film and font arrives 4s late (a phone on a weak network), so they land while the page is being scrolled. */
  if (mode === "slow") await page.route("**/*", async (route) => {
    if (["image", "font", "media"].includes(route.request().resourceType())) await sleep(4000)
    await route.continue().catch(() => {})
  })
  await page.goto(URL, { waitUntil: mode === "slow" || mode === "early" ? "domcontentloaded" : "load", timeout: 180000 })
  /* restore: Safari puts a reloaded page back where it was, so the page starts three quarters down and is read upwards first. */
  if (mode === "restore") await page.evaluate(() => window.scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.75)))
  await sleep(mode === "restore" ? 3000 : mode === "early" ? 0 : 1500)
  const changes = []
  /* Steps in which something on screen moved against the scroll, with or without a height change listed. */
  const moves = []
  let maxAnchor = 0
  let maxHeadLayout = 0
  let maxHeadPaint = 0
  let worstHead = null
  let prev = await snap(page)
  let step = 0
  let resized = false
  const pass = async (dir) => {
    for (let guard = 0; guard < 400; guard++) {
      step++
      resized = false
      if (mode === "urlbar" && step % 3 === 0) {
        await page.setViewportSize({ width: 390, height: (step / 3) % 2 ? 750 : 664 })
        resized = true
      }
      const dy = Math.round(prev.ih * (mode === "fling" ? 0.25 : 0.4)) * dir
      if (mode === "fling") await page.evaluate((d) => new Promise((done) => (window.scrollTo(0, window.scrollY + d), requestAnimationFrame(() => done()))), dy)
      else {
        await page.evaluate((d) => window.scrollTo(0, window.scrollY + d), dy)
        await sleep(70)
      }
      const cur = await snap(page)
      /* The reader's scroll: where the page went, less what the page scrolled by itself to hold what is on screen (cur.self, see SELF). */
      const intended = cur.sy - prev.sy - cur.self
      /* Every edge of a box or sheet on screen, and every heading on screen (its place in the page, transforms left out): each must move up the screen by the scroll and nothing else. */
      let stepDev = 0
      if (!resized) {
        const curByKey = new Map(cur.els.map((e) => [e.key, e]))
        for (const p of prev.els) {
          if (!p.key.startsWith("lazy:") && !p.key.startsWith("sheet")) continue
          const c = curByKey.get(p.key)
          if (!c) continue
          /* Each edge of a box or sheet that is on screen in both reads (an edge above the screen moving is not seen; what it moves on screen is). */
          for (const [a, b] of [[p.top, c.top], [p.top + p.h, c.top + c.h]]) {
            const on = a >= prev.sy && a <= prev.sy + prev.ih && b >= cur.sy && b <= cur.sy + cur.ih
            if (on) stepDev = Math.max(stepDev, Math.abs(b - cur.sy - (a - prev.sy - intended)))
          }
        }
        maxAnchor = Math.max(maxAnchor, stepDev)
        const hk = new Map(cur.heads.map((h) => [h.key, h]))
        for (const p of prev.heads) {
          const c = hk.get(p.key)
          if (!c || p.rectTop < 0 || p.rectTop > prev.ih || c.rectTop < 0 || c.rectTop > cur.ih) continue
          const lay = Math.abs(c.layoutTop - cur.sy - (p.layoutTop - prev.sy - intended))
          const paint = Math.abs(c.rectTop - (p.rectTop - intended))
          if (lay > maxHeadLayout) {
            maxHeadLayout = lay
            worstHead = { key: p.key, step, lay }
          }
          stepDev = Math.max(stepDev, lay)
          maxHeadPaint = Math.max(maxHeadPaint, paint)
        }
        if (stepDev > 1) moves.push({ step, sy: Math.round(cur.sy), dev: +stepDev.toFixed(2) })
      }
      const byKey = new Map(prev.els.map((e) => [e.key, e]))
      for (const e of cur.els) {
        const p = byKey.get(e.key)
        if (!p || Math.abs(p.h - e.h) < 0.5) continue
        const pBottom = p.top + p.h
        const where = pBottom <= prev.sy && e.top + e.h <= cur.sy ? "above" : p.top >= prev.sy + prev.ih && e.top >= cur.sy + cur.ih ? "below" : "on screen"
        /* held: nothing on screen moved in that step (stepDev 1px or less): the page moved the scroll with it, or it was under a pixel. */
        changes.push({ step, dir: dir > 0 ? "down" : "up", resized, held: stepDev <= 1, dev: +stepDev.toFixed(2), key: e.key, from: +p.h.toFixed(1), to: +e.h.toFixed(1), where, sy: Math.round(cur.sy), was: `${p.mounted ? "mounted" : "box"} cv=${p.cv} cis=${p.cis}`, now: `${e.mounted ? "mounted" : "box"} cv=${e.cv} cis=${e.cis}` })
      }
      prev = cur
      if (dir > 0 && cur.sy >= cur.maxY - 1) break
      if (dir < 0 && cur.sy <= 0) break
    }
  }
  const order = mode === "restore" ? [-1, 1] : [1, -1]
  await pass(order[0])
  await sleep(400)
  prev = await snap(page)
  await pass(order[1])
  await browser.close()
  return { engine: engineName, mode, steps: step, changes, moves, maxAnchor: +maxAnchor.toFixed(2), maxHeadLayout: +maxHeadLayout.toFixed(2), maxHeadPaint: +maxHeadPaint.toFixed(2), worstHead }
}

const results = []
for (const e of engines) for (const m of modes) {
  const r = await run(e, m)
  results.push(r)
  const above = r.changes.filter((c) => c.where === "above" && !c.resized)
  const seen = above.filter((c) => !c.held)
  console.log(`\n== ${e} ${m}: ${r.steps} steps, ${r.changes.length} height changes, ${above.length} above the screen (${seen.length} moved what was on screen, ${above.length - seen.length} did not), ${r.changes.filter((c) => c.resized).length} in a resize frame`)
  console.log(`   edges of boxes on screen moved against the scroll by at most ${r.maxAnchor}px; a heading or a block on screen, against the scroll, by at most ${r.maxHeadLayout}px (${r.worstHead ? r.worstHead.key : "-"}); drawn heading incl. its entrance transform ${r.maxHeadPaint}px`)
  if (r.moves.length) console.log(`   moved on screen at: ${r.moves.map((m) => `step ${m.step} y=${m.sy} by ${m.dev}px`).join(", ")}`)
  for (const c of r.changes) console.log(`   ${c.where.padEnd(9)} ${c.dir.padEnd(4)} step ${String(c.step).padStart(3)} y=${String(c.sy).padStart(6)}${c.resized ? " [resize]" : ""}${c.where === "above" && c.held ? " [not seen]" : ""}  ${c.key.padEnd(34)} ${c.from} -> ${c.to}   (${c.was} => ${c.now})`)
}
fs.writeFileSync("out-landing-stability.json", JSON.stringify(results, null, 1))
/* A run that stopped early (the server went away) proves nothing. */
const short = results.filter((r) => r.steps < 40)
if (short.length) console.log(`\nINCOMPLETE: ${short.map((r) => `${r.engine} ${r.mode} (${r.steps} steps)`).join(", ")}`)
const bad = short.length > 0 || results.some((r) => r.changes.some((c) => c.where === "above" && !c.resized && !c.held) || r.maxAnchor > 1 || r.maxHeadLayout > 1)
console.log(bad ? "\nFAIL: something above the screen changed size, or content on screen moved against the scroll" : "\nPASS")
process.exitCode = bad ? 1 : 0
