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
 *   pnpm build && node scripts/check-ask-attach.mjs   (add KEEP_SHOT=1)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

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
  function attachButton() { return document.querySelector('button[aria-label="Attach a picture"]') }

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
      composerHeight: box(field.closest("div.rounded-xl")) ? box(field.closest("div.rounded-xl")).h : null,
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
      function settle() {
        var thumb = document.querySelector('img[alt="screenshot.png"]')
        if (!thumb && waited++ < 600) { setTimeout(settle, 10); return }
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
    var composer = field.closest("div.rounded-xl")

    var result = {
      before: before,
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

    /* And taking it back off leaves the composer as it was. */
    if (remove && !window.__hold) remove.click()
    setTimeout(function () {
      result.afterRemove = {
        thumbs: document.querySelectorAll('img[alt="screenshot.png"]').length,
        sendDisabled: sendButton() ? sendButton().disabled : null,
        composerHeight: box(field.closest("div.rounded-xl")) ? box(field.closest("div.rounded-xl")).h : null,
      }
      report(result)
    }, 60)
  }
  waitForComposer()
})()
</script>`

const file = join(out, "index.html")
const page = (hold) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>
  body{margin:0;background:#f8f9fa;font-family:Inter,system-ui,sans-serif}
  #app{padding:16px}
</style></head><body><div id="app"></div>${hold ? "<script>window.__hold=true</script>" : ""}<script src="probe.js"></script>${DRIVE}</body></html>`
writeFileSync(file, page(false))
/** The same run with the picture left on, for looking at. */
const held = join(out, "held.html")
writeFileSync(held, page(true))

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=420,720", "--virtual-time-budget=12000", "--run-all-compositor-stages-before-draw",
  "--dump-dom", `file://${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) fail("The composer never reported. Nothing was measured.")
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
const r = JSON.parse(decode(m[1]))
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
console.log(`  pasted screenshot: thumbnail ${r.thumb ? `${r.thumb.w}x${r.thumb.h}px` : "NOT DRAWN"}, decoded: ${r.thumbLoaded}, from a data URL: ${r.thumbSrcIsData}`)
console.log(`  the file was ${(r.sourceBytes / 1024 / 1024).toFixed(2)}MB; what will be posted is ${(r.sentBytes / 1024).toFixed(0)}KB of ${r.sentType}, longest edge ${r.sentLongEdge}px`)
console.log(`  its cross: ${r.remove ? `${r.remove.w}x${r.remove.h}px drawn, ${r.target}px to a thumb` : "MISSING"}, a press on it ${r.hitIsRemove ? "lands on the cross" : `lands on ${r.hitWas ?? "nothing"}`}`)
console.log(`  Send: ${r.before.sendDisabledEmpty ? "off" : "on"} with nothing, ${r.sendDisabledWithPicture ? "OFF" : "on"} with a picture and no words`)
console.log(`  composer: ${r.before.composerHeight}px empty, ${r.composerHeight}px holding a picture, ${r.afterRemove.composerHeight}px after taking it off`)
console.log(`  placeholder while holding one: "${r.placeholder}"`)

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
if (r.afterRemove.thumbs !== 0) problems.push("the thumbnail survives being removed")
if (r.afterRemove.sendDisabled !== true) problems.push("Send stays live after the last picture is taken off")
if (r.afterRemove.composerHeight !== r.before.composerHeight) problems.push(`the composer does not return to its own height: ${r.before.composerHeight}px then ${r.afterRemove.composerHeight}px`)

if (problems.length) { console.error("\n" + problems.map((p) => `  ${p}`).join("\n") + "\n"); process.exit(1) }
console.log("\na screenshot pasted into Ask Storelib appears as a thumbnail you can take back off, and a picture on its own is enough to send.")
