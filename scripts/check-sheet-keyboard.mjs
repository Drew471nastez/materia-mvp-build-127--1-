/**
 * ===========================================================================
 *  THE ADD SECTION SHEET, WITH A KEYBOARD UP
 * ===========================================================================
 * Reported with a screenshot: tap the search field in Add section on a phone
 * and the list is replaced by a tall white band between the first card and
 * the keyboard. Nothing is wrong before the keyboard opens.
 *
 * A keyboard cannot be opened in headless Chromium, but the thing under test
 * is not the keyboard: it is what THIS code does when `visualViewport` says
 * one is there. iOS does not shrink the layout viewport for a keyboard, it
 * shrinks the visual one, and the sheet reads exactly that to work out what
 * is covered. So the probe installs a `visualViewport` it can move, before
 * the editor mounts, and then moves it. Every line of sheet maths that runs
 * on a phone runs here.
 *
 * IT MEASURES TWO DIFFERENT WAYS TO GET A WHITE BAND, because they need
 * different fixes and they look identical in a screenshot:
 *
 *   GEOMETRY   the sheet's content box ends far above the keyboard, so the
 *              panel's own background shows through the difference.
 *   PAINT      the cards are laid out correctly and not DRAWN, which is what
 *              `content-visibility: auto` does to a subtree it has decided is
 *              out of view. A skipped subtree is not laid out either, so its
 *              descendants measure as zero, and that is how it is told apart
 *              from the first one.
 *
 *   node scripts/check-sheet-keyboard.mjs
 */
