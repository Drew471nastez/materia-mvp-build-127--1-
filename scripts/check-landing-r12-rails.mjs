// Landing round 12, rails. The real showcase and creators rail, bundled on their own (scripts/render-landing-r12-rails.tsx), no dev server.
// 1. A finger on the creators rail (a phone, CDP touches as a real finger moves: slow at first, a little wobble down): the rail's place every frame from the touch to the end of the swipe. It must never step against the swipe, and it must follow from the first frame the swipe is the rail's.
// 2. The same on the showcase rail.
// 3. Screenshots at 390, 1440 and 1920.
// Usage: OUT=dir node scripts/check-landing-r12-rails.mjs
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const require = createRequire(import.meta.url)
const pw = require("playwright")
const root = process.cwd()
const OUT = process.env.OUT || "/tmp/check-landing-r12-rails"
const ONLY = process.env.ONLY || "touch,shots"
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 500)}`}`)
}
const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-landing-r12-rails.tsx", statics: { "/home/": join(root, "public/home") }, fail: (m) => { console.error(m); process.exit(1) } })
const browser = await pw.chromium.launch()

/* Every frame: the track's drawn transform (its computed style, which is what a running animation draws) and its rect. */
const RECORDER = (sel) => {
  const tr = document.querySelector(sel)
  const read = () => new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41
  window.__ev = []
  window.__fr = []
  /* Event timestamps and frame times on one clock, performance.now(); the listeners are added once a page. */
  if (!window.__rec) {
    window.__rec = true
    const rec = (e) => window.__ev.push({ type: e.type, t: performance.now(), x: e.touches ? (e.touches[0] ? e.touches[0].clientX : null) : e.clientX })
    for (const ty of ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup", "pointercancel"]) window.addEventListener(ty, rec, { capture: true, passive: true })
  }
  let n = 0
  const gen = (window.__gen = (window.__gen || 0) + 1)
  const loop = (now) => {
    if (gen !== window.__gen) return
    window.__fr.push({ t: now, x: read(), anims: tr.getAnimations().length })
    if (++n < 600) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

/* A finger as a person swipes: down, a moment still, then away to the left, slow for the first few px with a little wobble down and up, then quicker; lifted. */
async function fingerSwipe(cdp, x0, y0, dir = -1, steps = 36, stepMs = 8) {
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 1, id: 1 }] })
  await touch("touchStart", x0, y0)
  await sleep(70)
  let x = x0
  let y = y0
  for (let i = 1; i <= steps; i++) {
    x += dir * Math.min(9, 0.5 + i * 0.32)
    y += i % 3 === 0 ? 0.9 : -0.45
    await touch("touchMove", x, y)
    await sleep(stepMs)
  }
  await touch("touchEnd")
}

/* From the press to the lift: per frame steps of the rail; a step against the swipe (by more than 0.05px) is a reversal. */
function analyse(data, dir) {
  const press = data.ev.find((e) => e.type === "touchstart" || e.type === "pointerdown")
  const lift = [...data.ev].reverse().find((e) => e.type === "touchend" || e.type === "pointerup")
  const fr = data.fr.filter((f) => f.t >= press.t - 1 && f.t <= lift.t + 1)
  const steps = []
  for (let i = 1; i < fr.length; i++) steps.push(+(fr[i].x - fr[i - 1].x).toFixed(2))
  /* The rail moves with the finger: dir -1 (finger going left) means the transform goes more negative. */
  const against = steps.filter((s) => s * dir < -0.05)
  const firstMove = data.ev.find((e) => e.type === "touchmove" || (e.type === "pointermove" && e.t > press.t))
  return { frames: fr.length, steps, against, travelled: +(fr[fr.length - 1].x - fr[0].x).toFixed(1), pressAt: +press.t.toFixed(1), firstMoveAt: firstMove ? +firstMove.t.toFixed(1) : null }
}

