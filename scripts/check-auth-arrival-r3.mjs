/**
 * ===========================================================================
 *  LOG IN, SIGN UP AND SELL ON STORELIB, FRAME BY FRAME
 * ===========================================================================
 * The owner: pressing Sell on Storelib, Log in or Sign up while signed out
 * must open the page cleanly. No grey screen, no spinner, no fade, nothing
 * that moves once it is drawn, and the photo on the right fetched with the
 * page instead of after it.
 *
 * Every animation frame from the press to the settled page is sampled in the
 * page itself (requestAnimationFrame, about 16ms apart) and named:
 *
 *   old      the page the link was pressed on
 *   blank    a white or grey screen with nothing on it but a spinner
 *   entering the form drawn but still fading or sliding in
 *   form     the form, at full opacity, where it stays
 *
 * and the heading's position is kept for every frame after it first shows,
 * so a jump is a number, not an impression. A screencast frame is saved for
 * every frame too (OUT=dir), for looking at.
 *
 * Then each page is opened cold (a typed address, a link from an email) and
 * the same states are read from the first frame the document draws, with the
 * largest contentful paint, the layout shift total and when the photo was
 * asked for and drawn.
 *
 * The photo itself lives on storelib.com/media, which this sandbox cannot
 * reach, so a stand-in of the same shape is answered after IMAGE_MS (150ms by
 * default) for every /_next/image request: the timing measured is ours, not
 * the network's.
 *
 *   pnpm build && pnpm exec next start -p 3471 &
 *   BASE=http://localhost:3471 node scripts/check-auth-arrival-r3.mjs
 *
 * Exits 1 when a press shows a blank or entering frame, when anything moves
 * after it is drawn, when a cold page's first frame is a spinner, or when the
 * photo is asked for later than the document's own first paint.
 */
import puppeteer from "puppeteer-core"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = (process.env.BASE ?? "http://localhost:3000").replace(/\/$/, "")
const OUT = process.env.OUT ?? null
const IMAGE_MS = Number(process.env.IMAGE_MS ?? 150)
const ONLY = process.env.ONLY ?? null
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SAMPLER = `(() => {
  if (window.__arrival) return
  const samples = []
  window.__arrival = samples
  const t0 = performance.now()
  const visible = (el) => {
    if (!el) return false
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return false
    let n = el
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return false
      n = n.parentElement
    }
    return true
  }
  const opacityChain = (el) => {
    let o = 1, n = el
    while (n && n.nodeType === 1) { o *= Number(getComputedStyle(n).opacity); n = n.parentElement }
    return Math.round(o * 1000) / 1000
  }
  const tick = () => {
    const form = document.querySelector('[data-page="login"],[data-page="signup"]')
    const h1 = form && form.querySelector("h1")
    const spinner = [...document.querySelectorAll(".animate-spin,.auth-spinner")].find((s) => {
      const r = s.getBoundingClientRect()
      return r.width >= 24 && r.width <= 48 && visible(s) && Math.abs(r.left + r.width / 2 - innerWidth / 2) < 40
    })
    const card = form && (form.querySelector(".auth-card") || h1)
    const photo = form && form.querySelector("[data-auth-photo] img, .lg\\\\:block img")
    const dialog = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].find(visible)
    let state
    if (form && h1 && visible(h1)) {
      const cs = card ? getComputedStyle(card) : null
      const moving = cs && cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)"
      state = opacityChain(h1) < 0.999 || moving ? "entering" : "form"
    } else if (spinner) state = "blank"
    else if (location.pathname === window.__arrivalFrom) state = "old"
    else state = "blank"
    const hr = h1 ? h1.getBoundingClientRect() : null
    samples.push({
      t: Math.round(performance.now() - t0),
      path: location.pathname,
      state,
      spinner: !!spinner,
      dialog: dialog ? (dialog.getAttribute("aria-label") || dialog.textContent.slice(0, 30)) : null,
      h1: hr ? { x: Math.round(hr.x * 10) / 10, y: Math.round(hr.y * 10) / 10, text: h1.textContent.trim() } : null,
      opacity: h1 ? opacityChain(h1) : null,
      photo: photo ? { drawn: photo.complete && photo.naturalWidth > 0, opacity: opacityChain(photo) } : null,
      bg: getComputedStyle(document.body).backgroundColor,
    })
    if (samples.length < 2000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

let standIn = null
async function makeStandIn(browser) {
  const p = await browser.newPage()
  const data = await p.evaluate(() => {
    const c = document.createElement("canvas")
    c.width = 960; c.height = 1080
    const g = c.getContext("2d")
    const grad = g.createLinearGradient(0, 0, 960, 1080)
    grad.addColorStop(0, "#3b3b46"); grad.addColorStop(1, "#c9b8a6")
    g.fillStyle = grad; g.fillRect(0, 0, 960, 1080)
    for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${i * 37 % 360} 40% ${30 + i % 50}%)`; g.fillRect((i * 97) % 960, (i * 61) % 1080, 40, 40) }
    return c.toDataURL("image/jpeg", 0.8).split(",")[1]
  })
  await p.close()
  standIn = Buffer.from(data, "base64")
}

