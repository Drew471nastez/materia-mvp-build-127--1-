/**
 * ===========================================================================
 *  ASK STORELIB ON A PHONE, WITH THE KEYBOARD UP, MEASURED
 * ===========================================================================
 * Two screenshots from an iPhone: with the keyboard up the sheet's header sat
 * under the status bar and a band of empty white sat between the composer
 * and the keyboard; and the thread could be scrolled sideways, every message
 * cut off on the left. This mounts the real MobileEditorSheet with the real
 * ThemeChat inside it, as the editor builds its AI sheet
 * (scripts/render-chat-keyboard.tsx), at 390x844, and measures:
 *
 *   AT REST      the sheet's top edge against the safe area and against the
 *                editor bar's buttons: a button is either all under the
 *                sheet or all above it, never a sliver
 *   SIDEWAYS     scrollWidth against clientWidth for the thread, the chat
 *                column and the sheet, with a 200 character URL, a word
 *                longer than the line, a long step label, a long section
 *                name and a wide line of code in the thread; then a sideways
 *                swipe and a scripted scroll, and whether anything moved.
 *                The code block itself should scroll sideways, inside itself,
 *                under a real finger swiping on it. Again at 320x568
 *   STREAMING    a run still sending lines: a reader scrolled to the top of
 *                the thread stays there, a reader at the end follows, and a
 *                message sent lands at the end
 *   KEYBOARD    iOS's shape of it: the layout viewport stays 844, the visual
 *                one shrinks, and it may be PANNED down the page to show the
 *                field (offsetTop). A headless browser has no keyboard, so the
 *                page's `visualViewport` is replaced before anything loads by
 *                one the probe drives, which is the one seam every surface
 *                reads the keyboard through. Measured: composer bottom against
 *                the visible bottom, header top against the visible top plus
 *                the safe area, the thread's height, the document's scroll
 *   ESTIMATE     the same with the half-screen keyboard ESTIMATE published on
 *                <html>, which is what padded the band before: a platform
 *                that reported a keyboard is not given the estimate
 *
 * The safe area is set through CDP where the browser supports it
 * (Emulation.setSafeAreaInsetsOverride) and reported as 0 where it does not.
 *
 *   pnpm build (for the stylesheet), then
 *   node scripts/check-chat-keyboard.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
/* The source tree the fixture is bundled from; the repo unless told otherwise
   (a copy at an older commit, to measure what the fix changed). */
const srcRoot = process.env.PROBE_SRC_ROOT ?? root
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/* The build's stylesheet, or the same one compiled from source (PROBE_CSS=source). */
const css = await appCss(root)

/* The fixture's sheet has to be the editor's AI sheet. */
const editor = readFileSync(join(srcRoot, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
const fixture = readFileSync(join(srcRoot, "scripts/render-chat-keyboard.tsx"), "utf8")
const editorSheet = (editor.match(/\{isMobileView && aiMounted && \(\s*<MobileEditorSheet ([^>]*)>/) || [])[1] || ""
const fixtureSheet = (fixture.match(/<MobileEditorSheet ([^>]*)>/) || [])[1] || ""
const propsOf = (s) => s.replace(/open=\{[^}]*\}|onOpenChange=\{[^}]*\}\}?/g, "").replace(/\s+/g, " ").trim()
const editorDetents = (editor.match(/const AI_SHEET_DETENTS = (\[[^\]]*\])/) || [])[1]
const fixtureDetents = (fixture.match(/const AI_SHEET_DETENTS = (\[[^\]]*\])/) || [])[1]
if (propsOf(editorSheet) !== propsOf(fixtureSheet) || editorDetents !== fixtureDetents) {
  fail(`The fixture's sheet is not the editor's AI sheet.\n  editor:  ${propsOf(editorSheet)} ${editorDetents}\n  fixture: ${propsOf(fixtureSheet)} ${fixtureDetents}`)
}

