/**
 * ===========================================================================
 *  A BUTTON IS THE COLOUR IT WAS SET TO, AND HAS A HOVER
 * ===========================================================================
 * "I tried changing the styling of the CTA button inside the header,
 * including the button color, text color, hover color, and similar settings,
 * and it did not work properly at all." In both renderer families, on the
 * default scheme and with the section's own button colour (Advanced colors,
 * which the header's Button panel writes too), each button is read at rest
 * and under the pointer:
 *   • at rest it is the colour set, or the scheme's when none is;
 *   • on hover it changes, to a colour worked out from that button, and its
 *     text stays readable. It used to go to 88% opacity, or nothing.
 *
 *   pnpm build && node scripts/check-button-colors.mjs
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

const stubs = join(root, ".button-probe")
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
const out = mkdtempSync(join(tmpdir(), "storelib-buttons-"))
const bundle = join(out, "render.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-button-colors.tsx"),
  "--bundle", "--platform=node", "--format=cjs", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`],
  { stdio: ["ignore", "ignore", "inherit"] })
execFileSync("node", [bundle], { env: { ...process.env, OUT_DIR: out }, stdio: ["ignore", "ignore", "inherit"] })
const body = readFileSync(join(out, "page.html"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style><style>body{margin:0;background:#fff}.probe{width:1100px;margin:0 auto 24px}</style></head><body>${body}</body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, r))

let bad = 0
const expect = (ok, what, got = "") => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got !== "" ? `   (${got})` : ""}`); if (!ok) bad++ }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"] })
const p = await browser.newPage()
await p.setViewport({ width: 1200, height: 900 })
await p.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" })
await p.evaluate(() => { const s = document.createElement("style"); s.textContent = "*{transition:none !important}"; document.head.append(s) })

const SELECT = {
  storelib: ".s__btn--primary",
  header: "[data-sl-button]",
  richtext: "[data-sl-button]",
}
const read = (sel) => p.evaluate((sel) => {
  const el = document.querySelector(sel)
  if (!el) return null
  const cs = getComputedStyle(el)
  return { bg: cs.backgroundColor, fg: cs.color }
}, sel)
/* sRGB relative luminance contrast, to say the hover text stays readable. */
const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }

for (const family of ["storelib", "header", "richtext"]) {
  console.log(`\n${family}`)
  for (const variant of ["scheme", "pink"]) {
    const sel = `[data-case="${family}-${variant}"] ${SELECT[family]}`
    await p.$eval(sel, (el) => el.scrollIntoView({ block: "center" })).catch(() => {})
    await p.mouse.move(5, 5)
    const rest = await read(sel)
    if (!rest) { expect(false, `${variant}: the button is drawn`); continue }
    const box = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await p.mouse.move(box.x, box.y)
    const reached = await p.evaluate((sel, x, y) => { const el = document.querySelector(sel); const at = document.elementFromPoint(x, y); return !!at && (el === at || el.contains(at)) }, sel, box.x, box.y)
    expect(reached, `${variant}: the pointer is on the button itself`)
    const hover = await read(sel)
    const want = variant === "pink" ? "rgb(225, 29, 72)" : "rgb(0, 0, 0)"
    expect(rest.bg === want, `${variant}: at rest it is ${variant === "pink" ? "the section's own colour" : "the scheme's"}`, rest.bg)
    expect(hover.bg !== rest.bg && contrast(hover.bg, hover.fg) >= 4.5, `and on hover it changes, with its text still readable`, `${hover.bg} on ${hover.fg}, ${contrast(hover.bg, hover.fg).toFixed(1)}:1`)
  }
}
await browser.close()
server.close()
console.log(bad ? `\n${bad} check(s) failed.` : "\nEvery button is the colour it was set to, and answers the pointer.")
process.exit(bad ? 1 : 0)