async function preparePage(browser, { w, h, phone }) {
  const page = await browser.newPage()
  await page.setViewport({ width: w, height: h, isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 })
  if (phone) {
    const cdp = await page.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  }
  await page.setRequestInterception(true)
  const images = []
  page.on("request", (req) => {
    const url = req.url()
    if (url.includes("/_next/image") && url.includes("collage")) {
      images.push({ url, at: Date.now() })
      setTimeout(() => req.respond({ status: 200, contentType: "image/jpeg", body: standIn, headers: { "cache-control": "no-store" } }).catch(() => {}), IMAGE_MS)
      return
    }
    if (/^https?:\/\/(?!localhost|127\.0\.0\.1)/.test(url)) return void req.respond({ status: 204, body: "" }).catch(() => {})
    req.continue().catch(() => {})
  })
  return { page, images }
}

async function film(page, out) {
  if (!out) return { stop: async () => 0 }
  mkdirSync(out, { recursive: true })
  const cdp = await page.createCDPSession()
  let n = 0
  cdp.on("Page.screencastFrame", async (f) => {
    n++
    writeFileSync(join(out, `${String(n).padStart(3, "0")}-${Math.round(f.metadata.timestamp * 1000) % 100000}.jpg`), Buffer.from(f.data, "base64"))
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
  return { stop: async () => { await cdp.send("Page.stopScreencast").catch(() => {}); return n } }
}

function summarise(samples, from) {
  const seq = []
  for (const s of samples) if (!seq.length || seq[seq.length - 1].state !== s.state) seq.push({ state: s.state, t: s.t })
  const start = samples.findIndex((s) => s.state !== "old")
  const after = start < 0 ? [] : samples.slice(start)
  const firstForm = after.find((s) => s.state === "form" || s.state === "entering")
  const settled = [...after].reverse().find((s, i, a) => s.state !== "form" || (a[i + 1] && a[i + 1].state !== "form"))
  let jump = 0
  let firstH1 = null
  for (const s of after) {
    if (!s.h1) continue
    if (!firstH1) { firstH1 = s.h1; continue }
    if (s.h1.text !== firstH1.text) jump = Math.max(jump, 999)
    jump = Math.max(jump, Math.abs(s.h1.x - firstH1.x), Math.abs(s.h1.y - firstH1.y))
  }
  const blankFrames = after.filter((s) => s.state === "blank").length
  const enteringFrames = after.filter((s) => s.state === "entering").length
  const dialogs = [...new Set(after.map((s) => s.dialog).filter(Boolean))]
  const photoDrawn = after.find((s) => s.photo && s.photo.drawn && s.photo.opacity > 0.99)
  const t0 = after[0]?.t ?? 0
  return {
    sequence: seq.filter((x, i) => i === 0 || x.state !== "old").map((x) => `${x.state}@${x.t - t0}`).join(" > "),
    blankFrames,
    enteringFrames,
    firstFormMs: firstForm ? firstForm.t - t0 : null,
    settledMs: settled ? settled.t - t0 : null,
    jumpPx: Math.round(jump * 10) / 10,
    photoMs: photoDrawn ? photoDrawn.t - t0 : null,
    dialogs,
    bgs: [...new Set(after.map((s) => s.bg))].join(" | "),
    from,
  }
}

const VIEWS = [
  { name: "desktop", w: 1440, h: 900, phone: false },
  { name: "phone", w: 390, h: 844, phone: true },
]
const PRESSES = [
  { name: "sell", desktop: "[data-guest-sell]", phone: "[data-menu-sell]" },
  { name: "login", desktop: "[data-guest-login]", phone: "[data-menu-log-in]" },
  { name: "signup", desktop: "[data-guest-signup]", phone: "[data-menu-sign-up]" },
]
const FROM = ["/", "/pricing"]

const failures = []
const results = []

async function press(browser, view, from, which) {
  const { page, images } = await preparePage(browser, view)
  await page.goto(BASE + from, { waitUntil: "networkidle2", timeout: 60000 })
  await sleep(600)
  if (view.phone) {
    /* The phone's menu: the button at the bar's right end, then the sheet's row. */
    const opened = await page.evaluate(() => {
      const b = [...document.querySelectorAll("header button[aria-label]")].find((x) => /menu/i.test(x.getAttribute("aria-label")) && x.getBoundingClientRect().width > 0)
      if (!b) return false
      b.click()
      return true
    })
    if (!opened) { failures.push(`${view.name} ${from}: no menu button`); await page.close(); return }
    await sleep(900)
  }
  const sel = view.phone ? which.phone : which.desktop
  const handle = await page.$(sel)
  if (!handle) { failures.push(`${view.name} ${from} ${which.name}: no ${sel}`); await page.close(); return }
  await page.evaluate((from) => { window.__arrivalFrom = from }, from)
  await page.evaluate(SAMPLER)
  const out = OUT ? join(OUT, `press-${view.name}-${from === "/" ? "home" : from.slice(1)}-${which.name}`) : null
  const cam = await film(page, out)
  const pressedAt = Date.now()
  await handle.click()
  const deadline = Date.now() + 9000
  for (;;) {
    await sleep(100)
    const s = await page.evaluate(() => (window.__arrival || []).slice(-40)).catch(() => null)
    if (!s) break
    const lastForm = s.length > 30 && s.every((x) => x.state === "form")
    const photoOk = view.phone || s.some((x) => x.photo && x.photo.drawn && x.photo.opacity > 0.99)
    if ((lastForm && photoOk) || Date.now() > deadline) break
  }
  await sleep(300)
  const samples = await page.evaluate(() => window.__arrival || []).catch(() => [])
  const frames = await cam.stop()
  const sum = summarise(samples, from)
  const photoAskedMs = images.length ? images[0].at - pressedAt : null
  const row = { kind: "press", view: view.name, from, link: which.name, frames, photoAskedMs, landed: samples.at(-1)?.path, ...sum }
  results.push(row)
  if (sum.blankFrames) failures.push(`${view.name} ${from} ${which.name}: ${sum.blankFrames} blank/spinner frame(s) (${sum.sequence})`)
  if (sum.enteringFrames) failures.push(`${view.name} ${from} ${which.name}: ${sum.enteringFrames} frame(s) of the form fading or sliding in`)
  if (sum.jumpPx > 1) failures.push(`${view.name} ${from} ${which.name}: the heading moved ${sum.jumpPx}px after it was drawn`)
  if (sum.dialogs.length) failures.push(`${view.name} ${from} ${which.name}: a dialog showed (${sum.dialogs.join(", ")})`)
  await page.close()
}

async function cold(browser, view, path) {
  const { page, images } = await preparePage(browser, view)
  await page.evaluateOnNewDocument(`window.__arrivalFrom = "__none__";
    window.__lcp = 0; window.__cls = 0;
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime) }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true });
    } catch {}
    document.addEventListener("readystatechange", () => {}, { once: true });
    ${SAMPLER}`)
  const out = OUT ? join(OUT, `cold-${view.name}-${path.slice(1).replace(/[^a-z]/g, "-")}`) : null
  const cam = await film(page, out)
  const navAt = Date.now()
  await page.goto(BASE + path, { waitUntil: "load", timeout: 60000 })
  await sleep(2500)
  const samples = await page.evaluate(() => window.__arrival || [])
  const timing = await page.evaluate(() => {
    const fp = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint")
    const img = performance.getEntriesByType("resource").find((e) => e.name.includes("/_next/image") && e.name.includes("collage"))
    return { lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 10000) / 10000, fcp: fp ? Math.round(fp.startTime) : null, imgStart: img ? Math.round(img.startTime) : null, imgEnd: img ? Math.round(img.responseEnd) : null }
  })
  const frames = await cam.stop()
  const sum = summarise(samples, "__none__")
  const row = { kind: "cold", view: view.name, path, frames, ...timing, photoRequests: images.length, ...sum }
  results.push(row)
  const first = samples.find((s) => s.state !== "old")
  if (first && first.state !== "form") failures.push(`cold ${view.name} ${path}: the first drawn frame is "${first.state}" (${sum.sequence})`)
  if (sum.jumpPx > 1) failures.push(`cold ${view.name} ${path}: the heading moved ${sum.jumpPx}px`)
  if (timing.cls > 0.01) failures.push(`cold ${view.name} ${path}: layout shift ${timing.cls}`)
  if (!view.phone && timing.imgStart != null && timing.fcp != null && timing.imgStart > timing.fcp) failures.push(`cold ${view.name} ${path}: the photo was asked for at ${timing.imgStart}ms, after the first paint at ${timing.fcp}ms`)
  if (view.phone && images.length) failures.push(`cold ${view.name} ${path}: a phone fetched the photo it never shows (${images.length} request(s))`)
  await page.close()
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"] })
try {
  await makeStandIn(browser)
  for (const view of VIEWS) {
    for (const from of FROM) for (const which of PRESSES) {
      if (ONLY && !`${view.name} ${from} ${which.name}`.includes(ONLY)) continue
      await press(browser, view, from, which)
    }
    for (const path of ["/login", "/signup", "/signup?intent=sell"]) {
      if (ONLY && !`cold ${view.name} ${path}`.includes(ONLY)) continue
      await cold(browser, view, path)
    }
  }
} finally {
  await browser.close()
}

for (const r of results) {
  if (r.kind === "press") console.log(`press ${r.view.padEnd(7)} ${r.from.padEnd(8)} ${r.link.padEnd(6)} -> ${String(r.landed).padEnd(8)} ${r.sequence} | blank ${r.blankFrames} entering ${r.enteringFrames} jump ${r.jumpPx}px form ${r.firstFormMs}ms settled ${r.settledMs}ms photo asked ${r.photoAskedMs}ms drawn ${r.photoMs}ms | frames ${r.frames}`)
  else console.log(`cold  ${r.view.padEnd(7)} ${r.path.padEnd(20)} ${r.sequence} | fcp ${r.fcp} lcp ${r.lcp} cls ${r.cls} photo ${r.imgStart}-${r.imgEnd}ms (${r.photoRequests} req) jump ${r.jumpPx}px | frames ${r.frames}`)
}
if (OUT) writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2))
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n  ${failures.join("\n  ")}`)
  process.exit(1)
}
console.log("\nEvery press and every cold open drew the form whole on its first frame.")
