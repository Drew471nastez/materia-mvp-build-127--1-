/**
 * ===========================================================================
 *  THE SITES EDITOR'S SHEET AND ADD SECTION, ON A PHONE, LIKE QUICK ACCESS
 * ===========================================================================
 * The Sites editor's phone sheet (publish, history, download) was a panel
 * that rose on a CSS class, with a grabber that could not be grabbed, and
 * the section builder's Add Section was Radix's side sheet with a drag of
 * its own. Both are the shared sheet now. This mounts the real two
 * (scripts/render-builder-phone-sheets.tsx) at 390px and reads, with real
 * touch events, every claim in scripts/sheet-feel-kit.mjs: the shared sheet,
 * rising from below and only up, a drag tracked within 2px, a spring back,
 * a rubber band, Add Section's list handing a pull at its top to the sheet,
 * a flick closing it, and its close button sliding it out.
 *
 *   node scripts/check-builder-phone-sheets.mjs
 *   SHOTS=/some/dir node scripts/check-builder-phone-sheets.mjs
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"
import { readSheet } from "./sheet-feel-kit.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const dir = join(root, ".builder-phone-sheets-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/creator-page/sections"
export const useSearchParams = () => new URLSearchParams(location.search)
export const useRouter = () => ({ push() {}, replace() {}, prefetch() {}, refresh() {}, back() {} })
export const useParams = () => ({})
export const redirect = () => {}
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, unoptimized, sizes, quality, placeholder, blurDataURL, loader, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : src && src.src, alt, ...rest }) }
`)
/* Every read answers with no rows. */
writeFileSync(join(dir, "supabase.js"), `const result = { data: [], error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-builder-phone-sheets.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url === "/" || req.url.startsWith("/?")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  res.end("{}")
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })

async function sheet(name, label, button, list) {
  console.log(`\n${name}`)
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(base)
  await p.waitForSelector(button)
  await sleep(700)
  const s = { p, cdp: await p.target().createCDPSession() }
  await readSheet(s, { name, label, list, expect, opener: `(() => { const b = document.querySelector(${JSON.stringify(button)}); if (b) b.click(); return !!b })()` })
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await sheet("The Sites editor's sheet", "Mara's prints", "#open-site")
await sheet("Add Section", "Add Section", "#open-add", ".overflow-y-auto.overscroll-contain")

await browser.close()
server.close()
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
