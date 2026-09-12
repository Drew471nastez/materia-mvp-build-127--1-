/**
 * ===========================================================================
 *  THE REAL EDITOR, DRIVEN THE WAY THE FREEZE IS REPORTED, AND MEASURED
 * ===========================================================================
 * "I get to scroll, then I click on a section or something and it blocks the
 * entire scroll." Six reports. Every earlier fix reasoned from the source and
 * shipped a guard; this mounts the actual StoreEditorPage in Chromium with
 * fetch answered locally, performs the sequence, and reads the scroller.
 *
 *   node scripts/check-editor-scroll.mjs            (bundle first: see below)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/**
 * The editor is bundled here, for the browser, with the network and the
 * framework's server-side modules replaced by stubs in .wb-probe/. Nothing
 * about the editor itself is stubbed.
 */
const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
const STUBS = {
  "navigation.js": `export const usePathname = () => "/website-builder/editor/probe-install"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe-install" })
export const redirect = () => {}
export const notFound = () => {}
`,
  "link.jsx": `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`,
  "image.jsx": `import React from "react"
export default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }
`,
  "cache.js": `export const unstable_cache = (fn) => fn
export const revalidateTag = () => {}
export const revalidatePath = () => {}
`,
  "supabase-client.js": `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? undefined : chain, apply: () => chain() })
export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "probe-user", email: "probe@example.invalid" } }, error: null }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }), remove: async () => ({ data: null, error: null }) }) },
    from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {},
  }
}
`,
  "node-crypto.js": `export function createHash() {
  let acc = ""
  return { update(s) { acc += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < acc.length; i++) { h ^= acc.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } }
}
export function randomBytes(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return { toString: () => Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("") } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomBytes, randomUUID }
`,
  "node-empty.js": `const noop = () => { throw new Error("node builtin used in the browser probe") }
export const readFileSync = noop, writeFileSync = noop, existsSync = () => false, readdirSync = () => [], mkdirSync = noop
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`,
  "buffer-shim.js": `const enc = new TextEncoder(), dec = new TextDecoder()
function b64(bytes) { let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s) }
function unb64(s) { const bin = atob(s.split("-").join("+").split("_").join("/")); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a }
class Buf {
  constructor(bytes) { this.bytes = bytes }
  static from(x, encoding) { if (x instanceof Uint8Array) return new Buf(x); if (typeof x === "string") return new Buf(encoding === "base64" || encoding === "base64url" ? unb64(x) : enc.encode(x)); return new Buf(new Uint8Array(x)) }
  static isBuffer(x) { return x instanceof Buf }
  static byteLength(s) { return enc.encode(String(s)).length }
  toString(encoding) { if (encoding === "base64") return b64(this.bytes); if (encoding === "base64url") return b64(this.bytes).split("+").join("-").split("/").join("_").split("=").join(""); return dec.decode(this.bytes) }
  get length() { return this.bytes.length }
}
globalThis.Buffer = Buf
`,
}
for (const [name, body] of Object.entries(STUBS)) writeFileSync(join(stubs, name), body)
const bundle = process.env.EDITOR_BUNDLE ?? join(mkdtempSync(join(tmpdir(), "storelib-editor-bundle-")), "editor-probe.js")
if (!existsSync(bundle)) {
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-editor-probe.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    `--inject:${join(stubs, "buffer-shim.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:next/cache=${join(stubs, "cache.js")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
    `--alias:node:crypto=${join(stubs, "node-crypto.js")}`, `--alias:crypto=${join(stubs, "node-crypto.js")}`,
    `--alias:node:fs=${join(stubs, "node-empty.js")}`, `--alias:fs=${join(stubs, "node-empty.js")}`, `--alias:node:path=${join(stubs, "node-empty.js")}`, `--alias:path=${join(stubs, "node-empty.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
}
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")
const out = mkdtempSync(join(tmpdir(), "storelib-editor-"))


/**
 * WHO CANCELLED THE GESTURE. Installed before the editor's bundle, so every
 * listener it registers is wrapped. A touchmove that is cancelled over the
 * canvas is the whole freeze, and "something called preventDefault" is not an
 * answer you can fix; this records the stack of whatever did.
 */
const SPY = `
<script>
(function () {
  window.__prevented = []
  var realPD = Event.prototype.preventDefault
  Event.prototype.preventDefault = function () {
    if (this.type === "touchmove" || this.type === "touchstart") {
      var st = ""
      try { throw new Error("x") } catch (e) { st = String(e.stack || "").split("\\n").slice(2, 6).join(" | ") }
      window.__prevented.push({ type: this.type, cancelable: this.cancelable, stack: st })
    }
    return realPD.apply(this, arguments)
  }
  var realAdd = EventTarget.prototype.addEventListener
  window.__touchListeners = []
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (type === "touchmove" || type === "touchstart") {
      var passive = opts && typeof opts === "object" ? !!opts.passive : false
      var who = this === document ? "document" : this === window ? "window" : (this.tagName ? this.tagName.toLowerCase() + (this.id ? "#" + this.id : "") + (typeof this.className === "string" && this.className ? "." + this.className.split(" ")[0] : "") : String(this))
      var st = ""
      try { throw new Error("x") } catch (e) { st = String(e.stack || "").split("\\n").slice(2, 5).join(" | ") }
      window.__touchListeners.push({ type: type, on: who, passive: passive, stack: st })
    }
    return realAdd.apply(this, arguments)
  }
})()
</script>`

/** No regex literals in here: a backslash in a template literal is eaten. */
const DRIVE = `
<script>
(function () {
  var log = []
  var say = function (s) { log.push(s) }
  function describe(el) {
    if (!el) return "(nothing)"
    var s = el.tagName.toLowerCase()
    if (el.id) s += "#" + el.id
    var cls = (typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean).slice(0, 4).join(".")
    if (cls) s += "." + cls
    return s
  }
  function chainNone(el) {
    for (var n = el; n; n = n.parentElement) if (getComputedStyle(n).pointerEvents === "none") return describe(n)
    return null
  }
  function coverers(sc, x, y) {
    var out = []
    var all = document.querySelectorAll("body *")
    for (var i = 0; i < all.length; i++) {
      var e = all[i]
      if (sc.contains(e) || e === sc) continue
      var cs = getComputedStyle(e)
      if (cs.position !== "fixed" && cs.position !== "absolute") continue
      if (cs.pointerEvents === "none" || cs.display === "none" || cs.visibility === "hidden") continue
      var r = e.getBoundingClientRect()
      if (r.left <= x && r.right >= x && r.top <= y && r.bottom >= y && r.width > 100 && r.height > 100) {
        out.push(describe(e) + " z=" + cs.zIndex + " op=" + cs.opacity + " " + Math.round(r.width) + "x" + Math.round(r.height))
      }
    }
    return out
  }
  function measure(label) {
    var sc = document.getElementById("wb-preview-root")
    if (!sc) return { label: label, missing: true }
    var r = sc.getBoundingClientRect()
    var x = r.left + r.width / 2, y = r.top + r.height / 2
    var top = document.elementFromPoint(x, y)
    var cs = getComputedStyle(sc)
    return {
      label: label,
      sections: sc.querySelectorAll("[id^=wb-section-]").length,
      scrollHeight: sc.scrollHeight, clientHeight: sc.clientHeight, scrollTop: sc.scrollTop,
      canScroll: sc.scrollHeight > sc.clientHeight + 2,
      overflowY: cs.overflowY, touchAction: cs.touchAction,
      box: Math.round(r.width) + "x" + Math.round(r.height) + "@" + Math.round(r.top),
      topAtCentre: describe(top),
      centreInsideScroller: !!top && sc.contains(top),
      pointerEventsNoneOn: chainNone(top),
      coveredBy: coverers(sc, x, y),
      bodyPE: document.body.style.pointerEvents || "-",
      htmlClass: document.documentElement.className,
      sheetOpen: !!document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]"),
      scrollLocked: document.body.hasAttribute("data-scroll-locked"),
      /** Every Radix layer that says it is open, and what kind it is. */
      openLayers: Array.prototype.map.call(
        document.querySelectorAll("[data-state=open][role], [aria-modal=true], [data-radix-popper-content-wrapper]"),
        function (e) { return describe(e) + "[role=" + (e.getAttribute("role") || "-") + ",modal=" + (e.getAttribute("aria-modal") || "-") + "]" }
      ),
    }
  }
  /**
   * WHAT A PERSON CAN DO, not what a script can. Assigning scrollTop works on
   * a scroller whose overflow is hidden, so it read every step as fine while
   * the one true signal sat in the same row: overflow=hidden. A person can
   * scroll it only if all four hold.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A REAL FINGER, NOT AN ASSIGNMENT TO scrollTop
   * ═══════════════════════════════════════════════════════════════════════
   * Everything this harness measured before was what a SCRIPT can do. The
   * freeze is reported by a thumb. Those are different questions, and the
   * gap between them is exactly where a preventDefault on touchmove
   * lives: the scroller is healthy, its overflow is auto, nothing covers it,
   * and every gesture over it is cancelled before the compositor sees it.
   *
   * Chromium will not scroll from synthetic touches, so this does not ask
   * whether the pixels moved. It asks the one thing that decides whether
   * they would: was the gesture cancelled, and by a listener on what.
   */
  function touchAt(type, target, x, y, cancelable) {
    var t = new Touch({ identifier: 1, target: target, clientX: x, clientY: y, pageX: x, pageY: y })
    var e = new TouchEvent(type, { bubbles: true, cancelable: !!cancelable, touches: type === "touchend" ? [] : [t], targetTouches: type === "touchend" ? [] : [t], changedTouches: [t] })
    target.dispatchEvent(e)
    return e
  }
  /** touch-action on the scroller and every ancestor above it. */
  function touchActionChain(el) {
    var out = []
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var ta = getComputedStyle(n).touchAction
      if (ta && ta !== "auto") out.push(describe(n) + ":" + ta)
    }
    var root = getComputedStyle(document.documentElement).touchAction
    if (root && root !== "auto") out.push("html:" + root)
    return out
  }
  function touchDrag(label) {
    var sc = document.getElementById("wb-preview-root")
    if (!sc) return { label: label, missing: true }
    var r = sc.getBoundingClientRect()
    var x = Math.round(r.left + r.width / 2)
    var y = Math.round(r.top + r.height / 2)
    var target = document.elementFromPoint(x, y) || sc
    var before = sc.scrollTop
    touchAt("touchstart", target, x, y, true)
    var cancelled = 0, total = 0
    for (var i = 1; i <= 6; i++) {
      var e = touchAt("touchmove", target, x, y - i * 12, true)
      total++
      if (e.defaultPrevented) cancelled++
    }
    touchAt("touchend", target, x, y - 72, true)
    var caught = (window.__prevented || []).splice(0)
    var m = judge(measure(label))
    m.touch = { on: describe(target), cancelled: cancelled, of: total, chain: touchActionChain(sc), movedBy: sc.scrollTop - before, by: caught.slice(0, 2).map(function (c) { return c.stack }) }
    if (cancelled > 0) { m.userCanScroll = false; m.why.push(cancelled + " of " + total + " touchmoves over the canvas were cancelled by a listener") }
    return m
  }

  function judge(m) {
    var why = []
    if (m.overflowY !== "auto" && m.overflowY !== "scroll") why.push("overflow is " + m.overflowY)
    if (!m.canScroll) why.push("nothing to scroll (" + m.scrollHeight + "/" + m.clientHeight + ")")
    if (!m.centreInsideScroller) why.push("a touch lands outside the canvas, on " + m.topAtCentre)
    if (m.pointerEventsNoneOn) why.push("pointer-events none on " + m.pointerEventsNoneOn)
    if (m.touchAction === "none") why.push("touch-action none")
    m.userCanScroll = why.length === 0
    m.why = why
    return m
  }
  function tryScroll(label, to) {
    var sc = document.getElementById("wb-preview-root")
    if (!sc) return { label: label, missing: true }
    sc.scrollTop = to
    var m = judge(measure(label))
    m.askedFor = to
    m.took = sc.scrollTop === to || (to > sc.scrollHeight - sc.clientHeight && sc.scrollTop === sc.scrollHeight - sc.clientHeight)
    return m
  }
  function click(el) {
    if (!el) return false
    var r = el.getBoundingClientRect()
    var opts = { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }
    el.dispatchEvent(new PointerEvent("pointerdown", opts))
    el.dispatchEvent(new MouseEvent("mousedown", opts))
    el.dispatchEvent(new PointerEvent("pointerup", opts))
    el.dispatchEvent(new MouseEvent("mouseup", opts))
    el.dispatchEvent(new MouseEvent("click", opts))
    return true
  }
  var steps = []
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms) }) }
  function btn(label) {
    var all = document.querySelectorAll("button, [role=menuitem], [role=tab], a[role=button]")
    var want = label.toLowerCase()
    for (var i = 0; i < all.length; i++) {
      var b = all[i]
      var l = (b.getAttribute("aria-label") || b.getAttribute("title") || b.textContent || "").trim().toLowerCase()
      if (l === want) return b
    }
    for (var k = 0; k < all.length; k++) {
      var c = all[k]
      var m = (c.getAttribute("aria-label") || c.getAttribute("title") || c.textContent || "").trim().toLowerCase()
      if (m.indexOf(want) === 0) return c
    }
    return null
  }
  function press(label) { var b = btn(label); steps.push({ label: (b ? "pressed " : "NO BUTTON ") + label }); return click(b) }
  function escape() { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })) }
  function dialogs() {
    var out = []
    document.querySelectorAll("[role=dialog], [aria-modal=true]").forEach(function (d) {
      var cs = getComputedStyle(d); if (cs.display === "none" || cs.visibility === "hidden") return
      out.push(describe(d) + " buttons: " + Array.prototype.map.call(d.querySelectorAll("button"), function (b) { return (b.getAttribute("aria-label") || b.textContent.trim()).slice(0, 18) }).slice(0, 8).join("|"))
    })
    return out
  }
  function finish() {
    steps.push({ label: "touch listeners registered", listeners: (window.__touchListeners || []).map(function (l) { return l.type + " on " + l.on + (l.passive ? " (passive)" : " (CAN CANCEL)") }) })
    var el = document.createElement("script"); el.type = "application/json"; el.id = "out"
    el.textContent = JSON.stringify(steps); document.body.appendChild(el)
    document.title = "DONE:" + steps.length
  }
  var tries = 0
  function waitReady() {
    var sc = document.getElementById("wb-preview-root")
    var n = sc ? sc.querySelectorAll("[id^=wb-section-]").length : 0
    if (n >= 3 && sc.scrollHeight > 0) return go().then(finish, function (e) { steps.push({ label: "driver threw", message: String(e && e.message || e) }); finish() })
    if (++tries > 150) { steps.push({ label: "never ready", sections: n, hasScroller: !!sc, bodyText: document.body.innerText.slice(0, 300) }); return finish() }
    setTimeout(waitReady, 100)
  }
  /** A tap, with the touch events a thumb actually sends before the click. */
  function tap(el) {
    if (!el) return false
    var r = el.getBoundingClientRect()
    var x = Math.round(r.left + Math.min(20, r.width / 2))
    var y = Math.round(r.top + Math.min(20, r.height / 2))
    touchAt("touchstart", el, x, y, true)
    touchAt("touchend", el, x, y, true)
    return click(el)
  }
  function sectionRows() {
    return document.querySelectorAll("[data-mobile-bottom-sheet] [data-section-row], [data-mobile-bottom-sheet] button[aria-label^=Options], [data-wb-sidebar-scroll] button[aria-label^=Options]")
  }

  async function go() {
    var phone = window.innerWidth < 768
    steps.push(measure("loaded"))
    steps.push(touchDrag("a finger on the canvas, before anything"))
    steps.push(tryScroll("scroll before any click", 250))
    var secs = document.querySelectorAll("#wb-preview-root [id^=wb-section-]")

    // THE REPORT: selecting a section. With touch, as a thumb does it.
    tap(secs[2] || secs[1]); await sleep(700)
    steps.push(touchDrag("a finger after TAPPING a section on the canvas"))
    steps.push(tryScroll("after tapping a section", 500))

    // And selecting one from the list, which is the other way in.
    var rows = sectionRows()
    if (!rows.length && phone) { press("Sections"); await sleep(700); rows = sectionRows() }
    steps.push({ label: "section rows found: " + rows.length })
    if (rows.length) {
      tap(rows[Math.min(2, rows.length - 1)]); await sleep(900)
      steps.push(touchDrag("a finger after selecting a section from the list"))
    }
    // Back out of whatever that opened, then try again.
    escape(); await sleep(600)
    steps.push(touchDrag("a finger after closing the section panel"))
    await sleep(2500)
    steps.push(touchDrag("and 3 seconds later, in case it was only animating out"))

    if (phone) {
      // The sheet: open it the way a thumb does, then tap the canvas above it.
      press("Sections"); await sleep(700)
      steps.push(measure("sheet open (tapped Sections tab)"))
      var sc = document.getElementById("wb-preview-root"); var r = sc.getBoundingClientRect()
      var over = document.elementFromPoint(r.left + r.width / 2, r.top + 80)
      steps.push({ label: "tapping the canvas above the sheet lands on " + describe(over) })
      click(over); await sleep(700)
      steps.push(touchDrag("a finger with the sheet open"))
      steps.push(tryScroll("after tapping the canvas with the sheet open", 300))
      // Code editor via the menu, then back with Escape.
      press("Open menu"); await sleep(300); press("Code"); await sleep(900)
      steps.push(measure("in the code editor")); steps.push({ label: "dialogs: " + dialogs().join(" / ") })
      escape(); await sleep(1300)
      steps.push(touchDrag("a finger back from the code editor"))
      steps.push(tryScroll("back from the code editor", 350))
      press("Open menu"); await sleep(300); press("Project settings"); await sleep(900)
      steps.push(measure("in project settings")); steps.push({ label: "dialogs: " + dialogs().join(" / ") })
      escape(); await sleep(1300)
      steps.push(touchDrag("a finger back from project settings"))
      steps.push(tryScroll("back from project settings", 450))
    } else {
      press("Code"); await sleep(900)
      steps.push(measure("in the code editor"))
      press("Preview"); await sleep(1300)
      steps.push(touchDrag("a finger back from the code editor"))
      steps.push(tryScroll("back from the code editor", 350))
      press("Project Settings"); await sleep(900)
      steps.push(measure("in project settings")); steps.push({ label: "dialogs: " + dialogs().join(" / ") })
      escape(); await sleep(1300)
      steps.push(touchDrag("a finger back from project settings"))
      steps.push(tryScroll("back from project settings", 450))
      press("Disable section inspector"); await sleep(400)
      steps.push(tryScroll("inspector off", 200))
      press("Enable section inspector"); await sleep(400)
      click(secs[3]); await sleep(500)
      steps.push(tryScroll("inspector on, tapped a section", 520))
      press("Switch to phone preview"); await sleep(900)
      steps.push(tryScroll("desktop showing the phone frame", 300))
      press("Switch to desktop preview"); await sleep(900)
      steps.push(tryScroll("back to the desktop frame", 300))
    }
    steps.push({ label: "chrome buttons", labels: [], fetches: (window.probeCalls || []).slice(0, 12) })
  }
  window.addEventListener("error", function (e) { steps.push({ label: "window error", message: String(e.message) }) })
  setTimeout(waitReady, 200)
})()
</script>`

function run(width, height, label) {
  const file = join(out, `${label}.html`)
  /**
   * The bundle is LOADED, not inlined. Three megabytes of application code
   * contains the text "</script>" somewhere — a sanitiser's own list of
   * dangerous tags is enough — and inline that closes the script early: the
   * editor renders nothing, the rest of the bundle spills into the page as
   * text, and the driver after it never runs. No error is logged for any of
   * that. A src attribute is immune.
   */
  writeFileSync(join(out, "editor-probe.js"), readFileSync(bundle))
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div>${SPY}<script src="editor-probe.js"></script>${DRIVE}</body></html>`)
  const dump = execFileSync(CHROMIUM, ["--headless", "--disable-gpu", "--no-sandbox", "--force-device-scale-factor=1", "--enable-logging=stderr", "--v=0",
    `--window-size=${width},${height}`, "--virtual-time-budget=40000", "--dump-dom", `file://${file}`],
    { encoding: "utf8", maxBuffer: 400 * 1024 * 1024, stdio: ["ignore", "pipe", process.env.PROBE_DEBUG ? "inherit" : "ignore"] })
  // A src'd script loads asynchronously to the parser, so the driver polls for it; see waitReady.
  const m = /<script type="application\/json" id="out">([\s\S]*?)<\/script>/.exec(dump)
  if (!m) {
    const t = /<title>([^<]*)<\/title>/.exec(dump)
    fail(`${label}: the drive never reported. title=${t ? t[1] : "(none)"} dump=${dump.length} bytes\n${dump.slice(-1500).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(-600)}`)
  }
  return JSON.parse(m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
}

let failures = 0
for (const [w, h, label] of [[390, 844, "phone"], [1280, 900, "desktop"]]) {
  console.log(`\n══ ${label} ${w}×${h} ══`)
  for (const s of run(w, h, label)) {
    if (s.userCanScroll === false) { failures++; console.log(`  ✗ ${s.label}: a person could not scroll the canvas here: ${s.why.join("; ")}`) }
    if (s.listeners) { console.log(`  touch listeners: ${[...new Set(s.listeners)].join("  |  ")}`); continue }
    if (s.labels) { console.log(`  chrome: ${s.labels.join(" | ")}\n  fetches: ${s.fetches.join(", ")}`); continue }
    if (s.missing || s.message || s.bodyText !== undefined) { console.log(`  ${s.label}: ${JSON.stringify(s)}`); continue }
    if (s.sections === undefined) { console.log(`  ${s.label}`); continue }
    const scrolled = s.askedFor !== undefined ? `  set ${s.askedFor} → ${s.scrollTop} ${s.took ? "OK" : "DID NOT TAKE"}` : ""
    console.log(`  ${s.label}: ${s.sections} sections, ${s.scrollHeight}/${s.clientHeight} (${s.canScroll ? "scrollable" : "NOT SCROLLABLE"}) overflow=${s.overflowY} box=${s.box}${scrolled}`)
    if (s.touch) console.log(`      finger: ${s.touch.cancelled}/${s.touch.of} moves cancelled on ${s.touch.on}${s.touch.chain.length ? "  touch-action: " + s.touch.chain.join(", ") : ""}${s.touch.by && s.touch.by.length ? "\n      cancelled by: " + s.touch.by.join("\n                    ") : ""}`)
    console.log(`      touch at centre lands on ${s.topAtCentre}${s.centreInsideScroller ? "" : "  ← OUTSIDE THE CANVAS"}${s.pointerEventsNoneOn ? "  pointer-events:none on " + s.pointerEventsNoneOn : ""}${s.coveredBy.length ? "\n      covered by: " + s.coveredBy.join("; ") : ""}${s.sheetOpen ? "  sheet OPEN" : ""}${s.scrollLocked ? "  body[data-scroll-locked]" : ""}${s.openLayers && s.openLayers.length ? "\n      open layers: " + s.openLayers.join(", ") : ""}${s.bodyPE !== "-" ? "  body.pointer-events=" + s.bodyPE : ""}`)
  }
}

if (failures) fail(`${failures} step(s) left the canvas unscrollable by a person. A scroller a script can scroll and a person cannot is exactly the freeze.`)
console.log("\n  At both widths, after every path that has been reported, a person can still scroll the canvas.\n")
