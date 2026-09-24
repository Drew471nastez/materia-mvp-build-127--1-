/**
 * ===========================================================================
 *  THE WHOLE NAVIGATION CONTRACT, IN ONE RUN, ON THE REAL SITE
 * ===========================================================================
 * The owner's specification, which this measures line by line:
 *
 *   Open product: click → product page replaces the current page cleanly.
 *   Go back: previous page restores exactly where you left it, including
 *   scroll position.
 *   No visual transitions: no fade, slide, flash, skeleton, white frame, or
 *   page flicker.
 *   Keep the existing page visible until the next page is ready, then swap it
 *   in one clean frame.
 *   Target 300-500ms perceived delay when cached/prefetched.
 *   Preserve navigation history and use normal browser Back/Forward.
 *
 * Every clause of that is already pinned at source level — tests/gallery-and-
 * back holds the press-frame back and the absence of the veil,
 * tests/product-page-load holds the absence of the arrival fade, and
 * tests/marketing-weight holds the absence of a loading boundary on these
 * routes. Source is where a regression is cheapest to catch.
 *
 * What none of that can answer is whether the contract HOLDS END TO END on
 * the deployed site, where a stale build, a hydration difference or a link
 * that quietly falls back to a document load can break it with every source
 * pin still green. So this drives the real pages and asserts, rather than
 * reporting. scripts/check-nav-flash films the pixels and is the better
 * instrument for a flash; this one is about the mechanics around it.
 *
 * FOUR THINGS, SAMPLED EVERY ANIMATION FRAME THROUGH BOTH NAVIGATIONS:
 *
 *   THE ADDRESS, so each swap can be timed.
 *
 *   WHETHER THE DOCUMENT SURVIVED, which is the sharpest test there is for
 *   the white frame. `window.__frames` lives in the page: a client navigation
 *   keeps it, a full document load throws the window away and the sampler
 *   with it. A document load IS the white frame — the page is torn down, the
 *   shell is fetched and parsed again, and the scroll position the browser
 *   stored for the entry behind it is gone.
 *
 *   EVERY RUNNING ANIMATION, from `document.getAnimations()`, with the size
 *   of the element it is animating. Two earlier versions of this got it
 *   wrong in opposite directions and both are worth keeping in mind: looking
 *   for an overlay with `elementFromPoint` finds nothing, because an overlay
 *   built not to swallow taps carries `pointer-events: none` and hit testing
 *   skips it; and flagging every animation on the page catches the creator's
 *   avatar cross-fading from its initials as it decodes, which is one 64px
 *   element settling, not the page arriving over time. So the target is
 *   measured, and only something covering most of the window counts.
 *
 *   THE SCROLL POSITION, so the restore is checked rather than assumed.
 *
 *   node scripts/check-navigation-swap.mjs
 *   URL=https://storelib.com/<handle> node scripts/check-navigation-swap.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const CREATOR = process.env.URL ?? "https://storelib.com/andrewrullz"
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

/**
 * One reading per animation frame, for the length of a navigation.
 *
 * ---------------------------------------------------------------------------
 *  WHY NOT elementFromPoint, WHICH IS WHAT THIS TRIED FIRST
 * ---------------------------------------------------------------------------
 * The obvious instrument is "what is topmost at the centre of the screen".
 * It reported a clean swap on a build that definitely had a coloured sheet
 * fading over the page, because an overlay like that carries
 * `pointer-events: none` so that it cannot swallow a tap — and hit testing
 * skips it for exactly that reason. The probe was blind to the one thing it
 * was built to catch.
 *
 * So two instruments, neither of which can be opted out of:
 *
 *   EVERY RUNNING ANIMATION, by name, from `document.getAnimations()`. A fade
 *   over the page, a fade of the page, a slide — all of them are a CSS
 *   animation or transition somewhere in the document while it happens, and
 *   this sees them wherever they are mounted and whatever they are called.
 *
 *   EVERY FULL-VIEWPORT LAYER's opacity. Collected once when sampling starts
 *   and again when the address changes, because a page that has just arrived
 *   can mount its own. Rect first, computed style only for the few that pass,
 *   so the scan costs little enough to run every frame.
 */
