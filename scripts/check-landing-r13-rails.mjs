// Landing round 13, rails. The real creators rail and showcase, bundled on their own (scripts/render-landing-r12-rails.tsx), no dev server.
// 1. The creators rail starts on the streamers' card: its left edge on the content edge, before and after the script takes over (no step).
// 2. It drifts on its own and loops: the place keeps growing past one lap, no frame stands still or steps back while it cruises.
// 3. Frame times at 390 (an iPhone 13) with the CPU slowed 4x: the page's frames while the rail cruises, and through a swipe and its glide.
//    Also: will-change only while the rail is live, and nothing moves while it is off screen.
// Usage: OUT=dir node scripts/check-landing-r13-rails.mjs
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { serveEditorProbe } from "./onepage-probe-server.mjs"
const require = createRequire(import.meta.url)
const pw = require("playwright")
const root = process.cwd()
const OUT = process.env.OUT || "/tmp/check-landing-r13-rails"
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const { base, server } = await serveEditorProbe({ root, entry: "scripts/render-landing-r12-rails.tsx", statics: { "/home/": join(root, "public/home") }, fail: (m) => { console.error(m); process.exit(1) } })
const browser = await pw.chromium.launch()

/* Frame intervals and the rail's place for `ms`, read every frame. */
const RECORD = (ms) =>
  new Promise((done) => {
    const tr = document.querySelector(".cc-track")
    const fr = []
    const t0 = performance.now()
    const loop = (now) => {
      fr.push({ t: now, x: -new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41 })
      if (now - t0 < ms) requestAnimationFrame(loop)
      else done(fr)
    }
    requestAnimationFrame(loop)
  })
const stats = (fr) => {
  const d = []
  for (let i = 1; i < fr.length; i++) d.push(fr[i].t - fr[i - 1].t)
  const s = [...d].sort((a, b) => a - b)
  const q = (p) => +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1)
  return { frames: fr.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +Math.max(...d).toFixed(1), over25: d.filter((v) => v > 25).length, over34: d.filter((v) => v > 34).length }
}

