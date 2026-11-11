/**
 * ===========================================================================
 *  EVERY ROW THAT SLIDES SIDEWAYS FOLLOWS A MOUSE (round AP)
 * ===========================================================================
 * The full live page of scripts/render-onepage-perf-ap.tsx at 1440x900 with a
 * mouse. For every row on it that scrolls sideways (the digital products
 * shelf, a group's carousel, the image slideshow, testimonials):
 *
 *   follows    pressed and drawn 160px to the left in 10 moves, the row's
 *              scrollLeft is the pointer's travel on every move (to 1px)
 *   lands      let go, it glides and comes to rest on a slide (its snap
 *              back on), never back where it started
 *   no click   the click a drag ends with opens nothing; a plain click after
 *              it still does
 *   touch      on a touch phone the rows are left to the browser's own
 *              scroll (no handler takes a finger)
 *
 *   node scripts/check-onepage-drag-rows-ap.mjs        (REPORT=1 prints without failing)
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const CHROMIUM = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p))
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-perf-ap.tsx" })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const results = []
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.setRequestInterception(true)
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.protocol === "data:") return void r.continue()
    if (u.hostname !== "127.0.0.1") return void r.respond({ status: 200, contentType: "text/html", body: "<!doctype html><body></body>" })
    void r.continue()
  })
  await page.goto(`${base}/app/onepage?bg=solid`, { waitUntil: "domcontentloaded" })
  await page.waitForSelector(".op-btn", { timeout: 60000 })
  await sleep(1500)
  /* Every row that scrolls sideways and has somewhere to go, tagged. Links inside it count their clicks and go nowhere. */
  const rows = await page.evaluate(() => {
    window.__clicks = 0
    document.addEventListener("click", (e) => {
      const a = e.target.closest?.("a[href]")
      if (a) {
        e.preventDefault()
        window.__clicks++
      }
    })
    const out = []
    document.querySelectorAll("*").forEach((el) => {
      const ox = getComputedStyle(el).overflowX
      if ((ox === "auto" || ox === "scroll") && el.scrollWidth > el.clientWidth + 20 && el.getClientRects().length) {
        el.setAttribute("data-probe-row", String(out.length))
        const name = el.closest("[data-onepage-shelf]") ? "products shelf" : el.closest("[data-carousel-index], [data-group-carousel]") ? "group carousel" : el.querySelector("img[alt^='Photo']") ? "image slideshow" : el.closest("[data-onepage-testimonials]") ? "testimonials" : el.className.slice(0, 40)
        out.push({ i: out.length, name, w: el.clientWidth, sw: el.scrollWidth })
      }
    })
    return out
  })
  console.log(`rows: ${JSON.stringify(rows)}`)
  expect(rows.length >= 3, `the page has its sideways rows (${rows.length})`)
  for (const row of rows) {
    const sel = `[data-probe-row="${row.i}"]`
    await page.$eval(sel, (el) => { el.scrollIntoView({ block: "center" }); el.scrollLeft = 0 })
    await sleep(500)
    const box = await page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
    const x0 = box.x + box.w * 0.7
    const y0 = box.y + box.h / 2
    const clicksBefore = await page.evaluate(() => window.__clicks)
    /* Where the row starts (a snapping row rests a few pixels in). */
    const start = await page.$eval(sel, (el) => el.scrollLeft)
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    const lag = []
    /* Round AS (changed on purpose): rows run to the page's edge and slides are the column's width, so the drag is a share of the row, not a fixed 160px. */
    const step = Math.max(16, Math.round(box.w * 0.04))
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(x0 - i * step, y0)
      const left = await page.$eval(sel, (el) => el.scrollLeft)
      /* After the 6px that make a press a drag, the row is the pointer's travel. */
      if (i * step > 8) lag.push(Math.abs(left - start - i * step))
      await sleep(16)
    }
    await page.mouse.up()
    await sleep(900)
    const after = await page.$eval(sel, (el) => ({ left: Math.round(el.scrollLeft), snap: getComputedStyle(el).scrollSnapType, dragging: el.hasAttribute("data-dragging") }))
    const clicksAfterDrag = (await page.evaluate(() => window.__clicks)) - clicksBefore
    /* A plain click on a link in the row still counts. */
    const plain = await page.evaluate((s) => {
      const row = document.querySelector(s)
      const box = row?.getBoundingClientRect()
      /* A link the row shows now, wholly inside it. */
      const a = row && [...row.querySelectorAll("a[href]")].find((l) => { const r = l.getBoundingClientRect(); return r.width > 0 && r.left >= box.left - 1 && r.right <= box.right + 1 })
      if (!a) return null
      const r = a.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }, sel)
    let plainClicked = null
    if (plain) {
      const before = await page.evaluate(() => window.__clicks)
      await page.mouse.click(plain.x, plain.y)
      await sleep(100)
      plainClicked = (await page.evaluate(() => window.__clicks)) - before
    }
    const worst = lag.length ? Math.max(...lag) : null
    results.push({ row: row.name, worstLagPx: worst, rest: after.left, clicksAfterDrag, plainClicked })
    console.log(`\n${row.name}: worst lag ${worst}px, rests at ${after.left}, clicks after drag ${clicksAfterDrag}, plain click ${plainClicked}`)
    expect(worst !== null && worst <= 1, `${row.name}: the row is under the pointer on every move (${worst}px)`)
    expect(after.left > 0 && !after.dragging, `${row.name}: let go, it rests on a slide past the start (${after.left})`)
    expect(clicksAfterDrag === 0, `${row.name}: the click a drag ends with opens nothing (${clicksAfterDrag})`)
    if (plain) expect(plainClicked === 1, `${row.name}: a plain click still opens (${plainClicked})`)
  }
  await page.close()

  /* A finger: no handler takes it (the browser's own scroll). */
  const phone = await browser.newPage()
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  await phone.goto(`${base}/app/onepage?bg=solid`, { waitUntil: "domcontentloaded" })
  await phone.waitForSelector(".op-btn", { timeout: 60000 })
  await sleep(800)
  const touchLeft = await phone.evaluate(async () => {
    const row = [...document.querySelectorAll("*")].find((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowX) && el.scrollWidth > el.clientWidth + 20 && el.getClientRects().length)
    if (!row) return null
    const before = row.scrollLeft
    row.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true, clientX: 300, clientY: 10, pointerId: 7, button: 0 }))
    row.dispatchEvent(new PointerEvent("pointermove", { pointerType: "touch", bubbles: true, clientX: 100, clientY: 10, pointerId: 7 }))
    return { moved: row.scrollLeft - before, dragging: row.hasAttribute("data-dragging") }
  })
  expect(touchLeft && touchLeft.moved === 0 && !touchLeft.dragging, "a finger's pointer events move nothing by script (the browser scrolls)", touchLeft)
  await phone.close()
} finally {
  await browser.close()
  server.close()
}
console.log("\nRESULTS " + JSON.stringify(results))
if (broken && !report) {
  console.error(`\n${broken} failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} would fail (REPORT)` : "\nall passed")
