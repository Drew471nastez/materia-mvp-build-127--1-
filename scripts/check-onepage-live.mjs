/**
 * ===========================================================================
 *  THE SAME FOUR NUMBERS, ON THE DEPLOYED PAGE
 * ===========================================================================
 * scripts/check-onepage-stability.mjs mounts the component and measures it.
 * This one opens the real published /links page in a phone-sized window and
 * measures the same things there, because a fix that only holds in a probe is
 * a fix nobody can use:
 *
 *   blurred        elements the page is drawing through a filter, and any
 *                  still running the deblur keyframe
 *   churn          <img> elements destroyed and rebuilt by a scroll, which
 *                  is what the remount looked like from a phone
 *   slideWidths    what a carousel's slides are laid out at
 *   swipe          whether a horizontal touchmove is cancellable, and whether
 *                  the track actually moved when one was made
 *
 *   URL=https://storelib.com/<slug>/links node scripts/check-onepage-live.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/satori-studio/links"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** The same pin the other live checks use; see the note in check-explore-live. */
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

/* Counts images as they come and go. Installed after load, which is exactly
   right here: the remount being looked for happens on a scroll. */
const ARM = `(() => {
  window.__churn = { added: 0, removed: 0 }
  const walk = (nodes, key) => {
    for (const n of nodes) {
      if (n.nodeType !== 1) continue
      if (n.tagName === "IMG") window.__churn[key]++
      else if (n.querySelectorAll) window.__churn[key] += n.querySelectorAll("img").length
    }
  }
  new MutationObserver((rs) => {
    for (const r of rs) if (r.type === "childList") { walk(r.addedNodes, "added"); walk(r.removedNodes, "removed") }
  }).observe(document.body, { childList: true, subtree: true })
  return true
})()`

