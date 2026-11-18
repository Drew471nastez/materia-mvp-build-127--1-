/**
 * ===========================================================================
 *  LANDING ROUND 9, RAILS: THE SHOWCASE AND THE CREATORS RAIL ON A PHONE
 * ===========================================================================
 * Drives the real home page at an iPhone 13 in headless Chromium (4x CPU,
 * real touches through CDP Input.dispatchTouchEvent) and in headless WebKit
 * (touch and pointer events dispatched in the page, one a frame), and
 * measures what the owner complained about:
 *
 *   start     how far a finger travels across before the rail first moves
 *   axis      which way a gesture goes at 0, 20, 35, 45, 60 and 90 degrees:
 *             the rail's, or the page's scroll, and whether a touchmove was
 *             ever cancelled on the way down
 *   frames    frame times (and long tasks, Chromium) over a long drag
 *   arrive    frame times, long tasks and layout shift while the page is
 *             scrolled down through the showcase, and what each picture
 *             decoded to against the size it is drawn at
 *   shapes    a OnePage card keeps its own shape (540 x 1056), a store,
 *             website or community is 4:3 on a phone, each from a 4:3 file
 *   field     the dot field behind the rail: still off screen, follows a
 *             mouse (1440, Chromium), draws nothing on a touch screen
 *
 * Needs a running server (BASE, default http://127.0.0.1:3262).
 *   ENGINE=chromium|webkit|both (default both)   SHOTS=dir   JSON=file
 *
 *   node scripts/check-landing-r9-rails.mjs
 */
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"

/* Playwright is preinstalled globally (NODE_PATH), not a dependency: required, since import ignores NODE_PATH. */
const pw = createRequire(import.meta.url)("playwright")

const BASE = process.env.BASE || "http://127.0.0.1:3262"
const SHOTS = process.env.SHOTS || ""
const ENGINE = process.env.ENGINE || "both"
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
let broken = 0
const report = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const note = (what, got) => console.log(`  --    ${what}   (${typeof got === "string" ? got : JSON.stringify(got)})`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const RAILS = {
  showcase: { track: ".build-showcase-track", surface: ".build-showcase-track", section: ".build-showcase" },
  creators: { track: ".cc-track", surface: ".cc-viewport", section: "[data-story-section='creators']" },
}

async function open(engine, device, extra = {}) {
  const browser = await pw[engine].launch()
  const ctx = await browser.newContext({ ...(device ? pw.devices[device] : {}), ...extra })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 240000 })
  const reject = page.getByRole("button", { name: "Reject all" })
  if (await reject.count()) await reject.first().click().catch(() => {})
  const cdp = engine === "chromium" ? await ctx.newCDPSession(page) : null
  await page.evaluate(() => {
    window.__long = []
    window.__shift = 0
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: "longtask" })
    } catch {}
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__shift += e.value))).observe({ type: "layout-shift" })
    } catch {}
    /* Every touchmove a page script cancelled, and the rail's place, are read off these. */
    window.__prevented = 0
    const pd = Event.prototype.preventDefault
    Event.prototype.preventDefault = function () {
      if (this.type === "touchmove") window.__prevented++
      return pd.call(this)
    }
    window.__tx = (sel) => new DOMMatrixReadOnly(getComputedStyle(document.querySelector(sel)).transform).m41
    /* A finger, in the page (WebKit has no CDP): touch events where the engine has them, and the pointer events a real touch also sends. */
    window.__finger = (surfaceSel) => {
      const el = document.querySelector(surfaceSel)
      let target = el
      const send = (type, x, y) => {
        const ptype = { touchstart: "pointerdown", touchmove: "pointermove", touchend: "pointerup" }[type]
        if (type === "touchstart") target = document.elementFromPoint(x, y) || el
        target.dispatchEvent(new PointerEvent(ptype, { bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0, buttons: type === "touchend" ? 0 : 1, clientX: x, clientY: y }))
        if (!("ontouchstart" in window)) return
        const init = { identifier: 7, target, clientX: x, clientY: y, pageX: x + scrollX, pageY: y + scrollY, screenX: x, screenY: y }
        let t = init
        try {
          t = new Touch(init)
        } catch {}
        const list = type === "touchend" ? [] : [t]
        let ev
        try {
          ev = new TouchEvent(type, { bubbles: true, cancelable: true, composed: true, touches: list, targetTouches: list, changedTouches: [t] })
        } catch {}
        if (!ev || ev.changedTouches?.length !== 1) {
          /* WebKit will not construct a Touch from script: the same event, its lists given as plain ones. */
          ev = new Event(type, { bubbles: true, cancelable: true, composed: true })
          for (const [k, v] of Object.entries({ touches: list, targetTouches: list, changedTouches: [t] })) Object.defineProperty(ev, k, { value: v })
        }
        if (type === "touchmove") window.__moves = (window.__moves || 0) + 1
        target.dispatchEvent(ev)
      }
      return send
    }
    /* A swipe, one move a frame, with the frame times over it. */
    window.__swipe = (surfaceSel, x, y, dx, dy, steps, hold = 0) =>
      new Promise((res) => {
        const send = window.__finger(surfaceSel)
        const frames = []
        let i = 0
        let last = performance.now()
        send("touchstart", x, y)
        const tick = (t) => {
          frames.push(t - last)
          last = t
          i++
          if (i <= steps) {
            send("touchmove", x + (dx * i) / steps, y + (dy * i) / steps)
            return requestAnimationFrame(tick)
          }
          if (i <= steps + hold) return requestAnimationFrame(tick)
          send("touchend", x + dx, y + dy)
          res(frames.slice(1))
        }
        requestAnimationFrame(tick)
      })
  })
  return { engine, browser, ctx, page, cdp }
}

