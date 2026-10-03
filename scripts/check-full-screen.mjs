/**
 * ===========================================================================
 *  FULL SCREEN PREVIEW, MEASURED
 * ===========================================================================
 * The owner's ask: beside the desktop / phone switch, a third way of looking,
 * Full screen, that smoothly folds the sidebar and the editor's own chrome
 * away so the site fills the editor at desktop width, with the switch still
 * there to come back and Escape to leave; remembered for the session; not on
 * a phone.
 *
 * The real editor (editor-probe-harness.mjs), the real button, and every
 * frame of the fold read back:
 *   - the sidebar fold's width and opacity, frame by frame, in and out
 *   - the canvas's width, frame by frame: it must only grow going in (and
 *     only shrink coming out), with no single frame jumping more than a
 *     sixth of the distance
 *   - how long until it settles
 *   - the section toolbar and the canvas rings gone, the switches still on the bar
 *   - Escape back out, the session remembering it across a reload, and no
 *     button on a phone
 *
 *   node scripts/check-full-screen.mjs
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

async function open(page, vp, touch) {
  await page.setViewport({ ...vp, isMobile: !!touch, hasTouch: !!touch })
  await page.goto(origin, { waitUntil: "load" })
  await page.waitForFunction(() => {
    const sc = document.getElementById("wb-preview-root")
    return sc && sc.querySelectorAll("[data-section-box]").length >= 8
  }, { timeout: 60_000 })
  await sleep(1200)
}

/** Every frame for `ms`: the fold's width and opacity, and the canvas's width. */
const FILM = (ms) => new Promise((resolve) => {
  const fold = document.querySelector("[data-wb-sidebar-fold]")
  const canvas = document.getElementById("wb-preview-root")
  const frames = []
  const t0 = performance.now()
  const tick = () => {
    const t = performance.now() - t0
    frames.push({ t: Math.round(t), fold: Math.round(fold.getBoundingClientRect().width * 10) / 10, opacity: Number(getComputedStyle(fold).opacity), canvas: Math.round(canvas.getBoundingClientRect().width * 10) / 10 })
    if (t < ms) requestAnimationFrame(tick)
    else resolve(frames)
  }
  requestAnimationFrame(tick)
})

const STATE = () => ({
  fold: document.querySelector("[data-wb-sidebar-fold]")?.getAttribute("data-wb-sidebar-fold"),
  foldWidth: Math.round(document.querySelector("[data-wb-sidebar-fold]")?.getBoundingClientRect().width ?? -1),
  canvas: Math.round(document.getElementById("wb-preview-root").getBoundingClientRect().width),
  pressed: document.querySelector("[data-wb-full-screen-switch]")?.getAttribute("aria-pressed"),
  switchVisible: !!document.querySelector("[data-wb-full-screen-switch]")?.getBoundingClientRect().width,
  deviceVisible: !!document.querySelector("[data-wb-device-switch]")?.getBoundingClientRect().width,
  toolbar: !!document.querySelector(".wb-section-toolbar"),
  rings: document.querySelectorAll("#wb-preview-root span.wb-ring").length,
  remembered: sessionStorage.getItem("wb:full-screen"),
})

/** How a film moved: monotonic, its biggest single-frame step, and when it settled. */
function read(frames, key, dir) {
  let monotonic = true
  let biggest = 0
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i][key] - frames[i - 1][key]
    if (dir * d < -0.5) monotonic = false
    biggest = Math.max(biggest, Math.abs(d))
  }
  const last = frames[frames.length - 1][key]
  const settledAt = frames.find((f, i) => frames.slice(i).every((g) => Math.abs(g[key] - last) < 0.5))?.t ?? null
  const distance = Math.abs(last - frames[0][key])
  return { from: frames[0][key], to: last, monotonic, biggest: Math.round(biggest), distance: Math.round(distance), settledAt, frames: frames.length }
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"],
})
try {
  console.log("\ndesktop editor, 1440x900")
  const page = await browser.newPage()
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await open(page, { width: 1440, height: 900 }, false)
  /* A section selected first, so its toolbar and ring are there to go. */
  await page.evaluate(() => {
    const el = document.querySelector('#wb-preview-root [data-section-type="hero_centered"] h1, #wb-preview-root [data-section-type="hero_centered"] h2')
    el?.click()
  })
  await sleep(600)
  const before = await page.evaluate(STATE)
  expect(before.fold === "open" && before.foldWidth > 200 && before.switchVisible && before.pressed === "false", "the switch sits beside desktop / phone, off", before)

  const filmIn = page.evaluate(FILM, 700)
  await page.click("[data-wb-full-screen-switch]")
  const inFrames = await filmIn
  const foldIn = read(inFrames, "fold", -1)
  const canvasIn = read(inFrames, "canvas", 1)
  expect(foldIn.to === 0 && foldIn.monotonic, "the sidebar folds to nothing, only ever narrower", foldIn)
  expect(canvasIn.monotonic && canvasIn.distance > 200, "the canvas grows into the room, only ever wider", canvasIn)
  expect(canvasIn.biggest <= canvasIn.distance / 6 + 1, "smoothly: no frame moves it more than a sixth of the way", { biggest: canvasIn.biggest, distance: canvasIn.distance })
  expect(canvasIn.settledAt !== null && canvasIn.settledAt <= 520, "and settles in about a third of a second", canvasIn.settledAt)
  const on = await page.evaluate(STATE)
  expect(on.canvas >= 1440 - 16, "the site fills the editor's width", on.canvas)
  expect(on.pressed === "true" && on.switchVisible && on.deviceVisible, "the switches stay on the bar, the full screen one pressed", on)
  expect(!on.toolbar && on.rings === 0, "no section toolbar and no rings over the site", { toolbar: on.toolbar, rings: on.rings })
  expect(on.remembered === "1", "remembered for the session", on.remembered)

  /* Remembered across a reload in the same tab. */
  await open(page, { width: 1440, height: 900 }, false)
  const reloaded = await page.evaluate(STATE)
  expect(reloaded.fold === "folded" && reloaded.pressed === "true", "a reload in the same tab comes back full screen", reloaded)

  const filmOut = page.evaluate(FILM, 700)
  await page.keyboard.press("Escape")
  const outFrames = await filmOut
  const foldOut = read(outFrames, "fold", 1)
  const canvasOut = read(outFrames, "canvas", -1)
  expect(foldOut.monotonic && foldOut.to > 200, "Escape brings the sidebar back, only ever wider", foldOut)
  expect(canvasOut.monotonic && canvasOut.biggest <= canvasOut.distance / 6 + 1, "and the canvas gives the room back smoothly", canvasOut)
  const off = await page.evaluate(STATE)
  expect(off.fold === "open" && off.pressed === "false" && off.remembered === null, "off again, and forgotten", off)
  expect(errors.length === 0, "no page errors", errors)
  await page.close()

  console.log("\nphone editor, 390x844")
  const phone = await browser.newPage()
  await open(phone, { width: 390, height: 844 }, true)
  const p = await phone.evaluate(() => ({ button: !!document.querySelector("[data-wb-full-screen-switch]") }))
  expect(!p.button, "not offered on a phone, where the canvas already fills the screen", p)
  await phone.close()
} finally {
  await browser.close()
  server.close()
}
console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
