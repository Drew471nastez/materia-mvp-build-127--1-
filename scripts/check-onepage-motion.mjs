/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S MOTION, MEASURED
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) at 390x844 with a finger
 * (CPU slowed four times, a mid-range phone) and at 1440x900 with a mouse.
 * Every number is read off frames the browser actually produced:
 *
 *   FRAMES     requestAnimationFrame gaps over the motion: p95, the longest,
 *              and how many ran past two frames (34ms).
 *   PAINTED    what a frame will show is read in a ResizeObserver callback,
 *              which runs after layout and before paint in the same frame,
 *              so "where is the thumb" is where the thumb is drawn.
 *
 *   tabs       Links, Design, Products and Settings: the frames around each
 *              switch, whether any frame shows no panel at all, whether the
 *              active pill slides (frames with it between two tabs), and
 *              whether each tab keeps its own scroll position.
 *   push/pop   Design, a row, and back: the frames, any blank frame, and how
 *              many frames the move is spread over.
 *   choices    a pick in Buttons: whether the dark border arrives over
 *              several frames or in one, and whether the label moves.
 *   sliders    OnePage's Corners slider and the website builder's: for each
 *              frame of a drag, how many frames the painted thumb is behind
 *              the finger, React commits per move, and preview updates.
 *   sheets     how long a tap takes to become the first frame of the slide.
 *
 *   PROBE_CSS=source node scripts/check-onepage-motion.mjs
 *   REPORT=1 ...   numbers only, nothing fails (for a before/after)
 *   SHOTS=/dir ... mid-transition pictures (animations slowed ten times)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const REPORT = !!process.env.REPORT
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-motion-"))
mkdirSync(shots, { recursive: true })
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const wants = (k) => !only.length || only.includes(k)

const { base, server } = await serveEditorProbe({ root, fail })
/* A page with enough links to scroll, for "each tab keeps its place". */
const longPage = await serveEditorProbe({
  root,
  fail,
  blocks: Array.from({ length: 14 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link number ${i + 1}`, url: `https://example.com/${i}` } })),
})
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESKTOP = { width: 1440, height: 900 }
const report = {}
let broken = 0
const expect = (ok, what, got) => {
  if (REPORT) { console.log(`  ....  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`); return }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

/* Installed before the page's own scripts: a frame recorder, a post-layout hook, and pointer times. */
const INSTRUMENT = () => {
  window.__moves = []
  window.addEventListener("pointermove", (e) => window.__moves.push({ t: performance.now(), x: e.clientX }), { capture: true })
  window.__ups = []
  window.addEventListener("pointerup", () => window.__ups.push(performance.now()), { capture: true })
  window.__downs = []
  window.addEventListener("pointerdown", (e) => window.__downs.push(performance.now()), { capture: true })
  window.addEventListener("click", () => window.__downs.push(performance.now()), { capture: true })
  window.__rec = (ms, sample) => new Promise((resolve) => {
    const gaps = []
    const painted = []
    const dummy = document.createElement("div")
    dummy.style.cssText = "position:fixed;left:-20px;top:0;width:1px;height:1px;pointer-events:none"
    document.body.appendChild(dummy)
    let flip = false
    const ro = new ResizeObserver(() => { if (sample) painted.push({ t: performance.now(), ...sample() }) })
    ro.observe(dummy)
    const t0 = performance.now()
    let last = null
    const tick = (ts) => {
      if (last !== null) gaps.push(ts - last)
      last = ts
      flip = !flip
      dummy.style.width = flip ? "2px" : "1px"
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else { ro.disconnect(); dummy.remove(); resolve({ gaps, painted }) }
    }
    requestAnimationFrame(tick)
  })
}
const summary = (gaps) => {
  const s = [...gaps].sort((a, b) => a - b)
  const at = (q) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0)
  return { frames: s.length, p95: Math.round(at(0.95) * 10) / 10, max: Math.round((s[s.length - 1] || 0) * 10) / 10, long: s.filter((g) => g > 34).length }
}

async function open(vp, hash, { throttle = 1, at = base } = {}) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.evaluateOnNewDocument(() => {
    window.__vibrations = 0
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => { window.__vibrations++; return true } })
    try { sessionStorage.clear() } catch {}
  })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${at}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]")
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  /* A phone has no hover and a coarse pointer: app/globals.css answers both. */
  if (vp.hasTouch) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }] })
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  return { p, cdp, errors }
}
const center = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
async function press(s, phone, sel) {
  const c = await center(s.p, sel)
  if (phone) {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await s.p.mouse.click(c.x, c.y)
  }
}
/* A picture mid-way: every animation slowed ten times, the press, a wait, the picture, back to speed. */
async function midShot(s, phone, sel, name, ms = 1200) {
  await s.cdp.send("Animation.enable")
  await s.cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 })
  await press(s, phone, sel)
  await sleep(ms)
  await s.p.screenshot({ path: join(shots, `${name}.png`) })
  await s.cdp.send("Animation.setPlaybackRate", { playbackRate: 1 })
  await sleep(600)
}

