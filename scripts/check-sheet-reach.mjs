/**
 * ===========================================================================
 *  AT THE HALF STOP, THE END OF THE LIST CAN BE SCROLLED ONTO THE SCREEN
 * ===========================================================================
 * The sheet is always its full height and is slid down to its stops, so at
 * the half stop the bottom part of it, and of the scroller inside it, is
 * below the screen. The stylesheet makes up for that with a spacer after the
 * content of any `[data-sheet-scroll]`, as tall as the part that is hidden,
 * so scrolling to the end brings the end onto the screen.
 *
 * The Sections sheet's own scroller was marked `data-wb-sidebar-scroll` and
 * nothing else, so it never got the spacer. This mounts the REAL editor on a
 * phone, opens the Sections sheet to its half stop, scrolls the list as far
 * as it goes, and measures where the last thing in it ends against the
 * bottom of the screen. Then the same for a section's settings panel and the
 * Hide / Duplicate / Delete row at its foot.
 *
 * AND WITH A FINGER, on the real editor, at the half stop: a push up inside
 * the list scrolls the list and leaves the sheet's translate where it was (it
 * used to grow the sheet first); the same push on the grab bar moves the
 * sheet; and a tap on the grab bar steps half to full and back.
 *
 *   pnpm build && node scripts/check-sheet-reach.mjs
 *
 * The editor bundle is built by scripts/check-editor-scroll.mjs, which owns
 * the stubs; set EDITOR_BUNDLE to reuse one.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-sheetreach-"))
const bundle = process.env.EDITOR_BUNDLE ?? join(out, "editor-probe.js")
if (!existsSync(bundle)) {
  execFileSync(process.execPath, [join(root, "scripts/check-editor-scroll.mjs")], {
    cwd: root, stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, EDITOR_BUNDLE: bundle, EDITOR_BUNDLE_ONLY: "1" },
  })
}
if (!existsSync(bundle)) fail("The editor bundle was not built.")
writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
const file = join(out, "index.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script src="editor-probe.js"></script></body></html>`)

const W = 390, H = 844
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "--allow-file-access-from-files", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
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
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })
const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 0, type: "portraitPrimary" } })
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
/* SAFE_TOP=59 is a notched iPhone's status bar; 0 (the default) a browser. */
const SAFE_TOP = Number(process.env.SAFE_TOP ?? 0)
if (SAFE_TOP) {
  await call("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: SAFE_TOP, topMax: SAFE_TOP, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 },
  })
}
await call("Page.navigate", { url: "file://" + file })
const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}`)
  return r.result.value
}

/* Ready when the canvas has drawn sections. */
let ready = false
for (let i = 0; i < 200 && !ready; i++) {
  await sleep(150)
  ready = await js(`(() => { const sc = document.getElementById("wb-preview-root"); return !!sc && sc.querySelectorAll("[id^=wb-section-]").length >= 3 })()`)
}
if (!ready) fail("The editor never drew its sections.")

const HELPERS = `
  window.__btn = (label) => {
    const want = label.toLowerCase()
    const all = [...document.querySelectorAll("button, [role=tab]")]
    const name = (b) => (b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || "").trim().toLowerCase()
    return all.find((b) => name(b) === want) || all.find((b) => name(b).indexOf(want) === 0) || null
  }
  window.__click = (el) => {
    const r = el.getBoundingClientRect()
    const o = { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }
    el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new MouseEvent("mousedown", o))
    el.dispatchEvent(new PointerEvent("pointerup", o)); el.dispatchEvent(new MouseEvent("mouseup", o))
    el.dispatchEvent(new MouseEvent("click", o))
  }
  /** Every scroller in the sheet, scrolled as far as it goes, outermost first. */
  window.__scrollAllToEnd = () => {
    const sheet = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]")
    const scrollers = [...sheet.querySelectorAll("*")].filter((el) => {
      const cs = getComputedStyle(el)
      return /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1
    })
    for (let pass = 0; pass < 3; pass++) for (const el of scrollers) el.scrollTop = el.scrollHeight
    return scrollers.length
  }
  /* Leaves only: the panel inside the list is h-full, so its own box ends
     wherever the scroller does and says nothing about the last row. */
  window.__lastBottom = (root) => {
    let bottom = -Infinity, who = ""
    for (const el of root.querySelectorAll("*")) {
      const r = el.getBoundingClientRect()
      if (r.height <= 0 || r.width <= 0 || el.children.length > 0) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === "hidden" || cs.display === "none") continue
      if (r.bottom > bottom) { bottom = r.bottom; who = el.tagName.toLowerCase() + (el.textContent || "").trim().slice(0, 24).replace(/\\s+/g, " ") }
    }
    return { bottom, who }
  }
  true
