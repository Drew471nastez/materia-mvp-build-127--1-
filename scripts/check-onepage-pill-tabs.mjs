/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S PILL TABS, PRESSED AND MEASURED
 * ===========================================================================
 * "Switching between pill tabs (Basic info, SEO, Subscribe, Share, and every
 * other pill-tab row in the OnePage editor) is laggy, buggy, direct to
 * direct, bad, cheap."
 *
 * The real editor (scripts/onepage-probe-server.mjs) on a phone (390x844, a
 * finger, the CPU slowed four times) and a laptop (1440x900, a mouse). For
 * each row, several presses, each recorded frame by frame:
 *
 *   FIRST MOTION  from the finger or the button going down to the first
 *                 frame in which the row has changed
 *   THE PILL      the chosen mark moves by transform alone (a slide and a
 *                 stretch), over several frames, and nothing else in the
 *                 row changes its colour abruptly
 *   THE PANEL     below it: no frame without a panel drawn (less than half
 *                 of one), its box does not change height, and it is not
 *                 built on the press (elements added to the page)
 *   REACT         commits for the press
 *   FRAMES        the longest frame while anything moves, from the press to
 *                 the frame after the last change (and, reported, the longest
 *                 after that, to 700ms, when nothing is moving)
 *   SCROLL        a Settings section scrolled down is there again, scrolled,
 *                 after another section has been looked at
 *
 * Rows: Settings' sections (the chips on a phone, the list on a laptop), the
 * Theme page's kinds (All, Light, Dark...) and the editor's own tabs (on a
 * phone the bottom bar has no pill: its buttons change in place, as the
 * owner asked, so there only the time to the first change is judged).
 *
 *   PROBE_CSS=source node scripts/check-onepage-pill-tabs.mjs
 *   REPORT=1 ...   numbers only, nothing fails (for a before and after)
 *   SHOTS=/dir ... screenshots and mid-slide frames, prefixed pills-
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const REPORT = !!process.env.REPORT
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-pills-"))
mkdirSync(shots, { recursive: true })
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const wants = (k) => !only.length || only.includes(k)

const { base, server } = await serveEditorProbe({ root, fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const SIZES = [
  { label: "phone-390", viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, cpu: 4, touch: true },
  { label: "desktop-1440", viewport: { width: 1440, height: 900, deviceScaleFactor: 1 }, cpu: 1, touch: false },
]
const report = {}
let broken = 0
const expect = (ok, what, got) => {
  const tail = got === undefined ? "" : `   (${JSON.stringify(got)})`
  if (REPORT) { console.log(`  ....  ${what}${tail}`); return }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${tail}`)
  if (!ok) broken++
}

const INSTRUMENT = () => {
  window.__downs = []
  for (const t of ["pointerdown", "mousedown", "touchstart"]) window.addEventListener(t, () => window.__downs.push(performance.now()), { capture: true })
  window.__anims = []
  const animate = Element.prototype.animate
  Element.prototype.animate = function (kf, opts) {
    const frames = Array.isArray(kf) ? kf : []
    window.__anims.push({ t: performance.now(), props: [...new Set(frames.flatMap((f) => Object.keys(f)).filter((k) => !["offset", "easing", "composite"].includes(k)))] })
    return animate.call(this, kf, opts)
  }
  window.__transitions = []
  document.addEventListener("transitionrun", (e) => window.__transitions.push({ t: performance.now(), prop: e.propertyName }), true)
  window.__added = 0
  new MutationObserver((recs) => { for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) window.__added += 1 + n.querySelectorAll("*").length }).observe(document, { childList: true, subtree: true })
  window.__rec = (ms, sample) => new Promise((resolve) => {
    const painted = []
    const dummy = document.createElement("div")
    dummy.style.cssText = "position:fixed;left:-20px;top:0;width:1px;height:1px;pointer-events:none"
    document.body.appendChild(dummy)
    let flip = false
    const ro = new ResizeObserver(() => { painted.push({ t: performance.now(), ...sample() }) })
    ro.observe(dummy)
    const t0 = performance.now()
    const tick = () => {
      flip = !flip
      dummy.style.width = flip ? "2px" : "1px"
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else { ro.disconnect(); dummy.remove(); resolve(painted) }
    }
    requestAnimationFrame(tick)
  })
}

async function open(size, hash) {
  const p = await browser.newPage()
  await p.setViewport(size.viewport)
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.evaluateOnNewDocument(() => { try { sessionStorage.clear() } catch {} })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  /* The editor arrives (up to 2.5s for the preview) and builds its tabs in the idle time after: a person starting to press. */
  await sleep(4500)
  const cdp = await p.target().createCDPSession()
  if (size.touch) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }] })
  if (size.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: size.cpu })
  return { p, cdp, errors, size }
}

/* A finger rests on the glass 90ms; a mouse button is down 60ms. */
async function press(s, sel) {
  const c = await s.p.$eval(sel, (el) => { el.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  if (s.size.touch) {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
    await sleep(90)
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await s.p.mouse.move(c.x, c.y)
    await s.p.mouse.down()
    await sleep(60)
    await s.p.mouse.up()
  }
}

/**
 * What one frame shows. The row: every button's own colour and its marks,
 * and any pill in it (where it is and its transform). The panel: which
 * pieces are drawn and how much, and the height of the box they are in.
 */
const SAMPLE = () => {
  const row = document.querySelector("[data-probe-row]")
  const opacity = (el) => { let v = 1; for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === "hidden" || cs.display === "none") return 0; v *= Number(cs.opacity) } return v }
  const buttons = row ? [...row.querySelectorAll("button")] : []
  const rowSig = buttons.map((b) => {
    const cs = getComputedStyle(b)
    const marks = [...b.querySelectorAll("[data-choice-mark], [data-pill-face], [data-tab-fill], [data-tab-face]")].map((m) => Math.round(Number(getComputedStyle(m).opacity) * 100)).join(".")
    return `${cs.backgroundColor}/${cs.color}/${marks}`
  }).join("|")
  const pills = row ? [...row.querySelectorAll("[data-tab-pill], [data-pill]")] : []
  const pillSig = pills.map((pl) => { const r = pl.getBoundingClientRect(); return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}@${Math.round(Number(getComputedStyle(pl).opacity) * 100)}` }).join("|")
  /* Looked up each frame: a panel built on the press is a new element. */
  const panels = [...document.querySelectorAll(window.__probePanels || "[data-probe-panel]")]
  const drawn = panels.map((el) => opacity(el))
  const box = document.querySelector(window.__probeBox || "[data-probe-box]")
  return { sig: `${rowSig}#${pillSig}`, pill: pillSig, drawn: Math.max(0, ...drawn), sum: drawn.reduce((a, b) => a + b, 0), h: box ? Math.round(box.getBoundingClientRect().height) : 0 }
}

