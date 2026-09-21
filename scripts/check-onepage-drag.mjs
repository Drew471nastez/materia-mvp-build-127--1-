/**
 * ===========================================================================
 *  A REAL FINGER, NOT A SYNTHETIC EVENT
 * ===========================================================================
 * The last check dispatched TouchEvent objects at the element and reported
 * the swipe worked. That proves the HANDLER runs. It proves nothing about a
 * finger, because a dispatched event skips everything a real touch goes
 * through first: touch-action, the compositor deciding whether this gesture
 * belongs to the page's scroll, and whether a touchmove is still cancellable
 * by the time it reaches JavaScript. The report — "sliding with my finger
 * doesn't work at all" — is about exactly that layer.
 *
 * So this drives Input.dispatchTouchEvent, which enters through the browser's
 * own input pipeline, and samples the track after every step:
 *
 *   follow      where the track sat after each move of the drag. A slider
 *               that follows a finger has a different number every step. One
 *               number repeated is a slider that does not move at all.
 *   settled     where it ended once the finger lifted.
 *   autoplay    whether the track moves on its own over 13 seconds with
 *               nothing touching it.
 *
 *   URL=https://storelib.com/<slug>/links node scripts/check-onepage-drag.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const URL_UNDER_TEST = process.env.URL ?? "https://storelib.com/satori-studio/links"
/*
  The page mounts a phone layout and a desktop layout at once and hides one
  with CSS, so they are two different carousels and both have to be checked.
  WIDTH picks which one is the visible copy.
*/
const WIDTHS = process.env.WIDTH ? [Number(process.env.WIDTH)] : [390, 1440]
const HEIGHT = Number(process.env.HEIGHT ?? 900)
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

/*
  Finds the slider and remembers it, so every later read is the same element
  even after the page has re-rendered.

  It is a scroller now, so that is what identifies it: something visible that
  scrolls sideways and holds more than it can show. It used to be found by an
  inline translate3d, which stopped existing when the hand-rolled drag was
  replaced by a native scroll-snap row.
*/
const LOCATE = `(() => {
  const visible = (el) => el && el.offsetParent && el.getBoundingClientRect().width > 0
  let track = null
  for (const d of document.querySelectorAll("div")) {
    if (!visible(d)) continue
    const cs = getComputedStyle(d)
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && d.scrollWidth > d.clientWidth + 8) { track = d; break }
  }
  if (!track) return null
  window.__track = track
  const box = track.getBoundingClientRect()
  return { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2),
           left: Math.round(box.left), width: Math.round(box.width), height: Math.round(box.height),
           touchAction: getComputedStyle(track).touchAction,
           snap: getComputedStyle(track).scrollSnapType,
           transform: "scrollLeft " + Math.round(track.scrollLeft) }
})()`

/* Where the row sits. The scroller's own number, which is what a finger and
   the dots and autoplay all move. */
const X_OF = `(() => {
  const t = window.__track
  return t ? Math.round(t.scrollLeft) : null
})()`

/*
  ═══════════════════════════════════════════════════════════════════════════
   WHERE THE PICTURE IS, WHICH IS THE ONLY THING ANYBODY LOOKS AT
  ═══════════════════════════════════════════════════════════════════════════
  Reported after the rebuild: "the dots update but the images don't move at
  all". scrollLeft changing is not the same as a picture moving, and reading
  scrollLeft is how a probe reports success while the gallery sits still. So
  this reads the on-screen position of the first slide, which is the thing
  that has to change, and the dot the component thinks is current.
*/
const PIX_OF = `(() => {
  const t = window.__track
  if (!t || !t.children.length) return null
  const first = t.children[0].getBoundingClientRect()
  /*
    THIS CAROUSEL'S OWN DOTS AND ARROWS.

    The page mounts its phone layout and its desktop layout at once and lets
    CSS hide one, so a document-wide querySelector finds the hidden copy's
    controls first. An earlier version of this pressed those and reported that
    the arrow moved nothing — it had pressed a button nobody can see.
  */
  const root = t.closest(".group") || t.parentElement
  const dots = [...root.querySelectorAll('button[aria-label^="Go to slide"]')]
  const active = dots.findIndex((d) => d.className.indexOf("w-6") !== -1)
  return { slideLeft: Math.round(first.left), scrollLeft: Math.round(t.scrollLeft),
           scrollWidth: Math.round(t.scrollWidth), clientWidth: Math.round(t.clientWidth),
           activeDot: active }
})()`

