/**
 * The page scripts/check-anchor-scroll.mjs and scripts/check-section-reveal.mjs
 * measure: scripts/render-anchor-motion.tsx bundled for a browser, the
 * project's real stylesheet compiled from app/globals.css, served at "/" so
 * a link to "/#pricing" is a link to the page it is on.
 *
 * Before the page's own script runs, two recorders start: every layout
 * shift (for CLS) and every change of a section box's `data-reveal`.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"
import puppeteer from "puppeteer-core"

export const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
export const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const RECORDERS = `<script>
window.__err = [];
window.addEventListener("error", function (e) { window.__err.push(String(e.message)) });
window.__shifts = [];
try {
  new PerformanceObserver(function (list) {
    list.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__shifts.push({ value: e.value, t: e.startTime }) })
  }).observe({ type: "layout-shift", buffered: true });
} catch (e) {}
window.__reveal = [];
new MutationObserver(function (records) {
  records.forEach(function (r) {
    var el = r.target;
    if (!el.hasAttribute || !el.hasAttribute("data-section-box")) return;
    window.__reveal.push({ key: el.getAttribute("data-section-key"), type: el.getAttribute("data-section-type"), value: el.getAttribute("data-reveal"), t: performance.now() });
  });
}).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-reveal"] });
window.__anims = [];
var animate = Element.prototype.animate;
Element.prototype.animate = function (frames, options) {
  try {
    if (this.hasAttribute("data-section-box")) {
      var props = {};
      (frames || []).forEach(function (f) { Object.keys(f).forEach(function (k) { if (k !== "offset" && k !== "easing" && k !== "composite") props[k] = true }) });
      window.__anims.push({ key: this.getAttribute("data-section-key"), props: Object.keys(props), duration: options && options.duration, delay: options && options.delay, t: performance.now() });
    }
  } catch (e) {}
  return animate.apply(this, arguments);
};
</script>`

export async function startProbe() {
  const root = process.cwd()
  if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
  const cssPath = join(root, "app/globals.css")
  const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

  const out = mkdtempSync(join(tmpdir(), "storelib-anchor-motion-"))
  const stubs = join(root, ".anchor-motion-probe")
  mkdirSync(stubs, { recursive: true })
  writeFileSync(join(stubs, "crypto.js"), `export function createHash() {
  let s = ""
  return { update(x) { s += x; return this }, digest() { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return (h >>> 0).toString(16) } }
}
export function randomUUID() { return "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2, 14).padEnd(12, "0") }
`)
  writeFileSync(join(stubs, "supabase.js"), `export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) } }\n`)
  writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
  writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
  try {
    execFileSync("npx", [
      "--no-install", "esbuild", join(root, "scripts/render-anchor-motion.tsx"),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
      `--outfile=${join(out, "probe.js")}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;globalThis.Buffer=globalThis.Buffer||{byteLength:function(s){return new TextEncoder().encode(s).length}};',
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      `--alias:node:crypto=${join(stubs, "crypto.js")}`,
      `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
      `--alias:next/navigation=${join(stubs, "navigation.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`,
      `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
    ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  } finally {
    rmSync(stubs, { recursive: true, force: true })
  }
  const probe = readFileSync(join(out, "probe.js"))
  const html =
    `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>${RECORDERS}</head>` +
    `<body><div id="app"></div><script src="/probe.js"></script></body></html>`

  const server = createServer((req, res) => {
    const path = (req.url || "/").split("?")[0].split("#")[0]
    if (path === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(probe) }
    if (path === "/") { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
    res.writeHead(404); res.end()
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1"] })

  async function open(url, { width, height, phone = false, reduced = false } = {}) {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone })
    if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await page.goto(`${origin}${url}`, { waitUntil: "load" })
    await page.waitForFunction(() => window.__ready === true, { timeout: 20000 })
    const errors = await page.evaluate(() => window.__err)
    if (errors.length) fail(`The page reported errors: ${errors.join(" | ")}`)
    /* Fonts and a few frames for the runtime's first plan. */
    await page.evaluate(() => document.fonts?.ready)
    await sleep(250)
    return page
  }

  async function close() {
    await browser.close().catch(() => {})
    server.close()
    rmSync(out, { recursive: true, force: true })
  }
  return { open, close, origin }
}

/** Counting and reporting, the way every check script here does it. */
export function reporter() {
  let passed = 0
  const failures = []
  const check = (label, ok, detail) => {
    if (ok) { passed++; console.log(`  ok    ${label}${detail !== undefined ? `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`) }
    else { failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? `   (${typeof detail === "string" ? detail : JSON.stringify(detail)})` : ""}`) }
  }
  const finish = () => {
    console.log(`\n${passed} passed, ${failures.length} failed`)
    if (failures.length) { console.log(failures.map((f) => `  - ${f}`).join("\n")); process.exit(1) }
  }
  return { check, finish }
}
