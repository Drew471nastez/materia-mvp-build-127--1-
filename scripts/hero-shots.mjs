/**
 * ===========================================================================
 *  THE FRONT PAGE HERO'S PICTURES, TAKEN FROM STORELIB'S OWN SCREENS
 * ===========================================================================
 * Every picture in public/marketing/hero/ is a real Storelib screen drawn by
 * Chromium from the real components, as five demo stores, each on Storelib's
 * real theme with its own theme settings (scripts/render-hero-shots.tsx):
 *
 *   watch       Maison Verlaine, a watch atelier: a product page
 *   pet         Marrow & Oat, dog food: the front page
 *   meal        Fennel & Fig, meal kits: the front page
 *   presets     Halcyon, Lightroom presets: the front page, a dark theme
 *   course      Wheel & Kiln, a pottery course: the landing page
 *   onepage     Studio Arlo's link in bio in three OnePage themes
 *   editor      the website builder with Fennel & Fig open (scripts/render-editor-probe.tsx,
 *               through scripts/editor-probe-harness.mjs)
 *   dashboard   Marrow & Oat's /app home with a demo week (1,284 visitors, 46 orders, $3,420)
 *
 * The brands, products and figures are made up. The product pictures are
 * drawn by scripts/hero-demo-art.mjs; the theme fonts are Google fonts (OFL),
 * fetched once by scripts/hero-fonts.mjs. No real creator's name, page or
 * photo is used.
 *
 *   slide-*.webp   the slider, 1200 x 750 (16:10), from a 1280 x 800 window at 1.5x
 *   tile-*.webp    the dim backdrop, 360 x 450 (4:5), mostly phone screens at 2x
 *
 * Then lib/marketing/hero-media.ts lists them (by hand: the alt text is
 * written for each).
 *
 *   node scripts/hero-shots.mjs
 *   SHOTS_KEEP=<dir> node scripts/hero-shots.mjs     also keeps the full PNGs
 *   HERO_FONTS=<dir>                                 where the font copies are kept (default node_modules/.cache)
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"
import { DEMO_ART } from "./hero-demo-art.mjs"
import { fontCache } from "./hero-fonts.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const dest = join(root, "public/marketing/hero")
const keep = process.env.SHOTS_KEEP || ""
mkdirSync(dest, { recursive: true })
if (keep) mkdirSync(keep, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const work = mkdtempSync(join(tmpdir(), "storelib-hero-shots-"))

/* ── The demo pictures: drawn once the browser is up (below) ─────────────── */

const demo = join(work, "demo")
mkdirSync(demo, { recursive: true })
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const fonts = fontCache(process.env.HERO_FONTS || join(root, "node_modules/.cache/storelib-hero-fonts"))

/* ── The screens' bundle (stubs as scripts/onepage-probe-server.mjs has them) ── */

