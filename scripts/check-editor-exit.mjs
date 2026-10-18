/**
 * ===========================================================================
 *  LEAVING THE BUILDER: GOING BACK, IN THE CANVAS, FRAME BY FRAME
 * ===========================================================================
 * The owner, first: "when exiting the website builder editor it's too direct
 * sometimes; it should show at least 3 seconds of a going back screen".
 * Then: that screen went over the whole window in white, and it belongs in
 * the canvas area, smoothly, the way it was.
 *
 * The real editor (scripts/render-editor-probe.tsx), served at its own
 * address, with a navigation that arrives PROBE_NAVIGATE_MS after it starts
 * (the editor unmounted, a destination drawn in its place). Every frame from
 * the press is sampled: is the Going back screen there, how opaque, the box
 * it covers against the canvas's and the window's, whether the bar and the
 * sidebar are still drawn beside it, and whether the editor or the
 * destination is on the page. Then:
 *
 *   A  Back in the bar, pressed twice, a quick destination (500ms): one
 *      push, sent once the screen has been up EXIT_MIN_MS; the screen over
 *      the canvas only, opaque from its 220ms entrance until the editor is
 *      replaced, the bar and the sidebar drawn in every one of those frames;
 *      never a frame covering the window
 *   B  a slow destination (4.2s): the screen stays until it is there
 *   C  unsaved changes: the question first, no screen and no push; Discard
 *      then leaves the same way
 *   D  the browser's Back with nothing to lose: the browser goes, no screen
 *      of ours over anything, no push
 *   E  a phone, 390 x 844, a tap on Back: the screen in the canvas, the bar
 *      above it
 *
 *   node scripts/check-editor-exit.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

const MIN = 3000
const js = readFileSync(bundle)
let navigateMs = 500
const page = (history) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=false;window.PROBE_NAVIGATE_MS=${navigateMs};</script>${history ? `<button id="probe-push" aria-hidden="true" tabindex="-1" style="position:fixed;left:0;bottom:0;width:6px;height:6px;opacity:0;z-index:2147483647" onclick="history.pushState(null, '', '/website-builder/editor/probe-install')"></button>` : ""}<script src="/editor-probe.js"></script></body></html>`
let withHistory = false
const server = createServer((req, res) => {
  if (req.url.startsWith("/editor-probe.js")) {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (/\.(png|jpe?g|webp|gif)/.test(req.url)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(withHistory))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}/website-builder/editor/probe-install`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ONLY = process.env.ONLY ?? "ABCDE"
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

/* Every frame from now: the screen, what it covers, and what is beside it. */
const RECORD = () => {
  window.__frames = []
  const t0 = performance.now()
  window.__t0 = t0
  window.__pushAt = null
  addEventListener("probe:push", () => { if (window.__pushAt === null) window.__pushAt = Math.round(performance.now() - t0) }, { once: true })
  const run = (window.__recording = (window.__recording || 0) + 1)
  const tick = () => {
    if (window.__recording !== run) return
    const s = document.querySelector("[data-exit-canvas]")
    const r = s ? s.getBoundingClientRect() : null
    const main = s ? s.parentElement.getBoundingClientRect() : null
    const bar = document.querySelector(".wb-editor header")
    const sidebar = document.querySelector("[data-wb-sidebar-fold]")
    /* Anything fixed over the whole window with a light fill: the white sheet this replaced, or one like it. */
    const sheet = [...document.body.querySelectorAll("body > div, [data-exit-screen]")].some((el) => {
      const cs = getComputedStyle(el)
      if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false
      const er = el.getBoundingClientRect()
      return er.width >= innerWidth && er.height >= innerHeight && /rgb\(25[0-5], 25[0-5], 25[0-5]\)/.test(cs.backgroundColor)
    })
    window.__frames.push({
      t: Math.round(performance.now() - t0),
      screen: !!s,
      opacity: s ? +parseFloat(getComputedStyle(s).opacity).toFixed(3) : 0,
      inCanvas: !!r && !!main && Math.abs(r.left - main.left) < 1 && Math.abs(r.right - main.right) < 1 && Math.abs(r.top - main.top) < 1 && Math.abs(r.bottom - main.bottom) < 1,
      coversWindow: !!r && r.width >= innerWidth && r.height >= innerHeight,
      sheet,
      bar: !!bar && bar.getBoundingClientRect().height > 30 && !(r && r.top <= bar.getBoundingClientRect().top),
      sidebar: !!sidebar && sidebar.getBoundingClientRect().width > 100,
      editor: !!document.querySelector(".wb-editor"),
      dest: !!document.getElementById("probe-destination"),
      text: s ? (s.textContent || "").trim() : "",
      bg: s ? getComputedStyle(s).backgroundColor : "",
    })
    if (performance.now() - t0 < 8500) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

async function open(vp, opts = {}) {
  navigateMs = opts.navigateMs ?? 500
  withHistory = !!opts.history
  const p = await browser.newPage()
  await p.setViewport({ ...vp, isMobile: !!opts.touch, hasTouch: !!opts.touch })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  /* With a history: opened at the list, then the editor's address pushed by a real press, an entry the browser keeps for Back. */
  await p.goto(opts.history ? origin.replace("/website-builder/editor/probe-install", "/app/website-builder") : origin, { waitUntil: "load" })
  await p.waitForFunction(() => document.querySelectorAll("#wb-preview-root [data-section-box]").length >= 8, { timeout: 90_000 })
  await sleep(1500)
  if (opts.history) {
    const b = await p.evaluate(() => { const r = document.getElementById("probe-push").getBoundingClientRect(); return { x: r.left + 3, y: r.top + 3 } })
    await p.mouse.click(b.x, b.y)
    await sleep(200)
  }
  return { p, errors }
}

async function backButton(p) {
  return p.evaluate(() => {
    const b = [...document.querySelectorAll("header button[aria-label='Back']")].find((x) => x.getClientRects().length)
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
}

/** What the frames say about one exit, counted from the first frame the screen is in. */
function read(frames, pushAt) {
  const first = frames.find((f) => f.screen)
  const base = first?.t ?? null
  const up = frames.find((f) => f.screen && f.opacity >= 0.95)
  const gone = frames.find((f) => first && f.t > first.t && !f.editor)
  const dest = frames.find((f) => f.dest)
  const withScreen = frames.filter((f) => f.screen)
  const opaque = up ? frames.filter((f) => f.t >= up.t && f.editor) : []
  return {
    firstAt: base,
    upAt: up?.t ?? null,
    pushAt,
    editorGoneAt: gone?.t ?? null,
    destAt: dest?.t ?? null,
    /* From fully in until the editor is replaced, every frame. */
    heldEveryFrame: opaque.length > 0 && opaque.every((f) => f.screen && f.opacity >= 0.95),
    inCanvasEveryFrame: withScreen.length > 0 && withScreen.every((f) => f.inCanvas && !f.coversWindow),
    chromeEveryFrame: withScreen.length > 0 && withScreen.every((f) => f.bar),
    sidebarEveryFrame: withScreen.length > 0 && withScreen.every((f) => f.sidebar),
    sheetFrames: frames.filter((f) => f.sheet).length,
    /* Between the editor and the page behind: a frame with neither. */
    emptyFrames: frames.filter((f) => !f.editor && !f.dest).length,
    text: up?.text ?? "",
    bg: up?.bg ?? "",
  }
}

try {
  /* ── A ── */
  if (ONLY.includes("A")) {
    console.log("\n══ A. Back in the bar, pressed twice; the next page is quick (500ms) ══")
    const { p, errors } = await open({ width: 1280, height: 900 }, { navigateMs: 500 })
    const at = await backButton(p)
    expect(!!at, "the bar has its Back")
    await p.evaluate(RECORD)
    await p.mouse.click(at.x, at.y)
    await sleep(150)
    await p.mouse.click(at.x, at.y).catch(() => {})
    await sleep(5000)
    const frames = await p.evaluate(() => window.__frames)
    const pushes = await p.evaluate(() => window.probePushes || [])
    const r = read(frames, await p.evaluate(() => window.__pushAt))
    console.log(`    in the canvas at ${r.firstAt}ms, opaque at ${r.upAt}ms, push at ${r.pushAt}ms, editor replaced at ${r.editorGoneAt}ms, destination at ${r.destAt}ms`)
    expect(pushes.length === 1 && pushes[0] === "/app/website-builder", "one navigation for two presses", pushes)
    expect(r.firstAt !== null && r.firstAt <= 120, "the screen is in the canvas in the first frames after the press", r.firstAt)
    expect(r.upAt !== null && r.upAt <= 400, "and opaque once its 220ms entrance has run", r.upAt)
    expect(r.text === "Going back" && r.bg === "rgb(255, 255, 255)", "it says Going back, on white like the canvas loader", { text: r.text, bg: r.bg })
    expect(r.inCanvasEveryFrame, "it covers the canvas and nothing else, in every frame: never the window")
    expect(r.chromeEveryFrame && r.sidebarEveryFrame, "the bar and the sidebar are drawn beside it in every frame")
    expect(r.sheetFrames === 0, "no white sheet over the whole window, in any frame", r.sheetFrames)
    expect(r.pushAt !== null && r.pushAt >= MIN - 20, `the push goes once it has been up ${MIN}ms (the owner's minimum)`, r.pushAt)
    expect(r.heldEveryFrame, "opaque in every frame until the editor is replaced")
    expect(r.destAt !== null && r.editorGoneAt !== null && r.emptyFrames === 0, "and the page behind replaces the editor in one frame, nothing between", { gone: r.editorGoneAt, dest: r.destAt, empty: r.emptyFrames })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }

  /* ── B ── */
  if (ONLY.includes("B")) {
    console.log("\n══ B. A slow next page (4.2s) ══")
    const { p } = await open({ width: 1280, height: 900 }, { navigateMs: 4200 })
    const at = await backButton(p)
    await p.evaluate(RECORD)
    await p.mouse.click(at.x, at.y)
    await sleep(8000)
    const frames = await p.evaluate(() => window.__frames)
    const r = read(frames, await p.evaluate(() => window.__pushAt))
    console.log(`    opaque at ${r.upAt}ms, push at ${r.pushAt}ms, destination at ${r.destAt}ms`)
    expect(r.heldEveryFrame && r.inCanvasEveryFrame, "in the canvas and opaque in every frame until the page is there")
    expect(r.destAt !== null && r.pushAt !== null && r.destAt >= r.pushAt + 4000, "the page arrives after its own wait, the screen up all the while", r)
    await p.close()
  }

  /* ── C ── */
  if (ONLY.includes("C")) {
    console.log("\n══ C. Unsaved changes: the question comes first ══")
    const { p } = await open({ width: 1280, height: 900 }, { navigateMs: 500 })
    /* An edit: the hero selected, a word typed into its heading. */
    const hero = await p.evaluate(() => { const b = document.querySelector("#wb-preview-root [data-section-type='hero_centered']"); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 40 } })
    await p.mouse.click(hero.x, hero.y)
    await sleep(900)
    const field = await p.evaluate(() => {
      const i = [...document.querySelectorAll("[data-wb-sidebar-scroll] input, [data-wb-sidebar-scroll] textarea")].find((x) => /^Section \d+:/.test(x.value || ""))
      if (!i) return null
      i.scrollIntoView({ block: "center" })
      const r = i.getBoundingClientRect()
      return { x: r.right - 8, y: r.top + r.height / 2 }
    })
    expect(!!field, "the hero's heading field")
    await p.mouse.click(field.x, field.y)
    await sleep(300)
    await p.keyboard.press("End")
    await p.keyboard.type(" now", { delay: 40 })
    await sleep(250)
    const typed = await p.evaluate(() => [...document.querySelectorAll("[data-wb-sidebar-scroll] input, [data-wb-sidebar-scroll] textarea")].some((x) => / now$/.test(x.value || "")))
    expect(typed, "the word is in the field")
    const at = await backButton(p)
    await p.mouse.click(at.x, at.y)
    await sleep(700)
    const asked = await p.evaluate(() => ({
      dialog: [...document.querySelectorAll("h2, h3, p, div")].some((e) => /^(Save changes before leaving\?|Leave without saving\?)$/.test((e.textContent || "").trim())),
      screen: !!document.querySelector("[data-exit-canvas]"),
      pushes: (window.probePushes || []).length,
    }))
    expect(asked.dialog && !asked.screen && asked.pushes === 0, "the leave question shows, with no screen and no navigation yet", asked)
    const discard = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Discard( changes)?$/.test((x.textContent || "").trim()) && x.getClientRects().length)
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    })
    expect(!!discard, "it offers Discard")
    if (discard) {
      await p.evaluate(RECORD)
      await p.mouse.click(discard.x, discard.y)
      await sleep(4600)
      const frames = await p.evaluate(() => window.__frames)
      const pushes = await p.evaluate(() => window.probePushes || [])
      const r = read(frames, await p.evaluate(() => window.__pushAt))
      console.log(`    after Discard: up at ${r.upAt}ms, push at ${r.pushAt}ms, editor replaced at ${r.editorGoneAt}ms`)
      expect(pushes.length === 1, "Discard leaves, once", pushes)
      expect(r.heldEveryFrame && r.inCanvasEveryFrame && r.pushAt >= MIN - 20, "through the same screen in the canvas, for the same minimum", r)
    }
    await p.close()
  }

  /* ── D ── */
  if (ONLY.includes("D")) {
    console.log("\n══ D. The browser's Back, nothing to lose ══")
    const { p } = await open({ width: 1280, height: 900 }, { navigateMs: 400, history: true })
    const where = await p.evaluate(() => location.pathname)
    expect(where === "/website-builder/editor/probe-install", "the editor is on top of /app/website-builder in the history", where)
    await p.evaluate(RECORD)
    await p.evaluate(() => history.back())
    await sleep(1500)
    const frames = await p.evaluate(() => window.__frames)
    const pushes = await p.evaluate(() => window.probePushes || [])
    const r = read(frames, null)
    console.log(`    now at ${await p.evaluate(() => location.pathname)}, destination at ${r.destAt}ms`)
    expect(pushes.length === 0, "the browser did the navigating: no push of our own on top", pushes)
    expect(r.firstAt === null && r.sheetFrames === 0, "and nothing of ours is laid over the page, in any frame", { screen: r.firstAt, sheet: r.sheetFrames })
    expect(r.destAt !== null && r.emptyFrames === 0, "the page behind replaces the editor in one frame", { dest: r.destAt, empty: r.emptyFrames })
    await p.close()
  }

  /* ── E ── */
  if (ONLY.includes("E")) {
    console.log("\n══ E. A phone, 390 × 844 ══")
    const { p, errors } = await open({ width: 390, height: 844 }, { touch: true, navigateMs: 600 })
    const at = await backButton(p)
    expect(!!at, "the bar has its Back")
    await p.evaluate(RECORD)
    await p.touchscreen.tap(at.x, at.y)
    await sleep(4300)
    const frames = await p.evaluate(() => window.__frames)
    const pushes = await p.evaluate(() => window.probePushes || [])
    const r = read(frames, await p.evaluate(() => window.__pushAt))
    console.log(`    in the canvas at ${r.firstAt}ms, opaque at ${r.upAt}ms, push at ${r.pushAt}ms, editor replaced at ${r.editorGoneAt}ms`)
    expect(pushes.length === 1, "one navigation", pushes)
    expect(r.heldEveryFrame && r.inCanvasEveryFrame && r.chromeEveryFrame, "in the canvas under the bar for the minimum, then the page behind", r)
    expect(r.sheetFrames === 0 && r.emptyFrames === 0, "no white sheet over the window, no empty frame", { sheet: r.sheetFrames, empty: r.emptyFrames })
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
