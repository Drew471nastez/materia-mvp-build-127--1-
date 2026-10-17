/**
 * ===========================================================================
 *  LEAVING THE BUILDER: THE GOING BACK SCREEN, FRAME BY FRAME
 * ===========================================================================
 * The owner: "when exiting the website builder editor it's too direct
 * sometimes; it should show at least 3 seconds of a going back screen".
 *
 * The real editor (scripts/render-editor-probe.tsx), served at its own
 * address, with a navigation that arrives PROBE_NAVIGATE_MS after it starts
 * (the editor unmounted, a destination drawn in its place). Every frame from
 * the press is sampled: is the screen there, how opaque, does it cover the
 * window, is the editor or the destination under it. Then:
 *
 *   A  Back in the bar, pressed twice, a quick destination (500ms):
 *      one push, the screen up within a frame or two and opaque until
 *      EXIT_MIN_MS, the destination arriving under it, then a fade, then gone
 *   B  a slow destination (4.2s): the screen stays until it is there
 *   C  unsaved changes: the question first, no screen and no push; Discard
 *      then leaves the same way
 *   D  the browser's Back with nothing to lose: the same screen, no push
 *   E  a phone, 390 x 844, a tap on Back
 *
 *   node scripts/check-editor-exit.mjs
 */
import { createServer } from "node:http"
import { readFileSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { CHROMIUM, bundle, css } from "./editor-probe-harness.mjs"

const MIN = 3000
const FADE = 320
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

/* Every frame from now: the screen, its opacity and cover, and what is under it. */
const RECORD = () => {
  window.__frames = []
  const t0 = performance.now()
  window.__t0 = t0
  /* One recording at a time: a second RECORD stops the first one's loop, whose clock started earlier. */
  const run = (window.__recording = (window.__recording || 0) + 1)
  const tick = () => {
    if (window.__recording !== run) return
    const s = document.querySelector("[data-exit-screen]")
    const r = s ? s.getBoundingClientRect() : null
    window.__frames.push({
      t: Math.round(performance.now() - t0),
      screen: !!s,
      shownAt: s ? Math.round(Number(s.getAttribute("data-shown-at")) - t0) : null,
      opacity: s ? +parseFloat(getComputedStyle(s).opacity).toFixed(3) : 0,
      covers: !!r && r.width >= innerWidth && r.height >= innerHeight,
      editor: !!document.querySelector(".wb-editor"),
      dest: !!document.getElementById("probe-destination"),
      text: s ? (s.textContent || "").trim() : "",
      bg: s ? getComputedStyle(s).backgroundColor : "",
    })
    if (performance.now() - t0 < 6500) requestAnimationFrame(tick)
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

/**
 * What the frames say about one exit, every time counted from the moment the
 * screen went up (its data-shown-at), so a busy main thread before that does
 * not eat into the minimum being checked.
 */
function read(frames, arriveMs) {
  const base = frames.find((f) => f.shownAt !== null)?.shownAt ?? null
  const rel = base === null ? [] : frames.map((f) => ({ ...f, t: f.t - base }))
  const up = rel.find((f) => f.screen && f.opacity >= 0.95)
  const lastOpaque = [...rel].reverse().find((f) => f.screen && f.opacity >= 0.95)
  const fading = rel.filter((f) => f.screen && f.opacity > 0.05 && f.opacity < 0.95 && up && f.t > up.t)
  const gone = rel.find((f) => up && f.t > up.t && !f.screen)
  const dest = rel.find((f) => f.dest)
  const holds = up ? rel.filter((f) => f.t >= up.t && f.t <= Math.max(MIN - 60, (arriveMs ?? 0) - 60)) : []
  return {
    shownAt: base,
    upAt: up?.t ?? null,
    lastOpaqueAt: lastOpaque?.t ?? null,
    fadeFrames: fading.length,
    goneAt: gone?.t ?? null,
    destAt: dest?.t ?? null,
    heldEveryFrame: holds.length > 0 && holds.every((f) => f.screen && f.opacity >= 0.95 && f.covers),
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
    const r = read(frames, 500)
    console.log(`    (from the screen going up, ${r.shownAt}ms after the press) opaque at ${r.upAt}ms, destination at ${r.destAt}ms, last opaque frame ${r.lastOpaqueAt}ms, ${r.fadeFrames} fade frames, gone at ${r.goneAt}ms`)
    expect(pushes.length === 1 && pushes[0] === "/app/website-builder", "one navigation for two presses", pushes)
    const seen = frames.find((f) => f.screen)
    expect(!!seen && seen.t <= 120, "the screen is on the glass in the first frames after the press", seen && seen.t)
    expect(r.upAt !== null && r.upAt <= 400, "and opaque once its 220ms entrance has run", r.upAt)
    expect(r.text === "Going back" && r.bg === "rgb(255, 255, 255)", "it says Going back, on white like the canvas loader", { text: r.text, bg: r.bg })
    expect(r.destAt !== null && r.destAt < MIN, "the next page arrives under it", r.destAt)
    expect(r.heldEveryFrame, `opaque and covering the window in every frame until ${MIN}ms`)
    expect(r.lastOpaqueAt !== null && r.lastOpaqueAt >= MIN - 40, `still opaque at ${MIN}ms (the owner's minimum)`, r.lastOpaqueAt)
    expect(r.fadeFrames >= 3, "then it fades rather than cuts", r.fadeFrames)
    expect(r.goneAt !== null && r.goneAt <= MIN + FADE + 250, "and is gone once the fade is over", r.goneAt)
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
    await sleep(6000)
    const frames = await p.evaluate(() => window.__frames)
    const r = read(frames, 4200)
    console.log(`    (from the screen going up, ${r.shownAt}ms after the press) opaque at ${r.upAt}ms, destination at ${r.destAt}ms, last opaque frame ${r.lastOpaqueAt}ms, gone at ${r.goneAt}ms`)
    expect(r.heldEveryFrame, "opaque in every frame until the page is there")
    expect(r.goneAt !== null && r.destAt !== null && r.goneAt > r.destAt, "and it goes after the page has arrived, never before", { dest: r.destAt, gone: r.goneAt })
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
    await p.evaluate(RECORD)
    await p.mouse.click(at.x, at.y)
    await sleep(700)
    const asked = await p.evaluate(() => ({
      dialog: [...document.querySelectorAll("h2, h3, p, div")].some((e) => /^(Save changes before leaving\?|Leave without saving\?)$/.test((e.textContent || "").trim())),
      screen: !!document.querySelector("[data-exit-screen]"),
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
      await sleep(4200)
      const frames = await p.evaluate(() => window.__frames)
      const pushes = await p.evaluate(() => window.probePushes || [])
      const r = read(frames, 500)
      console.log(`    after Discard: up at ${r.upAt}ms, last opaque ${r.lastOpaqueAt}ms, gone at ${r.goneAt}ms`)
      expect(pushes.length === 1, "Discard leaves, once", pushes)
      expect(r.heldEveryFrame && r.lastOpaqueAt >= MIN - 40, "through the same screen, for the same minimum", r.lastOpaqueAt)
    }
    await p.close()
  }

  /* ── D ── */
  if (ONLY.includes("D")) {
    console.log("\n══ D. The browser's Back, nothing to lose ══")
    const { p } = await open({ width: 1280, height: 900 }, { navigateMs: 400, history: true })
    const where = await p.evaluate(() => location.pathname)
    expect(where === "/website-builder/editor/probe-install", "the editor is on top of /app/website-builder in the history", where)
    await p.evaluate(() => { window.__pops = []; addEventListener("popstate", () => window.__pops.push(location.pathname)) })
    await p.evaluate(RECORD)
    await p.evaluate(() => history.back())
    await sleep(4300)
    const frames = await p.evaluate(() => window.__frames)
    const pushes = await p.evaluate(() => window.probePushes || [])
    const r = read(frames, 400)
    console.log(`    popstate: ${JSON.stringify(await p.evaluate(() => window.__pops))}, now at ${await p.evaluate(() => location.pathname)}`)
    console.log(`    (from the screen going up, ${r.shownAt}ms after the press) opaque at ${r.upAt}ms, destination at ${r.destAt}ms, last opaque ${r.lastOpaqueAt}ms, gone at ${r.goneAt}ms`)
    expect(pushes.length === 0, "the browser did the navigating: no push of our own on top", pushes)
    expect(r.upAt !== null && r.upAt <= 400 && r.heldEveryFrame && r.lastOpaqueAt >= MIN - 40, "the same screen, for the same minimum", r)
    expect(r.goneAt !== null, "and it goes", r.goneAt)
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
    const r = read(frames, 600)
    console.log(`    (from the screen going up, ${r.shownAt}ms after the press) opaque at ${r.upAt}ms, destination at ${r.destAt}ms, last opaque ${r.lastOpaqueAt}ms, gone at ${r.goneAt}ms`)
    expect(pushes.length === 1, "one navigation", pushes)
    expect(r.heldEveryFrame && r.lastOpaqueAt >= MIN - 40 && r.goneAt !== null, "covered for the minimum, then gone", r)
    expect(errors.length === 0, "no page errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
