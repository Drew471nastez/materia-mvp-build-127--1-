/**
 * ===========================================================================
 *  FILMING THE WAY BACK
 * ===========================================================================
 * The claim is that pressing back is a transition now rather than a cut. The
 * source says so; this watches it happen.
 *
 * It presses the product page's back control and records the veil's COMPUTED
 * opacity every animation frame, together with the path and the colour, so
 * the answer is the curve the browser actually drew:
 *
 *   - it rises from 0 to 1 over the leave,
 *   - the route changes while it is opaque, which is the frame that used to
 *     be the cut,
 *   - it returns to 0 over the arrive,
 *   - and it ends at 0, because a veil that ends anywhere else is a coloured
 *     sheet over somebody's shop.
 *
 * SAMPLED IN THE PAGE, not over CDP. A round trip per frame cannot film
 * anything at 60Hz; a rAF loop pushing into an array can, and the array
 * survives the navigation because a client route change keeps the document.
 * If it does not survive, that is a full page load and worth knowing.
 *
 *   node scripts/check-back-transition.mjs
 *   URL=https://storelib.com/<handle>/<slug> node scripts/check-back-transition.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const START = process.env.URL ?? "https://storelib.com/andrewrullz"
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
  const profile = mkdtempSync(join(tmpdir(), "storelib-back-"))
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
  /*
    THE JOURNEY, NOT THE PAGE. Landing on the product page directly and
    pressing back is a different code path: there is no history entry, so the
    control pushes the creator's page instead, and that is a server render
    rather than a client restore. Measured that way the first version of this
    probe reported the route changing at 1372ms, which says nothing about the
    transition and everything about a cold push.

    What a visitor does is arrive on the creator's page, press a product, and
    press back. That is the path with a history entry, and the one the sheet
    is for. So the probe walks it.
  */
  await send("Page.navigate", { url: START })
  await sleep(9000)

  const wentIn = await evaluate(`(() => {
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const p = new URL(a.href, location.href).pathname.split("/").filter(Boolean)
      return p.length === 2 && p[1] !== "links"
    })
    if (!links.length) return { ok: false, reason: "no product links on the creator page" }
    links[0].click()
    return { ok: true, href: links[0].getAttribute("href") }
  })()`)
  report.wentIn = wentIn
  if (!wentIn?.ok) { reap(); fail(`Could not get to a product page: ${wentIn?.reason ?? "no result"}`) }
  await sleep(9000)

  const ready = await evaluate(`(() => ({
    veil: !!document.querySelector(".page-leave-veil"),
    back: !!document.querySelector('button[aria-label="Back"]'),
    pageRoot: !!document.querySelector("[data-page-root]"),
    path: location.pathname,
  }))()`)
  report.ready = ready
  if (!ready) { reap(); fail('The readiness probe returned nothing, so the page never evaluated it.') }
  if (!ready?.veil) { reap(); fail(`No .page-leave-veil on the product page. What the browser saw: ${JSON.stringify(ready)}`) }
  if (!ready?.back) { reap(); fail('No button[aria-label="Back"] on the product page, so nothing could be pressed.') }
  if (ready.path === new URL(START).pathname) { reap(); fail("The card press did not leave the creator page, so there is no back to measure.") }

  /*
    The camera, then the press. Both inside the page, so the first sample is
    the frame of the press rather than a CDP round trip later.
  */
  await evaluate(`(() => {
    window.__film = []
    const t0 = performance.now()
    const tick = () => {
      const v = document.querySelector(".page-leave-veil")
      const cs = v ? getComputedStyle(v) : null
      window.__film.push({
        t: Math.round(performance.now() - t0),
        o: cs ? Number(cs.opacity) : null,
        bg: cs ? cs.backgroundColor : null,
        p: location.pathname,
      })
      if (performance.now() - t0 < 1400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    document.querySelector('button[aria-label="Back"]').click()
    return "rolling"
  })()`)
  await sleep(2600)

  const film = await evaluate(`JSON.stringify(window.__film || null)`)
  if (!film || film === "null") {
    reap()
    fail("The film did not survive the back, which means the back was a full document load, not a client navigation.")
  }
  const frames = JSON.parse(film)
  report.frames = frames.length

  const startPath = ready.path
  const peak = frames.reduce((a, f) => (f.o > a.o ? f : a), frames[0])
  const swapped = frames.find((f) => f.p !== startPath)
  const settled = frames[frames.length - 1]
  const opaqueAt = frames.find((f) => f.o >= 0.99)
  const backToZero = swapped ? frames.find((f) => f.t > swapped.t && f.o <= 0.01) : null

  report.peakOpacity = peak.o
  report.peakAt = peak.t
  report.opaqueAt = opaqueAt ? opaqueAt.t : null
  report.routeChangedAt = swapped ? swapped.t : null
  report.opacityAtSwap = swapped ? swapped.o : null
  report.clearedAt = backToZero ? backToZero.t : null
  report.finalOpacity = settled.o
  report.finalPath = settled.p
  report.colourAtRise = (frames.find((f) => f.o > 0.5) || {}).bg ?? null
  report.colourAtClear = swapped ? swapped.bg : null

  /* A readable strip of the curve, every other frame. */
  report.curve = frames
    .filter((_, i) => i % 2 === 0)
    .map((f) => `${f.t}ms ${f.o === null ? "-" : f.o.toFixed(2)}${f.p === startPath ? "" : " *"}`)

  console.log("\n" + JSON.stringify(report, null, 2) + "\n")

  const problems = []
  if (peak.o < 0.95) problems.push(`the veil never became opaque (peak ${peak.o}) — the page was still visible through the swap`)
  if (!swapped) problems.push("the route never changed, so the back did nothing")
  if (swapped && swapped.o < 0.95) problems.push(`the route changed at opacity ${swapped.o} — the swap was visible, which is the cut this replaces`)
  if (settled.o > 0.01) problems.push(`the veil is still at ${settled.o} at the end — that is a coloured sheet left over a live page`)
  if (swapped && !backToZero) problems.push("the veil never cleared after the route changed")
  if (opaqueAt && opaqueAt.t > 400) problems.push(`it took ${opaqueAt.t}ms to cover the page, which is a wait rather than a transition`)
  if (backToZero && swapped && backToZero.t - swapped.t > 700) problems.push(`clearing took ${backToZero.t - swapped.t}ms after the swap, which is slow enough to read as a stall`)

  reap()
  if (problems.length) {
    console.error("PROBLEMS:\n  - " + problems.join("\n  - ") + "\n")
    process.exit(1)
  }
  console.log(`Back is a transition: covered by ${report.opaqueAt}ms, route swapped at ${report.routeChangedAt}ms under an opaque sheet, cleared by ${report.clearedAt}ms, resting at ${report.finalOpacity}.\n`)
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
