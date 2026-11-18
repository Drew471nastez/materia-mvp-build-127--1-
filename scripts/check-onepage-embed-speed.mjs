/**
 * A TAP TO THE EMBED ON SCREEN, MEASURED (round AS).
 *
 * The owner: "Opening a sheet (the Spotify block) shows the sheet, but the
 * embed inside appears with a delay." The real BlockSheetProvider and the
 * real blocks (scripts/render-onepage-embed-speed.tsx): a Spotify link
 * button, Spotify, SoundCloud and Apple Music blocks, YouTube and TikTok
 * videos, a map and an X post, on a phone (390x844, touch) and a computer
 * (1440x900, mouse).
 *
 * Every service's document is answered here after LATENCY ms (a fixed
 * stand-in for the network, the same before and after, so what is measured
 * is what the page itself adds). For each block, from the press:
 *
 *   frame      when its iframe is in the sheet
 *   request    when the iframe's document is asked for
 *   visible    when the iframe has loaded, is drawn at full opacity with
 *              everything around it, and is on screen
 *   jump       how far the embed's box moved or changed height between the
 *              first frame it was drawn and the moment it was visible
 *   reopen     the same tap again after Close: how long until it is visible,
 *              and whether its document was asked for a second time
 *
 * It fails when an embed is visible later than the sheet's own rise plus the
 * stand-in latency and a frame or two (BUDGET_MS), when its box jumps, or
 * when a reopen asks for the document again.
 *
 *   CHROMIUM=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome node scripts/check-onepage-embed-speed.mjs
 *   REPORT=1 prints the numbers without failing. ONLY=spotify,map runs a few.
 */