if (ONLY.includes("touch")) {
  console.log("\n── 1. A finger on the rails, every frame ──")
  const ctx = await browser.newContext({ ...pw.devices["iPhone 13"] })
  const p = await ctx.newPage()
  await p.goto(base + "/", { waitUntil: "load" })
  const cdp = await ctx.newCDPSession(p)
  const results = {}
  for (const [name, vpSel, trSel] of [["creators", ".cc-viewport", ".cc-track"], ["showcase", ".build-showcase-viewport", ".build-showcase-track"]]) {
    for (const dir of [-1, 1]) {
      for (let run = 0; run < 3; run++) {
        await p.locator(vpSel).scrollIntoViewIfNeeded()
        await sleep(run === 0 ? 3200 : 2600)
        const box = await p.locator(vpSel).boundingBox()
        await p.evaluate(RECORDER, trSel)
        await sleep(120)
        await fingerSwipe(cdp, dir < 0 ? 300 : 90, box.y + Math.min(120, box.height / 2), dir)
        await sleep(900)
        const data = await p.evaluate(() => ({ ev: window.__ev, fr: window.__fr }))
        const a = analyse(data, dir)
        results[`${name}:${dir}:${run}`] = { ...a, ev: data.ev.slice(0, 12) }
        expect(a.against.length === 0 && Math.abs(a.travelled) > 60, `${name}, swipe ${dir < 0 ? "left" : "right"} #${run + 1}: no frame steps against the finger, and the rail travels`, { against: a.against, travelled: a.travelled, steps: a.steps.slice(0, 24) })
        /* Round 12: on a touch screen nothing moves the rail on a compositor clock the page cannot read (rail-frames.ts): no Web Animation on the track in any frame, drifting, held, swiped or gliding after. */
        const anims = Math.max(...data.fr.map((f) => f.anims))
        expect(anims === 0, `${name} #${run + 1}: no Web Animation on the track in any of ${data.fr.length} frames`, { anims })
        await sleep(1800)
      }
    }
  }
  writeFileSync(join(OUT, "touch.json"), JSON.stringify(results, null, 1))
  await ctx.close()
}

/*
  2. WHAT IS DRAWN. The per frame numbers above are the main thread's; a
  running Web Animation is drawn by the compositor, which can be ahead of
  them. Here the screen itself is read (a CDP screencast, every frame the
  compositor draws): a row of pixels through the cards, and how far it shifted
  from the frame before, found by matching. The finger throws the rail, and
  while it is still gliding comes down again and swipes on: from that press
  on, no drawn frame may step against the new swipe.
*/
async function drawnShifts(p, cdp, vpSel, act) {
  const sharp = require("sharp")
  const box = await p.locator(vpSel).boundingBox()
  const rowY = Math.round(box.y + box.height * 0.35)
  const frames = []
  cdp.on("Page.screencastFrame", async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "png", everyNthFrame: 1, maxWidth: 390, maxHeight: 844 })
  const marks = await act(box)
  await sleep(300)
  await cdp.send("Page.stopScreencast")
  frames.sort((a, b) => a.t - b.t)
  const rows = []
  for (const f of frames) {
    const { data, info } = await sharp(Buffer.from(f.data, "base64")).raw().toBuffer({ resolveWithObject: true })
    const y = Math.min(info.height - 1, Math.round((rowY / 844) * info.height))
    const row = new Float32Array(info.width)
    for (let x = 0; x < info.width; x++) {
      let s = 0
      for (let dy = -2; dy <= 2; dy++) {
        const o = ((y + dy) * info.width + x) * info.channels
        s += data[o] * 0.3 + data[o + 1] * 0.59 + data[o + 2] * 0.11
      }
      row[x] = s / 5
    }
    rows.push({ t: f.t, row, w: info.width })
  }
  /* Shift of each row against the one before: the offset (−90..90 px) where they differ least. */
  const shifts = []
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].row
    const b = rows[i].row
    let best = 0
    let bestErr = Infinity
    for (let s = -90; s <= 90; s++) {
      let err = 0
      let n = 0
      for (let x = 100; x < rows[i].w - 100; x++) {
        const d = a[x] - b[x - s]
        err += d * d
        n++
      }
      err /= n
      if (err < bestErr) { bestErr = err; best = s }
    }
    shifts.push({ t: rows[i].t, s: best })
  }
  return { shifts, marks }
}