/* What the editor's panel area paints: is anything of a panel visible at three points down it? */
const PANEL_SAMPLE = () => {
  const box = document.querySelector("[data-scroll-container]")
  if (!box) return { blank: true }
  const r = box.getBoundingClientRect()
  let seen = 0
  for (const y of [r.top + 90, r.top + 200, r.top + 320]) {
    let el = document.elementFromPoint(r.left + Math.min(r.width / 2, 160), y)
    if (!el || !box.contains(el) || el === box) continue
    let o = 1
    for (let n = el; n && n !== box; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    if (o > 0.3 && el.textContent.trim().length > 0) seen++
    else if (o > 0.3 && el.querySelector?.("svg,img")) seen++
  }
  const pill = document.querySelector("[data-tab-pill]")
  const pillX = pill ? pill.getBoundingClientRect().left : null
  return { blank: seen === 0, pillX }
}

/* ── TABS ── */
if (wants("tabs")) for (const [label, vp, phone, throttle] of [["phone-390", PHONE, true, 4], ["desktop-1440", DESKTOP, false, 1]]) {
  console.log(`\n${label}: tabs`)
  const s = await open(vp, "links", { throttle, at: longPage.base })
  const tabSel = (id) => (phone
    ? `[data-onepage-tabbar] button:nth-of-type(${{ links: 1, design: 2, products: 3, settings: 4 }[id]})`
    : id === "settings" ? 'button[title="Settings"]' : `[data-tab="${id}"]`)
  /* Links scrolled part way, so coming back can be checked. */
  const scrollBox = "[data-scroll-container]"
  const setScroll = (y) => s.p.$eval(scrollBox, (el, y) => { el.scrollTop = y }, y)
  const readScroll = () => s.p.$eval(scrollBox, (el) => {
    const own = [...el.querySelectorAll("[data-tab-scroll]")].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== "hidden")
    return Math.round((own || el).scrollTop)
  })
  const scrollOf = async () => {
    const own = await s.p.$$eval("[data-tab-scroll]", (xs) => xs.length)
    return own
  }
  void scrollOf
  await s.p.evaluate(() => {
    const own = [...document.querySelectorAll("[data-tab-scroll]")].find((x) => x.getClientRects().length && getComputedStyle(x).visibility !== "hidden")
    const el = own || document.querySelector("[data-scroll-container]")
    el.scrollTo({ top: 260, behavior: "instant" })
  })
  await sleep(400)
  void setScroll
  const linksScroll = await readScroll()
  const rows = []
  for (const to of ["design", "products", "settings", "links"]) {
    const commits0 = await s.p.evaluate(() => window.__commits)
    const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 900, PANEL_SAMPLE.toString())
    await sleep(40)
    await press(s, phone, tabSel(to))
    const { gaps, painted } = await rec
    const commits = (await s.p.evaluate(() => window.__commits)) - commits0
    const blank = painted.filter((f) => f.blank).length
    const pills = [...new Set(painted.map((f) => f.pillX).filter((x) => x !== null).map((x) => Math.round(x)))]
    rows.push({ to, ...summary(gaps), blank, pillSteps: Math.max(0, pills.length - 1), commits, scroll: await readScroll() })
    await sleep(300)
  }
  for (const r of rows) console.log(`        to ${r.to.padEnd(9)} p95 ${r.p95}ms  max ${r.max}ms  long ${r.long}  blank frames ${r.blank}  pill frames ${r.pillSteps}  commits ${r.commits}  scroll ${r.scroll}`)
  report[`tabs-${label}`] = rows
  const back = rows[rows.length - 1]
  expect(rows.every((r) => r.blank === 0), "no frame shows an empty panel", rows.map((r) => r.blank))
  expect(rows.every((r) => r.pillSteps >= 3), "the active pill slides over several frames", rows.map((r) => r.pillSteps))
  expect(back.scroll === linksScroll, "Links comes back where it was scrolled to", { left: linksScroll, back: back.scroll })
  expect(rows.every((r) => r.long <= (phone ? 2 : 0)), "no more than two long frames per switch", rows.map((r) => r.long))
  if (!phone) {
    await midShot(s, phone, tabSel("design"), `${label}-tab-mid`, 1300)
  } else {
    await midShot(s, phone, tabSel("design"), `${label}-tab-mid`, 1300)
  }
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── DESIGN PUSH AND POP ── */
if (wants("push")) for (const [label, vp, phone, throttle] of [["phone-390", PHONE, true, 4], ["desktop-1440", DESKTOP, false, 1]]) {
  console.log(`\n${label}: Design, a row and back`)
  const s = await open(vp, "design", { throttle })
  const PANEL = () => {
    const list = document.querySelector('[data-design-panel="home"]')
    const sub = document.querySelector('[data-design-panel]:not([data-design-panel="home"])')
    const x = (el) => (el ? Math.round(el.getBoundingClientRect().left) : null)
    const o = (el) => { let v = 1; for (let n = el; n && n !== document.body; n = n.parentElement) v *= Number(getComputedStyle(n).opacity); return el ? Math.round(v * 100) / 100 : null }
    return { listX: x(list), subX: x(sub), listO: o(list), subO: o(sub), blank: !list && !sub }
  }
  const rows = []
  for (const [what, sel] of [["open Theme", '[data-nav-row="theme"]'], ["back", "[data-panel-back]"], ["open Buttons", '[data-nav-row="buttons"]'], ["back", "[data-panel-back]"]]) {
    const commits0 = await s.p.evaluate(() => window.__commits)
    const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 800, PANEL.toString())
    await sleep(40)
    await press(s, phone, sel)
    const { gaps, painted } = await rec
    const commits = (await s.p.evaluate(() => window.__commits)) - commits0
    const moving = new Set(painted.map((f) => `${f.listX}|${f.subX}`)).size - 1
    const blank = painted.filter((f) => f.blank || ((f.listO ?? 0) < 0.05 && (f.subO ?? 0) < 0.05)).length
    rows.push({ what, ...summary(gaps), moving, blank, commits })
    await sleep(300)
  }
  for (const r of rows) console.log(`        ${r.what.padEnd(13)} p95 ${r.p95}ms  max ${r.max}ms  long ${r.long}  frames in motion ${r.moving}  blank ${r.blank}  commits ${r.commits}`)
  report[`push-${label}`] = rows
  expect(rows.every((r) => r.moving >= 6), "each push and pop is spread over several frames", rows.map((r) => r.moving))
  expect(rows.every((r) => r.blank === 0), "no blank frame", rows.map((r) => r.blank))
  expect(rows.every((r) => r.long <= (phone ? 2 : 0)), "no more than two long frames", rows.map((r) => r.long))
  await midShot(s, phone, '[data-nav-row="wallpaper"]', `${label}-push-mid`, 1500)
  await midShot(s, phone, "[data-panel-back]", `${label}-pop-mid`, 1500)
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── CHOICES ── */
if (wants("choice")) for (const [label, vp, phone] of [["phone-390", PHONE, true], ["desktop-1440", DESKTOP, false]]) {
  console.log(`\n${label}: a pick in Buttons`)
  const s = await open(vp, "design")
  await s.p.click('[data-nav-row="buttons"]')
  await sleep(900)
  const options = await s.p.$$eval("[data-choice], [data-segment]", (xs) => xs.filter((x) => x.getClientRects().length).map((x) => ({ key: x.getAttribute("data-choice") ?? x.getAttribute("data-segment"), kind: x.hasAttribute("data-choice") ? "choice" : "segment", on: x.getAttribute("aria-pressed") === "true" || x.getAttribute("aria-checked") === "true" })))
  const target = options.find((o) => !o.on)
  const was = options.find((o) => o.on && o.kind === target?.kind)
  if (!target || !was) { expect(false, "Buttons has a choice to make", options); await s.p.close(); continue }
  const attr = target.kind === "choice" ? "data-choice" : "data-segment"
  const sel = `[${attr}="${target.key}"]`
  const oldSel = `[${attr}="${was.key}"]`
  const READ = `() => {
    const ring = (el) => {
      if (!el) return null
      const mark = el.querySelector("[data-choice-mark]")
      if (mark) return "mark:" + getComputedStyle(mark).opacity
      const cs = getComputedStyle(el)
      return cs.borderTopColor + "|" + cs.boxShadow
    }
    const a = document.querySelector(${JSON.stringify(sel)})
    const b = document.querySelector(${JSON.stringify(oldSel)})
    const label = (el) => el ? Math.round(el.querySelector("span")?.getBoundingClientRect().width * 10) / 10 : null
    return { on: ring(a), off: ring(b), w: label(a) }
  }`
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 500, READ)
  await sleep(40)
  await press(s, phone, sel)
  const { painted } = await rec
  const onSteps = new Set(painted.map((f) => f.on)).size - 1
  const offSteps = new Set(painted.map((f) => f.off)).size - 1
  const widths = new Set(painted.map((f) => f.w)).size
  console.log(`        picked ${target.key} over ${was.key}: the new one changes over ${onSteps} frames, the old over ${offSteps}, label widths seen ${widths}`)
  report[`choice-${label}`] = { onSteps, offSteps, widths }
  expect(onSteps >= 3 && offSteps >= 3, "the pick fades in and the old one out over several frames", { onSteps, offSteps })
  expect(widths === 1, "the label does not change width", widths)
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/**
 * THE FRAMES FROM A MOVE TO THE THUMB. Ten moves, 120ms apart, so each has
 * time to settle: where the thumb is painted in the last frame before the
 * next move is where that move put it, and the count is how many painted
 * frames after the move it took to get there (0: the frame the move arrived in).
 */