async function recordPress(s, sel, ms = 700) {
  const before = await s.p.evaluate(() => ({ commits: window.__commits, added: window.__added, a: window.__anims.length, x: window.__transitions.length }))
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), ms, SAMPLE.toString())
  await sleep(50)
  const start = await s.p.evaluate(() => performance.now())
  await press(s, sel)
  const frames = await rec
  const after = await s.p.evaluate(() => ({ commits: window.__commits, added: window.__added, anims: window.__anims, transitions: window.__transitions, downs: window.__downs }))
  const down = after.downs.find((t) => t >= start) ?? start
  const initial = frames.filter((f) => f.t < down).at(-1) ?? frames[0]
  const moved = frames.find((f) => f.t > down && f.sig !== initial.sig)
  const last = [...frames].reverse().find((f, i, arr) => i + 1 < arr.length && f.sig !== arr[i + 1].sig)
  const pillSteps = new Set(frames.filter((f) => f.t > down).map((f) => f.pill)).size
  const after0 = frames.filter((f) => f.t >= down)
  /* The frames while something moves: from the press to the frame after the last change. */
  const moving = after0.filter((f) => !last || f.t <= last.t + 20)
  const gaps = moving.slice(1).map((f, i) => f.t - moving[i].t)
  /* And the longest after that, when nothing moves (a panel made inert once it has faded out, say). */
  const still = after0.filter((f) => last && f.t > last.t)
  const stillGaps = still.slice(1).map((f, i) => f.t - still[i].t)
  return {
    firstMotionMs: moved ? Math.round(moved.t - down) : null,
    settledMs: last ? Math.round(last.t - down) : null,
    pillSteps,
    rowSteps: new Set(after0.map((f) => f.sig)).size,
    commits: after.commits - before.commits,
    added: after.added - before.added,
    longestFrameMs: gaps.length ? Math.round(Math.max(...gaps)) : 0,
    longestStillFrameMs: stillGaps.length ? Math.round(Math.max(...stillGaps)) : 0,
    minDrawn: Math.round(Math.min(...after0.map((f) => f.drawn)) * 100) / 100,
    heights: [...new Set(after0.map((f) => f.h))],
    animated: [...new Set([...after.anims.slice(before.a).flatMap((a) => a.props), ...after.transitions.slice(before.x).map((x) => x.prop)])],
  }
}

async function midShot(s, handle, name) {
  /* A little way into the motion, every animation on the page is held where it is for the picture, then let go. */
  await press(s, handle)
  await sleep(s.size.touch ? 60 : 90)
  await s.p.evaluate(() => { window.__held = document.getAnimations(); window.__held.forEach((a) => a.pause()) })
  await s.p.screenshot({ path: join(shots, name) })
  await s.p.evaluate(() => window.__held.forEach((a) => a.play()))
  await sleep(1200)
}

