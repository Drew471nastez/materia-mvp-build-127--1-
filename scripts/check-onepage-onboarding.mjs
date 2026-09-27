/**
 * ===========================================================================
 *  THE ONEPAGE ONBOARDING, MEASURED: THE GOAL STEP, THE TEMPLATE STEP, SETUP
 * ===========================================================================
 * "The icons of the choices take too long to load and make the page lag."
 * "The selection must be smooth and clean, in and out." "The animated effect
 * around the icon must be smoother and cleaner, the setup text 3px larger,
 * and the changing texts change smoothly."
 *
 * components/onepage/onboarding-modal.tsx in a browser
 * (scripts/render-onepage-onboarding.tsx through
 * scripts/onepage-probe-server.mjs), on a phone (390x844, the CPU slowed
 * four times, the images served at DevTools' Slow 4G: 562.5ms before the
 * first byte and 1.44Mbps shared) and on a laptop (1440x900):
 *
 *   GOAL STEP     from Next on the first step to the four goal pictures all
 *                 drawn: the bytes and requests it took, the time, the
 *                 longest frame on the way; nothing asked of another origin;
 *                 each picture's box is its size before it arrives
 *   A PICK        tapping a goal, then another: the new pick's marks arrive
 *                 over several frames and the old one's leave over several,
 *                 on opacity and scale alone, within five frames of the click
 *                 (a transition draws its first frame at its start, so two
 *                 frames is the least there can be);
 *                 no card and no word moves or changes weight
 *   TEMPLATES     every card the same size, the same pick as the goals, and
 *                 the previews light (the bytes and requests of the step)
 *   SETUP         the effect around the logo animates on the compositor
 *                 (no main thread paint in its frames, no animation that
 *                 could not run there); the words are 3px larger than the
 *                 18/24px they were; a change of words is a crossfade and
 *                 the words' box and the logo do not move
 *
 *   PROBE_CSS=source node scripts/check-onepage-onboarding.mjs
 *   REPORT=1 ...   numbers only, nothing fails (for a before and after)
 *   SHOTS=/dir ... screenshots, prefixed onboarding-, mid pick frames included
 *   REMOTE_DIR=/dir ...   serves /__remote/<file> from there, for measuring a
 *                         copy of the component that still fetched its
 *                         pictures from elsewhere
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { serveEditorProbe } from "./onepage-probe-server.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const REPORT = !!process.env.REPORT
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const shots = process.env.SHOTS || mkdtempSync(join(tmpdir(), "storelib-onboarding-"))
mkdirSync(shots, { recursive: true })
const only = (process.env.ONLY || "").split(",").filter(Boolean)
const wants = (k) => !only.length || only.includes(k)

/* DevTools' Slow 4G (it was called Fast 3G until Chrome 124). */
const SLOW_4G = { latency: 562.5, bytesPerSecond: 180_000 }
const statics = process.env.REMOTE_DIR ? { "/__remote/": process.env.REMOTE_DIR } : {}
const phoneServer = await serveEditorProbe({ root, fail, entry: "scripts/render-onepage-onboarding.tsx", statics, throttle: SLOW_4G })
const deskServer = await serveEditorProbe({ root, fail, entry: "scripts/render-onepage-onboarding.tsx", statics })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--font-render-hinting=none"] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SIZES = [
  { label: "phone-390", base: phoneServer.base, viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, cpu: 4, touch: true },
  { label: "desktop-1440", base: deskServer.base, viewport: { width: 1440, height: 900, deviceScaleFactor: 2 }, cpu: 1, touch: false },
]

