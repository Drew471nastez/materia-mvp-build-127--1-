/**
 * ===========================================================================
 *  SWITCHING HOW THE CANVAS IS SHOWN, FRAME BY FRAME
 * ===========================================================================
 * The owner: switching the editor's canvas to phone, back to desktop, or into
 * and out of full screen "is very glitchy, not smooth at all".
 *
 * The real editor (editor-probe-harness.mjs) at 1440 x 900, the real buttons
 * on the bar, and every switch filmed from the press for 800ms:
 *
 *   frames        animation frames drawn, frames dropped against 60Hz, and
 *                 the longest gap between two of them
 *   long tasks    main thread tasks over 50ms (PerformanceObserver)
 *   shifts        the layout shift total over the switch
 *   remounted     sections drawn again from nothing (a new node where the
 *                 old one was): the page must be the same page, restyled
 *   the card      its left and right edge as seen on screen, every frame:
 *                 the view transition's own box while one runs (its
 *                 ::view-transition-group), the card's box otherwise. The
 *                 biggest single frame step as a share of the whole move,
 *                 whether either edge ever went back on itself, and how
 *                 long until it settled
 *   dimmed        the lowest opacity the card was shown at
 *
 * Numbers on a loaded machine are noisy; the shape (one move, no reversal, no
 * remount) is what is asserted. Measured in Y1, headless Chromium, software
 * rendering, three agents sharing four cores:
 *
 *   before  desktop to phone dimmed to 0.55, both edges jumped 375px in one
 *           frame and went back on themselves; into and out of full screen
 *           the page settled 425 to 520ms after the press, having been drawn
 *           somewhere else first; 14 checks failed
 *   after   every switch: never dimmed, no edge reversed, no edge step over
 *           22% of its move, 0 frames dropped while it moves (17 frames for a
 *           device switch, 14 to 18 for full screen), no section remounted.
 *           Full screen still waits on one 130 to 190ms task (the editor's
 *           render and layout) before its first frame, as it did before
 *
 * An attempt with a document view transition measured worse here (300 to
 * 550ms before anything moved, a dozen frames dropped while it moved): its
 * capture works out every element's style several times a switch.
 *
 *   node scripts/check-view-switch.mjs
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

/* Installed once: the observers, and a film started by the press. */
const INSTALL = () => {
  window.__long = []
  window.__shift = []
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: Math.round(e.duration) }) }).observe({ type: "longtask" })
  } catch {}
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shift.push({ at: e.startTime, v: e.value }) }).observe({ type: "layout-shift" })
  } catch {}
  /* A frame inside the canvas (an imported theme draws in one) loading again is the page reloaded. */
  window.__frameLoads = 0
  document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME") window.__frameLoads++ }, true)
  /* A view transition's own clock: when its pictures start to move (ready) and when they are done. */
  window.__vts = []
  const own = document.startViewTransition
  if (typeof own === "function") {
    document.startViewTransition = function (cb) {
      const rec = { start: performance.now(), ready: null, finished: null }
      window.__vts.push(rec)
      const t = own.call(this, cb)
      t.ready.then(() => { rec.ready = performance.now() }, () => {})
      t.finished.then(() => { rec.finished = performance.now() }, () => {})
      return t
    }
  }
}