`
await js(HELPERS)

/* The Sections tab opens the sheet to its middle stop. */
await js(`(() => { const b = window.__btn("Sections"); if (b) window.__click(b); return !!b })()`)
await sleep(1200)

/* ── A finger at the half stop ────────────────────────────────────────── */
const touch = (type, x, y) => call("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
const SHEET_STATE = `JSON.stringify((() => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]")
  const list = sheet.querySelector("[data-wb-sidebar-scroll]")
  /* The list and the panel scroller inside it: the Sections rows scroll in
     the inner one, and the outer one carries the room for the hidden part. */
  const scrollers = [list, ...list.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY))
  const scroll = scrollers.reduce((sum, el) => sum + el.scrollTop, 0)
  const room = scrollers.reduce((sum, el) => sum + Math.max(0, el.scrollHeight - el.clientHeight), 0)
  /* The one a finger in the list scrolls: the innermost, holding the rows. */
  const inner = scrollers[scrollers.length - 1]
  return { top: sheet.getBoundingClientRect().top, ty: new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42, scroll, room, outerRoom: list.scrollHeight - list.clientHeight, innerRoom: inner.scrollHeight - inner.clientHeight }
})())`
const state = async () => JSON.parse(await js(SHEET_STATE))
const finger = {}
{
  const before = await state()
  const x = Math.round(W / 2)
  const y0 = Math.round(before.top) + 170
  await touch("touchStart", x, y0)
  let at = y0
  for (let i = 1; i <= 12; i++) { at = y0 - 12 * i; await touch("touchMove", x, at); await sleep(16) }
  const mid = await state()
  await touch("touchEnd", x, at)
  await sleep(900)
  const after = await state()
  finger.listPush = { travel: y0 - at, tyBefore: Math.round(before.ty), tyMoved: Math.round(mid.ty - before.ty), scrolled: Math.round(mid.scroll - before.scroll), room: before.room, outerRoom: before.outerRoom, innerRoom: before.innerRoom, topAfter: Math.round(after.top) }
  /* The inner scroller alone, to its end: does the last row come on screen? */
  finger.innerEnd = JSON.parse(await js(`(() => {
    const l = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true] [data-wb-sidebar-scroll]")
    const s = [...l.querySelectorAll("*")].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY)).pop()
    s.scrollTop = s.scrollHeight
    const rows = [...s.querySelectorAll("button[aria-label^='Options for']")]
    return JSON.stringify({ lastRowBottom: Math.round(rows[rows.length - 1].getBoundingClientRect().bottom), screen: window.innerHeight })
  })()`))
  await js(`(() => { const l = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true] [data-wb-sidebar-scroll]"); for (const el of [l, ...l.querySelectorAll("*")]) el.scrollTop = 0 })()`)
  await sleep(200)
}
{
  const before = await state()
  const x = Math.round(W / 2)
  const y0 = Math.round(before.top) + 10
  await touch("touchStart", x, y0)
  let at = y0
  for (let i = 1; i <= 6; i++) { at = y0 - 10 * i; await touch("touchMove", x, at); await sleep(16) }
  const mid = await state()
  finger.barPush = { tyMoved: Math.round(before.ty - mid.ty), scrolled: Math.round(mid.scroll - before.scroll) }
  await sleep(300)
  await touch("touchEnd", x, at)
  await sleep(900)
}
{
  const tap = async () => {
    const s = await state()
    const y = Math.round(s.top) + 10
    await touch("touchStart", Math.round(W / 2), y)
    await sleep(40)
    await touch("touchEnd", Math.round(W / 2), y)
    await sleep(900)
    return Math.round((await state()).top)
  }
  finger.tapFrom = Math.round((await state()).top)
  finger.tap1 = await tap()
  finger.tap2 = await tap()

  /*
    THE TALLEST STOP AGAINST THE EDITOR'S BAR. Every button in the bar is
    either wholly above the sheet's top edge or wholly under the sheet: a
    button crossing the edge is the violet sliver at the sheet's corners.
  */
  const BAR = `JSON.stringify((() => {
    const bar = document.querySelector("[data-sheet-clear]").getBoundingClientRect()
    const sheets = [...document.querySelectorAll("[data-mobile-bottom-sheet][aria-modal=true]")]
    const sheet = sheets[sheets.length - 1]
    const top = sheet.getBoundingClientRect().top
    const buttons = [...document.querySelectorAll("[data-sheet-clear] button")].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
    const crossing = buttons.filter((r) => r.top < top && r.bottom > top).length
    return { top: Math.round(top), barBottom: Math.round(bar.bottom), buttonsTop: Math.round(Math.min(...buttons.map((r) => r.top))), buttonsBottom: Math.round(Math.max(...buttons.map((r) => r.bottom))), crossing, buttons: buttons.length }
  })())`
  await tap()
  finger.full = JSON.parse(await js(BAR))
  await tap()
  /* Add section: its own sheet, opened over this one at its tallest stop. */
  await js(`(() => { const b = [...document.querySelectorAll("[data-mobile-bottom-sheet] button")].find((x) => x.textContent.trim() === "Add section"); if (b) window.__click(b); return !!b })()`)
  await sleep(1200)
  finger.add = JSON.parse(await js(BAR))
  await js(`(() => { const o = [...document.querySelectorAll("[data-wb-sheet-overlay]")].pop(); o && o.click() })()`)
  await sleep(900)
}
const sections = JSON.parse(await js(`(async () => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]")
  if (!sheet) return JSON.stringify({ open: false })
  const list = sheet.querySelector("[data-wb-sidebar-scroll]")
  const top = sheet.getBoundingClientRect().top
  const n = window.__scrollAllToEnd()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const last = window.__lastBottom(list)
  return JSON.stringify({
    open: true, sheetTop: Math.round(top), sheetHeight: Math.round(sheet.getBoundingClientRect().height),
    markers: [...list.attributes].map((a) => a.name).filter((a) => a.startsWith("data-")).join(" "),
    scrollers: n, scrollTop: Math.round(list.scrollTop), scrollRoom: list.scrollHeight - list.clientHeight,
    spacer: getComputedStyle(list, "::after").height,
    lastBottom: Math.round(last.bottom), lastWho: last.who, screen: window.innerHeight,
    rows: list.querySelectorAll("button[aria-label^='Options for']").length,
  })
})()`))
if (!sections.open) fail("The Sections sheet did not open.")