/** Marks the row, the panels and their box for SAMPLE, and names each button by its words. */
async function mark(s, { rowOf, panels, box }) {
  return s.p.evaluate((rowOf, panels, box) => {
    for (const a of ["data-probe-row", "data-probe-panel", "data-probe-box"]) document.querySelectorAll(`[${a}]`).forEach((e) => e.removeAttribute(a))
    const row = new Function(`return (${rowOf})()`)()
    if (!row) return false
    row.setAttribute("data-probe-row", "")
    for (const b of row.querySelectorAll("button")) b.setAttribute("data-probe-label", b.textContent.trim().toLowerCase())
    window.__probePanels = panels
    window.__probeBox = box
    return true
  }, rowOf.toString(), panels, box)
}

function summarise(label, rows) {
  const worst = (k) => Math.max(...rows.map((r) => r[k] ?? 9999))
  const least = (k) => Math.min(...rows.map((r) => r[k] ?? 0))
  return { label, presses: rows.length, firstMotionMs: worst("firstMotionMs"), settledMs: worst("settledMs"), pillStepsMin: least("pillSteps"), commitsMax: worst("commits"), addedMax: worst("added"), longestFrameMs: worst("longestFrameMs"), longestStillFrameMs: worst("longestStillFrameMs"), minDrawn: least("minDrawn"), heights: [...new Set(rows.flatMap((r) => r.heights))], animated: [...new Set(rows.flatMap((r) => r.animated))] }
}

function printRows(tag, rows) {
  for (const r of rows) console.log(`      ${r.what.padEnd(12)} first motion ${String(r.firstMotionMs).padStart(4)}ms  settled ${String(r.settledMs).padStart(4)}ms  pill positions ${String(r.pillSteps).padStart(2)}  commits ${r.commits}  elements added ${r.added}  longest frame moving ${r.longestFrameMs}ms, after ${r.longestStillFrameMs}ms  least panel drawn ${r.minDrawn}  heights ${JSON.stringify(r.heights)}  animated ${JSON.stringify(r.animated)}`)
  const sum = summarise(tag, rows)
  report[tag] = { ...sum, rows }
  return sum
}

function judge(tag, sum, { panel = true, frames = true, pill = true } = {}) {
  /* Four frames at 60Hz on the slowed phone, two on the laptop. A transition's first frame is drawn at its start, so two is the least there can be. */
  expect(sum.firstMotionMs <= (tag.includes("phone") ? 67 : 40), `${tag}: the row is moving within ${tag.includes("phone") ? "four frames" : "two frames (40ms)"} of the press`, sum.firstMotionMs)
  if (pill) expect(sum.pillStepsMin >= 5, `${tag}: it slides over several frames`, sum.pillStepsMin)
  expect(sum.animated.every((p) => /^(transform|opacity|scale|translate)$/.test(p)), `${tag}: by transform and opacity only`, sum.animated)
  if (panel) {
    expect(sum.minDrawn >= 0.5, `${tag}: no frame without the panel drawn`, sum.minDrawn)
    expect(sum.heights.length === 1, `${tag}: the panel's box keeps its height`, sum.heights)
    expect(sum.addedMax <= 4, `${tag}: the panel is not built on the press`, sum.addedMax)
  }
  if (frames) expect(sum.longestFrameMs <= (tag.includes("phone") ? 60 : 40), `${tag}: no long frame while it moves`, sum.longestFrameMs)
}