/** Press `selector` and film the card for `ms`. */
const FILM = (selector, ms) => new Promise((resolve) => {
  const frame = document.querySelector(".wb-canvas-frame")
  const boxes = [...document.querySelectorAll("#wb-preview-root [data-section-box]")]
  for (const b of boxes) b.__probeSeen = true
  const loadsBefore = window.__frameLoads
  const root = document.documentElement
  const group = () => {
    /* A view transition's box is a pseudo element: its size and place are read from its computed style. */
    try {
      const cs = getComputedStyle(root, "::view-transition-group(wb-canvas)")
      const w = parseFloat(cs.width)
      if (!w || cs.display === "none") return null
      const m = new DOMMatrixReadOnly(cs.transform === "none" ? undefined : cs.transform)
      return { left: m.m41, right: m.m41 + w, vt: true }
    } catch {
      return null
    }
  }
  /*
    WHERE THE CARD'S EDGES ARE SEEN, not where its box is: the box snaps once,
    and the strips of white or grey laid over the gap (canvas-switch.ts
    playCardEdges) carry the edge from the old box to the new one.
  */
  const seen = () => {
    const r = frame.getBoundingClientRect()
    let left = r.left
    let right = r.right
    for (const el of document.querySelectorAll("[data-wb-switch-edge]")) {
      const er = el.getBoundingClientRect()
      const card = el.getAttribute("data-wb-switch-color") === "card"
      const side = el.getAttribute("data-wb-switch-edge")
      if (side === "left") left = card ? Math.min(left, er.left) : Math.max(left, er.right)
      if (side === "right") right = card ? Math.max(right, er.right) : Math.min(right, er.left)
    }
    return { left, right }
  }
  /* The sidebar's panel: where it is and how strongly it is drawn, its fold's opacity with its own. */
  const sidebar = document.querySelector("[data-wb-sidebar-fold]")
  const panel = () => {
    if (!sidebar) return {}
    const inner = sidebar.firstElementChild
    const r = (inner ?? sidebar).getBoundingClientRect()
    return { panelLeft: Math.round(r.left * 10) / 10, panelOpacity: Math.round(Number(getComputedStyle(sidebar).opacity) * Number(getComputedStyle(inner ?? sidebar).opacity) * 1000) / 1000 }
  }
  const film = []
  let t0 = null
  const tick = (now) => {
    if (t0 === null) t0 = now
    const g = group()
    const box = g ?? seen()
    const p = panel()
    film.push({ t: Math.round(now - t0), left: Math.round(box.left * 10) / 10, right: Math.round(box.right * 10) / 10, vt: !!box.vt, opacity: Number(getComputedStyle(frame).opacity), card: Math.round(frame.getBoundingClientRect().left * 10) / 10, ...p })
    if (now - t0 < ms) requestAnimationFrame(tick)
    else {
      const after = [...document.querySelectorAll("#wb-preview-root [data-section-box]")]
      const vt = window.__vts.find((v) => v.start >= pressAt) ?? null
      resolve({ film, remounted: after.filter((b) => !b.__probeSeen).length, sections: after.length, frameLoads: window.__frameLoads - loadsBefore, vt: vt && { ready: vt.ready === null ? null : Math.round(vt.ready - pressAt), finished: vt.finished === null ? null : Math.round(vt.finished - pressAt) } })
    }
  }
  /* Where it was, before the press: the first frame of the film. */
  const r0 = frame.getBoundingClientRect()
  film.push({ t: 0, left: Math.round(r0.left * 10) / 10, right: Math.round(r0.right * 10) / 10, vt: false, opacity: Number(getComputedStyle(frame).opacity), card: Math.round(r0.left * 10) / 10, ...panel() })
  var pressAt = performance.now()
  document.querySelector(selector).click()
  /* How long the press itself held the main thread: the render and commit it caused. */
  window.__pressMs = Math.round(performance.now() - pressAt)
  requestAnimationFrame((now) => {
    t0 = pressAt
    tick(now)
  })
})

