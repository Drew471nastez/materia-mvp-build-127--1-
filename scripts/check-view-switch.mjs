/**
 * ===========================================================================
 *  SWITCHING HOW THE CANVAS IS SHOWN, AND DRAGGING THE SIDEBAR, FRAME BY FRAME
 * ===========================================================================
 * The owner: switching the editor's canvas to phone, back to desktop, or into
 * and out of full screen is "very glitchy and bad and flashy and not
 * accurate ... the wall frame and canvas should be very smooth ... like how it
 * was before a long time ago. Even the dragging, adjusting the sidebar".
 *
 * The real editor (editor-probe-harness.mjs) at 1440 x 900, the real buttons
 * on the bar pressed the way a hand presses them (pointer down, up, click),
 * and every switch filmed from the press for 800ms:
 *
 *   the card      its box on screen, every frame: left and right edge and
 *                 width. Each edge must travel one way only, in steps (no
 *                 frame moves an edge more than a third of the way), and the
 *                 card is never blank (no frame with no width) or dimmed
 *   the sidebar   its panel's left edge and strength, one way only
 *   frames        frames drawn while it moves, frames dropped against 60Hz,
 *                 the longest gap, and how long after the press it started
 *   long tasks    main thread tasks over 50ms (PerformanceObserver)
 *   remounted     sections drawn again from nothing (a new node where the
 *                 old one was): the page must be the same page, restyled
 *
 * and then the sidebar's edge dragged 220px out and back by the mouse, with
 * every frame timed while it moves and the sidebar's width checked against
 * the pointer at the end.
 *
 * Headless Chromium draws in software, on a machine other agents share, so
 * the times are noisy and slower than a real screen; the shape (one move,
 * no reversal, no remount, few dropped frames) is what is asserted.
 *
 *   before (Y1, edge strips)   full screen: one 140 to 235ms frame before
 *          anything moved, the card snapping 294px in a frame (share 1.0),
 *          then only the sidebar fading; 9 to 11 frames dropped per switch
 *   after  (Z1, the card's own box, a frame at a time)   see the summary
 *          printed at the end of a run, recorded in the round's report
 *
 *   node scripts/check-view-switch.mjs
 *   VS_FILM=1 node scripts/check-view-switch.mjs     (every frame printed)
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false</script><script src="/editor-probe.js"></script></body></html>`
const js = readFileSync(bundle)
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (/\.(png|jpe?g|webp|gif)/.test(req.url)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}/website-builder/editor/probe-install`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const STRICT = process.env.REPORT_ONLY !== "1"

/* Installed once: the observers. */
const INSTALL = () => {
  window.__long = []
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: Math.round(e.duration) }) }).observe({ type: "longtask" })
  } catch {}
  /* A frame inside the canvas (an imported theme draws in one) loading again is the page reloaded. */
  window.__frameLoads = 0
  document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME") window.__frameLoads++ }, true)
}

/** Press `selector` the way a hand does and film the card and the sidebar for `ms`. */
const FILM = (selector, ms) => new Promise((resolve) => {
  const frame = document.querySelector(".wb-canvas-frame")
  const boxes = [...document.querySelectorAll("#wb-preview-root [data-section-box]")]
  for (const b of boxes) b.__probeSeen = true
  const loadsBefore = window.__frameLoads
  const sidebar = document.querySelector("[data-wb-sidebar-fold]")
  const panel = () => {
    if (!sidebar) return {}
    const inner = sidebar.firstElementChild
    const r = (inner ?? sidebar).getBoundingClientRect()
    return { panelLeft: Math.round(r.left * 10) / 10, panelOpacity: Math.round(Number(getComputedStyle(sidebar).opacity) * Number(getComputedStyle(inner ?? sidebar).opacity) * 1000) / 1000 }
  }
  const shot = (t) => {
    const r = frame.getBoundingClientRect()
    return { t, left: Math.round(r.left * 10) / 10, right: Math.round(r.right * 10) / 10, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10, opacity: Number(getComputedStyle(frame).opacity), visibility: getComputedStyle(frame).visibility, ...panel() }
  }
  const film = [shot(0)]
  let t0 = null
  const tick = (now) => {
    film.push(shot(Math.round(now - t0)))
    if (now - t0 < ms) requestAnimationFrame(tick)
    else {
      const after = [...document.querySelectorAll("#wb-preview-root [data-section-box]")]
      resolve({ film, remounted: after.filter((b) => !b.__probeSeen).length, sections: after.length, frameLoads: window.__frameLoads - loadsBefore, pressMs: window.__pressMs })
    }
  }
  const el = document.querySelector(selector)
  const pressAt = performance.now()
  t0 = pressAt
  /* A hand's press: the editor's idle work (the section library's previews) waits on input, and a bare click() is no input. */
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", isPrimary: true }))
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", isPrimary: true }))
  el.click()
  /* How long the press itself held the main thread: the render and commit it caused. */
  window.__pressMs = Math.round(performance.now() - pressAt)
  requestAnimationFrame(tick)
})

