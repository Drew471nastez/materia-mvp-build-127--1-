/**
 * ===========================================================================
 *  THE ONEPAGE EDITOR'S SHEETS MOVE LIKE QUICK ACCESS
 * ===========================================================================
 * "Bring the same feel and smoothness to all mobile bottom sheets, the
 * OnePage editor included." Add block, a link's thumbnail, a block's
 * animation and its stats, and Add product were dialogs pushed to the bottom of a phone by hand, with
 * the drag written into React state. They are the shared sheet now
 * (components/ui/sheet-dialog.tsx over components/ui/bottom-sheet.tsx), and
 * this reads, in the real editor at 390px with real touch events, that each
 * one does what Quick access does:
 *
 *   SHARED      it is the shared sheet (`data-app-sheet`, `data-sheet-panel`)
 *               named for what it is, and no Radix dialog is drawn with it
 *   RISES       the first frame it exists it is below the screen, it only
 *               ever rises, and it comes to rest at 0
 *   FOLLOWS     every step of a drag from the grabber, the panel is where the
 *               finger put it, within two pixels (two frames is the most a
 *               finger can be ahead of what is painted)
 *   GIVES       a pull up gives on a rubber band, never past 80px, and it
 *               comes back to rest
 *   SPRINGS     a slow short pull let go springs back to rest
 *   FLICKS      a quick short flick closes it
 *   HANDS OFF   (Add block) a pull down on its list, at the list's top,
 *               moves the sheet rather than nothing
 *
 * The phone preview's PDF (components/onepage/phone-preview.tsx) and the
 * published page's Spotify player (components/onepage/public-onepage.tsx)
 * are read the same way at 390, and at 1440 it and Add block are still the
 * centred dialogs they were.
 *
 *   node scripts/check-onepage-sheets.mjs
 *   SHOTS=/some/dir node scripts/check-onepage-sheets.mjs   (a picture of each, open)
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

/* The same editor, stubs and page as scripts/check-onepage-editor.mjs. */
const dir = join(root, ".onepage-sheets-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app/onepage"
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
/* Every read answers with no rows (an array, so the Products tab can list them) that also says onboarding is done. */
writeFileSync(join(dir, "supabase.js"), `const result = { data: Object.assign([], { onboarding_completed: true }), error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(result) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-onepage-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"', '--define:process.env.NEXT_PUBLIC_APP_URL="https://storelib.com"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"', '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`, `--alias:next/image=${join(dir, "image.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
const css = await appCss(root)
const bundle = readFileSync(join(dir, "probe.js"), "utf8")
const pageWith = (blocks) => `<!doctype html><html class="app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${interFaces(root)}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}};window.PROBE_THEME={};window.PROBE_BLOCKS=${JSON.stringify(blocks)}</script><script>${bundle}</script></body></html>`
const html = pageWith(undefined)
/* The published page with a Spotify link that opens its player (the sheet on a phone). */
/* The editor with a PDF on the page, for the phone preview's PDF sheet (components/onepage/phone-preview.tsx). */
const PDF_TITLE = "Price list"
const pdf = pageWith([
  { id: "p1", type: "pdf_document", enabled: true, sort_order: 0, data: { title: PDF_TITLE, pdf_file_url: "/files/price-list.pdf" } },
])
const SPOTIFY_LABEL = "Listen to the mix"
const live = pageWith([
  { id: "s1", type: "link_button", enabled: true, sort_order: 0, data: { label: SPOTIFY_LABEL, url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", spotify_mode: "audio_preview" } },
])
rmSync(dir, { recursive: true, force: true })
const server = createServer((req, res) => {
  if (req.url.startsWith("/pdf")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(pdf) }
  if (req.url.startsWith("/live")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(live) }
  if (req.url === "/" || req.url.startsWith("/app")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html) }
  res.writeHead(200, { "content-type": "application/json" })
  if (req.url.startsWith("/api/billing/subscription")) return res.end(JSON.stringify({ currentPlan: { id: "pro" } }))
  if (req.url.startsWith("/api/onepage/stats")) return res.end(JSON.stringify({ total_clicks: 3, total_views: 9, chart_data: [] }))
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
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }

async function open(vp, hash, path = "/app/onepage", ready = "[data-scroll-container]") {
  const p = await browser.newPage()
  await p.setViewport(vp)
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e)))
  await p.goto(`${base}${path}#${hash}`)
  await p.waitForSelector(ready, { timeout: 8000 }).catch(() => { throw new Error(`the editor did not draw: ${errors.slice(0, 2).join(" | ")}`) })
  await sleep(900)
  return { p, errors, cdp: await p.target().createCDPSession() }
}

/**
 * One sheet in the editor (or on the published page) at 390px: opened on
 * its own page, every claim in scripts/sheet-feel-kit.mjs, and no errors.
 */
async function sheet(hash, name, label, opener, list, where = []) {
  console.log(`\n${name}`)
  const s = await open(PHONE, hash, ...where)
  await readSheet(s, { name, label, opener, list, expect })
  expect(s.errors.length === 0, "no errors on the page", s.errors.slice(0, 3))
  await s.p.close()
}

const clickText = (text) => `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === ${JSON.stringify(text)} && e.getClientRects().length); if (b) b.click(); return !!b })()`
const clickTitle = (title) => `(() => { const b = [...document.querySelectorAll('button[title="${title}"]')].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`

await sheet("links", "Add block", "Add Block", clickText("Add"), ".overflow-y-auto")
await sheet("links", "A link's thumbnail", "Edit Thumbnail", `(() => { const b = [...document.querySelectorAll("[data-scroll-container] button.w-10.h-10.rounded-lg")].find((e) => e.getClientRects().length); if (b) b.click(); return !!b })()`)
await sheet("links", "A block's animation", "Animation", clickTitle("Animation"))
await sheet("links", "A block's stats", "Link Stats", clickTitle("View Stats"))
await sheet("products", "Add product", "Add Product", clickText("Add Product"))

/* The phone preview's PDF: Preview, then the PDF on the page. */
await sheet("links", "The phone preview's PDF", PDF_TITLE, `(async () => {
  const find = () => [...document.querySelectorAll("button")].find((e) => e.textContent.includes(${JSON.stringify(PDF_TITLE)}) && e.getClientRects().length)
  if (!find()) {
    const preview = [...document.querySelectorAll("button")].find((e) => e.textContent.trim() === "Preview" && e.getClientRects().length)
    if (!preview) return false
    preview.click()
    await new Promise((r) => setTimeout(r, 500))
  }
  const b = find()
  if (b) b.click()
  return !!b
})()`, null, ["/pdf/app/onepage"])

/* The published page's Spotify player: a sheet on a phone, the dialog it was on a computer. */
const LIVE = ["/live?live", ".onepage-live"]
const clickSpotify = `(() => { const b = [...document.querySelectorAll("button")].find((e) => e.textContent.includes(${JSON.stringify(SPOTIFY_LABEL)}) && e.getClientRects().length); if (b) b.click(); return !!b })()`
await sheet("", "The published page's Spotify player", SPOTIFY_LABEL, clickSpotify, null, LIVE)
console.log("\nThe Spotify player at 1440")
{
  const { p, errors } = await open({ width: 1440, height: 900 }, "", ...LIVE)
  const found = await p.evaluate(clickSpotify)
  await sleep(600)
  const seen = await p.evaluate(() => ({ dialog: !!document.querySelector(".fixed.inset-0 iframe[src*='open.spotify.com/embed']"), sheet: !!document.querySelector("[data-app-sheet]") }))
  expect(found && seen.dialog && !seen.sheet, "it is the centred player it was", seen)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

console.log("\nAdd block at 1440")
{
  const { p, errors } = await open({ width: 1440, height: 900 }, "links")
  await p.evaluate(clickText("Add"))
  await sleep(600)
  const seen = await p.evaluate(() => ({
    dialog: !!document.querySelector("[data-slot=dialog-content]"),
    title: document.querySelector("[data-slot=dialog-content] [data-slot=dialog-title]")?.textContent ?? null,
    sheet: !!document.querySelector("[data-app-sheet]"),
  }))
  expect(seen.dialog && seen.title === "Add Block" && !seen.sheet, "it is the centred dialog it was, titled by Radix", seen)
  expect(errors.length === 0, "no errors on the page", errors.slice(0, 3))
  await p.close()
}

await browser.close()
server.close()
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