function read(result, pressAt, longs, shifts) {
  const f = result.film
  const dts = f.slice(1).map((x, i) => x.t - f[i].t)
  const dropped = dts.reduce((n, dt) => n + Math.max(0, Math.round(dt / 16.67) - 1), 0)
  const longest = Math.max(...dts)
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
  /*
    THE MOTION ITSELF, apart from the wait before it. It starts at the first
    frame the card is anywhere new (or the transition's ready) and ends when
    both edges have settled; frames dropped inside it are the stutter you see,
    the time before it is the press answered late.
  */
  const L = edge("left")
  const R = edge("right")
  /* Full screen: the page snaps, and the motion is the sidebar's; otherwise the edges'. */
  const panelMoves = Math.abs((f[f.length - 1].panelOpacity ?? 0) - (f[0].panelOpacity ?? 0)) > 0.01
  const moved = panelMoves
    ? f.findIndex((x, i) => i > 0 && x.panelOpacity !== f[1]?.panelOpacity && Math.abs((x.panelOpacity ?? 0) - (f[0].panelOpacity ?? 0)) > 0.005)
    : f.findIndex((x, i) => i > 0 && (Math.abs(x.left - f[0].left) > 0.5 || Math.abs(x.right - f[0].right) > 0.5))
  const startAt = result.vt?.ready ?? (moved > 0 ? f[moved].t : null)
  const lastP = f[f.length - 1].panelOpacity ?? 0
  const panelSettled = f.find((x, i) => f.slice(i).every((y) => Math.abs((y.panelOpacity ?? 0) - lastP) < 0.01 && Math.abs((y.panelLeft ?? 0) - (f[f.length - 1].panelLeft ?? 0)) < 0.5))?.t ?? 0
  /* The sidebar's fade, only ever one way. */
  const pdir = Math.sign(lastP - (f[0].panelOpacity ?? 0))
  let panelReversed = false
  for (let i = 1; i < f.length; i++) if (pdir !== 0 && pdir * ((f[i].panelOpacity ?? 0) - (f[i - 1].panelOpacity ?? 0)) < -0.01) panelReversed = true
  const endAt = Math.max(L.settledAt ?? 0, R.settledAt ?? 0, result.vt?.finished ?? 0, panelSettled)
  const inMotion = f.filter((x) => startAt !== null && x.t >= startAt && x.t <= endAt)
  const motionDts = inMotion.slice(1).map((x, i) => x.t - inMotion[i].t)
  const motionDropped = motionDts.reduce((n, dt) => n + Math.max(0, Math.round(dt / 16.67) - 1), 0)
  return {
    pressToMotionMs: startAt,
    motionMs: startAt === null ? 0 : endAt - startAt,
    motionFrames: inMotion.length,
    motionDropped,
    frames: f.length,
    dropped,
    longestFrameMs: Math.round(longest),
    longTasks: longs.length,
    longTaskMs: longs.reduce((s, l) => s + l.ms, 0),
    shift: Math.round(shifts.reduce((s, x) => s + x.v, 0) * 1000) / 1000,
    remounted: result.remounted,
    frameLoads: result.frameLoads,
    viewTransition: f.some((x) => x.vt),
    dimmedTo: Math.round(Math.min(...f.map((x) => x.opacity)) * 100) / 100,
    left: L,
    right: R,
    panel: { from: f[0].panelOpacity, to: lastP, settledAt: panelSettled, reversed: panelReversed },
    /* The card's own box: where it is from the first frame after the press. */
    cardSettledAt: f.find((x, i) => i > 0 && f.slice(i).every((y) => Math.abs(y.card - f[f.length - 1].card) < 0.5))?.t ?? null,
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  /* Sound allowed without a gesture: in a browser Ask's sound context is running after the first press, and its first-press wake-up (lib/website-builder/ask-sounds.ts) is not part of any switch. */
  args: ["--no-sandbox", ...(process.env.VS_GPU === "1" ? ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] : ["--disable-gpu"]), "--hide-scrollbars", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
})
const summary = {}
try {
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(origin, { waitUntil: "load" })
  await page.evaluate(() => { try { sessionStorage.removeItem("wb:full-screen") } catch {} })
  await page.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 60_000 })
  await page.evaluate(INSTALL)
  await sleep(1500)

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
    const shiftsBefore = await page.evaluate(() => window.__shift.length)
    const result = await page.evaluate(FILM, selector, 800)
    await sleep(300)
    const { longs, shifts, state } = await page.evaluate((a, b) => ({
      longs: window.__long.slice(a),
      shifts: window.__shift.slice(b),
      state: {
        device: document.querySelector("[data-wb-device-switch]")?.getAttribute("data-wb-device"),
        full: document.querySelector("[data-wb-full-toggle]")?.getAttribute("aria-pressed"),
      },
    }), longsBefore, shiftsBefore)
    const r = read(result, 0, longs, shifts)
    r.pressMs = await page.evaluate(() => window.__pressMs)
    r.film1 = result.film[1]?.t ?? null
    summary[name] = r
    console.log(`  ${JSON.stringify(r)}`)
    /* VS_FILM=1: every frame, for reading a switch by eye. */
    if (process.env.VS_FILM === "1") console.log(result.film.map((x) => `    ${x.t}ms L${x.left} R${x.right} card${x.card} panel ${x.panelLeft}/${x.panelOpacity}`).join("\n"))
    expect(ok(state), "it lands where it should", state)
    expect(r.remounted === 0, "the page is the same page: no section drawn again from nothing", r.remounted)
    expect(r.frameLoads === 0, "no frame inside the canvas loads again", r.frameLoads)
    if (STRICT) {
      expect(r.dimmedTo >= 0.99, "the card is never dimmed", r.dimmedTo)
      expect(r.motionDropped <= 3, "three frames dropped at the most while it moves", { motionDropped: r.motionDropped, motionFrames: r.motionFrames, motionMs: r.motionMs })
      if (kind !== "full") {
        /* Phone and desktop: the edges travel from the old box to the new one, one way, in steps. */
        expect(!r.left.reversed && !r.right.reversed, "neither edge of the card goes back on itself", { left: r.left, right: r.right })
        expect(r.left.share <= 0.34 && r.right.share <= 0.34, "no frame moves an edge more than a third of the way", { left: r.left.share, right: r.right.share })
      }
      if (kind !== "device") {
        /* Full screen: the page is where it ends up from the first frame, and only the sidebar moves, one way. */
        const first = r.film1
        expect(r.cardSettledAt !== null && r.cardSettledAt <= first, "the page is at its new place from the first frame after the press, and stays", { cardSettledAt: r.cardSettledAt, firstFrame: first })
        expect(!r.panel.reversed && Math.abs(r.panel.to - (state.full === "true" ? 0 : 1)) < 0.01, "the sidebar fades one way, to gone or to there", r.panel)
      }
    }
  }
  expect(errors.length === 0, "no page errors", errors)

  console.log("\nreduced motion")
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await sleep(400)
  const reduced = await page.evaluate(FILM, "[data-wb-device-switch]", 500)
  const rr = read(reduced, 0, [], [])
  expect(!rr.viewTransition && rr.right.settledAt !== null && rr.right.settledAt <= 120 && rr.left.settledAt <= 120, "the card is where it is going within a frame or two, with no motion", { left: rr.left, right: rr.right })
  await page.close()
} finally {
  await browser.close()
  server.close()
}
console.log("\nsummary")
for (const [k, v] of Object.entries(summary)) console.log(`  ${k.padEnd(26)} to motion ${v.pressToMotionMs}ms  motion ${v.motionMs}ms in ${v.motionFrames} frames, ${v.motionDropped} dropped  all: frames ${v.frames}  dropped ${v.dropped}  longest ${v.longestFrameMs}ms  long tasks ${v.longTasks} (${v.longTaskMs}ms)  shift ${v.shift}  remounted ${v.remounted}  vt ${v.viewTransition}  dimmed ${v.dimmedTo}  step L ${v.left.share} R ${v.right.share}  reversed ${v.left.reversed || v.right.reversed}`)
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