const SAMPLER = `(() => {
  const w = window
  w.__frames = []
  let stop = false
  const tick = () => {
    if (stop) return
    const main = document.querySelector("main")
    const root = (main && main.firstElementChild) || main
    /* Anything animating anywhere, which is what a transition IS. A fade over
       the page, a fade OF the page and a slide are all a CSS animation or
       transition somewhere in the document while it happens, so this sees
       them wherever they are mounted and whatever they are called. */
    const running = (document.getAnimations ? document.getAnimations() : [])
      .filter((a) => a.playState === "running")
      .map((a) => {
        const nm = a.animationName || (a.transitionProperty ? "transition:" + a.transitionProperty : "animation")
        /*
          THE SIZE OF WHAT IS MOVING IS THE WHOLE DISTINCTION.

          A first pass flagged every animation on the page and caught the
          creator's avatar cross-fading from its initials to the photo as it
          decoded. That is one 64px element settling in place, not the page
          arriving over time, and the specification is about the page.

          So the target is measured. Anything covering most of the window is
          the page or a sheet over it; anything smaller belongs to a control
          and is none of this probe's business.
        */
        let big = false
        try {
          const el = a.effect && a.effect.target
          if (el && el.getBoundingClientRect) {
            const r = el.getBoundingClientRect()
            big = r.width >= w.innerWidth * 0.6 && r.height >= w.innerHeight * 0.6
          }
        } catch (e) { /* a target that cannot be measured is not the page */ }
        return (big ? "PAGE:" : "local:") + nm
      })
    w.__frames.push({
      t: Math.round(performance.now()),
      path: location.pathname,
      running,
      mainOpacity: root ? Math.round(parseFloat(getComputedStyle(root).opacity) * 100) / 100 : 1,
      y: Math.round(w.scrollY),
    })
    requestAnimationFrame(tick)
  }
  /*
    ONE FRAME RECORDED SYNCHRONOUSLY, BEFORE ANYTHING IS PRESSED.

    The loop's first reading lands on the next animation frame, and the two
    protocol round trips between installing this and pressing the control
    take longer than that. A back that completes in 35ms was therefore
    finished before frame zero, so every frame in the array showed the page
    arrived at and the probe reported "the address never changed" for a
    navigation that had already succeeded. Three runs in four said that.

    The pre-press state has to be in the array for the comparison to mean
    anything, so it is put there now rather than awaited.
  */
  const first = () => {
    const main = document.querySelector("main")
    const root = (main && main.firstElementChild) || main
    w.__frames.push({
      t: Math.round(performance.now()),
      path: location.pathname,
      running: [],
      mainOpacity: root ? Math.round(parseFloat(getComputedStyle(root).opacity) * 100) / 100 : 1,
      y: Math.round(w.scrollY),
    })
  }
  first()
  requestAnimationFrame(tick)
  w.__stopSampling = () => { stop = true; return w.__frames }
  return true
})()`

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "storelib-nav-swap-"))
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
  ws.addEventListener("message", (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
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
  await send("Emulation.setDeviceMetricsOverride", { width: 430, height: 900, deviceScaleFactor: 2, mobile: true })
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })

  const report = { creator: CREATOR }

  await send("Page.navigate", { url: CREATOR })
  await sleep(9000)

  /* Scrolled down the creator page, because the restore is the claim. */
  await ev("window.scrollTo(0, 900); true")
  await sleep(700)
  report.leftAt = await ev("Math.round(window.scrollY)")

  /* FORWARD: press a product card the way a visitor does. */
  await ev(SAMPLER)
  const pressed = await ev(`(() => {
    const here = location.pathname
    const a = [...document.querySelectorAll("a[href]")].find((x) => {
      const h = x.getAttribute("href") || ""
      return h.startsWith(here + "/") && x.querySelector("img")
    })
    if (!a) return null
    window.__pressed = a.tagName.toLowerCase() + "." + (typeof a.className === "string" ? a.className.split(" ").slice(0, 3).join(".") : "")
    /*
      IS THIS LINK ALIVE YET. A client navigation happens because React has
      attached a handler to the anchor. Before hydration reaches it the anchor
      is still plain markup, so the browser follows the href and loads a whole
      document — the white frame, and the scroll position for the entry behind
      it goes with it. React marks the nodes it owns with a __reactProps key,
      so this is readable at the instant of the press.
    */
    /* Read BEFORE the click and RETURNED, not stashed on window: when the
       press does cause a document load, window is replaced and anything left
       there is gone — which is exactly the run whose cause is in question. */
    const out = {
      href: a.getAttribute("href"),
      tag: window.__pressed,
      hydrated: Object.keys(a).some((k) => k.startsWith("__reactProps")),
      ready: document.readyState,
    }
    a.click()
    return out
  })()`)
  if (!pressed) { reap(); fail(`No product card found on ${CREATOR}.`) }
  report.pressed = pressed.href
  report.pressedTag = pressed.tag
  report.hydratedAtPress = pressed.hydrated
  report.readyAtPress = pressed.ready
  await sleep(6000)
  report.forward = await ev("window.__stopSampling()")
  /*
    A SAMPLER THAT IS NO LONGER THERE MEANS THE DOCUMENT WAS REPLACED.

    `window.__frames` lives in the page. A client navigation keeps it; a full
    document load throws the whole window away and the sampler with it. That
    is the sharpest possible test for the thing the specification rules out,
    because a document load IS the white frame: the page is torn down, the
    shell is fetched and parsed again, and the scroll position the browser
    stored for the entry behind it is gone.
  */
  report.forwardWasDocumentLoad = !report.forward


  /* Somewhere down the product page, so the restore has something to restore. */
  await ev("window.scrollTo(0, 600); true")
  await sleep(600)

  /* BACK: the bar's own control, not the browser's, because that is the one
     with the code in it. */
  await ev(SAMPLER)
  report.canReturn = await ev(`(() => {
    try { return { referrer: document.referrer, histLen: history.length } } catch (e) { return String(e) }
  })()`)
  report.backPressed = await ev(`(() => {
    const b = document.querySelector('[data-product-bar="phone"] a[aria-label="Back"]')
      || document.querySelector('a[aria-label="Back"]')
    if (!b) return false
    b.click()
    return true
  })()`)
  /* Long enough that a back which falls through to a server render is
     measured rather than cut off. A four second window reported "the address
     never changed" for a navigation that had simply not finished. */
  await sleep(6000)
  report.back = await ev("window.__stopSampling()")
  report.backWasDocumentLoad = !report.back
  report.landedAt = await ev("Math.round(window.scrollY)")
  report.landedOn = await ev("location.pathname")

  await send("Target.closeTarget", { targetId }, null)
  ws.close()
  reap()
  return report
}

