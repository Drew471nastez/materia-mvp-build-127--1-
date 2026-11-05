/**
 * ===========================================================================
 *  HOW MUCH INK IS ACTUALLY ON THE GROUND
 * ===========================================================================
 * "It should be there but very subtle, almost unrecognizable." That is a
 * claim about how much of the surface is darker than the page colour, which
 * is a number, so this renders the rule from app/globals.css over the page's
 * own ground colour and counts.
 *
 * It reports, for the dot ground and for the damask it replaced:
 *
 *   coverage   the share of pixels that differ from the ground colour at all
 *   mean delta how far the average pixel is from it, in levels of 255
 *   worst      the darkest single pixel, which is what the eye finds first
 *
 * Both are rendered the same way in the same browser, so the comparison is
 * like for like rather than one number without a scale next to it.
 *
 *   node scripts/check-ground.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The live rule, so this measures what ships rather than a copy of it. */
const css = readFileSync("app/globals.css", "utf8")
const rule = css.match(/\.explore-ground::before \{[\s\S]*?\n\}/)?.[0]
if (!rule) fail("No .explore-ground::before rule in app/globals.css.")

/** Its background declarations, with the mask and the layout left out: the
 *  mask fades the ground to nothing and would make every reading a function
 *  of where in the 620px the sample was taken.
 *
 *  SPLIT ON SEMICOLONS, NOT ON LINES. background-image is written across four
 *  lines here, and taking whole lines gave `background-image:` with no value
 *  at all — which renders nothing, which this script reported as "invisible
 *  rather than subtle" before anybody looked at the page. */
const body = rule.slice(rule.indexOf("{") + 1, rule.lastIndexOf("}"))
const background = body
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split(";")
  .map((d) => d.trim())
  .filter((d) => /^background(-image|-size|-position|-repeat)?\s*:/.test(d))
  .map((d) => d + ";")
  .join("\n")
if (!background.includes("background-image")) fail("The rule declares no background-image.")

/**
 * THE GROUND COLOUR IS READ FROM THE PAGE, NOT TYPED HERE.
 *
 * It was `0xf5` written into the comparison below, once, as a single number
 * for all three channels. When the page was lightened to #f8f9fa — three
 * channels that are not equal — every pixel differed from that literal and
 * the probe reported 100% coverage on a surface with almost nothing on it.
 *
 * One reading, from the class the page actually carries, used both to paint
 * the surface and to measure against it. The two cannot disagree again.
 */
const GROUND = readFileSync("app/(storelib)/(marketing)/explore/page.tsx", "utf8")
  .match(/explore-ground[^"]*bg-\[(#[0-9a-fA-F]{6})\]/)?.[1]
if (!GROUND) fail("Could not find the explore page's own background colour.")
const RGB = [1, 3, 5].map((i) => parseInt(GROUND.slice(i, i + 2), 16))

/** What it replaced, kept here so the number has something to stand next to. */
const DAMASK =
  'background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22180%22%20height%3D%22180%22%20viewBox%3D%220%200%20180%20180%22%3E%20%3Cg%20fill%3D%22none%22%20stroke%3D%22%230f172a%22%20stroke-width%3D%221.1%22%3E%20%3Cpath%20d%3D%22M90%200%20C90%2026%20116%2032%20116%2058%20C116%2080%20100%2090%2090%2090%20C80%2090%2064%2080%2064%2058%20C64%2032%2090%2026%2090%200Z%22%2F%3E%20%3Cpath%20d%3D%22M0%2090%20C26%2090%2032%2064%2058%2064%20C80%2064%2090%2080%2090%2090%20C90%20100%2080%20116%2058%20116%20C32%20116%2026%2090%200%2090Z%22%2F%3E%20%3Ccircle%20cx%3D%2290%22%20cy%3D%2290%22%20r%3D%225.5%22%2F%3E%20%3C%2Fg%3E%20%3C%2Fsvg%3E");\n' +
  "background-size: 180px 180px;\nbackground-repeat: repeat;\nopacity: 0.045;"

function page(decls) {
  return `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${GROUND}}
    #s{position:absolute;inset:0;${decls}}
  </style><div id="s"></div>`
}

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy) flags.push(`--proxy-server=${proxy}`)
  return flags
}

