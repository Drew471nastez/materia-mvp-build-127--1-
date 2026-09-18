/**
 * ===========================================================================
 *  EVERY SECTION ON A PRODUCT PAGE STARTS AT THE SAME X
 * ===========================================================================
 * Reported twice, with a screenshot each time: the reviews card sits further
 * in than the product card above it. The first fix changed the reviews
 * section's own container and changed nothing visible, because the padding
 * was coming from somewhere else as well. That is the kind of mistake a
 * measurement catches and reading the source does not.
 *
 * So this loads a real product page and reads the left and right edges of
 * every section's content box, and reports them side by side.
 *
 *   node scripts/check-product-columns.mjs
 *   URL=https://storelib.com/<handle>/<slug> node scripts/check-product-columns.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/negruw/trapsodia-trap-pack"
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
    } catch { /* fail loudly instead */ }
  }
  return flags
}

/*
  The landmarks, by what they contain rather than by class name: a heading
  this page is known to have, and then the nearest ancestor that is as wide as
  the column. Reading the heading's own box would measure the text, not the
  column it sits in.
*/
const READ = `(() => {
  const out = []
  const seen = new Set()

  const columnOf = (el) => {
    let node = el
    for (let i = 0; i < 6 && node && node.parentElement; i++) {
      const b = node.getBoundingClientRect()
      const p = node.parentElement.getBoundingClientRect()
      /* Walk up while the parent is the same width or wider but not the whole
         window: that is the section's column rather than the page. */
      if (p.width > window.innerWidth - 2) break
      if (p.width < b.width) break
      node = node.parentElement
    }
    return node
  }

  const record = (label, el) => {
    if (!el || seen.has(el)) return
    seen.add(el)
    const b = columnOf(el).getBoundingClientRect()
    out.push({
      label,
      left: Math.round(b.left),
      right: Math.round(window.innerWidth - b.right),
      width: Math.round(b.width),
    })
  }

  const headingLike = (re) =>
    [...document.querySelectorAll("h1, h2, h3")].find((h) => re.test((h.textContent || "").trim()))

  record("more from", headingLike(/^more from/i))
  record("reviews summary", document.querySelector("[data-reviews-summary]") || headingLike(/^customer reviews/i))
  record("about / payments", headingLike(/returns|payment|about the seller/i))
  return { width: window.innerWidth, sections: out }
})()`

const proc = spawn(CHROMIUM, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  ...reachabilityFlags(), "about:blank",
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
  await call("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 700 })
  await call("Page.navigate", { url: URL_UNDER_TEST })
  await sleep(6000)
  /* Everything below the fold has to have been laid out before it is read. */
  await call("Runtime.evaluate", { expression: "window.scrollTo(0, document.body.scrollHeight); true" })
  await sleep(2500)
  const r = await call("Runtime.evaluate", { expression: READ, returnByValue: true })
  if (r.exceptionDetails) fail(`The read threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}`)
  await send("Target.closeTarget", { targetId }, null)
  return r.result.value
}

const phone = await run(390)
const desk = await run(1280)
ws.close()
proc.kill("SIGKILL")

const problems = []
console.log(`\n${URL_UNDER_TEST}\n`)
for (const r of [phone, desk]) {
  const label = r.width >= 700 ? "desktop" : "phone"
  console.log(`  ${label} (${r.width}px)`)
  if (!r.sections.length) {
    console.log("    no sections found")
    problems.push(`${label}: none of the sections were found, so nothing was measured.`)
    console.log("")
    continue
  }
  for (const s of r.sections) {
    console.log(`    ${s.label.padEnd(18)} left ${String(s.left).padStart(4)}   right ${String(s.right).padStart(4)}   width ${s.width}`)
  }
  const lefts = [...new Set(r.sections.map((s) => s.left))]
  const rights = [...new Set(r.sections.map((s) => s.right))]
  if (lefts.length > 1) {
    problems.push(`${label}: the sections start at ${lefts.join(", ")}px from the left. They should all start at the same place.`)
  }
  if (rights.length > 1) {
    problems.push(`${label}: the sections end at ${rights.join(", ")}px from the right.`)
  }
  console.log("")
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  Every section starts and ends in the same column.\n")
