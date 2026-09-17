/**
 * ===========================================================================
 *  WHAT THE TOP OF THE PAGE DOES WHILE IT LOADS
 * ===========================================================================
 * Reported as "when I refresh the explore page the header appears for one
 * second during the transition", with a screenshot of the page rendered with
 * no black bar at the top at all.
 *
 * There are two different faults that look like that and they need different
 * fixes, so this measures rather than guesses:
 *
 *   THE HEADER IS ABSENT AND THEN ARRIVES. Its height goes 0 -> 65 partway
 *   through the load and everything below it is pushed down. A jump.
 *
 *   THE HEADER IS THERE THE WHOLE TIME but the content under it moves for
 *   its own reasons.
 *
 * A sampler is installed before any of the page's own script runs, and it
 * records the header's height and the heading's position on every frame from
 * the first one. The CPU is throttled so the window is wide enough to see.
 *
 *   node scripts/check-header-on-load.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/explore"
const CPU_THROTTLE = Number(process.env.CPU ?? 4)
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
    } catch { /* let it fail loudly instead */ }
  }
  return flags
}

/* Installed before the page's own script. Records one row per frame. */
const SAMPLER = `
(() => {
  window.__hdr = []
  var t0 = performance.now()
  function read() {
    try {
      var root = document.getElementById("platform-header-root")
      var h = root ? Math.round(root.getBoundingClientRect().height) : -1
      /* The VISIBLE landmark. This was "h1, h2, [data-explore-search-anchor]"
         and the first match is the hero's sr-only h1, which is positioned
         absolutely and clipped to a pixel: its rect says nothing about where
         the page is. The search field is a real box in the flow. */
      var heading = document.querySelector("[data-explore-search-anchor]")
      var top = heading ? Math.round(heading.getBoundingClientRect().top) : null
      /* Is the stylesheet applied yet? The bar is bg-black, so if its
         computed background is not black the page is rendering unstyled and
         every height read here is a natural-flow height, not a laid-out one. */
      var styled = root ? getComputedStyle(root.firstElementChild || root).backgroundColor : ""
      var css = styled === "rgb(0, 0, 0)"
      var last = window.__hdr[window.__hdr.length - 1]
      if (!last || last.h !== h || last.top !== top || last.css !== css) {
        window.__hdr.push({ t: Math.round(performance.now() - t0), h: h, top: top, css: css })
      }
    } catch (e) {}
    if (performance.now() - t0 < 8000) requestAnimationFrame(read)
  }
  requestAnimationFrame(read)
})()
`

const proc = spawn(CHROMIUM, [
  "--headless=new",
  "--remote-debugging-port=0",
  "--no-sandbox",
  "--disable-gpu",
  "--hide-scrollbars",
  ...reachabilityFlags(),
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
let endpoint = ""
proc.stderr.on("data", (b) => {
  const m = String(b).match(/ws:\/\/[^\s]+/)
  if (m && !endpoint) endpoint = m[0]
})
for (let i = 0; i < 100 && !endpoint; i++) await sleep(100)
if (!endpoint) { proc.kill("SIGKILL"); fail("Chromium never printed a debugging endpoint.") }

const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach")) })
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
    ws.send(JSON.stringify(sessionId == null ? { id: n, method, params } : { id: n, method, params, sessionId }))
  })

async function run(width) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 2, mobile: width < 700 })
  await call("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })
  await call("Page.addScriptToEvaluateOnNewDocument", { source: SAMPLER })
  await call("Page.navigate", { url: URL_UNDER_TEST })
  await sleep(9000)
  const r = await call("Runtime.evaluate", { expression: "JSON.stringify(window.__hdr || [])", returnByValue: true })
  /* A height on its own does not say what grew. This asks the element. */
  const shape = await call("Runtime.evaluate", {
    expression: `JSON.stringify((() => {
      var root = document.getElementById("platform-header-root")
      if (!root) return { root: "absent" }
      var kids = [].slice.call(root.children).map(function (c) {
        var b = c.getBoundingClientRect()
        return c.tagName.toLowerCase() + "." + String(c.className).split(" ").slice(0, 3).join(".") + " " + Math.round(b.height) + "px"
      })
      var b = root.getBoundingClientRect()
      return { height: Math.round(b.height), position: getComputedStyle(root).position, kids: kids }
    })())`,
    returnByValue: true,
  })
  await send("Target.closeTarget", { targetId }, null)
  return { samples: JSON.parse(r.result.value || "[]"), shape: JSON.parse(shape.result.value || "{}") }
}

const { samples: phone, shape } = await run(390)
ws.close()
proc.kill("SIGKILL")

console.log(`\n${URL_UNDER_TEST} at 390px, CPU throttled ${CPU_THROTTLE}x\n`)
console.log("      t     header   heading   stylesheet")
for (const s of phone) {
  const h = s.h < 0 ? "absent" : `${s.h}px`
  console.log(`  ${String(s.t).padStart(5)}ms   ${h.padStart(6)}   ${(s.top === null ? "-" : `${s.top}px`).padStart(6)}   ${s.css ? "styled" : "UNSTYLED"}`)
}
console.log("")
console.log(`  settled: ${shape.height}px, position ${shape.position}`)
for (const k of shape.kids || []) console.log(`    ${k}`)
console.log("")

const problems = []
if (!phone.length) problems.push("The sampler recorded nothing, so nothing was measured.")
const heights = phone.map((s) => s.h)
const sawAbsent = heights.some((h) => h < 0)
const sawPresent = heights.some((h) => h > 0)
if (sawAbsent && sawPresent) {
  const arrives = phone.find((s) => s.h > 0)
  problems.push(`The header is absent for the first ${arrives.t}ms and then takes ${arrives.h}px, which pushes everything below it down by that much.`)
}
const settled = phone.filter((s) => s.h > 0)
const distinctHeights = [...new Set(settled.map((s) => s.h))]
if (distinctHeights.length > 1) {
  problems.push(`The header is ${distinctHeights.join(" then ")}px during the load. Every change moves the page under whoever is reading it.`)
}
const unstyled = phone.filter((s) => !s.css)
if (unstyled.length && phone.some((s) => s.css)) {
  const until = phone.find((s) => s.css)
  problems.push(`The page rendered unstyled for the first ${until.t}ms: the bar is not black, so what is on screen is the document in natural flow. That is the frame in the report.`)
}
const tops = [...new Set(phone.filter((s) => s.top !== null).map((s) => s.top))]
if (tops.length > 1) {
  problems.push(`The heading sits at ${tops.join(", ")}px from the top at different moments of the load.`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The header is its final height from the first frame, and nothing below it moves.\n")