async function sliderLatency(s, phone, { thumb, track }) {
  const t0 = await center(s.p, thumb)
  const tr = await s.p.$eval(track, (t) => { const r = t.getBoundingClientRect(); return { left: r.left, width: r.width } })
  const SAMPLE = `() => { const t = document.querySelector(${JSON.stringify(thumb)}).getBoundingClientRect(); return { thumb: t.left + t.width / 2 } }`
  await s.p.evaluate(() => { window.__moves = [] })
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 2200, SAMPLE)
  await sleep(60)
  /* Start left of the thumb so the drag goes back across the track. */
  const x0 = Math.max(tr.left + 4, t0.x)
  if (phone) await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: t0.y }] })
  else { await s.p.mouse.move(x0, t0.y); await s.p.mouse.down() }
  for (let k = 1; k <= 10; k++) {
    const x = x0 - k * (tr.width * 0.06)
    if (phone) await s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: t0.y }] })
    else await s.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: t0.y, button: "left", buttons: 1 })
    await sleep(120)
  }
  if (phone) await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  else await s.p.mouse.up()
  const { painted } = await rec
  const moves = await s.p.evaluate(() => window.__moves)
  /* The last move ends where the finger lifts: the glide to a step after it is not the move's. */
  const lifted = await s.p.evaluate(() => window.__ups.at(-1) ?? Infinity)
  const out = []
  for (let k = 0; k < moves.length; k++) {
    const from = moves[k].t
    if (from >= lifted) break
    const to = Math.min(moves[k + 1]?.t ?? Infinity, lifted)
    const after = painted.filter((f) => f.t > from && f.t < to)
    if (after.length < 2) continue
    const settled = after[after.length - 1].thumb
    const before = painted.filter((f) => f.t <= from).at(-1)?.thumb
    if (before !== undefined && Math.abs(settled - before) < 0.75) continue
    out.push(after.findIndex((f) => Math.abs(f.thumb - settled) < 0.75))
  }
  return { frames: out, worst: Math.max(0, ...out), sameFrame: out.filter((n) => n === 0).length, of: out.length }
}

