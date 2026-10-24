/**
 * ===========================================================================
 *  THE PUBLISH SHEET'S OPEN ICON: THE PHONE'S BROWSER, NOTHING IN THE APP
 * ===========================================================================
 * The owner: "in the website builder editor on phones, in the publish modal,
 * the icon next to copy link of the website URL: when I click it, in iOS
 * Capacitor and Android it should take me to the browser outside the app,
 * and do nothing inside the app."
 *
 * Renders the real phone publish sheet and the real link guard
 * (scripts/render-publish-open.tsx) at 390x844 on /website-builder/editor,
 * served over http so the page is where the builder is, and taps the icon in
 * four shells. Every way out is recorded instead of taken:
 *
 *   web               one new tab with the address
 *   iOS app           one window.open(url, "_system"), which Capacitor's iOS
 *                     delegate hands to Safari; nothing else, and this window
 *                     never follows the link
 *   Android app       the browser plugin (a Chrome Custom Tab) with the
 *                     address; no window.open (a new window to one of our
 *                     hosts is loaded in the app's own WebView)
 *   Android, no plugin nothing at all rather than the app's WebView
 *
 *   node scripts/check-publish-open-live.mjs
 */
import { build } from "esbuild"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const dir = join(root, ".publish-open-probe")
mkdirSync(dir, { recursive: true })
const STUBS = {
  "next-navigation": `import { useSyncExternalStore } from "react"
const router = { push: (h) => { window.__left = window.__left || ("push:" + h) }, replace() {}, prefetch() {}, back() {}, refresh() {} }
export const usePathname = () => useSyncExternalStore(() => () => {}, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})`,
  "next-link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })`,
  "capacitor-browser": `export const Browser = {
  open: async (o) => { if (!window.__pluginOn) throw new Error("Browser plugin is not implemented"); window.__browser.push(o.url) },
  addListener: async () => ({ remove() {} }),
  close: async () => {},
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(dir, `${k}.jsx`), v)
try {
  await build({
    entryPoints: [join(root, "scripts/render-publish-open.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(dir, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(dir, "next-navigation.jsx") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(dir, "next-link.jsx") }))
        b.onResolve({ filter: /^@capacitor\/browser$/ }, () => ({ path: join(dir, "capacitor-browser.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(dir, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${readFileSync(join(dir, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`
/* Every path is the page, so it can sit at the builder's own address. */
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}/website-builder/editor/i1`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function tapOpen(hash) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  let tabs = 0
  browser.on("targetcreated", () => tabs++)
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await p.goto(`${base}#${hash}`)
  await sleep(900)
  const at = await p.evaluate(() => {
    const a = document.querySelector("[data-publish-open-live], a[aria-label=\"Open the live site\"]")
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.getAttribute("href"), target: a.getAttribute("target") }
  })
  if (!at) {
    await p.close()
    return { missing: true, errors }
  }
  await p.touchscreen.tap(at.x, at.y)
  await sleep(600)
  const out = await p.evaluate(() => ({ opens: window.__opens, browser: window.__browser, left: window.__left, path: location.pathname }))
  await p.close()
  return { ...out, at, tabs, errors }
}

console.log("\nThe open icon beside Copy, tapped at 390")
{
  const r = await tapOpen("shell=web")
  expect(!r.missing && r.at.href === "https://ava.storelib.com" && r.at.target === "_blank", "on the web it is still a link to the address, in a new tab (a long press and Copy link work)", r.at)
  expect(r.opens?.length === 1 && r.opens[0].url === "https://ava.storelib.com" && r.opens[0].target === "_blank" && !r.left, "a tap opens one new tab with it, and the builder stays", { opens: r.opens, left: r.left })
}
{
  const r = await tapOpen("shell=ios")
  expect(r.opens?.length === 1 && r.opens[0].target === "_system" && r.opens[0].url === "https://ava.storelib.com", "iOS app: one window.open(url, \"_system\"), Capacitor's way to Safari", r.opens)
  expect(!r.left && r.path === "/website-builder/editor/i1" && r.browser.length === 0, "  and nothing in the app: the builder's window follows nothing", { left: r.left, path: r.path })
}
{
  const r = await tapOpen("shell=android")
  expect(r.browser?.length === 1 && r.browser[0] === "https://ava.storelib.com", "Android app: the browser plugin (Chrome) with the address", r.browser)
  expect(r.opens.length === 0 && !r.left && r.path === "/website-builder/editor/i1", "  and no new window or navigation the app's own WebView would load", { opens: r.opens, left: r.left })
}
{
  const r = await tapOpen("shell=android&plugin=0")
  expect(r.opens?.length === 0 && !r.left && r.path === "/website-builder/editor/i1", "Android without the plugin: nothing in the app, rather than the live site over the builder", { opens: r.opens, left: r.left })
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
