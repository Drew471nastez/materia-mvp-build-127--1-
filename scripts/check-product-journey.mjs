/**
 * ===========================================================================
 *  THE ROUND TRIP: A GRID, A PRODUCT, AND BACK AGAIN
 * ===========================================================================
 * Everything measured so far has been one page at a time. What a visitor
 * actually does is a journey, and the journey is where marketplaces are
 * judged: scroll a grid, press something, look at it, come back, press the
 * next one.
 *
 * Three things decide whether that feels like an app or like a website, and
 * only one of them is speed:
 *
 *   HOW LONG THE PRESS TAKES to put the product on screen.
 *   WHETHER COMING BACK IS FREE, or costs another server round trip.
 *   WHERE COMING BACK PUTS YOU. Landing at the top of a grid you had scrolled
 *   halfway down is the single most damaging thing in this flow, and it is
 *   invisible to every single-page measurement.
 *
 *   node scripts/check-product-journey.mjs
 *   URL=https://storelib.com/<handle> node scripts/check-product-journey.mjs
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
  const profile = mkdtempSync(join(tmpdir(), "storelib-journey-"))
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
  await sleep(8000)

  /* Scroll down the grid the way somebody browsing does. */
  await evaluate(`window.scrollTo(0, 900); "ok"`)
  await sleep(700)
  report.scrolledTo = await evaluate(`Math.round(window.scrollY)`)

  /* Press the first product card on the page. */
  const pressed = await evaluate(`(() => {
    const links = [...document.querySelectorAll('a[href]')]
      .filter((a) => {
        const p = new URL(a.href, location.href).pathname.split("/").filter(Boolean)
        return p.length === 2 && p[1] !== "links"
      })
    if (!links.length) return { ok: false, reason: "no product links on the page" }
    const a = links[0]
    window.__before = location.pathname
    window.__t0 = performance.now()
    a.click()
    return { ok: true, href: a.getAttribute("href") }
  })()`)
  report.pressed = pressed
  if (!pressed?.ok) { reap(); fail(`Could not press a product: ${pressed?.reason}`) }

  /* Poll until the product page has actually painted its title. */
  let arrived = null
  for (let i = 0; i < 80 && !arrived; i++) {
    arrived = await evaluate(`(() => {
      if (location.pathname === window.__before) return null
      const h1 = document.querySelector("h1")
      if (!h1 || !h1.textContent.trim()) return null
      return { ms: Math.round(performance.now() - window.__t0), path: location.pathname, title: h1.textContent.trim().slice(0, 40) }
    })()`)
    if (!arrived) await sleep(100)
  }
  report.toProduct = arrived
  report.docRequestsAfterPress = docRequests.filter((d) => d.isMain).length

  await sleep(1200)

  /* And back, the way the browser's own back does it. */
  const backStarted = docRequests.filter((d) => d.isMain).length
  await evaluate(`window.__t1 = performance.now(); window.__productPath = location.pathname; history.back(); "ok"`)
  let returned = null
  for (let i = 0; i < 80 && !returned; i++) {
    returned = await evaluate(`(() => {
      if (location.pathname === window.__productPath) return null
      return { ms: Math.round(performance.now() - window.__t1), path: location.pathname, scrollY: Math.round(window.scrollY) }
    })()`)
    if (!returned) await sleep(100)
  }
  /* Give scroll restoration a beat; browsers apply it after the frame lands. */
  await sleep(1200)
  report.back = returned
  report.scrollAfterSettle = await evaluate(`Math.round(window.scrollY)`)
  report.docRequestsOnBack = docRequests.filter((d) => d.isMain).length - backStarted
  report.embedsOnBack = docRequests.filter((d) => !d.isMain).length
  report.docUrls = docRequests.map((d) => `${d.isMain ? "page  " : "embed "}${d.url.replace("https://storelib.com", "")}`).slice(0, 12)
  report.scrollRestoration = await evaluate(`history.scrollRestoration`)

  await send("Target.closeTarget", { targetId }, null)
  ws.close(); reap()
  return report
}

const r = await main()
console.log(`\n  start: ${r.start}`)
console.log(`  scrolled to ${r.scrolledTo}px, then pressed ${r.pressed.href}`)
console.log("")
console.log(`  to the product page:  ${r.toProduct ? `${r.toProduct.ms}ms  ("${r.toProduct.title}")` : "never arrived"}`)
console.log(`  page loads during that press: ${r.docRequestsAfterPress - 1}`)
console.log("")
console.log(`  back:                 ${r.back ? `${r.back.ms}ms  -> ${r.back.path}` : "never returned"}`)
console.log(`  page loads on back: ${r.docRequestsOnBack}  ${r.docRequestsOnBack === 0 ? "(free, from the client router)" : "(a full load)"}`)
console.log(`  scroll on return:     ${r.back ? r.back.scrollY : "?"}px, settled at ${r.scrollAfterSettle}px  (was ${r.scrolledTo}px)`)
console.log(`  history.scrollRestoration: ${r.scrollRestoration}`)
console.log("  documents fetched:"); for (const u of r.docUrls || []) console.log("    " + u)

const problems = []
if (!r.toProduct) problems.push("The product page never arrived after pressing a card.")
else if (r.toProduct.ms > 2000) problems.push(`The product page took ${r.toProduct.ms}ms to show its title. Past about two seconds a press stops feeling connected to the result.`)
if (!r.back) problems.push("Pressing back never returned to the grid.")
else {
  if (r.docRequestsOnBack > 0) problems.push(`Coming back cost ${r.docRequestsOnBack} page load(s). Back should be free: the page was already rendered once.`)
  const drift = Math.abs(r.scrollAfterSettle - r.scrolledTo)
  if (drift > 120) {
    problems.push(`Back landed at ${r.scrollAfterSettle}px having left from ${r.scrolledTo}px, a drift of ${drift}px. Losing your place in a grid is the thing that makes browsing feel like a website rather than an app.`)
  }
}

console.log("")
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Press, look, come back to where you were.\n")