async function main(WIDTH, TOUCH) {
  const profile = mkdtempSync(join(tmpdir(), "storelib-drag-"))
  const chrome = spawn(CHROMIUM, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
    `--window-size=${WIDTH},${HEIGHT}`, ...reachabilityFlags(), "about:blank",
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
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: TOUCH, screenWidth: WIDTH, screenHeight: HEIGHT, positionX: 0, positionY: 0 })
  /*
    ONE COORDINATE SYSTEM, OR THE DRAG LANDS SOMEWHERE ELSE.

    Input.dispatchTouchEvent takes device pixels; elementFromPoint answers in
    CSS pixels. With a device scale factor these are different numbers, and a
    probe that verifies its aim with one and then touches with the other will
    report that the slider ignored a finger it never received. Measured on a
    local page at scale 3: the CSS viewport came out 1560x3376 for a 390x844
    device, so a touch aimed at x=265 arrived at x=1060. Scale 1 keeps the two
    the same, which is all this check needs.
  */
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })  /* a desktop page can still be a touchscreen */
  await send("Page.navigate", { url: URL_UNDER_TEST })

  let box = null
  for (let i = 0; i < 30 && !box; i++) { await sleep(1000); box = await ev(LOCATE) }
  if (!box) {
    const why = await ev(`JSON.stringify({ title: document.title, imgs: document.querySelectorAll("img").length, divs: document.querySelectorAll("div").length, transforms: [...document.querySelectorAll("div")].filter((d) => (d.style.transform || "").startsWith("translate3d")).map((d) => ({ t: d.style.transform, off: !!d.offsetParent, w: Math.round(d.getBoundingClientRect().width) })).slice(0, 6), body: (document.body.innerText || "").slice(0, 120) })`)
    ws.close(); reap(); fail(`No slider appeared on this page within 30s.\n  ${why}`)
  }
  await sleep(2500)

  /*
    AUTOPLAY FIRST, BECAUSE A TOUCH PAUSES IT.

    Measured before anything is touched: where the track sits, sampled once a
    second for thirteen seconds. The interval is five, so a working autoplay
    changes this number at least twice.
  */
  const autoplay = []
  for (let i = 0; i < 13; i++) { autoplay.push(await ev(X_OF)); await sleep(1000) }

  /* Refresh the coordinates from the element already held, rather than
     searching again: a second search can come back empty for its own reasons
     and that is not something this check is trying to find out. */
  const fresh = await ev(`(() => {
    const t = window.__track
    if (!t) return null
    const b = t.getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2),
             left: Math.round(b.left), width: Math.round(b.width), height: Math.round(b.height),
             touchAction: getComputedStyle(t).touchAction }
  })()`)
  if (fresh) box = { ...box, ...fresh }

  /*
    THEN THE FINGER. Real touch input, entering where a finger enters.
    Twelve steps of 22px, which is a slow deliberate drag, not a flick.
  */
  /*
    DOES THE TOUCH EVEN ARRIVE?

    Capture-phase counters on the document and on the slider's own container,
    which separates "the handler is broken" from "the handler is never
    called". Also records what the browser says about each touchmove: a
    touchmove that arrives with cancelable false has already been given to
    the page's scroll and cannot be taken back.
  */
  await ev(`(() => {
    const box = window.__track
    window.__tap = { docStart: 0, docMove: 0, boxStart: 0, boxMove: 0, cancelable: [], targets: [] }
    document.addEventListener("touchstart", (e) => { window.__tap.docStart++; window.__tap.targets.push((e.target.tagName || "?") + "." + String(e.target.className || "").slice(0, 30)) }, true)
    document.addEventListener("touchmove", (e) => { window.__tap.docMove++; if (window.__tap.cancelable.length < 4) window.__tap.cancelable.push(e.cancelable) }, true)
    box.addEventListener("touchstart", () => { window.__tap.boxStart++ }, true)
    box.addEventListener("touchmove", () => { window.__tap.boxMove++ }, true)
    return true
  })()`)

  /*
    SCROLL IT INTO VIEW FIRST, BECAUSE THAT IS WHAT A VISITOR DOES.

    Left where it loads, this slider sat at y 697..990 of an 844px viewport —
    a strip at the very bottom, under the cookie banner, which is fixed at
    z-9999 across the full width and 150px tall. Dragging there measured the
    banner, not the slider.
  */
  await ev(`(() => {
    const b = window.__track.getBoundingClientRect()
    window.scrollBy(0, Math.round(b.top + b.height / 2 - window.innerHeight / 2))
    return true
  })()`)
  await sleep(1200)

  /*
    AIM AT THE SLIDER, AND CHECK THAT IS WHERE THE AIM LANDS.

    A drag is only a test of the slider if the finger actually lands on it.
    elementFromPoint is the browser's own hit test, so it answers the
    question the same way a finger does — including anything drawn on top.
  */
  const aim = await ev(`(() => {
    const box = window.__track
    const b = box.getBoundingClientRect()
    const x = Math.round(b.left + b.width * 0.7)
    const describe = (el) => el ? el.tagName + "." + String(el.className || "").slice(0, 44) : "nothing"
    const centre = document.elementFromPoint(x, Math.round(b.top + b.height / 2))
    const blocked = !(centre && box.contains(centre))
    /* If something is on top, find the highest point on the slider that is
       not covered, so the slider itself can still be tested. */
    let y = null
    for (let probe = Math.round(b.top + 8); probe < b.bottom - 8; probe += 8) {
      const el = document.elementFromPoint(x, probe)
      if (el && box.contains(el)) { y = probe; break }
    }
    const coverer = blocked ? centre : null
    return {
      x, y, blocked,
      centreHit: describe(centre),
      covererBox: coverer ? (() => { const r = coverer.getBoundingClientRect()
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) } })() : null,
      sliderBox: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
      viewport: window.innerHeight,
    viewportWidth: window.innerWidth,
    dpr: window.devicePixelRatio,
    }
  })()`)

  const before = await ev(X_OF)
  const pixBefore = await ev(PIX_OF)
  const scrollBefore = await ev("Math.round(window.scrollY)")
  /*
    THE POINT THE HIT TEST APPROVED, NOT ONE NEAR IT.

    An earlier version verified one x with elementFromPoint and then started
    the drag from a different one, and reported that the slider ignored a
    finger which had in fact landed on the page behind it. Once a touch has
    started, the gesture stays with its target, so travelling off the edge of
    the element part-way through is fine; starting off it is not.
  */
  const startX = aim.x
  const y = aim.y ?? box.y
  /* One last look at the exact point about to be touched, taken at the
     moment of the touch rather than a few hundred milliseconds before it. */
  const atTouchTime = await ev(`(() => {
    const el = document.elementFromPoint(${startX}, ${y})
    const box = window.__track
    const b = box.getBoundingClientRect()
    return { hit: el ? el.tagName + "." + String(el.className || "").slice(0, 34) : "nothing",
             inside: !!(el && box.contains(el)), scrollY: Math.round(window.scrollY),
             boxTop: Math.round(b.top), boxBottom: Math.round(b.bottom),
             boxLeft: Math.round(b.left), boxRight: Math.round(b.right) }
  })()`)
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y }] })
  const follow = []
  for (let i = 1; i <= 12; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX - i * 22, y }] })
    await sleep(40)
    follow.push(await ev(X_OF))
  }
  const pixDuring = await ev(PIX_OF)
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(1200)
  const settled = await ev(X_OF)
  const pixAfter = await ev(PIX_OF)

  /*
    AND THE ARROW, WHICH THE REPORT SAYS MOVES NOTHING EITHER.
  */
  const arrowBefore = await ev(PIX_OF)
  const arrowPressed = await ev(`(() => {
    const root = window.__track.closest(".group") || window.__track.parentElement
    const b = root.querySelector('button[aria-label="Next image"]')
    if (b) b.click()
    return !!b
  })()`)
  await sleep(1400)
  const arrowAfter = await ev(PIX_OF)

  /* And what the page did underneath: a slider that hands the gesture to the
     page scrolls the page instead of moving. */
  /* The page's own scroll, measured across the drag rather than from zero:
     the slider was deliberately scrolled into view before it. */
  const scrolledBy = Math.abs((await ev("Math.round(window.scrollY)")) - scrollBefore)
  const tap = await ev("window.__tap")

  /*
    DOES AUTOPLAY COME BACK AFTER A TOUCH?

    It is paused while a finger is down and released half a second after it
    lifts, so thirteen seconds later it should have advanced at least twice
    again. A report that autoplay does not work on a phone, from somebody who
    has necessarily touched the page, is a report about THIS number rather
    than the one measured on load.
  */
  const autoplayAfterTouch = []
  for (let i = 0; i < 13; i++) { autoplayAfterTouch.push(await ev(X_OF)); await sleep(1000) }

  /*
    AND A FINGER THAT DOES NOT START PERFECTLY STRAIGHT.

    A real swipe begins with a few pixels of wobble. If the direction is
    decided on the first sample that clears a threshold, a first move that is
    slightly more vertical than horizontal locks the whole gesture to
    "vertical" and the slider ignores the rest of it, however flat the finger
    then travels. This drags 8px left and 10px down, and then straight left.
  */
  const dgStart = { x: startX, y }
  const dgBefore = await ev(X_OF)
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: dgStart.x, y: dgStart.y }] })
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: dgStart.x - 8, y: dgStart.y + 10 }] })
  await sleep(40)
  const diagonal = []
  for (let i = 1; i <= 10; i++) {
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: dgStart.x - 8 - i * 22, y: dgStart.y + 10 }] })
    await sleep(40)
    diagonal.push(await ev(X_OF))
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(1200)
  const diagonalSettled = await ev(X_OF)

  ws.close()
  reap()
  return { box, autoplay, before, follow, settled, scrolledBy, tap, aim, autoplayAfterTouch, dgBefore, diagonal, diagonalSettled, atTouchTime, startX, y, pixBefore, pixDuring, pixAfter, arrowBefore, arrowAfter, arrowPressed }
}