const report = {}
let broken = 0
const expect = (ok, what, got) => {
  const tail = got === undefined ? "" : `   (${JSON.stringify(got)})`
  if (REPORT) { console.log(`  ....  ${what}${tail}`); return }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${tail}`)
  if (!ok) broken++
}

/* Installed before the page's scripts: presses, transitions and a frame sampler. */
const INSTRUMENT = () => {
  window.__downs = []
  window.__clicks = []
  for (const t of ["pointerdown", "touchstart", "mousedown"]) window.addEventListener(t, () => window.__downs.push(performance.now()), { capture: true })
  window.addEventListener("click", () => window.__clicks.push(performance.now()), { capture: true })
  window.__transitions = []
  document.addEventListener("transitionrun", (e) => window.__transitions.push({ t: performance.now(), prop: e.propertyName, el: e.target.getAttribute?.("data-choice-mark") !== null ? "mark" : e.target.getAttribute?.("data-check-mark") !== null ? "check" : e.target.tagName?.toLowerCase() }), true)
  window.__shift = 0
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
  } catch {}
  /* `sample` runs once a frame, after layout; the gaps between frames are kept too. */
  window.__rec = (ms, sample) => new Promise((resolve) => {
    const painted = []
    const dummy = document.createElement("div")
    dummy.style.cssText = "position:fixed;left:-20px;top:0;width:1px;height:1px;pointer-events:none"
    document.body.appendChild(dummy)
    let flip = false
    const ro = new ResizeObserver(() => { painted.push({ t: performance.now(), ...sample() }) })
    ro.observe(dummy)
    const t0 = performance.now()
    const tick = () => {
      flip = !flip
      dummy.style.width = flip ? "2px" : "1px"
      if (performance.now() - t0 < ms) requestAnimationFrame(tick)
      else { ro.disconnect(); dummy.remove(); resolve(painted) }
    }
    requestAnimationFrame(tick)
  })
}

/* Each page in a context of its own, so nothing one fetched is in the next one's cache. */
async function open(size, query, autoSample = null) {
  const context = await browser.createBrowserContext()
  const p = await context.newPage()
  await p.setViewport(size.viewport)
  await p.evaluateOnNewDocument(INSTRUMENT)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  const cdp = await p.target().createCDPSession()
  /* Every request the page makes after the document: its address and what came over the wire. */
  const requests = new Map()
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: false })
  cdp.on("Network.requestWillBeSent", (e) => { if (e.type !== "Document" && !e.request.url.startsWith("data:")) requests.set(e.requestId, { url: e.request.url, type: e.type, t: e.timestamp, bytes: 0, done: false, failed: false }) })
  cdp.on("Network.loadingFinished", (e) => { const r = requests.get(e.requestId); if (r) { r.bytes = e.encodedDataLength; r.done = true; r.end = e.timestamp } })
  cdp.on("Network.loadingFailed", (e) => { const r = requests.get(e.requestId); if (r) { r.failed = true; r.done = true } })
  if (size.touch) await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "any-hover", value: "none" }] })
  /* A sampler started with the page, for a step opened straight away (the first frames are the ones that matter). */
  if (autoSample) await p.evaluateOnNewDocument((fn) => { window.__auto = new Promise((res) => document.addEventListener("DOMContentLoaded", () => res(window.__rec(9000, new Function(`return (${fn})()`))))) }, autoSample.toString())
  await p.goto(`${size.base}/app/onepage?${query}`, { waitUntil: "domcontentloaded" })
  await p.waitForSelector("[role=dialog]")
  if (size.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: size.cpu })
  return { p, cdp, errors, requests, size, close: () => context.close() }
}

/** A press, the way the device makes one: a finger on a phone, a mouse on a laptop. */
async function press(s, handle) {
  const c = await s.p.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, handle)
  if (s.size.touch) {
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x, y: c.y }] })
    await sleep(70)
    await s.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await s.p.mouse.click(c.x, c.y, { delay: 60 })
  }
}

const visibleButtons = (s, fn) => s.p.evaluateHandle(fn)
const nextButton = (s) => visibleButtons(s, () => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Next" && b.getClientRects().length))

/* The goal cards, by their names, and whether each picture is drawn. */
const GOALS = ["General", "Artist & Creator", "Digital Products", "Business"]
const GOAL_STATE = () => {
  const names = ["General", "Artist & Creator", "Digital Products", "Business"]
  const cards = names.map((n) => [...document.querySelectorAll("button")].find((b) => b.querySelector("h3")?.textContent.trim() === n && b.getClientRects().length))
  const pics = cards.map((c) => c?.querySelector("img"))
  const drawn = pics.map((img) => !!img && img.complete && img.naturalWidth > 0 && img.getClientRects().length > 0 && getComputedStyle(img).visibility !== "hidden" && Number(getComputedStyle(img).opacity) > 0.99)
  const boxes = pics.map((img) => { const holder = img?.parentElement; if (!holder) return null; const r = holder.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })
  return { cards: cards.filter(Boolean).length, drawn: drawn.filter(Boolean).length, boxes }
}

const offOrigin = (s) => [...s.requests.values()].filter((r) => !r.url.startsWith(s.size.base))
const images = (s) => [...s.requests.values()].filter((r) => r.type === "Image" || /\.(webp|avif|png|jpe?g|svg|gif)(\?|$)/.test(r.url))
const kb = (b) => Math.round(b / 102.4) / 10

/* ------------------------------------------------------------------------ */
if (wants("goal")) {
  console.log("\nthe goal step: from Next to every picture drawn")
  for (const size of SIZES) {
    const s = await open(size, "step=1")
    const next = await nextButton(s)
    await s.p.waitForFunction((b) => !b.disabled, { timeout: 10_000 }, next)
    /* A person reads the first step for a moment. */
    await sleep(1500)
    const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 6000, GOAL_STATE.toString())
    await sleep(40)
    await press(s, next)
    const frames = await rec
    const down = await s.p.evaluate(() => window.__clicks.at(-1))
    const firstCard = frames.find((f) => f.cards === 4)
    const allDrawn = frames.find((f) => f.cards === 4 && f.drawn === 4)
    const gaps = frames.slice(1).map((f, i) => f.t - frames[i].t).filter((_, i) => frames[i + 1].t >= down && frames[i + 1].t <= (allDrawn?.t ?? frames.at(-1).t) + 300)
    const imgs = images(s)
    const r = {
      requests: imgs.length,
      kb: kb(imgs.reduce((a, x) => a + x.bytes, 0)),
      offOrigin: offOrigin(s).map((x) => x.url.slice(0, 80)),
      stepShownMs: firstCard ? Math.round(firstCard.t - down) : null,
      allDrawnMs: allDrawn ? Math.round(allDrawn.t - down) : null,
      longestFrameMs: gaps.length ? Math.round(Math.max(...gaps)) : null,
      boxes: [...new Set(frames.filter((f) => f.cards === 4).flatMap((f) => f.boxes))],
    }
    report[`goal-${size.label}`] = r
    console.log(`    ${size.label}: ${r.requests} image requests, ${r.kb} KB, step on screen ${r.stepShownMs}ms after Next, every picture drawn ${r.allDrawnMs}ms after Next, longest frame ${r.longestFrameMs}ms, picture boxes ${JSON.stringify(r.boxes)}`)
    expect(r.allDrawnMs !== null && r.allDrawnMs - r.stepShownMs <= 34, `${size.label}: the four pictures are drawn with the step, not after it`, { stepShownMs: r.stepShownMs, allDrawnMs: r.allDrawnMs })
    expect(r.kb <= 12, `${size.label}: the pictures weigh little`, r.kb)
    expect(r.offOrigin.length === 0, `${size.label}: nothing is asked of another origin`, r.offOrigin)
    expect(r.boxes.length === 1 && r.boxes[0] === "48x48", `${size.label}: each picture's box is 48 by 48 before and after it arrives`, r.boxes)
    await s.p.screenshot({ path: join(shots, `onboarding-goal-${size.label}.png`) })
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.close()

    /* Straight onto the step, no first step to fetch them during: the worst case. */
    const cold = await open(size, "step=2", GOAL_STATE)
    const coldFrames = await cold.p.evaluate(() => window.__auto)
    const c0 = coldFrames.find((f) => f.cards === 4)
    const c1 = coldFrames.find((f) => f.cards === 4 && f.drawn === 4)
    report[`goal-cold-${size.label}`] = { cardsAtMs: c0 ? Math.round(c0.t) : null, drawnAtMs: c1 ? Math.round(c1.t) : null, gapMs: c0 && c1 ? Math.round(c1.t - c0.t) : null }
    console.log(`    ${size.label}, opened on the step: cards at ${report[`goal-cold-${size.label}`].cardsAtMs}ms, every picture at ${report[`goal-cold-${size.label}`].drawnAtMs}ms (${report[`goal-cold-${size.label}`].gapMs}ms later)`)
    await cold.close()
  }
}

