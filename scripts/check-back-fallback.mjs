/**
 * ===========================================================================
 *  THE PRODUCT PAGE'S BACK ARROW, WITH NOTHING BEHIND IT
 * ===========================================================================
 * "Sometimes when I'm on a creator page product and click the back icon, but
 * there is no other point to go back to, it loads forever. If there is no
 * point to go back to at all, it should take me to the creator page of that
 * product."
 *
 * Two small pages on a local server: /andrew, a tall creator page with a
 * product link far down it, and /andrew/ebook, a product page carrying the
 * REAL product bar (scripts/render-back-fallback.tsx). The arrow is pressed
 * in Chromium, the way a visitor presses it, in four situations:
 *
 *   cold            the product opened directly in a fresh tab
 *   from creator    opened from the creator page, scrolled down it first
 *   miscounted      a fresh tab where the app's own count says there is a
 *                   page behind (a router.replace used to raise it) and the
 *                   browser knows there is not
 *   miscounted, no Navigation API
 *                   the same, in a browser that cannot say so, which is the
 *                   case the watch in lib/navigation/go-back exists for
 *
 * Each has to end on the creator's page, within one navigation, and the
 * second on the same scroll position it left.
 *
 *   node scripts/check-back-fallback.mjs
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const PORT = Number(process.env.PORT || 3206)
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".back-fallback-probe")
mkdirSync(dir, { recursive: true })

writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `import * as React from "react"
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime"
export function useRouter() { return React.useContext(AppRouterContext) }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

const css = await appCss(root)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-back-fallback.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: "inherit" })
const bundle = readFileSync(join(dir, "probe.js"), "utf8")

const creatorPage = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Andrew</title></head>
<body style="margin:0;font-family:sans-serif"><h1 id="creator">Andrew</h1><div style="height:3000px;background:linear-gradient(#fff,#ddd)"></div>
<a id="product" href="/andrew/ebook" style="display:block;padding:20px">The ebook</a><div style="height:1200px"></div></body></html>`
const productPage = (noNavigationApi) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The ebook</title>
<style>${css}</style><style>body{margin:0}</style>
${noNavigationApi ? `<script>try{Object.defineProperty(window,"navigation",{value:undefined,configurable:true})}catch(e){}</script>` : ""}
</head><body><div id="app"></div><div id="product-body" style="height:2000px"></div><script>${bundle}</script></body></html>`

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  res.setHeader("content-type", "text/html; charset=utf-8")
  res.setHeader("cache-control", "no-store")
  if (url.pathname === "/andrew") return res.end(creatorPage)
  if (url.pathname === "/start") return res.end("<!doctype html><title>start</title><p>A page on another site.</p>")
  if (url.pathname === "/andrew/ebook") return res.end(productPage(url.searchParams.has("nonav")))
  res.statusCode = 404
  res.end("not found")
})
await new Promise((r) => server.listen(PORT, "127.0.0.1", r))
const BASE = `http://127.0.0.1:${PORT}`

const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox"] })
let broken = 0
const fail = (m) => { broken++; console.log(`  FAIL  ${m}`) }
const ok = (m) => console.log(`  ok    ${m}`)

/**
 * A TAB WITH NOTHING BEHIND IT. puppeteer's newPage starts on about:blank,
 * so a goto leaves an entry behind; a link opened with noopener and
 * noreferrer is a new tab whose history is exactly one page long, which is a
 * shared link opened cold.
 */
async function freshTab(url, width) {
  const opener = await browser.newPage()
  await opener.goto(`${BASE}/start`)
  const target = browser.waitForTarget((t) => t.url() === url)
  await opener.evaluate((u) => window.open(u, "_blank", "noopener,noreferrer"), url)
  const page = await (await target).page()
  await page.setViewport({ width, height: 800 })
  await opener.close()
  await page.waitForSelector('a[aria-label="Back"]')
  return page
}

/** Press the visible arrow the way a mouse does, and wait for the page to change. */
async function pressBack(page) {
  const box = await page.evaluate(() => {
    const a = [...document.querySelectorAll('a[aria-label="Back"]')].find((e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0)
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.getAttribute("href") }
  })
  if (!box) throw new Error("no visible Back link")
  const started = Date.now()
  const lengthBefore = await page.evaluate(() => history.length)
  let navigations = 0
  const onNav = (f) => { if (f === page.mainFrame()) navigations++ }
  page.on("framenavigated", onNav)
  await page.mouse.click(box.x, box.y)
  await page.waitForFunction(() => location.pathname === "/andrew" && !!document.getElementById("creator"), { timeout: 10000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 300))
  page.off("framenavigated", onNav)
  return { href: box.href, path: await page.evaluate(() => location.pathname), ms: Date.now() - started, navigations, lengthBefore, historyLength: await page.evaluate(() => history.length) }
}

try {
  for (const width of [390, 1280]) {
    console.log(`\n${width}px`)

    {
      const page = await freshTab(`${BASE}/andrew/ebook`, width)
      const r = await pressBack(page)
      console.log(`  cold: ${JSON.stringify(r)}`)
      if (r.lengthBefore !== 1) fail(`cold: the tab had ${r.lengthBefore} entries, not a fresh one`)
      if (r.href !== "/andrew") fail(`cold: the arrow's href is ${r.href}, not the creator's page`)
      if (r.path !== "/andrew") fail(`cold: ended on ${r.path}`)
      else if (r.navigations !== 1) fail(`cold: ${r.navigations} navigations`)
      else ok(`cold: on the creator's page in ${r.ms}ms, one navigation`)
      await page.close()
    }

    {
      const page = await browser.newPage()
      await page.setViewport({ width, height: 800 })
      await page.goto(`${BASE}/andrew`)
      await page.evaluate(() => window.scrollTo(0, 2600))
      await new Promise((r) => setTimeout(r, 200))
      const before = await page.evaluate(() => Math.round(window.scrollY))
      await Promise.all([page.waitForNavigation(), page.click("#product")])
      await page.waitForSelector('a[aria-label="Back"]')
      const r = await pressBack(page)
      const after = await page.evaluate(() => Math.round(window.scrollY))
      console.log(`  from creator: ${JSON.stringify({ ...r, before, after })}`)
      if (r.path !== "/andrew") fail(`from creator: ended on ${r.path}`)
      else if (r.historyLength !== r.lengthBefore) fail(`from creator: history went from ${r.lengthBefore} to ${r.historyLength}, so it pushed instead of going back`)
      else if (Math.abs(after - before) > 2) fail(`from creator: scroll ${after}, left at ${before}`)
      else ok(`from creator: back on the creator's page at scroll ${after} (left at ${before}), history still ${r.historyLength} long`)
      await page.close()
    }

    for (const nonav of [false, true]) {
      const label = nonav ? "miscounted, no Navigation API" : "miscounted"
      const page = await freshTab(`${BASE}/andrew/ebook${nonav ? "?nonav" : ""}`, width)
      const hasApi = await page.evaluate(() => !!(window.navigation && typeof window.navigation.canGoBack === "boolean"))
      await page.evaluate(() => window.__noteNav())
      const r = await pressBack(page)
      console.log(`  ${label}: ${JSON.stringify({ ...r, navigationApi: hasApi })}`)
      if (nonav && hasApi) fail(`${label}: the Navigation API was not removed`)
      if (r.path !== "/andrew") fail(`${label}: ended on ${r.path}, the arrow did not reach the creator's page`)
      else ok(`${label}: on the creator's page in ${r.ms}ms`)
      await page.close()
    }
  }
} finally {
  await browser.close()
  server.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall held")
process.exit(broken ? 1 : 0)
