/**
 * ===========================================================================
 *  ATTACHING A PICTURE TO ASK STORELIB, LOOKED AT
 * ===========================================================================
 * "Attach a photo in Ask Storelib and tell it to build a section like the one
 * in the image." tests/agent-attachments.test.ts proves the picture reaches
 * the model. This is the other half: whether a person can put one there.
 *
 * The composer is mounted in Chromium, a real PNG is pasted into it the way
 * a screenshot arrives, and the result is measured — the attach control, the
 * thumbnail, the cross that takes it back off, and whether Send is alive with
 * a picture and nothing typed.
 *
 * And "attaching an image adds it twice": one picture chosen in the picker,
 * pasted and dropped on the composer in the same moment must be ONE
 * thumbnail, on the phone's sheet and on the computer's dock, and the same
 * pixels again under another name must still be one.
 *
 *   pnpm build && node scripts/check-ask-attach.mjs   (add KEEP_SHOT=1)
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
/* The build's stylesheet, or the same one compiled from source (PROBE_CSS=source). */
const css = await appCss(root)

const stubs = join(root, ".wb-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/probe-install"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({ installId: "probe-install" })
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\n`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"\nexport default function Image({ src, alt, ...rest }) { const { fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...ok } = rest; return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...ok }) }\n`)
writeFileSync(join(stubs, "supabase-client.js"), `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? undefined : chain, apply: () => chain() })
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
    storage: { from: () => ({ upload: async () => ({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    from: () => chain(), channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {} }
}
`)
/* Next's own useLinkStatus lives with Link, not with the database client. */
writeFileSync(join(stubs, "link.jsx"), `import React from "react"\nexport default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }\nexport const useLinkStatus = () => ({ pending: false })\n`)

