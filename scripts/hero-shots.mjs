/**
 * ===========================================================================
 *  THE FRONT PAGE HERO'S PICTURES, TAKEN FROM STORELIB'S OWN SCREENS
 * ===========================================================================
 * Every picture in public/marketing/hero/ is a real Storelib screen drawn by
 * Chromium from the real components, with made up content: one invented
 * creator (Juniper Studio), invented products, and product pictures this
 * script draws itself. No real creator's name, page or photo is used.
 *
 *   slide-*.webp   the slider, 1200 x 750 (16:10), from a 1280 x 800 window at 1.5x
 *   tile-*.webp    the dim backdrop, 360 x 450 (4:5), mostly phone screens at 2x
 *
 * The screens (scripts/render-hero-shots.tsx unless named):
 *   store       a website on the default theme (header, hero, product grid, footer)
 *   product     its product page
 *   editor      the website builder with that website open (scripts/render-editor-probe.tsx,
 *               through scripts/editor-probe-harness.mjs, with the demo sections and products)
 *   dashboard   the /app home beside the sidebar
 *   creator     a creator page
 *   onepage     link in bio pages in a few OnePage themes
 *
 * Then lib/marketing/hero-media.ts lists them (by hand: the alt text is
 * written for each).
 *
 *   node scripts/hero-shots.mjs
 *   SHOTS_KEEP=<dir> node scripts/hero-shots.mjs     also keeps the full PNGs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const dest = join(root, "public/marketing/hero")
const keep = process.env.SHOTS_KEEP || ""
mkdirSync(dest, { recursive: true })
if (keep) mkdirSync(keep, { recursive: true })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const work = mkdtempSync(join(tmpdir(), "storelib-hero-shots-"))

/* ── The demo pictures ─────────────────────────────────────────────────── */

