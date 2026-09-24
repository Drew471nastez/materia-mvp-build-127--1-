/**
 * ===========================================================================
 *  A CLICK IN THE CANVAS NEVER SCROLLS IT
 * ===========================================================================
 * "Sometimes in the preview, when I click on something, such as the centre
 * of the website, it scrolls to that thing." Every earlier probe of the
 * canvas dispatched a synthetic MouseEvent, and a synthetic event has no
 * default action: it does not focus, it does not activate a label, it does
 * not follow anything. The browser's own reasons to scroll were invisible to
 * all of them. This one presses with the real input pipeline (the DevTools
 * protocol's mouse and touch), so whatever a person's click does, this does.
 *
 * Twenty spots across a long page, spread over five scroll positions, at:
 *   - a desktop editor previewing the desktop site
 *   - a desktop editor previewing the phone site
 *   - a phone, with taps
 * and for each click every frame of the canvas's scrollTop for 1.2 seconds
 * after it. A click that moves it by a single pixel on any frame fails.
 *
 * Then the sidebar: picking a section that is already on screen must not
 * move the canvas; picking one that is entirely off screen brings it in.
 *
 *   node scripts/check-canvas-click-scroll.mjs
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

/** Installed in the page: records every frame's scrollTop until asked to stop. */
const WATCH = `
window.__watch = function () {
  var sc = document.getElementById("wb-preview-root")
  var start = sc.scrollTop, worst = 0, frames = 0, events = 0, live = true
  var onScroll = function () { events++ }
  sc.addEventListener("scroll", onScroll, { passive: true })
  function tick() {
    if (!live) return
    frames++
    var d = Math.abs(sc.scrollTop - start)
    if (d > worst) worst = d
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__unwatch = function () {
    live = false
    sc.removeEventListener("scroll", onScroll)
    return { start: start, end: sc.scrollTop, worst: worst, frames: frames, events: events }
  }
}
`

/** Where to click: a point inside the canvas that lands on the site, not on the editor's controls or the site's navigation. */
const PICK = `
window.__pick = function (fx, fy) {
  var sc = document.getElementById("wb-preview-root")
  var r = sc.getBoundingClientRect()
  var tries = [[0,0],[0,24],[0,-24],[40,0],[-40,0],[0,48],[80,0],[-80,0]]
  for (var i = 0; i < tries.length; i++) {
    var x = Math.round(r.left + r.width * fx + tries[i][0])
    var y = Math.round(r.top + r.height * fy + tries[i][1])
    var el = document.elementFromPoint(x, y)
    if (!el || !sc.contains(el)) continue
    /* The insert strip opens Add Section, and the header's and footer's
       links change the page: both are deliberate, and neither is the
       report. */
    if (el.closest('[aria-label="Add a section here"]')) continue
    if (el.closest('[data-chrome]')) continue
    var tag = el.tagName.toLowerCase()
    var what = tag + (el.closest("button") ? " in button" : "") + (el.closest("a[href]") ? " in link" : "") + (el.closest("label") ? " in label" : "") + (el.closest("summary") ? " in summary" : "")
    return { x: x, y: y, what: what, section: (el.closest("[data-section-type]") || {}).getAttribute ? el.closest("[data-section-type]").getAttribute("data-section-type") : "?" }
  }
  return null
}
`

async function open(vp) {
  const page = await browser.newPage()
  await page.setViewport(vp)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
  await page.goto(origin, { waitUntil: "load" })
  await page.waitForFunction(() => {
    const sc = document.getElementById("wb-preview-root")
    return sc && sc.querySelectorAll("[data-section-box]").length >= 8 && sc.scrollHeight > sc.clientHeight * 2
  }, { timeout: 60_000 })
  await page.evaluate(WATCH + PICK)
  /* The entrance animations and the fonts settle. */
  await sleep(1200)
  return { page, errors }
}