const r = await main()

/** When did the address change, and what was on screen either side of it. */
function swap(frames) {
  if (!frames?.length) return null
  const first = frames[0].path
  const at = frames.findIndex((f) => f.path !== first)
  if (at < 0) return { changed: false, frames: frames.length }
  const window_ = frames.slice(Math.max(0, at - 12), at + 12)
  return {
    changed: true,
    ms: frames[at].t - frames[0].t,
    from: first,
    to: frames[at].path,
    /* The worst cover and the worst fade seen anywhere in the navigation. */
    minMainOpacity: Math.min(...frames.map((f) => f.mainOpacity)),
    /* Every animation seen at any point in the navigation, once each. */
    animations: [...new Set(frames.flatMap((f) => f.running))],
    around: window_.map((f) => `${f.t - frames[at].t >= 0 ? "+" : ""}${f.t - frames[at].t}ms ${f.path === first ? "old" : "new"} opacity=${f.mainOpacity} y=${f.y}${f.running.length ? " [" + f.running.join(",") + "]" : ""}`),
  }
}

const fw = swap(r.forward)
const bk = swap(r.back)

console.log(`\n${r.creator}\n`)
console.log(`  left the creator page at y=${r.leftAt}, pressed ${r.pressed}`)
console.log(`  the back control was ${r.backPressed ? "found and pressed" : "NOT FOUND"}`)
console.log(`  forward kept the document: ${!r.forwardWasDocumentLoad}${r.pressedTag ? `  (pressed ${r.pressedTag})` : ""}`)
console.log(`  the link was hydrated when pressed: ${r.hydratedAtPress}  (readyState ${r.readyAtPress})`)
console.log(`  back kept the document: ${!r.backWasDocumentLoad}\n`)

