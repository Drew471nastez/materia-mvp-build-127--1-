/**
 * ===========================================================================
 *  YOUR PROFILE'S COVER: PLACED IN SETTINGS, DRAWN WHERE YOU PUT IT
 * ===========================================================================
 * "Account settings cover: the same experience as the creator page editor's
 * cover: drag to reposition (focal point saved), smooth, a modern non
 * generic picker." And: "Remove the camera icon button next to Edit profile
 * on the profile cover."
 *
 * The real Settings (components/account/account-settings.tsx and its Cover
 * field, components/account/cover-field.tsx) and the real profile header
 * (components/profile/profile-hero.tsx), from scripts/render-account-cover.tsx,
 * at 1440x900 with a mouse and 390x844 with a finger:
 *
 *   SHAPE      the frame is the profile band's shape at this width (window
 *              width over 128, 192 or 256px), so it previews the band exactly
 *   DRAG       a drag moves the picture with the pointer in every frame of
 *              the drag (sampled per frame, CPU at a quarter speed), the
 *              crop changes, and one PATCH /api/profile/cover { crop } is
 *              sent after the finger lifts, then the profile is refreshed
 *   SAME CROP  the header drawn from the value that PATCH stores shows the
 *              same part of the picture as the frame did (the picture's
 *              box, as a share of the band, within 1.5%)
 *   NO CAMERA  the header's owner controls are Edit profile alone
 *   EMPTY      with no cover, the field is the band's own shape in the
 *              profile's quiet grey with one "Add a cover" button, not a
 *              dashed upload box
 *   PHONE      the frame and its buttons fit the screen, the controls are
 *              32px discs with 44px targets
 *
 *   PROBE_CSS=source node scripts/check-account-cover.mjs     (SHOTS_DIR=dir)
 */
import { createServer } from "node:http"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = join(root, ".account-cover-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-account-cover-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() { window.__refreshes = (window.__refreshes || 0) + 1 } }
export const usePathname = () => "/account/settings"
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); e.preventDefault() } }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, preload, unoptimized, className, style, ...rest }) { return React.createElement("img", { src, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest }) }
`)
writeFileSync(join(stubs, "supabase.js"), `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : chain(), apply: () => chain() })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: chain, rpc: chain, channel: chain, removeChannel() {}, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: location.origin + "/" + p } }) }) } } }
export function isNativePlatform() { return false }
export const capacitorStorage = {}
`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-account-cover.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx"), "next/image": join(stubs, "image.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [{ name: "stubs", setup(b) { b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase.js") })) } }],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`

/* A photograph-like cover, 1600x1000 (not the band's shape, so the crop matters): a sun high left, hills, a house right of centre. */
const COVER = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc3e6"/><stop offset="1" stop-color="#f3e3c8"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#s)"/><circle cx="330" cy="230" r="110" fill="#f7d36b"/><path d="M0 640 C 300 520 600 700 900 600 S 1400 520 1600 600 L1600 1000 L0 1000Z" fill="#6f8f5a"/><path d="M0 780 C 400 700 800 860 1600 760 L1600 1000 L0 1000Z" fill="#4c6b3d"/><rect x="1020" y="520" width="190" height="150" fill="#e9e1d4"/><path d="M1000 525 L1115 430 L1230 525Z" fill="#9b3d2c"/><rect x="1090" y="590" width="44" height="80" fill="#5b3a26"/></svg>`

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (url.pathname.endsWith("/cover.svg")) {
    res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=3600" })
    return res.end(COVER)
  }
  if (fontDir && url.pathname.startsWith("/font/")) {
    try {
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6)))))
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const COVER_URL = `${origin}/storage/v1/object/public/covers/u1/cover.svg`

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })

async function open(vp, hash, stored) {
  const page = await browser.newPage()
  page.errors = []
  page.on("pageerror", (e) => page.errors.push(String(e)))
  await page.setViewport(vp)
  await page.evaluateOnNewDocument((s) => { window.__stored = s }, stored)
  await page.goto(`${origin}/${hash}`, { waitUntil: "load" })
  await sleep(500)
  return page
}

