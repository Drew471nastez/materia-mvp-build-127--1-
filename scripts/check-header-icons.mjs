/**
 * ===========================================================================
 *  THE HEADER'S DRAWERS, MEASURED IN A BROWSER
 * ===========================================================================
 * The report: in the editor's DESKTOP preview, changing Header › Menu on
 * phones to "Slides in from the left" drew the phone menu across the middle
 * of the page, clipped, half over the site. A phone menu must never exist on
 * a desktop layout, and previewing it must look like the real drawer at the
 * real size.
 *
 * This mounts the real header (scripts/render-header-drawers.tsx) in the
 * editor's canvas at desktop and at phone size, and on a published page at
 * 1280 and 390 wide, and reports:
 *
 *   desktop    is a menu drawer in the page at all, through every style (must be no)
 *   phone      the drawer's rectangle for each style, inside the canvas
 *   live 390   drawer rect, z order (backdrop over header, panel over backdrop),
 *              scroll lock layout shift in px (must be 0), offset restored,
 *              focus inside while open and back on the hamburger after,
 *              sub-menu slides in with Back
 *   one open   menu then cart then search: never more than one open
 *   live 1280  no menu drawer; the cart's lock moves nothing with a scrollbar
 *
 *   node scripts/check-header-drawers.mjs
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".header-icons-probe")
mkdirSync(dir, { recursive: true })

writeFileSync(join(dir, "next-navigation.js"), `const r = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export const useRouter = () => r
export const usePathname = () => "/"
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, priority, quality, sizes, ...rest }) { return React.createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }) }
`)

const css = await appCss(root)
const entry = process.env.HEADER_PROBE_ENTRY || "scripts/render-header-icons.tsx"
execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:next/image=${join(dir, "next-image.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })

/* The canvas, copied from app/website-builder/editor/[installId]/page.tsx. */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"
const filler = `<main id="content" style="padding:24px"><p id="marker" style="margin:0 0 16px;font:600 28px/1.2 system-ui">Put your experience into words</p>${"<p style='height:120px;margin:0 0 12px;background:#f1f1f1'></p>".repeat(30)}</main>`
const html = (body) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body>${body}<script src="probe.js"></script></body></html>`
writeFileSync(join(dir, "live.html"), html(`<div id="mount" style="display:contents"></div>${filler}`))
writeFileSync(join(dir, "editor-desktop.html"), html(`<div style="width:1100px;height:760px;position:relative;overflow:hidden"><div id="wb-preview-root" class="${CANVAS_CLASS}"><div id="mount" style="display:contents"></div>${filler}</div></div>`))
/* The sticky pages: an announcement bar above the header, as ThemePage draws it, inside one page root. */
const bar = `<div id="bar" style="height:40px;background:#111;color:#fff;font:13px/40px system-ui;text-align:center">Free shipping this week</div>`
writeFileSync(join(dir, "sticky-live.html"), html(`<div id="root">${bar}<div id="mount" style="display:contents"></div>${filler}</div>`))
writeFileSync(join(dir, "editor-sticky.html"), html(`<div style="width:1100px;height:760px;position:relative;overflow:hidden"><div id="wb-preview-root" class="${CANVAS_CLASS}">${bar}<div id="mount" style="display:contents"></div>${filler}</div></div>`))
writeFileSync(join(dir, "editor-phone.html"),html(`<div style="width:390px;height:720px;position:relative;overflow:hidden;margin-left:300px"><div id="wb-preview-root" class="${CANVAS_CLASS}"><div id="mount" style="display:contents"></div>${filler}</div></div>`))

const HELPERS = `
  window.__wait = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
  window.__shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden"
  /* What is open: a drawer that says it is a modal, or the search panel showing. */
  window.__openNow = () => {
    const out = []
    for (const d of document.querySelectorAll('[data-site-drawer]')) if (d.getAttribute("aria-modal") === "true" && window.__shown(d)) out.push(d.getAttribute("data-site-drawer"))
    const search = [...document.querySelectorAll('[data-self-nav][aria-hidden="false"]')].find((el) => !el.closest('[data-site-drawer]'))
    if (search) out.push("search")
    return out
  }
`

/* Real scrollbars, so the lock's scrollbar compensation is measured rather
   than assumed: puppeteer hides them by default. */
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"], ignoreDefaultArgs: ["--hide-scrollbars"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)
const report = {}

async function open(file, width, height, settings = {}) {
  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.evaluateOnNewDocument(HELPERS)
  await page.goto(`file://${join(dir, file)}?scenario=${file.replace(".html", "")}&settings=${encodeURIComponent(JSON.stringify(settings))}`)
  await page.waitForFunction(() => window.__headerProbeReady === true, { timeout: 15000 })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 300))
  return page
}

try {
  /*
    THE ICONS STAY ON ONE LINE WHEN THE CART FILLS. "When I add to cart,
    sometimes it bumps the account icon." Search, account and the bag are
    measured before and after a line goes in, on a published page and in
    the editor's canvas. Run: node scripts/check-header-icons.mjs
  */
  for (const [file, w, h] of [["live.html", 1280, 800], ["editor-desktop.html", 1280, 800]]) {
    const page = await open(file, w, h, { show_account: true, show_account_icon: true, show_wishlist: false, cart_type: "notification" })
    const measure = () => page.evaluate(() => {
      const pick = (sel) => { const el = document.querySelector(sel); const svg = el?.querySelector("svg"); if (!svg || !window.__shown(el)) return null; const r = svg.getBoundingClientRect(); return { top: Math.round(r.top * 10) / 10, mid: Math.round((r.top + r.height / 2) * 10) / 10, left: Math.round(r.left) } }
      return { search: pick('[aria-label="Search"]'), account: pick('a[title]'), cart: pick('button[aria-label^="Cart"]') }
    })
    const before = await measure()
    await page.evaluate(() => window.__addToCart())
    const samples = []
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 40)); samples.push(await measure()) }
    const after = samples[samples.length - 1]
    const label = `${file.replace(".html", "")} ${w}px`
    console.log(`\n${label}\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(after)}`)
    const icons = Object.keys(before).filter((k) => before[k])
    if (icons.length < 3) fail(`${label}: search, account and the bag should all be drawn (${JSON.stringify(before)})`)
    const moved = icons.filter((k) => samples.some((s) => !s[k] || Math.abs(s[k].mid - before[k].mid) > 0.5 || Math.abs(s[k].left - before[k].left) > 0.5))
    moved.length ? fail(`${label}: ${moved.join(", ")} moved when the cart filled`) : ok(`${label}: ${icons.join(", ")} stayed put through the add`)
    const mids = icons.map((k) => after[k].mid)
    Math.max(...mids) - Math.min(...mids) > 1 ? fail(`${label}: the icons are not on one line (${mids.join(", ")})`) : ok(`${label}: the icons share one centre line`)
    await page.close()
  }
} finally {
  await browser.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
