/**
 * ===========================================================================
 *  THE GALLERY'S SWIPE MOVES THE PICTURE, AND COSTS NOTHING TO MOVE IT
 * ===========================================================================
 * "The swiping is still not smooth. When I swipe between the images it has a
 * gap and it is not real time tracking with the touch."
 *
 * Three separate claims, and each is a number:
 *
 *   IS THE STRIP UNDER THE FINGER. Sampled mid-gesture: how far the strip has
 *   moved against how far the finger has moved. A carousel that watches for a
 *   threshold and then jumps scores zero here while still "working".
 *
 *   WHAT DOES A DRAG COST. React commits between the touch going down and
 *   coming up, counted with a Profiler. The version that kept the drag offset
 *   in state scored 30 for a 30-move drag: the whole gallery, every slide and
 *   every thumbnail, re-rendered on every frame of the gesture.
 *
 *   IS THERE A GAP. Whether the picture either side of the one on screen has
 *   actually been fetched. A neighbour left lazy is an empty box dragged into
 *   view halfway through the swipe, which is the "gap".
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A LIVE BROWSER, NOT --virtual-time-budget --dump-dom, which is what this
 * probe used to be. Embla animates on requestAnimationFrame, and under
 * virtual time there is no frame loop: the settle after a release never runs,
 * every reading is the position the strip had when the finger left it, and a
 * perfectly good carousel measures as broken. The page is driven over CDP
 * with real touch input instead, which is also what the phone sends.
 *
 *   pnpm build && node scripts/check-gallery-swipe.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-gallery-swipe-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-gallery-swipe.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
  `--outfile=${join(out, "probe.js")}`,
  /* Development, so React's Profiler reports commits. See the host file. */
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"development"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="development"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/*
  THE VIEWPORT META IS NOT BOILERPLATE HERE. Without it an emulated phone
  still lays out at 980px, so `matchMedia("(max-width: 767px)")` answers NO
  and every phone-only branch in the page is off — the full-screen viewer is
  not even mounted. The frame measured 390px throughout, because the host div
  is 390px wide, which is what made it look like a faithful phone.
*/
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#fff}</style></head><body><div id="app"></div><script src="probe.js"></script></body></html>`)

/**
 * WHERE THE STRIP IS, in pixels, relative to the slide it is resting on.
 *
 * The old reader parsed `translate3d(calc(P% + Dpx))` out of the inline
 * style, because the component wrote it that way. Embla writes plain pixels
 * to the same node, so the computed matrix is readable directly — and reading
 * the COMPUTED value is better anyway: a stylesheet can refuse a transform,
 * one did, and then the inline style is perfect while nothing has moved.
 */
