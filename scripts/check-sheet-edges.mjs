/**
 * ===========================================================================
 *  THE BUILDER'S PHONE SHEETS AT THEIR EDGES, MEASURED
 * ===========================================================================
 * scripts/check-sheet-feel.mjs measures the drag a person means. This one
 * measures everything around it, on the real MobileEditorSheet with the
 * props every builder sheet is given (scripts/render-sheet-edges.tsx):
 *
 *   CORNERS    every sheet the builder opens (Sections at half and at full,
 *              Add section, Ask Storelib, Publish) at 390x844 with a status
 *              bar of 59 and of 0, 375x667 with 20 and 0, 320x568, and a
 *              landscape 844x390: each violet button in the editor's bar is
 *              wholly under the sheet or wholly clear of it, never part of
 *              it (a sliver at the corners); the sheet's top edge is below
 *              the status bar; half is never above full; nothing is NaN
 *   CONTROLS   on the Sections sheet at half, with the list at its top, a
 *              pull down that starts on a control with its own drag (a
 *              `touch-none` reorder grip held for a long press, a range
 *              input) leaves the sheet where it is; a sideways swipe on a
 *              row of chips scrolls the chips and not the sheet; a tap on a
 *              button inside clicks it and moves nothing
 *   CANCELLED  a touch on the grab bar that the system cancels, or that a
 *              second finger turns into a pinch, is not a tap: the sheet
 *              stays where it is
 *   MOUSE      a real mouse press on the grab bar shortly after a touch
 *              somewhere else still works (hybrid devices)
 *   KEYBOARD   a field in the Sections sheet at half takes the keyboard:
 *              the sheet goes to its tallest stop and back when the keyboard
 *              goes, read every frame. No frame moves the top edge by more
 *              than a snap moves it (a jump by the keyboard's height is the
 *              bug), and it only moves one way each time. With the keyboard
 *              up the top edge stays clear of the editor's bar
 *   ROTATION   the sheet at half, turned to landscape and back, comes back
 *              to half with finite numbers
 *
 *   pnpm build (for the stylesheet), then
 *   node scripts/check-sheet-edges.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
/* The source tree the fixture is bundled from; the repo unless told otherwise
   (a copy at an older commit, to measure what a fix changed). */
const srcRoot = process.env.PROBE_SRC_ROOT ?? root
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/* The fixture's sheets have to be the builder's sheets. */
const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
const publishPanel = readFileSync(join(root, "components/website-builder/publish-panel.tsx"), "utf8")
const fixture = readFileSync(join(root, "scripts/render-sheet-edges.tsx"), "utf8")
const drift = []
if ((editor.match(/const AI_SHEET_DETENTS = (\[[^\]]*\])/) || [])[1] !== (fixture.match(/const AI_SHEET_DETENTS = (\[[^\]]*\])/) || [])[1]) drift.push("Ask Storelib's stops")
if (!/openFull\s+detents=\{\[0\.92\]\}\s+\/\*[^*]*\*\/\s+layer="raised"\s+peekHeight=\{0\}/.test(editor) || !/const ADD_DETENTS = \[0\.92\]/.test(fixture)) drift.push("Add section's props")
if (!/fit\s+detents=\{\[0\.88\]\}/.test(publishPanel) || !/const PUBLISH_DETENTS = \[0\.88\]/.test(fixture)) drift.push("Publish's props")
if (!/data-sheet-clear=""/.test(editor) || !/wb-editor-topbar/.test(editor)) drift.push("the editor bar's marker")
if (drift.length) fail(`The fixture has drifted from the builder: ${drift.join(", ")}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-sheetedges-"))
const stubs = join(root, ".sheetfps-probe")
mkdirSync(stubs, { recursive: true })
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-sheet-edges.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${srcRoot}`,
  "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

/* A visualViewport the probe drives: `__keyboard(keys, pan)` is iOS opening
   a keyboard of `keys` pixels and panning the page by `pan`. */
const PRELUDE = `
window.__err = [];
window.addEventListener("error", function (e) { window.__err.push(String(e.message)) });
window.process = { env: { NODE_ENV: "production" } };
(function () {
  var vv = new EventTarget();
  var state = { keys: 0, offsetTop: 0 };
  Object.defineProperty(vv, "height", { get: function () { return window.innerHeight - state.keys } });
  Object.defineProperty(vv, "width", { get: function () { return window.innerWidth } });
  Object.defineProperty(vv, "offsetTop", { get: function () { return state.offsetTop } });
  Object.defineProperty(vv, "offsetLeft", { get: function () { return 0 } });
  Object.defineProperty(vv, "pageTop", { get: function () { return state.offsetTop + window.scrollY } });
  Object.defineProperty(vv, "scale", { get: function () { return 1 } });
  Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return vv } });
  window.addEventListener("resize", function () { vv.dispatchEvent(new Event("resize")) });
  window.__keyboard = function (keys, pan) {
    state.keys = keys;
    state.offsetTop = pan || 0;
    vv.dispatchEvent(new Event("resize"));
    vv.dispatchEvent(new Event("scroll"));
  };
})();
`
const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;background:#eef1f5}</style></head><body><div id="app"></div>` +
  `<script>${PRELUDE}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })
const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})

const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}\n${expression.slice(0, 200)}`)
  return r.result.value
}
const errors = []
let safeAreaEmulated = true

