/**
 * ===========================================================================
 *  ROUND 42: THE ONEPAGE EDITOR'S PILL ROWS, + ADD, AND THE PHONE'S TAB BAR
 * ===========================================================================
 * The real editor (scripts/onepage-probe-server.mjs) in headless Chromium,
 * at 390x844 (a phone: touch, 2x) and 1280x800 (a mouse):
 *
 *   pills    Settings' seven pills sit on one line (every pill's top the
 *            same), the row scrolls when it is wider than its box, the end
 *            arrow shows and moves it, the start arrow then shows, and a
 *            pill pressed past the edge is scrolled wholly into view
 *   plus     + Add's + rests at 0 and turns to 45 degrees while the sheet is
 *            up, through frames in between (a turn, not a jump), and back
 *   tabbar   390 only: each tab tapped (CPU slowed 4x); every icon and word
 *            box frame by frame, and the number of compositor layers inside
 *            the bar through the switch (it was 1 at rest and 10 or 11 during
 *            a switch, the faces lifted on and off; now one number)
 *
 *   PROBE_CSS=source node scripts/check-onepage-editor-r42.mjs
 *   REPORT=1   numbers only, nothing fails
 */
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const REPORT = process.env.REPORT === "1"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
const expect = (ok, label, detail) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failures++
}
const fail = (m) => { throw new Error(m) }

const { base, server } = await serveEditorProbe({ fail })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"], protocolTimeout: 240000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1280, height: 800, deviceScaleFactor: 1 }

async function open(vp, hash) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
  await p.goto(`${base}/app/onepage#${hash}`)
  await p.waitForSelector("[data-scroll-container]", { timeout: 15000 })
  await sleep(2500)
  return { p, errors }
}

async function press(p, vp, x, y) {
  if (vp.hasTouch) await p.touchscreen.tap(x, y)
  else await p.mouse.click(x, y)
}