function read(result, longs) {
  const f = result.film
  const dts = f.slice(2).map((x, i) => x.t - f[i + 1].t)
  const dropped = dts.reduce((n, dt) => n + Math.max(0, Math.round(dt / 16.67) - 1), 0)
  const edge = (k) => {
    const from = f[0][k]
    const to = f[f.length - 1][k]
    const distance = Math.abs(to - from)
    const dir = Math.sign(to - from)
    let biggest = 0
    let reversed = false
    for (let i = 1; i < f.length; i++) {
      const d = f[i][k] - f[i - 1][k]
      biggest = Math.max(biggest, Math.abs(d))
      if (dir !== 0 ? dir * d < -0.5 : Math.abs(d) > 0.5) reversed = true
    }
    const settledAt = f.find((x, i) => f.slice(i).every((y) => Math.abs(y[k] - to) < 0.5))?.t ?? null
    return { from, to, distance: Math.round(distance), biggestStep: Math.round(biggest), share: distance ? Math.round((biggest / distance) * 100) / 100 : biggest ? 1 : 0, reversed, settledAt }
  }
  const L = edge("left")
  const R = edge("right")
  const P = edge("panelLeft")
  /* The sidebar's fade, only ever one way. */
  const lastP = f[f.length - 1].panelOpacity ?? 0
  const pdir = Math.sign(lastP - (f[0].panelOpacity ?? 0))
  let panelReversed = false
  for (let i = 1; i < f.length; i++) if (pdir !== 0 && pdir * ((f[i].panelOpacity ?? 0) - (f[i - 1].panelOpacity ?? 0)) < -0.01) panelReversed = true
  /* The motion: from the first frame anything is somewhere new to the last frame anything moved. */
  const moved = (x) => Math.abs(x.left - f[0].left) > 0.5 || Math.abs(x.right - f[0].right) > 0.5 || Math.abs((x.panelLeft ?? 0) - (f[0].panelLeft ?? 0)) > 0.5 || Math.abs((x.panelOpacity ?? 0) - (f[0].panelOpacity ?? 0)) > 0.005
  const first = f.findIndex((x, i) => i > 0 && moved(x))
  const same = (a, b) => Math.abs(a.left - b.left) < 0.5 && Math.abs(a.right - b.right) < 0.5 && Math.abs((a.panelLeft ?? 0) - (b.panelLeft ?? 0)) < 0.5 && Math.abs((a.panelOpacity ?? 0) - (b.panelOpacity ?? 0)) < 0.005
  let last = f.length - 1
  while (last > 0 && same(f[last], f[last - 1])) last--
  const inMotion = first > 0 ? f.slice(first - 1, last + 1) : []
  const motionDts = inMotion.slice(1).map((x, i) => x.t - inMotion[i].t)
  const motionDropped = motionDts.reduce((n, dt) => n + Math.max(0, Math.round(dt / 16.67) - 1), 0)
  return {
    pressMs: result.pressMs,
    pressToMotionMs: first > 0 ? f[first].t : null,
    motionMs: first > 0 ? f[last].t - f[first].t : 0,
    motionFrames: inMotion.length,
    motionDropped,
    motionLongestMs: motionDts.length ? Math.max(...motionDts) : 0,
    frames: f.length - 1,
    dropped,
    longestFrameMs: dts.length ? Math.max(...dts) : 0,
    longTasks: longs.length,
    longTaskMs: longs.reduce((s, l) => s + l.ms, 0),
    remounted: result.remounted,
    frameLoads: result.frameLoads,
    dimmedTo: Math.round(Math.min(...f.map((x) => x.opacity)) * 100) / 100,
    blank: f.filter((x) => x.width < 1 || x.height < 1 || x.visibility !== "visible").length,
    left: L,
    right: R,
    panel: { left: P, from: f[0].panelOpacity, to: lastP, reversed: panelReversed },
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  /* Sound allowed without a gesture: in a browser Ask's sound context is running after the first press, and its first-press wake-up (lib/website-builder/ask-sounds.ts) is not part of any switch. */
  args: ["--no-sandbox", ...(process.env.VS_GPU === "1" ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] : ["--disable-gpu"]), "--hide-scrollbars", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
})
const summary = {}
let drag = null
try {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(origin, { waitUntil: "load" })
  await page.evaluate(() => { try { sessionStorage.removeItem("wb:full-screen") } catch {} })
  await page.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await page.evaluate(INSTALL)
  /*
    VS_HEAVY=<n>: a real site's weight. The probe's page is light; a creator's
    has full-height heroes, grids that answer to the canvas's width and
    hundreds of products. n blocks of that kind are added inside the canvas,
    each sized from it (cqh, cqw and a container query), so a switch that lays
    the page out at every frame shows here the way it does on a real site.
  */
  const heavy = Number(process.env.VS_HEAVY || 0)
  if (heavy > 0) {
    await page.evaluate((n) => {
      const host = document.querySelector("#wb-preview-root > div") ?? document.querySelector("#wb-preview-root")
      const style = document.createElement("style")
      style.textContent = `.vs-heavy{display:grid;grid-template-columns:repeat(4,1fr);gap:1cqw;padding:2cqw}.vs-heavy>div{min-height:calc(var(--sl-vh,1vh)*8);padding:1cqw;font-size:max(12px,1.1cqw);border:1px solid #eee}@container wb-canvas (max-width: 700px){.vs-heavy{grid-template-columns:repeat(2,1fr)}.vs-heavy>div{font-size:14px}}`
      document.head.appendChild(style)
      /* In sections of 60 cards, as a real page is many sections, each one a section box. */
      let box = null
      for (let i = 0; i < n; i++) {
        if (i % 60 === 0) {
          box = document.createElement("section")
          box.className = "vs-heavy"
          box.setAttribute("data-section-box", "")
          host.appendChild(box)
        }
        const d = document.createElement("div")
        d.innerHTML = `<h3>Product ${i}</h3><p>A line of text that wraps differently at every width of the canvas, as a real card's copy does.</p><span>RON ${i}.00</span>`
        box.appendChild(d)
      }
    }, heavy)
    await sleep(800)
  }
  /* The code editor is warmed in idle time (preview-mode-switch.tsx): let it arrive, as it has by the time anybody switches. */
  await page.waitForFunction(() => !!document.querySelector("[data-code-pane]"), { timeout: 20_000 }).catch(() => {})
  await sleep(2500)
  const codePane = await page.evaluate(() => document.querySelector("[data-code-pane]")?.getAttribute("data-code-pane") ?? "none")
  console.log(`\nthe hidden code editor: ${codePane}`)
  expect(codePane === "held", "the hidden code editor keeps its size, so the canvas changes without it", codePane)

  const STEPS = [
    ["desktop to phone", "[data-wb-device-switch]", (s) => s.device === "mobile", "device"],
    ["phone to desktop", "[data-wb-device-switch]", (s) => s.device === "desktop", "device"],
    ["into full screen", "[data-wb-full-toggle]", (s) => s.full === "true", "full"],
    ["out of full screen", "[data-wb-full-toggle]", (s) => s.full === "false", "full"],
    ["desktop to phone, again", "[data-wb-device-switch]", (s) => s.device === "mobile", "device"],
    ["phone into full screen", "[data-wb-full-toggle]", (s) => s.full === "true" && s.device === "desktop", "both"],
    ["the size switch out of full screen", "[data-wb-device-switch]", (s) => s.full === "false" && s.device === "desktop", "full"],
  ]
  for (const [name, selector, ok, kind] of STEPS) {
    console.log(`\n${name}`)
    await page.mouse.move(5, 890)
    await sleep(700)
    const longsBefore = await page.evaluate(() => window.__long.length)
    const result = await page.evaluate(FILM, selector, 800)
    await sleep(300)
    const { longs, state } = await page.evaluate((a) => ({
      longs: window.__long.slice(a),
      state: {
        device: document.querySelector("[data-wb-device-switch]")?.getAttribute("data-wb-device"),
        full: document.querySelector("[data-wb-full-toggle]")?.getAttribute("aria-pressed"),
      },
    }), longsBefore)
    const r = read(result, longs)
    summary[name] = r
    console.log(`  ${JSON.stringify(r)}`)
    if (process.env.VS_FILM === "1") console.log(result.film.map((x) => `    ${x.t}ms L${x.left} R${x.right} w${x.width} h${x.height} panel ${x.panelLeft}/${x.panelOpacity}`).join("\n"))
    expect(ok(state), "it lands where it should", state)
    expect(r.remounted === 0, "the page is the same page: no section drawn again from nothing", r.remounted)
    expect(r.frameLoads === 0, "no frame inside the canvas loads again", r.frameLoads)
    expect(r.blank === 0, "the card is there in every frame: never blank, never hidden", r.blank)
    if (STRICT) {
      expect(r.dimmedTo >= 0.99, "the card is never dimmed", r.dimmedTo)
      expect(!r.left.reversed && !r.right.reversed, "neither edge of the card goes back on itself", { left: r.left, right: r.right })
      /* Against the card's whole move: going from the phone into full screen the right edge travels less than the left, on the same frames. */
      const whole = Math.max(r.left.distance, r.right.distance)
      expect(r.left.biggestStep <= whole / 3 && r.right.biggestStep <= whole / 3, "the card changes shape over frames: no frame moves an edge more than a third of the card's move", { left: r.left.biggestStep, right: r.right.biggestStep, whole })
      expect(r.motionFrames >= 8, "it is seen moving, not cut", { motionFrames: r.motionFrames, motionMs: r.motionMs })
      expect(r.motionDropped <= 3, "three frames dropped at the most while it moves", { motionDropped: r.motionDropped, motionFrames: r.motionFrames, motionLongestMs: r.motionLongestMs })
      if (kind !== "device") {
        expect(!r.panel.reversed && !r.panel.left.reversed && Math.abs(r.panel.to - (state.full === "true" ? 0 : 1)) < 0.01, "the sidebar goes one way, to gone or to there", r.panel)
        expect(r.panel.left.share <= 0.34, "and slides over frames, never in one", r.panel.left)
      }
    }
  }
  expect(errors.length === 0, "no page errors", errors)

  /*
    THE SIDEBAR'S EDGE, DRAGGED. A mouse moved 220px out over 40 moves and
    back, the way a hand drags, with every animation frame timed: the page
    beside it reflows a frame at a time and the sidebar follows the pointer.
  */
  console.log("\ndragging the sidebar's edge")
  await sleep(600)
  const handle = await page.evaluate(() => {
    const h = document.querySelector('[role="separator"][aria-label="Resize the sidebar"]')
    const r = h?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, width: (document.querySelector("[data-wb-sidebar-panel]") ?? document.querySelector("[data-wb-sidebar-fold]")?.firstElementChild)?.getBoundingClientRect().width ?? 0 } : null
  })
  expect(!!handle, "the sidebar has its edge to drag", handle)
  if (handle) {
    const longsBefore = await page.evaluate(() => window.__long.length)
    await page.evaluate(() => {
      window.__drag = []
      window.__dragOn = true
      const panel = document.querySelector("[data-wb-sidebar-panel]") ?? document.querySelector("[data-wb-sidebar-fold]").firstElementChild
      const card = document.querySelector(".wb-canvas-frame")
      const tick = (now) => {
        window.__drag.push({ t: now, w: Math.round(panel.getBoundingClientRect().width), card: Math.round(card.getBoundingClientRect().left) })
        if (window.__dragOn) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.mouse.move(handle.x, handle.y)
    await page.mouse.down()
    for (let i = 1; i <= 40; i++) {
      await page.mouse.move(handle.x + (220 * i) / 40, handle.y)
      await sleep(8)
    }
    for (let i = 39; i >= 20; i--) {
      await page.mouse.move(handle.x + (220 * i) / 40, handle.y)
      await sleep(8)
    }
    await page.mouse.up()
    await sleep(300)
    const out = await page.evaluate((a) => {
      window.__dragOn = false
      return { film: window.__drag, longs: window.__long.slice(a), width: Math.round((document.querySelector("[data-wb-sidebar-panel]") ?? document.querySelector("[data-wb-sidebar-fold]").firstElementChild).getBoundingClientRect().width), stored: (() => { try { return localStorage.getItem("wb:sidebar-width") } catch { return null } })() }
    }, longsBefore)
    const f = out.film
    const moving = f.filter((x, i) => i > 0 && (x.w !== f[i - 1].w || x.card !== f[i - 1].card))
    const firstAt = moving.length ? f.indexOf(moving[0]) - 1 : 0
    const lastAt = moving.length ? f.indexOf(moving[moving.length - 1]) : 0
    const span = f.slice(firstAt, lastAt + 1)
    const dts = span.slice(1).map((x, i) => x.t - span[i].t)
    const droppedDrag = dts.reduce((n, dt) => n + Math.max(0, Math.round(dt / 16.67) - 1), 0)
    const expected = Math.round(Math.min(560, handle.width + 110))
    drag = { frames: span.length, moved: moving.length, dropped: droppedDrag, longestMs: Math.round(dts.length ? Math.max(...dts) : 0), meanMs: Math.round((dts.reduce((s, x) => s + x, 0) / Math.max(1, dts.length)) * 10) / 10, longTasks: out.longs.length, longTaskMs: out.longs.reduce((s, l) => s + l.ms, 0), width: out.width, expected, stored: out.stored, cardFollows: span.every((x) => Math.abs(x.card - (x.w + 12)) <= 1) }
    console.log(`  ${JSON.stringify(drag)}`)
    expect(Math.abs(out.width - expected) <= 2, "the sidebar ends where the pointer let go", { width: out.width, expected })
    expect(out.stored === String(out.width), "and that width is remembered", out.stored)
    expect(drag.cardFollows, "the card's edge stays on the sidebar's in every frame of the drag")
    if (STRICT) {
      expect(drag.moved >= 20, "the sidebar moves in many frames, not a few jumps", drag.moved)
      expect(drag.longestMs <= 100, "no frame of the drag takes longer than 100ms", drag.longestMs)
    }
  }

  console.log("\nreduced motion")
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await sleep(400)
  const reduced = await page.evaluate(FILM, "[data-wb-device-switch]", 500)
  const rr = read(reduced, [])
  expect(rr.right.settledAt !== null && rr.right.settledAt <= 120 && rr.left.settledAt <= 120, "the card is where it is going within a frame or two, with no motion", { left: rr.left, right: rr.right })
  await page.close()
} finally {
  await browser.close()
  server.close()
}
console.log("\nsummary")
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(34)} press ${v.pressMs}ms  to motion ${v.pressToMotionMs}ms  motion ${v.motionMs}ms in ${v.motionFrames} frames, ${v.motionDropped} dropped, longest ${v.motionLongestMs}ms  long tasks ${v.longTasks} (${v.longTaskMs}ms)  remounted ${v.remounted}  blank ${v.blank}  dimmed ${v.dimmedTo}  step L ${v.left.share} R ${v.right.share} panel ${v.panel.left.share}  reversed ${v.left.reversed || v.right.reversed || v.panel.reversed}`)
if (drag) console.log(`  ${"drag the sidebar's edge".padEnd(34)} ${drag.frames} frames, ${drag.moved} moved, ${drag.dropped} dropped, longest ${drag.longestMs}ms, mean ${drag.meanMs}ms, long tasks ${drag.longTasks} (${drag.longTaskMs}ms)`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
