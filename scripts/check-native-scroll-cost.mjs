/**
 * ===========================================================================
 *  WHY THE APP DOES NOT SCROLL LIKE THE BROWSER DOES
 * ===========================================================================
 * "The iOS and Android app doesn't feel as smooth as the same site does in
 * Safari or Chrome."
 *
 * Safari loads the SAME site from the SAME deployment, so nothing shared
 * between the two can explain a difference. What is left is the code that
 * only runs inside the shell, and almost all of it is gated on one class:
 * `html.capacitor`, set before first paint by the native wrapper.
 *
 * The heaviest thing behind that gate is components/platform/capacitor-bounce-
 * guard: a `touchmove` listener on `document`, registered `{ passive: false }`,
 * which on every single move walks from the touch target up to <html> calling
 * `getComputedStyle` on each ancestor and reading `scrollHeight`, `clientHeight`
 * and `scrollTop` off them.
 *
 * Two separate costs, and they compound:
 *
 *   A NON-PASSIVE touchmove listener on the document tells the browser that
 *   this handler MIGHT call preventDefault, so the compositor may not move
 *   the page until the main thread has run it. Scrolling stops being a
 *   compositor job and becomes a main-thread job, on every frame of every
 *   gesture. In Safari the listener is not there at all, because the class is
 *   not there.
 *
 *   `getComputedStyle` FORCES A STYLE RECALCULATION, and reading scrollHeight
 *   forces layout. Doing that per ancestor per move is the expensive kind of
 *   work to put in front of a scroll.
 *
 * This measures both, on the real component, with real touch input:
 *
 *   node scripts/check-native-scroll-cost.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const out = mkdtempSync(join(tmpdir(), "storelib-native-scroll-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-bounce-guard.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/**
 * The instrument, and it has to run BEFORE the bundle: it counts what the
 * guard does by wrapping what the guard calls. Nothing in the component is
 * modified, which is the point — a probe that edits its subject measures the
 * edit.
 *
 * `?native=0` leaves the class off, which is the browser. Same page, same
 * build, one class different, which is exactly the comparison being asked
 * about.
 */
const INSTRUMENT = `
var NATIVE = !/[?&]native=0/.test(location.search)
if (NATIVE) document.documentElement.classList.add("capacitor")
window.__m = { styleCalls: 0, handlerMs: 0, moves: 0, nonPassiveMoveListeners: 0, listeners: [] }

var gcs = window.getComputedStyle.bind(window)
window.getComputedStyle = function () { window.__m.styleCalls++; return gcs.apply(null, arguments) }

var add = EventTarget.prototype.addEventListener
EventTarget.prototype.addEventListener = function (type, fn, opts) {
  if (type === "touchmove" && !window.__m.sealed && (this === document || this === window || this === document.body)) {
    var passive = opts && typeof opts === "object" ? opts.passive : undefined
    window.__m.listeners.push({ on: this === document ? "document" : this === window ? "window" : "body", passive: passive })
    if (passive !== true) window.__m.nonPassiveMoveListeners++
    var wrapped = function (e) {
      var t0 = performance.now()
      try { return fn.apply(this, arguments) } finally {
        window.__m.handlerMs += performance.now() - t0
        window.__m.moves++
      }
    }
    return add.call(this, type, wrapped, opts)
  }
  return add.call(this, type, fn, opts)
}
`