if (ONLY.includes("drawn")) {
  console.log("\n── 2. What is drawn, a press on a gliding rail ──")
  const ctx = await browser.newContext({ ...pw.devices["iPhone 13"], deviceScaleFactor: 1 })
  const p = await ctx.newPage()
  await p.goto(base + "/", { waitUntil: "load" })
  const cdp = await ctx.newCDPSession(p)
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 1, id: 1 }] })
  const out = {}
  for (const [name, vpSel] of [["creators", ".cc-viewport"], ["showcase", ".build-showcase-viewport"]]) {
    for (let run = 0; run < 3; run++) {
      await p.locator(vpSel).scrollIntoViewIfNeeded()
      await sleep(2600)
      const { shifts, marks } = await drawnShifts(p, cdp, vpSel, async (box) => {
        const y = box.y + Math.min(110, box.height / 2)
        /* A quick throw to the left. */
        await touch("touchStart", 320, y)
        for (let i = 1; i <= 8; i++) {
          await touch("touchMove", 320 - i * 22, y)
          await sleep(10)
        }
        await touch("touchEnd")
        await sleep(110 + run * 60)
        /* Down again while it glides, a moment still, then a slow swipe on to the left, the way a reader swipes again. */
        const pressWall = Date.now() / 1000
        await touch("touchStart", 300, y)
        await sleep(120)
        let x = 300
        for (let i = 1; i <= 20; i++) {
          x -= Math.min(8, 0.6 + i * 0.4)
          await touch("touchMove", x, y + (i % 3 ? -0.4 : 0.8))
          await sleep(10)
        }
        await touch("touchEnd")
        return { pressWall }
      })
      /* Every move in this recording is to the left (rows shift by positive s, the matcher's sign): the throw, its glide, the press holding it, the new swipe. A negative shift is the rail stepping back. */
      const against = shifts.filter((f) => f.s < 0)
      out[`${name}:${run}`] = { shifts: shifts.map((f) => f.s), pressWall: marks.pressWall, t: shifts.map((f) => +(f.t - marks.pressWall).toFixed(3)) }
      expect(against.length === 0, `${name} #${run + 1}: a throw, a press while it glides, a swipe on: no drawn frame steps back`, { against: against.map((f) => [f.s, +(f.t - marks.pressWall).toFixed(3)]), shifts: shifts.map((f) => f.s).slice(0, 60) })
      await sleep(2500)
    }
  }
  writeFileSync(join(OUT, "drawn.json"), JSON.stringify(out, null, 1))
  await ctx.close()
}

if (ONLY.includes("shots")) {
  console.log("\n── 3. Screenshots ──")
  for (const [w, h, touch] of [[390, 844, true], [1440, 900, false], [1920, 1080, false]]) {
    const ctx = await browser.newContext(touch ? { ...pw.devices["iPhone 13"] } : { viewport: { width: w, height: h } })
    const p = await ctx.newPage()
    await p.goto(base + "/", { waitUntil: "load" })
    await p.locator(".build-showcase-viewport").scrollIntoViewIfNeeded()
    await sleep(2500)
    await p.locator(".build-showcase").screenshot({ path: join(OUT, `showcase-${w}.png`) })
    if (!touch) {
      for (let i = 1; i < 4; i++) {
        await p.focus(".build-showcase-track")
        await p.keyboard.press("ArrowRight")
        await sleep(1400)
        await p.locator(".build-showcase").screenshot({ path: join(OUT, `showcase-${w}-page${i + 1}.png`) })
      }
    } else {
      const cdp = await ctx.newCDPSession(p)
      for (let i = 1; i < 6; i++) {
        const box = await p.locator(".build-showcase-viewport").boundingBox()
        await fingerSwipe(cdp, 320, box.y + 100, -1, 22)
        await sleep(1000)
        await p.locator(".build-showcase").screenshot({ path: join(OUT, `showcase-${w}-swipe${i}.png`) })
      }
    }
    const shown = await p.evaluate(() => [...document.querySelectorAll(".build-showcase-pic img")].map((i) => [i.currentSrc.split("/").pop(), i.naturalWidth, i.hasAttribute("data-shown")]))
    writeFileSync(join(OUT, `shown-${w}.json`), JSON.stringify(shown))
    await p.locator(".cc-viewport").scrollIntoViewIfNeeded()
    await sleep(2500)
    await p.locator(".cc-section").screenshot({ path: join(OUT, `creators-${w}.png`) })
    await ctx.close()
  }
}

await browser.close()
server.close()
console.log(failed ? `\n${failed} failed` : "\nall ok")
process.exit(failed ? 1 : 0)
