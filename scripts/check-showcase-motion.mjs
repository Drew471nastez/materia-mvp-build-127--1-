/**
 * ===========================================================================
 *  THE SHOWCASE RAIL, DRIVEN AND MEASURED IN A BROWSER
 * ===========================================================================
 * Round 60. Drives the real home page's showcase with a mouse, a finger and a
 * trackpad, and records where the first card is drawn on every frame, so each
 * claim is a measurement:
 *
 *   FOLLOW     while dragging, the rail is exactly where the pointer says
 *              (no lag, no smoothing): the error is under half a pixel
 *   SLOW       150px over a second, released: back to the group it left
 *   FLICK      350px in 150ms, released: on to the next group, one group,
 *              never past it, and still within 2px in under half a second
 *   REVERSE    a press during that settle stops the rail where it is drawn
 *              (no jump), and a drag back takes it back
 *   CLICK      a drag released over a card is not a click
 *   WHEEL      a trackpad's sideways swipe moves the rail and settles it;
 *              a vertical wheel over the rail scrolls the page instead
 *   TOUCH      a finger's horizontal swipe moves it (touch-action leaves the
 *              vertical to the page)
 *   PAGE       nothing scrolls sideways; 60 and 120Hz screens measure the
 *              same settle time
 *
 * Needs a running server (BASE, default http://127.0.0.1:3210).
 *
 *   node scripts/check-showcase-motion.mjs
 */
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE || "http://127.0.0.1:3210"
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* In the page: where the rail is, read from the first group's or card's drawn position against its laid out one. */
const SETUP = () => {
  const track = document.querySelector(".build-showcase-track")
  const first = () => track.querySelector(window.innerWidth < 768 ? ".build-showcase-slide" : ".build-showcase-group")
  window.__rail = {
    track,
    /* The rail's position: how far left of its resting place the first item is drawn (wrapped, so read as a delta). */
    offset: () => {
      const t = getComputedStyle(first()).transform
      return t === "none" ? 0 : -new DOMMatrix(t).m41
    },
    log: [],
    recording: false,
  }
  const tick = () => {
    if (window.__rail.recording) window.__rail.log.push({ t: performance.now(), x: window.__rail.offset() })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function open(browser, vp) {
  const p = await browser.newPage()
  await p.setViewport(vp)
  await p.goto(`${BASE}/`, { waitUntil: "networkidle2", timeout: 180000 })
  await p.evaluate(() => {
    const s = document.querySelector(".build-showcase")
    window.scrollTo(0, s.getBoundingClientRect().top + scrollY - 40)
  })
  await sleep(1200)
  await p.evaluate(SETUP)
  return p
}

const railBox = (p) =>
  p.evaluate(() => {
    const r = document.querySelector(".build-showcase-track").getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  })

/* The loop's length and the group pitch, as the controller sees them. */
const geometry = (p) =>
  p.evaluate(() => {
    const items = [...document.querySelectorAll(innerWidth < 768 ? ".build-showcase-slide" : ".build-showcase-group")]
    for (const el of items) el.dataset.rect = ""
    const g = parseFloat(getComputedStyle(document.querySelector(".build-showcase-track")).columnGap) || 0
    const last = items[items.length - 1]
    return { pitch: items[1].offsetLeft - items[0].offsetLeft, count: items.length, gap: g, period: last.offsetLeft + last.offsetWidth + g - items[0].offsetLeft }
  })

async function record(p, fn) {
  await p.evaluate(() => {
    window.__rail.log = []
    window.__rail.recording = true
  })
  await fn()
  return p.evaluate(() => {
    window.__rail.recording = false
    return window.__rail.log
  })
}

/** Move the mouse from a to b over `ms`, in steps of `step` ms, returning what the rail did at each step. */
async function mouseDrag(p, from, dx, ms, { step = 8, release = true, hold = 0, follow: track = true } = {}) {
  await p.mouse.move(from.x, from.y)
  await p.mouse.down()
  const steps = Math.max(1, Math.round(ms / step))
  const follow = []
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (dx * i) / steps
    await p.mouse.move(x, from.y)
    await sleep(step)
    /* Reading the rail on every step slows the hand down; a flick is driven without it, at its real speed. */
    if (track) follow.push({ want: (dx * i) / steps, at: await p.evaluate(() => window.__rail.offset()) })
  }
  if (hold) await sleep(hold)
  if (release) await p.mouse.up()
  return follow
}

const restAt = async (p, ms = 1200) => {
  await sleep(ms)
  return p.evaluate(() => window.__rail.offset())
}

/** a - b round the loop, in [-period/2, period/2): the rail is read from a wrapped item, so plain subtraction can be a whole loop out. */
const wd = (a, b, period) => ((((a - b) % period) + period * 1.5) % period) - period / 2
const near = (x, target, period) => Math.abs(wd(x, target, period))

let browser
try {
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--force-device-scale-factor=1"] })

  console.log("\ndesktop 1440: the mouse")
  {
    const p = await open(browser, { width: 1440, height: 900 })
    const { pitch, period } = await geometry(p)
    const box = await railBox(p)
    const mid = { x: box.x + box.w * 0.6, y: box.y + box.h / 2 }
    expect(pitch > 1000, "a group is a page wide", pitch)

    /* FOLLOW: the rail is where the hand is, frame by frame, with nothing between. */
    const follow = await mouseDrag(p, mid, -300, 600, { release: false })
    /* The first moves are inside the 6px threshold; after it the rail must track the pointer exactly. */
    const errors = follow.filter((f) => Math.abs(f.want) > 12).map((f) => Math.abs(f.at - -f.want))
    expect(errors.length > 10 && Math.max(...errors) < 0.75, "while dragging, the rail is under the pointer to half a pixel", { worst: Math.max(...errors).toFixed(2), samples: errors.length })
    await p.mouse.up()
    const back = await restAt(p)
    expect(near(back, 0, period) < 0.6, "SLOW: 300px over 600ms and let go settles back to its group", back)

    /* SLOW: 150px over a second. */
    await mouseDrag(p, mid, -150, 1000, { step: 16 })
    const slow = await restAt(p)
    expect(near(slow, 0, period) < 0.6, "SLOW: 150px over a second settles back to its group", slow)

    /* FLICK: 350px in 150ms, recorded every frame. */
    const log = await record(p, async () => {
      await mouseDrag(p, mid, -350, 150, { step: 10, follow: false })
      await sleep(1100)
    })
    const after = log.filter((l, i) => i > 0)
    const end = after[after.length - 1].x
    expect(near(end, pitch, period) < 0.6, "FLICK: 350px in 150ms carries on to the next group", { end, pitch })
    const maxX = Math.max(...after.map((l) => l.x))
    expect(maxX <= pitch + 0.75, "and never passes it: no overshoot, no bounce", { maxX: maxX.toFixed(2), pitch })
    const upAt = log.findIndex((l, i) => i > 2 && l.x > 340)
    const arrive = log.find((l, i) => i > upAt && Math.abs(l.x - pitch) < 2)
    const took = arrive ? arrive.t - log[upAt].t : null
    expect(took !== null && took < 520, "and is within 2px of it in about half a second", took && `${Math.round(took)}ms`)
    const backwards = after.filter((l, i) => i > upAt && i > 0 && l.x < after[i - 1].x - 0.5).length
    expect(backwards === 0, "moving forward the whole way: the release and the settle are one motion", backwards)

    /* REVERSE: press during a settle, the rail stops where it is drawn. */
    await mouseDrag(p, mid, -350, 150, { step: 10, follow: false })
    await sleep(90)
    const before = await p.evaluate(() => window.__rail.offset())
    await p.mouse.move(mid.x, mid.y)
    await p.mouse.down()
    const heldAt = await p.evaluate(() => window.__rail.offset())
    await sleep(120)
    const stillAt = await p.evaluate(() => window.__rail.offset())
    expect(Math.abs(wd(stillAt, heldAt, period)) < 0.75 && Math.abs(wd(heldAt, before, period)) < 120, "REVERSE: a press during a settle holds the rail where it is drawn, no jump", { before: before.toFixed(1), held: heldAt.toFixed(1), after: stillAt.toFixed(1) })
    for (let i = 1; i <= 15; i++) {
      await p.mouse.move(mid.x + i * 26, mid.y)
      await sleep(10)
    }
    await p.mouse.up()
    const reversed = await restAt(p)
    expect(near(reversed, pitch, period) < 0.6 || near(reversed, 0, period) < 0.6 || near(reversed, 2 * pitch, period) < 0.6, "and a drag back takes it back to a group", reversed)
    expect(wd(reversed, stillAt, period) < 0, "in the new direction", { from: stillAt.toFixed(1), to: reversed.toFixed(1) })

    /* REPEATED: five flicks in turn, each one group. */
    let pos = await p.evaluate(() => window.__rail.offset())
    const moved = []
    for (const dir of [-1, 1, -1, -1, 1]) {
      await mouseDrag(p, mid, dir * 320, 140, { step: 10, follow: false })
      await sleep(650)
      const now = await p.evaluate(() => window.__rail.offset())
      moved.push(Math.round(wd(now, pos, period) / pitch))
      pos = now
    }
    expect(JSON.stringify(moved) === JSON.stringify([1, -1, 1, 1, -1]), "REPEATED: five quick flicks move one group each, in their own direction", moved)

    /* CLICK: a drag released over a card is not a click on it. */
    const clicks = await p.evaluate(() => {
      window.__clicks = 0
      document.querySelector(".build-showcase-track").addEventListener("click", () => window.__clicks++)
      return 0
    })
    await mouseDrag(p, mid, -80, 120, { step: 10 })
    await sleep(400)
    const dragClicks = await p.evaluate(() => window.__clicks)
    await p.mouse.click(mid.x, mid.y)
    const tapClicks = await p.evaluate(() => window.__clicks)
    expect(clicks === 0 && dragClicks === 0 && tapClicks === 1, "CLICK: a drag is not a click, and a plain click still is", { dragClicks, tapClicks })

    /* WHEEL: a vertical wheel over the rail scrolls the page and leaves the rail alone. */
    await sleep(800)
    const railBefore = await p.evaluate(() => window.__rail.offset())
    const yBefore = await p.evaluate(() => scrollY)
    await p.mouse.move(mid.x, mid.y)
    await p.mouse.wheel({ deltaY: 300 })
    await sleep(500)
    const yAfter = await p.evaluate(() => scrollY)
    const railAfterV = await p.evaluate(() => window.__rail.offset())
    expect(yAfter > yBefore + 50 && Math.abs(railAfterV - railBefore) < 0.5, "WHEEL: a vertical wheel over the rail scrolls the page, not the rail", { page: yAfter - yBefore, rail: railAfterV - railBefore })
    await p.evaluate((y) => window.scrollTo(0, y), yBefore)
    await sleep(300)
    /* A trackpad: a run of small sideways deltas, as the system sends them. */
    const tp = await record(p, async () => {
      for (let i = 0; i < 24; i++) {
        await p.mouse.wheel({ deltaX: 26 - i * 0.8 })
        await sleep(12)
      }
      await sleep(900)
    })
    const tpEnd = tp[tp.length - 1].x
    const moving = tp.slice(0, 24).map((l) => l.x)
    expect(moving[moving.length - 1] - moving[0] > 200, "WHEEL: a trackpad's sideways swipe moves the rail with the fingers", (moving[moving.length - 1] - moving[0]).toFixed(1))
    expect(near(tpEnd, railBefore + pitch, period) < 0.6 || near(tpEnd, railBefore, period) < 0.6, "and when the fingers stop it settles on a group, with no second glide of its own", { end: tpEnd.toFixed(1) })
    const xScroll = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
    expect(xScroll <= 0, "PAGE: nothing scrolls sideways", xScroll)
    await p.close()
  }

  console.log("\nphone 390: a finger")
  {
    const p = await open(browser, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const { pitch, period } = await geometry(p)
    const box = await railBox(p)
    const y = box.y + box.h / 2
    const cdp = await p.target().createCDPSession()
    const touch = async (type, x) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
    const startX = box.x + 300
    await touch("touchStart", startX)
    for (let i = 1; i <= 12; i++) {
      await touch("touchMove", startX - i * 25)
      await sleep(12)
    }
    await touch("touchEnd")
    await sleep(1100)
    const at = await p.evaluate(() => window.__rail.offset())
    expect(at > 10, "TOUCH: a horizontal swipe moves the rail", at.toFixed(1))
    /* A swipe of most of a card at speed may carry one card past the one under the finger, as on the computer, and no further. */
    const snaps = await p.evaluate(() => { const s = [...document.querySelectorAll(".build-showcase-slide")]; return s.map((e) => e.offsetLeft - s[0].offsetLeft) })
    const on = snaps.findIndex((x) => near(at, x, period) < 0.6)
    expect(on === 1 || on === 2, "and rests with a card on the gutter, the next one or the one after, no further", { at: at.toFixed(1), card: on })
    const xScroll = await p.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)
    expect(xScroll <= 0, "PAGE: nothing scrolls sideways on a phone", xScroll)
    const touchAction = await p.evaluate(() => getComputedStyle(document.querySelector(".build-showcase-track")).touchAction)
    expect(/pan-y/.test(touchAction) && !/pan-x/.test(touchAction), "a vertical swipe is the page's: touch-action leaves pan-y to the browser", touchAction)
    await p.close()
  }
} finally {
  await browser?.close()
}
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
