// Landing round 11, rails: screenshots (390 with touch, 1440 with a hover), the caption's place, the phone OnePage's height, when each picture is shown against when it comes on screen, and a CDP touch on the creators rail: its transform at the press, after the handlers and over the next frames must not move. Usage: PORT=3282 OUT=dir node scripts/check-landing-r11-rails.mjs (a dev server on PORT).
import { createRequire } from "node:module"
import { writeFileSync, mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
const pw = require("playwright")
const OUT = process.env.OUT || "/tmp/check-landing-r11-rails"
mkdirSync(OUT, { recursive: true })
const URL = `http://localhost:${process.env.PORT || 3282}/`
const res = {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await pw.chromium.launch()

/* ---------- 1440, hover ---------- */
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  await p.goto(URL, { waitUntil: "load", timeout: 240000 })
  await p.addStyleTag({ content: "[data-cookie-banner]{display:none!important}" })
  await sleep(1500)
  const vp = p.locator(".build-showcase-viewport")
  await vp.scrollIntoViewIfNeeded()
  await p.evaluate(() => window.scrollBy(0, -120))
  await sleep(2500)
  const slide = p.locator(".build-showcase-slide").nth(0)
  const bb = await slide.boundingBox()
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
  await sleep(900)
  res.d_caption = await p.evaluate(() => {
    const f = document.querySelectorAll(".build-showcase-slide figcaption")[0]
    const pic = f.closest("figure").querySelector(".build-showcase-pic").getBoundingClientRect()
    const r = f.getBoundingClientRect()
    return { opacity: getComputedStyle(f).opacity, capBottom: r.bottom, picBottom: pic.bottom, capTop: r.top, picTop: pic.top, figH: f.closest("figure").getBoundingClientRect().height, picH: pic.height }
  })
  await p.locator(".build-showcase").screenshot({ path: `${OUT}/showcase-1440-hover.png` })
  // portrait hover
  const s2 = p.locator(".build-showcase-slide").nth(1)
  const b2 = await s2.boundingBox()
  await p.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2)
  await sleep(900)
  await p.locator(".build-showcase").screenshot({ path: `${OUT}/showcase-1440-hover-onepage.png` })
  // next pages via keyboard
  await p.mouse.move(5, 5)
  for (let i = 1; i < 4; i++) {
    await p.focus(".build-showcase-track")
    await p.keyboard.press("ArrowRight")
    await sleep(1300)
    await p.locator(".build-showcase-viewport").screenshot({ path: `${OUT}/showcase-1440-page${i + 1}.png` })
  }
  res.d_images = await p.evaluate(() => [...document.querySelectorAll(".build-showcase-pic img")].map((i) => [i.currentSrc.split("/").pop(), i.hasAttribute("data-shown"), i.naturalWidth]))
  await p.close()
}