async function main(nativeOn) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-native-scroll-profile-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    "--blink-settings=availableHoverTypes=1,primaryHoverType=1,availablePointerTypes=4,primaryPointerType=4",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=390,844", "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] })
  const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
  for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

  const portFile = join(profile, "DevToolsActivePort")
  let port = null
  for (let i = 0; i < 80 && !port; i++) {
    if (existsSync(portFile)) {
      const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
      if (first) port = Number(first)
    }
    if (!port) await sleep(250)
  }
  if (!port) { reap(); fail("Chromium never reported a debugging port.") }
  let version = null
  for (let i = 0; i < 40 && !version; i++) {
    try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
  }
  if (!version) { reap(); fail("Chromium did not answer on its port.") }

  const ws = new WebSocket(version.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
  let id = 0
  const pending = new Map()
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const ev = async (expr) => {
    const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await send("Page.navigate", { url: `file://${join(out, "index.html")}${nativeOn ? "" : "?native=0"}` })
  await sleep(2500)

  /*
    AND IT STILL HAS TO DO ITS JOB. Cheap is not the claim on its own: the
    guard exists to veto the move that would rubber-band, and the decisions
    it used to make per frame are now made once per gesture. So the three
    cases are driven and the veto is read off the event.

    Registered AFTER the component's, on the same target and the same phase,
    so it runs second and sees whether the guard called preventDefault.
  */
  await ev(`(() => {
    /* Sealed first, so the probe's own listener is not counted as the page's
       work. Without this the report charges the app for the instrument. */
    window.__m.sealed = true
    window.__veto = []
    document.addEventListener("touchmove", (e) => { window.__veto.push(e.defaultPrevented) }, { passive: true })
    return true
  })()`)

  const x = 195
  const dragFrom = async (startY, dy, steps = 6) => {
    await ev("window.__veto = []; true")
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY, radiusX: 12, radiusY: 12, force: 1 }] })
    for (let i = 1; i <= steps; i++) {
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: startY + (dy * i) / steps, radiusX: 12, radiusY: 12, force: 1 }] })
      await sleep(16)
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(200)
    const v = await ev("window.__veto")
    return v.length > 0 && v.every(Boolean)
  }

  const behaviour = {}
  await ev("window.scrollTo(0, 0); true")
  await sleep(250)
  /* At the very top, pulling DOWN is the bounce. It must be vetoed. */
  behaviour.vetoedAtTop = await dragFrom(300, 160)
  /* In the middle, an ordinary scroll must be left alone. */
  await ev("window.scrollTo(0, 800); true")
  await sleep(250)
  behaviour.vetoedMidPage = await dragFrom(600, -160)
  /* At the bottom, pushing UP is the bounce. */
  await ev("window.scrollTo(0, document.documentElement.scrollHeight); true")
  await sleep(300)
  behaviour.vetoedAtBottom = await dragFrom(600, -160)
  await ev("window.scrollTo(0, 0); true")
  await sleep(250)

  /*
    ── AND A PAGE THAT GROWS WHILE THE FINGER IS ON IT ────────────────────
    The guard reads the page's height once, when the finger lands, and used
    to hold that number for the whole gesture. The dashboard loads its chart through a dynamic import with
    `ssr: false`, so a 200px skeleton becomes the real chart while somebody is
    already dragging, and every image that arrives moves the bottom again.

    A height that is too small makes the boundary test read TRUE half a page
    early, and from that moment every downward move in the gesture is
    cancelled: the scroll stops answering part way down for no visible
    reason. Reported as "at some point when I scroll down it lags really
    weirdly and I don't know why".

    So: stand near the bottom of a SHORT page, start a drag, grow the page
    under the finger, and keep dragging. That is now an ordinary mid-page
    scroll and must be left alone.
  */
  await ev(`(() => {
    const page = document.getElementById("page")
    window.__tail = document.createElement("div")
    window.__tail.style.height = "2000px"
    /* Hidden until the gesture is under way, so the page really does change
       size between touchstart and touchmove rather than before either. */
    window.__tail.style.display = "none"
    page.appendChild(window.__tail)
    window.scrollTo(0, document.documentElement.scrollHeight)
    return true
  })()`)
  await sleep(250)
  await ev("window.__veto = []; true")
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 600, radiusX: 12, radiusY: 12, force: 1 }] })
  /* The page grows AFTER the finger has landed, which is when the guard has
     already taken its measurement. */
  await ev('window.__tail.style.display = "block"; true')
  await sleep(32)
  for (let i = 1; i <= 6; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 600 - (160 * i) / 6, radiusX: 12, radiusY: 12, force: 1 }] })
    await sleep(16)
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(200)
  const grew = await ev("window.__veto")
  behaviour.vetoedAfterPageGrew = grew.length > 0 && grew.every(Boolean)
  await ev('window.__tail.remove(); window.scrollTo(0, 0); true')
  await sleep(250)

  /* A scroll, the way a thumb does it: down, forty moves, up. */
  await ev("window.__m.styleCalls = 0; window.__m.handlerMs = 0; window.__m.moves = 0; true")
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: 700, radiusX: 12, radiusY: 12, force: 1 }] })
  for (let i = 1; i <= 40; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: 700 - i * 12, radiusX: 12, radiusY: 12, force: 1 }] })
    await sleep(16)
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(400)

  const m = await ev("window.__m")
  m.behaviour = behaviour
  m.scrolled = await ev("Math.round(window.scrollY)")
  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return m
}

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#fff}</style>
<script>${INSTRUMENT}</script></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

