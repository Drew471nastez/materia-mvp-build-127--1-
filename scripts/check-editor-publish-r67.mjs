/**
 * The editor's Publish for a website that is not live yet (round 67), on its
 * real panel (scripts/render-editor-publish-r67.tsx): screenshots at 1280 and
 * 768 (the panel from the bar) and 390 and 360 (the phone's sheet), at
 * deviceScaleFactor 2, in the three states, and what the panel says.
 *
 *   OUT=<folder> node scripts/check-editor-publish-r67.mjs
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
const dir = join(root, ".editor-publish-r67-probe")
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
    entryPoints: [join(root, "scripts/render-editor-publish-r67.tsx")],
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

const OUT = process.env.OUT || join(root, ".editor-publish-r67-shots")
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
for (const [state, says] of [["replaces", "It replaces “Night shop” at ava.storelib.com. Nothing is deleted."], ["first", "It goes live at ava.storelib.com."], ["went", "Your website is live."]]) {
  for (const width of [1280, 768, 390, 360]) {
    const phone = width < 768
    const p = await browser.newPage()
    const errors = []
    p.on("pageerror", (e) => errors.push(e.message))
    await p.setViewport({ width, height: phone ? 844 : 800, isMobile: phone, hasTouch: phone, deviceScaleFactor: 2 })
    await p.goto(`${base}#state=${state}${phone ? "&phone=1" : ""}`)
    await sleep(1200)
    const text = await p.evaluate(() => document.body.innerText)
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    await p.screenshot({ path: join(OUT, `publish-${state}-${width}.png`) })
    expect(text.includes(says), `${state} at ${width}: says "${says}"`)
    expect(overflow <= 0 && errors.length === 0, `${state} at ${width}: no sideways scroll, no error`, { overflow, errors })
    if (state === "went") expect(/View site/.test(text), `went at ${width}: with View site`)
    await p.close()
  }
}
await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(`\n${broken ? `${broken} failed` : "all passed"}; screenshots in ${OUT}`)
process.exit(broken ? 1 : 0)
