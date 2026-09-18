/**
 * ===========================================================================
 *  THE SEARCH STRIP ON THE WAY BACK: EXPLORE -> PRODUCT -> BACK
 * ===========================================================================
 * Every probe before this one drove a CREATOR page (storelib.com/<handle>)
 * and reported the transition clean, while a screen recording off a real
 * phone showed a white flash on every navigation. Both were right. The
 * recording is of /explore -- the marketplace, with the platform's own black
 * header and a "< Explore" link -- which is a different surface with a
 * different header, and nothing here had ever driven it.
 *
 * Measured off that recording, 60fps, three navigations:
 *
 *      784ms   88.9% of the screen white, header gone
 *     2934ms   89.0% white, every label washed out to grey
 *     4251ms   66.1% white
 *
 * So this samples the header itself -- is it in the DOM, how tall is it, what
 * colour, and what OPACITY is its page -- every frame across a navigation in
 * both directions, and films the pixels alongside.
 *
 *   node scripts/check-explore-flash.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const START = process.env.URL ?? "https://storelib.com/explore"
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
  const profile = mkdtempSync(join(tmpdir(), "storelib-cold-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=402,874", ...reachabilityFlags(), "about:blank",
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
  await send("Page.enable"); await send("Runtime.enable")
  await send("Emulation.setDeviceMetricsOverride", { width: 402, height: 874, deviceScaleFactor: 3, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

  /*
    THE RECORDER IS INSTALLED BEFORE THE DOCUMENT EXISTS, which is the only way
    to see the first frames of a cold load — the ones the screen recording shows
    with no header on them.
  */
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.__film = []
    const t0 = performance.now()
    const step = () => {
      const hdr = document.querySelector("#platform-header-root, header")
      const hr = hdr ? hdr.getBoundingClientRect() : null
      const main = document.querySelector("main")
      window.__film.push({
        at: Math.round(performance.now() - t0),
        path: location.pathname,
        hdr: !!hdr,
        hdrH: hr ? Math.round(hr.height) : 0,
        hdrBg: hdr ? getComputedStyle(hdr).backgroundColor : "",
        hdrHidden: hdr ? hdr.hasAttribute("aria-hidden") : null,
        mainTop: main ? Math.round(main.getBoundingClientRect().top) : null,
      })
      if (performance.now() - t0 < 6000) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  ` })

  const URLS = (process.env.URLS ?? "https://storelib.com/explore").split(",")
  const out = {}
  for (const url of URLS) {
    await send("Page.navigate", { url })
    await sleep(7000)
    const film = JSON.parse((await evaluate(`JSON.stringify(window.__film || [])`)) ?? "[]")
    const changes = []
    let last = ""
    for (const f of film) {
      const key = `${f.path}|${f.hdr}|${f.hdrH}|${f.hdrBg}|${f.hdrHidden}|${f.mainTop}`
      if (key !== last) { changes.push(f); last = key }
    }
    out[url] = { frames: film.length, changes }
  }
  console.log(JSON.stringify(out, null, 2))
  reap()
  process.exit(0)
}

main().catch((e) => fail(String(e?.stack || e)))