const native = await main(true)
const browser = await main(false)

const line = (label, m) => {
  console.log(`  ${label}`)
  console.log(`    touchmove listeners on document/window: ${m.listeners.length} (${m.nonPassiveMoveListeners} of them non-passive)`)
  console.log(`    the gesture: ${m.moves} moves handled, ${m.handlerMs.toFixed(1)}ms of main thread in them`)
  console.log(`    ${m.moves ? (m.handlerMs / m.moves).toFixed(2) : "0.00"}ms per move, ${m.styleCalls} forced style recalculations`)
  console.log(`    page scrolled ${m.scrolled}px`)
  console.log(`    bounce vetoed at the top: ${m.behaviour.vetoedAtTop}, at the bottom: ${m.behaviour.vetoedAtBottom}, mid-page: ${m.behaviour.vetoedMidPage}`)
  console.log(`    and after the page grew under the finger: ${m.behaviour.vetoedAfterPageGrew}`)
  console.log("")
}

console.log("\n  The same page, the same build, one class different.\n")
line("in the app  (html.capacitor)", native)
line("in a browser (no class)", browser)

const problems = []
if (native.nonPassiveMoveListeners > 0) {
  problems.push(`The app registers ${native.nonPassiveMoveListeners} non-passive touchmove listener${native.nonPassiveMoveListeners > 1 ? "s" : ""} on the document and the browser registers ${browser.nonPassiveMoveListeners}. A non-passive listener means the compositor may not scroll until the main thread has run it, on every frame of every gesture.`)
}
if (native.styleCalls > browser.styleCalls + 20) {
  problems.push(`One 40-move scroll forced ${native.styleCalls} style recalculations in the app against ${browser.styleCalls} in the browser. getComputedStyle in a touchmove handler is a forced recalc per call.`)
}
if (native.handlerMs > 8) {
  problems.push(`${native.handlerMs.toFixed(1)}ms of main thread went into touchmove handlers during one scroll (${(native.handlerMs / Math.max(1, native.moves)).toFixed(2)}ms per move). At 60fps a frame is 16.7ms and this is spent before the page has moved at all.`)
}

/*
  CHEAP IS NOT ENOUGH ON ITS OWN. The guard has one job and the refactor moved
  every decision it makes to touchstart; these say it still makes them.
*/
if (!native.behaviour.vetoedAtTop) problems.push("At the top of the page a downward drag was NOT vetoed. That is the rubber-band the guard exists to stop.")
if (!native.behaviour.vetoedAtBottom) problems.push("At the bottom of the page an upward drag was NOT vetoed. That is the rubber-band the guard exists to stop.")
if (native.behaviour.vetoedMidPage) problems.push("An ordinary mid-page scroll was vetoed. The guard is blocking scrolling rather than bouncing.")
if (native.behaviour.vetoedAfterPageGrew) problems.push("A scroll was vetoed because the page grew after the finger landed. The guard is holding a height that is no longer true, so the scroll stops answering part way down.")

if (problems.length) {
  console.error(`${problems.length} finding${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The shell costs no more per scroll frame than the browser does.\n")