async function connect() {
  const proc = spawn(CHROMIUM, [
    "--headless=new",
    "--remote-debugging-port=0",
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
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
  return { proc, endpoint }
}

/** Render `decls` and count how much darker than the ground the result is. */
async function measure(decls, ws, send) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (method, params) => send(method, params, sessionId)
  await call("Page.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width: 360, height: 360, deviceScaleFactor: 1, mobile: false })
  await call("Page.navigate", { url: "data:text/html;base64," + Buffer.from(page(decls)).toString("base64") })
  await sleep(500)
  const shot = await call("Page.captureScreenshot", { format: "png" })
  await send("Target.closeTarget", { targetId }, null)

  /* Decoded in the page itself rather than by adding an image library: a
     canvas readback of our own screenshot is exact and costs no dependency. */
  const { targetId: t2 } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId: s2 } = await send("Target.attachToTarget", { targetId: t2, flatten: true })
  const evalIn = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, s2)
    if (r.exceptionDetails) fail(`Reading the screenshot threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}`)
    return r.result.value
  }
  const stats = await evalIn(`(async () => {
    const img = new Image()
    img.src = "data:image/png;base64,${shot.data}"
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width; c.height = img.height
    const g = c.getContext("2d")
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    /* Per channel, because a ground is not always three equal numbers. */
    const base = [${RGB[0]}, ${RGB[1]}, ${RGB[2]}]
    let differing = 0, sum = 0, worst = 0
    for (let i = 0; i < d.length; i += 4) {
      const delta = Math.abs(d[i] - base[0]) + Math.abs(d[i + 1] - base[1]) + Math.abs(d[i + 2] - base[2])
      if (delta > 0) differing++
      sum += delta / 3
      if (delta / 3 > worst) worst = delta / 3
    }
    const px = d.length / 4
    return { px, coverage: differing / px, meanDelta: sum / px, worst }
  })()`)
  await send("Target.closeTarget", { targetId: t2 }, null)
  return stats
}

const { proc, endpoint } = await connect()
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
    /* `== null` covers both: a browser-level call passes nothing, and the
       close calls pass null. Sending `sessionId: null` is rejected outright. */
    ws.send(JSON.stringify(sessionId == null ? { id: n, method, params } : { id: n, method, params, sessionId }))
  })

const now = await measure(background, ws, send)
const before = await measure(DAMASK, ws, send)
ws.close()
proc.kill("SIGKILL")

const pct = (n) => `${(n * 100).toFixed(2)}%`
console.log(`\n  the ground, rendered at 360x360 over ${GROUND}\n`)
console.log(`                 coverage   mean delta   darkest pixel`)
console.log(`    dots         ${pct(now.coverage).padStart(8)}   ${now.meanDelta.toFixed(3).padStart(10)}   ${now.worst.toFixed(1).padStart(13)}`)
console.log(`    damask       ${pct(before.coverage).padStart(8)}   ${before.meanDelta.toFixed(3).padStart(10)}   ${before.worst.toFixed(1).padStart(13)}`)
console.log("")

const problems = []
if (now.coverage >= before.coverage) {
  problems.push(`The dots cover ${pct(now.coverage)} of the surface and the damask covered ${pct(before.coverage)}. It was meant to be less.`)
}
/*
  UNDER THE DAMASK ON ALL THREE, not just on coverage. The first version of
  these dots touched less of the surface and was darker where it did, which is
  the opposite of subtler; the thresholds are relative now so that cannot pass
  again.
*/
if (now.meanDelta >= before.meanDelta) {
  problems.push(`The average pixel is ${now.meanDelta.toFixed(3)} off the page colour and the damask was ${before.meanDelta.toFixed(3)}. Fewer, bigger marks is not subtler.`)
}
if (now.worst >= before.worst) {
  problems.push(`The darkest dot is ${now.worst.toFixed(1)} levels off the page colour and the damask's was ${before.worst.toFixed(1)}. A mark you can pick out individually is a pattern.`)
}
if (now.coverage === 0) {
  problems.push("Nothing rendered at all: the ground is invisible rather than subtle.")
}
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Less ink than the damask, and no single dot stands out.\n")