const show = (label, s) => {
  if (!s) { console.log(`  ${label}: nothing sampled`); return }
  if (!s.changed) { console.log(`  ${label}: the address never changed in ${s.frames} frames`); return }
  console.log(`  ${label}: ${s.from} -> ${s.to} in ${s.ms}ms`)
  console.log(`    lowest opacity of the page's own root: ${s.minMainOpacity}`)
  console.log(`    animations running during it: ${s.animations.length ? s.animations.join(", ") : "none"}`)
  console.log("")
}
show("forward", fw)
show("back", bk)
console.log(`  back landed on ${r.landedOn} at y=${r.landedAt} (left at y=${r.leftAt})\n`)

const problems = []
if (r.forwardWasDocumentLoad) {
  problems.push(`Pressing a product card (${r.pressedTag || "a card"}) threw the document away and loaded a new one${r.hydratedAtPress === false ? " — and the link had NOT hydrated at the moment of the press, so React had no handler on it and the browser followed the href" : ""}. That is the white frame: the page is torn down, the shell is fetched and parsed again, and the scroll position stored for the entry behind it is lost.`)
} else if (!fw?.changed) {
  problems.push("Pressing a product card never changed the address.")
}
if (r.backWasDocumentLoad) {
  problems.push("Pressing Back loaded a new document instead of restoring the one behind it.")
} else if (!bk?.changed) {
  problems.push("Pressing Back never changed the address.")
}
for (const [label, s] of [["forward", fw], ["back", bk]]) {
  if (!s?.changed) continue
  if (s.minMainOpacity < 0.99) {
    problems.push(`Going ${label}, the page's own root dropped to opacity ${s.minMainOpacity}. A page below full opacity shows the body's background through it, which is the white frame.`)
  }
  /*
    A navigation may not animate the PAGE. Controls settling in place are
    fine and always have been: a spinner turning, an avatar arriving, a
    border colour easing. What is forbidden is the page itself, or a sheet
    the size of it, fading or sliding.
  */
  const pageLevel = s.animations.filter((a) => a.startsWith("PAGE:"))
  if (pageLevel.length) {
    problems.push(`Going ${label}, the page played ${pageLevel.join(", ")}. The contract is one clean swap with no fade, slide or flash.`)
  }
}
if (bk?.changed && bk.ms > 500) {
  problems.push(`Back took ${bk.ms}ms to swap. It returns to a route the client router already holds and should be immediate.`)
}
/*
  The restore is the part a router gets wrong quietly. Within a screen of
  where it was left is the honest bar: the creator page is virtualised
  nowhere, but its images settle and can move the document by a few pixels.
*/
if (Math.abs(r.landedAt - r.leftAt) > 120) {
  problems.push(`Back landed at y=${r.landedAt} and the page was left at y=${r.leftAt}. The scroll position was not restored.`)
}

if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  if (bk?.around) {
    console.error("\n  frames around the back swap:")
    bk.around.forEach((l) => console.error(`    ${l}`))
  }
  console.error("")
  process.exit(1)
}
console.log("  One clean swap each way, nothing drawn over the page, and Back lands where it left.\n")
