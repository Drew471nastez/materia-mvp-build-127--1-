/**
 * ===========================================================================
 *  THE DESIGN TAB'S PUSH AND POP ON A COMPUTER, FRAME BY FRAME
 * ===========================================================================
 * "In the OnePage editor, when I switch and navigate, there are glitchy,
 * buggy page transitions." The recording (desktop Chrome, a window 1280
 * wide): Theme arrived as a box standing in from the right with the list's
 * words cut at the left, and back left a strip of Theme at the right edge
 * that came back whole for two frames before the list was drawn.
 *
 * The real editor (scripts/onepage-probe-server.mjs) at 1280x800 with a
 * mouse and the CPU slowed four times. The editor's column is 1280 less
 * the app's sidebar (240) and the phone preview (410): 630px. For every
 * row of the Design list it clicks the row, then the way back, and reads
 * each frame the browser produced (a ResizeObserver callback, after layout
 * and before paint):
 *
 *   width      both pages are exactly the column wide in every frame
 *   side       while both are drawn they sit side by side: the list's right
 *              edge is the panel's left edge, no overlap and no gap
 *   one way    each page only moves one way; nothing jumps back
 *   after      once the move ends the page left is not drawn, nothing is
 *              left animating, and the page arrived is at the column's edge
 *   overflow   the column never scrolls sideways, its vertical scrollbar
 *              changes at most once per move, and the column's width
 *              never changes (scrollbars are drawn and take room here)
 *   scroll     a panel opens at its top; back returns to the list's place
 *   title      the title at the top of the column only ever changes once
 *
 * Then Links, Design and Products in the top bar (the new tab over the old,
 * the old one gone after, each back where it was scrolled), and the same
 * push at 390 with a finger, where it stays the phone's own push.
 *
 *   PROBE_CSS=source node scripts/check-onepage-design-push.mjs
 *   REPORT=1 ...   numbers only, nothing fails (for a before and after)
 *   SHOTS=/dir ... mid-move pictures, prefixed oppush-
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const REPORT = !!process.env.REPORT
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-oppush-"))
mkdirSync(shots, { recursive: true })
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const wants = (k) => !only.length || only.includes(k)
const SECTIONS = (process.env.SECTIONS || "theme,header,wallpaper,text,buttons,socials,footer").split(",")

const { base, server } = await serveEditorProbe({
  root,
  fail,
  blocks: Array.from({ length: 14 }, (_, i) => ({ id: `l${i}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link number ${i + 1}`, url: `https://example.com/${i}` } })),
})
/* Scrollbars drawn and taking room, as on Windows and on a Mac set to show them always (the recording's). */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], ignoreDefaultArgs: ["--hide-scrollbars"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  const tail = got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`
  if (REPORT) { console.log(`  ....  ${what}${tail}`); return }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${tail}`)
  if (!ok) broken++
}

