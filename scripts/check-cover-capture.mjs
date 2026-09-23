/**
 * ===========================================================================
 *  THE WEBSITE PAGE'S COVER, AS THE EDITOR ACTUALLY TAKES IT
 * ===========================================================================
 * The cover is a photograph the editor takes of its own canvas after a save.
 * This takes one of a real page, through the real captureNode, and measures
 * the picture that comes out:
 *
 *   that there is one, and it is the size the card is drawn at
 *   that it is not blank, which is how html-to-image fails quietly
 *   that the photograph in the hero made it in — an image the capture could
 *     not inline comes out as an empty box, which is the likeliest way for a
 *     cover to be wrong while every other check on it passes
 *   that the header is the header's colour, so the picture is of THIS page
 *
 * And it writes the picture next to a screenshot of the page itself, so the
 * two can be looked at side by side rather than trusted.
 *
 *   pnpm build && node scripts/check-cover-capture.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
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

const out = mkdtempSync(join(tmpdir(), "storelib-cover-"))
const stubs = join(root, ".cover-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
/* The .storelib compiler hashes its source with node:crypto; in a browser a
   stable string hash is all it needs to key its cache. Same stub the other
   section probes use. */
writeFileSync(join(stubs, "crypto-stub.js"), `export function createHash() { let a = ""; return { update(s) { a += String(s); return this }, digest() { let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) | 0; return String(h >>> 0) } } }
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-cover-capture.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:node:crypto=${join(stubs, "crypto-stub.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<style>${css}</style><style>body{margin:0;background:#fff}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});window.process={env:{NODE_ENV:"production"}};` +
  /* The .storelib CSS step measures its output with Buffer.byteLength. The
     app's bundler supplies Buffer in the browser and esbuild does not, and
     without it every .storelib section threw and drew nothing — a hero at
     0px tall, a page of 68px, and no cover. That is the only Buffer call on
     the render path, so it is the only one given. */
  `window.Buffer={byteLength:function(s){return new TextEncoder().encode(String(s)).length}}</script>` +
  /* A FILE, NOT INLINE. The bundle carries the theme's own section sources,
     and one of them contains "<!--". Inside an inline script that puts the
     HTML parser into its escaped-script state, the script is never run as
     written, and the page loaded empty and threw nothing: the probe had
     nothing to photograph and no error to say why. */
  `<script src="probe.js"></script></body></html>`)

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
const ev = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`Evaluating threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}`)
  return r.result.value
}

await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
await call("Page.navigate", { url: "file://" + file })
await sleep(2500)

await sleep(1500)
const errs = await ev("JSON.stringify(window.__err || [])")
if (JSON.parse(errs).length) fail(`The page threw before it could be photographed:\n  ${errs}`)

/* The page itself, for comparison, cut to the same top 16:10 the capture takes. */
const pageShot = await call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 750, scale: 1 } })
writeFileSync(join(root, ".probe-cover-page.png"), Buffer.from(pageShot.data, "base64"))

if (await ev("typeof window.__capture") !== "function") {
  fail(`The fixture never finished loading, so there was nothing to photograph:\n  ${await ev("JSON.stringify({ err: window.__err, body: document.body.innerHTML.slice(0, 300) })")}`)
}
const cap = await ev("window.__capture()")
if (!cap) fail(`captureNode returned nothing. The editor swallows that, so a cover would simply never appear.\n  ${await ev("window.__why()")}`)

/* Draw a captured picture into the page and read it back: its size, and
   pixels from the places that say whether it is this page at all. */
const readPicture = async (dataUrl) => JSON.parse(await ev(`(async () => {
  const img = new Image()
  img.src = ${JSON.stringify(dataUrl)}
  await img.decode()
  const c = document.createElement("canvas")
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext("2d")
  g.drawImage(img, 0, 0)
  const px = (x, y) => Array.from(g.getImageData(Math.round(x * c.width), Math.round(y * c.height), 1, 1).data)
  /* Spread: a blank capture is one colour everywhere. */
  const samples = []
  for (let i = 0; i < 64; i++) samples.push(px((i % 8 + 0.5) / 8, (Math.floor(i / 8) + 0.5) / 8))
  const lum = samples.map(([r, g2, b]) => 0.2126 * r + 0.7152 * g2 + 0.0722 * b)
  const mean = lum.reduce((a, b) => a + b, 0) / lum.length
  const spread = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length)

  /* Where the photograph and the header actually are, in the LIVE page,
     as fractions of the captured region, so the lookup is not a guess. */
  const node = document.getElementById("canvas").getBoundingClientRect()
  const photo = document.querySelector("#canvas img")?.getBoundingClientRect()
  /* The top band of the page. The header renders neither a <header> element
     nor the section wrapper that carries data-section-type — it takes its
     id itself so position: sticky has the right containing block — and two
     versions of this looked for one of those, found nothing, and reported
     the header missing from a picture it was plainly in. A page's header is
     at its top by definition, so that is where this reads. */
  const header = { top: document.getElementById("canvas").getBoundingClientRect().top + 4, height: 24 }
  const H = Math.min(node.height, node.width / 1.6)
  const at = (r) => r ? [(r.left + r.width / 2 - node.left) / node.width, (r.top + r.height / 2 - node.top) / H] : null
  const photoAt = at(photo)
  const headerAt = header ? [0.02, (header.top + header.height / 2 - node.top) / H] : null

  return JSON.stringify({
    w: img.naturalWidth, h: img.naturalHeight, spread: Math.round(spread),
    photoAt, headerAt,
    photoPx: photoAt ? px(...photoAt) : null,
    headerPx: headerAt ? px(...headerAt) : null,
    /* The heading's ink. Dark text at full strength, not a fade of it. */
    headingPx: (() => {
      const h = [...document.querySelectorAll("#canvas h1, #canvas h2")].find((e) => /Made by hand/.test(e.textContent || ""))
      if (!h) return null
      const hr = h.getBoundingClientRect()
      /* Darkest pixel across the heading's first line, which is where its ink is. */
      let best = null
      for (let x = hr.left + 4; x < hr.left + Math.min(hr.width, 400); x += 3) {
        const p = px((x - node.left) / node.width, (hr.top + 18 - node.top) / H)
        if (!best || p[0] + p[1] + p[2] < best[0] + best[1] + best[2]) best = p
      }
      return best
    })(),
  })
})()`))
const r = await readPicture(cap.dataUrl)

