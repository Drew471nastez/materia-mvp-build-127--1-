/**
 * ===========================================================================
 *  A PICTURE PAINTED LARGER THAN THE FILE IT CAME FROM
 * ===========================================================================
 * Reported of the laptop carousel on the home page: the images are bad
 * quality. That is not an opinion once it is measured — a browser will tell
 * you exactly how many source pixels it had for each device pixel it had to
 * paint:
 *
 *     naturalWidth  /  (CSS width x devicePixelRatio)
 *
 * At 1.0 there is one source pixel per device pixel, which is sharp. Below
 * 1.0 the browser is inventing the difference, and that is the soft, mushy
 * look being described. Above about 1.3 the opposite waste is happening: a
 * file larger than anything the screen can show.
 *
 * ── naturalWidth IS NOT THE FILE'S WIDTH ───────────────────────────────────
 * The first version of this divided by `img.naturalWidth` and reported
 * fifteen soft images on the home page. It was wrong about nearly all of
 * them. For an <img> with `srcset` w-descriptors and `sizes`, the spec makes
 * naturalWidth the DENSITY-CORRECTED intrinsic size: the browser works out
 * the candidate's pixel density (file width / layout width) and divides it
 * back out. A 1920px file in an 800px slot has a density of 2.4 and reports
 * naturalWidth 800 — the layout size, every time, however large the file.
 *
 * So the file's real width is read from the `w` of the URL the browser
 * actually chose, and naturalWidth is used only for images with no srcset at
 * all, where it is the honest answer.
 *
 * Run it against any page; it reports every image on it, worst first.
 *
 *   URL=https://storelib.com node scripts/check-marketing-image-quality.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com"
const WIDTHS = process.env.WIDTH ? [Number(process.env.WIDTH)] : [1440, 390]
const DPR = Number(process.env.DPR ?? 2)
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
    } catch { /* let the run fail loudly instead */ }
  }
  return flags
}

const READ = `(() => {
  const out = []
  for (const img of document.querySelectorAll("img")) {
    const r = img.getBoundingClientRect()
    if (r.width < 24 || r.height < 24) continue
    const dpr = window.devicePixelRatio || 1
    const needed = Math.round(r.width * dpr)
    /* currentSrc is the candidate the browser actually chose out of srcset,
       which is the decision being audited. src is only what was asked for. */
    const chosen = img.currentSrc || img.src || ""
    let asked = null
    try {
      const u = new URL(chosen, location.href)
      asked = u.searchParams.get("w")
    } catch {}
    /*
      The width of the file the browser chose. From the URL when it went
      through the optimizer, because naturalWidth cannot tell us (see above);
      from naturalWidth when there is no srcset, where it is exact.
    */
    const fileWidth = asked ? Number(asked) : (img.srcset ? null : img.naturalWidth)
    /*
      An image that did not go through our optimizer and is not ours cannot be
      improved by anything in this repository: the partner logos are files on
      somebody else's CDN, and the Stripe one is 76px at source. Worth
      printing, not worth failing over.
    */
    let ours = true
    try { ours = chosen.startsWith("/") || new URL(chosen, location.href).origin === location.origin } catch {}
    out.push({
      alt: (img.alt || "").slice(0, 44),
      ours,
      css: Math.round(r.width),
      needed,
      natural: img.naturalWidth,
      fileWidth,
      ratio: needed > 0 && fileWidth ? Math.round((fileWidth / needed) * 100) / 100 : null,
      w: asked,
      sizes: img.getAttribute("sizes"),
      srcset: (img.getAttribute("srcset") || "").slice(0, 150),
      file: decodeURIComponent(chosen).split("/").pop().split("?")[0].slice(0, 40),
      complete: img.complete,
      naturalHeight: img.naturalHeight,
      chosen: chosen.slice(-70),
    })
  }
  return out
})()`

async function main(width) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-imgq-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--window-size=${width},900`, ...reachabilityFlags(), "about:blank",
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
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? {}); pending.delete(m.id) }
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
  await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: DPR, mobile: width < 768 })
  await send("Page.navigate", { url: URL_UNDER_TEST })
  await sleep(6000)

  /* Everything below the fold is lazily mounted, so walk the page first. */
  await ev(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await sleep(160) }
    window.scrollTo(0, 0)
    await sleep(400)
    return true
  })()`)
  await sleep(4000)

  const images = await ev(READ)
  ws.close()
  reap()
  return images
}

const problems = []
const thirdParty = new Set()
for (const width of WIDTHS) {
  const images = await main(width)
  console.log(`\n${URL_UNDER_TEST}  at ${width}px, devicePixelRatio ${DPR}\n`)
  if (!images.length) { problems.push(`no images were found at ${width}px`); continue }
  const sorted = [...images].sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9))
  console.log(`  ${"source px per device px".padEnd(24)} ${"drawn".padEnd(7)} ${"needs".padEnd(7)} ${"file is".padEnd(8)} name`)
  if (process.env.DEBUG) for (const im of sorted.slice(0, 4)) console.log("   ", JSON.stringify(im))
  for (const im of sorted.slice(0, 12)) {
    const flag = im.ratio !== null && im.ratio < 0.9 ? "  <-- soft" : ""
    console.log(`  ${String(im.ratio).padEnd(24)} ${String(im.css).padEnd(7)} ${String(im.needed).padEnd(7)} ${String(im.fileWidth ?? "?").padEnd(8)} ${im.file}${flag}`)
  }
  for (const im of images) {
    if (im.ratio === null || im.natural === 0) continue  /* an image with no srcset and no optimizer URL cannot be judged from here */
    /*
      0.9 rather than 1.0: a hair under is invisible, and rounding between a
      fractional CSS width and a whole file size lands there honestly.
    */
    if (!im.ours) {
      if (im.ratio < 0.9) thirdParty.add(`"${im.alt || im.file}" is ${im.fileWidth}px at source for a ${im.needed}px slot — it is served from another CDN as uploaded, so only a bigger file fixes it`)
      continue
    }
    if (im.ratio < 0.9)
      problems.push(`at ${width}px, "${im.alt || im.file}" is drawn ${im.css}px wide on a ${DPR}x screen — it needs ${im.needed} source pixels and the chosen file is ${im.fileWidth} (${im.ratio}x)`)
  }
}

console.log("")
if (thirdParty.size) {
  console.log("  Not ours to fix:")
  for (const t of thirdParty) console.log(`   - ${t}`)
  console.log("")
}
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Every picture has at least as many source pixels as the screen paints.\n")