/* ------------------------------------------------------------------------ */
/**
 * One pick recorded: the frames of the new pick and the old one (their marks
 * and borders, their boxes and their words), what started, and when the
 * first change was drawn after the press.
 */
const PICK_STATE = () => {
  const look = (card) => {
    if (!card) return null
    const cs = getComputedStyle(card)
    const marks = [...card.querySelectorAll("[data-choice-mark], [data-check-mark]")].map((m) => { const ms = getComputedStyle(m); return `${Math.round(Number(ms.opacity) * 100)}/${ms.scale}` })
    return `${cs.borderColor}|${cs.backgroundColor}|${cs.boxShadow}|${marks.join(",")}`
  }
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}` }
  const a = document.querySelector("[data-probe-a]")
  const b = document.querySelector("[data-probe-b]")
  const words = [a, b].map((c) => c && (c.querySelector("h3") || c.querySelector("[data-template-name]") || c.querySelector("p")))
  return {
    a: look(a), b: look(b),
    boxes: `${box(a)}|${box(b)}|${box(words[0])}|${box(words[1])}`,
    weights: words.map((w) => w && getComputedStyle(w).fontWeight).join(","),
  }
}

async function recordPick(s, handle, ms = 600) {
  const before = await s.p.evaluate(() => ({ x: window.__transitions.length, shift: window.__shift }))
  const rec = s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), ms, PICK_STATE.toString())
  await sleep(60)
  await press(s, handle)
  const frames = await rec
  /* A pick is made on the click (the finger or the button coming up), so its time is counted from there. */
  const after = await s.p.evaluate(() => ({ transitions: window.__transitions, shift: window.__shift, down: window.__clicks.at(-1) }))
  const first = frames.find((f) => f.t >= after.down)
  const start = { a: first?.a, b: first?.b }
  const settled = frames.at(-1)
  const moved = frames.find((f) => f.t >= after.down && (f.a !== start.a || f.b !== start.b))
  const between = (k) => new Set(frames.map((f) => f[k]).filter((v) => v !== start[k] && v !== settled[k])).size
  const props = [...new Set(after.transitions.slice(before.x).map((x) => `${x.el}:${x.prop}`))]
  return {
    newInBetween: between("b"),
    oldInBetween: between("a"),
    firstMotionMs: moved ? Math.round(moved.t - after.down) : null,
    boxes: new Set(frames.map((f) => f.boxes)).size,
    weights: [...new Set(frames.map((f) => f.weights))],
    props,
    shift: Math.round((after.shift - before.shift) * 1000) / 1000,
  }
}

/* A frame from the middle of a pick: a little way in, every animation on the page is held for the picture, then let go. */
async function midPickShot(s, handle, name) {
  await press(s, handle)
  await sleep(s.size.touch ? 40 : 70)
  await s.p.evaluate(() => { window.__held = document.getAnimations(); window.__held.forEach((a) => a.pause()) })
  await s.p.screenshot({ path: join(shots, name) })
  await s.p.evaluate(() => window.__held.forEach((a) => a.play()))
  await sleep(1200)
}

const TRANSFORM_ONLY = (props) => props.every((p) => /:(opacity|scale|transform|translate)$/.test(p))

if (wants("pick")) {
  console.log("\na goal picked, then another")
  for (const size of SIZES) {
    const s = await open(size, "step=2")
    await s.p.waitForFunction(() => document.querySelectorAll("button h3").length >= 4)
    await sleep(2500)
    const tag = (n, attr) => s.p.evaluateHandle((n, attr) => { const b = [...document.querySelectorAll("button")].find((x) => x.querySelector("h3")?.textContent.trim() === n && x.getClientRects().length); document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr)); b.setAttribute(attr, ""); return b }, n, attr)
    await tag("General", "data-probe-a")
    const artist = await tag("Artist & Creator", "data-probe-b")
    const first = await recordPick(s, artist)
    await tag("Artist & Creator", "data-probe-a")
    const business = await tag("Business", "data-probe-b")
    const second = await recordPick(s, business)
    report[`pick-${size.label}`] = { first, second }
    for (const [what, r] of [["first pick", first], ["another", second]]) {
      console.log(`    ${size.label}, ${what}: new pick ${r.newInBetween} frames in between, old pick ${r.oldInBetween}, first motion ${r.firstMotionMs}ms after the press, boxes seen ${r.boxes}, weights ${JSON.stringify(r.weights)}, started ${JSON.stringify(r.props)}, shift ${r.shift}`)
    }
    expect(first.newInBetween >= 3 && second.newInBetween >= 3 && second.oldInBetween >= 3, `${size.label}: a pick fades in over several frames and the last one out over several`, { first: first.newInBetween, in: second.newInBetween, out: second.oldInBetween })
    expect(second.firstMotionMs !== null && second.firstMotionMs <= 90, `${size.label}: the pick is moving within five frames of the click`, second.firstMotionMs)
    expect(first.boxes === 1 && second.boxes === 1 && first.weights.length === 1 && second.weights.length === 1, `${size.label}: no card and no word moves, nothing changes weight`, { boxes: [first.boxes, second.boxes], weights: second.weights })
    expect(TRANSFORM_ONLY(second.props) && second.props.length > 0, `${size.label}: only opacity and scale are animated`, second.props)
    await midPickShot(s, await tag("General", "data-probe-b"), `onboarding-goal-pick-mid-${size.label}.png`)
    await s.p.screenshot({ path: join(shots, `onboarding-goal-picked-${size.label}.png`) })
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.close()
  }
}

/* ------------------------------------------------------------------------ */
const TEMPLATE_CARDS = () => [...document.querySelectorAll('[data-template-card], button[class*="aspect-[3/4]"]')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().width > 0)

if (wants("templates")) {
  console.log("\nthe template step")
  for (const size of SIZES) {
    const s = await open(size, "step=4&avatar")
    await s.p.waitForFunction(`(${TEMPLATE_CARDS})().length >= 4`)
    await sleep(size.touch ? 9000 : 2500)
    const sizes = await s.p.evaluate(`[...new Set((${TEMPLATE_CARDS})().map((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) + "x" + Math.round(r.height) }))]`)
    const imgs = images(s)
    const r = { cards: await s.p.evaluate(`(${TEMPLATE_CARDS})().length`), sizes, requests: imgs.length, kb: kb(imgs.reduce((a, x) => a + x.bytes, 0)), offOrigin: offOrigin(s).map((x) => x.url.slice(0, 80)), pending: imgs.filter((x) => !x.done).length }
    console.log(`    ${size.label}: ${r.cards} cards, sizes ${JSON.stringify(r.sizes)}, ${r.requests} image requests, ${r.kb} KB, ${r.pending} still loading, other origins ${r.offOrigin.length}`)
    expect(r.sizes.length === 1, `${size.label}: every template card is the same size`, r.sizes)
    expect(r.kb <= 60 && r.offOrigin.length === 0, `${size.label}: the previews are light and come from the app`, { kb: r.kb, offOrigin: r.offOrigin })
    await s.p.screenshot({ path: join(shots, `onboarding-templates-${size.label}.png`) })
    const tag = (i, attr) => s.p.evaluateHandle((i, attr, fn) => { const b = new Function(`return (${fn})()`)()[i]; document.querySelectorAll(`[${attr}]`).forEach((e) => e.removeAttribute(attr)); b.setAttribute(attr, ""); return b }, i, attr, TEMPLATE_CARDS.toString())
    await tag(0, "data-probe-a")
    const second = await recordPick(s, await tag(1, "data-probe-b"))
    report[`templates-${size.label}`] = { ...r, pick: second }
    console.log(`    ${size.label}, a template picked: new ${second.newInBetween} frames in between, old ${second.oldInBetween}, first motion ${second.firstMotionMs}ms, boxes seen ${second.boxes}, started ${JSON.stringify(second.props)}, shift ${second.shift}`)
    expect(second.newInBetween >= 3 && second.oldInBetween >= 3, `${size.label}: a template pick fades in and the last one out`, { in: second.newInBetween, out: second.oldInBetween })
    expect(second.firstMotionMs !== null && second.firstMotionMs <= 90 && second.boxes === 1 && TRANSFORM_ONLY(second.props), `${size.label}: moving within five frames, nothing moves, opacity and scale only`, { firstMotionMs: second.firstMotionMs, boxes: second.boxes, props: second.props })
    await midPickShot(s, await tag(2, "data-probe-b"), `onboarding-template-pick-mid-${size.label}.png`)
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.close()
  }
}

/* ------------------------------------------------------------------------ */
const SETUP_STATE = () => {
  const words = document.querySelector("[data-setup-words]") || [...document.querySelectorAll("h1")].find((h) => /Setting up|Almost there|is ready/.test(h.textContent))?.closest(".text-center")
  const logo = document.querySelector("[role=dialog] [data-storelib-logo]")
  const shown = [...document.querySelectorAll("h1")].filter((h) => /Setting up|Almost there|is ready/.test(h.textContent)).map((h) => {
    let o = 1
    for (let n = h; n && n !== document.body; n = n.parentElement) o *= Number(getComputedStyle(n).opacity)
    return `${h.textContent.trim()}@${Math.round(o * 100)}`
  })
  const r = words?.getBoundingClientRect()
  const l = logo?.getBoundingClientRect()
  return { words: r ? `${Math.round(r.top)},${Math.round(r.height)}` : null, logo: l ? `${Math.round(l.left)},${Math.round(l.top)}` : null, shown: shown.join("|") }
}

if (wants("setup")) {
  console.log("\nsetting up")
  for (const size of SIZES) {
    const s = await open(size, "step=4")
    await s.p.waitForFunction(`(${TEMPLATE_CARDS})().length >= 4`)
    await sleep(600)
    await press(s, await nextButton(s))
    await s.p.waitForFunction(() => /Setting up your OnePage/.test(document.body.textContent))
    const started = Date.now()
    await sleep(1200)
    const font = await s.p.evaluate(() => { const h = [...document.querySelectorAll("h1")].find((x) => /Setting up/.test(x.textContent)); return h ? parseFloat(getComputedStyle(h).fontSize) : null })
    /* Two seconds of the effect, traced: main thread paints, and any animation the compositor could not take. */
    await s.p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink.animations", "disabled-by-default-devtools.timeline.frame"] })
    const frames = await s.p.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f) }))
    const trace = JSON.parse(Buffer.from(await s.p.tracing.stop()).toString("utf8"))
    const ev = trace.traceEvents
    const paints = ev.filter((e) => e.name === "Paint")
    const failed = ev.filter((e) => e.args?.data?.compositeFailed).map((e) => e.args.data.compositeFailed)
    const anims = await s.p.evaluate(() => document.getAnimations().map((a) => { const k = a.effect?.getKeyframes?.() ?? []; return [...new Set(k.flatMap((f) => Object.keys(f)).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x)))].join("+") }))
    const setup = { fontPx: font, frames, paints: paints.length, paintsPerFrame: Math.round((paints.length / Math.max(1, frames)) * 100) / 100, paintMs: Math.round(paints.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10, compositeFailed: failed.length, animated: [...new Set(anims)] }
    console.log(`    ${size.label}: words ${setup.fontPx}px; in 2s, ${setup.frames} frames, ${setup.paints} main thread paints (${setup.paintsPerFrame} a frame, ${setup.paintMs}ms), ${setup.compositeFailed} animations kept off the compositor, animating ${JSON.stringify(setup.animated)}`)
    expect(setup.fontPx === (size.touch ? 21 : 27), `${size.label}: the words are 3px larger than they were (${size.touch ? 18 : 24}px)`, setup.fontPx)
    expect(setup.paintsPerFrame <= 0.05 && setup.compositeFailed === 0, `${size.label}: the effect animates on the compositor, with no paint in its frames`, { paintsPerFrame: setup.paintsPerFrame, compositeFailed: setup.compositeFailed })
    expect(setup.animated.every((p) => /^(opacity|transform|scale|rotate|translate)(\+(opacity|transform|scale|rotate|translate))*$/.test(p)), `${size.label}: only transform and opacity are animated`, setup.animated)
    await s.p.screenshot({ path: join(shots, `onboarding-setup-${size.label}.png`) })
    /* The words change about six seconds in, and again three seconds later. */
    const wait = Math.max(0, 5600 - (Date.now() - started))
    await sleep(wait)
    const change = await s.p.evaluate((ms, fn) => window.__rec(ms, new Function(`return (${fn})()`)), 4800, SETUP_STATE.toString())
    const shownSeq = [...new Set(change.map((f) => f.shown))]
    const both = change.filter((f) => f.shown.split("|").filter((x) => !/@0$/.test(x)).length >= 2).length
    const seq = []
    for (const f of change) if (!seq.length || seq.at(-1).shown !== f.shown) seq.push({ at: Math.round(f.t - change[0].t), shown: f.shown, words: f.words })
    const r2 = { words: [...new Set(change.map((f) => f.words))], logo: [...new Set(change.map((f) => f.logo))], crossfadeFrames: both, steps: shownSeq.length, seq: seq.slice(0, 40) }
    report[`setup-${size.label}`] = { ...setup, change: r2 }
    console.log(`    ${size.label}: through the word changes, the words' box ${JSON.stringify(r2.words)}, the logo ${JSON.stringify(r2.logo)}, ${r2.crossfadeFrames} frames with two lines crossing`)
    expect(r2.words.length === 1 && r2.logo.length === 1, `${size.label}: the words' box and the logo hold still through the change`, { words: r2.words, logo: r2.logo })
    expect(r2.crossfadeFrames >= 3, `${size.label}: each change is a crossfade over several frames`, r2.crossfadeFrames)
    expect(s.errors.length === 0, `${size.label}: no errors on the page`, s.errors.slice(0, 2))
    await s.close()
  }
}

await browser.close()
phoneServer.server.close()
deskServer.server.close()
if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, JSON.stringify(report, null, 2))
console.log(`\nScreenshots in ${shots}`)
if (!REPORT && broken) { console.error(`\n${broken} check(s) failed.\n`); process.exit(1) }