const stats = (list) => {
  const f = [...list].sort((a, b) => a - b)
  if (!f.length) return { frames: 0 }
  return { frames: f.length, median: +f[f.length >> 1].toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), max: +f[f.length - 1].toFixed(1), over20: f.filter((v) => v > 20).length, over34: f.filter((v) => v > 34).length }
}

const cdpTouch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] })

/* A swipe on either engine. Returns the frame times over it. */
async function swipe(s, rail, x, y, dx, dy, steps, hold = 0) {
  /* Headless WebKit can stop giving a page frames: a swipe that has not ended in 20s is reported as no frames rather than waited on. */
  if (!s.cdp) return Promise.race([s.page.evaluate(([sel, ...a]) => window.__swipe(sel, ...a), [rail.surface, x, y, dx, dy, steps, hold]), sleep(20000).then(() => (console.log("  --    a swipe got no frames for 20s"), []))])
  await s.page.evaluate(() => {
    window.__frames = []
    window.__framing = true
    let last = performance.now()
    const tick = (t) => {
      window.__frames.push(t - last)
      last = t
      if (window.__framing) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await cdpTouch(s.cdp, "touchStart", x, y)
  for (let i = 1; i <= steps; i++) {
    await cdpTouch(s.cdp, "touchMove", x + (dx * i) / steps, y + (dy * i) / steps)
    await sleep(12)
  }
  if (hold) await sleep(hold * 16)
  await cdpTouch(s.cdp, "touchEnd", x + dx, y + dy)
  return s.page.evaluate(() => {
    window.__framing = false
    return window.__frames.slice(2)
  })
}

async function bring(s, rail, offset = 150) {
  await s.page.evaluate(
    async ([sel, off]) => {
      /* The creators rail mounts when it nears the screen. */
      for (let i = 0; i < 60 && !document.querySelector(sel); i++) {
        scrollBy(0, innerHeight * 0.8)
        await new Promise((r) => setTimeout(r, 250))
      }
      const el = document.querySelector(sel)
      if (el) scrollTo(0, el.getBoundingClientRect().top + scrollY - off)
    },
    [rail.surface, offset],
  )
  await sleep(1600)
  return s.page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    return { x: innerWidth * 0.72, y: r.top + Math.min(r.height * 0.4, 150), vw: innerWidth }
  }, rail.surface)
}
const place = (s, rail) => s.page.evaluate((sel) => ({ tx: window.__tx(sel), y: scrollY, prevented: window.__prevented }), rail.track)
/* The rail at rest: nothing holds it, so a reading is its own. */
async function rest(s, rail, name) {
  if (name === "creators") {
    await s.page.evaluate((sel) => document.querySelector(sel).getAnimations().forEach((a) => a.pause()), rail.track)
    return
  }
  await sleep(1200)
}

async function railRun(s, name) {
  const rail = RAILS[name]
  const key = `${s.engine}.${name}`
  const out = (report[key] = {})
  console.log(`\n${name}, iPhone 13, ${s.engine}${s.cdp ? " at 4x CPU" : ""}`)
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  let at = await bring(s, rail)
  /* What this browser gives a page with nothing moving: frame times over a drag mean only as much as this. */
  out.idle = stats(
    await Promise.race([
      s.page.evaluate(
        () =>
          new Promise((res) => {
            const f = []
            let last = performance.now()
            const tick = (t) => {
              f.push(t - last)
              last = t
              if (f.length < 61) requestAnimationFrame(tick)
              else res(f.slice(1))
            }
            requestAnimationFrame(tick)
          }),
      ),
      sleep(8000).then(() => []),
    ]),
  )
  note("idle frame times, nothing moving", out.idle)

  /* One swipe there and back first, unmeasured: the first press of a session also wakes the development overlay. */
  await swipe(s, rail, at.x, at.y, -70, 0, 6)
  await sleep(1400)
  await swipe(s, rail, at.x - 200, at.y, 70, 0, 6)
  await sleep(1400)

  /*
   * start: a finger going across 1px a move; the rail's first movement, against the first touchmove the page was
   * given. (Chromium sends no touchmove inside its own 15px slop unless the touchstart was cancelled, which would
   * also cancel the page's scroll and every tap; WebKit sends them from the first pixel. So what the rail adds is
   * measured from the first move it could have seen.)
   */
  {
    at = await bring(s, rail)
    await rest(s, rail, name)
    await s.page.evaluate(() => {
      window.__firstMoveX = null
      if (window.__firstMoveHooked) return
      window.__firstMoveHooked = true
      addEventListener("touchmove", (e) => (window.__firstMoveX ??= e.touches[0]?.clientX ?? null), { capture: true, passive: true })
      addEventListener("pointermove", (e) => e.pointerType === "touch" && (window.__firstMoveX ??= e.clientX), { capture: true, passive: true })
    })
    let first = null
    if (!s.cdp) {
      /* One finger across the whole gesture: the page keeps its target between calls. */
      first = await Promise.race([sleep(20000).then(() => null), s.page.evaluate(
        async ([sel, tsel, x, y]) => {
          const send = window.__finger(sel)
          const t0 = window.__tx(tsel)
          send("touchstart", x, y)
          let got = null
          for (let px = 1; px <= 30 && got === null; px++) {
            send("touchmove", x - px, y)
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
            if (Math.abs(window.__tx(tsel) - t0) > 0.4) got = px
          }
          send("touchend", x - 30, y)
          return got
        },
        [rail.surface, rail.track, at.x, at.y],
      )])
    } else {
      const t0 = (await place(s, rail)).tx
      await cdpTouch(s.cdp, "touchStart", at.x, at.y)
      for (let px = 1; px <= 30 && first === null; px++) {
        await cdpTouch(s.cdp, "touchMove", at.x - px, at.y)
        await sleep(40)
        if (Math.abs((await place(s, rail)).tx - t0) > 0.4) first = px
      }
      await cdpTouch(s.cdp, "touchEnd", at.x - 30, at.y)
    }
    const fx = await s.page.evaluate(() => window.__firstMoveX)
    const delivered = fx == null ? null : Math.round(at.x - fx)
    out.startPx = first
    out.firstDeliveredPx = delivered
    note("the first move (touchmove or pointermove) the page was given, px across", delivered)
    expect(first !== null && delivered !== null && first - delivered <= 5, "from the first move it is given, the rail moves within 5px", `rail moved at ${first}px, first move at ${delivered}px`)
    await sleep(1500)
  }

  /* axis: the same 90px gesture at six angles from across. */
  out.axis = {}
  for (const deg of [0, 20, 35, 45, 60, 90]) {
    at = await bring(s, rail, 260)
    await rest(s, rail, name)
    const a = await place(s, rail)
    const rad = (deg * Math.PI) / 180
    /* Down the page: a finger moving up the screen. */
    await swipe(s, rail, at.x, at.y, -90 * Math.cos(rad), -90 * Math.sin(rad), 9, 6)
    const mid = await place(s, rail)
    await sleep(900)
    const b = await place(s, rail)
    const railMoved = Math.abs(mid.tx - a.tx) > 6 || Math.abs(b.tx - a.tx) > 6
    const pageMoved = Math.abs(b.y - a.y) > 6
    const prevented = b.prevented - a.prevented
    out.axis[deg] = { rail: railMoved, page: s.cdp ? pageMoved : "n/a", prevented }
    /* |dx| > |dy| * 1.2 is across: up to 39.8 degrees. */
    const across = deg < 39.8
    if (across) expect(railMoved && !pageMoved, `${deg} degrees: the rail's, the page stays`, out.axis[deg])
    else {
      expect(!railMoved && prevented === 0, `${deg} degrees: the rail stays and no touchmove is cancelled`, out.axis[deg])
      /* Chromium's own touch-action filter leaves 45 degrees to nobody; steeper scrolls the page. */
      if (s.cdp && deg >= 60) expect(pageMoved, `${deg} degrees: the page scrolls`, { by: Math.round(b.y - a.y) })
    }
    await sleep(600)
  }

  /* frames: a long drag across and back, the finger never lifting. */
  {
    at = await bring(s, rail)
    await rest(s, rail, name)
    await s.page.evaluate(() => (window.__long = []))
    const there = await swipe(s, rail, at.x, at.y, -230, 6, 60)
    await sleep(900)
    const back = await swipe(s, rail, at.x - 230, at.y, 230, -6, 60)
    out.drag = stats([...there, ...back])
    out.dragLong = await s.page.evaluate(() => window.__long)
    note("frame times over a 2 x 230px drag", out.drag)
    if (s.cdp) note("long tasks over it", out.dragLong)
    /* Headless WebKit on Linux gives a page frames irregularly even at rest (the idle line above): its drag numbers are only read against that. */
    if (s.cdp) expect(out.drag.median < 20, "the drag's median frame is under 20ms", out.drag.median)
    else note("the drag's median frame against this engine's own idle median", { drag: out.drag.median, idle: out.idle.median })
    await sleep(900)
  }
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  if (SHOTS) {
    await bring(s, rail, name === "showcase" ? 250 : 200)
    await s.page.screenshot({ path: `${SHOTS}/rails-${name}-390-${s.engine}.png` })
  }
}

/*
 * The other engine, for the record: the same rail as the browser's own sideways scroller (what it is before the
 * script, and was on phones in round 5), scrolled by a wheel, 8px a frame. Frame times only: it is not the engine
 * in use.
 */
async function nativeScroller(s) {
  const rail = RAILS.showcase
  const at = await bring(s, rail)
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  if (!s.cdp) {
    console.log(`\nThe browser's own scroller instead (not in use), ${s.engine}: not measured (no scroll gesture to drive it here)`)
    return
  }
  await s.page.evaluate((sel) => {
    /* A copy of the rail with none of the script's listeners: the browser's own sideways scroller with snapping. */
    const old = document.querySelector(sel)
    old.getAnimations().forEach((a) => a.cancel())
    const t = old.cloneNode(true)
    old.replaceWith(t)
    t.removeAttribute("data-rail-ready")
    t.style.transform = ""
    t.querySelectorAll("img").forEach((i) => i.setAttribute("data-shown", ""))
    window.__frames = []
    window.__framing = true
    let last = performance.now()
    const tick = (now) => {
      window.__frames.push(now - last)
      last = now
      if (window.__framing) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, rail.track)
  /* A finger's swipe of 230px there and back, as the transform rail's drag above, then its snap. */
  await s.cdp.send("Input.synthesizeScrollGesture", { x: Math.round(at.x), y: Math.round(at.y), xDistance: -230, yDistance: 0, gestureSourceType: "touch", speed: 600, preventFling: true })
  await sleep(900)
  const mid = await s.page.evaluate((sel) => document.querySelector(sel).scrollLeft, rail.track)
  await s.cdp.send("Input.synthesizeScrollGesture", { x: Math.round(at.x - 230), y: Math.round(at.y), xDistance: 230, yDistance: 0, gestureSourceType: "touch", speed: 600, preventFling: true })
  await sleep(900)
  const out = await s.page.evaluate((sel) => {
    window.__framing = false
    return { frames: window.__frames.slice(2), scrolled: document.querySelector(sel).scrollLeft }
  }, rail.track)
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  report[`${s.engine}.native`] = { ...stats(out.frames), scrolledTo: mid, back: out.scrolled }
  console.log(`\nThe browser's own scroller instead (not in use), ${s.engine} at 4x CPU`)
  note("frame times over a 2 x 230px swipe and its snap", { ...stats(out.frames), scrolledTo: Math.round(mid), back: Math.round(out.scrolled) })
}

/* The page scrolled down through the showcase from the top, on a fresh load. */
async function arrive(engine) {
  const s = await open(engine, "iPhone 13")
  console.log(`\nScrolling down through the showcase, iPhone 13, ${engine}${s.cdp ? " at 4x CPU" : ""}`)
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await sleep(1500)
  const run = await s.page.evaluate(
    () =>
      new Promise((res) => {
        window.__long = []
        window.__shift = 0
        const sec = document.querySelector(".build-showcase")
        const end = sec.getBoundingClientRect().bottom + scrollY - innerHeight * 0.4
        const frames = []
        let last = performance.now()
        const t0 = last
        /* 900px a second, by time, as a thumb scrolls a page. */
        const tick = (t) => {
          frames.push(t - last)
          last = t
          const y = Math.min(end, ((t - t0) / 1000) * 900)
          scrollTo(0, y)
          if (y < end) requestAnimationFrame(tick)
          else setTimeout(() => res({ frames: frames.slice(1), long: window.__long, shift: +window.__shift.toFixed(4) }), 600)
        }
        requestAnimationFrame(tick)
      }),
  )
  if (s.cdp) await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await sleep(1500)
  const out = (report[`${engine}.arrive`] = { ...stats(run.frames), long: run.long, shift: run.shift })
  note("frame times while scrolling", stats(run.frames))
  if (s.cdp) note("long tasks", run.long)
  expect(run.shift < 0.01, "nothing shifts as the pictures arrive", run.shift)
  const pics = await s.page.evaluate(() =>
    [...document.querySelectorAll(".build-showcase-slide")].map((f) => {
      const img = f.querySelector("img")
      const box = f.querySelector(".build-showcase-pic").getBoundingClientRect()
      return {
        file: (img.currentSrc || "").split("/").pop(),
        format: f.dataset.format,
        natural: [img.naturalWidth, img.naturalHeight],
        src: img.currentSrc,
        drawn: [Math.round(box.width), Math.round(box.height)],
        dpr: devicePixelRatio,
        opacity: +getComputedStyle(img).opacity,
        async: img.decoding,
      }
    }),
  )
  /* naturalWidth is in CSS px when a srcset picked the file; the file's own pixels are what is decoded. */
  const files = await s.page.evaluate(
    (srcs) =>
      Promise.all(
        srcs.map(async (src) => {
          if (!src) return [0, 0]
          const i = new Image()
          i.src = src
          await i.decode().catch(() => {})
          return [i.naturalWidth, i.naturalHeight]
        }),
      ),
    pics.map((p) => p.src),
  )
  pics.forEach((p, i) => (p.filePx = files[i]))
  out.pictures = pics
  const loaded = pics.filter((p) => p.natural[0] > 0)
  const megapixels = +(loaded.reduce((sum, p) => sum + p.filePx[0] * p.filePx[1], 0) / 1e6).toFixed(2)
  out.megapixels = megapixels
  note("pictures loaded, megapixels decoded", { loaded: loaded.length, megapixels })
  for (const p of loaded.slice(0, 3)) note(`${p.file}`, { file: p.filePx, drawn: p.drawn, dpr: p.dpr })
  /* 8 x 960 x 720 + 4 x 540 x 1056 at 3x: the desktop files were 13.7. */
  expect(megapixels < 8.2, "the twelve pictures decode to under 8.2 megapixels at 3x (they were 13.7)", megapixels)
  expect(pics.every((p) => p.async === "async"), "every picture decodes off the main thread (decoding=async)")
  /* shapes */
  const wide = pics.filter((p) => p.format === "wide")
  const tall = pics.filter((p) => p.format === "portrait")
  expect(wide.every((p) => Math.abs(p.drawn[0] / p.drawn[1] - 4 / 3) < 0.02), "a store, website or community card is 4:3", wide[0]?.drawn)
  expect(wide.every((p) => !p.filePx[0] || Math.abs(p.filePx[0] / p.filePx[1] - 4 / 3) < 0.02), "and its picture is a 4:3 file: nothing cropped", wide.find((p) => p.filePx[0])?.filePx)
  expect(tall.every((p) => Math.abs(p.drawn[0] / p.drawn[1] - 540 / 1056) < 0.02), "a OnePage card keeps the page's own shape, 540 x 1056", tall[0]?.drawn)
  expect(loaded.every((p) => p.opacity === 1), "every loaded picture has faded in")
  if (SHOTS) {
    await s.page.evaluate(() => scrollTo(0, document.querySelector(".build-showcase").getBoundingClientRect().top + scrollY - 20))
    await sleep(900)
    await s.page.screenshot({ path: `${SHOTS}/rails-showcase-arrive-390-${engine}.png` })
  }
  await s.browser.close()
}

/* The dot field: a mouse at 1440, and a phone. */
async function field() {
  console.log("\nThe dot field behind the rail")
  const d = await open("chromium", null, { viewport: { width: 1440, height: 900 } })
  const probe = () =>
    d.page.evaluate(() => {
      const c = document.querySelector(".build-showcase-field canvas")
      if (!c) return null
      const r = c.getBoundingClientRect()
      const sec = document.querySelector(".build-showcase").getBoundingClientRect()
      const px = c.getContext("2d").getImageData(0, 0, c.width, c.height).data
      let lit = 0
      let peak = 0
      for (let i = 3; i < px.length; i += 4) {
        if (px[i]) lit++
        if (px[i] > peak) peak = px[i]
      }
      return { cx: Math.round(r.left + r.width / 2 - sec.left), cy: Math.round(r.top + r.height / 2 - sec.top), lit, peak, size: [c.width, c.height], draws: window.__fieldDraws || 0 }
    })
  await d.page.evaluate(() => {
    /* Every draw of the field's canvas is counted. */
    const clear = CanvasRenderingContext2D.prototype.clearRect
    window.__fieldDraws = 0
    CanvasRenderingContext2D.prototype.clearRect = function (...a) {
      if (this.canvas.closest(".build-showcase-field")) window.__fieldDraws++
      return clear.apply(this, a)
    }
    scrollTo(0, document.querySelector(".build-showcase").getBoundingClientRect().top + scrollY - 40)
  })
  await sleep(1200)
  const box = await d.page.evaluate(() => {
    const r = document.querySelector(".build-showcase").getBoundingClientRect()
    return { left: r.left, top: r.top }
  })
  await d.page.mouse.move(box.left + 400, box.top + 120)
  await d.page.mouse.move(box.left + 700, box.top + 160, { steps: 20 })
  await sleep(900)
  const on = await probe()
  expect(!!on && on.lit > 0, "with a mouse over the section the field's dots are lit", on && { lit: on.lit, peak: on.peak, size: on.size })
  expect(!!on && Math.abs(on.cx - 700) < 6 && Math.abs(on.cy - 160) < 6, "and their centre is the mouse", on && { cx: on.cx, cy: on.cy })
  expect(!!on && on.peak <= 64, "the brightest dot is under a quarter white", on?.peak)
  const settled = on?.draws ?? 0
  await sleep(700)
  const still = await probe()
  expect(still?.draws === settled, "a mouse at rest costs no frames", { draws: settled, later: still?.draws })
  await d.page.evaluate(() => scrollTo(0, document.body.scrollHeight * 0.5))
  await sleep(500)
  const away = (await probe())?.draws ?? 0
  await d.page.mouse.move(600, 500, { steps: 10 })
  await sleep(400)
  expect(((await probe())?.draws ?? 0) === away, "off screen it draws nothing", { draws: away })
  report.field = { desktop: on }
  if (SHOTS) {
    await d.page.evaluate(() => scrollTo(0, document.querySelector(".build-showcase").getBoundingClientRect().top + scrollY - 40))
    await sleep(900)
    await d.page.mouse.move(box.left + 760, box.top + 150, { steps: 12 })
    await sleep(900)
    await d.page.screenshot({ path: `${SHOTS}/rails-showcase-1440.png` })
  }
  await d.browser.close()
  const p = await open("chromium", "iPhone 13")
  const phone = await p.page.evaluate(() => ({ canvas: !!document.querySelector(".build-showcase-field canvas[width]"), dots: getComputedStyle(document.querySelector(".build-showcase"), "::before").backgroundImage.slice(0, 40) }))
  expect(!phone.canvas, "on a touch screen there is no canvas to draw: the still dots are a background", phone)
  await p.browser.close()
}

const engines = ENGINE === "both" ? ["chromium", "webkit"] : [ENGINE]
for (const engine of engines) {
  const s = await open(engine, "iPhone 13")
  await railRun(s, "showcase")
  await railRun(s, "creators")
  await nativeScroller(s).catch((e) => console.log("  --    the browser's own scroller was not measured", String(e).slice(0, 120)))
  await s.browser.close()
  await arrive(engine)
}
if (!process.env.SKIP_FIELD) await field()

if (process.env.JSON) writeFileSync(process.env.JSON, JSON.stringify(report, null, 1))
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