import { spawn } from "node:child_process"
import { writeFileSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { CHROMIUM, bundle, css, out, fail } from "./editor-probe-harness.mjs"

/** About what an iPhone keyboard plus its accessory bar covers. */
const KEYBOARD = 336

/**
 * Installed BEFORE the bundle, so the sheet's listeners attach to this and
 * not to the real one. An EventTarget with the fields the sheet reads.
 */
const FAKE_VIEWPORT = `
<script>
(function () {
  var vv = new EventTarget()
  vv.width = window.innerWidth
  vv.height = window.innerHeight
  vv.offsetTop = 0
  vv.offsetLeft = 0
  vv.pageTop = 0
  vv.pageLeft = 0
  vv.scale = 1
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true })
  /** Who is listening, so a silent sheet can be told from a wrong number. */
  vv.__listeners = 0
  var add = vv.addEventListener.bind(vv)
  vv.addEventListener = function (type, fn, opts) { vv.__listeners++; return add(type, fn, opts) }
  window.__keyboard = function (px) {
    vv.height = window.innerHeight - px
    vv.dispatchEvent(new Event("resize"))
    vv.dispatchEvent(new Event("scroll"))
  }
})()
</script>`

/**
 * DRIVEN THROUGH THE DEVTOOLS PROTOCOL, NOT AS A PAGE SCRIPT.
 *
 * The first version of this ran under `--dump-dom --virtual-time-budget`,
 * where requestAnimationFrame NEVER FIRES: measured, 0 of 3 callbacks. The
 * sheet coalesces its viewport maths into a frame, so that harness reported
 * a sheet ignoring the keyboard when the truth was that the probe never let
 * it hear about one. A real headless target paints, so rAF runs, so the code
 * under test actually runs.
 *
 * No regex literals in here: a backslash in a template literal is eaten.
 */
const DRIVE = `
(async function () {
  var steps = []
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function click(el) {
    if (!el) return false
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }))
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))
    return true
  }
  function byText(text) {
    var all = document.querySelectorAll("button, [role=button]")
    for (var i = 0; i < all.length; i++) {
      if ((all[i].textContent || "").trim() === text) return all[i]
    }
    return null
  }
  function box(el) {
    if (!el) return null
    var r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), width: Math.round(r.width) }
  }

  /**
   * A card that is laid out but not drawn. content-visibility: auto skips
   * both the paint AND the layout of the subtree, so an element inside it
   * has no box at all. The card itself still measures, which is exactly the
   * white rectangle of the right size somebody sees.
   */
  function painted(card) {
    var inner = card.querySelector(".origin-top-left")
    if (!inner) return false
    var kid = inner.firstElementChild
    if (!kid) return false
    var r = kid.getBoundingClientRect()
    return r.height > 0 && r.width > 0
  }

  /**
   * THE SHEET THAT HOLDS THE LIBRARY, not the first one in the document.
   *
   * The editor has several of these mounted at once and the closed ones are
   * parked below the fold, so querySelector returns a sheet that is nowhere
   * near the screen. The first version of this probe measured one of those
   * and reported padding-bottom 0px on a sheet that had no keyboard under it
   * because it had nothing under it at all.
   */
  function librarySheet() {
    var all = document.querySelectorAll("[data-mobile-bottom-sheet]")
    for (var i = 0; i < all.length; i++) {
      if (all[i].querySelector("[data-library-card]")) return all[i]
    }
    for (var j = 0; j < all.length; j++) {
      if ((all[j].textContent || "").indexOf("Add section") >= 0) return all[j]
    }
    return all[0] || null
  }

  function survey(label, keyboardPx) {
    var sheet = librarySheet()
    var scroll = sheet ? sheet.querySelector("[data-sheet-scroll]") : null
    var cards = sheet ? sheet.querySelectorAll("[data-library-card]") : document.querySelectorAll("[data-library-card]")
    var keyboardLine = window.innerHeight - keyboardPx

    /** The lowest thing actually DRAWN inside the sheet. */
    var lowestDrawn = 0
    var drawn = 0
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].getBoundingClientRect()
      if (r.top > keyboardLine || r.bottom < 0) continue
      if (painted(cards[i])) { drawn++; lowestDrawn = Math.max(lowestDrawn, Math.round(r.bottom)) }
    }

    var sheetBox = box(sheet)
    var pad = sheet ? getComputedStyle(sheet).paddingBottom : ""
    var scrollBox = box(scroll)

    return {
      label: label,
      innerHeight: window.innerHeight,
      visualHeight: window.visualViewport ? Math.round(window.visualViewport.height) : null,
      keyboardLine: keyboardLine,
      sheet: sheetBox,
      sheetPaddingBottom: pad,
      sheetPaddingRaw: sheet ? sheet.style.paddingBottom : "",
      viewportListeners: window.visualViewport ? (window.visualViewport.__listeners || 0) : 0,
      scroller: scrollBox,
      scrollHeight: scroll ? Math.round(scroll.scrollHeight) : null,
      scrollTop: scroll ? Math.round(scroll.scrollTop) : null,
      cards: cards.length,
      cardsInView: (function () { var n = 0; for (var i = 0; i < cards.length; i++) { var r = cards[i].getBoundingClientRect(); if (r.top < keyboardLine && r.bottom > 0) n++ } return n })(),
      cardsDrawn: drawn,
      lowestDrawn: lowestDrawn,
      /**
       * THE WHITE BAND, as a number. From the lowest thing drawn to the top
       * of the keyboard. Everything in it is the sheet's own background.
       */
      emptyBand: lowestDrawn ? Math.round(keyboardLine - lowestDrawn) : null,
      /** Where the content box ends, which is the panel minus its padding. */
      contentEndsAt: sheetBox && pad ? Math.round(sheetBox.bottom - parseFloat(pad)) : null,
    }
  }

  /**
   * DOES rAF EVEN RUN HERE? The sheet coalesces its viewport maths into a
   * frame, so a headless mode that never paints would report a sheet that
   * ignored the keyboard when in truth the probe never let it hear about it.
   * Checked rather than assumed, because the difference is the whole finding.
   */
  async function frameLiveness() {
    var fired = 0
    for (var i = 0; i < 3; i++) requestAnimationFrame(function () { fired++ })
    await sleep(400)
    return fired
  }

  async function go() {
    var opener = byText("Add section") || byText("Add Section") || byText("Add a section")
    steps.push({ label: "the button that opens the library", found: !!opener })
    click(opener)
    await sleep(1200)

    steps.push({ label: "animation frames fire in this browser", frames: await frameLiveness() })
    steps.push(survey("before the keyboard", 0))

    /** Focus the field the way a thumb does, then raise the keyboard. */
    var host = librarySheet()
    var field = host ? host.querySelector("input[type=text], input:not([type]), input[type=search]") : null
    steps.push({ label: "the search field", found: !!field })
    if (field) field.focus()
    window.__keyboard(${KEYBOARD})
    await sleep(1200)

    steps.push(survey("with the keyboard up", ${KEYBOARD}))
  }

  for (var tries = 0; tries < 150; tries++) {
    if (document.querySelector("[data-mobile-bottom-sheet], [data-wb-sidebar-scroll], #wb-preview-root")) break
    await sleep(200)
  }
  try { await go() } catch (e) { steps.push({ label: "threw", message: String(e && e.message) }) }
  return steps
})()`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const PORT = Number(process.env.CDP_PORT ?? 9455)

async function run(width, height) {
  const file = join(out, "keyboard.html")
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(
    file,
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div>${FAKE_VIEWPORT}<script>window.PROBE_SHORT=false</script><script src="editor-probe.js"></script></body></html>`,
  )

  const chrome = spawn(
    CHROMIUM,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--force-device-scale-factor=1",
      "--blink-settings=primaryHoverType=1,availableHoverTypes=1,primaryPointerType=2,availablePointerTypes=2",
      `--remote-debugging-port=${PORT}`,
      "--remote-allow-origins=*",
      `--window-size=${width},${height}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  )
  let stderr = ""
  chrome.stderr.on("data", (d) => (stderr += String(d)))

  let version = null
  for (let i = 0; i < 60 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
    } catch {
      await sleep(250)
    }
  }
  if (!version) {
    chrome.kill()
    fail(`Chromium never opened a debugging port.\n${stderr.slice(-600)}`)
  }

  try {
    const ws = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true })
      ws.addEventListener("error", rej, { once: true })
    })
    let id = 0
    const pending = new Map()
    let sessionId = null
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg)
        pending.delete(msg.id)
      }
    })
    const send = (method, params = {}, session = sessionId) =>
      new Promise((resolve) => {
        const n = ++id
        pending.set(n, resolve)
        ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) }))
      })

    const { result: created } = await send("Target.createTarget", { url: "about:blank" }, null)
    const { result: attached } = await send("Target.attachToTarget", { targetId: created.targetId, flatten: true }, null)
    sessionId = attached.sessionId
    await send("Page.enable")
    await send("Runtime.enable")
    /** A real phone's viewport, not the window the OS was willing to give. */
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true })
    await send("Page.navigate", { url: `file://${file}` })
    await sleep(4_000)

    const answer = await send("Runtime.evaluate", { expression: DRIVE, awaitPromise: true, returnByValue: true, timeout: 120_000 })
    const r = answer.result?.result
    if (!r || r.subtype === "error" || answer.result?.exceptionDetails) {
      fail(`the drive threw: ${JSON.stringify(answer.result?.exceptionDetails ?? r)?.slice(0, 800)}`)
    }
    ws.close()
    return r.value ?? []
  } finally {
    chrome.kill()
  }
}