const out = mkdtempSync(join(tmpdir(), "storelib-attach-"))
const bundle = join(out, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-ask-attach.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
  `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/image=${join(stubs, "image.jsx")}`, `--alias:@/lib/supabase/client=${join(stubs, "supabase-client.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/**
 * A 4x4 red PNG. A real file, so the browser decodes it and the thumbnail is
 * an image rather than a broken one.
 */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFElEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC"

/** No regex literals: a backslash inside a template literal is eaten. */
const DRIVE = `
<script>
(function () {
  var report = function (o) { var pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(o); document.body.append(pre) }
  function box(el) { if (!el) return null; var r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } }
  function visible(el) {
    if (!el) return false
    var cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false
    for (var n = el; n; n = n.parentElement) if (getComputedStyle(n).pointerEvents === "none") return false
    return true
  }
  function sendButton() {
    var all = document.querySelectorAll("button[aria-label]")
    for (var i = 0; i < all.length; i++) { var l = all[i].getAttribute("aria-label"); if (l === "Send" || l === "Queue") return all[i] }
    return null
  }
  function attachButton() { return document.querySelector('button[aria-label="Attach pictures or a video"]') }

  function bytes(b64) { var bin = atob(b64); var a = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a }

  var tries = 0
  function waitForComposer() {
    var field = document.querySelector("textarea")
    if (!field && tries++ < 400) { setTimeout(waitForComposer, 10); return }
    if (!field) { report({ error: "no composer after 4s" }); return }
    step2(field)
  }

  function step2(field) {
    var before = {
      attach: box(attachButton()),
      attachVisible: visible(attachButton()),
      sendDisabledEmpty: sendButton() ? sendButton().disabled : null,
      composerHeight: box(field.closest("[data-chat-composer]")) ? box(field.closest("[data-chat-composer]")).h : null,
    }

    /**
     * A 3000x2000 screenshot, the size a laptop actually takes one at, drawn
     * with detail so it does not compress to nothing. This is the picture
     * the shrink has to deal with: at full size its base64 is larger than
     * the platform will carry.
     */
    var c = document.createElement("canvas")
    c.width = 3000; c.height = 2000
    var g = c.getContext("2d")
    for (var i = 0; i < 3000; i += 6) { g.fillStyle = "hsl(" + (i % 360) + ",70%,55%)"; g.fillRect(i, 0, 5, 2000) }
    g.fillStyle = "#111"; g.font = "bold 90px sans-serif"
    for (var k = 0; k < 12; k++) g.fillText("Pricing that makes sense " + k, 60, 160 + k * 150)
    c.toBlob(function (blob) {
      window.__sourceBytes = blob.size
      var file = new File([blob], "screenshot.png", { type: "image/png" })
      var dt = new DataTransfer()
      dt.items.add(file)
      field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))
      var waited = 0
      /* The thumbnail is drawn from the file at once, and holds the prepared picture (a data URL) once it is ready. */
      window.__firstThumbAt = 0
      var t0 = performance.now()
      function settle() {
        if (!window.__firstThumbAt && document.querySelector("[data-ask-thumb] img")) window.__firstThumbAt = Math.round(performance.now() - t0)
        var thumb = document.querySelector('[data-ask-thumb][data-state="ready"] img')
        if ((!thumb || thumb.src.slice(0, 5) !== "data:") && waited++ < 600) { setTimeout(settle, 10); return }
        step3(field, before, thumb)
      }
      setTimeout(settle, 10)
    }, "image/png")
  }

  function step3(field, before, thumb) {
    var remove = document.querySelector('button[aria-label="Remove screenshot.png"]')
    var send = sendButton()
    var rb = box(remove)
    /* Is the cross actually the thing under a thumb at that point? */
    var owns = function (el) { return !!(el && remove && (el === remove || remove.contains(el))) }
    var hit = rb ? document.elementFromPoint(rb.x, rb.y) : null
    var hitIsRemove = owns(hit)
    /**
     * The size of the thing a THUMB hits, which is not the size of the thing
     * an eye sees. Walked out from the centre until the press stops landing
     * on the cross.
     */
    var reach = 0
    if (rb) { for (var d = 0; d <= 24; d++) { if (!owns(document.elementFromPoint(rb.x + d, rb.y)) || !owns(document.elementFromPoint(rb.x, rb.y + d))) break; reach = d } }
    var composer = field.closest("[data-chat-composer]")

    var slot = document.querySelector("[data-ask-thumb]")
    var result = {
      before: before,
      thumbState: slot ? slot.getAttribute("data-state") : null,
      firstThumbMs: window.__firstThumbAt || null,
      attachError: (document.querySelector("[data-ask-attach-error]") || {}).textContent || null,
      thumb: box(thumb),
      thumbLoaded: thumb ? (thumb.naturalWidth > 0) : false,
      thumbSrcIsData: thumb ? thumb.src.slice(0, 11) === "data:image/" : false,
      /** What the file was, and what is actually about to be posted. */
      sourceBytes: window.__sourceBytes || 0,
      sentBytes: thumb ? Math.round((thumb.src.length - thumb.src.indexOf(",") - 1) * 0.75) : 0,
      sentType: thumb ? thumb.src.slice(5, thumb.src.indexOf(";")) : null,
      sentLongEdge: thumb ? Math.max(thumb.naturalWidth, thumb.naturalHeight) : 0,
      remove: rb,
      removeVisible: visible(remove),
      hitIsRemove: hitIsRemove,
      hitWas: hit ? hit.tagName.toLowerCase() : null,
      /** Doubled: reach is measured from the centre outwards. */
      target: rb ? reach * 2 : 0,
      sendDisabledWithPicture: send ? send.disabled : null,
      composerHeight: box(composer) ? box(composer).h : null,
      placeholder: field.getAttribute("placeholder"),
      fileInput: (function () { var i = document.querySelector('input[type="file"]'); return i ? { accept: i.getAttribute("accept"), multiple: i.multiple, shown: visible(i) } : null })(),
    }

    /*
     * THE VIEWER. Click the thumbnail, and see whether a picture you can
     * actually look at appears — bigger than the thumbnail, on top of
     * everything, and gone again on Escape.
     */
    var opener = document.querySelector('button[aria-label="Open screenshot.png"]')
    if (opener) opener.click()
    setTimeout(function () {
      var layer = document.querySelector('[role="dialog"][aria-label="screenshot.png"]')
      var big = layer ? layer.querySelector("img") : null
      var bb = box(big)
      var lb = box(layer)
      result.viewer = {
        opened: !!layer,
        covers: lb ? lb.w >= window.innerWidth - 1 && lb.h >= window.innerHeight - 1 : false,
        opacity: layer ? Number(getComputedStyle(layer).opacity) : 0,
        zIndex: layer ? getComputedStyle(layer).zIndex : null,
        picture: bb,
        /* Does it fit, rather than overflow the screen it is shown on? */
        fits: bb ? bb.w <= window.innerWidth && bb.h <= window.innerHeight : false,
        copy: !!(layer && layer.querySelector('button[aria-label="Copy the picture"]')),
        save: !!(layer && layer.querySelector('button[aria-label="Save the picture"]')),
        /* Nothing may be written to the body: that is what froze this editor before. */
        bodyPointerEvents: document.body.style.pointerEvents || "(unset)",
        bodyOverflow: document.body.style.overflow || "(unset)",
        scrollLocked: document.body.hasAttribute("data-scroll-locked"),
      }
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      setTimeout(function () {
        result.viewer.closedOnEscape = !document.querySelector('[role="dialog"][aria-label="screenshot.png"]')
        result.viewer.bodyAfter = (document.body.style.pointerEvents || "(unset)") + "/" + (document.body.style.overflow || "(unset)")
        step4(field, result)
      }, 250)
    }, 260)
  }

  function step4(field, result) {
    /*
     * A FILE IN THE AIR. dragenter with a Files type should put a target on
     * the panel; without one the gesture is undiscoverable.
     */
    var panel = field.closest("div.relative.flex.h-full")
    var dt2 = new DataTransfer()
    try { dt2.items.add(new File([new Uint8Array([1])], "x.png", { type: "image/png" })) } catch (e) {}
    var enter = new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt2 })
    ;(panel || document.body).dispatchEvent(enter)
    setTimeout(function () {
      /*
       * BY ITS OWN ATTRIBUTE. Searching for the text matched the PANEL, whose
       * textContent also starts with it because the target is its first
       * child — querySelectorAll returns document order, so the ancestor won
       * and the probe reported the panel's pointer-events as the target's.
       */
      var target = document.querySelector("[data-drop-target]")
      var tb = box(target)
      result.dropTarget = {
        shown: !!target,
        size: tb,
        /* It must not eat the drop it is advertising. */
        pointerEvents: target ? getComputedStyle(target).pointerEvents : null,
      }
      /* And it goes away again when the file leaves. */
      ;(panel || document.body).dispatchEvent(new DragEvent("dragleave", { bubbles: true, cancelable: true, dataTransfer: dt2 }))
      setTimeout(function () {
        result.dropTarget.goesAway = !document.querySelector("[data-drop-target]")

        var remove = document.querySelector('button[aria-label="Remove screenshot.png"]')
        if (remove && !window.__hold) remove.click()
        setTimeout(function () {
          result.afterRemove = {
            thumbs: document.querySelectorAll('img[alt="screenshot.png"]').length,
            sendDisabled: sendButton() ? sendButton().disabled : null,
            composerHeight: box(field.closest("[data-chat-composer]")) ? box(field.closest("[data-chat-composer]")).h : null,
          }
          if (window.__hold) { report(result); return }
          step5(field, function (simul) { result.simultaneous = simul; report(result) })
        }, 60)
      }, 120)
    }, 120)
  }

  /*
   * ONE PICTURE, THREE WAYS, ONE MOMENT. The same file chosen in the picker,
   * pasted into the box and dropped on the composer, all before the page has
   * drawn again: exactly one thumbnail. Then the same pixels again under
   * another name: still one, known by what it is rather than what it is
   * called.
   */
  function step5(field, done) {
    var c = document.createElement("canvas")
    c.width = 320; c.height = 200
    var g = c.getContext("2d")
    g.fillStyle = "#123456"; g.fillRect(0, 0, 320, 200)
    g.fillStyle = "#fcd116"; g.fillRect(107, 0, 106, 200)
    c.toBlob(function (blob) {
      var file = new File([blob], "same.png", { type: "image/png", lastModified: 1760000000000 })
      var input = document.querySelector('input[type="file"][multiple]')
      var dt1 = new DataTransfer(); dt1.items.add(file)
      input.files = dt1.files
      var dt2 = new DataTransfer(); dt2.items.add(file)
      var dt3 = new DataTransfer(); dt3.items.add(file)
      var composer = field.closest("[data-chat-composer]")
      input.dispatchEvent(new Event("change", { bubbles: true }))
      field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt2, bubbles: true, cancelable: true }))
      composer.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt3 }))
      var settled = function (then) {
        var tries = 0
        ;(function wait() {
          var busy = document.querySelector('[data-ask-thumb][data-state="preparing"]')
          if (busy && tries++ < 600) { setTimeout(wait, 10); return }
          setTimeout(then, 60)
        })()
      }
      settled(function () {
        var three = document.querySelectorAll("[data-ask-thumb]").length
        var copy = new File([blob], "copy of same.png", { type: "image/png", lastModified: 1760000099999 })
        var dt4 = new DataTransfer(); dt4.items.add(copy)
        field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt4, bubbles: true, cancelable: true }))
        settled(function () {
          done({ threeWays: three, samePixelsAgain: document.querySelectorAll("[data-ask-thumb]").length })
        })
      })
    }, "image/png")
  }
  if (window.__only === "simultaneous") {
    var t = 0
    ;(function find() {
      var f = document.querySelector("textarea")
      if (!f && t++ < 400) { setTimeout(find, 10); return }
      if (!f) { report({ error: "no composer after 4s" }); return }
      step5(f, function (simul) { report({ simultaneous: simul }) })
    })()
    return
  }
  waitForComposer()
})()
</script>`

const file = join(out, "index.html")
const page = (hold, only) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}
  #app{padding:16px}
  /*
   * NO TRANSITIONS IN HERE. Headless Chromium under --virtual-time-budget
   * never advances one, so anything that fades in reads as opacity 0 for
   * ever and every fading layer looks like a bug. What this probe is for is
   * the SETTLED state: is the viewer visible once it has opened. The motion
   * itself is not measurable here and is not claimed to be.
   */
  *,*::before,*::after{transition-duration:0s!important;animation-duration:0s!important}
</style></head><body><div id="app"></div>${hold ? "<script>window.__hold=true</script>" : ""}${only ? `<script>window.__only=${JSON.stringify(only)}</script>` : ""}<script src="probe.js"></script>${DRIVE}</body></html>`
writeFileSync(file, page(false))
/** The same run with the picture left on, for looking at. */
const held = join(out, "held.html")
writeFileSync(held, page(true))
/** The computer's dock, for the one picture, three ways count. */
const dockPage = join(out, "dock.html")
writeFileSync(dockPage, page(false, "simultaneous"))

