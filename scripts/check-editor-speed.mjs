/**
 * ===========================================================================
 *  HOW LONG A PRESS TAKES TO BECOME A PRODUCT EDITOR
 * ===========================================================================
 * "It takes so much time to load a product edit page."
 *
 * A press on a row costs two things: the server's read (the auth round trip
 * and the five reads, app/(storelib)/app/products/load-editor.ts) and the browser's own
 * work (the route's code, the render, hydration, the pictures). The first is
 * a network and is stood in for here by `window.__slowMs`; this measures the
 * second, which is the part the code decides, with the real list and the real
 * editor drawn by the React the app router runs
 * (scripts/render-layer-motion.tsx).
 *
 * From the press, three moments:
 *
 *   FIRST FRAME     the editor is on the screen and painted.
 *   FIELDS FILLED   the product's own title is in its field, not a skeleton.
 *   INTERACTIVE     the main thread has been quiet for QUIET_MS, so a tap on
 *                   a field is answered on its frame. Reported as the end of
 *                   the last long task after the press, and the longest one.
 *
 * At 390 and 1280, fast and with the CPU slowed 4x, each twice (the first
 * open of the editor's code, then a second press once it is warm).
 *
 *   node scripts/check-editor-speed.mjs
 *   ONLY=1280 node scripts/check-editor-speed.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const QUIET_MS = 300
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

const built = execFileSync(process.execPath, [join(root, "scripts/check-layer-motion.mjs")], { cwd: root, env: { ...process.env, BUILD_ONLY: "1" }, encoding: "utf8" })
  .trim()
  .split("\n")
  .pop()
const html = readFileSync(built, "utf8")

const WATCH = () => {
  window.__t = { press: null, painted: null, filled: null, lastLong: null, longest: 0 }
  const t = window.__t
  window.addEventListener("click", () => { if (!t.press) t.press = performance.now() }, { capture: true, once: true })
  try {
    window.__lt?.disconnect()
    window.__lt = new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (t.press === null || e.startTime < t.press) continue
        t.lastLong = e.startTime + e.duration
        t.longest = Math.max(t.longest, Math.round(e.duration))
      }
    })
    window.__lt.observe({ type: "longtask" })
  } catch {}
  const look = () => {
    const editor = document.querySelector("[data-product-editor]")
    if (t.press !== null && editor && editor.getBoundingClientRect().height > 0) {
      if (t.painted === null) requestAnimationFrame(() => { if (t.painted === null) t.painted = performance.now() })
      const title = document.getElementById("title")
      if (t.filled === null && title && title.value) t.filled = performance.now()
    }
    requestAnimationFrame(look)
  }
  requestAnimationFrame(look)
}

async function press(p, cdp, { rate, slowMs }) {
  await p.evaluate((ms) => {
    window.__slowMs = 0
    window.__navigate("/app/products", "replace")
  })
  await sleep(700)
  await p.evaluate((ms) => { window.__slowMs = ms }, slowMs)
  await p.evaluate(WATCH)
  const box = await p.evaluate(() => {
    const row = [...document.querySelectorAll("[data-row]:not([hidden])")].find((el) => el.getClientRects().length > 0)
    const target = row.querySelector("a[data-row-link]") || row.querySelector("td:first-child a")
    const b = target.getBoundingClientRect()
    return { x: b.left + Math.min(b.width / 2, 80), y: b.top + b.height / 2 }
  })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate })
  await p.mouse.click(box.x, box.y)
  for (let i = 0; i < 200; i++) {
    await sleep(50)
    const t = await p.evaluate(() => window.__t)
    if (t.filled && performance.now) {
      const quiet = await p.evaluate((q) => {
        const t = window.__t
        return t.lastLong === null || performance.now() - t.lastLong > q
      }, QUIET_MS)
      if (quiet) break
    }
  }
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const t = await p.evaluate(() => window.__t)
  const from = t.press ?? 0
  const ready = Math.max(t.painted ?? from, t.lastLong ?? 0)
  return {
    firstFrame: t.painted === null ? null : Math.round(t.painted - from),
    filled: t.filled === null ? null : Math.round(t.filled - from),
    interactive: Math.round(ready - from),
    longest: t.longest,
  }
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const widths = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : [390, 1280]
try {
  for (const width of widths) {
    const phone = width < 768
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setRequestInterception(true)
    p.on("request", (r) => {
      const u = r.url()
      if (u.startsWith("data:")) return r.continue()
      if (u.startsWith("http://probe.test/__file")) return r.respond({ status: 200, contentType: "font/woff2", body: readFileSync(decodeURIComponent(u.slice("http://probe.test/__file".length))) })
      if (!u.startsWith("http://probe.test/app") && u.startsWith("http://probe.test/")) return r.respond({ status: 404, contentType: "application/json", body: "{}" })
      if (u.startsWith("http://probe.test/")) return r.respond({ status: 200, contentType: "text/html", body: html })
      if (u.startsWith("file:")) return r.continue()
      r.abort()
    })
    await p.setViewport({ width, height: phone ? 844 : 900, isMobile: phone, hasTouch: phone, deviceScaleFactor: 2 })
    const cdp = await p.createCDPSession()
    await p.goto("http://probe.test/app/products")
    await sleep(1400)

    console.log(`\n${phone ? "phone" : "computer"} ${width}`)
    for (const rate of [1, 4]) {
      const runs = []
      for (let i = 0; i < 5; i++) runs.push(await press(p, cdp, { rate, slowMs: 0 }))
      const pick = (k) => runs.map((r) => r[k]).filter((n) => n !== null).sort((a, b) => a - b)[Math.floor(runs.length / 2)]
      console.log(
        `  CPU ${rate}x   first frame ${String(pick("firstFrame")).padStart(4)}ms   fields filled ${String(pick("filled")).padStart(4)}ms   interactive ${String(pick("interactive")).padStart(4)}ms   longest task ${String(pick("longest")).padStart(4)}ms`,
      )
      console.log(`             runs: ${runs.map((r) => `${r.firstFrame}/${r.filled}/${r.interactive}`).join("  ")}`)
    }
    if (errors.length) console.error(`  threw: ${errors[0]}`)
    await p.close()
  }
} finally {
  await browser.close()
}
