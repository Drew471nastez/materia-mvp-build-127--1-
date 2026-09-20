/**
 * ===========================================================================
 *  THE LOGO IS THE SAME FONT IN THE CANVAS AND ON THE PUBLISHED PAGE
 * ===========================================================================
 * Reported with two screenshots of the same site: "THE CHAIR" in a serif on
 * the published page and in a bold sans in the builder's canvas.
 *
 * The logo is an <a href="/"> with a <span> inside it whose font-family is
 * the string `inherit`, so whatever it shows is decided entirely by what it
 * inherits. And what it inherits is not the page's body font: the theme's
 * typography stylesheet gives every a[href] inside a section the BUTTON
 * font,
 *
 *   ${root} :where([data-section] a[href]){font-family:var(--type-button-font);…}
 *
 * so the site's wordmark has been taking its face from the role the buttons
 * use. That is not a font anybody chose for it, and it is why the two
 * surfaces could disagree at all.
 *
 * This renders one theme through ThemePage twice, once as a published page
 * and once as the editor's canvas, and reads the computed font off the logo
 * in each. Same theme, same component, so any difference is the surface and
 * not the settings.
 *
 *   pnpm build && node scripts/check-logo-font.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-logofont-"))
const stubs = join(root, ".logofont-probe")
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
/*
  ThemePage reaches the theme-language compiler, which hashes a source with
  node:crypto to cache it. Nothing here compiles a .storelib section, and a
  browser has no node:crypto, so it gets a hash that is only required to be
  stable within one page.
*/
writeFileSync(join(stubs, "crypto.js"), `export function createHash() {
  let acc = 0
  return {
    update(s) { const t = String(s); for (let i = 0; i < t.length; i++) acc = (acc * 31 + t.charCodeAt(i)) >>> 0; return this },
    digest() { return acc.toString(16) },
  }
}
export default { createHash }
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-logo-font.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:node:crypto=${join(stubs, "crypto.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}</style></head><body>` +
  `<div id="published" style="width:900px"></div><div id="canvas" style="width:900px"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `(function(){var ce=console.error;console.error=function(){window.__err.push(Array.prototype.map.call(arguments,String).join(" ").slice(0,400));ce.apply(console,arguments)}})();` +
  `window.process={env:{NODE_ENV:"production"}}</script>` +
  /* A src rather than an inline script: this bundle carries the theme
     compiler, whose source contains the characters that close a script tag,
     and inlining it ended the tag early and ran none of it. */
  `<script src="probe.js"></script></body></html>`)

const READ = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await new Promise((r) => setTimeout(r, 500))
  const read = (id) => {
    const host = document.getElementById(id)
    const anchor = host.querySelector('a[aria-label="Go to the home page"]')
    if (!anchor) return null
    /* The span is what the letters are drawn in; the anchor is what decides
       the family it inherits. Both, because the difference between them is
       the whole story. */
    const span = anchor.querySelector("span") || anchor
    return {
      anchorFamily: getComputedStyle(anchor).fontFamily,
      textFamily: getComputedStyle(span).fontFamily,
      weight: getComputedStyle(span).fontWeight,
      text: (span.textContent || "").trim(),
    }
  }
  const linkCount = document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]').length
  return JSON.stringify({
    published: read("published"),
    canvas: read("canvas"),
    linkCount,
    /* React reports a failed render through console.error rather than by
       throwing, and a bundle that never ran looks exactly like one that
       rendered nothing, so both are reported rather than guessed at. */
    errors: (window.__err || []).slice(0, 4),
    ran: !!window.__ran,
  })
})()`

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
await call("Emulation.setDeviceMetricsOverride", { width: 900, height: 900, deviceScaleFactor: 1, mobile: false })
await call("Page.navigate", { url: "file://" + file })
await sleep(1400)
const res = await call("Runtime.evaluate", { expression: READ, awaitPromise: true, returnByValue: true })
if (res.exceptionDetails) fail(`Reading threw: ${JSON.stringify(res.exceptionDetails.text || res.exceptionDetails)}`)
await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()
const r = JSON.parse(res.result.value)

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

console.log("\nThe logo, drawn as a published page and as the editor's canvas\n")
if (!r.ran) fail("The bundle never ran, so nothing below would have meant anything.")
if (!r.published || !r.canvas) {
  console.log(JSON.stringify({ errors: r.errors }, null, 2))
  fail("The logo did not render on one of the two surfaces.")
}
console.log(`  published: ${r.published.textFamily}`)
console.log(`  canvas:    ${r.canvas.textFamily}\n`)

expect(r.published.text === "THE CHAIR" && r.canvas.text === "THE CHAIR", "both drew the wordmark")
expect(r.published.textFamily === r.canvas.textFamily,
  "and both drew it in the same font",
  r.published.textFamily === r.canvas.textFamily ? r.published.textFamily : `published ${r.published.textFamily} vs canvas ${r.canvas.textFamily}`)
expect(r.published.weight === r.canvas.weight, "at the same weight", `${r.published.weight} and ${r.canvas.weight}`)

/*
  AND IT IS THE FONT A WORDMARK SHOULD BE IN. The heading face is the one
  chosen for the site's own name; the button face is the one chosen for the
  labels on its buttons, and the logo was taking that because it happens to
  be an anchor.
*/
expect(/Playfair Display/.test(r.published.textFamily),
  "and it is the theme's heading face rather than whatever a[href] gets",
  r.published.textFamily)
expect(r.linkCount >= 1, "the families are actually requested, on both surfaces", `${r.linkCount} stylesheet link(s)`)

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The wordmark is one font, wherever it is drawn.\n")