/*
  IN REAL TIME. This ran under --virtual-time-budget with --dump-dom, and a
  picture is now made ready off the main thread (createImageBitmap,
  convertToBlob): virtual time runs its whole budget while the decode is
  still going, and the page was dumped before any picture was ready. The
  drive script is unchanged; puppeteer loads it and waits for its report.
*/
const { default: puppeteer } = await import("puppeteer-core")
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
let r
try {
  const tab = await browser.newPage()
  await tab.setViewport({ width: 420, height: 720 })
  await tab.goto(`file://${file}`)
  const found = await tab.waitForSelector("#result", { timeout: 30000 }).catch(() => null)
  if (!found) fail("The composer never reported. Nothing was measured.")
  r = JSON.parse(await tab.$eval("#result", (e) => e.textContent))
  /* The dock: the same three ways at once, counted on the computer's shape. */
  const dockTab = await browser.newPage()
  await dockTab.setViewport({ width: 1100, height: 760 })
  await dockTab.goto(`file://${dockPage}#dock`)
  const dockFound = await dockTab.waitForSelector("#result", { timeout: 30000 }).catch(() => null)
  r.dock = dockFound ? JSON.parse(await dockTab.$eval("#result", (e) => e.textContent)) : { error: "the dock never reported" }
} finally {
  await browser.close()
}
if (r.error) fail(r.error)

