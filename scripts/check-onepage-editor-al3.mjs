/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S DRAG AND COLLAPSE, MEASURED (round AL3)
 * ===========================================================================
 * Mounts the real OnePage editor (scripts/render-onepage-editor.tsx) with
 * thirty cards and measures, frame by frame:
 *
 *   edge scroll   a card held near the bottom (then the top) of the editor's
 *                 pane, with a mouse at 1440 and a finger at 390: the pane
 *                 scrolls, the right way, eased in (the first frames move
 *                 less than the steady ones) and with no frame jumping more
 *                 than MAX_STEP px.
 *   collapse      a block's settings opening and closing: the height moves
 *                 every frame, no frame doing more than MAX_SHARE of the way,
 *                 and ends where it was going (no snap at the end).
 *
 *   node scripts/check-onepage-editor-al3.mjs
 */
import { existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onepage-al3-"))
mkdirSync(shots, { recursive: true })

const MAX_STEP = 40
/* A smooth open or close: no single frame does more than this share of the whole move. */
const MAX_SHARE = 0.25
const blocks = Array.from({ length: 30 }, (_, i) => ({ id: `b${i + 1}`, type: "link_button", enabled: true, sort_order: i, data: { label: `Link number ${i + 1}`, url: `https://example.com/${i + 1}` } }))
const { base, server } = await serveEditorProbe({ root, blocks, fail })

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function open(vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}/app/onepage#links`)
  await p.waitForSelector("[data-reorder-item]")
  await sleep(900)
  return { p, errors }
}
/* Every frame: the pane's scrollTop and, if asked, an element's height. */
const record = (p, heightOf = null) => p.evaluate((heightOf) => {
  const pane = [...document.querySelectorAll("[data-scroll-container]")].find((e) => getComputedStyle(e).overflowY === "auto")
  window.__rec = []
  window.__on = true
  const loop = () => {
    const el = heightOf ? document.querySelector(heightOf) : null
    window.__rec.push({ t: performance.now(), s: pane ? pane.scrollTop : -1, h: el ? el.getBoundingClientRect().height : -1 })
    if (window.__on) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}, heightOf)
const stop = (p) => p.evaluate(() => { window.__on = false; return window.__rec })
const paneBox = (p) => p.evaluate(() => {
  const pane = [...document.querySelectorAll("[data-scroll-container]")].find((e) => getComputedStyle(e).overflowY === "auto")
  const r = pane.getBoundingClientRect()
  const bar = document.querySelector("[data-onepage-tabbar]")
  const barTop = bar && bar.getClientRects().length ? bar.getBoundingClientRect().top : Infinity
  return { top: Math.max(0, r.top), bottom: Math.min(r.bottom, innerHeight, barTop), max: pane.scrollHeight - pane.clientHeight }
})
const gripOf = (p, id) => p.$eval(`[data-reorder-grip="${id}"]`, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })

function steps(rec) {
  const d = []
  for (let i = 1; i < rec.length; i++) d.push(rec[i].s - rec[i - 1].s)
  return d
}
function judgeScroll(label, rec, sign) {
  /* A finger on its way from one edge to the other passes the first zone: judged from its first move the right way. */
  const all = steps(rec).filter((x) => x !== 0)
  const d = all.slice(Math.max(0, all.findIndex((x) => Math.sign(x) === sign)))
  const moved = rec[rec.length - 1].s - rec[0].s
  const biggest = Math.max(0, ...d.map(Math.abs))
  const firstMoves = d.slice(0, 3).map(Math.abs)
  const steady = d.slice(Math.max(0, d.length - 10)).map(Math.abs)
  const steadyMean = steady.reduce((a, b) => a + b, 0) / Math.max(1, steady.length)
  expect(Math.sign(moved) === sign && Math.abs(moved) > 200, `${label}: the pane scrolls ${sign > 0 ? "down" : "up"}`, { moved })
  expect(d.every((x) => Math.sign(x) === sign), `${label}: every frame the same way`, { against: d.filter((x) => Math.sign(x) !== sign).length })
  expect(biggest <= MAX_STEP, `${label}: no frame jumps more than ${MAX_STEP}px`, { biggest })
  expect(firstMoves.length > 0 && Math.max(...firstMoves) < steadyMean, `${label}: eased in, the first frames move less than the steady ones`, { first: firstMoves, steady: Math.round(steadyMean * 10) / 10 })
  return { moved, biggest, first: firstMoves, steady: Math.round(steadyMean * 10) / 10, frames: rec.length }
}

const numbers = {}