/* ------------------------------------------------------------------------ */
if (wants("settings")) {
  console.log("\nSettings: Basic info, SEO, Subscribe, Share")
  for (const size of SIZES) {
    const s = await open(size, "settings")
    await s.p.waitForSelector('[data-tab-panel="settings"] [data-settings-basic]')
    await sleep(1500)
    const rowOf = () => [...document.querySelectorAll('[data-tab-panel="settings"] button')].filter((b) => b.textContent.trim() === "SEO" && b.getClientRects().length && b.getBoundingClientRect().width > 0).map((b) => b.parentElement)[0]
    /* The sections, and the box they are drawn in (the element around them). */
    const SET = { rowOf, panels: '[data-tab-panel="settings"] [data-settings-section]', box: '[data-tab-panel="settings"] [data-pill-panels], [data-tab-panel="settings"] :has(> [data-settings-section])' }
    const rows = []
    for (const to of ["seo", "subscribe", "share", "basic info", "seo"]) {
      /* A section built on the press is a new element: find the row again each time. */
      await mark(s, SET)
      const r = await recordPress(s, `[data-probe-row] [data-probe-label="${to}"]`)
      rows.push({ what: to, ...r })
      await sleep(500)
    }
    console.log(`    ${size.label}`)
    const sum = printRows(`settings-${size.label}`, rows)
    judge(`settings-${size.label}`, sum)
    /* Scrolled down in SEO, to Share and back: SEO is where it was left. */
    const scroller = '[data-tab-panel="settings"]'
    await s.p.$eval(scroller, (el) => { el.scrollTop = 260 })
    await sleep(300)
    const at = await s.p.$eval(scroller, (el) => el.scrollTop)
    await mark(s, SET)
    await press(s, '[data-probe-row] [data-probe-label="share"]')
    await sleep(700)
    await mark(s, SET)
    await press(s, '[data-probe-row] [data-probe-label="seo"]')
    await sleep(700)
    const back = await s.p.$eval(scroller, (el) => el.scrollTop)
    report[`settings-scroll-${size.label}`] = { left: at, back }
    console.log(`    ${size.label}: SEO left at ${at}px, after Share it is at ${back}px`)
    expect(at > 0 && Math.abs(back - at) <= 1, `${size.label}: SEO keeps its scroll`, { left: at, back })
    await s.p.$eval(scroller, (el) => { el.scrollTop = 0 })
    await sleep(200)
    await s.p.screenshot({ path: join(shots, `pills-settings-${size.label}.png`) })
    await mark(s, SET)
    await midShot(s, '[data-probe-row] [data-probe-label="subscribe"]', `pills-settings-mid-${size.label}.png`)
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.p.close()
  }
}

/* ------------------------------------------------------------------------ */
if (wants("theme")) {
  console.log("\nTheme: All, Light, Dark, Gradient, Image")
  for (const size of SIZES) {
    const s = await open(size, "design")
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await s.p.waitForSelector('[data-nav-row="theme"]')
    await s.p.click('[data-nav-row="theme"]')
    /* A person looks at the themes for a few seconds before choosing a kind; the kinds are built in that time. */
    await sleep(4500)
    if (size.cpu > 1) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: size.cpu })
    const rowOf = () => document.querySelector('[role="tablist"][aria-label="Theme kind"]')
    const rows = []
    for (const to of ["dark", "light", "gradient", "all"]) {
      /* The grid of themes under the row: one per kind, or the one there was. */
      await mark(s, { rowOf, panels: "[data-theme-grid]", box: "[data-theme-grid]" })
      const r = await recordPress(s, `[data-probe-row] [data-probe-label="${to}"]`)
      rows.push({ what: to, ...r })
      await sleep(500)
    }
    console.log(`    ${size.label}`)
    const sum = printRows(`theme-${size.label}`, rows)
    /*
      The grid under the kinds is the steady filter's (design-tab
      useSteadyFilter: one grid, filtered, held so the page does not move,
      faded in, rebuilt on each pick), measured by
      scripts/check-onepage-tabbar.mjs; here its frames are reported, and the
      row's pill is judged.
    */
    judge(`theme-${size.label}`, sum, { panel: false, frames: false })
    await s.p.screenshot({ path: join(shots, `pills-theme-${size.label}.png`) })
    await mark(s, { rowOf, panels: "[data-theme-grid]", box: "[data-theme-grid]" })
    await midShot(s, '[data-probe-row] [data-probe-label="dark"]', `pills-theme-mid-${size.label}.png`)
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.p.close()
  }
}

/* ------------------------------------------------------------------------ */
if (wants("tabs")) {
  console.log("\nThe editor's own tabs: Links, Design, Products")
  for (const size of SIZES) {
    const s = await open(size, "links")
    const rowOf = new Function(`return () => document.querySelector('[data-tab-row="${size.touch ? "phone" : "desktop"}"]')`)()
    const rows = []
    for (const to of ["design", "products", "links"]) {
      await mark(s, { rowOf, panels: "[data-tab-panel]:not([aria-hidden])", box: "[data-onepage-panels]" })
      const r = await recordPress(s, `[data-probe-row] [data-tab="${to}"]`)
      rows.push({ what: to, ...r })
      await sleep(600)
    }
    console.log(`    ${size.label}`)
    const sum = printRows(`tabs-${size.label}`, rows)
    /*
      The editor's own tabs are kept and crossfaded by the editor
      (onepage-editor, ONE TAB TO THE NEXT); showing a kept tab lays it out
      and paints it, which is that mechanism's cost and is reported here,
      not judged: this row's part is the pill.
    */
    judge(`tabs-${size.label}`, sum, { panel: false, frames: false, pill: !size.touch })
    expect(sum.minDrawn >= 0.5, `tabs-${size.label}: no frame without a tab drawn`, sum.minDrawn)
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.p.close()
  }
}

await browser.close()
server.close()
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2))
console.log(`\nScreenshots in ${shots}`)
if (!REPORT && broken) { console.error(`\n${broken} check(s) failed.\n`); process.exit(1) }
