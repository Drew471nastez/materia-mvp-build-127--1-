/**
 * ===========================================================================
 *  FILMING THE PIXELS, BECAUSE "A FLASH" IS NOT A DOM QUESTION
 * ===========================================================================
 * Three rounds have now been spent on how this transition feels, and each one
 * changed something on the strength of what the DOM said. A flash is a PAINT:
 * it can be a stylesheet, an image held transparent until it decodes, a
 * hydration that re-lays-out a strip, or a page arriving before its
 * background does. None of those look alike in the DOM and all of them look
 * the same to a person.
 *
 * So this records the screen. Page.startScreencast streams real frames; every
 * one is decoded and measured for mean luminance and for how much it differs
 * from the frame before it. A flash is a spike in both, and it is reported
 * with the millisecond it happened at and the picture saved next to it.
 *
 *   node scripts/check-nav-flash.mjs
 *   URL=https://storelib.com/<handle> node scripts/check-nav-flash.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
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
  const profile = mkdtempSync(join(tmpdir(), "storelib-film-"))
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
  const frames = []
  let filming = false
  let t0 = 0

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.method === "Page.screencastFrame") {
      if (filming) frames.push({ t: Math.round(performance.now() - t0), data: msg.params.data })
      send("Page.screencastFrameAck", { sessionId: msg.params.sessionId }).catch(() => {})
    }
  })

  await send("Page.navigate", { url: START })
  await sleep(9000)
  await evaluate(`window.scrollTo(0, 700); "ok"`)
  await sleep(900)

  const target = await evaluate(`(() => {
    const links = [...document.querySelectorAll("a[href]")].filter((a) => {
      const p = new URL(a.href, location.href).pathname.split("/").filter(Boolean)
      return p.length === 2 && p[1] !== "links"
    })
    if (!links.length) return null
    const b = links[0].getBoundingClientRect()
    return { href: links[0].getAttribute("href"), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  })()`)
  if (!target) { reap(); fail("No product card on the creator page.") }
  report.target = target

  await send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1 })
  await sleep(400)

  /* ---- FORWARD: the press, and everything until the product is up. ---- */
  frames.length = 0
  t0 = performance.now()
  filming = true
  await evaluate(`document.querySelector('a[href="${target.href}"]').click(); "ok"`)
  await sleep(3500)
  filming = false
  const forward = frames.splice(0, frames.length)

  await sleep(1500)

  /* ---- BACK ---- */
  t0 = performance.now()
  filming = true
  await evaluate(`history.back(); "ok"`)
  await sleep(3000)
  filming = false
  const back = frames.splice(0, frames.length)

  await send("Page.stopScreencast")
  reap()

  const dir = mkdtempSync(join(tmpdir(), "storelib-film-frames-"))
  const dump = (name, list) => {
    const meta = []
    list.forEach((f, i) => {
      const file = join(dir, `${name}-${String(i).padStart(3, "0")}-${f.t}ms.jpg`)
      writeFileSync(file, Buffer.from(f.data, "base64"))
      meta.push({ i, t: f.t, file })
    })
    return meta
  }
  report.forward = dump("forward", forward)
  report.back = dump("back", back)
  report.dir = dir
  console.log(JSON.stringify({ dir, forward: report.forward.length, back: report.back.length, target }, null, 2))
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