let failures = 0
console.log(`\n══ Add section, phone, keyboard ${KEYBOARD}px ══`)
const surveys = []
for (const s of await run(390, 844)) {
  if (!s.sheet) {
    console.log(`  ${JSON.stringify(s)}`)
    continue
  }
  surveys.push(s)
  console.log(`\n  ${s.label}`)
  console.log(`    window ${s.innerHeight}px, visual ${s.visualHeight}px, the keyboard starts at ${s.keyboardLine}px`)
  console.log(`    the sheet: top ${s.sheet.top}, bottom ${s.sheet.bottom}, padding-bottom ${s.sheetPaddingBottom}`)
  console.log(`    its inline padding rule: ${s.sheetPaddingRaw || "(none)"}   viewport listeners: ${s.viewportListeners}`)
  console.log(`    its content box ends at ${s.contentEndsAt}px`)
  console.log(`    the scroller: top ${s.scroller ? s.scroller.top : "?"}, bottom ${s.scroller ? s.scroller.bottom : "?"}, scrollHeight ${s.scrollHeight}, scrollTop ${s.scrollTop}`)
  console.log(`    cards ${s.cards}, in view ${s.cardsInView}, actually drawn ${s.cardsDrawn}`)
  console.log(`    lowest drawn pixel ${s.lowestDrawn}, empty band above the keyboard ${s.emptyBand}px`)
}

const after = surveys.find((s) => s.label === "with the keyboard up")
const before = surveys.find((s) => s.label === "before the keyboard")

console.log("")
if (!after || !before) {
  console.log("  ✗   the sheet never opened, so nothing was measured")
  failures++
} else {
  const ok = (name, pass, detail) => {
    if (!pass) failures++
    console.log(`  ${pass ? "ok  " : "✗   "} ${name}${detail ? `  ${detail}` : ""}`)
  }

  /**
   * THE REGRESSION, AS ONE NUMBER. The keyboard was counted twice: once by
   * browserChromeGap, which can only ask `innerHeight - visualViewport
   * .height` and gets the keyboard in the answer, and once by keyboardInset.
   * 672px of padding for a 336px keyboard. If this is ever a multiple of the
   * keyboard again, that is the same bug back.
   */
  const pad = parseFloat(after.sheetPaddingBottom) || 0
  ok("the sheet is padded by the keyboard, once", Math.abs(pad - KEYBOARD) <= 2, `${pad}px of padding for a ${KEYBOARD}px keyboard`)

  /**
   * And the consequence, which is what somebody sees: the content box has to
   * end AT the keyboard. Ending above it is the sheet's own background
   * showing through, which is the white band that was reported.
   */
  ok(
    "the content reaches the keyboard and stops there",
    Math.abs(after.contentEndsAt - after.keyboardLine) <= 2,
    `content ends at ${after.contentEndsAt}, keyboard at ${after.keyboardLine}`,
  )

  /**
   * The list keeps a list's worth of room. Fewer whole cards fit with a
   * keyboard up, which is correct; a 44px scroller is not.
   */
  const roomAfter = after.scroller ? after.scroller.bottom - after.scroller.top : 0
  const roomBefore = before.scroller ? before.scroller.bottom - before.scroller.top : 0
  ok("the list keeps usable height", roomAfter >= 200, `${roomAfter}px of list, was ${roomBefore}px`)
  ok(
    "and it is not collapsed to a strip",
    roomBefore > 0 && roomAfter / roomBefore > 0.35,
    `${Math.round((roomAfter / roomBefore) * 100)}% of the room it had`,
  )

  ok(
    "the cards in view are drawn, not left as empty boxes",
    after.cardsInView > 0 && after.cardsDrawn === after.cardsInView,
    `${after.cardsDrawn} drawn of ${after.cardsInView} in view`,
  )
  ok("the whole library is still there to scroll", after.cards === before.cards, `${after.cards} cards`)
}

console.log(failures ? `\n  ${failures} to fix\n` : `\n  The list keeps its cards and reaches the keyboard.\n`)
process.exit(failures ? 1 : 0)