import puppeteer from "puppeteer-core"
import { existsSync } from "node:fs"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const report = !!process.env.REPORT
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const chromium = process.env.CHROMIUM || ["/opt/pw-browsers/chromium-1243/chrome-linux64/chrome", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/tmp/chromium"].find((p) => existsSync(p))
const LATENCY = 250
/* How long a mouse rests on the button before it is pressed; the time is counted from the press. */
const HOVER_MS = 200
/* The rise is 300ms; the document arrives LATENCY after it is asked for; two frames to draw it. */
const BUDGET_MS = 300 + LATENCY + 80
const { base, server } = await serveEditorProbe({ entry: "scripts/render-onepage-embed-speed.tsx" })
const browser = await puppeteer.launch({ executablePath: chromium, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const failures = []
const check = (ok, message) => {
  if (!ok) failures.push(message)
  console.log(`${ok ? "ok  " : "FAIL"} ${message}`)
}

/* What each service's document is in this probe: an empty page of its colour, and X saying its height as X does. */
const doc = (u) => {
  if (u.hostname === "platform.twitter.com")
    return `<!doctype html><style>html,body{margin:0;background:transparent}div{height:560px;border-radius:12px;background:#fff;border:1px solid #cfd9de}</style><div></div><script>parent.postMessage({"twttr.embed":{method:"twttr.private.resize",params:[{height:560,width:550}]}},"*")</script>`
  return `<!doctype html><body style="margin:0;background:#181818;color:#fff;font:14px sans-serif">${u.hostname}</body>`
}

const TARGETS = [
  ["spotify-link", "[data-probe-open='spotify-link']"],
  ["spotify", "[data-probe='spotify'] [data-block-sheet-trigger]"],
  ["soundcloud", "[data-probe='soundcloud'] [data-block-sheet-trigger]"],
  ["apple", "[data-probe='apple'] button, [data-probe='apple'] [role=button], [data-probe='apple'] a"],
  ["youtube", "[data-probe='youtube'] [data-block-sheet-trigger]"],
  ["tiktok", "[data-probe='tiktok'] [data-block-sheet-trigger]"],
  ["map", "[data-probe='map'] [data-block-sheet-trigger]"],
  ["x", "[data-probe='x'] [data-block-sheet-trigger]"],
].filter(([name]) => !only.length || only.includes(name))

/* Watches the sheet from the press: the frame, its load, its opacity with every ancestor's, its box. */
const WATCH = `(() => {
  const w = { t0: performance.now(), frame: null, load: null, visible: null, first: null, last: null, kept: false }
  /* A frame already in the page before the press (a kept sheet's) loaded long ago: no load is heard again. */
  const before = new Set(document.querySelectorAll("iframe"))
  window.__embedWatch = w
  const opacityUp = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || "1"); return o }
  document.addEventListener("load", (e) => { if (e.target && e.target.tagName === "IFRAME" && e.target.closest("[data-block-sheet-body]") && w.load === null) w.load = performance.now() - w.t0 }, true)
  const tick = () => {
    const f = document.querySelector("[data-block-sheet-open] [data-block-sheet-body] iframe")
    const t = performance.now() - w.t0
    if (f) {
      if (w.frame === null) w.frame = t
      if (before.has(f) && w.load === null && f.closest("[data-embed-shown]")) { w.load = t; w.kept = true }
      const r = f.getBoundingClientRect()
      const panel = document.querySelector("[data-block-sheet-panel]")
      const pr = panel && panel.getBoundingClientRect()
      const sc = panel ? parseFloat(getComputedStyle(panel).scale) || 1 : 1
      /* In the sheet's own units (its rise scales it) and from its top (its rise moves it): only a change inside the sheet is a jump. */
      const box = { top: Math.round(r.top), h: f.offsetHeight, w: f.offsetWidth, rel: pr ? Math.round((r.top - pr.top) / sc) : Math.round(r.top) }
      if (r.height > 0 && w.first === null) w.first = box
      if (w.load !== null && w.visible === null && opacityUp(f) > 0.98 && r.bottom > 0 && r.top < innerHeight && r.height > 20) { w.visible = t; w.last = box }
    }
    if (w.visible === null && t < 6000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})()`

async function setup(page, { width, height, touch }) {
  await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch })
  await page.setRequestInterception(true)
  const asked = []
  page.on("request", (r) => {
    const u = new URL(r.url())
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return void r.continue()
    if (r.resourceType() === "document") {
      asked.push({ host: u.hostname, at: Date.now() })
      return void setTimeout(() => r.respond({ status: 200, contentType: "text/html", body: doc(u) }).catch(() => {}), LATENCY)
    }
    return void r.respond({ status: 204, body: "" }).catch(() => {})
  })
  await page.goto(base + "/app/onepage", { waitUntil: "domcontentloaded" })
  await page.waitForSelector("[data-probe-open='spotify-link']")
  await sleep(500)
  return asked
}

async function press(page, selector, touch) {
  const el = await page.$(selector)
  if (!el) return false
  await el.scrollIntoView()
  await sleep(120)
  const box = await el.boundingBox()
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.evaluate(WATCH)
  if (touch) {
    await page.touchscreen.touchStart(x, y)
    await sleep(70)
    await page.touchscreen.touchEnd()
  } else {
    /* A mouse comes to rest on the button before it presses: HOVER_MS, as a person's does. */
    await page.mouse.move(x - 40, y)
    await page.mouse.move(x, y, { steps: 4 })
    await sleep(HOVER_MS)
    await page.evaluate("window.__embedWatch.t0 = performance.now()")
    await page.mouse.down()
    await sleep(70)
    await page.mouse.up()
  }
  return true
}

async function waitVisible(page) {
  const until = Date.now() + 6000
  while (Date.now() < until) {
    const w = await page.evaluate(() => window.__embedWatch)
    if (w.visible !== null) return w
    await sleep(50)
  }
  return page.evaluate(() => window.__embedWatch)
}

async function closeSheet(page) {
  await page.keyboard.press("Escape")
  await page.waitForFunction(() => !document.querySelector("[data-block-sheet-open]"), { timeout: 3000 }).catch(() => {})
  await sleep(450)
}

const rows = []
for (const [label, viewport] of [["phone", { width: 390, height: 844, touch: true }], ["computer", { width: 1440, height: 900, touch: false }]]) {
  const page = await browser.newPage()
  const asked = await setup(page, viewport)
  for (const [name, selector] of TARGETS) {
    const before = asked.length
    if (!(await press(page, selector, viewport.touch))) {
      check(false, `${label} ${name}: no trigger`)
      continue
    }
    const first = await waitVisible(page)
    const askedFirst = asked.length - before
    await closeSheet(page)
    const mid = asked.length
    await press(page, selector, viewport.touch)
    const again = await waitVisible(page)
    const askedAgain = asked.length - mid
    await closeSheet(page)
    const jump = first.first && first.last ? Math.max(Math.abs(first.first.h - first.last.h), Math.abs(first.first.rel - first.last.rel)) : null
    const row = { at: label, block: name, frame: r(first.frame), load: r(first.load), visible: r(first.visible), jump, reopen: r(again.visible), kept: again.kept, reasked: askedAgain, asked: askedFirst }
    rows.push(row)
    console.log(JSON.stringify(row))
    check(first.visible !== null && first.visible <= BUDGET_MS, `${label} ${name}: visible ${r(first.visible)}ms after the press (budget ${BUDGET_MS})`)
    /* An X post's height is X's to say, on its first visit to this browser (then remembered): its frame is hidden while it does. */
    if (name !== "x") check(jump !== null && jump <= 2, `${label} ${name}: the embed's box does not jump (${jump}px)`)
    /* Apple Music's player takes no pause, so its sheet is not kept (lib/onepage/embed-warm keepableFrame): it loads again. */
    if (name !== "apple") check(again.visible !== null && again.visible <= 360 && askedAgain === 0, `${label} ${name}: on a reopen, visible in ${r(again.visible)}ms, asked again ${askedAgain} times`)
  }
  await page.close()
}

function r(n) {
  return n === null || n === undefined ? null : Math.round(n)
}

const med = (xs) => {
  const s = xs.filter((x) => x !== null).sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : null
}
console.log(`\nmedian visible ${med(rows.map((x) => x.visible))}ms, median reopen ${med(rows.map((x) => x.reopen))}ms, documents asked again on reopen ${rows.reduce((a, x) => a + x.reasked, 0)}`)

await browser.close()
server.close()
if (failures.length && !report) {
  console.log(`\n${failures.length} failed`)
  process.exit(1)
}
console.log(failures.length ? `\n${failures.length} over (REPORT)` : "\nall passed")
