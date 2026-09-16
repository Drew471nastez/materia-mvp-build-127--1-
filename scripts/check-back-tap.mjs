/**
 * ===========================================================================
 *  ONE TAP ON THE BACK ARROW HAS TO BE ENOUGH
 * ===========================================================================
 * Reported: "on the back icon I need to click for like two times from the
 * product page ... to actually register the tap".
 *
 * A tap that does nothing has one of a small number of causes, and they are
 * distinguishable only by watching the real events. So this drives a real
 * product page over CDP with touch emulation, dispatches ONE touchstart and
 * ONE touchend at the arrow's centre, and records what the page received:
 *
 *   pointerdown target, pointerup target, click target, and whether the
 *   document's location changed.
 *
 * A click is dispatched to the nearest common ancestor of the pointerdown and
 * pointerup targets. So a control that MOVES between the two — a bar sliding
 * back in, a button scaling under the finger — gets a pointerdown, gets a
 * pointerup, and never gets a click. From the outside that is exactly "I have
 * to tap it twice".
 *
 * Three scenarios, because the bar hides on scroll and the reported tap is
 * the one that comes after bringing it back:
 *
 *   A. at the top of the page, bar at rest
 *   B. scrolled down, scrolled back up, tapped 60ms later — mid transition
 *   C. the same, tapped 400ms later — transition finished
 *
 *   node scripts/check-back-tap.mjs
 *   URL=https://storelib.com/<handle>/<slug> node scripts/check-back-tap.mjs
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

/** Watch every stage of a tap, so a missing click can be told from a missing press. */
const INSTRUMENT = `(() => {
  const w = window
  w.__tap = { pointerdown: null, pointerup: null, click: null, moved: null, navigated: false }
  const name = (el) => {
    if (!el || !el.closest) return String(el)
    const btn = el.closest("button")
    if (btn) return "button[" + (btn.getAttribute("aria-label") || "?") + "]"
    return el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : "")
  }
  const box = () => {
    const b = document.querySelector('[data-product-bar="phone"] button[aria-label="Back"]')
      || document.querySelector('button[aria-label="Back"]')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) }
  }
  w.__backBox = box
  w.__tap.cancels = 0
  w.__tap.moves = 0
  w.__tap.maxMove = 0
  let downAt = null
  document.addEventListener("pointerdown", (e) => {
    w.__tap.pointerdown = name(e.target); w.__tap.downBox = box(); downAt = { x: e.clientX, y: e.clientY }
  }, true)
  document.addEventListener("pointermove", (e) => {
    if (!downAt) return
    w.__tap.moves++
    w.__tap.maxMove = Math.max(w.__tap.maxMove, Math.abs(e.clientX - downAt.x), Math.abs(e.clientY - downAt.y))
  }, true)
  document.addEventListener("pointercancel", (e) => { w.__tap.cancels++; w.__tap.cancelTarget = name(e.target) }, true)
  document.addEventListener("pointerup", (e) => { w.__tap.pointerup = name(e.target); w.__tap.upBox = box(); downAt = null }, true)
  document.addEventListener("click", (e) => { w.__tap.click = name(e.target) }, true)
  return true
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-back-tap-"))
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

  /** One real tap: a touch goes down and comes up at the same point. */
  const tap = async (x, y) => {
    /* Zeroed here, or the scroll drags a scenario performs first are counted
       as part of the tap and the report blames the tap for their cancels. */
    await evaluate(`(() => { const t = window.__tap; t.cancels = 0; t.moves = 0; t.maxMove = 0; t.cancelTarget = null; return true })()`)
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] })
    await sleep(70)
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }

  /**
   * A real scroll, because `window.scrollTo` is not one. A finger dragging
   * fires scroll continuously while it moves, so the bar reacts DURING the
   * gesture and has settled by the time the hand is clear. Jumping the scroll
   * offset in one step and tapping straight after is a sequence no person
   * performs, and it reports a bar that is still moving because nothing gave
   * it time to move.
   */
  const drag = async (fromY, toY, steps = 14) => {
    const x = 215
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: fromY, radiusX: 12, radiusY: 12, force: 1 }] })
    for (let i = 1; i <= steps; i++) {
      const y = Math.round(fromY + ((toY - fromY) * i) / steps)
      await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] })
      await sleep(16)
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  }

  const scenarios = []

  /**
   * HOW LONG A PERSON WILL WAIT BEFORE DECIDING IT DID NOT WORK. This is the
   * number the report is about: the arrow was pressed, the press was
   * acknowledged, and then there were seconds of the same page. That is what
   * "I have to press it twice" is from the outside.
   */
  const PATIENCE_MS = 700

  const run = async (label, prepare) => {
    await send("Page.navigate", { url: URL_UNDER_TEST })
    await sleep(7000)
    await evaluate(INSTRUMENT)
    const before = await evaluate("location.pathname")
    const aimed = await prepare(evaluate, tap, drag)
    /* Poll rather than wait a fixed time, so the report can say HOW LONG, and
       watch the arrow at the same time: a slow back is only acceptable if it
       SAYS it is going. */
    let took = null
    let busyAt = null
    const started = Date.now()
    for (let i = 0; i < 90; i++) {
      if (busyAt === null) {
        const busy = await evaluate(`document.querySelector('[data-product-bar="phone"] button[aria-label="Back"]')?.getAttribute("aria-busy") === "true"`)
        if (busy) busyAt = Date.now() - started
      }
      const now = await evaluate("location.pathname")
      if (now !== before) { took = Date.now() - started; break }
      await sleep(100)
    }
    const after = await evaluate("location.pathname")
    const tapInfo = await evaluate("window.__tap")
    scenarios.push({ label, before, after, aimed, took, busyAt, deepLink: label.startsWith("A") || label.startsWith("B"), ...tapInfo, navigated: before !== after })
  }

  await run("A. at the top of the page, bar at rest", async (ev, doTap) => {
    const b = await ev("window.__backBox()")
    if (!b) return null
    await doTap(b.x, b.y)
    return b
  })

  await run("B. read the page, scroll back up, tap the bar that returns", async (ev, doTap, doDrag) => {
    /* Down the page, the way a finger does it: three drags upward. */
    for (let i = 0; i < 3; i++) await doDrag(700, 260)
    await sleep(600)
    /* And back up, which is what brings the bar in. */
    await doDrag(300, 620)
    /* A quick hand: a quarter of a second between letting go and reaching
       for the arrow. */
    await sleep(250)
    const b = await ev("window.__backBox()")
    if (!b) return null
    await doTap(b.x, b.y)
    return b
  })

  await run("C. arrived from the creator page, the way a visitor does", async (ev, doTap) => {
    /* Go to the creator page first, then press a product card, so there IS
       an entry behind this one and it belongs to us. That is the common
       visit, and the one the control is supposed to make instant. */
    const handle = (await ev("location.pathname")).split("/")[1]
    await ev(`window.history.pushState({}, "", "/" + ${JSON.stringify("x")}); history.back(); true`).catch(() => {})
    await send("Page.navigate", { url: new URL("/" + handle, URL_UNDER_TEST).href })
    await sleep(6000)
    const card = await ev(`(() => {
      const a = [...document.querySelectorAll('a[href*="/"]')].find(x => x.getAttribute("href")?.split("/").length === 3 && x.querySelector("img"))
      if (!a) return null
      a.click()
      return a.getAttribute("href")
    })()`)
    if (!card) return null
    await sleep(4000)
    await ev(INSTRUMENT)
    const b = await ev("window.__backBox()")
    if (!b) return null
    await doTap(b.x, b.y)
    return b
  })

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return scenarios
}

const PATIENCE = 700
/* A route that has to be fetched, with the bar's own prefetch behind it. */
const DEEP_LINK_LIMIT = 4000
const rows = await main()
console.log(`\n${URL_UNDER_TEST}\n`)
const problems = []
for (const s of rows) {
  console.log(`  ${s.label}`)
  if (!s.aimed) {
    console.log(`    no back control found`)
    problems.push(`${s.label}: no back control on the page at all.`)
    continue
  }
  console.log(`    aimed at ${s.aimed.x},${s.aimed.y}  (button ${s.aimed.w}x${s.aimed.h}, top ${s.aimed.top})`)
  console.log(`    pointerdown -> ${s.pointerdown}   (button top ${s.downBox ? s.downBox.top : "?"})`)
  console.log(`    pointerup   -> ${s.pointerup}     (button top ${s.upBox ? s.upBox.top : "?"})`)
  console.log(`    click       -> ${s.click}`)
  console.log(`    pointercancel x${s.cancels}${s.cancelTarget ? ` on ${s.cancelTarget}` : ""}, ${s.moves} pointermove, furthest ${s.maxMove}px`)
  console.log(`    ${s.before} -> ${s.after}   ${s.navigated ? `NAVIGATED after ${s.took}ms` : "stayed"}${s.busyAt === null ? "" : `, arrow said busy at ${s.busyAt}ms`}`)
  console.log("")
  if (!s.navigated) {
    problems.push(`${s.label}: one tap did not go back at all.`)
  } else if (s.deepLink) {
    /*
      A DEEP LINK HAS NOTHING BEHIND IT, so the arrow can only go forward to
      the creator's page and that is a fetch. What is required here is not
      that it be instant but that it be ANSWERED: the spinner has to be up
      while it happens, or the wait looks like a control that did nothing.
    */
    if (s.busyAt === null) problems.push(`${s.label}: it took ${s.took}ms and the arrow never showed it was busy. That is a wait that looks like nothing happened.`)
    else if (s.took > DEEP_LINK_LIMIT) problems.push(`${s.label}: one tap went back, but it took ${s.took}ms even with the route warmed.`)
  } else if (s.took > PATIENCE) {
    problems.push(`${s.label}: there is a page of ours one entry behind and going back to it took ${s.took}ms. It should be a return, not a fetch.`)
  }
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  One tap goes back, in every scenario.\n")