/* And the same page again, through the stage the editor now photographs. */
const staged = await ev("window.__stageCapture()")
if (!staged) fail("The stage produced no picture: the editor would upload nothing after a save.")
const st = await readPicture(staged.dataUrl)

/* Show the capture as a picture too. */
await ev(`(() => { document.body.innerHTML = '<img id="shot" src=' + JSON.stringify(${JSON.stringify(cap.dataUrl)}) + ' style="display:block">'; return true })()`)
await sleep(300)
const capShot = await call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: r.w, height: r.h, scale: 1 } })
writeFileSync(join(root, ".probe-cover-capture.png"), Buffer.from(capShot.data, "base64"))
await ev(`(() => { document.getElementById("shot").src = ${JSON.stringify(staged.dataUrl)}; return true })()`)
await sleep(300)
const stShot = await call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: st.w, height: st.h, scale: 1 } })
writeFileSync(join(root, ".probe-cover-stage.png"), Buffer.from(stShot.data, "base64"))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}
const near = (a, b, tol = 40) => a && b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol

console.log(`\nThe cover, as captureNode takes it\n`)
console.log(`  ${cap.type}, ${Math.round(cap.bytes / 1024)}KB, ${r.w}x${r.h}`)
console.log(`  header pixel ${JSON.stringify(r.headerPx)}, photo pixel ${JSON.stringify(r.photoPx)}, spread ${r.spread}\n`)

expect(cap.bytes > 0, "a picture came out")
expect(cap.type === "image/webp", "as WebP, which is what the route and the card expect", cap.type)
expect(cap.bytes <= 2 * 1024 * 1024, "small enough for the route to take", `${Math.round(cap.bytes / 1024)}KB`)
/*
  FULL WIDTH, AND NEVER TALLER THAN THE CARD. captureNode takes the top of
  the page at 16:10 or the whole page if it is shorter than that, and this
  page is: 649px. The first version of this demanded exactly 1200x750 and
  failed a picture that was correct. The card draws with object-cover, so a
  shorter picture fills it the same way the page would.
*/
expect(r.w === 1200 && r.h <= 750 && r.h >= 120, "at the card's width, and no taller than its shape", `${r.w}x${r.h}`)
expect(r.spread > 10, "and it is not blank", `luminance spread ${r.spread}`)
/*
  THE HEADER IS THIS PAGE'S HEADER. Coral, #FF6B6B. A capture of the wrong
  thing, or of the page before its scheme applied, fails here.
*/
expect(near(r.headerPx, [255, 107, 107]), "the header in it is the page's own coral", JSON.stringify(r.headerPx))
/*
  AND THE PHOTOGRAPH MADE IT IN. An image html-to-image cannot inline comes
  out as an empty box: the likeliest way for a cover to be wrong while it is
  the right size, not blank, and of the right page. The fixture's photograph
  is an amber gradient, so its middle is a brown nothing else on the page is.
*/
expect(!!r.photoPx && r.photoPx[0] > 110 && r.photoPx[0] < 200 && r.photoPx[2] < 90,
  "and the hero's photograph is in it, not an empty box", JSON.stringify(r.photoPx))

console.log(`\nThe cover, as the editor now takes it: from a fresh stage, straight away\n`)
console.log(`  ${staged.type}, ${Math.round(staged.bytes / 1024)}KB, ${st.w}x${st.h}, ${staged.ms}ms from mount to picture`)
console.log(`  header ${JSON.stringify(st.headerPx)}, heading ink ${JSON.stringify(st.headingPx)}, photo ${JSON.stringify(st.photoPx)}\n`)
expect(st.w === 1200 && st.h <= 750 && st.h >= 120, "the stage's picture is the card's width", `${st.w}x${st.h}`)
expect(near(st.headerPx, [255, 107, 107]), "its header is the page's coral", JSON.stringify(st.headerPx))
/*
  NOT FADED. The stage is photographed the moment it is ready, and freshly
  mounted every section is playing the theme's entrance from opacity 0.
  html-to-image copies computed styles, so a section caught half way in comes
  out half transparent. The heading is near-black ink at full strength; a
  fade of it on white is grey.
*/
expect(!!st.headingPx && st.headingPx[0] + st.headingPx[1] + st.headingPx[2] < 150,
  "and its heading is at full strength, not caught half way through fading in", JSON.stringify(st.headingPx))
expect(!!st.photoPx && st.photoPx[0] > 110 && st.photoPx[0] < 200 && st.photoPx[2] < 90,
  "and the photograph is in it, decoded before the picture was taken", JSON.stringify(st.photoPx))
/*
  AND IT IS CHEAP ENOUGH TO DO AFTER EVERY SAVE. It runs when the browser is
  idle, seconds after the save, and none of it is on a path a person is
  waiting on; but it runs on phones, so it has a budget.
*/
expect(staged.ms < 3000, "and it takes a few hundred milliseconds, not seconds", `${staged.ms}ms`)

console.log(`\n  pictures → .probe-cover-page.png (the page), .probe-cover-capture.png and .probe-cover-stage.png\n`)
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The cover is a picture of the page, with its photograph in it.\n")