const stubs = join(root, `.hero-shots-probe-${process.pid}`)
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, preload, unoptimized, sizes, quality, placeholder, blurDataURL, loader, style, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest }) }
`)
writeFileSync(join(stubs, "supabase.js"), `const result = { data: null, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function isNativePlatform() { return false }
export const capacitorStorage = {}
/* The dashboard's "live" pill reads the last five minutes of views: three demo visitors. */
const live = { data: [{ visitor_id: "demo-a" }, { visitor_id: "demo-b" }, { visitor_id: "demo-c" }], error: null }
const liveQ = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(live) : liveQ, apply: () => liveQ })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "demo-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (t) => t === "analytics_events" ? liveQ : q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {} } }
`)
/* The section compiler keys a cache on a hash; a browser has no node:crypto, so a plain one stands in. */
writeFileSync(join(stubs, "crypto.js"), `export function createHash() { let a = ""; return { update(s) { a += String(s); return this }, digest() { let h = 0x811c9dc5; for (let i = 0; i < a.length; i++) { h ^= a.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 } return h.toString(16).padStart(8, "0").repeat(4) } } }
export function randomUUID() { return crypto.randomUUID() }
export default { createHash, randomUUID }
`)
/* The section compiler measures strings with Buffer; the same small stand in the editor probes inject. */
writeFileSync(join(stubs, "buffer.js"), `const enc = new TextEncoder(), dec = new TextDecoder()
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
`)
writeFileSync(join(stubs, "empty.js"),`export const readFileSync = () => "", existsSync = () => false, readdirSync = () => []
export const join = (...p) => p.join("/"), resolve = (...p) => p.join("/"), dirname = (p) => p.split("/").slice(0, -1).join("/"), basename = (p) => p.split("/").pop(), extname = (p) => { const i = p.lastIndexOf("."); return i < 0 ? "" : p.slice(i) }
export default {}
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-hero-shots.tsx"),
    `--alias:node:crypto=${join(stubs, "crypto.js")}`, `--alias:crypto=${join(stubs, "crypto.js")}`,
    `--alias:node:fs=${join(stubs, "empty.js")}`, `--alias:fs=${join(stubs, "empty.js")}`, `--alias:node:path=${join(stubs, "empty.js")}`, `--alias:path=${join(stubs, "empty.js")}`,
    `--alias:server-only=${join(stubs, "empty.js")}`,
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(work, "shots.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"', '--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN="storelib.com"', '--define:process.env.NEXT_PUBLIC_PLATFORM_CURRENCY="usd"', `--inject:${join(stubs, "buffer.js")}`,
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/image=${join(stubs, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
/* The website builder, as every editor probe bundles it (scripts/editor-probe-harness.mjs). */
const editor = await import("./editor-probe-harness.mjs")

const css = await appCss(root)
/* Inter from a production build, served over http here (a page on http may not read file://). */
const rawFaces = interFaces(root)
const mediaDir = rawFaces.match(/url\(file:\/\/(.*?\/static\/media)\//)?.[1] ?? null
const faces = rawFaces.replace(/url\(file:\/\/.*?\/static\/media\//g, "url(/__media/")
const page = (script, globals = "") => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}*{caret-color:transparent}::-webkit-scrollbar{display:none}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};${globals}</script><script src="${script}"></script></body></html>`

writeFileSync(join(work, "index.html"), page("/shots.js"))
writeFileSync(join(work, "editor-probe.js"), readFileSync(editor.bundle))

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2" }
const serveFile = (res, file) => {
  if (!existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
}
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  const path = normalize(decodeURIComponent(url.pathname))
  if (path === "/" || path === "/shot") return serveFile(res, join(work, "index.html"))
  if (path === "/editor" || path.startsWith("/website-builder")) return serveFile(res, join(work, "editor.html"))
  if (path === "/shots.js" || path === "/editor-probe.js") return serveFile(res, join(work, path.slice(1)))
  /* The optimizer, as far as a probe needs it: the picture it names, as it is. */
  if (path === "/_next/image") {
    const inner = url.searchParams.get("url") ?? ""
    const local = inner.startsWith("http") ? new URL(inner).pathname : inner
    if (local.startsWith("/demo/")) return serveFile(res, join(demo, local.slice(6)))
    return serveFile(res, normalize(join(root, "public", local)))
  }
  if (path.startsWith("/demo/")) return serveFile(res, normalize(join(demo, path.slice(6))))
  if (path.startsWith("/__media/") && mediaDir) return serveFile(res, normalize(join(mediaDir, path.slice(9))))
  if (path.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  const file = normalize(join(root, "public", path))
  if (file.startsWith(join(root, "public"))) return serveFile(res, file)
  res.writeHead(404); res.end()
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })

/* ── The product pictures (scripts/hero-demo-art.mjs) ───────────────────── */
{
  const faces = fonts.inline(["Cormorant Garamond"])
  const p = await browser.newPage()
  for (const [name, draw] of Object.entries(DEMO_ART)) {
    const { w, h, svg } = draw()
    await p.setViewport({ width: w, height: h })
    await p.setContent(`<!doctype html><html><head><style>${faces}html,body{margin:0}</style></head><body>${svg}</body></html>`)
    await p.evaluate(() => document.fonts.ready)
    const png = await p.screenshot({ type: "png" })
    writeFileSync(join(demo, `${name}.png`), png)
  }
  await p.close()
  console.log(`  drew ${Object.keys(DEMO_ART).length} product pictures`)
}

/* ── The photographs ───────────────────────────────────────────────────── */

const DESK = { width: 1280, height: 800, deviceScaleFactor: 1.5 }
const PHONE = { width: 390, height: 488, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const errors = []

async function open(path, viewport, { settle = 1600 } = {}) {
  const p = await browser.newPage()
  p.on("pageerror", (e) => errors.push(`${path}: ${e.message}`))
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${path}: ${m.text().slice(0, 300)}`) })
  /* The theme's Google fonts, answered from the local copy (scripts/hero-fonts.mjs). */
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const answer = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(r.url()) ? fonts.answer(r.url()) : null
    if (answer) return r.respond(answer)
    if (/^https?:\/\/(?!127\.0\.0\.1)/.test(r.url())) return r.abort()
    return r.continue()
  })
  await p.emulateTimezone("America/New_York")
  await p.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" })
  await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "language", { get: () => "en-US" }); Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] }) })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.setViewport(viewport)
  await p.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready)
  await wait(settle)
  return p
}

async function take(name, path, viewport, { settle = 1600, scroll = 0, prepare = null } = {}) {
  const p = await open(path, viewport, { settle })
  if (prepare) await p.evaluate(prepare)
  if (scroll) { await p.evaluate((y) => window.scrollTo(0, y), scroll); await wait(400) }
  /* Every picture on screen drawn before the photograph (a lazy one below the fold never loads; three seconds at most). */
  await p.evaluate(() => Promise.race([
    Promise.all([...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))),
    new Promise((r) => setTimeout(r, 3000)),
  ]))
  await p.evaluate(() => document.fonts.ready)
  console.log(`  took ${name}`)
  await wait(250)
  const png = await p.screenshot({ type: "png" })
  await p.close()
  if (keep) writeFileSync(join(keep, `${name}.png`), png)
  return png
}