/* A drag, and for every painted frame how far behind the finger the thumb is. */
async function dragSlider(s, phone, { thumb, track, input, moves = 36, perBurst = 2 }) {
  const t0 = await center(s.p, thumb)
  const tr = await s.p.$eval(track, (t) => { const r = t.getBoundingClientRect(); return { left: r.left, width: r.width } })
  const step = (tr.width * 0.7) / moves
  const SAMPLE = `() => {
    const t = document.querySelector(${JSON.stringify(thumb)}).getBoundingClientRect()
    const m = window.__moves
    return { thumb: t.left + t.width / 2, n: m.length, value: document.querySelector(${JSON.stringify(input)})?.value ?? null }
  }`
  const preview = await s.p.evaluate(() => {
    const box = document.querySelector("[data-onepage-preview], .onepage-live, [data-phone-preview]") || document.querySelector("[data-onepage-editor] .md\\:block.border-l")
    window.__previewMut = 0
    if (!box) return false
    new MutationObserver(() => { window.__previewMut++ }).observe(box, { subtree: true, attributes: true, childList: true, characterData: true })
    return true
  })
  await s.p.evaluate(() => { window.__moves = [] })
  const commits0 = await s.p.evaluate(() => window.__commits)
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 2600, SAMPLE)
  await sleep(60)
  if (phone) await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: t0.x, y: t0.y }] })
  else { await s.p.mouse.move(t0.x, t0.y); await s.p.mouse.down() }
  for (let k = 1; k <= moves; k += perBurst) {
    const batch = []
    for (let j = 0; j < perBurst; j++) {
      const x = t0.x + (k + j) * step
      batch.push(phone
        ? s.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: t0.y }] })
        : s.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y: t0.y, button: "left", buttons: 1 }))
    }
    await Promise.all(batch)
    await sleep(16)
  }
  if (phone) await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  else await s.p.mouse.up()
  const { gaps, painted } = await rec
  const moveLog = await s.p.evaluate(() => window.__moves)
  const commits = (await s.p.evaluate(() => window.__commits)) - commits0
  const previewMut = await s.p.evaluate(() => window.__previewMut)
  /* For each painted frame while the finger moved: the newest move the thumb agrees with, in frames. */
  const off0 = t0.x - (moveLog[0]?.x ?? t0.x) // the finger's offset from the thumb centre, zero here
  const tol = Math.max(2, (tr.width / 12) / 2 + 1)
  const frames = painted.filter((f) => f.n > 0 && f.n <= moveLog.length)
  const behind = []
  for (let i = 0; i < frames.length; i++) {
    const want = (lag) => {
      const f = frames[i - lag]
      if (!f) return null
      return moveLog[f.n - 1].x + off0
    }
    let lag = 0
    for (; lag < 6; lag++) { const w = want(lag); if (w === null) break; if (Math.abs(frames[i].thumb - Math.min(tr.left + tr.width, Math.max(tr.left, w))) <= tol) break }
    behind.push(lag)
  }
  const sameFrame = behind.filter((b) => b === 0).length
  const latency = await sliderLatency(s, phone, { thumb, track })
  return {
    latency,
    ...summary(gaps),
    moves: moveLog.length,
    commits,
    commitsPerMove: Math.round((commits / Math.max(1, moveLog.length)) * 100) / 100,
    previewUpdates: preview ? previewMut : null,
    framesBehind: { same: sameFrame, of: behind.length, worst: Math.max(0, ...behind), mean: Math.round((behind.reduce((a, b) => a + b, 0) / Math.max(1, behind.length)) * 100) / 100 },
    finalValue: painted.at(-1)?.value,
  }
}