/* A section's settings: tap the name in the third row. */
await js(`(() => {
  const list = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true] [data-wb-sidebar-scroll]")
  list.scrollTop = 0
  const b = list.querySelectorAll("button[aria-label^='Options for']")[2]
  let row = b && b.parentElement
  while (row && row !== list && !row.querySelector("span.flex-1")) row = row.parentElement
  const label = row && row.querySelector("span.flex-1")
  if (label) window.__click(label)
  return !!label
})()`)
await sleep(1200)
const settings = JSON.parse(await js(`(async () => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]")
  const del = [...sheet.querySelectorAll("button")].find((b) => b.textContent.trim() === "Delete")
  const before = del ? Math.round(del.getBoundingClientRect().bottom) : null
  window.__scrollAllToEnd()
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  return JSON.stringify({
    sheetTop: Math.round(sheet.getBoundingClientRect().top),
    deleteFound: !!del, deleteBottomAtTop: before,
    deleteBottomAtEnd: del ? Math.round(del.getBoundingClientRect().bottom) : null,
    screen: window.innerHeight,
  })
})()`))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

console.log(`\nThe real editor at ${W}x${H}, the Sections sheet at its half stop (top ${sections.sheetTop}, ${sections.sheetHeight}px tall)\n`)
console.log(`  list scroller     ${sections.markers}`)
console.log(`                    ${sections.rows} section rows, room to scroll ${sections.scrollRoom}px, spacer ${sections.spacer}, scrolled to ${sections.scrollTop}`)
console.log(`  end of the list   ${sections.lastBottom}px, screen ends at ${sections.screen}: ${sections.lastBottom <= sections.screen + 1 ? "on screen" : `${sections.lastBottom - sections.screen}px BELOW THE SCREEN`} (${sections.lastWho})`)
console.log(`  section settings  sheet top ${settings.sheetTop}; Delete ends at ${settings.deleteBottomAtTop} before scrolling, ${settings.deleteBottomAtEnd} with everything scrolled to the end`)
console.log(`  finger on list    ${finger.listPush.travel}px up at half (translate ${finger.listPush.tyBefore}px): translate moved ${finger.listPush.tyMoved}px, list scrolled ${finger.listPush.scrolled}px (of ${finger.listPush.room} across its scrollers); sheet top after the lift ${finger.listPush.topAfter}`)
console.log(`                    room: ${finger.listPush.innerRoom}px in the rows' own scroller, ${finger.listPush.outerRoom}px in the sheet's; that scroller alone at its end puts the last row at ${finger.innerEnd.lastRowBottom} of ${finger.innerEnd.screen}`)
console.log(`  finger on bar     60px up: translate moved ${finger.barPush.tyMoved}px, list scrolled ${finger.barPush.scrolled}px`)
console.log(`  taps on the bar   ${finger.tapFrom} -> ${finger.tap1} -> ${finger.tap2}`)
console.log(`  safe area top ${SAFE_TOP}: editor bar ends at ${finger.full.barBottom}, its ${finger.full.buttons} buttons span ${finger.full.buttonsTop}..${finger.full.buttonsBottom}`)
console.log(`                    Sections at full: top ${finger.full.top}, buttons crossing its edge ${finger.full.crossing}`)
console.log(`                    Add section: top ${finger.add.top}, buttons crossing its edge ${finger.add.crossing}`)
console.log("")

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
expect(Math.abs(sections.sheetTop - Math.round(H - H * 0.5)) <= 2, "the sheet is at its half stop")
expect(sections.lastBottom <= sections.screen + 1, "scrolled to its end, the list ends on the screen")
expect(settings.deleteFound && settings.deleteBottomAtEnd <= settings.screen + 1, "and a section's Delete can be scrolled onto the screen")
expect(Math.abs(finger.listPush.tyMoved) <= 1 && finger.listPush.scrolled >= finger.listPush.travel - 20, "a finger pushing up on the list at half scrolls the list by the finger's travel (less the browser's 15px slop), and the sheet's translate stays put")
expect(finger.innerEnd.lastRowBottom <= finger.innerEnd.screen && finger.listPush.outerRoom === 0, "and the rows' own scroller reaches the last row, with no blank room left in the sheet's scroller to push into")
expect(Math.abs(finger.listPush.topAfter - sections.sheetTop) <= 1, "and the sheet is still at half after the lift")
expect(Math.abs(finger.barPush.tyMoved - 60) <= 2 && finger.barPush.scrolled === 0, "the same push on the grab bar moves the sheet with the finger")
/* Where a 92% stop belongs: at 68, unless that is inside the bar, then 8px under it. */
const want92 = (bar) => { const t = H - Math.round(H * 0.92); return t <= SAFE_TOP ? SAFE_TOP : t < bar + 8 ? bar + 8 : t }
expect(Math.abs(finger.tap1 - want92(finger.full.barBottom)) <= 1 && Math.abs(finger.tap2 - finger.tapFrom) <= 1, "a tap on the grab bar goes half to full, and the next one back to half")
expect(finger.full.crossing === 0 && (finger.full.top >= finger.full.barBottom || finger.full.top <= finger.full.buttonsTop), "the Sections sheet at full cuts across none of the bar's buttons")
expect(finger.add.crossing === 0 && (finger.add.top >= finger.add.barBottom || finger.add.top <= finger.add.buttonsTop), "nor does Add section")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("At the half stop, everything in the Sections sheet can be scrolled onto the screen.\n")