/* Frames: a function sampled in each frame, after layout and before paint. */
const INSTRUMENT = () => {
  window.__rec = (ms, sample) => new Promise((resolve) => {
    const painted = []
    const dummy = document.createElement("div")
    dummy.style.cssText = "position:fixed;left:-20px;top:0;width:1px;height:1px;pointer-events:none"
    document.body.appendChild(dummy)
    let flip = false
    const ro = new ResizeObserver(() => { painted.push({ t: Math.round(performance.now()), ...sample() }) })
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

/* What the Design stack shows in a frame, in the column's own coordinates. */
const STACK_SAMPLE = () => {
  const col = document.querySelector("[data-tab-panel][data-scroll-container]")
  const c = col.getBoundingClientRect()
  const colW = col.clientWidth
  const page = (el) => {
    if (!el || el.getClientRects().length === 0 || getComputedStyle(el).display === "none" || getComputedStyle(el).visibility === "hidden") return null
    const r = el.getBoundingClientRect()
    /* Is any of it inside the column? */
    const seen = r.right > c.left + 0.5 && r.left < c.left + colW - 0.5 && r.bottom > c.top && r.top < c.bottom
    return seen ? { x: Math.round((r.left - c.left) * 10) / 10, w: Math.round(r.width * 10) / 10 } : null
  }
  const list = document.querySelector('[data-design-panel="home"]')
  const sub = document.querySelector('[data-design-panel]:not([data-design-panel="home"])')
  /* The title drawn at the top left of the column: what is under a point in the heading's row. */
  const titleAt = () => {
    const hit = document.elementsFromPoint(c.left + Math.min(120, colW / 4), c.top + 48)
    const h = hit.find((n) => n.tagName === "H2" && n.closest("[data-panel-header]"))
    return h ? h.textContent : null
  }
  const stack = document.querySelector("[data-design-stack]")
  return {
    colW,
    list: page(list),
    sub: page(sub),
    subId: sub?.getAttribute("data-design-panel") || null,
    title: titleAt(),
    sideways: col.scrollWidth - col.clientWidth,
    scrolls: col.scrollHeight > col.clientHeight + 1,
    top: Math.round(col.scrollTop),
    /* The stack's own motion: animations on a page or on the list's shade, running or holding a frame. */
    anims: stack ? stack.getAnimations({ subtree: true }).filter((a) => a.effect?.target?.matches?.("[data-design-panel], [data-design-dim]") && (a.playState !== "finished" || a.effect.getComputedTiming().fill !== "none")).length : 0,
  }
}

async function open(viewport, hash, { throttle = 4, touch = false } = {}) {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.evaluateOnNewDocument(() => { try { sessionStorage.clear() } catch {} })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-tab-panel][data-scroll-container]")
  await sleep(2500)
  const cdp = await p.target().createCDPSession()
  if (touch) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }] })
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  return { p, cdp, errors }
}
const center = (p, sel) => p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + Math.min(r.width / 2, 120), y: r.top + r.height / 2 } })
async function click(s, sel) {
  const c = await center(s.p, sel)
  await s.p.mouse.move(c.x, c.y)
  await s.p.mouse.down()
  await sleep(60)
  await s.p.mouse.up()
}
async function tap(s, sel) {
  const c = await center(s.p, sel)
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
  await sleep(90)
  await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
async function record(s, press, ms = 1300) {
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), ms, STACK_SAMPLE.toString())
  await sleep(30)
  await press()
  return rec
}

/**
 * The rules for one move. `arriving` is the page coming in ("sub" or
 * "list"); `leaving` the other. `dir` is which way the page arriving
 * travels: -1 to the left (a push), +1 to the right (back).
 */
function judge(frames, { arriving, leaving, dir, title, startTop }) {
  const out = {}
  const moving = frames.filter((f) => f.anims > 0 || (f[leaving] && f[arriving]))
  out.framesMoving = moving.length
  /* Width: every page drawn is the column's width. */
  const widths = frames.flatMap((f) => [f.list, f.sub].filter(Boolean).map((p) => Math.round((p.w - f.colW) * 10) / 10))
  out.worstWidth = widths.reduce((m, d) => (Math.abs(d) > Math.abs(m) ? d : m), 0)
  /* Side by side: while both are drawn, the list's right edge is the panel's left edge. */
  const both = frames.filter((f) => f.list && f.sub)
  out.framesBoth = both.length
  out.worstSeam = both.reduce((m, f) => { const d = Math.round((f.sub.x - (f.list.x + f.list.w)) * 10) / 10; return Math.abs(d) > Math.abs(m) ? d : m }, 0)
  /* One way: the page arriving and the page leaving only travel in `dir`. */
  const back = (key) => {
    let worst = 0
    let last = null
    for (const f of frames) {
      if (!f[key]) { last = null; continue }
      if (last !== null) { const d = (f[key].x - last) * dir; if (d < worst) worst = d }
      last = f[key].x
    }
    return Math.round(worst * 10) / 10
  }
  out.arrivingBack = back(arriving)
  out.leavingBack = back(leaving)
  /* After: once the page arriving is home, the page leaving is never drawn again. */
  const home = frames.findIndex((f) => f[arriving] && Math.abs(f[arriving].x) < 0.5 && f.anims === 0)
  out.settledAt = home
  out.leftoverFrames = home < 0 ? -1 : frames.slice(home).filter((f) => f[leaving]).length
  const last = frames.at(-1)
  out.endX = last[arriving]?.x ?? null
  out.endLeaving = !!last[leaving]
  out.endAnims = last.anims
  /* The first frame of the move: nothing drawn yet but the page leaving, at rest. */
  const first = frames.find((f) => f[arriving])
  out.firstArrivingX = first ? first[arriving].x : null
  /* Overflow and the scrollbar. */
  out.sideways = Math.max(...frames.map((f) => f.sideways))
  let flips = 0
  for (let i = 1; i < frames.length; i++) if (frames[i].scrolls !== frames[i - 1].scrolls) flips++
  out.scrollbarFlips = flips
  /* The column's width never changes (a scrollbar coming or going would narrow or widen every page in it). */
  out.colWidths = [...new Set(frames.map((f) => f.colW))]
  /* Titles in order, repeats folded. */
  const seq = []
  for (const f of frames) if (f.title && seq.at(-1) !== f.title) seq.push(f.title)
  out.titles = seq
  out.endTop = last.top
  out.ok = Math.abs(out.worstWidth) <= 0.5 && Math.abs(out.worstSeam) <= 1 && out.arrivingBack >= -0.5 && out.leavingBack >= -0.5 &&
    out.leftoverFrames === 0 && out.endX === 0 && !out.endLeaving && out.endAnims === 0 && out.sideways <= 0 && out.scrollbarFlips <= 1 && out.colWidths.length === 1 &&
    seq.length <= 2 && (title === null ? seq.length <= 1 : seq.at(-1) === title) && (startTop === undefined || out.endTop === startTop)
  return out
}