const uniq = (a) => [...new Set(a.filter((n) => n !== null).map((n) => Math.round(n)))]
const problems = []

/*
  BOTH COPIES, EVERY RUN.

  The page mounts its phone layout and its desktop layout at the same time and
  lets CSS hide one, so they are two separate carousels with two separate sets
  of state. Checking one and reporting on "the slider" is how a broken copy
  goes unnoticed — and the desktop copy is the one in the screenshot that came
  with the second report.
*/
for (const WIDTH of WIDTHS) {
  const r = await main(WIDTH, WIDTH < 768)
  const say = (label, value) => console.log(`  ${label.padEnd(23)} ${value}`)
  const note = (m) => problems.push(`at ${WIDTH}px: ${m}`)

  console.log(`\n${URL_UNDER_TEST}  (${WIDTH}x${HEIGHT}, real touch input)\n`)
  say("slider box", `${r.box.width}x${r.box.height} at x=${r.box.left}, touch-action ${r.box.touchAction}, snap ${r.box.snap}`)
  say("slider spans y", `${r.aim.sliderBox.top}..${r.aim.sliderBox.bottom} of a ${r.aim.viewportWidth}x${r.aim.viewport} viewport`)
  say("its centre hit-tests to", `${r.aim.centreHit}${r.aim.blocked ? "  <-- NOT THE SLIDER" : ""}`)
  if (r.aim.covererBox) say("that thing covers y", `${r.aim.covererBox.top}..${r.aim.covererBox.bottom}, x ${r.aim.covererBox.left}..${r.aim.covererBox.right}`)
  say("autoplay over 13s", JSON.stringify(uniq(r.autoplay)))
  say("autoplay after a touch", JSON.stringify(uniq(r.autoplayAfterTouch)))
  say("follows the finger", `scrollLeft ${JSON.stringify(r.follow.map((n) => (n === null ? null : Math.round(n))))}`)
  say("THE PICTURE WAS AT", `x=${r.pixBefore.slideLeft}, during the drag x=${r.pixDuring.slideLeft}, after x=${r.pixAfter.slideLeft}`)
  say("pressing the arrow", `${r.arrowPressed ? "" : "(no arrow found) "}picture x=${r.arrowBefore.slideLeft} -> ${r.arrowAfter.slideLeft}, dot ${r.arrowBefore.activeDot} -> ${r.arrowAfter.activeDot}`)
  say("a diagonal start", JSON.stringify(r.diagonal.map((n) => (n === null ? null : Math.round(n)))))
  say("the scroller holds", `${r.pixBefore.scrollWidth}px of content in ${r.pixBefore.clientWidth}px`)
  say("page scrolled by", `${r.scrolledBy}px`)
  say("touches reaching it", `the slider's box ${r.tap.boxStart} start / ${r.tap.boxMove} move`)

  if (r.aim.blocked)
    note(`the middle of the slider hit-tests to ${r.aim.centreHit}, not the slider — something is drawn over it and takes the touch`)
  if (r.aim.y === null) note("no part of the slider was reachable by a finger at all")

  /*
    THE PICTURE HAS TO MOVE. Everything else here is a proxy for it, and the
    second report was made of exactly that gap: the dots advanced, scrollLeft
    advanced, and the gallery sat still.
  */
  if (r.pixBefore.slideLeft === r.pixDuring.slideLeft)
    note(`the first picture stayed at x=${r.pixBefore.slideLeft} for the whole drag while scrollLeft went ${r.pixBefore.scrollLeft} -> ${r.pixDuring.scrollLeft} — the dots move and the gallery does not`)
  if (!r.arrowPressed) note("this carousel has no next arrow to press")
  else if (r.arrowBefore.slideLeft === r.arrowAfter.slideLeft)
    note(`pressing the next arrow left the picture at x=${r.arrowAfter.slideLeft} (dot went ${r.arrowBefore.activeDot} -> ${r.arrowAfter.activeDot})`)
  if (r.pixBefore.scrollWidth <= r.pixBefore.clientWidth + 8)
    note(`the scroller holds ${r.pixBefore.scrollWidth}px in ${r.pixBefore.clientWidth}px, so there is nothing to scroll to`)

  const steps = uniq(r.follow)
  if (steps.length <= 1) note(`the row sat at ${JSON.stringify(steps)} for the whole drag — it does not follow the finger at all`)
  else if (steps.length < 5) note(`the row took only ${steps.length} distinct positions across 12 moves — it jumps rather than follows`)
  if (r.scrolledBy > 8) note(`the page scrolled ${r.scrolledBy}px during a horizontal drag — the gesture went to the page, not the slider`)
  if (uniq(r.autoplay).length < 2) note("the row never moved on its own in 13 seconds — autoplay is not running")
  if (uniq(r.autoplayAfterTouch).length < 2)
    note(`autoplay never resumed after the page was touched — it sat at ${JSON.stringify(uniq(r.autoplayAfterTouch))} for 13 seconds`)
  if (uniq(r.diagonal).length <= 1)
    note(`a drag that began 8px left and 10px down moved the row not at all (${JSON.stringify(uniq(r.diagonal))})`)
}

console.log("")
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("Both sliders follow a finger, their arrows move the pictures, and autoplay runs.\n")