for (const vp of [PHONE, DESK]) {
  const w = vp.width
  console.log(`\nSettings' pills at ${w}`)
  const { p, errors } = await open(vp, "settings")
  await p.waitForSelector('[data-pill-row="settings-pills"] [data-tab]', { timeout: 15000 })
  const rowState = () => p.evaluate(() => {
    const row = document.querySelector('[data-pill-row="settings-pills"]')
    const wrap = row.closest("[data-scroll-row]")
    const r = row.getBoundingClientRect()
    const tabs = [...row.querySelectorAll("[data-tab]")].map((b) => { const t = b.getBoundingClientRect(); return { id: b.dataset.tab, top: Math.round(t.top), left: t.left, right: t.right } })
    const arrows = [...wrap.querySelectorAll("[data-scroll-arrow]")].map((a) => ({ side: a.dataset.scrollArrow, opacity: +getComputedStyle(a).opacity, box: a.getBoundingClientRect().toJSON() }))
    return { scrollLeft: row.scrollLeft, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, left: r.left, right: r.right, tops: [...new Set(tabs.map((t) => t.top))], tabs, arrows, fade: row.dataset.fade }
  })
  const s0 = await rowState()
  expect(s0.tops.length === 1, `${w}: the seven pills are one line`, { tops: s0.tops, pills: s0.tabs.length })
  const overflows = s0.scrollWidth > s0.clientWidth + 2
  console.log(`        row ${s0.clientWidth}px showing, ${s0.scrollWidth}px of pills, fade ${s0.fade}`)
  if (overflows) {
    const end = s0.arrows.find((a) => a.side === "end")
    expect(end && end.opacity > 0.9 && s0.arrows.find((a) => a.side === "start").opacity < 0.1, `${w}: the end arrow shows, the start one not`, s0.arrows.map((a) => [a.side, a.opacity]))
    const btn = await p.$('[data-pill-row="settings-pills"]')
    const arrow = await p.evaluateHandle((row) => row.closest("[data-scroll-row]").querySelector('[data-scroll-arrow="end"]'), btn)
    const ab = await arrow.boundingBox()
    /* The arrow takes a mouse click (a finger scrolls the row itself); on the phone it is clicked as a mouse would. */
    await p.mouse.click(ab.x + ab.width / 2, ab.y + ab.height / 2)
    await sleep(900)
    const s1 = await rowState()
    expect(s1.scrollLeft > s0.scrollLeft + 40, `${w}: the end arrow moves the row`, { from: s0.scrollLeft, to: Math.round(s1.scrollLeft) })
    expect(s1.arrows.find((a) => a.side === "start").opacity > 0.9, `${w}: then the start arrow shows`)
    expect(s1.tops.length === 1, `${w}: still one line`)
    /* To the far end, then press the pill the start fade cuts, on the part of it that shows (clear of the arrow). */
    await p.evaluate(() => { const row = document.querySelector('[data-pill-row="settings-pills"]'); row.scrollLeft = row.scrollWidth })
    await sleep(400)
    /* Then back a little, so the pill the edge cut starts 10px in, under the fade, its end clear of the arrow. */
    const sEnd = await rowState()
    const prev = [...sEnd.tabs].reverse().find((t) => t.left < sEnd.left + 40)
    await p.evaluate((by) => { const row = document.querySelector('[data-pill-row="settings-pills"]'); row.scrollLeft += by }, prev.left - (sEnd.left + 10))
    await sleep(300)
    const s2 = await rowState()
    const cut = s2.tabs.find((t) => t.left < s2.left + 40 && t.right > s2.left + 60)
    expect(!!cut, `${w}: a pill is cut by the start fade`, s2.tabs.map((t) => [t.id, Math.round(t.left), Math.round(t.right)]))
    if (cut) {
      await p.evaluate(() => {
        const row = document.querySelector('[data-pill-row="settings-pills"]')
        window.__s = []
        window.__calls = []
        row.addEventListener("scroll", () => window.__s.push(Math.round(row.scrollLeft)))
        /* What the row was asked to do: headless Chromium has no display to pace a smooth scroll by, so it may land in one or two steps; the request is what the code controls. */
        const own = row.scrollTo.bind(row)
        row.scrollTo = (o) => { window.__calls.push(o && o.behavior); return own(o) }
      })
      const y = await p.evaluate((id) => { const r = document.querySelector(`[data-pill-row="settings-pills"] [data-tab="${id}"]`).getBoundingClientRect(); return r.top + r.height / 2 }, cut.id)
      await press(p, vp, cut.right - 10, y)
      await sleep(900)
      const s3 = await rowState()
      const t = s3.tabs.find((x) => x.id === cut.id)
      const path = await p.evaluate(() => window.__s)
      const active = await p.evaluate(() => document.querySelector('[data-pill-row="settings-pills"] [aria-selected="true"]')?.dataset.tab)
      expect(active === cut.id, `${w}: the press chose "${cut.id}"`, active)
      expect(t.left >= s3.left + 40 - 0.5 && t.right <= s3.right + 0.5, `${w}: and it is scrolled wholly into view, clear of the fade and arrow`, { pill: [Math.round(t.left), Math.round(t.right)], row: [Math.round(s3.left), Math.round(s3.right)] })
      const calls = await p.evaluate(() => window.__calls)
      expect(calls.length === 1 && calls[0] === "smooth", `${w}: by one smooth scroll of the row (never the page)`, { calls, positions: path.slice(0, 12) })
    }
  } else {
    expect(s0.arrows.every((a) => a.opacity < 0.1), `${w}: the row fits, so no arrow shows`)
  }
  expect(errors.length === 0, `${w}: no page errors`, errors.slice(0, 2))
  await p.close()

  console.log(`\n+ Add at ${w}`)
  const q = await open(vp, "links")
  const plusRot = () => q.p.evaluate(() => getComputedStyle(document.querySelector("[data-add-block] [data-add-plus]") || document.querySelector("[data-add-block] svg")).rotate)
  const r0 = await plusRot()
  const addBox = await q.p.evaluate(() => { const b = document.querySelector("[data-add-block]"); b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await sleep(200)
  await q.p.evaluate(() => { window.__rot = []; const el = () => document.querySelector("[data-add-block] svg"); const tick = () => { window.__rot.push(getComputedStyle(el()).rotate); if (window.__rot.length < 40) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
  await press(q.p, vp, addBox.x, addBox.y)
  await sleep(900)
  const seen = await q.p.evaluate(() => window.__rot)
  const r1 = await plusRot()
  const between = [...new Set(seen)].filter((v) => v !== "none" && v !== "0deg" && v !== "45deg")
  expect((r0 === "none" || r0 === "0deg") && r1 === "45deg", `${w}: the + rests at 0 and is at 45 degrees while the sheet is up`, { rest: r0, open: r1 })
  expect(between.length >= 3, `${w}: it turns through frames, not in one step`, between.slice(0, 6))
  const dialogUp = await q.p.evaluate(() => !!document.querySelector('[role="dialog"], [data-bottom-sheet], [data-mobile-bottom-sheet]'))
  expect(dialogUp, `${w}: the Add block sheet is up`)
  expect(q.errors.length === 0, `${w}: no page errors`, q.errors.slice(0, 2))
  await q.p.close()
}

/* ── The phone's tab bar ─────────────────────────────────────────────── */
console.log("\nThe phone's tab bar, each tab tapped (390, CPU 4x)")
{
  const { p, errors } = await open(PHONE, "links")
  const cdp = await p.target().createCDPSession()
  await cdp.send("DOM.getDocument", { depth: -1 })
  await cdp.send("LayerTree.enable")
  const inBar = new Map()
  let counts = []
  const barLayers = async (layers) => {
    let n = 0
    for (const l of layers) {
      if (!l.backendNodeId) continue
      if (!inBar.has(l.backendNodeId)) {
        try {
          const { object } = await cdp.send("DOM.resolveNode", { backendNodeId: l.backendNodeId })
          const { result } = await cdp.send("Runtime.callFunctionOn", { objectId: object.objectId, functionDeclaration: "function(){ const e = this.nodeType === 1 ? this : this.parentElement; return !!(e && e.closest('[data-onepage-tabbar]')) }", returnByValue: true })
          inBar.set(l.backendNodeId, result.value)
        } catch { inBar.set(l.backendNodeId, false) }
      }
      if (inBar.get(l.backendNodeId)) n++
    }
    return n
  }
  cdp.on("LayerTree.layerTreeDidChange", (e) => { if (e.layers) barLayers(e.layers).then((n) => counts.push(n)) })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  let moved = 0
  let reversals = 0
  const allCounts = new Set()
  for (const id of ["design", "products", "links", "products", "design", "links"]) {
    const bb = await p.evaluate((id) => { const r = document.querySelector(`[data-onepage-tabbar] [data-tab="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, id)
    counts = []
    await p.evaluate(() => { window.__fr = []; const tick = () => { const b = document.querySelector("[data-onepage-tabbar]"); window.__fr.push({ pos: [...b.querySelectorAll("[data-tab] svg, [data-tab-word]")].map((s) => { const r = s.getBoundingClientRect(); return `${r.x.toFixed(2)},${r.y.toFixed(2)},${r.width.toFixed(2)}` }).join(" "), fills: [...b.querySelectorAll("[data-tab-fill]")].map((f) => +getComputedStyle(f).opacity) }); if (window.__fr.length < 50) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await p.touchscreen.tap(bb.x, bb.y)
    await sleep(1500)
    const fr = await p.evaluate(() => window.__fr)
    if (new Set(fr.map((f) => f.pos)).size !== 1) moved++
    for (let i = 0; i < 4; i++) { let dir = 0; for (let k = 1; k < fr.length; k++) { const d = Math.sign(fr[k].fills[i] - fr[k - 1].fills[i]); if (d && dir && d !== dir) reversals++; if (d) dir = d } }
    const on = await p.evaluate(() => document.querySelector('[data-onepage-tabbar] [aria-pressed="true"]')?.getAttribute("data-tab"))
    if (on !== id) moved += 100
    counts.forEach((c) => allCounts.add(c))
  }
  const words = await p.evaluate(() => [...document.querySelectorAll("[data-onepage-tabbar] [data-tab-word]")].map((w) => w.getBoundingClientRect().top))
  console.log(`        layers inside the bar seen during the switches: ${[...allCounts].join(", ")}; word tops ${words.map((v) => v.toFixed(2)).join(" ")}`)
  expect(moved === 0, "no icon or word moves or resizes in any frame of any switch, and each tap lands on its tab", { moved })
  expect(reversals === 0, "no fill turns back the way it came during a switch", { reversals })
  expect(allCounts.size <= 1, "the bar's layers stay the same number through every switch (nothing lifted on and off)", [...allCounts])
  expect(words.every((v) => Math.abs(v - Math.round(v)) < 0.01), "each word sits on a whole pixel", words)
  expect(errors.length === 0, "no page errors", errors.slice(0, 2))
  await p.close()
}

await browser.close()
server.close()
console.log(failures ? `\n${failures} failed` : "\nall measured")
if (failures && !REPORT) process.exit(1)