/* Mid-move pictures: every animation on the stack paused at a fraction of its way. */
async function midShots(s, press, name) {
  /* The stack's safety timer (the move's length and a quarter second) would end a paused move; it is held off while the pictures are taken. */
  await s.p.evaluate(() => {
    window.__setTimeout = window.setTimeout
    window.setTimeout = (f, ms, ...rest) => (ms >= 300 && ms <= 800 ? 0 : window.__setTimeout(f, ms, ...rest))
  })
  await press()
  for (let i = 0; i < 60; i++) {
    const n = await s.p.evaluate(() => document.querySelector("[data-design-stack]")?.getAnimations({ subtree: true }).length ?? 0)
    if (n) break
    await sleep(5)
  }
  for (const frac of [0.15, 0.4, 0.7]) {
    await s.p.evaluate((frac) => {
      for (const a of document.querySelector("[data-design-stack]").getAnimations({ subtree: true }).filter((a) => a.effect?.target?.matches?.("[data-design-panel], [data-design-dim]"))) {
        a.pause()
        a.currentTime = frac * a.effect.getComputedTiming().duration
      }
    }, frac)
    await sleep(80)
    await s.p.screenshot({ path: join(shots, `oppush-${name}-${Math.round(frac * 100)}.png`), clip: { x: 240, y: 58, width: 1040, height: 520 } })
  }
  await s.p.evaluate(() => {
    window.setTimeout = window.__setTimeout
    for (const a of document.querySelector("[data-design-stack]").getAnimations({ subtree: true })) a.play()
  })
  await sleep(900)
}

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1 }

