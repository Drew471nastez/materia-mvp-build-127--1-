/**
 * ===========================================================================
 *  THE GALLERY ON A REAL PRODUCT PAGE, DRIVEN LIKE A VISITOR
 * ===========================================================================
 * Reported: pressing a thumbnail does not change the picture, swiping does not
 * change the picture, and when the picture does change nothing is shown.
 *
 * The probe that accompanied the strip measured the TRANSFORM — where the
 * strip was — and it was right about that and blind to this. A strip can move
 * perfectly while every picture on it is invisible, and that is a different
 * question with a different answer: is the image that is now in front of me
 * actually loaded and actually painted.
 *
 * So this drives a real product page over CDP and asks that question.
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
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/andrewrullz/men-s-white-t-shirt"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The same pin the client-error gate uses; see its note. */
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
    } catch { /* let the run fail loudly instead */ }
  }
  return flags
}

/** Read inside the page: which slide is in front, and is its picture there. */
const READ = `(() => {
  const frame = document.querySelector(".aspect-video.overflow-hidden")
  if (!frame) return { found: false }
  const strip = frame.firstElementChild
  const box = frame.getBoundingClientRect()
  const stripRect = strip.getBoundingClientRect()
  const stripInfo = {
    left: Math.round(stripRect.left - frame.getBoundingClientRect().left),
    width: Math.round(stripRect.width),
    computed: getComputedStyle(strip).transform,
    display: getComputedStyle(strip).display,
  }
  const slides = [...strip.children].map((s, i) => {
    const img = s.querySelector("img")
    const r = s.getBoundingClientRect()
    return {
      i,
      hasImg: !!img,
      complete: img ? img.complete : null,
      naturalWidth: img ? img.naturalWidth : null,
      loadingAttr: img ? img.getAttribute("loading") : null,
      opacity: img ? Math.round(parseFloat(getComputedStyle(img).opacity) * 100) / 100 : null,
      src: img ? (img.currentSrc || img.src || "").slice(-70) : null,
      /* Is this slide the one filling the frame right now? */
      inFront: Math.abs(r.left - box.left) < 4,
      offset: Math.round(r.left - box.left),
      width: Math.round(r.width),
    }
  })
  /* The hook if this build has it, and the deployed markup's own aria-label
     if it does not — so the probe works against production as well as against
     a local build. */
  const allFrames = [...document.querySelectorAll(".aspect-video.overflow-hidden")].map((f, n) => {
    const st = f.firstElementChild
    return {
      n,
      visible: f.getBoundingClientRect().width > 0 && getComputedStyle(f).display !== "none",
      width: Math.round(f.getBoundingClientRect().width),
      transform: st ? (st.getAttribute("style") || "").slice(0, 70) : "(no strip)",
      slides: st ? st.children.length : 0,
    }
  })
  const thumbs = (document.querySelectorAll("[data-gallery-thumb]").length
    || document.querySelectorAll('button[aria-label^="View image"], button[aria-label^="View video"]').length)
  return { found: true, slides, thumbs, frameWidth: Math.round(box.width), allFrames, stripInfo }
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-gallery-live-"))
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
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
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
  await send("Page.enable")
  await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await send("Page.navigate", { url: URL_UNDER_TEST })
  await sleep(9000)

  const report = { url: URL_UNDER_TEST }
  report.atLoad = await evaluate(READ)
  if (!report.atLoad?.found) { reap(); fail(`No gallery found on ${URL_UNDER_TEST}.`) }

  /* Press the second thumbnail, the way a visitor does. */
  report.thumbClicked = await evaluate(`(() => {
    const t = document.querySelectorAll("[data-gallery-thumb]").length
      ? document.querySelectorAll("[data-gallery-thumb]")
      : document.querySelectorAll('button[aria-label^="View image"], button[aria-label^="View video"]')
    if (t.length < 2) return "only " + t.length + " thumbnails"
    t[1].click()
    return "pressed thumbnail 2 (" + t[1].getAttribute("aria-label") + ")"
  })()`)
  await sleep(1400)
  report.afterThumb = await evaluate(READ)

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return report
}

const r = await main()
const show = (label, s) => {
  console.log(`\n  ${label}  (frame ${s.frameWidth}px, ${s.thumbs} thumbnails)`)
  console.log(`    strip: left ${s.stripInfo.left}px, width ${s.stripInfo.width}px, display ${s.stripInfo.display}, computed transform ${s.stripInfo.computed}`)
  for (const sl of s.slides) {
    console.log(`    slide ${sl.i}${sl.inFront ? " <- in front" : "        "}  offset ${String(sl.offset).padStart(5)}px  width ${sl.width}  img ${sl.hasImg ? "yes" : "NO "}  complete=${sl.complete}  opacity=${sl.opacity}`)
  }
}
console.log(`\n${r.url}`)
show("on load", r.atLoad)
console.log(`\n  ${r.thumbClicked}`)
show("after pressing thumbnail 2", r.afterThumb)

const problems = []
const front = r.afterThumb.slides.find((s) => s.inFront)
if (!front) problems.push("After pressing thumbnail 2, no slide is aligned with the frame. The strip did not move.")
else {
  if (front.i !== 1) problems.push(`Thumbnail 2 was pressed and slide ${front.i} is in front, not slide 1.`)
  if (!front.complete || !front.naturalWidth) {
    problems.push(`The slide now in front has an image that has not loaded (complete=${front.complete}, naturalWidth=${front.naturalWidth}). A visitor is looking at an empty box.`)
  }
  if (front.opacity !== null && front.opacity < 0.9) {
    problems.push(`The slide now in front is at opacity ${front.opacity}. It is loaded or not, but either way it is not being shown.`)
  }
}
if (r.atLoad.thumbs < 2) problems.push(`Only ${r.atLoad.thumbs} thumbnails found, so pressing one could not be tested. Check the data-gallery-thumb hook.`)

console.log("")
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Pressing a thumbnail brings that picture to the front, loaded and visible.\n")
