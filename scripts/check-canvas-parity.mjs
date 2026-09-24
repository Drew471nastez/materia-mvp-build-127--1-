/**
 * ===========================================================================
 *  THE CANVAS DRAWS THE PAGE THE LIVE SITE DRAWS
 * ===========================================================================
 * "The exact layout shown inside the Website Builder preview canvas must be
 * the exact layout shown on the live website." Reported with a header that
 * had no space under it in the builder and a white band under it on the
 * live site.
 *
 * One page (header, a full-height hero, text, a call to action, footer),
 * with the theme's entrance animation and a section gap switched on, drawn
 * the two ways (scripts/render-canvas-parity.tsx) and laid out in a browser
 * against the built stylesheet:
 *   • live:   the page at the device's width, as a visitor's browser has it;
 *   • canvas: the same page inside the editor's canvas frame of that width
 *             and height, in a window much wider and taller than it, which
 *             is where every viewport-sized thing used to go wrong.
 * Every section's top and height must agree to the pixel, at a phone and a
 * desktop width; nothing may sit between the header and the section under
 * it; and on the live page the section under the header is on screen, not
 * fading in, the moment the page is.
 *
 *   pnpm build && node scripts/check-canvas-parity.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const stubs = join(root, ".parity-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, replace() {}, refresh() {}, prefetch() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
const out = mkdtempSync(join(tmpdir(), "storelib-parity-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-canvas-parity.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "render.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"'],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [join(out, "render.js")], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })

const DEVICES = { mobile: { w: 390, h: 844 }, desktop: { w: 1280, h: 800 } }
const page = (body, mode, d) => mode === "live"
  ? `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0">${body}</body></html>`
  : `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>html,body{margin:0;background:#eef1f5}</style></head><body>
     <div class="wb-canvas-frame relative overflow-hidden" style="width:${d.w}px;height:${d.h}px;margin:40px">
       <div id="wb-preview-root" class="relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden w-full h-full wb-canvas-hidebar">${body}</div>
     </div></body></html>`

const server = createServer((req, res) => {
  const m = /^\/(live|canvas)-(mobile|desktop)$/.exec(req.url)
  if (!m) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(page(readFileSync(join(out, `${m[1]}-${m[2]}.html`), "utf8"), m[1], DEVICES[m[2]]))
})
await new Promise((r) => server.listen(0, r))
const origin = `http://127.0.0.1:${server.address().port}`

let bad = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   (${got})` : ""}`); if (!ok) bad++ }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })

/* Every section's box, measured from the top of the page's own root, once
   everything has finished moving: what the page settles to. */
const layout = (p) => p.evaluate(() => {
  const rootEl = document.querySelector("[data-storelib-theme]")
  const top0 = rootEl.getBoundingClientRect().top
  return [...rootEl.querySelectorAll("[data-section]")].map((el) => {
    const r = el.getBoundingClientRect()
    return { id: (el.closest("[id]")?.id || "").replace(/^(wb-)?section-/, ""), top: Math.round(r.top - top0), height: Math.round(r.height), width: Math.round(r.width) }
  })
})

for (const [device, d] of Object.entries(DEVICES)) {
  console.log(`\n${device}, ${d.w} wide`)
  const live = await browser.newPage()
  await live.setViewport({ width: d.w, height: d.h, deviceScaleFactor: 1, isMobile: device === "mobile", hasTouch: device === "mobile" })
  await live.goto(`${origin}/live-${device}`, { waitUntil: "load" })
  /* The first paint: the section under the header is there, not fading in. */
  const firstPaint = await live.evaluate(() => {
    const secs = [...document.querySelectorAll("[data-storelib-theme] [data-section]:not([data-chrome])")]
    const first = secs[0]
    return { opacity: getComputedStyle(first).opacity, animation: getComputedStyle(first).animationName, second: secs[1] ? getComputedStyle(secs[1]).animationName : "" }
  })
  expect(firstPaint.opacity === "1" && firstPaint.animation === "none", "on the live page the section under the header is on screen at once, not fading in", JSON.stringify(firstPaint))
  expect(firstPaint.second === "storelibSectionIn", "and the sections after it still come in", firstPaint.second)
  await new Promise((r) => setTimeout(r, 1500))
  const a = await layout(live)

  const canvas = await browser.newPage()
  await canvas.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 1 })
  await canvas.goto(`${origin}/canvas-${device}`, { waitUntil: "load" })
  await new Promise((r) => setTimeout(r, 1500))
  const b = await layout(canvas)

  expect(a.length === b.length && a.length >= 5, "both draw every section", `${a.length} and ${b.length}`)
  const diffs = a.map((s, i) => ({ id: s.id, live: `${s.top}+${s.height}`, canvas: b[i] ? `${b[i].top}+${b[i].height}` : "missing" })).filter((x) => x.live !== x.canvas)
  expect(diffs.length === 0, "every section is at the same place and the same height, to the pixel", JSON.stringify(diffs))
  const header = a[0], next = a[1]
  expect(next.top - (header.top + header.height) <= 0, "nothing between the header and the section under it, on the live page", `${next.top - (header.top + header.height)}px`)
  await live.close()
  await canvas.close()
}
await browser.close()
server.close()
console.log(bad ? `\n${bad} check(s) failed.` : "\nThe canvas draws the page the live site draws.")
process.exit(bad ? 1 : 0)