/* ── (a) EVERY ROW, IN AND BACK, AT 1280 ── */
if (wants("push")) {
  console.log("\ndesktop 1280x800, CPU/4: each Design row, in and back")
  const s = await open(DESKTOP, "design")
  const col = await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => ({ w: el.clientWidth, h: el.clientHeight, sh: el.scrollHeight }))
  console.log(`        the column: ${col.w}px wide, ${col.h}px tall, the list ${col.sh}px`)
  for (const id of SECTIONS) {
    /* The list scrolled a little first, where it can scroll, so back has a place to return to. */
    const listTop = await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => { el.scrollTop = Math.min(40, el.scrollHeight - el.clientHeight); return Math.round(el.scrollTop) })
    await sleep(100)
    const label = await s.p.$eval(`[data-nav-row="${id}"]`, (el) => el.querySelector("span, div")?.textContent || "")
    const inFrames = await record(s, () => click(s, `[data-nav-row="${id}"]`))
    const title = await s.p.$eval('[data-design-panel]:not([data-design-panel="home"]) h2', (h) => h.textContent)
    const a = judge(inFrames, { arriving: "sub", leaving: "list", dir: -1, title })
    expect(a.ok, `${title}: in`, `width ${a.worstWidth}, seam ${a.worstSeam}, frames both ${a.framesBoth}, back-steps ${a.arrivingBack}/${a.leavingBack}, first x ${a.firstArrivingX}, leftover ${a.leftoverFrames}, end x ${a.endX} anims ${a.endAnims}, sideways ${a.sideways}, scrollbar flips ${a.scrollbarFlips}, column ${a.colWidths.join('/')}, titles ${a.titles.join(">")}, top ${a.endTop}`)
    if (!REPORT && !a.ok) console.log(`        frames: ${JSON.stringify(inFrames.slice(0, 40).map((f) => [f.list?.x ?? "-", f.list?.w ?? "-", f.sub?.x ?? "-", f.sub?.w ?? "-", f.anims]))}`)
    const outFrames = await record(s, () => click(s, "[data-panel-back]"))
    const b = judge(outFrames, { arriving: "list", leaving: "sub", dir: 1, title: "Design", startTop: listTop })
    expect(b.ok, `${title}: back`, `width ${b.worstWidth}, seam ${b.worstSeam}, frames both ${b.framesBoth}, back-steps ${b.arrivingBack}/${b.leavingBack}, first x ${b.firstArrivingX}, leftover ${b.leftoverFrames}, end x ${b.endX} anims ${b.endAnims}, sideways ${b.sideways}, scrollbar flips ${b.scrollbarFlips}, column ${b.colWidths.join('/')}, titles ${b.titles.join(">")}, top ${b.endTop} (was ${listTop})`)
    if (!REPORT && !b.ok) console.log(`        frames: ${JSON.stringify(outFrames.slice(0, 40).map((f) => [f.list?.x ?? "-", f.list?.w ?? "-", f.sub?.x ?? "-", f.sub?.w ?? "-", f.anims]))}`)
    void label
  }
  /* Opened at its top: the panel scrolled down, back, and in again. */
  await click(s, '[data-nav-row="theme"]')
  await sleep(900)
  await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => { el.scrollTop = 300 })
  await sleep(100)
  /* Its way back is scrolled out of sight now: pressed where it is. */
  await s.p.$eval("[data-panel-back]", (el) => el.click())
  await sleep(900)
  await click(s, '[data-nav-row="theme"]')
  await sleep(900)
  const topAgain = await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => el.scrollTop)
  expect(topAgain === 0, "a panel opens at its top, however it was left", topAgain)
  await click(s, "[data-panel-back]")
  await sleep(900)
  /* Back pressed half way in: taken from where it is, and still side by side. */
  /* Pressed where the moving button is (a mouse's down and up can land either side of a moving target). */
  const mid = await record(s, async () => { await click(s, '[data-nav-row="theme"]'); await sleep(150); await s.p.$eval("[data-panel-back]", (el) => el.click()) }, 1800)
  const m = judge(mid, { arriving: "list", leaving: "sub", dir: 1, title: "Design" })
  const seamOk = Math.abs(m.worstSeam) <= 1 && Math.abs(m.worstWidth) <= 0.5 && m.endX === 0 && !m.endLeaving && m.endAnims === 0
  expect(seamOk, "back pressed half way in: side by side, and the list alone after", `width ${m.worstWidth}, seam ${m.worstSeam}, end x ${m.endX}, leaving drawn ${m.endLeaving}, anims ${m.endAnims}`)
  if (process.env.SHOTS) {
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await midShots(s, () => click(s, '[data-nav-row="theme"]'), "theme-in")
    await midShots(s, () => click(s, "[data-panel-back]"), "theme-back")
  }
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (a2) A SHORT WINDOW, WHERE THE LIST SCROLLS: BACK RETURNS TO ITS PLACE ── */
if (wants("push")) {
  console.log("\ndesktop 1280x520, CPU/4: the list scrolled, a row, and back")
  const s = await open({ width: 1280, height: 520, deviceScaleFactor: 1 }, "design")
  for (const id of ["footer", "socials"]) {
    const listTop = await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => { el.scrollTop = el.scrollHeight; return Math.round(el.scrollTop) })
    await sleep(150)
    const inFrames = await record(s, () => click(s, `[data-nav-row="${id}"]`))
    const title = await s.p.$eval('[data-design-panel]:not([data-design-panel="home"]) h2', (h) => h.textContent)
    const a = judge(inFrames, { arriving: "sub", leaving: "list", dir: -1, title, startTop: 0 })
    expect(a.ok && listTop > 0, `list at ${listTop}, ${title}: in, at its top`, `width ${a.worstWidth}, seam ${a.worstSeam}, leftover ${a.leftoverFrames}, column ${a.colWidths.join("/")}, scrollbar flips ${a.scrollbarFlips}, top ${a.endTop}`)
    const outFrames = await record(s, () => click(s, "[data-panel-back]"))
    /* The list's own title is scrolled out of sight: only the panel's is ever at the top, and then none. */
    const b = judge(outFrames, { arriving: "list", leaving: "sub", dir: 1, title: null, startTop: listTop })
    expect(b.ok, `${title}: back, to the list where it was left`, `width ${b.worstWidth}, seam ${b.worstSeam}, leftover ${b.leftoverFrames}, column ${b.colWidths.join("/")}, scrollbar flips ${b.scrollbarFlips}, titles ${b.titles.join(">")}, top ${b.endTop} (was ${listTop})`)
  }
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (b) THE TOP TABS AT 1280 ── */
if (wants("tabs")) {
  console.log("\ndesktop 1280x800, CPU/4: Links, Design, Products, Design, Links")
  const s = await open(DESKTOP, "links")
  await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => { el.scrollTop = 200 })
  const TAB_SAMPLE = () => {
    const panels = [...document.querySelectorAll("[data-tab-panel]")]
    const shown = panels.filter((el) => getComputedStyle(el).visibility !== "hidden")
    const top = document.querySelector("[data-tab-panel][data-scroll-container]")
    let o = 1
    for (let n = top; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return { shown: shown.map((el) => el.getAttribute("data-tab-panel")), on: top?.getAttribute("data-tab-panel"), o: Math.round(o * 100) / 100, w: top ? Math.round(top.getBoundingClientRect().width) : 0, x: top ? Math.round(top.getBoundingClientRect().left) : 0 }
  }
  const scrolled = { links: 200 }
  for (const to of ["design", "products", "design", "links"]) {
    const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 900, TAB_SAMPLE.toString())
    await sleep(30)
    const c = await s.p.$eval(`[data-tab-pill-row] [data-tab="${to}"], [data-tab="${to}"]`, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await s.p.mouse.click(c.x, c.y)
    const f = await rec
    const blank = f.filter((x) => !x.shown.length).length
    const moved = new Set(f.map((x) => `${x.x}|${x.w}`)).size
    const last = f.at(-1)
    const top = await s.p.$eval("[data-tab-panel][data-scroll-container]", (el) => el.scrollTop)
    const place = scrolled[to] === undefined || Math.abs(top - scrolled[to]) <= 1
    expect(!blank && moved === 1 && last.shown.length === 1 && last.shown[0] === to && last.o === 1 && place,
      `to ${to}: no blank frame, nothing slides, the old tab gone after, its own place`, `blank ${blank}, positions ${moved}, shown at the end ${last.shown.join("+")}, opacity ${last.o}, scrollTop ${top}${scrolled[to] !== undefined ? ` (was ${scrolled[to]})` : ""}`)
    if (scrolled[to] === undefined) scrolled[to] = top
  }
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── (c) A PHONE: THE PHONE'S OWN PUSH, AND THE END OF IT CLEAN ── */
if (wants("phone")) {
  console.log("\nphone 390x844, CPU/4, a finger: Theme in and back")
  const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  const s = await open(PHONE, "design", { touch: true })
  for (const id of ["theme", "wallpaper"]) {
    const inFrames = await record(s, () => tap(s, `[data-nav-row="${id}"]`))
    const title = await s.p.$eval('[data-design-panel]:not([data-design-panel="home"]) h2', (h) => h.textContent)
    const a = judge(inFrames, { arriving: "sub", leaving: "list", dir: -1, title })
    const aOk = Math.abs(a.worstWidth) <= 0.5 && a.arrivingBack >= -0.5 && a.leftoverFrames === 0 && a.endX === 0 && !a.endLeaving && a.endAnims === 0 && a.sideways <= 0 && a.titles.at(-1) === title
    expect(aOk, `${title}: in, the page's width, one way, nothing left after`, `width ${a.worstWidth}, frames moving ${a.framesMoving}, back-steps ${a.arrivingBack}, leftover ${a.leftoverFrames}, end x ${a.endX}, anims ${a.endAnims}, sideways ${a.sideways}`)
    const outFrames = await record(s, () => tap(s, "[data-panel-back]"))
    const b = judge(outFrames, { arriving: "list", leaving: "sub", dir: 1, title: "Design" })
    const bOk = Math.abs(b.worstWidth) <= 0.5 && b.leavingBack >= -0.5 && b.leftoverFrames === 0 && b.endX === 0 && !b.endLeaving && b.endAnims === 0 && b.sideways <= 0 && b.titles.length <= 2 && b.titles.at(-1) === "Design"
    expect(bOk, `${title}: back, one way, nothing left after, the title changes once`, `width ${b.worstWidth}, frames moving ${b.framesMoving}, back-steps ${b.leavingBack}, leftover ${b.leftoverFrames}, end x ${b.endX}, anims ${b.endAnims}, titles ${b.titles.join(">")}`)
  }
  expect(!s.errors.length, "no page errors", s.errors.slice(0, 3))
  await s.p.close()
}

await browser.close()
server.close()
console.log(`\nshots: ${shots}`)
if (broken) fail(`${broken} check(s) failed`)
console.log("\nall good")