async function clickSpots(page, touch, label) {
  const results = []
  const room = await page.evaluate(() => {
    const sc = document.getElementById("wb-preview-root")
    return sc.scrollHeight - sc.clientHeight
  })
  const stops = [0.1, 0.3, 0.5, 0.7, 0.95].map((f) => Math.round(room * f))
  const spots = [[0.5, 0.5], [0.25, 0.35], [0.75, 0.65], [0.5, 0.85]]
  for (const top of stops) {
    for (const [fx, fy] of spots) {
      await page.evaluate((t) => { document.getElementById("wb-preview-root").scrollTop = t }, top)
      await sleep(120)
      const at = await page.evaluate((a, b) => window.__pick(a, b), fx, fy)
      if (!at) {
        results.push({ top, fx, fy, skipped: true })
        continue
      }
      await page.evaluate(() => window.__watch())
      if (touch) await page.touchscreen.tap(at.x, at.y)
      else await page.mouse.click(at.x, at.y)
      await sleep(1200)
      const seen = await page.evaluate(() => window.__unwatch())
      results.push({ top, at, ...seen })
      /* Whatever the click opened, close it, so the next click is a click on the canvas. */
      await page.keyboard.press("Escape")
      await sleep(150)
    }
  }
  const clicked = results.filter((r) => !r.skipped)
  const moved = clicked.filter((r) => r.worst > 0)
  console.log(`\n${label}`)
  expect(clicked.length >= 18, "at least eighteen of the twenty spots were on the site", clicked.length)
  expect(moved.length === 0, "no click moved the canvas on any frame", moved.slice(0, 4).map((m) => ({ on: `${m.at.section}: ${m.at.what}`, from: m.start, worst: m.worst, end: m.end })))
  return results
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--disable-dev-shm-usage"],
})
try {
  /* ── A desktop, previewing the desktop site ─────────────────────────── */
  {
    const { page, errors } = await open({ width: 1440, height: 900 })
    await clickSpots(page, false, "desktop editor, desktop preview (1440 x 900)")

    /* The sidebar. A section already on screen is selected and the canvas stays. */
    const sidebar = await page.evaluate(() => {
      const sc = document.getElementById("wb-preview-root")
      sc.scrollTop = 0
      return true
    })
    await sleep(300)
    const pickRow = async (type) => {
      await page.evaluate(() => window.__watch())
      const ok = await page.evaluate((t) => {
        const box = document.querySelector(`#wb-preview-root [data-section-type="${t}"]`)
        const id = box?.closest("[id^='wb-section-']")?.id?.replace("wb-section-", "")
        const name = id ? null : null
        void name
        /* The row is the one whose click selects this section: find it by the
           order of the layer list, which follows the page. */
        const rows = [...document.querySelectorAll("[data-wb-sidebar-scroll] .group.cursor-pointer")]
        const boxes = [...document.querySelectorAll("#wb-preview-root [data-section-type]")].map((b) => b.getAttribute("data-section-type"))
        const idx = boxes.indexOf(t)
        const row = rows[idx]
        if (!row) return false
        row.click()
        return true
      }, type)
      await sleep(1200)
      const seen = await page.evaluate(() => window.__unwatch())
      const visible = await page.evaluate((t) => {
        const sc = document.getElementById("wb-preview-root").getBoundingClientRect()
        const r = document.querySelector(`#wb-preview-root [data-section-type="${t}"]`).getBoundingClientRect()
        return r.bottom > sc.top && r.top < sc.bottom
      }, type)
      return { ok, ...seen, visible }
    }
    void sidebar
    const onScreen = await pickRow("hero_centered")
    console.log("\ndesktop editor, the layer list")
    expect(onScreen.ok, "a row for the hero was found and clicked")
    expect(onScreen.worst === 0, "picking a section that is on screen does not move the canvas", onScreen)
    const offScreen = await pickRow("promo_newsletter")
    expect(offScreen.ok, "a row for the newsletter was found and clicked")
    expect(offScreen.visible && offScreen.end > offScreen.start, "picking a section that is off screen brings it into view", offScreen)
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await page.close()
  }

  /* ── A desktop, previewing the phone site ───────────────────────────── */
  {
    const { page, errors } = await open({ width: 1440, height: 900 })
    await page.click('button[aria-label="Switch to phone preview"]')
    await sleep(1200)
    const width = await page.evaluate(() => Math.round(document.getElementById("wb-preview-root").getBoundingClientRect().width))
    await clickSpots(page, false, `desktop editor, phone preview (canvas ${width} wide)`)
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await page.close()
  }

  /* ── A phone, with a thumb ──────────────────────────────────────────── */
  {
    const { page, errors } = await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
    await clickSpots(page, true, "phone editor, taps (390 x 844)")
    expect(errors.length === 0, "no page errors", errors.slice(0, 3))
    await page.close()
  }
} finally {
  await browser.close()
  server.close()
}

console.log(broken ? `\n${broken} failed\n` : "\nall passed\n")
process.exit(broken ? 1 : 0)