if (process.env.KEEP_SHOT) {
  execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
    "--window-size=420,720", "--virtual-time-budget=12000",
    `--screenshot=${join(root, ".wb-probe/ask-attach.png")}`, "--screenshot-full-page", `file://${held}`],
    { stdio: ["ignore", "ignore", "ignore"] })
  console.log("  shot: .wb-probe/ask-attach.png")
}

console.log(`  attach control: ${r.before.attach ? `${r.before.attach.w}x${r.before.attach.h}px` : "MISSING"}, ${r.before.attachVisible ? "reachable" : "NOT reachable"}`)
console.log(`  file input: ${r.fileInput ? `accept=${r.fileInput.accept} multiple=${r.fileInput.multiple} hidden=${!r.fileInput.shown}` : "MISSING"}`)
console.log(`  pasted screenshot: drawn after ${r.firstThumbMs ?? "?"}ms, state ${r.thumbState}${r.attachError ? ` (${r.attachError})` : ""}; ready: ${r.thumb ? `${r.thumb.w}x${r.thumb.h}px` : "NOT DRAWN"}, decoded: ${r.thumbLoaded}, from a data URL: ${r.thumbSrcIsData}`)
console.log(`  the file was ${(r.sourceBytes / 1024 / 1024).toFixed(2)}MB; what will be posted is ${(r.sentBytes / 1024).toFixed(0)}KB of ${r.sentType}, longest edge ${r.sentLongEdge}px`)
console.log(`  its cross: ${r.remove ? `${r.remove.w}x${r.remove.h}px drawn, ${r.target}px to a thumb` : "MISSING"}, a press on it ${r.hitIsRemove ? "lands on the cross" : `lands on ${r.hitWas ?? "nothing"}`}`)
console.log(`  Send: ${r.before.sendDisabledEmpty ? "off" : "on"} with nothing, ${r.sendDisabledWithPicture ? "OFF" : "on"} with a picture and no words`)
console.log(`  composer: ${r.before.composerHeight}px empty, ${r.composerHeight}px holding a picture, ${r.afterRemove.composerHeight}px after taking it off`)
console.log(`  placeholder while holding one: "${r.placeholder}"`)
console.log(`  viewer: ${r.viewer.opened ? "opens" : "DID NOT OPEN"}, covers the screen: ${r.viewer.covers}, picture ${r.viewer.picture ? `${r.viewer.picture.w}x${r.viewer.picture.h}px` : "none"}, fits: ${r.viewer.fits}, closes on Escape: ${r.viewer.closedOnEscape}`)
console.log(`  viewer left on body: ${r.viewer.bodyAfter} (scroll-locked while open: ${r.viewer.scrollLocked})`)
console.log(`  drop target: ${r.dropTarget.shown ? `${r.dropTarget.size.w}x${r.dropTarget.size.h}px, pointer-events ${r.dropTarget.pointerEvents}` : "NEVER SHOWN"}, goes away again: ${r.dropTarget.goesAway}`)
const simul = r.simultaneous ?? {}
const dockSimul = r.dock?.simultaneous ?? {}
console.log(`  one picture by the picker, a paste and a drop at once: ${simul.threeWays ?? "?"} thumbnail(s) on the phone's sheet, ${dockSimul.threeWays ?? "?"} on the computer's dock${r.dock?.error ? ` (${r.dock.error})` : ""}`)
console.log(`  the same pixels again under another name: ${simul.samePixelsAgain ?? "?"} on the sheet, ${dockSimul.samePixelsAgain ?? "?"} on the dock`)