const W = 390
const H = 844
const SAFE_TOP = 59
const SAFE_BOTTOM = 34
const KEYS = 388

const out = mkdtempSync(join(tmpdir(), "storelib-chatkb-"))
const stubs = join(root, ".sheetfps-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
execFileSync("npx", [
  "--no-install", "esbuild", join(srcRoot, "scripts/render-chat-keyboard.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${srcRoot}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const URL_200 = "https://example.com/" + "a1b2c3d4e5".repeat(18)
const WORD = "Supercalifragilisticexpialidocious".repeat(4)
const CODE = `<section class="hero" style="${"padding:0 24px;".repeat(20)}">`

/*
  BEFORE ANYTHING LOADS: a visualViewport the probe drives, and a fetch that
  answers the chat's two routes. The fake viewport is an EventTarget with the
  same fields; `__keyboard(keys, pan)` is iOS opening a keyboard of `keys`
  pixels and panning the page by `pan` to show the field.
*/
const PRELUDE = `
window.__err = [];
window.addEventListener("error", function (e) { window.__err.push(String(e.message)) });
window.process = { env: { NODE_ENV: "production" } };
(function () {
  var vv = new EventTarget();
  var state = { height: window.innerHeight, offsetTop: 0 };
  Object.defineProperty(vv, "height", { get: function () { return state.height } });
  Object.defineProperty(vv, "width", { get: function () { return window.innerWidth } });
  Object.defineProperty(vv, "offsetTop", { get: function () { return state.offsetTop } });
  Object.defineProperty(vv, "offsetLeft", { get: function () { return 0 } });
  Object.defineProperty(vv, "pageTop", { get: function () { return state.offsetTop + window.scrollY } });
  Object.defineProperty(vv, "scale", { get: function () { return 1 } });
  Object.defineProperty(window, "visualViewport", { configurable: true, get: function () { return vv } });
  window.__keyboard = function (keys, pan) {
    state.height = window.innerHeight - keys;
    state.offsetTop = pan || 0;
    vv.dispatchEvent(new Event("resize"));
    vv.dispatchEvent(new Event("scroll"));
  };
})();
(function () {
  var history = { messages: [
    { id: "u1", role: "user", content: "Make the header black and link it to ${URL_200}", ops: [], error: null },
    { id: "a1", role: "assistant", content: "Changed the section background to black (#000000). ${WORD}", ops: [{}], error: null },
    { id: "u2", role: "user", content: "${WORD}", ops: [], error: null },
    { id: "a2", role: "assistant", content: "", ops: [], error: "Streaming is not supported." }
  ] };
  var enc = new TextEncoder();
  window.fetch = function (url, init) {
    url = String(url);
    if (/\\/chat$/.test(url) && (!init || !init.method || init.method === "GET")) {
      return Promise.resolve(new Response(JSON.stringify(history), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (/\\/agent$/.test(url)) {
      var lines = [
        { type: "plan", text: "Read the header, then ${WORD}" },
        { type: "step", id: "1", label: "Reading ${URL_200}", state: "done" },
        { type: "code", path: "sections/a-very-long-file-name-for-a-section-${"x".repeat(60)}.storelib", source: ${JSON.stringify(CODE)} + "\\n" + ${JSON.stringify(CODE)} },
        { type: "thinking", text: "${WORD}" }
      ];
      /* Left open, so the run is still going and its work panel stays open. */
      var body = new ReadableStream({ start: function (c) {
        /* Kept, so the probe can stream more of the run: __push(line). */
        window.__push = function (l) { c.enqueue(enc.encode(JSON.stringify(l) + "\\n")) };
        lines.forEach(window.__push);
      } });
      return Promise.resolve(new Response(body, { status: 200 }));
    }
    return Promise.resolve(new Response("{}", { status: 404 }));
  };
})();
`

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0;background:#f8f9fa}</style></head><body><div id="app"></div>` +
  `<script>${PRELUDE}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
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
await call("Emulation.setDeviceMetricsOverride", {
  width: W, height: H, deviceScaleFactor: 1, mobile: true,
  screenOrientation: { angle: 0, type: "portraitPrimary" },
})
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
let safeTop = 0
try {
  await call("Emulation.setSafeAreaInsetsOverride", {
    insets: { top: SAFE_TOP, topMax: SAFE_TOP, bottom: SAFE_BOTTOM, bottomMax: SAFE_BOTTOM, left: 0, leftMax: 0, right: 0, rightMax: 0 },
  })
  safeTop = SAFE_TOP
} catch (e) {
  console.log(`  (no safe-area emulation in this browser: ${String(e.message).slice(0, 80)}; measured with a safe area of 0)`)
}
await call("Page.navigate", { url: "file://" + file })
await sleep(1800)

const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}\n${expression.slice(0, 200)}`)
  return r.result.value
}
const frames = (n = 3) => js(`new Promise((r) => { let i = 0; const f = () => (++i >= ${n} ? setTimeout(r, 0) : requestAnimationFrame(f)); requestAnimationFrame(f) })`)
const touch = (type, x, y) => call("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })

const measuredSafeTop = await js(`(() => { const d = document.createElement("div"); d.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px)"; document.body.appendChild(d); const h = d.getBoundingClientRect().height; d.remove(); return h })()`)
safeTop = measuredSafeTop

const READ = `(() => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  /* By marker, or by shape for a tree from before the markers existed. */
  const field = sheet.querySelector("textarea")
  const thread = document.querySelector("[data-chat-thread]") || [...sheet.querySelectorAll("div")].find((d) => /overflow-y-auto/.test(d.className) && d.querySelector("ul, p"))
  const composer = document.querySelector("[data-chat-composer]") || (field && field.parentElement)
  /* The chat column: the sheet variant's root, which holds the composer's row and its padding. */
  const column = thread && (thread.closest("[data-ask-sheet]") || thread.parentElement)
  const header = [...document.querySelectorAll("span")].find((s) => s.textContent.trim() === "Ask Storelib")
  const headerRow = document.querySelector("[data-ask-header]") || (header && header.parentElement)
  const vv = window.visualViewport
  const publish = document.getElementById("publish").getBoundingClientRect()
  const pre = document.querySelector("[data-code-scroll]") || sheet.querySelector("pre")
  const cs = getComputedStyle(sheet)
  return JSON.stringify({
    sheetTop: sheet.getBoundingClientRect().top,
    sheetBottom: sheet.getBoundingClientRect().bottom,
    sheetHeight: sheet.getBoundingClientRect().height,
    padBottom: parseFloat(cs.paddingBottom),
    headerTop: headerRow ? headerRow.getBoundingClientRect().top : null,
    composerBottom: composer ? composer.getBoundingClientRect().bottom : null,
    composerTop: composer ? composer.getBoundingClientRect().top : null,
    /* The chat column's bottom: the composer's row, its 10px of padding included. */
    columnBottom: column ? column.getBoundingClientRect().bottom : null,
    threadHeight: thread ? thread.clientHeight : null,
    threadSW: thread ? thread.scrollWidth : null, threadCW: thread ? thread.clientWidth : null,
    threadLeft: thread ? thread.scrollLeft : null,
    /* How far the thread is from its end: 0 is reading the newest line. */
    threadGap: thread ? thread.scrollHeight - thread.scrollTop - thread.clientHeight : null,
    threadTop: thread ? thread.scrollTop : null,
    preLeft: pre ? pre.scrollLeft : null,
    columnSW: column ? column.scrollWidth : null, columnCW: column ? column.clientWidth : null,
    sheetSW: sheet.scrollWidth, sheetCW: sheet.clientWidth, sheetLeft: sheet.scrollLeft, sheetScrollTop: sheet.scrollTop,
    docSW: document.documentElement.scrollWidth, docCW: document.documentElement.clientWidth,
    preSW: pre ? pre.scrollWidth : null, preCW: pre ? pre.clientWidth : null,
    vvTop: vv.offsetTop, vvHeight: vv.height, scrollY: window.scrollY,
    publishTop: publish.top, publishBottom: publish.bottom,
    chip: (() => { const c = [...document.querySelectorAll("span")].find((s) => /^Only /.test(s.textContent.trim())); return c ? { right: c.getBoundingClientRect().right } : null })(),
    overflowing: (() => {
      const w = document.documentElement.clientWidth
      return [...sheet.querySelectorAll("*")].filter((el) => {
        if (el.closest("[data-code-scroll], pre")) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.right > w + 0.5 || r.left < -0.5)
      }).slice(0, 5).map((el) => el.tagName.toLowerCase() + "." + String(el.className).split(" ").slice(0, 3).join(".") + " " + Math.round(el.getBoundingClientRect().left) + ".." + Math.round(el.getBoundingClientRect().right))
    })(),
  })
})()`
const read = async () => JSON.parse(await js(READ))
/* SHOTS=<dir> saves what each measurement looked like, for a person to look at. */
const shot = async (name) => {
  if (!process.env.SHOTS) return
  const { data } = await call("Page.captureScreenshot", { format: "png" })
  mkdirSync(process.env.SHOTS, { recursive: true })
  writeFileSync(join(process.env.SHOTS, `${name}.png`), Buffer.from(data, "base64"))
}

const errs0 = await js("JSON.stringify(window.__err)")
if (!(await js(`!!document.querySelector("[data-mobile-bottom-sheet] textarea")`))) fail("The chat never mounted: " + errs0)

/* A run, so the thread holds a work panel with a code block that is open. */
await js(`document.querySelector("textarea").focus()`)
await call("Input.insertText", { text: "Make the header black" })
await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleep(900)
await js(`document.activeElement && document.activeElement.blur()`)
await frames(4)

const r = {}
r.rest = await read()
await shot("rest")

/* A sideways swipe across the thread, and a script trying to scroll it. */
{
  const y = Math.round(r.rest.sheetTop + 200)
  await touch("touchStart", 300, y)
  for (let i = 1; i <= 8; i++) { await touch("touchMove", 300 - 25 * i, y + i); await sleep(16) }
  await touch("touchEnd", 100, y + 8)
  await sleep(500)
  r.afterSwipe = await read()
  await js(`(() => { const t = document.querySelector("[data-chat-thread]") || [...document.querySelectorAll("[data-mobile-bottom-sheet] div")].find((d) => /overflow-y-auto/.test(d.className) && d.querySelector("ul, p")); t.scrollLeft = 400; document.querySelector("[data-mobile-bottom-sheet]").scrollLeft = 400; document.querySelector("[data-mobile-bottom-sheet]").scrollTop = 200 })()`)
  await frames(2)
  r.afterScript = await read()
}

/* A finger swiping sideways ON the code block scrolls the code block. */
{
  await js(`(() => { const p = document.querySelector("[data-code-scroll]") || document.querySelector("[data-mobile-bottom-sheet] pre"); p.scrollLeft = 0; p.scrollIntoView({ block: "center" }) })()`)
  await frames(2)
  const box = JSON.parse(await js(`(() => { const b = (document.querySelector("[data-code-scroll]") || document.querySelector("[data-mobile-bottom-sheet] pre")).getBoundingClientRect(); return JSON.stringify({ x: b.left + b.width / 2, y: b.top + Math.min(b.height / 2, 20) }) })()`))
  await touch("touchStart", Math.round(box.x + 100), Math.round(box.y))
  for (let i = 1; i <= 8; i++) { await touch("touchMove", Math.round(box.x + 100 - 25 * i), Math.round(box.y)); await sleep(16) }
  await touch("touchEnd", 0, 0)
  await sleep(500)
  r.codeSwipe = await read()
}

/* A RUN STILL STREAMING. A reader who scrolled up stays where they are;
   one at the end follows the new lines. */
{
  await js(`(() => { const t = document.querySelector("[data-chat-thread]"); t.scrollTop = t.scrollHeight })()`)
  await frames(3)
  await js(`(() => { const t = document.querySelector("[data-chat-thread]"); t.scrollTop = 0 })()`)
  await frames(3)
  for (let i = 0; i < 6; i++) {
    await js(`window.__push({ type: "step", id: "up${i}", label: "Step ${i} while the reader is up the thread", state: "done" })`)
    await sleep(60)
  }
  await sleep(400)
  r.readerUp = await read()
  await js(`(() => { const t = document.querySelector("[data-chat-thread]"); t.scrollTop = t.scrollHeight })()`)
  await frames(3)
  for (let i = 0; i < 6; i++) {
    await js(`window.__push({ type: "step", id: "end${i}", label: "Step ${i} while the reader is at the end", state: "done" })`)
    await sleep(60)
  }
  await sleep(400)
  r.readerEnd = await read()
}

/* The keyboard: focus the field, then iOS reports it. */
const withKeyboard = async (keys, pan, estimate = 0) => {
  await js(`document.documentElement.style.setProperty("--kb-inset", "${estimate}px")`)
  await js(`document.querySelector("textarea").focus({ preventScroll: true })`)
  await js(`window.__keyboard(${keys}, ${pan})`)
  /* iOS scrolling the document to show the field, which the sheet puts back. */
  await js(`window.scrollTo(0, 150)`)
  await sleep(700)
  await frames(3)
  return read()
}
r.kb = await withKeyboard(KEYS, 0)
await shot("keyboard")
r.kbPan = await withKeyboard(KEYS, 188)
r.kbPanAll = await withKeyboard(KEYS, KEYS, Math.round(H * 0.5))
r.kbNoReport = await withKeyboard(0, 0, KEYS)
await js(`window.__keyboard(0, 0)`)
await js(`document.documentElement.style.setProperty("--kb-inset", "0px")`)
await js(`document.activeElement && document.activeElement.blur()`)
await sleep(700)
r.closed = await read()
r.errors = JSON.parse(await js("JSON.stringify(window.__err)"))

/* ── 320: the narrowest phone, the same thread ───────────────────────── */
await call("Emulation.setDeviceMetricsOverride", { width: 320, height: 568, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 0, type: "portraitPrimary" } })
await call("Page.navigate", { url: "about:blank" })
await sleep(300)
await call("Page.navigate", { url: "file://" + file + "#narrow" })
await sleep(1500)
await js(`document.querySelector("textarea").focus()`)
await call("Input.insertText", { text: "Make the header black" })
await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleep(900)
await js(`document.activeElement && document.activeElement.blur()`)
await frames(4)
r.narrow = await read()
r.errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

/* ── 1280: the desktop column, the same thread ───────────────────────── */
await call("Emulation.setTouchEmulationEnabled", { enabled: false })
await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
/* Through a blank page: a navigation that only changes the hash does not reload. */
await call("Page.navigate", { url: "about:blank" })
await sleep(300)
await call("Page.navigate", { url: "file://" + file + "#desktop" })
await sleep(1500)
await js(`document.querySelector("textarea").focus()`)
await call("Input.insertText", { text: "Make the header black" })
await call("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await call("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 })
await sleep(900)
r.desktop = JSON.parse(await js(`(() => {
  const field = document.querySelector("textarea")
  const thread = document.querySelector("[data-chat-thread]") || [...document.querySelectorAll("div")].find((d) => /overflow-y-auto/.test(d.className) && d.querySelector("ul, p"))
  const column = thread.closest("[data-ask-sheet]") || thread.parentElement
  const pre = document.querySelector("[data-code-scroll]") || document.querySelector("pre")
  thread.scrollLeft = 400
  return JSON.stringify({ threadSW: thread.scrollWidth, threadCW: thread.clientWidth, columnSW: column.scrollWidth, columnCW: column.clientWidth, left: thread.scrollLeft, preSW: pre ? pre.scrollWidth : null, preCW: pre ? pre.clientWidth : null })
})()`))
r.errors.push(...JSON.parse(await js("JSON.stringify(window.__err)")))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

const f = (v) => (v === null || v === undefined ? String(v) : Math.round(v * 10) / 10)
const kbLine = (name, s, keys, pan) => {
  const visibleBottom = s.vvTop + s.vvHeight
  console.log(`  ${name.padEnd(13)} vv ${f(s.vvHeight)} tall, panned ${f(s.vvTop)}: chat bottom ${f(s.columnBottom)} vs visible bottom ${f(visibleBottom)} (${f(s.columnBottom - visibleBottom)}px), composer box ${f(s.composerBottom)}; header top ${f(s.headerTop)} vs visible top + safe area ${f(s.vvTop + safeTop)}; sheet ${f(s.sheetTop)}..${f(s.sheetBottom)} padded ${f(s.padBottom)}; thread ${f(s.threadHeight)}px; document scrollY ${f(s.scrollY)}`)
}
console.log(`\nAsk Storelib in the editor's AI sheet at ${W}x${H}, safe area top ${safeTop}\n`)
console.log(`  at rest       sheet top ${f(r.rest.sheetTop)}, header top ${f(r.rest.headerTop)}; the bar's violet button ${f(r.rest.publishTop)}..${f(r.rest.publishBottom)}`)
console.log(`  sideways      thread ${r.rest.threadSW}/${r.rest.threadCW}, column ${r.rest.columnSW}/${r.rest.columnCW}, sheet ${r.rest.sheetSW}/${r.rest.sheetCW}, document ${r.rest.docSW}/${r.rest.docCW} (scrollWidth/clientWidth)`)
console.log(`                code block ${r.rest.preSW}/${r.rest.preCW}: scrolls inside itself; chip ends at ${r.rest.chip ? f(r.rest.chip.right) : "none"}`)
console.log(`                after a sideways swipe: thread scrollLeft ${r.afterSwipe.threadLeft}; after a script set 400: thread ${r.afterScript.threadLeft}, sheet ${r.afterScript.sheetLeft} left / ${r.afterScript.sheetScrollTop} top`)
if (r.rest.overflowing.length) console.log(`                past the edge: ${r.rest.overflowing.join(" | ")}`)
console.log(`                a finger swiping sideways on the code block: code scrollLeft ${f(r.codeSwipe.preLeft)}, thread scrollLeft ${f(r.codeSwipe.threadLeft)}`)
console.log(`  streaming     after the send: ${f(r.rest.threadGap)}px from the end; scrolled to the top while 6 steps arrived: scrollTop ${f(r.readerUp.threadTop)}, ${f(r.readerUp.threadGap)}px from the end`)
console.log(`                at the end while 6 more arrived: ${f(r.readerEnd.threadGap)}px from the end`)
kbLine("keyboard", r.kb, KEYS, 0)
kbLine("panned 188", r.kbPan, KEYS, 188)
kbLine("panned all", r.kbPanAll, KEYS, KEYS)
console.log(`                (that one with the half-screen estimate, ${Math.round(H * 0.5)}px, published on <html>)`)
kbLine("no report", r.kbNoReport, 0, 0)
console.log(`                (a web view that reports nothing, with a ${KEYS}px estimate published)`)
console.log(`  closed again  sheet top ${f(r.closed.sheetTop)}, padded ${f(r.closed.padBottom)}`)
console.log(`  320 phone     thread ${r.narrow.threadSW}/${r.narrow.threadCW}, column ${r.narrow.columnSW}/${r.narrow.columnCW}, sheet ${r.narrow.sheetSW}/${r.narrow.sheetCW}, document ${r.narrow.docSW}/${r.narrow.docCW}${r.narrow.overflowing.length ? `; past the edge: ${r.narrow.overflowing.join(" | ")}` : ""}`)
console.log(`  1280 column   thread ${r.desktop.threadSW}/${r.desktop.threadCW}, column ${r.desktop.columnSW}/${r.desktop.columnCW}, scrollLeft after a script set 400: ${r.desktop.left}; code block ${r.desktop.preSW}/${r.desktop.preCW}`)
if (r.errors.length) console.log(`  page errors: ${r.errors.join(" | ")}`)
console.log("")

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
const sliver = r.rest.publishTop < r.rest.sheetTop && r.rest.publishBottom > r.rest.sheetTop
expect(r.rest.sheetTop >= safeTop - 0.5 && r.rest.headerTop >= safeTop, "at rest the sheet and its header are below the safe area")
expect(!sliver, "and the bar's buttons are all above the sheet or all under it, never a sliver")
for (const [name, s] of [["at rest", r.rest], ["after a swipe", r.afterSwipe], ["after a script", r.afterScript], ["with the keyboard", r.kb]]) {
  expect(s.threadSW === s.threadCW && s.columnSW === s.columnCW && s.sheetSW === s.sheetCW, `${name}: nothing in the thread, the column or the sheet is wider than it (scrollWidth == clientWidth)`)
}
expect(r.rest.overflowing.length === 0, "no element in the sheet reaches past the screen's edge")
expect(r.afterSwipe.threadLeft === 0 && r.afterScript.threadLeft === 0 && r.afterScript.sheetLeft === 0 && r.afterScript.sheetScrollTop === 0, "a sideways swipe or a script moves nothing sideways, and the sheet cannot be scrolled")
expect(r.rest.preSW > r.rest.preCW, "the code block is the one thing that scrolls sideways, inside itself")
expect(r.codeSwipe.preLeft > 20 && r.codeSwipe.threadLeft === 0, "and a finger swiping sideways on it scrolls it, and only it")
expect(r.rest.threadGap <= 2, "a message sent scrolls the thread to its newest line")
expect(r.readerUp.threadTop <= 2, "a reader who scrolled up is left where they are while a run streams in")
expect(r.readerEnd.threadGap <= 2, "a reader at the end follows the run as it streams in")
expect(r.narrow.threadSW === r.narrow.threadCW && r.narrow.columnSW === r.narrow.columnCW && r.narrow.sheetSW === r.narrow.sheetCW && r.narrow.docSW === r.narrow.docCW, "at 320px nothing in the thread, the column, the sheet or the page is wider than it")
expect(r.narrow.overflowing.length === 0, "at 320px no element in the sheet reaches past the screen's edge")
for (const [name, s] of [["keyboard", r.kb], ["panned 188", r.kbPan], ["panned all", r.kbPanAll]]) {
  const visibleBottom = s.vvTop + s.vvHeight
  expect(Math.abs(s.columnBottom - visibleBottom) <= 1, `${name}: the composer's row ends on the keyboard, within 1px of the visible bottom`)
  expect(s.headerTop >= s.vvTop + safeTop - 0.5, `${name}: the header is below the visible top and the safe area`)
  expect(s.threadHeight > 40, `${name}: the thread shrinks and stays usable (${f(s.threadHeight)}px)`)
  expect(s.scrollY === 0, `${name}: the document is put back where it was`)
}
expect(Math.abs(r.kbNoReport.columnBottom - (H - KEYS)) <= 1, "a web view that reports nothing still gets the estimate")
expect(Math.abs(r.closed.sheetTop - r.rest.sheetTop) <= 1 && r.closed.padBottom === r.rest.padBottom, "and with the keyboard gone the sheet is back where it was")
expect(r.desktop.threadSW === r.desktop.threadCW && r.desktop.columnSW === r.desktop.columnCW && r.desktop.left === 0, "at 1280, the desktop column's thread is not wider than itself either")
expect(r.errors.length === 0, "no page errors")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The composer sits on the keyboard, the header stays below the status bar, and the thread only scrolls up and down.\n")