const READ = `(() => {
  const frame = document.querySelector("[data-gallery-index]")
  if (!frame) return { found: false }
  const strip = frame.firstElementChild
  const computed = getComputedStyle(strip).transform
  let x = 0
  if (computed && computed !== "none") {
    const n = computed.slice(computed.indexOf("(") + 1, computed.lastIndexOf(")")).split(",").map(Number)
    x = n.length === 6 ? n[4] : n.length === 16 ? n[12] : 0
  }
  const index = Number(frame.getAttribute("data-gallery-index"))
  const width = Math.round(frame.getBoundingClientRect().width)
  return {
    found: true,
    index,
    width,
    computed,
    /* Offset from where this slide rests, which is what a finger drags. */
    offset: Math.round(x + index * width),
    slides: strip.children.length,
    touchAction: getComputedStyle(frame).touchAction,
    eager: [...frame.querySelectorAll("img")].map((i) => i.getAttribute("loading")),
    decoded: [...frame.querySelectorAll("img")].map((i) => i.complete && i.naturalWidth > 0),
  }
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-swipe-profile-"))
  /*
    A TOUCH-ONLY DEVICE, which is what this gallery is for. Headless Chromium
    reports a mouse by default, so `@media (hover: none)` never matched and an
    earlier round of this probe measured a page no phone ever sees — while a
    rule in globals.css deleted the strip's transform on every real phone.
  */
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
  /*
    A file:// script reports `Script error.` to window.onerror with no detail
    at all, so the page's own listener cannot say what broke. The protocol
    can: exceptionThrown carries the stack, and React logs its own failures
    through console.error.
  */
  const thrown = []
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id); return }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails
      thrown.push(`${d?.exception?.description || d?.text || "exception"}`.split("\n").slice(0, 4).join("\n      "))
    }
    if (msg.method === "Runtime.consoleAPICalled" && msg.params?.type === "error") {
      thrown.push((msg.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ").split("\n").slice(0, 4).join("\n      "))
    }
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
  await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
  await sleep(2500)
  /* Anything the page throws, so a blank probe reports the cause rather than
     a row of undefineds. */
  await ev(`window.__errors = []; window.addEventListener("error", e => window.__errors.push(String(e.message) + " @ " + (e.filename||"") + ":" + e.lineno)); window.addEventListener("unhandledrejection", e => window.__errors.push("rejected: " + String(e.reason && e.reason.message || e.reason))); true`)

  const point = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }]
  const down = (x, y) => send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x, y) })
  const move = (x, y) => send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x, y) })
  const up = () => send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })

  const report = {}
  report.atLoad = await ev(READ)
  if (!report.atLoad?.found) { reap(); fail("No gallery frame in the page. It did not render.") }
  const W = report.atLoad.width
  const y = 110
  const x0 = W - 30

  /*
    1. THE STRIP UNDER THE FINGER.

    Moved in 16ms steps, the way a finger produces them, and sampled after a
    short hold at each waypoint. The hold matters and is not slack in the
    test: Embla eases toward the pointer over a frame or two rather than
    teleporting, so a reading taken in the same millisecond as the last move
    catches it mid-approach and calls a carousel that is 1px out "not
    tracking". What is being claimed is that the picture sits under the
    finger, which is a question about where it comes to rest while the finger
    is still down, not about the interpolation on the way.
  */
  report.tracking = []
  await ev("window.__commits = 0; true")
  await down(x0, y)
  let at = 0
  for (const dx of [40, 110, 70, 30]) {
    const step = dx > at ? 6 : -6
    while (Math.abs(dx - at) > 6) { at += step; await move(x0 - at, y); await sleep(16) }
    at = dx
    await move(x0 - at, y)
    await sleep(140)
    const s = await ev(READ)
    report.tracking.push({ finger: -dx, strip: s.offset })
  }
  report.commitsDuringDrag = await ev("window.__commits")
  /* Back near the start, so the release is short of the commit point. */
  while (at > 20) { at -= 6; await move(x0 - at, y); await sleep(16) }
  await up()
  await sleep(1000)
  report.afterShortDrag = await ev(READ)

  /* 2. PAST THE COMMIT POINT IT CHANGES SLIDE, and settles cleanly. */
  await down(x0, y)
  for (let i = 1; i <= 20; i++) { await move(x0 - i * 11, y); await sleep(16) }
  await up()
  await sleep(1000)
  report.afterCommit = await ev(READ)

  /* 3. A VERTICAL SWIPE IS A SCROLL, not a sideways drag. */
  const before = (await ev(READ)).offset
  await down(x0, y)
  await move(x0 - 5, y - 40)
  await sleep(40)
  await move(x0 - 10, y - 120)
  await sleep(60)
  report.duringVertical = (await ev(READ)).offset - before
  await up()
  await sleep(600)

  /* 4. A THUMBNAIL CHANGES THE PICTURE. */
  report.thumbPressed = await ev(`(() => {
    const t = document.querySelectorAll("[data-gallery-thumb]")
    if (t.length < 3) return "only " + t.length + " thumbnails"
    t[2].click()
    return "pressed thumbnail 3"
  })()`)
  await sleep(1200)
  report.afterThumb = await ev(READ)

  /*
    5. OPENING A PICTURE MUST NOT LEAVE A BOX ROUND THE X.

    A dialog moves focus inside itself when it opens, and the first focusable
    thing in this one is the close button. iOS draws that focus: a blue
    rounded rectangle sitting around the X for as long as the viewer is open,
    on a control nobody has touched. Reported with a screenshot.

    So: who holds focus after a tap opens it, and does the close button paint
    an outline or a ring.
  */
  await ev(`(() => {
    window.__tapClicks = 0
    const f = document.querySelector("[data-gallery-index]")
    f.addEventListener("click", () => { window.__tapClicks++ }, true)
    window.__viewerMounted = () => !!document.querySelector('[data-slot="dialog-portal"], [role="dialog"]')
    return true
  })()`)
  await down(Math.round(W / 2), y)
  await sleep(60)
  await up()
  await sleep(900)
  report.tapClicks = await ev("window.__tapClicks")
  report.why = await ev(`({
    phoneMedia: window.matchMedia("(max-width: 767px)").matches,
    innerWidth: window.innerWidth,
    anyDialog: !!document.querySelector('[role="dialog"]'),
    bodyTail: document.body.lastElementChild ? document.body.lastElementChild.tagName + "." + String(document.body.lastElementChild.className).slice(0,40) : null,
  })`)
  report.viewer = await ev(`(() => {
    const close = document.querySelector('button[aria-label="Close"]')
    if (!close) return { open: false }
    const a = document.activeElement
    const cs = getComputedStyle(close)
    return {
      open: true,
      focused: a === close ? "the close button" : (a && a.getAttribute ? (a.getAttribute("aria-label") || a.tagName.toLowerCase()) : String(a)),
      outlineStyle: cs.outlineStyle,
      outlineWidth: cs.outlineWidth,
      boxShadow: cs.boxShadow,
    }
  })()`)

  report.errors = thrown
  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return report
}

const r = await main()
const problems = []
console.log("")
if (r.errors?.length) {
  console.error("  the page threw:")
  for (const e of r.errors) console.error(`    ${e}`)
  console.error("")
}
console.log(`  frame ${r.atLoad.width}px, ${r.atLoad.slides} slides, touch-action: ${r.atLoad.touchAction}`)
for (const t of r.tracking) console.log(`  finger ${String(t.finger).padStart(5)}px -> strip ${String(t.strip).padStart(5)}px`)
console.log(`  a ${r.tracking.length}-sample drag cost ${r.commitsDuringDrag} React commit${r.commitsDuringDrag === 1 ? "" : "s"}`)
console.log(`  short drag released -> slide ${r.afterShortDrag.index}, resting at ${r.afterShortDrag.offset}px`)
console.log(`  drag past the commit point -> slide ${r.afterCommit.index}, resting at ${r.afterCommit.offset}px`)
console.log(`  vertical swipe moved the strip ${r.duringVertical}px`)
console.log(`  ${r.thumbPressed} -> slide ${r.afterThumb.index}`)
console.log(`  images: loading=${JSON.stringify(r.afterThumb.eager)} decoded=${JSON.stringify(r.afterThumb.decoded)}`)
console.log(`  computed transform: ${r.afterThumb.computed}`)
if (r.viewer?.open) {
  console.log(`  viewer opened: focus is on ${r.viewer.focused}, close button outline ${r.viewer.outlineStyle} ${r.viewer.outlineWidth}, shadow ${r.viewer.boxShadow}`)
} else {
  console.log(`  viewer did not open on a tap (clicks on the frame: ${r.tapClicks}, ${JSON.stringify(r.why)})`)
}
console.log("")

/* THE CLAIM: the picture is under the finger, the whole way. */
for (const t of r.tracking) {
  if (Math.abs(t.strip - t.finger) > 8) {
    problems.push(`The finger was ${t.finger}px in and the strip was at ${t.strip}px. It is not tracking.`)
  }
}
/* A drag costs no renders. Not zero, because the touch going down and coming
   up each flip a flag; anything above that is per-frame work. */
if (r.commitsDuringDrag > 2) {
  problems.push(`The drag cost ${r.commitsDuringDrag} React commits of the gallery. Moving a strip is a transform on one node and needs none.`)
}
if (r.afterShortDrag.index !== 0) problems.push(`A 20px drag left it on slide ${r.afterShortDrag.index}. That is short of the commit point and should spring back.`)
if (Math.abs(r.afterShortDrag.offset) > 2) problems.push(`After springing back the strip is ${r.afterShortDrag.offset}px off its slide. It did not settle.`)
if (r.afterCommit.index !== 1) problems.push(`A drag past the commit point left it on slide ${r.afterCommit.index}, not 1.`)
if (Math.abs(r.afterCommit.offset) > 2) problems.push(`After committing the strip is ${r.afterCommit.offset}px off its slide. It did not settle.`)
if (Math.abs(r.duringVertical) > 2) problems.push(`A vertical swipe dragged the strip ${r.duringVertical}px sideways. That is the page twitching while somebody reads it.`)
if (r.afterThumb.index !== 2) problems.push(`Pressing thumbnail 3 left the gallery on slide ${r.afterThumb.index}.`)
if (r.afterThumb.computed === "none") {
  problems.push("The browser computed the strip's transform as `none`, so a stylesheet refused it and nothing moves on screen. See data-keep-transform.")
}
if (!/pan-y/.test(r.afterThumb.touchAction)) {
  problems.push(`touch-action is ${r.afterThumb.touchAction}. Without pan-y a finger that starts on a picture cannot scroll the page.`)
}
/* THE GAP: the neighbour has to be fetched before it is dragged into view. */
{
  const i = r.afterThumb.index
  const neighbours = [i - 1, i + 1].filter((n) => n >= 0 && n < r.afterThumb.eager.length)
  const lazy = neighbours.filter((n) => r.afterThumb.eager[n] === "lazy")
  if (lazy.length) {
    problems.push(`Slide ${i} is showing and its neighbour${lazy.length > 1 ? "s" : ""} ${lazy.join(" and ")} ${lazy.length > 1 ? "are" : "is"} still lazy. Dragging toward a picture nobody has fetched is the gap.`)
  }
}

/* THE BLUE BOX: nothing is focused into the X, and it paints no ring. */
if (!r.viewer?.open) {
  problems.push("A tap on the picture did not open the full-screen viewer.")
} else {
  if (r.viewer.focused === "the close button") {
    problems.push("Opening the viewer put focus on the close button, which is the blue rectangle drawn around the X.")
  }
  if (r.viewer.outlineStyle !== "none" && r.viewer.outlineWidth !== "0px") {
    problems.push(`The close button paints an outline (${r.viewer.outlineStyle} ${r.viewer.outlineWidth}) without being tabbed to.`)
  }
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The picture is under the finger, it settles on a slide, and the neighbours are already there.\n")