/* ---------- 390, touch ---------- */
const phone = { ...pw.devices["iPhone 13"] }
for (const engine of ["chromium"]) {
  const ctx = await b.newContext(phone)
  const p = await ctx.newPage()
  await p.goto(URL, { waitUntil: "load", timeout: 240000 })
  await p.addStyleTag({ content: "[data-cookie-banner]{display:none!important}" })
  await sleep(1500)
  /* arrival: scroll down in steps and record when each showcase picture got data-shown vs when it entered the screen */
  await p.evaluate(() => {
    window.__arr = []
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && window.__arr.push({ src: e.target.currentSrc.split("/").pop(), shownWhenSeen: e.target.hasAttribute("data-shown") })), {})
    document.querySelectorAll(".build-showcase-pic img, .cc-img").forEach((i) => io.observe(i))
  })
  for (let y = 0; y < 2600; y += 260) {
    await p.mouse.wheel(0, 260)
    await sleep(120)
  }
  await sleep(800)
  res.m_arrival = await p.evaluate(() => window.__arr)
  const vp = p.locator(".build-showcase-viewport")
  await vp.scrollIntoViewIfNeeded()
  await sleep(1500)
  await p.locator(".build-showcase").screenshot({ path: `${OUT}/showcase-390.png` })
  res.m_geom = await p.evaluate(() => [...document.querySelectorAll(".build-showcase-slide")].slice(0, 6).map((s) => {
    const r = s.querySelector(".build-showcase-pic").getBoundingClientRect()
    return { f: s.dataset.format, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
  }))
  // swipe showcase twice to see the OnePage
  const cdp = await ctx.newCDPSession(p)
  const touch = async (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  const swipe = async (x0, y0, dx, dy, steps = 10) => {
    await touch("touchStart", x0, y0)
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", x0 + (dx * i) / steps, y0 + (dy * i) / steps)
      await sleep(16)
    }
    await touch("touchEnd")
  }
  const vb = await vp.boundingBox()
  await swipe(300, vb.y + 100, -160, 0)
  await sleep(900)
  await p.locator(".build-showcase").screenshot({ path: `${OUT}/showcase-390-swiped.png` })
  await swipe(300, vb.y + 100, -160, 0)
  await sleep(900)
  await p.locator(".build-showcase").screenshot({ path: `${OUT}/showcase-390-swiped2.png` })

  /* creators rail: touch start must freeze it exactly where it is */
  const cv = p.locator(".cc-viewport")
  await cv.scrollIntoViewIfNeeded()
  await sleep(4000)
  const cb = await cv.boundingBox()
  const tx = () => p.evaluate(() => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".cc-track")).transform).m41)
  await p.evaluate(() => {
    const tr = document.querySelector(".cc-track")
    const read = () => new DOMMatrixReadOnly(getComputedStyle(tr).transform).m41
    window.__fz = []
    let cur = null
    window.addEventListener("pointerdown", () => { cur = { atPress: read(), anims: tr.getAnimations().length }; window.__fz.push(cur) }, { capture: true })
    document.addEventListener("touchstart", () => {
      if (!cur) return
      cur.afterHandlers = read()
      cur.animsAfter = tr.getAnimations().length
      requestAnimationFrame(() => { cur.frame1 = read(); requestAnimationFrame(() => { cur.frame2 = read(); setTimeout(() => (cur.t300 = read()), 300) }) })
    })
  })
  const freeze = []
  for (let k = 0; k < 4; k++) {
    if (k === 2) {
      // a throw, then touch while it coasts
      await swipe(320, cb.y + 150, -220, 0, 6)
      await sleep(200)
    }
    const before = await tx()
    const t0 = Date.now()
    await touch("touchStart", 200, cb.y + 150)
    const after = await tx()
    const dt = Date.now() - t0
    await sleep(300)
    const held = await tx()
    // screenshot-based: is the drawn picture still?
    const a = await cv.screenshot()
    await sleep(250)
    const c = await cv.screenshot()
    freeze.push({ k, before, after, held, stillMs: dt, drawnSame: Buffer.compare(a, c) === 0 })
    await touch("touchEnd")
    await sleep(2600)
  }
  res.m_freeze = freeze
  res.m_freeze_inpage = await p.evaluate(() => window.__fz)
  // a horizontal swipe moves the rail, a vertical one scrolls the page
  const x0 = await tx()
  await swipe(300, cb.y + 150, -120, 0)
  const x1 = await tx()
  const sy0 = await p.evaluate(() => scrollY)
  await swipe(200, cb.y + 150, 4, -220)
  await sleep(600)
  const sy1 = await p.evaluate(() => scrollY)
  res.m_axes = { railMoved: x1 - x0, pageScrolled: sy1 - sy0 }
  await cv.scrollIntoViewIfNeeded()
  await sleep(1500)
  await p.locator(".cc-section").screenshot({ path: `${OUT}/creators-390.png` })
  await ctx.close()
}
await b.close()
writeFileSync(`${OUT}/review.json`, JSON.stringify(res, null, 1))
console.log(JSON.stringify(res, null, 1).slice(0, 6000))