/* Where the picture is inside its band, as shares of the band: the same numbers whatever the band's size. */
const placement = (page, frameSel, imgSel) =>
  page.evaluate(
    (frameSel, imgSel) => {
      const f = document.querySelector(frameSel)
      const img = document.querySelector(imgSel)
      if (!f || !img) return null
      const fr = f.getBoundingClientRect()
      const box = img.getBoundingClientRect()
      /* The picture as painted, not the element: an object-fit: cover box paints the picture at its own shape, placed by object-position. */
      const s = getComputedStyle(img)
      let ir = box
      if (s.objectFit === "cover" && img.naturalWidth && img.naturalHeight) {
        const k = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight)
        const w = img.naturalWidth * k
        const h = img.naturalHeight * k
        const [px, py] = s.objectPosition.split(" ").map((v) => parseFloat(v) / 100)
        ir = { left: box.left + (box.width - w) * px, top: box.top + (box.height - h) * py, width: w, height: h }
      }
      return { left: (ir.left - fr.left) / fr.width, top: (ir.top - fr.top) / fr.height, width: ir.width / fr.width, height: ir.height / fr.height, frameW: fr.width, frameH: fr.height }
    },
    frameSel,
    imgSel,
  )

const bandAspect = (w) => Math.min(12, Math.max(1.5, w / (w >= 1024 ? 256 : w >= 640 ? 192 : 128)))

