/**
 * ===========================================================================
 *  THE COVER, AS THE SERVER TAKES IT
 * ===========================================================================
 * Runs the real takeCoverShots — the function the cover route calls — with a
 * local Chromium standing in for the serverless one, against a page shaped
 * like app/(site)/cover-render's output and served over HTTP, then reads the
 * two pictures back and measures them:
 *
 *   the desktop picture is 1440x900 and the phone picture 390x844 at 2x
 *   the header is the page's own coral in both
 *   the heading is at full strength — not caught part way through the
 *     theme's entrance animation, which is on in this fixture as it is by
 *     default
 *   the hero's photograph, fetched over the network, is in the desktop one
 *
 * and writes both so they can be looked at.
 *
 *   pnpm build && CHROMIUM_PATH=/opt/pw-browsers/chromium \
 *     npx tsx --conditions=react-server scripts/check-cover-shot.mts
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { AddressInfo } from "node:net"
import { takeCoverShots, DESKTOP, PHONE } from "../lib/website-builder/cover-shot"

const root = process.cwd()
const fail = (m: string): never => { console.error(`\n${m}\n`); process.exit(1) }
if (!process.env.CHROMIUM_PATH) process.env.CHROMIUM_PATH = "/opt/pw-browsers/chromium"
if (!existsSync(process.env.CHROMIUM_PATH)) fail(`No browser at ${process.env.CHROMIUM_PATH}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-covershot-"))
const stubs = join(root, ".cover-probe")
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
writeFileSync(join(stubs, "crypto-stub.js"), `export function createHash() { let a = ""; return { update(s) { a += String(s); return this }, digest() { let h = 0; for (let i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) | 0; return String(h >>> 0) } } }
`)
execFileSync("npx", [
  "esbuild", join(root, "scripts/render-cover-shot.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:node:crypto=${join(stubs, "crypto-stub.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  /* See check-cover-capture.mjs for why each of these two. */
  `<script>window.process={env:{NODE_ENV:"production"}};window.Buffer={byteLength:function(s){return new TextEncoder().encode(String(s)).length}}</script>` +
  `<script src="/probe.js"></script></body></html>`
const bundle = readFileSync(join(out, "probe.js"))
const photo = readFileSync(join(root, "public/images/design-mode/banner-login-desktop-D8selsDi.webp"))

/* The photograph arrives late on purpose: a worker that photographs at
   `load` instead of waiting for the network would catch it missing. */
const server = createServer((req, res) => {
  if (req.url === "/probe.js") { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (req.url === "/photo.webp") {
    setTimeout(() => { res.writeHead(200, { "content-type": "image/webp" }); res.end(photo) }, 700)
    return
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
const port = (server.address() as AddressInfo).port

const taken = await takeCoverShots(`http://127.0.0.1:${port}/`)
server.close()
if (!taken.mobile) fail("The phone picture was not taken.")
const shots = { ...taken, mobile: taken.mobile! }
writeFileSync(join(root, ".probe-cover-desktop.webp"), shots.desktop)
writeFileSync(join(root, ".probe-cover-phone.webp"), shots.mobile)

/* Read the two pictures back in a browser: sizes, and pixels from the places
   that say whether they are pictures of this page. */
const puppeteer = (await import("puppeteer-core")).default
const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ["--no-sandbox"] })
const page = await browser.newPage()
/* tsx names inner functions with an `__name` helper that exists in Node and
   not in the page, so a function handed to evaluate() that declares any
   fails there. The worker's own evaluate() declares none; this reader does. */
await page.evaluate("window.__name = (f) => f")
const read = async (buf: Buffer) => page.evaluate(async (b64: string) => {
  const img = new Image()
  img.src = `data:image/webp;base64,${b64}`
  await img.decode()
  const c = document.createElement("canvas")
  c.width = img.naturalWidth; c.height = img.naturalHeight
  const g = c.getContext("2d")!
  g.drawImage(img, 0, 0)
  const px = (x: number, y: number) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data)
  /* The darkest pixel along a band: where ink is, if there is any. */
  const darkest = (y0: number, y1: number, x0: number, x1: number) => {
    let best = [255, 255, 255, 255]
    for (let y = y0; y < y1; y += 4) for (let x = x0; x < x1; x += 4) {
      const p = px(x, y)
      if (p[0] + p[1] + p[2] < best[0] + best[1] + best[2]) best = p
    }
    return best
  }
  /* The most saturated pixel in a region: the photograph, if it is there. */
  const vivid = (y0: number, y1: number, x0: number, x1: number) => {
    let best = 0
    for (let y = y0; y < y1; y += 6) for (let x = x0; x < x1; x += 6) {
      const [r, gg, b] = px(x, y)
      best = Math.max(best, Math.max(r, gg, b) - Math.min(r, gg, b))
    }
    return best
  }
  return {
    w: img.naturalWidth, h: img.naturalHeight,
    header: px(4, 20),
    ink: darkest(c.height * 0.25, c.height * 0.75, 0, c.width * 0.5),
    photo: vivid(c.height * 0.15, c.height * 0.85, c.width * 0.5, c.width),
    phoneInk: darkest(c.height * 0.1, c.height * 0.9, 0, c.width),
  }
}, buf.toString("base64"))
const d = await read(shots.desktop)
const m = await read(shots.mobile)
await browser.close()

let bad = 0
const expect = (ok: boolean, what: string, got?: string) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}
const coral = (p: number[]) => Math.abs(p[0] - 255) < 20 && Math.abs(p[1] - 107) < 25 && Math.abs(p[2] - 107) < 25

console.log(`\nThe cover, as the server takes it (${shots.ms}ms, ${Math.round(shots.desktop.length / 1024)}KB + ${Math.round(shots.mobile.length / 1024)}KB)\n`)
console.log(`  desktop ${d.w}x${d.h}, header ${JSON.stringify(d.header)}, heading ink ${JSON.stringify(d.ink)}, photo saturation ${d.photo}`)
console.log(`  phone   ${m.w}x${m.h}, header ${JSON.stringify(m.header)}, darkest ink ${JSON.stringify(m.phoneInk)}\n`)

expect(d.w === DESKTOP.width && d.h === DESKTOP.height, "the desktop picture is a laptop's screen", `${d.w}x${d.h}`)
expect(m.w === PHONE.width * 2 && m.h === PHONE.height * 2, "and the phone picture a phone's, at twice the pixels", `${m.w}x${m.h}`)
expect(coral(d.header), "the desktop header is the page's coral", JSON.stringify(d.header))
expect(coral(m.header), "and so is the phone's", JSON.stringify(m.header))
expect(d.ink[0] + d.ink[1] + d.ink[2] < 150,
  "the heading is at full strength, not caught fading in", JSON.stringify(d.ink))
expect(m.phoneInk[0] + m.phoneInk[1] + m.phoneInk[2] < 150, "and the phone picture has its words in it", JSON.stringify(m.phoneInk))
/*
  THE PHOTOGRAPH ARRIVED. The server holds it back 700ms; a worker that
  photographed at `load` would catch the hero's frame empty and grey.
*/
expect(d.photo > 60, "and the hero's photograph, fetched late, is in the desktop picture", `saturation ${d.photo}`)
expect(shots.ms < 20000, "all of it well inside the route's time limit", `${shots.ms}ms`)

console.log(`\n  pictures → .probe-cover-desktop.webp and .probe-cover-phone.webp\n`)
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The server's cover is the saved page, at both widths, with its photograph.\n")
