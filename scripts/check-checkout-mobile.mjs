/**
 * ===========================================================================
 *  A TAP ON BUY, ON A PHONE: HOW THE CHECKOUT ARRIVES, MOVES AND LEAVES
 * ===========================================================================
 * The owner, on a phone and in the iOS app: "make sure the checkout that a
 * tap turns into is a more smooth and clean feeling, smoother, higher fps,
 * not laggy". Every way a tap becomes a checkout, drawn by
 * scripts/render-checkout-mobile.tsx at 390 by 844 with touch and the CPU
 * four times slower, tapped with real touch events:
 *
 *   instant   a OnePage product block that opens the checkout window at once
 *   sheet     a OnePage product block that opens its sheet, then Buy in it
 *   buy       the product page's Buy button (the marketplace and a creator's
 *             store reach the same page), which goes to /checkout; the page
 *             itself is measured by check-checkout-arrival, -motion and -speed
 *
 * For each, from the finger going down:
 *
 *   response   the first frame anything answers the tap (the button pressed,
 *              or the window drawn)
 *   in         the window at rest: its top at 0 and fully opaque
 *   motion     what the window's opening animates (transform and opacity
 *              only, so the compositor plays it while the page is busy), and
 *              its length
 *   content    the fields drawn (a frame into the rise, from the facts the
 *              page already read), and how many
 *              times the facts were asked for after the tap (0 when the read
 *              made before the tap is used)
 *   blank      frames with the window up and nothing in its body
 *   jump       how far Powered by Stripe, at the foot of the body, moves once
 *              the window is in (the skeleton giving way to the fields)
 *   frames     main thread frames longer than 50ms, and the longest, during
 *              the first 1.5s; long tasks in that time
 *   page       the page behind: scrollY and width the same before, during and
 *              after; <html> held while the window is up
 *   field      a tap in Email: the page behind does not scroll, and the
 *              field is in view inside the window
 *   close      the X: the frames the window takes to go, and whether it
 *              slides (moves down) or only fades
 *   reduced    with prefers-reduced-motion the window is at rest on its
 *              first frame
 *
 *   node scripts/check-checkout-mobile.mjs
 *   LAG=400      ms the product's facts take to arrive (default 300)
 *   REPORT=1     print the numbers without failing (to measure an older version)
 *   ONLY=instant one path
 */
import { existsSync } from "node:fs"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => {
  console.error(`\n${m}\n`)
  process.exit(1)
}
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const LAG = Number(process.env.LAG || 300)
let lag = LAG
const report = !!process.env.REPORT
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let factsReads = 0
const productId = "11111111-1111-4111-8111-111111111111"
const facts = (paid) => ({
  product: {
    id: productId, title: "Gym Starter Guide", slug: "gym-guide", type: "digital", descriptionHtml: "<p>A complete guide, with clear steps.</p>",
    priceCents: paid ? 2500 : 0, compareAtCents: null, pwyw: false, pwywMinCents: 0, currency: "USD", images: [],
    variants: [{ id: "22222222-2222-4222-8222-222222222222", name: "Standard", description: null, priceCents: paid ? 2500 : 0, pwyw: false, available: true, imageUrl: null }],
    soldOut: false, left: null, pageUrl: "/p/gym-guide", ships: false,
  },
  seller: { name: "Creator account", avatarUrl: null },
  checkout: { instant: true, reason: null, url: `/checkout?productId=${productId}`, tax: null, marketingOptIn: false, lastNameRequired: false },
  buyer: null,
})

