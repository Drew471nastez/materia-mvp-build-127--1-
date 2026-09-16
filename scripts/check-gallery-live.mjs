/**
 * ===========================================================================
 *  THE GALLERY, ON THE LIVE SITE, UNDER A REAL FINGER
 * ===========================================================================
 * scripts/check-gallery-swipe mounts the component in a harness with the
 * production stylesheet, which is the right place to iterate. This asks the
 * same question of the deployed page, because the two things that have broken
 * this gallery before were both environmental: a stylesheet rule that only
 * applies on a touch device, and an overlay that only exists in the real page.
 *
 *   node scripts/check-gallery-live.mjs
 *   URL=https://storelib.com/<handle>/<slug> node scripts/check-gallery-live.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const START = process.env.URL ?? "https://storelib.com/andrewrullz/men-s-white-t-shirt"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (!proxy) return flags
  flags.push(`--proxy-server=${proxy}`)
  for (const ca of ["/root/.ccr/agent-proxy-ca.crt", "/root/.ccr/ca-bundle.crt"]) {
    if (!existsSync(ca)) continue
    try {
      const pem = execFileSync("openssl", ["x509", "-in", ca, "-pubkey", "-noout"], { encoding: "buffer" })
      const spki = createHash("sha256").update(execFileSync("openssl", ["pkey", "-pubin", "-outform", "der"], { input: pem })).digest("base64")
      flags.push(`--ignore-certificate-errors-spki-list=${spki}`)
      break
    } catch { /* fall through */ }
  }
  return flags
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-livegallery-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=430,900", ...reachabilityFlags(), "about:blank",
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
  const docRequests = []
  let mainFrameId = null
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id); return }
    /*
      Navigations of the PAGE, so "was coming back free?" is answered by
      evidence rather than by feel.

      THE MAIN FRAME ONLY. An iframe is a document too, and this creator's page
      embeds three YouTube players — so counting every Document request made
      the probe report a free, 52ms client navigation back as "a full load".
      The page has one main frame and its id does not change across a client
      navigation; everything else is somebody's embed.
    */
    if (msg.method === "Network.requestWillBeSent" && msg.params?.type === "Document") {
      const isMain = mainFrameId && msg.params.frameId === mainFrameId
      docRequests.push({ url: msg.params.request.url, at: Date.now(), isMain: !!isMain })
    }
  })
  let sessionId = null
  const send = (method, params = {}, session = sessionId) =>
    new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
  const evaluate = async (expr) => {
    const { result } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
    return result?.value
  }

  const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable")
  mainFrameId = (await send("Page.getFrameTree"))?.frameTree?.frame?.id ?? null
  if (!mainFrameId) { reap(); fail("Could not identify the page's main frame, so a page load could not be told from an embed.") }
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

  const report = { start: START }
  await send("Page.navigate", { url: START })
  await sleep(9000)

  const found = await evaluate(`(() => {
    const wrapper = document.querySelector(".swiper-wrapper")
    if (!wrapper) return { ok: false, reason: "no .swiper-wrapper on the page" }
    const slides = wrapper.querySelectorAll(".swiper-slide").length
    const box = wrapper.getBoundingClientRect()
    return { ok: true, slides, top: Math.round(box.top), height: Math.round(box.height), width: Math.round(box.width) }
  })()`)
  report.gallery = found
  if (!found?.ok) { reap(); fail(`Gallery not found on the live page: ${found?.reason ?? "no result"}`) }
  if (found.slides < 2) { reap(); fail(`Only ${found.slides} slide on this product, so a swipe has nothing to prove. Pass URL= a product with several pictures.`) }

  /* Scroll it into view, then read where it actually sits. */
  await evaluate(`document.querySelector(".swiper-wrapper").scrollIntoView({ block: "center" }); "ok"`)
  await sleep(900)
  const at = await evaluate(`(() => {
    const b = document.querySelector(".swiper-wrapper").getBoundingClientRect()
    return { x: Math.round(b.left + b.width * 0.72), y: Math.round(b.top + b.height / 2), w: Math.round(b.width) }
  })()`)
  report.dragFrom = at

  const READ = `(() => {
    const w = document.querySelector(".swiper-wrapper")
    const c = getComputedStyle(w).transform
    let x = 0
    if (c && c !== "none") {
      const n = c.slice(c.indexOf("(") + 1, c.lastIndexOf(")")).split(",").map(Number)
      x = n.length === 6 ? n[4] : n.length === 16 ? n[12] : 0
    }
    return { computed: c, x: Math.round(x) }
  })()`

  const rest = await evaluate(READ)
  report.restingAt = rest

  const point = (x, y) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }]
  const down = (x, y) => send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(x, y) })
  const move = (x, y) => send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(x, y) })
  const up = () => send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })

  /* 1. Does the picture follow the finger. */
  report.tracking = []
  await down(at.x, at.y)
  let travelled = 0
  for (const target of [40, 100]) {
    while (travelled < target) { travelled += 8; await move(at.x - travelled, at.y); await sleep(16) }
    await sleep(140)
    const now = await evaluate(READ)
    report.tracking.push({ finger: -travelled, strip: now.x - rest.x })
  }
  await up()
  await sleep(700)
  report.slowShortRelease = (await evaluate(READ)).x - rest.x

  /*
    2. A FLICK, AND IT IS A DIFFERENT QUESTION FROM A DRAG.

    Swiper commits a SLOW drag only past half the slide (longSwipesRatio 0.5)
    and commits a QUICK one at any distance (shortSwipes). Those are its
    defaults and they are what was asked for, so both are checked rather than
    one number being asserted for both.

    The first version of this probe dragged 100px of a 406px strip, paused
    140ms so the release velocity was zero, and then required a commit. That
    is a slow quarter-drag: springing back is correct, and the probe was
    reporting the library behaving exactly as documented as a fault.
  */
  const flickFrom = at.x
  await down(flickFrom, at.y)
  let f = 0
  while (f < 90) { f += 18; await move(flickFrom - f, at.y); await sleep(8) }
  await up()
  await sleep(900)
  report.afterFlick = (await evaluate(READ)).x - rest.x

  /*
    3. A LONG SLOW DRAG, WHICH COMMITS ON DISTANCE ALONE — and it goes the
    OTHER WAY, back toward the first picture.

    The flick above left the strip on the second slide, and this product has
    two. Dragging further in the same direction from the last picture cannot
    advance, so the first version of this asked the gallery to do something
    impossible and reported the refusal as a fault. Rubber-banding at the end
    is correct behaviour, not a failure to commit.
  */
  /*
    BOTH ENDS OF THIS DRAG HAVE TO CLEAR THE ARROWS. Each is about 36px wide,
    inset 8px from its side, and Swiper lets a button keep its own gesture —
    so a drag that begins on one begins nothing. The first attempt at this
    started at 0.62 of the width to the LEFT of the drag point, which landed
    on the previous arrow, and reported a gallery that works as broken.

    0.15 to 0.77 of the strip is inside both arrows and is a 62% drag.
  */
  const far = Math.round(found.width * 0.62)
  const startX = Math.round(at.x - found.width * 0.57)
  await down(startX, at.y)
  let g = 0
  while (g < far) { g += 10; await move(startX + g, at.y); await sleep(16) }
  await sleep(160)
  await up()
  await sleep(900)
  report.afterLongDrag = (await evaluate(READ)).x - rest.x

  console.log("")
  console.log(`  ${found.slides} pictures, strip ${found.width}px wide, dragged from x=${at.x}`)
  for (const t of report.tracking) {
    console.log(`  finger ${String(t.finger).padStart(5)}px -> strip ${String(t.strip).padStart(5)}px`)
  }
  console.log(`  slow 100px drag released     -> ${report.slowShortRelease}px (a quarter of a slide: springs back)`)
  console.log(`  quick 90px flick             -> ${report.afterFlick}px`)
  console.log(`  slow drag back past 62%      -> ${report.afterLongDrag}px (back to the first picture)`)
  console.log("")

  const problems = []
  if (report.restingAt.computed === "none") {
    problems.push("The strip's computed transform is `none` on the live page, so a stylesheet refused it and nothing can move. See the .swiper-wrapper exemption in globals.css.")
  }
  for (const t of report.tracking) {
    if (Math.abs(t.strip - t.finger) > 10) {
      problems.push(`The finger was ${t.finger}px in and the strip had moved ${t.strip}px. It is not tracking the finger.`)
    }
  }
  const slide = found.width
  if (Math.abs(report.slowShortRelease) > 10) {
    problems.push(`A slow quarter-drag should spring back and it rested at ${report.slowShortRelease}px.`)
  }
  if (Math.abs(report.afterFlick) < slide * 0.5) {
    problems.push(`A quick flick did not change picture: the strip rests at ${report.afterFlick}px of a ${slide}px slide. shortSwipes is what makes a flick count however short it is.`)
  }
  if (Math.abs(report.afterLongDrag) > 10) {
    problems.push(`A slow drag back past 62% of the slide did not return to the first picture: the strip rests at ${report.afterLongDrag}px.`)
  }

  reap()
  if (problems.length) {
    console.error("PROBLEMS:\n  - " + problems.join("\n  - ") + "\n")
    process.exit(1)
  }
  console.log("On the live site: the picture follows the finger and a flick lands on the next one.\n")
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