async function load(kind, w, h, safeTop, safeBottom = 0) {
  const landscape = w > h
  await call("Emulation.setDeviceMetricsOverride", {
    width: w, height: h, deviceScaleFactor: 1, mobile: true,
    screenOrientation: landscape ? { angle: 90, type: "landscapePrimary" } : { angle: 0, type: "portraitPrimary" },
  })
  await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  try {
    await call("Emulation.setSafeAreaInsetsOverride", {
      insets: { top: safeTop, topMax: safeTop, bottom: safeBottom, bottomMax: safeBottom, left: 0, leftMax: 0, right: 0, rightMax: 0 },
    })
  } catch {
    safeAreaEmulated = false
  }
  await call("Page.navigate", { url: "about:blank" })
  await sleep(150)
  await call("Page.navigate", { url: `file://${file}#${kind}` })
  await sleep(1300)
  if (!(await js(`!!document.querySelector("[data-mobile-bottom-sheet]")`))) fail(`The ${kind} sheet never mounted: ${await js("JSON.stringify(window.__err)")}`)
}

const READ = `(() => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  const r = sheet.getBoundingClientRect()
  const safe = (() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px)"; document.body.appendChild(d); const v = d.getBoundingClientRect().height; d.remove(); return v })()
  /* Each violet button: how many of its sample points the sheet covers. */
  const covered = (el) => {
    const b = el.getBoundingClientRect()
    let on = 0, all = 0
    for (let x = b.left + 1; x < b.right; x += 3) for (let y = b.top + 1; y < b.bottom; y += 2) {
      all++
      if (document.elementsFromPoint(x, y).some((n) => n === sheet || sheet.contains(n))) on++
    }
    return { on, all, top: b.top, bottom: b.bottom }
  }
  /* The method has to see rounded corners, or a sliver there reads as covered. */
  const cornerSeen = !document.elementsFromPoint(1, r.top + 1).some((n) => n === sheet || sheet.contains(n))
  return JSON.stringify({
    top: r.top, height: r.height, bottom: r.bottom, safe,
    style: sheet.getAttribute("style"),
    bar: document.getElementById("bar").getBoundingClientRect().bottom,
    left: covered(document.getElementById("violet-left")),
    right: covered(document.getElementById("violet-right")),
    cornerSeen,
  })
})()`
const read = async () => JSON.parse(await js(READ))
const touch = (type, points) => call("Input.dispatchTouchEvent", { type, touchPoints: points })
const tap = async (x, y) => { await touch("touchStart", [{ x, y }]); await sleep(40); await touch("touchEnd", []) }
const handleY = async () => (await read()).top + 12

// ── CORNERS ───────────────────────────────────────────────────────────────
const SCREENS = [[390, 844, 59, 34], [390, 844, 0, 0], [375, 667, 20, 0], [375, 667, 0, 0], [320, 568, 20, 0], [844, 390, 0, 21]]
const corners = []
for (const [w, h, st, sb] of SCREENS) {
  for (const kind of ["sections", "add", "ai", "publish"]) {
    await load(kind, w, h, st, sb)
    if (kind === "sections") {
      await js("window.__setOpen(true)")
      await sleep(700)
      const half = await read()
      await tap(Math.round(w / 2), half.top + 12)
      await sleep(700)
      const full = await read()
      corners.push({ w, h, st, kind: "sections half", s: half, halfTop: half.top, fullTop: full.top })
      corners.push({ w, h, st, kind: "sections full", s: full, halfTop: half.top, fullTop: full.top })
    } else {
      await sleep(300)
      corners.push({ w, h, st, kind, s: await read() })
    }
    errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))
  }
}

