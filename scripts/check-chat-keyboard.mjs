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
 *   OPEN, CLOSE  the sheet mounts as the button is pressed, and its first
 *                frame is closed with the backdrop clear; it then rises on
 *                transform to its stop in about 320ms, never backwards, the
 *                backdrop fading in; closing slides it down, still drawn,
 *                and hides it only once it is off the screen
 *   NO JUMP      the owner's screen recording: the thread jumped as the
 *                keyboard opened and left a band of white where it had been
 *                as it closed. The AI sheet is a "composer" sheet now, so
 *                the sheet keeps its size and place and only the composer's
 *                row rides up, on a transform. Measured every frame through
 *                the keyboard opening and closing: the sheet's box, the
 *                thread's height, the header; and at the end, the thread's
 *                newest line against the composer (no gap either way)
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
const editor = readFileSync(join(srcRoot, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
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
/* Every frame from the first one the sheet exists: where it is and how dark the backdrop is. */
window.__openFrames = [];
(function sample() {
  var s = document.querySelector("[data-mobile-bottom-sheet]");
  var o = document.querySelector("[data-wb-sheet-overlay]");
  if (s) window.__openFrames.push({ y: new DOMMatrixReadOnly(getComputedStyle(s).transform).m42, o: o ? +getComputedStyle(o).opacity : null, so: +getComputedStyle(s).opacity, t: performance.now() });
  if (window.__openFrames.length < 80) requestAnimationFrame(sample);
})();
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
  /* The row that rides the keyboard: the mode switch and the box, with its 10px of padding. */
  const footer = document.querySelector("[data-ask-footer]")
  /* The thread's newest line: the last thing in it before the keyboard's spacer. */
  const lastLine = (() => {
    const inner = thread && thread.firstElementChild
    if (!inner) return null
    const kids = [...inner.children].filter((k) => !k.hasAttribute("data-ask-keys-room"))
    return kids.length ? kids[kids.length - 1] : null
  })()
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
    footerBottom: footer ? footer.getBoundingClientRect().bottom : null,
    footerTop: footer ? footer.getBoundingClientRect().top : null,
    lastBottom: lastLine ? lastLine.getBoundingClientRect().bottom : null,
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
        /* The live line's band of light slides across the words inside the line's clip (.ask-shine is
           overflow: hidden); its box travels with its transform and nothing it covers can scroll. */
        if (el.closest(".ask-shine-window")) return false
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

const openFrames = JSON.parse(await js("JSON.stringify(window.__openFrames)"))
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
/*
  EVERY FRAME, through the keyboard coming up and going: what moved. The
  sheet's box and the thread's height must not change at all; only the
  footer travels. Sampled on requestAnimationFrame for 600ms after the
  viewport reports the change.
*/
const SAMPLE = (ms) => `new Promise((done) => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  const thread = document.querySelector("[data-chat-thread]")
  const header = document.querySelector("[data-ask-header]")
  const footer = document.querySelector("[data-ask-footer]")
  const out = []
  const t0 = performance.now()
  const tick = () => {
    const s = sheet.getBoundingClientRect()
    out.push({ sheetTop: s.top, sheetH: s.height, threadH: thread.clientHeight, headerTop: header.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom })
    if (performance.now() - t0 < ${ms}) requestAnimationFrame(tick)
    else done(JSON.stringify(out))
  }
  requestAnimationFrame(tick)
})`
await js(`(() => { const t = document.querySelector("[data-chat-thread]"); t.scrollTop = t.scrollHeight })()`)
await frames(3)
r.beforeKb = await read()
await js(`document.querySelector("textarea").focus({ preventScroll: true })`)
await js(`window.__keyboard(${KEYS}, 0)`)
r.openFrames = JSON.parse(await js(SAMPLE(600)))
await sleep(400)
r.kbOpened = await read()
await shot("keyboard-open")
await js(`window.__keyboard(0, 0)`)
await js(`document.activeElement && document.activeElement.blur()`)
r.closeFrames = JSON.parse(await js(SAMPLE(600)))
await sleep(400)
r.kbClosed = await read()
await shot("keyboard-closed")

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
/* Put away: every frame of the close, and whether it is still drawn. */
r.closeMove = JSON.parse(await js(`new Promise((done) => {
  const s = document.querySelector("[data-mobile-bottom-sheet]")
  const o = document.querySelector("[data-wb-sheet-overlay]")
  const out = []
  const t0 = performance.now()
  window.__setOpen(false)
  const tick = () => {
    const cs = getComputedStyle(s)
    out.push({ y: new DOMMatrixReadOnly(cs.transform).m42, o: +getComputedStyle(o).opacity, so: +cs.opacity, shown: cs.visibility === "visible", t: performance.now() - t0 })
    if (performance.now() - t0 < 700) requestAnimationFrame(tick)
    else done(JSON.stringify(out))
  }
  requestAnimationFrame(tick)
})`))
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
  console.log(`  ${name.padEnd(13)} vv ${f(s.vvHeight)} tall, panned ${f(s.vvTop)}: composer row bottom ${f(s.footerBottom)} vs visible bottom ${f(visibleBottom)} (${f(s.footerBottom - visibleBottom)}px), composer box ${f(s.composerBottom)}; newest line ${f(s.lastBottom)} vs row top ${f(s.footerTop)}; header top ${f(s.headerTop)} vs visible top + safe area ${f(s.vvTop + safeTop)}; sheet ${f(s.sheetTop)}..${f(s.sheetBottom)} padded ${f(s.padBottom)}; thread ${f(s.threadHeight)}px; document scrollY ${f(s.scrollY)}`)
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
{
  const moving = openFrames.filter((x) => x.y > 0.5)
  const ms = openFrames.length ? Math.round((openFrames.find((x) => x.y <= 0.5)?.t ?? openFrames[openFrames.length - 1].t) - openFrames[0].t) : 0
  console.log(`  sheet in      ${openFrames.length} frames: first at ${f(openFrames[0]?.y)}px down, sheet opacity ${f(openFrames[0]?.so)}, backdrop ${f(openFrames[0]?.o)}; at rest after ${ms}ms over ${moving.length} frames, opacity ${f(openFrames[openFrames.length - 1]?.so)}`)
  const last = r.closeMove[r.closeMove.length - 1]
  const hiddenAt = r.closeMove.find((x) => !x.shown)
  console.log(`  sheet out     ${r.closeMove.length} frames: ends ${f(last.y)}px down, sheet opacity ${f(last.so)}, backdrop ${f(last.o)}; hidden at ${hiddenAt ? Math.round(hiddenAt.t) + "ms, " + f(hiddenAt.y) + "px down" : "never"}`)
}
console.log(`  closed again  sheet top ${f(r.closed.sheetTop)}, padded ${f(r.closed.padBottom)}`)
const spread = (list, key) => { const v = list.map((x) => x[key]); return `${f(Math.min(...v))}..${f(Math.max(...v))}` }
for (const [name, list] of [["opening", r.openFrames], ["closing", r.closeFrames]]) {
  console.log(`  keys ${name.padEnd(8)} ${list.length} frames: sheet top ${spread(list, "sheetTop")}, sheet height ${spread(list, "sheetH")}, thread height ${spread(list, "threadH")}, header top ${spread(list, "headerTop")}, composer row bottom ${spread(list, "footerBottom")}`)
}
console.log(`  settled       open: thread ${f(r.kbOpened.threadGap)}px from its end, newest line ${f(r.kbOpened.lastBottom)} vs row top ${f(r.kbOpened.footerTop)}; closed: ${f(r.kbClosed.threadGap)}px from its end, newest line ${f(r.kbClosed.lastBottom)} vs row top ${f(r.kbClosed.footerTop)}`)
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
  expect(Math.abs(s.footerBottom - visibleBottom) <= 1, `${name}: the composer's row ends on the keyboard, within 1px of the visible bottom`)
  expect(s.headerTop >= s.vvTop + safeTop - 0.5, `${name}: the header is below the visible top and the safe area`)
  expect(s.threadHeight === r.rest.threadHeight, `${name}: the thread keeps its height; only the composer moves (${f(s.threadHeight)}px)`)
  expect(Math.abs(s.sheetTop - r.rest.sheetTop) <= 1 && Math.abs(s.sheetHeight - r.rest.sheetHeight) <= 1, `${name}: the sheet is not resized or moved for it`)
  expect(s.scrollY === 0, `${name}: the document is put back where it was`)
}
expect(Math.abs(r.kbNoReport.footerBottom - (H - KEYS)) <= 1, "a web view that reports nothing still gets the estimate")
const still = (list, key) => Math.max(...list.map((x) => x[key])) - Math.min(...list.map((x) => x[key])) <= 0.5
for (const [name, list] of [["opening", r.openFrames], ["closing", r.closeFrames]]) {
  expect(list.length > 10 && still(list, "sheetTop") && still(list, "sheetH"), `${name} the keyboard, the sheet does not move or resize in any frame`)
  expect(still(list, "threadH") && still(list, "headerTop"), `${name} the keyboard, the thread's height and the header do not change in any frame`)
}
expect(r.kbOpened.threadGap <= 2 && r.kbOpened.lastBottom <= r.kbOpened.footerTop + 1, "with the keyboard up the thread is at its end and its newest line is above the composer")
expect(r.kbClosed.threadGap <= 2 && r.kbClosed.footerTop - r.kbClosed.lastBottom < 40, "with it gone the thread is at its end again, flush with the composer: no band of white")
expect(Math.abs(r.closed.sheetTop - r.rest.sheetTop) <= 1 && r.closed.padBottom === r.rest.padBottom, "and with the keyboard gone the sheet is back where it was")
expect(r.desktop.threadSW === r.desktop.threadCW && r.desktop.columnSW === r.desktop.columnCW && r.desktop.left === 0, "at 1280, the desktop column's thread is not wider than itself either")
{
  const ys = openFrames.map((x) => x.y)
  const rising = ys.every((y, i) => i === 0 || y <= ys[i - 1] + 0.5)
  const at = openFrames.find((x) => x.y <= 0.5)
  const took = at ? at.t - openFrames[0].t : Infinity
  expect(ys[0] > r.rest.sheetHeight * 0.9 && openFrames[0].o < 0.05 && openFrames[0].so < 0.1, `the first frame of the sheet is closed and faded out, with the backdrop clear (${f(ys[0])}px down, sheet ${f(openFrames[0].so)}, backdrop ${f(openFrames[0].o)})`)
  expect(openFrames[openFrames.length - 1].so === 1 && openFrames[openFrames.length - 1].o === 1, "and it lands solid, with the backdrop in")
  expect(rising && took >= 250 && took <= 520, `and it rises to its stop, never backwards, in about 320ms (${Math.round(took)}ms)`)
  const cys = r.closeMove.map((x) => x.y)
  const falling = cys.every((y, i) => i === 0 || y >= cys[i - 1] - 0.5)
  const hiddenAt = r.closeMove.find((x) => !x.shown)
  const drawn = r.closeMove.filter((x) => x.shown && x.y > 1 && x.y < r.rest.sheetHeight - 1).length
  expect(falling && drawn >= 8, `closing slides it down, still drawn for ${drawn} frames of the move`)
  expect(!!hiddenAt && hiddenAt.y >= r.rest.sheetHeight - 1 && r.closeMove[r.closeMove.length - 1].o < 0.01 && r.closeMove[r.closeMove.length - 1].so < 0.01, "and it is hidden only once it is off the screen, faded, the backdrop gone")
}
expect(r.errors.length === 0, "no page errors")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The composer rides the keyboard, the sheet and the thread stay still, the header stays below the status bar, and the thread only scrolls up and down.\n")
