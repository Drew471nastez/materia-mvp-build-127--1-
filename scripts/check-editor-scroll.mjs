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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

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

export const useLinkStatus = () => ({ pending: false })
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
/* Other probes that need the real editor (scripts/check-sheet-reach.mjs)
   build it through here, so the stubs live in one place. */
if (process.env.EDITOR_BUNDLE_ONLY === "1") process.exit(0)
/* The built stylesheet when there is one, and the same source compiled when
   there is not (a worktree), so this runs without a production build. */
const css = await appCss(root)
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
      /**
       * An invisible layer that still takes the touch is the worst kind: the
       * canvas is plainly visible through it and completely dead. Reported
       * with its own numbers rather than as "covered by", so it cannot be
       * read as a scrim doing its job.
       */
      ghosts: Array.prototype.filter.call(document.querySelectorAll("body *"), function (e) {
        if (sc.contains(e) || e === sc || e.contains(sc)) return false
        var cs = getComputedStyle(e)
        if (cs.pointerEvents === "none") return false
        if (cs.visibility === "hidden") return false
        /**
         * WHAT THE ELEMENT IS SET TO, not what it is painting this instant.
         *
         * Headless Chromium does not advance CSS transitions or animations
         * under a virtual-time budget, so anything fading IN reads as opacity
         * 0 forever, and every one of them looked like a bug. The honest
         * question is what the element has been TOLD to be:
         *
         *   an inline opacity is the answer, whoever wrote it — React on
         *   render, or the drag path by hand. It is the settled intent.
         *
         *   with no inline opacity, a running animation means it is on its
         *   way somewhere and is not settled at all; only with neither does
         *   the computed value stand on its own.
         *
         * A real ghost is settled at nothing and still takes the touch.
         */
        var inline = e.style && e.style.opacity !== "" ? Number(e.style.opacity) : null
        if (inline !== null) {
          if (inline > 0.02) return false
        } else {
          if (typeof e.getAnimations === "function" && e.getAnimations().length > 0) return false
          if (Number(cs.opacity) > 0.02) return false
        }
        var r = e.getBoundingClientRect()
        return r.left <= x && r.right >= x && r.top <= y && r.bottom >= y && r.width > 200 && r.height > 200
      }).map(function (e) {
        var cs = getComputedStyle(e)
        /** Inline too: it says whether React or the drag path wrote it last. */
        var sheets = document.querySelectorAll("[data-mobile-bottom-sheet]")
        var states = Array.prototype.map.call(sheets, function (sh) {
          var scs = getComputedStyle(sh)
          return "sheet[modal=" + (sh.getAttribute("aria-modal") || "-") + ",vis=" + scs.visibility + ",z=" + scs.zIndex + "]"
        }).join(" ")
        return describe(e) + " computed(opacity=" + cs.opacity + ",pe=" + cs.pointerEvents + ",z=" + cs.zIndex + ")" +
          " inline(opacity=" + (e.style.opacity || "-") + ",pe=" + (e.style.pointerEvents || "-") + ",transition=" + (e.style.transition || "-").slice(0, 24) + ")" +
          " " + states
      }),
      bodyPE: document.body.style.pointerEvents || "-",
      htmlClass: document.documentElement.className,
      sheetOpen: !!document.querySelector("[data-mobile-bottom-sheet][aria-modal=true]"),
      anythingOpen: !!document.querySelector("[aria-modal=true], [role=dialog][data-state=open], [role=menu][data-state=open]"),
      backdrop: (function () {
        var sh = document.querySelector("[data-mobile-bottom-sheet]")
        var sc2 = sh && sh.parentElement ? sh.parentElement.querySelector("div.fixed.inset-0") : null
        if (!sc2) return "(none)"
        var c2 = getComputedStyle(sc2)
        return "declared=" + (sc2.style.opacity || "(none)") + " computed=" + c2.opacity + " pe=" + c2.pointerEvents + " sheetModal=" + (sh.getAttribute("aria-modal") || "-")
      })(),
      scrollLocked: document.body.hasAttribute("data-scroll-locked"),
      /**
       * THE SITE'S OWN MENU, OPEN ON THE CANVAS. Tapping the header's
       * hamburger opens it, and it holds the canvas still on purpose
       * (overflow hidden, touch-action none) while a finger belongs to the
       * menu. That is a layer doing its job, like a sheet, not a freeze.
       */
      siteDrawerOpen: !!sc.querySelector('[role=dialog][aria-modal=true]'),
      centreOnSiteDrawer: (function () {
        var d = sc.querySelector('[role=dialog][aria-modal=true]')
        if (!d || !top) return false
        var b = sc.querySelector("[data-site-drawer-backdrop]")
        return d.contains(top) || (!!b && (b === top || b.contains(top)))
      })(),
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
    /* Under an open site menu a cancelled move is the menu keeping the finger off the page. */
    if (cancelled > 0 && !m.heldBySiteMenu) { m.userCanScroll = false; m.why.push(cancelled + " of " + total + " touchmoves over the canvas were cancelled by a listener") }
    return m
  }

  function judge(m) {
    var why = []
    /**
     * An open site menu owns the canvas: the lock is the point. What would
     * be wrong is the lock with the menu not actually in front, so that is
     * the one thing asked, and a closed menu is judged like anything else.
     */
    if (m.siteDrawerOpen) {
      if (!m.centreOnSiteDrawer) why.push("the site menu is open and holds the canvas, but a touch at the centre lands on " + m.topAtCentre)
      m.userCanScroll = why.length === 0
      m.why = why
      m.heldBySiteMenu = true
      return m
    }
    if (m.overflowY !== "auto" && m.overflowY !== "scroll") why.push("overflow is " + m.overflowY)
    if (!m.canScroll) why.push("nothing to scroll (" + m.scrollHeight + "/" + m.clientHeight + ")")
    /**
     * COVERED BY SOMETHING OPEN IS NOT A FREEZE. A sheet over the canvas with
     * a visible backdrop is a sheet doing its job: you are meant to be in it,
     * and tapping the backdrop closes it. What is never right is being
     * covered by something nobody can see (the ghosts check below), or
     * covered with nothing open at all.
     */
    if (!m.centreInsideScroller && !m.anythingOpen) why.push("a touch lands outside the canvas, on " + m.topAtCentre + ", with nothing open to explain it")
    if (m.pointerEventsNoneOn) why.push("pointer-events none on " + m.pointerEventsNoneOn)
    if (m.ghosts && m.ghosts.length) why.push("an INVISIBLE layer is taking the touch: " + m.ghosts.join("; "))
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
    /**
     * THE KEYBOARD. "Focus a field and the preview will not scroll." On iOS
     * a focused field scrolls the WINDOW to lift itself above the keyboard,
     * locked document or not, and the window is left there when the keyboard
     * goes; the fixed builder is then offset and its scroller dead. Chromium
     * will not scroll a locked document, so the offset itself cannot be
     * reproduced here — what CAN be measured is the response: the builder
     * must revive the canvas when a field loses focus, and reviveScroller's
     * fingerprint is the inline overflow-y: auto it writes while re-creating
     * the scroll layer. Cleared first, so only a revive in this step can put
     * it back. (Its -webkit-overflow-scrolling declaration would be the more
     * obvious fingerprint, but Chromium does not know that property and drops
     * it on write, so it can never be read back here.)
     */
    // Any visible field that takes a keyboard, outside the canvas: which one
    // does not matter, the keyboard closing is the event under test.
    async function keyboardStep(where) {
    var canvas = document.getElementById("wb-preview-root")
    var field = Array.prototype.find.call(
      document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]), textarea, [contenteditable=true]"),
      function (el) {
        if (canvas && canvas.contains(el)) return false
        var r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden"
      },
    )
    if (field) {
      var scroller = document.getElementById("wb-preview-root")
      var focusouts = 0
      document.addEventListener("focusout", function () { focusouts++ })
      field.focus(); await sleep(250)
      var focused = document.activeElement === field
      field.blur(); await sleep(750)
      steps.push({
        label: "keyboard (" + where + "): the canvas is revived when a field loses focus",
        keyboardRevived: window.scrollY === 0,
        windowScrollY: window.scrollY,
        field: field.tagName.toLowerCase() + ":" + (field.getAttribute("type") || "") + " hasFocus=" + document.hasFocus() + " focused=" + focused + " focusouts=" + focusouts,
      })
      steps.push(touchDrag("a finger after a field lost focus"))
      steps.push(tryScroll("after a field lost focus", 300))
    } else {
      var root = document.querySelector("[data-wb-sidebar-scroll]")
      var kinds = root ? Array.prototype.map.call(root.querySelectorAll("input, textarea, select, [contenteditable]"), function (el) { return el.tagName.toLowerCase() + ":" + (el.getAttribute("type") || "") }).slice(0, 12) : []
      steps.push({ label: "keyboard (" + where + "): no field in reach to focus", message: "fields in the panel: " + (kinds.length ? kinds.join(", ") : "none") })
    }
    }

    steps.push(measure("loaded"))
    steps.push(touchDrag("a finger on the canvas, before anything"))
    steps.push(tryScroll("scroll before any click", 250))
    var secs = document.querySelectorAll("#wb-preview-root [id^=wb-section-]")

    // "Select a section and it takes me back to the top." Scroll first, then
    // tap, then read where the canvas is.
    var scrollerForKeep = document.getElementById("wb-preview-root")
    var roomForKeep = scrollerForKeep.scrollHeight - scrollerForKeep.clientHeight
    scrollerForKeep.scrollTop = Math.min(420, Math.max(0, roomForKeep - 60)); await sleep(250)
    var beforeTap = scrollerForKeep.scrollTop
    var heightBefore = scrollerForKeep.scrollHeight
    /**
     * Sampled every frame, not read once at the end: a clamp to the top and a
     * scroll back would look like nothing happened, and "it jumps, quick,
     * like a glitch" is exactly that shape.
     */
    var lowest = beforeTap
    var sampling = true
    var sample = function () {
      if (!sampling) return
      if (scrollerForKeep.scrollTop < lowest) lowest = scrollerForKeep.scrollTop
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
    tap(secs[3] || secs[2] || secs[1]); await sleep(1400)
    sampling = false
    steps.push({
      label: "selecting a section keeps the scroll position",
      keptScroll: scrollerForKeep.scrollTop,
      beforeTap: beforeTap,
      lowest: lowest,
      room: roomForKeep,
      heightBefore: heightBefore,
      heightAfter: scrollerForKeep.scrollHeight,
      clientAfter: scrollerForKeep.clientHeight,
    })

    /**
     * AND THE SAME TAP, ON A CONTROL INSIDE THE SECTION. A thumb lands on a
     * button or a link as often as on the space beside one, and a focusable
     * element that takes focus is scrolled into view by the browser itself,
     * which on a short page is a jump to the top. The wrapper tap above
     * cannot show that; this one can.
     */
    var focusables = scrollerForKeep.querySelectorAll("[id^=wb-section-] a[href], [id^=wb-section-] button, [id^=wb-section-] summary, [id^=wb-section-] input, [id^=wb-section-] [tabindex]")
    var control = Array.prototype.find.call(focusables, function (el) {
      var r = el.getBoundingClientRect()
      var box = scrollerForKeep.getBoundingClientRect()
      // Anywhere a thumb could land on it: overlapping the visible box is enough.
      return r.width > 0 && r.height > 0 && r.bottom > box.top + 8 && r.top < box.bottom - 8
    })
    if (control) {
      var beforeControl = scrollerForKeep.scrollTop
      var lowestControl = beforeControl
      var samplingControl = true
      var sampleControl = function () {
        if (!samplingControl) return
        if (scrollerForKeep.scrollTop < lowestControl) lowestControl = scrollerForKeep.scrollTop
        requestAnimationFrame(sampleControl)
      }
      requestAnimationFrame(sampleControl)
      tap(control); await sleep(1400)
      samplingControl = false
      steps.push({
        label: "tapping a CONTROL inside a section keeps the scroll position",
        keptScroll: scrollerForKeep.scrollTop,
        beforeTap: beforeControl,
        lowest: lowestControl,
        room: scrollerForKeep.scrollHeight - scrollerForKeep.clientHeight,
        heightBefore: scrollerForKeep.scrollHeight,
        heightAfter: scrollerForKeep.scrollHeight,
        clientAfter: scrollerForKeep.clientHeight,
        what: control.tagName.toLowerCase() + (control.getAttribute("href") ? "[href=" + control.getAttribute("href") + "]" : ""),
        focused: document.activeElement === control ? "took focus" : "no focus",
        stillHere: location.pathname,
      })
    } else {
      steps.push({ label: "no control in view inside a section to tap", message: "found " + focusables.length + " focusable elements, none fully in view" })
    }

    /**
     * THE CONTROL IN VIEW IS OFTEN THE HEADER'S HAMBURGER, pinned at the top
     * of the canvas, and a tap on it opens the site's menu over the canvas.
     * That is a layer, judged as one (see judge), and it is put away here so
     * every step after this measures the canvas it means to.
     */
    if (scrollerForKeep.querySelector("[role=dialog][aria-modal=true]")) {
      steps.push(touchDrag("a finger with the site's menu open (the tap above opened it)"))
      var menuAt = scrollerForKeep.scrollTop
      escape(); await sleep(700)
      steps.push(touchDrag("a finger after the site's menu closed"))
      steps.push({ label: "the site's menu closed where it opened", keptScroll: scrollerForKeep.scrollTop, beforeTap: menuAt, lowest: scrollerForKeep.scrollTop, room: scrollerForKeep.scrollHeight - scrollerForKeep.clientHeight, heightBefore: scrollerForKeep.scrollHeight, heightAfter: scrollerForKeep.scrollHeight, clientAfter: scrollerForKeep.clientHeight })
    }

    /**
     * AND THE LAST SECTION, FROM THE BOTTOM. "It redirects me back to the
     * top, especially when I click on the last section." The bottom of the
     * page is where the newsletter and the footer are, which is where the
     * forms are, and a form that submits takes the whole page with it.
     */
    scrollerForKeep.scrollTop = scrollerForKeep.scrollHeight
    await sleep(300)
    var atBottom = scrollerForKeep.scrollTop
    var lastSections = scrollerForKeep.querySelectorAll("[id^=wb-section-]")
    var last = lastSections[lastSections.length - 1]
    var lowestLast = atBottom
    var samplingLast = true
    var sampleLast = function () {
      if (!samplingLast) return
      if (scrollerForKeep.scrollTop < lowestLast) lowestLast = scrollerForKeep.scrollTop
      requestAnimationFrame(sampleLast)
    }
    requestAnimationFrame(sampleLast)
    // The section itself, then a control that would submit a form: a thumb
    // finds both, and a submit is the one that takes the whole page with it.
    tap(last); await sleep(500)
    var submitter = scrollerForKeep.querySelector("form button[type=submit], form button:not([type]), form input[type=submit]")
    /**
     * No form in the fixture, so put one there. A newsletter written in the
     * theme language IS this: a form with an action and a submit button,
     * whose own script does not run in the editor. Submitting it navigates
     * the page for real, which is what "it redirected me back to the top"
     * was. With the canvas blocking the default, the address does not move.
     */
    var injected = false
    if (!submitter && last) {
      var f = document.createElement("form")
      f.setAttribute("action", "/products")
      f.setAttribute("method", "get")
      var b = document.createElement("button")
      b.setAttribute("type", "submit")
      b.textContent = "Join"
      f.appendChild(b)
      last.appendChild(f)
      submitter = b
      injected = true
      await sleep(120)
    }
    if (submitter) {
      // Bring it under the thumb first, the way a person would.
      var box = scrollerForKeep.getBoundingClientRect()
      var r = submitter.getBoundingClientRect()
      scrollerForKeep.scrollTop = Math.max(0, scrollerForKeep.scrollTop + (r.top - box.top) - 200)
      await sleep(300)
      atBottom = scrollerForKeep.scrollTop
      lowestLast = atBottom
      tap(submitter)
      await sleep(1200)
    }
    samplingLast = false
    steps.push({
      label: "the LAST section, tapped from the bottom, keeps the scroll position",
      keptScroll: scrollerForKeep.scrollTop,
      beforeTap: atBottom,
      lowest: lowestLast,
      room: scrollerForKeep.scrollHeight - scrollerForKeep.clientHeight,
      heightBefore: scrollerForKeep.scrollHeight,
      heightAfter: scrollerForKeep.scrollHeight,
      clientAfter: scrollerForKeep.clientHeight,
      what: submitter ? "section then a " + submitter.tagName.toLowerCase() + " that submits a form" + (injected ? " (put there by the probe)" : "") : "section only, no form on the page",
      focused: document.activeElement === document.body ? "no focus" : "focus on " + (document.activeElement ? document.activeElement.tagName.toLowerCase() : "none"),
      stillHere: location.pathname,
    })

    // THE REPORT: selecting a section. With touch, as a thumb does it.
    tap(secs[2] || secs[1]); await sleep(700)
    steps.push(touchDrag("a finger after TAPPING a section on the canvas"))
    steps.push(tryScroll("after tapping a section", 500))

    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  EVERY CONTROL, ONE AT A TIME, WITH THE CANVAS CHECKED AFTER EACH
     * ═══════════════════════════════════════════════════════════════════════
     * Guessing which control freezes it has now been wrong twice. So this
     * stops guessing: open a section's settings, then press everything in
     * reach — every button, every field, every swatch — and after each one
     * ask the only question that matters, whether a finger can still scroll
     * the canvas. Whatever breaks it names itself.
     */
    async function sweep(where, root, budget) {
      if (!root) { steps.push({ label: "no " + where + " to sweep" }); return }
      var seen = {}
      var controls = []
      root.querySelectorAll("button, [role=button], [role=combobox], [role=tab], summary, input[type=color], input[type=checkbox], [data-swatch], select").forEach(function (c) {
        if (!c.offsetParent && getComputedStyle(c).position !== "fixed") return
        var name = (c.getAttribute("aria-label") || c.getAttribute("title") || c.textContent || c.tagName).trim().slice(0, 34) || c.tagName
        if (seen[name]) return
        /**
         * Buttons that leave the editor are not freezes. "Back to Dashboard"
         * covers the canvas because it is navigating away from it, which is
         * the point of the button. Only the controls that stay on this screen
         * are being asked whether they break it.
         */
        var low = name.toLowerCase()
        if (low.indexOf("back to dashboard") === 0 || low.indexOf("theme settings") === 0 || low.indexOf("project settings") === 0 ||
            low === "code" || low === "preview" || low === "publish" || low.indexOf("sections") === 0 || low.indexOf("pages") === 0 ||
            low.indexOf("settings") === 0 || low.indexOf("open menu") === 0 || low === "back") return
        seen[name] = 1
        controls.push({ el: c, name: name })
      })
      steps.push({ label: where + ": " + controls.length + " controls to try" })
      var names = controls.map(function (c) { return c.name })
      var tried = 0
      for (var i = 0; i < names.length && tried < budget; i++) {
        /**
         * FOUND AGAIN BY NAME EVERY TIME. Pressing one control re-renders the
         * panel and every node cached before it is discarded, so a loop that
         * holds element references tries exactly one thing and then silently
         * skips the rest — which is what it did.
         */
        var want = names[i]
        var c = null
        root = document.querySelector("[data-wb-sidebar-scroll]")
        if (!root) break
        var live = root.querySelectorAll("button, [role=button], [role=combobox], [role=tab], summary, input[type=color], input[type=checkbox], [data-swatch], select")
        for (var k = 0; k < live.length; k++) {
          var n = (live[k].getAttribute("aria-label") || live[k].getAttribute("title") || live[k].textContent || live[k].tagName).trim().slice(0, 34)
          if (n === want) { c = { el: live[k], name: want }; break }
        }
        if (!c) continue
        tried++
        tap(c.el)
        await sleep(260)
        escape()
        await sleep(240)
        var m = touchDrag(where + " → " + c.name)
        if (!m.userCanScroll) { steps.push(m); steps.push({ label: "!! the canvas is dead after: " + c.name }) }
      }
      steps.push({ label: where + ": tried " + tried })
    }

    // Selecting a section the way a person does: the ROW, not the three dots.
    /**
     * The sidebar's scroller, wherever it lives: in the sidebar on a desktop
     * and inside the sections sheet on a phone. Asking for the first sheet
     * in the document found the assistant's sheet there, which holds no
     * section rows, so on a phone this step used to find nothing and skip.
     */
    if (phone) { press("Sections"); await sleep(700) }
    var panelRoot = document.querySelector("[data-wb-sidebar-scroll]")
    /**
     * A SECTION ROW, found by its own three-dot button rather than by
     * guessing at markup: the row is the ancestor that holds both. Clicking
     * the name is how a person selects it; the three dots are a different
     * control, and pressing those was what the last round tested by mistake.
     */
    var rowButtons = []
    if (panelRoot) {
      panelRoot.querySelectorAll("button[aria-label^='Options for']").forEach(function (b) {
        var row = b.parentElement
        while (row && row !== panelRoot && !row.querySelector("span.flex-1")) row = row.parentElement
        var label = row && row.querySelector("span.flex-1")
        if (label) rowButtons.push(label)
      })
    }
    steps.push({ label: "section rows found by their options button: " + rowButtons.length })
    if (rowButtons.length > 2) {
      tap(rowButtons[2]); await sleep(900)
      steps.push(touchDrag("a finger after selecting a section ROW"))
      await keyboardStep("section settings")
      // Whatever that opened, press everything inside it.
      var opened = document.querySelector("[data-wb-sidebar-scroll]")
      await sweep("section settings", opened, 22)
    }

    // And the three-dot menu, which was the last one.
    var rows = sectionRows()
    if (!rows.length && phone) { press("Sections"); await sleep(700); rows = sectionRows() }
    steps.push({ label: "section rows found: " + rows.length })
    if (rows.length) {
      tap(rows[Math.min(2, rows.length - 1)]); await sleep(900)
      steps.push(touchDrag("a finger after selecting a section from the list"))
    }
    // Back out of whatever that opened, then try again.
    /** Escape does not close a custom sheet; tapping its backdrop does. */
    escape()
    var back = document.querySelector("[data-mobile-bottom-sheet]")
    var scrim = back && back.parentElement ? back.parentElement.querySelector("div.fixed.inset-0") : null
    if (scrim) tap(scrim)
    await sleep(800)
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
    /**
     * ═══════════════════════════════════════════════════════════════════════
     *  THE ADD SECTION LIBRARY ACTUALLY HAS SECTIONS IN IT
     * ═══════════════════════════════════════════════════════════════════════
     * Reported with a screenshot: the categories are all there down the side
     * and the panel beside them is blank. Not "no sections in this category" —
     * blank, which means the list was not empty and simply never drew.
     */
    /** The list has to be on screen before its "Add section" button exists. */
    if (phone) { press("Sections"); await sleep(800) }
    var addBtn = btn("Add section")
    if (addBtn) {
      /**
       * How long the main thread is BUSY, not how long we waited. A long task
       * is what a dropped frame is made of; wall time here is mostly the
       * sleep. Measured by watching for gaps where a 16ms interval did not
       * get to run.
       */
      var longest = 0
      var last = performance.now()
      var tick = setInterval(function () {
        var now = performance.now()
        var gap = now - last
        if (gap > longest) longest = gap
        last = now
      }, 16)
      var t0 = performance.now()
      tap(addBtn)
      await sleep(1600)
      clearInterval(tick)
      var opened = longest
      var modal = document.querySelector("[role=dialog][data-state=open], [data-mobile-bottom-sheet][aria-modal=true]")
      var cards = document.querySelectorAll("[data-library-card]")
      var cats = modal ? modal.querySelectorAll("button") : []
      var txt = modal ? (modal.innerText || "").replace(/\s+/g, " ").slice(0, 90) : "(no modal)"
      var st = { label: "ADD SECTION", cards: cards.length, openedIn: Math.round(opened), modal: modal ? describe(modal) : "none", text: txt }
      /**
       * A library with no sections in it is the bug as reported. The list is
       * never legitimately empty here: the thirty that ship are always
       * addable, so zero means it did not draw.
       */
      if (cards.length === 0) { st.brokenLibrary = true }
      steps.push(st)
      escape(); await sleep(600)
    } else {
      steps.push({ label: "ADD SECTION: no button found" })
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
  writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="app"></div><script>window.PROBE_SHORT=${process.env.SHORT_PAGE === "1"}</script>${SPY}<script src="editor-probe.js"></script>${DRIVE}</body></html>`)
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
    if (s.keptScroll !== undefined) {
      var kept = s.beforeTap > 0 && Math.abs(s.keptScroll - s.beforeTap) < 40 && Math.abs(s.lowest - s.beforeTap) < 40
      if (!kept) failures++
      console.log(`  ${kept ? "ok  " : "✗   "} ${s.label}: ${s.beforeTap} → ${s.keptScroll} (lowest ${s.lowest}, room ${s.room}, height ${s.heightBefore}→${s.heightAfter}, client ${s.clientAfter}${s.what ? ", tapped " + s.what + ", " + s.focused + ", at " + s.stillHere : ""})`)
      continue
    }
    if (s.keyboardRevived !== undefined) {
      if (!s.keyboardRevived) failures++
      console.log(`  ${s.keyboardRevived ? "ok  " : "✗   "} ${s.label}${s.keyboardRevived ? "" : ": nothing revived the canvas after the blur"}  window.scrollY=${s.windowScrollY}  ${s.field}`)
      continue
    }
    if (s.label === "ADD SECTION") {
      console.log(`  add-section library: ${s.cards} cards, longest blocked frame while opening: ${s.openedIn}ms`)
      if (s.brokenLibrary) { failures++; console.log(`  ✗ the Add section library drew NOTHING. Text was: ${JSON.stringify(s.text)}`) }
      continue
    }
    if (s.listeners) { console.log(`  touch listeners: ${[...new Set(s.listeners)].join("  |  ")}`); continue }
    if (s.labels) { console.log(`  chrome: ${s.labels.join(" | ")}\n  fetches: ${s.fetches.join(", ")}`); continue }
    if (s.missing || s.message || s.bodyText !== undefined) { console.log(`  ${s.label}: ${JSON.stringify(s)}`); continue }
    if (s.sections === undefined) { console.log(`  ${s.label}`); continue }
    const scrolled = s.askedFor !== undefined ? `  set ${s.askedFor} → ${s.scrollTop} ${s.took ? "OK" : "DID NOT TAKE"}` : ""
    console.log(`  ${s.label}: ${s.sections} sections, ${s.scrollHeight}/${s.clientHeight} (${s.canScroll ? "scrollable" : "NOT SCROLLABLE"}) overflow=${s.overflowY} box=${s.box}${scrolled}`)
    if (s.heldBySiteMenu) console.log(`      held still by the site's open menu, on purpose; a touch at the centre lands on ${s.centreOnSiteDrawer ? "the menu" : s.topAtCentre}`)
    if (s.backdrop) console.log(`      sheet backdrop: ${s.backdrop}`)
    if (s.touch) console.log(`      finger: ${s.touch.cancelled}/${s.touch.of} moves cancelled on ${s.touch.on}${s.touch.chain.length ? "  touch-action: " + s.touch.chain.join(", ") : ""}${s.touch.by && s.touch.by.length ? "\n      cancelled by: " + s.touch.by.join("\n                    ") : ""}`)
    console.log(`      touch at centre lands on ${s.topAtCentre}${s.centreInsideScroller ? "" : "  ← OUTSIDE THE CANVAS"}${s.pointerEventsNoneOn ? "  pointer-events:none on " + s.pointerEventsNoneOn : ""}${s.coveredBy.length ? "\n      covered by: " + s.coveredBy.join("; ") : ""}${s.ghosts && s.ghosts.length ? "\n      INVISIBLE AND TAKING TOUCHES: " + s.ghosts.join("; ") : ""}${s.sheetOpen ? "  sheet OPEN" : ""}${s.scrollLocked ? "  body[data-scroll-locked]" : ""}${s.openLayers && s.openLayers.length ? "\n      open layers: " + s.openLayers.join(", ") : ""}${s.bodyPE !== "-" ? "  body.pointer-events=" + s.bodyPE : ""}`)
  }
}

if (failures) fail(`${failures} step(s) left the canvas unscrollable by a person. A scroller a script can scroll and a person cannot is exactly the freeze.`)
console.log("\n  At both widths, after every path that has been reported, a person can still scroll the canvas.\n")