const demo = join(work, "demo")
mkdirSync(demo, { recursive: true })
const font = "Inter, sans-serif"
const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
const grad = (id, a, b, x2 = 1, y2 = 1) => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`
const frames = (y, tone) => [0, 1, 2].map((i) => `<rect x="${110 + i * 200}" y="${y}" width="180" height="230" rx="10" fill="${tone[i]}"/><rect x="${110 + i * 200}" y="${y + 190}" width="180" height="40" rx="0" fill="rgba(0,0,0,0.12)"/>`).join("")
const DEMO = {
  presets: svg(800, 800, `${grad("g", "#f4a261", "#c8553d")}<rect width="800" height="800" fill="url(#g)"/>${frames(250, ["#f7d6a8", "#e9b48a", "#f2c49b"])}<text x="110" y="170" font-family="${font}" font-weight="800" font-size="64" fill="#2b1810">Film Presets</text><text x="110" y="600" font-family="${font}" font-weight="600" font-size="34" fill="#2b1810" opacity="0.8">Vol. 2  ·  12 presets</text>`),
  "presets-2": svg(800, 800, `${grad("g", "#e9c46a", "#e76f51", 0, 1)}<rect width="800" height="800" fill="url(#g)"/><circle cx="400" cy="380" r="200" fill="#fff3e0" opacity="0.55"/><rect x="200" y="560" width="400" height="18" rx="9" fill="#2b1810" opacity="0.5"/><rect x="250" y="600" width="300" height="18" rx="9" fill="#2b1810" opacity="0.3"/>`),
  "presets-3": svg(800, 800, `${grad("g", "#264653", "#2a9d8f")}<rect width="800" height="800" fill="url(#g)"/>${frames(280, ["#e9c46a", "#f4a261", "#e76f51"])}`),
  planner: svg(800, 800, `<rect width="800" height="800" fill="#f3efe6"/>${Array.from({ length: 7 }, (_, i) => `<rect x="${90 + (i % 4) * 160}" y="${250 + Math.floor(i / 4) * 230}" width="140" height="200" rx="12" fill="#fff" stroke="#d9d2c3" stroke-width="2"/><rect x="${106 + (i % 4) * 160}" y="${268 + Math.floor(i / 4) * 230}" width="70" height="12" rx="6" fill="#2f5d46"/>`).join("")}<text x="90" y="180" font-family="${font}" font-weight="800" font-size="60" fill="#2f5d46">Weekly Planner</text>`),
  brushes: svg(800, 800, `<rect width="800" height="800" fill="#fbf7f2"/><circle cx="300" cy="330" r="170" fill="#8ecae6" opacity="0.55"/><circle cx="470" cy="300" r="150" fill="#ffb4a2" opacity="0.6"/><circle cx="420" cy="470" r="160" fill="#b5e48c" opacity="0.5"/><text x="400" y="700" text-anchor="middle" font-family="${font}" font-weight="800" font-size="56" fill="#3d405b">Watercolor Brushes</text>`),
  ebook: svg(800, 800, `<rect width="800" height="800" fill="#e8ded2"/><rect x="230" y="110" width="340" height="500" rx="10" fill="#1d3557"/><rect x="230" y="110" width="22" height="500" fill="#14243d"/><circle cx="400" cy="330" r="80" fill="#f1faee" opacity="0.9"/><text x="410" y="490" text-anchor="middle" font-family="${font}" font-weight="800" font-size="38" fill="#f1faee">Sourdough</text><text x="410" y="535" text-anchor="middle" font-family="${font}" font-weight="500" font-size="28" fill="#a8dadc">at Home</text><rect x="250" y="640" width="300" height="16" rx="8" fill="#b9ad9f"/>`),
  posters: svg(800, 800, `${grad("g", "#caf0f8", "#90e0ef", 0, 1)}<rect width="800" height="800" fill="url(#g)"/><polygon points="80,620 300,250 520,620" fill="#03045e"/><polygon points="300,620 520,300 740,620" fill="#0077b6"/><polygon points="250,330 300,250 350,330" fill="#fff"/><rect y="620" width="800" height="180" fill="#023e8a"/><text x="400" y="150" text-anchor="middle" font-family="${font}" font-weight="800" font-size="70" fill="#03045e" letter-spacing="8">ALPINE</text>`),
  course: svg(800, 800, `${grad("g", "#22223b", "#4a4e69")}<rect width="800" height="800" fill="url(#g)"/><rect x="290" y="170" width="220" height="400" rx="34" fill="#f2e9e4"/><rect x="306" y="200" width="188" height="300" rx="16" fill="#c9ada7"/><polygon points="375,300 375,400 455,350" fill="#22223b"/><text x="400" y="680" text-anchor="middle" font-family="${font}" font-weight="800" font-size="52" fill="#f2e9e4">Mobile Editing</text>`),
  avatar: svg(400, 400, `${grad("g", "#2f5d46", "#7fb685")}<rect width="400" height="400" fill="url(#g)"/><text x="200" y="262" text-anchor="middle" font-family="${font}" font-weight="800" font-size="190" fill="#f3efe6">J</text>`),
  cover: svg(1500, 500, `${grad("g", "#e9e4d8", "#cfd8c4", 0, 1)}<rect width="1500" height="500" fill="url(#g)"/><path d="M0 330 Q 250 230 500 320 T 1000 300 T 1500 310 V500 H0Z" fill="#9db48a"/><path d="M0 400 Q 300 330 600 400 T 1200 380 T 1500 400 V500 H0Z" fill="#5f8a5a"/><circle cx="1180" cy="140" r="60" fill="#f6d39b"/>`),
}
for (const [name, body] of Object.entries(DEMO)) await sharp(Buffer.from(body)).png().toFile(join(demo, `${name}.png`))
/* The website's hero picture: a few of the products laid out on a table. */
{
  const tiles = ["presets", "planner", "ebook", "posters"]
  const comp = await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(join(demo, `${t}.png`)).resize(380, 380).png().toBuffer(), left: [90, 520, 160, 600][i], top: [80, 120, 500, 540][i] })))
  await sharp({ create: { width: 1100, height: 1000, channels: 3, background: "#e7e1d6" } }).composite(comp).png().toFile(join(demo, "hero.png"))
}

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
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "demo-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this }, unsubscribe() {} }), removeChannel() {} } }
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

/* The website the editor opens: the same sections and products as the store screen. */
const pic = (name) => `/demo/${name}.png`
const PRODUCT_CARDS = [["Film Presets Vol. 2", "$24.00", "presets"], ["Weekly Planner for Notion", "$12.00", "planner"], ["Watercolor Brush Set", "$18.00", "brushes"], ["Sourdough at Home", "$15.00", "ebook"], ["Alpine Poster Pack", "$29.00", "posters"], ["Mobile Editing Course", "$49.00", "course"]]
  .map(([title, price, image], i) => ({ id: `10000000-0000-4000-8000-00000000000${i + 1}`, type: "product", settings: { title, price, compare_price: "", image: pic(image), url: "#", tag: "" } }))
const EDITOR_PAGE = [
  { id: "hdr", type: "header", settings: { logo_text: "Juniper Studio", header_sticky: false }, blocks: [{ id: "n1", type: "nav_link", settings: { label: "Shop", url: "/shop" } }, { id: "n2", type: "nav_link", settings: { label: "Presets", url: "/presets" } }, { id: "n3", type: "nav_link", settings: { label: "About", url: "/about" } }] },
  { id: "hero", type: "hero_split", settings: { heading: "Presets and planners for slow, careful work", subheading: "Made in a small studio. Instant download, yours to keep.", image: pic("hero") }, blocks: [] },
  { id: "grid", type: "product_grid", settings: { heading: "New in the shop" }, blocks: [] },
  { id: "ftr", type: "footer", settings: { logo_text: "Juniper Studio", tagline: "Presets, planners and prints from a small studio." }, blocks: [] },
]
const editorGlobals = `window.PROBE_SHORT=false;window.PROBE_CARDS=${JSON.stringify(PRODUCT_CARDS)};window.PROBE_PAGES=${JSON.stringify({ home: EDITOR_PAGE })};`

writeFileSync(join(work, "index.html"), page("/shots.js"))
writeFileSync(join(work, "editor.html"), page("/editor-probe.js", editorGlobals))
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

/* ── The photographs ───────────────────────────────────────────────────── */

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--font-render-hinting=none"] })
const DESK = { width: 1280, height: 800, deviceScaleFactor: 1.5 }
const PHONE = { width: 390, height: 488, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const errors = []

async function take(name, path, viewport, { settle = 1600, scroll = 0, prepare = null } = {}) {
  const p = await browser.newPage()
  p.on("pageerror", (e) => errors.push(`${name}: ${e.message}`))
  p.on("console", (m) => { if (m.type() === "error") errors.push(`${name}: ${m.text().slice(0, 300)}`) })
  await p.emulateTimezone("America/New_York")
  await p.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" })
  await p.evaluateOnNewDocument(() => { Object.defineProperty(navigator, "language", { get: () => "en-US" }); Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] }) })
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.setViewport(viewport)
  await p.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 60000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready)
  await wait(settle)
  if (prepare) await p.evaluate(prepare)
  if (scroll) { await p.evaluate((y) => window.scrollTo(0, y), scroll); await wait(400) }
  /* Every picture on screen drawn before the photograph (a lazy one below the fold never loads; three seconds at most). */
  await p.evaluate(() => Promise.race([
    Promise.all([...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight).map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r })))),
    new Promise((r) => setTimeout(r, 3000)),
  ]))
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

/* The slides. */
const store = await take("store", "/shot?shot=store", DESK)
await slide("store", store)
await slide("product", await take("product", "/shot?shot=product", DESK))
await slide("creator", await take("creator", "/shot?shot=creator", DESK))
await slide("dashboard", await take("dashboard", "/shot?shot=dashboard", DESK, { settle: 2500 }))
/*
  The builder names the website after the probe's install ("Probe store"):
  the demo's name instead. And the assistant's prompt bar is left out of the
  picture, so the slide shows the website and the panel beside it.
*/
const builder = await take("editor", "/website-builder/editor/probe-install", DESK, {
  settle: 5000,
  prepare: () => {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue.includes("Probe store")) n.nodeValue = n.nodeValue.replace("Probe store", "Juniper Studio")
    for (const dock of document.querySelectorAll("[data-ask-dock]")) dock.style.display = "none"
  },
})
await slide("editor", builder)

/* Link in bio: three themes side by side, as phones on a quiet table. */
const BIO_THEMES = ["default", "sunset", "ocean"]
const bios = []
for (const t of BIO_THEMES) bios.push(await take(`onepage-${t}`, `/shot?shot=onepage&theme=${t}`, { width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true }))
{
  const w = 300, h = Math.round((300 * 760) / 390), r = 30
  const mask = Buffer.from(svg(w, h, `<rect width="${w}" height="${h}" rx="${r}" fill="#fff"/>`))
  const phones = await Promise.all(bios.map((b) => sharp(b).resize(w, h).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer()))
  const shadow = await sharp(Buffer.from(svg(w + 60, h + 60, `<defs><filter id="f"><feGaussianBlur stdDeviation="14"/></filter></defs><rect x="30" y="38" width="${w}" height="${h}" rx="${r}" fill="rgba(20,20,40,0.28)" filter="url(#f)"/>`))).png().toBuffer()
  const top = Math.round((750 - h) / 2)
  const lefts = [600 - w / 2 - w - 44, 600 - w / 2, 600 + w / 2 + 44]
  const layers = lefts.flatMap((left, i) => [{ input: shadow, left: Math.round(left - 30), top: top - 30 }, { input: phones[i], left: Math.round(left), top }])
  const png = await sharp({ create: { width: 1200, height: 750, channels: 3, background: "#eceef1" } }).composite(layers).png().toBuffer()
  if (keep) writeFileSync(join(keep, "onepage-trio.png"), png)
  await slide("onepage", png)
}

/* The backdrop tiles: phone screens, and a few corners of the computer ones. */
await tile("store", await take("store-phone", "/shot?shot=store", PHONE))
await tile("store-grid", await take("store-phone-grid", "/shot?shot=store", PHONE, { scroll: 760 }))
await tile("product", await take("product-phone", "/shot?shot=product", PHONE))
await tile("creator", await take("creator-phone", "/shot?shot=creator", PHONE))
for (const t of ["default", "sunset", "ocean", "sage", "aurora", "riso"]) {
  await tile(`onepage-${t}`, await take(`onepage-${t}-tile`, `/shot?shot=onepage&theme=${t}`, PHONE))
}
/* 1.5x pictures are 1920 x 1200: a 4:5 piece of each. */
await tile("dashboard", await take("dashboard-phone", "/shot?shot=dashboard", PHONE, { settle: 2500 }))
await tile("editor", builder, { left: 0, top: 0, width: 960, height: 1200 })
await tile("store-desk", store, { left: 960, top: 0, width: 960, height: 1200 })

await browser.close()
server.close()
rmSync(work, { recursive: true, force: true })
for (const [f, n] of sizes) console.log(`  ${f.padEnd(28)} ${(n / 1024).toFixed(1)} KB`)
console.log(`  ${"total".padEnd(28)} ${(sizes.reduce((a, [, n]) => a + n, 0) / 1024).toFixed(1)} KB`)
if (errors.length) console.log(`\n  The pages reported (not fatal): \n    ${[...new Set(errors)].slice(0, 12).join("\n    ")}`)