const READ = `(() => {
  const visible = (el) => {
    if (!el || !el.offsetParent) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  /* Every picture the page is showing, and what it is drawn through. */
  const blurred = []
  for (const img of document.querySelectorAll("img")) {
    const cs = getComputedStyle(img)
    if (cs.filter && cs.filter !== "none") blurred.push({ filter: cs.filter, cls: String(img.className).slice(0, 50) })
    if (cs.animationName && cs.animationName !== "none") blurred.push({ anim: cs.animationName, cls: String(img.className).slice(0, 50) })
  }
  /* The carousel track, if this page has one: the flex row with a translate. */
  let track = null
  for (const d of document.querySelectorAll("div")) {
    if ((d.style.transform || "").startsWith("translate3d") && visible(d)) { track = d; break }
  }
  return {
    images: document.querySelectorAll("img").length,
    blurred,
    hasTrack: !!track,
    slideWidths: track ? [...track.children].map((c) => c.style.width) : [],
    trackTransform: track ? track.style.transform : null,
    title: document.title,
    y: Math.round(window.scrollY),
  }
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-onepage-live-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    "--window-size=520,900", ...reachabilityFlags(), "about:blank",
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
  await send("Emulation.setDeviceMetricsOverride", { width: 520, height: 900, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await send("Page.navigate", { url: URL_UNDER_TEST })

  /*
    WAIT FOR THE SLIDER, NOT FOR A NUMBER OF SECONDS.

    The first run of this against the deployed page reported "this page has
    no image carousel" and passed. The page has one; twelve seconds was not
    always enough for it to be laid out, and a probe that passes by failing
    to find the thing it is checking is worse than no probe. So: poll until
    the track exists, and say plainly if it never does.
  */
  const FIND_TRACK = `(() => {
    const visible = (el) => el && el.offsetParent && el.getBoundingClientRect().width > 0
    for (const d of document.querySelectorAll("div")) {
      if ((d.style.transform || "").startsWith("translate3d") && visible(d)) return true
      const cs = visible(d) ? getComputedStyle(d) : null
      if (cs && (cs.overflowX === "auto" || cs.overflowX === "scroll") && d.scrollWidth > d.clientWidth + 8) return true
    }
    return false
  })()`
  let found = false
  for (let i = 0; i < 30 && !found; i++) {
    await sleep(1000)
    found = await ev(FIND_TRACK)
  }
  if (!found) console.log("\n  NOTE: no slider of either kind appeared on this page within 30s.\n")
  /* Let autoplay and the images settle before anything is read. */
  await sleep(3000)

  const atRest = await ev(READ)
  await ev(ARM)

  /* A phone scrolls. Nothing else should happen when it does. */
  await ev("window.scrollTo(0, 600); true")
  await sleep(1500)
  await ev("window.scrollTo(0, 0); true")
  await sleep(1500)
  const churn = await ev("window.__churn")
  const afterScroll = await ev(READ)

  /*
    ═══════════════════════════════════════════════════════════════════════
     THE OTHER SLIDER: A REAL SCROLLER, WHICH NOTHING MAY SCROLL BY HAND
    ═══════════════════════════════════════════════════════════════════════
    A group laid out as a carousel is an overflow-x scroller with scroll-snap.
    The phone scrolls it natively, with momentum, off the main thread. What
    used to sit on it as well was a React touchmove writing scrollLeft on
    every move, so a finger moved the row twice, against a snap trying to
    settle it somewhere else.

    A synthetic TouchEvent cannot drive a native scroll — that comes from real
    input — and that is exactly what makes this measurable: after a synthetic
    swipe, scrollLeft must be EXACTLY where it was. Any movement at all is
    JavaScript still scrolling the row by hand.
  */
  const nativeSwipe = await ev(`(() => {
    const visible = (el) => el && el.offsetParent && el.getBoundingClientRect().width > 0
    let box = null
    for (const d of document.querySelectorAll("div")) {
      if (!visible(d)) continue
      const cs = getComputedStyle(d)
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && d.scrollWidth > d.clientWidth + 8) { box = d; break }
    }
    if (!box) return { reason: "this page has no scrolling row" }
    const r = box.getBoundingClientRect()
    const y = Math.round(r.top + r.height / 2)
    const before = Math.round(box.scrollLeft)
    const t = (x) => new Touch({ identifier: 2, target: box, clientX: x, clientY: y })
    const fire = (type, x) => box.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === "touchend" ? [] : [t(x)], changedTouches: [t(x)],
    }))
    fire("touchstart", 400)
    fire("touchmove", 340)
    fire("touchmove", 240)
    fire("touchend", 240)
    return { before, after: Math.round(box.scrollLeft), snap: getComputedStyle(box).scrollSnapType }
  })()`)

  /* And a swipe across the track, if there is one. */
  const swipe = await ev(`(async () => {
    const visible = (el) => el && el.offsetParent && el.getBoundingClientRect().width > 0
    let track = null
    for (const d of document.querySelectorAll("div")) {
      if ((d.style.transform || "").startsWith("translate3d") && visible(d)) { track = d; break }
    }
    if (!track) return { reason: "this page has no image carousel" }
    const box = track.parentElement
    const r = box.getBoundingClientRect()
    const y = Math.round(r.top + r.height / 2)
    const before = track.style.transform
    const t = (x) => new Touch({ identifier: 1, target: box, clientX: x, clientY: y })
    const fire = (type, x, cancelable = true) => {
      const e = new TouchEvent(type, { bubbles: true, cancelable, touches: type === "touchend" ? [] : [t(x)], changedTouches: [t(x)] })
      box.dispatchEvent(e)
      return e
    }
    fire("touchstart", 400)
    fire("touchmove", 370)
    const moved = fire("touchmove", 280)
    fire("touchend", 280)
    await new Promise((res) => setTimeout(res, 900))
    return { cancelled: moved.defaultPrevented, before, after: track.style.transform }
  })()`)

  ws.close()
  reap()
  return { atRest, churn, afterScroll, swipe, nativeSwipe }
}

const r = await main()
const problems = []

console.log(`\n${URL_UNDER_TEST}\n`)
console.log(`  title                   ${JSON.stringify(r.atRest.title)}`)
console.log(`  images                  ${r.atRest.images}`)
console.log(`  drawn through a filter  ${r.atRest.blurred.length ? JSON.stringify(r.atRest.blurred) : "none"}`)
console.log(`  img churn on a scroll   ${r.churn.removed} removed, ${r.churn.added} added`)
console.log(`  carousel                ${r.atRest.hasTrack ? JSON.stringify(r.atRest.slideWidths) : "this page has none"}`)
if (r.nativeSwipe.reason) console.log(`  scrolling row           ${r.nativeSwipe.reason}`)
else console.log(`  scrolling row           scrollLeft ${r.nativeSwipe.before} -> ${r.nativeSwipe.after} under a synthetic swipe, snap ${r.nativeSwipe.snap}`)
if (r.swipe && r.swipe.reason) console.log(`  swipe                   ${r.swipe.reason}`)
else console.log(`  swipe                   ${r.swipe.cancelled ? "cancellable" : "NOT cancellable"}, ${r.swipe.before} -> ${r.swipe.after}`)
console.log("")

if (!r.atRest.images) problems.push("the page drew no images at all, so nothing here was measured")
for (const b of r.atRest.blurred) problems.push(`a picture is drawn through ${b.filter || b.anim} (${b.cls})`)
if (r.churn.removed > 0 || r.churn.added > 0)
  problems.push(`a scroll destroyed ${r.churn.removed} and rebuilt ${r.churn.added} images — that is the blink`)
if (r.atRest.hasTrack) {
  if (r.atRest.slideWidths.some((w) => w === "100%" || w === ""))
    problems.push(`a slide is laid out at 100%: ${JSON.stringify(r.atRest.slideWidths)}`)
  if (r.swipe && r.swipe.cancelled === false)
    problems.push("a horizontal swipe is not cancellable, so the page scrolls underneath the drag")
  if (r.swipe && r.swipe.before === r.swipe.after)
    problems.push(`a swipe left the track at ${r.swipe.after}, which is where it started`)
}

if (!r.nativeSwipe.reason && r.nativeSwipe.before !== r.nativeSwipe.after)
  problems.push(`a synthetic swipe moved the scrolling row from ${r.nativeSwipe.before} to ${r.nativeSwipe.after} — something is still scrolling it by hand, on top of the phone's own scroll`)

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("The live page holds still.\n")