for (const [label, vp] of [["1440", DESK], ["390", PHONE]]) {
  const touch = !!vp.hasTouch
  console.log(`\nSettings at ${label} (${touch ? "a finger" : "a mouse"})`)
  const page = await open(vp, "#settings", `${COVER_URL}`)
  await page.waitForSelector("[data-cover-crop-frame] img")
  await page.evaluate(() => document.querySelector("[data-account-cover-field]").scrollIntoView({ block: "center" }))
  await sleep(300)
  const clientW = await page.evaluate(() => document.documentElement.clientWidth)
  const before = await placement(page, "[data-cover-crop-frame]", "[data-cover-crop-frame] img")
  expect(!!before && Math.abs(before.frameW / before.frameH - bandAspect(clientW)) < 0.03, "the frame is the profile band's shape at this width", { frame: before && +(before.frameW / before.frameH).toFixed(3), band: +bandAspect(clientW).toFixed(3) })
  await page.screenshot({ path: join(shots, `settings-cover-${label}.png`) })
  const controls = await page.evaluate(() => [...document.querySelectorAll("[data-cover-crop-frame] button")].map((b) => { const r = b.getBoundingClientRect(); return { label: b.getAttribute("aria-label") || b.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= 0 && r.right <= window.innerWidth } }))
  expect(controls.length >= 2 && controls.every((c) => c.inside), "Change and Remove sit on the picture, inside the screen", controls)
  const hint = await page.$eval("[data-account-cover-hint]", (e) => e.innerText.trim()).catch(() => "")
  expect(/Drag to move/.test(hint), "it says what the frame does, once, beside the label", hint)

  /* THE DRAG, at a quarter speed, sampled every frame. */
  const cdp = await page.createCDPSession()
  const box = await page.evaluate(() => { const r = document.querySelector("[data-cover-crop-frame]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await page.evaluate(() => {
    window.__drag = []
    const img = document.querySelector("[data-cover-crop-frame] img")
    const f = document.querySelector("[data-cover-crop-frame]")
    const step = () => {
      const fr = f.getBoundingClientRect()
      const r = img.getBoundingClientRect()
      window.__drag.push({ t: Math.round(performance.now()), x: Math.round((r.left - fr.left) * 10) / 10, y: Math.round((r.top - fr.top) * 10) / 10 })
      if (!window.__dragDone) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
  const dx = -Math.round(box.w * 0.18)
  const dy = -Math.round(box.h * 0.35)
  const STEPS = 12
  if (touch) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x, y: box.y, id: 1 }] })
    for (let i = 1; i <= STEPS; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: box.x + (dx * i) / STEPS, y: box.y + (dy * i) / STEPS, id: 1 }] })
      await sleep(34)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  } else {
    await page.mouse.move(box.x, box.y)
    await page.mouse.down()
    for (let i = 1; i <= STEPS; i++) {
      await page.mouse.move(box.x + (dx * i) / STEPS, box.y + (dy * i) / STEPS)
      await sleep(34)
    }
    await page.mouse.up()
  }
  await sleep(250)
  await page.evaluate(() => { window.__dragDone = true })
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const drag = await page.evaluate(() => window.__drag)
  /* A wide band over a 16:10 picture has room to move up and down only; the top edge is what moves. */
  const xs = drag.map((d) => d.y)
  const moves = xs.filter((v, i) => i > 0 && Math.abs(v - xs[i - 1]) > 0.5).length
  const back = xs.filter((v, i) => i > 0 && v > xs[i - 1] + 0.5).length
  console.log(`    the picture's top edge over the drag, a frame each: ${xs.slice(0, 30).join(" ")}`)
  expect(moves >= 4 && back === 0, "the picture follows the pointer across several frames, one way only", { moves, back, frames: xs.length })
  await sleep(700)
  const patches = await page.evaluate(() => window.__patches || [])
  const crop = patches.at(-1)?.crop
  expect(patches.length === 1 && !!crop && !("coverUrl" in patches[0]), "one PATCH after the release, with the crop alone", patches)
  expect(!!crop && crop.y > 55 && crop.zoom === 1, "the crop moved the way the picture was dragged (up shows more of its foot)", crop)
  const refreshes = await page.evaluate(() => window.__refreshes || 0)
  expect(refreshes >= 1, "the profile is refreshed once it is saved", refreshes)
  const saved = await page.$eval("[data-account-cover-field]", (e) => e.innerText).catch(() => "")
  expect(/Saved/.test(saved), "and it says so, quietly, under the frame", saved.split("\n").at(-1))
  const after = await placement(page, "[data-cover-crop-frame]", "[data-cover-crop-frame] img")
  await page.screenshot({ path: join(shots, `settings-cover-dragged-${label}.png`) })
  expect(page.errors.length === 0, "no page errors", page.errors)
  await page.close()

  /* THE HEADER, from the value that PATCH would store. */
  const stored = crop ? `${COVER_URL}#crop=${crop.x},${crop.y},${crop.zoom}` : COVER_URL
  const hero = await open(vp, "#hero", stored)
  await hero.waitForSelector("[data-profile-cover-band] img")
  await sleep(300)
  const drawn = await placement(hero, "[data-profile-cover-band]", "[data-profile-cover-band] img")
  const diff = after && drawn ? Math.max(...["left", "top", "width", "height"].map((k) => Math.abs(after[k] - drawn[k]))) : 1
  expect(diff < 0.015, "the profile's band shows the same part of the picture the frame did", { frame: after, band: drawn, diff: +diff.toFixed(4) })
  const owner = await hero.evaluate(() => [...document.querySelectorAll("[data-profile-cover-actions] a, [data-profile-cover-actions] button")].map((a) => a.getAttribute("aria-label") || a.textContent.trim()))
  expect(owner.length === 1 && owner[0] === "Edit profile", "the cover's owner controls: Edit profile alone, no camera", owner)
  expect((await hero.$("[data-profile-cover-edit]")) === null, "no cover button on the band", null)
  await hero.screenshot({ path: join(shots, `hero-${label}.png`) })
  expect(hero.errors.length === 0, "no page errors", hero.errors)
  await hero.close()

  /* NO COVER YET. */
  const empty = await open(vp, "#settings", null)
  await empty.waitForSelector("[data-upload-empty-band]")
  await empty.evaluate(() => document.querySelector("[data-account-cover-field]").scrollIntoView({ block: "center" }))
  await sleep(200)
  const band = await empty.evaluate(() => {
    const b = document.querySelector("[data-upload-empty-band]")
    const r = b.getBoundingClientRect()
    const s = getComputedStyle(b)
    return { w: r.width, h: r.height, dashed: s.borderStyle.includes("dashed"), text: b.innerText.trim(), button: (() => { const x = b.querySelector("span span"); const q = x.getBoundingClientRect(); return { h: Math.round(q.height) } })() }
  })
  expect(Math.abs(band.w / band.h - bandAspect(vp.width === 390 ? 390 : await empty.evaluate(() => document.documentElement.clientWidth))) < 0.05 && !band.dashed && /Add a cover/.test(band.text), "with no cover: the band's own shape, no dashed box, one Add a cover button", band)
  await empty.screenshot({ path: join(shots, `settings-empty-${label}.png`) })
  expect(empty.errors.length === 0, "no page errors", empty.errors)
  await empty.close()
}

await browser.close()
server.close()
console.log(`\nShots: ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log("\nAll account cover checks passed")