for (const [label, ctxOpts] of [["390 touch", { ...pw.devices["iPhone 13"] }], ["1440 mouse", { viewport: { width: 1440, height: 900 } }]]) {
  console.log(`\n── ${label} ──`)
  const ctx = await browser.newContext(ctxOpts)
  const p = await ctx.newPage()
  await p.goto(base + "/", { waitUntil: "load" })
  await p.locator(".cc-viewport").scrollIntoViewIfNeeded()
  /* 1. The start: the streamers' card on the content edge. Read at once, then after the script has taken over. */
  const at = () =>
    p.evaluate(() => {
      const vp = document.querySelector(".cc-viewport").getBoundingClientRect()
      const cards = [...document.querySelectorAll(".cc-card")]
      const head = document.querySelector(".cc-head .story-heading").getBoundingClientRect()
      /* The first card whose most is past the content edge (the one before peeks into the gutter). */
      const first = cards.find((c) => { const r = c.getBoundingClientRect(); return r.left + r.width / 2 > Math.max(vp.left, head.left - 20) })
      const st = cards.find((c) => c.querySelector(".cc-kind")?.textContent === "Streamers")
      return { firstKind: first?.querySelector(".cc-kind")?.textContent, streamersLeft: +st.getBoundingClientRect().left.toFixed(1), headLeft: +head.left.toFixed(1), willChange: document.querySelector(".cc-track").style.willChange }
    })
  const start = await at()
  expect(start.firstKind === "Streamers" && Math.abs(start.streamersLeft - start.headLeft) < 30, "the rail starts on the streamers' card, on the content edge", start)
  await sleep(1200)
  const later = await at()
  expect(later.firstKind === "Streamers" && later.streamersLeft < start.streamersLeft, "a second later it has drifted on from there (left), and is live (will-change)", later)
  expect(later.willChange === "transform", "will-change while live", later.willChange)

  /* 2 and 3. Cruising, with the CPU slowed 4x. */
  const cdp = await ctx.newCDPSession(p)
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(500)
  const cruise = await p.evaluate(RECORD, 4000)
  const steps = []
  for (let i = 1; i < cruise.length; i++) {
    let s = cruise[i].x - cruise[i - 1].x
    if (s < -200) s = null /* the lap: wrapped back by one copy of the cards */
    steps.push(s)
  }
  const back = steps.filter((s) => s !== null && s < -0.01)
  const still = steps.filter((s) => s !== null && Math.abs(s) < 0.001)
  const cs = stats(cruise)
  writeFileSync(join(OUT, `cruise-${label.split(" ")[0]}.json`), JSON.stringify({ stats: cs, fr: cruise }, null, 0))
  expect(back.length === 0 && still.length <= 2, `cruising at 4x CPU: never a step back, ${still.length} frames standing still`, { back: back.slice(0, 8) })
  console.log(`        frame times, cruising, 4x CPU: ${JSON.stringify(cs)}`)
  expect(cs.p95 <= 20 && cs.over34 <= 2, "cruising at 4x CPU: 95% of frames within 20ms, at most 2 over 34ms", cs)

  if (label.startsWith("390")) {
    /* A swipe and its glide, at 4x. */
    const box = await p.locator(".cc-viewport").boundingBox()
    const rec = p.evaluate(RECORD, 2600)
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 9, radiusY: 9, force: 1, id: 1 }] })
    await sleep(200)
    const y = box.y + 120
    await touch("touchStart", 320, y)
    let x = 320
    for (let i = 1; i <= 24; i++) {
      x -= Math.min(10, 1 + i * 0.5)
      await touch("touchMove", x, y + (i % 3 ? -0.4 : 0.8))
      await sleep(12)
    }
    await touch("touchEnd")
    const sw = await rec
    const ss = stats(sw)
    writeFileSync(join(OUT, "swipe-390.json"), JSON.stringify({ stats: ss, fr: sw }, null, 0))
    console.log(`        frame times, a swipe and its glide, 4x CPU: ${JSON.stringify(ss)}`)
    expect(ss.p95 <= 22 && ss.over34 <= 3, "a swipe and its glide at 4x CPU: 95% of frames within 22ms, at most 3 over 34ms", ss)
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })

  /* Off screen: no will-change, nothing moves. */
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await sleep(700)
  const off1 = await p.evaluate(() => ({ x: getComputedStyle(document.querySelector(".cc-track")).transform, wc: document.querySelector(".cc-track").style.willChange }))
  await sleep(1000)
  const off2 = await p.evaluate(() => getComputedStyle(document.querySelector(".cc-track")).transform)
  expect(off1.wc === "" && off1.x === off2, "off screen: no will-change, and the rail stands still", { off1, off2 })

  /* Screenshot, back on screen. */
  await p.locator(".cc-viewport").scrollIntoViewIfNeeded()
  await sleep(1500)
  await p.locator(".cc-section").screenshot({ path: join(OUT, `creators-${label.split(" ")[0]}.png`) })
  await ctx.close()
}

/* The start before the script: the stylesheet alone draws the rail where it begins. */
{
  const ctx = await browser.newContext({ ...pw.devices["iPhone 13"], javaScriptEnabled: true })
  const p = await ctx.newPage()
  await p.goto(base + "/", { waitUntil: "load" })
  const r = await p.evaluate(() => {
    const tr = document.querySelector(".cc-track")
    tr.style.transform = ""
    const m = new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41
    const cards = tr.querySelectorAll(".cc-card")
    return { css: +(-m).toFixed(2), step: +(cards[1].getBoundingClientRect().left - cards[0].getBoundingClientRect().left).toFixed(3) }
  })
  expect(Math.abs(r.css - 6 * r.step) < 0.1, "the stylesheet alone draws the rail six cards along (the streamers' card), the place the script starts from", r)
  await ctx.close()
}

await browser.close()
server.close()
console.log(failed ? `\n${failed} failed` : "\nall ok")
process.exit(failed ? 1 : 0)