/* ── SLIDERS, ONEPAGE ── */
if (wants("slider")) for (const [label, vp, phone, throttle] of [["phone-390", PHONE, true, 4], ["desktop-1440", DESKTOP, false, 1]]) {
  console.log(`\n${label}: OnePage slider (Buttons, Corners)`)
  const s = await open(vp, "design")
  await s.p.click('[data-nav-row="buttons"]')
  await sleep(900)
  await s.p.$eval("[data-range-row]", (r) => r.scrollIntoView({ block: "center" }))
  await sleep(300)
  if (throttle > 1) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  const vib0 = await s.p.evaluate(() => window.__vibrations)
  const r = await dragSlider(s, phone, { thumb: "[data-range-row] [data-slot=slider-thumb]", track: "[data-range-row] [data-slot=slider-track]", input: "[data-range-row] input" })
  const vib = (await s.p.evaluate(() => window.__vibrations)) - vib0
  console.log(`        ${r.moves} moves: p95 ${r.p95}ms  max ${r.max}ms  long ${r.long}  commits ${r.commits} (${r.commitsPerMove}/move)  preview updates ${r.previewUpdates}  thumb drawn in the move's frame ${r.latency.sameFrame}/${r.latency.of} (frames late ${r.latency.frames.join(",")})  value ${r.finalValue}  taps ${vib}`)
  report[`slider-onepage-${label}`] = { ...r, taps: vib }
  expect(r.latency.of >= 5 && r.latency.worst === 0, "the thumb is painted where the finger put it in the frame of the move", r.latency)
  expect(r.commitsPerMove <= 1, "React is told at most once a move", r.commitsPerMove)
  if (phone) expect(vib >= 3, "a finger still feels the stops", vib)
  else expect(vib === 0, "a mouse feels nothing", vib)
  await s.p.screenshot({ path: join(shots, `${label}-slider.png`) })
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── SLIDERS, WEBSITE BUILDER (the real control in the real sheet, scripts/render-control-frames.tsx) ── */
if (wants("builder")) {
  const dir = join(root, `.motion-probe-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-control-frames.tsx"), "--bundle", "--format=iife", `--outfile=${join(dir, "probe.js")}`,
    `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:@=${root}`,
    "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error"], { stdio: "inherit" })
  const css = await appCss(root)
  const devtoolsHook = `window.__commits=0;window.__REACT_DEVTOOLS_GLOBAL_HOOK__={isDisabled:false,supportsFiber:true,renderers:new Map(),inject(){return 1},onCommitFiberRoot(){window.__commits++},onCommitFiberUnmount(){},onPostCommitFiberRoot(){},onScheduleFiberRoot(){},checkDCE(){}};`
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div><script>${devtoolsHook}window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
  rmSync(dir, { recursive: true, force: true })
  const srv = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
  await new Promise((r) => srv.listen(0, "127.0.0.1", r))
  for (const [label, vp, phone, throttle] of [["phone-390", PHONE, true, 4], ["desktop-1440", { ...DESKTOP }, false, 1]]) {
    console.log(`\n${label}: website builder slider (sheet, canvas costing 60ms)`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(INSTRUMENT)
    await p.evaluateOnNewDocument(() => { window.__vibrations = 0; Object.defineProperty(navigator, "vibrate", { configurable: true, value: () => { window.__vibrations++; return true } }) })
    await p.goto(`http://127.0.0.1:${srv.address().port}/`)
    await p.waitForSelector("[data-slot=slider-thumb]")
    await sleep(1500)
    const cdp = await p.target().createCDPSession()
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
    const r = await dragSlider({ p, cdp }, phone, { thumb: "[data-slot=slider-thumb]", track: "[data-slot=slider-track]", input: "[data-sheet-scroll] input" })
    const vib = await p.evaluate(() => window.__vibrations)
    console.log(`        ${r.moves} moves: p95 ${r.p95}ms  max ${r.max}ms  long ${r.long}  commits ${r.commits} (${r.commitsPerMove}/move)  thumb drawn in the move's frame ${r.latency.sameFrame}/${r.latency.of} (frames late ${r.latency.frames.join(",")})  value ${r.finalValue}  taps ${vib}`)
    report[`slider-builder-${label}`] = { ...r, taps: vib }
    expect(r.latency.of >= 5 && r.latency.worst === 0, "the thumb is painted where the finger put it in the frame of the move", r.latency)
    expect(vib === 0, "the builder's slider stays silent", vib)
    await p.screenshot({ path: join(shots, `${label}-builder-slider.png`) })
    await p.close()
  }
  srv.close()
}

/* ── SHEETS: the tap to the first frame of the slide ── */
if (wants("sheets")) {
  console.log("\nphone-390: sheets, from the tap (CPU slowed four times)")
  const clickText = (text) => `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length); if (b) b.click(); return !!b })()`
  const list = [
    ["Add block", "links", clickText("Add")],
    ["Share", "links", `document.querySelector("[data-onepage-share]").click(), true`],
    ["Social icons", "links", `(() => { const b = [...document.querySelectorAll("button")].find((e) => /social/i.test(e.getAttribute("aria-label") || e.title || e.textContent) && e.getClientRects().length); if (b) b.click(); return !!b })()`],
    ["Page font", "design", `(async () => { document.querySelector('[data-nav-row="text"]').click(); await new Promise((r) => setTimeout(r, 900)); document.querySelector('[data-font-picker="Page font"]').click(); return true })()`],
  ]
  const rows = []
  for (const [name, hash, opener] of list) {
    const s = await open(PHONE, hash, { throttle: 4 })
    const FIRST = () => {
      const el = document.querySelector("[data-app-sheet] [data-sheet-panel]")
      return { y: el ? Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42) : null }
    }
    const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 1400, FIRST.toString())
    await sleep(40)
    const found = await s.p.evaluate(opener)
    const { gaps, painted } = await rec
    const tapAt = await s.p.evaluate(() => window.__downs.at(-1) ?? null)
    const firstMove = painted.find((f, i) => f.y !== null && i > 0 && painted[i - 1].y !== null && f.y < painted[i - 1].y - 0.5)
    const rest = painted.find((f) => f.y !== null && Math.abs(f.y) < 0.5)
    rows.push({ name, found, ...summary(gaps), toFirstMove: firstMove && tapAt ? Math.round(firstMove.t - tapAt) : null, toRest: rest && tapAt ? Math.round(rest.t - tapAt) : null })
    await s.p.close()
  }
  for (const r of rows) console.log(`        ${r.name.padEnd(13)} ${r.found ? "" : "(not found) "}p95 ${r.p95}ms  max ${r.max}ms  long ${r.long}  tap to first move ${r.toFirstMove}ms  to rest ${r.toRest}ms`)
  report.sheets = rows
}

writeFileSync(join(shots, "motion-report.json"), JSON.stringify(report, null, 2))
console.log(`\npictures and numbers in ${shots}`)
await browser.close()
server.close()
longPage.server.close()
if (REPORT) process.exit(0)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