const problems = []
if (!r.before.attach) problems.push("there is no attach control in the composer")
else if (!r.before.attachVisible) problems.push("the attach control is in the markup but cannot be pressed")
else if (r.before.attach.w < 24 || r.before.attach.h < 24) problems.push(`the attach control is ${r.before.attach.w}x${r.before.attach.h}px, too small to hit`)
if (!r.fileInput) problems.push("there is no file input behind it")
else {
  if (r.fileInput.shown) problems.push("the file input is drawn rather than hidden behind the button")
  if (!r.fileInput.multiple) problems.push("only one file can be chosen at a time")
  if (!/image\/png/.test(r.fileInput.accept ?? "")) problems.push(`the picker offers "${r.fileInput.accept}", which does not include PNG`)
}
if (!r.thumb) problems.push("a pasted screenshot draws no thumbnail: paste is not reaching the composer")
else {
  if (!r.thumbLoaded) problems.push("the thumbnail is there but the browser could not decode it")
  if (!r.thumbSrcIsData) problems.push("the thumbnail is not drawn from the bytes in hand, so something is being fetched")
  if (r.thumb.w < 40 || r.thumb.h < 40) problems.push(`the thumbnail is ${r.thumb.w}x${r.thumb.h}px, too small to recognise`)
}
/**
 * The platform caps this request at 4.5MB and base64 is a third larger than
 * the file. A 3000px screenshot that is not shrunk fails on the wire.
 */