// ── CONTROLS, CANCELLED, MOUSE ──────────────────────────────────────────
await load("sections", 390, 844, 0, 0)
await js("window.__setOpen(true)")
await sleep(700)
const center = (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return JSON.stringify([Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]) })()`).then(JSON.parse)
const g = {}
g.half = (await read()).top
/* A pull down from `sel`, the list at its top, `hold` ms before moving. */
async function pullFrom(sel, hold, dx = 0) {
  await js(`document.getElementById("list").scrollTop = 0`)
  const [x, y] = await center(sel)
  await touch("touchStart", [{ x, y }])
  await sleep(hold)
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: x + dx * i, y: y + 12 * i }]); await sleep(16) }
  const during = (await read()).top
  await touch("touchEnd", [])
  await sleep(600)
  return { during, after: (await read()).top }
}
await js("window.__log.length = 0")
g.grip = await pullFrom("#grip", 320)
g.reorder = await js(`window.__log.includes("reorder")`)
g.range = await pullFrom("#range", 0, 3)
{
  await js(`document.getElementById("list").scrollTop = 0`)
  const [x, y] = await center("#chips")
  await touch("touchStart", [{ x: x + 120, y }])
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [{ x: x + 120 - 22 * i, y: y + (i % 3) }]); await sleep(16) }
  await touch("touchEnd", [])
  await sleep(600)
  g.chips = { top: (await read()).top, left: await js(`document.getElementById("chips").scrollLeft`) }
}
{
  await js("window.__log.length = 0")
  const [x, y] = await center("#button")
  await touch("touchStart", [{ x, y }])
  await touch("touchMove", [{ x: x + 2, y: y + 3 }])
  await sleep(40)
  await touch("touchEnd", [])
  await sleep(600)
  g.button = { top: (await read()).top, clicked: await js(`window.__log.includes("click")`) }
}
/* The grab bar, cancelled by the system. */
{
  g.cancelFrom = (await read()).top
  const y = g.cancelFrom + 12
  await touch("touchStart", [{ x: 195, y }])
  await sleep(40)
  await touch("touchCancel", [])
  await sleep(600)
  g.cancelled = (await read()).top
}
/* The grab bar, then a second finger: a pinch starting, not a tap. */
{
  await js("window.__log.length = 0")
  g.pinchFrom = (await read()).top
  const y = g.pinchFrom + 12
  await touch("touchStart", [{ x: 195, y }])
  await sleep(30)
  await touch("touchStart", [{ x: 195, y }, { x: 120, y: y + 220 }])
  await sleep(30)
  await touch("touchEnd", [])
  await sleep(600)
  g.pinch = (await read()).top
  g.pinchEvents = await js(`window.__log.filter((l) => l.startsWith("touch")).join(" ")`)
}
/* A touch on a row, then a real mouse on the grab bar 150ms later. */
{
  g.mouseFrom = (await read()).top
  await tap(195, g.mouseFrom + 400)
  await sleep(150)
  const y = await handleY()
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 195, y })
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x: 195, y, button: "left", buttons: 1, clickCount: 1 })
  await sleep(40)
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 195, y, button: "left", buttons: 0, clickCount: 1 })
  await sleep(700)
  g.mouse = (await read()).top
}
errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

// ── A TOOLBAR OVER THE PAGE IS NOT A KEYBOARD ──────────────────────────
/* A browser whose bottom toolbar is drawn over the page: the visible area is
   56px shorter than the fixed box, with no keyboard anywhere. A button in
   the sheet has focus, as it does after a tap. */
const tb = {}
await load("sections", 390, 844, 0, 34)
await js("window.__setOpen(true)")
await sleep(700)
tb.before = (await read()).top
await js(`document.getElementById("button").focus(); window.__keyboard(56, 0); 0`)
await sleep(700)
tb.after = await read()
tb.pad = await js(`parseFloat(getComputedStyle(document.querySelector("[data-mobile-bottom-sheet]")).paddingBottom)`)
errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

// ── KEYBOARD, every frame ───────────────────────────────────────────────
const KEYS = 336
await load("sections", 390, 844, 59, 34)
await js("window.__setOpen(true)")
await sleep(700)
await js(`window.__rec = (ms) => new Promise((done) => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  const out = []
  const t0 = performance.now()
  const tick = () => {
    setTimeout(() => out.push(Math.round(sheet.getBoundingClientRect().top * 10) / 10), 0)
    if (performance.now() - t0 < ms) requestAnimationFrame(tick)
    else setTimeout(() => done(JSON.stringify(out)), 30)
  }
  requestAnimationFrame(tick)
})`)
const kb = {}
kb.before = (await read()).top
await js(`window.__p = window.__rec(900); document.getElementById("field").focus({ preventScroll: true }); window.__keyboard(${KEYS}, 0); 0`)
kb.opening = JSON.parse(await js("window.__p"))
kb.up = await read()
await js(`window.__p = window.__rec(900); document.activeElement.blur(); window.__keyboard(0, 0); 0`)
kb.closing = JSON.parse(await js("window.__p"))
kb.after = (await read()).top
errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))
/* Ask Storelib with the keyboard: its top edge stays at the status bar. */
await load("ai", 390, 844, 59, 34)
await js(`document.getElementById("field").focus({ preventScroll: true }); window.__keyboard(${KEYS}, 0); 0`)
await sleep(800)
kb.ai = await read()
errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

// ── ROTATION ─────────────────────────────────────────────────────────────
await load("sections", 390, 844, 59, 34)
await js("window.__setOpen(true)")
await sleep(700)
const rot = { before: await read() }
await call("Emulation.setDeviceMetricsOverride", { width: 844, height: 390, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 90, type: "landscapePrimary" } })
await call("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, topMax: 0, bottom: 21, bottomMax: 21, left: 59, leftMax: 59, right: 59, rightMax: 59 } }).catch(() => {})
await sleep(800)
rot.landscape = await read()
await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 0, type: "portraitPrimary" } })
await call("Emulation.setSafeAreaInsetsOverride", { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).catch(() => {})
await sleep(800)
rot.back = await read()
errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

// ── REPORT ───────────────────────────────────────────────────────────────
const f = (v) => (v === null || v === undefined ? String(v) : Math.round(v * 10) / 10)
const sliver = (b) => b.on > 0 && b.on < b.all
console.log(`\nThe builder's phone sheets at their edges${safeAreaEmulated ? "" : " (no safe-area emulation in this browser)"}\n`)
console.log("  corners       screen   status  sheet            top    bar  violet L (under/of)  violet R")
for (const c of corners) {
  console.log(`                ${`${c.w}x${c.h}`.padEnd(8)} ${String(c.st).padEnd(7)} ${c.kind.padEnd(16)} ${String(f(c.s.top)).padEnd(6)} ${String(f(c.s.bar)).padEnd(4)} ${`${c.s.left.on}/${c.s.left.all}`.padEnd(20)} ${c.s.right.on}/${c.s.right.all}`)
}
console.log(`  controls      half at ${f(g.half)}. grip held 320ms then pulled 120px: sheet ${f(g.grip.during)} during, ${f(g.grip.after)} after, reorder started: ${g.reorder}`)
console.log(`                range pulled 120px down: sheet ${f(g.range.during)} during, ${f(g.range.after)} after`)
console.log(`                chips swiped 220px sideways: sheet ${f(g.chips.top)}, chips scrolled ${f(g.chips.left)}px`)
console.log(`                button tapped with a 3px wander: sheet ${f(g.button.top)}, clicked: ${g.button.clicked}`)
console.log(`  cancelled     grab bar touch cancelled: sheet ${f(g.cancelFrom)} -> ${f(g.cancelled)}; grab bar then a second finger: ${f(g.pinchFrom)} -> ${f(g.pinch)} (${g.pinchEvents})`)
console.log(`  mouse         a real mouse press on the grab bar 150ms after a touch: ${f(g.mouseFrom)} -> ${f(g.mouse)}`)
console.log(`  toolbar       a 56px toolbar over the page, a button focused: sheet ${f(tb.before)} -> ${f(tb.after.top)}, padded ${f(tb.pad)} (home indicator 34 + toolbar 56)`)
const steps = (list) => list.slice(1).map((v, i) => v - list[i])
const worst = (list) => Math.max(0, ...steps(list).map(Math.abs))
const oneWay = (list, dir) => steps(list).every((d) => d * dir >= -0.5)
console.log(`  keyboard      Sections at half ${f(kb.before)}; up: ${kb.opening.length} frames, worst step ${f(worst(kb.opening))}px, ended ${f(kb.up.top)} (bar ${f(kb.up.bar)})`)
console.log(`                down: ${kb.closing.length} frames, worst step ${f(worst(kb.closing))}px, ended ${f(kb.after)}`)
console.log(`                opening frames: ${kb.opening.slice(0, 8).map(f).join(" ")} ...`)
console.log(`                closing frames: ${kb.closing.slice(0, 8).map(f).join(" ")} ...`)
console.log(`                Ask Storelib with the keyboard: top ${f(kb.ai.top)}, status bar ${f(kb.ai.safe)}`)
console.log(`  rotation      half ${f(rot.before.top)} of 844; landscape top ${f(rot.landscape.top)} height ${f(rot.landscape.height)} of 390; back ${f(rot.back.top)}`)
if (errors.length) console.log(`  page errors: ${errors.join(" | ")}`)
console.log("")

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
expect(corners.every((c) => c.s.cornerSeen), "the measurement sees the sheet's rounded corners (a point just inside one is not the sheet)")
for (const c of corners) {
  const name = `${c.w}x${c.h} status ${c.st}, ${c.kind}`
  expect(!sliver(c.s.left) && !sliver(c.s.right), `${name}: each violet button is all under the sheet or all clear of it`)
  expect(c.s.top >= c.s.safe - 0.5, `${name}: the top edge (${f(c.s.top)}) is at or below the status bar (${f(c.s.safe)})`)
  expect(!/NaN|Infinity/.test(c.s.style) && Number.isFinite(c.s.top) && c.s.height >= 0, `${name}: no NaN, no negative height`)
  if (c.kind === "sections full") expect(c.halfTop >= c.fullTop - 0.5, `${name}: half (${f(c.halfTop)}) is not above full (${f(c.fullTop)})`)
}
const still = (v) => Math.abs(v - g.half) <= 1
expect(still(g.grip.during) && still(g.grip.after), "a long press on a reorder grip, then a pull down, moves the row and not the sheet")
expect(g.reorder, "and the reorder itself started")
expect(still(g.range.during) && still(g.range.after), "a pull down that starts on a range input leaves the sheet alone")
expect(still(g.chips.top) && g.chips.left > 20, "a sideways swipe on the chips scrolls the chips and not the sheet")
expect(still(g.button.top) && g.button.clicked, "a tap on a button inside clicks it and moves nothing")
expect(Math.abs(g.cancelled - g.cancelFrom) <= 1, "a grab bar touch the system cancels is not a tap")
expect(Math.abs(g.pinch - g.pinchFrom) <= 1, "a grab bar touch that a second finger joins is not a tap")
expect(g.mouse < g.mouseFrom - 100, "a real mouse press on the grab bar right after a touch still steps the sheet")
expect(Math.abs(tb.after.top - tb.before) <= 1, "a toolbar drawn over the page is not a keyboard: the sheet stays at half")
expect(Math.abs(tb.pad - 90) <= 1, "and it pads by the home indicator plus the toolbar, as a toolbar")
const STEP = 80
expect(worst(kb.opening) < STEP && oneWay(kb.opening, -1), `keyboard up: the sheet rises to full in steps under ${STEP}px and never dips`)
expect(Math.abs(kb.up.top - (kb.up.bar + 8)) <= 1, "with the keyboard up the Sections sheet's top edge is 8px under the bar")
expect(worst(kb.closing) < STEP && oneWay(kb.closing, 1), `keyboard down: the sheet returns in steps under ${STEP}px and never jumps back`)
expect(Math.abs(kb.after - kb.before) <= 1, "and ends where it started, at half")
expect(Math.abs(kb.ai.top - kb.ai.safe) <= 1, "Ask Storelib with the keyboard keeps its top edge at the status bar")
expect(Number.isFinite(rot.landscape.top) && rot.landscape.height > 0 && rot.landscape.top >= 0, "in landscape the sheet has a finite, positive geometry")
expect(Math.abs(rot.back.top - rot.before.top) <= 1, "turned back, it is at half again")
expect(errors.length === 0, "no page errors")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("No sliver at any corner, no control loses its finger to the sheet, and the keyboard moves the sheet without a jump.\n")