const sizes = []
async function slide(name, png) {
  const file = join(dest, `slide-${name}.webp`)
  await sharp(png).resize(1200, 750, { fit: "cover", position: "top" }).webp({ quality: 74, effort: 6 }).toFile(file)
  sizes.push([`slide-${name}.webp`, statSync(file).size])
}
async function tile(name, png, crop = null) {
  const file = join(dest, `tile-${name}.webp`)
  let img = sharp(png)
  if (crop) img = sharp(await img.extract(crop).toBuffer())
  await img.resize(360, 450, { fit: "cover", position: "top" }).webp({ quality: 62, effort: 6 }).toFile(file)
  sizes.push([`tile-${name}.webp`, statSync(file).size])
}

/* The website builder opens the meal kit's own page, in its own theme. */
{
  const p = await open("/shot?shot=meal", DESK, { settle: 300 })
  const demoEditor = await p.evaluate(() => window.__demoEditor)
  await p.close()
  const editorGlobals = `window.PROBE_SHORT=false;window.PROBE_STORE_NAME="Fennel & Fig";window.PROBE_THEME_SETTINGS=${JSON.stringify(demoEditor.theme)};window.PROBE_CARDS=${JSON.stringify(demoEditor.items)};window.PROBE_PAGES=${JSON.stringify({ home: demoEditor.page })};`
  writeFileSync(join(work, "editor.html"), page("/editor-probe.js", editorGlobals))
}

/* The slides, in the order the slider shows them. The first is the one in the centre when the page opens. */
const shots = {}
for (const name of ["watch", "pet", "meal", "presets", "course"]) {
  shots[name] = await take(name, `/shot?shot=${name}`, DESK, { settle: 2200 })
  await slide(name, shots[name])
}

/* Link in bio: three themes side by side, as phones on a quiet table. */
const BIO_THEMES = ["default", "sunset", "ocean"]
const bios = []
for (const t of BIO_THEMES) bios.push(await take(`onepage-${t}`, `/shot?shot=onepage&theme=${t}`, { width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true }))
{
  const w = 300, h = Math.round((300 * 760) / 390), r = 30
  const mask = Buffer.from(svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" fill="#fff"/>`))
  const phones = await Promise.all(bios.map((b) => sharp(b).resize(w, h).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()))
  const shadow = await sharp(Buffer.from(svg(w + 60, h + 60, `<defs><filter id="f"><feGaussianBlur stdDeviation="14"/></filter></defs><rect x="30" y="38" width="${w}" height="${h}" rx="${r}" fill="rgba(40,30,20,0.3)" filter="url(#f)"/>`))).png().toBuffer()
  const top = Math.round((750 - h) / 2)
  const lefts = [600 - w / 2 - w - 44, 600 - w / 2, 600 + w / 2 + 44]
  const layers = lefts.flatMap((left, i) => [{ input: shadow, left: Math.round(left - 30), top: top - 30 }, { input: phones[i], left: Math.round(left), top }])
  const png = await sharp({ create: { width: 1200, height: 750, channels: 3, background: "#ece4d8" } }).composite(layers).png().toBuffer()
  if (keep) writeFileSync(join(keep, "onepage-trio.png"), png)
  await slide("onepage", png)
}

/* The builder, the assistant's prompt bar left out so the slide shows the website and the panel beside it. */
const builder = await take("editor", "/website-builder/editor/probe-install", DESK, {
  settle: 5000,
  prepare: () => { for (const dock of document.querySelectorAll("[data-ask-dock]")) dock.style.display = "none" },
})
await slide("editor", builder)
shots.dashboard = await take("dashboard", "/shot?shot=dashboard", DESK, { settle: 3000 })
await slide("dashboard", shots.dashboard)

/* The backdrop tiles: phone screens, and a few corners of the computer ones. */
for (const name of ["watch", "pet", "meal", "presets", "course"]) await tile(name, await take(`${name}-phone`, `/shot?shot=${name}`, PHONE, { settle: 1800 }))
await tile("pet-grid", await take("pet-phone-grid", "/shot?shot=pet", PHONE, { scroll: 820, settle: 1800 }))
for (const t of ["default", "sunset", "ocean", "sage"]) await tile(`onepage-${t}`, await take(`onepage-${t}-tile`, `/shot?shot=onepage&theme=${t}`, PHONE))
await tile("dashboard", await take("dashboard-phone", "/shot?shot=dashboard", PHONE, { settle: 3000 }))
/* 1.5x pictures are 1920 x 1200: a 4:5 piece of each. */
await tile("editor", builder, { left: 0, top: 0, width: 960, height: 1200 })
await tile("watch-desk", shots.watch, { left: 960, top: 0, width: 960, height: 1200 })

await browser.close()
server.close()
rmSync(work, { recursive: true, force: true })
for (const [f, n] of sizes) console.log(`  ${f.padEnd(28)} ${(n / 1024).toFixed(1)} KB`)
console.log(`  ${"total".padEnd(28)} ${(sizes.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(1)} KB`)
if (errors.length) console.log(`\n  The pages reported (not fatal): \n    ${[...new Set(errors)].slice(0, 12).join("\n    ")}`)