/* ── A MOUSE, AT 1440 ── */
{
  console.log("\ndesktop-1440, a mouse")
  const { p, errors } = await open({ width: 1440, height: 900 })
  const box = await paneBox(p)
  const g = await gripOf(p, "b2")
  await p.mouse.move(g.x, g.y)
  await p.mouse.down()
  await p.mouse.move(g.x, g.y + 8, { steps: 3 })
  await sleep(150)
  await record(p)
  await p.mouse.move(g.x, box.bottom - 8, { steps: 12 })
  await sleep(1400)
  if (process.env.DEBUG) console.log("debug", box, await p.evaluate(() => ({ lifted: document.querySelector("[data-reorder-list]")?.hasAttribute("data-reordering"), panes: [...document.querySelectorAll("[data-scroll-container]")].map((e) => ({ oy: getComputedStyle(e).overflowY, sh: e.scrollHeight, ch: e.clientHeight, st: e.scrollTop })), t: document.querySelector('[data-block-id="b2"]')?.style.transform })))
  numbers.mouseDown = judgeScroll("mouse near the bottom", await stop(p), 1)
  await record(p)
  await p.mouse.move(g.x, box.top + 8, { steps: 12 })
  await sleep(1000)
  numbers.mouseUp = judgeScroll("mouse near the top", await stop(p), -1)
  await p.mouse.up()
  await sleep(600)
  await p.screenshot({ path: join(shots, "desktop-1440-after-drag.png") })

  /* Collapse and expand: a block's settings. */
  await p.evaluate(() => { [...document.querySelectorAll("[data-scroll-container]")].forEach((e) => { e.scrollTop = 0 }) })
  await sleep(300)
  await record(p, "#block-settings-b3")
  await p.click('[data-block-open="b3"]')
  await sleep(800)
  const openRec = (await stop(p)).filter((r) => r.h >= 0)
  await record(p, "#block-settings-b3")
  await p.click('[data-block-open="b3"]')
  await sleep(800)
  const closeRec = (await stop(p)).filter((r) => r.h >= 0)
  const judge = (label, rec, sign) => {
    const h = rec.map((r) => r.h)
    const d = []
    for (let i = 1; i < h.length; i++) d.push(h[i] - h[i - 1])
    const moving = d.filter((x) => Math.abs(x) > 0.5)
    const biggest = Math.max(0, ...moving.map(Math.abs))
    const against = moving.filter((x) => Math.sign(x) !== sign).length
    const final = h[h.length - 1]
    const peak = sign > 0 ? Math.max(...h) : Math.min(...h)
    const lastStep = moving.length ? Math.abs(moving[moving.length - 1]) : 0
    expect(moving.length >= 8, `${label}: the height moves over several frames`, { frames: moving.length })
    const span = Math.abs(h[h.length - 1] - h[0])
    if (process.env.DEBUG) console.log(label, moving.map(Math.round).join(" "), rec.slice(1).map((r, i) => Math.round(r.t - rec[i].t)).join(" "))
    expect(biggest <= span * MAX_SHARE, `${label}: no frame moves more than ${MAX_SHARE * 100}% of the way`, { biggest: Math.round(biggest), span: Math.round(span) })
    expect(against === 0, `${label}: one way, no bounce back`, { against })
    /* A jump is a frame far bigger than both frames beside it; a curve that speeds up and slows down has none. */
    const a = moving.map(Math.abs)
    const spikes = a.filter((x, i) => i > 0 && i < a.length - 1 && x > 2 * Math.max(a[i - 1], a[i + 1])).length
    expect(spikes === 0, `${label}: no frame jumps past the ones beside it`, { spikes })
    expect(Math.abs(final - peak) < 1 && lastStep < 24, `${label}: lands where it was going, no snap at the end`, { final: Math.round(final), lastStep: Math.round(lastStep) })
    return { frames: moving.length, biggest: Math.round(biggest), final: Math.round(final), lastStep: Math.round(lastStep) }
  }
  numbers.open = judge("open", openRec, 1)
  numbers.close = judge("close", closeRec, -1)
  expect(errors.length === 0, "no page errors", errors.slice(0, 3))
  await p.close()
}

/* ── A FINGER, AT 390 ── */
{
  console.log("\nphone-390, a finger on the grip")
  const { p, errors } = await open({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cdp = await p.target().createCDPSession()
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }] }).catch(() => {})
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  const box = await paneBox(p)
  const g = await gripOf(p, "b2")
  await touch("touchStart", g.x, g.y)
  await sleep(60)
  for (let k = 1; k <= 4; k++) await touch("touchMove", g.x, g.y + k * 3)
  await sleep(150)
  await record(p)
  const steps1 = 14
  for (let k = 1; k <= steps1; k++) await touch("touchMove", g.x, g.y + ((box.bottom - 10 - g.y) * k) / steps1)
  /* A finger that stays still sends no events; the pane keeps going on its own. */
  await sleep(1400)
  numbers.fingerDown = judgeScroll("finger near the bottom", await stop(p), 1)
  await record(p)
  for (let k = 1; k <= steps1; k++) await touch("touchMove", g.x, box.bottom - 10 - ((box.bottom - 10 - (box.top + 10)) * k) / steps1)
  await sleep(1000)
  numbers.fingerUp = judgeScroll("finger near the top", await stop(p), -1)
  await touch("touchEnd")
  await sleep(600)
  await p.screenshot({ path: join(shots, "phone-390-after-drag.png") })
  expect(errors.length === 0, "no page errors", errors.slice(0, 3))
  await p.close()
}

console.log(`\nnumbers ${JSON.stringify(numbers)}`)
console.log(`screenshots in ${shots}`)
await browser.close()
server.close()
if (broken) {
  console.log(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nall checks passed")