const { base, server } = await serveEditorProbe({
  entry: "scripts/render-checkout-mobile.tsx",
  fail,
  api: (req) => {
    if (!req.url.startsWith("/api/onepage/product?")) return null
    factsReads++
    return { body: facts(!(req.headers.referer || "").includes("price=free")) }
  },
})
/* The facts take a phone's round trip: the api answer is held for LAG ms. */
const realEmit = server.emit.bind(server)
server.emit = (ev, req, res, ...rest) => {
  if (ev === "request" && req.url.startsWith("/api/onepage/product?")) {
    setTimeout(() => realEmit(ev, req, res, ...rest), lag)
    return true
  }
  return realEmit(ev, req, res, ...rest)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"] })
console.log(`load average ${(await import("node:os")).loadavg().map((x) => x.toFixed(1)).join(" ")}, facts lag ${LAG}ms`)

let failed = 0
const expect = (ok, name, detail) => {
  if (!ok) failed++
  console.log(`  ${ok ? "ok  " : report ? "note" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
}

/* In the page: every frame from now, what the tap's button, the window and the page behind look like. */
const RECORD = (ms) => {
  const frames = (window.__frames = [])
  window.__longtasks = []
  window.__shifts = []
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longtasks.push({ t: e.startTime, d: e.duration }))).observe({ type: "longtask" })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__shifts.push({ t: e.startTime, v: e.value, input: e.hadRecentInput }))).observe({ type: "layout-shift" })
  } catch {}
  const look = (el) => {
    if (!el) return null
    const s = getComputedStyle(el)
    /* What shows: `scale: 1` and `none` are the same picture. */
    const sc = s.scale === "1" ? "none" : s.scale
    const btn = el.querySelector(".op-btn")
    const inner = btn ? getComputedStyle(btn).scale.replace(/^1$/, "none") : ""
    return `${s.transform}|${sc}|${inner}|${s.translate}|${s.opacity}|${s.backgroundColor}|${s.filter}|${el.textContent.trim().slice(0, 30)}`
  }
  const t0 = performance.now()
  const tick = () => {
    const layer = document.querySelector("[data-instant-checkout]")
    const panel = layer?.querySelector("[role=dialog]")
    const r = panel?.getBoundingClientRect()
    const foot = panel?.querySelector("[data-powered-by]")
    /* The product sheet a Buy in it leaves: its first frame of moving is an answer to the tap too. */
    const sheet = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    frames.push({
      t: performance.now(),
      cta: `${look(window.__cta && window.__cta.isConnected ? window.__cta : null)}|${sheet ? Math.round(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42) : "-"}`,
      panel: panel ? { top: r.top, op: Number(getComputedStyle(panel).opacity) } : null,
      skeleton: !!panel?.querySelector("[data-instant-skeleton], .space-y-3[aria-hidden]"),
      content: !!panel?.querySelector("[data-instant-email], [data-checkout-unavailable], [data-checkout-done]"),
      foot: foot ? foot.getBoundingClientRect().top : null,
      y: scrollY,
      w: document.documentElement.clientWidth,
      held: document.documentElement.style.overflow === "hidden",
    })
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  return t0
}

async function tap(cdp, page, selector) {
  const box = await page.evaluate((sel) => {
    const el = typeof sel === "string" ? document.querySelector(sel) : null
    if (!el) return null
    window.__cta = el
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, selector)
  if (!box) return null
  const down = await page.evaluate(() => performance.now())
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y }] })
  await sleep(70)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  return down
}

async function openPage(path, price, { reduced = false, cold = false } = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const cdp = await page.target().createCDPSession()
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await page.evaluateOnNewDocument(() => {
    window.Stripe = () => ({
      _registerWrapper() {}, registerAppInfo() {}, createToken: async () => ({}),
      createPaymentMethod: async () => ({}), confirmCardPayment: async () => ({}),
      paymentRequest: () => ({ canMakePayment: async () => null, on() {}, off() {}, update() {} }),
      elements: () => ({ create: () => ({ mount() {}, on() {}, off() {}, destroy() {}, update() {} }), getElement: () => null, update() {} }),
    })
    window.__haptics = 0
    const vib = navigator.vibrate?.bind(navigator)
    navigator.vibrate = (...a) => { window.__haptics++; return vib ? vib(...a) : true }
  })
  await page.setRequestInterception(true)
  page.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e)))
  await page.goto(`${base}/app/probe?path=${path}&price=${price}`, { waitUntil: "load" })
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2000))]))
  /* A visitor reads before tapping: the block's warm read and the window's file have their idle moment. Cold: a tap
     before the block has read anything (its read is held back), so the window has to wait for the facts. */
  await sleep(cold ? 250 : 1800)
  await page.evaluate(() => window.scrollTo(0, 40))
  await sleep(200)
  return { page, cdp, errors }
}

async function findCta(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll("a,button")].find((e) => /View guide|I want this|Get for Free/.test(e.textContent))
    if (!el) return null
    el.setAttribute("data-probe-cta", "")
    return "[data-probe-cta]"
  })
}

function summarise(frames, down, longtasks, shifts) {
  const after = frames.filter((f) => f.t >= down)
  const base0 = frames[0]
  const response = after.find((f) => (f.cta !== null && f.cta !== base0.cta) || (f.panel && f.panel.op > 0.02 && f.panel.top < 844))
  const first = after.find((f) => f.panel)
  let inAt = null
  for (let i = 0; i < after.length; i++) {
    const f = after[i]
    if (f.panel && Math.abs(f.panel.top) < 0.5 && f.panel.op > 0.99) {
      if (inAt === null) inAt = f
    } else if (f.panel) inAt = null
  }
  const content = after.find((f) => f.content)
  const blank = after.filter((f) => f.panel && f.panel.op > 0.02 && !f.skeleton && !f.content).length
  let jump = 0
  if (inAt) {
    const rest = after.filter((f) => f.t >= inAt.t && f.foot !== null)
    for (let i = 1; i < rest.length; i++) jump += Math.abs(rest[i].foot - rest[i - 1].foot)
  }
  const window15 = after.filter((f) => f.t <= down + 1500)
  const gaps = window15.slice(1).map((f, i) => f.t - window15[i].t)
  const lt = longtasks.filter((x) => x.t >= down - 5 && x.t <= down + 1500)
  const ys = new Set(after.map((f) => Math.round(f.y)))
  const ws = new Set(after.map((f) => f.w))
  return {
    responseWhat: response ? (response.panel && response.panel.op > 0.02 ? "window" : `${base0.cta} -> ${response.cta}`) : null,
    responseMs: response ? Math.round(response.t - down) : null,
    windowMs: first ? Math.round(first.t - down) : null,
    inMs: inAt ? Math.round(inAt.t - down) : null,
    contentMs: content ? Math.round(content.t - down) : null,
    blankFrames: blank,
    footJumpPx: Math.round(jump),
    slowFrames: gaps.filter((g) => g > 50).length,
    longestFrameMs: Math.round(Math.max(0, ...gaps)),
    longTasks: lt.length,
    longTaskMs: Math.round(lt.reduce((a, x) => a + x.d, 0)),
    longestTaskMs: Math.round(Math.max(0, ...lt.map((x) => x.d))),
    cls: Math.round(shifts.filter((s) => !s.input).reduce((a, s) => a + s.v, 0) * 1000) / 1000,
    pageMoved: ys.size > 1 ? [...ys] : 0,
    widthChanged: ws.size > 1,
    held: after.some((f) => f.panel && f.held),
  }
}

/* What the window's opening animates, read from its running animations. */
const OPENING = () => {
  const panel = document.querySelector("[data-instant-checkout] [role=dialog]")
  if (!panel) return null
  const anims = panel.getAnimations()
  const props = new Set()
  let ms = 0
  let easing = ""
  for (const a of anims) {
    if (a.transitionProperty) continue
    const k = a.effect?.getKeyframes?.() || []
    k.forEach((f) => Object.keys(f).forEach((p) => !["offset", "easing", "composite", "computedOffset"].includes(p) && props.add(p)))
    const t = a.effect?.getComputedTiming?.()
    ms = Math.max(ms, Number(t?.duration) || 0)
    easing = a.effect?.getTiming?.().easing || easing
  }
  return { props: [...props].sort(), ms: Math.round(ms), easing }
}

/*
  THE PRESSED LOOK. A phone draws :active as the finger lands (iOS Safari does once the page listens for touches, as
  React does); headless Chromium's emulated touch only sets it with the click, so the look is read by forcing the
  state rather than from the frames: the button (or, in a product card, the card's button) gives under the finger.
*/
async function pressedLook(page, cdp, selector) {
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  const { root } = await cdp.send("DOM.getDocument", { depth: -1 })
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: root.nodeId, selector })
  if (!nodeId) return null
  const read = () => page.evaluate((sel) => {
    const el = document.querySelector(sel)
    const btn = el.querySelector(".op-btn") || el
    const s = getComputedStyle(btn)
    return { scale: s.scale, opacity: s.opacity, ms: s.transitionDuration }
  }, selector)
  const rest = await read()
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: ["active"] })
  await sleep(150)
  const pressed = await read()
  await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] })
  /* Back at rest before the frames are recorded, so the release is not read as the tap's answer. */
  await sleep(500)
  return { rest, pressed }
}
const pressedShows = (look) => !!look && (look.pressed.scale !== look.rest.scale || look.pressed.opacity !== look.rest.opacity)

const rows = []
async function runPath(path, price, cold = false) {
  const name = `${path}/${price}${cold ? "/cold" : ""}`
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) return
  console.log(`\n${name}`)
  lag = cold ? 3000 : LAG
  const { page, cdp, errors } = await openPage(path, price, { cold })
  const cta = await findCta(page)
  if (!cta) return expect(false, "found the button to tap")
  if (path === "sheet") {
    await tap(cdp, page, cta)
    await page.waitForSelector("[data-product-sheet-buy]", { visible: true, timeout: 8000 }).catch(() => null)
    await sleep(900)
  }
  const press = await pressedLook(page, cdp, path === "sheet" ? "[data-product-sheet-buy]" : cta)
  factsReads = 0
  const before = await page.evaluate(() => ({ y: scrollY, w: document.documentElement.clientWidth }))
  const target = path === "sheet" ? "[data-product-sheet-buy]" : cta
  await page.evaluate((sel) => { window.__cta = document.querySelector(sel) }, target)
  await page.evaluate(RECORD, 2600)
  const down = await tap(cdp, page, target)
  const opening = path === "buy" ? null : await page.waitForSelector("[data-instant-checkout] [role=dialog]", { timeout: 3000 }).then(() => page.evaluate(OPENING), () => null)
  await sleep(2600)
  const { frames, longtasks, shifts, haptics } = await page.evaluate(() => ({ frames: window.__frames, longtasks: window.__longtasks, shifts: window.__shifts, haptics: window.__haptics }))
  const s = summarise(frames, down, longtasks, shifts)
  const row = { name, ...s, motion: opening, factsReadsAfterTap: factsReads, haptics, pageY: before.y, press }

  if (path === "buy") {
    expect(pressedShows(press), "the button looks pressed under the finger", press)
    expect(s.responseMs !== null && s.responseMs <= 160, `the press answers within 160ms of the finger landing, 70ms of it the finger (${s.responseMs}ms)`, s)
    expect(haptics > 0, `a light tick on the press (${haptics})`)
    rows.push(row)
    await page.close()
    return
  }

  expect(pressedShows(press), "the button looks pressed under the finger", press)
  expect(s.responseMs !== null && s.responseMs <= 160, `something answers the tap within 160ms of the finger landing, 70ms of it the finger (${s.responseMs}ms)`)
  /* From the sheet, the window waits for the sheet to have gone (lib/onepage/purchase-flow), about 340ms more. */
  const restBy = path === "sheet" ? 1000 : 560
  expect(s.inMs !== null && s.inMs <= restBy, `the window is at rest within ${restBy}ms (${s.inMs}ms)`)
  expect(!!opening && opening.props.every((p) => ["transform", "opacity", "translate"].includes(p)) && opening.props.length > 0, `the opening animates only transform and opacity (${opening?.props})`)
  expect(!!opening && opening.ms >= 200 && opening.ms <= 320, `the opening lasts 200 to 320ms (${opening?.ms}ms, ${opening?.easing})`)
  /* The window draws from the read the page already made, a frame into its rise; a read it makes itself only refreshes them behind. */
  if (!cold) expect(s.contentMs !== null && s.contentMs - s.windowMs <= 120, `the fields are in within 120ms of the window, while it rises (${s.contentMs}ms, the window ${s.windowMs}ms; ${factsReads} read after the tap)`)
  if (path === "instant" && !cold) expect(factsReads === 0, `the read started as the finger went down is the window's own (${factsReads} more after the tap)`)
  expect(s.blankFrames === 0, `no frame shows the window with an empty body (${s.blankFrames})`)
  expect(s.footJumpPx <= 2, `the body's foot holds still as the fields arrive (${s.footJumpPx}px)`)
  expect(!s.pageMoved && !s.widthChanged, "the page behind keeps its place and width", { moved: s.pageMoved, width: s.widthChanged })
  expect(s.held, "the page behind is held while the window is up")
  expect(haptics > 0, `a light tick on the tap (${haptics})`)

  /* A tap in Email: the page behind stays put; the field is in view. */
  const field = await page.evaluate(() => {
    const el = document.querySelector("[data-instant-email]")
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  if (field) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [field] })
    await sleep(60)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(500)
    const typed = await page.evaluate(() => {
      const el = document.querySelector("[data-instant-email]")
      const r = el.getBoundingClientRect()
      return { focused: document.activeElement === el, y: scrollY, top: r.top, bottom: r.bottom, fontSize: parseFloat(getComputedStyle(el).fontSize) }
    })
    row.field = typed
    expect(typed.focused && typed.y === before.y, "a tap in Email focuses it and the page behind does not scroll", typed)
    expect(typed.fontSize >= 16, `Email is 16px, so iOS does not zoom on focus (${typed.fontSize}px)`)
    await page.evaluate(() => document.activeElement?.blur())
  }

  /* The X. */
  await page.evaluate(() => {
    const frames = (window.__close = [])
    const t0 = performance.now()
    const tick = () => {
      const panel = document.querySelector("[data-instant-checkout] [role=dialog]")
      frames.push({ t: performance.now(), top: panel ? panel.getBoundingClientRect().top : null, op: panel ? Number(getComputedStyle(panel).opacity) : null, y: scrollY })
      if (performance.now() - t0 < 1200) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const xDown = await tap(cdp, page, "[data-instant-checkout] [data-join-close]")
  await sleep(1300)
  const closing = await page.evaluate(() => window.__close)
  const gone = closing.find((f) => f.t >= xDown && f.top === null)
  const moving = closing.filter((f) => f.t >= xDown && f.top !== null)
  const maxDrop = Math.max(0, ...moving.map((f) => f.top))
  row.close = { goneMs: gone ? Math.round(gone.t - xDown) : null, dropPx: Math.round(maxDrop), frames: moving.length }
  const after = await page.evaluate(() => ({ y: scrollY, w: document.documentElement.clientWidth, held: document.documentElement.style.overflow === "hidden" }))
  expect(gone && gone.t - xDown <= 400, `the X closes it within 400ms (${row.close.goneMs}ms)`)
  expect(maxDrop >= 40, `it slides down as it goes (${row.close.dropPx}px)`)
  expect(after.y === before.y && after.w === before.w && !after.held, "the page behind is where it was, and let go", { before, after })
  expect(errors.length === 0, "no page errors", errors)
  rows.push(row)
  await page.close()
}

async function runReduced() {
  if (process.env.ONLY && !"reduced".startsWith(process.env.ONLY)) return
  console.log("\nreduced motion, instant/paid")
  const { page, cdp } = await openPage("instant", "paid", { reduced: true })
  const cta = await findCta(page)
  await page.evaluate(RECORD, 1200)
  const down = await tap(cdp, page, cta)
  await sleep(1300)
  const frames = await page.evaluate(() => window.__frames)
  const first = frames.find((f) => f.t >= down && f.panel)
  expect(!!first && Math.abs(first.panel.top) < 0.5 && first.panel.op > 0.99, "with reduced motion the window is at rest on its first frame", first?.panel)
  rows.push({ name: "reduced", firstFrame: first?.panel })
  await page.close()
}

try {
  for (const path of ["instant", "sheet", "buy"]) for (const price of ["paid", "free"]) await runPath(path, price)
  /* Tapped before the page has read the product, the facts a slow 3s away: the placeholder has to hold the form's shape. */
  for (const price of ["paid", "free"]) await runPath("instant", price, true)
  lag = LAG
  await runReduced()
} finally {
  await browser.close()
  server.close()
}

console.log("\n" + JSON.stringify(rows, null, 1))
console.log(`\n${failed ? `${failed} ${report ? "notes" : "failures"}` : "all good"}`)
process.exit(failed && !report ? 1 : 0)