if (!r.sourceBytes) problems.push("the probe never made a source file, so nothing about shrinking was measured")
else {
  if (r.sentLongEdge > 1568) problems.push(`the picture is still ${r.sentLongEdge}px on its longest edge: it is not being shrunk`)
  if (r.sentBytes * (4 / 3) > 3 * 1024 * 1024) problems.push(`${(r.sentBytes / 1024 / 1024).toFixed(2)}MB would be posted, which the platform will not carry`)
  if (r.sentBytes >= r.sourceBytes) problems.push(`shrinking made it bigger: ${r.sourceBytes} bytes became ${r.sentBytes}`)
}
if (!r.remove) problems.push("an attached picture cannot be taken back off")
else if (!r.hitIsRemove) problems.push(`a press on the cross lands on ${r.hitWas} instead of the cross`)
else if (r.target < 32) problems.push(`the cross is only ${r.target}px to a thumb, which is a target people miss`)
if (r.before.sendDisabledEmpty !== true) problems.push("Send is live with an empty composer")
if (r.sendDisabledWithPicture !== false) problems.push("Send is still off with a picture attached: a picture alone cannot be sent")
/* The viewer */
if (!r.viewer.opened) problems.push("clicking a thumbnail opens nothing")
else {
  if (!r.viewer.covers) problems.push("the viewer does not cover the screen, so the picture competes with the page behind it")
  if (r.viewer.opacity < 0.9) problems.push(`the viewer settled at opacity ${r.viewer.opacity}: it faded in and stopped`)
  if (!r.viewer.picture || r.viewer.picture.w <= 56) problems.push("the viewer shows the picture no bigger than the thumbnail did")
  if (!r.viewer.fits) problems.push(`the picture is ${r.viewer.picture.w}x${r.viewer.picture.h}px in a ${window ? "" : ""}screen it does not fit`)
  if (!r.viewer.copy || !r.viewer.save) problems.push("the viewer has no Copy or no Save")
  if (!r.viewer.closedOnEscape) problems.push("Escape does not close the viewer")
  /*
   * THE FREEZE THIS EDITOR KEEPS GETTING. Every modal layer that wrote to
   * the body left it locked at some point. This one must write nothing.
   */
  if (r.viewer.bodyPointerEvents !== "(unset)") problems.push(`the viewer set body pointer-events to ${r.viewer.bodyPointerEvents}`)
  if (r.viewer.bodyOverflow !== "(unset)") problems.push(`the viewer set body overflow to ${r.viewer.bodyOverflow}`)
  if (r.viewer.scrollLocked) problems.push("the viewer scroll-locked the document, which is how the editor froze before")
  if (r.viewer.bodyAfter !== "(unset)/(unset)") problems.push(`the viewer left ${r.viewer.bodyAfter} on the body after closing`)
}
/* The drop target */
if (!r.dropTarget.shown) problems.push("dragging a file over the panel shows no drop target")
else {
  if (r.dropTarget.pointerEvents !== "none") problems.push(`the drop target has pointer-events ${r.dropTarget.pointerEvents}, so it can swallow the drop it is advertising`)
  if (r.dropTarget.size.w < 100 || r.dropTarget.size.h < 100) problems.push("the drop target is too small to read")
  if (!r.dropTarget.goesAway) problems.push("the drop target stays after the file leaves the panel")
}
if (r.afterRemove.thumbs !== 0) problems.push("the thumbnail survives being removed")
/* "Attaching an image adds it twice." */
if (simul.threeWays !== 1) problems.push(`one picture attached three ways at once made ${simul.threeWays} thumbnails on the sheet`)
if (dockSimul.threeWays !== 1) problems.push(`one picture attached three ways at once made ${dockSimul.threeWays} thumbnails on the dock`)
if (simul.samePixelsAgain !== 1) problems.push(`the same pixels under another name made ${simul.samePixelsAgain} thumbnails on the sheet`)
if (dockSimul.samePixelsAgain !== 1) problems.push(`the same pixels under another name made ${dockSimul.samePixelsAgain} thumbnails on the dock`)
if (r.afterRemove.sendDisabled !== true) problems.push("Send stays live after the last picture is taken off")
if (r.afterRemove.composerHeight !== r.before.composerHeight) problems.push(`the composer does not return to its own height: ${r.before.composerHeight}px then ${r.afterRemove.composerHeight}px`)

if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n") + "\n"); process.exit(1) }
console.log("\na screenshot pasted into Ask Storelib appears as a thumbnail you can open full size, copy, save and take back off; a picture on its own is enough to send; and a file dragged over the panel says what dropping it will do.")
